-- ============================================================================
-- Feature 6 (part 2): parent course authoring API.
-- Parents create and edit ONLY their own community courses. Every function checks the caller's role and the
-- course owner, validates and cleans all text on the server, and applies rate limits. Nothing here can change
-- scoring rules, rewards or official content. No AI is involved.
-- ============================================================================

create temp table _pre_fn as select oid from pg_proc where pronamespace = 'public'::regnamespace;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
/** The caller's own community course (locked for update). */
create or replace function public.cc_own_course(p_subject uuid, p_lock boolean default true) returns public.subjects
language plpgsql security definer set search_path = public as $$
declare s public.subjects%rowtype;
begin
  if p_lock then
    select * into s from public.subjects where id = p_subject and kind = 'community' for update;
  else
    select * into s from public.subjects where id = p_subject and kind = 'community';
  end if;
  if not found or s.owner_id is distinct from auth.uid() then raise exception 'course not found' using errcode = 'P0002'; end if;
  return s;
end $$;

create or replace function public.cc_editable(s public.subjects) returns void
language plpgsql stable as $$
begin
  if s.moderation <> 'ok' then raise exception 'course_suspended' using errcode = 'P0001'; end if;
  if s.status = 'archived' then raise exception 'course_archived' using errcode = 'P0001'; end if;
end $$;

create or replace function public.cc_course_counts(p_subject uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'units', (select count(*) from public.units where subject_id = p_subject and status = 'published'),
    'lessons', (select count(*) from public.lessons l join public.units u on u.id = l.unit_id and u.status = 'published'
                where l.subject_id = p_subject and l.status = 'published'),
    'questions', (select count(*) from public.questions q join public.lessons l on l.id = q.lesson_id and l.status = 'published'
                  where q.subject_id = p_subject and q.status = 'published'),
    'mcq', (select count(*) from public.questions q join public.lessons l on l.id = q.lesson_id and l.status = 'published'
            where q.subject_id = p_subject and q.status = 'published' and q.qtype = 'mcq'),
    'written', (select count(*) from public.questions q join public.lessons l on l.id = q.lesson_id and l.status = 'published'
                where q.subject_id = p_subject and q.status = 'published' and q.qtype = 'written'))
$$;

create or replace function public.course_rating(p_subject uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('avg', round(avg(stars)::numeric, 1), 'count', count(*),
                            -- Bayesian average: a few ratings cannot push a course to the top (prior 3.5 worth 5 votes).
                            'score', round(((5 * 3.5 + coalesce(sum(stars), 0)) / (5 + count(*)))::numeric, 3))
  from public.course_ratings where subject_id = p_subject
$$;

/** Validates and normalises one question item (manual form or bulk import). */
create or replace function public.cc_validate_item(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_type text := coalesce(nullif(p ->> 'qtype', ''), 'mcq');
  v_text text; v_hint text; v_exp text;
  v_opts text[] := '{}'; v_acc text[] := '{}';
  v_correct text := lower(coalesce(p ->> 'correct_option', ''));
  x text; i int; k int;
begin
  if jsonb_typeof(p) <> 'object' then raise exception 'invalid_question' using errcode = '22023', detail = 'shape'; end if;
  if v_type not in ('mcq', 'written') then raise exception 'invalid_question' using errcode = '22023', detail = 'qtype'; end if;
  v_text := public.cc_clean(p ->> 'text', 3, 600, 'text', true);
  v_hint := public.cc_clean(p ->> 'hint', 0, 300, 'hint');
  v_exp := public.cc_clean(p ->> 'explanation', 0, 1200, 'explanation', true);
  if v_type = 'mcq' then
    if jsonb_typeof(p -> 'options') <> 'array' or jsonb_array_length(p -> 'options') <> 4 then
      raise exception 'invalid_question' using errcode = '22023', detail = 'options_count';
    end if;
    for i in 0 .. 3 loop
      v_opts := v_opts || public.cc_clean(p -> 'options' ->> i, 1, 300, 'option');
    end loop;
    if (select count(distinct public.ar_normalize(o)) from unnest(v_opts) o) <> 4 then
      raise exception 'invalid_question' using errcode = '22023', detail = 'options_duplicate';
    end if;
    if v_correct not in ('a', 'b', 'c', 'd') then raise exception 'invalid_question' using errcode = '22023', detail = 'correct_option'; end if;
  else
    if jsonb_typeof(p -> 'accepted_answers') <> 'array' then raise exception 'invalid_question' using errcode = '22023', detail = 'accepted_answers'; end if;
    for x in select jsonb_array_elements_text(p -> 'accepted_answers') loop
      x := public.cc_clean(x, 0, 100, 'answer');
      if x <> '' and not exists (select 1 from unnest(v_acc) a where public.ar_normalize(a) = public.ar_normalize(x)) then v_acc := v_acc || x; end if;
    end loop;
    k := coalesce(array_length(v_acc, 1), 0);
    if k < 1 then raise exception 'invalid_question' using errcode = '22023', detail = 'accepted_answers'; end if;
    if k > 8 then raise exception 'invalid_question' using errcode = '22023', detail = 'too_many_answers'; end if;
    if public.ar_normalize(v_acc[1]) = '' then raise exception 'invalid_question' using errcode = '22023', detail = 'accepted_answers'; end if;
  end if;
  return jsonb_build_object('qtype', v_type, 'text', v_text, 'hint', v_hint, 'explanation', v_exp,
    'options', to_jsonb(v_opts), 'correct', case when v_type = 'mcq' then v_correct end, 'accepted', to_jsonb(v_acc));
end $$;

create or replace function public.cc_is_duplicate(p_subject uuid, p_text text, p_exclude uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.questions q
                 where q.subject_id = p_subject and q.status = 'published' and q.id is distinct from p_exclude
                   and public.ar_normalize(q.text) = public.ar_normalize(p_text))
$$;

create or replace function public.cc_insert_question(p_user uuid, p_lesson public.lessons, n jsonb, p_derived uuid default null, p_lineage uuid default null, p_sort int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; i int;
begin
  insert into public.questions (subject_id, lesson_id, text, hint, explanation, difficulty, status, origin, created_by, updated_by, sort_key,
                                qtype, accepted_answers, grading, derived_from)
  values (p_lesson.subject_id, p_lesson.id, n ->> 'text', n ->> 'hint', n ->> 'explanation', 2, 'draft', 'community', p_user, p_user,
          coalesce(p_sort, (select coalesce(max(sort_key), 0) + 1 from public.questions where lesson_id = p_lesson.id)),
          n ->> 'qtype', case when n ->> 'qtype' = 'written' then array(select jsonb_array_elements_text(n -> 'accepted')) else '{}' end,
          jsonb_build_object('strict', false), p_derived)
  returning id into v_id;
  update public.questions set lineage_id = coalesce(p_lineage, v_id) where id = v_id;
  if n ->> 'qtype' = 'mcq' then
    for i in 0 .. 3 loop
      insert into public.question_options (question_id, option_id, text, is_correct)
      values (v_id, (array['a', 'b', 'c', 'd'])[i + 1], n -> 'options' ->> i, (array['a', 'b', 'c', 'd'])[i + 1] = n ->> 'correct');
    end loop;
  end if;
  update public.questions set status = 'published' where id = v_id; -- the trigger re-checks 4 options + 1 correct / accepted answers
  return v_id;
end $$;

create or replace function public.cc_question_used(p_question uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.session_questions where question_id = p_question)
      or exists (select 1 from public.mp_match_questions where question_id = p_question)
$$;

create or replace function public.cc_touch(p_subject uuid) returns void
language sql security definer set search_path = public as $$
  update public.subjects set updated_at = now() where id = p_subject
$$;

-- ---------------------------------------------------------------------------
-- Creator profile
-- ---------------------------------------------------------------------------
create or replace function public.cc_ensure_creator(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.creator_profiles (user_id, display_name)
  values (p_user, 'مبدع ' || (1000 + floor(public.secure_random() * 9000))::int)
  on conflict (user_id) do nothing;
end $$;

create or replace function public.cc_set_creator_name(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); v text;
begin
  v := public.cc_clean(p_name, 2, 30, 'creator_name');
  if v ~ '@' or v ~ '[0-9]{6,}' then raise exception 'unsafe_content' using errcode = '22023', detail = 'creator_name'; end if;
  perform public.cc_ensure_creator(v_user);
  update public.creator_profiles set display_name = v where user_id = v_user;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Courses
-- ---------------------------------------------------------------------------
create or replace function public.cc_create_course(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_parent();
  st public.community_settings%rowtype;
  v_id uuid; v_slug text;
  v_vis text := coalesce(nullif(p ->> 'visibility', ''), 'public');
  v_icon text := coalesce(nullif(p ->> 'icon', ''), 'book');
  v_theme text := coalesce(nullif(p ->> 'theme', ''), 'meadow');
begin
  select * into st from public.community_settings;
  if (select count(*) from public.subjects where owner_id = v_user and kind = 'community' and status <> 'archived') >= st.max_courses_per_parent then
    raise exception 'limit_reached' using errcode = 'P0001', detail = 'courses';
  end if;
  if v_vis not in ('public', 'private', 'invite') then raise exception 'invalid visibility' using errcode = '22023'; end if;
  if v_icon not in ('book', 'star', 'flask', 'globe', 'calc', 'quill', 'leaf', 'gear') then raise exception 'invalid icon' using errcode = '22023'; end if;
  if v_theme not in ('meadow', 'forest', 'desert', 'castle', 'future') then raise exception 'invalid theme' using errcode = '22023'; end if;
  perform public.cc_rate(v_user, 'course_create', interval '1 day', 20);
  perform public.cc_ensure_creator(v_user);
  loop
    v_slug := 'c-' || substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8);
    exit when not exists (select 1 from public.subjects where slug = v_slug);
  end loop;
  insert into public.subjects (slug, name_ar, grade, semester, description, icon, theme, status, source_label, kind, owner_id, visibility, category, sort_order)
  values (v_slug, public.cc_clean(p ->> 'name_ar', 3, 60, 'name'), coalesce((p ->> 'grade')::smallint, 8), 1,
          public.cc_clean(p ->> 'description', 0, 400, 'description', true), v_icon, v_theme::public.world_theme, 'draft',
          public.cc_clean(p ->> 'source_label', 0, 80, 'source'), 'community', v_user, v_vis, public.cc_clean(p ->> 'category', 0, 40, 'category'), 1000)
  returning id into v_id;
  perform public.write_audit('course_create', 'subject', v_id::text, jsonb_build_object('visibility', v_vis));
  return v_id;
end $$;

create or replace function public.cc_update_course(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); s public.subjects%rowtype;
begin
  s := public.cc_own_course(p_id);
  perform public.cc_editable(s);
  perform public.cc_rate(v_user, 'question_write', interval '1 day', (select question_writes_per_day from public.community_settings));
  update public.subjects set
    name_ar = case when p ? 'name_ar' then public.cc_clean(p ->> 'name_ar', 3, 60, 'name') else name_ar end,
    description = case when p ? 'description' then public.cc_clean(p ->> 'description', 0, 400, 'description', true) else description end,
    grade = coalesce((p ->> 'grade')::smallint, grade),
    category = case when p ? 'category' then public.cc_clean(p ->> 'category', 0, 40, 'category') else category end,
    source_label = case when p ? 'source_label' then public.cc_clean(p ->> 'source_label', 0, 80, 'source') else source_label end,
    icon = coalesce(nullif(p ->> 'icon', ''), icon),
    theme = coalesce(nullif(p ->> 'theme', '')::public.world_theme, theme)
  where id = p_id;
end $$;

create or replace function public.cc_my_courses() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := public.require_parent();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name_ar', s.name_ar, 'description', s.description, 'grade', s.grade, 'category', s.category,
      'icon', s.icon, 'theme', s.theme, 'status', s.status, 'visibility', s.visibility, 'moderation', s.moderation,
      'moderation_note', case when s.moderation <> 'ok' then s.moderation_note else '' end,
      'published_at', s.published_at, 'updated_at', s.updated_at, 'counts', public.cc_course_counts(s.id), 'rating', public.course_rating(s.id),
      'enrollments', (select count(*) from public.course_enrollments e where e.subject_id = s.id and e.status = 'active' and not public.family_of(s.owner_id, e.student_id)),
      'my_children_enrolled', (select count(*) from public.course_enrollments e join public.parent_children pc on pc.student_id = e.student_id and pc.parent_id = v_user
                               where e.subject_id = s.id and e.status = 'active'))
      order by s.updated_at desc)
    from public.subjects s where s.owner_id = v_user and s.kind = 'community'), '[]'::jsonb);
end $$;

/** Everything the editor and preview need, including answer keys (owner or administrator only). */
create or replace function public.cc_get_course(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.subjects%rowtype;
begin
  select * into s from public.subjects where id = p_id and kind = 'community';
  if not found or (s.owner_id is distinct from auth.uid() and not public.is_admin()) then raise exception 'course not found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'course', jsonb_build_object('id', s.id, 'slug', s.slug, 'name_ar', s.name_ar, 'description', s.description, 'grade', s.grade, 'category', s.category,
       'icon', s.icon, 'theme', s.theme, 'status', s.status, 'visibility', s.visibility, 'moderation', s.moderation,
       'moderation_note', s.moderation_note, 'source_label', s.source_label, 'published_at', s.published_at, 'updated_at', s.updated_at,
       'version', s.version, 'creator_name', public.creator_name(s.owner_id)),
    'counts', public.cc_course_counts(s.id),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'number', u.number, 'title', u.title,
        'lessons', coalesce((
          select jsonb_agg(jsonb_build_object('id', l.id, 'number', l.number, 'title', l.title,
            'questions', coalesce((
              select jsonb_agg(jsonb_build_object('id', q.id, 'qtype', q.qtype, 'text', q.text, 'hint', q.hint, 'explanation', q.explanation,
                'options', case when q.qtype = 'mcq' then (select jsonb_agg(o.text order by o.option_id) from public.question_options o where o.question_id = q.id) end,
                'correct_option', (select o.option_id from public.question_options o where o.question_id = q.id and o.is_correct),
                'accepted_answers', to_jsonb(q.accepted_answers), 'used', public.cc_question_used(q.id))
                order by q.sort_key, q.created_at)
              from public.questions q where q.lesson_id = l.id and q.status = 'published'), '[]'::jsonb))
            order by l.sort_order, l.number)
          from public.lessons l where l.unit_id = u.id and l.status = 'published'), '[]'::jsonb))
        order by u.sort_order, u.number)
      from public.units u where u.subject_id = s.id and u.status = 'published'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Units and lessons (delete = archive when students have used them)
-- ---------------------------------------------------------------------------
create or replace function public.cc_save_unit(p_subject uuid, p_unit uuid, p_title text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); s public.subjects%rowtype; st public.community_settings%rowtype; v_id uuid := p_unit; v_title text; v_n int;
begin
  s := public.cc_own_course(p_subject);
  perform public.cc_editable(s);
  v_title := public.cc_clean(p_title, 1, 80, 'unit_title');
  if v_id is null then
    select * into st from public.community_settings;
    if (select count(*) from public.units where subject_id = p_subject and status = 'published') >= st.max_units then
      raise exception 'limit_reached' using errcode = 'P0001', detail = 'units';
    end if;
    select coalesce(max(number) filter (where number < 10000), 0) + 1 into v_n from public.units where subject_id = p_subject;
    insert into public.units (subject_id, number, title, sort_order, status) values (p_subject, v_n, v_title, v_n, 'published') returning id into v_id;
  else
    update public.units set title = v_title where id = v_id and subject_id = p_subject and status = 'published';
    if not found then raise exception 'unit not found' using errcode = 'P0002'; end if;
  end if;
  perform public.cc_touch(p_subject);
  return v_id;
end $$;

create or replace function public.cc_save_lesson(p_unit uuid, p_lesson uuid, p_title text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); u public.units%rowtype; s public.subjects%rowtype; st public.community_settings%rowtype; v_id uuid := p_lesson; v_title text; v_n int;
begin
  select * into u from public.units where id = p_unit and status = 'published';
  if not found then raise exception 'unit not found' using errcode = 'P0002'; end if;
  s := public.cc_own_course(u.subject_id);
  perform public.cc_editable(s);
  v_title := public.cc_clean(p_title, 1, 120, 'lesson_title');
  if v_id is null then
    select * into st from public.community_settings;
    if (select count(*) from public.lessons where unit_id = p_unit and status = 'published') >= st.max_lessons_per_unit then
      raise exception 'limit_reached' using errcode = 'P0001', detail = 'lessons';
    end if;
    select coalesce(max(number) filter (where number < 10000), 0) + 1 into v_n from public.lessons where unit_id = p_unit;
    insert into public.lessons (subject_id, unit_id, number, title, sort_order, status) values (u.subject_id, p_unit, v_n, v_title, v_n, 'published') returning id into v_id;
  else
    update public.lessons set title = v_title where id = v_id and unit_id = p_unit and status = 'published';
    if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;
  end if;
  perform public.cc_touch(u.subject_id);
  return v_id;
end $$;

/** Deletes a lesson, or archives it when students have attempted its questions (history is never destroyed). */
create or replace function public.cc_delete_lesson(p_lesson uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); l public.lessons%rowtype; s public.subjects%rowtype; v_used boolean;
begin
  select * into l from public.lessons where id = p_lesson;
  if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;
  s := public.cc_own_course(l.subject_id);
  perform public.cc_editable(s);
  v_used := exists (select 1 from public.quiz_sessions where lesson_id = p_lesson)
         or exists (select 1 from public.questions q where q.lesson_id = p_lesson and public.cc_question_used(q.id));
  if v_used then
    update public.questions set status = 'archived' where lesson_id = p_lesson and status = 'published';
    update public.lessons set status = 'archived', number = 10001 + (select count(*) from public.lessons where unit_id = l.unit_id and number >= 10000) where id = p_lesson;
    update public.missions set active = false where lesson_id = p_lesson;
  else
    delete from public.lessons where id = p_lesson;
  end if;
  perform public.cc_touch(l.subject_id);
  return case when v_used then 'archived' else 'deleted' end;
end $$;

create or replace function public.cc_delete_unit(p_unit uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); u public.units%rowtype; s public.subjects%rowtype; l record; v_archived boolean := false;
begin
  select * into u from public.units where id = p_unit;
  if not found then raise exception 'unit not found' using errcode = 'P0002'; end if;
  s := public.cc_own_course(u.subject_id);
  perform public.cc_editable(s);
  for l in select id from public.lessons where unit_id = p_unit and status = 'published' loop
    if public.cc_delete_lesson(l.id) = 'archived' then v_archived := true; end if;
  end loop;
  if v_archived or exists (select 1 from public.lessons where unit_id = p_unit) then
    update public.units set status = 'archived', number = 10001 + (select count(*) from public.units where subject_id = u.subject_id and number >= 10000) where id = p_unit;
  else
    delete from public.units where id = p_unit;
  end if;
  perform public.cc_touch(u.subject_id);
  return case when v_archived or exists (select 1 from public.units where id = p_unit) then 'archived' else 'deleted' end;
end $$;

/** Reorders active children: units of a course, lessons of a unit, or questions of a lesson. */
create or replace function public.cc_reorder(p_kind text, p_parent uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); s public.subjects%rowtype; v_subject uuid; v_current uuid[]; i int;
begin
  if p_kind = 'unit' then v_subject := p_parent;
  elsif p_kind = 'lesson' then select subject_id into v_subject from public.units where id = p_parent;
  elsif p_kind = 'question' then select subject_id into v_subject from public.lessons where id = p_parent;
  else raise exception 'invalid kind' using errcode = '22023'; end if;
  s := public.cc_own_course(v_subject);
  perform public.cc_editable(s);
  if p_kind = 'unit' then
    select array_agg(id order by id) into v_current from public.units where subject_id = p_parent and status = 'published';
  elsif p_kind = 'lesson' then
    select array_agg(id order by id) into v_current from public.lessons where unit_id = p_parent and status = 'published';
  else
    select array_agg(id order by id) into v_current from public.questions where lesson_id = p_parent and status = 'published';
  end if;
  if (select array_agg(x order by x) from unnest(p_ids) x) is distinct from v_current then raise exception 'reorder_mismatch' using errcode = '22023'; end if;
  if p_kind = 'unit' then
    update public.units set number = number + 1000 where subject_id = p_parent and status = 'published';
    for i in 1 .. array_length(p_ids, 1) loop update public.units set number = i, sort_order = i where id = p_ids[i]; end loop;
  elsif p_kind = 'lesson' then
    update public.lessons set number = number + 1000 where unit_id = p_parent and status = 'published';
    for i in 1 .. array_length(p_ids, 1) loop update public.lessons set number = i, sort_order = i where id = p_ids[i]; end loop;
  else
    for i in 1 .. array_length(p_ids, 1) loop update public.questions set sort_key = i where id = p_ids[i]; end loop;
    perform public.refresh_lesson_missions(p_parent);
  end if;
  perform public.cc_touch(v_subject);
end $$;

-- ---------------------------------------------------------------------------
-- Questions: manual entry (with versioning) and atomic bulk import
-- ---------------------------------------------------------------------------
create or replace function public.cc_save_question(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_parent();
  n jsonb := public.cc_validate_item(p);
  st public.community_settings%rowtype;
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_old public.questions%rowtype;
  v_lesson public.lessons%rowtype;
  s public.subjects%rowtype;
  v_changed boolean; v_versioned boolean := false; v_new uuid; i int;
begin
  select * into st from public.community_settings;
  if v_id is not null then
    select * into v_old from public.questions where id = v_id for update;
    if not found or v_old.status <> 'published' or v_old.origin <> 'community' then raise exception 'question not found' using errcode = 'P0002'; end if;
  end if;
  select * into v_lesson from public.lessons where id = coalesce(nullif(p ->> 'lesson_id', '')::uuid, v_old.lesson_id) and status = 'published';
  if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;
  s := public.cc_own_course(v_lesson.subject_id);
  perform public.cc_editable(s);
  if v_id is not null and v_old.subject_id <> s.id then raise exception 'question not found' using errcode = 'P0002'; end if;
  perform public.cc_rate(v_user, 'question_write', interval '1 day', st.question_writes_per_day);
  if public.cc_is_duplicate(s.id, n ->> 'text', v_id) then raise exception 'duplicate_question' using errcode = '23505'; end if;

  if v_id is null then
    if (select count(*) from public.questions where subject_id = s.id and status = 'published') >= st.max_questions_per_course then
      raise exception 'limit_reached' using errcode = 'P0001', detail = 'questions';
    end if;
    v_new := public.cc_insert_question(v_user, v_lesson, n);
  else
    v_changed := v_old.qtype <> n ->> 'qtype' or v_old.text <> n ->> 'text'
      or v_old.accepted_answers is distinct from case when n ->> 'qtype' = 'written' then array(select jsonb_array_elements_text(n -> 'accepted')) else '{}'::text[] end
      or (n ->> 'qtype' = 'mcq' and (
            (select jsonb_agg(o.text order by o.option_id) from public.question_options o where o.question_id = v_id) is distinct from n -> 'options'
         or (select o.option_id from public.question_options o where o.question_id = v_id and o.is_correct) is distinct from n ->> 'correct'));
    if v_changed and public.cc_question_used(v_id) then
      -- A used question is never rewritten: students' recorded results stay exactly as they were.
      -- The corrected question becomes a new version in the same place; the old row is archived.
      update public.questions set status = 'archived' where id = v_id;
      v_new := public.cc_insert_question(v_user, v_lesson, n, v_id, coalesce(v_old.lineage_id, v_id), v_old.sort_key);
      v_versioned := true;
    else
      update public.questions set lesson_id = v_lesson.id, text = n ->> 'text', hint = n ->> 'hint', explanation = n ->> 'explanation',
             qtype = n ->> 'qtype', updated_by = v_user,
             accepted_answers = case when n ->> 'qtype' = 'written' then array(select jsonb_array_elements_text(n -> 'accepted')) else '{}' end
       where id = v_id;
      if v_changed then
        delete from public.question_options where question_id = v_id;
        if n ->> 'qtype' = 'mcq' then
          for i in 0 .. 3 loop
            insert into public.question_options (question_id, option_id, text, is_correct)
            values (v_id, (array['a', 'b', 'c', 'd'])[i + 1], n -> 'options' ->> i, (array['a', 'b', 'c', 'd'])[i + 1] = n ->> 'correct');
          end loop;
        end if;
      end if;
      v_new := v_id;
    end if;
    if v_old.lesson_id <> v_lesson.id then perform public.refresh_lesson_missions(v_old.lesson_id); end if;
  end if;
  perform public.refresh_lesson_missions(v_lesson.id);
  perform public.cc_touch(s.id);
  return jsonb_build_object('id', v_new, 'versioned', v_versioned);
end $$;

create or replace function public.cc_delete_question(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); q public.questions%rowtype; s public.subjects%rowtype; v_used boolean;
begin
  select * into q from public.questions where id = p_id and origin = 'community' and status = 'published';
  if not found then raise exception 'question not found' using errcode = 'P0002'; end if;
  s := public.cc_own_course(q.subject_id);
  perform public.cc_editable(s);
  v_used := public.cc_question_used(p_id);
  if v_used then update public.questions set status = 'archived' where id = p_id; else delete from public.questions where id = p_id; end if;
  perform public.refresh_lesson_missions(q.lesson_id);
  perform public.cc_touch(s.id);
  return case when v_used then 'archived' else 'deleted' end;
end $$;

/** All-or-nothing import of a parsed batch into one lesson. Idempotent per request id. */
create or replace function public.cc_import_questions(p_lesson uuid, p_items jsonb, p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.require_parent();
  st public.community_settings%rowtype;
  v_lesson public.lessons%rowtype;
  s public.subjects%rowtype;
  v_prev public.course_import_batches%rowtype;
  v_n int; i int; v_item jsonb; v_norm jsonb; v_imported int := 0; v_skipped int := 0; v_ids uuid[] := '{}'; v_detail text; v_msg text;
  v_seen text[] := '{}'; v_key text;
begin
  select * into st from public.community_settings;
  if p_request is null then raise exception 'request id required' using errcode = '22023'; end if;
  select * into v_prev from public.course_import_batches where user_id = v_user and request_id = p_request;
  if found then return jsonb_build_object('imported', v_prev.imported, 'skipped_duplicates', v_prev.skipped, 'replay', true, 'ids', '[]'::jsonb); end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_batch' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_items);
  if v_n < 1 then raise exception 'invalid_batch' using errcode = '22023', detail = 'empty'; end if;
  if v_n > st.import_batch_max then raise exception 'batch_too_large' using errcode = '22023', detail = st.import_batch_max::text; end if;
  select * into v_lesson from public.lessons where id = p_lesson and status = 'published';
  if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;
  s := public.cc_own_course(v_lesson.subject_id);
  perform public.cc_editable(s);
  perform public.cc_rate(v_user, 'import', interval '1 hour', st.imports_per_hour);
  perform public.cc_rate(v_user, 'question_write', interval '1 day', st.question_writes_per_day, v_n);
  if (select count(*) from public.questions where subject_id = s.id and status = 'published') + v_n > st.max_questions_per_course then
    raise exception 'limit_reached' using errcode = 'P0001', detail = 'questions';
  end if;
  for i in 0 .. v_n - 1 loop
    v_item := p_items -> i;
    begin
      v_norm := public.cc_validate_item(v_item);
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail, v_msg = message_text;
      raise exception 'invalid_question' using errcode = '22023', detail = format('index:%s;reason:%s;field:%s', i + 1, v_msg, coalesce(v_detail, ''));
    end;
    v_key := public.ar_normalize(v_norm ->> 'text');
    if v_key = any (v_seen) or public.cc_is_duplicate(s.id, v_norm ->> 'text') then v_skipped := v_skipped + 1; continue; end if;
    v_seen := v_seen || v_key;
    v_ids := v_ids || public.cc_insert_question(v_user, v_lesson, v_norm);
    v_imported := v_imported + 1;
  end loop;
  perform public.refresh_lesson_missions(p_lesson);
  insert into public.course_import_batches (user_id, request_id, lesson_id, imported, skipped) values (v_user, p_request, p_lesson, v_imported, v_skipped);
  perform public.cc_touch(s.id);
  perform public.write_audit('course_import', 'subject', s.id::text, jsonb_build_object('imported', v_imported, 'skipped', v_skipped));
  return jsonb_build_object('imported', v_imported, 'skipped_duplicates', v_skipped, 'replay', false, 'ids', to_jsonb(v_ids));
end $$;

-- ---------------------------------------------------------------------------
-- Validation, publishing, visibility, invitations, deletion
-- ---------------------------------------------------------------------------
create or replace function public.cc_validate_course(p_subject uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.subjects%rowtype; c jsonb; v_err jsonb := '[]'; v_warn jsonb := '[]'; r record;
begin
  select * into s from public.subjects where id = p_subject;
  c := public.cc_course_counts(p_subject);
  if char_length(btrim(s.name_ar)) < 3 then v_err := v_err || jsonb_build_object('code', 'title'); end if;
  if char_length(btrim(s.description)) < 10 then v_err := v_err || jsonb_build_object('code', 'description'); end if;
  if (c ->> 'units')::int < 1 then v_err := v_err || jsonb_build_object('code', 'no_units'); end if;
  if (c ->> 'lessons')::int < 1 then v_err := v_err || jsonb_build_object('code', 'no_lessons'); end if;
  if (c ->> 'questions')::int < 5 then v_err := v_err || jsonb_build_object('code', 'few_questions', 'have', c -> 'questions', 'need', 5); end if;
  if public.cc_unsafe(s.name_ar) or public.cc_unsafe(s.description) or public.cc_unsafe(s.category) or public.cc_unsafe(s.source_label) then
    v_err := v_err || jsonb_build_object('code', 'unsafe', 'where', 'course');
  end if;
  if exists (select 1 from public.units u where u.subject_id = p_subject and u.status = 'published' and public.cc_unsafe(u.title))
     or exists (select 1 from public.lessons l where l.subject_id = p_subject and l.status = 'published' and public.cc_unsafe(l.title)) then
    v_err := v_err || jsonb_build_object('code', 'unsafe', 'where', 'structure');
  end if;
  if exists (select 1 from public.questions q where q.subject_id = p_subject and q.status = 'published'
             and (public.cc_unsafe(q.text) or public.cc_unsafe(q.hint) or public.cc_unsafe(q.explanation)
                  or exists (select 1 from public.question_options o where o.question_id = q.id and public.cc_unsafe(o.text))
                  or exists (select 1 from unnest(q.accepted_answers) a where public.cc_unsafe(a)))) then
    v_err := v_err || jsonb_build_object('code', 'unsafe', 'where', 'questions');
  end if;
  for r in select l.title, u.number as un from public.lessons l join public.units u on u.id = l.unit_id and u.status = 'published'
           where l.subject_id = p_subject and l.status = 'published'
             and not exists (select 1 from public.questions q where q.lesson_id = l.id and q.status = 'published') loop
    v_warn := v_warn || jsonb_build_object('code', 'empty_lesson', 'title', r.title, 'unit', r.un);
  end loop;
  if exists (select 1 from public.creator_profiles where user_id = s.owner_id and publishing_blocked) then v_err := v_err || jsonb_build_object('code', 'creator_blocked'); end if;
  if s.moderation <> 'ok' then v_err := v_err || jsonb_build_object('code', 'moderated'); end if;
  return jsonb_build_object('ok', jsonb_array_length(v_err) = 0, 'errors', v_err, 'warnings', v_warn, 'counts', c);
end $$;

create or replace function public.cc_validate(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_parent();
  perform public.cc_own_course(p_id, false);
  return public.cc_validate_course(p_id);
end $$;

/** Publish, unpublish (back to draft) or archive. Publishing is immediate: no administrator approval. */
create or replace function public.cc_set_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); s public.subjects%rowtype; v jsonb; r record;
begin
  s := public.cc_own_course(p_id);
  if p_status not in ('published', 'draft', 'archived') then raise exception 'invalid status' using errcode = '22023'; end if;
  if s.moderation <> 'ok' and p_status = 'published' then raise exception 'course_suspended' using errcode = 'P0001'; end if;
  if p_status = 'published' then
    v := public.cc_validate_course(p_id);
    if not (v ->> 'ok')::boolean then raise exception 'validation_failed' using errcode = '22023', detail = (v -> 'errors')::text; end if;
    perform public.cc_rate(v_user, 'publish', interval '1 day', (select publishes_per_day from public.community_settings));
    for r in select id from public.lessons where subject_id = p_id and status = 'published' loop perform public.refresh_lesson_missions(r.id); end loop;
    update public.subjects set status = 'published', published_at = coalesce(published_at, now()), version = version + 1 where id = p_id;
  else
    perform public.cc_rate(v_user, 'publish', interval '1 day', (select publishes_per_day from public.community_settings));
    update public.subjects set status = p_status::public.publish_status where id = p_id;
  end if;
  perform public.write_audit('course_status', 'subject', p_id::text, jsonb_build_object('to', p_status));
  return jsonb_build_object('status', p_status);
end $$;

create or replace function public.cc_set_visibility(p_id uuid, p_visibility text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); s public.subjects%rowtype; v_affected int;
begin
  s := public.cc_own_course(p_id);
  perform public.cc_editable(s);
  if p_visibility not in ('public', 'private', 'invite') then raise exception 'invalid visibility' using errcode = '22023'; end if;
  update public.subjects set visibility = p_visibility where id = p_id;
  -- Existing enrolments and progress are kept; only people who may still see the course can play it.
  select count(*) into v_affected from public.course_enrollments e
   where e.subject_id = p_id and e.status = 'active' and not public.course_visible_to(e.student_id, p_id) and not public.family_of(s.owner_id, e.student_id);
  perform public.write_audit('course_visibility', 'subject', p_id::text, jsonb_build_object('from', s.visibility, 'to', p_visibility, 'locked_out', v_affected));
  return jsonb_build_object('visibility', p_visibility, 'students_without_access', v_affected);
end $$;

create or replace function public.cc_course_invite(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := public.require_parent();
begin
  perform public.cc_own_course(p_id, false);
  return (select jsonb_build_object('code', i.code, 'expires_at', i.expires_at, 'max_uses', i.max_uses, 'uses', i.uses,
            'invited_families', (select count(*) from public.course_access a where a.subject_id = p_id))
          from public.course_invites i where i.subject_id = p_id and i.revoked_at is null and i.expires_at > now() order by i.created_at desc limit 1);
end $$;

/** A new code replaces (revokes) the previous one. */
create or replace function public.cc_create_invite(p_id uuid, p_days int default 30, p_max_uses int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); s public.subjects%rowtype; v_code text; v_exp timestamptz;
begin
  s := public.cc_own_course(p_id);
  perform public.cc_editable(s);
  if s.visibility <> 'invite' then raise exception 'course is not invitation-only' using errcode = 'P0001'; end if;
  perform public.cc_rate(v_user, 'invite', interval '1 day', 20);
  v_exp := now() + make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90));
  update public.course_invites set revoked_at = now() where subject_id = p_id and revoked_at is null;
  loop
    v_code := public.new_invite_code();
    exit when not exists (select 1 from public.course_invites where code = v_code);
  end loop;
  insert into public.course_invites (subject_id, code, created_by, expires_at, max_uses)
  values (p_id, v_code, v_user, v_exp, least(greatest(coalesce(p_max_uses, 50), 1), 500));
  return jsonb_build_object('code', v_code, 'expires_at', v_exp, 'max_uses', least(greatest(coalesce(p_max_uses, 50), 1), 500));
end $$;

/** Revokes the code; optionally also removes access already granted through invitations. */
create or replace function public.cc_revoke_invites(p_id uuid, p_remove_access boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); v_n int := 0;
begin
  perform public.cc_own_course(p_id);
  update public.course_invites set revoked_at = now() where subject_id = p_id and revoked_at is null;
  if p_remove_access then delete from public.course_access where subject_id = p_id; get diagnostics v_n = row_count; end if;
  return v_n;
end $$;

/** Deletes a course that nobody has played; otherwise archives it so results and history are preserved. */
create or replace function public.cc_delete_course(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_parent(); s public.subjects%rowtype; v_used boolean;
begin
  s := public.cc_own_course(p_id);
  v_used := exists (select 1 from public.quiz_sessions qs join public.lessons l on l.id = qs.lesson_id where l.subject_id = p_id)
         or exists (select 1 from public.course_reports where subject_id = p_id);
  if v_used then
    update public.subjects set status = 'archived' where id = p_id;
  else
    delete from public.subjects where id = p_id;
  end if;
  perform public.write_audit('course_delete', 'subject', p_id::text, jsonb_build_object('archived', v_used));
  return case when v_used then 'archived' else 'deleted' end;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: authoring API for signed-in users (each function checks the role itself)
-- ---------------------------------------------------------------------------
do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as sig, p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.oid not in (select oid from _pre_fn) loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
    if fn.proname in ('cc_set_creator_name', 'cc_create_course', 'cc_update_course', 'cc_my_courses', 'cc_get_course', 'cc_save_unit', 'cc_save_lesson',
                      'cc_delete_lesson', 'cc_delete_unit', 'cc_reorder', 'cc_save_question', 'cc_delete_question', 'cc_import_questions',
                      'cc_validate', 'cc_set_status', 'cc_set_visibility', 'cc_course_invite', 'cc_create_invite', 'cc_revoke_invites', 'cc_delete_course') then
      execute format('grant execute on function %s to authenticated', fn.sig);
    end if;
  end loop;
end $$;
drop table _pre_fn;

-- ============================================================================
-- Feature 6 (part 3): discovery, enrolment, ratings, favourites, reports, invitations,
-- parent controls and administrator moderation.
-- ============================================================================

create temp table _pre_fn as select oid from pg_proc where pronamespace = 'public'::regnamespace;

-- ---------------------------------------------------------------------------
-- Course card (what a student or parent sees; never answers, never the owner's email)
-- ---------------------------------------------------------------------------
create or replace function public.course_item(p_subject uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.subjects%rowtype; c jsonb; r jsonb;
begin
  select * into s from public.subjects where id = p_subject;
  c := public.cc_course_counts(p_subject);
  r := public.course_rating(p_subject);
  return jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'name_ar', s.name_ar, 'description', s.description, 'grade', s.grade, 'category', s.category,
    'icon', s.icon, 'theme', s.theme, 'kind', s.kind, 'visibility', s.visibility, 'source_label', s.source_label,
    'creator_name', case when s.kind = 'community' then public.creator_name(s.owner_id) end,
    'published_at', s.published_at,
    'unit_count', c -> 'units', 'lesson_count', c -> 'lessons', 'question_count', c -> 'questions',
    'rating_avg', r -> 'avg', 'rating_count', r -> 'count',
    'favorites', (select count(*) from public.course_favorites f where f.subject_id = s.id and not public.family_of(s.owner_id, f.user_id)),
    'enrollments', (select count(*) from public.course_enrollments e where e.subject_id = s.id and e.status = 'active' and not public.family_of(s.owner_id, e.student_id)),
    'enrolled', exists (select 1 from public.course_enrollments e where e.subject_id = s.id and e.student_id = p_user and e.status = 'active'),
    'favorited', exists (select 1 from public.course_favorites f where f.subject_id = s.id and f.user_id = p_user),
    'my_rating', (select stars from public.course_ratings where subject_id = s.id and user_id = p_user),
    'is_mine', public.family_of(s.owner_id, p_user));
end $$;

create or replace function public.require_course_user() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or public.my_role() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if public.is_student() and not public.community_allowed_for(auth.uid()) then raise exception 'community_disabled' using errcode = 'P0001'; end if;
  return auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- اكتشف المواد: search over PUBLIC, published, un-suspended community courses
-- ---------------------------------------------------------------------------
create or replace function public.search_courses(p_q text default '', p_grade int default null, p_category text default '',
                                                 p_sort text default 'relevance', p_favorites boolean default false,
                                                 p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := public.require_course_user();
  v_words text[] := array(select w from unnest(regexp_split_to_array(public.ar_normalize(left(coalesce(p_q, ''), 80)), ' ')) w where w <> '');
  v_cat text := public.ar_normalize(left(coalesce(p_category, ''), 40));
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_total int; v_items jsonb;
begin
  return (
    with base as (
      select s.id, s.published_at,
             (select coalesce(sum((case when position(w in public.ar_normalize(s.name_ar)) > 0 then 4 else 0 end)
                               + (case when position(w in public.ar_normalize(s.category)) > 0 then 3 else 0 end)
                               + (case when position(w in public.ar_normalize(s.description)) > 0 then 1 else 0 end)), 0) from unnest(v_words) w) as rel,
             (select count(*) from unnest(v_words) w
               where position(w in public.ar_normalize(s.name_ar || ' ' || s.category || ' ' || s.description)) = 0) as missing,
             (17.5 + coalesce(r.sm, 0)) / (5 + coalesce(r.n, 0)) as bayes, coalesce(r.n, 0) as rn,
             (select count(*) from public.course_enrollments e where e.subject_id = s.id and e.status = 'active' and not public.family_of(s.owner_id, e.student_id))
             + 2 * (select count(*) from public.course_favorites f where f.subject_id = s.id and not public.family_of(s.owner_id, f.user_id)) as pop
      from public.subjects s
      left join lateral (select count(*) as n, sum(stars) as sm from public.course_ratings where subject_id = s.id) r on true
      where s.kind = 'community' and s.status = 'published' and s.visibility = 'public' and s.moderation = 'ok' and s.owner_id is not null
        and (p_grade is null or s.grade = p_grade)
        and (v_cat = '' or public.ar_normalize(s.category) = v_cat)
        and (not p_favorites or exists (select 1 from public.course_favorites f where f.user_id = v_user and f.subject_id = s.id))
    ), matched as (select * from base where missing = 0),
    ranked as (
      select *, count(*) over () as total,
             row_number() over (order by case when p_sort = 'relevance' then rel end desc nulls last,
                                         case when p_sort = 'popular' then pop end desc nulls last,
                                         case when p_sort = 'rating' then bayes end desc nulls last,
                                         case when p_sort = 'recent' then published_at end desc nulls last,
                                         bayes desc, pop desc, published_at desc, id) as ord
      from matched),
    paged as (select * from ranked order by ord limit v_limit offset v_offset)
    select jsonb_build_object('total', coalesce((select max(total) from paged), 0),
             'items', coalesce(jsonb_agg(public.course_item(id, v_user) order by ord), '[]'::jsonb))
    from paged);
end $$;

create or replace function public.course_card(p_subject uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := public.require_course_user(); s public.subjects%rowtype;
begin
  select * into s from public.subjects where id = p_subject and kind = 'community';
  if not found or not (public.course_visible_to(v_user, p_subject) or public.family_of(s.owner_id, v_user) or public.is_admin()) then
    raise exception 'course not found' using errcode = 'P0002';
  end if;
  return public.course_item(p_subject, v_user) || jsonb_build_object(
    'outline', coalesce((
      select jsonb_agg(jsonb_build_object('title', u.title, 'lessons', coalesce((
        select jsonb_agg(jsonb_build_object('title', l.title, 'questions', (select count(*) from public.questions q where q.lesson_id = l.id and q.status = 'published'))
                         order by l.sort_order, l.number)
        from public.lessons l where l.unit_id = u.id and l.status = 'published'), '[]'::jsonb)) order by u.sort_order, u.number)
      from public.units u where u.subject_id = s.id and u.status = 'published'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Enrolment (students enrol directly; no approval gate) and the student's library
-- ---------------------------------------------------------------------------
create or replace function public.enroll_course(p_subject uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  s public.subjects%rowtype; e public.course_enrollments%rowtype; st public.community_settings%rowtype;
begin
  if not public.community_allowed_for(v_student) then raise exception 'community_disabled' using errcode = 'P0001'; end if;
  select * into s from public.subjects where id = p_subject and kind = 'community';
  if not found or not public.course_visible_to(v_student, p_subject) then raise exception 'course not found' using errcode = 'P0002'; end if;
  select * into e from public.course_enrollments where student_id = v_student and subject_id = p_subject;
  if found and e.blocked_by_parent then raise exception 'blocked_by_parent' using errcode = 'P0001'; end if;
  select * into st from public.community_settings;
  if not (found and e.status = 'active') then
    if (select count(*) from public.course_enrollments where student_id = v_student and status = 'active') >= st.enrollments_max then
      raise exception 'limit_reached' using errcode = 'P0001', detail = 'enrollments';
    end if;
    perform public.cc_rate(v_student, 'enroll', interval '1 day', 60);
  end if;
  insert into public.course_enrollments (student_id, subject_id, status, via)
  values (v_student, p_subject, 'active', case when public.family_of(s.owner_id, v_student) then 'family' when s.visibility = 'invite' then 'invite' else 'public' end)
  on conflict (student_id, subject_id) do update set status = 'active', updated_at = now();
  return public.course_item(p_subject, v_student);
end $$;

/** Removes the course from the student's library. Progress and results are kept. */
create or replace function public.unenroll_course(p_subject uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.require_student();
begin
  update public.course_enrollments set status = 'removed', updated_at = now() where student_id = v_student and subject_id = p_subject;
end $$;

create or replace function public.my_courses() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_student uuid := public.require_student();
begin
  return coalesce((
    select jsonb_agg(public.course_item(s.id, v_student) || jsonb_build_object(
      'available', public.community_can_play(v_student, s.id),
      'missions_total', (select count(*) from public.missions m join public.lessons l on l.id = m.lesson_id and l.status = 'published' where l.subject_id = s.id and m.active),
      'missions_done', (select count(distinct qs.mission_id) from public.quiz_sessions qs join public.lessons l on l.id = qs.lesson_id
                        where qs.student_id = v_student and l.subject_id = s.id and qs.status = 'completed'))
      order by e.enrolled_at desc)
    from public.course_enrollments e join public.subjects s on s.id = e.subject_id
    where e.student_id = v_student and e.status = 'active' and not e.blocked_by_parent), '[]'::jsonb);
end $$;

create or replace function public.community_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); st public.community_settings%rowtype; u record;
begin
  select * into st from public.community_settings;
  if public.is_student() then select * into u from public.community_used_today(v_user); end if;
  return jsonb_build_object('allowed', case when public.is_student() then public.community_allowed_for(v_user) else true end,
    'rewards_enabled', st.rewards_enabled, 'xp_per_question', st.xp_per_question, 'coins_per_question', st.coins_per_question,
    'mission_xp', st.mission_xp, 'mission_coins', st.mission_coins, 'daily_xp_cap', st.daily_xp_cap, 'daily_coin_cap', st.daily_coin_cap,
    'used_xp', coalesce(u.xp, 0), 'used_coins', coalesce(u.coins, 0), 'import_batch_max', st.import_batch_max,
    'max_questions_per_course', st.max_questions_per_course);
end $$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create or replace function public.redeem_course_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_inv public.course_invites%rowtype; st public.community_settings%rowtype; v_new boolean;
begin
  if v_user is null or public.my_role() not in ('student', 'parent') then raise exception 'student or parent account required' using errcode = '42501'; end if;
  if public.is_student() and not public.community_allowed_for(v_user) then raise exception 'community_disabled' using errcode = 'P0001'; end if;
  select * into st from public.community_settings;
  if (select count(*) from public.course_invite_attempts where user_id = v_user and not success and created_at > now() - interval '1 hour') >= st.invite_attempts_per_hour then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select i.* into v_inv from public.course_invites i join public.subjects s on s.id = i.subject_id
   where i.code = upper(btrim(coalesce(p_code, ''))) and i.revoked_at is null and i.expires_at > now() and i.uses < i.max_uses
     and s.kind = 'community' and s.visibility = 'invite' and s.status = 'published' and s.moderation = 'ok';
  if not found then
    -- Returned, not raised, so the failed attempt is committed and counts towards the limit.
    insert into public.course_invite_attempts (user_id, success) values (v_user, false);
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.course_invite_attempts (user_id, success) values (v_user, true);
  insert into public.course_access (subject_id, user_id, via_invite) values (v_inv.subject_id, v_user, v_inv.id) on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new then update public.course_invites set uses = uses + 1 where id = v_inv.id; end if;
  return jsonb_build_object('status', 'ok', 'subject_id', v_inv.subject_id, 'course', public.course_item(v_inv.subject_id, v_user));
end $$;

-- ---------------------------------------------------------------------------
-- Favourites, ratings and reports (no public text comments anywhere)
-- ---------------------------------------------------------------------------
create or replace function public.toggle_course_favorite(p_subject uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_course_user(); st public.community_settings%rowtype;
begin
  select * into st from public.community_settings;
  if p_on then
    if not exists (select 1 from public.subjects where id = p_subject and kind = 'community' and status = 'published' and visibility = 'public' and moderation = 'ok') then
      raise exception 'course not found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.course_favorites where user_id = v_user and subject_id = p_subject) then return true; end if;
    if (select count(*) from public.course_favorites where user_id = v_user) >= st.favorites_max then raise exception 'limit_reached' using errcode = 'P0001', detail = 'favorites'; end if;
    perform public.cc_rate(v_user, 'favorite', interval '1 day', 120);
    insert into public.course_favorites (user_id, subject_id) values (v_user, p_subject);
  else
    delete from public.course_favorites where user_id = v_user and subject_id = p_subject;
  end if;
  return p_on;
end $$;

/** One rating per person per course; needs a finished mission in that course; creators and their families cannot rate. */
create or replace function public.rate_course(p_subject uuid, p_stars int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_course_user(); s public.subjects%rowtype; st public.community_settings%rowtype; v_played boolean;
begin
  select * into st from public.community_settings;
  select * into s from public.subjects where id = p_subject and kind = 'community' and status = 'published' and visibility = 'public' and moderation = 'ok';
  if not found then raise exception 'course not found' using errcode = 'P0002'; end if;
  if public.family_of(s.owner_id, v_user) then raise exception 'own_course' using errcode = 'P0001'; end if;
  v_played := exists (
    select 1 from public.quiz_sessions qs join public.lessons l on l.id = qs.lesson_id
    where l.subject_id = p_subject and qs.status = 'completed'
      and (qs.student_id = v_user or exists (select 1 from public.parent_children pc where pc.parent_id = v_user and pc.student_id = qs.student_id)));
  if not v_played then raise exception 'play_first' using errcode = 'P0001'; end if;
  if p_stars is null or p_stars = 0 then
    delete from public.course_ratings where subject_id = p_subject and user_id = v_user;
  else
    if p_stars not between 1 and 5 then raise exception 'invalid rating' using errcode = '22023'; end if;
    perform public.cc_rate(v_user, 'rating', interval '1 day', st.ratings_per_day);
    insert into public.course_ratings (subject_id, user_id, stars) values (p_subject, v_user, p_stars)
    on conflict (subject_id, user_id) do update set stars = excluded.stars, updated_at = now();
  end if;
  return public.course_rating(p_subject);
end $$;

create or replace function public.report_course(p_subject uuid, p_category text, p_details text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := public.require_course_user(); s public.subjects%rowtype; st public.community_settings%rowtype; v_id uuid; v_d text;
begin
  select * into st from public.community_settings;
  select * into s from public.subjects where id = p_subject and kind = 'community';
  if not found or not public.course_visible_to(v_user, p_subject) then raise exception 'course not found' using errcode = 'P0002'; end if;
  if public.family_of(s.owner_id, v_user) then raise exception 'own_course' using errcode = 'P0001'; end if;
  if p_category not in ('incorrect', 'inappropriate', 'copyright', 'misleading', 'other') then raise exception 'invalid category' using errcode = '22023'; end if;
  -- Report text may quote the problem, so it is only cleaned, not rejected by the content rules.
  v_d := left(btrim(regexp_replace(coalesce(p_details, ''), '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]', '', 'g')), 500);
  if exists (select 1 from public.course_reports where subject_id = p_subject and reporter_id = v_user and status = 'open') then
    return jsonb_build_object('status', 'already_reported');
  end if;
  perform public.cc_rate(v_user, 'report', interval '1 day', st.reports_per_day);
  insert into public.course_reports (subject_id, reporter_id, category, details) values (p_subject, v_user, p_category, v_d) returning id into v_id;
  return jsonb_build_object('status', 'reported');
end $$;

-- ---------------------------------------------------------------------------
-- Parents: see and restrict their children's community courses
-- ---------------------------------------------------------------------------
create or replace function public.parent_child_courses(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_parent_of(p_student) then raise exception 'not your child' using errcode = '42501'; end if;
  return jsonb_build_object(
    'community_allowed', public.community_allowed_for(p_student),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name_ar', s.name_ar, 'creator_name', public.creator_name(s.owner_id), 'visibility', s.visibility, 'category', s.category,
        'status', e.status, 'blocked', e.blocked_by_parent, 'enrolled_at', e.enrolled_at,
        'available', public.course_visible_to(p_student, s.id) and s.moderation = 'ok',
        'moderation', s.moderation,
        'answered', (select count(*) from public.session_questions sq join public.quiz_sessions qs on qs.id = sq.session_id join public.lessons l on l.id = qs.lesson_id
                     where qs.student_id = p_student and l.subject_id = s.id and sq.result is not null),
        'missions_done', (select count(distinct qs.mission_id) from public.quiz_sessions qs join public.lessons l on l.id = qs.lesson_id
                          where qs.student_id = p_student and l.subject_id = s.id and qs.status = 'completed'),
        'last_played', (select max(qs.started_at) from public.quiz_sessions qs join public.lessons l on l.id = qs.lesson_id
                        where qs.student_id = p_student and l.subject_id = s.id))
        order by e.enrolled_at desc)
      from public.course_enrollments e join public.subjects s on s.id = e.subject_id where e.student_id = p_student), '[]'::jsonb));
end $$;

/** Blocking removes the course from the child's library and stops them re-enrolling. Progress is kept. */
create or replace function public.parent_set_course_block(p_student uuid, p_subject uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent_of(p_student) then raise exception 'not your child' using errcode = '42501'; end if;
  update public.course_enrollments
     set blocked_by_parent = p_blocked, status = case when p_blocked then 'removed' else status end, updated_at = now()
   where student_id = p_student and subject_id = p_subject;
  perform public.write_audit('course_block', 'student', p_student::text, jsonb_build_object('subject', p_subject, 'blocked', p_blocked));
end $$;

create or replace function public.parent_set_community_allowed(p_student uuid, p_allowed boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent_of(p_student) then raise exception 'not your child' using errcode = '42501'; end if;
  insert into public.child_community_controls (student_id, community_allowed, updated_at) values (p_student, p_allowed, now())
  on conflict (student_id) do update set community_allowed = excluded.community_allowed, updated_at = now();
  perform public.write_audit('community_allowed', 'student', p_student::text, jsonb_build_object('allowed', p_allowed));
end $$;

-- ---------------------------------------------------------------------------
-- Administrators: moderation, classification, settings, investigation
-- ---------------------------------------------------------------------------
create or replace function public.admin_community_courses(p_q text default '', p_filter text default '', p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_q text := public.ar_normalize(left(coalesce(p_q, ''), 80));
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(row order by (row ->> 'open_reports')::int desc, row ->> 'updated_at' desc) from (
      select jsonb_build_object(
        'id', s.id, 'slug', s.slug, 'name_ar', s.name_ar, 'category', s.category, 'grade', s.grade, 'status', s.status, 'visibility', s.visibility,
        'moderation', s.moderation, 'moderation_note', s.moderation_note, 'kind', s.kind, 'published_at', s.published_at, 'updated_at', s.updated_at,
        'owner_id', s.owner_id, 'owner_email', (select email from auth.users where id = s.owner_id), 'creator_name', public.creator_name(s.owner_id),
        'counts', public.cc_course_counts(s.id), 'rating', public.course_rating(s.id),
        'enrollments', (select count(*) from public.course_enrollments e where e.subject_id = s.id and e.status = 'active'),
        'open_reports', (select count(*) from public.course_reports r where r.subject_id = s.id and r.status = 'open'),
        'reward_xp_7d', (select coalesce(sum(t.xp), 0) from public.reward_transactions t where t.kind = 'community_question' and t.ref like s.id::text || ':%' and t.created_at > now() - interval '7 days')) as row
      from public.subjects s
      where s.kind = 'community'
        and (v_q = '' or position(v_q in public.ar_normalize(s.name_ar || ' ' || public.creator_name(s.owner_id))) > 0)
        and (p_filter = '' or p_filter = s.status::text or p_filter = s.moderation
             or (p_filter = 'reported' and exists (select 1 from public.course_reports r where r.subject_id = s.id and r.status = 'open')))
      order by s.updated_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) x), '[]'::jsonb);
end $$;

create or replace function public.admin_course_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'subject_id', r.subject_id, 'course', s.name_ar, 'course_status', s.status, 'moderation', s.moderation,
      'creator_name', public.creator_name(s.owner_id), 'owner_id', s.owner_id,
      'category', r.category, 'details', r.details, 'status', r.status, 'resolution', r.resolution, 'created_at', r.created_at,
      'reporter', left(coalesce(r.reporter_id::text, 'deleted'), 8),
      'reporter_dismissed_30d', (select count(*) from public.course_reports x where x.reporter_id = r.reporter_id and x.status = 'dismissed' and x.created_at > now() - interval '30 days'),
      'reports_on_course', (select count(*) from public.course_reports x where x.subject_id = r.subject_id and x.status = 'open'),
      'distinct_reporters', (select count(distinct x.reporter_id) from public.course_reports x where x.subject_id = r.subject_id and x.status = 'open'))
      order by r.created_at desc)
    from public.course_reports r join public.subjects s on s.id = r.subject_id
    where (p_status = '' or r.status = p_status)), '[]'::jsonb);
end $$;

/** suspend / restore / remove / unpublish. Suspended or removed courses vanish from discovery and stop being playable at once. */
create or replace function public.admin_moderate_course(p_subject uuid, p_action text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.require_admin(); s public.subjects%rowtype; v_note text := left(btrim(coalesce(p_note, '')), 500);
begin
  select * into s from public.subjects where id = p_subject and kind = 'community';
  if not found then raise exception 'course not found' using errcode = 'P0002'; end if;
  if p_action = 'suspend' then update public.subjects set moderation = 'suspended', moderation_note = v_note where id = p_subject;
  elsif p_action = 'remove' then update public.subjects set moderation = 'removed', moderation_note = v_note where id = p_subject;
  elsif p_action = 'restore' then update public.subjects set moderation = 'ok', moderation_note = v_note where id = p_subject;
  elsif p_action = 'unpublish' then update public.subjects set status = 'draft', moderation_note = v_note where id = p_subject;
  else raise exception 'invalid action' using errcode = '22023'; end if;
  perform public.write_audit('course_moderation', 'subject', p_subject::text, jsonb_build_object('action', p_action, 'note', v_note));
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.require_admin();
begin
  if p_status not in ('resolved', 'dismissed', 'open') then raise exception 'invalid status' using errcode = '22023'; end if;
  update public.course_reports set status = p_status, resolution = left(btrim(coalesce(p_note, '')), 500), handled_by = v_admin, handled_at = now() where id = p_report;
  if not found then raise exception 'report not found' using errcode = 'P0002'; end if;
  perform public.write_audit('report_' || p_status, 'course_report', p_report::text, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_resolve_course_reports(p_subject uuid, p_status text, p_note text default '') returns int
language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.require_admin(); v_n int;
begin
  if p_status not in ('resolved', 'dismissed') then raise exception 'invalid status' using errcode = '22023'; end if;
  update public.course_reports set status = p_status, resolution = left(btrim(coalesce(p_note, '')), 500), handled_by = v_admin, handled_at = now()
   where subject_id = p_subject and status = 'open';
  get diagnostics v_n = row_count;
  perform public.write_audit('reports_' || p_status, 'subject', p_subject::text, jsonb_build_object('count', v_n));
  return v_n;
end $$;

/** Only administrators classify a course as official. A promoted course becomes public and read-only for its creator. */
create or replace function public.admin_set_course_kind(p_subject uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.require_admin(); s public.subjects%rowtype;
begin
  select * into s from public.subjects where id = p_subject;
  if not found then raise exception 'course not found' using errcode = 'P0002'; end if;
  if p_kind = 'official' then
    if s.status <> 'published' or s.moderation <> 'ok' then raise exception 'only a published, un-suspended course can become official' using errcode = 'P0001'; end if;
    update public.subjects set kind = 'official', visibility = 'public' where id = p_subject;
  elsif p_kind = 'community' then
    if s.owner_id is null then raise exception 'no owner to hand the course back to' using errcode = 'P0001'; end if;
    update public.subjects set kind = 'community' where id = p_subject;
  else raise exception 'invalid kind' using errcode = '22023'; end if;
  perform public.write_audit('course_kind', 'subject', p_subject::text, jsonb_build_object('from', s.kind, 'to', p_kind));
end $$;

create or replace function public.admin_creator_standing(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'creator_name', public.creator_name(p_user), 'email', (select email from auth.users where id = p_user),
    'blocked', coalesce((select publishing_blocked from public.creator_profiles where user_id = p_user), false),
    'courses', (select count(*) from public.subjects where owner_id = p_user and kind = 'community'),
    'suspended', (select count(*) from public.subjects where owner_id = p_user and kind = 'community' and moderation <> 'ok'),
    'reports_upheld', (select count(*) from public.course_reports r join public.subjects s on s.id = r.subject_id where s.owner_id = p_user and r.status = 'resolved'));
end $$;

create or replace function public.admin_set_creator_block(p_user uuid, p_blocked boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.require_admin();
begin
  perform public.cc_ensure_creator(p_user);
  update public.creator_profiles set publishing_blocked = p_blocked, blocked_note = left(btrim(coalesce(p_note, '')), 500) where user_id = p_user;
  if p_blocked then
    -- A blocked creator's published courses leave discovery until an administrator restores them.
    update public.subjects set moderation = 'suspended', moderation_note = 'تم إيقاف النشر لهذا الحساب' where owner_id = p_user and kind = 'community' and moderation = 'ok' and status = 'published';
  end if;
  perform public.write_audit('creator_block', 'profile', p_user::text, jsonb_build_object('blocked', p_blocked, 'note', p_note));
end $$;

create or replace function public.admin_community_insights() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'totals', jsonb_build_object(
      'courses', (select count(*) from public.subjects where kind = 'community'),
      'published', (select count(*) from public.subjects where kind = 'community' and status = 'published' and moderation = 'ok'),
      'suspended', (select count(*) from public.subjects where kind = 'community' and moderation <> 'ok'),
      'new_24h', (select count(*) from public.subjects where kind = 'community' and created_at > now() - interval '1 day'),
      'open_reports', (select count(*) from public.course_reports where status = 'open'),
      'enrollments', (select count(*) from public.course_enrollments where status = 'active')),
    'top_earners_7d', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('student', left(t.student_id::text, 8), 'nickname', sp.nickname, 'xp', sum(t.xp), 'coins', sum(t.coins), 'rewards', count(*)) as x
      from public.reward_transactions t join public.student_profiles sp on sp.id = t.student_id
      where t.kind in ('community_question', 'community_mission') and t.created_at > now() - interval '7 days'
      group by t.student_id, sp.nickname order by sum(t.xp) desc limit 10) q), '[]'::jsonb),
    'top_courses_7d', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', s.id, 'name', s.name_ar, 'creator', public.creator_name(s.owner_id), 'xp', sum(t.xp), 'students', count(distinct t.student_id)) as x
      from public.reward_transactions t join public.subjects s on s.id::text = split_part(t.ref, ':', 1)
      where t.kind = 'community_question' and t.created_at > now() - interval '7 days'
      group by s.id order by sum(t.xp) desc limit 10) q), '[]'::jsonb),
    'heavy_publishers', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('user_id', a.user_id, 'creator', public.creator_name(a.user_id), 'publishes_7d', sum(a.weight),
             'courses', (select count(*) from public.subjects s where s.owner_id = a.user_id and s.kind = 'community'),
             'suspended', (select count(*) from public.subjects s where s.owner_id = a.user_id and s.moderation <> 'ok')) as x
      from public.course_actions a where a.action in ('publish', 'course_create') and a.created_at > now() - interval '7 days'
      group by a.user_id having sum(a.weight) >= 5 order by sum(a.weight) desc limit 10) q), '[]'::jsonb),
    'rating_bursts', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', s.id, 'name', s.name_ar, 'ratings_24h', count(*), 'avg', round(avg(r.stars), 1)) as x
      from public.course_ratings r join public.subjects s on s.id = r.subject_id
      where r.updated_at > now() - interval '1 day' group by s.id having count(*) >= 5 order by count(*) desc limit 10) q), '[]'::jsonb));
end $$;

create or replace function public.admin_get_community_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return to_jsonb((select c from public.community_settings c)) - 'id';
end $$;

create or replace function public.admin_set_community_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.require_admin(); k text; c public.community_settings%rowtype;
begin
  for k in select jsonb_object_keys(p) loop
    if k in ('id', 'updated_at') or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'community_settings' and column_name = k) then
      raise exception 'unknown setting %', k using errcode = '22023';
    end if;
  end loop;
  select * into c from public.community_settings;
  c := jsonb_populate_record(c, p);  -- table CHECK constraints reject out-of-range values
  update public.community_settings set rewards_enabled = c.rewards_enabled, xp_per_question = c.xp_per_question, coins_per_question = c.coins_per_question,
    mission_xp = c.mission_xp, mission_coins = c.mission_coins, daily_xp_cap = c.daily_xp_cap, daily_coin_cap = c.daily_coin_cap,
    course_lifetime_questions = c.course_lifetime_questions, max_courses_per_parent = c.max_courses_per_parent,
    max_questions_per_course = c.max_questions_per_course, max_units = c.max_units, max_lessons_per_unit = c.max_lessons_per_unit,
    import_batch_max = c.import_batch_max, imports_per_hour = c.imports_per_hour, question_writes_per_day = c.question_writes_per_day,
    publishes_per_day = c.publishes_per_day, reports_per_day = c.reports_per_day, ratings_per_day = c.ratings_per_day,
    favorites_max = c.favorites_max, enrollments_max = c.enrollments_max, invite_attempts_per_hour = c.invite_attempts_per_hour, updated_at = now();
  perform public.write_audit('community_settings', 'settings', 'community', p);
  return to_jsonb((select x from public.community_settings x)) - 'id';
end $$;

create or replace function public.admin_blocklist(p_term text default null, p_add boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.require_admin(); v text := lower(btrim(coalesce(p_term, '')));
begin
  if v <> '' then
    if p_add then insert into public.community_blocklist (term) values (v) on conflict do nothing;
    else delete from public.community_blocklist where term = v; end if;
    perform public.write_audit('blocklist', 'settings', v, jsonb_build_object('add', p_add));
  end if;
  return coalesce((select jsonb_agg(term order by term) from public.community_blocklist), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as sig, p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.oid not in (select oid from _pre_fn) loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
    if fn.proname in ('search_courses', 'course_card', 'enroll_course', 'unenroll_course', 'my_courses', 'community_info', 'redeem_course_invite',
                      'toggle_course_favorite', 'rate_course', 'report_course', 'parent_child_courses', 'parent_set_course_block',
                      'parent_set_community_allowed', 'admin_community_courses', 'admin_course_reports', 'admin_moderate_course',
                      'admin_resolve_report', 'admin_resolve_course_reports', 'admin_set_course_kind', 'admin_creator_standing',
                      'admin_set_creator_block', 'admin_community_insights', 'admin_get_community_settings', 'admin_set_community_settings',
                      'admin_blocklist') then
      execute format('grant execute on function %s to authenticated', fn.sig);
    end if;
  end loop;
end $$;
drop table _pre_fn;

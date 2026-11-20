-- ============================================================================
-- Feature 6 (part 1): Community courses — schema, access rules, rewards, game integration.
--
-- Design: a community course is a `subjects` row with kind = 'community' and an owner, so units, lessons,
-- questions, missions, sessions, grading and results are the SAME objects the official curriculum uses.
-- Official content is untouched (kind defaults to 'official'). Visibility is enforced here, in the database:
--   * RLS: ordinary reads of subjects/units/lessons/missions only ever return OFFICIAL published content.
--   * Community content is reached only through SECURITY DEFINER functions that check ownership,
--     visibility, enrolment, parent restrictions and moderation on every call.
-- Rewards for community courses use their own, capped, idempotent ledger kinds.
-- ============================================================================

create temp table _pre_fn as select oid from pg_proc where pronamespace = 'public'::regnamespace;

-- Small helper: patch an existing function's source (fails loudly if the text to change is not found).
create or replace function pg_temp.patch_fn(p_sig text, p_old text, p_new text) returns void language plpgsql as $$
declare d text; n text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  n := replace(d, p_old, p_new);
  if n = d then raise exception 'patch_fn: text not found in %', p_sig; end if;
  execute n;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.subjects
  add column kind text not null default 'official' check (kind in ('official', 'community')),
  add column owner_id uuid references public.profiles (id) on delete set null,
  add column visibility text not null default 'public' check (visibility in ('public', 'private', 'invite')),
  add column category text not null default '' check (char_length(category) <= 40),
  add column moderation text not null default 'ok' check (moderation in ('ok', 'suspended', 'removed')),
  add column moderation_note text not null default '' check (char_length(moderation_note) <= 500),
  add column published_at timestamptz,
  add column version int not null default 1;
create index subjects_owner_idx on public.subjects (owner_id) where kind = 'community';
create index subjects_discovery_idx on public.subjects (published_at desc)
  where kind = 'community' and status = 'published' and visibility = 'public' and moderation = 'ok';

alter table public.questions add column lineage_id uuid;
create index questions_lineage_idx on public.questions (lineage_id) where lineage_id is not null;
alter table public.questions drop constraint questions_origin_check;
alter table public.questions add constraint questions_origin_check check (origin in ('legacy_import', 'ai_generated', 'manual', 'community'));

alter table public.reward_transactions drop constraint reward_transactions_kind_check;
alter table public.reward_transactions drop constraint reward_transactions_check;
alter table public.reward_transactions add constraint reward_transactions_kind_check
  check (kind in ('question', 'mission', 'purchase', 'package', 'package_reward', 'multiplayer', 'community_question', 'community_mission'));
alter table public.reward_transactions add constraint reward_transactions_check check (
     (kind in ('question', 'mission', 'multiplayer', 'community_question', 'community_mission') and xp >= 0 and coins >= 0)
  or (kind in ('purchase', 'package') and xp = 0 and coins <= 0)
  or (kind = 'package_reward' and xp = 0 and coins >= 0));

-- ---------------------------------------------------------------------------
-- 2. Tables (all API access goes through functions)
-- ---------------------------------------------------------------------------
create table public.community_settings (
  id boolean primary key default true check (id),
  rewards_enabled boolean not null default true,
  xp_per_question int not null default 2 check (xp_per_question between 0 and 20),
  coins_per_question int not null default 1 check (coins_per_question between 0 and 20),
  mission_xp int not null default 5 check (mission_xp between 0 and 50),
  mission_coins int not null default 3 check (mission_coins between 0 and 50),
  daily_xp_cap int not null default 40 check (daily_xp_cap between 0 and 500),
  daily_coin_cap int not null default 25 check (daily_coin_cap between 0 and 500),
  course_lifetime_questions int not null default 60 check (course_lifetime_questions between 0 and 1000),
  max_courses_per_parent int not null default 20 check (max_courses_per_parent between 1 and 200),
  max_questions_per_course int not null default 500 check (max_questions_per_course between 10 and 5000),
  max_units int not null default 30 check (max_units between 1 and 100),
  max_lessons_per_unit int not null default 30 check (max_lessons_per_unit between 1 and 100),
  import_batch_max int not null default 100 check (import_batch_max between 1 and 500),
  imports_per_hour int not null default 10 check (imports_per_hour between 1 and 100),
  question_writes_per_day int not null default 1000 check (question_writes_per_day between 10 and 10000),
  publishes_per_day int not null default 10 check (publishes_per_day between 1 and 100),
  reports_per_day int not null default 5 check (reports_per_day between 1 and 50),
  ratings_per_day int not null default 30 check (ratings_per_day between 1 and 200),
  favorites_max int not null default 100 check (favorites_max between 1 and 1000),
  enrollments_max int not null default 40 check (enrollments_max between 1 and 500),
  invite_attempts_per_hour int not null default 10 check (invite_attempts_per_hour between 1 and 100),
  updated_at timestamptz not null default now()
);
insert into public.community_settings default values;

create table public.community_blocklist (
  term text primary key check (char_length(term) between 2 and 40 and term = lower(term))
);
insert into public.community_blocklist (term) values
  ('porn'), ('porno'), ('xxx'), ('nude'), ('nudes'), ('fuck'), ('shit'), ('bitch'), ('cocaine'), ('heroin'),
  ('سكس'), ('اباحي'), ('اباحية'), ('عاري'), ('عاريه'), ('شرموطه'), ('قحبه'), ('كس امك'), ('منيوك'), ('مخدرات للبيع');

create table public.creator_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  publishing_blocked boolean not null default false,
  blocked_note text not null default '' check (char_length(blocked_note) <= 500),
  created_at timestamptz not null default now()
);

create table public.course_enrollments (
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'removed')),
  blocked_by_parent boolean not null default false,
  via text not null default 'public' check (via in ('public', 'invite', 'family')),
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, subject_id)
);
create index course_enrollments_subject_idx on public.course_enrollments (subject_id) where status = 'active';

create table public.course_invites (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_uses int not null default 50 check (max_uses between 1 and 500),
  uses int not null default 0,
  created_at timestamptz not null default now()
);
create index course_invites_subject_idx on public.course_invites (subject_id);

create table public.course_access (
  subject_id uuid not null references public.subjects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  via_invite uuid references public.course_invites (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (subject_id, user_id)
);
create index course_access_user_idx on public.course_access (user_id);

create table public.course_invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index course_invite_attempts_idx on public.course_invite_attempts (user_id, created_at desc);

create table public.course_ratings (
  subject_id uuid not null references public.subjects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject_id, user_id)
);

create table public.course_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, subject_id)
);
create index course_favorites_subject_idx on public.course_favorites (subject_id);

create table public.course_reports (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  category text not null check (category in ('incorrect', 'inappropriate', 'copyright', 'misleading', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution text not null default '' check (char_length(resolution) <= 500),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index course_reports_one_open on public.course_reports (subject_id, reporter_id) where status = 'open';
create index course_reports_status_idx on public.course_reports (status, created_at desc);

-- Rate-limit ledger for creation, editing, rating, favourites and reports.
create table public.course_actions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  weight int not null default 1,
  created_at timestamptz not null default now()
);
create index course_actions_idx on public.course_actions (user_id, action, created_at desc);

-- Imports are idempotent per request id: a double submit never imports twice.
create table public.course_import_batches (
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null,
  lesson_id uuid references public.lessons (id) on delete set null,
  imported int not null,
  skipped int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

-- Parent switch: no community courses for this child at all.
create table public.child_community_controls (
  student_id uuid primary key references public.student_profiles (id) on delete cascade,
  community_allowed boolean not null default true,
  updated_at timestamptz not null default now()
);

-- RLS: every new table is closed to direct API access except admin reads and a few harmless own-row reads.
do $$
declare t text;
begin
  foreach t in array array['community_settings', 'community_blocklist', 'creator_profiles', 'course_enrollments', 'course_invites', 'course_access',
                           'course_invite_attempts', 'course_ratings', 'course_favorites', 'course_reports', 'course_actions',
                           'course_import_batches', 'child_community_controls'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from authenticated, anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %1$s_admin_read on public.%1$s for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;
create policy course_enrollments_own on public.course_enrollments for select to authenticated
  using (student_id = (select auth.uid()) or public.is_parent_of(student_id));
create policy course_favorites_own on public.course_favorites for select to authenticated using (user_id = (select auth.uid()));
create policy course_ratings_own on public.course_ratings for select to authenticated using (user_id = (select auth.uid()));
create policy creator_profiles_own on public.creator_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy child_community_controls_read on public.child_community_controls for select to authenticated
  using (student_id = (select auth.uid()) or public.is_parent_of(student_id));

-- ---------------------------------------------------------------------------
-- 3. Ordinary reads see OFFICIAL content only
-- ---------------------------------------------------------------------------
drop policy subjects_read on public.subjects;
create policy subjects_read on public.subjects for select to authenticated
  using ((kind = 'official' and status = 'published') or public.is_admin());
drop policy units_read on public.units;
create policy units_read on public.units for select to authenticated
  using ((status = 'published' and exists (select 1 from public.subjects s where s.id = subject_id and s.status = 'published' and s.kind = 'official')) or public.is_admin());
drop policy lessons_read on public.lessons;
create policy lessons_read on public.lessons for select to authenticated
  using ((status = 'published'
          and exists (select 1 from public.units u where u.id = unit_id and u.status = 'published')
          and exists (select 1 from public.subjects s where s.id = subject_id and s.status = 'published' and s.kind = 'official'))
         or public.is_admin());
drop policy missions_read on public.missions;
create policy missions_read on public.missions for select to authenticated
  using (exists (select 1 from public.lessons l join public.subjects s on s.id = l.subject_id
                 where l.id = lesson_id and s.kind = 'official' and s.status = 'published') or public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.require_parent() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'parent'::public.app_role then raise exception 'parent account required' using errcode = '42501'; end if;
  return auth.uid();
end $$;

/** p_user is the owner or one of the owner's linked children. */
create or replace function public.family_of(p_owner uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner is not null and p_user is not null
     and (p_owner = p_user or exists (select 1 from public.parent_children where parent_id = p_owner and student_id = p_user))
$$;

/** May this user see/enrol in this community course right now? (published, not moderated, visibility rules) */
create or replace function public.course_visible_to(p_user uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subjects s
    where s.id = p_subject and s.kind = 'community' and s.status = 'published' and s.moderation = 'ok' and s.owner_id is not null
      and (s.visibility = 'public'
           or public.family_of(s.owner_id, p_user)
           or (s.visibility = 'invite' and (
                 exists (select 1 from public.course_access a where a.subject_id = s.id and a.user_id = p_user)
              or exists (select 1 from public.course_access a join public.parent_children pc on pc.parent_id = a.user_id
                          where a.subject_id = s.id and pc.student_id = p_user)))))
$$;

create or replace function public.community_allowed_for(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select community_allowed from public.child_community_controls where student_id = p_student), true)
$$;

/** May this STUDENT play this community course: visible + enrolled + not restricted by a parent. */
create or replace function public.community_can_play(p_student uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.community_allowed_for(p_student)
     and public.course_visible_to(p_student, p_subject)
     and exists (select 1 from public.course_enrollments e
                 where e.student_id = p_student and e.subject_id = p_subject and e.status = 'active' and not e.blocked_by_parent)
$$;

-- Rate limit helper: raises 'rate_limited' when the weighted count in the window would exceed the limit.
create or replace function public.cc_rate(p_user uuid, p_action text, p_window interval, p_limit int, p_weight int default 1) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select sum(weight) from public.course_actions where user_id = p_user and action = p_action and created_at > now() - p_window), 0) + p_weight > p_limit then
    raise exception 'rate_limited' using errcode = 'P0001', detail = p_action;
  end if;
  insert into public.course_actions (user_id, action, weight) values (p_user, p_action, p_weight);
end $$;

/** Display name for a creator; never an email. */
create or replace function public.creator_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from public.creator_profiles where user_id = p_user), 'ولي أمر')
$$;

-- Content-safety text rules. These are RULE-BASED CHECKS, not a guarantee of safety.
create or replace function public.cc_unsafe(p text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare n text;
begin
  if p is null or p = '' then return false; end if;
  if p ~* '<\s*/?\s*[a-z!?]' or p ~* '(javascript|vbscript|data)\s*:' or p ~* '(https?|ftp|file)\s*:\s*/\s*/' or p ~* '(^|[^a-z0-9])www\.'
     or p ~* '[a-z0-9-]+\.(com|net|org|io|ly|me|ru|xyz|top|info|biz|tk|cc|link|click)([^a-z]|$)' or p ~* '&#?[a-z0-9]+;' then
    return true;
  end if;
  n := ' ' || public.ar_normalize(p) || ' ';
  return exists (select 1 from public.community_blocklist b where position(' ' || public.ar_normalize(b.term) || ' ' in n) > 0);
end $$;

/** Cleans a text field: strips control and bidi-override characters, normalises spacing, checks length and safety. */
create or replace function public.cc_clean(p text, p_min int, p_max int, p_field text, p_multiline boolean default false) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text := coalesce(p, '');
begin
  v := regexp_replace(v, '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f​‎‏‪-‮⁦-⁩﻿]', '', 'g');
  v := replace(v, E'\r', '');
  if p_multiline then
    v := btrim(regexp_replace(regexp_replace(v, '[ \t]+', ' ', 'g'), E'\n{3,}', E'\n\n', 'g'));
  else
    v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  end if;
  if char_length(v) < p_min then raise exception 'text_too_short' using errcode = '22023', detail = p_field; end if;
  if char_length(v) > p_max then raise exception 'text_too_long' using errcode = '22023', detail = p_field; end if;
  if public.cc_unsafe(v) then raise exception 'unsafe_content' using errcode = '22023', detail = p_field; end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Catalogue: official only; community catalogue for the enrolled student
-- ---------------------------------------------------------------------------
create or replace function public.catalog_subject_json(p_subject uuid, p_hide_empty boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'name_ar', s.name_ar, 'name_en', s.name_en, 'grade', s.grade,
    'semester', s.semester, 'description', s.description, 'icon', s.icon, 'theme', s.theme,
    'sort_order', s.sort_order, 'source_label', s.source_label, 'updated_at', s.updated_at,
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'number', u.number, 'title', u.title,
        'lessons', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id, 'legacy_id', l.legacy_id, 'number', l.number, 'title', l.title,
            'page_start', l.page_start, 'page_end', l.page_end,
            'missions', coalesce((
              select jsonb_agg(jsonb_build_object('id', m.id, 'number', m.number,
                       'question_count', (select count(*) from public.mission_questions mq where mq.mission_id = m.id))
                     order by m.number)
              from public.missions m where m.lesson_id = l.id and m.active), '[]'::jsonb)
          ) order by l.sort_order, l.number)
          from public.lessons l where l.unit_id = u.id and l.status = 'published'
            and (not p_hide_empty or exists (select 1 from public.missions m where m.lesson_id = l.id and m.active))), '[]'::jsonb)
      ) order by u.sort_order, u.number)
      from public.units u where u.subject_id = s.id and u.status = 'published'), '[]'::jsonb))
  from public.subjects s where s.id = p_subject
$$;

create or replace function public.get_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.catalog_subject_json(s.id) order by s.sort_order, s.name_ar), '[]'::jsonb)
  from public.subjects s
  where s.status = 'published' and s.kind = 'official' and s.moderation = 'ok' and auth.uid() is not null
$$;

/** The enrolled student's community courses in catalogue shape, plus where each one comes from. */
create or replace function public.get_my_course_catalog() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_student uuid := public.require_student();
begin
  return coalesce((
    select jsonb_agg(public.catalog_subject_json(s.id, true) || jsonb_build_object(
             'kind', 'community', 'creator_name', public.creator_name(s.owner_id), 'visibility', s.visibility, 'category', s.category)
           order by e.enrolled_at desc)
    from public.course_enrollments e join public.subjects s on s.id = e.subject_id
    where e.student_id = v_student and public.community_can_play(v_student, s.id)), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Gameplay: playable missions, live-session checks
-- ---------------------------------------------------------------------------
create or replace function public.mission_is_playable(p_mission uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.missions m
    join public.lessons l on l.id = m.lesson_id and l.status = 'published'
    join public.units u on u.id = l.unit_id and u.status = 'published'
    join public.subjects s on s.id = l.subject_id and s.status = 'published' and s.moderation = 'ok'
    where m.id = p_mission and m.active
      and (s.kind = 'official' or public.community_can_play(auth.uid(), s.id)))
$$;

/** A session on a community course ends when the course is suspended, unpublished, made private or restricted. */
create or replace function public.session_course_ok(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.quiz_sessions qs join public.lessons l on l.id = qs.lesson_id join public.subjects s on s.id = l.subject_id
    where qs.id = p_session and s.kind = 'community' and not public.community_can_play(qs.student_id, s.id))
$$;

select pg_temp.patch_fn('public.lock_session_question(uuid,uuid,uuid)',
  $a$  if v_sq.result is not null then raise exception 'already answered' using errcode = 'P0003'; end if;$a$,
  $b$  if v_sq.result is not null then raise exception 'already answered' using errcode = 'P0003'; end if;
  if not public.session_course_ok(p_session) then raise exception 'course not available' using errcode = 'P0002'; end if;$b$);

-- ---------------------------------------------------------------------------
-- 7. Rewards for community courses: bounded, idempotent, server-decided
-- ---------------------------------------------------------------------------
create or replace function public.community_used_today(p_student uuid, out xp int, out coins int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(t.xp), 0)::int, coalesce(sum(t.coins), 0)::int from public.reward_transactions t
  where t.student_id = p_student and t.kind in ('community_question', 'community_mission') and t.created_at >= date_trunc('day', now())
$$;

/** Reward for one correctly answered community question. Once per question lineage per student, ever. */
create or replace function public.community_award_question(p_student uuid, p_q public.questions, p_result text, p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.community_settings%rowtype;
  v_owner uuid;
  v_ref text := p_q.subject_id::text || ':' || coalesce(p_q.lineage_id, p_q.id)::text;
  v_used record;
  v_bx int; v_bc int; v_xp int; v_coins int; v_cnt int; v_tx bigint;
  none jsonb := jsonb_build_object('xp', 0, 'coins', 0, 'already_rewarded', false, 'capped', false);
begin
  perform pg_advisory_xact_lock(hashtext('community-reward:' || p_student::text));
  select * into s from public.community_settings;
  select owner_id into v_owner from public.subjects where id = p_q.subject_id;
  -- No rewards in your own family's course (self-created course farming), or when switched off.
  if not s.rewards_enabled or public.family_of(v_owner, p_student) then return none || jsonb_build_object('reason', 'no_rewards'); end if;
  if exists (select 1 from public.reward_transactions where student_id = p_student and kind = 'community_question' and ref = v_ref) then
    return none || jsonb_build_object('already_rewarded', true);
  end if;
  select count(*) into v_cnt from public.reward_transactions
   where student_id = p_student and kind = 'community_question' and ref like p_q.subject_id::text || ':%' and (xp > 0 or coins > 0);
  if v_cnt >= s.course_lifetime_questions then return none || jsonb_build_object('capped', true, 'reason', 'course_limit'); end if;
  v_bx := case when p_result = 'first' then s.xp_per_question else (s.xp_per_question + 1) / 2 end;
  v_bc := case when p_result = 'first' then s.coins_per_question else (s.coins_per_question + 1) / 2 end;
  select * into v_used from public.community_used_today(p_student);
  v_xp := least(v_bx, greatest(s.daily_xp_cap - v_used.xp, 0));
  v_coins := least(v_bc, greatest(s.daily_coin_cap - v_used.coins, 0));
  -- A capped answer is still recorded (with 0) so the same question can never pay out on a later day.
  insert into public.reward_transactions (student_id, kind, ref, xp, coins, session_id)
  values (p_student, 'community_question', v_ref, v_xp, v_coins, p_session)
  on conflict (student_id, kind, ref) do nothing returning id into v_tx;
  if v_tx is null then return none || jsonb_build_object('already_rewarded', true); end if;
  return jsonb_build_object('xp', v_xp, 'coins', v_coins, 'already_rewarded', false, 'capped', v_xp < v_bx or v_coins < v_bc,
                            'reason', case when v_xp < v_bx or v_coins < v_bc then 'daily_limit' end);
end $$;

create or replace function public.community_award_mission(p_student uuid, p_mission uuid, p_subject uuid, p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.community_settings%rowtype;
  v_owner uuid;
  v_used record;
  v_xp int; v_coins int; v_tx bigint;
  none jsonb := jsonb_build_object('xp', 0, 'coins', 0, 'granted', false, 'capped', false);
begin
  perform pg_advisory_xact_lock(hashtext('community-reward:' || p_student::text));
  select * into s from public.community_settings;
  select owner_id into v_owner from public.subjects where id = p_subject;
  if not s.rewards_enabled or public.family_of(v_owner, p_student) then return none; end if;
  if exists (select 1 from public.reward_transactions where student_id = p_student and kind = 'community_mission' and ref = p_mission::text) then return none; end if;
  select * into v_used from public.community_used_today(p_student);
  v_xp := least(s.mission_xp, greatest(s.daily_xp_cap - v_used.xp, 0));
  v_coins := least(s.mission_coins, greatest(s.daily_coin_cap - v_used.coins, 0));
  insert into public.reward_transactions (student_id, kind, ref, xp, coins, session_id)
  values (p_student, 'community_mission', p_mission::text, v_xp, v_coins, p_session)
  on conflict (student_id, kind, ref) do nothing returning id into v_tx;
  if v_tx is null then return none; end if;
  return jsonb_build_object('xp', v_xp, 'coins', v_coins, 'granted', v_xp > 0 or v_coins > 0, 'capped', v_xp < s.mission_xp or v_coins < s.mission_coins);
end $$;

-- record_answer: official questions behave exactly as before; community questions use the capped ledger.
select pg_temp.patch_fn('public.record_answer(uuid,uuid,public.session_questions,boolean,character,text,text)',
  $a$  if v_result in ('first', 'assisted') then
    select * into v_rule from public.reward_rules where key = case when v_result = 'first' then 'first_try' else 'assisted' end;$a$,
  $b$  if v_result in ('first', 'assisted') and exists (select 1 from public.subjects where id = v_q.subject_id and kind = 'community') then
    v_reward := public.community_award_question(p_student, v_q, v_result, p_session);
  elsif v_result in ('first', 'assisted') then
    select * into v_rule from public.reward_rules where key = case when v_result = 'first' then 'first_try' else 'assisted' end;$b$);

-- complete_quiz_session: community sessions sum the community ledger and use the capped mission bonus.
create or replace function public.complete_quiz_session(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_s public.quiz_sessions%rowtype;
  v_total int; v_first int; v_assisted int; v_missed int; v_hints int; v_open int;
  v_acc int;
  v_pass int;
  v_rule public.reward_rules%rowtype;
  v_bonus boolean := false;
  v_bonus_xp int := 0; v_bonus_coins int := 0;
  v_bonus_earlier boolean;
  v_tx bigint;
  v_summary jsonb;
  v_q_xp int; v_q_coins int; v_already int;
  v_before_xp int; v_before_coins int;
  v_after record;
  v_subject uuid;
  v_comm boolean;
  v_cr jsonb;
  v_cs public.community_settings%rowtype;
  v_used record;
begin
  select * into v_s from public.quiz_sessions where id = p_session and student_id = v_student for update;
  if not found then raise exception 'session not found' using errcode = 'P0002'; end if;
  if v_s.status = 'completed' then
    return v_s.summary || jsonb_build_object('repeat', true); -- idempotent: no new rewards
  end if;
  if v_s.status <> 'active' then raise exception 'session not active' using errcode = 'P0002'; end if;
  select subject_id into v_subject from public.lessons where id = v_s.lesson_id;
  v_comm := exists (select 1 from public.subjects where id = v_subject and kind = 'community');

  select count(*), count(*) filter (where result = 'first'), count(*) filter (where result = 'assisted'),
         count(*) filter (where result = 'missed'), count(*) filter (where hint_used), count(*) filter (where result is null)
    into v_total, v_first, v_assisted, v_missed, v_hints, v_open
  from public.session_questions where session_id = p_session;
  if v_open > 0 then raise exception 'mission not finished' using errcode = 'P0001'; end if;

  v_acc := case when v_total > 0 then round(v_first * 100.0 / v_total) else 0 end;
  select pass_accuracy into v_pass from public.game_settings;
  v_bonus_earlier := exists (select 1 from public.reward_transactions
                              where student_id = v_student and kind in ('mission', 'community_mission') and ref = v_s.mission_id::text);

  select coalesce(sum(xp), 0), coalesce(sum(coins), 0) into v_q_xp, v_q_coins
  from public.reward_transactions where session_id = p_session and kind in ('question', 'community_question');
  select v.xp, v.coins into v_before_xp, v_before_coins from public.wallet_totals(v_student) v;
  v_before_xp := v_before_xp - v_q_xp;
  v_before_coins := v_before_coins - v_q_coins;
  select count(*) into v_already from public.session_questions sq
   where sq.session_id = p_session and sq.result in ('first', 'assisted')
     and not exists (select 1 from public.reward_transactions t where t.session_id = p_session and t.kind in ('question', 'community_question')
                       and (t.ref = sq.question_id::text or t.ref like '%:' || sq.question_id::text));

  if v_acc >= v_pass then
    if v_comm then
      v_cr := public.community_award_mission(v_student, v_s.mission_id, v_subject, p_session);
      v_bonus := coalesce((v_cr ->> 'granted')::boolean, false);
      v_bonus_xp := (v_cr ->> 'xp')::int; v_bonus_coins := (v_cr ->> 'coins')::int;
    else
      select * into v_rule from public.reward_rules where key = 'mission_pass';
      insert into public.reward_transactions (student_id, kind, ref, xp, coins, session_id)
      values (v_student, 'mission', v_s.mission_id::text, v_rule.xp, v_rule.coins, p_session)
      on conflict (student_id, kind, ref) do nothing returning id into v_tx;
      v_bonus := v_tx is not null;
      v_bonus_xp := case when v_bonus then v_rule.xp else 0 end;
      v_bonus_coins := case when v_bonus then v_rule.coins else 0 end;
    end if;
  end if;

  select * into v_after from public.wallet_totals(v_student);
  v_summary := jsonb_build_object(
    'total', v_total, 'first_try', v_first, 'assisted', v_assisted, 'missed', v_missed, 'hints_used', v_hints,
    'first_try_accuracy', v_acc,
    'reward', jsonb_build_object(
      'xp', v_q_xp + v_bonus_xp,
      'coins', v_q_coins + v_bonus_coins,
      'bonus', v_bonus, 'bonus_earlier', v_bonus_earlier, 'already_rewarded', v_already,
      'before', jsonb_build_object('xp', v_before_xp, 'coins', v_before_coins),
      'after', jsonb_build_object('xp', v_after.xp, 'coins', v_after.coins)));
  if v_comm then
    select * into v_cs from public.community_settings;
    select * into v_used from public.community_used_today(v_student);
    v_summary := v_summary || jsonb_build_object('community', true,
      'daily_limit_reached', v_used.xp >= v_cs.daily_xp_cap and v_used.coins >= v_cs.daily_coin_cap);
  end if;
  update public.quiz_sessions set status = 'completed', completed_at = now(), summary = v_summary where id = p_session;
  return v_summary;
end $$;

-- Parents see community XP/coins in their child's report (leaderboards deliberately do not count community XP).
select pg_temp.patch_fn('public.parent_child_report(uuid,integer)',
  $a$t.kind in ('question', 'mission') and t.created_at >= v_since$a$,
  $b$t.kind in ('question', 'mission', 'community_question', 'community_mission') and t.created_at >= v_since$b$);

-- Admin dashboard: official counts only (community has its own section).
select pg_temp.patch_fn('public.admin_dashboard()', $a$from public.subjects where status <> 'archived'$a$, $b$from public.subjects where status <> 'archived' and kind = 'official'$b$);
select pg_temp.patch_fn('public.admin_dashboard()', $a$from public.subjects where status = 'published'$a$, $b$from public.subjects where status = 'published' and kind = 'official'$b$);

-- ---------------------------------------------------------------------------
-- 8. Multiplayer: community questions only from PUBLIC courses the host plays, never rewarded
-- ---------------------------------------------------------------------------
create or replace function public.mp_question_pool(p_room uuid) returns table (id uuid)
language sql stable security definer set search_path = public as $$
  select q.id from public.questions q join public.mp_rooms r on r.id = p_room
  join public.lessons l on l.id = q.lesson_id and l.status = 'published'
  join public.subjects s on s.id = q.subject_id and s.status = 'published' and s.moderation = 'ok'
  where q.status = 'published' and not q.needs_academic_review
    and not exists (select 1 from public.academic_flags f where f.question_id = q.id and f.status = 'open')
    and (case when s.kind = 'official' then cardinality(r.subjects) = 0 or q.subject_id = any (r.subjects)
              else q.subject_id = any (r.subjects) and s.visibility = 'public' and public.community_can_play(r.host_id, s.id) end)
    and (cardinality(r.lessons) = 0 or q.lesson_id = any (r.lessons))
$$;

create or replace function public.mp_match_has_community(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mp_match_questions mq join public.questions q on q.id = mq.question_id
                 join public.subjects s on s.id = q.subject_id where mq.match_id = p_match and s.kind = 'community')
$$;

select pg_temp.patch_fn('public.mp_finish(uuid)',
  'if v_active >= 2 and r.answered >= 3 then',
  'if v_active >= 2 and r.answered >= 3 and not public.mp_match_has_community(p_match) then');

-- ---------------------------------------------------------------------------
-- 9. Grants: internals are not callable through the API
-- ---------------------------------------------------------------------------
do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as sig, p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.oid not in (select oid from _pre_fn) loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
  end loop;
end $$;
grant execute on function public.get_my_course_catalog() to authenticated;

drop table _pre_fn;

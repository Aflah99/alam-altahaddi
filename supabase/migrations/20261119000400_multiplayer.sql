-- ============================================================================
-- Feature 5: غرف التحدّي — private real-time multiplayer rooms with eight modes.
--
-- Everything is server-authoritative. Clients send only intentions (join, ready,
-- start, an answer key or text, a chest or territory choice). The database owns
-- membership, question order, timers (server clock), scores, territory, eliminations
-- and results. A match advances in mp_tick(), which every state read or answer runs;
-- it only acts on what the server clock says is due, under a row lock, so any number
-- of clients can call it without changing the outcome.
--
-- Clients learn about changes through Supabase Realtime (mp_rooms.version) and fall
-- back to polling mp_state(). No free text is ever exchanged between players.
-- ============================================================================

-- Test-only clock offset (empty in production; only the database owner can write it).
create table public.mp_clock (id boolean primary key default true check (id), offset_ms bigint not null default 0);
alter table public.mp_clock enable row level security;
revoke all on public.mp_clock from anon, authenticated;
create or replace function public.mp_now() returns timestamptz language sql stable set search_path = public as $$
  select now() + make_interval(secs => coalesce((select offset_ms from public.mp_clock), 0) / 1000.0)
$$;

create table public.mp_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  host_id uuid not null references public.student_profiles (id) on delete cascade,
  mode text not null check (mode in ('conquest', 'speed', 'teams', 'survival', 'treasure', 'boss', 'tournament', 'duel')),
  subjects uuid[] not null default '{}',
  lessons uuid[] not null default '{}',
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'closed')),
  code_expires_at timestamptz not null,
  code_revoked boolean not null default false,
  current_match uuid,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now()
);
create index mp_rooms_activity_idx on public.mp_rooms (status, last_activity);

create table public.mp_members (
  room_id uuid not null references public.mp_rooms (id) on delete cascade,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  ready boolean not null default false,
  left_at timestamptz,
  primary key (room_id, student_id)
);
create index mp_members_student_idx on public.mp_members (student_id, left_at);

create table public.mp_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.mp_rooms (id) on delete cascade,
  mode text not null,
  status text not null default 'countdown' check (status in ('countdown', 'playing', 'finished')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  round_no int not null default 0,
  state jsonb not null default '{}',
  result jsonb,
  question_count int not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index mp_matches_room_idx on public.mp_matches (room_id, created_at desc);

create table public.mp_players (
  match_id uuid not null references public.mp_matches (id) on delete cascade,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  team smallint,
  score int not null default 0,
  correct int not null default 0,
  answered int not null default 0,
  streak int not null default 0,
  hearts smallint not null default 3,
  alive boolean not null default true,
  q_order int[] not null default '{}',
  q_ptr int not null default 0,
  target int,
  total_ms bigint not null default 0,
  last_correct_at timestamptz,
  seed int not null default 0,
  primary key (match_id, student_id)
);

create table public.mp_match_questions (
  match_id uuid not null references public.mp_matches (id) on delete cascade,
  idx int not null,
  question_id uuid not null references public.questions (id),
  primary key (match_id, idx)
);

create table public.mp_rounds (
  match_id uuid not null references public.mp_matches (id) on delete cascade,
  round_no int not null,
  question_idx int not null,
  participants uuid[] not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  resolved boolean not null default false,
  meta jsonb not null default '{}',
  primary key (match_id, round_no)
);

-- One row per question served to a player: personal option order and the server time it was shown.
create table public.mp_serves (
  match_id uuid not null references public.mp_matches (id) on delete cascade,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  question_idx int not null,
  round_no int not null default 0,
  option_order text,
  served_at timestamptz not null,
  unsure smallint not null default 0,
  primary key (match_id, student_id, question_idx, round_no)
);

create table public.mp_answers (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.mp_matches (id) on delete cascade,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  question_idx int not null,
  round_no int not null default 0,
  answer text not null check (char_length(answer) <= 200),
  correct boolean not null,
  ms int not null,
  created_at timestamptz not null default now(),
  unique (match_id, student_id, question_idx, round_no)
);
create index mp_answers_match_idx on public.mp_answers (match_id, round_no);

create table public.mp_reactions (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.mp_rooms (id) on delete cascade,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now()
);
create index mp_reactions_room_idx on public.mp_reactions (room_id, created_at desc);

create table public.mp_join_attempts (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index mp_join_attempts_idx on public.mp_join_attempts (student_id, created_at desc);

-- RLS: members read their own room's data; nobody writes directly (functions only).
create or replace function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mp_members where room_id = p_room and student_id = auth.uid() and left_at is null)
$$;
do $$
declare t text;
begin
  foreach t in array array['mp_rooms', 'mp_members', 'mp_matches', 'mp_players', 'mp_match_questions', 'mp_rounds', 'mp_serves', 'mp_answers', 'mp_reactions', 'mp_join_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $$;
grant select on public.mp_rooms to authenticated;
-- Only the room row is readable (for Realtime change notifications); everything else goes through mp_state().
create policy mp_rooms_member_read on public.mp_rooms for select to authenticated using (public.is_room_member(id) or public.is_admin());
create policy mp_admin_read_members on public.mp_members for select to authenticated using (public.is_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.mp_rooms';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Modes and limits
-- ---------------------------------------------------------------------------
create or replace function public.mp_mode_limits(p_mode text, out min_players int, out max_players int)
language sql immutable as $$
  select (case p_mode when 'teams' then 4 when 'tournament' then 4 else 2 end),
         (case p_mode when 'conquest' then 6 when 'duel' then 2 when 'treasure' then 30 when 'boss' then 20 when 'tournament' then 32 else 50 end)
$$;

create or replace function public.mp_bump(p_room uuid) returns void language sql security definer set search_path = public as $$
  update public.mp_rooms set version = version + 1, last_activity = now() where id = p_room
$$;

create or replace function public.mp_new_code() returns text language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  c text;
  i int;
begin
  loop
    b := extensions.gen_random_bytes(8);
    c := '';
    for i in 0 .. 7 loop c := c || substr(alphabet, (get_byte(b, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.mp_rooms where code = c);
  end loop;
  return c;
end $$;

create or replace function public.mp_require_allowed(p_student uuid) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.controls_of(p_student)).multiplayer_allowed then
    raise exception 'multiplayer disabled by parent' using errcode = '42501';
  end if;
end $$;

/** Questions a room may use: published, from its subjects/lessons, never ones under academic review. */
create or replace function public.mp_question_pool(p_room uuid) returns table (id uuid)
language sql stable security definer set search_path = public as $$
  select q.id from public.questions q join public.mp_rooms r on r.id = p_room
  join public.lessons l on l.id = q.lesson_id and l.status = 'published'
  join public.subjects s on s.id = q.subject_id and s.status = 'published'
  where q.status = 'published' and not q.needs_academic_review
    and not exists (select 1 from public.academic_flags f where f.question_id = q.id and f.status = 'open')
    and (cardinality(r.subjects) = 0 or q.subject_id = any (r.subjects))
    and (cardinality(r.lessons) = 0 or q.lesson_id = any (r.lessons))
$$;

alter table public.mp_rooms add column settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 512);

/** Validated room settings: duration (seconds) for timed modes. */
create or replace function public.mp_clean_settings(p jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('duration', least(600, greatest(60, coalesce((p ->> 'duration')::int, 150))))
$$;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------
create or replace function public.mp_create_room(p_mode text, p_subjects uuid[], p_lessons uuid[], p_settings jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_room uuid;
  v_code text;
begin
  perform public.mp_require_allowed(v_student);
  if p_mode not in ('conquest', 'speed', 'teams', 'survival', 'treasure', 'boss', 'tournament', 'duel') then raise exception 'invalid mode' using errcode = '22023'; end if;
  if (select count(*) from public.mp_rooms where host_id = v_student and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  -- Housekeeping: close abandoned rooms and leave any other room this student is in.
  update public.mp_rooms set status = 'closed', code_revoked = true where status <> 'closed' and last_activity < now() - interval '2 hours';
  update public.mp_members m set left_at = now() where m.student_id = v_student and m.left_at is null;
  v_code := public.mp_new_code();
  insert into public.mp_rooms (code, host_id, mode, subjects, lessons, settings, code_expires_at)
  values (v_code, v_student, p_mode, coalesce(p_subjects, '{}'), coalesce(p_lessons, '{}'), public.mp_clean_settings(coalesce(p_settings, '{}')), now() + interval '3 hours')
  returning id into v_room;
  if not exists (select 1 from public.mp_question_pool(v_room)) then raise exception 'no questions for this selection' using errcode = 'P0002'; end if;
  insert into public.mp_members (room_id, student_id, ready) values (v_room, v_student, true);
  return jsonb_build_object('room_id', v_room, 'code', v_code);
end $$;

/** Join with an invite code. Rate-limited; codes expire, can be revoked, and are never listed anywhere. */
create or replace function public.mp_join(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_room public.mp_rooms%rowtype;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_count int;
  v_max int;
begin
  perform public.mp_require_allowed(v_student);
  if (select count(*) from public.mp_join_attempts where student_id = v_student and not ok and created_at > now() - interval '10 minutes') >= 8 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select * into v_room from public.mp_rooms where code = v_code for update;
  if not found or v_room.code_revoked or v_room.status = 'closed' or v_room.code_expires_at < now() then
    insert into public.mp_join_attempts (student_id, ok) values (v_student, false);
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.mp_join_attempts (student_id, ok) values (v_student, true);
  -- Reconnecting to a room you are in (also during a match).
  if exists (select 1 from public.mp_members where room_id = v_room.id and student_id = v_student and left_at is null) then
    update public.mp_members set last_seen = now() where room_id = v_room.id and student_id = v_student;
    return jsonb_build_object('status', 'joined', 'room_id', v_room.id);
  end if;
  if v_room.status <> 'lobby' then return jsonb_build_object('status', 'in_progress'); end if;
  select max_players into v_max from public.mp_mode_limits(v_room.mode);
  select count(*) into v_count from public.mp_members where room_id = v_room.id and left_at is null;
  if v_count >= v_max then return jsonb_build_object('status', 'full'); end if;
  update public.mp_members m set left_at = now() where m.student_id = v_student and m.left_at is null;
  insert into public.mp_members (room_id, student_id) values (v_room.id, v_student)
    on conflict (room_id, student_id) do update set left_at = null, ready = false, joined_at = now(), last_seen = now();
  perform public.mp_bump(v_room.id);
  return jsonb_build_object('status', 'joined', 'room_id', v_room.id);
end $$;

/** Moves the host role to the longest-present active member (or closes an empty room). */
create or replace function public.mp_migrate_host(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_next uuid;
begin
  select student_id into v_next from public.mp_members
   where room_id = p_room and left_at is null and last_seen > now() - interval '45 seconds'
   order by joined_at, student_id limit 1;
  if v_next is null then
    select student_id into v_next from public.mp_members where room_id = p_room and left_at is null order by joined_at limit 1;
  end if;
  if v_next is null then
    update public.mp_rooms set status = 'closed', code_revoked = true where id = p_room;
  else
    update public.mp_rooms set host_id = v_next where id = p_room;
  end if;
  perform public.mp_bump(p_room);
end $$;

create or replace function public.mp_leave(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.require_student();
begin
  update public.mp_members set left_at = now(), ready = false where room_id = p_room and student_id = v_student and left_at is null;
  if not found then return; end if;
  if (select host_id from public.mp_rooms where id = p_room) = v_student then perform public.mp_migrate_host(p_room); end if;
  perform public.mp_bump(p_room);
end $$;

create or replace function public.mp_require_member(p_room uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.require_student();
begin
  if not exists (select 1 from public.mp_members where room_id = p_room and student_id = v_student and left_at is null) then
    raise exception 'not in this room' using errcode = '42501';
  end if;
  return v_student;
end $$;

create or replace function public.mp_require_host(p_room uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.mp_require_member(p_room);
begin
  if (select host_id from public.mp_rooms where id = p_room) <> v_student then raise exception 'host only' using errcode = '42501'; end if;
  return v_student;
end $$;

create or replace function public.mp_set_ready(p_room uuid, p_ready boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.mp_require_member(p_room);
begin
  update public.mp_members set ready = coalesce(p_ready, false), last_seen = now() where room_id = p_room and student_id = v_student;
  perform public.mp_bump(p_room);
end $$;

create or replace function public.mp_update_room(p_room uuid, p_mode text, p_subjects uuid[], p_lessons uuid[], p_settings jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.mp_require_host(p_room);
begin
  if p_mode not in ('conquest', 'speed', 'teams', 'survival', 'treasure', 'boss', 'tournament', 'duel') then raise exception 'invalid mode' using errcode = '22023'; end if;
  if (select status from public.mp_rooms where id = p_room) <> 'lobby' then raise exception 'match in progress' using errcode = 'P0003'; end if;
  update public.mp_rooms set mode = p_mode, subjects = coalesce(p_subjects, '{}'), lessons = coalesce(p_lessons, '{}'),
    settings = public.mp_clean_settings(coalesce(p_settings, '{}')) where id = p_room;
  if not exists (select 1 from public.mp_question_pool(p_room)) then raise exception 'no questions for this selection' using errcode = 'P0002'; end if;
  -- Changing the game asks everyone to confirm again.
  update public.mp_members set ready = (student_id = v_student) where room_id = p_room;
  perform public.mp_bump(p_room);
end $$;

/** Revokes the current invite code and issues a new one. */
create or replace function public.mp_new_invite(p_room uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  perform public.mp_require_host(p_room);
  v_code := public.mp_new_code();
  update public.mp_rooms set code = v_code, code_revoked = false, code_expires_at = now() + interval '3 hours' where id = p_room;
  perform public.mp_bump(p_room);
  return v_code;
end $$;

create or replace function public.mp_close_invite(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.mp_require_host(p_room);
  update public.mp_rooms set code_revoked = true where id = p_room;
  perform public.mp_bump(p_room);
end $$;

/** Preset reactions only: no free text between children. */
create or replace function public.mp_react(p_room uuid, p_reaction text) returns void
language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.mp_require_member(p_room);
begin
  if not (public.controls_of(v_student)).reactions_allowed then raise exception 'reactions disabled by parent' using errcode = '42501'; end if;
  if p_reaction not in ('hello', 'good_luck', 'well_done', 'great_game', 'thanks', 'ready', 'wow', 'oops',
                        'e_smile', 'e_star', 'e_clap', 'e_fire', 'e_think', 'e_heart', 'e_trophy', 'e_wave') then
    raise exception 'invalid reaction' using errcode = '22023';
  end if;
  if exists (select 1 from public.mp_reactions where student_id = v_student and created_at > now() - interval '3 seconds') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.mp_reactions (room_id, student_id, reaction) values (p_room, v_student, p_reaction);
  delete from public.mp_reactions where room_id = p_room and created_at < now() - interval '10 minutes';
  perform public.mp_bump(p_room);
end $$;

/** After results: everyone returns to the room for a rematch or a new game. */
create or replace function public.mp_back_to_lobby(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.mp_require_member(p_room);
begin
  if (select status from public.mp_rooms where id = p_room) <> 'finished' then return; end if;
  update public.mp_rooms set status = 'lobby', current_match = null where id = p_room;
  update public.mp_members set ready = (student_id = (select host_id from public.mp_rooms where id = p_room)) where room_id = p_room;
  perform public.mp_bump(p_room);
end $$;

-- ---------------------------------------------------------------------------
-- Match engine
-- ---------------------------------------------------------------------------
create or replace function public.mp_is_stream(p_mode text) returns boolean language sql immutable as $$
  select p_mode in ('speed', 'teams', 'boss', 'treasure')
$$;

/** Fictional fantasy map: 12 territories on a 4×3 grid, neighbours share an edge. */
create or replace function public.mp_adjacent(a int, b int) returns boolean language sql immutable as $$
  select a between 0 and 11 and b between 0 and 11 and (
    (a / 4 = b / 4 and abs(a - b) = 1) or abs(a - b) = 4)
$$;

create or replace function public.mp_start(p_room uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_host uuid := public.mp_require_host(p_room);
  v_room public.mp_rooms%rowtype;
  v_members uuid[];
  v_n int;
  v_min int; v_max int;
  v_pool uuid[];
  v_need int;
  v_qc int;
  v_match uuid;
  v_state jsonb := '{}';
  v_teams int;
  v_shuffled uuid[];
  i int;
begin
  select * into v_room from public.mp_rooms where id = p_room for update;
  if v_room.status <> 'lobby' then raise exception 'match in progress' using errcode = 'P0003'; end if;
  -- Players who disconnected from the lobby are not dealt in.
  update public.mp_members set left_at = now() where room_id = p_room and left_at is null and last_seen < now() - interval '45 seconds' and student_id <> v_host;
  select array_agg(student_id order by joined_at) into v_members from public.mp_members where room_id = p_room and left_at is null;
  v_n := coalesce(array_length(v_members, 1), 0);
  select min_players, max_players into v_min, v_max from public.mp_mode_limits(v_room.mode);
  if v_n < v_min then raise exception 'not enough players' using errcode = 'P0001', detail = v_min::text; end if;
  if v_n > v_max then raise exception 'too many players' using errcode = 'P0001', detail = v_max::text; end if;
  if exists (select 1 from public.mp_members where room_id = p_room and left_at is null and not ready and student_id <> v_host) then
    raise exception 'players not ready' using errcode = 'P0001';
  end if;
  v_need := case v_room.mode when 'duel' then 9 when 'survival' then 24 when 'tournament' then 36 when 'conquest' then 40 else 100 end;
  select array_agg(id) into v_pool from (select id from public.mp_question_pool(p_room) order by public.secure_random() limit v_need) x;
  v_qc := coalesce(array_length(v_pool, 1), 0);
  if v_qc = 0 then raise exception 'no questions for this selection' using errcode = 'P0002'; end if;

  insert into public.mp_matches (room_id, mode, starts_at, question_count) values (p_room, v_room.mode, public.mp_now() + interval '5 seconds', v_qc)
    returning id into v_match;
  insert into public.mp_match_questions (match_id, idx, question_id) select v_match, g - 1, v_pool[g] from generate_series(1, v_qc) g;
  select array_agg(m order by public.secure_random()) into v_shuffled from unnest(v_members) m;
  -- Every player gets a personal question order, so nobody can learn another player's next question.
  insert into public.mp_players (match_id, student_id, seed, q_order)
  select v_match, v_shuffled[k], k,
         -- (correlated with k so that Postgres draws a new order for every player)
         array(select g from generate_series(0, v_qc - 1) g where k > 0 order by public.secure_random())
  from generate_series(1, v_n) k;

  if v_room.mode = 'teams' then
    -- Balanced teams: snake draft by verified XP.
    v_teams := least(4, greatest(2, v_n / 5));
    with ranked as (
      select p.student_id, row_number() over (order by (select coalesce(sum(xp), 0) from public.reward_transactions t where t.student_id = p.student_id) desc, p.seed) - 1 as r
      from public.mp_players p where p.match_id = v_match)
    update public.mp_players p set team = case when (r / v_teams) % 2 = 0 then r % v_teams else v_teams - 1 - (r % v_teams) end
    from ranked where ranked.student_id = p.student_id and p.match_id = v_match;
    v_state := jsonb_build_object('teams', v_teams);
  elsif v_room.mode = 'boss' then
    v_state := jsonb_build_object('hp', 60 * v_n, 'max_hp', 60 * v_n);
  elsif v_room.mode = 'treasure' then
    v_state := jsonb_build_object('chests', (select jsonb_agg(jsonb_build_object('v', (array[10, 20, 30])[(g % 3) + 1], 'o', null) order by g)
                                            from generate_series(0, least(36, v_n * 2 + 6) - 1) g));
  elsif v_room.mode = 'conquest' then
    v_state := jsonb_build_object(
      'owners', (select jsonb_agg(to_jsonb(v_shuffled[(g % v_n) + 1]) order by g) from generate_series(0, 11) g),
      'turn_order', to_jsonb(v_shuffled), 'turn', 0, 'turns', 0, 'phase', 'waiting', 'attack', null, 'log', '[]'::jsonb);
  elsif v_room.mode = 'tournament' then
    v_state := jsonb_build_object('stage', 0, 'stage_rounds', 3, 'pairs', '[]'::jsonb, 'out', '{}'::jsonb, 'history', '[]'::jsonb);
  end if;
  update public.mp_matches set state = v_state where id = v_match;
  update public.mp_rooms set status = 'playing', current_match = v_match, last_activity = now() where id = p_room;
  perform public.mp_bump(p_room);
  return v_match;
end $$;

create or replace function public.mp_new_round(p_match uuid, p_participants uuid[], p_seconds int, p_delay_ms int default 2500) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_round int;
  v_qc int;
  v_start timestamptz := public.mp_now() + make_interval(secs => p_delay_ms / 1000.0);
begin
  update public.mp_matches set round_no = round_no + 1 where id = p_match returning round_no, question_count into v_round, v_qc;
  insert into public.mp_rounds (match_id, round_no, question_idx, participants, starts_at, ends_at)
  values (p_match, v_round, (v_round - 1) % v_qc, p_participants, v_start, v_start + make_interval(secs => p_seconds));
  return v_round;
end $$;

/** Tournament stage: pair the players still in (random seeds were drawn at the start); an odd player gets a bye. */
create or replace function public.mp_tournament_stage(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_alive uuid[];
  v_pairs jsonb := '[]';
  v_play uuid[] := '{}';
  i int;
begin
  select array_agg(student_id order by seed) into v_alive from public.mp_players where match_id = p_match and alive;
  i := 1;
  while i <= coalesce(array_length(v_alive, 1), 0) loop
    if i + 1 <= array_length(v_alive, 1) then
      v_pairs := v_pairs || jsonb_build_array(jsonb_build_array(v_alive[i], v_alive[i + 1]));
      v_play := v_play || v_alive[i] || v_alive[i + 1];
    else
      v_pairs := v_pairs || jsonb_build_array(jsonb_build_array(v_alive[i], null)); -- bye
    end if;
    i := i + 2;
  end loop;
  update public.mp_matches set state = state || jsonb_build_object('stage', (state ->> 'stage')::int + 1, 'pairs', v_pairs,
    'stage_first_round', round_no + 1, 'stage_round', 1) where id = p_match;
  perform public.mp_new_round(p_match, v_play, 15, 3000);
end $$;

create or replace function public.mp_conquest_next_turn(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  v_order jsonb;
  v_n int;
  v_turn int;
  v_try int := 0;
  v_owner text;
begin
  select state into s from public.mp_matches where id = p_match;
  v_order := s -> 'turn_order';
  v_n := jsonb_array_length(v_order);
  v_turn := (s ->> 'turn')::int;
  -- Next player who still owns land.
  loop
    v_turn := (v_turn + 1) % v_n;
    v_try := v_try + 1;
    v_owner := v_order ->> v_turn;
    exit when exists (select 1 from jsonb_array_elements_text(s -> 'owners') o where o = v_owner) or v_try > v_n;
  end loop;
  update public.mp_matches set state = state || jsonb_build_object('turn', v_turn, 'turns', (s ->> 'turns')::int + 1, 'phase', 'choose',
    'attack', null, 'deadline', public.mp_now() + interval '20 seconds') where id = p_match;
end $$;

/** Ranking, winners, modest rewards with a daily cap, then the room shows results. */
create or replace function public.mp_finish(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.mp_matches%rowtype;
  v_ranking jsonb;
  v_winners uuid[];
  v_team_scores jsonb := null;
  v_active int;
  r record;
  v_xp int; v_coins int; v_capped boolean;
  v_extra jsonb := '{}';
begin
  select * into m from public.mp_matches where id = p_match;
  if m.status = 'finished' then return; end if;

  if m.mode = 'conquest' then
    update public.mp_players p set score = (select count(*) from jsonb_array_elements_text(m.state -> 'owners') o where o = p.student_id::text) where p.match_id = p_match;
  end if;

  select jsonb_agg(x order by (x ->> 'rank')::int) into v_ranking from (
    select jsonb_build_object('student', p.student_id, 'score', p.score, 'correct', p.correct, 'answered', p.answered,
             'hearts', p.hearts, 'alive', p.alive, 'team', p.team, 'ms', p.total_ms,
             'rank', rank() over (order by
                case when m.mode = 'tournament' then coalesce((m.state -> 'out' ->> p.student_id::text)::int, 99) end desc nulls last,
                case when m.mode = 'survival' then p.alive::int end desc nulls last,
                case when m.mode = 'survival' then p.hearts end desc nulls last,
                p.score desc,
                p.correct desc,
                case when p.answered > 0 then p.correct::numeric / p.answered end desc nulls last,
                p.total_ms asc)) as x
    from public.mp_players p where p.match_id = p_match) t;

  if m.mode = 'teams' then
    select jsonb_object_agg(team, s) into v_team_scores
      from (select team::text as team, sum(score) as s from public.mp_players where match_id = p_match group by team) t;
    select array_agg(p.student_id) into v_winners from public.mp_players p
     where p.match_id = p_match and p.team = (
       select team from public.mp_players where match_id = p_match group by team
       order by sum(score) desc, sum(correct)::numeric / greatest(sum(answered), 1) desc, sum(total_ms) asc limit 1);
    v_extra := jsonb_build_object('team_scores', v_team_scores);
  elsif m.mode = 'boss' then
    if (m.state ->> 'hp')::int <= 0 then
      select array_agg(student_id) into v_winners from public.mp_players where match_id = p_match and answered > 0;
    end if;
    v_extra := jsonb_build_object('boss_defeated', (m.state ->> 'hp')::int <= 0);
  elsif m.mode = 'duel' and (select count(distinct (score, total_ms)) from public.mp_players where match_id = p_match) = 1 then
    v_winners := '{}'; -- exact tie: a draw
  else
    select array_agg((x ->> 'student')::uuid) into v_winners from jsonb_array_elements(v_ranking) x where (x ->> 'rank')::int = 1;
  end if;

  -- Rewards: only real participation counts, and private matches cannot be farmed.
  select count(*) into v_active from public.mp_players where match_id = p_match and answered > 0;
  for r in select * from public.mp_players where match_id = p_match loop
    v_xp := 0; v_coins := 0; v_capped := false;
    if v_active >= 2 and r.answered >= 3 then
      if (select count(*) from public.reward_transactions where student_id = r.student_id and kind = 'multiplayer'
          and created_at >= date_trunc('day', now())) >= 5 then
        v_capped := true;
      else
        v_xp := least(r.correct * 2, 20) + case when r.student_id = any (coalesce(v_winners, '{}')) then 5 else 0 end;
        v_coins := least(r.correct, 10) + case when r.student_id = any (coalesce(v_winners, '{}')) then 5 else 0 end;
        if v_xp > 0 or v_coins > 0 then
          insert into public.reward_transactions (student_id, kind, ref, xp, coins) values (r.student_id, 'multiplayer', p_match::text, v_xp, v_coins)
          on conflict (student_id, kind, ref) do nothing;
        end if;
      end if;
    end if;
    v_ranking := (select jsonb_agg(case when (x ->> 'student')::uuid = r.student_id
                    then x || jsonb_build_object('xp', v_xp, 'coins', v_coins, 'capped', v_capped) else x end order by (x ->> 'rank')::int)
                  from jsonb_array_elements(v_ranking) x);
  end loop;

  update public.mp_matches set status = 'finished', finished_at = public.mp_now(),
    result = jsonb_build_object('ranking', v_ranking, 'winners', to_jsonb(coalesce(v_winners, '{}'))) || v_extra
  where id = p_match;
  update public.mp_rooms set status = 'finished' where id = m.room_id and current_match = p_match;
  perform public.mp_bump(m.room_id);
end $$;

/** Resolves a finished round of survival, duel or tournament. */
create or replace function public.mp_resolve_round(p_match uuid, p_round int) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.mp_matches%rowtype;
  rd public.mp_rounds%rowtype;
  v_ok uuid[];
  v_failed uuid[];
  v_alive int;
  pr jsonb;
  a uuid; b uuid;
  sa record; sb record;
  v_win uuid;
  v_winners uuid[] := '{}';
  v_out jsonb;
  v_def uuid;
  v_att uuid;
  v_capture boolean;
  s jsonb;
begin
  select * into m from public.mp_matches where id = p_match;
  select * into rd from public.mp_rounds where match_id = p_match and round_no = p_round for update;
  if rd.resolved then return; end if;
  select coalesce(array_agg(student_id), '{}') into v_ok from public.mp_answers where match_id = p_match and round_no = p_round and correct;
  v_failed := array(select x from unnest(rd.participants) x where not (x = any (v_ok)));
  update public.mp_rounds set resolved = true, meta = jsonb_build_object('correct', to_jsonb(v_ok), 'failed', to_jsonb(v_failed)) where match_id = p_match and round_no = p_round;

  if m.mode = 'survival' then
    -- If every remaining player misses the same question, nobody loses a heart.
    if cardinality(v_ok) > 0 then
      update public.mp_players set hearts = hearts - 1, alive = hearts - 1 > 0 where match_id = p_match and student_id = any (v_failed);
    end if;
    select count(*) into v_alive from public.mp_players where match_id = p_match and alive;
    if v_alive <= 1 or p_round >= 15 then perform public.mp_finish(p_match); return; end if;
    perform public.mp_new_round(p_match, array(select student_id from public.mp_players where match_id = p_match and alive), 20);

  elsif m.mode = 'duel' then
    if p_round >= 7 then perform public.mp_finish(p_match); return; end if;
    perform public.mp_new_round(p_match, rd.participants, 15);

  elsif m.mode = 'tournament' then
    if (m.state ->> 'stage_round')::int < (m.state ->> 'stage_rounds')::int then
      update public.mp_matches set state = state || jsonb_build_object('stage_round', (state ->> 'stage_round')::int + 1) where id = p_match;
      perform public.mp_new_round(p_match, rd.participants, 15);
      return;
    end if;
    -- Stage over: winner of each pair = more correct this stage, then faster total, then seed.
    v_out := m.state -> 'out';
    for pr in select * from jsonb_array_elements(m.state -> 'pairs') loop
      a := (pr ->> 0)::uuid; b := nullif(pr ->> 1, '')::uuid;
      if b is null then v_winners := v_winners || a; continue; end if;
      select count(*) filter (where x.correct) c, coalesce(sum(x.ms) filter (where x.correct), 0) t, max(p.seed) seed into sa
        from public.mp_players p left join public.mp_answers x on x.match_id = p.match_id and x.student_id = p.student_id and x.round_no >= (m.state ->> 'stage_first_round')::int
        where p.match_id = p_match and p.student_id = a;
      select count(*) filter (where x.correct) c, coalesce(sum(x.ms) filter (where x.correct), 0) t, max(p.seed) seed into sb
        from public.mp_players p left join public.mp_answers x on x.match_id = p.match_id and x.student_id = p.student_id and x.round_no >= (m.state ->> 'stage_first_round')::int
        where p.match_id = p_match and p.student_id = b;
      v_win := case when sa.c <> sb.c then case when sa.c > sb.c then a else b end
                    when sa.t <> sb.t then case when sa.t < sb.t then a else b end
                    when sa.seed < sb.seed then a else b end;
      v_winners := v_winners || v_win;
      update public.mp_players set alive = false where match_id = p_match and student_id = case when v_win = a then b else a end;
      v_out := v_out || jsonb_build_object(case when v_win = a then b else a end, (m.state ->> 'stage')::int);
    end loop;
    update public.mp_matches set state = state || jsonb_build_object('out', v_out,
      'history', (state -> 'history') || jsonb_build_array(jsonb_build_object('stage', state -> 'stage', 'pairs', state -> 'pairs', 'winners', to_jsonb(v_winners))))
     where id = p_match;
    if cardinality(v_winners) <= 1 then
      update public.mp_matches set state = state || jsonb_build_object('out', (state -> 'out') || jsonb_build_object(v_winners[1], 100)) where id = p_match;
      perform public.mp_finish(p_match);
      return;
    end if;
    perform public.mp_tournament_stage(p_match);

  elsif m.mode = 'conquest' then
    s := m.state;
    v_att := (s -> 'attack' ->> 'attacker')::uuid;
    v_def := (s -> 'attack' ->> 'defender')::uuid;
    -- Attacker captures if right and the defender is wrong, or both are right and the attacker was faster.
    v_capture := v_att = any (v_ok) and (not (v_def = any (v_ok)) or
      (select ms from public.mp_answers where match_id = p_match and round_no = p_round and student_id = v_att) <
      (select ms from public.mp_answers where match_id = p_match and round_no = p_round and student_id = v_def));
    if v_capture then
      s := jsonb_set(s, array['owners', (s -> 'attack' ->> 'to')], to_jsonb(v_att));
    end if;
    s := s || jsonb_build_object('log', jsonb_build_array(jsonb_build_object('attacker', v_att, 'defender', v_def, 'to', s -> 'attack' -> 'to',
                                   'captured', v_capture, 'round', p_round)) || coalesce(s -> 'log', '[]'::jsonb));
    s := jsonb_set(s, '{log}', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(s -> 'log') x limit 6) l));
    update public.mp_matches set state = s where id = p_match;
    if (select count(distinct o) from jsonb_array_elements_text(s -> 'owners') o) = 1
       or public.mp_now() >= m.ends_at or (s ->> 'turns')::int >= 36 then
      perform public.mp_finish(p_match);
      return;
    end if;
    perform public.mp_conquest_next_turn(p_match);
  end if;
end $$;

/** Advances a match according to the server clock. Safe to call any number of times, from anyone. */
create or replace function public.mp_tick(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.mp_matches%rowtype;
  v_now timestamptz := public.mp_now();
  v_dur int;
  rd public.mp_rounds%rowtype;
  v_answered int;
begin
  select * into m from public.mp_matches where id = p_match for update skip locked;
  if not found or m.status = 'finished' then return; end if;
  v_dur := coalesce((select (settings ->> 'duration')::int from public.mp_rooms where id = m.room_id), 150);

  if m.status = 'countdown' then
    if v_now < m.starts_at then return; end if;
    if public.mp_is_stream(m.mode) then
      update public.mp_matches set status = 'playing', ends_at = m.starts_at + make_interval(secs => v_dur) where id = p_match;
    elsif m.mode = 'conquest' then
      update public.mp_matches set status = 'playing', ends_at = m.starts_at + make_interval(secs => greatest(v_dur, 300)),
        state = state || jsonb_build_object('phase', 'choose', 'deadline', v_now + interval '20 seconds') where id = p_match;
    elsif m.mode = 'tournament' then
      update public.mp_matches set status = 'playing' where id = p_match;
      perform public.mp_tournament_stage(p_match);
    else
      update public.mp_matches set status = 'playing' where id = p_match;
      perform public.mp_new_round(p_match, array(select student_id from public.mp_players where match_id = p_match),
                                  case when m.mode = 'duel' then 15 else 20 end, 0);
    end if;
    perform public.mp_bump(m.room_id);
    return;
  end if;

  if public.mp_is_stream(m.mode) then
    if v_now >= m.ends_at
       or not exists (select 1 from public.mp_players where match_id = p_match and q_ptr < m.question_count)
       or (m.mode = 'treasure' and not exists (select 1 from jsonb_array_elements(m.state -> 'chests') c where c -> 'o' = 'null'::jsonb))
       or (m.mode = 'boss' and (m.state ->> 'hp')::int <= 0) then
      perform public.mp_finish(p_match);
    end if;
    return;
  end if;

  if m.mode = 'conquest' and m.state ->> 'phase' = 'choose' then
    if v_now >= m.ends_at then perform public.mp_finish(p_match); return; end if;
    if v_now >= (m.state ->> 'deadline')::timestamptz then
      -- No attack chosen in time: the turn passes.
      update public.mp_matches set state = state || jsonb_build_object('log',
        jsonb_build_array(jsonb_build_object('skipped', state -> 'turn_order' -> ((state ->> 'turn')::int))) || coalesce(state -> 'log', '[]'::jsonb)) where id = p_match;
      if (m.state ->> 'turns')::int + 1 >= 36 then perform public.mp_finish(p_match); return; end if;
      perform public.mp_conquest_next_turn(p_match);
      perform public.mp_bump(m.room_id);
    end if;
    return;
  end if;

  select * into rd from public.mp_rounds where match_id = p_match and round_no = m.round_no;
  if not found or rd.resolved then return; end if;
  select count(*) into v_answered from public.mp_answers where match_id = p_match and round_no = rd.round_no;
  if v_now >= rd.ends_at or v_answered >= cardinality(rd.participants) then
    perform public.mp_resolve_round(p_match, rd.round_no);
    perform public.mp_bump(m.room_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Questions inside a match (personal option order, server time)
-- ---------------------------------------------------------------------------
create or replace function public.mp_question_view(p_match uuid, p_student uuid, p_idx int, p_round int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_q public.questions%rowtype;
  v_order text;
begin
  select q.* into v_q from public.mp_match_questions mq join public.questions q on q.id = mq.question_id where mq.match_id = p_match and mq.idx = p_idx;
  insert into public.mp_serves (match_id, student_id, question_idx, round_no, option_order, served_at)
  values (p_match, p_student, p_idx, p_round,
          case when v_q.qtype = 'mcq' then (select string_agg(o, '' order by public.secure_random()) from unnest(array['a', 'b', 'c', 'd']) o) end,
          public.mp_now())
  on conflict do nothing;
  select option_order into v_order from public.mp_serves where match_id = p_match and student_id = p_student and question_idx = p_idx and round_no = p_round;
  return jsonb_build_object('idx', p_idx, 'round', p_round, 'type', v_q.qtype, 'text', v_q.text,
    'options', case when v_q.qtype = 'mcq' then
       (select jsonb_agg(jsonb_build_object('id', k::text, 'text', o.text) order by k)
        from generate_series(1, 4) k join public.question_options o on o.question_id = v_q.id and o.option_id = substr(v_order, k, 1))
       else '[]'::jsonb end);
end $$;

/** Correct answer text of a question (revealed only after a round is resolved or the match ended). */
create or replace function public.mp_answer_text(p_question uuid) returns text language sql stable security definer set search_path = public as $$
  select case when q.qtype = 'written' then q.accepted_answers[1]
              else (select text from public.question_options where question_id = q.id and is_correct) end
  from public.questions q where q.id = p_question
$$;

create or replace function public.mp_answer(p_match uuid, p_idx int, p_round int, p_answer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  m public.mp_matches%rowtype;
  pl public.mp_players%rowtype;
  rd public.mp_rounds%rowtype;
  sv public.mp_serves%rowtype;
  v_q public.questions%rowtype;
  v_prev public.mp_answers%rowtype;
  v_now timestamptz;
  v_ok boolean;
  v_verdict text;
  v_ms int;
  v_dmg int := 0;
  v_gain int := 0;
  v_chest jsonb;
  v_round int := coalesce(p_round, 0);
begin
  if p_answer is null or char_length(p_answer) > 200 or btrim(p_answer) = '' then raise exception 'invalid answer' using errcode = '22023'; end if;
  perform public.mp_tick(p_match);
  select * into m from public.mp_matches where id = p_match for update;
  if not found then raise exception 'match not found' using errcode = 'P0002'; end if;
  perform public.mp_require_member(m.room_id);
  v_now := public.mp_now();
  -- Idempotent: the same answer submitted twice (double tap, reconnect) returns the stored result.
  select * into v_prev from public.mp_answers where match_id = p_match and student_id = v_student and question_idx = p_idx and round_no = v_round;
  if found then return jsonb_build_object('feedback', case when v_prev.correct then 'correct' else 'wrong' end, 'duplicate', true); end if;
  if m.status <> 'playing' then raise exception 'match not running' using errcode = 'P0003'; end if;
  select * into pl from public.mp_players where match_id = p_match and student_id = v_student for update;
  if not found or not pl.alive then raise exception 'not playing' using errcode = '42501'; end if;

  if public.mp_is_stream(m.mode) then
    if v_round <> 0 or pl.q_ptr >= m.question_count or pl.q_order[pl.q_ptr + 1] <> p_idx then raise exception 'not your current question' using errcode = 'P0003'; end if;
    if v_now >= m.ends_at then raise exception 'time is up' using errcode = 'P0003'; end if;
    if m.mode = 'treasure' and pl.target is null then raise exception 'choose a chest first' using errcode = 'P0003'; end if;
  else
    select * into rd from public.mp_rounds where match_id = p_match and round_no = v_round;
    if not found or v_round <> m.round_no or rd.resolved or p_idx <> rd.question_idx or not (v_student = any (rd.participants)) then
      raise exception 'not your current question' using errcode = 'P0003';
    end if;
    if v_now < rd.starts_at or v_now >= rd.ends_at then raise exception 'time is up' using errcode = 'P0003'; end if;
  end if;

  select * into sv from public.mp_serves where match_id = p_match and student_id = v_student and question_idx = p_idx and round_no = v_round for update;
  if not found then raise exception 'question not shown yet' using errcode = 'P0003'; end if;
  select q.* into v_q from public.mp_match_questions mq join public.questions q on q.id = mq.question_id where mq.match_id = p_match and mq.idx = p_idx;
  if v_q.qtype = 'mcq' then
    if p_answer not in ('1', '2', '3', '4') then raise exception 'invalid option' using errcode = '22023'; end if;
    v_ok := substr(sv.option_order, p_answer::int, 1) = (select option_id from public.question_options where question_id = v_q.id and is_correct);
  else
    v_verdict := public.grade_written(v_q.id, p_answer);
    if v_verdict = 'unsure' and sv.unsure = 0 then
      update public.mp_serves set unsure = 1 where match_id = p_match and student_id = v_student and question_idx = p_idx and round_no = v_round;
      return jsonb_build_object('feedback', 'unsure');
    end if;
    v_ok := v_verdict = 'correct';
  end if;
  -- Response time from the server's own clock (never from the client).
  v_ms := greatest(0, least(600000, (extract(epoch from (v_now - sv.served_at)) * 1000)::int));
  insert into public.mp_answers (match_id, student_id, question_idx, round_no, answer, correct, ms) values (p_match, v_student, p_idx, v_round, left(p_answer, 200), v_ok, v_ms);

  update public.mp_players set answered = answered + 1, correct = correct + v_ok::int, streak = case when v_ok then streak + 1 else 0 end,
    total_ms = total_ms + v_ms, last_correct_at = case when v_ok then v_now else last_correct_at end
   where match_id = p_match and student_id = v_student returning * into pl;

  if public.mp_is_stream(m.mode) then
    if m.mode in ('speed', 'teams') then
      v_gain := v_ok::int;
    elsif m.mode = 'boss' and v_ok then
      v_dmg := 10 + case when pl.streak >= 3 then 5 else 0 end;
      v_gain := v_dmg;
      update public.mp_matches set state = jsonb_set(state, '{hp}', to_jsonb(greatest(0, (state ->> 'hp')::int - v_dmg))) where id = p_match;
    elsif m.mode = 'treasure' and v_ok then
      v_chest := m.state -> 'chests' -> pl.target;
      if v_chest -> 'o' = 'null'::jsonb then
        v_gain := (v_chest ->> 'v')::int;
        update public.mp_matches set state = jsonb_set(state, array['chests', pl.target::text, 'o'], to_jsonb(v_student)) where id = p_match;
      else
        v_gain := 5; -- someone opened it first: a consolation clue
      end if;
    end if;
    update public.mp_players set score = score + v_gain, q_ptr = q_ptr + 1, target = null where match_id = p_match and student_id = v_student;
    if m.mode in ('boss', 'treasure') then perform public.mp_bump(m.room_id); end if;
  end if;

  -- Close the round as soon as everyone has answered.
  if not public.mp_is_stream(m.mode) and (select count(*) from public.mp_answers where match_id = p_match and round_no = v_round) >= cardinality(rd.participants) then
    perform public.mp_resolve_round(p_match, v_round);
    perform public.mp_bump(m.room_id);
  end if;
  if m.mode = 'boss' and (select (state ->> 'hp')::int from public.mp_matches where id = p_match) <= 0 then perform public.mp_finish(p_match); end if;
  if m.mode = 'treasure' and not exists (select 1 from jsonb_array_elements((select state -> 'chests' from public.mp_matches where id = p_match)) c where c -> 'o' = 'null'::jsonb) then
    perform public.mp_finish(p_match);
  end if;
  return jsonb_build_object('feedback', case when v_ok then 'correct' else 'wrong' end, 'gain', v_gain, 'damage', v_dmg);
end $$;

create or replace function public.mp_treasure_pick(p_match uuid, p_chest int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  m public.mp_matches%rowtype;
begin
  select * into m from public.mp_matches where id = p_match;
  perform public.mp_require_member(m.room_id);
  if m.mode <> 'treasure' or m.status <> 'playing' then raise exception 'match not running' using errcode = 'P0003'; end if;
  if p_chest < 0 or p_chest >= jsonb_array_length(m.state -> 'chests') or m.state -> 'chests' -> p_chest -> 'o' <> 'null'::jsonb then
    raise exception 'chest not available' using errcode = 'P0003';
  end if;
  update public.mp_players set target = p_chest where match_id = p_match and student_id = v_student and alive;
end $$;

create or replace function public.mp_conquest_attack(p_match uuid, p_from int, p_to int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  m public.mp_matches%rowtype;
  v_def uuid;
  v_round int;
begin
  perform public.mp_tick(p_match);
  select * into m from public.mp_matches where id = p_match for update;
  perform public.mp_require_member(m.room_id);
  if m.mode <> 'conquest' or m.status <> 'playing' or m.state ->> 'phase' <> 'choose' then raise exception 'not your turn' using errcode = 'P0003'; end if;
  if (m.state -> 'turn_order' ->> ((m.state ->> 'turn')::int))::uuid <> v_student then raise exception 'not your turn' using errcode = 'P0003'; end if;
  if (m.state -> 'owners' ->> p_from)::uuid is distinct from v_student then raise exception 'not your territory' using errcode = 'P0003'; end if;
  v_def := (m.state -> 'owners' ->> p_to)::uuid;
  if v_def is null or v_def = v_student or not public.mp_adjacent(p_from, p_to) then raise exception 'cannot attack there' using errcode = 'P0003'; end if;
  v_round := public.mp_new_round(p_match, array[v_student, v_def], 20, 1500);
  update public.mp_matches set state = state || jsonb_build_object('phase', 'duel',
    'attack', jsonb_build_object('from', p_from, 'to', p_to, 'attacker', v_student, 'defender', v_def, 'round', v_round)) where id = p_match;
  perform public.mp_bump(m.room_id);
end $$;

-- ---------------------------------------------------------------------------
-- The one read a client needs: room, players, match, and its own current question
-- ---------------------------------------------------------------------------
create or replace function public.mp_state(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.mp_require_member(p_room);
  v_room public.mp_rooms%rowtype;
  m public.mp_matches%rowtype;
  pl public.mp_players%rowtype;
  rd public.mp_rounds%rowtype;
  v_now timestamptz;
  v_question jsonb := null;
  v_round jsonb := null;
  v_last jsonb := null;
  v_match jsonb := null;
  v_answered boolean := false;
begin
  -- Heartbeat (at most every 5 seconds), and lobby housekeeping.
  update public.mp_members set last_seen = now() where room_id = p_room and student_id = v_student and last_seen < now() - interval '5 seconds';
  select * into v_room from public.mp_rooms where id = p_room;
  if v_room.status = 'lobby' and v_room.host_id <> v_student
     and not exists (select 1 from public.mp_members where room_id = p_room and student_id = v_room.host_id and left_at is null and last_seen > now() - interval '45 seconds') then
    perform public.mp_migrate_host(p_room);
    select * into v_room from public.mp_rooms where id = p_room;
  end if;
  if v_room.current_match is not null then
    perform public.mp_tick(v_room.current_match);
    select * into v_room from public.mp_rooms where id = p_room;
    select * into m from public.mp_matches where id = v_room.current_match;
  end if;
  v_now := public.mp_now();

  if m.id is not null then
    select * into pl from public.mp_players where match_id = m.id and student_id = v_student;
    if m.status = 'playing' and pl.student_id is not null and pl.alive then
      if public.mp_is_stream(m.mode) then
        if v_now < m.ends_at and pl.q_ptr < m.question_count and (m.mode <> 'treasure' or pl.target is not null) then
          v_question := public.mp_question_view(m.id, v_student, pl.q_order[pl.q_ptr + 1], 0);
        end if;
      else
        select * into rd from public.mp_rounds where match_id = m.id and round_no = m.round_no;
        if found then
          v_answered := exists (select 1 from public.mp_answers where match_id = m.id and student_id = v_student and round_no = rd.round_no);
          if not rd.resolved and not v_answered and v_student = any (rd.participants) and v_now >= rd.starts_at and v_now < rd.ends_at then
            v_question := public.mp_question_view(m.id, v_student, rd.question_idx, rd.round_no);
          end if;
          v_round := jsonb_build_object('round', rd.round_no, 'starts_at', rd.starts_at, 'ends_at', rd.ends_at, 'participants', to_jsonb(rd.participants),
                                        'resolved', rd.resolved, 'answered', (select count(*) from public.mp_answers where match_id = m.id and round_no = rd.round_no),
                                        'me_answered', v_answered);
        end if;
      end if;
    end if;
    -- The previous round's outcome and its correct answer (everyone has answered it already).
    select jsonb_build_object('round', r.round_no, 'meta', r.meta, 'answer', public.mp_answer_text(mq.question_id),
             'question', (select text from public.questions where id = mq.question_id))
      into v_last
      from public.mp_rounds r join public.mp_match_questions mq on mq.match_id = r.match_id and mq.idx = r.question_idx
     where r.match_id = m.id and r.resolved order by r.round_no desc limit 1;
    v_match := jsonb_build_object(
      'id', m.id, 'mode', m.mode, 'status', m.status, 'starts_at', m.starts_at, 'ends_at', m.ends_at, 'round_no', m.round_no,
      'state', m.state, 'result', m.result, 'question_count', m.question_count,
      'players', (select jsonb_agg(jsonb_build_object('student', p.student_id, 'score', p.score, 'correct', p.correct, 'answered', p.answered,
                    'hearts', p.hearts, 'alive', p.alive, 'team', p.team, 'target', p.target, 'progress', p.q_ptr) order by p.score desc, p.seed)
                  from public.mp_players p where p.match_id = m.id),
      'round', v_round, 'last_round', v_last, 'question', v_question,
      'review', case when m.status = 'finished' then (
        select jsonb_agg(jsonb_build_object('question', q.text, 'answer', public.mp_answer_text(q.id), 'correct', a.correct) order by a.id)
        from public.mp_answers a join public.mp_match_questions mq on mq.match_id = a.match_id and mq.idx = a.question_idx join public.questions q on q.id = mq.question_id
        where a.match_id = m.id and a.student_id = v_student) end);
  end if;

  return jsonb_build_object(
    'server_now', v_now,
    'me', v_student,
    'room', jsonb_build_object('id', v_room.id, 'code', case when v_room.code_revoked or v_room.code_expires_at < now() then null else v_room.code end,
                               'mode', v_room.mode, 'subjects', to_jsonb(v_room.subjects), 'lessons', to_jsonb(v_room.lessons), 'settings', v_room.settings,
                               'status', v_room.status, 'host', v_room.host_id, 'version', v_room.version, 'code_expires_at', v_room.code_expires_at),
    -- Players are shown by nickname and avatar only: no username, email or other personal detail.
    'members', (select jsonb_agg(jsonb_build_object('id', sp.id, 'nickname', sp.nickname, 'character_id', sp.character_id, 'appearance', sp.appearance,
                  'outfit', public.worn_keys(sp.id), 'ready', mm.ready, 'online', mm.last_seen > now() - interval '30 seconds') order by mm.joined_at)
                from public.mp_members mm join public.student_profiles sp on sp.id = mm.student_id
                where mm.room_id = p_room and (mm.left_at is null or exists (select 1 from public.mp_players p where p.match_id = m.id and p.student_id = mm.student_id))),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'student', x.student_id, 'reaction', x.reaction, 'at', x.created_at) order by x.id)
                  from (select * from public.mp_reactions where room_id = p_room and created_at > now() - interval '20 seconds' order by id desc limit 20) x), '[]'::jsonb),
    'reactions_allowed', (public.controls_of(v_student)).reactions_allowed,
    'match', v_match);
end $$;

create or replace function public.mp_my_room() returns jsonb
language sql stable security definer set search_path = public as $$
  select (select jsonb_build_object('room_id', m.room_id, 'status', r.status) from public.mp_members m join public.mp_rooms r on r.id = m.room_id
          where m.student_id = public.require_student() and m.left_at is null and r.status <> 'closed' order by m.joined_at desc limit 1)
$$;

-- ---------------------------------------------------------------------------
-- Fix (Feature 4): the option-order subquery must be correlated with the question row, otherwise
-- PostgreSQL evaluates it once and every question in a session shares one permutation.
-- ---------------------------------------------------------------------------
create or replace function public.start_quiz_session(p_mission uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_session uuid;
  v_lesson uuid;
  v_limit int;
  v_questions jsonb;
begin
  if not public.mission_is_playable(p_mission) then
    raise exception 'mission not available' using errcode = 'P0002';
  end if;
  select max_sessions_per_hour into v_limit from public.game_settings;
  if (select count(*) from public.quiz_sessions where student_id = v_student and started_at > now() - interval '1 hour') >= v_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select lesson_id into v_lesson from public.missions where id = p_mission;
  update public.quiz_sessions set status = 'abandoned'
    where student_id = v_student and mission_id = p_mission and status = 'active';
  insert into public.quiz_sessions (student_id, mission_id, lesson_id) values (v_student, p_mission, v_lesson)
    returning id into v_session;
  -- A fresh random option order per question and session (CSPRNG).
  insert into public.session_questions (session_id, question_id, position, option_order)
    select v_session, mq.question_id, mq.position,
           case when q.qtype = 'mcq' then (select string_agg(o, '' order by public.secure_random()) from unnest(array['a', 'b', 'c', 'd']) o where mq.position >= 0) end
    from public.mission_questions mq
    join public.questions q on q.id = mq.question_id and q.status = 'published'
    where mq.mission_id = p_mission;

  -- Question text and options in display order with opaque keys '1'..'4'. No answers, hints or explanations.
  select jsonb_agg(jsonb_build_object(
           'id', q.id, 'type', q.qtype, 'text', q.text, 'source_page', q.source_page, 'source_label', q.source_label,
           'has_hint', q.hint <> '',
           'options', case when q.qtype = 'mcq' then
               (select jsonb_agg(jsonb_build_object('id', k::text, 'text', o.text) order by k)
                from generate_series(1, 4) k join public.question_options o on o.question_id = q.id and o.option_id = substr(sq.option_order, k, 1))
             else '[]'::jsonb end)
         order by sq.position)
    into v_questions
  from public.session_questions sq join public.questions q on q.id = sq.question_id
  where sq.session_id = v_session;

  return jsonb_build_object('session_id', v_session, 'mission_id', p_mission, 'lesson_id', v_lesson,
                            'questions', coalesce(v_questions, '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Grants: API functions for signed-in students; internals for nobody.
-- ---------------------------------------------------------------------------
do $$
declare fn record;
  api text[] := array['mp_create_room', 'mp_join', 'mp_leave', 'mp_set_ready', 'mp_update_room', 'mp_new_invite', 'mp_close_invite',
                      'mp_react', 'mp_back_to_lobby', 'mp_start', 'mp_answer', 'mp_treasure_pick', 'mp_conquest_attack', 'mp_state', 'mp_my_room',
                      'is_room_member'];
begin
  for fn in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'mp\_%' or (n.nspname = 'public' and p.proname = 'is_room_member') loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
    if fn.proname = any (api) then execute format('grant execute on function %s to authenticated', fn.sig); end if;
  end loop;
end $$;

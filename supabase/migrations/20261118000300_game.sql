-- ============================================================================
-- Server-validated quizzes, rewards, shop, inventory and equipment.
--
-- The client never sends correctness, XP, coins or prices. It sends the option
-- the student chose; the server checks it, records the attempt and writes
-- reward transactions. Every reward has a unique key per student:
--   question:<question uuid>   once per question, ever
--   mission:<mission uuid>     first passing completion (>= 70% first-attempt accuracy)
--   purchase:<item id>         one purchase per item
-- so double taps, retries, reloads and replays cannot duplicate rewards.
-- ============================================================================

create table public.reward_rules (
  key text primary key check (key in ('first_try', 'assisted', 'missed', 'mission_pass')),
  xp int not null check (xp >= 0 and xp <= 1000),
  coins int not null check (coins >= 0 and coins <= 1000)
);
insert into public.reward_rules (key, xp, coins) values
  ('first_try', 10, 10), ('assisted', 5, 5), ('missed', 0, 0), ('mission_pass', 20, 20);

create table public.game_settings (
  id boolean primary key default true check (id),
  pass_accuracy int not null default 70 check (pass_accuracy between 1 and 100),
  max_answers_per_minute int not null default 40,
  max_sessions_per_hour int not null default 60
);
insert into public.game_settings default values;

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  mission_id uuid not null references public.missions (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  summary jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index quiz_sessions_student_idx on public.quiz_sessions (student_id, started_at desc);

create table public.session_questions (
  session_id uuid not null references public.quiz_sessions (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  position smallint not null,
  hint_used boolean not null default false,
  attempts smallint not null default 0 check (attempts between 0 and 2),
  result text check (result in ('first', 'assisted', 'missed')),
  finalized_at timestamptz,
  primary key (session_id, question_id)
);

create table public.question_attempts (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.quiz_sessions (id) on delete cascade,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  attempt_no smallint not null check (attempt_no in (1, 2)),
  option_id char(1) not null,
  is_correct boolean not null,
  hint_used boolean not null,
  elapsed_ms int,
  created_at timestamptz not null default now(),
  unique (session_id, question_id, attempt_no)
);
create index question_attempts_student_idx on public.question_attempts (student_id, created_at desc);

create table public.reward_transactions (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  kind text not null check (kind in ('question', 'mission', 'purchase')),
  ref text not null,
  xp int not null,
  coins int not null,
  session_id uuid references public.quiz_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, kind, ref),
  check ((kind in ('question', 'mission') and xp >= 0 and coins >= 0) or (kind = 'purchase' and xp = 0 and coins <= 0))
);
create index reward_transactions_student_idx on public.reward_transactions (student_id, created_at);

create table public.shop_items (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  category text not null check (category in ('characters', 'outfit', 'hat', 'accessory', 'bag')),
  name_ar text not null,
  description text not null default '',
  price int not null check (price between 0 and 10000),
  character_id text,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.inventory (
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  item_id text not null references public.shop_items (id),
  source text not null default 'purchase' check (source in ('purchase', 'grant')),
  acquired_at timestamptz not null default now(),
  primary key (student_id, item_id)
);

create table public.equipped_items (
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  slot text not null check (slot in ('hat', 'outfit', 'accessory', 'bag')),
  item_id text not null references public.shop_items (id),
  primary key (student_id, slot)
);

-- Device-local (Task 05/06) history, imported once as UNVERIFIED data. It never
-- creates XP, coins, items or leaderboard points.
create table public.legacy_imports (
  student_id uuid primary key references public.student_profiles (id) on delete cascade,
  payload jsonb not null,
  summary jsonb not null default '{}',
  imported_at timestamptz not null default now()
);

alter table public.reward_rules enable row level security;
alter table public.game_settings enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.session_questions enable row level security;
alter table public.question_attempts enable row level security;
alter table public.reward_transactions enable row level security;
alter table public.shop_items enable row level security;
alter table public.inventory enable row level security;
alter table public.equipped_items enable row level security;
alter table public.legacy_imports enable row level security;

create policy reward_rules_read on public.reward_rules for select to authenticated using (true);
create policy reward_rules_admin on public.reward_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy game_settings_read on public.game_settings for select to authenticated using (true);
create policy game_settings_admin on public.game_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy shop_items_read on public.shop_items for select to authenticated using (active or public.is_admin());
create policy shop_items_admin on public.shop_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Own records, a linked parent's children, or admins. No writes through the API.
do $$
declare t text;
begin
  foreach t in array array['quiz_sessions', 'question_attempts', 'reward_transactions', 'inventory', 'equipped_items', 'legacy_imports'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (student_id = (select auth.uid()) or public.is_parent_of(student_id) or public.is_admin())', t);
    execute format('revoke insert, update, delete on public.%1$s from authenticated', t);
  end loop;
end $$;
create policy session_questions_read on public.session_questions for select to authenticated
  using (exists (select 1 from public.quiz_sessions s where s.id = session_id
                 and (s.student_id = (select auth.uid()) or public.is_parent_of(s.student_id) or public.is_admin())));
revoke insert, update, delete on public.session_questions from authenticated;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.require_student() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null or not exists (select 1 from public.student_profiles where id = v) then
    raise exception 'student account required' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function public.wallet_totals(p_student uuid, out xp int, out coins int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(t.xp), 0)::int, coalesce(sum(t.coins), 0)::int
  from public.reward_transactions t where t.student_id = p_student
$$;
revoke execute on function public.wallet_totals(uuid) from public, anon, authenticated;

create or replace function public.mission_is_playable(p_mission uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.missions m
    join public.lessons l on l.id = m.lesson_id and l.status = 'published'
    join public.units u on u.id = l.unit_id and u.status = 'published'
    join public.subjects s on s.id = l.subject_id and s.status = 'published'
    where m.id = p_mission and m.active)
$$;

-- ---------------------------------------------------------------------------
-- Published catalogue (no question content): subjects → units → lessons → missions
-- ---------------------------------------------------------------------------
create or replace function public.get_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(subj order by (subj ->> 'sort_order')::int, subj ->> 'name_ar'), '[]'::jsonb)
  from (
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
            from public.lessons l where l.unit_id = u.id and l.status = 'published'), '[]'::jsonb)
        ) order by u.sort_order, u.number)
        from public.units u where u.subject_id = s.id and u.status = 'published'), '[]'::jsonb)
    ) as subj
    from public.subjects s
    where s.status = 'published' and auth.uid() is not null
  ) x
$$;

-- ---------------------------------------------------------------------------
-- Quiz sessions
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
  -- An unfinished earlier attempt of this mission is abandoned (its rewards, if any, stay).
  update public.quiz_sessions set status = 'abandoned'
    where student_id = v_student and mission_id = p_mission and status = 'active';
  insert into public.quiz_sessions (student_id, mission_id, lesson_id) values (v_student, p_mission, v_lesson)
    returning id into v_session;
  insert into public.session_questions (session_id, question_id, position)
    select v_session, mq.question_id, mq.position from public.mission_questions mq
    join public.questions q on q.id = mq.question_id and q.status = 'published'
    where mq.mission_id = p_mission;

  -- Question text and options only: no correct flags, hints or explanations.
  select jsonb_agg(jsonb_build_object(
           'id', q.id, 'text', q.text, 'source_page', q.source_page, 'source_label', q.source_label,
           'has_hint', q.hint <> '',
           'options', (select jsonb_agg(jsonb_build_object('id', o.option_id, 'text', o.text) order by md5(o.option_id || v_session::text))
                       from public.question_options o where o.question_id = q.id))
         order by sq.position)
    into v_questions
  from public.session_questions sq join public.questions q on q.id = sq.question_id
  where sq.session_id = v_session;

  return jsonb_build_object('session_id', v_session, 'mission_id', p_mission, 'lesson_id', v_lesson,
                            'questions', coalesce(v_questions, '[]'::jsonb));
end $$;

create or replace function public.request_hint(p_session uuid, p_question uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_hint text;
begin
  update public.session_questions sq set hint_used = true
  from public.quiz_sessions s
  where sq.session_id = p_session and sq.question_id = p_question and s.id = sq.session_id
    and s.student_id = v_student and s.status = 'active' and sq.result is null;
  if not found then raise exception 'question not open in this session' using errcode = 'P0002'; end if;
  select hint into v_hint from public.questions where id = p_question;
  return v_hint;
end $$;

create or replace function public.submit_answer(p_session uuid, p_question uuid, p_option text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_sq public.session_questions%rowtype;
  v_correct char(1);
  v_is_correct boolean;
  v_attempt int;
  v_result text;
  v_rule public.reward_rules%rowtype;
  v_reward jsonb := null;
  v_tx bigint;
  v_limit int;
  v_last timestamptz;
  v_q public.questions%rowtype;
begin
  if p_option not in ('a', 'b', 'c', 'd') then raise exception 'invalid option' using errcode = '22023'; end if;
  perform 1 from public.quiz_sessions where id = p_session and student_id = v_student and status = 'active' for update;
  if not found then raise exception 'session not active' using errcode = 'P0002'; end if;
  select * into v_sq from public.session_questions where session_id = p_session and question_id = p_question for update;
  if not found then raise exception 'question not in session' using errcode = 'P0002'; end if;
  if v_sq.result is not null then
    raise exception 'already answered' using errcode = 'P0003'; -- duplicate submission (double tap / replay)
  end if;
  if exists (select 1 from public.question_attempts where session_id = p_session and question_id = p_question and option_id = p_option) then
    raise exception 'option already tried' using errcode = 'P0003';
  end if;
  select max_answers_per_minute into v_limit from public.game_settings;
  if (select count(*) from public.question_attempts where student_id = v_student and created_at > now() - interval '1 minute') >= v_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select * into v_q from public.questions where id = p_question;
  select option_id into v_correct from public.question_options where question_id = p_question and is_correct;
  v_is_correct := (p_option = v_correct);
  v_attempt := v_sq.attempts + 1;
  select max(created_at) into v_last from public.question_attempts where session_id = p_session;

  insert into public.question_attempts (session_id, student_id, question_id, attempt_no, option_id, is_correct, hint_used, elapsed_ms)
  values (p_session, v_student, p_question, v_attempt, p_option, v_is_correct, v_sq.hint_used,
          (extract(epoch from (now() - coalesce(v_last, (select started_at from public.quiz_sessions where id = p_session)))) * 1000)::int);

  if v_is_correct then
    v_result := case when v_attempt = 1 and not v_sq.hint_used then 'first' else 'assisted' end;
  elsif v_attempt >= 2 then
    v_result := 'missed';
  end if;

  update public.session_questions
     set attempts = v_attempt, result = v_result, finalized_at = case when v_result is not null then now() end
   where session_id = p_session and question_id = p_question;

  if v_result in ('first', 'assisted') then
    select * into v_rule from public.reward_rules where key = case when v_result = 'first' then 'first_try' else 'assisted' end;
    insert into public.reward_transactions (student_id, kind, ref, xp, coins, session_id)
    values (v_student, 'question', p_question::text, v_rule.xp, v_rule.coins, p_session)
    on conflict (student_id, kind, ref) do nothing
    returning id into v_tx;
    v_reward := case when v_tx is null then jsonb_build_object('xp', 0, 'coins', 0, 'already_rewarded', true)
                     else jsonb_build_object('xp', v_rule.xp, 'coins', v_rule.coins, 'already_rewarded', false) end;
  end if;

  return jsonb_build_object(
    'feedback', case when v_is_correct then 'correct' when v_result = 'missed' then 'revealed' else 'try-again' end,
    'result', v_result,
    'attempt', v_attempt,
    'correct_option', case when v_result is not null then v_correct end,
    'explanation', case when v_result is not null then v_q.explanation end,
    'hint', case when v_result is null then v_q.hint end,
    'reward', v_reward
  );
end $$;

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
  v_bonus_earlier boolean;
  v_tx bigint;
  v_summary jsonb;
  v_q_xp int; v_q_coins int; v_already int;
  v_before_xp int; v_before_coins int;
  v_after record;
begin
  select * into v_s from public.quiz_sessions where id = p_session and student_id = v_student for update;
  if not found then raise exception 'session not found' using errcode = 'P0002'; end if;
  if v_s.status = 'completed' then
    return v_s.summary || jsonb_build_object('repeat', true); -- idempotent: no new rewards
  end if;
  if v_s.status <> 'active' then raise exception 'session not active' using errcode = 'P0002'; end if;

  select count(*), count(*) filter (where result = 'first'), count(*) filter (where result = 'assisted'),
         count(*) filter (where result = 'missed'), count(*) filter (where hint_used), count(*) filter (where result is null)
    into v_total, v_first, v_assisted, v_missed, v_hints, v_open
  from public.session_questions where session_id = p_session;
  if v_open > 0 then raise exception 'mission not finished' using errcode = 'P0001'; end if;

  v_acc := case when v_total > 0 then round(v_first * 100.0 / v_total) else 0 end;
  select pass_accuracy into v_pass from public.game_settings;
  v_bonus_earlier := exists (select 1 from public.reward_transactions where student_id = v_student and kind = 'mission' and ref = v_s.mission_id::text);

  select coalesce(sum(xp), 0), coalesce(sum(coins), 0) into v_q_xp, v_q_coins
  from public.reward_transactions where session_id = p_session and kind = 'question';
  select v.xp, v.coins into v_before_xp, v_before_coins from public.wallet_totals(v_student) v;
  v_before_xp := v_before_xp - v_q_xp;
  v_before_coins := v_before_coins - v_q_coins;
  select count(*) into v_already from public.session_questions sq
   where sq.session_id = p_session and sq.result in ('first', 'assisted')
     and not exists (select 1 from public.reward_transactions t where t.session_id = p_session and t.kind = 'question' and t.ref = sq.question_id::text);

  if v_acc >= v_pass then
    select * into v_rule from public.reward_rules where key = 'mission_pass';
    insert into public.reward_transactions (student_id, kind, ref, xp, coins, session_id)
    values (v_student, 'mission', v_s.mission_id::text, v_rule.xp, v_rule.coins, p_session)
    on conflict (student_id, kind, ref) do nothing returning id into v_tx;
    v_bonus := v_tx is not null;
  end if;

  select * into v_after from public.wallet_totals(v_student);
  v_summary := jsonb_build_object(
    'total', v_total, 'first_try', v_first, 'assisted', v_assisted, 'missed', v_missed, 'hints_used', v_hints,
    'first_try_accuracy', v_acc,
    'reward', jsonb_build_object(
      'xp', v_q_xp + case when v_bonus then v_rule.xp else 0 end,
      'coins', v_q_coins + case when v_bonus then v_rule.coins else 0 end,
      'bonus', v_bonus, 'bonus_earlier', v_bonus_earlier, 'already_rewarded', v_already,
      'before', jsonb_build_object('xp', v_before_xp, 'coins', v_before_coins),
      'after', jsonb_build_object('xp', v_after.xp, 'coins', v_after.coins)));
  update public.quiz_sessions set status = 'completed', completed_at = now(), summary = v_summary where id = p_session;
  return v_summary;
end $$;

-- ---------------------------------------------------------------------------
-- Shop, inventory, equipment, character
-- ---------------------------------------------------------------------------
create or replace function public.base_character_ids() returns text[] language sql immutable as $$
  select array['green-slime', 'blue-slime', 'little-robot', 'fox']
$$;

create or replace function public.purchase_item(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_item public.shop_items%rowtype;
  v_coins int;
begin
  -- Serialise purchases per student so two taps cannot spend the same coins twice.
  perform 1 from public.student_profiles where id = v_student for update;
  select * into v_item from public.shop_items where id = p_item and active;
  if not found then raise exception 'unknown item' using errcode = 'P0002'; end if;
  if exists (select 1 from public.inventory where student_id = v_student and item_id = p_item) then
    raise exception 'already owned' using errcode = 'P0003';
  end if;
  select coins into v_coins from public.wallet_totals(v_student);
  if v_coins < v_item.price then
    raise exception 'insufficient coins' using errcode = 'P0004', detail = (v_item.price - v_coins)::text;
  end if;
  insert into public.reward_transactions (student_id, kind, ref, xp, coins) values (v_student, 'purchase', p_item, 0, -v_item.price);
  insert into public.inventory (student_id, item_id, source) values (v_student, p_item, 'purchase');
  return jsonb_build_object('item', p_item, 'price', v_item.price, 'coins', v_coins - v_item.price);
end $$;

create or replace function public.equip_item(p_item text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_cat text;
begin
  select category into v_cat from public.shop_items where id = p_item;
  if v_cat is null or v_cat = 'characters' then raise exception 'not equippable' using errcode = '22023'; end if;
  if not exists (select 1 from public.inventory where student_id = v_student and item_id = p_item) then
    raise exception 'not owned' using errcode = '42501';
  end if;
  insert into public.equipped_items (student_id, slot, item_id) values (v_student, v_cat, p_item)
    on conflict (student_id, slot) do update set item_id = excluded.item_id;
end $$;

create or replace function public.unequip_slot(p_slot text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.equipped_items where student_id = public.require_student() and slot = p_slot;
end $$;

create or replace function public.set_character(p_character text) returns void
language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.require_student();
begin
  if not (p_character = any (public.base_character_ids())) and not exists (
    select 1 from public.inventory i join public.shop_items s on s.id = i.item_id
    where i.student_id = v_student and s.category = 'characters' and s.character_id = p_character) then
    raise exception 'character locked' using errcode = '42501';
  end if;
  update public.student_profiles set character_id = p_character where id = v_student;
end $$;

create or replace function public.set_nickname(p_nickname text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := btrim(regexp_replace(p_nickname, '\s+', ' ', 'g'));
begin
  if char_length(v) < 2 or char_length(v) > 12 or v !~ '^[[:alnum:]_ ؀-ۿ]+$' then
    raise exception 'invalid nickname' using errcode = '22023';
  end if;
  update public.student_profiles set nickname = v where id = public.require_student();
end $$;

create or replace function public.get_my_game_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_p public.student_profiles%rowtype;
  v_w record;
begin
  select * into v_p from public.student_profiles where id = v_student;
  select * into v_w from public.wallet_totals(v_student);
  return jsonb_build_object(
    'student_id', v_student, 'username', v_p.username, 'nickname', v_p.nickname, 'character_id', v_p.character_id,
    'xp', v_w.xp, 'coins', v_w.coins,
    'owned', coalesce((select jsonb_agg(item_id order by acquired_at) from public.inventory where student_id = v_student), '[]'::jsonb),
    'equipped', coalesce((select jsonb_object_agg(slot, item_id) from public.equipped_items where student_id = v_student), '{}'::jsonb),
    'legacy_imported', v_p.legacy_imported_at is not null,
    'mission_best', coalesce((
      select jsonb_object_agg(mission_id, best) from (
        select mission_id::text, max((summary ->> 'first_try_accuracy')::int) as best
        from public.quiz_sessions where student_id = v_student and status = 'completed' group by mission_id) b), '{}'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Device-local history import (once, unverified, no rewards)
-- ---------------------------------------------------------------------------
create or replace function public.import_legacy_progress(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_summary jsonb;
begin
  if exists (select 1 from public.legacy_imports where student_id = v_student) then
    return (select summary || jsonb_build_object('already_imported', true) from public.legacy_imports where student_id = v_student);
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 262144 then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  v_summary := jsonb_build_object(
    'missions', (select count(*) from jsonb_object_keys(coalesce(p_payload -> 'progress' -> 'missions', '{}'::jsonb))),
    'questions', (select count(*) from jsonb_object_keys(coalesce(p_payload -> 'progress' -> 'questions', '{}'::jsonb))),
    'verified', false);
  insert into public.legacy_imports (student_id, payload, summary) values (v_student, p_payload, v_summary);
  update public.student_profiles set legacy_imported_at = now() where id = v_student;
  return v_summary;
end $$;

-- Only signed-in users may call the game functions; anonymous callers get nothing.
revoke execute on function public.get_catalog(), public.start_quiz_session(uuid), public.request_hint(uuid, uuid),
  public.submit_answer(uuid, uuid, text), public.complete_quiz_session(uuid), public.purchase_item(text),
  public.equip_item(text), public.unequip_slot(text), public.set_character(text), public.set_nickname(text),
  public.get_my_game_state(), public.import_legacy_progress(jsonb), public.require_student(), public.mission_is_playable(uuid)
  from public, anon;
grant execute on function public.get_catalog(), public.start_quiz_session(uuid), public.request_hint(uuid, uuid),
  public.submit_answer(uuid, uuid, text), public.complete_quiz_session(uuid), public.purchase_item(text),
  public.equip_item(text), public.unequip_slot(text), public.set_character(text), public.set_nickname(text),
  public.get_my_game_state(), public.import_legacy_progress(jsonb)
  to authenticated;

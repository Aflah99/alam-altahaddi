-- ============================================================================
-- Feature 4: shuffled multiple-choice answers with opaque per-session keys, and
-- written-answer questions graded on the server with Arabic normalisation.
--
-- * MCQ: every session stores a random permutation of each question's options.
--   The browser only ever sees keys '1'..'4' in display order, so neither the
--   stored option letter nor a fixed position can reveal the answer.
-- * Written: accepted answers, known wrong answers (e.g. the MCQ distractors) and
--   grading settings never leave the database. Grading: normalisation → exact /
--   approved alternatives → bounded spelling tolerance per word, with negation,
--   number and short-word safeguards → "unsure" (one free retry) for doubtful cases.
-- No AI is used for grading.
-- ============================================================================

alter table public.questions add column if not exists qtype text not null default 'mcq' check (qtype in ('mcq', 'written'));
alter table public.questions add column if not exists accepted_answers text[] not null default '{}';
alter table public.questions add column if not exists rejected_answers text[] not null default '{}';
alter table public.questions add column if not exists grading jsonb not null default '{}'::jsonb check (jsonb_typeof(grading) = 'object');
alter table public.questions add column if not exists derived_from uuid references public.questions (id) on delete set null;
alter table public.questions add constraint questions_answers_size check (
  coalesce(array_length(accepted_answers, 1), 0) <= 12 and coalesce(array_length(rejected_answers, 1), 0) <= 20);

alter table public.session_questions add column if not exists option_order text check (option_order ~ '^[a-d]{4}$');
alter table public.session_questions add column if not exists unsure_count smallint not null default 0;

alter table public.question_attempts alter column option_id drop not null;
alter table public.question_attempts add column if not exists answer_text text check (char_length(answer_text) <= 200);
alter table public.question_attempts add column if not exists grade text check (grade in ('exact', 'fuzzy', 'wrong', 'unsure'));

-- Written questions are published with accepted answers and no options.
create or replace function public.check_question_publishable() returns trigger
language plpgsql as $$
declare n int; c int;
begin
  if new.status = 'published' then
    select count(*), count(*) filter (where is_correct) into n, c from public.question_options where question_id = new.id;
    if new.qtype = 'written' then
      if coalesce(array_length(new.accepted_answers, 1), 0) < 1 or n <> 0 then
        raise exception 'written question % needs at least one accepted answer and no options to be published', new.id using errcode = '23514';
      end if;
    elsif n <> 4 or c <> 1 then
      raise exception 'question % needs exactly 4 options and 1 correct answer to be published', new.id using errcode = '23514';
    end if;
    if new.published_at is null then new.published_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Arabic normalisation and grading
-- ---------------------------------------------------------------------------
create or replace function public.ar_normalize(p text) returns text
language plpgsql immutable set search_path = public as $$
declare v text := lower(coalesce(left(p, 300), ''));
begin
  -- Diacritics (tashkeel), superscript alef and tatweel.
  v := regexp_replace(v, '[ً-ٰٟـ]', '', 'g');
  -- Letter variants that students write interchangeably.
  v := translate(v, 'أإآٱىةؤئ', 'اااايهوي');
  -- Arabic-Indic and Persian digits.
  v := translate(v, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  -- Arabic punctuation, quotes, brackets and other symbols → space.
  v := regexp_replace(v, '[،؛؟٪-٭۔]', ' ', 'g');
  v := regexp_replace(v, '[^0-9a-zء-ي ]', ' ', 'g');
  return btrim(regexp_replace(v, '\s+', ' ', 'g'));
end $$;

/** A word without the definite article (only when something meaningful remains). */
create or replace function public.ar_stem(p text) returns text language sql immutable as $$
  select case when p like 'ال%' and char_length(p) > 4 then substr(p, 3)
              when p like 'وال%' and char_length(p) > 5 then substr(p, 4) else p end
$$;

create or replace function public.ar_words(p text) returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(public.ar_stem(w) order by n), '{}') from unnest(string_to_array(p, ' ')) with ordinality as t(w, n) where w <> ''
$$;

/** Levenshtein distance (bounded inputs). */
create or replace function public.ar_lev(a text, b text) returns int
language plpgsql immutable as $$
declare
  la int := char_length(a); lb int := char_length(b);
  prev int[]; cur int[]; i int; j int; cost int;
begin
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  if la > 80 or lb > 80 then return greatest(la, lb); end if;
  prev := array(select generate_series(0, lb));
  for i in 1 .. la loop
    cur := array[i];
    for j in 1 .. lb loop
      cost := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      cur := cur || least(prev[j + 1] + 1, cur[j] + 1, prev[j] + cost);
    end loop;
    prev := cur;
  end loop;
  return prev[lb + 1];
end $$;

/** Words whose presence reverses the meaning. */
create or replace function public.ar_negations(w text[]) returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct x order by x), '{}') from unnest(w) x
  where x in ('لا', 'ليس', 'ليست', 'لم', 'لن', 'غير', 'عدم', 'بدون', 'بلا', 'ما', 'ممنوع')
     or x like 'لا%' and char_length(x) > 4 and x not like 'لاس%'
$$;

create or replace function public.ar_numbers(p text) returns text[] language sql immutable as $$
  select coalesce(array_agg(m[1] order by m[1]), '{}') from regexp_matches(p, '([0-9]+)', 'g') m
$$;

/**
 * Word-by-word tolerant match: same number of words, the same negations and numbers,
 * each word within a small edit distance that grows with its length
 * (≤3 letters: exact · 4–6: 1 edit · 7+: 2 edits), and a bounded total.
 */
create or replace function public.ar_fuzzy_match(n text, a text) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  wn text[] := public.ar_words(n); wa text[] := public.ar_words(a);
  i int; d int; total int := 0; len int := 0; allowed int;
begin
  if array_length(wn, 1) is distinct from array_length(wa, 1) or wn = '{}' then return false; end if;
  if public.ar_negations(string_to_array(n, ' ')) <> public.ar_negations(string_to_array(a, ' ')) then return false; end if;
  if public.ar_numbers(n) <> public.ar_numbers(a) then return false; end if;
  for i in 1 .. array_length(wa, 1) loop
    len := len + char_length(wa[i]);
    if wn[i] = wa[i] then continue; end if;
    if wa[i] ~ '[0-9]' or wn[i] ~ '[0-9]' then return false; end if;
    allowed := case when char_length(wa[i]) <= 3 then 0 when char_length(wa[i]) <= 6 then 1 else 2 end;
    d := public.ar_lev(wn[i], wa[i]);
    if d > allowed then return false; end if;
    total := total + d;
  end loop;
  return total <= greatest(1, len / 6);
end $$;

/** 'correct' | 'wrong' | 'unsure' for a written answer. The answer key never leaves the database. */
create or replace function public.grade_written(p_question uuid, p_answer text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  q public.questions%rowtype;
  n text := public.ar_normalize(p_answer);
  ns text;
  a text; r text;
  v_strict boolean;
  fuzzy boolean := false;
  near boolean := false;
begin
  select * into q from public.questions where id = p_question;
  if not found or q.qtype <> 'written' then raise exception 'not a written question' using errcode = '22023'; end if;
  if n = '' or char_length(n) > 150 then return 'wrong'; end if;
  ns := array_to_string(public.ar_words(n), ' ');
  v_strict := coalesce((q.grading ->> 'strict')::boolean, false);
  -- 1–2. Exact match with an accepted answer (ignoring the article, spaces and diacritics).
  foreach a in array q.accepted_answers loop
    a := public.ar_normalize(a);
    if n = a or ns = array_to_string(public.ar_words(a), ' ') or replace(n, ' ', '') = replace(a, ' ', '') then return 'correct'; end if;
  end loop;
  -- Known wrong answers are never accepted, however the accepted ones are spelled.
  foreach r in array q.rejected_answers loop
    r := public.ar_normalize(r);
    if n = r or ns = array_to_string(public.ar_words(r), ' ') or replace(n, ' ', '') = replace(r, ' ', '') then return 'wrong'; end if;
  end loop;
  -- 3. Bounded spelling tolerance.
  foreach a in array q.accepted_answers loop
    a := public.ar_normalize(a);
    if public.ar_fuzzy_match(n, a) then fuzzy := true;
    elsif char_length(n) >= 6 and public.ar_lev(n, a) * 10 <= char_length(a) * 3
          and public.ar_negations(string_to_array(n, ' ')) = public.ar_negations(string_to_array(a, ' '))
          and public.ar_numbers(n) = public.ar_numbers(a) then near := true;
    end if;
  end loop;
  if fuzzy then
    -- 4. Ambiguity: as close to a known wrong answer, or a strict term (names, religious terms): ask again.
    foreach r in array q.rejected_answers loop
      if public.ar_fuzzy_match(n, public.ar_normalize(r)) then return 'unsure'; end if;
    end loop;
    if v_strict then return 'unsure'; end if;
    return 'correct';
  end if;
  if near then return 'unsure'; end if;
  return 'wrong';
end $$;
revoke execute on function public.grade_written(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Quiz sessions with shuffled options and written questions
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
           case when q.qtype = 'mcq' then (select string_agg(o, '' order by public.secure_random()) from unnest(array['a', 'b', 'c', 'd']) o) end
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

/** Shared answer bookkeeping: attempts, result, rewards. Caller has locked the session and question. */
create or replace function public.record_answer(p_session uuid, p_student uuid, p_sq public.session_questions, p_correct boolean,
                                                p_option char(1), p_text text, p_grade text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_attempt int := p_sq.attempts + 1;
  v_result text;
  v_rule public.reward_rules%rowtype;
  v_reward jsonb := null;
  v_tx bigint;
  v_last timestamptz;
  v_q public.questions%rowtype;
begin
  select * into v_q from public.questions where id = p_sq.question_id;
  select max(created_at) into v_last from public.question_attempts where session_id = p_session;
  insert into public.question_attempts (session_id, student_id, question_id, attempt_no, option_id, answer_text, grade, is_correct, hint_used, elapsed_ms)
  values (p_session, p_student, p_sq.question_id, v_attempt, p_option, left(p_text, 200), p_grade, p_correct, p_sq.hint_used,
          (extract(epoch from (now() - coalesce(v_last, (select started_at from public.quiz_sessions where id = p_session)))) * 1000)::int);

  if p_correct then
    v_result := case when v_attempt = 1 and not p_sq.hint_used then 'first' else 'assisted' end;
  elsif v_attempt >= 2 then
    v_result := 'missed';
  end if;
  update public.session_questions
     set attempts = v_attempt, result = v_result, finalized_at = case when v_result is not null then now() end
   where session_id = p_session and question_id = p_sq.question_id;

  if v_result in ('first', 'assisted') then
    select * into v_rule from public.reward_rules where key = case when v_result = 'first' then 'first_try' else 'assisted' end;
    insert into public.reward_transactions (student_id, kind, ref, xp, coins, session_id)
    values (p_student, 'question', p_sq.question_id::text, v_rule.xp, v_rule.coins, p_session)
    on conflict (student_id, kind, ref) do nothing
    returning id into v_tx;
    v_reward := case when v_tx is null then jsonb_build_object('xp', 0, 'coins', 0, 'already_rewarded', true)
                     else jsonb_build_object('xp', v_rule.xp, 'coins', v_rule.coins, 'already_rewarded', false) end;
  end if;

  return jsonb_build_object(
    'feedback', case when p_correct then 'correct' when v_result = 'missed' then 'revealed' else 'try-again' end,
    'result', v_result,
    'attempt', v_attempt,
    'correct_option', case when v_result is not null and v_q.qtype = 'mcq' then
        strpos(p_sq.option_order, (select option_id from public.question_options where question_id = v_q.id and is_correct))::text end,
    'correct_answer', case when v_result is not null and v_q.qtype = 'written' then v_q.accepted_answers[1] end,
    'explanation', case when v_result is not null then v_q.explanation end,
    'hint', case when v_result is null then v_q.hint end,
    'reward', v_reward);
end $$;
revoke execute on function public.record_answer(uuid, uuid, public.session_questions, boolean, char, text, text) from public, anon, authenticated;

create or replace function public.lock_session_question(p_session uuid, p_question uuid, p_student uuid) returns public.session_questions
language plpgsql security definer set search_path = public as $$
declare
  v_sq public.session_questions%rowtype;
  v_limit int;
begin
  perform 1 from public.quiz_sessions where id = p_session and student_id = p_student and status = 'active' for update;
  if not found then raise exception 'session not active' using errcode = 'P0002'; end if;
  select * into v_sq from public.session_questions where session_id = p_session and question_id = p_question for update;
  if not found then raise exception 'question not in session' using errcode = 'P0002'; end if;
  if v_sq.result is not null then raise exception 'already answered' using errcode = 'P0003'; end if;
  select max_answers_per_minute into v_limit from public.game_settings;
  if (select count(*) from public.question_attempts where student_id = p_student and created_at > now() - interval '1 minute') >= v_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return v_sq;
end $$;
revoke execute on function public.lock_session_question(uuid, uuid, uuid) from public, anon, authenticated;

/** Multiple choice: p_option is the display key '1'..'4' of this session. */
create or replace function public.submit_answer(p_session uuid, p_question uuid, p_option text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_sq public.session_questions%rowtype;
  v_letter char(1);
  v_correct char(1);
begin
  if p_option is null or p_option not in ('1', '2', '3', '4') then raise exception 'invalid option' using errcode = '22023'; end if;
  v_sq := public.lock_session_question(p_session, p_question, v_student);
  if v_sq.option_order is null then raise exception 'not a multiple-choice question' using errcode = '22023'; end if;
  v_letter := substr(v_sq.option_order, p_option::int, 1);
  if exists (select 1 from public.question_attempts where session_id = p_session and question_id = p_question and option_id = v_letter) then
    raise exception 'option already tried' using errcode = 'P0003';
  end if;
  select option_id into v_correct from public.question_options where question_id = p_question and is_correct;
  return public.record_answer(p_session, v_student, v_sq, v_letter = v_correct, v_letter, null, null);
end $$;

/** Written answer: graded on the server; a doubtful answer gets one free retry. */
create or replace function public.submit_written(p_session uuid, p_question uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_sq public.session_questions%rowtype;
  v_verdict text;
  v_norm text := public.ar_normalize(p_text);
begin
  if v_norm = '' then raise exception 'empty answer' using errcode = '22023'; end if;
  if char_length(p_text) > 200 then raise exception 'answer too long' using errcode = '22023'; end if;
  v_sq := public.lock_session_question(p_session, p_question, v_student);
  if v_sq.option_order is not null then raise exception 'not a written question' using errcode = '22023'; end if;
  if exists (select 1 from public.question_attempts where session_id = p_session and question_id = p_question and public.ar_normalize(answer_text) = v_norm) then
    raise exception 'option already tried' using errcode = 'P0003';
  end if;
  v_verdict := public.grade_written(p_question, p_text);
  if v_verdict = 'unsure' and v_sq.unsure_count < 1 then
    update public.session_questions set unsure_count = unsure_count + 1 where session_id = p_session and question_id = p_question;
    return jsonb_build_object('feedback', 'unsure', 'result', null, 'attempt', v_sq.attempts, 'correct_option', null, 'correct_answer', null,
                              'explanation', null, 'hint', null, 'reward', null);
  end if;
  return public.record_answer(p_session, v_student, v_sq, v_verdict = 'correct', null, p_text,
                              case v_verdict when 'correct' then case when exists (
                                select 1 from unnest((select accepted_answers from public.questions where id = p_question)) a
                                where public.ar_normalize(a) = v_norm) then 'exact' else 'fuzzy' end
                                when 'unsure' then 'unsure' else 'wrong' end);
end $$;

-- ---------------------------------------------------------------------------
-- Admin: author written questions and test the grader
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_question(p_question jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_id uuid := nullif(p_question ->> 'id', '')::uuid;
  v_old public.questions%rowtype;
  v_type text := coalesce(nullif(p_question ->> 'qtype', ''), 'mcq');
  v_opts jsonb := p_question -> 'options';
  v_correct text := p_question ->> 'correct_option';
  v_accepted text[];
  v_rejected text[];
  v_lesson public.lessons%rowtype;
  v_was_published boolean := false;
  i int;
begin
  if v_type not in ('mcq', 'written') then raise exception 'invalid question type' using errcode = '22023'; end if;
  if v_type = 'mcq' then
    if jsonb_typeof(v_opts) <> 'array' or jsonb_array_length(v_opts) <> 4 then raise exception 'exactly four options are required' using errcode = '22023'; end if;
    if v_correct not in ('a', 'b', 'c', 'd') then raise exception 'choose the correct option' using errcode = '22023'; end if;
  else
    v_accepted := array(select btrim(x) from jsonb_array_elements_text(coalesce(p_question -> 'accepted_answers', '[]')) x where btrim(x) <> '');
    v_rejected := array(select btrim(x) from jsonb_array_elements_text(coalesce(p_question -> 'rejected_answers', '[]')) x where btrim(x) <> '');
    if coalesce(array_length(v_accepted, 1), 0) < 1 then raise exception 'at least one accepted answer is required' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_accepted || v_rejected) x where char_length(x) > 100) then raise exception 'answers are limited to 100 characters' using errcode = '22023'; end if;
  end if;
  select * into v_lesson from public.lessons where id = (p_question ->> 'lesson_id')::uuid;
  if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;

  if v_id is null then
    insert into public.questions (subject_id, lesson_id, text, hint, explanation, difficulty, status, origin, source_textbook_id,
                                  source_label, source_page, source_quote, created_by, updated_by, sort_key, qtype, accepted_answers, rejected_answers, grading)
    values (v_lesson.subject_id, v_lesson.id, p_question ->> 'text', coalesce(p_question ->> 'hint', ''), coalesce(p_question ->> 'explanation', ''),
            coalesce((p_question ->> 'difficulty')::smallint, 2), 'draft', 'manual', nullif(p_question ->> 'source_textbook_id', '')::uuid,
            coalesce(p_question ->> 'source_label', ''), nullif(p_question ->> 'source_page', '')::int, coalesce(p_question ->> 'source_quote', ''),
            v_admin, v_admin, (select coalesce(max(sort_key), 0) + 1 from public.questions where lesson_id = v_lesson.id),
            v_type, coalesce(v_accepted, '{}'), coalesce(v_rejected, '{}'),
            jsonb_build_object('strict', coalesce((p_question -> 'grading' ->> 'strict')::boolean, false)))
    returning id into v_id;
    insert into public.content_reviews (question_id, reviewer_id, action, to_status) values (v_id, v_admin, 'create', 'draft');
  else
    select * into v_old from public.questions where id = v_id for update;
    if not found then raise exception 'question not found' using errcode = 'P0002'; end if;
    v_was_published := v_old.status = 'published';
    update public.questions set
      lesson_id = v_lesson.id, subject_id = v_lesson.subject_id,
      text = p_question ->> 'text', hint = coalesce(p_question ->> 'hint', ''), explanation = coalesce(p_question ->> 'explanation', ''),
      difficulty = coalesce((p_question ->> 'difficulty')::smallint, difficulty),
      source_page = nullif(p_question ->> 'source_page', '')::int,
      source_quote = coalesce(p_question ->> 'source_quote', source_quote),
      qtype = v_type,
      accepted_answers = coalesce(v_accepted, '{}'),
      rejected_answers = coalesce(v_rejected, '{}'),
      grading = jsonb_build_object('strict', coalesce((p_question -> 'grading' ->> 'strict')::boolean, false)),
      status = case when status = 'published' then 'approved' else status end,
      updated_by = v_admin
    where id = v_id;
    insert into public.content_reviews (question_id, reviewer_id, action, from_status, to_status, note, changes)
      values (v_id, v_admin, 'edit', v_old.status, v_old.status, coalesce(p_question ->> 'note', ''),
              jsonb_build_object('text', v_old.text <> p_question ->> 'text', 'qtype', v_type));
  end if;

  delete from public.question_options where question_id = v_id;
  if v_type = 'mcq' then
    for i in 0 .. 3 loop
      insert into public.question_options (question_id, option_id, text, is_correct)
      values (v_id, (array['a', 'b', 'c', 'd'])[i + 1], v_opts ->> i, (array['a', 'b', 'c', 'd'])[i + 1] = v_correct);
    end loop;
  end if;
  if v_was_published then
    update public.questions set status = 'published' where id = v_id;
  end if;
  perform public.refresh_lesson_missions(v_lesson.id);
  if v_old.lesson_id is not null and v_old.lesson_id <> v_lesson.id then perform public.refresh_lesson_missions(v_old.lesson_id); end if;
  return v_id;
end $$;

create or replace function public.admin_test_grading(p_question uuid, p_answer text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object('verdict', public.grade_written(p_question, p_answer), 'normalized', public.ar_normalize(p_answer));
end $$;

-- ---------------------------------------------------------------------------
-- Parents: results by question type
-- ---------------------------------------------------------------------------
create or replace function public.parent_child_question_types(p_student uuid, p_days int default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_since timestamptz := case when p_days is null or p_days <= 0 then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;
begin
  if not public.is_parent_of(p_student) then raise exception 'not your child' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(qtype, x) from (
    select q.qtype, jsonb_build_object('answered', count(*), 'first_try', count(*) filter (where sq.result = 'first'),
             'assisted', count(*) filter (where sq.result = 'assisted'), 'missed', count(*) filter (where sq.result = 'missed')) x
    from public.session_questions sq join public.quiz_sessions s on s.id = sq.session_id join public.questions q on q.id = sq.question_id
    where s.student_id = p_student and sq.result is not null and sq.finalized_at >= v_since
    group by q.qtype) t), '{}'::jsonb);
end $$;

revoke execute on function public.submit_written(uuid, uuid, text), public.admin_test_grading(uuid, text),
  public.parent_child_question_types(uuid, int), public.ar_normalize(text) from public, anon;
grant execute on function public.start_quiz_session(uuid), public.submit_answer(uuid, uuid, text), public.submit_written(uuid, uuid, text),
  public.admin_save_question(jsonb), public.admin_test_grading(uuid, text), public.parent_child_question_types(uuid, int),
  public.ar_normalize(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Written questions derived from the published, textbook-based MCQs: the accepted
-- answer is the MCQ's correct option (plus equivalent spellings), and the three
-- distractors become known wrong answers. Reviewed items are published; the rest stay
-- drafts for a teacher. Questions with an open academic flag are never converted.
-- ---------------------------------------------------------------------------
create temporary table _written (legacy text, accepted text[], rejected text[], is_strict boolean, status text);
insert into _written values
  ('rv8.u1.l2.5', array['المغفرة والأجر العظيم']::text[], array['حبوط العمل','الإنذار والتحذير','عدم قبول الأعمال']::text[], false, 'draft'),
  ('rv8.u1.l6.1', array['خيانتهم وغدرهم']::text[], array['رفضهم دفع الجزية','انضمامهم إلى المنافقين','خروجهم مع قريش في غزوة بدر']::text[], false, 'draft'),
  ('rv8.u1.l6.3b', array['حيي بن أخطب']::text[], array['نعيم بن مسعود','سلمان الفارسي','سعد بن معاذ']::text[], true, 'published'),
  ('rv8.u1.l6.15', array['يهود بني قريظة']::text[], array['يهود بني النضير','يهود خيبر','يهود بني قينقاع']::text[], false, 'draft'),
  ('rv8.u2.l1.info-3a', array['اللسان']::text[], array['الحلق','الشفتان','الجوف']::text[], false, 'published'),
  ('rv8.u2.l1.info-4a', array['سبع حالات فقط']::text[], array['خمس حالات','ثلاث حالات','عشر حالات']::text[], false, 'draft'),
  ('rv8.u2.l2.8a', array['يُفضي إلى القتال']::text[], array['يؤدي إلى زيادة المحبة','لا تترتب عليه عاقبة','يؤدي إلى قوة المجتمع']::text[], false, 'draft'),
  ('rv8.u2.l2.9', array['رابطة الأخوة الإيمانية']::text[], array['رابطة النسب','رابطة الجوار','رابطة المصلحة']::text[], false, 'draft'),
  ('rv8.u2.l4.14c', array['غير جائزة','غير جائز','لا تجوز','لا يجوز']::text[], array['جائزة','مستحبة','واجبة']::text[], true, 'published'),
  ('rv8.u2.l5.18a', array['غض البصر']::text[], array['اللباس الشرعي','العفة','تحريم الخلوة']::text[], false, 'published'),
  ('rv8.u2.l5.18b', array['الخلوة المحرّمة']::text[], array['إظهار الزينة','ترقيق الصوت عند الكلام','غض البصر']::text[], false, 'draft'),
  ('rv8.u2.l6.5', array['بضعًا وعشرين ليلة']::text[], array['ثلاث ليالٍ','سبع ليالٍ','أربعين ليلة']::text[], false, 'draft'),
  ('rv8.u2.l6.8', array['«قضيتَ بحكم الله»']::text[], array['«قوموا إلى سيدكم»','«لا يصلّينّ أحد العصر إلا في بني قريظة»','«الآن نغزوهم ولا يغزوننا»']::text[], false, 'draft'),
  ('rv8.u2.l7.4', array['تحمّل المسؤولية']::text[], array['الودائع المالية فقط','حفظ الأسرار فقط','رد الأشياء المستعارة']::text[], false, 'draft'),
  ('rv8.u3.l1.7a', array['الناس']::text[], array['قل','أعوذ','برب']::text[], true, 'published'),
  ('rv8.u3.l2.11-1', array['التوسل بإظهار الضعف']::text[], array['الاعتراف بفضل الله تعالى','إظهار الغرض النبيل من الدعاء','الإلحاح في الدعاء']::text[], false, 'draft'),
  ('rv8.u3.l3.10', array['البهتان']::text[], array['الغيبة','النميمة','النصيحة']::text[], false, 'published'),
  ('rv8.u3.l4.1', array['مرة واحدة','مرة','1']::text[], array['مرتين','ثلاث مرات','سبع مرات']::text[], false, 'published'),
  ('rv8.u3.l4.3', array['الخالق والبارئ']::text[], array['السميع والبصير','الرحمن والرحيم','العزيز والحكيم']::text[], false, 'draft'),
  ('rv8.u3.l4.10c', array['عدم الغرور']::text[], array['تجنّب تغيير خلق الله','الحرص على المظهر الحسن','الرضا بخلقة الله']::text[], false, 'draft'),
  ('rv8.u3.l5.6a', array['الواجب','الفرض','الواجب الفرض']::text[], array['المندوب','المباح','المكروه']::text[], false, 'published'),
  ('rv8.u3.l5.6b', array['المندوب']::text[], array['الواجب','المباح','المحرّم']::text[], false, 'published'),
  ('rv8.u3.l5.6c', array['المكروه']::text[], array['المحرّم','المندوب','المباح']::text[], false, 'published'),
  ('rv8.u3.l5.6d', array['المباح']::text[], array['المندوب','المكروه','الواجب']::text[], false, 'published'),
  ('rv8.u3.l5.7a', array['فرض عين','فرض العين']::text[], array['فرض كفاية','مندوبًا','مباحًا']::text[], false, 'published'),
  ('rv8.u3.l5.9-1', array['واجب','فرض','الواجب','الفرض']::text[], array['مندوب','مباح','مكروه']::text[], false, 'published'),
  ('rv8.u3.l5.9-2', array['مباح','المباح']::text[], array['واجب','محرّم','مكروه']::text[], false, 'published'),
  ('rv8.u3.l5.9-3', array['محرم','المحرم','حرام']::text[], array['مكروه','مباح','مندوب']::text[], false, 'published'),
  ('rv8.u3.l5.9-4', array['مندوب','المندوب']::text[], array['واجب','مباح','مكروه']::text[], false, 'published'),
  ('rv8.u3.l5.9-5', array['مكروه','المكروه']::text[], array['محرّم','مباح','مندوب']::text[], false, 'published'),
  ('rv8.u4.l1.3b', array['الوهن والضعف','الضعف والوهن']::text[], array['القوة والمتانة','الجمال والإتقان','الاتساع وكثرة الغرف']::text[], false, 'published'),
  ('rv8.u4.l1.3e', array['تشبيه تمثيلي','التشبيه التمثيلي']::text[], array['تشبيه بليغ','استعارة مكنية','تشبيه مجمل']::text[], false, 'published'),
  ('rv8.u4.l3.17b', array['شكر الله تعالى']::text[], array['ترك البخل والشح','التلطف عند التصدق','الاستعفاف عمّا في أيدي الناس']::text[], false, 'draft'),
  ('rv8.u4.l3.17c', array['ترك البخل والشح']::text[], array['شكر الله تعالى','الدعاء والتوسل باسم الله الغني','التلطف عند التصدق']::text[], false, 'draft'),
  ('rv8.u4.l4.13d', array['خمسة','خمس','5']::text[], array['ثلاثة','سبعة','أربعة']::text[], false, 'published'),
  ('rv8.u4.l4.22', array['الجدال وارتكاب المعاصي']::text[], array['الطواف والسعي','التلبية والدعاء','الصلاة بعد الإحرام']::text[], false, 'draft'),
  ('rv8.u4.l4.26a', array['لا يجوز','غير جائز']::text[], array['جائز','مستحب','واجب']::text[], true, 'published'),
  ('rv8.u4.l5.2', array['المجوسية','عبادة النار']::text[], array['النصرانية','اليهودية','عبادة الأصنام']::text[], false, 'published'),
  ('rv8.u4.l5.13a', array['حفر الخندق','أشار بحفر الخندق']::text[], array['حمل راية المسلمين','فاوض قريشًا على الصلح','تولّى إمارة المدائن']::text[], false, 'published');
insert into public.questions (subject_id, lesson_id, legacy_id, text, hint, explanation, difficulty, status, origin, source_label, source_page,
                              source_quote, sort_key, qtype, accepted_answers, rejected_answers, grading, derived_from, validation)
select s.subject_id, s.lesson_id, s.legacy_id || '.w', s.text, s.hint, s.explanation, s.difficulty, 'draft', 'manual', s.source_label, s.source_page,
       -- Never in the same mission right after its source MCQ (which would reveal the answer): at the far end of
       -- the lesson from it when the lesson has several missions, otherwise just before the MCQ.
       s.source_quote,
       case when (select count(*) from public.questions x where x.lesson_id = s.lesson_id and x.status = 'published') <= 10 then s.sort_key - 1
            when s.sort_key * 2 > (select min(sort_key) + max(sort_key) from public.questions x where x.lesson_id = s.lesson_id and x.status = 'published')
              then (select min(sort_key) - 1 from public.questions x where x.lesson_id = s.lesson_id and x.status = 'published')
            else (select max(sort_key) + 1 from public.questions x where x.lesson_id = s.lesson_id and x.status = 'published') end,
       'written', w.accepted, w.rejected, jsonb_build_object('strict', w.is_strict), s.id,
       jsonb_build_object('derived_from_mcq', true)
from _written w join public.questions s on s.legacy_id = w.legacy
where s.status = 'published' and not s.needs_academic_review
  and not exists (select 1 from public.academic_flags f where f.question_id = s.id and f.status = 'open')
on conflict (legacy_id) do nothing;
insert into public.content_reviews (question_id, action, to_status, note)
select q.id, 'create', 'draft', 'كتابي مشتق من سؤال اختيار من متعدد منشور'
from public.questions q where q.qtype = 'written' and q.legacy_id like '%.w'
  and not exists (select 1 from public.content_reviews r where r.question_id = q.id);
-- Publish the reviewed items (the trigger checks they have accepted answers and no options).
update public.questions q set status = 'published'
from _written w where q.legacy_id = w.legacy || '.w' and w.status = 'published' and q.status = 'draft';
insert into public.content_reviews (question_id, action, from_status, to_status, note)
select q.id, 'publish', 'draft', 'published', 'إجابة قصيرة واضحة من مفتاح الإجابة المعتمد'
from public.questions q join _written w on q.legacy_id = w.legacy || '.w' where w.status = 'published';
select public.refresh_lesson_missions(l) from (select distinct lesson_id l from public.questions where qtype = 'written') x;
drop table _written;

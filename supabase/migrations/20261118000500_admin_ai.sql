-- ============================================================================
-- Phase B: administrator tools, AI jobs (resumable, batched, cost-capped),
-- review/publish workflow, audit triggers and reports.
-- AI generation is OFF by default and every job needs an explicit admin
-- confirmation after seeing a cost estimate.
-- ============================================================================

create table public.ai_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  model text not null default 'claude-opus-5-5' check (model in ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5')),
  effort text not null default 'medium' check (effort in ('low', 'medium', 'high')),
  pages_per_batch int not null default 6 check (pages_per_batch between 1 and 20),
  max_pages_per_job int not null default 60 check (max_pages_per_job between 1 and 600),
  max_questions_per_job int not null default 30 check (max_questions_per_job between 1 and 200),
  daily_question_limit int not null default 150 check (daily_question_limit between 0 and 5000),
  daily_page_limit int not null default 200 check (daily_page_limit between 0 and 5000),
  max_concurrent_jobs int not null default 2 check (max_concurrent_jobs between 1 and 10),
  monthly_budget_usd numeric(10, 2) not null default 10 check (monthly_budget_usd >= 0),
  -- USD per million tokens, used for estimates and for the recorded cost of finished batches.
  price_input_per_mtok numeric(8, 3) not null default 4,
  price_output_per_mtok numeric(8, 3) not null default 20,
  updated_at timestamptz not null default now()
);
insert into public.ai_settings default values;

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('extract', 'generate')),
  status text not null default 'awaiting_confirmation'
    check (status in ('awaiting_confirmation', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  textbook_id uuid references public.textbooks (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  lesson_id uuid references public.lessons (id) on delete set null,
  page_from int not null check (page_from > 0),
  page_to int not null check (page_to >= page_from),
  question_count int not null default 0 check (question_count between 0 and 200),
  difficulty smallint check (difficulty between 1 and 3),
  mode text check (mode in ('convert', 'new', 'concept')),
  concept text not null default '' check (char_length(concept) <= 300),
  regenerate_question_id uuid references public.questions (id) on delete set null,
  force boolean not null default false,       -- re-extract pages that already have text
  model text not null,
  estimate jsonb not null default '{}',
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  questions_created int not null default 0,
  questions_rejected int not null default 0,
  error text,
  created_by uuid references public.profiles (id) on delete set null,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_jobs_status_idx on public.ai_jobs (status, created_at desc);

create table public.ai_job_batches (
  job_id uuid not null references public.ai_jobs (id) on delete cascade,
  batch_no int not null,
  page_from int not null,
  page_to int not null,
  question_count int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'skipped', 'cancelled')),
  attempts int not null default 0,
  locked_until timestamptz,
  error text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  result_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (job_id, batch_no)
);

-- Questions printed in the source (with their documented answers), found during extraction.
alter table public.textbook_pages add column source_questions jsonb not null default '[]';

alter table public.questions
  add constraint questions_generation_job_fk foreign key (generation_job_id) references public.ai_jobs (id) on delete set null;

alter table public.ai_settings enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.ai_job_batches enable row level security;
create policy ai_settings_admin on public.ai_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ai_jobs_admin on public.ai_jobs for select to authenticated using (public.is_admin());
create policy ai_job_batches_admin on public.ai_job_batches for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.ai_jobs, public.ai_job_batches from authenticated;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Audit trail: every change to content and settings, with the acting admin.
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_changed jsonb := '{}';
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k not in ('updated_at') and v_new -> k is distinct from v_old -> k then
        v_changed := v_changed || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
      end if;
    end loop;
    if v_changed = '{}' then return new; end if;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'question_id', v_old ->> 'question_id'),
          case tg_op when 'UPDATE' then v_changed when 'INSERT' then jsonb_build_object('row', v_new) else jsonb_build_object('row', v_old) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['subjects', 'units', 'lessons', 'textbooks', 'questions', 'question_options', 'ai_settings', 'shop_items', 'reward_rules', 'game_settings', 'academic_flags'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'administrator required' using errcode = '42501'; end if;
  return auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- Question review workflow
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_question_status(p_ids uuid[], p_status public.question_status, p_note text default '')
returns int language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_q record;
  v_n int := 0;
  v_action text;
  v_lessons uuid[] := '{}';
begin
  v_action := case p_status when 'published' then 'publish' when 'approved' then 'approve' when 'rejected' then 'reject'
                            when 'archived' then 'archive' when 'draft' then 'draft' else 'flag' end;
  for v_q in select id, status, lesson_id from public.questions where id = any (p_ids) for update loop
    if v_q.status = p_status then continue; end if;
    if v_q.status = 'published' and p_status <> 'published' then v_action := 'unpublish'; end if;
    update public.questions set status = p_status, updated_by = v_admin where id = v_q.id;
    insert into public.content_reviews (question_id, reviewer_id, action, from_status, to_status, note)
      values (v_q.id, v_admin, v_action, v_q.status, p_status, coalesce(p_note, ''));
    v_lessons := array_append(v_lessons, v_q.lesson_id);
    v_n := v_n + 1;
  end loop;
  perform public.refresh_lesson_missions(l) from unnest(array(select distinct x from unnest(v_lessons) x)) l;
  return v_n;
end $$;

/** Saves an edited question (text, options, correct answer, hint, explanation...). Published questions stay published only if still valid. */
create or replace function public.admin_save_question(p_question jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_id uuid := nullif(p_question ->> 'id', '')::uuid;
  v_old public.questions%rowtype;
  v_opts jsonb := p_question -> 'options';
  v_correct text := p_question ->> 'correct_option';
  v_lesson public.lessons%rowtype;
  v_was_published boolean := false;
  i int;
begin
  if jsonb_typeof(v_opts) <> 'array' or jsonb_array_length(v_opts) <> 4 then raise exception 'exactly four options are required' using errcode = '22023'; end if;
  if v_correct not in ('a', 'b', 'c', 'd') then raise exception 'choose the correct option' using errcode = '22023'; end if;
  select * into v_lesson from public.lessons where id = (p_question ->> 'lesson_id')::uuid;
  if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;

  if v_id is null then
    insert into public.questions (subject_id, lesson_id, text, hint, explanation, difficulty, status, origin, source_textbook_id,
                                  source_label, source_page, source_quote, created_by, updated_by, sort_key)
    values (v_lesson.subject_id, v_lesson.id, p_question ->> 'text', coalesce(p_question ->> 'hint', ''), coalesce(p_question ->> 'explanation', ''),
            coalesce((p_question ->> 'difficulty')::smallint, 2), 'draft', 'manual', nullif(p_question ->> 'source_textbook_id', '')::uuid,
            coalesce(p_question ->> 'source_label', ''), nullif(p_question ->> 'source_page', '')::int, coalesce(p_question ->> 'source_quote', ''),
            v_admin, v_admin, (select coalesce(max(sort_key), 0) + 1 from public.questions where lesson_id = v_lesson.id))
    returning id into v_id;
    insert into public.content_reviews (question_id, reviewer_id, action, to_status) values (v_id, v_admin, 'create', 'draft');
  else
    select * into v_old from public.questions where id = v_id for update;
    if not found then raise exception 'question not found' using errcode = 'P0002'; end if;
    v_was_published := v_old.status = 'published';
    -- Temporarily leave 'published' so option rows can be replaced, then restore.
    update public.questions set
      lesson_id = v_lesson.id, subject_id = v_lesson.subject_id,
      text = p_question ->> 'text', hint = coalesce(p_question ->> 'hint', ''), explanation = coalesce(p_question ->> 'explanation', ''),
      difficulty = coalesce((p_question ->> 'difficulty')::smallint, difficulty),
      source_page = nullif(p_question ->> 'source_page', '')::int,
      source_quote = coalesce(p_question ->> 'source_quote', source_quote),
      status = case when status = 'published' then 'approved' else status end,
      updated_by = v_admin
    where id = v_id;
    insert into public.content_reviews (question_id, reviewer_id, action, from_status, to_status, note, changes)
      values (v_id, v_admin, 'edit', v_old.status, v_old.status, coalesce(p_question ->> 'note', ''),
              jsonb_build_object('text', v_old.text <> p_question ->> 'text'));
  end if;

  delete from public.question_options where question_id = v_id;
  for i in 0 .. 3 loop
    insert into public.question_options (question_id, option_id, text, is_correct)
    values (v_id, (array['a', 'b', 'c', 'd'])[i + 1], v_opts ->> i, (array['a', 'b', 'c', 'd'])[i + 1] = v_correct);
  end loop;
  if v_was_published then
    update public.questions set status = 'published' where id = v_id;
  end if;
  perform public.refresh_lesson_missions(v_lesson.id);
  if v_old.lesson_id is not null and v_old.lesson_id <> v_lesson.id then perform public.refresh_lesson_missions(v_old.lesson_id); end if;
  return v_id;
end $$;

create or replace function public.admin_flag_question(p_id uuid, p_flag boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.require_admin();
begin
  update public.questions set needs_academic_review = p_flag, academic_note = coalesce(p_note, ''), updated_by = v_admin where id = p_id;
  insert into public.content_reviews (question_id, reviewer_id, action, note) values (p_id, v_admin, case when p_flag then 'flag' else 'unflag' end, coalesce(p_note, ''));
end $$;

/** Admin view of one question including its answer key (never callable by students). */
create or replace function public.admin_get_question(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.require_admin();
  select to_jsonb(q) || jsonb_build_object(
    'options', (select jsonb_agg(jsonb_build_object('id', o.option_id, 'text', o.text, 'is_correct', o.is_correct) order by o.option_id) from public.question_options o where o.question_id = q.id),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('action', r.action, 'from', r.from_status, 'to', r.to_status, 'note', r.note, 'at', r.created_at) order by r.created_at desc)
                         from public.content_reviews r where r.question_id = q.id), '[]'::jsonb),
    'page_text', (select p.content from public.textbook_pages p where p.textbook_id = q.source_textbook_id and p.page_number = q.source_page)
  ) into v from public.questions q where q.id = p_id;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- AI jobs: create (with estimate) → confirm → worker claims batches → done
-- ---------------------------------------------------------------------------
create or replace function public.ai_estimate(p_kind text, p_pages int, p_questions int, out input_tokens bigint, out output_tokens bigint, out usd numeric)
language plpgsql stable security definer set search_path = public as $$
declare s public.ai_settings%rowtype;
begin
  select * into s from public.ai_settings;
  if p_kind = 'extract' then
    input_tokens := p_pages * 2200 + 1500;   -- page image + text layer + instructions
    output_tokens := p_pages * 1400;         -- page text, headings, source questions (+ reasoning)
  else
    input_tokens := p_pages * 900 + 2500 + p_questions * 60;
    output_tokens := p_questions * 700;      -- question JSON + reasoning
  end if;
  usd := round((input_tokens * s.price_input_per_mtok + output_tokens * s.price_output_per_mtok) / 1000000.0, 4);
end $$;

create or replace function public.admin_create_ai_job(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  s public.ai_settings%rowtype;
  v_kind text := p ->> 'kind';
  v_from int := (p ->> 'page_from')::int;
  v_to int := (p ->> 'page_to')::int;
  v_q int := coalesce((p ->> 'question_count')::int, 0);
  v_pages int;
  v_book public.textbooks%rowtype;
  v_est record;
  v_job uuid;
  v_batch int := 0;
  v_start int;
  v_n int;
  v_size int;
  v_extra int;
  v_per int;
  i int;
begin
  select * into s from public.ai_settings;
  if v_kind not in ('extract', 'generate') then raise exception 'unknown job kind' using errcode = '22023'; end if;
  select * into v_book from public.textbooks where id = (p ->> 'textbook_id')::uuid;
  if not found then raise exception 'textbook not found' using errcode = 'P0002'; end if;
  if v_from is null or v_to is null or v_from < 1 or v_to < v_from then raise exception 'invalid page range' using errcode = '22023'; end if;
  if v_book.page_count is not null and v_book.page_count > 0 and v_to > v_book.page_count then
    raise exception 'page range beyond the book (% pages)', v_book.page_count using errcode = '22023';
  end if;
  v_pages := v_to - v_from + 1;
  if v_pages > s.max_pages_per_job then raise exception 'too many pages for one job (max %)', s.max_pages_per_job using errcode = '22023'; end if;
  if v_kind = 'generate' then
    if v_q < 1 or v_q > s.max_questions_per_job then raise exception 'question count must be 1–%', s.max_questions_per_job using errcode = '22023'; end if;
    if (p ->> 'lesson_id') is null then raise exception 'choose a lesson' using errcode = '22023'; end if;
  end if;

  select * into v_est from public.ai_estimate(v_kind, v_pages, v_q);
  insert into public.ai_jobs (kind, textbook_id, subject_id, unit_id, lesson_id, page_from, page_to, question_count, difficulty, mode, concept,
                              regenerate_question_id, force, model, estimate, created_by)
  values (v_kind, v_book.id, coalesce(nullif(p ->> 'subject_id', '')::uuid, v_book.subject_id), nullif(p ->> 'unit_id', '')::uuid,
          nullif(p ->> 'lesson_id', '')::uuid, v_from, v_to, v_q, nullif(p ->> 'difficulty', '')::smallint,
          case when v_kind = 'generate' then coalesce(p ->> 'mode', 'new') end, coalesce(p ->> 'concept', ''),
          nullif(p ->> 'regenerate_question_id', '')::uuid, coalesce((p ->> 'force')::boolean, false), s.model,
          jsonb_build_object('input_tokens', v_est.input_tokens, 'output_tokens', v_est.output_tokens, 'usd', v_est.usd,
                             'label', 'تقدير تقريبي قبل التنفيذ؛ التكلفة الفعلية تُسجَّل بعد كل دفعة'),
          v_admin)
  returning id into v_job;

  -- Batches: pages for extraction; for generation the questions are spread over page batches.
  v_n := ceil(v_pages / s.pages_per_batch::numeric)::int;
  if v_kind = 'generate' then v_n := least(v_n, v_q); end if;
  v_per := v_pages / v_n; v_extra := v_pages % v_n; v_start := v_from;
  for i in 1 .. v_n loop
    v_size := v_per + case when i <= v_extra then 1 else 0 end;
    insert into public.ai_job_batches (job_id, batch_no, page_from, page_to, question_count)
    values (v_job, i, v_start, v_start + v_size - 1,
            case when v_kind = 'generate' then v_q / v_n + case when i <= v_q % v_n then 1 else 0 end else 0 end);
    v_start := v_start + v_size;
  end loop;
  return jsonb_build_object('job_id', v_job, 'batches', v_n, 'estimate', (select estimate from public.ai_jobs where id = v_job));
end $$;

create or replace function public.ai_usage_today(out questions int, out pages int, out month_usd numeric)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select sum(question_count)::int from public.ai_jobs where kind = 'generate' and confirmed_at >= date_trunc('day', now()) and status <> 'cancelled'), 0),
    coalesce((select sum(page_to - page_from + 1)::int from public.ai_jobs where kind = 'extract' and confirmed_at >= date_trunc('day', now()) and status <> 'cancelled'), 0),
    coalesce((select sum(cost_usd) from public.ai_jobs where created_at >= date_trunc('month', now())), 0)
$$;

create or replace function public.admin_confirm_ai_job(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  s public.ai_settings%rowtype;
  j public.ai_jobs%rowtype;
  u record;
begin
  select * into s from public.ai_settings;
  select * into j from public.ai_jobs where id = p_job for update;
  if not found or j.status <> 'awaiting_confirmation' then raise exception 'job is not awaiting confirmation' using errcode = 'P0003'; end if;
  if not s.enabled then raise exception 'AI generation is disabled in settings' using errcode = 'P0001'; end if;
  if (select count(*) from public.ai_jobs where status in ('queued', 'running')) >= s.max_concurrent_jobs then
    raise exception 'too many jobs running (max %)', s.max_concurrent_jobs using errcode = 'P0001';
  end if;
  select * into u from public.ai_usage_today();
  if j.kind = 'generate' and u.questions + j.question_count > s.daily_question_limit then
    raise exception 'daily question limit reached (%)', s.daily_question_limit using errcode = 'P0001';
  end if;
  if j.kind = 'extract' and u.pages + (j.page_to - j.page_from + 1) > s.daily_page_limit then
    raise exception 'daily page limit reached (%)', s.daily_page_limit using errcode = 'P0001';
  end if;
  if u.month_usd + (j.estimate ->> 'usd')::numeric > s.monthly_budget_usd then
    raise exception 'monthly AI budget would be exceeded (US$%)', s.monthly_budget_usd using errcode = 'P0001';
  end if;
  update public.ai_jobs set status = 'queued', confirmed_by = v_admin, confirmed_at = now(), updated_at = now() where id = p_job;
end $$;

create or replace function public.admin_cancel_ai_job(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.ai_jobs set status = 'cancelled', finished_at = now(), updated_at = now()
   where id = p_job and status in ('awaiting_confirmation', 'queued', 'running');
  update public.ai_job_batches set status = 'cancelled', updated_at = now() where job_id = p_job and status in ('pending', 'failed');
end $$;

/** Retry only what failed: completed batches (and already-extracted pages) are never redone. */
create or replace function public.admin_retry_ai_job(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.ai_job_batches set status = 'pending', attempts = 0, error = null, locked_until = null, updated_at = now()
   where job_id = p_job and status in ('failed', 'cancelled');
  update public.ai_jobs set status = 'queued', error = null, finished_at = null, updated_at = now()
   where id = p_job and status in ('failed', 'cancelled', 'completed') and confirmed_at is not null;
end $$;

-- Worker side (service role only): claim one batch atomically; stale locks are reclaimed.
create or replace function public.ai_claim_batch(p_job uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j public.ai_jobs%rowtype;
  b public.ai_job_batches%rowtype;
begin
  select * into j from public.ai_jobs where id = p_job for update;
  if not found or j.status not in ('queued', 'running') then return null; end if;
  select * into b from public.ai_job_batches
   where job_id = p_job and (status = 'pending' or (status = 'running' and locked_until < now()))
   order by batch_no limit 1 for update skip locked;
  if not found then
    -- Nothing left to claim: finish the job if no batch is still running.
    if not exists (select 1 from public.ai_job_batches where job_id = p_job and status = 'running') then
      update public.ai_jobs set
        status = case when exists (select 1 from public.ai_job_batches where job_id = p_job and status = 'failed') then 'failed' else 'completed' end,
        finished_at = now(), updated_at = now()
      where id = p_job;
    end if;
    return null;
  end if;
  update public.ai_job_batches set status = 'running', attempts = attempts + 1, locked_until = now() + interval '5 minutes', updated_at = now()
   where job_id = p_job and batch_no = b.batch_no;
  update public.ai_jobs set status = 'running', updated_at = now() where id = p_job;
  return jsonb_build_object('job', to_jsonb(j), 'batch', to_jsonb(b) || jsonb_build_object('attempts', b.attempts + 1));
end $$;

create or replace function public.ai_finish_batch(p_job uuid, p_batch int, p_status text, p_error text, p_in bigint, p_out bigint, p_created int, p_rejected int)
returns void language plpgsql security definer set search_path = public as $$
declare s public.ai_settings%rowtype;
begin
  select * into s from public.ai_settings;
  update public.ai_job_batches set
    status = case when p_status = 'failed' and attempts < 3 then 'pending' else p_status end,
    error = p_error, input_tokens = input_tokens + p_in, output_tokens = output_tokens + p_out,
    result_count = result_count + coalesce(p_created, 0), locked_until = null, updated_at = now()
  where job_id = p_job and batch_no = p_batch;
  update public.ai_jobs set
    input_tokens = input_tokens + p_in, output_tokens = output_tokens + p_out,
    cost_usd = cost_usd + round((p_in * s.price_input_per_mtok + p_out * s.price_output_per_mtok) / 1000000.0, 4),
    questions_created = questions_created + coalesce(p_created, 0), questions_rejected = questions_rejected + coalesce(p_rejected, 0),
    error = case when p_status = 'failed' then p_error else error end, updated_at = now()
  where id = p_job;
end $$;

revoke execute on function public.ai_claim_batch(uuid), public.ai_finish_batch(uuid, int, text, text, bigint, bigint, int, int)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u record;
begin
  perform public.require_admin();
  select * into u from public.ai_usage_today();
  return jsonb_build_object(
    'subjects', (select count(*) from public.subjects where status <> 'archived'),
    'published_subjects', (select count(*) from public.subjects where status = 'published'),
    'lessons', (select count(*) from public.lessons),
    'questions_published', (select count(*) from public.questions where status = 'published'),
    'questions_review', (select count(*) from public.questions where status in ('needs_review', 'draft', 'approved')),
    'flagged', (select count(*) from public.questions where needs_academic_review),
    'open_flags', (select count(*) from public.academic_flags where status = 'open'),
    'textbooks', (select count(*) from public.textbooks where status <> 'archived'),
    'jobs_active', (select count(*) from public.ai_jobs where status in ('queued', 'running', 'awaiting_confirmation')),
    'students', (select count(*) from public.student_profiles),
    'ai_enabled', (select enabled from public.ai_settings),
    'ai_questions_today', u.questions, 'ai_pages_today', u.pages, 'ai_month_usd', u.month_usd,
    'ai_month_budget', (select monthly_budget_usd from public.ai_settings));
end $$;

create or replace function public.admin_coverage(p_subject uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('lesson_id', l.id, 'unit', u.number, 'lesson', l.number, 'title', l.title, 'status', l.status,
             'pages', concat_ws('–', l.page_start, l.page_end),
             'published', (select count(*) from public.questions q where q.lesson_id = l.id and q.status = 'published'),
             'review', (select count(*) from public.questions q where q.lesson_id = l.id and q.status in ('needs_review', 'draft', 'approved')),
             'rejected', (select count(*) from public.questions q where q.lesson_id = l.id and q.status = 'rejected'),
             'flagged', (select count(*) from public.questions q where q.lesson_id = l.id and q.needs_academic_review),
             'missions', (select count(*) from public.missions m where m.lesson_id = l.id and m.active))
           order by u.number, l.number)
    from public.lessons l join public.units u on u.id = l.unit_id where l.subject_id = p_subject), '[]'::jsonb);
end $$;

/** Accounts whose answers look automated (many sub-1.5 s answers in a day). */
create or replace function public.admin_anomalies() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.fast desc) from (
      select a.student_id, sp.nickname, sp.leaderboard_excluded, date_trunc('day', a.created_at)::date as day,
             count(*) filter (where a.elapsed_ms < 1500) as fast, count(*) as answers,
             round(100.0 * count(*) filter (where a.is_correct) / count(*)) as accuracy
      from public.question_attempts a join public.student_profiles sp on sp.id = a.student_id
      where a.created_at > now() - interval '14 days'
      group by a.student_id, sp.nickname, sp.leaderboard_excluded, date_trunc('day', a.created_at)
      having count(*) filter (where a.elapsed_ms < 1500) >= 15) x), '[]'::jsonb);
end $$;

create or replace function public.admin_set_leaderboard_excluded(p_student uuid, p_excluded boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.student_profiles set leaderboard_excluded = p_excluded where id = p_student;
  perform public.write_audit(case when p_excluded then 'exclude_from_leaderboards' else 'include_in_leaderboards' end, 'student', p_student::text);
end $$;

create or replace function public.admin_resolve_flag(p_flag uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_status not in ('open', 'resolved', 'wont_fix') then raise exception 'invalid status'; end if;
  update public.academic_flags set status = p_status, resolved_by = case when p_status = 'open' then null else auth.uid() end,
         resolved_at = case when p_status = 'open' then null else now() end where id = p_flag;
end $$;

create or replace function public.admin_refresh_missions(p_lesson uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  return public.refresh_lesson_missions(p_lesson);
end $$;

revoke execute on function public.admin_set_question_status(uuid[], public.question_status, text), public.admin_save_question(jsonb),
  public.admin_flag_question(uuid, boolean, text), public.admin_get_question(uuid), public.admin_create_ai_job(jsonb),
  public.admin_confirm_ai_job(uuid), public.admin_cancel_ai_job(uuid), public.admin_retry_ai_job(uuid), public.admin_dashboard(),
  public.admin_coverage(uuid), public.admin_anomalies(), public.admin_set_leaderboard_excluded(uuid, boolean),
  public.admin_resolve_flag(uuid, text), public.admin_refresh_missions(uuid), public.ai_estimate(text, int, int), public.ai_usage_today()
  from public, anon;

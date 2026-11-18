-- ============================================================================
-- Educational content: Subject → Unit → Lesson → Mission → Questions
-- plus textbooks (sources), extracted pages, review records and academic flags.
--
-- Students never read questions or answer keys from tables: they receive one
-- mission at a time from start_quiz_session() WITHOUT correct answers, hints or
-- explanations; those are released by the server only when earned.
-- ============================================================================

create type public.publish_status as enum ('draft', 'published', 'archived');
create type public.question_status as enum ('draft', 'needs_review', 'approved', 'rejected', 'published', 'archived');
create type public.world_theme as enum ('meadow', 'forest', 'desert', 'castle', 'future');

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name_ar text not null check (char_length(name_ar) between 2 and 60),
  name_en text check (char_length(name_en) <= 60),
  grade smallint not null check (grade between 1 and 12),
  semester smallint not null check (semester between 1 and 3),
  description text not null default '' check (char_length(description) <= 400),
  icon text not null default 'book' check (icon in ('book', 'star', 'flask', 'globe', 'calc', 'quill', 'leaf', 'gear')),
  theme public.world_theme not null default 'meadow',
  sort_order int not null default 0,
  status public.publish_status not null default 'draft',
  source_label text not null default '' check (char_length(source_label) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  number smallint not null check (number > 0),
  title text not null check (char_length(title) between 1 and 80),
  sort_order int not null default 0,
  status public.publish_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, number)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  legacy_id text unique,              -- e.g. 'u1-l6' for the bundled Task 05 bank
  number smallint not null check (number > 0),
  title text not null check (char_length(title) between 1 and 120),
  page_start int check (page_start > 0),
  page_end int check (page_end >= page_start),
  sort_order int not null default 0,
  status public.publish_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, number)
);
create index lessons_subject_idx on public.lessons (subject_id);

create table public.textbooks (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects (id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  grade smallint check (grade between 1 and 12),
  semester smallint check (semester between 1 and 3),
  storage_path text unique,           -- private bucket 'textbooks'
  mime_type text check (mime_type in ('application/pdf', 'text/markdown', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes bigint check (size_bytes > 0 and size_bytes <= 52428800),
  page_count int check (page_count >= 0),
  sha256 text,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'processed', 'failed', 'archived')),
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.textbook_pages (
  textbook_id uuid not null references public.textbooks (id) on delete cascade,
  page_number int not null check (page_number > 0),
  content text not null default '',
  content_sha256 text,
  lesson_hint text,                    -- unit/lesson heading detected on the page
  status text not null default 'extracted' check (status in ('extracted', 'empty', 'failed')),
  extracted_by text not null default 'ai' check (extracted_by in ('ai', 'markdown', 'docx', 'manual', 'legacy')),
  extracted_at timestamptz not null default now(),
  primary key (textbook_id, page_number)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,               -- e.g. 'rv8.u1.l6.24' (Task 05 ids are kept)
  subject_id uuid not null references public.subjects (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  text text not null check (char_length(text) between 3 and 600),
  hint text not null default '' check (char_length(hint) <= 300),
  explanation text not null default '' check (char_length(explanation) <= 1200),
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  status public.question_status not null default 'draft',
  origin text not null default 'manual' check (origin in ('legacy_import', 'ai_generated', 'manual')),
  source_textbook_id uuid references public.textbooks (id) on delete set null,
  source_label text not null default '',
  source_page int check (source_page > 0),
  source_quote text not null default '' check (char_length(source_quote) <= 1500),
  -- Academic review is separate from publication status.
  needs_academic_review boolean not null default false,
  academic_note text not null default '',
  validation jsonb not null default '{}',
  generation_job_id uuid,
  sort_key int not null default 0,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_lesson_idx on public.questions (lesson_id, status);
create index questions_status_idx on public.questions (status);

create table public.question_options (
  question_id uuid not null references public.questions (id) on delete cascade,
  option_id char(1) not null check (option_id in ('a', 'b', 'c', 'd')),
  text text not null check (char_length(text) between 1 and 300),
  is_correct boolean not null default false,
  primary key (question_id, option_id)
);
create unique index question_options_one_correct on public.question_options (question_id) where is_correct;

-- A question can only be published with exactly four options and one correct answer.
create or replace function public.check_question_publishable() returns trigger
language plpgsql as $$
declare n int; c int;
begin
  if new.status = 'published' then
    select count(*), count(*) filter (where is_correct) into n, c from public.question_options where question_id = new.id;
    if n <> 4 or c <> 1 then
      raise exception 'question % needs exactly 4 options and 1 correct answer to be published', new.id using errcode = '23514';
    end if;
    if new.published_at is null then new.published_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger questions_publishable before insert or update on public.questions
  for each row execute function public.check_question_publishable();

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  number smallint not null check (number > 0),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (lesson_id, number)
);

create table public.mission_questions (
  mission_id uuid not null references public.missions (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  position smallint not null,
  primary key (mission_id, question_id)
);
create index mission_questions_question_idx on public.mission_questions (question_id);

-- Balanced missions of at most 10 published questions (same rule as the game engine).
create or replace function public.refresh_lesson_missions(p_lesson uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_n int;
  v_k int;
  v_base int;
  v_extra int;
  v_start int := 1;
  v_size int;
  v_mission uuid;
  i int;
begin
  select array_agg(id order by sort_key, source_page nulls last, created_at, id) into v_ids
  from public.questions where lesson_id = p_lesson and status = 'published';
  v_n := coalesce(array_length(v_ids, 1), 0);
  v_k := ceil(v_n / 10.0)::int;
  delete from public.mission_questions mq using public.missions m
    where mq.mission_id = m.id and m.lesson_id = p_lesson;
  update public.missions set active = false, updated_at = now() where lesson_id = p_lesson and number > v_k;
  if v_k = 0 then return 0; end if;
  v_base := v_n / v_k;
  v_extra := v_n % v_k;
  for i in 1 .. v_k loop
    v_size := v_base + case when i <= v_extra then 1 else 0 end;
    insert into public.missions (lesson_id, number, active) values (p_lesson, i, true)
      on conflict (lesson_id, number) do update set active = true, updated_at = now()
      returning id into v_mission;
    insert into public.mission_questions (mission_id, question_id, position)
      select v_mission, v_ids[j], j - v_start + 1 from generate_series(v_start, v_start + v_size - 1) j;
    v_start := v_start + v_size;
  end loop;
  return v_k;
end $$;
revoke execute on function public.refresh_lesson_missions(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Review records and academic flags
-- ---------------------------------------------------------------------------
create table public.content_reviews (
  id bigint generated always as identity primary key,
  question_id uuid not null references public.questions (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('create', 'edit', 'approve', 'reject', 'publish', 'unpublish', 'archive', 'flag', 'unflag', 'regenerate', 'draft')),
  from_status public.question_status,
  to_status public.question_status,
  note text not null default '' check (char_length(note) <= 1000),
  changes jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index content_reviews_question_idx on public.content_reviews (question_id, created_at desc);

create table public.academic_flags (
  id uuid primary key default gen_random_uuid(),
  key text unique,                      -- stable id for imported legacy items
  subject_id uuid references public.subjects (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete set null,
  question_id uuid references public.questions (id) on delete set null,
  source_page int,
  title text not null,
  details text not null default '',
  handling text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved', 'wont_fix')),
  origin text not null default 'manual' check (origin in ('legacy_task05', 'manual', 'ai_validation')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: catalogue of PUBLISHED subjects/units/lessons for signed-in users;
-- everything else is admin-only. No anonymous access.
-- ---------------------------------------------------------------------------
alter table public.subjects enable row level security;
alter table public.units enable row level security;
alter table public.lessons enable row level security;
alter table public.textbooks enable row level security;
alter table public.textbook_pages enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.missions enable row level security;
alter table public.mission_questions enable row level security;
alter table public.content_reviews enable row level security;
alter table public.academic_flags enable row level security;

create policy subjects_read on public.subjects for select to authenticated using (status = 'published' or public.is_admin());
create policy units_read on public.units for select to authenticated
  using ((status = 'published' and exists (select 1 from public.subjects s where s.id = subject_id and s.status = 'published')) or public.is_admin());
create policy lessons_read on public.lessons for select to authenticated
  using ((status = 'published'
          and exists (select 1 from public.units u where u.id = unit_id and u.status = 'published')
          and exists (select 1 from public.subjects s where s.id = subject_id and s.status = 'published'))
         or public.is_admin());
create policy missions_read on public.missions for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['subjects', 'units', 'lessons', 'textbooks', 'textbook_pages', 'questions', 'question_options', 'academic_flags'] loop
    execute format('create policy %1$s_admin_write on public.%1$s for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
create policy textbooks_admin_read on public.textbooks for select to authenticated using (public.is_admin());
create policy questions_admin_read on public.questions for select to authenticated using (public.is_admin());
create policy mission_questions_admin on public.mission_questions for select to authenticated using (public.is_admin());
create policy content_reviews_admin on public.content_reviews for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.content_reviews, public.missions, public.mission_questions from authenticated;
revoke all on all tables in schema public from anon;

-- Keep updated_at fresh on catalogue edits.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger subjects_touch before update on public.subjects for each row execute function public.touch_updated_at();
create trigger units_touch before update on public.units for each row execute function public.touch_updated_at();
create trigger lessons_touch before update on public.lessons for each row execute function public.touch_updated_at();
create trigger textbooks_touch before update on public.textbooks for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Private storage for uploaded books: admins only, never public.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('textbooks', 'textbooks', false, 52428800,
        array['application/pdf', 'text/markdown', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false;

create policy textbooks_storage_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'textbooks' and public.is_admin());
create policy textbooks_storage_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'textbooks' and public.is_admin());
create policy textbooks_storage_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'textbooks' and public.is_admin());

-- ============================================================================
-- عالم التحدّي — accounts, roles and families
--
-- Roles: student (الطالب), parent (ولي الأمر), admin (المشرف).
--   * A role is chosen ONLY by the server: parents who sign up get 'parent';
--     student accounts are created by a parent through a backend function
--     (app_metadata.role = 'student', which users cannot set themselves);
--     administrators are promoted with grant_admin(), callable only by the
--     project owner (service role / SQL editor).
--   * profiles.role can never be changed through the API (trigger below).
-- Children do not need an email address: they sign in with a username that the
-- backend maps to a non-routable internal address.
-- ============================================================================

create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'parent', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  display_name text check (char_length(display_name) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per account. role is server-assigned and immutable through the API.';

create table public.student_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  -- Login name for children (no email needed). Lower-case latin letters, digits, _ .
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  nickname text not null check (char_length(nickname) between 2 and 12),
  character_id text not null default 'green-slime',
  -- Privacy defaults: nickname-only in groups, no public profile.
  show_in_leaderboards boolean not null default true,
  leaderboard_excluded boolean not null default false, -- admin moderation
  legacy_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.student_profiles is 'Student game identity. Contains no real name, email, school or address.';

create table public.parent_children (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);
create index parent_children_student_idx on public.parent_children (student_id);

create table public.parent_settings (
  parent_id uuid primary key references public.profiles (id) on delete cascade,
  weekly_summary boolean not null default false,
  allow_group_requests boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles (id) on delete cascade,
  student_id uuid references public.student_profiles (id) on delete set null,
  scope text not null check (scope in ('child', 'family')),
  reason text check (char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Audit log (written by security-definer functions and triggers only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

create or replace function public.write_audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'));
$$;
revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Role helpers (used by policies). SECURITY DEFINER avoids policy recursion.
-- ---------------------------------------------------------------------------
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_parent_of(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parent_children where parent_id = auth.uid() and student_id = p_student)
$$;

create or replace function public.is_student() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.student_profiles where id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- New auth users → profile. Role comes from app_metadata (server-controlled),
-- never from user_metadata (user-controlled). Admin is never assigned here.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role := 'parent';
  v_meta jsonb := coalesce(new.raw_app_meta_data, '{}');
begin
  if v_meta ->> 'role' = 'student' then
    v_role := 'student';
  end if;
  insert into public.profiles (id, role) values (new.id, v_role) on conflict (id) do nothing;
  if v_role = 'student' then
    insert into public.student_profiles (id, username, nickname, character_id)
    values (
      new.id,
      v_meta ->> 'username',
      coalesce(nullif(v_meta ->> 'nickname', ''), v_meta ->> 'username'),
      coalesce(nullif(v_meta ->> 'character_id', ''), 'green-slime')
    );
    if (v_meta ->> 'parent_id') is not null then
      insert into public.parent_children (parent_id, student_id)
      values ((v_meta ->> 'parent_id')::uuid, new.id) on conflict do nothing;
    end if;
  else
    insert into public.parent_settings (parent_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- The API can never change a role or a profile's identity columns.
create or replace function public.protect_profile_role() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and current_user in ('anon', 'authenticated') then
    raise exception 'role cannot be changed' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

create or replace function public.protect_student_profile() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.username is distinct from old.username
    or new.character_id is distinct from old.character_id -- validated by set_character()
    or new.leaderboard_excluded is distinct from old.leaderboard_excluded
    or new.legacy_imported_at is distinct from old.legacy_imported_at
    or new.id is distinct from old.id) then
    raise exception 'field cannot be changed' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger student_profiles_protect before update on public.student_profiles
  for each row execute function public.protect_student_profile();

-- Owner-only: promote an existing account to administrator.
create or replace function public.grant_admin(p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then raise exception 'no account with that email'; end if;
  if exists (select 1 from public.student_profiles where id = v_id) then
    raise exception 'student accounts cannot become administrators';
  end if;
  update public.profiles set role = 'admin' where id = v_id;
  insert into public.audit_log (actor_id, action, entity, entity_id) values (null, 'grant_admin', 'profile', v_id::text);
  return v_id;
end $$;
revoke execute on function public.grant_admin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.parent_children enable row level security;
alter table public.parent_settings enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_parent_of(id) or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy students_select on public.student_profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_parent_of(id) or public.is_admin());
-- Nickname / leaderboard visibility: the student or their parent. Other fields are protected by trigger.
create policy students_update on public.student_profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_parent_of(id))
  with check (id = (select auth.uid()) or public.is_parent_of(id));

create policy parent_children_select on public.parent_children for select to authenticated
  using (parent_id = (select auth.uid()) or student_id = (select auth.uid()) or public.is_admin());
-- Links are created only by the backend function that creates a child account.

create policy parent_settings_all on public.parent_settings for all to authenticated
  using (parent_id = (select auth.uid())) with check (parent_id = (select auth.uid()));

create policy deletion_requests_select on public.deletion_requests for select to authenticated
  using (requested_by = (select auth.uid()) or public.is_admin());
create policy deletion_requests_insert on public.deletion_requests for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and public.my_role() = 'parent'
    and (student_id is null or public.is_parent_of(student_id))
  );

create policy audit_admin_select on public.audit_log for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke insert, delete on public.profiles, public.student_profiles, public.parent_children from anon, authenticated;
revoke all on all tables in schema public from anon;

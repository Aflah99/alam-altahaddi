-- Supabase Auth's admin createUser inserts the auth.users row first and writes app_metadata in a
-- following UPDATE (verified on the real project). handle_new_user() only ran on INSERT, so
-- children created by the parent-children function were given a *parent* profile.
-- This trigger completes the student setup when server-controlled app_metadata gains
-- role = 'student'. app_metadata can only be written with the service role (never by users).
create or replace function public.handle_user_meta_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meta jsonb := coalesce(new.raw_app_meta_data, '{}');
begin
  if v_meta ->> 'role' is distinct from 'student'
     or coalesce(old.raw_app_meta_data ->> 'role', '') = 'student'
     or exists (select 1 from public.student_profiles where id = new.id) then
    return new;
  end if;
  if coalesce(v_meta ->> 'username', '') = '' then
    raise exception 'student username missing' using errcode = '22023';
  end if;
  -- Only the automatic, unused parent profile created on INSERT may become a student.
  if exists (select 1 from public.parent_children where parent_id = new.id)
     or exists (select 1 from public.groups where owner_id = new.id)
     or exists (select 1 from public.profiles where id = new.id and role = 'admin') then
    raise exception 'account in use: cannot become a student' using errcode = '42501';
  end if;
  delete from public.parent_settings where parent_id = new.id;
  insert into public.profiles (id, role) values (new.id, 'student')
    on conflict (id) do update set role = 'student';
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
  return new;
end $$;
revoke execute on function public.handle_user_meta_update() from public, anon, authenticated;

create trigger on_auth_user_meta_updated after update of raw_app_meta_data on auth.users
  for each row execute function public.handle_user_meta_update();

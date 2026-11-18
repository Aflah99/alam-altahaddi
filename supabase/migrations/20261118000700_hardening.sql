-- Hardening from the Supabase security advisors (2026-11-18).
-- 1. Fixed search_path on the remaining non-SECURITY DEFINER helpers/trigger functions.
alter function public.protect_profile_role() set search_path = public;
alter function public.protect_student_profile() set search_path = public;
alter function public.check_question_publishable() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.base_character_ids() set search_path = public;

-- 2. Trigger functions are never called through the API.
revoke execute on function public.handle_new_user(), public.audit_row_change() from public, anon, authenticated;

-- 3. Role helpers are used by RLS policies for signed-in users only; signed-out visitors don't need them.
revoke execute on function public.is_admin(), public.is_student(), public.my_role(), public.is_parent_of(uuid),
  public.require_admin() from public, anon;

-- 4. Supabase's own event-trigger helper (exists on hosted projects only) is not an API function.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

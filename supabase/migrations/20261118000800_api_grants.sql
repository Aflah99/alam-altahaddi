-- Explicit Data API privileges. New Supabase projects no longer grant table access to the API
-- roles automatically, so grant what the app needs here. Row Level Security still decides
-- which rows each signed-in user can see or change (every table has RLS enabled).
--   authenticated : signed-in students, parents and admins (RLS policies apply)
--   service_role  : Edge Functions only (secret key, server side)
--   anon          : nothing — signed-out visitors use no tables
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke all on all tables in schema public from anon;

-- Re-apply the write restrictions the earlier migrations set: these tables change only through
-- SECURITY DEFINER functions or Edge Functions, never by direct API writes.
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, delete on public.profiles, public.student_profiles, public.parent_children from authenticated;
revoke insert, update, delete on public.content_reviews, public.missions, public.mission_questions from authenticated;
revoke insert, update, delete on public.quiz_sessions, public.session_questions, public.question_attempts,
  public.reward_transactions, public.inventory, public.equipped_items, public.legacy_imports from authenticated;
revoke insert, update, delete on public.ai_jobs, public.ai_job_batches from authenticated;
revoke insert, update, delete on public.groups, public.group_invites, public.group_members, public.group_join_attempts from authenticated;

-- Tables created by later migrations: same baseline (each migration revokes writes it doesn't allow).
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;

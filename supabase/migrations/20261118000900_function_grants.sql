-- Explicit EXECUTE grants. Current Supabase projects give the API roles no direct function
-- privileges; earlier migrations revoked PUBLIC (to keep anon out) and so also removed access for
-- signed-in users. Every function below checks the caller's role itself.
do $$
declare
  fn record;
  api text[] := array[
    -- policy helpers used by RLS (evaluated as the signed-in user)
    'is_admin', 'is_student', 'my_role', 'is_parent_of',
    -- admin dashboard and AI job control (each calls require_admin)
    'admin_anomalies', 'admin_cancel_ai_job', 'admin_confirm_ai_job', 'admin_coverage', 'admin_create_ai_job',
    'admin_dashboard', 'admin_flag_question', 'admin_get_question', 'admin_refresh_missions', 'admin_resolve_flag',
    'admin_retry_ai_job', 'admin_save_question', 'admin_set_leaderboard_excluded', 'admin_set_question_status',
    'admin_deletion_requests', 'admin_set_deletion_request', 'ai_estimate', 'ai_usage_today',
    -- parents and private groups (each checks parent/owner/member rights)
    'create_group', 'create_group_invite', 'revoke_group_invite', 'owner_remove_member', 'close_group',
    'group_manager_view', 'my_managed_groups', 'join_group_with_code', 'my_groups', 'leave_group',
    'parent_decide_membership', 'parent_remove_from_group', 'parent_child_groups', 'group_leaderboard',
    'parent_child_report', 'parent_activity'];
  worker text[] := array['ai_claim_batch', 'ai_finish_batch'];
begin
  for fn in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any (api || worker) loop
    if fn.proname = any (worker) then
      execute format('grant execute on function %s to service_role', fn.sig);
    else
      execute format('grant execute on function %s to authenticated', fn.sig);
    end if;
  end loop;
end $$;

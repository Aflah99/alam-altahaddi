-- Production enforces "UPDATE requires a WHERE clause" (safe-update guard); the settings function updated its one-row table without one.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_set_community_settings(jsonb)'::regprocedure);
  n := replace(d, 'invite_attempts_per_hour = c.invite_attempts_per_hour, updated_at = now();', 'invite_attempts_per_hour = c.invite_attempts_per_hour, updated_at = now() where id;');
  if n = d then raise exception 'admin_set_community_settings was not patched'; end if;
  execute n;
end $$;

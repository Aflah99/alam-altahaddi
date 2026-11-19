-- Administrators can read multiplayer records (support, moderation, verification). Players still
-- read only through mp_state(); nobody can write these tables directly.
do $$
declare t text;
begin
  foreach t in array array['mp_matches', 'mp_players', 'mp_match_questions', 'mp_rounds', 'mp_serves', 'mp_answers', 'mp_reactions', 'mp_join_attempts'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %1$s_admin_read on public.%1$s for select to authenticated using (public.is_admin())', t);
  end loop;
  execute 'grant select on public.mp_members to authenticated';
end $$;

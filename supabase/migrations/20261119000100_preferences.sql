-- ============================================================================
-- Per-account game preferences (audio levels, mute, reduced motion), so settings
-- follow a player across devices. Validated server-side; only known keys are kept.
-- ============================================================================

alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb
  check (jsonb_typeof(preferences) = 'object' and octet_length(preferences::text) <= 1024);

create or replace function public.get_my_preferences() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select preferences from public.profiles where id = auth.uid()), '{}'::jsonb)
$$;

create or replace function public.save_my_preferences(p_prefs jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v jsonb := '{}'::jsonb;
  k text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then raise exception 'invalid preferences' using errcode = '22023'; end if;
  foreach k in array array['reducedMotion', 'muted'] loop
    if jsonb_typeof(p_prefs -> k) = 'boolean' then v := v || jsonb_build_object(k, p_prefs -> k); end if;
  end loop;
  foreach k in array array['musicVolume', 'sfxVolume'] loop
    if jsonb_typeof(p_prefs -> k) = 'number' then
      v := v || jsonb_build_object(k, greatest(0, least(1, round((p_prefs ->> k)::numeric, 2))));
    end if;
  end loop;
  update public.profiles set preferences = v where id = v_uid;
end $$;

revoke execute on function public.get_my_preferences(), public.save_my_preferences(jsonb) from public, anon;
grant execute on function public.get_my_preferences(), public.save_my_preferences(jsonb) to authenticated;

-- ============================================================================
-- Phase C: parent analytics, private groups with invitation codes, parent
-- approval, and group-only leaderboards of VERIFIED XP.
--   * No public leaderboard, no profile search, no messaging.
--   * Groups show nicknames, characters and verified XP only.
--   * A child's code only creates a PENDING request; a linked parent decides.
-- ============================================================================

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  uses int not null default 0,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'removed', 'left')),
  invite_id uuid references public.group_invites (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  primary key (group_id, student_id)
);
create index group_members_student_idx on public.group_members (student_id);

create table public.group_join_attempts (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  success boolean not null,
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_members enable row level security;
alter table public.group_join_attempts enable row level security;

-- Group managers see their groups and invites; admins see everything (moderation).
create policy groups_owner on public.groups for select to authenticated using (owner_id = (select auth.uid()) or public.is_admin());
create policy invites_owner on public.group_invites for select to authenticated
  using (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid())) or public.is_admin());
-- Membership rows: the group owner, the student, the student's parent.
create policy members_read on public.group_members for select to authenticated
  using (student_id = (select auth.uid()) or public.is_parent_of(student_id) or public.is_admin()
         or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid())));
revoke insert, update, delete on public.groups, public.group_invites, public.group_members, public.group_join_attempts from authenticated;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.require_adult() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() not in ('parent', 'admin') then raise exception 'adult account required' using errcode = '42501'; end if;
  return auth.uid();
end $$;

create or replace function public.require_group_owner(p_group uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.groups where id = p_group and (owner_id = auth.uid() or public.is_admin())) then
    raise exception 'group manager required' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create or replace function public.new_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  bytes bytea := extensions.gen_random_bytes(10); -- pgcrypto lives in the extensions schema on Supabase
  code text := '';
  i int;
begin
  for i in 0 .. 9 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end $$;

-- ---------------------------------------------------------------------------
-- Group management (adults)
-- ---------------------------------------------------------------------------
create or replace function public.create_group(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_owner uuid := public.require_adult(); v_id uuid;
begin
  if (select count(*) from public.groups where owner_id = v_owner and active) >= 10 then
    raise exception 'too many active groups' using errcode = 'P0001';
  end if;
  insert into public.groups (name, owner_id) values (btrim(p_name), v_owner) returning id into v_id;
  perform public.write_audit('group_create', 'group', v_id::text);
  return v_id;
end $$;

create or replace function public.create_group_invite(p_group uuid, p_days int default 14) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_id uuid; v_exp timestamptz;
begin
  perform public.require_group_owner(p_group);
  if not (select active from public.groups where id = p_group) then raise exception 'group closed' using errcode = 'P0001'; end if;
  v_exp := case when p_days is null or p_days <= 0 then null else now() + make_interval(days => least(p_days, 90)) end;
  loop
    v_code := public.new_invite_code();
    exit when not exists (select 1 from public.group_invites where code = v_code);
  end loop;
  insert into public.group_invites (group_id, code, created_by, expires_at) values (p_group, v_code, auth.uid(), v_exp) returning id into v_id;
  return jsonb_build_object('id', v_id, 'code', v_code, 'expires_at', v_exp);
end $$;

create or replace function public.revoke_group_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  select group_id into v_group from public.group_invites where id = p_invite;
  perform public.require_group_owner(v_group);
  update public.group_invites set revoked_at = now() where id = p_invite and revoked_at is null;
end $$;

create or replace function public.owner_remove_member(p_group uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_group_owner(p_group);
  update public.group_members set status = 'removed', decided_at = now(), decided_by = auth.uid()
   where group_id = p_group and student_id = p_student and status in ('pending', 'active');
end $$;

create or replace function public.close_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_group_owner(p_group);
  update public.groups set active = false, closed_at = now() where id = p_group;
  update public.group_invites set revoked_at = now() where group_id = p_group and revoked_at is null;
  perform public.write_audit('group_close', 'group', p_group::text);
end $$;

/** Owner view: members (nickname, status), invites, and basic aggregate participation only. */
create or replace function public.group_manager_view(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_week timestamptz := date_trunc('week', now());
begin
  perform public.require_group_owner(p_group);
  return jsonb_build_object(
    'group', (select to_jsonb(g) - 'owner_id' from public.groups g where g.id = p_group),
    'members', coalesce((select jsonb_agg(jsonb_build_object('student_id', m.student_id, 'nickname', sp.nickname, 'character_id', sp.character_id,
                                 'status', m.status, 'requested_at', m.requested_at) order by m.requested_at)
                         from public.group_members m join public.student_profiles sp on sp.id = m.student_id
                         where m.group_id = p_group and m.status in ('pending', 'active')), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'expires_at', i.expires_at, 'revoked', i.revoked_at is not null, 'uses', i.uses) order by i.created_at desc)
                         from public.group_invites i where i.group_id = p_group), '[]'::jsonb),
    'participation', jsonb_build_object(
      'active_members', (select count(*) from public.group_members where group_id = p_group and status = 'active'),
      'active_this_week', (select count(distinct m.student_id) from public.group_members m join public.quiz_sessions s on s.student_id = m.student_id
                           where m.group_id = p_group and m.status = 'active' and s.started_at >= v_week),
      'missions_this_week', (select count(*) from public.group_members m join public.quiz_sessions s on s.student_id = m.student_id
                             where m.group_id = p_group and m.status = 'active' and s.status = 'completed' and s.completed_at >= v_week)));
end $$;

create or replace function public.my_managed_groups() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_adult();
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'active', g.active, 'created_at', g.created_at,
            'members', (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'active'),
            'pending', (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'pending')) order by g.created_at)
          from public.groups g where g.owner_id = auth.uid()), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Students: join with a code (creates a PENDING request only)
-- ---------------------------------------------------------------------------
create or replace function public.join_group_with_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.require_student();
  v_inv public.group_invites%rowtype;
  v_status text;
  v_allowed boolean;
begin
  if (select count(*) from public.group_join_attempts where student_id = v_student and not success and created_at > now() - interval '1 hour') >= 8 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select i.* into v_inv from public.group_invites i join public.groups g on g.id = i.group_id
   where i.code = upper(btrim(p_code)) and i.revoked_at is null and (i.expires_at is null or i.expires_at > now()) and g.active;
  if not found then
    -- Returned (not raised) so the failed attempt is committed and counts towards the rate limit.
    insert into public.group_join_attempts (student_id, success) values (v_student, false);
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.group_join_attempts (student_id, success) values (v_student, true);
  select status into v_status from public.group_members where group_id = v_inv.group_id and student_id = v_student;
  if v_status in ('active', 'pending') then
    return jsonb_build_object('group_id', v_inv.group_id, 'status', v_status);
  end if;
  -- Parents may turn group requests off entirely.
  select coalesce(bool_and(ps.allow_group_requests), true) into v_allowed
    from public.parent_children pc join public.parent_settings ps on ps.parent_id = pc.parent_id where pc.student_id = v_student;
  insert into public.group_members (group_id, student_id, status, invite_id, requested_at, decided_at, decided_by)
  values (v_inv.group_id, v_student, case when v_allowed then 'pending' else 'rejected' end, v_inv.id, now(),
          case when v_allowed then null else now() end, null)
  on conflict (group_id, student_id) do update set status = excluded.status, invite_id = excluded.invite_id,
     requested_at = now(), decided_at = excluded.decided_at, decided_by = null;
  update public.group_invites set uses = uses + 1 where id = v_inv.id;
  return jsonb_build_object('group_id', v_inv.group_id, 'status', case when v_allowed then 'pending' else 'rejected' end);
end $$;

create or replace function public.my_groups() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_student uuid := public.require_student();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'status', m.status, 'active', g.active) order by g.name)
                   from public.group_members m join public.groups g on g.id = m.group_id
                   where m.student_id = v_student and m.status in ('pending', 'active')), '[]'::jsonb);
end $$;

create or replace function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.group_members set status = 'left', decided_at = now() where group_id = p_group and student_id = public.require_student() and status in ('pending', 'active');
end $$;

-- ---------------------------------------------------------------------------
-- Parents: approve / reject / remove their child's memberships
-- ---------------------------------------------------------------------------
create or replace function public.parent_decide_membership(p_group uuid, p_student uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent_of(p_student) then raise exception 'not your child' using errcode = '42501'; end if;
  update public.group_members set status = case when p_approve then 'active' else 'rejected' end, decided_at = now(), decided_by = auth.uid()
   where group_id = p_group and student_id = p_student and status = 'pending';
  if not found then raise exception 'no pending request' using errcode = 'P0002'; end if;
  perform public.write_audit(case when p_approve then 'group_membership_approved' else 'group_membership_rejected' end, 'student', p_student::text,
                             jsonb_build_object('group', p_group));
end $$;

create or replace function public.parent_remove_from_group(p_group uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent_of(p_student) then raise exception 'not your child' using errcode = '42501'; end if;
  update public.group_members set status = 'removed', decided_at = now(), decided_by = auth.uid()
   where group_id = p_group and student_id = p_student and status in ('pending', 'active');
  perform public.write_audit('group_membership_removed', 'student', p_student::text, jsonb_build_object('group', p_group));
end $$;

create or replace function public.parent_child_groups(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_parent_of(p_student) then raise exception 'not your child' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('group_id', g.id, 'name', g.name, 'status', m.status, 'requested_at', m.requested_at,
                     'members', (select count(*) from public.group_members x where x.group_id = g.id and x.status = 'active')) order by m.requested_at desc)
                   from public.group_members m join public.groups g on g.id = m.group_id
                   where m.student_id = p_student and m.status in ('pending', 'active') and g.active), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Leaderboards: group members only, VERIFIED XP only (server reward ledger).
-- ---------------------------------------------------------------------------
create or replace function public.group_leaderboard(p_group uuid, p_period text default 'week') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_since timestamptz := case when p_period = 'week' then date_trunc('week', now() + interval '1 day') - interval '1 day' else '-infinity'::timestamptz end;
begin
  if not (
       exists (select 1 from public.groups g where g.id = p_group and g.owner_id = v_me)
    or exists (select 1 from public.group_members m where m.group_id = p_group and m.student_id = v_me and m.status = 'active')
    or exists (select 1 from public.group_members m where m.group_id = p_group and m.status = 'active' and public.is_parent_of(m.student_id))
    or public.is_admin()) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'active', g.active) from public.groups g where g.id = p_group),
    'period', p_period,
    'since', case when p_period = 'week' then v_since end,
    'rows', coalesce((
      select jsonb_agg(r order by (r ->> 'rank')::int, r ->> 'nickname') from (
        select jsonb_build_object(
          'rank', rank() over (order by x.xp desc),
          'nickname', x.nickname, 'character_id', x.character_id, 'outfit', x.outfit, 'xp', x.xp, 'is_me', x.student_id = v_me) as r
        from (
          select sp.id as student_id, sp.nickname, sp.character_id,
                 coalesce((select jsonb_agg(e.item_id order by e.slot) from public.equipped_items e where e.student_id = sp.id), '[]'::jsonb) as outfit,
                 coalesce((select sum(t.xp) from public.reward_transactions t
                           where t.student_id = sp.id and t.kind in ('question', 'mission') and t.created_at >= v_since), 0)::int as xp
          from public.group_members m join public.student_profiles sp on sp.id = m.student_id
          where m.group_id = p_group and m.status = 'active' and sp.show_in_leaderboards and not sp.leaderboard_excluded
        ) x
      ) ranked), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Parent analytics (real attempt data only)
-- ---------------------------------------------------------------------------
create or replace function public.parent_child_report(p_student uuid, p_days int default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_since timestamptz := case when p_days is null or p_days <= 0 then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;
begin
  if not public.is_parent_of(p_student) then raise exception 'not your child' using errcode = '42501'; end if;
  return (
    with r as (
      select sq.question_id, sq.result, sq.hint_used, sq.finalized_at, s.id as session_id, s.lesson_id, l.title as lesson_title, l.number as lesson_number,
             u.id as unit_id, u.title as unit_title, u.number as unit_number, sj.id as subject_id, sj.name_ar as subject_name
      from public.session_questions sq
      join public.quiz_sessions s on s.id = sq.session_id
      join public.lessons l on l.id = s.lesson_id
      join public.units u on u.id = l.unit_id
      join public.subjects sj on sj.id = l.subject_id
      where s.student_id = p_student and sq.result is not null and sq.finalized_at >= v_since
    ),
    sessions as (
      select * from public.quiz_sessions where student_id = p_student and started_at >= v_since
    )
    select jsonb_build_object(
      'summary', jsonb_build_object(
        'answered', (select count(*) from r),
        'first_try', (select count(*) from r where result = 'first'),
        'assisted', (select count(*) from r where result = 'assisted'),
        'missed', (select count(*) from r where result = 'missed'),
        'hints', (select count(*) from r where hint_used),
        'missions_completed', (select count(*) from sessions where status = 'completed'),
        -- Approximate: time between starting and finishing completed missions, capped at 30 minutes each.
        'minutes', (select coalesce(round(sum(least(extract(epoch from (completed_at - started_at)), 1800)) / 60.0), 0) from sessions where status = 'completed'),
        'xp', (select coalesce(sum(xp), 0) from public.reward_transactions t where t.student_id = p_student and t.kind in ('question', 'mission') and t.created_at >= v_since),
        'last_active', (select max(started_at) from public.quiz_sessions where student_id = p_student)),
      'by_subject', coalesce((select jsonb_agg(x order by x ->> 'name') from (
          select jsonb_build_object('id', subject_id, 'name', subject_name, 'answered', count(*),
                   'first_try', count(*) filter (where result = 'first'), 'assisted', count(*) filter (where result = 'assisted'),
                   'missed', count(*) filter (where result = 'missed')) x
          from r group by subject_id, subject_name) a), '[]'::jsonb),
      'by_unit', coalesce((select jsonb_agg(x order by (x ->> 'number')::int) from (
          select jsonb_build_object('id', unit_id, 'subject', subject_name, 'title', unit_title, 'number', unit_number, 'answered', count(*),
                   'first_try', count(*) filter (where result = 'first'), 'assisted', count(*) filter (where result = 'assisted'),
                   'missed', count(*) filter (where result = 'missed')) x
          from r group by unit_id, subject_name, unit_title, unit_number) a), '[]'::jsonb),
      'by_lesson', coalesce((select jsonb_agg(x order by x ->> 'subject', (x ->> 'unit')::int, (x ->> 'number')::int) from (
          select jsonb_build_object('id', lesson_id, 'subject', subject_name, 'unit', unit_number, 'unit_title', unit_title, 'number', lesson_number,
                   'title', lesson_title, 'answered', count(*),
                   'first_try', count(*) filter (where result = 'first'), 'assisted', count(*) filter (where result = 'assisted'),
                   'missed', count(*) filter (where result = 'missed')) x
          from r group by lesson_id, subject_name, unit_number, unit_title, lesson_number, lesson_title) a), '[]'::jsonb),
      'weekly', coalesce((select jsonb_agg(x order by x ->> 'week') from (
          select jsonb_build_object('week', to_char(date_trunc('week', finalized_at), 'YYYY-MM-DD'), 'answered', count(*),
                   'first_try', count(*) filter (where result = 'first')) x
          from r where finalized_at >= now() - interval '8 weeks' group by date_trunc('week', finalized_at)) a), '[]'::jsonb),
      'daily', coalesce((select jsonb_agg(x order by x ->> 'day') from (
          select jsonb_build_object('day', to_char(date_trunc('day', finalized_at), 'YYYY-MM-DD'), 'answered', count(*)) x
          from r where finalized_at >= now() - interval '30 days' group by date_trunc('day', finalized_at)) a), '[]'::jsonb),
      'most_missed', coalesce((select jsonb_agg(x) from (
          select jsonb_build_object('question', q.text, 'lesson', max(r.lesson_title), 'misses', count(*) filter (where r.result = 'missed'),
                   'assisted', count(*) filter (where r.result = 'assisted')) x
          from r join public.questions q on q.id = r.question_id
          where r.result in ('missed', 'assisted')
          group by q.id, q.text
          order by count(*) filter (where r.result = 'missed') desc, count(*) desc limit 5) a), '[]'::jsonb),
      'legacy', (select jsonb_build_object('imported_at', imported_at, 'summary', summary) from public.legacy_imports where student_id = p_student)
    ));
end $$;

/** Recent activity relevant to a parent: their own account actions and their children's mission activity. */
create or replace function public.parent_activity() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() <> 'parent' then raise exception 'parent account required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
    select jsonb_build_object('at', a.created_at, 'action', a.action, 'entity', a.entity) x
      from public.audit_log a where a.actor_id = auth.uid() and a.created_at > now() - interval '60 days'
    union all
    select jsonb_build_object('at', s.started_at, 'action', case when s.status = 'completed' then 'mission_completed' else 'mission_started' end,
                              'entity', sp.nickname)
      from public.quiz_sessions s join public.student_profiles sp on sp.id = s.student_id
     where public.is_parent_of(s.student_id) and s.started_at > now() - interval '14 days'
    ) t), '[]'::jsonb);
end $$;

revoke execute on function public.create_group(text), public.create_group_invite(uuid, int), public.revoke_group_invite(uuid),
  public.owner_remove_member(uuid, uuid), public.close_group(uuid), public.group_manager_view(uuid), public.my_managed_groups(),
  public.join_group_with_code(text), public.my_groups(), public.leave_group(uuid), public.parent_decide_membership(uuid, uuid, boolean),
  public.parent_remove_from_group(uuid, uuid), public.parent_child_groups(uuid), public.group_leaderboard(uuid, text),
  public.parent_child_report(uuid, int), public.parent_activity(), public.new_invite_code(), public.require_adult(), public.require_group_owner(uuid)
  from public, anon;

-- ---------------------------------------------------------------------------
-- Deletion requests: admins list them and record how each was handled.
-- (Child accounts are deleted by the parent through the parent-children function;
--  family requests are handled by an admin in the Supabase dashboard.)
create or replace function public.admin_deletion_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'scope', d.scope, 'status', d.status, 'reason', d.reason, 'created_at', d.created_at,
      'handled_at', d.handled_at, 'requested_by', d.requested_by, 'requester', p.display_name,
      'child', sp.nickname) order by d.status = 'pending' desc, d.created_at desc)
    from public.deletion_requests d
    join public.profiles p on p.id = d.requested_by
    left join public.student_profiles sp on sp.id = d.student_id), '[]'::jsonb);
end $$;

create or replace function public.admin_set_deletion_request(p_request uuid, p_status text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_status not in ('pending', 'completed', 'cancelled') then raise exception 'invalid status' using errcode = '22023'; end if;
  update public.deletion_requests set status = p_status, handled_at = case when p_status = 'pending' then null else now() end
   where id = p_request;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  perform public.write_audit('deletion_request_' || p_status, 'deletion_request', p_request::text);
end $$;

revoke execute on function public.admin_deletion_requests(), public.admin_set_deletion_request(uuid, text) from public, anon;
grant execute on function public.admin_deletion_requests(), public.admin_set_deletion_request(uuid, text) to authenticated;

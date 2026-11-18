// Phase C (Task 09): parent analytics, private groups, invitation codes, parent approval,
// group-only leaderboards of verified XP, and isolation from outsiders.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createAdmin, createParent, createStudent, dbAvailable, missionOf, pool, root, rpc, wrongOf } from './db'

beforeAll(async () => {
  if (!(await dbAvailable())) throw new Error('Local test database not available: run `npm run test:db`.')
})
afterAll(() => pool.end())

type Session = { session_id: string; questions: { id: string }[] }

/** Plays a whole mission: the first `wrongFirst` questions are missed, the rest answered first try. */
async function play(student: string, lesson: string, wrongFirst = 0) {
  const m = await missionOf(lesson)
  const s = await rpc<Session>(student, 'start_quiz_session', m.id)
  for (const [i, q] of s.questions.entries()) {
    const correct = m.correct.get(q.id)!
    if (i < wrongFirst) {
      const [w1, w2] = wrongOf(correct)
      await rpc(student, 'submit_answer', s.session_id, q.id, w1)
      await rpc(student, 'submit_answer', s.session_id, q.id, w2)
    } else await rpc(student, 'submit_answer', s.session_id, q.id, correct)
  }
  return rpc<{ total: number }>(student, 'complete_quiz_session', s.session_id)
}

describe('parent analytics', () => {
  it('reports real results for the parent’s own child and refuses other children', async () => {
    const pa = await createParent()
    const pb = await createParent()
    const kid = await createStudent(pa)
    const other = await createStudent(pb)
    const s1 = await play(kid, 'u1-l1', 3)
    const r = await rpc<{
      summary: { answered: number; first_try: number; missed: number; missions_completed: number; xp: number }
      by_lesson: { title: string; answered: number; missed: number }[]
      by_subject: { name: string }[]
      most_missed: { question: string }[]
    }>(pa, 'parent_child_report', kid, null)
    expect(r.summary).toMatchObject({ answered: s1.total, first_try: s1.total - 3, missed: 3, missions_completed: 1 })
    expect(r.summary.xp).toBe((s1.total - 3) * 10) // 5/8 < 70%: no bonus
    expect(r.by_lesson[0]).toMatchObject({ title: 'أسباب النزول', missed: 3 })
    expect(r.by_subject[0].name).toBe('ديني قيمي')
    expect(r.most_missed).toHaveLength(3)
    await expect(rpc(pa, 'parent_child_report', other, null)).rejects.toThrow(/not your child/)
    await expect(rpc(kid, 'parent_child_report', kid, null)).rejects.toThrow(/not your child/)
  })

  it('time filters exclude older activity', async () => {
    const p = await createParent()
    const kid = await createStudent(p)
    await play(kid, 'u1-l2')
    await root(`update public.session_questions set finalized_at = now() - interval '40 days' where session_id in (select id from public.quiz_sessions where student_id = $1)`, [kid])
    const last30 = await rpc<{ summary: { answered: number } }>(p, 'parent_child_report', kid, 30)
    const all = await rpc<{ summary: { answered: number } }>(p, 'parent_child_report', kid, null)
    expect(last30.summary.answered).toBe(0)
    expect(all.summary.answered).toBeGreaterThan(0)
  })

  it('separates imported (unverified) device history from verified results', async () => {
    const p = await createParent()
    const kid = await createStudent(p)
    await rpc(kid, 'import_legacy_progress', JSON.stringify({ progress: { missions: { a: {} }, questions: {} } }))
    const r = await rpc<{ summary: { answered: number }; legacy: { summary: { verified: boolean } } }>(p, 'parent_child_report', kid, null)
    expect(r.summary.answered).toBe(0)
    expect(r.legacy.summary.verified).toBe(false)
  })
})

describe('private groups and parent approval', () => {
  async function setup() {
    const owner = await createParent()
    const parentA = await createParent()
    const parentB = await createParent()
    const a = await createStudent(parentA, 'نمر')
    const b = await createStudent(parentB, 'صقر')
    const group = await rpc<string>(owner, 'create_group', 'فريق القراءة')
    const invite = await rpc<{ code: string; id: string }>(owner, 'create_group_invite', group, 14)
    return { owner, parentA, parentB, a, b, group, invite }
  }

  it('students cannot create groups; codes are long and hard to guess', async () => {
    const { a, invite } = await setup()
    await expect(rpc(a, 'create_group', 'مجموعتي')).rejects.toThrow(/adult account required/)
    expect(invite.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
  })

  it('a code only creates a pending request; the child is not a member until a linked parent approves', async () => {
    const { owner, parentA, parentB, a, group, invite } = await setup()
    expect(await rpc(a, 'join_group_with_code', invite.code.toLowerCase())).toMatchObject({ status: 'pending' })
    await expect(rpc(a, 'group_leaderboard', group, 'week')).rejects.toThrow(/not a member/)
    // The child cannot approve themself, another parent cannot approve, the owner cannot approve for the parent.
    await expect(rpc(a, 'parent_decide_membership', group, a, true)).rejects.toThrow(/not your child/)
    await expect(rpc(parentB, 'parent_decide_membership', group, a, true)).rejects.toThrow(/not your child/)
    await expect(rpc(owner, 'parent_decide_membership', group, a, true)).rejects.toThrow(/not your child/)
    await rpc(parentA, 'parent_decide_membership', group, a, true)
    expect(await rpc(a, 'my_groups')).toEqual([expect.objectContaining({ id: group, status: 'active' })])
  })

  it('revoked and expired codes stop working; wrong codes are rate-limited', async () => {
    const { owner, a, b, group, invite } = await setup()
    await rpc(owner, 'revoke_group_invite', invite.id)
    expect(await rpc(a, 'join_group_with_code', invite.code)).toEqual({ status: 'invalid' })
    const old = await rpc<{ code: string; id: string }>(owner, 'create_group_invite', group, 1)
    await root(`update public.group_invites set expires_at = now() - interval '1 minute' where id = $1`, [old.id])
    expect(await rpc(a, 'join_group_with_code', old.code)).toEqual({ status: 'invalid' })
    for (let i = 0; i < 8; i++) expect(await rpc(b, 'join_group_with_code', 'ZZZZZZZZZZ')).toEqual({ status: 'invalid' })
    await expect(rpc(b, 'join_group_with_code', 'YYYYYYYYYY')).rejects.toThrow(/rate_limited/)
  })

  it('parents who turned group requests off get the request rejected automatically', async () => {
    const { parentA, a, invite } = await setup()
    await as(parentA, `update public.parent_settings set allow_group_requests = false where parent_id = $1`, [parentA])
    expect(await rpc(a, 'join_group_with_code', invite.code)).toMatchObject({ status: 'rejected' })
  })

  it('leaderboards rank verified XP only, weekly and all-time, nicknames only, members only', async () => {
    const { owner, parentA, parentB, a, b, group, invite } = await setup()
    for (const [kid, parent] of [[a, parentA], [b, parentB]] as const) {
      await rpc(kid, 'join_group_with_code', invite.code)
      await rpc(parent, 'parent_decide_membership', group, kid, true)
    }
    await play(a, 'u2-l1') // all correct
    await play(b, 'u2-l2', 4)
    // Old XP counts all-time but not this week.
    await root(`insert into public.reward_transactions (student_id, kind, ref, xp, coins, created_at) values ($1, 'question', 'old-q', 500, 500, now() - interval '30 days')`, [b])
    // A purchase never changes XP; local/legacy data never enters the ledger.
    const week = await rpc<{ rows: { nickname: string; xp: number; rank: number; is_me: boolean }[] }>(a, 'group_leaderboard', group, 'week')
    expect(week.rows.map((r) => r.nickname)).toEqual(['نمر', 'صقر'])
    expect(week.rows[0]).toMatchObject({ rank: 1, is_me: true })
    expect(Object.keys(week.rows[0]).sort()).toEqual(['character_id', 'is_me', 'nickname', 'outfit', 'rank', 'xp'])
    const all = await rpc<{ rows: { nickname: string; xp: number }[] }>(owner, 'group_leaderboard', group, 'all')
    expect(all.rows[0].nickname).toBe('صقر')
    // Parents of members can view; outsiders cannot.
    await rpc(parentB, 'group_leaderboard', group, 'week')
    const outsiderParent = await createParent()
    const outsiderKid = await createStudent(outsiderParent)
    await expect(rpc(outsiderParent, 'group_leaderboard', group, 'week')).rejects.toThrow(/not a member/)
    await expect(rpc(outsiderKid, 'group_leaderboard', group, 'week')).rejects.toThrow(/not a member/)
    expect(await as(outsiderKid, 'select * from public.group_members where group_id = $1', [group])).toEqual([])
    expect(await as(outsiderParent, 'select * from public.groups where id = $1', [group])).toEqual([])
    expect(await as(a, 'select * from public.group_invites where group_id = $1', [group])).toEqual([])
  })

  it('privacy and moderation: hidden or excluded students disappear from rankings', async () => {
    const { parentA, parentB, a, b, group, invite } = await setup()
    for (const [kid, parent] of [[a, parentA], [b, parentB]] as const) {
      await rpc(kid, 'join_group_with_code', invite.code)
      await rpc(parent, 'parent_decide_membership', group, kid, true)
    }
    await as(parentA, `update public.student_profiles set show_in_leaderboards = false where id = $1`, [a])
    const admin = await createAdmin()
    await rpc(admin, 'admin_set_leaderboard_excluded', b, true)
    expect((await rpc<{ rows: unknown[] }>(parentB, 'group_leaderboard', group, 'all')).rows).toEqual([])
    // A student cannot exclude or re-include themself.
    await expect(as(b, `update public.student_profiles set leaderboard_excluded = false where id = $1`, [b])).rejects.toThrow(/cannot be changed/)
  })

  it('parents can remove their child; owners can remove members and close the group', async () => {
    const { owner, parentA, parentB, a, b, group, invite } = await setup()
    for (const [kid, parent] of [[a, parentA], [b, parentB]] as const) {
      await rpc(kid, 'join_group_with_code', invite.code)
      await rpc(parent, 'parent_decide_membership', group, kid, true)
    }
    await rpc(parentA, 'parent_remove_from_group', group, a)
    expect(await rpc(a, 'my_groups')).toEqual([])
    await rpc(owner, 'owner_remove_member', group, b)
    const view = await rpc<{ members: unknown[]; participation: { active_members: number } }>(owner, 'group_manager_view', group)
    expect(view.participation.active_members).toBe(0)
    await rpc(owner, 'close_group', group)
    expect(await rpc(a, 'join_group_with_code', invite.code)).toEqual({ status: 'invalid' })
    await expect(rpc(parentB, 'group_manager_view', group)).rejects.toThrow(/group manager required/)
  })
})

describe('deletion and account data', () => {
  it('parents can file a deletion request only for their own children', async () => {
    const pa = await createParent()
    const kid = await createStudent(pa)
    const other = await createStudent(await createParent())
    await as(pa, `insert into public.deletion_requests (requested_by, student_id, scope) values ($1, $2, 'child')`, [pa, kid])
    await expect(as(pa, `insert into public.deletion_requests (requested_by, student_id, scope) values ($1, $2, 'child')`, [pa, other])).rejects.toThrow(/row-level security/)
    await expect(as(kid, `insert into public.deletion_requests (requested_by, scope) values ($1, 'family')`, [kid])).rejects.toThrow(/row-level security/)
  })

  it('admins list deletion requests and record the outcome; others cannot', async () => {
    const pa = await createParent()
    await as(pa, `insert into public.deletion_requests (requested_by, scope, reason) values ($1, 'family', 'test')`, [pa])
    const admin = await createAdmin()
    const list = await rpc<{ id: string; requested_by: string; status: string }[]>(admin, 'admin_deletion_requests')
    const mine = list.find((r) => r.requested_by === pa)!
    expect(mine.status).toBe('pending')
    await expect(rpc(pa, 'admin_deletion_requests')).rejects.toThrow(/admin/)
    await expect(rpc(pa, 'admin_set_deletion_request', mine.id, 'completed')).rejects.toThrow(/admin/)
    await rpc(admin, 'admin_set_deletion_request', mine.id, 'completed')
    expect((await as(pa, 'select status from public.deletion_requests where id = $1', [mine.id]))[0].status).toBe('completed')
  })

  it('deleting a child account removes their records', async () => {
    const pa = await createParent()
    const kid = await createStudent(pa)
    await play(kid, 'u1-l3')
    await root('delete from auth.users where id = $1', [kid])
    for (const t of ['student_profiles', 'quiz_sessions', 'reward_transactions', 'question_attempts', 'parent_children']) {
      const col = t === 'student_profiles' ? 'id' : 'student_id'
      expect((await root(`select count(*)::int as n from public.${t} where ${col} = $1`, [kid]))[0].n, t).toBe(0)
    }
  })
})

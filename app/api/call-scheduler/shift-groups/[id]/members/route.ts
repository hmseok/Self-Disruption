// ═══════════════════════════════════════════════════════════════════
// PUT /api/call-scheduler/shift-groups/[id]/members
//
// Phase K (2026-05-09) — body 확장:
//   { members: [{ worker_id, priority_level, preferred_dow_prefer, preferred_dow_avoid,
//                 max_consecutive_work_days, required_days_per_month, max_days_per_month,
//                 blocked_slot_ids, work_pattern_text }, ...] }
//
//   (옛 호환) { worker_ids: [uuid, ...] } 도 받음 — priority 만 인덱스로
//
//   동작: 그룹의 멤버 전체를 받은 배열로 set (delete + insert)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

interface MemberInput {
  worker_id: string
  priority_level?: number
  preferred_dow_prefer?: string | null
  preferred_dow_avoid?: string | null
  max_consecutive_work_days?: number | null
  required_days_per_month?: number | null
  max_days_per_month?: number | null
  blocked_slot_ids?: string[] | null
  work_pattern_text?: string | null
}

function clampPriorityLevel(v: any): number {
  return Math.min(3, Math.max(1, Number(v) || 2))
}
function nullableNum(v: any): number | null {
  if (v == null || v === '') return null
  const n = Number(v); return Number.isFinite(n) ? n : null
}
function nullableStr(v: any): string | null {
  if (v == null) return null
  const s = String(v).trim(); return s.length > 0 ? s : null
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const body = await request.json()

    // body 정규화 — members 우선, worker_ids fallback
    let members: MemberInput[] = []
    if (Array.isArray(body?.members)) {
      members = body.members.filter((m: any) => m && typeof m.worker_id === 'string')
    } else if (Array.isArray(body?.worker_ids)) {
      members = body.worker_ids.map((wId: string) => ({ worker_id: String(wId) }))
    }

    // 그룹 존재 확인
    const exists = await prisma.$queryRaw<any[]>`
      SELECT id FROM cs_shift_groups WHERE id = ${id} LIMIT 1
    `
    if (exists.length === 0) {
      return NextResponse.json({ error: '그룹을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 기존 멤버 모두 삭제
    await prisma.$executeRaw`DELETE FROM cs_group_members WHERE group_id = ${id}`

    // 새 멤버 INSERT (priority = 배열 인덱스, 8 컬럼 멤버 단위 설정)
    for (let i = 0; i < members.length; i++) {
      const m = members[i]
      const memberId = crypto.randomUUID()
      const priority_level = clampPriorityLevel(m.priority_level)
      const dow_prefer = nullableStr(m.preferred_dow_prefer)
      const dow_avoid = nullableStr(m.preferred_dow_avoid)
      const max_consec = nullableNum(m.max_consecutive_work_days)
      const req_days = nullableNum(m.required_days_per_month)
      const max_days = nullableNum(m.max_days_per_month)
      const blocked = Array.isArray(m.blocked_slot_ids) && m.blocked_slot_ids.length > 0
        ? JSON.stringify(m.blocked_slot_ids.map(String)) : null
      const pattern = nullableStr(m.work_pattern_text)
      await prisma.$executeRaw`
        INSERT INTO cs_group_members
          (id, group_id, worker_id, priority,
           priority_level, preferred_dow_prefer, preferred_dow_avoid,
           max_consecutive_work_days, required_days_per_month, max_days_per_month,
           blocked_slot_ids, work_pattern_text, created_at)
        VALUES
          (${memberId}, ${id}, ${m.worker_id}, ${i},
           ${priority_level}, ${dow_prefer}, ${dow_avoid},
           ${max_consec}, ${req_days}, ${max_days},
           ${blocked}, ${pattern}, NOW())
      `
    }

    // 새 멤버 목록 반환 (8 컬럼 포함)
    const out = await prisma.$queryRaw<any[]>`
      SELECT m.id, m.worker_id, m.priority,
             m.priority_level, m.preferred_dow_prefer, m.preferred_dow_avoid,
             m.max_consecutive_work_days, m.required_days_per_month, m.max_days_per_month,
             m.blocked_slot_ids, m.work_pattern_text,
             w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
      FROM cs_group_members m
      JOIN cs_workers w ON w.id = m.worker_id
      WHERE m.group_id = ${id}
      ORDER BY m.priority ASC
    `
    const data = out.map(r => ({
      ...r,
      priority_level: Number(r.priority_level || 2),
      max_consecutive_work_days: r.max_consecutive_work_days != null ? Number(r.max_consecutive_work_days) : null,
      required_days_per_month: r.required_days_per_month != null ? Number(r.required_days_per_month) : null,
      max_days_per_month: r.max_days_per_month != null ? Number(r.max_days_per_month) : null,
      blocked_slot_ids: r.blocked_slot_ids
        ? (typeof r.blocked_slot_ids === 'string'
           ? (() => { try { return JSON.parse(r.blocked_slot_ids) } catch { return [] } })()
           : (Array.isArray(r.blocked_slot_ids) ? r.blocked_slot_ids : []))
        : null,
    }))
    return NextResponse.json({
      data: serialize({ group_id: id, members: data }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

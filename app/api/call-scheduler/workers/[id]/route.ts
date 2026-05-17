// ═══════════════════════════════════════════════════════════════════
// PATCH /api/call-scheduler/workers/[id] — 워커 수정 (정체성만)
// Phase K (2026-05-09) — 그룹 중심 재구성
//   priority_level / preferred_dow_* / 일수/한도/슬롯거부/패턴 → cs_group_members 로 이동
//   본 라우트는 워커 정체성 (이름/색/외부여부/외부cycle) 만 처리
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

const ALLOWED = new Set([
  'color_tone', 'group_label', 'phone', 'email',
  'is_external', 'external_pattern',
  // Phase K — 외부 근무 cycle (워커 글로벌)
  'cycle_days_on', 'cycle_days_off', 'cycle_start_date',
  // N-29-a — 개인 한계 (그룹 무관 — 워커 단위)
  'max_consecutive_work_days', 'max_days_per_month',
  'blocked_slot_ids', 'preferred_dow_prefer', 'preferred_dow_avoid',
  // N-36 — 글로벌 월 최소 근무일수
  'min_days_per_month',
])
const COLOR_TONES = new Set([
  'blue', 'gray', 'green', 'amber', 'violet', 'red', 'none',
  'indigo', 'sky', 'teal', 'lime', 'orange', 'pink', 'slate',
])

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const body = await request.json()

    // 컬럼 존재 확인 (graceful)
    let hasExt = true, hasCycle = true, hasLimits = true
    try {
      await prisma.$queryRaw<any[]>`SELECT is_external FROM cs_workers LIMIT 1`
    } catch { hasExt = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT cycle_days_on FROM cs_workers LIMIT 1`
    } catch { hasCycle = false }
    // N-29-a — 개인 한계 컬럼 graceful
    try {
      await prisma.$queryRaw<any[]>`SELECT max_consecutive_work_days FROM cs_workers LIMIT 1`
    } catch { hasLimits = false }

    const CYCLE_COLS = new Set(['cycle_days_on', 'cycle_days_off', 'cycle_start_date'])
    const LIMIT_COLS = new Set([
      'max_consecutive_work_days', 'max_days_per_month',
      'blocked_slot_ids', 'preferred_dow_prefer', 'preferred_dow_avoid',
    ])
    const NULLABLE_NUM = new Set(['max_consecutive_work_days', 'max_days_per_month'])

    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(body || {})) {
      if (!ALLOWED.has(k)) continue
      if ((k === 'is_external' || k === 'external_pattern') && !hasExt) continue
      if (CYCLE_COLS.has(k) && !hasCycle) continue
      if (LIMIT_COLS.has(k) && !hasLimits) continue
      if (k === 'color_tone' && !COLOR_TONES.has(String(v))) continue
      if (k === 'is_external') {
        sets.push(`${k} = ?`); params.push(v ? 1 : 0); continue
      }
      if (k === 'cycle_days_on' || k === 'cycle_days_off' || NULLABLE_NUM.has(k)) {
        sets.push(`${k} = ?`); params.push(v == null || v === '' ? null : Number(v)); continue
      }
      if (k === 'blocked_slot_ids') {
        // JSON 배열 → string
        const json = Array.isArray(v) && v.length > 0 ? JSON.stringify(v.map(String)) : null
        sets.push(`${k} = ?`); params.push(json); continue
      }
      sets.push(`${k} = ?`); params.push(v ?? null)
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: '변경할 항목 없음' }, { status: 400 })
    }
    sets.push('updated_at = NOW()')
    const sql = `UPDATE cs_workers SET ${sets.join(', ')} WHERE id = ?`
    params.push(id)
    await prisma.$executeRawUnsafe(sql, ...params)

    return NextResponse.json({ data: { id, updated: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

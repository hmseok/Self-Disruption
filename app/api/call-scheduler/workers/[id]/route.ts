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
  // Phase WHR-A / WHR-A-fix — 인사마스터 연결 (직원 선택 시 employee_id + name/phone 갱신)
  'employee_id',
  // Phase K — 외부 근무 cycle (워커 글로벌, 외부 회사 일정)
  'cycle_days_on', 'cycle_days_off', 'cycle_start_date',
  // N-29-a — 개인 한계 (그룹 무관 — 워커 단위)
  'max_consecutive_work_days', 'max_days_per_month',
  'blocked_slot_ids', 'preferred_dow_prefer', 'preferred_dow_avoid',
  // N-36 — 글로벌 월 최소 근무일수
  'min_days_per_month',
  // N-56-b — work_cycle_pattern 은 그룹멤버 레벨로 이동 (cs_group_members.work_cycle_*)
  //   워커 컬럼 (cs_workers.work_cycle_*) 은 DB 유지 / API 사용 X
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
    // N-58 — 0 또는 음수는 미설정 동의어 → NULL 로 통일
    //   대상: max_consecutive_work_days / max_days_per_month / min_days_per_month
    const ZERO_TO_NULL = new Set(['max_consecutive_work_days', 'max_days_per_month', 'min_days_per_month'])

    const sets: string[] = []
    const params: any[] = []

    // Phase WHR-A / WHR-A-fix — employee_id 연결 시 ride_employees 에서 name/phone 복사 (캐시 동기화)
    if (body && Object.prototype.hasOwnProperty.call(body, 'employee_id') && body.employee_id) {
      const eid = String(body.employee_id).trim()
      // 다른 워커가 이미 이 직원을 사용 중이면 거부 (1:1)
      const dup = await prisma.$queryRaw<any[]>`
        SELECT id, name FROM cs_workers
        WHERE employee_id = ${eid} AND id <> ${id} AND is_active = 1
        LIMIT 1
      `
      if (dup.length > 0) {
        return NextResponse.json(
          { error: `이미 다른 워커에 연결된 직원입니다 (${dup[0].name})` }, { status: 409 },
        )
      }
      const emp = await prisma.$queryRaw<any[]>`
        SELECT id, name, phone, email FROM ride_employees
        WHERE id = ${eid} AND is_active = 1
        LIMIT 1
      `
      if (emp.length === 0) {
        return NextResponse.json(
          { error: '인사마스터에 없는 직원이거나 퇴사자입니다' }, { status: 400 },
        )
      }
      sets.push('employee_id = ?'); params.push(eid)
      sets.push('name = ?'); params.push(String(emp[0].name || '').trim())
      sets.push('phone = ?'); params.push(emp[0].phone ?? null)
      if (emp[0].email != null) { sets.push('email = ?'); params.push(emp[0].email) }
    }

    for (const [k, v] of Object.entries(body || {})) {
      if (!ALLOWED.has(k)) continue
      // employee_id 는 위에서 처리 (name/phone 동반 갱신)
      if (k === 'employee_id') continue
      if ((k === 'is_external' || k === 'external_pattern') && !hasExt) continue
      if (CYCLE_COLS.has(k) && !hasCycle) continue
      if (LIMIT_COLS.has(k) && !hasLimits) continue
      if (k === 'color_tone' && !COLOR_TONES.has(String(v))) continue
      if (k === 'is_external') {
        sets.push(`${k} = ?`); params.push(v ? 1 : 0); continue
      }
      if (k === 'cycle_days_on' || k === 'cycle_days_off' || NULLABLE_NUM.has(k)) {
        // N-58 — limit 컬럼은 0 → NULL 정규화 (사용자 빈 칸 의도 보존)
        let num: number | null
        if (v == null || v === '') {
          num = null
        } else {
          const n = Number(v)
          num = !Number.isFinite(n) || (ZERO_TO_NULL.has(k) && n <= 0) ? null : n
        }
        sets.push(`${k} = ?`); params.push(num); continue
      }
      if (k === 'min_days_per_month') {
        // N-58 — min_days 도 동일 정규화
        let num: number | null
        if (v == null || v === '') {
          num = null
        } else {
          const n = Number(v)
          num = !Number.isFinite(n) || n <= 0 ? null : n
        }
        sets.push(`${k} = ?`); params.push(num); continue
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

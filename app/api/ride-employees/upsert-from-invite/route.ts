// ═══════════════════════════════════════════════════════════════════
// POST /api/ride-employees/upsert-from-invite
//   profile_id 기준 ride_employees UPSERT
//
// PR-HR-8 (2026-05-26, hr 세션) — 메인 세션 PR-MULTI-BRAND P3+c-3 의존.
// 메인 accept (member-invite/accept) 가 profile 생성 후 본 API 호출:
//   target_company === 'RIDE' 인 초대 수락 시,
//   ride_employees 에도 profile_id + ride_department_id 동기화.
//
// body: { profile_id, ride_department_id?, name?, email? }
//   · profile_id 기존 ride_employee 있으면 → UPDATE (department_id/name/email COALESCE)
//   · 없으면 → INSERT (name 필수)
//
// 응답: { data: { ...row, upserted: 'update' | 'insert' }, error: null }
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

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const profile_id = String(body?.profile_id || '').trim()
    const ride_department_id: string | null = body?.ride_department_id ?? null
    const name: string | null = body?.name ? String(body.name).trim() : null
    const email: string | null = body?.email ? String(body.email).trim() : null

    if (!profile_id) {
      return NextResponse.json({ error: 'profile_id 필수' }, { status: 400 })
    }

    // 기존 row 조회 (활성/비활성 모두 — profile_id 기준은 1:1)
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM ride_employees WHERE profile_id = ${profile_id} LIMIT 1
    `

    let upsertedId: string
    let mode: 'update' | 'insert'

    if (existing.length > 0) {
      // UPDATE — 기존 값은 COALESCE 로 보존 (입력이 null/빈값이면 기존 유지)
      upsertedId = existing[0].id
      mode = 'update'
      await prisma.$executeRaw`
        UPDATE ride_employees
           SET department_id = COALESCE(${ride_department_id}, department_id),
               name          = COALESCE(${name}, name),
               email         = COALESCE(${email}, email),
               updated_at    = NOW()
         WHERE id = ${upsertedId}
      `
    } else {
      // INSERT — 신규 ride_employee (name 필수)
      if (!name) {
        return NextResponse.json({ error: '신규 INSERT 시 name 필수' }, { status: 400 })
      }
      upsertedId = crypto.randomUUID()
      mode = 'insert'
      await prisma.$executeRaw`
        INSERT INTO ride_employees
          (id, name, profile_id, department_id, email, color_tone, is_active, created_at, updated_at)
        VALUES
          (${upsertedId}, ${name}, ${profile_id}, ${ride_department_id}, ${email}, 'none', 1, NOW(), NOW())
      `
    }

    // 응답 — JOIN ride_departments 로 부서명 포함
    const rows = await prisma.$queryRaw<any[]>`
      SELECT re.id, re.name, re.profile_id,
             re.department, re.department_id, re.position, re.promotion_target,
             re.employment_type,
             DATE_FORMAT(re.hire_date, '%Y-%m-%d')   AS hire_date,
             DATE_FORMAT(re.resign_date, '%Y-%m-%d') AS resign_date,
             re.phone, re.email, re.color_tone, re.group_label, re.memo,
             re.is_active, re.created_at, re.updated_at,
             rd.name AS department_name, rd.color_tone AS department_color
        FROM ride_employees re
        LEFT JOIN ride_departments rd ON rd.id = re.department_id
       WHERE re.id = ${upsertedId}
       LIMIT 1
    `
    const data = rows[0] ? { ...rows[0], is_active: Boolean(rows[0].is_active), upserted: mode } : null
    return NextResponse.json(
      { data: serialize(data), error: null },
      { status: mode === 'insert' ? 201 : 200 },
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

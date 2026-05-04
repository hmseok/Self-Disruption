// ═══════════════════════════════════════════════════════════════════
// GET  /api/call-scheduler/swap-requests — 교체 요청 목록 (status / schedule / worker 필터)
// POST /api/call-scheduler/swap-requests — 신청 (직원 또는 매니저 대리)
//   ?token 모드: 토큰 검증 후 본인 worker_id 만 허용
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

const STATUSES = ['pending', 'approved', 'rejected', 'canceled'] as const

const SELECT_COLS = `
  r.id, r.schedule_id, r.assignment_id, r.worker_id,
  DATE_FORMAT(r.request_date, '%Y-%m-%d') AS request_date,
  r.reason, r.preferred_swap, r.status, r.resolution_note,
  r.resolved_at, r.resolved_by, r.created_at, r.updated_at,
  w.name AS worker_name, w.color_tone AS worker_tone, w.group_label,
  pw.name AS preferred_name
`

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const sp = request.nextUrl.searchParams
    const status = sp.get('status')
    const scheduleId = sp.get('schedule_id')
    const workerId = sp.get('worker_id')

    const where: string[] = []
    const params: any[] = []
    if (status && (STATUSES as readonly string[]).includes(status)) {
      where.push('r.status = ?'); params.push(status)
    }
    if (scheduleId) { where.push('r.schedule_id = ?'); params.push(scheduleId) }
    if (workerId)   { where.push('r.worker_id = ?'); params.push(workerId) }
    const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''
    const sql = `SELECT ${SELECT_COLS}
                 FROM cs_swap_requests r
                 JOIN cs_workers w ON w.id = r.worker_id
                 LEFT JOIN cs_workers pw ON pw.id = r.preferred_swap
                 ${whereSql}
                 ORDER BY r.created_at DESC`
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const token = sp.get('token')
    const body = await request.json()

    let allowedWorkerId: string | null = null
    if (token) {
      const empRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM ride_employees WHERE public_token = ${token} AND is_active = 1 LIMIT 1
      `
      if (empRows.length === 0) {
        return NextResponse.json({ error: '유효하지 않은 링크' }, { status: 401 })
      }
      const empId = empRows[0].id
      const wRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM cs_workers WHERE employee_id = ${empId} AND is_active = 1 LIMIT 1
      `
      allowedWorkerId = wRows[0]?.id || null
      if (!allowedWorkerId) {
        return NextResponse.json({ error: '워커 매핑 없음' }, { status: 404 })
      }
    } else {
      const user = await verifyUser(request)
      if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
      // 로그인 모드 — body 의 worker_id 사용 (매니저가 대리 신청 가능)
      // 단, profile_id 매칭 워커가 있으면 그쪽으로 강제
      const wRows = await prisma.$queryRaw<any[]>`
        SELECT w.id FROM cs_workers w
        LEFT JOIN ride_employees e ON e.id = w.employee_id
        WHERE e.profile_id = ${user.id} AND w.is_active = 1 LIMIT 1
      `
      if (wRows.length > 0) allowedWorkerId = wRows[0].id
    }

    const schedule_id: string = String(body?.schedule_id || '')
    const request_date: string = String(body?.request_date || '')
    const worker_id: string = allowedWorkerId || String(body?.worker_id || '')
    const reason: string | null = body?.reason ?? null
    const preferred_swap: string | null = body?.preferred_swap ?? null
    const assignment_id: string | null = body?.assignment_id ?? null

    if (!schedule_id || !request_date || !worker_id) {
      return NextResponse.json({ error: 'schedule_id, request_date, worker_id 필수' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(request_date)) {
      return NextResponse.json({ error: 'request_date 형식: YYYY-MM-DD' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    await prisma.$executeRaw`
      INSERT INTO cs_swap_requests
        (id, schedule_id, assignment_id, worker_id, request_date, reason, preferred_swap,
         status, created_at, updated_at)
      VALUES
        (${id}, ${schedule_id}, ${assignment_id}, ${worker_id}, ${request_date},
         ${reason}, ${preferred_swap}, 'pending', NOW(), NOW())
    `
    const rows = await prisma.$queryRaw<any[]>`
      SELECT r.id, r.schedule_id, r.assignment_id, r.worker_id,
             DATE_FORMAT(r.request_date, '%Y-%m-%d') AS request_date,
             r.reason, r.preferred_swap, r.status, r.created_at,
             w.name AS worker_name, w.color_tone AS worker_tone
      FROM cs_swap_requests r
      JOIN cs_workers w ON w.id = r.worker_id
      WHERE r.id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: serialize(rows[0] || null), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

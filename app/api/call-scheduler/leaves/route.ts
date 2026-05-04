// ═══════════════════════════════════════════════════════════════════
// GET  /api/call-scheduler/leaves — 휴가 목록 (year/worker/status 필터)
// POST /api/call-scheduler/leaves — 신청 또는 등록
//   ?token=...     비로그인 직원 모드 → status='pending', 본인 worker_id 강제
//   로그인 매니저  → status='approved' 디폴트 (본인이 신청+승인)
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

const TYPES = ['annual', 'familyday', 'sick', 'unpaid', 'family', 'holiday', 'other'] as const
const AM_PM = ['full', 'am', 'pm', 'custom'] as const
const STATUSES = ['pending', 'approved', 'rejected', 'canceled'] as const

const SELECT_COLS = `
  l.id, l.worker_id, l.leave_type,
  DATE_FORMAT(l.start_date, '%Y-%m-%d') AS start_date,
  DATE_FORMAT(l.end_date, '%Y-%m-%d')   AS end_date,
  l.am_pm,
  CAST(l.hours AS DECIMAL(4,2)) AS hours,
  l.reason, l.status,
  l.applied_at, l.applied_by, l.requested_by,
  l.approved_at, l.approved_by, l.resolution_note,
  l.created_at, l.updated_at,
  w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
`

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const token = sp.get('token')
    const year = sp.get('year')
    const workerIdParam = sp.get('worker_id')
    const status = sp.get('status')

    let restrictWorkerId: string | null = null
    if (token) {
      const empRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM ride_employees WHERE public_token = ${token} AND is_active = 1 LIMIT 1
      `
      if (empRows.length === 0) {
        return NextResponse.json({ error: '유효하지 않은 링크' }, { status: 401 })
      }
      const wRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM cs_workers WHERE employee_id = ${empRows[0].id} AND is_active = 1 LIMIT 1
      `
      restrictWorkerId = wRows[0]?.id || null
      if (!restrictWorkerId) {
        return NextResponse.json({ data: [], error: null })
      }
    } else {
      const user = await verifyUser(request)
      if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    }

    const where: string[] = []
    const params: any[] = []
    if (year) {
      const y = Number(year)
      where.push(`(YEAR(l.start_date) = ? OR YEAR(l.end_date) = ?)`)
      params.push(y, y)
    }
    const effectiveWorker = restrictWorkerId || workerIdParam
    if (effectiveWorker) { where.push('l.worker_id = ?'); params.push(effectiveWorker) }
    if (status && (STATUSES as readonly string[]).includes(status)) {
      where.push('l.status = ?'); params.push(status)
    }
    const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''
    const sql = `SELECT ${SELECT_COLS}
                 FROM cs_leaves l
                 JOIN cs_workers w ON w.id = l.worker_id
                 ${whereSql}
                 ORDER BY l.created_at DESC`
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
    let isManager = false
    let userId: string | null = null

    if (token) {
      const empRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM ride_employees WHERE public_token = ${token} AND is_active = 1 LIMIT 1
      `
      if (empRows.length === 0) {
        return NextResponse.json({ error: '유효하지 않은 링크' }, { status: 401 })
      }
      const wRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM cs_workers WHERE employee_id = ${empRows[0].id} AND is_active = 1 LIMIT 1
      `
      allowedWorkerId = wRows[0]?.id || null
      if (!allowedWorkerId) {
        return NextResponse.json({ error: '워커 매핑 없음' }, { status: 404 })
      }
    } else {
      const user = await verifyUser(request)
      if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
      userId = user.id
      isManager = String(user.role || '') === 'admin' || String(user.role || '') === 'manager'
        || String(user.role || '') === 'member' // 단독 회사라 일단 모든 인증자를 매니저 권한으로
    }

    const worker_id: string = allowedWorkerId || String(body?.worker_id || '')
    const start_date: string = String(body?.start_date || '')
    const end_date: string = String(body?.end_date || start_date)
    if (!worker_id) return NextResponse.json({ error: 'worker_id 필수' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return NextResponse.json({ error: 'start_date 형식: YYYY-MM-DD' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      return NextResponse.json({ error: 'end_date 형식: YYYY-MM-DD' }, { status: 400 })
    }
    if (end_date < start_date) {
      return NextResponse.json({ error: '종료일이 시작일보다 빠릅니다.' }, { status: 400 })
    }
    const leave_type: string = TYPES.includes(body?.leave_type) ? body.leave_type : 'annual'
    const am_pm: string = AM_PM.includes(body?.am_pm) ? body.am_pm : 'full'
    const reason: string | null = body?.reason ?? null
    // hours: am_pm=custom 일 때 입력 / 자동 (full=8, am|pm=4)
    let hours: number | null = null
    if (am_pm === 'custom') {
      hours = Number(body?.hours)
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        return NextResponse.json({ error: 'custom 시간은 0.5~24 사이' }, { status: 400 })
      }
    } else if (am_pm === 'full') {
      hours = 8
    } else {
      hours = 4
    }

    // status 결정:
    // - 토큰(직원) 모드 → 항상 'pending' (매니저 승인 필요)
    // - 로그인 매니저 모드 → body.status 받기 (디폴트 'approved' — 직접 등록)
    let status: string
    if (token) {
      status = 'pending'
    } else {
      status = STATUSES.includes(body?.status) ? body.status : 'approved'
    }

    const id = crypto.randomUUID()
    const now = new Date()
    if (status === 'approved') {
      await prisma.$executeRaw`
        INSERT INTO cs_leaves
          (id, worker_id, leave_type, start_date, end_date, am_pm, hours, reason, status,
           applied_at, applied_by, requested_by, approved_at, approved_by,
           created_at, updated_at)
        VALUES
          (${id}, ${worker_id}, ${leave_type}, ${start_date}, ${end_date},
           ${am_pm}, ${hours}, ${reason}, 'approved',
           ${now}, ${userId}, ${userId}, ${now}, ${userId},
           NOW(), NOW())
      `
    } else {
      // pending — 직원 신청
      await prisma.$executeRaw`
        INSERT INTO cs_leaves
          (id, worker_id, leave_type, start_date, end_date, am_pm, hours, reason, status,
           applied_at, applied_by, requested_by,
           created_at, updated_at)
        VALUES
          (${id}, ${worker_id}, ${leave_type}, ${start_date}, ${end_date},
           ${am_pm}, ${hours}, ${reason}, 'pending',
           ${now}, ${userId}, ${worker_id},
           NOW(), NOW())
      `
    }
    const rows = await prisma.$queryRaw<any[]>`
      SELECT l.id, l.worker_id, l.leave_type,
             DATE_FORMAT(l.start_date, '%Y-%m-%d') AS start_date,
             DATE_FORMAT(l.end_date, '%Y-%m-%d')   AS end_date,
             l.am_pm, l.reason, l.status,
             l.applied_at, l.requested_by, l.approved_at, l.approved_by,
             l.created_at, l.updated_at,
             w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
      FROM cs_leaves l
      JOIN cs_workers w ON w.id = l.worker_id
      WHERE l.id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: serialize(rows[0] || null), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

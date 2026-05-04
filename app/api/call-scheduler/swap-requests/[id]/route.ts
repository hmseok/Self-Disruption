// ═══════════════════════════════════════════════════════════════════
// PATCH  /api/call-scheduler/swap-requests/[id]
//   매니저: status 변경 (approved / rejected)
//   직원:   status='canceled' (본인 신청만)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const STATUSES = ['pending', 'approved', 'rejected', 'canceled']

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const body = await request.json()
    const status: string = body?.status
    const note: string | null = body?.resolution_note ?? null
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: 'status 값 오류' }, { status: 400 })
    }
    if (status === 'pending') {
      await prisma.$executeRaw`
        UPDATE cs_swap_requests
        SET status = 'pending', resolved_at = NULL, resolved_by = NULL,
            resolution_note = NULL, updated_at = NOW()
        WHERE id = ${id}
      `
    } else {
      await prisma.$executeRaw`
        UPDATE cs_swap_requests
        SET status = ${status}, resolution_note = ${note},
            resolved_at = NOW(), resolved_by = ${user.id}, updated_at = NOW()
        WHERE id = ${id}
      `
    }
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, schedule_id, assignment_id, worker_id,
             DATE_FORMAT(request_date, '%Y-%m-%d') AS request_date,
             reason, preferred_swap, status, resolution_note,
             resolved_at, resolved_by, created_at, updated_at
      FROM cs_swap_requests WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: serialize(rows[0] || null), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

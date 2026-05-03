import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * /api/finance/transactions/[id]/assignments
 *
 * 거래 다중 매칭 CRUD (5차원 분리 — transaction_assignments)
 *
 * GET    — 한 거래의 모든 매칭 목록 (legacy related_type/id 도 통합)
 * POST   — 매칭 추가 (body: { assignment_type, assignment_id, ratio?, note? })
 * DELETE — 매칭 제거 (?assignment_type=&assignment_id= 또는 ?row_id=)
 */

const VALID_TYPES = new Set([
  'car', 'employee', 'salary', 'insurance', 'loan',
  'jiip', 'invest', 'fmi_rental', 'rental', 'contract',
  'freelancer', 'card',
])

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await context.params

    // 1) transaction_assignments 의 모든 row
    const rows = await prisma.$queryRaw<Array<any>>`
      SELECT id, transaction_id, assignment_type, assignment_id, ratio, note, created_by, source, created_at, updated_at
        FROM transaction_assignments
       WHERE transaction_id = ${id}
       ORDER BY created_at DESC
    `

    // 2) legacy: transactions.related_type / related_id
    const legacy = await prisma.$queryRaw<Array<any>>`
      SELECT related_type, related_id
        FROM transactions
       WHERE id = ${id} AND deleted_at IS NULL
       LIMIT 1
    `
    const legacyAssignment = (legacy[0]?.related_type && legacy[0]?.related_id)
      ? {
        id: 'legacy',
        transaction_id: id,
        assignment_type: legacy[0].related_type,
        assignment_id: legacy[0].related_id,
        ratio: 100,
        source: 'legacy',
        note: 'transactions.related_type/id (단일 슬롯)',
      } : null

    // 통합 — legacy 가 새 row 와 중복이면 legacy skip
    const seen = new Set(rows.map(r => `${r.assignment_type}:${r.assignment_id}`))
    const merged = legacyAssignment && !seen.has(`${legacyAssignment.assignment_type}:${legacyAssignment.assignment_id}`)
      ? [legacyAssignment, ...rows]
      : rows

    return NextResponse.json({
      data: merged,
      count: merged.length,
    })
  } catch (e: any) {
    console.error('[assignments GET]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await context.params

    const body = await request.json().catch(() => ({}))
    const { assignment_type, assignment_id, ratio, note } = body

    if (!assignment_type || !assignment_id) {
      return NextResponse.json({ error: 'assignment_type + assignment_id 필수' }, { status: 400 })
    }
    if (!VALID_TYPES.has(assignment_type)) {
      return NextResponse.json({ error: `유효하지 않은 type — 허용: ${[...VALID_TYPES].join(', ')}` }, { status: 400 })
    }

    // 거래 존재 확인
    const tx = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM transactions WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
    `
    if (!tx[0]) return NextResponse.json({ error: '거래 없음' }, { status: 404 })

    // 중복 검사
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM transaction_assignments
       WHERE transaction_id = ${id}
         AND assignment_type = ${assignment_type}
         AND assignment_id = ${assignment_id}
       LIMIT 1
    `
    if (existing[0]) {
      return NextResponse.json({ ok: false, already_exists: true, id: existing[0].id })
    }

    const newId = crypto.randomUUID()
    const ratioVal = ratio != null ? Number(ratio) : 100.00
    await prisma.$executeRaw`
      INSERT INTO transaction_assignments
        (id, transaction_id, assignment_type, assignment_id, ratio, note, created_by, source)
      VALUES
        (${newId}, ${id}, ${assignment_type}, ${assignment_id},
         ${ratioVal}, ${note || null}, ${(user as any).id || null}, 'manual')
    `
    return NextResponse.json({ ok: true, id: newId })
  } catch (e: any) {
    console.error('[assignments POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await context.params

    const { searchParams } = request.nextUrl
    const rowId = searchParams.get('row_id')
    const assignmentType = searchParams.get('assignment_type')
    const assignmentId = searchParams.get('assignment_id')

    if (rowId) {
      // legacy row 삭제 — transactions.related_type/id 만 NULL
      if (rowId === 'legacy') {
        await prisma.$executeRaw`
          UPDATE transactions
             SET related_type = NULL, related_id = NULL, updated_at = NOW()
           WHERE id = ${id}
        `
        return NextResponse.json({ ok: true, deleted: 'legacy' })
      }
      // 일반 row
      const r = await prisma.$executeRaw`
        DELETE FROM transaction_assignments
         WHERE id = ${rowId} AND transaction_id = ${id}
      `
      return NextResponse.json({ ok: true, deleted: Number(r) })
    }

    if (assignmentType && assignmentId) {
      const r = await prisma.$executeRaw`
        DELETE FROM transaction_assignments
         WHERE transaction_id = ${id}
           AND assignment_type = ${assignmentType}
           AND assignment_id = ${assignmentId}
      `
      return NextResponse.json({ ok: true, deleted: Number(r) })
    }

    return NextResponse.json({ error: 'row_id 또는 (assignment_type + assignment_id) 필요' }, { status: 400 })
  } catch (e: any) {
    console.error('[assignments DELETE]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/transactions/[id] — 거래 단건 조회 (상세보기/편집용)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const { id } = await params
    const rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM transactions WHERE id = ${id} LIMIT 1
    `
    if (!rows[0]) return NextResponse.json({ error: '항목을 찾을 수 없습니다' }, { status: 404 })
    return NextResponse.json({ data: serialize(rows[0]), error: null })
  } catch (e: any) {
    console.error('[GET /api/transactions/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/transactions/[id] — 파라미터 바인딩 사용
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()

    // 허용 필드 화이트리스트
    const allowed: Record<string, any> = {}
    const allowedKeys = [
      'status', 'category', 'amount', 'client_name', 'description',
      'related_type', 'related_id', 'transaction_date', 'type',
      'memo', 'payment_method',
    ]
    for (const k of allowedKeys) {
      if (body[k] !== undefined) allowed[k] = body[k]
    }
    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: '업데이트할 필드 없음' }, { status: 400 })
    }

    const setParts: string[] = []
    const args: any[] = []
    for (const [k, v] of Object.entries(allowed)) {
      setParts.push(`${k} = ?`)
      args.push(k === 'amount' ? Number(v) : v)
    }
    setParts.push('updated_at = NOW()')
    args.push(id)

    const sql = `UPDATE transactions SET ${setParts.join(', ')} WHERE id = ?`
    await prisma.$executeRawUnsafe(sql, ...args)

    // PR-PAY-SYNC — 대차건에 입금 수동 연결 시 완납 자동 청구완료 (auto-match-fmi-rental 과 동형, 규칙 14)
    //   청구중 + 매칭 입금합계 ≥ 청구액 → settled. 실패해도 링크 자체는 성공 (graceful).
    if (allowed.related_type === 'fmi_rental' && allowed.related_id) {
      try {
        await prisma.$executeRaw`
          UPDATE fmi_rentals r
            JOIN (
              SELECT related_id, SUM(amount) AS s
                FROM transactions
               WHERE related_type = 'fmi_rental' AND type = 'income' AND deleted_at IS NULL
               GROUP BY related_id
            ) p ON p.related_id = r.id
             SET r.status = 'settled', r.updated_at = NOW()
           WHERE r.id = ${allowed.related_id}
             AND r.status = 'claiming'
             AND r.final_claim_amount IS NOT NULL AND r.final_claim_amount > 0
             AND p.s >= r.final_claim_amount
        `
      } catch (e) {
        console.warn('[transactions PATCH] 완납 전이 skip:', (e as Error)?.message)
      }
    }

    // 업데이트된 행 반환
    const rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM transactions WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: rows[0] ? serialize(rows[0]) : { id }, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/transactions/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/transactions/[id] — soft delete (deleted_at 기록)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const { id } = await params
    const { searchParams } = request.nextUrl
    const hard = searchParams.get('hard') === '1' // hard delete 옵션

    if (hard) {
      await prisma.$executeRaw`DELETE FROM transactions WHERE id = ${id}`
    } else {
      await prisma.$executeRaw`
        UPDATE transactions SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${id}
      `
    }
    return NextResponse.json({ data: { id, hard }, error: null })
  } catch (e: any) {
    console.error('[DELETE /api/transactions/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

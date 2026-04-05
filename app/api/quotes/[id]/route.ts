import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    const data = await prisma.$queryRaw<any[]>`SELECT * FROM quotes WHERE id = ${id} LIMIT 1`

    if (!data || data.length === 0) {
      return NextResponse.json({ data: null, error: '견적을 찾을 수 없습니다.' }, { status: 404 })
    }

    // Fetch quote_detail if exists
    let quote = serialize(data[0])
    const details = await prisma.$queryRaw<any[]>`SELECT * FROM quote_detail WHERE quote_id = ${id} LIMIT 1`
    if (details && details.length > 0) {
      quote.quote_detail = serialize(details[0])
    }

    return NextResponse.json({ data: quote, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// 허용 필드 화이트리스트 (SQL Injection 방지)
const UPDATABLE_FIELDS = [
  'customer_id', 'customer_name', 'car_id', 'status',
  'contract_type', 'term_months', 'start_date', 'end_date',
  'deposit', 'rent_fee', 'margin', 'shared_at', 'signed_at',
  'expires_at', 'quote_type', 'quote_detail', 'terms_version_id',
]

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const fields = Object.keys(body).filter(k => UPDATABLE_FIELDS.includes(k) && body[k] !== undefined)
    if (fields.length === 0) {
      return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 })
    }

    const setClause = fields.map(f => `\`${f}\` = ?`).join(', ')
    const vals = fields.map(f => {
      // JSON 필드는 문자열로 변환
      if (f === 'quote_detail' && typeof body[f] === 'object') {
        return JSON.stringify(body[f])
      }
      return body[f]
    })

    await prisma.$executeRawUnsafe(
      `UPDATE quotes SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      ...vals,
      id
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM quotes WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params

    // Cascade 삭제: 관련 데이터 정리
    try {
      // 1. 계약의 납부 스케줄 삭제
      await prisma.$executeRaw`DELETE ps FROM payment_schedules ps INNER JOIN contracts c ON ps.contract_id = c.id WHERE c.quote_id = ${id}`
    } catch { /* 테이블 없으면 무시 */ }
    try {
      // 2. 계약 삭제
      await prisma.$executeRaw`DELETE FROM contracts WHERE quote_id = ${id}`
    } catch { /* 무시 */ }
    // 3. 서명 삭제
    await prisma.$executeRaw`DELETE FROM customer_signatures WHERE quote_id = ${id}`
    // 4. 공유 토큰 삭제
    await prisma.$executeRaw`DELETE FROM quote_share_tokens WHERE quote_id = ${id}`
    // 5. 라이프사이클 이벤트 삭제
    try {
      await prisma.$executeRaw`DELETE FROM quote_lifecycle_events WHERE quote_id = ${id}`
    } catch { /* 테이블 없으면 무시 */ }
    // 6. 견적 상세 삭제
    try {
      await prisma.$executeRaw`DELETE FROM quote_detail WHERE quote_id = ${id}`
    } catch { /* 테이블 없으면 무시 */ }
    // 7. 견적 삭제
    await prisma.$executeRaw`DELETE FROM quotes WHERE id = ${id}`

    return NextResponse.json({ data: null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

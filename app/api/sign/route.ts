import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// MySQL DATETIME 형식 변환
function toMySQLDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

// GET: 토큰으로 견적서 정보 조회 (공개 접근)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: '토큰이 필요합니다' }, { status: 400 })

  // 토큰 유효성 확인
  const tokenDataArr = await prisma.$queryRaw<any[]>`
    SELECT * FROM quote_share_tokens WHERE token = ${token} AND status = 'active' LIMIT 1
  `
  const tokenData = tokenDataArr[0]

  if (!tokenData) {
    return NextResponse.json({ error: '유효하지 않거나 만료된 링크입니다.' }, { status: 404 })
  }

  // 만료 확인
  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    await prisma.$executeRaw`UPDATE quote_share_tokens SET status = 'expired' WHERE id = ${tokenData.id}`
    return NextResponse.json({ error: '링크가 만료되었습니다.' }, { status: 410 })
  }

  // 견적서 정보 조회
  const quoteArr = await prisma.$queryRaw<any[]>`
    SELECT * FROM quotes WHERE id = ${tokenData.quote_id} LIMIT 1
  `
  const quote = quoteArr[0]

  if (!quote) {
    return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 회사 정보 조회
  const companies = await prisma.$queryRaw<any[]>`
    SELECT name, phone, address, representative FROM companies LIMIT 1
  `
  const company = companies[0]

  // 접근 기록
  await prisma.$executeRaw`
    UPDATE quote_share_tokens SET accessed_at = ${toMySQLDatetime(new Date())}, access_count = ${(tokenData.access_count || 0) + 1} WHERE id = ${tokenData.id}
  `

  // viewed 이벤트 기록
  await prisma.$executeRaw`
    INSERT INTO quote_lifecycle_events (quote_id, event_type, channel, metadata) VALUES (${tokenData.quote_id}, 'viewed', 'link', ${JSON.stringify({ token: token.slice(0, 8) + '...' })})
  `

  // 이미 서명 완료된 경우 확인
  const existingSigArr = await prisma.$queryRaw<any[]>`
    SELECT id, signed_at, customer_name FROM customer_signatures WHERE token_id = ${tokenData.id} LIMIT 1
  `
  const existingSig = existingSigArr[0]

  return NextResponse.json(serialize({
    quote,
    company,
    token_id: tokenData.id,
    already_signed: !!existingSig,
    signed_info: existingSig ? { name: existingSig.customer_name, signed_at: existingSig.signed_at } : null,
  }))
}

// POST: 서명 저장
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, customer_name, customer_phone, signature_data, agreed_terms } = body

    if (!token || !signature_data || !agreed_terms) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
    }

    // 토큰 확인
    const tokenDataArr = await prisma.$queryRaw<any[]>`
      SELECT * FROM quote_share_tokens WHERE token = ${token} AND status = 'active' LIMIT 1
    `
    const tokenData = tokenDataArr[0]

    if (!tokenData) {
      return NextResponse.json({ error: '유효하지 않거나 만료된 링크입니다.' }, { status: 404 })
    }

    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: '링크가 만료되었습니다.' }, { status: 410 })
    }

    // 이미 서명 여부 확인
    const existingArr = await prisma.$queryRaw<any[]>`
      SELECT id FROM customer_signatures WHERE token_id = ${tokenData.id} LIMIT 1
    `

    if (existingArr.length > 0) {
      return NextResponse.json({ error: '이미 서명이 완료되었습니다.' }, { status: 409 })
    }

    // 서명 저장
    const sigId = await prisma.$queryRaw<any[]>`
      INSERT INTO customer_signatures (quote_id, token_id, customer_name, customer_phone, signature_data, agreed_terms, signed_at, ip_address, user_agent)
      VALUES (${tokenData.quote_id}, ${tokenData.id}, ${customer_name || ''}, ${customer_phone || ''}, ${signature_data}, 1, ${toMySQLDatetime(new Date())}, ${request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || ''}, ${request.headers.get('user-agent') || ''})
    `

    if (!sigId) {
      console.error('서명 저장 실패')
      return NextResponse.json({ error: '서명 저장에 실패했습니다.' }, { status: 500 })
    }

    // 토큰 상태 → signed
    await prisma.$executeRaw`UPDATE quote_share_tokens SET status = 'signed' WHERE id = ${tokenData.id}`

    // 견적서 상태 업데이트
    await prisma.$executeRaw`UPDATE quotes SET signed_at = ${toMySQLDatetime(new Date())} WHERE id = ${tokenData.quote_id}`

    // signed 이벤트
    await prisma.$executeRaw`
      INSERT INTO quote_lifecycle_events (quote_id, event_type, channel, recipient, metadata)
      VALUES (${tokenData.quote_id}, 'signed', 'link', ${customer_name || ''}, ${JSON.stringify({ signature_id: sigId[0]?.id })})
    `

    return NextResponse.json(serialize({ success: true, signature_id: sigId[0]?.id }))
  } catch (err: any) {
    console.error('서명 API 오류:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

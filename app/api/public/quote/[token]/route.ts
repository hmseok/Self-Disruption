import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { recordViewedEvent } from '@/app/utils/lifecycle-events'

/**
 * 공개 견적 조회 API (인증 불필요)
 * GET /api/public/quote/[token]
 *
 * 고객이 공유 링크를 열면 이 API를 통해 견적 데이터를 조회
 */

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 })
    }

    // 1. 토큰 조회
    const shareToken = await prisma.$queryRaw<any[]>`
      SELECT * FROM quote_share_tokens WHERE token = ${token} LIMIT 1
    `

    if (!shareToken || shareToken.length === 0) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 404 })
    }

    // 2. 상태 검증
    if (shareToken[0].status === 'revoked') {
      return NextResponse.json({ error: '취소된 링크입니다.', code: 'REVOKED' }, { status: 410 })
    }
    if (shareToken[0].status === 'signed') {
      return NextResponse.json({ error: '이미 서명이 완료된 견적입니다.', code: 'SIGNED' }, { status: 200 })
    }
    if (new Date(shareToken[0].expires_at) < new Date()) {
      return NextResponse.json({ error: '만료된 링크입니다.', code: 'EXPIRED' }, { status: 410 })
    }

    // 3. 접근 카운트 증가
    await prisma.$executeRaw`
      UPDATE quote_share_tokens
      SET accessed_at = NOW(), access_count = access_count + 1
      WHERE id = ${shareToken[0].id}
    `

    // 3-1. 열람 이벤트 기록
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    recordViewedEvent({
      companyId: shareToken[0].company_id,
      quoteId: shareToken[0].quote_id,
      eventType: 'viewed',
      ip,
      metadata: {
        user_agent: req.headers.get('user-agent') || 'unknown',
        access_count: (shareToken[0].access_count || 0) + 1,
      },
    })

    // 4. 견적 데이터 조회
    const quote = await prisma.$queryRaw<any[]>`
      SELECT * FROM quotes WHERE id = ${shareToken[0].quote_id} LIMIT 1
    `

    if (!quote || quote.length === 0) {
      console.error('[public/quote] 견적 조회 실패:', 'quote_id:', shareToken[0].quote_id)
      return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 4-1. 차량 정보 개별 조회
    let carData: any = null
    if (quote[0].car_id) {
      const car = await prisma.$queryRaw<any[]>`
        SELECT * FROM cars WHERE id = ${quote[0].car_id} LIMIT 1
      `
      carData = car?.[0]
    }

    // 4-2. 고객 정보 개별 조회
    let customerData: any = null
    if (quote[0].customer_id) {
      const customer = await prisma.$queryRaw<any[]>`
        SELECT id, name, phone, email FROM customers WHERE id = ${quote[0].customer_id} LIMIT 1
      `
      customerData = customer?.[0]
    }

    // 5. 회사 정보 조회
    const company = await prisma.$queryRaw<any[]>`
      SELECT name, business_number, address, phone, email, logo_url FROM companies
      WHERE id = ${shareToken[0].company_id} LIMIT 1
    `

    // 6. 약관 조회
    let termsArticles: Array<{ title: string; content: string }> = []
    try {
      const activeTerms = await prisma.$queryRaw<any[]>`
        SELECT id, version, title FROM contract_terms WHERE status = 'active' LIMIT 1
      `

      if (activeTerms && activeTerms.length > 0) {
        const articles = await prisma.$queryRaw<any[]>`
          SELECT article_number, title, content FROM contract_term_articles
          WHERE terms_id = ${activeTerms[0].id}
          ORDER BY article_number
        `
        if (articles && articles.length > 0) {
          termsArticles = articles.map(a => ({
            title: `제${a.article_number}조 (${a.title})`,
            content: a.content,
          }))
        }
      }
    } catch {
      // contract_terms 테이블이 없어도 진행
    }

    // 7. 고객용 데이터 가공
    const detail = quote[0].quote_detail || {}
    const carInfo = detail.car_info || {}
    const car = carData || {}

    const publicData = {
      id: quote[0].id,
      status: quote[0].status,
      created_at: quote[0].created_at,
      expires_at: quote[0].expires_at,

      car: {
        brand: car.brand || carInfo.brand,
        model: car.model || carInfo.model,
        trim: car.trim || carInfo.trim,
        year: car.year || carInfo.year,
        fuel_type: car.fuel_type || carInfo.fuel,
        number: car.number || '',
        engine_cc: car.engine_cc || carInfo.engine_cc,
        factory_price: detail.factory_price || car.factory_price || 0,
      },

      contract_type: detail.contract_type || 'return',
      term_months: detail.term_months || 36,
      start_date: quote[0].start_date,
      end_date: quote[0].end_date,
      annual_mileage: detail.annualMileage || detail.baselineKm || 2,
      maint_package: detail.maint_package || 'basic',
      driver_age_group: detail.driver_age_group || '26세이상',
      deductible: detail.deductible || 0,
      excess_mileage_rate: detail.excess_mileage_rate || 0,

      rent_fee: quote[0].rent_fee || 0,
      deposit: quote[0].deposit || 0,
      prepayment: detail.prepayment || 0,
      buyout_price: detail.buyout_price || detail.residual_value || 0,
      residual_rate: detail.residual_rate || 0,

      customer_name: customerData?.name || quote[0].customer_name || detail.manual_customer?.name || '',

      ins_estimate: detail.ins_estimate || null,

      company: company?.[0] || null,

      alreadySigned: false,

      termsArticles: termsArticles.length > 0 ? termsArticles : null,
    }

    return NextResponse.json(serialize(publicData))
  } catch (e: any) {
    console.error('[public/quote] 에러:', e.message)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

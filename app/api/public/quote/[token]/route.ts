import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * 공개 견적 조회 API (인증 불필요)
 * GET /api/public/quote/[token]
 *
 * 고객이 공유 링크를 열면 이 API를 통해 견적 데이터를 조회
 * - 토큰 유효성 검증
 * - 접근 카운트 증가
 * - 원가/마진 데이터 제외한 고객용 데이터만 반환
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. 토큰 조회
    const { data: shareToken, error: tokenErr } = await supabase
      .from('quote_share_tokens')
      .select('*')
      .eq('token', token)
      .single()

    if (tokenErr || !shareToken) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 404 })
    }

    // 2. 상태 검증
    if (shareToken.status === 'revoked') {
      return NextResponse.json({ error: '취소된 링크입니다.', code: 'REVOKED' }, { status: 410 })
    }
    if (shareToken.status === 'signed') {
      return NextResponse.json({ error: '이미 서명이 완료된 견적입니다.', code: 'SIGNED' }, { status: 200 })
    }
    if (new Date(shareToken.expires_at) < new Date()) {
      return NextResponse.json({ error: '만료된 링크입니다.', code: 'EXPIRED' }, { status: 410 })
    }

    // 3. 접근 카운트 증가
    await supabase
      .from('quote_share_tokens')
      .update({
        accessed_at: new Date().toISOString(),
        access_count: (shareToken.access_count || 0) + 1
      })
      .eq('id', shareToken.id)

    // 4. 견적 데이터 조회 (조인 대신 개별 조회 — FK 미설정 시에도 안전)
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', shareToken.quote_id)
      .single()

    if (quoteErr || !quote) {
      console.error('[public/quote] 견적 조회 실패:', quoteErr?.message, 'quote_id:', shareToken.quote_id)
      return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 4-1. 차량 정보 개별 조회
    let carData: any = null
    if (quote.car_id) {
      const { data } = await supabase.from('cars').select('*').eq('id', quote.car_id).single()
      carData = data
    }

    // 4-2. 고객 정보 개별 조회
    let customerData: any = null
    if (quote.customer_id) {
      const { data } = await supabase.from('customers').select('id, name, phone, email').eq('id', quote.customer_id).single()
      customerData = data
    }

    // 5. 회사 정보 조회
    const { data: company } = await supabase
      .from('companies')
      .select('name, business_number, address, phone, email, logo_url')
      .eq('id', shareToken.company_id)
      .single()

    // 6. 약관 조회 (서명 전 미리보기용)
    let termsArticles: Array<{ title: string; content: string }> = []
    try {
      // 회사의 active 약관 조회
      const { data: activeTerms } = await supabase
        .from('contract_terms')
        .select('id, version, title')
        .eq('company_id', shareToken.company_id)
        .eq('status', 'active')
        .single()

      if (activeTerms) {
        const { data: articles } = await supabase
          .from('contract_term_articles')
          .select('article_number, title, content')
          .eq('terms_id', activeTerms.id)
          .order('article_number')
        if (articles && articles.length > 0) {
          termsArticles = articles.map(a => ({
            title: `제${a.article_number}조 (${a.title})`,
            content: a.content,
          }))
        }
      }
    } catch { /* contract_terms 테이블이 없어도 진행 */ }

    // 7. 고객용 데이터 가공 (원가/마진 제외)
    const detail = quote.quote_detail || {}
    const carInfo = detail.car_info || {}
    const car = carData || {}

    const publicData = {
      // 견적 기본
      id: quote.id,
      status: quote.status,
      created_at: quote.created_at,
      expires_at: quote.expires_at,

      // 차량 정보
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

      // 계약 조건
      contract_type: detail.contract_type || 'return',
      term_months: detail.term_months || 36,
      start_date: quote.start_date,
      end_date: quote.end_date,
      annual_mileage: detail.annualMileage || detail.baselineKm || 2,
      maint_package: detail.maint_package || 'basic',
      driver_age_group: detail.driver_age_group || '26세이상',
      deductible: detail.deductible || 0,
      excess_mileage_rate: detail.excess_mileage_rate || 0,

      // 금액 (고객에게 보여줄 항목만)
      rent_fee: quote.rent_fee || 0,
      deposit: quote.deposit || 0,
      prepayment: detail.prepayment || 0,
      buyout_price: detail.buyout_price || detail.residual_value || 0,
      residual_rate: detail.residual_rate || 0,

      // 고객 정보
      customer_name: customerData?.name || quote.customer_name || detail.manual_customer?.name || '',

      // 보험 관련
      ins_estimate: detail.ins_estimate || null,

      // 회사 정보
      company: company || null,

      // 서명 상태
      alreadySigned: false,

      // 약관 조항 (서명 전 미리보기용, 없으면 프론트에서 정적 약관 표시)
      termsArticles: termsArticles.length > 0 ? termsArticles : null,
    }

    return NextResponse.json(publicData)
  } catch (e: any) {
    console.error('[public/quote] 에러:', e.message)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

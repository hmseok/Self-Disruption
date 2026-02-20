import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { CONTRACT_TERMS, RETURN_TYPE_ADDENDUM, BUYOUT_TYPE_ADDENDUM } from '@/lib/contract-terms'

/**
 * 공개 계약서 PDF 데이터 API (인증 불필요)
 * GET /api/public/contract/[token]/pdf
 *
 * 서명 완료된 계약의 PDF 생성에 필요한 전체 데이터 반환
 * (실제 PDF 렌더링은 클라이언트에서 html2canvas + jsPDF로 수행)
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

    // 1. 토큰 검증 — signed 상태만 허용
    const { data: shareToken, error: tokenErr } = await supabase
      .from('quote_share_tokens')
      .select('*')
      .eq('token', token)
      .single()

    if (tokenErr || !shareToken) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 404 })
    }
    if (shareToken.status !== 'signed') {
      return NextResponse.json({ error: '서명이 완료되지 않은 견적입니다.' }, { status: 403 })
    }

    // 2. 견적 조회
    const { data: quote } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', shareToken.quote_id)
      .single()

    if (!quote) {
      return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 3. 계약 조회
    const { data: contract } = await supabase
      .from('contracts')
      .select('*')
      .eq('quote_id', quote.id)
      .single()

    // 4. 차량 정보
    let car: any = null
    if (quote.car_id) {
      const { data } = await supabase.from('cars').select('*').eq('id', quote.car_id).single()
      car = data
    }

    // 5. 고객 정보
    let customer: any = null
    if (quote.customer_id) {
      const { data } = await supabase.from('customers').select('*').eq('id', quote.customer_id).single()
      customer = data
    }

    // 6. 회사 정보
    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('id', shareToken.company_id)
      .single()

    // 7. 서명 데이터
    const { data: signature } = await supabase
      .from('customer_signatures')
      .select('*')
      .eq('token_id', shareToken.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // 8. 약관 조회 (계약에 연결된 버전 또는 회사 active 버전)
    let termsArticles: any[] = []
    let termsVersion: any = null

    const termsVersionId = contract?.terms_version_id || quote?.terms_version_id
    if (termsVersionId) {
      const { data: tv } = await supabase.from('contract_terms').select('*').eq('id', termsVersionId).single()
      termsVersion = tv
    }
    if (!termsVersion && company) {
      const { data: tv } = await supabase
        .from('contract_terms')
        .select('*')
        .eq('company_id', company.id)
        .eq('status', 'active')
        .single()
      termsVersion = tv
    }

    if (termsVersion) {
      const { data: arts } = await supabase
        .from('contract_term_articles')
        .select('*')
        .eq('terms_id', termsVersion.id)
        .order('article_number', { ascending: true })
      termsArticles = arts || []
    }

    // DB 약관이 없으면 정적 약관(lib/contract-terms.ts)을 fallback으로 사용
    const useFallbackTerms = termsArticles.length === 0

    // 9. 특약사항
    let specialTermsText = contract?.special_terms || ''
    if (!specialTermsText && company) {
      const detail = quote.quote_detail || {}
      const contractType = detail.contract_type || 'return'
      const { data: specials } = await supabase
        .from('contract_special_terms')
        .select('content')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .eq('is_default', true)
        .in('contract_type', [contractType, 'all'])
        .order('sort_order')
      if (specials?.length) {
        specialTermsText = specials.map(s => s.content).join('\n\n')
      }
    }

    // 10. 납부 스케줄
    let paymentSchedule: any[] = []
    if (contract) {
      const { data: ps } = await supabase
        .from('payment_schedules')
        .select('round_number, due_date, amount, vat')
        .eq('contract_id', contract.id)
        .order('round_number', { ascending: true })
      paymentSchedule = ps || []
    }

    // 11. 응답 데이터 조합
    const detail = quote.quote_detail || {}
    const carInfo = detail.car_info || {}

    return NextResponse.json({
      contractId: contract?.id || quote.id,
      contractNumber: contract?.contract_number || null,
      signedAt: quote.signed_at || signature?.created_at || new Date().toISOString(),

      company: {
        name: company?.name || '',
        business_number: company?.business_number || '',
        representative: company?.representative || '',
        address: company?.address || '',
        phone: company?.phone || '',
        logo_url: company?.logo_url || '',
      },

      customer: {
        name: signature?.customer_name || customer?.name || quote.customer_name || '',
        phone: signature?.customer_phone || customer?.phone || '',
        email: signature?.customer_email || customer?.email || '',
        address: customer?.address || '',
      },

      car: {
        brand: car?.brand || carInfo.brand || '',
        model: car?.model || carInfo.model || '',
        trim: car?.trim || carInfo.trim || '',
        year: car?.year || carInfo.year || 0,
        fuel_type: car?.fuel_type || carInfo.fuel || '',
        number: car?.number || '',
        factory_price: detail.factory_price || car?.factory_price || 0,
        engine_cc: car?.engine_cc || carInfo.engine_cc || 0,
      },

      terms: {
        contractType: detail.contract_type || 'return',
        termMonths: detail.term_months || 36,
        startDate: quote.start_date || '',
        endDate: quote.end_date || '',
        monthlyRent: quote.rent_fee || 0,
        deposit: quote.deposit || 0,
        prepayment: detail.prepayment || 0,
        annualMileage: detail.annualMileage || detail.baselineKm || 2,
        excessMileageRate: detail.excess_mileage_rate || 0,
        maintPackage: detail.maint_package || 'basic',
        driverAgeGroup: detail.driver_age_group || '',
        deductible: detail.deductible || 0,
        buyoutPrice: detail.buyout_price || detail.residual_value || 0,
      },

      signatureData: signature?.signature_data || null,
      signatureIp: signature?.ip_address || null,

      // 약관 조항 배열 (DB 약관 우선, 없으면 정적 약관 fallback)
      termsArticles: useFallbackTerms
        ? CONTRACT_TERMS.map(t => ({ title: t.title, content: t.content }))
        : termsArticles.map(a => ({
            title: `제${a.article_number}조 (${a.title})`,
            content: a.content,
          })),
      termsVersion: termsVersion ? {
        version: termsVersion.version,
        title: termsVersion.title,
        effective_from: termsVersion.effective_from,
      } : (useFallbackTerms ? { version: 'v1.0', title: '자동차 장기대여 약관 (기본)', effective_from: null } : null),

      // 부속 약관 (계약유형별)
      addendum: useFallbackTerms
        ? ((detail.contract_type || 'return') === 'buyout' ? BUYOUT_TYPE_ADDENDUM : RETURN_TYPE_ADDENDUM)
        : null,

      specialTerms: specialTermsText,

      paymentSchedule: paymentSchedule.map(p => ({
        round: p.round_number,
        dueDate: p.due_date,
        amount: p.amount,
        vat: p.vat,
      })),
    })

  } catch (e: any) {
    console.error('[public/contract/pdf] 에러:', e.message)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

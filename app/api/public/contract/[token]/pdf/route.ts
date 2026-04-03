import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { CONTRACT_TERMS, RETURN_TYPE_ADDENDUM, BUYOUT_TYPE_ADDENDUM } from '@/lib/contract-terms'

/**
 * 공개 계약서 PDF 데이터 API (인증 불필요)
 * GET /api/public/contract/[token]/pdf
 *
 * 서명 완료된 계약의 PDF 생성에 필요한 전체 데이터 반환
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

    // 1. 토큰 검증 — signed 상태만 허용
    const shareToken = await prisma.$queryRaw<any[]>`
      SELECT * FROM quote_share_tokens WHERE token = ${token} LIMIT 1
    `

    if (!shareToken || shareToken.length === 0) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 404 })
    }
    if (shareToken[0].status !== 'signed') {
      return NextResponse.json({ error: '서명이 완료되지 않은 견적입니다.' }, { status: 403 })
    }

    // 2. 견적 조회
    const quote = await prisma.$queryRaw<any[]>`
      SELECT * FROM quotes WHERE id = ${shareToken[0].quote_id} LIMIT 1
    `

    if (!quote || quote.length === 0) {
      return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 3. 계약 조회
    const contract = await prisma.$queryRaw<any[]>`
      SELECT * FROM contracts WHERE quote_id = ${quote[0].id} LIMIT 1
    `

    // 4. 차량 정보
    let car: any = null
    if (quote[0].car_id) {
      const carData = await prisma.$queryRaw<any[]>`
        SELECT * FROM cars WHERE id = ${quote[0].car_id} LIMIT 1
      `
      car = carData?.[0]
    }

    // 5. 고객 정보
    let customer: any = null
    if (quote[0].customer_id) {
      const customerData = await prisma.$queryRaw<any[]>`
        SELECT * FROM customers WHERE id = ${quote[0].customer_id} LIMIT 1
      `
      customer = customerData?.[0]
    }

    // 6. 회사 정보
    const company = await prisma.$queryRaw<any[]>`
      SELECT * FROM companies WHERE id = ${shareToken[0].company_id} LIMIT 1
    `

    // 7. 서명 데이터
    const signature = await prisma.$queryRaw<any[]>`
      SELECT * FROM customer_signatures WHERE token_id = ${shareToken[0].id}
      ORDER BY created_at DESC LIMIT 1
    `

    // 8. 약관 조회
    let termsArticles: any[] = []
    let termsVersion: any = null

    const termsVersionId = contract?.[0]?.terms_version_id || quote[0]?.terms_version_id
    if (termsVersionId) {
      const tv = await prisma.$queryRaw<any[]>`
        SELECT * FROM contract_terms WHERE id = ${termsVersionId} LIMIT 1
      `
      termsVersion = tv?.[0]
    }
    if (!termsVersion && company) {
      const tv = await prisma.$queryRaw<any[]>`
        SELECT * FROM contract_terms WHERE status = 'active' LIMIT 1
      `
      termsVersion = tv?.[0]
    }

    if (termsVersion) {
      const arts = await prisma.$queryRaw<any[]>`
        SELECT * FROM contract_term_articles WHERE terms_id = ${termsVersion.id}
        ORDER BY article_number ASC
      `
      termsArticles = arts || []
    }

    const useFallbackTerms = termsArticles.length === 0

    // 9. 특약사항
    let specialTermsText = contract?.[0]?.special_terms || ''
    if (!specialTermsText && company) {
      const detail = quote[0].quote_detail || {}
      const contractType = detail.contract_type || 'return'
      const specials = await prisma.$queryRaw<any[]>`
        SELECT content FROM contract_special_terms
        WHERE is_active = 1 AND is_default = 1
        AND (contract_type = ${contractType} OR contract_type = 'all')
        ORDER BY sort_order
      `
      if (specials?.length) {
        specialTermsText = specials.map(s => s.content).join('\n\n')
      }
    }

    // 10. 납부 스케줄
    let paymentSchedule: any[] = []
    if (contract) {
      const ps = await prisma.$queryRaw<any[]>`
        SELECT round_number, due_date, amount, vat FROM payment_schedules
        WHERE contract_id = ${contract[0].id}
        ORDER BY round_number ASC
      `
      paymentSchedule = ps || []
    }

    // 11. 응답 데이터 조합
    const detail = quote[0].quote_detail || {}
    const carInfo = detail.car_info || {}

    const data = {
      contractId: contract?.[0]?.id || quote[0].id,
      contractNumber: contract?.[0]?.contract_number || null,
      signedAt: quote[0].signed_at || signature?.[0]?.created_at || new Date().toISOString(),

      company: {
        name: company?.[0]?.name || '',
        business_number: company?.[0]?.business_number || '',
        representative: company?.[0]?.representative || '',
        address: company?.[0]?.address || '',
        phone: company?.[0]?.phone || '',
        logo_url: company?.[0]?.logo_url || '',
      },

      customer: {
        name: signature?.[0]?.customer_name || customer?.[0]?.name || quote[0].customer_name || '',
        phone: signature?.[0]?.customer_phone || customer?.[0]?.phone || '',
        email: signature?.[0]?.customer_email || customer?.[0]?.email || '',
        address: customer?.[0]?.address || '',
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
        startDate: quote[0].start_date || '',
        endDate: quote[0].end_date || '',
        monthlyRent: Math.round((quote[0].rent_fee || 0) / 1000) * 1000,
        deposit: quote[0].deposit || 0,
        prepayment: detail.prepayment || 0,
        annualMileage: detail.annualMileage || detail.baselineKm || 2,
        excessMileageRate: detail.excess_mileage_rate || 0,
        maintPackage: detail.maint_package || 'basic',
        driverAgeGroup: detail.driver_age_group || '',
        deductible: detail.deductible || 0,
        buyoutPrice: detail.buyout_price || detail.residual_value || 0,
      },

      signatureData: signature?.[0]?.signature_data || null,
      signatureIp: signature?.[0]?.ip_address || null,

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
    }

    return NextResponse.json(serialize(data))
  } catch (e: any) {
    console.error('[public/contract/pdf] 에러:', e.message)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

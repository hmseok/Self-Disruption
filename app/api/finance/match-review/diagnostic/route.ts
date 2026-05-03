import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/finance/match-review/diagnostic
 *
 * 매칭 시스템 진단 — 어디서 매칭이 막혀 있는지 한눈에 확인.
 *
 * 응답:
 *   tables: 각 매칭 소스 테이블 row count
 *   masters: 마스터 데이터 (보험/대출/지입 등) row count
 *   sources: transaction_vehicle_allocations source_type 별 분포
 *   fmi_rentals: customer_car_number 가 있는 대차건 수 + 보험사 분포
 *   sample_unmatched: 미매칭 통장 입금 거래 샘플 5건 (입금자명 패턴 확인용)
 */

export const maxDuration = 60
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

async function safeCount(sql: string): Promise<number> {
  try {
    const r = await prisma.$queryRawUnsafe<Array<any>>(sql)
    return Number(r[0]?.cnt || 0)
  } catch {
    return -1 // 테이블 없음 또는 에러
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    // 1) 매칭 소스 테이블 row count
    const tables = {
      transactions:                    await safeCount(`SELECT COUNT(*) AS cnt FROM transactions WHERE deleted_at IS NULL`),
      transactions_classified:         await safeCount(`SELECT COUNT(*) AS cnt FROM transactions WHERE deleted_at IS NULL AND category IS NOT NULL AND category != '' AND category != '미분류'`),
      transactions_with_related:       await safeCount(`SELECT COUNT(*) AS cnt FROM transactions WHERE deleted_at IS NULL AND related_type IS NOT NULL AND related_id IS NOT NULL`),
      transaction_assignments:         await safeCount(`SELECT COUNT(*) AS cnt FROM transaction_assignments`),
      transaction_vehicle_allocations: await safeCount(`SELECT COUNT(*) AS cnt FROM transaction_vehicle_allocations`),
    }

    // 2) 마스터 데이터 (매칭 후보 풀)
    const masters = {
      cars:                       await safeCount(`SELECT COUNT(*) AS cnt FROM cars WHERE deleted_at IS NULL`),
      profiles:                   await safeCount(`SELECT COUNT(*) AS cnt FROM profiles`),
      insurance_contracts:        await safeCount(`SELECT COUNT(*) AS cnt FROM insurance_contracts`),
      insurance_payment_schedule: await safeCount(`SELECT COUNT(*) AS cnt FROM insurance_payment_schedule`),
      loans:                      await safeCount(`SELECT COUNT(*) AS cnt FROM loans`),
      jiip_contracts:             await safeCount(`SELECT COUNT(*) AS cnt FROM jiip_contracts`),
      general_investments:        await safeCount(`SELECT COUNT(*) AS cnt FROM general_investments`),
      fmi_rentals:                await safeCount(`SELECT COUNT(*) AS cnt FROM fmi_rentals`),
      fmi_rentals_with_car:       await safeCount(`SELECT COUNT(*) AS cnt FROM fmi_rentals WHERE customer_car_number IS NOT NULL AND insurance_company IS NOT NULL`),
    }

    // 3) transaction_vehicle_allocations source_type 분포
    let sources: Array<{ source_type: string; cnt: number; total_amount: number }> = []
    try {
      const rows = await prisma.$queryRawUnsafe<Array<any>>(`
        SELECT COALESCE(source_type, 'unknown') AS source_type,
               COUNT(*) AS cnt,
               COALESCE(SUM(ABS(amount)), 0) AS total_amount
          FROM transaction_vehicle_allocations
         GROUP BY source_type
         ORDER BY cnt DESC
      `)
      sources = rows.map(r => ({
        source_type: String(r.source_type),
        cnt: Number(r.cnt),
        total_amount: Number(r.total_amount),
      }))
    } catch (e: any) {
      sources = [{ source_type: `ERROR: ${e.message}`, cnt: -1, total_amount: 0 }]
    }

    // 4) fmi_rentals 보험사별 분포 (대차건 매칭 후보)
    let fmiRentalsByInsurer: Array<{ insurance_company: string; cnt: number }> = []
    try {
      const rows = await prisma.$queryRawUnsafe<Array<any>>(`
        SELECT insurance_company,
               COUNT(*) AS cnt
          FROM fmi_rentals
         WHERE insurance_company IS NOT NULL
           AND customer_car_number IS NOT NULL
         GROUP BY insurance_company
         ORDER BY cnt DESC
         LIMIT 20
      `)
      fmiRentalsByInsurer = rows.map(r => ({
        insurance_company: String(r.insurance_company),
        cnt: Number(r.cnt),
      }))
    } catch (e: any) {
      fmiRentalsByInsurer = [{ insurance_company: `ERROR: ${e.message}`, cnt: -1 }]
    }

    // 5) 미매칭 통장 입금 거래 샘플 5건 (보험사 입금 추정 — 4자리 숫자 포함)
    let unmatchedIncomeBank: Array<any> = []
    try {
      const rows = await prisma.$queryRawUnsafe<Array<any>>(`
        SELECT id,
               DATE_FORMAT(transaction_date, '%Y-%m-%d') AS date,
               amount,
               client_name,
               LEFT(description, 60) AS description,
               category,
               related_type
          FROM transactions
         WHERE deleted_at IS NULL
           AND type = 'income'
           AND (related_type IS NULL OR related_id IS NULL)
           AND (client_name REGEXP '[0-9]{3,4}' OR description REGEXP '[0-9]{3,4}')
         ORDER BY transaction_date DESC
         LIMIT 10
      `)
      unmatchedIncomeBank = rows.map(serialize)
    } catch (e: any) {
      unmatchedIncomeBank = [{ error: e.message }]
    }

    // 6) 진단 결론
    const findings: string[] = []
    if (tables.transaction_vehicle_allocations === 0) {
      findings.push('🔴 transaction_vehicle_allocations 비어있음 → 보험/대출/지입 등 매칭 도구 모두 0건 매칭')
    } else if (tables.transaction_vehicle_allocations > 0 && tables.transaction_vehicle_allocations < 50) {
      findings.push(`🟡 transaction_vehicle_allocations ${tables.transaction_vehicle_allocations}건 — 일부 도구만 매칭`)
    }
    if (masters.fmi_rentals === 0) {
      findings.push('🔴 fmi_rentals 비어있음 → 대차건 매칭 불가능')
    } else if (masters.fmi_rentals_with_car === 0) {
      findings.push(`🟡 fmi_rentals 있지만 customer_car_number+insurance_company 채워진 건 0 — 대차건 매칭 데이터 부족`)
    }
    if (masters.insurance_contracts === 0) findings.push('🔴 insurance_contracts 비어있음 → 보험 매칭 불가능')
    if (masters.loans === 0) findings.push('🔴 loans 비어있음 → 대출 매칭 불가능')
    if (masters.jiip_contracts === 0) findings.push('🔴 jiip_contracts 비어있음 → 지입 매칭 불가능')
    if (masters.general_investments === 0) findings.push('🔴 general_investments 비어있음 → 투자 매칭 불가능')
    if (findings.length === 0) findings.push('✅ 매칭 인프라 정상 — 매칭 도구가 0건 매칭한 이유 별도 조사 필요')

    return NextResponse.json({
      tables: serialize(tables),
      masters: serialize(masters),
      sources: serialize(sources),
      fmi_rentals_by_insurer: serialize(fmiRentalsByInsurer),
      sample_unmatched_income: unmatchedIncomeBank,
      findings,
    })
  } catch (e: any) {
    console.error('[match-review/diagnostic GET]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/transactions/dispatch-match
 *
 * 입금 거래를 4축(차량지출/매출/투자자/지입) 중 "매출"로 정확히 배정하기 위한
 * 배차 조인 매칭 helper. 입금 적요에 사고차량번호가 포함된 경우:
 *   1) fmi_rentals.customer_car_number 로 역조회
 *   2) dispatch_date ≤ tx_date ≤ (actual_return_date ∨ expected_return_date+7d) 범위 확인
 *   3) insurance_company·claim 후보 반환
 *
 * Body:
 * {
 *   transactions: Array<{ id?: any, date: string, amount: number, memo: string, description?: string }>
 * }
 *
 * Response:
 * {
 *   matches: Array<{
 *     tx_id, tx_memo, car_number_found,
 *     rental: { id, vehicle_car_number, customer_car_number, customer_name,
 *               insurance_company, dispatch_date, actual_return_date,
 *               final_claim_amount, status },
 *     confidence: number,   // 0~1
 *     axis: 'revenue',       // 입금 + 대차매칭 = 매출
 *     suggested_category: string
 *   }>
 * }
 */

// 한국 차량번호 정규식 (소형~대형): "12가1234" 부터 "123하1234"까지
const CAR_NO_RE = /(\d{2,3}[가-힣]\d{4})/g

function extractCarNumbers(text: string): string[] {
  if (!text) return []
  const unique = new Set<string>()
  let m
  while ((m = CAR_NO_RE.exec(text)) !== null) unique.add(m[1])
  CAR_NO_RE.lastIndex = 0
  return Array.from(unique)
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await req.json()
    const txs: any[] = Array.isArray(body.transactions) ? body.transactions : []
    if (txs.length === 0) return NextResponse.json({ error: 'transactions 필수' }, { status: 400 })

    const matches: any[] = []

    for (const tx of txs) {
      const memoText = `${tx.memo || ''} ${tx.description || ''} ${tx.client_name || ''}`
      const carNos = extractCarNumbers(memoText)
      if (carNos.length === 0) {
        matches.push({ tx_id: tx.id, tx_memo: memoText, car_number_found: null, rental: null, confidence: 0, axis: null })
        continue
      }

      const txDate = tx.date ? new Date(tx.date) : new Date()

      // 각 추출된 차량번호에 대해 fmi_rentals 조회
      let bestRental: any = null
      let bestConfidence = 0
      let bestCarNo: string | null = null

      for (const carNo of carNos) {
        const rentals = await prisma.fmiRental.findMany({
          where: {
            OR: [
              { customer_car_number: carNo },       // 사고차량번호 직접 매칭
              { vehicle_car_number: carNo },        // 우리 차량번호 매칭 (렌카 요금 수납)
            ],
          },
          orderBy: { dispatch_date: 'desc' },
          take: 10,
          select: {
            id: true,
            rental_no: true,
            customer_name: true,
            customer_car_number: true,
            vehicle_car_number: true,
            insurance_company: true,
            insurance_claim_no: true,
            dispatch_date: true,
            expected_return_date: true,
            actual_return_date: true,
            total_rental_fee: true,
            final_claim_amount: true,
            status: true,
          },
        })

        for (const r of rentals) {
          // 신뢰도 점수: 기간 범위 일치 + 금액 근접도
          let conf = 0.4 // 차량번호 매칭 기본
          const dispatchAt = r.dispatch_date ? new Date(r.dispatch_date) : null
          const returnAt = r.actual_return_date
            ? new Date(r.actual_return_date)
            : r.expected_return_date
            ? new Date(new Date(r.expected_return_date).getTime() + 14 * 86400000)
            : null
          if (dispatchAt && txDate >= dispatchAt) conf += 0.2
          if (returnAt && txDate <= new Date(returnAt.getTime() + 60 * 86400000)) conf += 0.2
          // 상태가 claiming/settled/returned일 때 매출 후보 가능성 높음
          if (['claiming', 'settled', 'returned'].includes(r.status)) conf += 0.1
          // 금액 근접도: final_claim_amount ±5% 이내면 가산
          const claim = r.final_claim_amount ? Number(r.final_claim_amount) : 0
          if (claim > 0 && tx.amount) {
            const diff = Math.abs(Number(tx.amount) - claim) / claim
            if (diff < 0.05) conf += 0.2
            else if (diff < 0.15) conf += 0.1
          }

          if (conf > bestConfidence) {
            bestConfidence = conf
            bestRental = r
            bestCarNo = carNo
          }
        }
      }

      matches.push({
        tx_id: tx.id,
        tx_memo: memoText.slice(0, 120),
        car_number_found: bestCarNo,
        rental: bestRental
          ? {
              ...bestRental,
              total_rental_fee: bestRental.total_rental_fee ? Number(bestRental.total_rental_fee) : null,
              final_claim_amount: bestRental.final_claim_amount ? Number(bestRental.final_claim_amount) : null,
            }
          : null,
        confidence: Math.min(1, bestConfidence),
        axis: bestRental ? 'revenue' : null,
        suggested_category: bestRental
          ? `매출-보험청구-${bestRental.insurance_company || '일반'}`
          : null,
      })
    }

    return NextResponse.json({
      success: true,
      total: matches.length,
      matched: matches.filter((m) => m.rental).length,
      matches,
    })
  } catch (e: any) {
    console.error('[dispatch-match] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'

// ═══════════════════════════════════════════════════════════════════
// GET /api/home/summary — 홈 대시보드 (2026-07 개편 REDESIGN 3장)
//   · 이번 달 요약: 매출 / 지출 / 순이익 / 수납률
//   · 오늘 할 일: 미분류 거래 / 검수 대기 / 만기 임박 계약 / 정비·사고 차량
//   · 차량 현황 / 이번 달 정산 대상
//   숫자만 집계 — 상세는 각 화면(필터 뷰)으로 이동
// ═══════════════════════════════════════════════════════════════════

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// 테이블 미존재 등 쿼리 실패 시 빈 배열 반환
async function safeQuery<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try { return await fn() } catch { return [] }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const today = new Date().toISOString().split('T')[0]
    const nowMonth = today.slice(0, 7)
    const monthStart = `${nowMonth}-01`
    const [yr, mo] = nowMonth.split('-').map(Number)
    const monthEnd = `${nowMonth}-${String(new Date(yr, mo, 0).getDate()).padStart(2, '0')}`
    // 지난달 (증감 비교)
    const prevDate = new Date(yr, mo - 2, 1)
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    const prevStart = `${prevMonth}-01`
    const prevEnd = `${prevMonth}-${String(new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
    const in30d = new Date()
    in30d.setDate(in30d.getDate() + 30)
    const in30dStr = in30d.toISOString().split('T')[0]

    const [
      monthSums, prevSums,
      unclassified, reviewQueue,
      ltrExpiring, contractExpiring,
      carRows, repairCars,
      schedRows,
      jiipCount, investCount,
    ] = await Promise.all([
      // 이번 달 수입/지출 합계 (확정 거래만)
      safeQuery(() => prisma.$queryRawUnsafe<any[]>(
        `SELECT type, SUM(amount) AS total FROM transactions
         WHERE deleted_at IS NULL AND (status IS NULL OR status = 'completed')
           AND transaction_date BETWEEN ? AND ?
         GROUP BY type`,
        monthStart, monthEnd
      )),
      // 지난달 수입/지출 합계
      safeQuery(() => prisma.$queryRawUnsafe<any[]>(
        `SELECT type, SUM(amount) AS total FROM transactions
         WHERE deleted_at IS NULL AND (status IS NULL OR status = 'completed')
           AND transaction_date BETWEEN ? AND ?
         GROUP BY type`,
        prevStart, prevEnd
      )),
      // 미분류 거래
      safeQuery(() => prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS count FROM transactions
        WHERE deleted_at IS NULL
          AND (category IS NULL OR category = '' OR category = '미분류')`),
      // 자동분류 검수 대기
      safeQuery(() => prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS count FROM classification_queue
        WHERE status IN ('pending', 'auto_confirmed')`),
      // 만기 임박 — 장기렌트 원장 (30일 이내)
      safeQuery(() => prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) AS count FROM long_term_rentals
         WHERE status = 'active' AND end_date BETWEEN ? AND ?`,
        today, in30dStr
      )),
      // 만기 임박 — 구 계약 장부 (30일 이내)
      safeQuery(() => prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) AS count FROM contracts
         WHERE status = 'active' AND end_date BETWEEN ? AND ?`,
        today, in30dStr
      )),
      // 차량 상태별 대수
      safeQuery(() => prisma.$queryRaw<any[]>`
        SELECT status, COUNT(*) AS count FROM cars GROUP BY status`),
      // 정비·사고 차량 목록 (홈 카드 부제용)
      safeQuery(() => prisma.$queryRaw<any[]>`
        SELECT number, model FROM cars
        WHERE status NOT IN ('available', 'rented') LIMIT 4`),
      // 이번 달 수납 스케줄 (수납률)
      safeQuery(() => prisma.$queryRawUnsafe<any[]>(
        `SELECT status, expected_amount, actual_amount, payment_date
         FROM expected_payment_schedules
         WHERE payment_date BETWEEN ? AND ?`,
        monthStart, monthEnd
      )),
      // 이번 달 정산 대상
      safeQuery(() => prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS count FROM jiip_contracts WHERE status = 'active'`),
      safeQuery(() => prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS count FROM general_investments WHERE status = 'active'`),
    ])

    const sumOf = (rows: any[], type: string) =>
      rows.filter(r => r.type === type).reduce((s, r) => s + (Number(r.total) || 0), 0)
    const revenue = sumOf(monthSums, 'income')
    const expense = sumOf(monthSums, 'expense')
    const prevRevenue = sumOf(prevSums, 'income')
    const prevExpense = sumOf(prevSums, 'expense')
    const pctChange = (cur: number, prev: number) =>
      prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null

    // 수납률 — 이번 달 기대액 대비 수납액
    const sched = schedRows || []
    const completed = sched.filter((s: any) => s.status === 'completed' || s.status === 'partial')
    const overdue = sched.filter((s: any) => s.status === 'pending' && s.payment_date < today)
    const totalExpected = sched.reduce((a: number, s: any) => a + Number(s.expected_amount || 0), 0)
    const totalActual = completed.reduce((a: number, s: any) => a + Number(s.actual_amount || s.expected_amount || 0), 0)

    const carCount = (statuses: string[]) =>
      (carRows || []).filter((r: any) => statuses.includes(r.status)).reduce((s: number, r: any) => s + Number(r.count || 0), 0)
    const totalCars = (carRows || []).reduce((s: number, r: any) => s + Number(r.count || 0), 0)
    const rentedCars = carCount(['rented'])
    const availableCars = carCount(['available'])
    const repairCount = totalCars - rentedCars - availableCars

    return NextResponse.json({
      data: serialize({
        month: nowMonth,
        summary: {
          revenue,
          expense,
          netProfit: revenue - expense,
          revenueChange: pctChange(revenue, prevRevenue),
          expenseChange: pctChange(expense, prevExpense),
          profitRate: revenue > 0 ? Math.round(((revenue - expense) / revenue) * 1000) / 10 : null,
          collectionRate: totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : null,
          overdueCount: overdue.length,
          overdueAmount: overdue.reduce((a: number, s: any) => a + Number(s.expected_amount || 0), 0),
        },
        todo: {
          unclassified: Number(unclassified[0]?.count || 0),
          reviewPending: Number(reviewQueue[0]?.count || 0),
          expiringContracts: Number(ltrExpiring[0]?.count || 0) + Number(contractExpiring[0]?.count || 0),
          repairCars: repairCount,
          repairCarList: (repairCars || []).map((c: any) => c.number).filter(Boolean),
        },
        cars: {
          total: totalCars,
          rented: rentedCars,
          available: availableCars,
          repair: repairCount,
          utilization: totalCars > 0 ? Math.round((rentedCars / totalCars) * 100) : 0,
        },
        settlement: {
          jiip: Number(jiipCount[0]?.count || 0),
          investors: Number(investCount[0]?.count || 0),
        },
      }),
      error: null,
    })
  } catch (e: any) {
    console.error('[GET /api/home/summary]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

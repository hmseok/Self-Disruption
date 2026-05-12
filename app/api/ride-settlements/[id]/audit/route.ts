/**
 * GET /api/ride-settlements/[id]/audit
 *
 * 정산서 검수 통계 + 의심 row 식별
 *
 * 검사 항목:
 *   1. 합계 검증 — base_fee + additional_fee != total_amount (오차 1원 이상)
 *   2. 활성/종료 자동 판정 — vehicle_status + exec_status
 *      · 정산 포함 + status='정상' → 활성
 *      · 정산 포함 + status='마감' → 종료
 *   3. 의심 row — match_status='unmatched' + 큰 금액 (top 10)
 *
 * PR-6.11.c
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface ItemRow {
  id: string
  car_number: string | null
  exec_no: string | null
  cust_name: string | null
  base_fee: string | null
  additional_fee: string | null
  total_amount: string | null
  exec_status: string | null
  closing_date: string | null
  termination_date: string | null
  match_status: string | null
}

interface VehicleStatusRow {
  car_number: string
  status: string | null
}

interface AuditIssue {
  item_id: string
  car_number: string | null
  exec_no: string | null
  cust_name: string | null
  issue_type: 'sum-mismatch' | 'unmatched-large' | 'status-conflict'
  detail: string
  amount: number
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params

  try {
    // 1. settlement_items 전체 조회
    const items = await prisma.$queryRaw<ItemRow[]>`
      SELECT id, car_number, exec_no, cust_name,
             base_fee, additional_fee, total_amount,
             exec_status, closing_date, termination_date, match_status
        FROM ride_settlement_items
       WHERE settlement_id = ${id}
    `

    // 2. vehicle_status 조회 (메리츠 등)
    const statuses = await prisma.$queryRaw<VehicleStatusRow[]>`
      SELECT car_number, status FROM ride_settlement_vehicle_status
       WHERE settlement_id = ${id}
    `
    const statusByCar = new Map<string, string>()
    for (const s of statuses) {
      if (s.car_number) statusByCar.set(s.car_number, s.status || '')
    }

    // 3. 합계 검증 + 의심 row 식별
    const issues: AuditIssue[] = []
    let activeCount = 0
    let closedCount = 0
    let sumMismatchCount = 0
    let unmatchedCount = 0
    let totalAmount = 0

    for (const item of items) {
      const base = Number(item.base_fee || 0)
      const additional = Number(item.additional_fee || 0)
      const total = Number(item.total_amount || 0)
      totalAmount += total

      // 합계 검증
      if (base > 0 || additional > 0) {
        const expected = base + additional
        const diff = Math.abs(expected - total)
        if (diff > 1) {
          sumMismatchCount++
          issues.push({
            item_id: item.id,
            car_number: item.car_number,
            exec_no: item.exec_no,
            cust_name: item.cust_name,
            issue_type: 'sum-mismatch',
            detail: `base+additional=${expected.toLocaleString()} ≠ total=${total.toLocaleString()} (차이 ${diff.toLocaleString()})`,
            amount: total,
          })
        }
      }

      // 활성/종료 판정
      const vs = item.car_number ? statusByCar.get(item.car_number) : null
      const isTerminated =
        item.termination_date && item.termination_date !== '0000/00/00' && item.termination_date !== '00000000'
      const isClosed =
        item.closing_date && item.closing_date !== '0000/00/00' && item.closing_date !== '00000000'
      const execClosed = item.exec_status === '마감' || item.exec_status === '해지'

      if (isTerminated || execClosed || vs === '마감') {
        closedCount++
        // 정산 포함 + exec=마감 + vehicle=정상 → 충돌
        if (vs === '정상') {
          issues.push({
            item_id: item.id,
            car_number: item.car_number,
            exec_no: item.exec_no,
            cust_name: item.cust_name,
            issue_type: 'status-conflict',
            detail: `exec_status=마감 vs vehicle_status=정상 — 충돌`,
            amount: total,
          })
        }
      } else if (isClosed && !execClosed) {
        // 마감일 있는데 exec_status 정상 — 모호
        activeCount++
      } else {
        activeCount++
      }

      // 미매칭 + 큰 금액
      if (item.match_status === 'unmatched' && total > 100000) {
        unmatchedCount++
        if (unmatchedCount <= 20) {
          issues.push({
            item_id: item.id,
            car_number: item.car_number,
            exec_no: item.exec_no,
            cust_name: item.cust_name,
            issue_type: 'unmatched-large',
            detail: `미매칭 + ${total.toLocaleString()}원`,
            amount: total,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        total_items: items.length,
        active: activeCount,
        closed: closedCount,
        sum_mismatch: sumMismatchCount,
        unmatched_count: items.filter(i => i.match_status === 'unmatched').length,
        unmatched_large: unmatchedCount,
        total_amount: totalAmount,
        issues: issues.slice(0, 50),  // top 50
      },
      meta: {
        fetched_at: new Date().toISOString(),
        settlement_id: id,
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-settlements/[id]/audit]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

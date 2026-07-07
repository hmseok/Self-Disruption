import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * POST /api/finance/partner-settlement-import — 외주(지입) 정산 엑셀 반영
 *
 * PR-PARTNER-IMPORT (2026-07-07 사용자 명시): 빌려타 등 외주 지입 차량의 대차료는
 *   우리 통장이 아니라 외주사 정산 내역서(엑셀)로 옴 → 그 양식을 업로드해 입금 반영.
 *
 * body: { rows: [{ vehicle_car_number, deposit_date(YYYY-MM-DD), insurer, customer_car_number, amount }], dryRun? }
 *
 * 동작:
 *   1) 중복 skip — imported_from='excel_partner' + 같은 날짜+금액+description
 *   2) 대차건 링크 — 사고차량(고객차) + 대차차량 이중 키 (둘 다 일치 우선, 사고차량 유일 fallback)
 *   3) transactions INSERT — imported_from='excel_partner' (통장 원장·기존 매처 풀과 분리)
 *   4) 완납 자동 청구완료 — 청구중 + 입금합계 ≥ 청구액 (기존 훅과 동형)
 *
 * 응답: { created, duplicates, linked, unlinked, unlinked_samples, settled_transitions }
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const norm = (s: any) => String(s || '').replace(/\s+/g, '').trim()

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const rows: any[] = Array.isArray(body.rows) ? body.rows : []
    const dryRun = body.dryRun === true
    if (rows.length === 0) return NextResponse.json({ error: 'rows 필요' }, { status: 400 })
    if (rows.length > 3000) return NextResponse.json({ error: '한 번에 3000행 이하로 업로드하세요' }, { status: 400 })

    // 기존 외주정산 거래 (중복 대조)
    const existing = await prisma.$queryRaw<Array<any>>`
      SELECT transaction_date, amount, description FROM transactions
       WHERE imported_from = 'excel_partner' AND deleted_at IS NULL
    `
    const dupKeys = new Set(
      existing.map((e: any) => `${String(e.transaction_date).slice(0, 10)}|${Number(e.amount)}|${e.description || ''}`),
    )

    const result = {
      total: rows.length,
      created: 0,
      duplicates: 0,
      linked: 0,
      unlinked: 0,
      invalid: 0,
      unlinked_samples: [] as any[],
      settled_transitions: 0,
      dry_run: dryRun,
    }
    const batchDup = new Set<string>()

    for (const r of rows) {
      const date = String(r.deposit_date || '').slice(0, 10)
      const amount = Number(r.amount || 0)
      const customerCar = norm(r.customer_car_number)
      const vehicleCar = norm(r.vehicle_car_number)
      const insurer = String(r.insurer || '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amount > 0) || !customerCar) { result.invalid++; continue }

      const description = `외주정산 ${customerCar}${vehicleCar ? ` → 대차 ${vehicleCar}` : ''}`
      const key = `${date}|${amount}|${description}`
      if (dupKeys.has(key) || batchDup.has(key)) { result.duplicates++; continue }
      batchDup.add(key)

      // 대차건 링크 — 이중 키 우선
      let rentalId: string | null = null
      try {
        const both = await prisma.$queryRaw<Array<any>>`
          SELECT id FROM fmi_rentals
           WHERE REPLACE(customer_car_number, ' ', '') = ${customerCar}
             AND REPLACE(vehicle_car_number, ' ', '') = ${vehicleCar}
           ORDER BY dispatch_date DESC LIMIT 2
        `
        if (both.length >= 1) rentalId = String(both[0].id)  // 동일 조합 다수 = 같은 차 재대차 — 최신 건
        if (!rentalId) {
          const only = await prisma.$queryRaw<Array<any>>`
            SELECT id FROM fmi_rentals
             WHERE REPLACE(customer_car_number, ' ', '') = ${customerCar}
             LIMIT 2
          `
          if (only.length === 1) rentalId = String(only[0].id)
        }
      } catch { /* 링크 실패 — unlinked 로 */ }

      if (rentalId) result.linked++
      else {
        result.unlinked++
        if (result.unlinked_samples.length < 30) {
          result.unlinked_samples.push({ date, insurer, customer_car: customerCar, vehicle_car: vehicleCar, amount })
        }
      }

      if (dryRun) { result.created++; continue }

      await prisma.$executeRaw`
        INSERT INTO transactions (
          id, transaction_date, type, amount, description, client_name,
          imported_from, related_type, related_id, category, status, created_at, updated_at
        ) VALUES (
          ${randomUUID()}, ${date + ' 00:00:00'}, 'income', ${amount},
          ${description}, ${insurer || null},
          'excel_partner', ${rentalId ? 'fmi_rental' : null}, ${rentalId},
          ${'대차료(외주정산)'}, 'completed', NOW(), NOW()
        )
      `
      result.created++
    }

    // 완납 자동 청구완료 (기존 훅과 동형 — 규칙 14)
    if (!dryRun && result.linked > 0) {
      try {
        const res = await prisma.$executeRaw`
          UPDATE fmi_rentals r
            JOIN (
              SELECT related_id, SUM(amount) AS s
                FROM transactions
               WHERE related_type = 'fmi_rental' AND type = 'income' AND deleted_at IS NULL
               GROUP BY related_id
            ) p ON p.related_id = r.id
             SET r.status = 'settled', r.updated_at = NOW()
           WHERE r.status = 'claiming'
             AND r.final_claim_amount IS NOT NULL AND r.final_claim_amount > 0
             AND p.s >= r.final_claim_amount
        `
        result.settled_transitions = Number(res)
      } catch { /* graceful */ }
    }

    return NextResponse.json({
      ...result,
      message: dryRun
        ? `dry-run — 신규 ${result.created}건 (링크 ${result.linked} / 미링크 ${result.unlinked} / 중복 ${result.duplicates})`
        : `${result.created}건 반영 (링크 ${result.linked} / 미링크 ${result.unlinked} / 중복 skip ${result.duplicates}${result.settled_transitions ? ` / 완납 청구완료 ${result.settled_transitions}` : ''})`,
    })
  } catch (e: any) {
    console.error('[partner-settlement-import]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

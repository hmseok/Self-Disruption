import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════════
// 통장 매칭 진단 — 어떤 계좌가 매칭 안 됐는지 분석
//
// GET /api/admin/bank-match-diag
//
// 응답:
//   - 통장 거래 last4 분포 (SMS 기반)
//   - bank_account_mappings 등록 상태
//   - 매핑 부재 / 차량 미할당 / 정상 분류
// ═══════════════════════════════════════════════════════════════════

function deriveAllLast4(rec: {
  account_number?: string | null;
  account_alias?: string | null;
}): string[] {
  const last4s = new Set<string>()
  for (const src of [rec.account_number, rec.account_alias]) {
    const digits = String(src || '').replace(/\D/g, '')
    if (digits.length >= 4) last4s.add(digits.slice(-4))
  }
  return Array.from(last4s)
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    // 1) SMS 통장 거래의 last4 분포 (sms_bank or imported_from='sms' AND bank_name)
    const txRows = await prisma.$queryRaw<Array<{
      last4: string
      total: bigint
      matched: bigint
    }>>`
      SELECT
        CASE
          WHEN s.card_alias IS NULL THEN NULL
          WHEN CHAR_LENGTH(TRIM(s.card_alias)) < 4 THEN NULL
          ELSE RIGHT(TRIM(s.card_alias), 4)
        END AS last4,
        COUNT(*) AS total,
        SUM(CASE
          WHEN t.related_type = 'car' AND t.related_id IS NOT NULL THEN 1
          ELSE 0
        END) AS matched
      FROM transactions t
      INNER JOIN card_sms_transactions s
        ON s.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
      WHERE t.deleted_at IS NULL
        AND (t.imported_from = 'sms_bank' OR (t.imported_from = 'sms' AND s.card_issuer LIKE '%BANK'))
        AND s.card_alias IS NOT NULL
      GROUP BY last4
      HAVING last4 IS NOT NULL AND last4 != ''
      ORDER BY total DESC
    `

    // 2) bank_account_mappings + last4 추출
    let mappings: Array<{
      id: string; account_alias: string | null;
      account_number: string | null;
      bank_issuer: string | null; bank_name: string | null;
      account_holder: string | null;
      assigned_car_id: string | null; car_number: string | null;
      purpose: string | null; status: string | null;
    }> = []
    try {
      mappings = await prisma.$queryRaw`
        SELECT b.id, b.account_alias, b.account_number, b.bank_issuer, b.bank_name,
               b.account_holder, b.assigned_car_id,
               car.number AS car_number,
               b.purpose, b.status
          FROM bank_account_mappings b
          LEFT JOIN cars car ON car.id COLLATE utf8mb4_unicode_ci = b.assigned_car_id COLLATE utf8mb4_unicode_ci
      `
    } catch (e: any) {
      // account_number 컬럼 없는 환경 (마이그레이션 미적용) — legacy
      if (/Unknown column/i.test(e?.message || '')) {
        mappings = await prisma.$queryRaw`
          SELECT b.id, b.account_alias, NULL AS account_number, b.bank_issuer, b.bank_name,
                 b.account_holder, b.assigned_car_id,
                 car.number AS car_number,
                 b.purpose, b.status
            FROM bank_account_mappings b
            LEFT JOIN cars car ON car.id COLLATE utf8mb4_unicode_ci = b.assigned_car_id COLLATE utf8mb4_unicode_ci
        `
      } else { throw e }
    }

    const mappingLast4Map = new Map<string, typeof mappings>()
    for (const m of mappings) {
      const l4s = deriveAllLast4(m)
      for (const l4 of l4s) {
        if (!mappingLast4Map.has(l4)) mappingLast4Map.set(l4, [])
        if (!mappingLast4Map.get(l4)!.includes(m)) {
          mappingLast4Map.get(l4)!.push(m)
        }
      }
    }

    const totalTx = txRows.reduce((s, r) => s + Number(r.total), 0)
    const totalMatched = txRows.reduce((s, r) => s + Number(r.matched), 0)
    const totalMappings = mappings.length
    const mappingsWithCar = mappings.filter(m => m.assigned_car_id).length

    const diagnosis = txRows.map(r => {
      const last4 = r.last4
      const txCount = Number(r.total)
      const matched = Number(r.matched)
      const entries = mappingLast4Map.get(last4) || []
      const hasMapping = entries.length > 0
      const hasCarAssigned = entries.some(e => e.assigned_car_id)

      let status: 'ok' | 'no_mapping' | 'no_car' | 'partial'
      if (!hasMapping) status = 'no_mapping'
      else if (!hasCarAssigned) status = 'no_car'
      else if (matched < txCount) status = 'partial'
      else status = 'ok'

      return {
        last4,
        tx_count: txCount,
        matched_count: matched,
        unmatched_count: txCount - matched,
        status,
        mapping_count: entries.length,
        cars: entries.filter(e => e.assigned_car_id).map(e => e.car_number).filter(Boolean),
        holders: entries.map(e => e.account_holder).filter(Boolean),
        purposes: entries.map(e => e.purpose).filter(Boolean),
      }
    })

    const groupByStatus = (s: string) => diagnosis.filter(d => d.status === s)
    const noMapping = groupByStatus('no_mapping').sort((a, b) => b.tx_count - a.tx_count)
    const noCar = groupByStatus('no_car').sort((a, b) => b.tx_count - a.tx_count)
    const partial = groupByStatus('partial').sort((a, b) => b.tx_count - a.tx_count)
    const ok = groupByStatus('ok')

    return NextResponse.json({
      summary: {
        total_transactions: totalTx,
        matched_transactions: totalMatched,
        unmatched_transactions: totalTx - totalMatched,
        total_mappings: totalMappings,
        mappings_with_car: mappingsWithCar,
        unique_last4: txRows.length,
      },
      problems: {
        no_mapping_count: noMapping.length,
        no_mapping_tx: noMapping.reduce((s, r) => s + r.tx_count, 0),
        no_car_count: noCar.length,
        no_car_tx: noCar.reduce((s, r) => s + r.tx_count, 0),
      },
      top_no_mapping: noMapping.slice(0, 20).map(r => ({
        last4: r.last4, tx: r.tx_count,
      })),
      top_no_car: noCar.slice(0, 20).map(r => ({
        last4: r.last4, tx: r.tx_count, holders: r.holders, purposes: r.purposes,
      })),
      top_partial: partial.slice(0, 10).map(r => ({
        last4: r.last4, total: r.tx_count, matched: r.matched_count, unmatched: r.unmatched_count,
        cars: r.cars,
      })),
      ok_count: ok.length,
      all_mappings: mappings.map(m => ({
        alias: m.account_alias,
        account_number: m.account_number,
        last4_candidates: deriveAllLast4(m),
        bank: m.bank_name || m.bank_issuer,
        holder: m.account_holder,
        car: m.car_number,
        purpose: m.purpose,
      })),
    })
  } catch (e: any) {
    console.error('[GET /api/admin/bank-match-diag]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

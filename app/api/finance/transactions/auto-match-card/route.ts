import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ============================================================
// /api/finance/transactions/auto-match-card
//
// Excel 업로드된 카드 거래를 corporate_cards 의 카드번호 끝 4자리와 매칭하여
// transactions.related_type='car', related_id=assigned_car_id 자동 할당
//
// 매칭 키:
//   transactions.raw_data.card_last4 (Excel 업로드 시 저장)
//   ↔ corporate_cards.card_number 끝 4자리 (전체 번호 등록 가정)
//
// POST body: { dryRun?: false, batchId?: string (해당 batch만) }
// ============================================================

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const batchId: string | null = typeof body.batchId === 'string' ? body.batchId : null

    // ── Phase 0: 공용 거래 정리 (매칭 해제 + 카테고리 셋팅) ──
    //   client_name='공용' 인 거래는 특정 차량에 귀속되면 안 됨
    //   → 잘못 매칭된 row의 related_type/related_id 해제
    //   → 카테고리를 '공용카드사용'으로 통일
    let gongyongCarUnlinked = 0
    let gongyongCategorized = 0
    {
      // 카운트 (dryRun 응답용)
      const carUnlinkRow = await prisma.$queryRawUnsafe<Array<{ cnt: bigint | number }>>(`
        SELECT COUNT(*) AS cnt FROM transactions
         WHERE deleted_at IS NULL AND client_name = '공용' AND related_type = 'car'
      `)
      gongyongCarUnlinked = Number(carUnlinkRow?.[0]?.cnt || 0)

      const categorizeRow = await prisma.$queryRawUnsafe<Array<{ cnt: bigint | number }>>(`
        SELECT COUNT(*) AS cnt FROM transactions
         WHERE deleted_at IS NULL AND client_name = '공용'
           AND (category IS NULL OR category = '' OR category != '공용카드사용')
      `)
      gongyongCategorized = Number(categorizeRow?.[0]?.cnt || 0)

      if (!dryRun) {
        if (gongyongCarUnlinked > 0) {
          await prisma.$executeRawUnsafe(`
            UPDATE transactions
               SET related_type = NULL, related_id = NULL, updated_at = NOW()
             WHERE deleted_at IS NULL AND client_name = '공용' AND related_type = 'car'
          `)
        }
        if (gongyongCategorized > 0) {
          await prisma.$executeRawUnsafe(`
            UPDATE transactions
               SET category = '공용카드사용', final_category = '공용카드사용', updated_at = NOW()
             WHERE deleted_at IS NULL AND client_name = '공용'
               AND (category IS NULL OR category = '' OR category != '공용카드사용')
          `)
        }
      }
    }

    // 1) 매칭 안된 Excel 카드 거래 가져오기 (raw_data 에 card_last4 있는 것만)
    //    ★ 공용 거래는 매칭 대상에서 제외 (Phase 0에서 별도 처리됨)
    let candidatesSql = `
      SELECT id,
             JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.card_last4')) AS card_last4,
             card_company,
             client_name,
             description,
             transaction_date,
             amount
        FROM transactions
       WHERE deleted_at IS NULL
         AND imported_from LIKE 'excel_card%'
         AND raw_data IS NOT NULL
         AND JSON_EXTRACT(raw_data, '$.card_last4') IS NOT NULL
         AND (related_id IS NULL OR related_type IS NULL OR related_type != 'car')
         AND (client_name IS NULL OR client_name != '공용')
    `
    const params: any[] = []
    if (batchId) {
      candidatesSql += ` AND imported_from = ?`
      params.push(batchId)
    }
    candidatesSql += ` LIMIT 5000`

    const candidates = await prisma.$queryRawUnsafe<Array<{
      id: string; card_last4: string; card_company: string | null;
      client_name: string | null; description: string | null;
      transaction_date: any; amount: any;
    }>>(candidatesSql, ...params)

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        dry_run: dryRun,
        total_unmatched: 0,
        matched: 0,
        skipped_no_match: 0,
        skipped_ambiguous: 0,
        skipped_no_car: 0,
        gongyong_car_unlinked: gongyongCarUnlinked,
        gongyong_categorized: gongyongCategorized,
        message: '매칭 대상 없음 (Excel 카드 거래 + card_last4 + 미매칭)',
      })
    }

    // 2) corporate_cards 테이블에서 last4 → card 매핑 미리 만들기
    //    card_number 형식: "1234-5678-9012-9876" 또는 "9876" 등
    //    숫자만 추출 후 끝 4자리 비교
    const cards = await prisma.$queryRawUnsafe<Array<{
      id: string; card_number: string | null;
      card_alias: string | null; holder_name: string | null;
      assigned_car_id: string | null;
    }>>(`
      SELECT id, card_number, card_alias, holder_name, assigned_car_id
        FROM corporate_cards
       WHERE card_number IS NOT NULL AND card_number != ''
    `)

    // last4 → 매칭되는 card 배열
    const last4Map = new Map<string, typeof cards>()
    for (const c of cards) {
      const digits = String(c.card_number || '').replace(/\D/g, '')
      if (digits.length < 4) continue
      const last4 = digits.slice(-4)
      if (!last4Map.has(last4)) last4Map.set(last4, [])
      last4Map.get(last4)!.push(c)
    }

    // 3) 후보별로 매칭 시도
    interface MatchPlan {
      tx_id: string
      card_id: string
      car_id: string
      card_alias: string | null
      holder_name: string | null
    }
    const plans: MatchPlan[] = []
    let skipNoMatch = 0  // last4 일치하는 카드 없음
    let skipAmbiguous = 0 // last4 일치 카드가 2장 이상
    let skipNoCar = 0    // last4 일치하는 카드는 있지만 assigned_car_id 가 없음
    const skipExamples: Array<{ reason: string; tx_id: string; card_last4: string; merchant?: string | null }> = []

    for (const tx of candidates) {
      const matches = last4Map.get(tx.card_last4) || []
      if (matches.length === 0) {
        skipNoMatch++
        if (skipExamples.length < 10) skipExamples.push({ reason: 'no_match', tx_id: tx.id, card_last4: tx.card_last4, merchant: tx.description })
        continue
      }
      // 차량 배정된 카드만 필터
      const withCar = matches.filter(m => m.assigned_car_id)
      if (withCar.length === 0) {
        skipNoCar++
        if (skipExamples.length < 10) skipExamples.push({ reason: 'no_car', tx_id: tx.id, card_last4: tx.card_last4 })
        continue
      }
      if (withCar.length > 1) {
        // 같은 last4 카드가 차량별로 여러 장 → 모호 (사용자가 직접 선택해야)
        skipAmbiguous++
        if (skipExamples.length < 10) skipExamples.push({ reason: 'ambiguous', tx_id: tx.id, card_last4: tx.card_last4 })
        continue
      }
      const card = withCar[0]
      plans.push({
        tx_id: tx.id,
        card_id: card.id,
        car_id: card.assigned_car_id!,
        card_alias: card.card_alias,
        holder_name: card.holder_name,
      })
    }

    // 4) 차량/카드 정보 조회 (응답용)
    const carIds = Array.from(new Set(plans.map(p => p.car_id)))
    let carMeta: Record<string, { number: string; brand: string; model: string }> = {}
    if (carIds.length > 0) {
      const placeholders = carIds.map(() => '?').join(',')
      const carRows = await prisma.$queryRawUnsafe<Array<{ id: string; number: string; brand: string; model: string }>>(
        `SELECT id, number, brand, model FROM cars WHERE id IN (${placeholders})`,
        ...carIds
      )
      carMeta = Object.fromEntries(carRows.map(r => [r.id, { number: r.number || '', brand: r.brand || '', model: r.model || '' }]))
    }

    // 5) 매칭별 distribution (어느 차량에 몇건 붙을지)
    const distribution: Record<string, number> = {}
    for (const p of plans) {
      const meta = carMeta[p.car_id]
      const key = meta?.number ? `${meta.number} (${meta.brand} ${meta.model})`.trim() : p.car_id
      distribution[key] = (distribution[key] || 0) + 1
    }

    // 6) 실제 적용 (dryRun=false 일 때만)
    let applied = 0
    if (!dryRun && plans.length > 0) {
      // bulk UPDATE — 차량별로 묶어서 처리
      const byCarId = new Map<string, string[]>() // car_id → tx_ids
      for (const p of plans) {
        if (!byCarId.has(p.car_id)) byCarId.set(p.car_id, [])
        byCarId.get(p.car_id)!.push(p.tx_id)
      }
      for (const [carId, txIds] of byCarId.entries()) {
        const ph = txIds.map(() => '?').join(',')
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE transactions
               SET related_type = 'car',
                   related_id = ?,
                   updated_at = NOW()
             WHERE id IN (${ph})`,
            carId, ...txIds
          )
          applied += txIds.length
        } catch (e: any) {
          console.error('[auto-match-card] UPDATE 실패:', carId, e?.message)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      total_unmatched: candidates.length,
      planned: plans.length,
      applied,
      skipped_no_match: skipNoMatch,
      skipped_ambiguous: skipAmbiguous,
      skipped_no_car: skipNoCar,
      gongyong_car_unlinked: gongyongCarUnlinked,
      gongyong_categorized: gongyongCategorized,
      distribution,
      skip_examples: skipExamples,
      sample: plans.slice(0, 5).map(p => ({
        tx_id: p.tx_id,
        car_id: p.car_id,
        car: carMeta[p.car_id] || null,
        card_alias: p.card_alias,
        holder_name: p.holder_name,
      })),
    })
  } catch (e: any) {
    console.error('[auto-match-card] 예외:', e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

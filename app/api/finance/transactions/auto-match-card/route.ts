import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ============================================================
// /api/finance/transactions/auto-match-card
//
// Excel 업로드된 카드 거래를 corporate_cards last4 와 매칭하여
// transactions.related_type='car', related_id=assigned_car_id 자동 할당
//
// [시나리오 1 — 공용 카드도 차량별 비용 귀속]
// 공용(탁송팀) 카드라도 매핑 관리에서 특정 차량에 배정되어 있다면
// 그 차량으로 매칭. holder_name='공용'이지만 실제 비용은 차량별로 귀속.
//
// 매칭 키 (우선순위):
//   1) corporate_cards.card_number 끝 4자리
//   2) (card_number 비어있으면) card_alias 끝 4자리 — "KB국민-4829" → "4829"
//
// 매칭 후 처리:
//   - related_type='car', related_id=assigned_car_id 셋팅
//   - 거래가 잘못 '공용카드사용' 카테고리로 분류되어 있던 경우
//     category=NULL, final_category=NULL 로 reset → 사용자가 룰/AI 분류 재실행 가능
//
// POST body: { dryRun?: false, batchId?: string (해당 batch만) }
// ============================================================

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** 카드의 last4 후보 — card_number 우선, 비었으면 card_alias 끝 숫자 4자리 */
function deriveLast4(card: { card_number: string | null; card_alias: string | null }): string | null {
  const numDigits = String(card.card_number || '').replace(/\D/g, '')
  if (numDigits.length >= 4) return numDigits.slice(-4)
  const aliasDigits = String(card.card_alias || '').replace(/\D/g, '')
  if (aliasDigits.length >= 4) return aliasDigits.slice(-4)
  return null
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const batchId: string | null = typeof body.batchId === 'string' ? body.batchId : null

    // ── 1) corporate_cards 미리 로드 + last4 인덱싱 ──
    const cards = await prisma.$queryRawUnsafe<Array<{
      id: string; card_number: string | null; card_alias: string | null;
      holder_name: string | null; assigned_car_id: string | null;
    }>>(`
      SELECT id, card_number, card_alias, holder_name, assigned_car_id
        FROM corporate_cards
    `)

    // last4 → 매칭되는 card 배열 (card_number 우선, 없으면 card_alias 끝 4자리)
    const last4Map = new Map<string, typeof cards>()
    for (const c of cards) {
      const last4 = deriveLast4(c)
      if (!last4) continue
      if (!last4Map.has(last4)) last4Map.set(last4, [])
      last4Map.get(last4)!.push(c)
    }

    // ── 2) 매칭 안된 Excel 카드 거래 가져오기 (공용 포함) ──
    let candidatesSql = `
      SELECT id,
             JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.card_last4')) AS card_last4,
             card_company,
             client_name,
             description,
             category,
             final_category,
             transaction_date,
             amount
        FROM transactions
       WHERE deleted_at IS NULL
         AND imported_from LIKE 'excel_card%'
         AND raw_data IS NOT NULL
         AND JSON_EXTRACT(raw_data, '$.card_last4') IS NOT NULL
         AND (related_id IS NULL OR related_type IS NULL OR related_type != 'car')
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
      category: string | null; final_category: string | null;
      transaction_date: any; amount: any;
    }>>(candidatesSql, ...params)

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        dry_run: dryRun,
        total_unmatched: 0,
        planned: 0,
        applied: 0,
        skipped_no_match: 0,
        skipped_ambiguous: 0,
        skipped_no_car: 0,
        category_reset: 0,
        message: '매칭 대상 없음 (Excel 카드 거래 + card_last4 + 미매칭)',
      })
    }

    // ── 3) 후보별 매칭 시도 ──
    interface MatchPlan {
      tx_id: string
      card_id: string
      car_id: string
      card_alias: string | null
      holder_name: string | null
      need_category_reset: boolean  // 공용카드사용으로 잘못 분류된 거 reset 대상
    }
    const plans: MatchPlan[] = []
    let skipNoMatch = 0
    let skipAmbiguous = 0
    let skipNoCar = 0
    const gongyongIdsToCategorize: string[] = [] // 카드는 매칭됐지만 차량 없음 → 진짜 공용
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
        // 카드는 등록되어 있지만 차량 미배정
        // → 공용 거래라면 '공용카드사용' 카테고리 후보 (진짜 공용)
        skipNoCar++
        if (tx.client_name === '공용' && tx.category !== '공용카드사용') {
          gongyongIdsToCategorize.push(tx.id)
        }
        if (skipExamples.length < 10) skipExamples.push({ reason: 'no_car', tx_id: tx.id, card_last4: tx.card_last4 })
        continue
      }
      if (withCar.length > 1) {
        skipAmbiguous++
        if (skipExamples.length < 10) skipExamples.push({ reason: 'ambiguous', tx_id: tx.id, card_last4: tx.card_last4 })
        continue
      }
      const card = withCar[0]
      // 거래가 잘못 '공용카드사용' 카테고리로 분류된 경우 reset 대상으로 표시
      const needCategoryReset = (tx.category === '공용카드사용' || tx.final_category === '공용카드사용')
      plans.push({
        tx_id: tx.id,
        card_id: card.id,
        car_id: card.assigned_car_id!,
        card_alias: card.card_alias,
        holder_name: card.holder_name,
        need_category_reset: needCategoryReset,
      })
    }

    // ── 4) 차량/카드 정보 조회 (응답용) ──
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

    // ── 5) distribution ──
    const distribution: Record<string, number> = {}
    for (const p of plans) {
      const meta = carMeta[p.car_id]
      const key = meta?.number ? `${meta.number} (${meta.brand} ${meta.model})`.trim() : p.car_id
      distribution[key] = (distribution[key] || 0) + 1
    }

    // ── 6) 실제 적용 ──
    let applied = 0
    let categoryReset = 0
    let gongyongCategorized = 0

    if (!dryRun) {
      // (a) 차량별 bulk UPDATE — related_type/id 셋팅 + 필요 시 카테고리 reset
      const byCarId = new Map<string, { resetIds: string[]; keepIds: string[] }>()
      for (const p of plans) {
        if (!byCarId.has(p.car_id)) byCarId.set(p.car_id, { resetIds: [], keepIds: [] })
        const bucket = byCarId.get(p.car_id)!
        if (p.need_category_reset) bucket.resetIds.push(p.tx_id)
        else bucket.keepIds.push(p.tx_id)
      }
      for (const [carId, { resetIds, keepIds }] of byCarId.entries()) {
        // category 유지하는 그룹
        if (keepIds.length > 0) {
          const ph = keepIds.map(() => '?').join(',')
          try {
            await prisma.$executeRawUnsafe(
              `UPDATE transactions
                 SET related_type = 'car', related_id = ?, updated_at = NOW()
               WHERE id IN (${ph})`,
              carId, ...keepIds
            )
            applied += keepIds.length
          } catch (e: any) {
            console.error('[auto-match-card] UPDATE keep 실패:', carId, e?.message)
          }
        }
        // category reset 대상 — 차량 매칭 + category/final_category NULL
        if (resetIds.length > 0) {
          const ph = resetIds.map(() => '?').join(',')
          try {
            await prisma.$executeRawUnsafe(
              `UPDATE transactions
                 SET related_type = 'car', related_id = ?,
                     category = NULL, final_category = NULL,
                     updated_at = NOW()
               WHERE id IN (${ph})`,
              carId, ...resetIds
            )
            applied += resetIds.length
            categoryReset += resetIds.length
          } catch (e: any) {
            console.error('[auto-match-card] UPDATE reset 실패:', carId, e?.message)
          }
        }
      }

      // (b) 진짜 공용 (카드 매칭 됐지만 차량 미배정) → 카테고리 자동 부여 제거
      // 사용자 명령 (5차원 분리 원칙): 카드 (공용/개인) 정보를 카테고리에 박지 않음.
      // 카드 차원은 corporate_cards JOIN 으로 자동 표시. 카테고리는 거래처 키워드 룰 분류만.
      // gongyongIdsToCategorize 는 카운트만 유지 (응답 정보용)
      gongyongCategorized = 0  // 자동 부여 안 함
    } else {
      // dryRun: 카운트만
      categoryReset = plans.filter(p => p.need_category_reset).length
      gongyongCategorized = gongyongIdsToCategorize.length
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
      category_reset: categoryReset,           // 공용카드사용 → 차량 매칭으로 카테고리 reset됨 (재분류 필요)
      gongyong_categorized: gongyongCategorized, // 진짜 공용 (차량 미배정 카드) → 공용카드사용
      distribution,
      skip_examples: skipExamples,
      sample: plans.slice(0, 5).map(p => ({
        tx_id: p.tx_id,
        car_id: p.car_id,
        car: carMeta[p.car_id] || null,
        card_alias: p.card_alias,
        holder_name: p.holder_name,
        category_reset: p.need_category_reset,
      })),
    })
  } catch (e: any) {
    console.error('[auto-match-card] 예외:', e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

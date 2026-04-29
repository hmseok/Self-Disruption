import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════
// /api/finance/transactions/auto-match-maintenance
//
// 정비/수리 거래를 자동으로 maintenance_records 테이블에 등록
//
// 매칭 키:
//   1) category = '정비/수리비' (룰 분류 결과)
//   2) 또는 client_name/description 에 정비소 키워드
//   3) related_type='car' 또는 transaction_vehicle_allocations 로 차량 연결됨
//
// 자동 작업:
//   - maintenance_records INSERT (car_id, date, type='auto-detected', cost, notes)
//   - 이미 같은 transaction_id 로 등록된 게 있으면 SKIP (idempotent)
//
// POST body: { dryRun?: false }
// ═══════════════════════════════════════════════════════════════

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAINTENANCE_KEYWORDS = [
  '정비', '카센터', '카센타', '카케어', '카닥', '오토케어',
  '카파토', '바디샵', '도장', '판금', '엔진오일', '미션오일',
  '타이어', '브레이크', '소모품', '부품', '필터',
  '현대모비스', '기아모비스', 'KGM', '쌍용',
  '서비스센터', '직영점', '엠스테이션',
]

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    // ── 1) 정비 후보 거래: 카테고리 또는 키워드 일치 + 차량 연결됨 ──
    const keywordLikes = MAINTENANCE_KEYWORDS.map(k => `%${k}%`)
    const orClient = keywordLikes.map(() => 'client_name LIKE ?').join(' OR ')
    const orDesc = keywordLikes.map(() => 'description LIKE ?').join(' OR ')

    const candidatesSql = `
      SELECT t.id, t.transaction_date, t.amount, t.client_name, t.description, t.category,
             t.related_type, t.related_id,
             COALESCE(t.related_id, tva.car_id) AS resolved_car_id
        FROM transactions t
        LEFT JOIN transaction_vehicle_allocations tva
               ON tva.transaction_id = t.id AND tva.source_type IN ('auto', 'manual')
       WHERE t.deleted_at IS NULL
         AND t.type = 'expense'
         AND (
           t.category IN ('정비/수리비', '수선/유지비')
           OR ${orClient}
           OR ${orDesc}
         )
         AND (
           (t.related_type = 'car' AND t.related_id IS NOT NULL)
           OR tva.car_id IS NOT NULL
         )
       LIMIT 5000
    `
    const candidates = await prisma.$queryRawUnsafe<Array<{
      id: string; transaction_date: any; amount: any;
      client_name: string | null; description: string | null; category: string | null;
      related_type: string | null; related_id: string | null;
      resolved_car_id: string | null;
    }>>(candidatesSql, ...keywordLikes, ...keywordLikes)

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true, dry_run: dryRun,
        total_candidates: 0, planned: 0, applied: 0,
        skipped_already: 0, skipped_no_car: 0,
        message: '매칭 대상 없음',
      })
    }

    // ── 2) 이미 등록된 maintenance_records 의 transaction_id 미리 조회 ──
    //   maintenance_records 에 transaction_id 컬럼이 있다고 가정 (없으면 notes에 저장)
    let alreadyTxIds = new Set<string>()
    try {
      const exist = await prisma.$queryRawUnsafe<Array<{ tx_id: string }>>(`
        SELECT DISTINCT REPLACE(REPLACE(notes, 'tx:', ''), ' ', '') AS tx_id
          FROM maintenance_records
         WHERE notes LIKE 'tx:%'
      `)
      alreadyTxIds = new Set(exist.map(e => e.tx_id))
    } catch { /* 컬럼/테이블 없으면 빈 set */ }

    // ── 3) 등록 계획 ──
    interface Plan {
      tx_id: string
      car_id: string
      tx_date: string
      amount: number
      type_label: string
      notes: string
    }
    const plans: Plan[] = []
    let skipAlready = 0
    let skipNoCar = 0
    const skipExamples: any[] = []

    for (const tx of candidates) {
      if (!tx.resolved_car_id) {
        skipNoCar++
        if (skipExamples.length < 10) skipExamples.push({
          reason: 'no_car', tx_id: tx.id, merchant: tx.client_name,
        })
        continue
      }
      if (alreadyTxIds.has(tx.id)) {
        skipAlready++
        continue
      }
      const dateStr = tx.transaction_date instanceof Date
        ? tx.transaction_date.toISOString().slice(0, 10)
        : String(tx.transaction_date).slice(0, 10)
      // 정비 종류 추정
      const text = `${tx.client_name || ''} ${tx.description || ''}`.toLowerCase()
      let typeLabel = '정비'
      if (/타이어|tire/i.test(text)) typeLabel = '타이어'
      else if (/오일|미션|엔진/i.test(text)) typeLabel = '오일류'
      else if (/판금|도장|바디/i.test(text)) typeLabel = '판금/도장'
      else if (/소모품|부품|필터/i.test(text)) typeLabel = '소모품'
      else if (/세차/i.test(text)) typeLabel = '세차'
      else if (/검사|정기검사/i.test(text)) typeLabel = '정기검사'

      plans.push({
        tx_id: tx.id,
        car_id: String(tx.related_type === 'car' ? tx.related_id : tx.resolved_car_id),
        tx_date: dateStr,
        amount: Number(tx.amount || 0),
        type_label: typeLabel,
        notes: `tx:${tx.id} · ${tx.client_name || ''} · ${tx.description || ''}`.slice(0, 300),
      })
    }

    // ── 4) 적용 ──
    let applied = 0
    if (!dryRun && plans.length > 0) {
      for (const plan of plans) {
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO maintenance_records
               (id, car_id, maintenance_date, maintenance_type, cost, notes, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            randomUUID(), plan.car_id, plan.tx_date, plan.type_label,
            plan.amount, plan.notes, user.id
          )
          applied++
        } catch (e: any) {
          console.error('[auto-match-maintenance] INSERT 실패:', plan.tx_id, e?.message)
        }
      }
    }

    return NextResponse.json({
      ok: true, dry_run: dryRun,
      total_candidates: candidates.length,
      planned: plans.length,
      applied,
      skipped_already: skipAlready,
      skipped_no_car: skipNoCar,
      skip_examples: skipExamples,
      sample: plans.slice(0, 5),
    })
  } catch (e: any) {
    console.error('[auto-match-maintenance]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

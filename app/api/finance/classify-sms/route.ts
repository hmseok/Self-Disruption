import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import {
  classifyByRules,
  validateDirection,
  getTier,
  ALL_CATEGORIES,
  INCOME_CATEGORIES,
} from '@/lib/transaction-classifier'

// ═══════════════════════════════════════════════════════════
// PHASE 3 — SMS 거래 AI 배치 분류 API
//
// POST /api/finance/classify-sms
//   미분류 SMS 거래를 수집 → 규칙 1차 → Gemini AI 2차 → 결과 저장
//
// GET /api/finance/classify-sms
//   분류 현황 통계 반환
// ═══════════════════════════════════════════════════════════

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

// ── Gemini AI 분류 ──
async function classifyWithGemini(
  items: Array<{ idx: number; type: string; date: string; merchant: string; amount: number; issuer: string }>,
): Promise<Array<{ idx: number; category: string; confidence: number }>> {
  if (!GEMINI_API_KEY || items.length === 0) return []

  const categoryList = ALL_CATEGORIES.join('\n')

  // 최대 50건씩 배치
  const batches: typeof items[] = []
  for (let i = 0; i < items.length; i += 50) {
    batches.push(items.slice(i, i + 50))
  }

  const allResults: Array<{ idx: number; category: string; confidence: number }> = []

  for (const batch of batches) {
    const txLines = batch.map((tx, i) =>
      `${i + 1}. [${tx.type === 'income' ? '입금' : '출금'}] ${tx.date} | ${tx.merchant} | ${Math.abs(tx.amount).toLocaleString()}원 | ${tx.issuer}`
    ).join('\n')

    const prompt = `당신은 한국 법인(운송/지입 업종) 세무사·회계사입니다. 아래 법인카드/통장 SMS 거래내역을 분류해주세요.

## 사용 가능한 카테고리
${categoryList}

## 분류 규칙
- 카드 승인 SMS의 가맹점명으로 판단
- 은행 입출금 SMS의 적요/메모로 판단
- 주유소, GS칼텍스, SK에너지 등 → 유류비
- 정비소, 타이어, 공업사 → 정비/수리비
- 식당, 카페, 편의점 → 복리후생(식대)
- 확실하지 않으면 confidence를 낮게 (50 이하)
- 운송/지입 업종 특성상 유류비·정비비·차량관련 비용 우선 고려

## 거래내역
${txLines}

## 응답 형식 (JSON 배열만, 설명 없이)
[{"no":1,"category":"유류비","confidence":85}]`

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
        }
      )

      if (!res.ok) {
        console.error('[classify-sms] Gemini API error:', res.status)
        continue
      }

      const data = await res.json()
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

      let parsed: any[]
      try {
        parsed = JSON.parse(content)
      } catch {
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        if (!jsonMatch) continue
        parsed = JSON.parse(jsonMatch[0])
      }

      for (const item of parsed) {
        const no = item.no - 1
        if (no >= 0 && no < batch.length && ALL_CATEGORIES.includes(item.category)) {
          const tx = batch[no]
          let category = item.category
          let confidence = Math.min(item.confidence || 60, 90)

          // 방향 검증
          if (!validateDirection(category, tx.type as 'income' | 'expense')) {
            category = '미분류'
            confidence = 30
          }

          allResults.push({ idx: tx.idx, category, confidence })
        }
      }
    } catch (e) {
      console.error('[classify-sms] Gemini error:', e)
    }
  }

  return allResults
}

// ── POST: 미분류 SMS 거래 일괄 분류 실행 ──
export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 미분류 SMS 거래 조회 (category IS NULL, imported_from = 'sms')
  const unclassified = await prisma.$queryRaw<Array<{
    id: string
    transaction_date: Date
    type: string
    amount: number
    description: string
    client_name: string
    card_company: string
  }>>`
    SELECT id, transaction_date, type, amount, description, client_name, card_company
    FROM transactions
    WHERE imported_from = 'sms'
      AND (category IS NULL OR category = '')
      AND deleted_at IS NULL
    ORDER BY transaction_date DESC
    LIMIT 200
  `

  if (unclassified.length === 0) {
    return NextResponse.json({ ok: true, message: '미분류 SMS 거래 없음', stats: { total: 0 } })
  }

  let ruleClassified = 0
  let aiClassified = 0
  let unresolved = 0
  const needsAi: Array<{ idx: number; type: string; date: string; merchant: string; amount: number; issuer: string; txId: string }> = []

  // ── 1차: 규칙 기반 분류 시도 ──
  for (let i = 0; i < unclassified.length; i++) {
    const tx = unclassified[i]
    const txType = tx.type as 'income' | 'expense'
    const result = classifyByRules(tx.description, txType)

    if (result && result.tier === 'auto') {
      // 높은 신뢰도 → 바로 적용
      await prisma.$executeRaw`
        UPDATE transactions SET category = ${result.category}, updated_at = NOW()
        WHERE id = ${tx.id}
      `
      ruleClassified++
    } else {
      // AI 분류 대상으로 추가
      needsAi.push({
        idx: i,
        type: tx.type,
        date: tx.transaction_date ? new Date(tx.transaction_date).toISOString().split('T')[0] : '',
        merchant: tx.description || tx.client_name || '',
        amount: Number(tx.amount) || 0,
        issuer: tx.card_company || '',
        txId: tx.id,
      })
    }
  }

  // ── 2차: Gemini AI 분류 ──
  if (needsAi.length > 0 && GEMINI_API_KEY) {
    const aiResults = await classifyWithGemini(needsAi)

    for (const result of aiResults) {
      const tx = needsAi.find(t => t.idx === result.idx)
      if (!tx) continue

      const tier = getTier(result.confidence)

      if (tier === 'auto') {
        // 높은 신뢰도 → transactions에 바로 적용
        await prisma.$executeRaw`
          UPDATE transactions SET category = ${result.category}, updated_at = NOW()
          WHERE id = ${tx.txId}
        `
        aiClassified++
      } else {
        // review/manual → classification_queue에 저장
        const queueId = randomUUID()
        await prisma.$executeRaw`
          INSERT INTO classification_queue (
            id, status, ai_category, queue_item_type, queue_summary, source_data, created_at, updated_at
          ) VALUES (
            ${queueId}, 'pending',
            ${result.category},
            'sms_transaction',
            ${`[${tx.issuer}] ${tx.merchant} ${tx.amount.toLocaleString()}원`},
            ${JSON.stringify({ transaction_id: tx.txId, confidence: result.confidence, tier })},
            NOW(), NOW()
          )
        `
        unresolved++
      }
    }

    // AI에서도 결과 없는 건 → manual로 큐잉
    const aiProcessedIdxs = new Set(aiResults.map(r => r.idx))
    for (const tx of needsAi) {
      if (!aiProcessedIdxs.has(tx.idx)) {
        const queueId = randomUUID()
        await prisma.$executeRaw`
          INSERT INTO classification_queue (
            id, status, queue_item_type, queue_summary, source_data, created_at, updated_at
          ) VALUES (
            ${queueId}, 'pending',
            'sms_transaction',
            ${`[${tx.issuer}] ${tx.merchant} ${tx.amount.toLocaleString()}원`},
            ${JSON.stringify({ transaction_id: tx.txId, confidence: 0, tier: 'manual' })},
            NOW(), NOW()
          )
        `
        unresolved++
      }
    }
  } else if (needsAi.length > 0) {
    // AI 키 없으면 전부 manual 큐잉
    for (const tx of needsAi) {
      const queueId = randomUUID()
      await prisma.$executeRaw`
        INSERT INTO classification_queue (
          id, status, queue_item_type, queue_summary, source_data, created_at, updated_at
        ) VALUES (
          ${queueId}, 'pending',
          'sms_transaction',
          ${`[${tx.issuer}] ${tx.merchant} ${tx.amount.toLocaleString()}원`},
          ${JSON.stringify({ transaction_id: tx.txId, confidence: 0, tier: 'manual' })},
          NOW(), NOW()
        )
      `
      unresolved++
    }
  }

  return NextResponse.json({
    ok: true,
    stats: {
      total: unclassified.length,
      ruleClassified,
      aiClassified,
      unresolved,
    },
  })
}

// ── GET: 분류 현황 통계 ──
export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // SMS 거래 분류 현황
  const stats = await prisma.$queryRaw<Array<{
    total: bigint
    classified: bigint
    unclassified: bigint
  }>>`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN category IS NOT NULL AND category != '' THEN 1 ELSE 0 END) as classified,
      SUM(CASE WHEN category IS NULL OR category = '' THEN 1 ELSE 0 END) as unclassified
    FROM transactions
    WHERE imported_from = 'sms' AND deleted_at IS NULL
  `

  // 카테고리별 분포
  const distribution = await prisma.$queryRaw<Array<{ category: string; cnt: bigint; total_amount: number }>>`
    SELECT
      COALESCE(category, '미분류') as category,
      COUNT(*) as cnt,
      SUM(amount) as total_amount
    FROM transactions
    WHERE imported_from = 'sms' AND deleted_at IS NULL
    GROUP BY category
    ORDER BY cnt DESC
  `

  // 대기 중인 classification_queue 건수
  const pendingQueue = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*) as cnt FROM classification_queue
    WHERE status = 'pending' AND queue_item_type = 'sms_transaction'
  `

  return NextResponse.json({
    smsTransactions: {
      total: Number(stats[0]?.total || 0),
      classified: Number(stats[0]?.classified || 0),
      unclassified: Number(stats[0]?.unclassified || 0),
    },
    pendingReview: Number(pendingQueue[0]?.cnt || 0),
    distribution: distribution.map(d => ({
      category: d.category,
      count: Number(d.cnt),
      totalAmount: Number(d.total_amount || 0),
    })),
  })
}

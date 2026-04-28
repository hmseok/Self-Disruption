import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ALL_CATEGORIES } from '@/lib/transaction-classifier'

// ============================================================
// /api/finance/transactions/auto-classify-ai
//
// 미분류 거래 batch (기본 50건씩) → Gemini → 분류 + 신뢰도
// 자동 적용 임계값: confidence >= 70 (기본)
// 임계값 미만은 final_category 만 채우고 category 는 미분류 유지
//   → 검토 큐에 남음
//
// POST body: { batchSize?: 50, minConfidence?: 70, limit?: 500, dryRun?: false }
// ============================================================

const ALLOWED_CATS = (ALL_CATEGORIES as any) || []

interface UnclassifiedRow {
  id: string
  type: 'income' | 'expense'
  client_name: string | null
  description: string | null
  card_company: string | null
  bank_name: string | null
  amount: number
  transaction_date: Date | string
}

async function classifyBatch(rows: UnclassifiedRow[]): Promise<Array<{ id: string; category: string; confidence: number; reason: string }>> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 미설정')
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const lines = rows.map((r, i) => {
    const date = r.transaction_date instanceof Date
      ? r.transaction_date.toISOString().slice(0, 10)
      : String(r.transaction_date).slice(0, 10)
    const dir = r.type === 'income' ? '입금' : '출금'
    const src = r.card_company || r.bank_name || '-'
    return `${i + 1}. [${dir}] ${date} | ${r.client_name || '-'} | ${r.description || '-'} | ${Number(r.amount).toLocaleString()}원 | ${src}`
  }).join('\n')

  const prompt = `당신은 한국 법인(렌터카/지입 운송업) 세무사입니다. 다음 통장/카드 거래를 한국 세무 회계 기준으로 분류해 주세요.

## 사용 가능 카테고리 (이 중 하나만 선택)
${(ALLOWED_CATS.length > 0 ? ALLOWED_CATS : [
  '렌트/운송수입','지입 관리비/수수료','투자원금 입금','대출 실행(입금)','이자/잡이익','보험금 수령','매각/처분수입','기타수입',
  '유류비','정비/수리비','차량보험료','자동차세/공과금','차량할부/리스료','화물공제/적재물보험','주차/시설이용료',
  '급여(정규직)','일용직급여','용역비(3.3%)','4대보험(회사부담)',
  '원천세/부가세','법인세/지방세','세금/공과금','이자비용(대출/투자)','원금상환','수수료/카드수수료',
  '임차료/사무실','통신비','소모품/사무용품','복리후생(식대)','접대비','여비교통비',
  '교육/훈련비','광고/마케팅','보험료(일반)','감가상각비','수선/유지비','전기/수도/가스','도서/신문','경비/보안',
  '쇼핑/온라인구매','결제대행/PG수수료','카드대금결제','국고/세금납부',
  '대표인출/가지급금','대표입금/가수금','직원대여/가지급',
  '공용카드사용','기타',
]).map((c, i) => `${i + 1}. ${c}`).join('\n')}

## 분류 힌트
- 거래처가 사람 이름 (석호민/박진숙/김준수 등) + 입금: 보통 "대표입금/가수금" 또는 "투자원금 입금"
- 거래처가 사람 이름 + 출금: "대표인출/가지급금" 또는 "직원대여/가지급" 또는 "급여(정규직)"
- 거래처가 "공용" + 카드 출금: "공용카드사용" (탁송팀 등 공용 카드)
- 큰 입금 (수억원대): 자본/투자 관련 가능성 높음
- 카드사 결제대금 출금: "카드대금결제"

## 응답 형식 — 마크다운 코드블록 없이 순수 JSON 배열만
[
  { "n": 1, "category": "유류비", "confidence": 85, "reason": "현대오일뱅크 매칭" },
  { "n": 2, "category": "공용카드사용", "confidence": 75, "reason": "공용 거래처 + 카드 결제" },
  ...
]

## 거래 목록 (총 ${rows.length}건)
${lines}

confidence 는 0~100. 매우 확실한 경우만 ≥85, 추정이면 60~75, 불명확 < 60.`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`)
  }
  const json = await res.json()
  let text = json?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const arrMatch = text.match(/\[[\s\S]*\]/)
  if (!arrMatch) return []
  const parsed: Array<{ n: number; category: string; confidence: number; reason: string }> = JSON.parse(arrMatch[0])
  return parsed
    .filter(p => p.n >= 1 && p.n <= rows.length)
    .map(p => ({
      id: rows[p.n - 1].id,
      category: p.category,
      confidence: Number(p.confidence) || 0,
      reason: p.reason || '',
    }))
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const batchSize = Math.max(10, Math.min(100, Number(body.batchSize) || 50))
    const minConfidence = Math.max(0, Math.min(100, Number(body.minConfidence) || 70))
    const limit = Math.max(10, Math.min(2000, Number(body.limit) || 500))
    const dryRun = body.dryRun === true

    // 미분류 가져오기
    const rows = await prisma.$queryRawUnsafe<UnclassifiedRow[]>(`
      SELECT id, type, client_name, description, card_company, bank_name, amount, transaction_date
        FROM transactions
       WHERE deleted_at IS NULL
         AND (category IS NULL OR category = '' OR category = '미분류')
       ORDER BY transaction_date DESC
       LIMIT ${limit}
    `)
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, total: 0, message: '미분류 거래 없음' })
    }

    // batch 별 처리
    const batches: UnclassifiedRow[][] = []
    for (let i = 0; i < rows.length; i += batchSize) batches.push(rows.slice(i, i + batchSize))

    const allResults: Array<{ id: string; category: string; confidence: number; reason: string }> = []
    const errors: string[] = []
    for (let bi = 0; bi < batches.length; bi++) {
      try {
        const r = await classifyBatch(batches[bi])
        allResults.push(...r)
      } catch (e: any) {
        errors.push(`batch ${bi + 1}: ${e.message}`)
        if (/429|rate/i.test(e.message)) break
      }
      if (bi < batches.length - 1) await new Promise(r => setTimeout(r, 1500))
    }

    let applied = 0
    const distribution: Record<string, number> = {}
    if (!dryRun) {
      for (const r of allResults) {
        // 임계값 이상만 자동 적용 (category 채움)
        // 미만은 final_category 에만 기록 (사용자 검토용)
        if (r.confidence >= minConfidence) {
          await prisma.$executeRawUnsafe(
            `UPDATE transactions SET category = ?, final_category = ?, updated_at = NOW() WHERE id = ?`,
            r.category, r.category, r.id
          )
          applied++
          distribution[r.category] = (distribution[r.category] || 0) + 1
        } else {
          await prisma.$executeRawUnsafe(
            `UPDATE transactions SET final_category = ?, updated_at = NOW() WHERE id = ?`,
            `[AI 추정 ${r.confidence}%] ${r.category}`, r.id
          )
        }
      }
    }

    return NextResponse.json({
      ok: true,
      total_unclassified: rows.length,
      ai_responses: allResults.length,
      applied_high_confidence: applied,
      below_threshold: allResults.length - applied,
      min_confidence: minConfidence,
      distribution,
      errors,
      sample: allResults.slice(0, 10),
    })
  } catch (e: any) {
    console.error('[auto-classify-ai] 실패:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

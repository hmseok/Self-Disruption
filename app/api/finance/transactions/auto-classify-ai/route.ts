import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { ALL_CATEGORIES } from '@/lib/transaction-classifier'

// ============================================================
// /api/finance/transactions/auto-classify-ai
//
// 미분류 거래 한 batch (기본 50건) → Gemini → 분류 + 신뢰도
// 한 번의 호출은 1 batch만 처리 (타임아웃 방지)
// 클라이언트가 remaining > 0 인 동안 반복 호출
//
// 자동 적용 임계값: confidence >= 70 (기본)
// 임계값 미만은 final_category 만 채우고 category 는 미분류 유지
//   → 검토 큐에 남음
//
// POST body: { batchSize?: 50, minConfidence?: 70, dryRun?: false }
// ============================================================

// Vercel/Next.js: 최대 5분
export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FALLBACK_CATEGORIES = [
  '렌트/운송수입','지입 관리비/수수료','투자원금 입금','대출 실행(입금)','이자/잡이익','보험금 수령','매각/처분수입','기타수입',
  '유류비','정비/수리비','차량보험료','자동차세/공과금','차량할부/리스료','화물공제/적재물보험','주차/시설이용료',
  '급여(정규직)','일용직급여','용역비(3.3%)','4대보험(회사부담)',
  '원천세/부가세','법인세/지방세','세금/공과금','이자비용(대출/투자)','원금상환','수수료/카드수수료',
  '임차료/사무실','통신비','소모품/사무용품','복리후생(식대)','접대비','여비교통비',
  '교육/훈련비','광고/마케팅','보험료(일반)','감가상각비','수선/유지비','전기/수도/가스','도서/신문','경비/보안',
  '쇼핑/온라인구매','결제대행/PG수수료','카드대금결제','국고/세금납부',
  '대표인출/가지급금','대표입금/가수금','직원대여/가지급',
  '공용카드사용','기타',
]
const ALLOWED_CATS: string[] = (Array.isArray(ALL_CATEGORIES) && ALL_CATEGORIES.length > 0)
  ? (ALL_CATEGORIES as string[])
  : FALLBACK_CATEGORIES

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
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다')
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
${ALLOWED_CATS.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## 분류 힌트
- 거래처가 사람 이름 (석호민/박진숙/김준수 등) + 입금: 보통 "대표입금/가수금" 또는 "투자원금 입금"
- 거래처가 사람 이름 + 출금: "대표인출/가지급금" 또는 "직원대여/가지급" 또는 "급여(정규직)"
- 거래처가 "공용" + 카드 출금: "공용카드사용" (탁송팀 등 공용 카드)
- 큰 입금 (수억원대): 자본/투자 관련 가능성 높음
- 카드사 결제대금 출금: "카드대금결제"

## 응답 형식 — 마크다운 코드블록 없이 순수 JSON 배열만
[
  { "n": 1, "category": "유류비", "confidence": 85, "reason": "현대오일뱅크 매칭" },
  { "n": 2, "category": "공용카드사용", "confidence": 75, "reason": "공용 거래처 + 카드 결제" }
]

## 거래 목록 (총 ${rows.length}건)
${lines}

confidence 는 0~100. 매우 확실한 경우만 ≥85, 추정이면 60~75, 불명확 < 60.`

  // 60초 timeout
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60_000)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
      signal: ctrl.signal,
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Gemini 호출 60초 초과')
    throw new Error(`Gemini 네트워크 오류: ${e?.message || e}`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`)
  }
  const json = await res.json()
  let text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const arrMatch = text.match(/\[[\s\S]*\]/)
  if (!arrMatch) {
    console.warn('[auto-classify-ai] Gemini 응답에 JSON 배열 없음:', text.slice(0, 200))
    return []
  }
  let parsed: Array<{ n: number; category: string; confidence: number; reason: string }>
  try {
    parsed = JSON.parse(arrMatch[0])
  } catch (e: any) {
    console.warn('[auto-classify-ai] JSON 파싱 실패:', arrMatch[0].slice(0, 200))
    return []
  }
  return parsed
    .filter(p => p && typeof p.n === 'number' && p.n >= 1 && p.n <= rows.length && p.category)
    .map(p => ({
      id: rows[p.n - 1].id,
      category: String(p.category),
      confidence: Number(p.confidence) || 0,
      reason: String(p.reason || ''),
    }))
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const batchSize = Math.max(10, Math.min(80, Number(body.batchSize) || 50))
    const minConfidence = Math.max(0, Math.min(100, Number(body.minConfidence) || 70))
    const dryRun = body.dryRun === true

    // 미분류 총 개수 (진행률 표시용)
    const totalRow = await prisma.$queryRawUnsafe<Array<{ cnt: bigint | number }>>(`
      SELECT COUNT(*) AS cnt
        FROM transactions
       WHERE deleted_at IS NULL
         AND (category IS NULL OR category = '' OR category = '미분류')
    `)
    const totalUnclassified = Number(totalRow?.[0]?.cnt || 0)

    if (totalUnclassified === 0) {
      return NextResponse.json({
        ok: true,
        total_unclassified: 0,
        remaining: 0,
        ai_responses: 0,
        applied_high_confidence: 0,
        below_threshold: 0,
        min_confidence: minConfidence,
        distribution: {},
        sample: [],
        message: '미분류 거래 없음',
      })
    }

    // 한 batch만 가져오기
    const rows = await prisma.$queryRawUnsafe<UnclassifiedRow[]>(`
      SELECT id, type, client_name, description, card_company, bank_name, amount, transaction_date
        FROM transactions
       WHERE deleted_at IS NULL
         AND (category IS NULL OR category = '' OR category = '미분류')
       ORDER BY transaction_date DESC
       LIMIT ${batchSize}
    `)

    let aiResults: Array<{ id: string; category: string; confidence: number; reason: string }> = []
    try {
      aiResults = await classifyBatch(rows)
    } catch (e: any) {
      console.error('[auto-classify-ai] Gemini 분류 실패:', e?.message)
      return NextResponse.json({
        error: `Gemini 분류 실패: ${e?.message || e}`,
        total_unclassified: totalUnclassified,
        remaining: totalUnclassified,
      }, { status: 500 })
    }

    let applied = 0
    let belowThreshold = 0
    const distribution: Record<string, number> = {}
    if (!dryRun) {
      for (const r of aiResults) {
        try {
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
            belowThreshold++
          }
        } catch (e: any) {
          console.warn('[auto-classify-ai] UPDATE 실패:', r.id, e?.message)
        }
      }
    }

    // 처리 후 남은 개수
    const remaining = Math.max(0, totalUnclassified - applied)

    return NextResponse.json({
      ok: true,
      total_unclassified: totalUnclassified,
      processed_this_batch: rows.length,
      remaining,
      ai_responses: aiResults.length,
      applied_high_confidence: applied,
      below_threshold: belowThreshold,
      min_confidence: minConfidence,
      distribution,
      sample: aiResults.slice(0, 5),
    })
  } catch (e: any) {
    console.error('[auto-classify-ai] 예외:', e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

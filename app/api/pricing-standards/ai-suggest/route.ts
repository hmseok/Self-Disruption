import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'

/**
 * POST /api/pricing-standards/ai-suggest
 *
 * 특정 기준값(business_rules.key 등) 한 개에 대해 Gemini 로 추천값을 조회한다.
 * 응답은 구조화된 JSON 이라 UI 가 "한 클릭 반영" 버튼에 바로 꽂을 수 있다.
 *
 * Body:
 *   { key, currentValue, label, unit, industryRef, range, context? }
 *
 * Response:
 *   {
 *     suggestedValue: number | null,
 *     confidence: 'high' | 'medium' | 'low' | 'unknown',
 *     reasoning: string,
 *     sources: string[],
 *     deviationPct: number | null,    // 현재값 대비 추천값 편차(%)
 *     rawText: string,                // 디버그용 원문
 *     searchedAt: string,
 *   }
 */

const MODEL = 'gemini-2.0-flash'

type SuggestBody = {
  key: string
  currentValue: number | string | null
  label?: string
  unit?: string
  industryRef?: string
  range?: string
  context?: Record<string, any>
}

function buildPrompt(body: SuggestBody): string {
  const { key, currentValue, label, unit, industryRef, range, context } = body
  const ctxLines = context
    ? Object.entries(context)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
    : ''

  return `너는 대한민국 렌터카 사업의 가격 기준값을 검증하는 전문가다.
공신력 있는 한국 공식 자료(세법, 보험업계, 자동차산업협회, 캐피탈 공시 등)만 근거로 사용해라.

[대상 기준값]
- 키: ${key}
- 한국어 라벨: ${label ?? '-'}
- 단위: ${unit ?? '-'}
- 현재 값: ${currentValue ?? '-'}
- 내부 권장 범위: ${range ?? '-'}
- 업계 참고: ${industryRef ?? '-'}

[추가 컨텍스트]
${ctxLines || '- (없음)'}

[요구]
1. 위 기준값에 대한 2025년 기준 최신 시장/법규 적정값을 판정하라.
2. 반드시 아래 JSON 스키마 그대로, 다른 텍스트 없이 JSON 한 덩어리만 출력하라:

{
  "suggestedValue": <number | null>,
  "confidence": "high" | "medium" | "low" | "unknown",
  "reasoning": "<최대 300자, 출처/근거 요약>"
}

값을 단정할 수 없으면 suggestedValue 를 null 로, confidence 를 "unknown" 으로 두어라.
단위는 현재 값 단위(${unit ?? '원본과 동일'})를 그대로 사용한다.`
}

async function callGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.')

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
    },
  )

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Gemini API Error: ${errText.substring(0, 300)}`)
  }

  const data = await resp.json()
  const parts = data.candidates?.[0]?.content?.parts || []
  const rawText = parts
    .filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join('\n')

  // 그라운딩 메타
  const sources: string[] = []
  const gm = data.candidates?.[0]?.groundingMetadata
  if (gm?.groundingChunks) {
    for (const chunk of gm.groundingChunks) {
      const uri = chunk.web?.uri
      if (uri) sources.push(uri)
    }
  }

  return { rawText, sources: [...new Set(sources)] }
}

// JSON blob 추출 — ```json ... ``` 코드펜스 혹은 바로 { ... } 포맷 모두 처리
function extractJson(text: string): any | null {
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text
  // 가장 처음 나오는 { ... } 블록을 찾는다
  const first = candidate.indexOf('{')
  const last = candidate.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return null
  const jsonStr = candidate.slice(first, last + 1)
  try {
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = (await request.json()) as SuggestBody
    if (!body?.key) {
      return NextResponse.json({ error: 'key 파라미터 필수' }, { status: 400 })
    }

    const prompt = buildPrompt(body)
    const { rawText, sources } = await callGemini(prompt)
    const parsed = extractJson(rawText)

    let suggestedValue: number | null = null
    let confidence: 'high' | 'medium' | 'low' | 'unknown' = 'unknown'
    let reasoning = ''

    if (parsed && typeof parsed === 'object') {
      const v = parsed.suggestedValue
      if (typeof v === 'number' && Number.isFinite(v)) suggestedValue = v
      else if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.replace(/[,%\s원]/g, ''))
        if (Number.isFinite(n)) suggestedValue = n
      }

      const c = parsed.confidence
      if (c === 'high' || c === 'medium' || c === 'low' || c === 'unknown') confidence = c

      if (typeof parsed.reasoning === 'string') reasoning = parsed.reasoning
    }

    // 편차(%) 계산
    let deviationPct: number | null = null
    const curNum =
      typeof body.currentValue === 'number'
        ? body.currentValue
        : typeof body.currentValue === 'string' && body.currentValue.trim() !== ''
        ? Number((body.currentValue as string).replace(/[,%\s원]/g, ''))
        : NaN
    if (suggestedValue !== null && Number.isFinite(curNum) && curNum !== 0) {
      deviationPct = ((suggestedValue - curNum) / Math.abs(curNum)) * 100
    }

    return NextResponse.json({
      suggestedValue,
      confidence,
      reasoning: reasoning || (rawText ? rawText.slice(0, 300) : ''),
      sources,
      deviationPct,
      rawText,
      searchedAt: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}

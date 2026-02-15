import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { requireAuth } from '../../utils/auth-guard'

// ⚡️ Gemini 2.0 Flash — 경쟁사 렌트 견적 조회
const MODEL = 'gemini-2.0-flash'

// 🏢 경쟁사 공식 사이트 매핑
const COMPETITOR_SITES: Record<string, { url: string; domain: string }> = {
  '롯데렌터카': { url: 'https://www.lotterentacar.net/', domain: 'lotterentacar.net' },
  'SK렌터카':   { url: 'https://www.skrentacar.com/',    domain: 'skrentacar.com' },
  '쏘카':       { url: 'https://www.socar.kr/',           domain: 'socar.kr' },
  'AJ렌터카':   { url: 'https://www.ajrentacar.co.kr/',   domain: 'ajrentacar.co.kr' },
}

async function lookupCompetitor(competitor: string, brand: string, model: string, term: number) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.')

  const site = COMPETITOR_SITES[competitor]
  const siteInfo = site
    ? `공식 사이트: ${site.url} (${site.domain})`
    : `${competitor} 공식 사이트`

  const prompt = `
너는 대한민국 렌터카 시장 전문 분석가야.
${competitor}에서 "${brand} ${model}" 차량의 장기렌트 견적 정보를 조사해줘.

★ 조사 대상: ${competitor} — ${siteInfo}
★ 차종: ${brand} ${model}
★ 계약기간: ${term}개월

[조사 방법]
1단계: "${competitor} ${brand} ${model} 장기렌트 견적" 으로 검색
2단계: ${competitor} 공식 사이트 또는 신뢰할 수 있는 렌트 비교 사이트에서 정보 수집
3단계: 아래 JSON 형식으로 정리

[필수 조사 항목]
1. 월 렌트료 (보증금 0% / 30% 각각)
2. 보험 조건 (대인/대물/자손/자차 한도)
3. 정비 포함 여부 및 범위
4. 주행거리 제한 (연간 km)
5. 반납 조건 (원상복구 기준, 면책금)
6. 만기 인수 조건 (인수 가능 여부, 예상 인수가/잔존가율)
7. 중도해지 조건 (위약금 비율)
8. 탁송/등록 비용 포함 여부
9. 대차 서비스 포함 여부

[JSON 형식 — 반드시 이 형식만 출력]
\`\`\`json
{
  "competitor": "${competitor}",
  "brand": "${brand}",
  "model": "${model}",
  "term": ${term},
  "source_url": "참조한 페이지 URL",
  "collected_at": "조사 시점",
  "pricing": {
    "monthly_no_deposit": 0,
    "monthly_30pct_deposit": 0,
    "deposit_options": ["0%", "30%"],
    "new_car_price": 0
  },
  "insurance": {
    "liability": "대인 무한",
    "property": "대물 한도 (원)",
    "personal": "자손 한도 (원)",
    "collision": "자차 포함 여부 및 자기부담금",
    "summary": "보험 조건 한줄 요약"
  },
  "maintenance": {
    "included": true,
    "scope": "포함 범위 상세 (엔진오일, 에어컨필터, 타이어 등)",
    "excluded": "미포함 항목",
    "summary": "정비 조건 한줄 요약"
  },
  "mileage": {
    "annual_limit_km": 20000,
    "excess_rate_per_km": 0,
    "summary": "주행거리 조건 요약"
  },
  "return_conditions": {
    "restoration_standard": "반납 시 원상복구 기준",
    "deductible": "면책금/자기부담금",
    "penalty_items": ["외관 손상", "실내 오염", "부품 누락 등"],
    "summary": "반납 조건 한줄 요약"
  },
  "buyout": {
    "available": true,
    "residual_value_rate": 0,
    "estimated_buyout_price": 0,
    "conditions": "인수 시 조건/절차",
    "summary": "만기 인수 조건 한줄 요약"
  },
  "early_termination": {
    "penalty_rate": "남은 렌트료의 X%",
    "minimum_period": "최소 유지 기간",
    "summary": "중도해지 조건 한줄 요약"
  },
  "extras": {
    "delivery_included": true,
    "registration_included": true,
    "replacement_car": true,
    "other_benefits": "기타 혜택"
  },
  "market_comment": "이 견적의 시장 경쟁력 평가 (강점/약점 2-3줄)",
  "confidence": "high/medium/low",
  "data_note": "데이터 출처 및 정확도 참고사항"
}
\`\`\`

★ 가격은 원(₩) 단위 정수로, 비율은 % 숫자로 입력
★ 정보를 찾을 수 없는 항목은 "정보 없음"으로 표기하되, 업계 일반 기준으로 추정하고 "(추정)" 표시
★ confidence: 공식 사이트 데이터면 "high", 비교 사이트면 "medium", 추정이 많으면 "low"
★ JSON 코드 블록만 출력. 설명이나 사족 금지.
`

  console.log(`🔍 [경쟁사조회] ${competitor} ${brand} ${model} ${term}개월`)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [
          { google_search: {} },
          { url_context: {} },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 16384,
        },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    console.error(`❌ [경쟁사조회] Gemini API 에러: ${errText.substring(0, 500)}`)

    // url_context 미지원 시 재시도
    if (errText.includes('url_context') || errText.includes('INVALID_ARGUMENT')) {
      return await lookupWithSearchOnly(apiKey, prompt)
    }
    throw new Error(`Gemini API Error: ${errText.substring(0, 300)}`)
  }

  try {
    const result = parseGeminiResponse(await response.json())
    console.log(`✅ [경쟁사조회] ${competitor} ${brand} ${model} — 성공`)
    return result
  } catch (parseError: any) {
    console.warn(`⚠️ [경쟁사조회] JSON 파싱 실패, 재시도: ${parseError.message}`)
    return await lookupWithSearchOnly(apiKey, prompt)
  }
}

async function lookupWithSearchOnly(apiKey: string, prompt: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 16384 },
      }),
    }
  )
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API Error: ${errText.substring(0, 300)}`)
  }
  return parseGeminiResponse(await response.json())
}

function parseGeminiResponse(data: any) {
  const parts = data.candidates?.[0]?.content?.parts || []
  const rawText = parts.filter((p: any) => p.text).map((p: any) => p.text).join('\n')
  if (!rawText) throw new Error('AI 응답이 비어있습니다.')

  const jsonMatch =
    rawText.match(/```json\s*([\s\S]*?)```/) ||
    rawText.match(/```\s*([\s\S]*?)```/) ||
    rawText.match(/(\{[\s\S]*\})/)

  if (!jsonMatch) throw new Error('AI 응답에서 JSON을 추출할 수 없습니다.')

  let jsonStr = jsonMatch[1].trim()
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1')

  try {
    return JSON.parse(jsonStr)
  } catch (parseErr: any) {
    throw new Error(`JSON 파싱 실패: ${parseErr.message}`)
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { competitor, brand, model, term } = await request.json()

    if (!brand || !model) {
      return NextResponse.json({ error: '브랜드와 모델명을 입력해주세요.' }, { status: 400 })
    }

    const result = await lookupCompetitor(
      competitor || '롯데렌터카',
      brand.trim(),
      model.trim(),
      term || 48,
    )

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('❌ [경쟁사조회] 에러:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

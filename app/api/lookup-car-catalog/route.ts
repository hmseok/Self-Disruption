import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'

/**
 * POST /api/lookup-car-catalog — PR-Q5-1
 *
 * 차종명 (brand+model+year) 텍스트 입력 → Gemini 가 지식 기반으로
 * 전체 트림/가격/색상/옵션을 NewCarResult JSON 형식으로 자동 생성.
 *
 * 카탈로그 등록 페이지의 「🔍 AI 자동 조사」 모드에서 호출.
 * 비용: ~₩1~3/회 (Gemini 2.0 Flash, 텍스트만).
 *
 * Body: { brand: string, model: string, year?: number }
 * Response: { data: NewCarResult, error: null } | { error: string }
 *
 * 응답 NewCarResult:
 *   { brand, model, year, variants: [{ variant_name, fuel_type, engine_cc,
 *     trims: [{ name, base_price, exterior_colors[], interior_colors[], options[] }] }] }
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const MODEL = 'gemini-2.0-flash'

const PROMPT_TEMPLATE = (brand: string, model: string, year: number) => `
너는 대한민국 자동차 카탈로그 전문가야.
다음 차종에 대한 전체 트림 / 가격 / 색상 / 옵션 정보를 JSON 으로 출력해라.

차종: ${brand} ${model} ${year}년형

[추출 규칙]
1. 해당 차종의 한국 시장 공식 출고 트림을 모두 포함 (변형: 가솔린/디젤/하이브리드/전기 등 분리)
2. ★★★ 가격은 원(₩) 단위 정수 ★★★
   - VAT 포함가 (출고가) 기준
   - base_price 는 최소 5,000,000 (자동차가 500만원 미만일 수 없음)
   - 정확한 정보가 없으면 합리적 추정 (변형/트림 별 가격 비례 유지)
3. 각 variant 의 fuel_type: '가솔린' / '디젤' / '하이브리드' / '전기' 중 하나
4. engine_cc: 자연수 (전기차는 0)
5. 트림은 가격 오름차순 정렬
6. 외장 색상 / 내장 색상 / 선택 옵션:
   - 일반적으로 알려진 항목 포함 (정확치 모르면 대표 3~5개만)
   - 색상 추가금이 있으면 price 에 표시 (모르면 0)
7. 차종 정보가 부족하거나 신뢰 불가 시: available=false 로 표시 + message 에 사유

[JSON 형식]
{
  "brand": "${brand}",
  "model": "${model}",
  "year": ${year},
  "available": true,
  "source": "ai-research",
  "message": "",
  "variants": [
    {
      "variant_name": "변형명 (예: 가솔린 2.0, 하이브리드)",
      "fuel_type": "가솔린",
      "engine_cc": 1999,
      "consumption_tax": "",
      "trims": [
        {
          "name": "트림명 (예: 프리미엄)",
          "base_price": 30500000,
          "note": "",
          "exterior_colors": [
            { "name": "클리어 화이트", "code": "", "price": 0 }
          ],
          "interior_colors": [
            { "name": "블랙 모노톤", "code": "", "price": 0 }
          ],
          "options": [
            { "name": "내비게이션 패키지", "price": 0 }
          ]
        }
      ]
    }
  ]
}

반드시 JSON 만 출력. 설명/사족 X.
정보 모를 시: variants: [], available: false, message: 사유.
`

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const brand = String(body?.brand || '').trim()
    const model = String(body?.model || '').trim()
    const year = Number(body?.year) || new Date().getFullYear()

    if (!brand || !model) {
      return NextResponse.json({ error: 'brand / model 필수' }, { status: 400 })
    }
    if (year < 1990 || year > 2100) {
      return NextResponse.json({ error: 'year 는 1990~2100 범위' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 })
    }

    const prompt = PROMPT_TEMPLATE(brand, model, year)

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      console.error('[lookup-car-catalog] Gemini error:', errText.slice(0, 500))
      return NextResponse.json({ error: `AI 호출 실패: ${errText.slice(0, 200)}` }, { status: 500 })
    }

    const json = await res.json()
    const parts = json?.candidates?.[0]?.content?.parts || []
    const rawText = parts.filter((p: any) => p.text).map((p: any) => p.text).join('')

    let parsed: any
    try {
      parsed = JSON.parse(rawText)
    } catch {
      // 코드 블록 fallback
      const m = rawText.match(/```json\s*([\s\S]*?)```/) || rawText.match(/(\{[\s\S]*\})/)
      if (m) {
        try { parsed = JSON.parse(m[1].trim()) } catch { /* ignore */ }
      }
    }

    if (!parsed) {
      return NextResponse.json({
        error: 'AI 응답 JSON 파싱 실패',
        raw_sample: rawText.slice(0, 300),
      }, { status: 502 })
    }

    // 안전 검증
    if (!Array.isArray(parsed.variants)) parsed.variants = []
    parsed.brand = parsed.brand || brand
    parsed.model = parsed.model || model
    parsed.year = parsed.year || year
    parsed.source = parsed.source || 'ai-research'

    return NextResponse.json({ data: parsed, error: null })
  } catch (e: unknown) {
    console.error('[lookup-car-catalog POST]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}

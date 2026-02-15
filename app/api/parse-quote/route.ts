import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { requireAuth } from '../../utils/auth-guard'

const MODEL = 'gemini-2.0-flash'

const PROMPT = `너는 대한민국 자동차 공식 견적서/가격표 문서 분석기야.
업로드된 문서(PDF 또는 이미지)에서 차량 가격 정보를 추출해서 JSON으로 출력해라.
반드시 JSON만 출력하고, 설명이나 사족은 절대 쓰지 마.

[추출 규칙]
1. 문서에 있는 모든 차종, 트림, 옵션 정보를 빠짐없이 추출
2. 가격은 원(₩) 단위 정수로 변환 (쉼표 제거)
3. 트림은 가격 오름차순 정렬
4. 부가세 포함 출고가 기준
5. 문서에서 확인된 정보만 넣고, 추측하지 마
6. ★★★ 개별소비세 구분이 있으면 반드시 분리해라 ★★★
   - "개별소비세 5%" 가격표와 "개별소비세 3.5%" 가격표가 각각 있으면 별도 variant로 분리
   - consumption_tax 필드에 "개별소비세 5%", "개별소비세 3.5%" 등 명시
   - 세율 구분이 없으면(1가지만 있으면) consumption_tax는 빈 문자열("")
7. ★★★ 외장 컬러 / 내장 컬러 — 반드시 추출 ★★★
   - 문서에 외장색(Exterior Color) 목록이 있으면 각 트림의 exterior_colors[]에 모두 포함
   - 문서에 내장색(Interior Color) 목록이 있으면 각 트림의 interior_colors[]에 모두 포함
   - 컬러명, 컬러코드(있으면), 추가금액(기본색이면 0) 모두 추출
   - 컬러 정보가 문서에 없으면 exterior_colors: [], interior_colors: []로 둬라
8. ★★★ 선택 옵션/패키지 — 절대 생략 금지 ★★★
   - 각 트림별 선택 옵션, 선택 패키지를 모두 포함해라
   - 옵션이 많더라도 절대 생략하지 마라

[JSON 형식]
{
  "brand": "브랜드명",
  "model": "모델명",
  "year": 2025,
  "source": "견적서 업로드",
  "variants": [
    {
      "variant_name": "차종 그룹명",
      "fuel_type": "휘발유/경유/LPG/전기/하이브리드",
      "engine_cc": 1598,
      "consumption_tax": "개별소비세 5%",
      "trims": [
        {
          "name": "트림명",
          "base_price": 25000000,
          "note": "주요사양 1줄",
          "exterior_colors": [
            { "name": "컬러명", "code": "코드", "price": 0 }
          ],
          "interior_colors": [
            { "name": "컬러명", "code": "코드", "price": 0 }
          ],
          "options": [
            { "name": "옵션명", "price": 500000, "description": "설명" }
          ]
        }
      ]
    }
  ],
  "available": true,
  "message": "견적서에서 추출한 데이터입니다."
}

위 형식의 JSON만 출력하라. 다른 텍스트는 절대 쓰지 마라.`

// Simplified prompt for retry (smaller output)
const SIMPLE_PROMPT = `너는 자동차 가격표 분석기야.
업로드된 문서에서 차량 기본 정보만 추출해서 JSON으로 출력해라.
컬러, 옵션 정보는 생략하고 트림명과 기본가격만 추출해라.
반드시 JSON만 출력해라.

{
  "brand": "브랜드명",
  "model": "모델명",
  "year": 2025,
  "source": "견적서 업로드",
  "variants": [
    {
      "variant_name": "차종 그룹명",
      "fuel_type": "휘발유",
      "engine_cc": 1598,
      "consumption_tax": "",
      "trims": [
        {
          "name": "트림명",
          "base_price": 25000000,
          "note": "",
          "exterior_colors": [],
          "interior_colors": [],
          "options": []
        }
      ]
    }
  ],
  "available": true,
  "message": "견적서에서 추출한 데이터입니다 (기본 정보만)."
}

위 형식의 JSON만 출력하라.`

function recoverTruncatedJson(str: string): any {
  // 1차: 그대로 파싱
  try { return JSON.parse(str) } catch (_) {}

  // trailing comma 제거
  let fixed = str.replace(/,\s*([}\]])/g, '$1')

  // 1.5차: trailing comma 제거 후 재시도
  try { return JSON.parse(fixed) } catch (_) {}

  // 2차: 잘린 문자열/키 정리 후 bracket 닫기
  // 잘린 문자열 값 닫기 — 마지막 열린 따옴표 처리
  const lastQuote = fixed.lastIndexOf('"')
  if (lastQuote > 0) {
    const afterQuote = fixed.substring(lastQuote + 1).trim()
    if (afterQuote === '' || afterQuote.match(/^[^"{}[\],]*$/)) {
      const patterns = [
        /,\s*"[^"]*":\s*"[^"]*$/, // 잘린 문자열 값
        /,\s*"[^"]*":\s*\d+[^,}\]]*$/, // 잘린 숫자 값
        /,\s*"[^"]*":\s*$/, // 잘린 키:값
        /,\s*"[^"]*$/, // 잘린 키
        /,\s*\{[^}]*$/, // 잘린 객체
        /,\s*\[[^\]]*$/, // 잘린 배열
      ]
      for (const pat of patterns) {
        const m = fixed.match(pat)
        if (m && m.index !== undefined) {
          fixed = fixed.substring(0, m.index)
          break
        }
      }
    }
  }

  // 마지막 완전한 객체/배열 찾기 (여러 패턴 시도)
  const cutPoints = [
    fixed.lastIndexOf('}],"'),
    fixed.lastIndexOf('}],'),
    fixed.lastIndexOf('}]'),
    fixed.lastIndexOf('},'),
    fixed.lastIndexOf('}'),
  ]

  for (const cp of cutPoints) {
    if (cp <= 0) continue
    let attempt = fixed.substring(0, cp + (fixed[cp] === '}' && fixed[cp + 1] === ']' ? 2 : 1))
    attempt = attempt.replace(/,\s*$/, '')
    attempt = attempt.replace(/,\s*([}\]])/g, '$1')
    // 열린 bracket 닫기
    const opens = (attempt.match(/\[/g) || []).length - (attempt.match(/\]/g) || []).length
    const openBraces = (attempt.match(/\{/g) || []).length - (attempt.match(/\}/g) || []).length
    for (let i = 0; i < openBraces; i++) attempt += '}'
    for (let i = 0; i < opens; i++) attempt += ']'
    if (!attempt.trimEnd().endsWith('}')) attempt += '}'
    attempt = attempt.replace(/,\s*([}\]])/g, '$1')
    try {
      const parsed = JSON.parse(attempt)
      console.log(`✅ [견적서파싱] JSON 복구 성공 (cutPoint: ${cp})`)
      return parsed
    } catch (_) { continue }
  }

  // 3차: variants 배열 앞부분까지 파싱
  const variantsStart = str.indexOf('"variants"')
  if (variantsStart > 0) {
    const headerStr = str.substring(0, variantsStart).replace(/,\s*$/, '') + '"variants": [],' +
      '"available": true, "message": "일부 데이터만 추출됨 (응답 잘림)"}'
    try {
      const partial = JSON.parse(headerStr)
      const variantsPart = str.substring(variantsStart + '"variants"'.length)
      const trimmedVariants = variantsPart.replace(/^\s*:\s*/, '')
      // 완성된 variant 객체들을 찾기 - improved regex
      const variantMatches = trimmedVariants.match(/\{[^{}]*"trims"\s*:\s*\[[\s\S]*?\]\s*\}/g)
      if (variantMatches) {
        partial.variants = variantMatches.map((v: string) => {
          try { return JSON.parse(v) } catch { return null }
        }).filter(Boolean)
      }
      if (partial.variants.length > 0) {
        console.log(`✅ [견적서파싱] JSON 부분 복구 성공 (${partial.variants.length}개 차종)`)
        return partial
      }
    } catch (_) {}
  }

  // 4차: 바이너리 서치로 파싱 가능한 가장 긴 substring 찾기
  // variants 시작점 이후의 각 '}' 위치에서 잘라보기
  const allCloseBraces: number[] = []
  for (let i = str.length - 1; i >= Math.floor(str.length * 0.3); i--) {
    if (str[i] === '}') allCloseBraces.push(i)
  }
  // 뒤에서부터(더 많은 데이터) 시도
  for (const pos of allCloseBraces) {
    let attempt = str.substring(0, pos + 1)
    attempt = attempt.replace(/,\s*([}\]])/g, '$1')
    const opens = (attempt.match(/\[/g) || []).length - (attempt.match(/\]/g) || []).length
    const openBraces = (attempt.match(/\{/g) || []).length - (attempt.match(/\}/g) || []).length
    if (openBraces < 0 || opens < 0) continue // 닫힘이 더 많으면 skip
    for (let i = 0; i < openBraces; i++) attempt += '}'
    for (let i = 0; i < opens; i++) attempt += ']'
    attempt = attempt.replace(/,\s*([}\]])/g, '$1')
    try {
      const parsed = JSON.parse(attempt)
      if (parsed.brand || parsed.model) {
        console.log(`✅ [견적서파싱] JSON 4차 복구 성공 (pos: ${pos}/${str.length})`)
        return parsed
      }
    } catch (_) { continue }
  }

  return null
}

async function callGemini(apiKey: string, mimeType: string, base64Data: string, prompt: string, maxTokens: number = 65536): Promise<{ rawText: string; truncated: boolean }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    console.error(`❌ [견적서파싱] Gemini API 에러: ${errText.substring(0, 500)}`)
    throw new Error(`AI 분석 실패: ${errText.substring(0, 200)}`)
  }

  const data = await response.json()
  const candidate = data.candidates?.[0]
  const finishReason = candidate?.finishReason || 'UNKNOWN'
  const truncated = finishReason === 'MAX_TOKENS' || finishReason === 'RECITATION'

  if (truncated) {
    console.warn(`⚠️ [견적서파싱] 응답 잘림 (finishReason: ${finishReason})`)
  }

  const parts = candidate?.content?.parts || []
  const rawText = parts
    .filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join('\n')

  return { rawText, truncated }
}

function extractJson(rawText: string): any {
  if (!rawText) return null

  // 1차: responseMimeType: 'application/json' 이면 바로 파싱 시도
  try { return JSON.parse(rawText) } catch (_) {}

  // 2차: JSON 코드 블록에서 추출
  const jsonMatch =
    rawText.match(/```json\s*([\s\S]*?)```/) ||
    rawText.match(/```\s*([\s\S]*?)```/) ||
    rawText.match(/(\{[\s\S]*\})/)

  if (!jsonMatch) return null

  let jsonStr = jsonMatch[1].trim()
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1')

  // 3차: 파싱 시도
  try { return JSON.parse(jsonStr) } catch (_) {}

  // 4차: 복구 시도
  return recoverTruncatedJson(jsonStr)
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: '파일이 업로드되지 않았습니다.' },
        { status: 400 }
      )
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const bytes = await file.arrayBuffer()
    const base64Data = Buffer.from(bytes).toString('base64')

    let mimeType = file.type
    if (!mimeType || mimeType === 'application/octet-stream') {
      const name = file.name.toLowerCase()
      if (name.endsWith('.pdf')) mimeType = 'application/pdf'
      else if (name.endsWith('.png')) mimeType = 'image/png'
      else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) mimeType = 'image/jpeg'
      else if (name.endsWith('.webp')) mimeType = 'image/webp'
      else mimeType = 'application/pdf'
    }

    console.log(`📄 [견적서파싱] 파일: ${file.name} (${mimeType}, ${Math.round(bytes.byteLength / 1024)}KB)`)

    // 1차 시도: 전체 프롬프트
    const { rawText, truncated } = await callGemini(apiKey, mimeType, base64Data, PROMPT)

    console.log(`📝 [견적서파싱] AI 응답: ${rawText.length}자 (잘림: ${truncated})`)

    let result = extractJson(rawText)

    // 잘렸거나 파싱 실패 시 → 간소화 프롬프트로 재시도
    if (!result || (truncated && (!result.variants || result.variants.length === 0))) {
      console.log(`🔄 [견적서파싱] 간소화 프롬프트로 재시도...`)
      const { rawText: retryText } = await callGemini(apiKey, mimeType, base64Data, SIMPLE_PROMPT, 32768)
      console.log(`📝 [견적서파싱] 재시도 응답: ${retryText.length}자`)

      const retryResult = extractJson(retryText)
      if (retryResult && retryResult.variants && retryResult.variants.length > 0) {
        result = retryResult
        result.message = '기본 정보만 추출되었습니다. (컬러/옵션 정보는 수동 입력 필요)'
        console.log(`✅ [견적서파싱] 재시도 성공`)
      }
    }

    if (!result) {
      console.error(`❌ [견적서파싱] 최종 파싱 실패\n원본(앞500): ${rawText.substring(0, 500)}\n원본(뒤500): ${rawText.substring(rawText.length - 500)}`)
      return NextResponse.json(
        { error: `가격표 분석에 실패했습니다. 파일 형식을 확인하고 다시 시도해주세요. (PDF 이미지가 선명한지 확인)` },
        { status: 500 }
      )
    }

    result.source = `견적서 업로드 (${file.name})`

    console.log(`✅ [견적서파싱] ${result.brand} ${result.model} — 차종 ${result.variants?.length || 0}개`)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('❌ [견적서파싱] 에러:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

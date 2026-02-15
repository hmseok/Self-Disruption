import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { requireAuth } from '../../utils/auth-guard'

// ⚡️ Gemini 2.0 Flash — 신차 정보 조회용
const MODEL = 'gemini-2.0-flash'

// 🏭 제조사 공식 사이트 매핑
const BRAND_OFFICIAL_SITES: Record<string, { url: string; domain: string }> = {
  '기아':       { url: 'https://www.kia.com/kr/',            domain: 'kia.com/kr' },
  '현대':       { url: 'https://www.hyundai.com/kr/',        domain: 'hyundai.com/kr' },
  '제네시스':   { url: 'https://www.genesis.com/kr/',        domain: 'genesis.com/kr' },
  '쉐보레':     { url: 'https://www.chevrolet.co.kr/',       domain: 'chevrolet.co.kr' },
  '르노코리아': { url: 'https://www.renaultkorea.com/',      domain: 'renaultkorea.com' },
  'KG모빌리티': { url: 'https://www.kgmobility.com/',       domain: 'kgmobility.com' },
  'BMW':        { url: 'https://www.bmw.co.kr/',             domain: 'bmw.co.kr' },
  '벤츠':       { url: 'https://www.mercedes-benz.co.kr/',   domain: 'mercedes-benz.co.kr' },
  '메르세데스': { url: 'https://www.mercedes-benz.co.kr/',   domain: 'mercedes-benz.co.kr' },
  '아우디':     { url: 'https://www.audi.co.kr/',            domain: 'audi.co.kr' },
  '폭스바겐':   { url: 'https://www.volkswagen.co.kr/',      domain: 'volkswagen.co.kr' },
  '볼보':       { url: 'https://www.volvocars.com/kr/',      domain: 'volvocars.com/kr' },
  '테슬라':     { url: 'https://www.tesla.com/ko_kr',        domain: 'tesla.com' },
  '토요타':     { url: 'https://www.toyota.co.kr/',          domain: 'toyota.co.kr' },
  '렉서스':     { url: 'https://www.lexus.co.kr/',           domain: 'lexus.co.kr' },
  '혼다':       { url: 'https://www.honda.co.kr/',           domain: 'honda.co.kr' },
  '포르쉐':     { url: 'https://www.porsche.com/korea/',     domain: 'porsche.com/korea' },
  '랜드로버':   { url: 'https://www.landrover.co.kr/',       domain: 'landrover.co.kr' },
  '미니':       { url: 'https://www.mini.co.kr/',            domain: 'mini.co.kr' },
  '푸조':       { url: 'https://www.peugeot.co.kr/',         domain: 'peugeot.co.kr' },
}

function getOfficialSite(brand: string): { url: string; domain: string } {
  const normalized = brand.trim()
  if (BRAND_OFFICIAL_SITES[normalized]) return BRAND_OFFICIAL_SITES[normalized]
  for (const [key, site] of Object.entries(BRAND_OFFICIAL_SITES)) {
    if (normalized.toUpperCase().includes(key.toUpperCase()) || key.toUpperCase().includes(normalized.toUpperCase())) {
      return site
    }
  }
  return { url: `${brand} 공식 홈페이지`, domain: '' }
}

// ────────────────────────────────────────────────────────────────
// 🔍 Gemini 호출 — google_search + url_context 두 도구를 함께 사용
//    Gemini가 공식 가격표 페이지를 찾고 → 직접 읽어서 → JSON 추출
// ────────────────────────────────────────────────────────────────
async function lookupNewCar(brand: string, model: string) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.')

  const site = getOfficialSite(brand)

  const prompt = `
너는 대한민국 자동차 제조사 공식 홈페이지 전용 가격표 수집기야.
반드시 JSON 코드 블록만 출력해야 하고, 설명이나 사족은 절대 쓰지 마.

★★★ 핵심 규칙: 반드시 공식 홈페이지(${site.domain})에서만 데이터를 가져와라 ★★★
제3자 사이트, 뉴스, 블로그, 커뮤니티 데이터는 절대 사용하지 마라.
공식 사이트에서 데이터를 찾을 수 없으면 available: false로 반환해라.

[작업 순서 — 반드시 따라라]
1단계: "${brand} ${model}" 가격표 페이지를 찾아라.
  - 검색어: "${brand} ${model} 가격표 site:${site.domain}"
  - 공식 사이트: ${site.url}
2단계: 찾은 가격표 페이지 URL을 직접 방문해서 읽어라.
  - 반드시 ${site.domain} 도메인의 URL만 열어라.
  - 공식 홈페이지의 가격표 페이지를 url_context로 직접 열어서 내용을 확인해라.
  - 페이지 안의 모든 트림명, 가격, 옵션명, 옵션 가격을 빠짐없이 추출해라.
3단계: 추출한 데이터를 아래 JSON 형식으로 정리해라.

[데이터 출처 — 절대 규칙]
✅ 허용: ${site.domain} 공식 가격표 페이지만
❌ 금지: 제3자 사이트, 뉴스, 블로그, 중고차, 할인 프로모션, 추측 가격

[데이터 구조]
하나의 모델은 여러 "차종 그룹(variant)"을 가질 수 있다.
예: 기아 레이 → "1.0 가솔린", "1인승 밴", "2인승 밴"
각 차종 그룹 안에 트림이 있고, 각 트림에 선택 옵션/패키지가 있다.

★★★ 개별소비세 구분 — 매우 중요 ★★★
대한민국 자동차 공식 가격표는 보통 "개별소비세 5%" 적용 가격과 "개별소비세 3.5%" 적용 가격 두 가지를 제공한다.
가격표에 개별소비세율이 다른 두 가지 가격이 있으면 반드시 별도 variant로 분리하고 consumption_tax 필드에 세율을 명시해라.
예: 같은 "2.5 가솔린" 그룹이라도 개별소비세 5%와 3.5%가 있으면 2개의 variant로 만들어라.
가격표에 세율 구분이 없으면(1가지만 있으면) consumption_tax는 빈 문자열("")로 둬라.

[JSON 필드 설명]
- brand: 브랜드 한글명
- model: 모델명
- year: 현재 판매 연식
- source: 실제 참조한 가격표 페이지 URL
- variants[]: 차종 그룹 배열
  - variant_name: 그룹명 (예: "1.0 가솔린")
  - fuel_type: 휘발유/경유/LPG/전기/하이브리드
  - engine_cc: 배기량(cc), 전기차=0
  - consumption_tax: 개별소비세 구분 (예: "개별소비세 5%", "개별소비세 3.5%", 또는 "")
  - trims[]: 트림 배열 (가격 오름차순)
    - name: 트림명
    - base_price: 기본 출고가 (원, 정수, 부가세 포함)
    - note: 주요사양 1줄
    - exterior_colors[]: 외장 컬러 배열
      - name: 컬러명 (예: "스노우 화이트 펄")
      - code: 컬러코드 (있으면, 예: "SWP")
      - price: 추가금액 (기본 컬러면 0)
    - interior_colors[]: 내장 컬러 배열
      - name: 컬러명 (예: "블랙 모노톤")
      - code: 컬러코드 (있으면)
      - price: 추가금액 (기본이면 0)
    - options[]: 선택 옵션 배열
      - name: 옵션/패키지명
      - price: 추가 금액 (원, 정수)
      - description: 설명 1줄
- available: boolean
- message: 빈 문자열 또는 참고 메시지

[완전성 — 매우 중요]
⚠️ 공식 가격표에 있는 모든 차종 그룹, 모든 트림, 모든 옵션을 빠짐없이 전부 포함!
트림 4개면 4개, 옵션 5개면 5개 — 생략 금지.
옵션 없으면 options: []
개별소비세율이 다른 가격이 있으면 반드시 모두 포함!

★★★ 선택 옵션/패키지 — 절대 생략 금지 ★★★
각 트림별로 제공되는 선택 옵션, 선택 패키지, H Genuine Accessories 등을 모두 포함해라.
가격표 페이지의 "선택 품목", "옵션", "패키지" 섹션을 반드시 확인하고 빠짐없이 추출해라.
옵션이 많더라도 절대 생략하지 마라. 응답이 길어져도 모든 옵션을 포함하는 것이 우선이다.

★★★ 외장/내장 컬러 — 중요 ★★★
각 트림별로 제공되는 외장 컬러와 내장 컬러를 모두 포함해라.
가격표에 컬러별 추가금액이 있으면 price에 반영하고, 기본 컬러는 price: 0으로.
컬러 정보가 없으면 exterior_colors: [], interior_colors: []로 둬라.

\`\`\`json
{
  "brand": "기아",
  "model": "레이",
  "year": 2025,
  "source": "https://www.kia.com/kr/vehicles/ray/price.html",
  "variants": [
    {
      "variant_name": "1.0 가솔린",
      "fuel_type": "휘발유",
      "engine_cc": 998,
      "consumption_tax": "개별소비세 5%",
      "trims": [
        {
          "name": "트렌디",
          "base_price": 14410000,
          "note": "기본형",
          "exterior_colors": [
            { "name": "스노우 화이트 펄", "code": "SWP", "price": 0 },
            { "name": "오로라 블랙 펄", "code": "ABP", "price": 0 }
          ],
          "interior_colors": [
            { "name": "블랙", "code": "BK", "price": 0 }
          ],
          "options": [
            { "name": "내비게이션 패키지", "price": 600000, "description": "8인치 내비+후방카메라" }
          ]
        }
      ]
    },
    {
      "variant_name": "1.0 가솔린",
      "fuel_type": "휘발유",
      "engine_cc": 998,
      "consumption_tax": "개별소비세 3.5%",
      "trims": [
        {
          "name": "트렌디",
          "base_price": 14210000,
          "note": "기본형 (개소세 인하)",
          "exterior_colors": [
            { "name": "스노우 화이트 펄", "code": "SWP", "price": 0 },
            { "name": "오로라 블랙 펄", "code": "ABP", "price": 0 }
          ],
          "interior_colors": [
            { "name": "블랙", "code": "BK", "price": 0 }
          ],
          "options": [
            { "name": "내비게이션 패키지", "price": 600000, "description": "8인치 내비+후방카메라" }
          ]
        }
      ]
    }
  ],
  "available": true,
  "message": ""
}
\`\`\`

위 형식의 JSON 코드 블록만 출력하라. 다른 텍스트는 절대 쓰지 마라.
`

  // 🔥 google_search + url_context 두 도구 동시 사용
  //    google_search: 공식 가격표 페이지 URL 검색
  //    url_context:   찾은 URL을 직접 방문해서 페이지 내용 읽기
  console.log(`🔍 [신차조회] ${brand} ${model} — google_search + url_context 모드`)

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
          temperature: 0.1,
          maxOutputTokens: 65536,
        },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    console.error(`❌ [신차조회] Gemini API 에러: ${errText.substring(0, 500)}`)

    // url_context 미지원 시 google_search만으로 재시도
    if (errText.includes('url_context') || errText.includes('INVALID_ARGUMENT')) {
      console.log(`⚠️ [신차조회] url_context 미지원 — google_search만으로 재시도`)
      return await lookupWithSearchOnly(apiKey, prompt)
    }
    throw new Error(`Gemini API Error: ${errText.substring(0, 300)}`)
  }

  // url_context + google_search 응답 파싱 시도
  try {
    const result = parseGeminiResponse(await response.json())
    console.log(`✅ [신차조회] url_context 모드 성공`)
    return result
  } catch (parseError: any) {
    // JSON 추출 실패 시 google_search만으로 재시도
    console.warn(`⚠️ [신차조회] url_context 모드 JSON 파싱 실패: ${parseError.message}`)
    console.log(`🔄 [신차조회] google_search만으로 재시도...`)
    return await lookupWithSearchOnly(apiKey, prompt)
  }
}

// 🔄 Fallback: google_search만 사용
async function lookupWithSearchOnly(apiKey: string, prompt: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
        },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API Error: ${errText.substring(0, 300)}`)
  }

  return parseGeminiResponse(await response.json())
}

// 📊 Gemini 응답 파싱 — 텍스트에서 JSON 추출
function parseGeminiResponse(data: any) {
  const parts = data.candidates?.[0]?.content?.parts || []
  const rawText = parts
    .filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join('\n')

  if (!rawText) throw new Error('AI 응답이 비어있습니다.')

  console.log(`📝 [신차조회] AI 응답: ${rawText.length}자, ${parts.length}개 파트`)

  // 🔍 그라운딩 메타데이터 로깅
  const groundingMeta = data.candidates?.[0]?.groundingMetadata
  if (groundingMeta) {
    const chunks = groundingMeta.groundingChunks || []
    console.log(`🌐 [그라운딩] 참조 소스 ${chunks.length}개:`)
    chunks.forEach((chunk: any, i: number) => {
      const uri = chunk.web?.uri || ''
      const title = chunk.web?.title || ''
      console.log(`   📎 [${i + 1}] ${title} — ${uri}`)
    })
  }

  // JSON 블록 추출 (여러 패턴 시도)
  const jsonMatch =
    rawText.match(/```json\s*([\s\S]*?)```/) ||
    rawText.match(/```\s*([\s\S]*?)```/) ||
    rawText.match(/(\{[\s\S]*\})/)

  if (!jsonMatch) {
    console.error(`❌ JSON 추출 실패. 응답:\n${rawText.substring(0, 1000)}`)
    throw new Error(`AI 응답에서 JSON을 추출할 수 없습니다.`)
  }

  // JSON 정리 — trailing 콤마 제거
  let jsonStr = jsonMatch[1].trim()
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1')

  try {
    return JSON.parse(jsonStr)
  } catch (parseErr: any) {
    console.warn(`⚠️ [신차조회] JSON 파싱 실패, 복구 시도: ${parseErr.message}`)
    // 잘린 JSON 복구
    let fixed = jsonStr
    const lastComplete = Math.max(
      fixed.lastIndexOf('}],'),
      fixed.lastIndexOf('}]')
    )
    if (lastComplete > 0) {
      fixed = fixed.substring(0, lastComplete + 2)
    }
    const opens = (fixed.match(/\[/g) || []).length
    const closes = (fixed.match(/\]/g) || []).length
    const openBraces = (fixed.match(/\{/g) || []).length
    const closeBraces = (fixed.match(/\}/g) || []).length
    for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}'
    for (let i = 0; i < opens - closes; i++) fixed += ']'
    if (!fixed.trimEnd().endsWith('}')) fixed += '}'
    fixed = fixed.replace(/,\s*([}\]])/g, '$1')
    try {
      const recovered = JSON.parse(fixed)
      console.log(`✅ [신차조회] JSON 복구 성공`)
      return recovered
    } catch (retryErr: any) {
      console.error(`❌ JSON 복구도 실패: ${retryErr.message}\n원본(앞500): ${jsonStr.substring(0, 500)}\n원본(뒤500): ${jsonStr.substring(jsonStr.length - 500)}`)
      throw new Error(`AI 응답 JSON 파싱 실패. 다시 시도해주세요.`)
    }
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { brand, model } = await request.json()

    if (!brand || !model) {
      return NextResponse.json(
        { error: '브랜드와 모델명을 입력해주세요.' },
        { status: 400 }
      )
    }

    console.log(`🔍 [신차조회] ${brand} ${model} — ${MODEL} 가동`)
    const result = await lookupNewCar(brand.trim(), model.trim())
    console.log(`✅ [신차조회] ${result.brand} ${result.model} — 차종 ${result.variants?.length || 0}개`)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('❌ [신차조회] 에러:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { requireAuth } from '../../utils/auth-guard'

// ⚡️ Gemini 2.0 Flash — 신차 정보 조회용 (비용 절감)
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
너는 대한민국 신차 가격 정보 수집 전문가야.
반드시 JSON 코드 블록만 출력해야 하고, 설명이나 사족은 절대 쓰지 마.

★★★ 핵심 규칙: 최대한 다양한 소스를 검색해서 가장 정확하고 최신 데이터를 가져와라 ★★★

[작업 순서 — 반드시 따라라]
1단계: "${brand} ${model}" 가격 정보를 최대한 폭넓게 검색해라.
  - 검색어: "${brand} ${model} 2025 가격표 트림 옵션"
  - 공식 사이트 우선: ${site.url}
  - 공식 사이트에서 못 찾으면 자동차 전문 사이트, 리뷰 사이트, 자동차 커뮤니티 등도 활용
2단계: 여러 소스의 데이터를 교차 검증해서 가장 정확한 현재 판매 가격을 정리해라.
  - 공식 홈페이지 데이터가 있으면 그것을 기준으로 사용
  - 없으면 가장 신뢰할 만한 소스(전문 리뷰, 자동차 매체 등)의 데이터를 활용
  - 중고차 가격, 할인 프로모션 가격은 제외 — 신차 출고가(정가)만 수집
3단계: 추출한 데이터를 아래 JSON 형식으로 정리해라.

[데이터 우선순위]
1순위: 공식 홈페이지 (${site.domain}) 가격표
2순위: 자동차 전문 매체/리뷰 사이트 (예: 오토뷰, 카이즈유, 다나와 등)
3순위: 신뢰할 수 있는 커뮤니티/블로그 (최신 가격표 정리글)
❌ 제외: 중고차 가격, 할인/프로모션, 추측 가격

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
- source: 실제 참조한 주요 소스 URL (공식 홈페이지 또는 참고 사이트)
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
  //    google_search: 다양한 소스에서 가격 정보 검색
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

  const result = recoverTruncatedJson(jsonStr, '신차조회')
  if (!result) {
    throw new Error(`AI 응답 JSON 파싱 실패. 다시 시도해주세요.`)
  }
  return result
}

// 잘린 JSON 복구 함수
function recoverTruncatedJson(str: string, tag: string): any {
  try { return JSON.parse(str) } catch (_) {}

  console.warn(`⚠️ [${tag}] JSON 파싱 실패, 복구 시도`)
  let fixed = str

  // 잘린 문자열 값 처리 — 마지막 불완전 필드 제거
  const patterns = [
    /,\s*"[^"]*":\s*"[^"]*$/, // 잘린 문자열 값
    /,\s*"[^"]*":\s*\d+[^,}\]]*$/, // 잘린 숫자
    /,\s*"[^"]*":\s*$/, // 잘린 키:값
    /,\s*"[^"]*$/, // 잘린 키
    /,\s*\{[^}]*$/, // 잘린 객체
  ]
  for (const pat of patterns) {
    const m = fixed.match(pat)
    if (m && m.index !== undefined) {
      fixed = fixed.substring(0, m.index)
      break
    }
  }

  // 여러 cut point 시도
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
    const opens = (attempt.match(/\[/g) || []).length - (attempt.match(/\]/g) || []).length
    const openBraces = (attempt.match(/\{/g) || []).length - (attempt.match(/\}/g) || []).length
    for (let i = 0; i < openBraces; i++) attempt += '}'
    for (let i = 0; i < opens; i++) attempt += ']'
    if (!attempt.trimEnd().endsWith('}')) attempt += '}'
    attempt = attempt.replace(/,\s*([}\]])/g, '$1')
    try {
      const parsed = JSON.parse(attempt)
      console.log(`✅ [${tag}] JSON 복구 성공 (cutPoint: ${cp})`)
      return parsed
    } catch (_) { continue }
  }

  console.error(`❌ [${tag}] JSON 복구 실패\n원본(앞500): ${str.substring(0, 500)}\n원본(뒤500): ${str.substring(str.length - 500)}`)
  return null
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

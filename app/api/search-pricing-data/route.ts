import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { requireAuth } from '../../utils/auth-guard'

// ⚡️ Gemini 2.0 Flash — 가격 참고 데이터 검색용
const MODEL = 'gemini-2.0-flash'

// 🏷️ 가격 기준 카테고리별 한국어 검색 프롬프트
type PricingCategory = 'depreciation' | 'insurance' | 'maintenance' | 'tax' | 'finance' | 'registration'

interface PricingContext {
  vehicle_type?: string
  vehicle_value?: number
  age?: number
  term_months?: number
  region?: string
}

// ────────────────────────────────────────────────────────────────
// 🔍 카테고리별 검색 프롬프트 생성
// ────────────────────────────────────────────────────────────────
function buildSearchPrompt(category: PricingCategory, context?: PricingContext): string {
  const basePrompt = `
너는 대한민국 자동차 관련 가격 및 기준 정보 검색 전문가야.
공신력 있는 한국 공식 기관, 통계, 세법 자료만 참고해라.
제3자 추정 값이나 부정확한 정보는 절대 사용하지 마.

[검색 결과 반환 형식]
- 찾은 정보를 명확하게 정리하고, 가능하면 구체적인 수치를 포함
- 출처와 참고 URL을 반드시 포함
- 불명확하면 "정보 미확보" 또는 "추가 확인 필요" 명시
- 설명은 간결하고 정확하게 작성`

  switch (category) {
    case 'depreciation':
      return `${basePrompt}

[검색 주제: 감가율 / 잔존가치율]
검색어: "2025년 ${context?.vehicle_type || '자동차'} 중고차 감가율 잔존가치율"
목표:
- 차종별 연식에 따른 잔존가치율(%)
- 공식 통계 기관 데이터 (한국자동차산업협회, 보험회사 등)
- 예상 감가 속도`

    case 'insurance':
      return `${basePrompt}

[검색 주제: 영업용 자동차보험료]
검색어: "영업용 자동차보험 ${context?.vehicle_type || '차종'} 보험료 2025"
추가 조건: 차량가액 ${context?.vehicle_value ? `약 ${Math.round(context.vehicle_value / 1000000)}백만원` : '참고'}
목표:
- 영업용(렌트용) 자동차보험 기본료율
- 차종/배기량별 보험료 비교
- 2025년 최신 보험료 기준`

    case 'maintenance':
      return `${basePrompt}

[검색 주제: 정비비용]
검색어: "${context?.vehicle_type || '자동차'} 정비비용 평균 월 비용 2025"
추가 조건: ${context?.age ? `차량 연식 약 ${context.age}년` : '신차 기준'}
목표:
- 월평균 정비비용 (소모품, 부품 교체 포함)
- 차종별 정비비용 편차
- 영업용 자동차 유지비 기준`

    case 'tax':
      return `${basePrompt}

[검색 주제: 영업용 자동차세]
검색어: "영업용 자동차세 배기량별 세율표 2025 지방세법"
목표:
- 배기량(cc)별 자동차세 금액 (2025 최신)
- 영업용 vs 비영업용 세율 차이
- 환경 등급별 세율 조정`

    case 'finance':
      return `${basePrompt}

[검색 주제: 금융 금리]
검색어: "캐피탈 자동차 담보대출 금리 2025 비교"
추가 조건: ${context?.term_months ? `대출 기간 ${context.term_months}개월 기준` : '표준 기간'}
목표:
- 자동차 캐피탈 금리 범위 (2025)
- 대출 기간별 금리 차이
- 영업용 자동차 금융 조건`

    case 'registration':
      return `${basePrompt}

[검색 주제: 자동차 취득세 및 등록비용]
검색어: "자동차 취득세율 공채매입비율 지역별 2025"
추가 조건: ${context?.region ? `지역: ${context.region}` : '전국 기준'}
목표:
- 자동차 취득세율 (2025)
- 시도별 지역 차이
- 등록 수수료 및 기타 비용`

    default:
      return basePrompt
  }
}

// ────────────────────────────────────────────────────────────────
// 🔍 Gemini 2.0 Flash — google_search 도구로 실시간 검색
// ────────────────────────────────────────────────────────────────
async function searchPricingData(
  category: PricingCategory,
  query: string | undefined,
  context?: PricingContext
) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.')

  const prompt = buildSearchPrompt(category, context)
  const finalQuery = query ? `${prompt}\n\n[추가 검색어]: ${query}` : prompt

  console.log(`🔍 [가격기준검색] ${category} — google_search 모드`)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalQuery }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    console.error(`❌ [가격기준검색] Gemini API 에러: ${errText.substring(0, 500)}`)
    throw new Error(`Gemini API Error: ${errText.substring(0, 300)}`)
  }

  return parseGeminiPricingResponse(await response.json())
}

// 📊 Gemini 응답 파싱 — 텍스트 + 그라운딩 소스 추출
function parseGeminiPricingResponse(data: any) {
  const parts = data.candidates?.[0]?.content?.parts || []
  const rawText = parts
    .filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join('\n')

  if (!rawText) throw new Error('AI 응답이 비어있습니다.')

  console.log(`📝 [가격기준검색] AI 응답: ${rawText.length}자, ${parts.length}개 파트`)

  // 🌐 그라운딩 메타데이터에서 출처 추출
  const sources: string[] = []
  const groundingMeta = data.candidates?.[0]?.groundingMetadata
  if (groundingMeta) {
    const chunks = groundingMeta.groundingChunks || []
    console.log(`🌐 [그라운딩] 참조 소스 ${chunks.length}개:`)
    chunks.forEach((chunk: any, i: number) => {
      const uri = chunk.web?.uri || ''
      const title = chunk.web?.title || ''
      if (uri) {
        sources.push(uri)
        console.log(`   📎 [${i + 1}] ${title} — ${uri}`)
      }
    })
  }

  return {
    results: rawText,
    sources: [...new Set(sources)], // 중복 제거
    searched_at: new Date().toISOString(),
  }
}

// ────────────────────────────────────────────────────────────────
// 🔌 POST 핸들러
// ────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { category, query, context } = await request.json()

    // 카테고리 검증
    const validCategories: PricingCategory[] = [
      'depreciation',
      'insurance',
      'maintenance',
      'tax',
      'finance',
      'registration',
    ]

    if (!category || !validCategories.includes(category)) {
      return NextResponse.json(
        {
          error: `유효한 카테고리를 선택하세요. 허용 값: ${validCategories.join(', ')}`,
        },
        { status: 400 }
      )
    }

    console.log(`🔍 [가격기준검색] ${category} — google_search 가동`)
    const result = await searchPricingData(category, query, context as PricingContext)
    console.log(`✅ [가격기준검색] ${category} — 출처 ${result.sources.length}개`)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('❌ [가격기준검색] 에러:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

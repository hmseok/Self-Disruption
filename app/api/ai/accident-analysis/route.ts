import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// 런타임에만 초기화 (빌드 시 API 키 없어도 통과)
function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// ============================================
// AI 사고 분석 API
// - 예상 과실비율 + 사유
// - 유사 사례/판례 참고
// - 보험사기 의심 포인트
// ============================================

interface AnalysisRequest {
  accidentType: string
  description: string
  faultRatio: number | null
  insuranceCompany: string
  driverRelation: string
  vehicleCondition: string | null
  location: string
  accidentDate: string
  accidentTime: string | null
  counterpartVehicle: string
  counterpartInsurance: string
  jandiRaw: string | null
  notes: string | null
  policeReported: boolean
  estimatedRepairCost: number
}

const ACC_TYPE_KO: Record<string, string> = {
  collision: '충돌', self_damage: '자손사고', hit_and_run: '뺑소니',
  theft: '도난', natural_disaster: '자연재해', vandalism: '파손',
  fire: '화재', other: '기타'
}
const COND_KO: Record<string, string> = {
  minor: '경미', repairable: '수리가능', total_loss: '전손'
}
const REL_KO: Record<string, string> = {
  owner: '본인', family: '가족', employee: '직원', other: '기타'
}

export async function POST(req: NextRequest) {
  try {
    const body: AnalysisRequest = await req.json()

    // Build context string
    const accType = ACC_TYPE_KO[body.accidentType] || body.accidentType || '미상'
    const condition = COND_KO[body.vehicleCondition || ''] || body.vehicleCondition || '미상'
    const relation = REL_KO[body.driverRelation] || body.driverRelation || '미상'

    const contextParts: string[] = [
      `사고유형: ${accType}`,
      `사고일시: ${body.accidentDate || '미상'}${body.accidentTime ? ' ' + body.accidentTime : ''}`,
      `사고장소: ${body.location || '미상'}`,
      `차량상태: ${condition}`,
      `운전자 관계: ${relation}`,
      `보험사: ${body.insuranceCompany || '미상'}`,
      `상대차량: ${body.counterpartVehicle || '없음'}`,
      `상대보험사: ${body.counterpartInsurance || '없음'}`,
      `현재 과실비율: ${body.faultRatio != null ? body.faultRatio + '%' : '미확정'}`,
      `경찰신고: ${body.policeReported ? '예' : '아니오'}`,
      `예상수리비: ${body.estimatedRepairCost ? body.estimatedRepairCost.toLocaleString() + '원' : '미산정'}`,
    ]
    if (body.description) contextParts.push(`사고내용: ${body.description}`)
    if (body.jandiRaw) contextParts.push(`잔디 접수 원문:\n${body.jandiRaw}`)
    if (body.notes) contextParts.push(`메모: ${body.notes}`)

    const systemPrompt = `당신은 대한민국 자동차보험 사고처리 전문가입니다. 보험사 기준의 과실비율 판정, 유사 판례/사례 분석, 보험사기 의심 탐지에 특화되어 있습니다.

응답은 반드시 아래 JSON 형식으로만 해주세요 (다른 텍스트 없이 순수 JSON만):
{
  "faultAnalysis": {
    "estimatedFaultRatio": number (0-100, 우리측 과실비율),
    "confidence": "high" | "medium" | "low",
    "reasoning": "과실비율 판정 사유 (한국 자동차보험 과실비율 인정기준 참고)",
    "keyFactors": ["판정에 영향을 미친 핵심 요소들"],
    "recommendation": "보험사 협상시 참고사항"
  },
  "similarCases": [
    {
      "title": "유사 사례/판례 제목",
      "summary": "요약 (2-3줄)",
      "faultRatio": "해당 사례의 과실비율",
      "relevance": "본 건과의 유사점"
    }
  ],
  "fraudDetection": {
    "riskLevel": "low" | "medium" | "high",
    "riskScore": number (0-100),
    "suspiciousPoints": [
      {
        "point": "의심 포인트",
        "detail": "상세 설명",
        "severity": "low" | "medium" | "high"
      }
    ],
    "recommendation": "조사팀 권고사항"
  },
  "summary": "종합 의견 (3-5줄)"
}`

    const userPrompt = `다음 사고 접수 건을 분석해주세요:\n\n${contextParts.join('\n')}`

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'AI 응답 없음' }, { status: 500 })
    }

    const analysis = JSON.parse(content)
    return NextResponse.json({ success: true, analysis, usage: completion.usage })
  } catch (err: any) {
    console.error('AI 분석 오류:', err)
    return NextResponse.json({ error: err.message || 'AI 분석 실패' }, { status: 500 })
  }
}

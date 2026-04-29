import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'

// ═══════════════════════════════════════════════════════════════
// /api/insurance/ocr
//
// 청약서 이미지/PDF 업로드 → Gemini Vision 으로 필드 추출 → JSON 반환
// 사용자 검토 후 /api/insurance POST 로 저장
//
// 요청: multipart/form-data { file: <PDF or image> }
// 응답: {
//   ok, document_url (optional), confidence,
//   extracted: {
//     insurance_company, design_number, policy_number,
//     vehicle_class, start_date, end_date, total_premium,
//     contract_type, payment_type, installment_count,
//     vehicles: [{ vin, vehicle_label, premium, coverage_note }],
//     schedules: [{ installment_no, due_date, amount }]
//   },
//   raw_text_sample, finish_reason, usage
// }
// ═══════════════════════════════════════════════════════════════

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PROMPT = `당신은 한국 자동차보험/공제 청약서 분석 전문가입니다. 이미지/PDF의 청약서에서 다음 필드를 추출하여 JSON 형식으로 반환해 주세요.

## 추출 필드

\`\`\`json
{
  "insurance_company": "보험사 또는 공제조합 정식명 (예: '전국렌터카공제조합', '삼성화재', 'KB손해보험')",
  "design_number": "설계번호 (KRMA의 'A1112601199701' 같은 형식)",
  "policy_number": "증권번호 (있을 경우, 없으면 null)",
  "vehicle_class": "청약서상 차종 표기 (예: 'EV6 소형A', '아이오닉5 중형')",
  "start_date": "공제기간 시작일 YYYY-MM-DD",
  "end_date": "공제기간 종료일 YYYY-MM-DD",
  "total_premium": 1855410,
  "contract_type": "individual 또는 fleet (단체일 경우 fleet)",
  "payment_type": "lump 또는 installment (분납일 경우 installment)",
  "installment_count": 6,
  "vehicles": [
    {
      "vin": "차대번호 17자 (KRMA 청약서의 '차량번호' 라벨이 실제로는 차대번호임)",
      "vehicle_label": "EV6 소형A",
      "premium": 1855410,
      "coverage_note": "자차 800만 / 대인무한 (담보사항 핵심 요약)"
    }
  ],
  "schedules": [
    { "installment_no": 1, "due_date": "2026-01-06", "amount": 492060 },
    { "installment_no": 2, "due_date": "2026-02-06", "amount": 272670 }
  ],
  "confidence": 95
}
\`\`\`

## 추출 규칙

1. **insurance_company**: 청약서 상단의 보험사/공제조합 로고/명칭. KRMA는 '전국렌터카공제조합'으로 표기
2. **차량번호 (KRMA)**: '차량번호' 라벨이 실제로는 17자 차대번호(VIN). 정확히 읽어주세요
3. **분납 분담금**: 표 형식으로 회차/분납일자/분납분담금 표시. 모든 회차 누락 없이 추출
4. **확실하지 않은 필드는 null**, 추측 금지
5. **금액**: 원 단위 정수 (콤마/원 단위 제거)
6. **날짜**: YYYY-MM-DD 형식 강제 (시간/요일 부분 제거)
7. **단일 차량 청약서 (KRMA 등)**: vehicles 배열에 1건만, contract_type='individual'
8. **단체 청약서**: vehicles 배열에 N건, contract_type='fleet'
9. **confidence**: 본인의 추출 정확도 평가 (0~100). 데이터가 명확하면 ≥90, 일부 불확실하면 60~80

## 응답 형식

순수 JSON 객체만. 마크다운 코드블록 없이.`

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file 필드 필요' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mime = file.type || 'application/pdf'
    if (buffer.byteLength > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기 20MB 초과' }, { status: 400 })
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 60_000)
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mime, data: base64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
          },
        }),
        signal: ctrl.signal,
      })
    } catch (e: any) {
      clearTimeout(timer)
      if (e?.name === 'AbortError') return NextResponse.json({ error: 'Gemini 60초 초과' }, { status: 504 })
      return NextResponse.json({ error: `Gemini 네트워크 오류: ${e?.message || e}` }, { status: 502 })
    }
    clearTimeout(timer)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return NextResponse.json({ error: `Gemini ${res.status}: ${errText.slice(0, 300)}` }, { status: 502 })
    }

    const json = await res.json()
    const parts: any[] = json?.candidates?.[0]?.content?.parts || []
    let text: string = parts.map((p: any) => p?.text || '').join('').trim()
    const finishReason: string | null = json?.candidates?.[0]?.finishReason || null
    const usage: any = json?.usageMetadata || null
    const rawSample = text.slice(0, 500)

    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
    let extracted: any = null
    try {
      const objMatch = text.match(/\{[\s\S]*\}/)
      extracted = objMatch ? JSON.parse(objMatch[0]) : null
    } catch (e: any) {
      console.warn('[insurance/ocr] JSON 파싱 실패:', text.slice(0, 200))
    }

    if (!extracted) {
      return NextResponse.json({
        ok: false,
        error: 'Gemini 응답에서 JSON 추출 실패',
        raw_text_sample: rawSample,
        finish_reason: finishReason,
        usage,
      }, { status: 422 })
    }

    return NextResponse.json({
      ok: true,
      extracted,
      confidence: Number(extracted.confidence) || 0,
      raw_text_sample: rawSample,
      finish_reason: finishReason,
      usage,
    })
  } catch (e: any) {
    console.error('[insurance/ocr]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

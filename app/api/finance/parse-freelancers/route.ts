import { NextRequest, NextResponse } from 'next/server'

// ── Gemini AI로 프리랜서 정보 파싱 ──
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API 키가 설정되지 않았습니다.' }, { status: 500 })
    }

    const { content, mimeType, isText } = await request.json()
    if (!content) {
      return NextResponse.json({ error: '데이터가 없습니다.' }, { status: 400 })
    }

    const prompt = `아래는 프리랜서/용역 인력 관련 데이터입니다. 각 사람의 정보를 JSON 배열로 추출해주세요.

## 추출할 필드
- name: 이름 (필수)
- phone: 연락처 (010-XXXX-XXXX 형식)
- email: 이메일
- bank_name: 은행명 (KB국민은행, 신한은행, 우리은행, 하나은행, NH농협은행, IBK기업은행, 카카오뱅크, 케이뱅크, 토스뱅크 등)
- account_number: 계좌번호
- account_holder: 예금주 (없으면 이름과 동일)
- reg_number: 주민번호 또는 사업자번호
- tax_type: 세금유형 ("사업소득(3.3%)", "기타소득(8.8%)", "세금계산서", "원천징수 없음" 중 택1. 기본: "사업소득(3.3%)")
- service_type: 업종 ("탁송", "대리운전", "정비", "세차", "디자인", "개발", "법무/세무", "기타" 중 택1)
- default_fee: 기본 금액 (숫자만, 쉼표 없이)
- memo: 메모/비고

## 규칙
- 데이터에서 찾을 수 있는 것만 추출. 없는 필드는 빈 문자열 ""
- 반드시 JSON 배열만 반환. 설명 텍스트 없이.
- 한국 데이터입니다.`

    const parts: any[] = []

    if (isText) {
      parts.push({ text: prompt + '\n\n## 데이터\n' + content })
    } else {
      parts.push({ text: prompt })
      parts.push({ inlineData: { mimeType: mimeType || 'image/png', data: content } })
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini API error:', err)
      return NextResponse.json({ error: 'Gemini API 호출 실패', results: [] }, { status: 200 })
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return NextResponse.json({ results: parsed })
    }

    return NextResponse.json({ results: [], raw: text })

  } catch (error: any) {
    console.error('Parse freelancers error:', error)
    return NextResponse.json({ error: error.message, results: [] }, { status: 200 })
  }
}

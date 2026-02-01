import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json()

    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: 'API 키가 없습니다.' }, { status: 500 })
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          // 💡 상세 페이지에 필요한 필드들을 추가 요청
          content: `You are an expert OCR specialist for Korean Vehicle Registration Certificates.
          Extract specific fields accurately.

          RETURN JSON FORMAT:
          {
            "car_number": "12가3456",
            "model_name": "그랜저",
            "vin": "KMH...",
            "owner_name": "홍길동",
            "registration_date": "YYYY-MM-DD",
            "location": "서울 강남구...", (Address)
            "capacity": "5", (승차정원)
            "displacement": "2497", (배기량, numbers only)
            "fuel_type": "휘발유" or "경유" or "LPG",
            "inspection_end_date": "YYYY-MM-DD" (검사유효기간 만료일)
          }`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this document and extract vehicle data." },
            { type: "image_url", image_url: { url: imageBase64 } }
          ]
        }
      ]
    })

    const result = JSON.parse(completion.choices[0].message.content || '{}')
    return NextResponse.json(result)

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
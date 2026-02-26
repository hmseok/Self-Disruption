import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../../utils/auth-guard'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { brand, model } = await request.json()

    if (!brand || !model) {
      return NextResponse.json({ error: '브랜드와 모델명이 필요합니다.' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API 키가 없습니다. (.env.local 확인)' }, { status: 500 })
    }

    console.log(`🎨 [AI 가동] ${brand} ${model} 공식 카탈로그 스타일 생성 중...`)

    const prompt = `Official factory press release photo of the ${brand} ${model}.
    Angle: Front 3/4 view (best angle).
    Background: Clean, soft grey or white studio background with realistic floor reflections.
    Condition: 100% OEM factory stock, standard original grill and wheels. No tuning, no body kits, no futuristic modifications.
    Style: Hyper-realistic, 8k resolution, sharp focus, professional automotive photography, car brochure style.`

    // Gemini Imagen 3 이미지 생성
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '1:1',
          },
        }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      console.error('Gemini Imagen error:', res.status, errText)
      throw new Error(`이미지 생성 실패: ${res.status}`)
    }

    const data = await res.json()
    const base64Image = data.predictions?.[0]?.bytesBase64Encoded
    if (!base64Image) throw new Error("이미지 생성 실패 (데이터 없음)")

    const buffer = Buffer.from(base64Image, 'base64')

    console.log(`✅ [생성 성공] Supabase 저장 시도...`)

    // Supabase 업로드 (안전한 파일명 사용)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // 한글/공백 제거한 안전한 파일명
    const safeFileName = `ai_generated/car_${Date.now()}_${Math.random().toString(36).substring(7)}.png`

    const { error: uploadError } = await supabase.storage
      .from('car_docs')
      .upload(safeFileName, buffer, {
        contentType: 'image/png',
        upsert: true
      })

    if (uploadError) {
      console.error("Supabase Upload Error:", uploadError)
      throw new Error(`저장소 업로드 실패: ${uploadError.message}`)
    }

    // 4. 공개 주소 반환
    const { data: publicUrlData } = supabase.storage
      .from('car_docs')
      .getPublicUrl(safeFileName)

    console.log(`🚀 [최종 완료] ${publicUrlData.publicUrl}`)

    return NextResponse.json({ imageUrl: publicUrlData.publicUrl })

  } catch (error: any) {
    console.error("Server Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
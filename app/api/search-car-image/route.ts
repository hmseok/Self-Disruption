import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { brand, model } = await request.json()

    if (!brand || !model) {
      return NextResponse.json({ error: '브랜드와 모델명이 필요합니다.' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API 키가 없습니다. (.env.local 확인)' }, { status: 500 })
    }

    console.log(`🎨 [AI 가동] ${brand} ${model} 공식 카탈로그 스타일 생성 중...`)

    // 💡 [핵심 수정] 프롬프트를 "공식 브로슈어/프레스킷" 스타일로 강력하게 변경
    // 1. "Official factory press release photo" -> 공식 보도자료 사진
    // 2. "Front 3/4 view" -> 자동차 얼짱 각도 (앞측면)
    // 3. "OEM stock condition" -> 튜닝 없는 순정 상태 강조
    // 4. "Clean studio background" -> 배경 깔끔하게
    const prompt = `Official factory press release photo of the ${brand} ${model}.
    Angle: Front 3/4 view (best angle).
    Background: Clean, soft grey or white studio background with realistic floor reflections.
    Condition: 100% OEM factory stock, standard original grill and wheels. No tuning, no body kits, no futuristic modifications.
    Style: Hyper-realistic, 8k resolution, sharp focus, professional automotive photography, car brochure style.`

    const openai = new OpenAI({ apiKey })
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard", // standard가 더 자연스러운 경우가 많습니다.
    })

    const tempImageUrl = response.data[0].url
    if (!tempImageUrl) throw new Error("이미지 생성 실패 (URL 없음)")

    console.log(`✅ [생성 성공] Supabase 저장 시도...`)

    // 2. 이미지 다운로드
    const imageRes = await fetch(tempImageUrl)
    const imageBlob = await imageRes.blob()
    const buffer = await imageBlob.arrayBuffer()

    // 3. Supabase 업로드 (안전한 파일명 사용)
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
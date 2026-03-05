import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const supabase = getSupabaseAdmin()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, company_id, employee_name').eq('id', user.id).single()
  return profile ? { ...user, role: profile.role, company_id: profile.company_id, employee_name: profile.employee_name } : null
}

// POST: 영수증 이미지 업로드 + OCR 파싱
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 1. Supabase Storage에 이미지 업로드
    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `receipts/${user.company_id}/${user.id}/${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('uploads')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('영수증 업로드 실패:', uploadError)
      return NextResponse.json({ error: '업로드 실패' }, { status: 500 })
    }

    // 공개 URL 생성
    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(fileName)
    const receiptUrl = urlData?.publicUrl || ''

    // 2. OCR 시도 (네이버 CLOVA OCR 또는 Google Vision — 환경변수 체크)
    let ocrResult: any = null

    if (process.env.NAVER_CLOVA_OCR_SECRET && process.env.NAVER_CLOVA_OCR_URL) {
      // 네이버 CLOVA OCR
      try {
        const ocrBody = {
          version: 'V2',
          requestId: `receipt-${Date.now()}`,
          timestamp: Date.now(),
          images: [{ format: ext, name: file.name, data: buffer.toString('base64') }],
        }
        const ocrRes = await fetch(process.env.NAVER_CLOVA_OCR_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-OCR-SECRET': process.env.NAVER_CLOVA_OCR_SECRET,
          },
          body: JSON.stringify(ocrBody),
        })
        if (ocrRes.ok) {
          ocrResult = await ocrRes.json()
        }
      } catch (e) {
        console.warn('OCR 실패, 수동 입력 필요:', e)
      }
    }

    // 3. OCR 결과에서 금액/날짜/가맹점명 추출 시도
    let parsed: {
      merchant?: string
      amount?: number
      date?: string
      card_last4?: string
    } = {}

    if (ocrResult?.images?.[0]?.receipt?.result) {
      const receipt = ocrResult.images[0].receipt.result
      if (receipt.storeInfo?.name?.text) parsed.merchant = receipt.storeInfo.name.text
      if (receipt.totalPrice?.price?.text) {
        parsed.amount = parseInt(receipt.totalPrice.price.text.replace(/[^0-9]/g, '')) || 0
      }
      if (receipt.paymentInfo?.date?.text) parsed.date = receipt.paymentInfo.date.text
      if (receipt.paymentInfo?.cardInfo?.number?.text) {
        const cardNum = receipt.paymentInfo.cardInfo.number.text
        parsed.card_last4 = cardNum.slice(-4)
      }
    } else if (ocrResult?.images?.[0]?.fields) {
      // 일반 OCR 텍스트에서 금액 패턴 추출
      const allText = ocrResult.images[0].fields.map((f: any) => f.inferText).join(' ')
      const amountMatch = allText.match(/(?:합계|총|결제|금액)[:\s]*([0-9,]+)/i)
      if (amountMatch) parsed.amount = parseInt(amountMatch[1].replace(/,/g, '')) || 0

      const dateMatch = allText.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
      if (dateMatch) parsed.date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    }

    return NextResponse.json({
      success: true,
      receipt_url: receiptUrl,
      ocr_parsed: parsed,
      has_ocr: !!ocrResult,
    })
  } catch (e: any) {
    console.error('영수증 OCR 오류:', e.message)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

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

// 버킷 확인 + 없으면 생성
async function ensureBucket(supabase: ReturnType<typeof getSupabaseAdmin>, bucketName: string) {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some(b => b.name === bucketName)
  if (!exists) {
    await supabase.storage.createBucket(bucketName, { public: true, fileSizeLimit: 10 * 1024 * 1024 })
  }
}

// ═══════════════════════════════════════
// Gemini Vision API로 영수증 분석
// ═══════════════════════════════════════
interface ParsedReceipt {
  merchant?: string
  amount?: number
  date?: string
  card_last4?: string
  item_name?: string
  category?: string
  items?: Array<{ name: string; quantity?: number; price?: number }>
  payment_method?: string
  tax?: number
  total_before_tax?: number
}

async function analyzeWithGemini(base64Image: string, mimeType: string): Promise<ParsedReceipt> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 미설정')

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const prompt = `이 이미지는 한국의 영수증/카드전표입니다. 아래 JSON 형식으로 정보를 추출해주세요.
반드시 JSON만 반환하세요. 마크다운 코드블록(백틱)없이 순수 JSON만 응답하세요.

{
  "merchant": "가맹점/사용처 이름",
  "amount": 총결제금액(숫자만),
  "date": "YYYY-MM-DD 형식 날짜",
  "card_last4": "카드번호 뒤 4자리",
  "item_name": "대표 품목명 (여러개면 첫번째)",
  "category": "주유비|충전|주차비|교통비|회식비|접대|식비|야근식대|외근식대|사무용품|택배비|기타 중 하나",
  "items": [{"name": "품목명", "quantity": 수량, "price": 단가}],
  "payment_method": "카드|현금|기타",
  "tax": 부가세금액(숫자, 없으면 0),
  "total_before_tax": 공급가액(숫자, 없으면 0)
}

- amount는 최종 결제 금액 (합계/총액/결제금액)
- 날짜를 찾을 수 없으면 date를 빈 문자열로
- 카드번호가 없으면 card_last4를 빈 문자열로
- category는 사용처와 품목을 보고 가장 적합한 것으로 판단
  (식당/카페/음식점 → 식비, 주유소 → 주유비, 주차장 → 주차비, 술집/룸 → 접대 등)
- 금액이 확실하지 않으면 0으로`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType || 'image/jpeg',
              data: base64Image,
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    console.error('Gemini API 에러:', response.status, errText)
    throw new Error(`Gemini API ${response.status}`)
  }

  const result = await response.json()
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || ''

  // JSON 파싱 (마크다운 코드블록 제거)
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }

  try {
    const parsed = JSON.parse(cleaned)
    return {
      merchant: parsed.merchant || undefined,
      amount: typeof parsed.amount === 'number' ? parsed.amount : parseInt(String(parsed.amount).replace(/[^0-9]/g, '')) || undefined,
      date: parsed.date || undefined,
      card_last4: parsed.card_last4 || undefined,
      item_name: parsed.item_name || undefined,
      category: parsed.category || undefined,
      items: Array.isArray(parsed.items) ? parsed.items : undefined,
      payment_method: parsed.payment_method || undefined,
      tax: typeof parsed.tax === 'number' ? parsed.tax : undefined,
      total_before_tax: typeof parsed.total_before_tax === 'number' ? parsed.total_before_tax : undefined,
    }
  } catch (e) {
    console.warn('Gemini 응답 JSON 파싱 실패:', cleaned)
    // 텍스트에서 기본 정보라도 추출 시도
    const amountMatch = cleaned.match(/amount["\s:]+(\d+)/i)
    const dateMatch = cleaned.match(/(\d{4}-\d{2}-\d{2})/)
    return {
      amount: amountMatch ? parseInt(amountMatch[1]) : undefined,
      date: dateMatch ? dateMatch[1] : undefined,
    }
  }
}

// ═══════════════════════════════════════
// 네이버 CLOVA OCR (폴백용)
// ═══════════════════════════════════════
async function analyzeWithClovaOCR(buffer: Buffer, ext: string, fileName: string): Promise<ParsedReceipt> {
  if (!process.env.NAVER_CLOVA_OCR_SECRET || !process.env.NAVER_CLOVA_OCR_URL) {
    throw new Error('NAVER_CLOVA_OCR 미설정')
  }

  const ocrBody = {
    version: 'V2',
    requestId: `receipt-${Date.now()}`,
    timestamp: Date.now(),
    images: [{ format: ext, name: fileName, data: buffer.toString('base64') }],
  }

  const ocrRes = await fetch(process.env.NAVER_CLOVA_OCR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OCR-SECRET': process.env.NAVER_CLOVA_OCR_SECRET,
    },
    body: JSON.stringify(ocrBody),
  })

  if (!ocrRes.ok) throw new Error(`CLOVA OCR ${ocrRes.status}`)
  const ocrResult = await ocrRes.json()

  const parsed: ParsedReceipt = {}

  if (ocrResult?.images?.[0]?.receipt?.result) {
    const receipt = ocrResult.images[0].receipt.result
    if (receipt.storeInfo?.name?.text) parsed.merchant = receipt.storeInfo.name.text
    if (receipt.totalPrice?.price?.text) {
      parsed.amount = parseInt(receipt.totalPrice.price.text.replace(/[^0-9]/g, '')) || 0
    }
    if (receipt.paymentInfo?.date?.text) parsed.date = receipt.paymentInfo.date.text
    if (receipt.paymentInfo?.cardInfo?.number?.text) {
      parsed.card_last4 = receipt.paymentInfo.cardInfo.number.text.slice(-4)
    }
  } else if (ocrResult?.images?.[0]?.fields) {
    const allText = ocrResult.images[0].fields.map((f: any) => f.inferText).join(' ')
    const amountMatch = allText.match(/(?:합계|총|결제|금액|Total)[:\s]*([0-9,]+)/i)
    if (amountMatch) parsed.amount = parseInt(amountMatch[1].replace(/,/g, '')) || 0
    const dateMatch = allText.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
    if (dateMatch) parsed.date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
  }

  return parsed
}

// ═══════════════════════════════════════
// POST: 영수증 이미지 업로드 + AI 분석
// 우선순위: Gemini > CLOVA OCR > 수동입력
// ═══════════════════════════════════════
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
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const ext = file.name.split('.').pop() || 'jpg'

    // 1. Supabase Storage에 이미지 업로드 (실패해도 계속 진행)
    let receiptUrl = ''
    const bucketName = 'receipts'
    const fileName = `${user.company_id}/${user.id}/${Date.now()}.${ext}`

    try {
      await ensureBucket(supabase, bucketName)
      const { error: uploadError } = await supabase
        .storage.from(bucketName)
        .upload(fileName, buffer, { contentType: file.type, upsert: false })

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName)
        receiptUrl = urlData?.publicUrl || ''
      } else {
        console.warn('Storage 업로드 실패 (계속 진행):', uploadError.message)
      }
    } catch (storageErr: any) {
      console.warn('Storage 접근 실패 (계속 진행):', storageErr.message)
    }

    // 2. AI 분석: Gemini 우선, 실패 시 CLOVA OCR 폴백
    let parsed: ParsedReceipt = {}
    let ocrEngine = 'none'

    // 2-1. Gemini Vision API 시도
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
    if (geminiKey) {
      try {
        parsed = await analyzeWithGemini(base64, file.type)
        ocrEngine = 'gemini'
        console.log('✅ Gemini 분석 성공:', JSON.stringify(parsed).slice(0, 200))
      } catch (e: any) {
        console.warn('⚠️ Gemini 분석 실패, CLOVA 폴백 시도:', e.message)
      }
    }

    // 2-2. Gemini 실패 시 CLOVA OCR 폴백
    if (ocrEngine === 'none' && (process.env.NAVER_CLOVA_OCR_SECRET && process.env.NAVER_CLOVA_OCR_URL)) {
      try {
        parsed = await analyzeWithClovaOCR(buffer, ext, file.name)
        ocrEngine = 'clova'
        console.log('✅ CLOVA OCR 분석 성공')
      } catch (e: any) {
        console.warn('⚠️ CLOVA OCR도 실패, 수동 입력 필요:', e.message)
      }
    }

    return NextResponse.json({
      success: true,
      receipt_url: receiptUrl,
      ocr_parsed: parsed,
      ocr_engine: ocrEngine,
      has_ocr: ocrEngine !== 'none',
    })
  } catch (e: any) {
    console.error('영수증 분석 오류:', e.message)
    return NextResponse.json({
      success: true,
      receipt_url: '',
      ocr_parsed: {},
      ocr_engine: 'none',
      has_ocr: false,
    })
  }
}

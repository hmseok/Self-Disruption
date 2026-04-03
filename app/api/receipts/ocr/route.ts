import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const userId = getUserIdFromToken(token)
  if (!userId) return null
  const profiles = await prisma.$queryRaw<any[]>`SELECT role, employee_name FROM profiles WHERE id = ${userId} LIMIT 1`
  const profile = profiles[0]
  return profile ? { id: userId, role: profile.role, employee_name: profile.employee_name } : null
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

// 날짜 보정: 년도가 없거나 미래 날짜이면 가장 가까운 과거 날짜로 조정
function fixDate(dateStr?: string): string | undefined {
  if (!dateStr) return undefined

  const today = new Date()
  today.setHours(23, 59, 59, 999) // 오늘까지 허용

  // MM-DD만 있는 경우 (년도 없음)
  const mdOnly = dateStr.match(/^(\d{1,2})[.\-/](\d{1,2})$/)
  if (mdOnly) {
    const month = parseInt(mdOnly[1])
    const day = parseInt(mdOnly[2])
    // 올해로 먼저 시도, 미래면 작년
    let year = today.getFullYear()
    const candidate = new Date(year, month - 1, day)
    if (candidate > today) year--
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // YYYY-MM-DD 형식
  const full = dateStr.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (full) {
    let year = parseInt(full[1])
    const month = parseInt(full[2])
    const day = parseInt(full[3])
    const candidate = new Date(year, month - 1, day)

    // 미래 날짜 → 가장 가까운 과거 년도로
    while (candidate > today) {
      year--
      candidate.setFullYear(year)
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return dateStr
}

function normalizeReceiptItem(raw: any): ParsedReceipt {
  return {
    merchant: raw.merchant || undefined,
    amount: typeof raw.amount === 'number' ? raw.amount : parseInt(String(raw.amount).replace(/[^0-9-]/g, '')) || undefined,
    date: fixDate(raw.date),
    card_last4: raw.card_last4 || undefined,
    item_name: raw.item_name || undefined,
    category: raw.category || undefined,
    items: Array.isArray(raw.items) ? raw.items : undefined,
    payment_method: raw.payment_method || undefined,
    tax: typeof raw.tax === 'number' ? raw.tax : undefined,
    total_before_tax: typeof raw.total_before_tax === 'number' ? raw.total_before_tax : undefined,
  }
}

async function analyzeWithGemini(base64Image: string, mimeType: string): Promise<{ items: ParsedReceipt[]; isMulti: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 미설정')

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const prompt = `이 이미지는 한국의 영수증, 카드전표, 또는 카드 사용내역 캡처입니다.

## 중요 규칙
- 이미지에 거래가 1건이면 JSON 객체 1개를, 여러 건이면 JSON 배열로 반환하세요.
- 마크다운 코드블록(백틱) 없이 순수 JSON만 응답하세요.
- 마이너스(-) 금액이나 "가승인" 항목도 포함하세요.
- 날짜에 년도가 보이지 않으면 "MM-DD" 형식으로만 반환하세요 (년도 추측 금지).
- 미래 날짜는 절대 사용하지 마세요. 오늘은 ${new Date().toISOString().slice(0, 10)}입니다.

## 단건 형식 (영수증 1장)
{
  "merchant": "가맹점/사용처 이름",
  "amount": 총결제금액(숫자),
  "date": "YYYY-MM-DD",
  "card_last4": "카드번호 뒤 4자리",
  "item_name": "대표 품목명",
  "category": "주유비|충전|주차비|교통비|회식비|접대|식비|야근식대|외근식대|사무용품|택배비|기타",
  "items": [{"name": "품목명", "quantity": 수량, "price": 단가}],
  "payment_method": "카드|현금|기타",
  "tax": 부가세(숫자, 없으면 0),
  "total_before_tax": 공급가액(숫자, 없으면 0)
}

## 다건 형식 (카드내역 캡처 등)
[
  {"merchant": "...", "amount": ..., "date": "...", "card_last4": "...", "item_name": "...", "category": "...", "items": [], "payment_method": "카드", "tax": 0, "total_before_tax": 0},
  ...
]

## 카테고리 판단 기준
- 식당/카페/음식점 → 식비
- 주유소 → 주유비
- 주차장 → 주차비
- 택시/버스 → 교통비
- 전기충전 → 충전
- 우체국/택배 → 택배비
- 술집/룸/유흥 → 접대
- 기타 → 기타`

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
        maxOutputTokens: 8192,
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

    // 배열인 경우 → 다건 처리
    if (Array.isArray(parsed)) {
      const items = parsed.map(normalizeReceiptItem).filter(item => item.amount && item.amount !== 0)
      console.log(`✅ Gemini 다건 분석 성공: ${items.length}건`)
      return { items, isMulti: true }
    }

    // 단건 객체
    const item = normalizeReceiptItem(parsed)
    console.log('✅ Gemini 단건 분석 성공:', JSON.stringify(item).slice(0, 200))
    return { items: [item], isMulti: false }
  } catch (e) {
    // JSON이 잘려서 파싱 실패 → 부분 복구 시도
    console.warn('Gemini JSON 파싱 실패, 부분 복구 시도')

    // 잘린 배열에서 완전한 객체들만 추출
    const objectPattern = /\{[^{}]*"merchant"\s*:\s*"[^"]*"[^{}]*"amount"\s*:\s*-?\d+[^{}]*\}/g
    const matches = cleaned.match(objectPattern)

    if (matches && matches.length > 0) {
      const items: ParsedReceipt[] = []
      for (const m of matches) {
        try {
          const obj = JSON.parse(m)
          const item = normalizeReceiptItem(obj)
          if (item.amount) items.push(item)
        } catch { /* 개별 객체 파싱 실패 → 스킵 */ }
      }
      if (items.length > 0) {
        console.log(`✅ Gemini 부분 복구 성공: ${items.length}건`)
        return { items, isMulti: items.length > 1 }
      }
    }

    // 최후 수단: 정규식으로 기본 정보 추출
    const amountMatch = cleaned.match(/amount["\s:]+(-?\d+)/i)
    const dateMatch = cleaned.match(/(\d{4}-\d{2}-\d{2})/)
    const merchantMatch = cleaned.match(/merchant["\s:]+["']([^"']+)["']/i)
    return {
      items: [{
        amount: amountMatch ? parseInt(amountMatch[1]) : undefined,
        date: dateMatch ? dateMatch[1] : undefined,
        merchant: merchantMatch ? merchantMatch[1] : undefined,
      }],
      isMulti: false,
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

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const ext = file.name.split('.').pop() || 'jpg'

    // 1. TODO: Phase 4 - migrate to Google Cloud Storage
    let receiptUrl = ''
    // const bucketName = 'receipts'
    // const fileName = `${user.id}/${Date.now()}.${ext}`
    // Google Cloud Storage upload would go here
    console.log('Receipt image received but storage migration pending:', file.name)

    // 2. AI 분석: Gemini 우선, 실패 시 CLOVA OCR 폴백
    let parsedItems: ParsedReceipt[] = []
    let ocrEngine = 'none'
    let isMulti = false

    // 2-1. Gemini Vision API 시도
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
    if (geminiKey) {
      try {
        const geminiResult = await analyzeWithGemini(base64, file.type)
        parsedItems = geminiResult.items
        isMulti = geminiResult.isMulti
        ocrEngine = 'gemini'
      } catch (e: any) {
        console.warn('⚠️ Gemini 분석 실패, CLOVA 폴백 시도:', e.message)
      }
    }

    // 2-2. Gemini 실패 시 CLOVA OCR 폴백
    if (ocrEngine === 'none' && (process.env.NAVER_CLOVA_OCR_SECRET && process.env.NAVER_CLOVA_OCR_URL)) {
      try {
        const clovaResult = await analyzeWithClovaOCR(buffer, ext, file.name)
        parsedItems = [clovaResult]
        ocrEngine = 'clova'
        console.log('✅ CLOVA OCR 분석 성공')
      } catch (e: any) {
        console.warn('⚠️ CLOVA OCR도 실패, 수동 입력 필요:', e.message)
      }
    }

    // 다건: ocr_parsed_items 배열로 반환 / 단건: 기존 호환 ocr_parsed도 함께 반환
    const firstItem = parsedItems[0] || {}

    return NextResponse.json({
      success: true,
      receipt_url: receiptUrl,
      ocr_parsed: firstItem,                    // 하위 호환
      ocr_parsed_items: parsedItems,             // 다건 지원
      ocr_engine: ocrEngine,
      has_ocr: ocrEngine !== 'none',
      is_multi: isMulti,
      item_count: parsedItems.length,
    })
  } catch (e: any) {
    console.error('영수증 분석 오류:', e.message)
    return NextResponse.json({
      success: true,
      receipt_url: '',
      ocr_parsed: {},
      ocr_parsed_items: [],
      ocr_engine: 'none',
      has_ocr: false,
      is_multi: false,
      item_count: 0,
    })
  }
}

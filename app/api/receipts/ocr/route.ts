import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

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
  // amount 정규화 — 0 / NaN 만 undefined, 음수(승인취소)는 통과
  let amt: number | undefined
  if (typeof raw.amount === 'number' && Number.isFinite(raw.amount) && raw.amount !== 0) {
    amt = raw.amount
  } else if (raw.amount !== null && raw.amount !== undefined) {
    const parsed = parseInt(String(raw.amount).replace(/[^0-9-]/g, ''))
    amt = Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined
  }
  return {
    merchant: raw.merchant || undefined,
    amount: amt,
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

  // 2.5 Flash: 2.0 와 동일 가격대인데 추론 정확도/속도 모두 향상.
  // 2026-04 기준 GA. 환경변수로 다운그레이드 가능.
  const model = process.env.GEMINI_MODEL_OCR || process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const prompt = `이 이미지는 한국의 영수증, 카드전표, 또는 **카드앱/은행앱 사용내역 스크린샷** 중 하나입니다.

## 중요 규칙
- 이미지에 거래가 1건이면 JSON 객체 1개를, 여러 건이면 JSON 배열로 반환하세요.
- 마크다운 코드블록(백틱) 없이 순수 JSON만 응답하세요.
- **승인 거래와 승인취소(가승인취소 / 취소) 거래 모두 결과에 포함**하세요. 회계 정합성을 위해 +금액과 -금액 모두 저장합니다.
- 날짜에 년도가 보이지 않으면 "MM-DD" 형식으로만 반환하세요 (년도 추측 금지).
- 미래 날짜는 절대 사용하지 마세요. 오늘은 ${new Date().toISOString().slice(0, 10)}입니다.
- **카드앱 스크린샷**: "IBK컴퍼니카드7957" 같은 텍스트에서 뒤 4자리(7957)를 card_last4로 추출하세요.
- 금액에 "원" 표시나 콤마는 제거하고 숫자만 넣으세요.
- **금액을 명확히 식별할 수 없으면 그 거래를 결과에서 제외**하세요. amount=0 으로 저장하지 마세요.
- 동일 이미지에 여러 거래가 목록으로 보이면 **반드시 배열**로 모든 건을 추출하세요.

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

## 다건 형식 (카드앱 사용내역 캡처 등)
[
  {"merchant": "테슬라코리아", "amount": 150000, "date": "2026-04-15", "card_last4": "7957", "item_name": "충전", "category": "충전", "items": [], "payment_method": "카드", "tax": 0, "total_before_tax": 0},
  ...
]

## 카테고리 판단 기준
- 식당/카페/음식점/더벤티/스타벅스/이디야/투썸 → 식비
- 주유소/SK에너지/GS칼텍스/현대오일뱅크 → 주유비
- 주차장/파킹 → 주차비
- 택시/카카오T/버스/지하철 → 교통비
- 전기충전/테슬라/차지인프라 → 충전
- 우체국/CJ대한통운/한진택배 → 택배비
- 술집/룸/유흥/노래방 → 접대
- 감자탕/삼겹살/고기집/회식 → 회식비
- 기타 → 기타`

  const requestBody = JSON.stringify({
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
  })

  // 429 rate limit 재시도 — Retry-After 헤더 우선, 최대 2회만 재시도 후 폴백
  //   (앱 전체에서 30+ 라우트가 같은 키 공유 → 한도 회복까지 길게 기다리는 건 무의미)
  let response: Response | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 45000) // 45초 타임아웃
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller.signal,
      })
    } catch (fetchErr: any) {
      clearTimeout(timeoutId)
      if (fetchErr.name === 'AbortError') {
        throw new Error('Gemini API 응답 시간 초과 (45초). 이미지 크기를 줄이거나 다시 시도해주세요.')
      }
      throw fetchErr
    }
    clearTimeout(timeoutId)
    if (response.status !== 429) break
    // Retry-After 헤더(초) 우선, 없으면 5/15초
    const retryAfterHeader = response.headers.get('retry-after')
    const headerSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN
    const waitSec = !isNaN(headerSec) && headerSec > 0
      ? Math.min(headerSec, 30) // 최대 30초로 캡
      : (attempt === 0 ? 5 : 15)
    console.warn(`Gemini 429, ${waitSec}초 대기 후 재시도 (${attempt + 1}/2)`)
    await new Promise(r => setTimeout(r, waitSec * 1000))
  }

  if (!response || !response.ok) {
    const errText = response ? await response.text() : 'No response'
    console.error('Gemini API 에러:', response?.status, errText)
    let detail = ''
    try {
      const errJson = JSON.parse(errText)
      detail = errJson?.error?.message || ''
    } catch { detail = errText.slice(0, 200) }
    if (detail.includes('API key not valid')) detail = 'API 키가 유효하지 않습니다. Cloud Run 환경변수의 GEMINI_API_KEY를 확인하세요.'
    // 429 는 prefix RATE_LIMIT 으로 표시 — 클라이언트가 큐 일시정지에 사용
    if (response?.status === 429) {
      throw new Error('RATE_LIMIT:Gemini API 요청 한도 초과. 5분 후 다시 시도하세요.')
    }
    throw new Error(`Gemini API ${response?.status}: ${detail}`)
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

    // 배열인 경우 → 다건 처리. amount 0 만 제외 (음수=승인취소는 저장)
    if (Array.isArray(parsed)) {
      const items = parsed
        .map(normalizeReceiptItem)
        .filter(item => typeof item.amount === 'number' && item.amount !== 0)
      console.log(`✅ Gemini 다건 분석 성공: ${items.length}건`)
      return { items, isMulti: true }
    }

    // 단건 객체 — amount 누락/0 만 빈 배열, 음수는 통과
    const item = normalizeReceiptItem(parsed)
    console.log('✅ Gemini 단건 분석 성공:', JSON.stringify(item).slice(0, 200))
    if (typeof item.amount !== 'number' || item.amount === 0) {
      console.warn('⚠️ amount 누락/0 → 영수증 저장 제외')
      return { items: [], isMulti: false }
    }
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

    // 이미지 크기 로그 (디버그)
    const fileSizeKB = Math.round(buffer.length / 1024)
    const base64SizeKB = Math.round(base64.length / 1024)
    console.log(`📸 영수증 이미지: ${file.name} (${fileSizeKB}KB, base64: ${base64SizeKB}KB, type: ${file.type})`)

    let receiptUrl = ''

    // 2. AI 분석: Gemini 우선, 실패 시 CLOVA OCR 폴백
    let parsedItems: ParsedReceipt[] = []
    let ocrEngine = 'none'
    let isMulti = false
    let failReason: string | undefined
    let rateLimited = false

    // 2-1. Gemini Vision API 시도
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
    if (!geminiKey) {
      failReason = 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다. Cloud Run 환경변수를 확인해주세요.'
      console.warn('⚠️', failReason)
    } else {
      try {
        const geminiResult = await analyzeWithGemini(base64, file.type)
        parsedItems = geminiResult.items
        isMulti = geminiResult.isMulti
        ocrEngine = 'gemini'
        if (parsedItems.length === 0) {
          failReason = 'Gemini가 응답했으나 영수증 데이터를 추출하지 못했습니다 (이미지 품질 확인 필요).'
        }
      } catch (e: any) {
        // RATE_LIMIT prefix 면 별도 분기 — 클라이언트에 명시적 시그널
        if (typeof e.message === 'string' && e.message.startsWith('RATE_LIMIT:')) {
          rateLimited = true
          failReason = e.message.replace('RATE_LIMIT:', '')
        } else {
          failReason = `Gemini API 오류: ${e.message}`
        }
        console.warn('⚠️ Gemini 분석 실패, CLOVA 폴백 시도:', e.message)
      }
    }

    // 2-2. Gemini 실패/미설정 시 CLOVA OCR 폴백
    if (ocrEngine === 'none' && (process.env.NAVER_CLOVA_OCR_SECRET && process.env.NAVER_CLOVA_OCR_URL)) {
      try {
        const clovaResult = await analyzeWithClovaOCR(buffer, ext, file.name)
        parsedItems = [clovaResult]
        ocrEngine = 'clova'
        failReason = undefined
        console.log('✅ CLOVA OCR 분석 성공')
      } catch (e: any) {
        failReason = `Gemini 실패 + CLOVA OCR 실패: ${e.message}`
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
      fail_reason: failReason,
      rate_limited: rateLimited,                 // 429: 클라이언트가 큐 일시정지
    })
  } catch (e: any) {
    console.error('영수증 분석 오류:', e.message)
    return NextResponse.json({
      success: false,
      error: e.message,
      receipt_url: '',
      ocr_parsed: {},
      ocr_parsed_items: [],
      ocr_engine: 'none',
      has_ocr: false,
      is_multi: false,
      item_count: 0,
      fail_reason: `서버 처리 오류: ${e.message}`,
    }, { status: 500 })
  }
}

/**
 * /api/ride-settlements/upload
 *
 * POST — 정산서 엑셀 업로드 + 양식 자동 감지 + multi-sheet 자동 split
 *
 * 입력 (multipart):
 *   file: .xlsx
 *   customer_id?: string         (수동 지정 — 자동 추정 무시)
 *   period_label?: string         (예: '2026-04')
 *   layout?: 'auto' | 'meritz' | 'im' | 'mg' | 'ride-integrated'
 *   mode: 'preview' | 'apply'
 *
 * 양식 자동 감지 시그니처:
 *   meritz          — "정비비 정산 대상 리스트" 시트 + 정비코드(Platinum) + 마감사유
 *   im              — "마감자료" + Self/Premium/Select + 시리즈
 *   mg              — "총합/턴키/실비(콜센터)/차량 운행 여부" + 임차인명
 *   ride-integrated — "구분표" 시트 + 다중 위탁사 시트 (multi-split)
 *
 * PR-6.11.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import * as XLSX from 'xlsx'
import { logAuditAction } from '@/lib/audit-log'

type Cell = string | number | null | undefined
type Layout = 'meritz' | 'im' | 'mg' | 'ride-integrated' | 'unknown'

// ─── 시그니처 검사 ────────────────────────────────────────────────
function detectLayout(wb: XLSX.WorkBook): Layout {
  const sheets = wb.SheetNames
  // ride-integrated: 구분표 + 다중 위탁사 시트
  if (sheets.includes('구분표')) return 'ride-integrated'
  // mg: 총합 + 턴키 + 실비(콜센터)
  if (
    sheets.includes('총합') &&
    sheets.some(s => s.startsWith('턴키')) &&
    sheets.some(s => s.includes('실비'))
  )
    return 'mg'
  // meritz: 정비비 정산 대상 리스트
  if (sheets.some(s => s.includes('정비비 정산 대상')) || sheets.some(s => s.includes('정비비 정산'))) {
    return 'meritz'
  }
  // im: 마감자료 + 요약
  if (sheets.includes('마감자료')) return 'im'
  return 'unknown'
}

// ─── 위탁사명 추정 (파일명) ──────────────────────────────────────
function suggestCustomer(name: string): string | null {
  const lower = name.toLowerCase()
  const candidates: { keyword: string; matchKeys: string[] }[] = [
    { keyword: 'iM캐피탈', matchKeys: ['im캐피', '정비위탁내역', 'imcapital'] },
    { keyword: '메리츠캐피탈', matchKeys: ['메리츠', 'meritz', '3월마감', '4월마감 라이드'] },
    { keyword: 'MG캐피탈', matchKeys: ['mg캐피', '정비비 정산세부자료', '정산세부자료'] },
    { keyword: '우리금융캐피탈', matchKeys: ['우리금융', '라이드_25', '라이드_26'] },
    { keyword: 'JB우리캐피탈', matchKeys: ['jb우리'] },
    { keyword: 'BNK캐피탈', matchKeys: ['bnk'] },
    { keyword: '퍼시픽렌터카', matchKeys: ['퍼시픽'] },
    { keyword: '케이카', matchKeys: ['케이카', 'k car'] },
    { keyword: '삼성카드', matchKeys: ['삼성카드', '삼성'] },
  ]
  for (const c of candidates) {
    for (const m of c.matchKeys) {
      if (lower.includes(m.toLowerCase())) return c.keyword
    }
  }
  return null
}

// ─── 시트명 → 위탁사명 매핑 (ride-integrated multi-split) ────────
function customerFromSheetName(sheet: string): { name: string | null; category: string } {
  // 카테고리 시트
  if (sheet === '정비비') return { name: null, category: '정비비' }
  if (sheet === '사고비') return { name: null, category: '사고비' }
  if (sheet === '테슬라 사고비') return { name: null, category: '테슬라사고비' }
  if (sheet === '정기검사') return { name: null, category: '정기검사' }
  if (sheet === '구분표' || sheet === 'Sheet1' || sheet === '요약' || sheet === '총합')
    return { name: null, category: '_skip' }
  if (sheet.includes('차량 운행')) return { name: null, category: '_vehicle_status' }
  // 위탁사 시트
  const lower = sheet.toLowerCase()
  const candidates = [
    { keyword: '우리금융캐피탈', matchKeys: ['우리금융', '우리금융캐피'] },
    { keyword: 'JB우리캐피탈', matchKeys: ['jb우리'] },
    { keyword: 'BNK캐피탈', matchKeys: ['bnk'] },
    { keyword: '퍼시픽렌터카', matchKeys: ['퍼시픽'] },
    { keyword: '케이카', matchKeys: ['케이카', 'k car'] },
    { keyword: '삼성카드', matchKeys: ['삼성'] },
    { keyword: 'iM캐피탈', matchKeys: ['im캐피'] },
    { keyword: '메리츠캐피탈', matchKeys: ['메리츠'] },
    { keyword: 'MG캐피탈', matchKeys: ['mg'] },
  ]
  for (const c of candidates) {
    for (const m of c.matchKeys) {
      if (lower.includes(m.toLowerCase())) return { name: c.keyword, category: '위탁사정산' }
    }
  }
  return { name: sheet, category: '위탁사정산' }
}

// ─── 헤더 row index 자동 감지 (헤더 위 메타 row 들 skip) ──────────
function findHeaderRow(rows: Cell[][], keywords: string[]): number {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = (rows[i] || []).map(c => String(c ?? '').trim())
    let matches = 0
    for (const kw of keywords) {
      if (row.some(c => c === kw || c.startsWith(kw))) matches++
    }
    if (matches >= 2) return i
  }
  return 0
}

function trimStr(v: Cell): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

function num(v: Cell): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ─── 메리츠 파서 ─────────────────────────────────────────────────
function parseMeritz(ws: XLSX.WorkSheet): { headers: string[]; items: Record<string, unknown>[] } {
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: null, raw: false })
  const headerIdx = findHeaderRow(rows, ['실행번호', '차량번호', '차종'])
  const headers = (rows[headerIdx] || []).map(c => String(c ?? '').trim())
  const dataRows = rows.slice(headerIdx + 1).filter(r =>
    r.some(v => v !== null && v !== undefined && String(v).trim() !== '')
  )
  const idx = (h: string) => headers.findIndex(x => x === h)
  const items: Record<string, unknown>[] = []
  for (const r of dataRows) {
    const get = (h: string) => {
      const i = idx(h)
      return i >= 0 ? trimStr(r[i]) : null
    }
    if (!get('실행번호') && !get('차량번호')) continue
    items.push({
      exec_no: get('실행번호'),
      car_number: get('차량번호'),
      car_model: get('차종'),
      vin: get('차대번호'),
      cust_name: get('거래처명'),
      product_name: get('정비코드'),
      total_amount: num(get('정비비총액(비용)')),
      payment_amount: num(get('지급처리금액')),
      exec_date: get('실행일자'),
      loan_end_date: get('여신만기일자'),
      closing_date: get('마감일자'),
      termination_date: get('해지일자'),
      exec_status: get('실행상태'),
      exec_reason: get('실행사유'),
      closing_reason: get('마감사유'),
      installment_no: num(get('정산회차')),
      raw_extra: { layout: 'meritz', period: get('지급년월'), processor: get('지급처') },
    })
  }
  return { headers, items }
}

// ─── iM 파서 ──────────────────────────────────────────────────────
function parseIm(ws: XLSX.WorkSheet): { headers: string[]; items: Record<string, unknown>[] } {
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: null, raw: false })
  const headerIdx = findHeaderRow(rows, ['차량번호', '상품명'])
  const headers = (rows[headerIdx] || []).map(c => String(c ?? '').trim())
  const dataRows = rows.slice(headerIdx + 1).filter(r =>
    r.some(v => v !== null && v !== undefined && String(v).trim() !== '')
  )
  const idx = (h: string) => headers.findIndex(x => x === h)
  const items: Record<string, unknown>[] = []
  for (const r of dataRows) {
    const get = (h: string) => {
      const i = idx(h)
      return i >= 0 ? trimStr(r[i]) : null
    }
    if (!get('차량번호')) continue
    items.push({
      car_number: get('차량번호'),
      car_model: get('시리즈'),
      product_name: get('상품명'),
      total_amount: num(get('확정금액')),
      exec_date: get('계약시작일'),
      loan_end_date: get('계약종료일'),
      raw_extra: { layout: 'im', note: get('비고') },
    })
  }
  return { headers, items }
}

// ─── MG 파서 (턴키 / 실비 시트) ──────────────────────────────────
function parseMgSheet(
  ws: XLSX.WorkSheet,
  category: string
): { headers: string[]; items: Record<string, unknown>[] } {
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: null, raw: false })
  const headerIdx = findHeaderRow(rows, ['실행번호', '차량번호', '임차인명'])
  const headers = (rows[headerIdx] || []).map(c => String(c ?? '').trim())
  const dataRows = rows.slice(headerIdx + 1).filter(r =>
    r.some(v => v !== null && v !== undefined && String(v).trim() !== '')
  )
  const idx = (h: string) => headers.findIndex(x => x === h)
  const items: Record<string, unknown>[] = []
  for (const r of dataRows) {
    const get = (h: string) => {
      const i = idx(h)
      return i >= 0 ? trimStr(r[i]) : null
    }
    if (!get('실행번호') && !get('차량번호')) continue
    if (get('차량번호')?.startsWith('합계')) continue
    items.push({
      exec_no: get('실행번호'),
      car_number: get('차량번호'),
      car_model: get('차종'),
      cust_name: get('정산처명'),
      sub_customer: get('임차인명'),
      product_name: category, // 턴키 / 실비
      base_fee: num(get('(약정)\n관리비용') || get('(약정)관리비용')),
      additional_fee: num(get('(약정)\n사고면책수수료') || get('(약정)사고면책수수료')),
      supply_amount: num(get('공급가액')),
      vat_amount: num(get('부가세')),
      total_amount: num(get('합계')),
      exec_date: get('실행일자'),
      installment_no: num(get('정산회차')),
      installment_total: num(get('총정산회차')),
      installments_remaining: num(get('잔여회차')),
      raw_extra: {
        layout: 'mg',
        category,
        면책금: get('면책금'),
        약정월: get('약정월'),
        세금계산서일자: get('세금계산서 \n일자') || get('세금계산서 일자'),
      },
    })
  }
  return { headers, items }
}

// ─── ride-integrated 파서 (위탁사별 시트) ──────────────────────────
function parseRideIntegrated(
  ws: XLSX.WorkSheet,
  category: string
): { headers: string[]; items: Record<string, unknown>[]; vehicleStatus?: { car_number: string; status: string }[] } {
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: null, raw: false })
  const headerIdx = findHeaderRow(rows, ['차량번호', '차종', '차량모델명'])
  const headers = (rows[headerIdx] || []).map(c => String(c ?? '').trim())
  const dataRows = rows.slice(headerIdx + 1).filter(r =>
    r.some(v => v !== null && v !== undefined && String(v).trim() !== '')
  )
  const idx = (h: string) => headers.findIndex(x => x === h)
  const items: Record<string, unknown>[] = []
  for (const r of dataRows) {
    const get = (h: string) => {
      const i = idx(h)
      return i >= 0 ? trimStr(r[i]) : null
    }
    if (!get('차량번호')) continue
    items.push({
      exec_no: get('대출번호') || get('실행번호') || get('서비스번호'),
      car_number: get('차량번호'),
      car_model: get('차명확인') || get('차종') || get('차량모델명'),
      vin: get('차대번호'),
      cust_name: get('고객명') || get('업체명'),
      product_name: get('정비상품') || get('상품') || get('상품명') || get('서비스명'),
      base_fee: num(get('MT(정액)\n지급수수료') || get('부품가') || get('지급부품')),
      additional_fee: num(get('사고(정비)\n지급수수료') || get('기술료') || get('지급공임')),
      total_amount: num(get('합계') || get('지급금액') || get('지급액') || get('지급수수료(vat별도)') || get('지급수수료®')),
      exec_date: get('실행일자') || get('정비일자') || get('서비스처리일자') || get('접수일자'),
      loan_end_date: get('종료일자'),
      exec_status: get('대출상태'),
      raw_extra: {
        layout: 'ride-integrated',
        category,
        sheet_origin: ws['!ref'],
        면책금: get('면책금'),
        보험연령: get('보험연령'),
        주행거리: get('주행거리'),
        부품명: get('부품명'),
      },
    })
  }
  return { headers, items }
}

// ─── 차량 운행 여부 시트 (메리츠 등) ───────────────────────────────
function parseVehicleStatus(ws: XLSX.WorkSheet): { car_number: string; status: string }[] {
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: null, raw: false })
  const headerIdx = findHeaderRow(rows, ['차량번호', '진행상태'])
  const headers = (rows[headerIdx] || []).map(c => String(c ?? '').trim())
  const carIdx = headers.findIndex(x => x === '차량번호')
  const statusIdx = headers.findIndex(x => x.includes('상태') || x.includes('진행'))
  if (carIdx < 0) return []
  const result: { car_number: string; status: string }[] = []
  for (const r of rows.slice(headerIdx + 1)) {
    const car = trimStr(r[carIdx])
    if (!car) continue
    result.push({
      car_number: car,
      status: trimStr(statusIdx >= 0 ? r[statusIdx] : null) || '정상',
    })
  }
  return result
}

// ─── 메인 핸들러 ──────────────────────────────────────────────────
export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const userTyped = user as { id: string; name?: string }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'multipart 필요' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const customerIdInput = (formData.get('customer_id') as string) || ''
  const periodLabelInput = (formData.get('period_label') as string) || ''
  const layoutForce = (formData.get('layout') as string) || 'auto'
  const mode = ((formData.get('mode') as string) || 'preview') === 'apply' ? 'apply' : 'preview'

  if (!file)
    return NextResponse.json({ success: false, error: 'file 필요' }, { status: 400 })

  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ success: false, error: '파일 읽기 실패' }, { status: 400 })
  }

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, sheetRows: 30000 })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `xlsx parse 실패: ${(e as Error).message}` },
      { status: 400 }
    )
  }

  const layout: Layout =
    layoutForce !== 'auto'
      ? (layoutForce as Layout)
      : detectLayout(wb)

  // 위탁사 추정
  let customerId: string | null = customerIdInput || null
  let customerNameSnap: string | null = null
  if (!customerId) {
    const guess = suggestCustomer(file.name)
    if (guess) {
      try {
        const [c] = await prisma.$queryRaw<{ id: string; name: string }[]>`
          SELECT id, name FROM ride_customer_companies WHERE name = ${guess} AND active = 1 LIMIT 1
        `
        if (c) {
          customerId = c.id
          customerNameSnap = c.name
        }
      } catch {
        /* ignore */
      }
    }
  } else {
    try {
      const [c] = await prisma.$queryRaw<{ name: string }[]>`
        SELECT name FROM ride_customer_companies WHERE id = ${customerId} LIMIT 1
      `
      customerNameSnap = c?.name ?? null
    } catch {
      /* ignore */
    }
  }

  // period 추정
  const periodLabel =
    periodLabelInput ||
    (() => {
      const m = file.name.match(/(\d{2,4})[._\s년]*(\d{1,2})\s*월/)
      if (m) {
        const y = m[1].length === 2 ? `20${m[1]}` : m[1]
        return `${y}-${m[2].padStart(2, '0')}`
      }
      return null
    })()

  // ─── 양식별 파싱 ────────────────────────────────────────────────
  type ParsedSheet = {
    sheet_name: string
    customer_id: string | null
    customer_name: string | null
    category: string
    items: Record<string, unknown>[]
    vehicle_status?: { car_number: string; status: string }[]
  }
  const parsed: ParsedSheet[] = []
  let rawSummary: unknown = null

  if (layout === 'ride-integrated') {
    // 구분표 = summary
    if (wb.Sheets['구분표']) {
      const sumRows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets['구분표'], { header: 1, defval: null, raw: false })
      rawSummary = sumRows
    }
    for (const sheet of wb.SheetNames) {
      const meta = customerFromSheetName(sheet)
      if (meta.category === '_skip') continue
      const ws = wb.Sheets[sheet]
      if (!ws) continue
      if (meta.category === '_vehicle_status') {
        // 별도 차량 운행 여부 — parent 에 첨부 X (ride-integrated 는 보통 없음)
        continue
      }
      const { items } = parseRideIntegrated(ws, meta.category)
      // 위탁사 lookup
      let cId: string | null = null
      if (meta.name) {
        try {
          const [c] = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM ride_customer_companies WHERE name = ${meta.name} AND active = 1 LIMIT 1
          `
          cId = c?.id ?? null
        } catch {
          /* ignore */
        }
      }
      parsed.push({
        sheet_name: sheet,
        customer_id: cId,
        customer_name: meta.name,
        category: meta.category,
        items,
      })
    }
  } else if (layout === 'meritz') {
    const mainSheet = wb.SheetNames.find(s => s.includes('정비비 정산 대상')) || wb.SheetNames[0]
    const { items } = parseMeritz(wb.Sheets[mainSheet])
    // 차량 운행 여부 시트 (있으면)
    let vs: { car_number: string; status: string }[] | undefined
    const vsSheet = wb.SheetNames.find(s => s.includes('차량 운행') || s.includes('실비차량'))
    if (vsSheet) vs = parseVehicleStatus(wb.Sheets[vsSheet])
    parsed.push({
      sheet_name: mainSheet,
      customer_id: customerId,
      customer_name: customerNameSnap,
      category: '위탁사정산',
      items,
      vehicle_status: vs,
    })
  } else if (layout === 'im') {
    const { items } = parseIm(wb.Sheets['마감자료'])
    parsed.push({
      sheet_name: '마감자료',
      customer_id: customerId,
      customer_name: customerNameSnap,
      category: '위탁사정산',
      items,
    })
  } else if (layout === 'mg') {
    const turnkeySheet = wb.SheetNames.find(s => s.startsWith('턴키'))
    const sibiSheet = wb.SheetNames.find(s => s.includes('실비'))
    if (turnkeySheet) {
      const { items } = parseMgSheet(wb.Sheets[turnkeySheet], '턴키')
      parsed.push({
        sheet_name: turnkeySheet,
        customer_id: customerId,
        customer_name: customerNameSnap,
        category: '턴키',
        items,
      })
    }
    if (sibiSheet) {
      const { items } = parseMgSheet(wb.Sheets[sibiSheet], '실비')
      parsed.push({
        sheet_name: sibiSheet,
        customer_id: customerId,
        customer_name: customerNameSnap,
        category: '실비',
        items,
      })
    }
    // 차량 운행 여부
    const vsSheet = wb.SheetNames.find(s => s.includes('차량 운행'))
    if (vsSheet && parsed[0]) {
      parsed[0].vehicle_status = parseVehicleStatus(wb.Sheets[vsSheet])
    }
  } else {
    return NextResponse.json(
      { success: false, error: `양식 자동 감지 실패 — 시트: ${wb.SheetNames.join(', ')}` },
      { status: 400 }
    )
  }

  const totalItems = parsed.reduce((s, p) => s + p.items.length, 0)

  // ─── preview ──────────────────────────────────────────────────
  if (mode === 'preview') {
    return NextResponse.json({
      success: true,
      detected: {
        file_name: file.name,
        layout,
        period_label: periodLabel,
        customer_id: customerId,
        customer_name: customerNameSnap,
        sheet_count: parsed.length,
        total_items: totalItems,
      },
      sheets: parsed.map(p => ({
        sheet_name: p.sheet_name,
        customer_name: p.customer_name,
        category: p.category,
        item_count: p.items.length,
        sample: p.items.slice(0, 3),
        vehicle_status_count: p.vehicle_status?.length || 0,
      })),
    })
  }

  // ─── apply ────────────────────────────────────────────────────
  // ride-integrated 인 경우 → parent + N children 생성
  // 그 외 → single 또는 mg 처럼 다중 카테고리 (parent + children)

  let parentId: string | null = null
  if (layout === 'ride-integrated' || (layout === 'mg' && parsed.length > 1)) {
    parentId = randomUUID()
    await prisma.$executeRaw`
      INSERT INTO ride_settlements
        (id, customer_id, customer_name_snap, layout_type, layout_signature,
         source_file, period_label, item_count, raw_summary, created_by)
      VALUES
        (${parentId}, ${customerId}, ${customerNameSnap}, 'parent', ${layout},
         ${file.name}, ${periodLabel}, ${totalItems},
         ${rawSummary ? JSON.stringify(rawSummary) : null}, ${userTyped.id})
    `
  }

  let totalInserted = 0
  const childResults: { sheet: string; settlement_id: string; inserted: number }[] = []

  for (const ps of parsed) {
    const settlementId = randomUUID()
    const layoutTypeVal = parentId ? 'child' : 'single'
    await prisma.$executeRaw`
      INSERT INTO ride_settlements
        (id, customer_id, customer_name_snap, parent_settlement_id,
         layout_type, layout_signature, category, source_file, sheet_name,
         period_label, item_count, created_by)
      VALUES
        (${settlementId}, ${ps.customer_id}, ${ps.customer_name}, ${parentId},
         ${layoutTypeVal}, ${layout}, ${ps.category}, ${file.name}, ${ps.sheet_name},
         ${periodLabel}, ${ps.items.length}, ${userTyped.id})
    `
    let inserted = 0
    for (const item of ps.items) {
      try {
        await prisma.$executeRaw`
          INSERT INTO ride_settlement_items
            (id, settlement_id, layout_type, category,
             exec_no, car_number, car_model, vin,
             cust_name, sub_customer, product_name,
             base_fee, additional_fee, supply_amount, vat_amount, total_amount, payment_amount,
             exec_date, loan_end_date, closing_date, termination_date,
             exec_status, exec_reason, closing_reason,
             installment_no, installment_total, installments_remaining,
             raw_extra)
          VALUES
            (${randomUUID()}, ${settlementId}, ${layout}, ${ps.category},
             ${(item.exec_no as string) || null},
             ${(item.car_number as string) || null},
             ${(item.car_model as string) || null},
             ${(item.vin as string) || null},
             ${(item.cust_name as string) || null},
             ${(item.sub_customer as string) || null},
             ${(item.product_name as string) || null},
             ${(item.base_fee as number) ?? null},
             ${(item.additional_fee as number) ?? null},
             ${(item.supply_amount as number) ?? null},
             ${(item.vat_amount as number) ?? null},
             ${(item.total_amount as number) ?? null},
             ${(item.payment_amount as number) ?? null},
             ${(item.exec_date as string) || null},
             ${(item.loan_end_date as string) || null},
             ${(item.closing_date as string) || null},
             ${(item.termination_date as string) || null},
             ${(item.exec_status as string) || null},
             ${(item.exec_reason as string) || null},
             ${(item.closing_reason as string) || null},
             ${(item.installment_no as number) ?? null},
             ${(item.installment_total as number) ?? null},
             ${(item.installments_remaining as number) ?? null},
             ${item.raw_extra ? JSON.stringify(item.raw_extra) : null})
        `
        inserted++
      } catch (e) {
        console.warn('[item insert]', (e as Error).message)
      }
    }
    // vehicle_status
    if (ps.vehicle_status && ps.vehicle_status.length > 0) {
      for (const vs of ps.vehicle_status) {
        try {
          await prisma.$executeRaw`
            INSERT INTO ride_settlement_vehicle_status
              (id, settlement_id, car_number, status)
            VALUES
              (${randomUUID()}, ${settlementId}, ${vs.car_number}, ${vs.status})
          `
        } catch {
          /* ignore */
        }
      }
    }
    await logAuditAction('ride_settlements', settlementId, 'insert', userTyped, `${inserted} items`)
    totalInserted += inserted
    childResults.push({ sheet: ps.sheet_name, settlement_id: settlementId, inserted })
  }

  return NextResponse.json({
    success: true,
    detected: {
      file_name: file.name,
      layout,
      period_label: periodLabel,
      customer_id: customerId,
      customer_name: customerNameSnap,
      sheet_count: parsed.length,
      total_items: totalItems,
    },
    result: {
      parent_settlement_id: parentId,
      total_inserted: totalInserted,
      children: childResults,
    },
  })
}

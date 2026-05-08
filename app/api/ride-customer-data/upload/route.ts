/**
 * /api/ride-customer-data/upload
 *
 * POST — 엑셀 업로드 → 자동 감지 → ride_capital_reports 또는 ride_contracts 로 import
 *
 * 입력 (multipart):
 *   file: .xlsx
 *   customer_id?: string   (지정 시 capital_reports 로 강제 — 보고일자 필요)
 *   target?: 'capital_reports' | 'contracts'  (자동 감지 무시 강제 지정)
 *   report_date?: 'YYYY-MM-DD'  (capital_reports 일 때 — 미지정 시 파일명/오늘로 추정)
 *   mode: 'preview' | 'apply'
 *
 * 자동 감지 (헤더 시그니처):
 *   - "계약자" + "이용자" + "계약상품"  → contracts (전산등록)
 *   - "마감일자" + "해지일자" + "정비업체명"  → capital_reports (메리츠 4주차 패턴)
 *   - "월" + "순번" + "긴출"  → capital_reports (iM Daily — 헤더 row 4)
 *   - 기본: capital_reports
 *
 * 멱등: ride_capital_reports 의 UNIQUE (customer_id, report_date, exec_no, car_number) 기반
 *       ride_contracts 의 UNIQUE (exec_no) 기반
 *       → INSERT IGNORE 사용
 *
 * PR-6.10
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import * as XLSX from 'xlsx'

type Cell = string | number | null | undefined

// ───────────────────────── 컬럼 매핑 ─────────────────────────────
// 헤더 텍스트 → DB 컬럼 매핑 (capital_reports)
// 같은 의미의 다양한 헤더 표기를 모두 흡수
const CAPITAL_HEADER_MAP: Record<string, string> = {
  // 공통
  '실행번호': 'exec_no', '계약번호': 'exec_no',
  '고객명': 'cust_name', '이용자': 'cust_name',
  '차량번호': 'car_number',
  '차종': 'car_model', '차종/모델': 'car_model',
  '차량등록일자': 'car_reg_date', '차량등록일': 'car_reg_date',
  '여신시작일': 'loan_start_date', '계약시작일': 'loan_start_date', '실행일자': 'loan_start_date',
  '여신기간': 'loan_period', '기간': 'loan_period', '계약기간': 'loan_period',
  '여신만기일': 'loan_end_date', '계약종료일': 'loan_end_date', '만기일': 'loan_end_date',
  '실행사유': 'exec_reason', '신규': 'exec_reason', '신규/재렌탈': 'exec_reason',
  '차량옵션': 'car_options', '옵션': 'car_options',
  '차대번호': 'vin', 'vin': 'vin', 'VIN': 'vin',
  '보험사': 'insurance_co',
  '연령': 'age_band',
  '보험개시일': 'ins_start_date', '보험가입일자': 'ins_start_date',
  '보험기간': 'ins_period',
  '대인배상': 'ins_di', '대인': 'ins_di',
  '대물': 'ins_dm', '대물배상': 'ins_dm',
  '자기신체사고': 'ins_js', '자손': 'ins_js',
  '무보험차상해': 'ins_uninsured', '무보험': 'ins_uninsured',
  '자기부담금(정비)': 'ins_deductible', '자기부담금': 'ins_deductible', '자기부담금(면책금)': 'ins_deductible',
  '긴급출동': 'emergency', '긴출': 'emergency',
  '월정비료': 'monthly_fee', '지급정비료': 'monthly_fee', '월정비료(Vat-)': 'monthly_fee',
  '정비상품': 'maint_product',
  '스노우타이어': 'snow_tire', '스타이어': 'snow_tire',
  '체인': 'snow_chain', '스노우체인': 'snow_chain',
  '고객담당자': 'cust_manager',
  '전화': 'cust_phone', '사무실 전화': 'cust_phone',
  '휴대폰': 'cust_mobile',
  '주소': 'cust_address', '고객주소': 'cust_address',
  // 메리츠 추가 컬럼
  '청구지 주소': 'bill_address',
  '정비업체명': 'maint_company',
  '마감일자': 'closing_date',
  '해지일자': 'termination_date',
  '영업부서': 'sales_dept',
  '영업담당자': 'sales_manager',
  '실행등록자': 'registered_by',
  // iM 추가 컬럼
  '렌트(대차)': 'rent_substitute',
  '추가운전자이름/연락처': 'additional_driver',
  '특약가입여부': 'special_clause',
  '비고': 'note',
}

// 계약 마스터 (전산등록) 매핑
const CONTRACT_HEADER_MAP: Record<string, string> = {
  '실행번호': 'exec_no',
  '계약자': 'contractor',
  '계약상품': 'contract_product',
  '이용자': 'user_name',
  '차량번호': 'car_number',
  '차종': 'car_model',
  '차량등록일자': 'car_reg_date',
  '계약시작일': 'contract_start',
  '계약기간': 'contract_period',
  '계약종료일': 'contract_end',
  '신규/재렌탈': 'is_new', '신규': 'is_new',
  '차량옵션': 'car_options',
  '차대번호': 'vin',
  '보험사': 'insurance_co',
  '연령': 'age_band',
  '보험개시일': 'ins_start_date',
  '보험기간': 'ins_period',
  '대인배상': 'ins_di',
  '대물': 'ins_dm',
  '자손': 'ins_js', '자기신체사고': 'ins_js',
  '무보험차상해': 'ins_uninsured',
  '자기부담금(면책금)': 'ins_deductible', '자기부담금': 'ins_deductible',
  '긴급출동': 'emergency',
  '월정비료(Vat-)': 'monthly_fee', '월정비료': 'monthly_fee',
  '정비상품': 'maint_product',
  '스노우타이어': 'snow_tire',
  '체인': 'snow_chain',
  '고객담당자': 'cust_manager',
  '사무실 전화': 'office_phone',
  '휴대폰': 'cust_mobile',
  '고객주소': 'cust_address',
}

// ───────────────────────── 유틸 ──────────────────────────────────
function trimStr(v: Cell): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

function detectHeaderRow(rows: Cell[][]): number {
  // 첫 5 row 중 "실행번호" 또는 "계약번호" 나 "차량번호" 가 있는 row 가 헤더
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i] || []
    const cells = row.map(c => String(c ?? '').trim())
    if (cells.some(c => c === '실행번호' || c === '계약번호') &&
        cells.some(c => c === '차량번호')) {
      return i
    }
  }
  return 0
}

function detectTarget(headers: string[]): 'capital_reports' | 'contracts' {
  const set = new Set(headers.map(h => h.trim()))
  // contracts: 계약자 + 계약상품 + 이용자 동시 존재
  if (set.has('계약자') && set.has('계약상품') && set.has('이용자')) {
    return 'contracts'
  }
  return 'capital_reports'
}

function rowToObject(
  headers: string[],
  row: Cell[],
  map: Record<string, string>
): Record<string, string | null> {
  const obj: Record<string, string | null> = {}
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim()
    const col = map[h]
    if (!col) continue
    obj[col] = trimStr(row[i])
  }
  return obj
}

function pickReportDateFromFilename(name: string): string | null {
  // "20260507 Daily report.xlsx" 또는 "26년 4월 4주차 ..." → YYYY-MM-DD 추정
  const m1 = name.match(/(\d{4})(\d{2})(\d{2})/)
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`
  const m2 = name.match(/(\d{2,4})[._-](\d{1,2})[._-](\d{1,2})/)
  if (m2) {
    const y = m2[1].length === 2 ? `20${m2[1]}` : m2[1]
    return `${y}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`
  }
  return null
}

// ───────────────────────── 핸들러 ────────────────────────────────
export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'multipart 필요' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const customer_id = (formData.get('customer_id') as string) || null
  const targetForce = (formData.get('target') as string) || ''
  const reportDateInput = (formData.get('report_date') as string) || ''
  const mode = ((formData.get('mode') as string) || 'preview') === 'apply' ? 'apply' : 'preview'

  if (!file)
    return NextResponse.json({ success: false, error: 'file 필요' }, { status: 400 })

  let buffer: Buffer
  try {
    const ab = await file.arrayBuffer()
    buffer = Buffer.from(ab)
  } catch {
    return NextResponse.json({ success: false, error: '파일 읽기 실패' }, { status: 400 })
  }

  let wb
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `xlsx parse 실패: ${(e as Error).message}` },
      { status: 400 }
    )
  }
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws)
    return NextResponse.json({ success: false, error: '시트 없음' }, { status: 400 })

  const rows: Cell[][] = XLSX.utils.sheet_to_json<Cell[]>(ws, {
    header: 1,
    defval: null,
    raw: false,
  })
  if (rows.length === 0)
    return NextResponse.json({ success: false, error: '빈 파일' }, { status: 400 })

  const headerIdx = detectHeaderRow(rows)
  const headers = (rows[headerIdx] || []).map(c => String(c ?? '').trim())
  const dataRows = rows.slice(headerIdx + 1).filter(r => {
    // 모든 셀이 빈 값이면 skip
    return r.some(v => v !== null && v !== undefined && String(v).trim() !== '')
  })

  // target 결정 (force 있으면 우선)
  let target: 'capital_reports' | 'contracts'
  if (targetForce === 'capital_reports' || targetForce === 'contracts') {
    target = targetForce
  } else {
    target = detectTarget(headers)
  }

  const map = target === 'contracts' ? CONTRACT_HEADER_MAP : CAPITAL_HEADER_MAP

  // report_date 추정 (capital_reports 만)
  let reportDate: string | null = null
  if (target === 'capital_reports') {
    if (reportDateInput && /^\d{4}-\d{2}-\d{2}$/.test(reportDateInput)) {
      reportDate = reportDateInput
    } else {
      reportDate = pickReportDateFromFilename(file.name)
    }
  }

  // 고객사 마스터 조회 (customer_id 별 name)
  let customerNameSnap: string | null = null
  if (customer_id) {
    try {
      const [c] = await prisma.$queryRaw<{ name: string }[]>`
        SELECT name FROM ride_customer_companies WHERE id = ${customer_id} LIMIT 1
      `
      customerNameSnap = c?.name ?? null
    } catch {
      // ignore
    }
  }

  // 행 파싱
  const parsed: Record<string, string | null>[] = []
  for (const r of dataRows) {
    const obj = rowToObject(headers, r, map)
    // 핵심 키 (exec_no 또는 car_number) 둘 중 하나라도 있어야 row 인정
    if (!obj.exec_no && !obj.car_number) continue
    parsed.push(obj)
  }

  // preview — 통계 + 샘플 5건만
  if (mode === 'preview') {
    return NextResponse.json({
      success: true,
      target,
      detected: {
        sheet: wb.SheetNames[0],
        header_row_index: headerIdx + 1,
        total_data_rows: dataRows.length,
        parsed_rows: parsed.length,
        report_date: reportDate,
        customer_id,
        customer_name_snap: customerNameSnap,
        file_name: file.name,
      },
      sample: parsed.slice(0, 5),
    })
  }

  // apply — INSERT
  let inserted = 0
  let skipped = 0
  const errors: string[] = []

  if (target === 'capital_reports') {
    // 화이트리스트 컬럼 (DB 실제 컬럼)
    const allowed = new Set(Object.values(CAPITAL_HEADER_MAP))
    for (const obj of parsed) {
      try {
        const cols: string[] = ['id', 'customer_id', 'customer_name_snap', 'report_date', 'source_file', 'created_by']
        const placeholders: string[] = ['?', '?', '?', '?', '?', '?']
        const vals: (string | null)[] = [
          randomUUID(), customer_id, customerNameSnap, reportDate, file.name, user.id,
        ]
        for (const [k, v] of Object.entries(obj)) {
          if (!allowed.has(k)) continue
          cols.push(k)
          placeholders.push('?')
          vals.push(v)
        }
        const sql = `INSERT IGNORE INTO ride_capital_reports (${cols.join(',')}) VALUES (${placeholders.join(',')})`
        const result = await prisma.$executeRawUnsafe(sql, ...vals)
        if (Number(result) === 1) inserted++
        else skipped++
      } catch (e) {
        errors.push(`row ${inserted + skipped + 1}: ${(e as Error).message}`)
        if (errors.length >= 5) break
      }
    }
  } else {
    const allowed = new Set(Object.values(CONTRACT_HEADER_MAP))
    for (const obj of parsed) {
      try {
        const cols: string[] = ['id', 'customer_id', 'source_file', 'created_by']
        const placeholders: string[] = ['?', '?', '?', '?']
        const vals: (string | null)[] = [
          randomUUID(), customer_id, file.name, user.id,
        ]
        for (const [k, v] of Object.entries(obj)) {
          if (!allowed.has(k)) continue
          cols.push(k)
          placeholders.push('?')
          vals.push(v)
        }
        const sql = `INSERT IGNORE INTO ride_contracts (${cols.join(',')}) VALUES (${placeholders.join(',')})`
        const result = await prisma.$executeRawUnsafe(sql, ...vals)
        if (Number(result) === 1) inserted++
        else skipped++
      } catch (e) {
        errors.push(`row ${inserted + skipped + 1}: ${(e as Error).message}`)
        if (errors.length >= 5) break
      }
    }
  }

  return NextResponse.json({
    success: true,
    target,
    detected: {
      file_name: file.name,
      total_data_rows: dataRows.length,
      parsed_rows: parsed.length,
      report_date: reportDate,
      customer_id,
      customer_name_snap: customerNameSnap,
    },
    result: { inserted, skipped, errors },
  })
}

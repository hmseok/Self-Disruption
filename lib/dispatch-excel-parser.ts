/**
 * lib/dispatch-excel-parser.ts — PR-V2 (2026-06-28)
 *
 * 「대차 현황(운영페이지)」 엑셀 → fmi_rentals 정규화 파서 (코드화).
 * 서술형으로 한 셀에 뭉친 데이터를 컬럼 분리:
 *   "(1) 125하4239 / G80 2.5(G)"  → seq + 차량번호 + 차종
 *   "이경수/010-6322-2815"         → 고객명 + 연락처
 *   "구자준/010-5569-3439/"        → 담당자 + 연락처
 *   "199호7301/우리"               → 사고차량번호 + 자차여부
 *   "생년월일 650809"              → 생년월일
 * 보험사는 빌려타 시트에 없음 → 부가세(캐피탈)·마춤카 시트에서 사고차량번호로 조인.
 *
 * Python 검증본(billyeota_normalized.json)과 동일 로직.
 */

import * as XLSX from 'xlsx'

const PLATE = /(\d{2,3}[가-힣]\d{4})/
const PHONE = /(01[016789])[-\s]?(\d{3,4})[-\s]?(\d{4})/

function cl(v: any): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(/\x08/g, '').replace(/_x0008_/g, '').trim()
}

export function splitPlateModel(s: any): { seq: number | null; plate: string; model: string } {
  let str = cl(s)
  let seq: number | null = null
  const m = str.match(/^\((\d+)\)\s*/)
  if (m) { seq = Number(m[1]); str = str.slice(m[0].length) }
  const pm = str.match(PLATE)
  const plate = pm ? pm[1] : ''
  const model = str.includes('/') ? str.split('/').slice(1).join('/').trim() : ''
  return { seq, plate, model }
}

export function splitNamePhone(s: any): { name: string; phone: string } {
  const str = cl(s)
  const ph = str.match(PHONE)
  const phone = ph ? `${ph[1]}-${ph[2]}-${ph[3]}` : ''
  let name = str ? str.split(/[/\s]/)[0] : ''
  if (/^\d/.test(name) || PHONE.test(name)) name = ''
  return { name, phone }
}

export function splitAcc(s: any): { plate: string; self: boolean } {
  const str = cl(s)
  const m = str.match(PLATE)
  return { plate: m ? m[1] : '', self: str.includes('우리') }
}

export function extractBirth(s: any): string {
  const m = cl(s).match(/(\d{6})/)
  return m ? m[1] : ''
}

function toDt(v: any): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:00`
  }
  const s = cl(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:00`
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (d) return `${d[1]}-${d[2]}-${d[3]} 00:00:00`
  return null
}

export interface DispatchRecord {
  dispatch_seq: number | null
  vehicle_car_number: string
  vehicle_car_type: string
  customer_car_number: string
  customer_car_type: string
  self_vehicle_yn: boolean
  customer_name: string
  customer_phone: string
  adjuster_name: string
  adjuster_phone: string
  customer_birth: string
  insurance_claim_no: string
  dispatch_location: string
  repair_factory: string
  dispatch_date: string | null
  expected_return_date: string | null
  insurance_company: string
  claim_status: string
  contract: string
  billed: string
  paid: string
  notes: string
}

function sheetRows(wb: XLSX.WorkBook, name: string): any[][] {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][]
}

/** 보험사 맵: 부가세(캐피탈)[col5→col7] + 마춤카[col5→col8] — 사고차량번호 → 보험사 */
export function buildInsurerMap(wb: XLSX.WorkBook): Map<string, string> {
  const map = new Map<string, string>()
  for (const r of sheetRows(wb, '부가세(캐피탈)')) {
    const acc = splitAcc(r?.[5]).plate
    const ins = cl(r?.[7])
    if (acc && ins && !map.has(acc)) map.set(acc, ins)
  }
  for (const r of sheetRows(wb, '마춤카')) {
    const acc = splitAcc(r?.[5]).plate
    const ins = cl(r?.[8])
    if (acc && ins && !map.has(acc)) map.set(acc, ins)
  }
  return map
}

/** 빌려타 시트 → 정규화 레코드 (핵심키: 우리차 + 사고차 둘 다 있는 행만) */
export function parseDispatchExcel(wb: XLSX.WorkBook): { records: DispatchRecord[]; skipped: number; insurerHits: number } {
  const insurerMap = buildInsurerMap(wb)
  const data = sheetRows(wb, '빌려타').slice(2) // r0 빈줄 / r1 헤더
  const records: DispatchRecord[] = []
  let skipped = 0
  let insurerHits = 0
  for (const r of data) {
    if (!r || !r.some((c) => c !== null && c !== '' && c !== ' ')) continue
    const pm = splitPlateModel(r[1])
    const acc = splitAcc(r[5])
    if (!pm.plate || !acc.plate) { skipped++; continue }
    const adj = splitNamePhone(r[9])
    const cust = splitNamePhone(r[11])
    const insurer = insurerMap.get(acc.plate) || ''
    if (insurer) insurerHits++
    records.push({
      dispatch_seq: pm.seq,
      vehicle_car_number: pm.plate,
      vehicle_car_type: pm.model,
      customer_car_number: acc.plate,
      customer_car_type: cl(r[6]),
      self_vehicle_yn: acc.self,
      customer_name: cust.name,
      customer_phone: cust.phone,
      adjuster_name: adj.name,
      adjuster_phone: adj.phone,
      customer_birth: extractBirth(r[10]),
      insurance_claim_no: cl(r[8]),
      dispatch_location: cl(r[12]),
      repair_factory: cl(r[13]),
      dispatch_date: toDt(r[2]),
      expected_return_date: toDt(r[3]),
      insurance_company: insurer,
      claim_status: cl(r[4]),
      contract: cl(r[16]),
      billed: cl(r[17]),
      paid: cl(r[18]),
      notes: `[엑셀 빌려타] ${cl(r[4])} / ${cl(r[13])} / 청구:${cl(r[17])} / 입금:${cl(r[18])}`,
    })
  }
  return { records, skipped, insurerHits }
}

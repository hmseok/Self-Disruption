// ═══════════════════════════════════════════════════════════════════
// lib/billyeota-sync.ts — 구글시트 「빌려타」 → fmi_rentals 증분 동기화
//
// 2026-08-01 사용자 확정: "당분간 시트를 쓰고, 정제 후 ERP로 이관" —
//   전환기 동안 시트가 배차 기록의 원본, ERP 는 주기 pull 로 따라간다.
//
// 인증: 키 파일 없이 — 실행 주체(Cloud Run 런타임 SA / 로컬 gcloud 사용자)가
//   charger-ride-sheet@… 서비스 계정을 임퍼서네이션 (Token Creator 필요).
//   시트는 charger-ride-sheet 에 공유되어 있음 (2026-08-01).
//
// 동작 (멱등):
//   1) 신규 삽입 — 고객명+출고일 키가 DB 에 없는 2026-01-01 이후 행
//   2) 반납 반영 — DB dispatched 인데 시트에 반납일이 생긴 행 → returned
//   원본 값(위치/공장/계약진행/청구/입금/순번)은 notes 에 보존.
// ═══════════════════════════════════════════════════════════════════

import { prisma } from './prisma'
import { randomUUID } from 'crypto'
// @google-cloud/storage(직접 의존성)의 하위 의존 — lockfile 로 항상 설치됨
import { GoogleAuth, Impersonated } from 'google-auth-library'

const SHEET_ID = '1a3Rz4BFhgFM2ktxbFNxMo_jClQylHS2GCer3BgO_q48'
const TAB = '빌려타'
const SA = 'charger-ride-sheet@secondlife-485816.iam.gserviceaccount.com'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const MIN_DATE = '2026-01-01'   // 2025 행은 표기 오염이 많아 수동 검토 대상 (2026-08-01 결정)

async function getSheetToken(): Promise<string> {
  const auth = new GoogleAuth()
  const source = await auth.getClient()
  const imp = new Impersonated({
    sourceClient: source as any,
    targetPrincipal: SA,
    targetScopes: [SCOPE],
    lifetime: 300,
  })
  const t = await imp.getAccessToken()
  const token = typeof t === 'string' ? t : t?.token
  if (!token) throw new Error('시트 접근 토큰 발급 실패 (임퍼서네이션)')
  return token
}

function parseDate(s: unknown): string | null {
  const m = String(s || '').match(/(\d{2})\.\s*(\d{2})\.\s*(\d{2})/)
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null
}
function parseCustomer(s: unknown): { name: string; phone: string | null } {
  const raw = String(s || '').replace(/\n/g, ' ').trim()
  const pm = raw.match(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/)
  const phone = pm ? pm[0].replace(/[.\s]/g, '-').replace(/--/g, '-') : null
  let name = raw.replace(pm ? pm[0] : '', '')
    .replace(/[\/.,:]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (name.length > 20) name = name.split(' ').filter(w => /^[가-힣]{2,4}$/.test(w)).pop() || name.slice(0, 20)
  return { name, phone }
}

export interface BillyeotaSyncResult {
  fetchedRows: number
  inserted: number
  returnsUpdated: number
  skippedOld: number
  insertedList: Array<{ seq: number; date: string; vehicle: string | null; customer: string }>
}

export async function syncBillyeota(): Promise<BillyeotaSyncResult> {
  const token = await getSheetToken()
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB)}!A1:AG2000?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`시트 조회 실패 HTTP ${res.status}`)
  const json = await res.json() as { values?: string[][] }
  const rows = (json.values || []).slice(2).filter(r => r.length > 2 && String(r[0]).trim().match(/^\d+$/))

  const sheet = rows.map(r => {
    const veh = String(r[1] || '').split('/')
    const cust = parseCustomer(r[11])
    const custCar = String(r[5] || '').split('/')
    return {
      seq: Number(r[0]),
      vehicle_car_number: veh[0]?.trim().replace(/\(\d+\)\s*/, '') || null,
      vehicle_car_type: veh[1]?.trim() || null,
      dispatch_date: parseDate(r[2]),
      return_date: parseDate(r[3]),
      loc: String(r[4] || '').trim(),
      customer_car_number: custCar[0]?.trim() || null,
      customer_car_type: String(r[6] || '').trim() || null,
      insurance_company: String(r[7] || '').trim() || null,
      claim_no: String(r[8] || '').trim() || null,
      birth: String(r[10] || '').trim(),
      name: cust.name || null,
      phone: cust.phone,
      addr: String(r[12] || '').trim() || null,
      factory: String(r[13] || '').trim(),
      contract: String(r[16] || '').trim(),
      billed: String(r[17] || '').trim(),
      paid: String(r[18] || '').trim(),
    }
  }).filter(s => s.dispatch_date && s.name)

  const db = await prisma.$queryRaw<Array<{ id: string; customer_name: string | null; dd: string; status: string | null; has_return: number }>>`
    SELECT id, customer_name, DATE_FORMAT(dispatch_date, '%Y-%m-%d') AS dd, status,
           (actual_return_date IS NOT NULL) AS has_return
      FROM fmi_rentals`
  const byKey = new Map(db.map(r => [`${String(r.customer_name || '').trim()}|${r.dd}`, r]))

  const cars = await prisma.car.findMany({ select: { id: true, number: true } })
  const carByNo = new Map(cars.filter(c => c.number).map(c => [String(c.number).replace(/\s/g, ''), c.id]))
  const today = new Date().toISOString().slice(0, 10)

  const result: BillyeotaSyncResult = { fetchedRows: sheet.length, inserted: 0, returnsUpdated: 0, skippedOld: 0, insertedList: [] }

  for (const m of sheet) {
    const key = `${m.name}|${m.dispatch_date}`
    const existing = byKey.get(key)

    if (existing) {
      // 반납 반영 — 시트에 반납일 생겼는데 DB 는 아직 배차중
      if (m.return_date && existing.status === 'dispatched' && !Number(existing.has_return)) {
        await prisma.$executeRawUnsafe(
          `UPDATE fmi_rentals SET actual_return_date = ?, status = 'returned', updated_at = NOW()
            WHERE id = ? AND status = 'dispatched'`,
          m.return_date, existing.id)
        result.returnsUpdated += 1
      }
      continue
    }

    if (m.dispatch_date! < MIN_DATE) { result.skippedOld += 1; continue }

    const status = m.return_date && m.return_date <= today ? 'returned' : 'dispatched'
    const notes = [
      '구글시트 빌려타 자동동기화',
      m.loc ? `위치/상태: ${m.loc}` : '', m.factory ? `입고공장: ${m.factory}` : '',
      m.contract ? `계약진행: ${m.contract}` : '', m.billed ? `청구: ${m.billed}` : '', m.paid ? `입금: ${m.paid}` : '',
      m.birth ? `생년월일: ${m.birth}` : '', `시트순번: ${m.seq}`,
    ].filter(Boolean).join(' · ')
    const vid = m.vehicle_car_number ? (carByNo.get(m.vehicle_car_number.replace(/\s/g, '')) || null) : null
    const dd = m.dispatch_date!
    await prisma.$executeRawUnsafe(
      `INSERT INTO fmi_rentals (id, rental_no, customer_name, customer_phone, customer_car_number, customer_car_type,
         vehicle_id, vehicle_car_number, vehicle_car_type, insurance_company, insurance_claim_no,
         dispatch_date, actual_return_date, dispatch_location, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      randomUUID(), `R${dd.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
      m.name, m.phone, m.customer_car_number, m.customer_car_type,
      vid, m.vehicle_car_number, m.vehicle_car_type, m.insurance_company, m.claim_no,
      dd, m.return_date, m.addr, status, notes)
    result.inserted += 1
    result.insertedList.push({ seq: m.seq, date: dd, vehicle: m.vehicle_car_number, customer: m.name! })
  }

  return result
}

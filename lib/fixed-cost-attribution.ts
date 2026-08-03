import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════════
// 고정비 자동 귀속 (2026-08-03 사용자 승인 ①③④)
//
//   ① 보험료: 보험사/공제조합 앞 지출 → 거래일에 유효한 보험 계약의
//      차량 분담(premium_amount) 비율로 각 차량에 ratio 귀속
//   ③ 대출/할부: loans 등록 차량의 금융사 앞 지출 → 해당 차량 귀속
//      (같은 금융사에 여러 차량 대출이면 모호 — 건너뜀)
//   ④ 세금 등: 적요/거래처에 차량번호(12가3456 형태)가 박힌 지출 → 그 차량 귀속
//
// 멱등: 이미 car 귀속(related 또는 assignment)이 있는 거래는 건드리지 않음.
// note 로 출처 표시 — 잘못 귀속 시 손익 페이지에서 해제 가능.
// ═══════════════════════════════════════════════════════════════════

// 차량보험 양성 신호 — 렌터카공제/주요 손보사. '보험' 단독은 산재·고용·건강 오탐이라 제외
const INSURER_RE = /(렌터카공제|공제조합|손해보험|손보|화재해상|현대해상|삼성화재|메리츠화재|한화손해|흥국화재|db손해|kb손해|악사손해|axa|캐롯손해)/i
// 사회보험·지자체 납부 제외 (산재/고용/건강/연금, 시·군·구청 — 세금·과태료는 ④ 차량번호로만)
const EXCLUDE_RE = /(산재|고용보험|건강보험|국민연금|연금보험|4대보험|시청|군청|구청|[가-힣]{1,4}(시|군|구)\()/
const CAR_NO_RE = /\d{2,3}\s*[가-힣]\s*\d{4}/g
const digits = (s: unknown) => String(s || '').replace(/[^0-9]/g, '')
const N = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export type FixedCostResult = {
  scanned: number
  insurance: number
  loan: number
  carNumber: number
  samples: Array<{ kind: string; date: string; amount: number; client: string | null; to: string }>
}

export async function attributeFixedCosts(dryRun = true, monthsBack = 12): Promise<FixedCostResult> {
  // 미귀속 지출 (최근 N개월)
  const txs = await prisma.$queryRawUnsafe<any[]>(`
    SELECT t.id, DATE(t.transaction_date) d, t.amount, t.client_name, t.description
      FROM transactions t
     WHERE t.deleted_at IS NULL AND t.type = 'expense'
       AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL ${Number(monthsBack)} MONTH)
       AND (t.related_type IS NULL OR t.related_type NOT IN ('car'))
       AND NOT EXISTS (SELECT 1 FROM transaction_assignments ta
                        WHERE ta.transaction_id = t.id AND ta.assignment_type = 'car')`)

  const [cars, contracts, allocations, loans] = await Promise.all([
    prisma.$queryRaw<any[]>`SELECT id, number FROM cars WHERE number IS NOT NULL`,
    prisma.$queryRaw<any[]>`
      SELECT id, car_id, insurance_company, start_date, end_date FROM insurance_contracts
       WHERE end_date IS NOT NULL`,
    prisma.$queryRaw<any[]>`
      SELECT contract_id, car_id, premium_amount FROM insurance_vehicle_allocations WHERE car_id IS NOT NULL`,
    prisma.$queryRaw<any[]>`
      SELECT car_id, finance_name FROM loans
       WHERE car_id IS NOT NULL AND (status IS NULL OR status NOT IN ('closed','완료'))`,
  ])

  const carByDigits = new Map(cars.map((c) => [digits(c.number), c.id]))
  const allocByContract = new Map<string, Array<{ car_id: string; premium: number }>>()
  for (const a of allocations) {
    if (!allocByContract.has(a.contract_id)) allocByContract.set(a.contract_id, [])
    allocByContract.get(a.contract_id)!.push({ car_id: a.car_id, premium: N(a.premium_amount) })
  }
  // 금융사 → 차량 (여러 대면 모호로 표시)
  const loanByFinancer = new Map<string, string | 'ambiguous'>()
  for (const l of loans) {
    const key = String(l.finance_name || '').replace(/[\s㈜(주)]/g, '')
    if (!key) continue
    loanByFinancer.set(key, loanByFinancer.has(key) && loanByFinancer.get(key) !== l.car_id ? 'ambiguous' : l.car_id)
  }

  const result: FixedCostResult = { scanned: txs.length, insurance: 0, loan: 0, carNumber: 0, samples: [] }
  const addAssign = async (txId: string, carId: string, ratio: number, note: string) => {
    if (dryRun) return
    await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO transaction_assignments
         (id, transaction_id, assignment_type, assignment_id, ratio, note, source, created_at, updated_at)
       VALUES (UUID(), ?, 'car', ?, ?, ?, 'auto', NOW(), NOW())`,
      txId, carId, ratio, note)
  }
  const sample = (kind: string, t: any, to: string) => {
    if (result.samples.length < 12) {
      result.samples.push({ kind, date: String(t.d).slice(0, 10), amount: N(t.amount), client: t.client_name, to })
    }
  }

  for (const t of txs) {
    const text = `${t.client_name || ''} ${t.description || ''}`

    // ④ 적요 차량번호 — 가장 확실한 신호 (세금·검사비·과태료 등)
    const carNos = [...new Set((text.match(CAR_NO_RE) || []).map((m) => digits(m)))]
    if (carNos.length === 1 && carByDigits.has(carNos[0])) {
      await addAssign(t.id, carByDigits.get(carNos[0])!, 100, '적요 차량번호 자동귀속')
      result.carNumber += 1
      sample('차량번호', t, carNos[0])
      continue
    }

    // ③ 대출/할부 — loans 등록 금융사 매칭
    const clientKey = String(t.client_name || '').replace(/[\s㈜(주)]/g, '')
    if (clientKey.length >= 2 && !EXCLUDE_RE.test(text)) {
      let matchedCar: string | null = null
      for (const [financer, carId] of loanByFinancer) {
        if (carId === 'ambiguous') continue
        if (clientKey.includes(financer) || financer.includes(clientKey)) { matchedCar = carId; break }
      }
      if (matchedCar) {
        await addAssign(t.id, matchedCar, 100, '대출/할부 자동귀속')
        result.loan += 1
        sample('대출', t, matchedCar)
        continue
      }
    }

    // ① 보험료 — 거래일 유효 계약의 차량 분담 비율
    if (INSURER_RE.test(text) && !EXCLUDE_RE.test(text)) {
      const d = String(t.d).slice(0, 10)
      const active = contracts.filter((c) =>
        String(c.start_date || '').slice(0, 10) <= d && d <= String(c.end_date || '').slice(0, 10))
      const shares: Array<{ car_id: string; premium: number }> = []
      for (const c of active) {
        if (allocByContract.has(c.id)) shares.push(...allocByContract.get(c.id)!)
        else if (c.car_id) shares.push({ car_id: c.car_id, premium: 1 })
      }
      const total = shares.reduce((s, x) => s + (x.premium || 1), 0)
      if (shares.length > 0 && total > 0) {
        // 차량별 합산 비율 (같은 차량 중복 분담 합침)
        const byCar = new Map<string, number>()
        for (const s of shares) byCar.set(s.car_id, (byCar.get(s.car_id) || 0) + (s.premium || 1))
        for (const [carId, prem] of byCar) {
          const ratio = Math.round((prem / total) * 10000) / 100
          if (ratio <= 0) continue
          await addAssign(t.id, carId, ratio, '보험료 분담 자동귀속')
        }
        result.insurance += 1
        sample('보험료', t, `${byCar.size}대 분담`)
      }
    }
  }

  return result
}

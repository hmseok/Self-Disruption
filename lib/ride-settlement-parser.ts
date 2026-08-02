// ═══════════════════════════════════════════════════════════════
// 라이드(빌려타) 월 대차료 정산 엑셀 파서 (2026-08-01)
//
// 구조 (「월 정산」 시트 — 차량별 5열 블록이 가로로 4개씩 반복):
//   [차종/투입·반납 메모]           ← 블록 상단
//   [차량번호]
//   [월렌트료]
//   no. | 수식 | 입금일 | 보험사 | 고객차 | 입금액   ← 헤더 행
//   1   | …    | 46174  | AXA   | 103호9590 | 442260  ← 데이터 (입금일 = 엑셀 시리얼)
//
// 클라이언트/서버 겸용 — XLSX 는 호출측에서 파싱해 2차원 배열로 전달.
// ═══════════════════════════════════════════════════════════════

export interface RideDeposit {
  vehicleNumber: string
  vehicleModel: string | null
  monthlyFee: number | null
  depositDate: string | null   // YYYY-MM-DD
  insurer: string | null
  customerCar: string | null
  amount: number
}

export interface RideParseResult {
  month: string | null          // YYYY-MM (제목 행에서 추출)
  deposits: RideDeposit[]
  vehicles: Array<{ vehicleNumber: string; vehicleModel: string | null; monthlyFee: number | null; depositTotal: number; count: number }>
  grandTotal: number
}

const CAR_NO_RE = /^\s*\d{2,3}\s*[가-힣]\s*\d{4}\s*$/

function excelSerialToISO(v: unknown): string | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 40000 || n > 60000) return null
  const d = new Date(Math.round((n - 25569) * 86400000))
  return d.toISOString().slice(0, 10)
}
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[,\s원]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function parseRideSettlement(rows: unknown[][]): RideParseResult {
  const S = (r: number, c: number) => String(rows[r]?.[c] ?? '').trim()

  // 정산월 — 제목 행 "2026 6월 라이드 …"
  let month: string | null = null
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const line = (rows[r] || []).map(c => String(c)).join(' ')
    const m = line.match(/(\d{4})\s*[.\s년]\s*(\d{1,2})\s*월/)
    if (m) { month = `${m[1]}-${m[2].padStart(2, '0')}`; break }
  }

  const deposits: RideDeposit[] = []
  const vehMeta = new Map<string, { model: string | null; fee: number | null }>()

  // 헤더 행마다 '입금일' 셀 위치 = 블록
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || []
    for (let c = 0; c < row.length; c++) {
      if (String(row[c]).trim() !== '입금일') continue
      // 블록 컬럼: 입금일 c, 보험사 c+1, 고객차 c+2, 입금액 c+3
      // 차량번호: 위쪽 3행 이내, c-1 열 (헤더 앞의 '수식' 열과 같은 열)
      let vehicleNumber = ''
      let vehicleModel: string | null = null
      let monthlyFee: number | null = null
      for (let up = 1; up <= 4 && r - up >= 0; up++) {
        const cand = S(r - up, c - 1)
        if (CAR_NO_RE.test(cand)) {
          vehicleNumber = cand.replace(/\s+/g, '')
          vehicleModel = S(r - up - 1, c - 1) || null
          monthlyFee = num(rows[r - up + 1]?.[c - 1]) || null
          break
        }
      }
      if (!vehicleNumber) continue
      if (!vehMeta.has(vehicleNumber)) vehMeta.set(vehicleNumber, { model: vehicleModel, fee: monthlyFee })

      // 데이터 행 수집 — 헤더 다음 행부터, 입금액이 있는 행만. 푸터(월렌트료/합) 만나면 종료
      for (let dr = r + 1; dr < rows.length; dr++) {
        const marker = S(dr, c) + S(dr, c - 1) + S(dr, c + 1)
        if (/월렌트료|합계|^합/.test(marker)) break
        if (String(rows[dr]?.[c] ?? '').trim() === '입금일') break // 다음 블록 구간
        const amount = num(rows[dr]?.[c + 3])
        if (amount <= 0) continue
        deposits.push({
          vehicleNumber,
          vehicleModel,
          monthlyFee,
          depositDate: excelSerialToISO(rows[dr]?.[c]) || excelSerialToISO(rows[dr]?.[c - 1]),
          insurer: S(dr, c + 1) || null,
          customerCar: S(dr, c + 2) || null,
          amount,
        })
      }
    }
  }

  const vehicles = [...vehMeta.entries()].map(([vehicleNumber, meta]) => {
    const items = deposits.filter(d => d.vehicleNumber === vehicleNumber)
    return {
      vehicleNumber, vehicleModel: meta.model, monthlyFee: meta.fee,
      depositTotal: items.reduce((s, d) => s + d.amount, 0), count: items.length,
    }
  })

  return {
    month, deposits, vehicles,
    grandTotal: deposits.reduce((s, d) => s + d.amount, 0),
  }
}

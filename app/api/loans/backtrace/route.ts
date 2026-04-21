// POST /api/loans/backtrace
// transactions 테이블의 리스/할부 납부 내역을 그룹화하여 loans 레코드를 자동 생성
//
// Request body:
//   {
//     start_date: string (YYYY-MM-DD),
//     end_date:   string (YYYY-MM-DD),
//     min_confidence?: number (0.0 ~ 1.0, default 0.5),
//     dry_run?: boolean (default true)
//   }
//
// Response:
//   {
//     data: {
//       run_id?: string,              // apply 시 발급 (ISO DATETIME, backtrace_at)
//       dry_run: boolean,
//       candidates: [{
//         finance_name, monthly_payment, total_amount, months,
//         first_date, last_date, payment_day,
//         ai_confidence, source_transaction_ids, sample_descriptions,
//         inserted_loan_id?: string   // apply 시
//       }],
//       stats: { candidates_total, applied, skipped_low_confidence }
//     },
//     error: null
//   }
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ─── 금융사 키워드 (description 매칭) ──────────────────────────
// 우선순위 순 (긴 키워드 먼저)
const FINANCE_KEYWORDS: { keyword: string; normalized: string; weight: number }[] = [
  { keyword: '현대캐피탈',   normalized: '현대캐피탈',   weight: 1.0 },
  { keyword: 'KB캐피탈',     normalized: 'KB캐피탈',     weight: 1.0 },
  { keyword: '신한캐피탈',   normalized: '신한캐피탈',   weight: 1.0 },
  { keyword: '우리캐피탈',   normalized: '우리캐피탈',   weight: 1.0 },
  { keyword: '하나캐피탈',   normalized: '하나캐피탈',   weight: 1.0 },
  { keyword: 'BC캐피탈',     normalized: 'BC캐피탈',     weight: 1.0 },
  { keyword: '롯데캐피탈',   normalized: '롯데캐피탈',   weight: 1.0 },
  { keyword: 'JB우리캐피탈', normalized: 'JB우리캐피탈', weight: 1.0 },
  { keyword: 'BMW파이낸셜',  normalized: 'BMW파이낸셜',  weight: 1.0 },
  { keyword: '벤츠파이낸셜', normalized: '벤츠파이낸셜', weight: 1.0 },
  { keyword: '메르세데스',   normalized: '벤츠파이낸셜', weight: 0.9 },
  { keyword: '산은캐피탈',   normalized: '산은캐피탈',   weight: 1.0 },
  { keyword: 'DGB캐피탈',    normalized: 'DGB캐피탈',    weight: 1.0 },
  { keyword: '애큐온캐피탈', normalized: '애큐온캐피탈', weight: 1.0 },
  { keyword: '오릭스캐피탈', normalized: '오릭스캐피탈', weight: 1.0 },
  { keyword: '캐피탈',       normalized: '기타캐피탈',   weight: 0.6 },
  { keyword: '리스',         normalized: '리스',         weight: 0.55 },
  { keyword: '할부',         normalized: '할부',         weight: 0.50 },
  { keyword: '금융',         normalized: '금융',         weight: 0.40 },
]

function detectFinance(desc: string | null, category: string | null): { normalized: string; weight: number } | null {
  // 1차: description 에서 특정 금융사 키워드 검출
  if (desc) {
    for (const f of FINANCE_KEYWORDS) {
      if (desc.includes(f.keyword)) return { normalized: f.normalized, weight: f.weight }
    }
  }
  // 2차: category 기반 폴백 (description 매칭 실패 시)
  if (category) {
    if (category.includes('할부')) return { normalized: '할부(카테고리)', weight: 0.5 }
    if (category.includes('리스')) return { normalized: '리스(카테고리)', weight: 0.5 }
    if (category.includes('대출')) return { normalized: '대출(카테고리)', weight: 0.55 }
  }
  return null
}

// ±5% 금액 버킷: 금액을 1%로 반올림 후 정수로 변환 → 같은 그룹 판정용
function amountBucket(amount: number): number {
  return Math.round(amount / 1000) * 1000 // 1000원 단위 반올림
}

interface TxRow {
  id: string
  transaction_date: Date | string | null
  amount: string | number | null
  description: string | null
  category: string | null
  type: string | null
}

interface Candidate {
  finance_name: string
  monthly_payment: number
  total_amount: number
  months: number
  first_date: string
  last_date: string
  payment_day: number
  ai_confidence: number
  source_transaction_ids: string[]
  sample_descriptions: string[]
}

function computeConfidence(opts: {
  financeWeight: number
  amountStdevRatio: number  // 0 = 완벽 일정, 1 = 제각각
  intervalRegularity: number // 0 ~ 1 (1 = 정확히 매월)
  occurrenceCount: number
}): number {
  const { financeWeight, amountStdevRatio, intervalRegularity, occurrenceCount } = opts

  const amountScore   = 1 - Math.min(amountStdevRatio, 1)          // 0~1
  const intervalScore = intervalRegularity                          // 0~1
  const countScore    = Math.min(occurrenceCount / 12, 1)           // 12회 이상이면 만점

  // 가중치: 금융사 매치 0.35, 금액 일정 0.25, 주기 정규 0.25, 반복횟수 0.15
  const score =
    financeWeight * 0.35 +
    amountScore   * 0.25 +
    intervalScore * 0.25 +
    countScore    * 0.15

  return Math.round(score * 100) / 100
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const startDate: string = body.start_date
    const endDate: string = body.end_date
    const minConfidence: number = typeof body.min_confidence === 'number' ? body.min_confidence : 0.5
    const dryRun: boolean = body.dry_run !== false // default true

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'start_date, end_date 필수' }, { status: 400 })
    }

    // ─── STEP 1: 후보 트랜잭션 조회 ─────────────────────────
    // expense 타입 + (금융사 키워드 OR 대출 관련 카테고리)
    const txs = await prisma.$queryRaw<TxRow[]>`
      SELECT id, transaction_date, amount, description, category, type
      FROM transactions
      WHERE deleted_at IS NULL
        AND (type = 'expense' OR (type IS NULL AND amount < 0))
        AND transaction_date BETWEEN ${startDate} AND ${endDate}
        AND (
          (description IS NOT NULL AND (
            description LIKE '%캐피탈%' OR
            description LIKE '%리스%' OR
            description LIKE '%할부%' OR
            description LIKE '%파이낸셜%' OR
            description LIKE '%금융%'
          ))
          OR (category IS NOT NULL AND (
            category LIKE '%할부%' OR
            category LIKE '%리스%' OR
            category LIKE '%대출%'
          ))
        )
        AND (related_type IS NULL OR related_type = '' OR related_type = 'loan')
      ORDER BY transaction_date ASC
    `

    // ─── STEP 2: (금융사 정규화, 금액버킷) 키로 그룹화 ─────────
    interface Group {
      key: string
      normalized: string
      weight: number
      amountBucket: number
      rows: TxRow[]
    }
    const groupMap = new Map<string, Group>()

    for (const tx of txs) {
      const detected = detectFinance(tx.description, tx.category)
      if (!detected) continue
      const amt = Math.abs(Number(tx.amount) || 0)
      if (amt <= 0) continue
      const bucket = amountBucket(amt)
      const key = `${detected.normalized}::${bucket}`
      let g = groupMap.get(key)
      if (!g) {
        g = { key, normalized: detected.normalized, weight: detected.weight, amountBucket: bucket, rows: [] }
        groupMap.set(key, g)
      }
      g.rows.push(tx)
    }

    // ─── STEP 3: 각 그룹별 후보 loan 계산 ─────────────────────
    const candidates: Candidate[] = []
    for (const g of groupMap.values()) {
      if (g.rows.length < 3) continue // 최소 3회 반복

      const amounts = g.rows.map(r => Math.abs(Number(r.amount) || 0))
      const dates = g.rows.map(r => new Date(r.transaction_date as string))
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
      const amountStdev = Math.sqrt(amounts.reduce((s, x) => s + (x - avgAmount) ** 2, 0) / amounts.length)
      const amountStdevRatio = avgAmount > 0 ? amountStdev / avgAmount : 1

      // 주기 정규성: 인접 거래간 일수 차이의 표준편차로 판정 (목표 ~30일)
      const intervals: number[] = []
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24))
      }
      const avgInterval = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 30
      // 월주기 (25~35일) 에 얼마나 가까운지 — 표준편차 + 평균치 근접 모두 반영
      const intervalDeviation = intervals.length
        ? Math.sqrt(intervals.reduce((s, x) => s + (x - avgInterval) ** 2, 0) / intervals.length)
        : 30
      const avgDistFromMonth = Math.abs(avgInterval - 30)
      const intervalRegularity = Math.max(0, 1 - (intervalDeviation / 30) - (avgDistFromMonth / 60))

      const confidence = computeConfidence({
        financeWeight: g.weight,
        amountStdevRatio,
        intervalRegularity,
        occurrenceCount: g.rows.length,
      })

      // 결제일 (가장 자주 나오는 day of month)
      const dayCounts = new Map<number, number>()
      for (const d of dates) dayCounts.set(d.getDate(), (dayCounts.get(d.getDate()) || 0) + 1)
      let paymentDay = 1, maxCount = 0
      for (const [day, cnt] of dayCounts) {
        if (cnt > maxCount) { paymentDay = day; maxCount = cnt }
      }

      // 정렬된 날짜
      const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime())
      const firstDate = sortedDates[0]
      const lastDate = sortedDates[sortedDates.length - 1]

      candidates.push({
        finance_name: g.normalized,
        monthly_payment: Math.round(avgAmount),
        total_amount: Math.round(avgAmount * g.rows.length),
        months: g.rows.length,
        first_date: firstDate.toISOString().slice(0, 10),
        last_date: lastDate.toISOString().slice(0, 10),
        payment_day: paymentDay,
        ai_confidence: confidence,
        source_transaction_ids: g.rows.map(r => r.id),
        sample_descriptions: Array.from(new Set(g.rows.map(r => r.description).filter(Boolean) as string[])).slice(0, 3),
      })
    }

    // confidence 내림차순 정렬
    candidates.sort((a, b) => b.ai_confidence - a.ai_confidence)

    // ─── STEP 4: dry-run 이면 여기서 끝 ──────────────────────
    if (dryRun) {
      return NextResponse.json({
        data: {
          dry_run: true,
          candidates,
          stats: {
            candidates_total: candidates.length,
            candidates_above_threshold: candidates.filter(c => c.ai_confidence >= minConfidence).length,
          },
        },
        error: null,
      })
    }

    // ─── STEP 5: 실제 INSERT ─────────────────────────────────
    // loans.id 는 bigint NOT NULL (no AUTO_INCREMENT), updated_at 컬럼 없음
    // 타임스탬프 기반 고유 id 생성 (ms + counter 로 충돌 방지)
    const runTs = Date.now()
    const runId = new Date(runTs)
    const runIdStr = runId.toISOString().slice(0, 19).replace('T', ' ')
    let applied = 0
    let skipped = 0
    let counter = 0

    for (const cand of candidates) {
      if (cand.ai_confidence < minConfidence) {
        skipped++
        continue
      }
      // bigint: (timestamp_ms * 1000) + counter → 같은 배치 내 유일성 보장
      const loanId = (runTs * 1000) + (counter++)
      await prisma.$executeRaw`
        INSERT INTO loans (
          id, finance_name, type, total_amount, monthly_payment,
          start_date, end_date, payment_date,
          months, source_transaction_ids, auto_generated, ai_confidence, backtrace_at,
          created_at
        ) VALUES (
          ${loanId}, ${cand.finance_name}, 'auto_backtrace',
          ${cand.total_amount}, ${cand.monthly_payment},
          ${cand.first_date}, ${cand.last_date}, ${cand.payment_day},
          ${cand.months}, ${JSON.stringify(cand.source_transaction_ids)},
          1, ${cand.ai_confidence}, ${runIdStr},
          NOW(3)
        )
      `

      // 해당 트랜잭션들을 loan 에 연결 (역참조)
      // transactions.related_id 는 char(36) 이므로 문자열로 저장
      const loanIdStr = String(loanId)
      if (cand.source_transaction_ids.length > 0) {
        const placeholders = cand.source_transaction_ids.map(() => '?').join(',')
        await prisma.$executeRawUnsafe(
          `UPDATE transactions SET related_type = 'loan', related_id = ? WHERE id IN (${placeholders})`,
          loanIdStr,
          ...cand.source_transaction_ids
        )
      }

      ;(cand as Candidate & { inserted_loan_id?: string }).inserted_loan_id = loanIdStr
      applied++
    }

    return NextResponse.json({
      data: {
        run_id: runIdStr,
        dry_run: false,
        candidates,
        stats: {
          candidates_total: candidates.length,
          applied,
          skipped_low_confidence: skipped,
        },
      },
      error: null,
    })
  } catch (e: any) {
    console.error('[POST /api/loans/backtrace]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

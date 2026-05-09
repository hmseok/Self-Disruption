/**
 * POST /api/ride-settlements/[id]/auto-match
 *
 * settlement_id 의 모든 items 를 자체 DB + 카페24 와 자동 매칭.
 *
 * 매칭 알고리즘 (우선순위):
 *   1. ride_contracts.exec_no = item.exec_no                              → score 1.0 / matched
 *   2. ride_capital_reports.car_number = item.car_number (가장 최근)       → score 0.7 / partial
 *   3. cafe24 pmccarsm.carsnums = item.car_number (효력기간 활성)          → score 0.6 / partial
 *   하나라도 매칭 → match_status = matched 또는 partial
 *   전부 미매칭 → match_status = unmatched / score = 0
 *
 * 입력 (json):
 *   { dry_run?: boolean }     dry_run=true → 통계만, 실제 UPDATE X
 *
 * PR-6.11.b
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

interface ItemRow {
  id: string
  exec_no: string | null
  car_number: string | null
  vin: string | null
}

interface ContractMatch {
  id: string
  exec_no: string | null
  car_number: string | null
}

interface ReportMatch {
  id: string
  car_number: string | null
  report_date: string | null
}

interface Cafe24Match extends RowDataPacket {
  carsidno: string
  carsnums: string | null
  carsodnm: string | null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params

  let body: { dry_run?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    /* body optional */
  }
  const dryRun = body.dry_run === true

  // 1. items 조회 (필요 컬럼만)
  const items = await prisma.$queryRaw<ItemRow[]>`
    SELECT id, exec_no, car_number, vin
      FROM ride_settlement_items
     WHERE settlement_id = ${id}
  `
  if (items.length === 0) {
    return NextResponse.json({ success: false, error: 'no items' }, { status: 400 })
  }

  // 2. 후보 키 set
  const execNos = Array.from(new Set(items.map(i => i.exec_no).filter((x): x is string => !!x)))
  const carNums = Array.from(new Set(items.map(i => i.car_number).filter((x): x is string => !!x)))

  // 3. 자체 ride_contracts (exec_no 매칭)
  const contractsByExec = new Map<string, ContractMatch>()
  if (execNos.length > 0) {
    const placeholders = execNos.map(() => '?').join(',')
    const rows = await prisma.$queryRawUnsafe<ContractMatch[]>(
      `SELECT id, exec_no, car_number FROM ride_contracts WHERE exec_no IN (${placeholders})`,
      ...execNos
    )
    for (const r of rows) {
      if (r.exec_no) contractsByExec.set(r.exec_no, r)
    }
  }

  // 4. 자체 ride_capital_reports (car_number 매칭, 가장 최근만 1개)
  const reportsByCar = new Map<string, ReportMatch>()
  if (carNums.length > 0) {
    const placeholders = carNums.map(() => '?').join(',')
    const rows = await prisma.$queryRawUnsafe<ReportMatch[]>(
      `SELECT id, car_number, report_date
         FROM ride_capital_reports
        WHERE car_number IN (${placeholders})
        ORDER BY report_date DESC, created_at DESC`,
      ...carNums
    )
    // 첫 row (가장 최근) 만 보존
    for (const r of rows) {
      if (r.car_number && !reportsByCar.has(r.car_number)) {
        reportsByCar.set(r.car_number, r)
      }
    }
  }

  // 5. 카페24 pmccarsm (carsnums 매칭, 효력기간 활성)
  const cafe24ByCar = new Map<string, Cafe24Match>()
  let cafe24Error: string | null = null
  if (carNums.length > 0) {
    try {
      const today = new Date()
      const todayStr =
        today.getFullYear().toString() +
        String(today.getMonth() + 1).padStart(2, '0') +
        String(today.getDate()).padStart(2, '0')
      // batch 200 단위 (IN 절 너무 길면 위험)
      const batchSize = 200
      for (let i = 0; i < carNums.length; i += batchSize) {
        const batch = carNums.slice(i, i + batchSize)
        const placeholders = batch.map(() => '?').join(',')
        const sql = `
          SELECT carsidno, carsnums, carsodnm
            FROM pmccarsm
           WHERE ? BETWEEN carsfrdt AND carstodt
             AND carsnums IN (${placeholders})
        `
        const rows = await cafe24Db.query<Cafe24Match>(sql, [todayStr, ...batch])
        for (const r of rows) {
          if (r.carsnums && !cafe24ByCar.has(r.carsnums)) {
            cafe24ByCar.set(r.carsnums, r)
          }
        }
      }
    } catch (e) {
      cafe24Error = (e as Error).message
      console.error('[auto-match] cafe24 query error:', cafe24Error)
    }
  }

  // 6. 매칭 산정
  let matched = 0
  let partial = 0
  let unmatched = 0
  const updates: {
    id: string
    matched_contract_id: string | null
    matched_report_id: string | null
    matched_cafe24_idno: string | null
    match_status: 'matched' | 'partial' | 'unmatched'
    match_score: number
    match_notes: string
  }[] = []

  for (const item of items) {
    const contractMatch = item.exec_no ? contractsByExec.get(item.exec_no) : null
    const reportMatch = item.car_number ? reportsByCar.get(item.car_number) : null
    const cafe24Match = item.car_number ? cafe24ByCar.get(item.car_number) : null

    const notes: string[] = []
    let score = 0
    if (contractMatch) {
      score = Math.max(score, 1.0)
      notes.push(`contract:${contractMatch.id.slice(0, 8)}`)
    }
    if (reportMatch) {
      score = Math.max(score, 0.7)
      notes.push(`report:${reportMatch.id.slice(0, 8)}`)
    }
    if (cafe24Match) {
      score = Math.max(score, 0.6)
      notes.push(`cafe24:${cafe24Match.carsidno}`)
    }

    let status: 'matched' | 'partial' | 'unmatched'
    if (score >= 1.0) {
      status = 'matched'
      matched++
    } else if (score > 0) {
      status = 'partial'
      partial++
    } else {
      status = 'unmatched'
      unmatched++
    }

    updates.push({
      id: item.id,
      matched_contract_id: contractMatch?.id || null,
      matched_report_id: reportMatch?.id || null,
      matched_cafe24_idno: cafe24Match?.carsidno || null,
      match_status: status,
      match_score: score,
      match_notes: notes.join(', ') || '',
    })
  }

  // 7. apply UPDATE (dry_run X)
  let applied = 0
  if (!dryRun) {
    for (const u of updates) {
      try {
        await prisma.$executeRaw`
          UPDATE ride_settlement_items
             SET matched_contract_id = ${u.matched_contract_id},
                 matched_report_id = ${u.matched_report_id},
                 matched_cafe24_idno = ${u.matched_cafe24_idno},
                 match_status = ${u.match_status},
                 match_score = ${u.match_score},
                 match_notes = ${u.match_notes}
           WHERE id = ${u.id}
        `
        applied++
      } catch (e) {
        console.warn('[auto-match update]', (e as Error).message)
      }
    }
  }

  return NextResponse.json({
    success: true,
    settlement_id: id,
    dry_run: dryRun,
    counts: {
      total: items.length,
      matched,
      partial,
      unmatched,
      applied,
    },
    sources: {
      ride_contracts: contractsByExec.size,
      ride_capital_reports: reportsByCar.size,
      cafe24_pmccarsm: cafe24ByCar.size,
      cafe24_error: cafe24Error,
    },
  })
}

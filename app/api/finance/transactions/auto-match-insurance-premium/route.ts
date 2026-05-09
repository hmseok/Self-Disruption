import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * /api/finance/transactions/auto-match-insurance-premium
 *
 * 통장 보험료 출금 → 차량별 분담금 자동 분배 (PR-UX9.1, 2026-05-09).
 *
 * 기존 테이블 활용 (사용자 명시 — /insurance 페이지에서 이미 관리):
 *   - insurance_contracts (보험계약 — insurance_company / start_date / end_date / total_premium)
 *   - insurance_vehicle_allocations (차량별 분담금 — contract_id / car_id / premium_amount)
 *   - insurance_payment_schedule (납입 스케줄 — contract_id / installment_no / due_date / amount / status)
 *
 * 매칭 로직:
 *   1. 통장 출금 (type='expense', imported_from LIKE 'excel_bank%')
 *   2. 보험사 키워드 매칭 (DB / 디비 / 메리츠 / 현대 / 삼성 / KB / 한화 등)
 *   3. 출금일 ±N일 인 insurance_payment_schedule (status='pending') 조회
 *   4. amount 일치 (±tolerance) → 해당 schedule 의 contract 의 차량 분담금 비율로 매칭
 *   5. transaction_assignments 다중 INSERT (각 차량 비율로)
 *   6. (선택) insurance_payment_schedule.status = 'paid' 처리
 *
 * POST body: { dryRun?: false, dateTolerance?: 7, amountTolerance?: 0.05 }
 */
export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// 보험사 키워드 → 정규화 (insurance_contracts.insurance_company 와 매칭)
function normalizeInsurer(s: string): string {
  const trimmed = String(s || '').trim()
  // 사용자 입력 client_name 에서 보험사 추출
  if (/디비|DB/i.test(trimmed))    return 'DB손해보험'
  if (/메리츠|메츠/i.test(trimmed)) return '메리츠화재'
  if (/현대해상|현대/i.test(trimmed)) return '현대해상'
  if (/삼성화재|삼성/i.test(trimmed)) return '삼성화재'
  if (/KB|kb|국민/i.test(trimmed))  return 'KB손해보험'
  if (/한화|캐롯/i.test(trimmed))   return '한화손해보험'
  if (/롯데/i.test(trimmed))        return '롯데손해보험'
  if (/흥국/i.test(trimmed))        return '흥국화재'
  if (/농협|NH/i.test(trimmed))     return '농협손해보험'
  if (/AXA|악사/i.test(trimmed))    return 'AXA'
  if (/렌터카공제|렌공/i.test(trimmed)) return '전국렌터카공제조합'
  return ''
}

interface MatchResult {
  matched: number
  no_company: number
  no_schedule: number
  amount_mismatch: number
  total_candidates: number
  applied: number
  samples: Array<any>
  failed_samples: Array<any>
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const dateTolerance = Math.max(0, Math.min(30, Number(body.dateTolerance) || 7))
    const amountTolerance = Math.max(0.01, Math.min(0.5, Number(body.amountTolerance) || 0.05))

    // ── 매칭 후보 — 통장 출금 ──
    const candidates = await prisma.$queryRaw<Array<any>>`
      SELECT id, transaction_date, amount, client_name, description, category, imported_from
        FROM transactions
       WHERE deleted_at IS NULL
         AND type = 'expense'
         AND (related_type IS NULL OR related_id IS NULL)
         AND (imported_from LIKE 'excel_bank%' OR imported_from = 'sms_bank')
         AND client_name IS NOT NULL AND client_name != ''
       ORDER BY transaction_date DESC
       LIMIT 5000
    `

    const result: MatchResult = {
      matched: 0,
      no_company: 0,
      no_schedule: 0,
      amount_mismatch: 0,
      total_candidates: candidates.length,
      applied: 0,
      samples: [],
      failed_samples: [],
    }

    for (const tx of candidates) {
      const clientRaw = String(tx.client_name || '').trim()
      const insurer = normalizeInsurer(clientRaw)
      if (!insurer) {
        result.no_company++
        continue
      }

      const txDate = String(tx.transaction_date || '').slice(0, 10)
      const txAmount = Math.abs(Number(tx.amount || 0))

      // ── 출금일 ±N일 인 미납 스케줄 조회 (보험사 일치) ──
      let schedules: Array<any> = []
      try {
        schedules = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT ips.id AS schedule_id, ips.contract_id, ips.installment_no, ips.due_date, ips.amount, ips.status,
                  ic.insurance_company, ic.start_date AS contract_start, ic.end_date AS contract_end
             FROM insurance_payment_schedule ips
             JOIN insurance_contracts ic ON ic.id = ips.contract_id
            WHERE ic.insurance_company LIKE ?
              AND ABS(DATEDIFF(ips.due_date, ?)) <= ?
              AND ips.status IN ('pending', 'paid')
            ORDER BY ABS(DATEDIFF(ips.due_date, ?)) ASC
            LIMIT 5`,
          `%${insurer}%`, txDate, dateTolerance, txDate,
        )
      } catch (e: any) {
        // 테이블 없으면 silent skip
        return NextResponse.json({
          ...result,
          dry_run: dryRun,
          message: 'insurance_contracts/schedule 테이블 없음 — /insurance 페이지에서 분담 등록 필요',
        })
      }

      if (schedules.length === 0) {
        result.no_schedule++
        if (result.failed_samples.length < 50) {
          result.failed_samples.push({
            tx_id: tx.id, client_name: clientRaw, amount: txAmount,
            reason: `${insurer} 활성 분담 스케줄 없음 (${txDate} ±${dateTolerance}일)`,
          })
        }
        continue
      }

      // ── 금액 일치 스케줄 찾기 ──
      const matchSchedule = schedules.find(s => {
        const sAmt = Math.abs(Number(s.amount || 0))
        if (sAmt === 0) return false
        return Math.abs(txAmount - sAmt) / sAmt <= amountTolerance
      })

      if (!matchSchedule) {
        result.amount_mismatch++
        if (result.failed_samples.length < 50) {
          result.failed_samples.push({
            tx_id: tx.id, client_name: clientRaw, amount: txAmount,
            reason: `금액 mismatch — 출금 ${txAmount} / 후보 ${schedules.length}건 (${schedules.slice(0, 3).map(s => Number(s.amount)).join(',')})`,
          })
        }
        continue
      }

      // ── 해당 contract 의 차량별 분담금 조회 ──
      const allocations = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT iva.car_id, iva.premium_amount, iva.vehicle_label,
                c.number AS car_number
           FROM insurance_vehicle_allocations iva
           LEFT JOIN cars c ON c.id = iva.car_id
          WHERE iva.contract_id = ?
            AND iva.car_id IS NOT NULL`,
        matchSchedule.contract_id,
      )

      if (allocations.length === 0) {
        result.no_schedule++
        if (result.failed_samples.length < 50) {
          result.failed_samples.push({
            tx_id: tx.id, client_name: clientRaw,
            reason: `contract ${String(matchSchedule.contract_id).slice(0, 8)} 차량 분담 없음 (차량 미매핑)`,
          })
        }
        continue
      }

      // 매칭 성공
      result.matched++
      const totalPremium = allocations.reduce((s, a) => s + Number(a.premium_amount || 0), 0)
      if (result.samples.length < 50) {
        result.samples.push({
          tx_id: tx.id, client_name: clientRaw, amount: txAmount,
          insurer, contract_id: matchSchedule.contract_id,
          installment_no: matchSchedule.installment_no, due_date: matchSchedule.due_date,
          schedule_amount: Number(matchSchedule.amount),
          vehicle_count: allocations.length,
          vehicles: allocations.slice(0, 5).map(a => ({
            car_number: a.car_number, premium_amount: Number(a.premium_amount),
            ratio: totalPremium > 0 ? Math.round((Number(a.premium_amount) / totalPremium) * 1000) / 10 : 0,
          })),
        })
      }

      if (dryRun) continue

      try {
        // (a) 1차 매칭 — transactions.related_type='car' (첫 차량)
        await prisma.$executeRawUnsafe(
          `UPDATE transactions SET related_type = 'car', related_id = ?, updated_at = NOW() WHERE id = ?`,
          allocations[0].car_id, tx.id,
        )
        // (b) transaction_assignments — 차량별 분담금 비율로 다중 INSERT
        for (const alloc of allocations) {
          const ratio = totalPremium > 0
            ? Math.round((Number(alloc.premium_amount) / totalPremium) * 10000) / 100
            : (100 / allocations.length)
          await prisma.$executeRawUnsafe(
            `INSERT IGNORE INTO transaction_assignments
               (id, transaction_id, assignment_type, assignment_id, ratio, source, note, created_at, updated_at)
             VALUES (?, ?, 'car', ?, ?, 'auto', ?, NOW(), NOW())`,
            randomUUID(), tx.id, alloc.car_id, ratio,
            `보험료 분담 (${insurer} 회차 ${matchSchedule.installment_no})`,
          )
        }
        // (c) insurance_payment_schedule.status = 'paid' (이미 paid 면 무시)
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE insurance_payment_schedule SET status = 'paid', updated_at = NOW()
              WHERE id = ? AND status = 'pending'`,
            matchSchedule.schedule_id,
          )
        } catch { /* schedule 컬럼 미존재 시 silent */ }
        result.applied++
      } catch (e: any) {
        console.error('[auto-match-insurance-premium] apply failed:', tx.id, e?.message)
        if (result.failed_samples.length < 50) {
          result.failed_samples.push({
            tx_id: tx.id, client_name: clientRaw,
            reason: `apply 실패: ${e?.message?.slice(0, 100)}`,
          })
        }
      }
    }

    return NextResponse.json({
      ...result,
      dry_run: dryRun,
      message: dryRun
        ? `dry-run — 매칭 가능 ${result.matched}건 (보험사X ${result.no_company} / 스케줄없음 ${result.no_schedule} / 금액불일치 ${result.amount_mismatch})`
        : `${result.applied}건 매칭 적용 — 차량별 보험료 분담금 분배 (insurance_contracts + allocations + schedule)`,
    })
  } catch (e: any) {
    console.error('[auto-match-insurance-premium POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

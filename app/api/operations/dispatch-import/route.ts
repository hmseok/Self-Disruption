import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'
import { parseDispatchExcel, type DispatchRecord } from '@/lib/dispatch-excel-parser'

/**
 * POST /api/operations/dispatch-import — 배차 엑셀(대차 현황) 정규화 import (PR-V2)
 *
 *   FormData: file = .xlsx
 *   query/body: apply=1 → 실제 적용 (없으면 미리보기 dry-run)
 *
 * 안전: fill-only upsert — 기존 값이 비었거나 '(미상)' 인 컬럼만 엑셀값으로 채움.
 *       기존 내용 절대 덮어쓰기/삭제 X. key = vehicle_car_number+dispatch_date+customer_car_number.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// billed/paid → status
function deriveStatus(rec: DispatchRecord): string {
  if (rec.paid) return 'settled'
  if (rec.billed && rec.billed.includes('완료')) return 'claiming'
  return 'returned'
}

// fill-only 채움 대상 (빈 값/'(미상)' 일 때만) — 컬럼명 ↔ 레코드값
function fillableCols(rec: DispatchRecord): { col: string; val: any; treatMisangAsEmpty?: boolean }[] {
  return [
    { col: 'customer_name', val: rec.customer_name, treatMisangAsEmpty: true },
    { col: 'customer_phone', val: rec.customer_phone },
    { col: 'customer_car_type', val: rec.customer_car_type },
    { col: 'vehicle_car_type', val: rec.vehicle_car_type },
    { col: 'adjuster_name', val: rec.adjuster_name },
    { col: 'adjuster_phone', val: rec.adjuster_phone },
    { col: 'customer_birth', val: rec.customer_birth },
    { col: 'insurance_company', val: rec.insurance_company },
    { col: 'insurance_claim_no', val: rec.insurance_claim_no },
    { col: 'dispatch_location', val: rec.dispatch_location },
    { col: 'repair_factory', val: rec.repair_factory },
    { col: 'dispatch_seq', val: rec.dispatch_seq },
    { col: 'self_vehicle_yn', val: rec.self_vehicle_yn ? 1 : 0 },
  ].filter((c) => c.val !== '' && c.val !== null && c.val !== undefined)
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const form = await request.formData().catch(() => null)
    const file = form?.get('file') as File | null
    const apply = form?.get('apply') === '1'
    if (!file) return NextResponse.json({ error: '엑셀 파일(file) 필요' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
    const { records, skipped, insurerHits } = parseDispatchExcel(wb)

    if (!apply) {
      // 미리보기 (dry-run) — DB 미변경
      return NextResponse.json({
        mode: 'preview',
        total: records.length,
        skipped,
        insurerHits,
        sample: records.slice(0, 12),
        error: null,
      })
    }

    // ── 적용: fill-only upsert ──
    let inserted = 0, updated = 0, unchanged = 0, errors = 0
    for (const rec of records) {
      try {
        if (!rec.dispatch_date) { errors++; continue }
        const existing = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM fmi_rentals
           WHERE vehicle_car_number = ? AND dispatch_date = ? AND COALESCE(customer_car_number,'') = ?
           LIMIT 1`,
          rec.vehicle_car_number, rec.dispatch_date, rec.customer_car_number
        )
        if (existing && existing.length > 0) {
          const cols = fillableCols(rec)
          if (cols.length === 0) { unchanged++; continue }
          const setFrags: string[] = []
          const vals: any[] = []
          for (const c of cols) {
            const emptyCond = c.treatMisangAsEmpty
              ? `(${c.col} IS NULL OR ${c.col}='' OR ${c.col}='(미상)')`
              : `(${c.col} IS NULL OR ${c.col}='')`
            setFrags.push(`${c.col} = CASE WHEN ${emptyCond} THEN ? ELSE ${c.col} END`)
            vals.push(c.val)
          }
          setFrags.push('updated_at = NOW()')
          vals.push(existing[0].id)
          await prisma.$executeRawUnsafe(
            `UPDATE fmi_rentals SET ${setFrags.join(', ')} WHERE id = ?`, ...vals
          )
          updated++
        } else {
          await prisma.$executeRawUnsafe(
            `INSERT INTO fmi_rentals
              (id, fleet_group, dispatch_seq, vehicle_car_number, vehicle_car_type,
               customer_car_number, customer_car_type, self_vehicle_yn,
               customer_name, customer_phone, adjuster_name, adjuster_phone, customer_birth,
               insurance_company, insurance_claim_no, dispatch_location, repair_factory,
               dispatch_date, expected_return_date, claim_type, status, notes, created_at, updated_at)
             VALUES (UUID(), '빌려타', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '보험', ?, ?, NOW(), NOW())`,
            rec.dispatch_seq, rec.vehicle_car_number, rec.vehicle_car_type,
            rec.customer_car_number, rec.customer_car_type, rec.self_vehicle_yn ? 1 : 0,
            rec.customer_name || '(미상)', rec.customer_phone, rec.adjuster_name, rec.adjuster_phone, rec.customer_birth,
            rec.insurance_company, rec.insurance_claim_no, rec.dispatch_location, rec.repair_factory,
            rec.dispatch_date, rec.expected_return_date, deriveStatus(rec), rec.notes
          )
          inserted++
        }
      } catch (e) {
        console.error('[dispatch-import row]', e)
        errors++
      }
    }

    return NextResponse.json({
      mode: 'apply',
      total: records.length,
      inserted, updated, unchanged, errors, skipped, insurerHits,
      error: null,
    })
  } catch (e: any) {
    console.error('[dispatch-import]', e)
    return NextResponse.json({ error: e?.message || 'import 오류' }, { status: 500 })
  }
}

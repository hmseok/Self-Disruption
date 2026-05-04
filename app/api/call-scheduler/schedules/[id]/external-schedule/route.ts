// ═══════════════════════════════════════════════════════════════════
// GET  /api/call-scheduler/schedules/[id]/external-schedule/template
//   외부 직원 엑셀 템플릿 다운로드 (PR-2QQ-b)
// POST /api/call-scheduler/schedules/[id]/external-schedule
//   외부 직원 일정 엑셀 업로드 — manual_lock=1 INSERT
//
// 엑셀 포맷:
//   | 워커명     | 날짜       | 슬롯 코드 | 비고      |
//   | 정동민     | 2026-05-04 | L13       | 야간      |
//   | 정동민     | 2026-05-05 | L13       | 야간      |
//   ...
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import * as XLSX from 'xlsx'

interface UploadRow {
  worker_name: string
  work_date: string
  slot_code: string
  note?: string
}

// "HH:MM" → 분
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function computeHours(start: string, end: string, isOvernight: boolean, special: string): number {
  if (special === 'off' || special === 'am_free' || special === 'pm_free') return 0
  let s = timeToMin(start); let e = timeToMin(end)
  if (isOvernight) e += 24 * 60
  let hours = (e - s) / 60
  if (hours < 0) hours = 0
  if (special === 'am_half' || special === 'pm_half') hours = hours / 2
  return Math.round(hours * 100) / 100
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: scheduleId } = await context.params
    const body = await request.json()
    const mode: string = body?.mode === 'apply' ? 'apply' : 'preview'
    const rows: UploadRow[] = Array.isArray(body?.rows) ? body.rows : []

    if (rows.length === 0) {
      return NextResponse.json({ error: '업로드 행이 없습니다.' }, { status: 400 })
    }

    // 스케줄
    const sRows = await prisma.$queryRaw<any[]>`
      SELECT id, year, month FROM cs_schedules WHERE id = ${scheduleId} LIMIT 1
    `
    if (sRows.length === 0) {
      return NextResponse.json({ error: '스케줄을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 워커 인덱스 (이름 → id, is_external)
    const wRows = await prisma.$queryRaw<any[]>`
      SELECT id, name, is_external FROM cs_workers WHERE is_active = 1
    `
    const workerByName = new Map<string, { id: string; is_external: number }>()
    for (const w of wRows) workerByName.set(w.name, { id: w.id, is_external: Number(w.is_external || 0) })

    // 슬롯 인덱스 (code → id, time)
    const slotRows = await prisma.$queryRaw<any[]>`
      SELECT id, code, TIME_FORMAT(start_time, '%H:%i') AS start_time,
             TIME_FORMAT(end_time, '%H:%i') AS end_time, is_overnight
      FROM cs_shift_slots WHERE is_active = 1
    `
    const slotByCode = new Map<string, any>()
    for (const s of slotRows) slotByCode.set(s.code, s)

    // 행 검증
    interface PlanItem {
      worker_id: string | null
      worker_name: string
      work_date: string
      shift_slot_id: string | null
      slot_code: string
      note: string | null
      action: 'insert' | 'update' | 'error'
      error?: string
      is_external?: boolean
    }
    const plans: PlanItem[] = []
    for (const row of rows) {
      const name = String(row.worker_name || '').trim()
      const date = String(row.work_date || '').trim()
      const code = String(row.slot_code || '').trim()
      const note = row.note ? String(row.note).slice(0, 250) : null

      if (!name || !date || !code) {
        plans.push({
          worker_id: null, worker_name: name, work_date: date, shift_slot_id: null,
          slot_code: code, note, action: 'error', error: '필수 컬럼 누락',
        })
        continue
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        plans.push({
          worker_id: null, worker_name: name, work_date: date, shift_slot_id: null,
          slot_code: code, note, action: 'error', error: '날짜 형식 오류 (YYYY-MM-DD)',
        })
        continue
      }
      const w = workerByName.get(name)
      if (!w) {
        plans.push({
          worker_id: null, worker_name: name, work_date: date, shift_slot_id: null,
          slot_code: code, note, action: 'error', error: '워커 없음',
        })
        continue
      }
      const slot = slotByCode.get(code)
      if (!slot) {
        plans.push({
          worker_id: w.id, worker_name: name, work_date: date, shift_slot_id: null,
          slot_code: code, note, action: 'error', error: '슬롯 코드 없음',
        })
        continue
      }
      plans.push({
        worker_id: w.id, worker_name: name, work_date: date,
        shift_slot_id: slot.id, slot_code: code, note,
        action: 'insert',  // 적용 시 upsert (manual_lock=1)
        is_external: !!w.is_external,
      })
    }

    const valid = plans.filter(p => p.action !== 'error')
    const errors = plans.filter(p => p.action === 'error')

    const summary = {
      total: rows.length,
      valid: valid.length,
      errors: errors.length,
      external_workers: Array.from(new Set(valid.filter(p => p.is_external).map(p => p.worker_name))),
      mode,
    }

    if (mode === 'preview') {
      return NextResponse.json({
        data: { summary, plans: plans.slice(0, 200) /* 200개 제한 */ },
        error: null,
      })
    }

    // APPLY — manual_lock=1 upsert
    let appliedInsert = 0, appliedUpdate = 0
    for (const p of valid) {
      if (!p.worker_id || !p.shift_slot_id) continue
      const slot = slotRows.find(s => s.id === p.shift_slot_id)
      if (!slot) continue
      const hours = computeHours(slot.start_time, slot.end_time, !!slot.is_overnight, 'none')
      // 기존 row 조회 (worker_id 단위)
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id FROM cs_assignments
        WHERE schedule_id = ${scheduleId}
          AND work_date = ${p.work_date}
          AND shift_slot_id = ${p.shift_slot_id}
          AND worker_id = ${p.worker_id}
        LIMIT 1
      `
      if (existing.length > 0) {
        await prisma.$executeRaw`
          UPDATE cs_assignments
          SET manual_lock = 1, special_code = 'none', computed_hours = ${hours},
              note = ${p.note}, updated_at = NOW()
          WHERE id = ${existing[0].id}
        `
        appliedUpdate++
      } else {
        await prisma.$executeRaw`
          INSERT INTO cs_assignments
            (id, schedule_id, work_date, shift_slot_id, worker_id, manual_lock,
             special_code, computed_hours, note, created_at, updated_at)
          VALUES
            (${crypto.randomUUID()}, ${scheduleId}, ${p.work_date}, ${p.shift_slot_id}, ${p.worker_id}, 1,
             'none', ${hours}, ${p.note}, NOW(), NOW())
        `
        appliedInsert++
      }
    }

    return NextResponse.json({
      data: {
        summary: { ...summary, applied_insert: appliedInsert, applied_update: appliedUpdate },
        plans: plans.slice(0, 200),
      },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

// 템플릿 다운로드
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: scheduleId } = await context.params
    const sRows = await prisma.$queryRaw<any[]>`
      SELECT year, month FROM cs_schedules WHERE id = ${scheduleId} LIMIT 1
    `
    if (sRows.length === 0) {
      return NextResponse.json({ error: '스케줄을 찾을 수 없습니다.' }, { status: 404 })
    }
    const { year, month } = sRows[0]
    const monthStr = `${year}-${String(month).padStart(2, '0')}`

    // 외부 직원 + 야간 슬롯 샘플
    let externalWorker = '정동민'
    try {
      const ext = await prisma.$queryRaw<any[]>`
        SELECT name FROM cs_workers WHERE is_external = 1 AND is_active = 1 LIMIT 1
      `
      if (ext.length > 0) externalWorker = ext[0].name
    } catch { /* graceful */ }

    const slotRows = await prisma.$queryRaw<any[]>`
      SELECT code FROM cs_shift_slots WHERE is_active = 1 AND is_overnight = 1 LIMIT 1
    `
    const sampleSlot = slotRows.length > 0 ? slotRows[0].code : 'L13'

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['워커명', '날짜', '슬롯코드', '비고'],
      [externalWorker, `${monthStr}-04`, sampleSlot, '야간 (외부)'],
      [externalWorker, `${monthStr}-05`, sampleSlot, ''],
      [externalWorker, `${monthStr}-08`, sampleSlot, ''],
      [externalWorker, `${monthStr}-09`, sampleSlot, ''],
    ])
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(wb, ws, '외부일정')

    // 안내 시트
    const guideWs = XLSX.utils.aoa_to_sheet([
      ['외부 직원 일정 업로드 — 사용 방법'],
      [''],
      ['1. "외부일정" 시트에 행 추가'],
      ['   · 워커명: cs_workers 에 등록된 정확한 이름'],
      ['   · 날짜: YYYY-MM-DD 형식'],
      ['   · 슬롯코드: cs_shift_slots.code (예: L13)'],
      ['   · 비고: 자유 메모 (선택)'],
      [''],
      ['2. 업로드 시 manual_lock=1 로 INSERT'],
      ['   → 자동 생성이 절대 덮어쓰지 않음'],
      [''],
      ['3. 워커가 외부 직원이 아니어도 입력 가능'],
      ['   (수동 lock 셀로 표시됨)'],
    ])
    guideWs['!cols'] = [{ wch: 70 }]
    XLSX.utils.book_append_sheet(wb, guideWs, '안내')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="external-schedule-${monthStr}.xlsx"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

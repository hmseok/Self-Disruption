'use client'
// ═══════════════════════════════════════════════════════════════════
// ScheduleGrid — 메인 캘린더 그리드 (슬롯 행 × 일자 열)
// 가로 스크롤 (반응형, CLAUDE.md 규칙 19)
// ═══════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import AssignmentCell from './AssignmentCell'
import WorkerPicker from './WorkerPicker'
import { monthDays, dowIndex, DOW_LABEL } from '../utils/hours'
import { getAuthHeader } from '@/app/utils/auth-client'
import type {
  ScheduleDetail, Assignment, ShiftSlot, Worker, SpecialCode,
} from '../utils/types'

interface Props {
  detail: ScheduleDetail
  onChanged: () => void  // 변경 후 부모에 reload 트리거
}

export default function ScheduleGrid({ detail, onChanged }: Props) {
  const { schedule, slots, workers, assignments } = detail
  const days = useMemo(
    () => monthDays(schedule.year, schedule.month),
    [schedule.year, schedule.month],
  )

  // (date, slot_id) → assignment 매핑
  const cellMap = useMemo(() => {
    const m = new Map<string, Assignment>()
    for (const a of assignments) m.set(`${a.work_date}_${a.shift_slot_id}`, a)
    return m
  }, [assignments])

  const workerMap = useMemo(() => {
    const m = new Map<string, Worker>()
    for (const w of workers) m.set(w.id, w)
    return m
  }, [workers])

  const [pickerSlot, setPickerSlot] = useState<ShiftSlot | null>(null)
  const [pickerDate, setPickerDate] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const currentAssignment = pickerSlot && pickerDate
    ? cellMap.get(`${pickerDate}_${pickerSlot.id}`) || null
    : null

  const handleSave = async (workerId: string | null, special: SpecialCode) => {
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          schedule_id: schedule.id,
          work_date: pickerDate,
          shift_slot_id: pickerSlot!.id,
          worker_id: workerId,
          special_code: special,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      onChanged()
    } catch (e: any) {
      alert(e?.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!currentAssignment) return
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/assignments?id=${currentAssignment.id}`,
        { method: 'DELETE', headers: auth },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '삭제 실패')
      onChanged()
    } catch (e: any) {
      alert(e?.message || '삭제 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      ...GLASS.L4,
      borderRadius: 12,
      padding: 8,
      overflowX: 'auto',
    }}>
      <table style={{
        width: 'max-content',
        borderCollapse: 'separate',
        borderSpacing: 1,
        fontSize: 11,
      }}>
        <thead>
          <tr>
            <th style={{
              minWidth: 100, padding: '4px 6px', position: 'sticky', left: 0,
              background: COLORS.bgGray, color: COLORS.textSecondary,
              textAlign: 'left', fontWeight: 700, borderRadius: 4, zIndex: 2,
              fontSize: 11,
            }}>
              시프트
            </th>
            {days.map(d => {
              const dow = dowIndex(d)
              const day = Number(d.split('-')[2])
              const isWeekend = dow === 0 || dow === 6
              return (
                <th
                  key={d}
                  style={{
                    minWidth: 44, padding: '3px 4px', textAlign: 'center',
                    background: isWeekend ? COLORS.bgRed : COLORS.bgGray,
                    color: dow === 0 ? COLORS.danger : (dow === 6 ? COLORS.info : COLORS.textSecondary),
                    fontWeight: 700, borderRadius: 4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 500, lineHeight: 1.1 }}>
                    {DOW_LABEL[dow]}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.2 }}>{day}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {slots.map(slot => (
            <tr key={slot.id}>
              <td style={{
                padding: '2px 6px', position: 'sticky', left: 0,
                background: 'rgba(255,255,255,0.92)',
                color: COLORS.textPrimary, fontWeight: 600,
                borderRadius: 4, whiteSpace: 'nowrap', zIndex: 1,
                fontSize: 11,
              }}>
                <span style={{ fontSize: 10, color: COLORS.textMuted, marginRight: 4 }}>
                  {slot.code}
                </span>
                {slot.label}
              </td>
              {days.map(d => {
                const a = cellMap.get(`${d}_${slot.id}`) || null
                const w = a?.worker_id ? workerMap.get(a.worker_id) || null : null
                return (
                  <td key={d} style={{ padding: 0, minWidth: 44 }}>
                    <AssignmentCell
                      assignment={a}
                      worker={w}
                      onClick={() => { setPickerSlot(slot); setPickerDate(d) }}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <WorkerPicker
        open={!!pickerSlot}
        onClose={() => { setPickerSlot(null); setPickerDate('') }}
        workers={workers}
        slot={pickerSlot}
        workDate={pickerDate}
        current={currentAssignment}
        onSave={handleSave}
        onClear={handleClear}
      />

      {saving && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 1100,
          ...GLASS.L4, padding: '8px 14px', borderRadius: 8,
          color: COLORS.textSecondary, fontSize: 12, fontWeight: 600,
        }}>
          저장 중...
        </div>
      )}
    </div>
  )
}

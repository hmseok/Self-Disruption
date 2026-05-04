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
  // 빈자리 강조 모드 (PR-2S)
  const [emptyOnly, setEmptyOnly] = useState(false)
  // 시프트 교체 모드 (PR-2R) — 두 셀 선택 후 swap
  const [swapMode, setSwapMode] = useState(false)
  const [swapFirst, setSwapFirst] = useState<{ a: Assignment | null; slotId: string; date: string } | null>(null)

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

  // PR-2R 워커 swap — 두 셀의 worker_id 교환
  const handleSwap = async (
    second: { a: Assignment | null; slotId: string; date: string },
  ) => {
    if (!swapFirst) return
    const first = swapFirst
    setSwapFirst(null)
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      // 두 셀의 worker_id 와 special_code 를 서로 교환
      const firstWorker = first.a?.worker_id || null
      const firstSpecial = first.a?.special_code || 'none'
      const secondWorker = second.a?.worker_id || null
      const secondSpecial = second.a?.special_code || 'none'

      // first 위치에 second 의 워커 입력
      await fetch('/api/call-scheduler/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          schedule_id: schedule.id,
          work_date: first.date,
          shift_slot_id: first.slotId,
          worker_id: secondWorker,
          special_code: secondSpecial,
        }),
      })
      // second 위치에 first 의 워커 입력
      await fetch('/api/call-scheduler/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          schedule_id: schedule.id,
          work_date: second.date,
          shift_slot_id: second.slotId,
          worker_id: firstWorker,
          special_code: firstSpecial,
        }),
      })
      onChanged()
    } catch (e: any) {
      alert(e?.message || 'swap 실패')
    } finally {
      setSaving(false)
    }
  }

  // PR-2Z 빠른 처리 (우클릭) — 셀의 special_code 만 즉석 변경
  const handleQuickAction = async (
    a: Assignment | null,
    slot: ShiftSlot,
    workDate: string,
    action: 'off' | 'am_half' | 'pm_half' | 'am_free' | 'pm_free' | 'clear',
  ) => {
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      if (action === 'clear') {
        if (!a) return
        const res = await fetch(`/api/call-scheduler/assignments?id=${a.id}`, {
          method: 'DELETE', headers: auth,
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '삭제 실패')
      } else {
        // workerId 는 기존 유지 (없으면 null)
        const res = await fetch('/api/call-scheduler/assignments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({
            schedule_id: schedule.id,
            work_date: workDate,
            shift_slot_id: slot.id,
            worker_id: a?.worker_id || null,
            special_code: action,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '저장 실패')
      }
      onChanged()
    } catch (e: any) {
      alert(e?.message || '오류')
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
      {/* 상단 헬퍼 — 빈자리 강조 / swap 모드 / 카운트 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 6px 8px', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted }}>
          {(() => {
            // 빈 슬롯 카운트: 슬롯 × 일자 × 모든 셀 중 worker_id NULL 또는 special=off 면 '안 채워진' 으로 카운트
            // 실제로는 cs_assignments INSERT 안 된 (date, slot) 조합도 빈자리
            const totalCells = days.length * slots.length
            const filled = assignments.filter(a => a.worker_id && a.special_code !== 'off').length
            const empty = totalCells - filled
            return (
              <>
                전체 {totalCells} 셀 ·{' '}
                <span style={{ color: COLORS.success, fontWeight: 700 }}>채움 {filled}</span> ·{' '}
                <span style={{ color: empty > 0 ? COLORS.danger : COLORS.textMuted, fontWeight: 700 }}>
                  비어있음 {empty}
                </span>
              </>
            )
          })()}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button"
                  onClick={() => setEmptyOnly(o => !o)}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: emptyOnly ? COLORS.bgRed : 'transparent',
                    color: emptyOnly ? COLORS.danger : COLORS.textSecondary,
                    border: `1px solid ${emptyOnly ? COLORS.borderRed : COLORS.borderFaint}`,
                    cursor: 'pointer',
                  }}
                  title="빈 셀만 빨간색으로 강조 표시">
            {emptyOnly ? '🔍 빈자리 강조 ON' : '👀 빈자리 강조'}
          </button>
          <button type="button"
                  onClick={() => { setSwapMode(s => !s); setSwapFirst(null) }}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: swapMode ? COLORS.bgViolet : 'transparent',
                    color: swapMode ? '#7c3aed' : COLORS.textSecondary,
                    border: `1px solid ${swapMode ? COLORS.borderViolet : COLORS.borderFaint}`,
                    cursor: 'pointer',
                  }}
                  title="두 셀 클릭 → 워커 교체">
            {swapMode
              ? (swapFirst ? `🔄 두 번째 셀 선택` : '🔄 swap: 첫 셀 선택')
              : '🔄 시프트 교체'}
          </button>
        </div>
      </div>
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
                const isEmpty = !a || (!a.worker_id && a.special_code !== 'off')
                // 빈자리 강조 모드: 빈 셀에 빨간 점 + 배경
                const cellTdStyle: React.CSSProperties = emptyOnly && isEmpty ? {
                  padding: 0, minWidth: 44,
                  background: COLORS.bgRed,
                  border: `2px dashed ${COLORS.borderRed}`,
                  borderRadius: 4,
                } : { padding: 0, minWidth: 44 }
                const isSwapFirst = swapFirst && swapFirst.slotId === slot.id && swapFirst.date === d
                const finalCellStyle: React.CSSProperties = isSwapFirst
                  ? { ...cellTdStyle, background: COLORS.bgViolet, border: `2px solid #7c3aed`, borderRadius: 4 }
                  : cellTdStyle
                return (
                  <td key={d} style={finalCellStyle}>
                    <AssignmentCell
                      assignment={a}
                      worker={w}
                      onClick={() => {
                        if (swapMode) {
                          if (!swapFirst) {
                            setSwapFirst({ a, slotId: slot.id, date: d })
                          } else {
                            handleSwap({ a, slotId: slot.id, date: d })
                          }
                        } else {
                          setPickerSlot(slot); setPickerDate(d)
                        }
                      }}
                      onQuickAction={swapMode ? undefined : (action) => handleQuickAction(a, slot, d, action)}
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

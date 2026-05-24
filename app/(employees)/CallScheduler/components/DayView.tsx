'use client'
// ═══════════════════════════════════════════════════════════════════
// DayView — 날짜별 뷰 (3번째 모드)
//   각 일자 카드 → 그날의 모든 시프트 + 배정된 워커 표출
//   매니저가 일자별로 누가 근무하는지 확인 / 일자 단위 점검
// ═══════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { COLORS, GLASS, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT, TONE_BORDER } from '../utils/palette'
import { monthDays, dowIndex, DOW_LABEL } from '../utils/hours'
import { SPECIAL_LABEL } from '../utils/types'
import type { ScheduleDetail, Assignment, Worker, ShiftSlot, SpecialCode, ColorTone } from '../utils/types'

interface Props {
  detail: ScheduleDetail
}

export default function DayView({ detail }: Props) {
  const { schedule, slots, workers, assignments } = detail
  const days = useMemo(
    () => monthDays(schedule.year, schedule.month),
    [schedule.year, schedule.month],
  )
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // 워커 lookup
  const workerMap = useMemo(() => {
    const m = new Map<string, Worker>()
    for (const w of workers) m.set(w.id, w)
    return m
  }, [workers])

  // 슬롯 lookup
  const slotMap = useMemo(() => {
    const m = new Map<string, ShiftSlot>()
    for (const s of slots) m.set(s.id, s)
    return m
  }, [slots])

  // (date) → 그날 배정 list
  const byDate = useMemo(() => {
    const m = new Map<string, Assignment[]>()
    for (const a of assignments) {
      const arr = m.get(a.work_date) || []
      arr.push(a)
      m.set(a.work_date, arr)
    }
    // 슬롯 sort_order 따라 정렬
    for (const [k, arr] of m.entries()) {
      arr.sort((x, y) => {
        const sx = slotMap.get(x.shift_slot_id)?.sort_order || 0
        const sy = slotMap.get(y.shift_slot_id)?.sort_order || 0
        return sx - sy
      })
    }
    return m
  }, [assignments, slotMap])

  // 일자별 통계
  const dayStats = useMemo(() => {
    const m = new Map<string, {
      filled: number; off: number; half: number; free: number; totalHours: number;
    }>()
    for (const d of days) {
      m.set(d, { filled: 0, off: 0, half: 0, free: 0, totalHours: 0 })
    }
    for (const a of assignments) {
      const s = m.get(a.work_date)
      if (!s) continue
      if (a.special_code === 'off') s.off++
      else if (a.special_code.endsWith('_half')) { s.half++; s.filled++; s.totalHours += Number(a.computed_hours || 0) }
      else if (a.special_code.endsWith('_free')) s.free++
      else if (a.worker_id) { s.filled++; s.totalHours += Number(a.computed_hours || 0) }
    }
    return m
  }, [assignments, days])

  // 첫 주 빈칸 (요일 정렬)
  const firstDow = days.length > 0 ? dowIndex(days[0]) : 0

  return (
    <>
      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
            📅 일자별 — 카드 클릭으로 상세
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>
            {schedule.year}년 {schedule.month}월 ({days.length}일)
          </div>
        </div>

        {/* 요일 헤더 */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6,
          marginBottom: 6,
        }}>
          {DOW_LABEL.map((d, i) => (
            <div key={d} style={{
              fontSize: 11, fontWeight: 700, textAlign: 'center', padding: '4px 0',
              color: i === 0 ? COLORS.danger : i === 6 ? COLORS.info : COLORS.textMuted,
            }}>{d}</div>
          ))}
        </div>

        {/* 일자 카드 grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6,
        }}>
          {Array.from({ length: firstDow }, (_, i) => <div key={`e-${i}`} />)}
          {days.map(d => {
            const dow = dowIndex(d)
            const day = Number(d.split('-')[2])
            const dayAssigns = byDate.get(d) || []
            const stats = dayStats.get(d)!
            const isWeekend = dow === 0 || dow === 6
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                style={{
                  textAlign: 'left',
                  minHeight: 130, padding: 8, borderRadius: 10,
                  background: isWeekend ? COLORS.bgRed : 'rgba(255,255,255,0.6)',
                  border: `1px solid ${isWeekend ? COLORS.borderRed : COLORS.borderFaint}`,
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  transition: 'transform 0.1s, box-shadow 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = ''
                  e.currentTarget.style.transform = ''
                }}
              >
                {/* 일자 + 요약 */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderBottom: `1px solid ${COLORS.borderFaint}`, paddingBottom: 4,
                }}>
                  <span style={{
                    fontSize: 14, fontWeight: 800,
                    color: dow === 0 ? COLORS.danger : dow === 6 ? COLORS.info : COLORS.textPrimary,
                  }}>{day}</span>
                  <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700 }}>
                    {stats.filled}명
                    {stats.totalHours > 0 && (
                      <span style={{ marginLeft: 4 }}>· {Math.round(stats.totalHours)}h</span>
                    )}
                  </span>
                </div>

                {/* 워커 칩들 (최대 6명, 초과시 +N) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, flex: 1, alignContent: 'flex-start' }}>
                  {dayAssigns.slice(0, 6).map(a => {
                    const w = a.worker_id ? workerMap.get(a.worker_id) : null
                    if (!w) {
                      // 빈 셀 또는 off 만
                      if (a.special_code === 'off') {
                        return null
                      }
                      return null
                    }
                    return (
                      <span key={a.id} style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '1px 5px', borderRadius: 3,
                        background: TONE_BG[w.color_tone] !== 'transparent'
                          ? TONE_BG[w.color_tone] : COLORS.bgGray,
                        color: TONE_TEXT[w.color_tone],
                        whiteSpace: 'nowrap', lineHeight: 1.4,
                        opacity: a.special_code === 'off' ? 0.4 : 1,
                        textDecoration: a.special_code === 'off' ? 'line-through' : 'none',
                      }}>
                        {w.name}
                        {a.special_code !== 'none' && a.special_code !== 'off' && (
                          <span style={{ marginLeft: 2, fontSize: 8, color: COLORS.warning }}>
                            {a.special_code === 'am_half' ? '오반' : a.special_code === 'pm_half' ? '오후반' : 'F'}
                          </span>
                        )}
                      </span>
                    )
                  })}
                  {dayAssigns.filter(a => !!a.worker_id).length > 6 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                      background: COLORS.bgGray, color: COLORS.textMuted,
                    }}>
                      +{dayAssigns.filter(a => !!a.worker_id).length - 6}
                    </span>
                  )}
                  {dayAssigns.filter(a => !!a.worker_id).length === 0 && (
                    <span style={{ fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic' }}>
                      비어있음
                    </span>
                  )}
                </div>

                {/* 특수 통계 */}
                {(stats.half + stats.free + stats.off) > 0 && (
                  <div style={{ display: 'flex', gap: 4, fontSize: 9, color: COLORS.textMuted }}>
                    {stats.half > 0 && <span>반차 {stats.half}</span>}
                    {stats.free > 0 && <span>F {stats.free}</span>}
                    {stats.off > 0 && <span>휴 {stats.off}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 일자 상세 모달 */}
      {selectedDate && (
        <DayDetailModal
          isoDate={selectedDate}
          assignments={byDate.get(selectedDate) || []}
          slotMap={slotMap}
          workerMap={workerMap}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </>
  )
}

// ── 일자 상세 모달 ───────────────────────────────────────────────
function DayDetailModal({ isoDate, assignments, slotMap, workerMap, onClose }: {
  isoDate: string
  assignments: Assignment[]
  slotMap: Map<string, ShiftSlot>
  workerMap: Map<string, Worker>
  onClose: () => void
}) {
  const dow = dowIndex(isoDate)
  const day = Number(isoDate.split('-')[2])
  const month = Number(isoDate.split('-')[1])
  const year = Number(isoDate.split('-')[0])
  const isWeekend = dow === 0 || dow === 6

  // 슬롯별로 그룹핑
  const bySlot = new Map<string, Assignment[]>()
  for (const a of assignments) {
    const arr = bySlot.get(a.shift_slot_id) || []
    arr.push(a)
    bySlot.set(a.shift_slot_id, arr)
  }

  const totalFilled = assignments.filter(a => a.worker_id && a.special_code !== 'off').length
  const totalHours = assignments.reduce((s, a) => {
    if (a.special_code === 'off') return s
    return s + Number(a.computed_hours || 0)
  }, 0)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, width: 560, maxWidth: '94vw', maxHeight: '88vh',
        borderRadius: 16, padding: 20, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
              {year}년 {month}월 {day}일
              <span style={{
                marginLeft: 8, fontSize: 14,
                color: dow === 0 ? COLORS.danger : dow === 6 ? COLORS.info : COLORS.textSecondary,
              }}>
                ({DOW_LABEL[dow]})
              </span>
              {isWeekend && <span style={{ marginLeft: 6, ...pillStyle('warning'), fontSize: 10 }}>주말</span>}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              근무 {totalFilled}명 · 총 {Math.round(totalHours * 10) / 10}h
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: `1px solid ${COLORS.borderFaint}`,
            cursor: 'pointer', color: COLORS.textSecondary, fontSize: 16,
          }}>×</button>
        </div>

        {/* PR-2SS-Phase-J-2A — 24h Timeline Gantt (시간 매트릭스) */}
        {assignments.length > 0 && (() => {
          // overnight 슬롯 포함 시 48h 스케일, 아니면 24h
          const hasOvernight = Array.from(bySlot.entries()).some(([slotId]) => {
            const s = slotMap.get(slotId)
            return s?.is_overnight
          })
          const scaleHours = hasOvernight ? 48 : 24
          const scalePx = 800  // 가로 픽셀
          const toMin = (t: string) => {
            const [h, m] = t.split(':').map(Number)
            return h * 60 + m
          }
          // 슬롯 + 워커 풀어서 timeline rows 만들기
          // 같은 시간대 워커 여럿 → 한 row 에 chip 들 (간단)
          const rows: Array<{
            slotId: string
            slot: ShiftSlot
            startMin: number
            endMin: number
            workers: Array<{ name: string; tone: ColorTone; special: SpecialCode }>
          }> = []
          for (const [slotId, slotAssigns] of bySlot.entries()) {
            const slot = slotMap.get(slotId)
            if (!slot) continue
            const startMin = toMin(slot.start_time)
            let endMin = toMin(slot.end_time)
            if (slot.is_overnight) endMin += 1440
            const ws = slotAssigns
              .filter(a => a.worker_id)
              .map(a => {
                const w = workerMap.get(a.worker_id!)
                if (!w) return null
                return { name: w.name, tone: w.color_tone, special: a.special_code as SpecialCode }
              })
              .filter(Boolean) as Array<{ name: string; tone: ColorTone; special: SpecialCode }>
            rows.push({ slotId, slot, startMin, endMin, workers: ws })
          }
          // 정렬: 시작 시각
          rows.sort((a, b) => a.startMin - b.startMin)

          return (
            <div style={{
              ...GLASS.L1, borderRadius: 10, padding: 14, marginBottom: 12,
              border: `1px solid ${COLORS.borderBlue}`,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
                  ⏱ 24시간 Timeline
                  <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted, marginLeft: 6 }}>
                    {hasOvernight ? '48h 스케일 (overnight 포함)' : '24h 스케일'}
                  </span>
                </div>
              </div>

              {/* 시간 헤더 ruler */}
              <div style={{
                position: 'relative', width: scalePx, height: 16,
                marginBottom: 4, marginLeft: 90,
              }}>
                {Array.from({ length: scaleHours / 2 + 1 }, (_, i) => i * 2).map(h => (
                  <div key={h} style={{
                    position: 'absolute', left: `${(h * 60 / (scaleHours * 60)) * scalePx}px`,
                    fontSize: 9, color: COLORS.textMuted, top: 0,
                    transform: 'translateX(-50%)',
                  }}>
                    {h % 24}{h === 24 ? '┃' : ''}
                  </div>
                ))}
              </div>

              {/* Timeline rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {rows.map(r => {
                  const leftPx = (r.startMin / (scaleHours * 60)) * scalePx
                  const widthPx = ((r.endMin - r.startMin) / (scaleHours * 60)) * scalePx
                  return (
                    <div key={r.slotId} style={{
                      display: 'flex', alignItems: 'center', height: 28,
                    }}>
                      <div style={{
                        width: 86, fontSize: 11, fontWeight: 700, color: COLORS.textPrimary,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        paddingRight: 4,
                      }} title={`${r.slot.code} ${r.slot.start_time.substring(0,5)}~${r.slot.end_time.substring(0,5)}`}>
                        <span style={{ color: COLORS.textMuted, marginRight: 4, fontFamily: 'monospace', fontSize: 10 }}>
                          {r.slot.code}
                        </span>
                      </div>
                      <div style={{
                        position: 'relative', width: scalePx, height: '100%',
                        background: 'rgba(0,0,0,0.03)',
                        borderRadius: 4,
                      }}>
                        {/* 시간 grid 세로선 */}
                        {Array.from({ length: scaleHours / 2 + 1 }, (_, i) => i * 2).map(h => (
                          <div key={h} style={{
                            position: 'absolute', left: `${(h * 60 / (scaleHours * 60)) * scalePx}px`,
                            top: 0, bottom: 0, width: 1,
                            background: h === 24 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.06)',
                          }} />
                        ))}
                        {/* 슬롯 막대 — Phase N-73: 슬롯 color_tone 으로 (없으면 overnight fallback) */}
                        <div style={{
                          position: 'absolute', left: leftPx, width: widthPx,
                          top: 2, bottom: 2,
                          background: (r.slot.color_tone && r.slot.color_tone !== 'none')
                            ? TONE_BG[r.slot.color_tone]
                            : (r.slot.is_overnight ? COLORS.bgViolet : COLORS.bgBlue),
                          border: `1px solid ${(r.slot.color_tone && r.slot.color_tone !== 'none')
                            ? TONE_BORDER[r.slot.color_tone]
                            : (r.slot.is_overnight ? COLORS.borderViolet : COLORS.borderBlue)}`,
                          borderRadius: 4,
                          display: 'flex', alignItems: 'center', gap: 2,
                          padding: '0 4px', overflow: 'hidden',
                        }}
                        title={`${r.slot.code} ${r.slot.start_time.substring(0,5)}~${r.slot.end_time.substring(0,5)} — ${r.workers.map(w => w.name).join(', ')}`}>
                          {r.workers.slice(0, 4).map((w, i) => (
                            <span key={i} style={{
                              fontSize: 9, padding: '1px 4px', borderRadius: 3,
                              background: TONE_BG[w.tone] !== 'transparent' ? TONE_BG[w.tone] : 'rgba(255,255,255,0.7)',
                              color: TONE_TEXT[w.tone],
                              fontWeight: 700, whiteSpace: 'nowrap',
                              opacity: w.special === 'off' ? 0.4 : 1,
                            }}>
                              {w.name}
                            </span>
                          ))}
                          {r.workers.length > 4 && (
                            <span style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700 }}>
                              +{r.workers.length - 4}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* 슬롯별 워커 list */}
        {assignments.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: COLORS.textMuted, fontSize: 12,
            background: COLORS.bgGray, borderRadius: 8,
          }}>
            이 날짜에 배정된 인원이 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from(bySlot.entries()).map(([slotId, slotAssigns]) => {
              const slot = slotMap.get(slotId)
              if (!slot) return null
              // Phase N-73 — 슬롯 식별 색상 (카드 좌측 border + 코드 틴트)
              const slotTone: ColorTone = slot.color_tone || 'none'
              const slotTinted = slotTone !== 'none'
              return (
                <div key={slotId} style={{
                  ...GLASS.L1, borderRadius: 8, padding: 10,
                  borderLeft: slotTinted ? `3px solid ${TONE_BORDER[slotTone]}` : undefined,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 6,
                  }}>
                    <div>
                      <span style={{
                        fontSize: 11, marginRight: 6, fontFamily: 'monospace', fontWeight: 700,
                        color: slotTinted ? TONE_TEXT[slotTone] : COLORS.textMuted,
                        background: slotTinted ? TONE_BG[slotTone] : undefined,
                        padding: slotTinted ? '1px 5px' : undefined,
                        borderRadius: slotTinted ? 3 : undefined,
                      }}>{slot.code}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                        {slot.start_time.substring(0, 5)}~{slot.end_time.substring(0, 5)}
                        {slot.is_overnight && (
                          <span style={{ marginLeft: 4, fontSize: 10, color: COLORS.warning }}>(익일)</span>
                        )}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                      {slotAssigns.filter(a => a.worker_id && a.special_code !== 'off').length}명
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {slotAssigns.map(a => {
                      const w = a.worker_id ? workerMap.get(a.worker_id) : null
                      if (!w) return null
                      const tone = w.color_tone
                      return (
                        <div key={a.id} style={{
                          padding: '4px 10px', borderRadius: 6,
                          background: TONE_BG[tone] !== 'transparent' ? TONE_BG[tone] : COLORS.bgGray,
                          color: TONE_TEXT[tone],
                          fontSize: 12, fontWeight: 700,
                          display: 'flex', alignItems: 'center', gap: 4,
                          opacity: a.special_code === 'off' ? 0.4 : 1,
                          textDecoration: a.special_code === 'off' ? 'line-through' : 'none',
                        }}>
                          <span>{w.name}</span>
                          {a.special_code !== 'none' && (
                            <span style={{
                              ...pillStyle(
                                a.special_code === 'off' ? 'neutral'
                                : a.special_code.endsWith('_half') ? 'warning' : 'info'
                              ),
                              fontSize: 9, padding: '0 4px',
                            }}>
                              {SPECIAL_LABEL[a.special_code as SpecialCode]}
                            </span>
                          )}
                          {a.special_code !== 'off' && Number(a.computed_hours) > 0 && (
                            <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                              {a.computed_hours}h
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'
// ═══════════════════════════════════════════════════════════════════
// WeekView — 주간 뷰 (1주 7일 × 슬롯 매트릭스)
//   매니저가 좁은 화면 가독성 / 한 주 집중 시 사용
//   매트릭스 (월간) 압축 버전 — 셀 폭 더 넓게, 그룹 섹션 + 24h 막대 유지
// ═══════════════════════════════════════════════════════════════════
import { useMemo, useState, useEffect, Fragment } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import AssignmentCell from './AssignmentCell'
import { dowIndex, DOW_LABEL } from '../utils/hours'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { ScheduleDetail, Assignment, ShiftSlot, Worker, SpecialCode } from '../utils/types'

interface Props {
  detail: ScheduleDetail
}

// ISO 날짜 → 월요일 시작 그 주의 일요일 ISO
function startOfWeekSun(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const dow = d.getDay()  // 0=일
  d.setDate(d.getDate() - dow)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function WeekView({ detail }: Props) {
  const { schedule, slots, workers, assignments } = detail

  // 시작 주 — schedule.month 1일이 포함된 일요일
  const monthStart = `${schedule.year}-${String(schedule.month).padStart(2,'0')}-01`
  const [weekStart, setWeekStart] = useState<string>(() => startOfWeekSun(monthStart))

  // 7일 배열
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i))
  }, [weekStart])

  // 슬롯 → 그룹 매핑 (ScheduleGrid 와 같은 방식)
  const [slotGroups, setSlotGroups] = useState<Record<string, { id: string; name: string; category: string; member_ids: string[] }>>({})
  const [allGroups, setAllGroups] = useState<Array<{ id: string; name: string; category: string; shift_slot_id: string; member_ids: string[] }>>([])
  const [memberCfgMap, setMemberCfgMap] = useState<Map<string, { priority_level: number; preferred_dow_prefer: string | null; preferred_dow_avoid: string | null }>>(new Map())
  useEffect(() => {
    let abort = false
    ;(async () => {
      try {
        const auth = await getAuthHeader()
        const res = await fetch('/api/call-scheduler/shift-groups', { headers: auth })
        const json = await res.json()
        if (abort || !res.ok) return
        if (Array.isArray(json.data)) {
          const map: Record<string, { id: string; name: string; category: string; member_ids: string[] }> = {}
          const list: Array<{ id: string; name: string; category: string; shift_slot_id: string; member_ids: string[] }> = []
          const cfg = new Map<string, { priority_level: number; preferred_dow_prefer: string | null; preferred_dow_avoid: string | null }>()
          for (const g of json.data) {
            if (!g.is_active) continue
            const memberIds = Array.isArray(g.members) ? g.members.map((m: any) => m.id) : []
            list.push({ id: g.id, name: g.name, category: g.category || 'general', shift_slot_id: g.shift_slot_id, member_ids: memberIds })
            if (!map[g.shift_slot_id]) {
              map[g.shift_slot_id] = { id: g.id, name: g.name, category: g.category || 'general', member_ids: memberIds }
            }
            if (Array.isArray(g.members)) {
              for (const m of g.members) {
                cfg.set(`${g.id}_${m.id}`, {
                  priority_level: Number(m.priority_level || 2),
                  preferred_dow_prefer: m.preferred_dow_prefer ?? null,
                  preferred_dow_avoid: m.preferred_dow_avoid ?? null,
                })
              }
            }
          }
          setSlotGroups(map); setAllGroups(list); setMemberCfgMap(cfg)
        }
      } catch { /* graceful */ }
    })()
    return () => { abort = true }
  }, [schedule.id])

  // (date, slot) → assignments[]
  const cellMap = useMemo(() => {
    const m = new Map<string, Assignment[]>()
    for (const a of assignments) {
      const k = `${a.work_date}_${a.shift_slot_id}`
      const arr = m.get(k) || []
      arr.push(a)
      m.set(k, arr)
    }
    return m
  }, [assignments])
  const workerMap = useMemo(() => {
    const m = new Map<string, Worker>()
    for (const w of workers) m.set(w.id, w)
    return m
  }, [workers])

  // 주 이동 — schedule month 안에서만 (월 경계 안내)
  const weekEnd = addDaysIso(weekStart, 6)
  const weekStartMonth = Number(weekStart.split('-')[1])
  const weekEndMonth = Number(weekEnd.split('-')[1])
  const isOutOfMonth = weekStartMonth !== schedule.month && weekEndMonth !== schedule.month

  const goPrev = () => setWeekStart(addDaysIso(weekStart, -7))
  const goNext = () => setWeekStart(addDaysIso(weekStart, 7))

  return (
    <div style={{ ...GLASS.L4, borderRadius: 12, padding: 8, overflowX: 'auto' }}>
      {/* 주 이동 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px 10px', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
          📆 주간 — {weekStart} ~ {weekEnd}
          {isOutOfMonth && (
            <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.warning, fontWeight: 600 }}>
              ⚠ 이 달 ({schedule.year}-{String(schedule.month).padStart(2,'0')}) 범위 밖
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={goPrev} style={navBtn}>◀ 이전 주</button>
          <button type="button" onClick={() => setWeekStart(startOfWeekSun(monthStart))} style={navBtn}>이번 달 첫 주</button>
          <button type="button" onClick={goNext} style={navBtn}>다음 주 ▶</button>
        </div>
      </div>

      <table style={{
        width: '100%', minWidth: 720,
        borderCollapse: 'separate', borderSpacing: 1, fontSize: 12,
      }}>
        <thead>
          <tr>
            <th style={{
              minWidth: 140, padding: '6px 8px', position: 'sticky', left: 0,
              background: COLORS.bgGray, color: COLORS.textSecondary,
              textAlign: 'left', fontWeight: 700, borderRadius: 4, zIndex: 2, fontSize: 11,
            }}>
              시프트
            </th>
            {weekDays.map(d => {
              const dow = dowIndex(d)
              const day = Number(d.split('-')[2])
              const month = Number(d.split('-')[1])
              const isWeekend = dow === 0 || dow === 6
              const isOtherMonth = month !== schedule.month
              return (
                <th key={d} style={{
                  padding: '6px 4px', textAlign: 'center',
                  background: isWeekend ? COLORS.bgRed : (isOtherMonth ? 'rgba(0,0,0,0.04)' : COLORS.bgGray),
                  color: dow === 0 ? COLORS.danger : (dow === 6 ? COLORS.info : COLORS.textSecondary),
                  fontWeight: 700, borderRadius: 4, opacity: isOtherMonth ? 0.6 : 1,
                }}>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 500, lineHeight: 1.1 }}>
                    {DOW_LABEL[dow]}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.2 }}>
                    {month !== schedule.month && <span style={{ fontSize: 9, color: COLORS.textMuted }}>{month}/</span>}
                    {day}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, slotIdx) => {
            const curGrp = slotGroups[slot.id]
            const prevGrp = slotIdx > 0 ? slotGroups[slots[slotIdx-1].id] : null
            const isNewGroupSection = !prevGrp || (curGrp?.id || '') !== (prevGrp?.id || '')
            const cat = curGrp?.category || 'general'
            const headerColor = cat === '야간' ? COLORS.bgViolet : cat === '저녁' ? COLORS.bgAmber
                              : cat === '주간' ? COLORS.bgBlue : cat === '특수' ? COLORS.bgRed : COLORS.bgGray
            const headerBorder = cat === '야간' ? COLORS.borderViolet : cat === '저녁' ? COLORS.borderAmber
                               : cat === '주간' ? COLORS.borderBlue : cat === '특수' ? COLORS.borderRed : COLORS.borderFaint
            // 24h 막대
            const toMin = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60 + m }
            const startMin = toMin(slot.start_time)
            const rawEndMin = toMin(slot.end_time)
            const isOvernight = slot.is_overnight
            const seg1Width = isOvernight ? (1440 - startMin) : (rawEndMin - startMin)
            const seg2Width = isOvernight ? rawEndMin : 0
            const seg1LeftPct = (startMin / 1440) * 100
            const seg1WidthPct = (seg1Width / 1440) * 100
            const seg2WidthPct = (seg2Width / 1440) * 100
            return (
              <Fragment key={slot.id}>
                {isNewGroupSection && curGrp && (
                  <tr key={`gh-${slot.id}`}>
                    <td colSpan={8} style={{
                      padding: '6px 12px', position: 'sticky', left: 0,
                      background: headerColor, color: COLORS.textPrimary,
                      fontWeight: 800, fontSize: 12,
                      borderTop: `3px solid ${headerBorder}`,
                      borderBottom: `1px solid ${headerBorder}`,
                    }}>
                      🚧 {curGrp.name}
                      <span style={{ fontSize: 10, fontWeight: 500, color: COLORS.textMuted, marginLeft: 8 }}>
                        {cat} · 멤버 {curGrp.member_ids.length}명
                      </span>
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={{
                    padding: '4px 8px', position: 'sticky', left: 0,
                    background: 'rgba(255,255,255,0.95)', color: COLORS.textPrimary,
                    fontWeight: 600, borderRadius: 4, whiteSpace: 'nowrap', zIndex: 1,
                    fontSize: 11, minWidth: 140, maxWidth: 160,
                    borderLeft: `3px solid ${headerBorder}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <span style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: 'monospace', fontWeight: 700 }}>{slot.code}</span>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>
                        {slot.start_time.substring(0,5)}~{slot.end_time.substring(0,5)}
                        {isOvernight && <span style={{ fontSize: 8, color: COLORS.warning, marginLeft: 2 }}>익</span>}
                      </span>
                    </div>
                    <div style={{
                      position: 'relative', width: '100%', height: 10,
                      background: 'rgba(0,0,0,0.04)', borderRadius: 3, overflow: 'hidden',
                      border: '1px solid rgba(0,0,0,0.06)',
                    }}>
                      {[0,6,12,18,24].map(h => (
                        <div key={h} style={{
                          position: 'absolute', left: `${(h*60/1440)*100}%`,
                          top: 0, bottom: 0, width: 1,
                          background: h === 12 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.08)',
                        }} />
                      ))}
                      {seg1WidthPct > 0 && (
                        <div style={{
                          position: 'absolute', left: `${seg1LeftPct}%`, width: `${seg1WidthPct}%`,
                          height: '100%', background: headerBorder,
                          borderRadius: isOvernight ? '2px 0 0 2px' : 2,
                        }} />
                      )}
                      {seg2WidthPct > 0 && (
                        <div style={{
                          position: 'absolute', left: 0, width: `${seg2WidthPct}%`,
                          height: '100%', background: headerBorder, opacity: 0.65,
                          borderRadius: '0 2px 2px 0',
                          borderLeft: `1px dashed rgba(255,255,255,0.7)`,
                        }} />
                      )}
                    </div>
                  </td>
                  {weekDays.map(d => {
                    const arr = cellMap.get(`${d}_${slot.id}`) || []
                    const cellDow = dowIndex(d)
                    const cellMonth = Number(d.split('-')[1])
                    const isOtherMonth = cellMonth !== schedule.month
                    const cellStyle: React.CSSProperties = {
                      padding: 1, minWidth: 70, verticalAlign: 'top',
                      opacity: isOtherMonth ? 0.45 : 1,
                    }
                    return (
                      <td key={d} style={cellStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {arr.length === 0 ? (
                            <AssignmentCell
                              assignment={null} worker={null}
                              onClick={() => { /* 주간 뷰는 read-only — 매트릭스 뷰에서 편집 */ }}
                              dow={cellDow}
                            />
                          ) : (
                            arr.map(a => {
                              const w = a.worker_id ? workerMap.get(a.worker_id) || null : null
                              const slotGrp = slotGroups[slot.id]
                              const memberCfg = (slotGrp && a.worker_id)
                                ? memberCfgMap.get(`${slotGrp.id}_${a.worker_id}`)
                                : undefined
                              return (
                                <AssignmentCell
                                  key={a.id}
                                  assignment={a} worker={w}
                                  onClick={() => { /* 주간 뷰 read-only */ }}
                                  dow={cellDow}
                                  memberPreferDow={memberCfg?.preferred_dow_prefer || null}
                                  memberAvoidDow={memberCfg?.preferred_dow_avoid || null}
                                />
                              )
                            })
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>

      <div style={{ fontSize: 10, color: COLORS.textMuted, padding: '8px 8px 0', textAlign: 'right' }}>
        ℹ 주간 뷰는 읽기 전용 — 편집은 「📋 매트릭스」 모드에서
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
  background: 'transparent', color: COLORS.textSecondary,
  border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
}

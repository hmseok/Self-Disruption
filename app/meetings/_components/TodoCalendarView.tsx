'use client'
import { useState, useMemo } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════
// TodoCalendarView — 내 TODO 월 캘린더 (PR-MTG-V2-Todo-B)
//   · 회의 액션 + 개인 TODO 를 due_date 기준 월 그리드에 표시
//   · 외부 라이브러리 없이 자체 date 계산
//   · 항목 클릭 → onItemClick
// ═══════════════════════════════════════════════════════════════

export interface CalendarItem {
  source: 'meeting' | 'personal'
  id: string
  content: string
  due_date: string | null
  status: string
  meeting_id?: string
  meeting_type?: string
  category?: string | null
  priority?: string | null
}

interface Props {
  items: CalendarItem[]
  onItemClick: (item: CalendarItem) => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function TodoCalendarView({ items, onItemClick }: Props) {
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }, [])
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  // due_date 별 항목 그룹
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const it of items) {
      if (!it.due_date) continue
      const key = String(it.due_date).slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return map
  }, [items])

  // 마감일 없는 항목 수
  const noDueCount = useMemo(
    () => items.filter(i => !i.due_date && i.status === 'open').length,
    [items]
  )

  // 월 그리드 — 6주 × 7일
  const cells = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDay = new Date(year, month, 1)
    const startWeekday = firstDay.getDay()
    const gridStart = new Date(year, month, 1 - startWeekday)
    const arr: { date: Date; inMonth: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      arr.push({ date: d, inMonth: d.getMonth() === month })
    }
    return arr
  }, [cursor])

  const monthLabel = `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`
  const prevMonth = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))
  const nextMonth = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))
  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))

  return (
    <div style={{ ...GLASS.L4, borderRadius: 16, padding: 16 }}>
      {/* 헤더 — 월 네비 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prevMonth} style={navBtn} title="이전 달">‹</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary, whiteSpace: 'nowrap', minWidth: 110, textAlign: 'center' }}>
            {monthLabel}
          </span>
          <button onClick={nextMonth} style={navBtn} title="다음 달">›</button>
          <button onClick={goToday} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12 }} title="오늘로">오늘</button>
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
          <span><span style={{ color: COLORS.primary }}>●</span> 회의 액션</span>
          <span><span style={{ color: '#7c3aed' }}>●</span> 개인 TODO</span>
          <span><span style={{ color: '#b91c1c' }}>●</span> 지연</span>
          {noDueCount > 0 && <span style={{ color: '#b45309' }}>마감일 미정 {noDueCount}건</span>}
        </div>
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '4px 0',
            color: i === 0 ? '#b91c1c' : i === 6 ? '#1d4ed8' : COLORS.textSecondary,
          }}>{w}</div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map(({ date, inMonth }, i) => {
          const key = ymd(date)
          const dayItems = byDate.get(key) || []
          const isToday = date.getTime() === today.getTime()
          const weekday = date.getDay()
          return (
            <div key={i} style={{
              minHeight: 92,
              background: inMonth ? (isToday ? `${COLORS.primary}0A` : GLASS.L1.background) : 'rgba(0,0,0,0.015)',
              border: isToday ? `1.5px solid ${COLORS.primary}` : '1px solid rgba(0,0,0,0.05)',
              borderRadius: 8, padding: 5,
              opacity: inMonth ? 1 : 0.45,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, marginBottom: 3,
                color: isToday ? COLORS.primary
                  : weekday === 0 ? '#b91c1c' : weekday === 6 ? '#1d4ed8' : COLORS.textSecondary,
              }}>
                {date.getDate()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dayItems.slice(0, 4).map(it => {
                  const done = it.status === 'done'
                  const overdue = it.status === 'open' && date.getTime() < today.getTime()
                  const color = overdue ? '#b91c1c' : it.source === 'meeting' ? COLORS.primary : '#7c3aed'
                  return (
                    <button key={`${it.source}-${it.id}`}
                      onClick={() => onItemClick(it)}
                      title={it.content}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 4,
                        background: `${color}1A`, color,
                        border: 'none', cursor: 'pointer',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        textDecoration: done ? 'line-through' : 'none',
                        opacity: done ? 0.55 : 1,
                      }}>
                      {it.source === 'meeting' ? '📋' : '📌'} {it.content}
                    </button>
                  )
                })}
                {dayItems.length > 4 && (
                  <span style={{ fontSize: 9, color: COLORS.textMuted, padding: '0 5px' }}>
                    +{dayItems.length - 4}건 더
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: GLASS.L1.background, color: COLORS.textSecondary,
  cursor: 'pointer', fontSize: 14, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

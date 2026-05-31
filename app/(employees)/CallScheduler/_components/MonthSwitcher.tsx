'use client'
// ═══════════════════════════════════════════════════════════════════
// MonthSwitcher — 스케줄 상세 헤더 좌우 화살표 + 월 드롭다운
//   사용자 요청 (2026-05-28): 「리스트 나가고 다시 누르고 불편하네요」
//
//   기존: 다른 월 보려면 /CallScheduler/schedules 로 이동 → 재선택
//   신:   상세 페이지 헤더에서 ◀ ▶ 또는 드롭다운으로 즉시 이동
//
//   데이터 출처: GET /api/call-scheduler/schedules (전체 월 목록 — DESC 정렬)
//   동작: 현재 schedule id 기준 인접 월 찾아 router.push
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

interface ScheduleItem {
  id: string
  year: number
  month: number
  title: string | null
  status: 'draft' | 'published' | 'archived'
}

export default function MonthSwitcher({
  currentId,
  currentYear,
  currentMonth,
}: {
  currentId: string
  currentYear: number
  currentMonth: number
}) {
  const router = useRouter()
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [open, setOpen] = useState(false)

  // 전체 월 목록 fetch (DESC: 최신 월이 첫 번째)
  useEffect(() => {
    let abort = false
    ;(async () => {
      try {
        const auth = await getAuthHeader()
        const res = await fetch('/api/call-scheduler/schedules', { headers: auth })
        if (!res.ok) return
        const json = await res.json()
        if (abort) return
        const list = (json?.data || []) as ScheduleItem[]
        setItems(list)
      } catch {
        /* graceful — 실패 시 화살표 비활성 */
      }
    })()
    return () => { abort = true }
  }, [])

  // 외부 클릭으로 드롭다운 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-month-switcher]')) setOpen(false)
    }
    setTimeout(() => document.addEventListener('click', handler), 0)
    return () => document.removeEventListener('click', handler)
  }, [open])

  // 정렬: 시간 ASC (옛 → 최신) 로 인접 계산
  const sortedAsc = [...items].sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month))
  const curIdx = sortedAsc.findIndex(s => s.id === currentId)
  const prev = curIdx > 0 ? sortedAsc[curIdx - 1] : null
  const next = curIdx >= 0 && curIdx < sortedAsc.length - 1 ? sortedAsc[curIdx + 1] : null

  const go = (id: string) => {
    setOpen(false)
    router.push(`/CallScheduler/${id}`)
  }

  const labelOf = (s: ScheduleItem) => `${s.year}년 ${s.month}월`
  const statusBadge = (s: ScheduleItem) => {
    if (s.status === 'published') return { text: '공지', color: COLORS.success, bg: COLORS.bgGreen }
    if (s.status === 'archived') return { text: '보관', color: COLORS.textMuted, bg: COLORS.bgGray }
    return { text: '초안', color: COLORS.info, bg: COLORS.bgBlue }
  }

  // 버튼 공통 스타일
  const arrowStyle = (enabled: boolean): React.CSSProperties => ({
    fontSize: 13, fontWeight: 800, padding: '5px 9px', borderRadius: 6,
    background: enabled ? 'transparent' : 'transparent',
    color: enabled ? COLORS.textSecondary : COLORS.textMuted,
    border: `1px solid ${enabled ? COLORS.borderFaint : 'transparent'}`,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4,
    lineHeight: 1,
  })

  return (
    <div data-month-switcher style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      position: 'relative',
    }}>
      {/* ◀ 이전 월 */}
      <button
        type="button"
        onClick={() => prev && go(prev.id)}
        disabled={!prev}
        style={arrowStyle(!!prev)}
        title={prev ? `← ${labelOf(prev)}` : '이전 월 없음'}
      >◀</button>

      {/* 현재 월 + 드롭다운 토글 */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 13, fontWeight: 700, padding: '5px 10px', borderRadius: 6,
          background: open ? COLORS.bgGray : 'transparent',
          color: '#0f2440',
          border: `1px solid ${open ? COLORS.borderSubtle : COLORS.borderFaint}`,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
          lineHeight: 1,
        }}
        title={items.length > 1 ? '월 목록 펼치기' : '월 1개뿐'}
      >
        {currentYear}년 {currentMonth}월
        <span style={{ fontSize: 9, color: COLORS.textMuted }}>▼</span>
      </button>

      {/* ▶ 다음 월 */}
      <button
        type="button"
        onClick={() => next && go(next.id)}
        disabled={!next}
        style={arrowStyle(!!next)}
        title={next ? `${labelOf(next)} →` : '다음 월 없음'}
      >▶</button>

      {/* 드롭다운 패널 — 최신 월이 위 (DESC) */}
      {open && items.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          minWidth: 200, maxHeight: 320, overflowY: 'auto',
          background: '#fff', border: `1px solid ${COLORS.borderSubtle}`,
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 100, padding: 6,
          display: 'flex', flexDirection: 'column', gap: 1,
        }}>
          {items.map(s => {
            const active = s.id === currentId
            const badge = statusBadge(s)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', borderRadius: 6,
                  background: active ? COLORS.bgBlue : 'transparent',
                  border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = COLORS.bgGray
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{
                  fontSize: 12, fontWeight: active ? 800 : 600,
                  color: active ? COLORS.info : COLORS.textPrimary,
                  whiteSpace: 'nowrap',
                }}>
                  {active && '✓ '}{labelOf(s)}
                  {s.title && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, color: COLORS.textMuted, fontWeight: 500,
                    }}>{s.title}</span>
                  )}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700, color: badge.color,
                  background: badge.bg, padding: '1px 6px', borderRadius: 99,
                  whiteSpace: 'nowrap', marginLeft: 8,
                }}>{badge.text}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

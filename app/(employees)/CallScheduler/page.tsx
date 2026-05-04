'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler — 월별 스케줄 목록
// CLAUDE.md §10 Soft Ice 글래스 + 규칙 18 정렬 적용
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

export const dynamic = 'force-dynamic'

interface ScheduleListItem {
  id: string
  year: number
  month: number
  title: string | null
  status: 'draft' | 'published' | 'archived'
  source: string
  published_at: string | null
  worker_count: number
  total_cells: number
  filled_cells: number
  fill_rate: number
  created_at: string
  updated_at: string
}

type SortKey = 'year_month' | 'status' | 'workers' | 'fill' | 'updated'
type SortDir = 'asc' | 'desc'

export default function CallSchedulerListPage() {
  const [items, setItems] = useState<ScheduleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('year_month')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    let abort = false
    ;(async () => {
      setLoading(true)
      try {
        const auth = await getAuthHeader()
        const res = await fetch('/api/call-scheduler/schedules', { headers: auth })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '목록 조회 실패')
        if (!abort) setItems(json.data as ScheduleListItem[])
      } catch (e: any) {
        if (!abort) setError(e?.message || '오류')
      } finally {
        if (!abort) setLoading(false)
      }
    })()
    return () => { abort = true }
  }, [])

  const sorted = useMemo(() => {
    const arr = [...items]
    arr.sort((a, b) => {
      let av: any, bv: any
      switch (sortKey) {
        case 'year_month': av = a.year * 100 + a.month; bv = b.year * 100 + b.month; break
        case 'status':     av = a.status; bv = b.status; break
        case 'workers':    av = a.worker_count; bv = b.worker_count; break
        case 'fill':       av = a.fill_rate; bv = b.fill_rate; break
        case 'updated':    av = new Date(a.updated_at).getTime(); bv = new Date(b.updated_at).getTime(); break
      }
      const cmp = typeof av === 'string'
        ? av.localeCompare(bv as string)
        : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [items, sortKey, sortDir])

  const aggregate = useMemo(() => {
    if (items.length === 0) return null
    const draft = items.filter(i => i.status === 'draft').length
    const published = items.filter(i => i.status === 'published').length
    const totalWorkers = items.reduce((s, i) => s + i.worker_count, 0)
    const avgFill = items.reduce((s, i) => s + i.fill_rate, 0) / items.length
    return { draft, published, totalWorkers, avgFill }
  }, [items])

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: 0 }}>
            ⏰ 근무시간표 분석 & 배포
          </h1>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
            월별 콜 스케줄 작성 · 분석 · 공지
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link
            href="/RideEmployees"
            style={{
              ...BTN.md, background: 'transparent',
              color: COLORS.textSecondary,
              border: `1px solid ${COLORS.borderFaint}`,
              textDecoration: 'none', display: 'inline-block',
            }}
            title="직원 마스터 — Ride 직원 관리"
          >
            📋 직원 마스터
          </Link>
          <Link
            href="/CallScheduler/settings"
            style={{
              ...BTN.md, background: 'transparent',
              color: COLORS.textSecondary,
              border: `1px solid ${COLORS.borderFaint}`,
              textDecoration: 'none', display: 'inline-block',
            }}
            title="시간 / 그룹 / 직원 / 공휴일 / 휴가"
          >
            ⚙️ 설정
          </Link>
          <Link
            href="/CallScheduler/new"
            style={{
              ...BTN.lg, background: COLORS.primary, color: '#fff',
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            + 새 월 만들기
          </Link>
        </div>
      </div>

      {aggregate && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
          marginBottom: 16,
        }}>
          <KpiTile label="활성 스케줄" value={items.length.toString()} sub={`초안 ${aggregate.draft} · 공지 ${aggregate.published}`} tone="blue" />
          <KpiTile label="공지 완료" value={aggregate.published.toString()} sub={`전체 중 ${Math.round(aggregate.published / items.length * 100)}%`} tone="green" />
          <KpiTile label="총 근무자" value={aggregate.totalWorkers.toString()} sub="누적 (중복 포함)" tone="amber" />
          <KpiTile label="평균 충원율" value={`${Math.round(aggregate.avgFill * 1000) / 10}%`} sub="전체 평균" tone={aggregate.avgFill > 0.9 ? 'green' : 'red'} />
        </div>
      )}

      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, overflow: 'auto' }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
        )}
        {error && (
          <div style={{
            padding: 12, background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            borderRadius: 8, color: COLORS.danger, fontSize: 13,
          }}>
            ❌ {error}
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 12 }}>
              아직 작성된 스케줄이 없습니다.
            </div>
            <Link
              href="/CallScheduler/new"
              style={{
                ...BTN.md, background: COLORS.primary, color: '#fff',
                textDecoration: 'none', display: 'inline-block',
              }}
            >
              첫 스케줄 만들기
            </Link>
          </div>
        )}
        {!loading && !error && items.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                <Th sortKey="year_month" current={sortKey} dir={sortDir} onClick={toggle}>년/월</Th>
                <Th sortKey="status" current={sortKey} dir={sortDir} onClick={toggle}>상태</Th>
                <Th sortKey="workers" current={sortKey} dir={sortDir} onClick={toggle} align="right">근무자</Th>
                <Th sortKey="fill" current={sortKey} dir={sortDir} onClick={toggle} align="right">충원율</Th>
                <Th sortKey="updated" current={sortKey} dir={sortDir} onClick={toggle} align="right">최근 수정</Th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => {
                const fillPct = Math.round(s.fill_rate * 1000) / 10
                const fillTone = s.fill_rate >= 0.9 ? 'success' : s.fill_rate >= 0.7 ? 'warning' : 'danger'
                const statusTone = s.status === 'published' ? 'success' : s.status === 'draft' ? 'info' : 'neutral'
                const statusLabel = s.status === 'published' ? '공지됨' : s.status === 'draft' ? '초안' : '보관'
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                    <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                      <Link href={`/CallScheduler/${s.id}`} style={{
                        color: COLORS.primary, fontWeight: 700, textDecoration: 'none',
                      }}>
                        {s.year}년 {s.month}월
                      </Link>
                      {s.title && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.textMuted }}>
                          {s.title}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={pillStyle(statusTone)}>{statusLabel}</span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: COLORS.textPrimary }}>
                      {s.worker_count}명
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <span style={pillStyle(fillTone)}>{fillPct}%</span>
                    </td>
                    <td style={{
                      padding: '10px', textAlign: 'right',
                      color: COLORS.textMuted, fontSize: 11,
                    }}>
                      {new Date(s.updated_at).toLocaleString('ko-KR', {
                        year: '2-digit', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <Link href={`/CallScheduler/${s.id}`} style={{
                        ...BTN.sm, background: COLORS.bgBlue, color: COLORS.info,
                        border: `1px solid ${COLORS.borderBlue}`,
                        textDecoration: 'none', display: 'inline-block',
                      }}>
                        열기
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Th({ children, sortKey, current, dir, onClick, align = 'left' }: {
  children: React.ReactNode
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  onClick: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  return (
    <th
      onClick={() => onClick(sortKey)}
      style={{
        padding: '8px 10px', textAlign: align,
        color: COLORS.textSecondary, fontWeight: 700,
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
      }}
    >
      {children}{current === sortKey ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )
}

function KpiTile({ label, value, sub, tone }: {
  label: string
  value: string
  sub: string
  tone: 'blue' | 'green' | 'amber' | 'red'
}) {
  const tintMap = {
    blue:  { bg: COLORS.bgBlue,  border: COLORS.borderBlue,  color: COLORS.info },
    green: { bg: COLORS.bgGreen, border: COLORS.borderGreen, color: COLORS.success },
    amber: { bg: COLORS.bgAmber, border: COLORS.borderAmber, color: COLORS.warning },
    red:   { bg: COLORS.bgRed,   border: COLORS.borderRed,   color: COLORS.danger },
  }[tone]
  return (
    <div style={{
      ...GLASS.L3, background: tintMap.bg, border: `1px solid ${tintMap.border}`,
      borderRadius: 12, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tintMap.color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: COLORS.textMuted }}>{sub}</div>
    </div>
  )
}

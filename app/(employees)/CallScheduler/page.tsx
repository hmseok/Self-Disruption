'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler — 대시보드 (월별 스케줄 list + 운영 셋팅 펼침)
// CLAUDE.md §10 Soft Ice 글래스 + 규칙 18 정렬 적용
// SubNav 는 layout.tsx 에서 자동 적용 (factory-search 패턴)
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from './utils/palette'
import { getAuthHeader } from '@/app/utils/auth-client'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()
  const [items, setItems] = useState<ScheduleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('year_month')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [pendingCount, setPendingCount] = useState(0)
  const [opsCounts, setOpsCounts] = useState<{
    slots: number; groups: number; workers: number; quotaWorkers: number
  } | null>(null)
  const [expandedCard, setExpandedCard] = useState<'shifts' | 'groups' | 'workers' | 'quota' | null>(null)
  const [opsData, setOpsData] = useState<{
    slots: any[]; groups: any[]; workers: any[]
    quotaShortWorkers: { name: string; remaining: number; total: number; tone: string }[]
  }>({ slots: [], groups: [], workers: [], quotaShortWorkers: [] })

  // 직원 요청 카운트 + 운영 셋팅 fetch
  useEffect(() => {
    let abort = false
    ;(async () => {
      try {
        const auth = await getAuthHeader()
        const today = new Date()
        const monthStart = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`
        const future = new Date(today); future.setDate(future.getDate() + 90)
        const futureEnd = `${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}`
        const [skipR, leaveR, swapR, slotR, groupR, workerR, quotaR] = await Promise.all([
          fetch(`/api/call-scheduler/skip-dates?from=${monthStart}&to=${futureEnd}&status=requested`, { headers: auth }),
          fetch('/api/call-scheduler/leaves?status=pending', { headers: auth }),
          fetch('/api/call-scheduler/swap-requests?status=pending', { headers: auth }),
          fetch('/api/call-scheduler/shift-slots', { headers: auth }),
          fetch('/api/call-scheduler/shift-groups', { headers: auth }),
          fetch('/api/call-scheduler/workers', { headers: auth }),
          fetch(`/api/call-scheduler/leave-quotas?year=${today.getFullYear()}`, { headers: auth }),
        ])
        if (abort) return
        const skipJ = skipR.ok ? await skipR.json() : { data: [] }
        const leaveJ = leaveR.ok ? await leaveR.json() : { data: [] }
        const swapJ = swapR.ok ? await swapR.json() : { data: [] }
        const sum = (skipJ.data?.length || 0) + (leaveJ.data?.length || 0) + (swapJ.data?.length || 0)
        if (!abort) setPendingCount(sum)
        const slotJ = slotR.ok ? await slotR.json() : { data: [] }
        const groupJ = groupR.ok ? await groupR.json() : { data: [] }
        const workerJ = workerR.ok ? await workerR.json() : { data: [] }
        const quotaJ = quotaR.ok ? await quotaR.json() : { data: [] }
        const quotaWorkerSet = new Set(
          (quotaJ.data || []).filter((q: any) => Number(q.granted_days || 0) > 0).map((q: any) => q.worker_id),
        )
        const slots = slotJ.data || []
        const groups = (groupJ.data || []).filter((g: any) => g.is_active !== false)
        const workers = workerJ.data || []
        const workerNameMap = new Map(workers.map((w: any) => [w.id, { name: w.name, tone: w.color_tone }]))
        const shortByWorker = new Map<string, { name: string; remaining: number; total: number; tone: string }>()
        for (const q of (quotaJ.data || [])) {
          const remaining = Number(q.remaining_days || 0)
          const total = Number(q.granted_days || 0) + Number(q.carried_over_days || 0)
          if (remaining < 3 && total > 0) {
            const w = workerNameMap.get(q.worker_id) as { name: string; tone: string } | undefined
            if (!w) continue
            const cur = shortByWorker.get(q.worker_id)
            if (!cur || remaining < cur.remaining) {
              shortByWorker.set(q.worker_id, { name: w.name, remaining, total, tone: w.tone || 'none' })
            }
          }
        }
        if (!abort) {
          setOpsCounts({
            slots: slots.length, groups: groups.length,
            workers: workers.length, quotaWorkers: quotaWorkerSet.size,
          })
          setOpsData({
            slots, groups, workers,
            quotaShortWorkers: Array.from(shortByWorker.values()).sort((a, b) => a.remaining - b.remaining),
          })
        }
      } catch { /* graceful */ }
    })()
    return () => { abort = true }
  }, [])

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

  // N-10 — DcStatStrip 용 5 stat (정산 관리 기준)
  const statItems: StatItem[] = useMemo(() => {
    if (!aggregate) return []
    return [
      { label: '활성 스케줄', value: items.length, subValue: `초안 ${aggregate.draft} · 공지 ${aggregate.published}`, tint: 'blue' as const },
      { label: '공지 완료', value: aggregate.published, subValue: items.length > 0 ? `${Math.round(aggregate.published / items.length * 100)}%` : '0%', tint: 'green' as const },
      { label: '총 근무자', value: aggregate.totalWorkers, subValue: '누적', tint: 'amber' as const },
      { label: '평균 충원율', value: `${Math.round(aggregate.avgFill * 1000) / 10}%`, subValue: '전체', tint: (aggregate.avgFill > 0.9 ? 'green' : 'red') as 'green' | 'red' },
      { label: '직원 요청', value: pendingCount, subValue: pendingCount > 0 ? '대기' : '없음', tint: 'purple' as const },
    ]
  }, [aggregate, items.length, pendingCount])

  // N-12 — 액션 버튼 (DcStatStrip actions 슬롯)
  const statActions: ActionButton[] = [
    { label: '새 월 만들기', onClick: () => router.push('/CallScheduler/new'), variant: 'primary', icon: '+' },
    { label: '직원 마스터', onClick: () => router.push('/RideEmployees'), variant: 'secondary', icon: '👥' },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* N-12 — 자체 헤더 제거 (PageTitle 자동) */}

      {/* DcStatStrip — 5 카드 + 액션 (정산 관리 기준) */}
      {statItems.length > 0 && <DcStatStrip stats={statItems} actions={statActions} />}

      {/* 운영 셋팅 펼침 (영역 한눈에 확인 — 깊은 편집은 SubNav 의 시프트/그룹/... 탭) */}
      {opsCounts && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
              ⚙️ 운영 셋팅 펼침
              <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted, marginLeft: 6 }}>
                카드 클릭 → 인라인 펼침 / 깊은 편집은 위 탭에서
              </span>
            </div>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
          }}>
            <SettingsTile expanded={expandedCard === 'shifts'}
                          onToggle={() => setExpandedCard(expandedCard === 'shifts' ? null : 'shifts')}
                          icon="🕐" label="시프트" value={opsCounts.slots} sub="시간대 정의" tone="blue" />
            <SettingsTile expanded={expandedCard === 'groups'}
                          onToggle={() => setExpandedCard(expandedCard === 'groups' ? null : 'groups')}
                          icon="🚧" label="그룹" value={opsCounts.groups} sub="시프트 + 멤버 + 패턴" tone="violet" />
            <SettingsTile expanded={expandedCard === 'workers'}
                          onToggle={() => setExpandedCard(expandedCard === 'workers' ? null : 'workers')}
                          icon="👥" label="콜센터 워커" value={opsCounts.workers} sub="정체성 + 외부 cycle" tone="amber" />
            <SettingsTile expanded={expandedCard === 'quota'}
                          onToggle={() => setExpandedCard(expandedCard === 'quota' ? null : 'quota')}
                          icon="💼" label="휴가 quota" value={opsCounts.quotaWorkers}
                          sub={opsCounts.workers > 0 ? `${opsCounts.quotaWorkers}/${opsCounts.workers} 셋팅` : '직원별 잔여'}
                          tone={opsCounts.quotaWorkers < opsCounts.workers ? 'red' : 'green'} />
          </div>
          {expandedCard && (
            <div style={{
              ...GLASS.L1, borderRadius: 10, padding: 14, marginTop: 12,
              border: `1px solid ${COLORS.borderFaint}`,
            }}>
              {expandedCard === 'shifts' && <ExpandedShifts slots={opsData.slots} />}
              {expandedCard === 'groups' && <ExpandedGroups groups={opsData.groups} />}
              {expandedCard === 'workers' && <ExpandedWorkers workers={opsData.workers} />}
              {expandedCard === 'quota' && (
                <ExpandedQuota shortWorkers={opsData.quotaShortWorkers}
                               total={opsCounts.workers} setCount={opsCounts.quotaWorkers} />
              )}
            </div>
          )}
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
            <Link href="/CallScheduler/new" style={{
              ...BTN.md, background: COLORS.primary, color: '#fff',
              textDecoration: 'none', display: 'inline-block',
            }}>
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
  label: string; value: string; sub: string
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
      <div style={{ fontSize: 18, fontWeight: 800, color: tintMap.color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: COLORS.textMuted }}>{sub}</div>
    </div>
  )
}

function SettingsTile({ expanded, onToggle, icon, label, value, sub, tone }: {
  expanded: boolean
  onToggle: () => void
  icon: string; label: string; value: number; sub: string
  tone: 'blue' | 'green' | 'amber' | 'red' | 'violet'
}) {
  const tintMap = {
    blue:   { bg: COLORS.bgBlue,   border: COLORS.borderBlue,   color: COLORS.info },
    green:  { bg: COLORS.bgGreen,  border: COLORS.borderGreen,  color: COLORS.success },
    amber:  { bg: COLORS.bgAmber,  border: COLORS.borderAmber,  color: COLORS.warning },
    red:    { bg: COLORS.bgRed,    border: COLORS.borderRed,    color: COLORS.danger },
    violet: { bg: COLORS.bgViolet, border: COLORS.borderViolet, color: '#7c3aed' },
  }[tone]
  return (
    <button type="button" onClick={onToggle}
            style={{
              ...GLASS.L1, background: tintMap.bg,
              border: `${expanded ? '2px' : '1.5px'} solid ${tintMap.border}`,
              borderRadius: 10, padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 4,
              cursor: 'pointer', textAlign: 'left',
              transition: 'transform 0.12s, box-shadow 0.12s',
              boxShadow: expanded ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
              transform: expanded ? 'translateY(-2px)' : 'none',
            }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 12, color: COLORS.textSecondary, fontWeight: 700,
      }}>
        <span>{icon} {label}</span>
        <span style={{ fontSize: 10, color: tintMap.color, fontWeight: 800 }}>
          {expanded ? '▼' : '▶'}
        </span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: tintMap.color, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: COLORS.textMuted }}>{sub}</div>
    </button>
  )
}

function ExpandedShifts({ slots }: { slots: any[] }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 8 }}>
        🕐 시프트 ({slots.length}개)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {slots.map((s: any) => (
          <span key={s.id} style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: s.is_overnight ? COLORS.bgViolet : COLORS.bgBlue,
            color: s.is_overnight ? '#7c3aed' : COLORS.info,
            border: `1px solid ${s.is_overnight ? COLORS.borderViolet : COLORS.borderBlue}`,
            fontFamily: 'monospace',
          }}>
            {s.code} {s.start_time?.substring(0,5)}~{s.end_time?.substring(0,5)}
            {s.is_overnight && <span style={{ marginLeft: 4, fontSize: 9 }}>익</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

function ExpandedGroups({ groups }: { groups: any[] }) {
  const byCategory = new Map<string, any[]>()
  for (const g of groups) {
    const cat = g.category || 'general'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(g)
  }
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 8 }}>
        🚧 그룹 ({groups.length}개)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Array.from(byCategory.entries()).map(([cat, list]) => {
          const catColor = cat === '야간' ? COLORS.bgViolet
                         : cat === '저녁' ? COLORS.bgAmber
                         : cat === '주간' ? COLORS.bgBlue
                         : cat === '특수' ? COLORS.bgRed
                         : 'rgba(0,0,0,0.04)'
          const catBorder = cat === '야간' ? COLORS.borderViolet
                          : cat === '저녁' ? COLORS.borderAmber
                          : cat === '주간' ? COLORS.borderBlue
                          : cat === '특수' ? COLORS.borderRed
                          : COLORS.borderFaint
          return (
            <div key={cat} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 8,
              background: catColor, border: `1px solid ${catBorder}`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, minWidth: 60, color: COLORS.textPrimary }}>
                {cat === 'general' ? '일반' : cat}
              </span>
              <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {list.map((g: any) => (
                  <span key={g.id} style={{
                    padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: 'rgba(255,255,255,0.7)', color: COLORS.textPrimary,
                    border: `1px solid ${COLORS.borderFaint}`,
                  }}>
                    {g.name}
                    <span style={{ marginLeft: 4, fontSize: 9, color: COLORS.textMuted }}>
                      ({g.member_count || 0})
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ExpandedWorkers({ workers }: { workers: any[] }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 8 }}>
        👥 콜센터 워커 ({workers.length}명)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {workers.map((w: any) => {
          const tone = (w.color_tone || 'none') as keyof typeof TONE_BG
          return (
            <span key={w.id} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: TONE_BG[tone] !== 'transparent' ? TONE_BG[tone] : 'rgba(255,255,255,0.7)',
              color: TONE_TEXT[tone] || COLORS.textPrimary,
              border: `1px solid ${COLORS.borderFaint}`,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {w.name}
              {w.is_external && <span style={{ fontSize: 9, fontWeight: 800 }} title="외부 직원">🔒</span>}
              {w.cycle_days_on && <span style={{ fontSize: 9, color: COLORS.textMuted }} title="외부 cycle">🏢</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function ExpandedQuota({ shortWorkers, total, setCount }: {
  shortWorkers: { name: string; remaining: number; total: number; tone: string }[]
  total: number
  setCount: number
}) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 8 }}>
        💼 휴가 quota — 셋팅 {setCount}/{total} 명
        {shortWorkers.length > 0 && (
          <span style={{
            marginLeft: 8, padding: '2px 8px', borderRadius: 99,
            background: COLORS.bgRed, color: COLORS.danger,
            fontSize: 11, fontWeight: 800,
          }}>
            ⚠ 잔여 부족 {shortWorkers.length}건
          </span>
        )}
      </div>
      {shortWorkers.length === 0 ? (
        <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '8px 0' }}>
          잔여 3일 미만 워커 없음 — 모두 안정.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {shortWorkers.map((w, i) => {
            const tone = w.tone as keyof typeof TONE_BG
            return (
              <span key={i} style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: TONE_BG[tone] !== 'transparent' ? TONE_BG[tone] : 'rgba(255,255,255,0.7)',
                color: TONE_TEXT[tone] || COLORS.textPrimary,
                border: `1.5px solid ${w.remaining < 1 ? COLORS.borderRed : COLORS.borderAmber}`,
              }}>
                {w.name}
                <span style={{
                  marginLeft: 6, fontSize: 11, fontWeight: 800,
                  color: w.remaining < 1 ? COLORS.danger : COLORS.warning,
                }}>
                  {w.remaining}/{w.total}일
                </span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

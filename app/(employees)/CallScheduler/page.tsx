'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler — 매니저 통합 콘솔 (Phase N-8: 사이드바 layout)
//   nav: 📊 대시보드 / 📅 스케줄 / 📋 직원 요청
//        🕐 시프트 / 🚧 그룹 / 👥 워커 / 🎌 공휴일 / 💼 휴가 quota
//   URL ?view=... deep-link
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from './utils/palette'
import { getAuthHeader } from '@/app/utils/auth-client'
import ShiftsTab from './settings/ShiftsTab'
import GroupsTab from './settings/GroupsTab'
import WorkersTab from './settings/WorkersTab'
import HolidaysTab from './settings/HolidaysTab'
import LeavesTab from './settings/LeavesTab'

export const dynamic = 'force-dynamic'

type ViewKey = 'dashboard' | 'schedules' | 'requests'
              | 'shifts' | 'groups' | 'workers' | 'holidays' | 'leaves'
const VALID_VIEWS: ViewKey[] = [
  'dashboard', 'schedules', 'requests',
  'shifts', 'groups', 'workers', 'holidays', 'leaves',
]

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
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>}>
      <CallSchedulerInner />
    </Suspense>
  )
}

function CallSchedulerInner() {
  const sp = useSearchParams()
  const router = useRouter()
  const initialView = (sp?.get('view') as ViewKey) || 'dashboard'
  const [view, setView] = useState<ViewKey>(VALID_VIEWS.includes(initialView) ? initialView : 'dashboard')
  const navigate = (v: ViewKey) => {
    setView(v)
    const url = v === 'dashboard' ? '/CallScheduler' : `/CallScheduler?view=${v}`
    router.replace(url)
  }
  useEffect(() => {
    const v = sp?.get('view') as ViewKey
    if (v && VALID_VIEWS.includes(v) && v !== view) setView(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp])

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

  // 스케줄 list fetch
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
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
      {/* 좌측 사이드바 */}
      <Sidebar view={view} onNavigate={navigate} pendingCount={pendingCount} opsCounts={opsCounts} />

      {/* 우측 컨텐트 */}
      <div style={{ flex: 1, padding: '20px 24px', minWidth: 0 }}>
        {view === 'dashboard' && (
          <DashboardContent
            items={items} sorted={sorted} aggregate={aggregate}
            loading={loading} error={error}
            sortKey={sortKey} sortDir={sortDir} toggle={toggle}
            opsCounts={opsCounts} opsData={opsData}
            expandedCard={expandedCard} setExpandedCard={setExpandedCard}
            pendingCount={pendingCount}
          />
        )}
        {view === 'schedules' && (
          <SchedulesContent
            items={items} sorted={sorted}
            loading={loading} error={error}
            sortKey={sortKey} sortDir={sortDir} toggle={toggle}
          />
        )}
        {view === 'requests' && <RequestsContent />}
        {view === 'shifts' && <SettingsViewWrap title="🕐 시프트"><ShiftsTab /></SettingsViewWrap>}
        {view === 'groups' && <SettingsViewWrap title="🚧 그룹"><GroupsTab /></SettingsViewWrap>}
        {view === 'workers' && <SettingsViewWrap title="👥 콜센터 워커"><WorkersTab /></SettingsViewWrap>}
        {view === 'holidays' && <SettingsViewWrap title="🎌 공휴일"><HolidaysTab /></SettingsViewWrap>}
        {view === 'leaves' && <SettingsViewWrap title="💼 휴가 quota"><LeavesTab /></SettingsViewWrap>}
      </div>
    </div>
  )
}

// ── 사이드바 ────────────────────────────────────────────────────────
function Sidebar({ view, onNavigate, pendingCount, opsCounts }: {
  view: ViewKey
  onNavigate: (v: ViewKey) => void
  pendingCount: number
  opsCounts: { slots: number; groups: number; workers: number; quotaWorkers: number } | null
}) {
  return (
    <div style={{
      width: 220, minHeight: 'calc(100vh - 60px)',
      ...GLASS.L2, borderRight: `1px solid ${COLORS.borderFaint}`,
      padding: '20px 12px',
      display: 'flex', flexDirection: 'column', gap: 4,
      position: 'sticky', top: 0, alignSelf: 'flex-start',
    }}>
      <div style={{ padding: '0 8px 12px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
          ⏰ CallScheduler
        </div>
        <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
          매니저 통합 콘솔
        </div>
      </div>

      <NavItem active={view === 'dashboard'} onClick={() => onNavigate('dashboard')}
               emoji="📊" label="대시보드" />
      <NavItem active={view === 'schedules'} onClick={() => onNavigate('schedules')}
               emoji="📅" label="스케줄" />
      <NavItem active={view === 'requests'} onClick={() => onNavigate('requests')}
               emoji="📋" label="직원 요청"
               badge={pendingCount > 0 ? pendingCount : undefined} badgeTone="warning" />

      <div style={{
        margin: '14px 8px 8px', paddingTop: 10,
        borderTop: `1px solid ${COLORS.borderFaint}`,
        fontSize: 10, fontWeight: 700, color: COLORS.textMuted,
      }}>
        ⚙ 운영 셋팅
      </div>
      <NavItem active={view === 'shifts'} onClick={() => onNavigate('shifts')}
               emoji="🕐" label="시프트" badge={opsCounts?.slots} />
      <NavItem active={view === 'groups'} onClick={() => onNavigate('groups')}
               emoji="🚧" label="그룹" badge={opsCounts?.groups} />
      <NavItem active={view === 'workers'} onClick={() => onNavigate('workers')}
               emoji="👥" label="워커" badge={opsCounts?.workers} />
      <NavItem active={view === 'holidays'} onClick={() => onNavigate('holidays')}
               emoji="🎌" label="공휴일" />
      <NavItem active={view === 'leaves'} onClick={() => onNavigate('leaves')}
               emoji="💼" label="휴가 quota" />

      <div style={{ flex: 1 }} />

      <Link href="/RideEmployees" style={{
        margin: '0 8px', padding: '8px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
        color: COLORS.textSecondary, textDecoration: 'none',
        border: `1px solid ${COLORS.borderFaint}`,
        textAlign: 'center',
      }}>
        → 직원 마스터
      </Link>
    </div>
  )
}

function NavItem({ active, onClick, emoji, label, badge, badgeTone }: {
  active: boolean
  onClick: () => void
  emoji: string
  label: string
  badge?: number
  badgeTone?: 'warning' | 'info'
}) {
  return (
    <button type="button" onClick={onClick}
            style={{
              padding: '10px 12px', borderRadius: 8,
              background: active ? COLORS.primary : 'transparent',
              color: active ? '#fff' : COLORS.textPrimary,
              border: 'none', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 13, fontWeight: active ? 800 : 600,
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      <span>{emoji} {label}</span>
      {badge != null && badge > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 800,
          padding: '2px 7px', borderRadius: 99,
          background: active ? 'rgba(255,255,255,0.25)'
                    : badgeTone === 'warning' ? COLORS.warning : COLORS.info,
          color: '#fff',
        }}>
          {badgeTone === 'warning' ? `⏳ ${badge}` : badge}
        </span>
      )}
    </button>
  )
}

// ── 컨텐트 wrappers ────────────────────────────────────────────────
function SettingsViewWrap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, margin: '0 0 14px' }}>
        {title}
      </h1>
      {children}
    </div>
  )
}

function RequestsContent() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, margin: '0 0 14px' }}>
        📋 직원 요청 통합 검토
      </h1>
      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 8 }}>
          회피일 / 휴가 / 시프트 교체 — 일괄 처리
        </div>
        <Link href="/CallScheduler/requests" style={{
          ...BTN.lg, background: COLORS.primary, color: '#fff',
          textDecoration: 'none', display: 'inline-block', marginTop: 12,
        }}>
          전체 페이지 열기 →
        </Link>
      </div>
    </div>
  )
}

// ── 대시보드 컨텐트 ──────────────────────────────────────────────
function DashboardContent(props: {
  items: ScheduleListItem[]; sorted: ScheduleListItem[]
  aggregate: { draft: number; published: number; totalWorkers: number; avgFill: number } | null
  loading: boolean; error: string | null
  sortKey: SortKey; sortDir: SortDir; toggle: (k: SortKey) => void
  opsCounts: { slots: number; groups: number; workers: number; quotaWorkers: number } | null
  opsData: any
  expandedCard: 'shifts' | 'groups' | 'workers' | 'quota' | null
  setExpandedCard: (c: any) => void
  pendingCount: number
}) {
  const { items, sorted, aggregate, loading, error, sortKey, sortDir, toggle,
          opsCounts, opsData, expandedCard, setExpandedCard } = props
  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: 0 }}>
            📊 대시보드
          </h1>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
            월별 콜 스케줄 작성 · 분석 · 공지
          </div>
        </div>
        <Link href="/CallScheduler/new" style={{
          ...BTN.lg, background: COLORS.primary, color: '#fff',
          textDecoration: 'none', display: 'inline-block',
        }}>
          + 새 월 만들기
        </Link>
      </div>

      {aggregate && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
          marginBottom: 12,
        }}>
          <KpiTile label="활성 스케줄" value={items.length.toString()}
                   sub={`초안 ${aggregate.draft} · 공지 ${aggregate.published}`} tone="blue" />
          <KpiTile label="공지 완료" value={aggregate.published.toString()}
                   sub={`전체 중 ${Math.round(aggregate.published / items.length * 100)}%`} tone="green" />
          <KpiTile label="총 근무자" value={aggregate.totalWorkers.toString()} sub="누적 (중복 포함)" tone="amber" />
          <KpiTile label="평균 충원율" value={`${Math.round(aggregate.avgFill * 1000) / 10}%`}
                   sub="전체 평균" tone={aggregate.avgFill > 0.9 ? 'green' : 'red'} />
        </div>
      )}

      {/* 운영 셋팅 인라인 카드 (사이드바 nav 와 별개 — 한눈에 펼쳐서 확인) */}
      {opsCounts && (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
              ⚙️ 운영 셋팅 펼침
              <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted, marginLeft: 6 }}>
                카드 클릭 → 인라인 펼침 (편집은 좌측 nav)
              </span>
            </div>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
          }}>
            <SettingsTile expanded={expandedCard === 'shifts'}
                          onToggle={() => setExpandedCard(expandedCard === 'shifts' ? null : 'shifts')}
                          icon="🕐" label="시프트" value={opsCounts.slots}
                          sub="시간대 정의" tone="blue" />
            <SettingsTile expanded={expandedCard === 'groups'}
                          onToggle={() => setExpandedCard(expandedCard === 'groups' ? null : 'groups')}
                          icon="🚧" label="그룹" value={opsCounts.groups}
                          sub="시프트 + 멤버 + 패턴" tone="violet" />
            <SettingsTile expanded={expandedCard === 'workers'}
                          onToggle={() => setExpandedCard(expandedCard === 'workers' ? null : 'workers')}
                          icon="👥" label="콜센터 워커" value={opsCounts.workers}
                          sub="정체성 + 외부 cycle" tone="amber" />
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

      {/* 최근 스케줄 list (컴팩트 5개) */}
      <SchedulesTable
        loading={loading} error={error} items={sorted.slice(0, 5)}
        sortKey={sortKey} sortDir={sortDir} toggle={toggle}
        title="📅 최근 스케줄" hintMore={items.length > 5 ? `+${items.length - 5}건 더 (스케줄 탭에서 전체)` : undefined}
      />
    </>
  )
}

// ── 스케줄 list 컨텐트 ────────────────────────────────────────────
function SchedulesContent(props: {
  items: ScheduleListItem[]; sorted: ScheduleListItem[]
  loading: boolean; error: string | null
  sortKey: SortKey; sortDir: SortDir; toggle: (k: SortKey) => void
}) {
  const { sorted, loading, error, sortKey, sortDir, toggle } = props
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, margin: 0 }}>
          📅 월별 스케줄
        </h1>
        <Link href="/CallScheduler/new" style={{
          ...BTN.lg, background: COLORS.primary, color: '#fff',
          textDecoration: 'none', display: 'inline-block',
        }}>
          + 새 월 만들기
        </Link>
      </div>
      <SchedulesTable
        loading={loading} error={error} items={sorted}
        sortKey={sortKey} sortDir={sortDir} toggle={toggle}
      />
    </div>
  )
}

// ── 스케줄 테이블 (재사용) ────────────────────────────────────────
function SchedulesTable({ loading, error, items, sortKey, sortDir, toggle, title, hintMore }: {
  loading: boolean; error: string | null
  items: ScheduleListItem[]
  sortKey: SortKey; sortDir: SortDir; toggle: (k: SortKey) => void
  title?: string
  hintMore?: string
}) {
  return (
    <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, overflow: 'auto' }}>
      {title && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 6px 10px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>{title}</div>
          {hintMore && (
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>{hintMore}</div>
          )}
        </div>
      )}
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
            {items.map(s => {
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
      <div style={{ fontSize: 24, fontWeight: 800, color: tintMap.color, lineHeight: 1.1 }}>{value}</div>
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
      <div style={{ fontSize: 22, fontWeight: 800, color: tintMap.color, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: COLORS.textMuted }}>{sub}</div>
    </button>
  )
}

// ── Expanded card 컨텐트 ──────────────────────────────────────────
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

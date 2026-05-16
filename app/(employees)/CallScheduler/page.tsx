'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler — 운영 풀세트 대시보드 (N-17)
// CLAUDE.md §10 Soft Ice 글래스 + 규칙 18 정렬 + 규칙 22 _docs 동기화
// SubNav 는 layout.tsx 자동 적용
//
// 영역 (위→아래):
//   1. KpiStrip — 운영 5 + 카페24 5 (2줄)
//   2. NowWorking — 지금 일하는 사람
//   3. TodayTomorrowGrid — 오늘 / 내일
//   4. PendingReviews — 검토 대기
//   5. EmptySlots — 이번 주 빈자리
//   6. NextAction — 다음 액션 (월말 자동 생성 안내)
//   7. UpcomingHolidays — 다가오는 휴일
//   8. NeuDataTable — 월별 스케줄 list (기존)
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState, useMemo } from 'react'
import { COLORS, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import NeuDataTable, { TableColumn } from '@/app/components/NeuDataTable'
import { useRouter } from 'next/navigation'
import KpiStrip, { DashboardKpi } from './_components/dashboard/KpiStrip'
import NowWorkingStrip, { WorkerChip } from './_components/dashboard/NowWorkingStrip'
import TodayTomorrowGrid from './_components/dashboard/TodayTomorrowGrid'
import PendingReviewsCard from './_components/dashboard/PendingReviewsCard'
import EmptySlotsAlert, { EmptySlot } from './_components/dashboard/EmptySlotsAlert'
import NextActionCard from './_components/dashboard/NextActionCard'
import UpcomingHolidaysCard, { Holiday } from './_components/dashboard/UpcomingHolidaysCard'

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

interface DashboardData {
  meta: {
    now_iso: string; today: string; tomorrow: string
    year: number; month: number; last_day: number
    today_label: string; tomorrow_label: string
    today_is_holiday: boolean; tomorrow_is_holiday: boolean
    schedule_id: string | null
  }
  kpi: DashboardKpi
  now_working: WorkerChip[]
  today_assignments: WorkerChip[]
  tomorrow_assignments: WorkerChip[]
  pending: { skip: number; leave: number; swap: number; total: number }
  empty_slots: EmptySlot[]
  next_action: {
    type: 'create_next_month' | 'finalize_draft' | 'none'
    msg: string
    next_year: number
    next_month: number
  }
  upcoming_holidays: Holiday[]
}

export default function CallSchedulerListPage() {
  const router = useRouter()
  const [items, setItems] = useState<ScheduleListItem[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 대시보드 fetch — 한 번 round-trip
  useEffect(() => {
    let abort = false
    ;(async () => {
      try {
        const auth = await getAuthHeader()
        const res = await fetch('/api/call-scheduler/dashboard', { headers: auth })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '대시보드 조회 실패')
        if (!abort) setDashboard(json.data as DashboardData)
      } catch (e: any) {
        if (!abort) setError(e?.message || '오류')
      }
    })()
    return () => { abort = true }
  }, [])

  // 스케줄 list
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

  // 스케줄 list 컬럼 (기존 유지)
  const scheduleColumns: TableColumn<ScheduleListItem>[] = useMemo(() => [
    {
      key: 'year_month', label: '년/월',
      sortBy: (s) => s.year * 100 + s.month,
      render: (s) => (
        <span>
          <span style={{ color: COLORS.primary, fontWeight: 700 }}>
            {s.year}년 {s.month}월
          </span>
          {s.title && (
            <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.textMuted }}>
              {s.title}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'status', label: '상태',
      sortBy: (s) => s.status,
      render: (s) => {
        const tone = s.status === 'published' ? 'success' : s.status === 'draft' ? 'info' : 'neutral'
        const label = s.status === 'published' ? '공지됨' : s.status === 'draft' ? '초안' : '보관'
        return <span style={pillStyle(tone)}>{label}</span>
      },
    },
    {
      key: 'workers', label: '근무자', align: 'right',
      sortBy: (s) => s.worker_count,
      render: (s) => <span style={{ color: COLORS.textPrimary }}>{s.worker_count}명</span>,
    },
    {
      key: 'fill', label: '충원율', align: 'right',
      sortBy: (s) => s.fill_rate,
      render: (s) => {
        const pct = Math.round(s.fill_rate * 1000) / 10
        const tone = s.fill_rate >= 0.9 ? 'success' : s.fill_rate >= 0.7 ? 'warning' : 'danger'
        return <span style={pillStyle(tone)}>{pct}%</span>
      },
    },
    {
      key: 'updated', label: '최근 수정', align: 'right',
      sortBy: (s) => new Date(s.updated_at).getTime(),
      render: (s) => (
        <span style={{ color: COLORS.textMuted, fontSize: 11 }}>
          {new Date(s.updated_at).toLocaleString('ko-KR', {
            year: '2-digit', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          })}
        </span>
      ),
    },
  ], [])

  return (
    // N-24-a — 전체 width (maxWidth 제거)
    <div style={{ padding: '20px 24px' }}>
      {/* PageTitle 자동 — 자체 헤더 X */}

      {/* 에러 표시 */}
      {error && (
        <div style={{
          padding: 12, background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          borderRadius: 8, color: COLORS.danger, fontSize: 13, marginBottom: 12,
        }}>
          ❌ {error}
        </div>
      )}

      {/* 1. KPI 일렬 */}
      {dashboard && <KpiStrip kpi={dashboard.kpi} />}

      {/* 2. 지금 일하는 사람 */}
      {dashboard && (
        <NowWorkingStrip
          nowIso={dashboard.meta.now_iso}
          workers={dashboard.now_working}
          todayAssignments={dashboard.today_assignments}
        />
      )}

      {/* 3. 오늘 / 내일 */}
      {dashboard && (
        <TodayTomorrowGrid
          todayLabel={dashboard.meta.today_label}
          todayAssignments={dashboard.today_assignments}
          todayIsHoliday={dashboard.meta.today_is_holiday}
          tomorrowLabel={dashboard.meta.tomorrow_label}
          tomorrowAssignments={dashboard.tomorrow_assignments}
          tomorrowIsHoliday={dashboard.meta.tomorrow_is_holiday}
        />
      )}

      {/* 4. 검토 대기 */}
      {dashboard && <PendingReviewsCard pending={dashboard.pending} />}

      {/* 5. 이번 주 빈자리 */}
      {dashboard && <EmptySlotsAlert slots={dashboard.empty_slots} />}

      {/* 6. 다음 액션 */}
      {dashboard && <NextActionCard action={dashboard.next_action} />}

      {/* 7. 다가오는 휴일 */}
      {dashboard && <UpcomingHolidaysCard holidays={dashboard.upcoming_holidays} />}

      {/* 8. 월별 스케줄 list */}
      <div style={{ marginTop: 24, marginBottom: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
          📅 월별 스케줄
        </span>
        <button onClick={() => router.push('/CallScheduler/new')}
                style={{
                  fontSize: 12, fontWeight: 700, padding: '6px 12px',
                  background: COLORS.primary, color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                }}>
          + 새 월 만들기
        </button>
      </div>
      <NeuDataTable<ScheduleListItem>
        data={items}
        loading={loading}
        rowKey={(s) => s.id}
        emptyIcon="📅"
        emptyMessage="아직 작성된 스케줄이 없습니다."
        defaultSort={{ key: 'year_month', dir: 'desc' }}
        onRowClick={(s) => router.push(`/CallScheduler/${s.id}`)}
        columns={scheduleColumns}
      />
    </div>
  )
}

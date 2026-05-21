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
// N-58 — 월별 스케줄 list 는 별도 탭 (/CallScheduler/schedules) 으로 분리
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { COLORS } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import KpiStrip, { DashboardKpi } from './_components/dashboard/KpiStrip'
import NowWorkingStrip, { WorkerChip } from './_components/dashboard/NowWorkingStrip'
import TodayTomorrowGrid from './_components/dashboard/TodayTomorrowGrid'
import PendingReviewsCard from './_components/dashboard/PendingReviewsCard'
import EmptySlotsAlert, { EmptySlot } from './_components/dashboard/EmptySlotsAlert'
import NextActionCard from './_components/dashboard/NextActionCard'
import UpcomingHolidaysCard, { Holiday } from './_components/dashboard/UpcomingHolidaysCard'

export const dynamic = 'force-dynamic'

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
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
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
    </div>
  )
}

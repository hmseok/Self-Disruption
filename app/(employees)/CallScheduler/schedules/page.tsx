'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler/schedules — 월별 스케줄 list (대시보드에서 분리, N-58)
// 기존 page.tsx 섹션 8 의 스케줄 list 를 그대로 이전 — fetch/컬럼 로직 보존
// SubNav 는 layout.tsx 자동 적용
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState, useMemo } from 'react'
import { COLORS, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import NeuDataTable, { TableColumn } from '@/app/components/NeuDataTable'
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

export default function CallSchedulerSchedulesPage() {
  const router = useRouter()
  const [items, setItems] = useState<ScheduleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    // 전체 width (maxWidth 제거 — page.tsx N-24-a 동일)
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

      {/* 월별 스케줄 list */}
      <div style={{ marginBottom: 12,
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

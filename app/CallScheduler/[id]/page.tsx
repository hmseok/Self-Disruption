'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler/[id] — 상세 (캘린더 + 분석 + 배포)
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
// (GLASS / pillStyle 은 actionMsg 패널에서 사용)
import { getAuthHeader } from '@/app/utils/auth-client'
import { CallSchedulerProvider, useCallScheduler } from '../CallSchedulerContext'
import KpiStrip from '../components/KpiStrip'
import ScheduleGrid from '../components/ScheduleGrid'
import ComposeMode from '../components/ComposeMode'
import AnalyticsDrawer from '../components/AnalyticsDrawer'
import DistributionDialog from '../components/DistributionDialog'

export const dynamic = 'force-dynamic'

export default function CallSchedulerDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <CallSchedulerProvider>
      <DetailInner id={id} />
    </CallSchedulerProvider>
  )
}

type ViewMode = 'view' | 'compose'

function DetailInner({ id }: { id: string }) {
  const router = useRouter()
  const { detail, loading, error, reload } = useCallScheduler()
  const [distOpen, setDistOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mode, setMode] = useState<ViewMode>('view')
  const [statusBusy, setStatusBusy] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { reload(id) }, [id, reload])

  // ESC 로 드로어 닫기
  useEffect(() => {
    if (!drawerOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [drawerOpen])

  const setStatus = async (status: 'draft' | 'published' | 'archived') => {
    setStatusBusy(true)
    setActionMsg(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '상태 변경 실패')
      setActionMsg({ ok: true, text: `상태 → ${status === 'published' ? '공지됨' : status === 'draft' ? '초안' : '보관'}` })
      reload(id)
    } catch (e: any) {
      setActionMsg({ ok: false, text: e?.message || '오류' })
    } finally {
      setStatusBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm('이 스케줄과 모든 배정을 삭제합니다. 계속할까요?')) return
    setStatusBusy(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/schedules/${id}`, {
        method: 'DELETE', headers: auth,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '삭제 실패')
      router.push('/CallScheduler')
    } catch (e: any) {
      setActionMsg({ ok: false, text: e?.message || '삭제 실패' })
      setStatusBusy(false)
    }
  }

  if (loading && !detail) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>
        로딩 중...
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
        <div style={{
          padding: 16, borderRadius: 12, background: COLORS.bgRed,
          border: `1px solid ${COLORS.borderRed}`, color: COLORS.danger,
        }}>
          ❌ {error}
        </div>
        <Link href="/CallScheduler" style={{
          display: 'inline-block', marginTop: 12,
          ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
          border: `1px solid ${COLORS.borderFaint}`, textDecoration: 'none',
        }}>← 목록</Link>
      </div>
    )
  }
  if (!detail) return null

  const { schedule, kpi, distributions, workers } = detail
  const statusTone = schedule.status === 'published' ? 'success' : schedule.status === 'draft' ? 'info' : 'neutral'
  const statusLabel = schedule.status === 'published' ? '공지됨' : schedule.status === 'draft' ? '초안' : '보관'

  return (
    <div style={{ padding: '16px 20px', width: '100%' }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <Link href="/CallScheduler" style={{
            fontSize: 12, color: COLORS.info, textDecoration: 'none',
          }}>
            ← 목록
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <h1 style={{
              fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: 0,
            }}>
              {schedule.year}년 {schedule.month}월
            </h1>
            <span style={pillStyle(statusTone)}>{statusLabel}</span>
            {schedule.title && (
              <span style={{ fontSize: 12, color: COLORS.textMuted }}>{schedule.title}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 모드 토글 */}
          <div style={{
            display: 'inline-flex', borderRadius: 8, overflow: 'hidden',
            border: `1px solid ${COLORS.borderFaint}`,
          }}>
            <button
              type="button"
              onClick={() => setMode('compose')}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 700,
                background: mode === 'compose' ? COLORS.primary : 'transparent',
                color: mode === 'compose' ? '#fff' : COLORS.textSecondary,
                border: 'none', cursor: 'pointer',
              }}
            >
              ✍️ 작성
            </button>
            <button
              type="button"
              onClick={() => setMode('view')}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 700,
                background: mode === 'view' ? COLORS.primary : 'transparent',
                color: mode === 'view' ? '#fff' : COLORS.textSecondary,
                border: 'none', cursor: 'pointer',
                borderLeft: `1px solid ${COLORS.borderFaint}`,
              }}
            >
              📋 표출
            </button>
          </div>
          {schedule.status === 'draft' && (
            <button
              type="button"
              onClick={() => setStatus('published')}
              disabled={statusBusy}
              style={{
                ...BTN.md, background: COLORS.success, color: '#fff', border: 'none',
                cursor: statusBusy ? 'not-allowed' : 'pointer',
              }}
            >
              ✓ 공지됨으로
            </button>
          )}
          {schedule.status === 'published' && (
            <button
              type="button"
              onClick={() => setStatus('draft')}
              disabled={statusBusy}
              style={{
                ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                border: `1px solid ${COLORS.borderFaint}`,
                cursor: statusBusy ? 'not-allowed' : 'pointer',
              }}
            >
              ← 초안으로
            </button>
          )}
          <button
            type="button"
            onClick={() => setDrawerOpen(o => !o)}
            style={{
              ...BTN.md,
              background: drawerOpen ? COLORS.bgBlue : 'transparent',
              color: drawerOpen ? COLORS.info : COLORS.textSecondary,
              border: `1px solid ${drawerOpen ? COLORS.borderBlue : COLORS.borderFaint}`,
              cursor: 'pointer',
            }}
            title="분석/배포 이력 (단축키: A)"
          >
            📊 분석
          </button>
          <button
            type="button"
            onClick={() => setDistOpen(true)}
            style={{
              ...BTN.lg, background: COLORS.primary, color: '#fff', border: 'none',
              cursor: 'pointer',
            }}
          >
            ⚡ 배포하기
          </button>
          <Link href="/CallScheduler/settings" style={{
            ...BTN.sm, background: 'transparent', color: COLORS.textSecondary,
            border: `1px solid ${COLORS.borderFaint}`, textDecoration: 'none',
          }}>
            ⚙️ 설정
          </Link>
          <button
            type="button"
            onClick={remove}
            disabled={statusBusy}
            style={{
              ...BTN.sm, background: 'transparent', color: COLORS.danger,
              border: `1px solid ${COLORS.borderRed}`,
              cursor: statusBusy ? 'not-allowed' : 'pointer',
            }}
          >
            삭제
          </button>
        </div>
      </div>

      {actionMsg && (
        <div style={{
          ...GLASS.L3,
          background: actionMsg.ok ? COLORS.bgGreen : COLORS.bgRed,
          border: `1px solid ${actionMsg.ok ? COLORS.borderGreen : COLORS.borderRed}`,
          borderRadius: 8, padding: '8px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: actionMsg.ok ? COLORS.success : COLORS.danger,
          }}>
            {actionMsg.ok ? '✅ ' : '❌ '}{actionMsg.text}
          </div>
          <button onClick={() => setActionMsg(null)} style={{
            background: 'transparent', border: 'none',
            color: COLORS.textMuted, cursor: 'pointer', fontSize: 14,
          }}>×</button>
        </div>
      )}

      {/* KPI */}
      <div style={{ marginBottom: 14 }}>
        <KpiStrip kpi={kpi} />
      </div>

      {/* 메인 — 모드별 분기 */}
      {mode === 'compose' ? (
        <ComposeMode detail={detail} onChanged={() => reload(id)} />
      ) : (
        <ScheduleGrid detail={detail} onChanged={() => reload(id)} />
      )}

      {/* 분석 드로어 (토글) */}
      <AnalyticsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        kpi={kpi}
        distributions={distributions}
      />

      <DistributionDialog
        open={distOpen}
        onClose={() => setDistOpen(false)}
        scheduleId={id}
        workers={workers}
        onCompleted={() => reload(id)}
      />
    </div>
  )
}

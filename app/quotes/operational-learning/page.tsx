'use client'

import { useCallback, useEffect, useState } from 'react'
import { OLProvider, useOL, periodToDateRange, Snapshot } from './OperationalLearningContext'
import FilterPanel from './FilterPanel'
import KpiStrip from './KpiStrip'
import SnapshotTable from './SnapshotTable'
import ActualInputModal from './ActualInputModal'
import AccuracyChart from './AccuracyChart'
import RuleSuggestionPanel from './RuleSuggestionPanel'
import ComparisonDetail from './ComparisonDetail'
import { getAuthHeader } from '@/app/utils/auth-client'

// ═══════════════════════════════════════════════════════════════
// 운영학습 대시보드 페이지 (/quotes/operational-learning)
// - 좌: 필터 (Level 2)
// - 중앙: KPI + 스냅샷 테이블 + 차트 + 추천
// - 우: 비교 상세 (Level 4)
// ═══════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

export default function OperationalLearningPage() {
  return (
    <OLProvider>
      <OperationalLearningInner />
    </OLProvider>
  )
}

function OperationalLearningInner() {
  const {
    filter, setSnapshots, reloadKey, triggerReload,
    selectedSnapshotId, analysis, setAnalysis, setLoadingAnalysis, setLoadingSnapshots,
    setSuggestions, setSuggestionMeta, setLoadingSuggestions,
  } = useOL()
  const [inputTarget, setInputTarget] = useState<Snapshot | null>(null)
  const [appliedCount, setAppliedCount] = useState<number>(0)
  const [err, setErr] = useState<string | null>(null)

  // ── 스냅샷 목록 로드 ───────────────────────
  const loadSnapshots = useCallback(async () => {
    setLoadingSnapshots(true)
    setErr(null)
    try {
      const auth = await getAuthHeader()
      const { from, to } = periodToDateRange(filter.period)
      const qs = new URLSearchParams()
      if (from) qs.set('from', from)
      if (to) qs.set('to', to)
      if (filter.vehicleClasses.length === 1) qs.set('vehicle_class', filter.vehicleClasses[0])
      if (filter.contractTypes.length === 1) qs.set('contract_type', filter.contractTypes[0])
      qs.set('limit', '500')
      const res = await fetch(`/api/operational-learning/snapshots?${qs.toString()}`, { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '스냅샷 조회 실패')
      let rows: Snapshot[] = json.data || []
      // 다중 필터 처리 (API가 단일값만 받으므로 클라이언트 재필터)
      if (filter.vehicleClasses.length > 1) {
        rows = rows.filter(r => r.vehicle_class && filter.vehicleClasses.includes(r.vehicle_class))
      }
      if (filter.contractTypes.length > 1) {
        rows = rows.filter(r => r.contract_type && filter.contractTypes.includes(r.contract_type))
      }
      setSnapshots(rows)
    } catch (e: any) {
      setErr(e.message || '스냅샷 조회 실패')
      setSnapshots([])
    } finally {
      setLoadingSnapshots(false)
    }
  }, [filter.period, filter.vehicleClasses, filter.contractTypes, setSnapshots, setLoadingSnapshots])

  // ── 추천 로드 ──────────────────────────────
  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true)
    try {
      const auth = await getAuthHeader()
      const { from, to } = periodToDateRange(filter.period)
      const body: any = {}
      if (from) body.from = from
      if (to) body.to = to
      if (filter.vehicleClasses.length === 1) body.vehicle_class = filter.vehicleClasses[0]
      if (filter.contractTypes.length === 1) body.contract_type = filter.contractTypes[0]

      const res = await fetch('/api/operational-learning/suggest-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok) {
        setSuggestions(json.data?.suggestions || [])
        setSuggestionMeta({
          sample_size: json.data?.sample_size || 0,
          analysis_period: json.data?.analysis_period || '',
        })
      } else {
        setSuggestions([])
      }
    } catch {
      setSuggestions([])
    } finally {
      setLoadingSuggestions(false)
    }
  }, [filter.period, filter.vehicleClasses, filter.contractTypes, setSuggestions, setSuggestionMeta, setLoadingSuggestions])

  // ── 적용 이력 카운트 ────────────────────────
  const loadAppliedCount = useCallback(async () => {
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/operational-learning/apply-rule?limit=200', { headers: auth })
      const json = await res.json()
      if (res.ok) setAppliedCount(json.data?.length || 0)
    } catch {
      // silent
    }
  }, [])

  // ── 선택된 스냅샷 분석 로드 ──────────────────
  useEffect(() => {
    if (!selectedSnapshotId) { setAnalysis(null); return }
    let cancelled = false
    ;(async () => {
      setLoadingAnalysis(true)
      try {
        const auth = await getAuthHeader()
        const res = await fetch(`/api/operational-learning/analyze?snapshotId=${selectedSnapshotId}`, { headers: auth })
        const json = await res.json()
        if (cancelled) return
        if (res.ok) setAnalysis(json.data)
        else setAnalysis(null)
      } catch {
        if (!cancelled) setAnalysis(null)
      } finally {
        if (!cancelled) setLoadingAnalysis(false)
      }
    })()
    return () => { cancelled = true }
  }, [selectedSnapshotId, setAnalysis, setLoadingAnalysis, reloadKey])

  // ── 필터 변경 또는 강제 reload 시 전체 재조회 ──
  useEffect(() => {
    loadSnapshots()
    loadSuggestions()
    loadAppliedCount()
  }, [loadSnapshots, loadSuggestions, loadAppliedCount, reloadKey])

  // ── 자동집계 실행 ──────────────────────────
  const autoAggregate = async (snap: Snapshot) => {
    // 자동집계 기본 기간: 스냅샷 월부터 최근 월까지
    const start = toYm(snap.snapshot_date)
    const end = toYm(new Date())
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/operational-learning/auto-aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ snapshotId: snap.id, fromMonth: start, toMonth: end }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '자동 집계 실패')
      alert(`자동 집계 완료: ${json.data?.months_with_data || 0}개월 반영`)
      triggerReload()
    } catch (e: any) {
      alert(`❌ ${e.message || '자동 집계 실패'}`)
    }
  }

  return (
    <div style={{
      padding: '20px 24px'}}>
      {/* 페이지 헤더 */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🧠</span>
          <span style={{ background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            운영학습 대시보드
          </span>
        </h1>
        <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>
          예측 vs 실적 비교를 통해 BusinessRules를 지속적으로 개선합니다.
        </p>
      </div>

      {/* KPI 스트립 */}
      <KpiStrip appliedCount={appliedCount} />

      {/* 에러 배너 */}
      {err && (
        <div style={{
          background: 'rgba(254,226,226,0.6)',
          border: '1px solid rgba(252,165,165,0.8)',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 12,
          color: '#b91c1c',
          marginBottom: 12,
        }}>
          ⚠ {err}
        </div>
      )}

      {/* 3단 레이아웃: 좌 필터 / 중앙 메인 / 우 상세 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr 340px',
        gap: 16,
        alignItems: 'start',
      }}>
        <FilterPanel />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <SnapshotTable
            onOpenActualInput={(s) => setInputTarget(s)}
            onAutoAggregate={autoAggregate}
          />
          {/* 선택된 스냅샷이 있을 때만 정확도 차트 노출 */}
          <AccuracyChart items={analysis?.analysis?.items || []} />
          <RuleSuggestionPanel onApplied={() => { loadAppliedCount(); triggerReload() }} />
        </div>

        <ComparisonDetail />
      </div>

      {/* 실적 입력 모달 */}
      {inputTarget && (
        <ActualInputModal
          snapshot={inputTarget}
          onClose={() => setInputTarget(null)}
          onSaved={() => { triggerReload() }}
        />
      )}
    </div>
  )
}

function toYm(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

'use client'

/**
 * /RideCompliance/data-disposal — 데이터 폐기 결재 (Phase 4.0 / P12-C)
 *
 * 사용자 통찰 (2026-05-28):
 *   「전산 고객데이터 규정일자(해지일이후 몇개월) 기준에 도래한것들을
 *    카페24서버에서 삭제하는 플로우」
 *
 * 흐름:
 *   1. 외부 yangjaehee.expired_approval (mock 어댑터) sync
 *   2. CPO 검토 → 승인/반려
 *   3. 외부 결재 실행 → external_deleted_at 반영
 *   4. 본 시스템 최종 확인 → confirmed → 파기확인서 자동 생성 (deliverables)
 *
 * 디자인:
 *   - PageTitle (자동 헤더)
 *   - DcStatStrip 4 카드 (전체 / 검토 대기 / 승인 / 확정)
 *   - DcToolbar (검색 + 상태 필터)
 *   - NeuDataTable (결재 list)
 *   - 행 클릭 → 우측 슬라이딩 상세 패널 (items + audits + 액션 버튼)
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getStoredToken } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'
import DcToolbar from '@/app/components/DcToolbar'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

// ── 도메인 타입 ────────────────────────────────────────────────
interface UnifiedRow {
  review_id: string | null
  external_approval_id: number
  external_request_at: string | null
  external_request_by: string | null
  external_expired_count: number | null
  external_approval_doc_id: string | null
  external_approval_at: string | null
  external_deleted_at: string | null
  external_deleted_by: string | null
  external_confirmed_at: string | null
  external_confirmed_by: string | null
  review_status: string
  reviewer_id: string | null
  reviewed_at: string | null
  review_note: string | null
  deliverable_id: string | null
  deliverable_issued_at: string | null
  needs_sync: boolean
  adapter_mode: string
}

interface DisposalItem {
  id: string
  external_item_id: number | null
  data_type: 'CONTRACT' | 'FILE'
  data_id: string
  custname: string | null
  carsnums: string | null
  carsodnm: string | null
  imagkind_label: string | null
  imagonam: string | null
  external_deleted_at: string | null
}

interface AuditRow {
  id: string
  action: string
  actor_id: string | null
  actor_name: string | null
  action_at: string | null
  note: string | null
}

// ── 상태 라벨 ─────────────────────────────────────────────────
const STATUS_LABEL: Record<string, { label: string; bg: string; fg: string }> = {
  not_synced: { label: '🔄 sync 필요',   bg: 'rgba(148,163,184,0.12)', fg: '#475569' },
  pending:    { label: '⏳ 검토 대기',   bg: 'rgba(245,158,11,0.14)',  fg: '#b45309' },
  approved:   { label: '✅ CPO 승인',    bg: 'rgba(59,130,246,0.14)',  fg: '#1d4ed8' },
  rejected:   { label: '⛔ 반려',        bg: 'rgba(239,68,68,0.14)',   fg: '#b91c1c' },
  executed:   { label: '🗑 삭제 실행',    bg: 'rgba(168,85,247,0.14)',  fg: '#7c3aed' },
  confirmed:  { label: '🔒 최종 확인',    bg: 'rgba(16,185,129,0.14)',  fg: '#047857' },
}

// ── 버튼 ──────────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer' }
const btnSecondary: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGray, color: COLORS.textSecondary, cursor: 'pointer' }
const btnSuccess: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGreen, color: COLORS.success, cursor: 'pointer' }
const btnDanger: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgRed, color: COLORS.danger, cursor: 'pointer' }

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return s.replace('T', ' ').slice(0, 19)
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function DataDisposalPage() {
  const pathname = usePathname()
  const isStandalone = pathname === '/RideCompliance/data-disposal'

  useEffect(() => {
    if (isStandalone) {
      document.title = '데이터 폐기 결재 | 정보보안'
      return () => { document.title = 'ERP' }
    }
  }, [isStandalone])

  const [rows, setRows] = useState<UnifiedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [adapterMode, setAdapterMode] = useState('mock')
  const [migrationPending, setMigrationPending] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // 선택된 행 + 상세
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ review: any; items: DisposalItem[]; audits: AuditRow[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionReason, setActionReason] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [resultPanel, setResultPanel] = useState<{ kind: 'ok' | 'err' | 'info'; msg: string } | null>(null)

  // ── list fetch ───────────────────────────────────────────
  const fetchList = async () => {
    setLoading(true)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/disposal/approvals', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
      if (json._migration_pending) {
        setMigrationPending(json._hint || '마이그레이션 미적용')
        setRows([])
        setAdapterMode(json.adapter_mode || 'mock')
        return
      }
      if (!json.success) {
        setResultPanel({ kind: 'err', msg: `목록 로드 실패: ${json.error}` })
        return
      }
      setRows(json.data || [])
      setAdapterMode(json.adapter_mode || 'mock')
      setMigrationPending(null)
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `네트워크 오류: ${e}` })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchList() }, [])

  // ── 결재 detail fetch ────────────────────────────────────
  const fetchDetail = async (reviewId: string) => {
    setDetailLoading(true)
    setDetail(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/disposal/${reviewId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
      if (json.success) setDetail(json.data)
      else setResultPanel({ kind: 'err', msg: `상세 로드 실패: ${json.error}` })
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `상세 네트워크 오류: ${e}` })
    } finally {
      setDetailLoading(false)
    }
  }

  // ── sync (외부 결재 mirror) — 단일 ────────────────────
  const handleSync = async (extId: number) => {
    setActionBusy(true)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/disposal/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ external_approval_id: extId }),
      })
      const json = await res.json()
      if (!json.success) { setResultPanel({ kind: 'err', msg: `sync 실패: ${json.error}` }); return }
      setResultPanel({ kind: 'ok', msg: `✅ 외부 결재 #${extId} sync 완료 — items ${json.data?.items_count ?? 0}건` })
      await fetchList()
      if (json.data?.review_id) {
        setSelectedReviewId(json.data.review_id)
        fetchDetail(json.data.review_id)
      }
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `sync 네트워크 오류: ${e}` })
    } finally {
      setActionBusy(false)
    }
  }

  // ── ETL — 외부에서 전체 가져오기 (관리자 액션) ────────
  const handleSyncAll = async () => {
    setActionBusy(true)
    setResultPanel({ kind: 'info', msg: '⏳ 외부 cafe24 결재 전체 가져오는 중... (최대 60초)' })
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/disposal/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ limit: 100 }),
      })
      const json = await res.json()
      if (!json.success) { setResultPanel({ kind: 'err', msg: `전체 sync 실패: ${json.error}` }); return }
      const d = json.data
      const errLine = d.errors?.length ? `\n⚠ 일부 오류 ${d.errors.length}건` : ''
      setResultPanel({
        kind: 'ok',
        msg: `✅ 외부 cafe24 전체 sync 완료 (어댑터: ${d.adapter_mode})\n· 외부 fetch ${d.fetched}건\n· 신규 mirror ${d.new}건\n· 갱신 ${d.updated}건\n· items insert ${d.items_inserted}건${errLine}`,
      })
      await fetchList()
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `전체 sync 네트워크 오류: ${e}` })
    } finally {
      setActionBusy(false)
    }
  }

  // ── 액션 (approve / reject / confirm) ───────────────────
  const handleAction = async (action: 'approve' | 'reject' | 'confirm') => {
    if (!selectedReviewId) return
    if (action === 'reject' && !actionReason.trim()) {
      setResultPanel({ kind: 'err', msg: '반려 사유를 입력해주세요.' })
      return
    }
    setActionBusy(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/disposal/${selectedReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action, note: actionNote || null, reason: actionReason || null }),
      })
      const json = await res.json()
      if (!json.success) { setResultPanel({ kind: 'err', msg: `${action} 실패: ${json.error}` }); return }
      setResultPanel({ kind: 'ok', msg: `✅ ${action} 완료 — 상태 ${json.data?.review_status}` })
      setActionReason('')
      setActionNote('')
      await fetchList()
      await fetchDetail(selectedReviewId)
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `${action} 네트워크 오류: ${e}` })
    } finally {
      setActionBusy(false)
    }
  }

  // ── 필터링 ───────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let f = rows
    if (statusFilter) f = f.filter(r => r.review_status === statusFilter)
    if (q.trim()) {
      const needle = q.toLowerCase()
      f = f.filter(r =>
        String(r.external_approval_id).includes(needle) ||
        (r.external_request_by || '').toLowerCase().includes(needle) ||
        (r.external_approval_doc_id || '').toLowerCase().includes(needle)
      )
    }
    return f
  }, [rows, statusFilter, q])

  // ── stats ────────────────────────────────────────────────
  const stats: StatItem[] = useMemo(() => {
    const total = rows.length
    const pending = rows.filter(r => r.review_status === 'pending').length
    const approved = rows.filter(r => r.review_status === 'approved' || r.review_status === 'executed').length
    const confirmed = rows.filter(r => r.review_status === 'confirmed').length
    return [
      { label: 'mirror 전체', value: total,     tint: 'blue'   },
      { label: '검토 대기',  value: pending,   tint: 'amber'  },
      { label: '승인·실행',  value: approved,  tint: 'green'  },
      { label: '최종 확인',  value: confirmed, tint: 'purple' },
    ]
  }, [rows])

  // ── 컬럼 ─────────────────────────────────────────────────
  const cols: TableColumn<UnifiedRow>[] = [
    {
      key: 'external_approval_id',
      label: '외부 결재 #',
      sortBy: r => r.external_approval_id,
      render: r => (
        <strong style={{ color: COLORS.textPrimary }}>#{r.external_approval_id}</strong>
      ),
    },
    {
      key: 'external_request_at',
      label: '요청일시',
      sortBy: r => r.external_request_at || '',
      render: r => <span style={{ fontSize: 12 }}>{fmtDate(r.external_request_at)}</span>,
    },
    {
      key: 'external_request_by',
      label: '요청자',
      sortBy: r => r.external_request_by || '',
      render: r => r.external_request_by || '—',
    },
    {
      key: 'external_expired_count',
      label: '대상 건수',
      sortBy: r => r.external_expired_count ?? 0,
      render: r => (
        <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>
          {r.external_expired_count ?? 0}건
        </span>
      ),
    },
    {
      key: 'external_approval_doc_id',
      label: '외부 결재 문서',
      sortBy: r => r.external_approval_doc_id || '',
      render: r => r.external_approval_doc_id
        ? <span style={{ fontSize: 11, color: COLORS.textSecondary }}>{r.external_approval_doc_id}</span>
        : <span style={{ fontSize: 11, color: COLORS.textMuted }}>미상신</span>,
    },
    {
      key: 'review_status',
      label: '상태',
      sortBy: r => r.review_status,
      render: r => {
        const s = STATUS_LABEL[r.review_status] || { label: r.review_status, bg: 'rgba(0,0,0,0.05)', fg: '#475569' }
        return (
          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
            {s.label}
          </span>
        )
      },
    },
    {
      key: 'reviewed_at',
      label: '본 시스템 검토',
      sortBy: r => r.reviewed_at || '',
      render: r => r.reviewed_at ? <span style={{ fontSize: 11, color: COLORS.textSecondary }}>{fmtDate(r.reviewed_at)}</span> : <span style={{ fontSize: 11, color: COLORS.textMuted }}>—</span>,
    },
    {
      key: 'actions',
      label: '액션',
      render: r => (
        <div style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
          <button
            onClick={e => { e.stopPropagation(); if (r.review_id) { setSelectedReviewId(r.review_id); fetchDetail(r.review_id) } }}
            style={{ ...BTN.sm, border: 'none', background: COLORS.bgGray, color: COLORS.textSecondary, cursor: 'pointer' }}
          >
            📋 상세
          </button>
          <button
            onClick={e => { e.stopPropagation(); handleSync(r.external_approval_id) }}
            disabled={actionBusy}
            title="이 결재만 외부에서 다시 가져오기"
            style={{ ...BTN.sm, border: 'none', background: COLORS.bgBlue, color: COLORS.primary, cursor: actionBusy ? 'wait' : 'pointer' }}
          >
            🔄 재sync
          </button>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {isStandalone && (
        <div style={{ marginBottom: 12 }}>
          <Link href="/RideCompliance" style={{ fontSize: 12, color: COLORS.primary, textDecoration: 'none' }}>
            ← 정보보안 모듈로
          </Link>
        </div>
      )}

      {/* 어댑터 모드 안내 + ETL sync 버튼 */}
      <div style={{ ...GLASS.L3, padding: '10px 14px', borderRadius: 10, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, borderLeft: `4px solid ${adapterMode === 'mock' ? COLORS.warning : COLORS.success}` }}>
        <div style={{ flex: 1, fontSize: 12, color: COLORS.textSecondary }}>
          💡 외부 cafe24 yangjaehee DB → 본 ERP DB mirror (ETL) — 어댑터: <strong style={{ color: COLORS.textPrimary }}>{adapterMode}</strong>
          {adapterMode === 'mock' && (
            <span style={{ color: COLORS.warning, fontWeight: 600 }}> (시연용 — 실 DB 미연결)</span>
          )}
          {adapterMode === 'direct' && (
            <span style={{ color: COLORS.success, fontWeight: 600 }}> (실 cafe24 read-only 연결 — 본 화면은 본 ERP mirror 만 표시)</span>
          )}
        </div>
        <button
          onClick={handleSyncAll}
          disabled={actionBusy || loading}
          title="외부 cafe24 에서 결재 전체를 본 ERP DB 로 가져와 mirror (관리자 액션)"
          style={{ ...btnPrimary, whiteSpace: 'nowrap', fontWeight: 600 }}
        >
          {actionBusy ? '⏳ 가져오는 중...' : '🔄 외부에서 전체 가져오기 (ETL sync)'}
        </button>
      </div>

      {/* 마이그레이션 미적용 배너 */}
      {migrationPending && (
        <div style={{ ...GLASS.L3, padding: '12px 16px', borderRadius: 10, marginBottom: 12, borderLeft: `4px solid ${COLORS.danger}`, color: COLORS.danger, fontSize: 13 }}>
          ⚠ {migrationPending}
        </div>
      )}

      {/* 결과 패널 */}
      {resultPanel && (
        <div style={{
          ...GLASS.L4, padding: '12px 16px', borderRadius: 10, marginBottom: 12,
          borderLeft: `4px solid ${resultPanel.kind === 'ok' ? COLORS.success : resultPanel.kind === 'err' ? COLORS.danger : COLORS.primary}`,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1, fontSize: 13, color: COLORS.textPrimary, whiteSpace: 'pre-line' }}>{resultPanel.msg}</div>
          <button onClick={() => setResultPanel(null)} style={{ ...BTN.sm, background: 'transparent', border: `1px solid ${COLORS.borderSubtle}`, color: COLORS.textSecondary, cursor: 'pointer' }}>× 닫기</button>
        </div>
      )}

      {/* DcStatStrip + 새로고침 액션 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <DcStatStrip stats={stats} fullWidth />
        </div>
        <button onClick={fetchList} disabled={loading} style={{ ...btnSecondary, whiteSpace: 'nowrap', marginTop: 4 }}>
          {loading ? '⏳ 로딩' : '🔄 새로고침'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: detail ? '1.4fr 1fr' : '1fr', gap: 16, marginTop: 16 }}>
        {/* 결재 list */}
        <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12 }}>
          <DcToolbar
            search={q}
            onSearchChange={setQ}
            placeholder="외부 결재 # / 요청자 / 결재 문서 검색"
            trailing={
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
                padding: '7px 12px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`,
                background: 'rgba(255,255,255,0.6)', fontSize: 12, color: COLORS.textPrimary, cursor: 'pointer',
              }}>
                <option value="">상태: 전체</option>
                <option value="pending">⏳ 검토 대기</option>
                <option value="approved">✅ 승인</option>
                <option value="rejected">⛔ 반려</option>
                <option value="executed">🗑 삭제 실행</option>
                <option value="confirmed">🔒 최종 확인</option>
              </select>
            }
          />
          <div style={{ marginBottom: 8, fontSize: 12, color: COLORS.textSecondary }}>
            총 {rows.length}건 중 {filteredRows.length}건 표시
          </div>
          <NeuDataTable
            columns={cols}
            data={filteredRows}
            rowKey={r => r.review_id || `ext-${r.external_approval_id}`}
            defaultSort={{ key: 'external_request_at', dir: 'desc' }}
            onRowClick={r => { if (r.review_id) { setSelectedReviewId(r.review_id); fetchDetail(r.review_id) } }}
          />
          {filteredRows.length === 0 && !loading && (
            <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: COLORS.textMuted }}>
              {rows.length === 0
                ? '본 ERP mirror 가 비어있습니다 — 상단 「🔄 외부에서 전체 가져오기」 클릭 후 표시됩니다.'
                : '🔍 검색 결과 없음'}
            </div>
          )}
        </div>

        {/* 우측 상세 패널 */}
        {selectedReviewId && (
          <div style={{ ...GLASS.L4, padding: 20, borderRadius: 12, maxHeight: 800, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: COLORS.textPrimary }}>📋 결재 상세</h3>
              <button onClick={() => { setSelectedReviewId(null); setDetail(null) }}
                style={{ marginLeft: 'auto', ...BTN.sm, background: 'transparent', border: `1px solid ${COLORS.borderSubtle}`, color: COLORS.textSecondary, cursor: 'pointer' }}>
                × 닫기
              </button>
            </div>

            {detailLoading && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: COLORS.textMuted }}>⏳ 상세 로딩 중…</div>
            )}

            {detail && (
              <>
                {/* 결재 메타 */}
                <div style={{ ...GLASS.L3, padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 6, columnGap: 8 }}>
                    <strong style={{ color: COLORS.textSecondary }}>외부 결재 #</strong>
                    <span>#{detail.review.external_approval_id}</span>
                    <strong style={{ color: COLORS.textSecondary }}>상태</strong>
                    <span>
                      {(() => {
                        const s = STATUS_LABEL[detail.review.review_status] || { label: detail.review.review_status, bg: '', fg: '' }
                        return <span style={{ padding: '2px 8px', borderRadius: 6, background: s.bg, color: s.fg, fontWeight: 700 }}>{s.label}</span>
                      })()}
                    </span>
                    <strong style={{ color: COLORS.textSecondary }}>요청일시</strong>
                    <span>{fmtDate(detail.review.external_request_at)}</span>
                    <strong style={{ color: COLORS.textSecondary }}>요청자</strong>
                    <span>{detail.review.external_request_by || '—'}</span>
                    <strong style={{ color: COLORS.textSecondary }}>대상 건수</strong>
                    <span>{detail.review.external_expired_count ?? 0}건</span>
                    <strong style={{ color: COLORS.textSecondary }}>외부 결재 문서</strong>
                    <span>{detail.review.external_approval_doc_id || <em style={{ color: COLORS.textMuted }}>미상신</em>}</span>
                    <strong style={{ color: COLORS.textSecondary }}>본 시스템 검토</strong>
                    <span>{fmtDate(detail.review.reviewed_at)}</span>
                    {detail.review.review_note && (
                      <>
                        <strong style={{ color: COLORS.textSecondary }}>검토 메모</strong>
                        <span style={{ whiteSpace: 'pre-line' }}>{detail.review.review_note}</span>
                      </>
                    )}
                    {detail.review.review_reason && (
                      <>
                        <strong style={{ color: COLORS.danger }}>반려 사유</strong>
                        <span style={{ color: COLORS.danger, whiteSpace: 'pre-line' }}>{detail.review.review_reason}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* 폐기 대상 items */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>
                    🗂 폐기 대상 ({detail.items.length}건)
                  </div>
                  {detail.items.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 12, color: COLORS.textMuted, textAlign: 'center' }}>대상 없음</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {detail.items.map(it => (
                        <div key={it.id} style={{
                          padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`,
                          background: 'rgba(255,255,255,0.4)', fontSize: 12,
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <span style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                            background: it.data_type === 'CONTRACT' ? 'rgba(59,130,246,0.14)' : 'rgba(168,85,247,0.14)',
                            color: it.data_type === 'CONTRACT' ? '#1d4ed8' : '#7c3aed',
                          }}>
                            {it.data_type === 'CONTRACT' ? '📄 계약' : '🖼 파일'}
                          </span>
                          <strong style={{ color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>{it.custname || '—'}</strong>
                          <span style={{ color: COLORS.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {it.data_type === 'CONTRACT'
                              ? `${it.carsnums || '—'} · ${it.carsodnm || ''}`
                              : `${it.imagkind_label || ''} · ${it.imagonam || ''}`}
                          </span>
                          {it.external_deleted_at && (
                            <span style={{ fontSize: 10, color: COLORS.success, whiteSpace: 'nowrap' }}>✓ 삭제됨</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 액션 영역 */}
                {detail.review.review_status === 'pending' && (
                  <div style={{ ...GLASS.L3, padding: 12, borderRadius: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
                      🔍 CPO 검토 액션
                    </div>
                    <textarea
                      value={actionNote}
                      onChange={e => setActionNote(e.target.value)}
                      placeholder="검토 메모 (선택)"
                      rows={2}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                        border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 12,
                        background: 'rgba(255,255,255,0.6)', marginBottom: 6, fontFamily: 'inherit', resize: 'vertical',
                      }}
                    />
                    <textarea
                      value={actionReason}
                      onChange={e => setActionReason(e.target.value)}
                      placeholder="반려 사유 (반려 시 필수)"
                      rows={2}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                        border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 12,
                        background: 'rgba(255,255,255,0.6)', marginBottom: 8, fontFamily: 'inherit', resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleAction('approve')} disabled={actionBusy} style={{ ...btnSuccess, flex: 1 }}>
                        ✅ 승인
                      </button>
                      <button onClick={() => handleAction('reject')} disabled={actionBusy} style={{ ...btnDanger, flex: 1 }}>
                        ⛔ 반려
                      </button>
                    </div>
                  </div>
                )}

                {(detail.review.review_status === 'approved' || detail.review.review_status === 'executed') && (
                  <div style={{ ...GLASS.L3, padding: 12, borderRadius: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
                      🔒 최종 확인 (파기확인서 발급)
                    </div>
                    <textarea
                      value={actionNote}
                      onChange={e => setActionNote(e.target.value)}
                      placeholder="확인 메모 (선택)"
                      rows={2}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                        border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 12,
                        background: 'rgba(255,255,255,0.6)', marginBottom: 8, fontFamily: 'inherit', resize: 'vertical',
                      }}
                    />
                    <button onClick={() => handleAction('confirm')} disabled={actionBusy} style={{ ...btnPrimary, width: '100%' }}>
                      🔒 최종 확인 → 파기확인서 발급
                    </button>
                  </div>
                )}

                {/* audit log */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>
                    📜 결재 이력 ({detail.audits.length}건)
                  </div>
                  {detail.audits.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 12, color: COLORS.textMuted, textAlign: 'center' }}>이력 없음</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {detail.audits.map(a => (
                        <div key={a.id} style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.4)', fontSize: 11, color: COLORS.textSecondary }}>
                          <strong style={{ color: COLORS.textPrimary }}>{a.action}</strong> · {a.actor_name || a.actor_id || 'system'} · {fmtDate(a.action_at)}
                          {a.note && <div style={{ marginTop: 2, color: COLORS.textMuted, whiteSpace: 'pre-line' }}>{a.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

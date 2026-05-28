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
  contract_count: number
  file_count: number
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
  not_synced: { label: '미반영',           bg: 'rgba(148,163,184,0.12)', fg: '#475569' },
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

// ── audit action 별 역할 prefix 매핑 (담당자 / 관리자 / 책임자) ──
function actionRoleLabel(action: string): { role: string; label: string; color: string } {
  switch (action) {
    case 'sync':      return { role: '담당자', label: '자료 갱신',   color: '#475569' }
    case 'approve':   return { role: '책임자', label: '승인',         color: '#047857' }
    case 'reject':    return { role: '책임자', label: '반려',         color: '#b91c1c' }
    case 'confirm':   return { role: '책임자', label: '최종 확인',    color: '#047857' }
    case 'executed':  return { role: '관리자', label: '실행',         color: '#7c3aed' }
    default:          return { role: '시스템', label: action,         color: '#64748b' }
  }
}

// ── 결재 라인 (3단계, 매뉴얼 통합본 5.17 제6조 + 임명장 명시) ──
//   사용자 결정 (2026-05-29): 강제 박기 — 양재희 부장 → 석호민 부장 → 임성민 이사.
//   시간은 오늘 낮시간 순차 (09:30 / 11:00 / 14:30) — 실제 review 데이터가 있으면 그대로 사용.
function ApprovalLine({ review, officers }: {
  review: any
  officers: { cpo: { name: string; display_title: string } | null; manager1: { name: string; display_title: string } | null; manager2: { name: string; display_title: string } | null }
}) {
  const status = review.review_status || 'pending'

  // 오늘 낮시간 fallback (실 시각 없을 때만 사용)
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const t0930 = `${yyyy}-${mm}-${dd} 09:30:00`
  const t1100 = `${yyyy}-${mm}-${dd} 11:00:00`
  const t1430 = `${yyyy}-${mm}-${dd} 14:30:00`

  // 3 단계 (매뉴얼 임명자 박음):
  //   [1] 양재희 부장 — 정보보안 담당자 — 폐기 요청
  //   [2] 석호민 부장 — 개인정보보호 담당자 (관리자) — 검토
  //   [3] 임성민 이사 — 개인정보보호 책임자 (CPO) — 승인·최종 확인
  const stages = [
    {
      step: '1',
      role: '담당자',
      title: '폐기 요청',
      person: '양재희 부장',
      subtitle: '라이드케어 정보보안 담당자',
      at: review.external_request_at || t0930,
      done: true,
      current: false,
    },
    {
      step: '2',
      role: '관리자',
      title: '검토',
      person: '석호민 부장',
      subtitle: '라이드케어 개인정보보호 담당자',
      at: review.external_approval_at || t1100,
      done: ['approved', 'executed', 'confirmed'].includes(status) || !!review.external_approval_at,
      current: status === 'pending',
    },
    {
      step: '3',
      role: '책임자',
      title: status === 'rejected' ? '반려' : '승인·최종 확인',
      person: '임성민 이사',
      subtitle: '라이드케어 개인정보보호 책임자 (CPO)',
      at: review.external_confirmed_at || (status === 'confirmed' ? review.reviewed_at : null) || (['confirmed', 'executed', 'approved'].includes(status) ? t1430 : null),
      done: status === 'confirmed' || !!review.external_confirmed_at,
      current: status === 'approved' || status === 'executed',
      reject: status === 'rejected',
    },
  ]

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
      {stages.map((s, i) => {
        const bg = s.reject ? 'rgba(239,68,68,0.10)'
                : s.done   ? 'rgba(16,185,129,0.10)'
                : s.current ? 'rgba(59,130,246,0.10)'
                : 'rgba(148,163,184,0.08)'
        const border = s.reject ? COLORS.danger
                     : s.done    ? COLORS.success
                     : s.current ? COLORS.primary
                     : COLORS.borderSubtle
        const fg = s.reject ? COLORS.danger
                 : s.done    ? COLORS.success
                 : s.current ? COLORS.primary
                 : COLORS.textMuted
        return (
          <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              flex: '0 0 auto', minWidth: 150,
              padding: '8px 12px', borderRadius: 10,
              background: bg, border: `1px solid ${border}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: fg, letterSpacing: 0.4 }}>
                {s.step}단계 · {s.role}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginTop: 2 }}>
                {s.title}
              </div>
              <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                {s.person}
              </div>
              {s.at && (
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 1 }}>{fmtDate(s.at)}</div>
              )}
              {!s.at && (
                <div style={{ fontSize: 10, color: fg, marginTop: 1, fontWeight: 600 }}>
                  {s.current ? '진행 중' : s.reject ? '반려' : '대기'}
                </div>
              )}
            </div>
            {i < stages.length - 1 && (
              <span style={{ fontSize: 16, color: stages[i + 1].done || stages[i + 1].current ? COLORS.primary : COLORS.textMuted }}>→</span>
            )}
          </div>
        )
      })}
    </div>
  )
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
  const [detail, setDetail] = useState<{
    review: any
    items: DisposalItem[]
    audits: AuditRow[]
    deliverable?: { id: string; file_url: string; file_name: string | null; title: string | null } | null
    officers?: { cpo: { name: string; display_title: string } | null; manager1: { name: string; display_title: string } | null; manager2: { name: string; display_title: string } | null } | null
    reviewer_name?: string | null
  } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionReason, setActionReason] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [resultPanel, setResultPanel] = useState<{ kind: 'ok' | 'err' | 'info'; msg: string } | null>(null)
  // 폐기 항목 구분 필터 (CONTRACT / FILE)
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'CONTRACT' | 'FILE'>('all')

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
      if (!json.success) { setResultPanel({ kind: 'err', msg: `갱신 실패: ${json.error}` }); return }
      setResultPanel({ kind: 'ok', msg: `결재 #${extId} 갱신 완료 — 대상 ${json.data?.items_count ?? 0}건` })
      await fetchList()
      if (json.data?.review_id) {
        setSelectedReviewId(json.data.review_id)
        fetchDetail(json.data.review_id)
      }
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `갱신 오류: ${e}` })
    } finally {
      setActionBusy(false)
    }
  }

  // ── 자료 갱신 (관리자 액션) ─────────────────────────
  const handleSyncAll = async () => {
    setActionBusy(true)
    setResultPanel({ kind: 'info', msg: '자료를 가져오는 중입니다.' })
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/disposal/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ limit: 100 }),
      })
      const json = await res.json()
      if (!json.success) { setResultPanel({ kind: 'err', msg: `자료 갱신 실패: ${json.error}` }); return }
      const d = json.data
      const errLine = d.errors?.length
        ? `\n오류 ${d.errors.length}건 — ${d.errors.slice(0, 2).map((e: any) => `#${e.external_approval_id}: ${e.error}`).join(' / ')}`
        : ''
      const isError = d.errors?.length > 0 && (d.new ?? 0) === 0 && (d.updated ?? 0) === 0
      setResultPanel({
        kind: isError ? 'err' : 'ok',
        msg: `조회 ${d.fetched ?? 0}건 · 신규 ${d.new ?? 0}건 · 갱신 ${d.updated ?? 0}건 · 대상 ${d.items_inserted ?? 0}건${errLine}`,
      })
      await fetchList()
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `자료 갱신 오류: ${e}` })
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
      const actionLabel = action === 'approve' ? '승인' : action === 'reject' ? '반려' : '확인'
      if (!json.success) { setResultPanel({ kind: 'err', msg: `${actionLabel} 실패: ${json.error}` }); return }
      setResultPanel({ kind: 'ok', msg: `${actionLabel} 처리되었습니다.` })
      setActionReason('')
      setActionNote('')
      await fetchList()
      await fetchDetail(selectedReviewId)
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `처리 중 오류가 발생했습니다: ${e}` })
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
    const totalContract = rows.reduce((s, r) => s + (r.contract_count || 0), 0)
    const totalFile     = rows.reduce((s, r) => s + (r.file_count || 0), 0)
    return [
      { label: '전체 결재',   value: total,                            tint: 'blue'   },
      { label: '검토 대기',   value: pending,                          tint: 'amber'  },
      { label: '승인·실행',   value: approved,                         tint: 'green'  },
      { label: '최종 확인',   value: confirmed,                        tint: 'purple' },
      { label: '계약 폐기',   value: totalContract.toLocaleString(),   unit: '건', tint: 'blue'  },
      { label: '파일 폐기',   value: totalFile.toLocaleString(),       unit: '건', tint: 'purple' },
    ]
  }, [rows])

  // ── 컬럼 ─────────────────────────────────────────────────
  const cols: TableColumn<UnifiedRow>[] = [
    {
      key: 'external_approval_id',
      label: '결재 번호',
      sortBy: r => r.external_approval_id,
      render: r => (
        <strong style={{ color: COLORS.textPrimary }}>#{r.external_approval_id}</strong>
      ),
    },
    {
      key: 'external_request_at',
      label: '폐기예정일',
      sortBy: r => r.external_request_at || '',
      render: r => <span style={{ fontSize: 12 }}>{fmtDate(r.external_request_at)}</span>,
    },
    {
      key: 'external_request_by',
      label: '요청자',
      sortBy: () => '양재희 부장',
      render: () => (
        <span>
          <strong style={{ color: COLORS.textPrimary }}>양재희 부장</strong>
          <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 4 }}>정보보안 담당자</span>
        </span>
      ),
    },
    {
      key: 'external_expired_count',
      label: '대상 (계약 · 파일)',
      sortBy: r => r.external_expired_count ?? 0,
      render: r => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <strong style={{ color: COLORS.textPrimary }}>{(r.external_expired_count ?? 0).toLocaleString()}건</strong>
          {(r.contract_count > 0 || r.file_count > 0) && (
            <span style={{ fontSize: 10, color: COLORS.textSecondary }}>
              (📄 {r.contract_count.toLocaleString()} · 🖼 {r.file_count.toLocaleString()})
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'external_approval_doc_id',
      label: '외부 결재 일련번호',
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
      label: '검토일시',
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
            title="이 결재만 다시 갱신"
            style={{ ...BTN.sm, border: 'none', background: COLORS.bgBlue, color: COLORS.primary, cursor: actionBusy ? 'wait' : 'pointer' }}
          >
            🔄 재갱신
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

      {/* 출처 라벨 + 동기화 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', background: 'rgba(59,130,246,0.10)', border: `1px solid ${COLORS.borderBlue}`, borderRadius: 999, fontSize: 11, color: COLORS.primary }}>
          <span style={{ fontWeight: 700 }}>데이터 제공</span>
          <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>메리츠 캐피탈</span>
        </div>
        <div style={{ flex: 1 }} />
        {adapterMode === 'mock' && (
          <span style={{ fontSize: 11, color: COLORS.warning, fontWeight: 600 }}>※ 시연 데이터</span>
        )}
        <button
          onClick={handleSyncAll}
          disabled={actionBusy || loading}
          style={{ ...btnPrimary, whiteSpace: 'nowrap', fontWeight: 600 }}
        >
          {actionBusy ? '갱신 중…' : '자료 갱신'}
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

      {/* 풀폭 모드: 결재 선택 시 list 숨김 + detail 전체 너비 */}
      {!selectedReviewId && (
        <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12, marginTop: 16 }}>
          <DcToolbar
            search={q}
            onSearchChange={setQ}
            placeholder="결재 번호 · 요청자 · 결재 문서 검색"
            trailing={
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
                padding: '7px 12px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`,
                background: 'rgba(255,255,255,0.6)', fontSize: 12, color: COLORS.textPrimary, cursor: 'pointer',
              }}>
                <option value="">상태: 전체</option>
                <option value="pending">검토 대기</option>
                <option value="approved">승인</option>
                <option value="rejected">반려</option>
                <option value="executed">삭제 실행</option>
                <option value="confirmed">최종 확인</option>
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
              {rows.length === 0 ? '내역이 없습니다.' : '검색 결과가 없습니다.'}
            </div>
          )}
        </div>
      )}

      {/* 풀폭 상세 — 결재 라인 sticky + items NeuDataTable */}
      {selectedReviewId && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            position: 'sticky', top: 0, zIndex: 5,
            ...GLASS.L4, padding: 16, borderRadius: 12, marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <button onClick={() => { setSelectedReviewId(null); setDetail(null); setItemTypeFilter('all') }}
                style={{ ...BTN.sm, background: COLORS.bgGray, border: `1px solid ${COLORS.borderSubtle}`, color: COLORS.textSecondary, cursor: 'pointer', marginRight: 12 }}>
                ← 목록으로
              </button>
              <h3 style={{ margin: 0, fontSize: 15, color: COLORS.textPrimary }}>
                결재 상세 {detail?.review.external_approval_id ? `· #${detail.review.external_approval_id}` : ''}
              </h3>
            </div>

            {/* 결재 라인 — 담당자 → 관리자 → 책임자 (매뉴얼 임명 고정) */}
            {detail && (
              <ApprovalLine
                review={detail.review}
                officers={detail.officers || { cpo: null, manager1: null, manager2: null }}
              />
            )}
          </div>

            {detailLoading && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: COLORS.textMuted }}>⏳ 상세 로딩 중…</div>
            )}

            {detail && (
              <>
                {/* 결재 메타 */}
                <div style={{ ...GLASS.L3, padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 6, columnGap: 8 }}>
                    <strong style={{ color: COLORS.textSecondary }}>결재 번호</strong>
                    <span>#{detail.review.external_approval_id}</span>
                    <strong style={{ color: COLORS.textSecondary }}>상태</strong>
                    <span>
                      {(() => {
                        const s = STATUS_LABEL[detail.review.review_status] || { label: detail.review.review_status, bg: '', fg: '' }
                        return <span style={{ padding: '2px 8px', borderRadius: 6, background: s.bg, color: s.fg, fontWeight: 700 }}>{s.label}</span>
                      })()}
                    </span>
                    <strong style={{ color: COLORS.textSecondary }}>폐기예정일</strong>
                    <span>{fmtDate(detail.review.external_request_at)}</span>
                    <strong style={{ color: COLORS.textSecondary }}>요청자</strong>
                    <span>양재희 부장 <span style={{ fontSize: 10, color: COLORS.textMuted }}>(라이드케어 정보보안 담당자)</span></span>
                    <strong style={{ color: COLORS.textSecondary }}>대상 건수</strong>
                    <span>{detail.review.external_expired_count ?? 0}건</span>
                    <strong style={{ color: COLORS.textSecondary }}>외부 결재 일련번호</strong>
                    <span>{detail.review.external_approval_doc_id || <em style={{ color: COLORS.textMuted }}>미상신</em>}</span>
                    <strong style={{ color: COLORS.textSecondary }}>검토일시</strong>
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

                {/* 폐기 대상 items — 구분 필터 + NeuDataTable (전체 컬럼) */}
                <div style={{ marginBottom: 12 }}>
                  {(() => {
                    const cContract = detail.items.filter(i => i.data_type === 'CONTRACT').length
                    const cFile     = detail.items.filter(i => i.data_type === 'FILE').length
                    const filteredItems = itemTypeFilter === 'all'
                      ? detail.items
                      : detail.items.filter(i => i.data_type === itemTypeFilter)
                    const itemCols: TableColumn<DisposalItem>[] = [
                      {
                        key: 'data_type', label: '구분',
                        sortBy: r => r.data_type,
                        render: r => (
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                            background: r.data_type === 'CONTRACT' ? 'rgba(59,130,246,0.14)' : 'rgba(168,85,247,0.14)',
                            color: r.data_type === 'CONTRACT' ? '#1d4ed8' : '#7c3aed',
                          }}>
                            {r.data_type === 'CONTRACT' ? '📄 계약' : '🖼 파일'}
                          </span>
                        ),
                      },
                      { key: 'custname', label: '거래처', sortBy: r => r.custname || '', render: r => <strong style={{ color: COLORS.textPrimary }}>{r.custname || '—'}</strong> },
                      { key: 'carsnums', label: '차량번호', sortBy: r => r.carsnums || '', render: r => r.carsnums || '—' },
                      { key: 'carsodnm', label: '차종',   sortBy: r => r.carsodnm || '', render: r => r.carsodnm || '—' },
                      { key: 'imagkind_label', label: '첨부 종류', sortBy: r => r.imagkind_label || '', render: r => r.imagkind_label || '—' },
                      { key: 'imagonam', label: '파일명', sortBy: r => r.imagonam || '', render: r => <span style={{ fontSize: 11, color: COLORS.textSecondary }}>{r.imagonam || '—'}</span> },
                      { key: 'data_id',  label: '식별자', sortBy: r => r.data_id || '', render: r => <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: 'monospace' }}>{r.data_id}</span> },
                      {
                        key: 'external_deleted_at', label: '삭제일시',
                        sortBy: r => r.external_deleted_at || '',
                        render: r => r.external_deleted_at
                          ? <span style={{ fontSize: 11, color: COLORS.success, fontWeight: 600 }}>✓ {fmtDate(r.external_deleted_at)}</span>
                          : <span style={{ fontSize: 11, color: COLORS.textMuted }}>—</span>,
                      },
                    ]
                    return (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                            폐기 대상 — 총 {detail.items.length.toLocaleString()}건
                          </span>
                          <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
                            (📄 계약 {cContract.toLocaleString()} · 🖼 파일 {cFile.toLocaleString()})
                          </span>
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                            {(['all', 'CONTRACT', 'FILE'] as const).map(k => {
                              const isActive = itemTypeFilter === k
                              const label = k === 'all' ? `전체 ${detail.items.length}`
                                          : k === 'CONTRACT' ? `📄 계약 ${cContract}`
                                          : `🖼 파일 ${cFile}`
                              return (
                                <button
                                  key={k}
                                  onClick={() => setItemTypeFilter(k)}
                                  style={{
                                    padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                    border: `1px solid ${isActive ? COLORS.primary : COLORS.borderSubtle}`,
                                    background: isActive ? COLORS.primary : 'transparent',
                                    color: isActive ? '#fff' : COLORS.textSecondary,
                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                  }}
                                >
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        {/* 거래처별 카운트 chips (캐피탈/렌탈사 등) */}
                        {detail.items.length > 0 && (() => {
                          const byCust = new Map<string, number>()
                          for (const it of filteredItems) {
                            const k = it.custname || '미지정'
                            byCust.set(k, (byCust.get(k) || 0) + 1)
                          }
                          const sorted = Array.from(byCust.entries()).sort((a, b) => b[1] - a[1])
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 600, marginRight: 4 }}>거래처별</span>
                              {sorted.map(([name, cnt]) => (
                                <span key={name} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '3px 9px', borderRadius: 999, fontSize: 11,
                                  background: 'rgba(59,130,246,0.08)', border: `1px solid ${COLORS.borderBlue}`,
                                  color: COLORS.textPrimary, whiteSpace: 'nowrap',
                                }}>
                                  <strong>{name}</strong>
                                  <span style={{ color: COLORS.primary, fontWeight: 700 }}>{cnt.toLocaleString()}</span>
                                </span>
                              ))}
                            </div>
                          )
                        })()}
                        {detail.items.length === 0 ? (
                          <div style={{ padding: 16, fontSize: 12, color: COLORS.textMuted, textAlign: 'center' }}>대상 없음</div>
                        ) : (
                          <NeuDataTable
                            columns={itemCols}
                            data={filteredItems}
                            rowKey={r => r.id}
                            defaultSort={{ key: 'data_type', dir: 'asc' }}
                          />
                        )}
                      </>
                    )
                  })()}
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
                      최종 확인 — 파기확인서 자동 발급
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 8, padding: '8px 10px', background: 'rgba(59,130,246,0.06)', borderRadius: 6, lineHeight: 1.5 }}>
                      최종 확인 시 「개인정보보호 내부관리계획서」 제11조에 의거 파기확인서가 PDF 로 자동 발급됩니다.
                      <br />
                      발급 자료는 산출물 트래커에도 등록되며, 본 화면에서 즉시 다운로드 가능합니다.
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
                      최종 확인 후 파기확인서 발급
                    </button>
                  </div>
                )}

                {/* P30-A — 파기확인서 다운로드 */}
                {detail.deliverable && (
                  <div style={{ ...GLASS.L4, padding: 14, borderRadius: 10, marginBottom: 12, borderLeft: `4px solid ${COLORS.success}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                          파기확인서 발급 완료
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                          {detail.deliverable.title || detail.deliverable.file_name || '파기확인서.pdf'}
                        </div>
                        {detail.review.deliverable_issued_at && (
                          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                            발급일시 {fmtDate(detail.review.deliverable_issued_at)}
                          </div>
                        )}
                      </div>
                      <a
                        href={detail.deliverable.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...btnSuccess, textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
                      >
                        PDF 열기
                      </a>
                    </div>
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
                      {detail.audits.map(a => {
                        const r = actionRoleLabel(a.action)
                        // 매뉴얼 임명자 매핑 — role 별 고정 (사용자 결정 2026-05-29)
                        const officialName = r.role === '책임자' ? '임성민 이사'
                                          : r.role === '관리자' ? '석호민 부장'
                                          : r.role === '담당자' ? '양재희 부장'
                                          : null
                        const displayName = officialName || a.actor_name || a.actor_id || '시스템'
                        return (
                          <div key={a.id} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.5)', border: `1px solid ${COLORS.borderSubtle}`, fontSize: 12, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${r.color}1A`, color: r.color, whiteSpace: 'nowrap' }}>
                              {r.role}
                            </span>
                            <strong style={{ color: COLORS.textPrimary }}>{displayName}</strong>
                            <span style={{ color: r.color, fontWeight: 600 }}>{r.label}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{fmtDate(a.action_at)}</span>
                            {a.note && <div style={{ width: '100%', marginTop: 2, color: COLORS.textMuted, whiteSpace: 'pre-line', fontSize: 11 }}>{a.note}</div>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
    </div>
  )
}

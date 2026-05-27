'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// 장기렌트 견적 V3 목록 탭 (PR-Q4-1)
//
// 사용자 명시: 「견적작성 모달로 하기싫은데 페이지에서 구성하고 싶어요」
// → 모달 모두 제거, 목록만 유지.
//   「+ 견적 작성」 → /long-term-rentals/quotes/new
//   「✎ 상세」      → /long-term-rentals/quotes/[id]
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type QuoteRow = {
  id: string
  quote_no: string | null
  status: string
  contract_type: string
  rent_type: string
  customer_name: string
  customer_phone: string | null
  customer_company: string | null
  vehicle_car_number: string | null
  vehicle_brand: string | null
  vehicle_model: string | null
  vehicle_trim: string | null
  months: number | null
  monthly_fee: number | null
  margin_rate: number | null
  owner_name: string | null
  share_views: number
  sent_at: string | null
  updated_at: string
}

type FilterKey = 'all' | 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft:     { label: '✏️ 작성중',  bg: 'rgba(148,163,184,0.18)', fg: '#475569' },
  sent:      { label: '📤 발송됨',  bg: COLORS.bgBlue,            fg: COLORS.primary },
  accepted:  { label: '✅ 수락',    bg: 'rgba(16,185,129,0.14)',  fg: '#065f46' },
  rejected:  { label: '✗ 거부',     bg: 'rgba(239,68,68,0.12)',   fg: '#991b1b' },
  expired:   { label: '⏰ 만료',    bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
  converted: { label: '🔗 계약',    bg: 'rgba(124,58,237,0.14)',  fg: '#5b21b6' },
}

function fmtWon(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${Number(n).toLocaleString('ko-KR')}원`
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return '-'
  return String(s).slice(0, 10)
}

export default function QuotesTab() {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<QuoteRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 삭제 확인
  const [delTarget, setDelTarget] = useState<QuoteRow | null>(null)
  const [delBusy, setDelBusy] = useState(false)

  // 토스트
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showToast = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setToast(m); setTimeout(() => setToast(null), 4500)
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/lt-quotes?status=all', { headers })
      const json = await res.json().catch(() => ({}))
      if (Array.isArray(json?.data)) setRows(json.data as QuoteRow[])
      else { setRows([]); if (json?.error) setErr(json.error) }
    } catch (e) {
      setRows([]); setErr((e as Error)?.message || 'fetch 실패')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (rows === null && !loading) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(() => { setRows(null); fetchAll() }, [fetchAll])

  // PR-Q4-1: 모달 → 풀 페이지
  const openCreate = useCallback(() => router.push('/long-term-rentals/quotes/new'), [router])
  const openDetail = useCallback((r: QuoteRow) => router.push(`/long-term-rentals/quotes/${r.id}`), [router])

  const runDelete = useCallback(async () => {
    if (!delTarget) return
    setDelBusy(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/lt-quotes/${delTarget.id}`, { method: 'DELETE', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '삭제 실패')
      setDelTarget(null)
      showToast({ type: 'ok', text: '견적 삭제 완료' })
      refresh()
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '삭제 오류' })
    } finally { setDelBusy(false) }
  }, [delTarget, refresh, showToast])

  // 데이터/필터
  const allRows = rows || []
  const data = useMemo(() => ({
    all: allRows,
    draft: allRows.filter((r) => r.status === 'draft'),
    sent: allRows.filter((r) => r.status === 'sent'),
    accepted: allRows.filter((r) => r.status === 'accepted'),
    rejected: allRows.filter((r) => r.status === 'rejected'),
    expired: allRows.filter((r) => r.status === 'expired'),
    converted: allRows.filter((r) => r.status === 'converted'),
  }), [allRows])

  const activeData = data[filter]
  const filtered = useMemo(() => {
    if (!search.trim()) return activeData
    const q = search.toLowerCase()
    return activeData.filter((r) =>
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.vehicle_car_number || '').toLowerCase().includes(q) ||
      (r.vehicle_brand || '').toLowerCase().includes(q) ||
      (r.vehicle_model || '').toLowerCase().includes(q) ||
      (r.quote_no || '').toLowerCase().includes(q) ||
      (r.customer_phone || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = {
    all: data.all.length, draft: data.draft.length, sent: data.sent.length,
    accepted: data.accepted.length, converted: data.converted.length,
  }

  const statItems: StatItem[] = [
    { label: '📋 전체', value: counts.all, unit: '건', tint: 'blue' },
    { label: '✏️ 작성중', value: counts.draft, unit: '건', tint: 'purple' },
    { label: '📤 발송', value: counts.sent, unit: '건', tint: 'amber' },
    { label: '✅ 수락', value: counts.accepted, unit: '건', tint: 'green' },
    { label: '🔗 계약전환', value: counts.converted, unit: '건', tint: 'red' },
  ]
  const statActions: ActionButton[] = [
    { label: '견적 작성', onClick: openCreate, variant: 'primary', icon: '➕' },
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'all', label: '📋 전체', count: counts.all },
    { key: 'draft', label: '✏️ 작성중', count: counts.draft },
    { key: 'sent', label: '📤 발송', count: counts.sent },
    { key: 'accepted', label: '✅ 수락', count: counts.accepted },
    { key: 'converted', label: '🔗 계약전환', count: counts.converted },
  ]

  const columns: TableColumn<QuoteRow>[] = [
    { key: 'status', label: '상태', width: 92, align: 'center', sortBy: (r) => r.status || '',
      render: (r) => {
        const m = STATUS_META[r.status] || { label: r.status, bg: 'rgba(148,163,184,0.15)', fg: '#475569' }
        return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: m.bg, color: m.fg }}>{m.label}</span>
      },
    },
    { key: 'contract_type', label: '유형', width: 70, align: 'center', sortBy: (r) => r.contract_type || '',
      render: (r) => {
        const isNew = r.contract_type === '신차구입'
        return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap',
          background: isNew ? 'rgba(245,158,11,0.14)' : COLORS.bgBlue,
          color: isNew ? '#b45309' : COLORS.primary }}>
          {isNew ? '🆕 신차' : '🚗 기존'}
        </span>
      },
    },
    { key: 'customer', label: '고객', width: 160, sortBy: (r) => r.customer_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: '#1e293b' }}>{r.customer_name}</span>
        {r.customer_company ? <span style={{ color: '#94a3b8' }}> · {r.customer_company}</span> : null}
      </span>,
    },
    { key: 'vehicle', label: '차량', width: 200, sortBy: (r) => r.vehicle_car_number || `${r.vehicle_brand} ${r.vehicle_model}`,
      render: (r) => {
        const spec = [r.vehicle_brand, r.vehicle_model, r.vehicle_trim].filter(Boolean).join(' ')
        return <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 200, fontSize: 12 }}>
          {r.vehicle_car_number
            ? <><span style={{ fontWeight: 800, color: '#0f2440' }}>🚗 {r.vehicle_car_number}</span>{spec ? <span style={{ color: '#94a3b8' }}> · {spec}</span> : null}</>
            : spec
              ? <span style={{ color: '#b45309', fontWeight: 600 }}>🚚 {spec}</span>
              : <span style={{ color: '#cbd5e1' }}>미지정</span>}
        </span>
      },
    },
    { key: 'months', label: '기간', width: 64, align: 'center', sortBy: (r) => Number(r.months || 0),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: '#475569' }}>{r.months ? `${r.months}개월` : '-'}</span>,
    },
    { key: 'monthly_fee', label: '월 렌트료', width: 116, align: 'right', sortBy: (r) => Number(r.monthly_fee || 0),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: '#0f2440' }}>{fmtWon(r.monthly_fee)}</span>,
    },
    { key: 'margin', label: '마진율', width: 70, align: 'center', sortBy: (r) => Number(r.margin_rate || 0),
      render: (r) => r.margin_rate != null
        ? <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: r.margin_rate >= 10 ? '#065f46' : r.margin_rate >= 5 ? '#b45309' : '#991b1b' }}>{r.margin_rate.toFixed(1)}%</span>
        : <span style={{ color: '#cbd5e1' }}>-</span>,
    },
    { key: 'owner', label: '담당', width: 80, align: 'center', sortBy: (r) => r.owner_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#475569' }}>{r.owner_name || '-'}</span>,
    },
    { key: 'sent_at', label: '발송', width: 84, align: 'center', sortBy: (r) => r.sent_at || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: '#94a3b8' }}>{fmtDate(r.sent_at)}</span>,
    },
    { key: 'views', label: '조회', width: 56, align: 'center', sortBy: (r) => Number(r.share_views || 0),
      render: (r) => r.share_views > 0
        ? <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: COLORS.primary }}>👁 {r.share_views}</span>
        : <span style={{ color: '#cbd5e1', fontSize: 11 }}>-</span>,
    },
    { key: 'actions', label: '액션', width: 80, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
          <button onClick={(e) => { e.stopPropagation(); openDetail(r) }}
            style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✎ 상세</button>
          <button onClick={(e) => { e.stopPropagation(); setDelTarget(r) }}
            style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#991b1b', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>🗑</button>
        </span>
      ),
    },
  ]

  const mobileCard: MobileCardConfig<QuoteRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>{STATUS_META[r.status]?.label || r.status} · {r.customer_name}</span>,
    subtitle: (r) => `${[r.vehicle_brand, r.vehicle_model].filter(Boolean).join(' ') || r.vehicle_car_number || '미지정'} · ${r.months || '-'}개월 · ${fmtWon(r.monthly_fee)}/월`,
  }

  return (
    <>
      {toast && (
        <div role="status" style={{
          position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
          maxWidth: 'min(520px, 92vw)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
          background: toast.type === 'ok' ? 'rgba(236,253,245,0.97)' : 'rgba(254,242,242,0.97)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${toast.type === 'ok' ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)'}`,
          borderRadius: 12, boxShadow: '0 14px 36px rgba(15,23,42,0.18)',
          fontSize: 13, fontWeight: 700, color: toast.type === 'ok' ? '#065f46' : '#991b1b',
        }}>
          <span>{toast.type === 'ok' ? '✅' : '⚠️'}</span>
          <span style={{ flex: 1 }}>{toast.text}</span>
          <button onClick={() => setToast(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15 }}>×</button>
        </div>
      )}

      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="고객 / 차량 / 견적번호 검색…"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as FilterKey)}
      />
      {err && (
        <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b' }}>
          ⚠ {err} — lt_quotes 마이그레이션이 적용됐는지 확인해주세요.
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        onRowClick={openDetail}
        loading={loading}
        emptyIcon="📝"
        emptyMessage="견적이 없습니다 — 「견적 작성」으로 추가하세요"
        mobileCard={mobileCard}
        defaultSort={{ key: 'updated_at', dir: 'desc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 매입가 + 차종 + 기간 입력 시 견적 작성 페이지 우측에서 7대 원가·마진·IRR 실시간 자동 산출.
      </div>

      {delTarget && (
        <div onClick={() => !delBusy && setDelTarget(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ ...GLASS.L5, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', width: 'min(400px, 96vw)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px 14px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>🗑 견적 삭제</h3>
              <div style={{ ...GLASS.L1, marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#1e293b' }}>
                📝 {delTarget.quote_no || delTarget.id.slice(0, 8)} · {delTarget.customer_name}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#991b1b' }}>이 견적을 삭제합니다. 되돌릴 수 없습니다.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '12px 20px 16px' }}>
              <button onClick={() => !delBusy && setDelTarget(null)}
                style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#475569' }}>닫기</button>
              <button onClick={runDelete} disabled={delBusy}
                style={{ flex: 1, padding: '10px', color: '#fff', border: 'none', borderRadius: 9, cursor: delBusy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800, opacity: delBusy ? 0.5 : 1, background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                {delBusy ? '처리 중…' : '🗑 삭제하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

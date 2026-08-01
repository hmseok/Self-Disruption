'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// 장기렌트 견적 목록 탭
// 2026-07-30 개편: 플랫 디자인 재작성 (이모지 제거, 목업 배지 스타일).
// 데이터 흐름은 유지 — 목록 + 상태 필터, 작성/상세는 풀 페이지
//   「+ 견적 작성」 → /long-term-rentals/quotes/new
//   행 클릭        → /long-term-rentals/quotes/[id]
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
  draft:     { label: '작성중', bg: COLORS.borderFaint, fg: COLORS.textSecondary },
  sent:      { label: '발송됨', bg: COLORS.bgBlue,      fg: COLORS.primary },
  accepted:  { label: '수락',   bg: COLORS.bgGreen,     fg: COLORS.success },
  rejected:  { label: '거부',   bg: COLORS.bgRed,       fg: COLORS.danger },
  expired:   { label: '만료',   bg: COLORS.bgAmber,     fg: COLORS.warning },
  converted: { label: '계약 전환', bg: COLORS.bgViolet, fg: '#6d28d9' },
}

function fmtWon(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${Number(n).toLocaleString('ko-KR')}원`
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
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
    setToast(m); setTimeout(() => setToast(null), 4000)
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
      setRows([]); setErr((e as Error)?.message || '견적 목록을 불러오지 못했습니다')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (rows === null && !loading) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(() => { setRows(null); fetchAll() }, [fetchAll])

  // 작성/상세는 풀 페이지
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
      showToast({ type: 'ok', text: '견적을 삭제했습니다' })
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

  const filterItems: FilterItem[] = [
    { key: 'all', label: '전체', count: data.all.length },
    { key: 'draft', label: '작성중', count: data.draft.length },
    { key: 'sent', label: '발송', count: data.sent.length },
    { key: 'accepted', label: '수락', count: data.accepted.length },
    { key: 'converted', label: '계약 전환', count: data.converted.length },
  ]

  const columns: TableColumn<QuoteRow>[] = [
    { key: 'status', label: '상태', width: 90, align: 'center', sortBy: (r) => r.status || '',
      render: (r) => {
        const m = STATUS_META[r.status] || { label: r.status, bg: COLORS.borderFaint, fg: COLORS.textSecondary }
        return <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: m.bg, color: m.fg }}>{m.label}</span>
      },
    },
    { key: 'contract_type', label: '유형', width: 64, align: 'center', sortBy: (r) => r.contract_type || '',
      render: (r) => {
        const isNew = r.contract_type === '신차구입'
        return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
          background: isNew ? COLORS.bgAmber : COLORS.bgBlue,
          color: isNew ? COLORS.warning : COLORS.primary }}>
          {isNew ? '신차' : '기존'}
        </span>
      },
    },
    { key: 'customer', label: '고객', width: 160, sortBy: (r) => r.customer_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160, fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>{r.customer_name}</span>
        {r.customer_company ? <span style={{ color: COLORS.textMuted }}> · {r.customer_company}</span> : null}
      </span>,
    },
    { key: 'vehicle', label: '차량', width: 200, sortBy: (r) => r.vehicle_car_number || `${r.vehicle_brand} ${r.vehicle_model}`,
      render: (r) => {
        const spec = [r.vehicle_brand, r.vehicle_model, r.vehicle_trim].filter(Boolean).join(' ')
        return <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 200, fontSize: 12.5 }}>
          {r.vehicle_car_number
            ? <><span style={{ fontWeight: 600 }}>{r.vehicle_car_number}</span>{spec ? <span style={{ color: COLORS.textMuted }}> · {spec}</span> : null}</>
            : spec
              ? <span style={{ color: COLORS.warning, fontWeight: 500 }}>{spec} (신차)</span>
              : <span style={{ color: COLORS.textDim }}>미지정</span>}
        </span>
      },
    },
    { key: 'months', label: '기간', width: 64, align: 'center', sortBy: (r) => Number(r.months || 0),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12.5, color: COLORS.textSecondary }}>{r.months ? `${r.months}개월` : '—'}</span>,
    },
    { key: 'monthly_fee', label: '월 렌트료', width: 110, align: 'right', sortBy: (r) => Number(r.monthly_fee || 0),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtWon(r.monthly_fee)}</span>,
    },
    { key: 'margin', label: '마진율', width: 68, align: 'center', sortBy: (r) => Number(r.margin_rate || 0),
      render: (r) => r.margin_rate != null
        ? <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: r.margin_rate >= 10 ? COLORS.success : r.margin_rate >= 5 ? COLORS.warning : COLORS.danger }}>{r.margin_rate.toFixed(1)}%</span>
        : <span style={{ color: COLORS.textDim }}>—</span>,
    },
    { key: 'owner', label: '담당', width: 76, align: 'center', sortBy: (r) => r.owner_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12.5, color: COLORS.textSecondary }}>{r.owner_name || '—'}</span>,
    },
    { key: 'sent_at', label: '발송일', width: 84, align: 'center', sortBy: (r) => r.sent_at || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: COLORS.textMuted }}>{fmtDate(r.sent_at)}</span>,
    },
    { key: 'views', label: '열람', width: 56, align: 'center', sortBy: (r) => Number(r.share_views || 0),
      render: (r) => r.share_views > 0
        ? <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: COLORS.primary }}>{r.share_views}회</span>
        : <span style={{ color: COLORS.textDim, fontSize: 12 }}>—</span>,
    },
    { key: 'actions', label: '', width: 88, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
          <button onClick={(e) => { e.stopPropagation(); openDetail(r) }}
            style={{ padding: '3px 9px', borderRadius: 7, border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', color: COLORS.textSecondary, cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>상세</button>
          <button onClick={(e) => { e.stopPropagation(); setDelTarget(r) }}
            style={{ padding: '3px 9px', borderRadius: 7, border: `1px solid ${COLORS.borderRed}`, background: '#fff', color: COLORS.danger, cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>삭제</button>
        </span>
      ),
    },
  ]

  const mobileCard: MobileCardConfig<QuoteRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>{STATUS_META[r.status]?.label || r.status} · {r.customer_name}</span>,
    subtitle: (r) => `${[r.vehicle_brand, r.vehicle_model].filter(Boolean).join(' ') || r.vehicle_car_number || '미지정'} · ${r.months || '—'}개월 · ${fmtWon(r.monthly_fee)}/월`,
  }

  return (
    <>
      {toast && (
        <div role="status" style={{
          position: 'fixed', top: 20, right: 24, zIndex: 60,
          maxWidth: 'min(520px, 92vw)', padding: '11px 18px',
          background: toast.type === 'ok' ? COLORS.textPrimary : COLORS.danger, color: '#fff',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          fontSize: 13, fontWeight: 500,
        }}>{toast.text}</div>
      )}

      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="고객, 차량, 견적번호 검색..."
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as FilterKey)}
        trailing={
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={refresh}
              style={{ border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: COLORS.textSecondary, cursor: 'pointer' }}>새로고침</button>
            <button onClick={openCreate}
              style={{ border: 'none', background: COLORS.primary, borderRadius: 9, padding: '7px 15px', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>+ 견적 작성</button>
          </div>
        }
      />
      {err && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`, fontSize: 12.5, color: COLORS.danger }}>
          {err}
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
        defaultSort={{ key: 'sent_at', dir: 'desc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: COLORS.textMuted }}>
        매입가·차종·기간을 입력하면 견적 작성 화면 우측에서 원가·마진이 실시간으로 계산됩니다.
      </div>

      {delTarget && (
        <div onClick={() => !delBusy && setDelTarget(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(16,24,40,0.24)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, width: 'min(380px, 96vw)', borderRadius: 12, boxShadow: '0 8px 24px rgba(16,24,40,0.18)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px 14px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>견적 삭제</h3>
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: COLORS.bgGray, border: `1px solid ${COLORS.borderSubtle}`, fontSize: 12.5 }}>
                {delTarget.quote_no || delTarget.id.slice(0, 8)} · {delTarget.customer_name}
              </div>
              <div style={{ marginTop: 10, fontSize: 12.5, color: COLORS.danger }}>이 견적을 삭제합니다. 되돌릴 수 없습니다.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '12px 20px 16px' }}>
              <button onClick={() => !delBusy && setDelTarget(null)}
                style={{ flex: 1, padding: '9px', background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>취소</button>
              <button onClick={runDelete} disabled={delBusy}
                style={{ flex: 1, padding: '9px', color: '#fff', border: 'none', borderRadius: 9, cursor: delBusy ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, opacity: delBusy ? 0.6 : 1, background: COLORS.danger }}>
                {delBusy ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

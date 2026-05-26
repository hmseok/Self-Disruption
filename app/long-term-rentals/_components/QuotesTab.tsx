'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// 장기렌트 견적 탭 (PR-Q1)
//
// 사용자 명시 (2026-05-26): 「렌트 견적자체도 여기서 진행…
//   지금 장기 플로우에서 견적이 추가 되는 게 좋을것같아요」
//   → long_term_quotes 별도 테이블, 채택 시 long_term_rentals 로 convert.
//   → VAT 포함 단일가.
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
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  customer_company: string | null
  vehicle_id: string | null
  vehicle_car_number: string | null
  vehicle_spec: string | null
  vehicle_brand?: string | null
  vehicle_model?: string | null
  start_date: string | null
  months: number | null
  end_date: string | null
  monthly_fee: number | null
  deposit: number | null
  upfront_months: number | null
  annual_km: number | null
  insurance_option: string | null
  delivery_fee: number | null
  sent_at: string | null
  valid_until: string | null
  owner_id: string | null
  owner_name: string | null
  share_token: string | null
  share_views: number
  share_last_viewed_at: string | null
  converted_to_rental_id: string | null
  converted_at: string | null
  memo: string | null
  created_at: string
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

const CONTRACT_TYPES = [
  { value: '기존차량', label: '기존차량' },
  { value: '신차구입', label: '신차구입' },
]

function fmtWon(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${Number(n).toLocaleString('ko-KR')}원`
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return '-'
  return String(s).slice(0, 10)
}

const emptyForm = {
  quote_no: '',
  contract_type: '기존차량',
  customer_name: '', customer_phone: '', customer_email: '', customer_company: '',
  vehicle_car_number: '', vehicle_spec: '',
  start_date: '', months: '', end_date: '',
  monthly_fee: '', deposit: '', upfront_months: '', annual_km: '',
  insurance_option: '', delivery_fee: '',
  valid_until: '', owner_name: '',
  memo: '',
}

export default function QuotesTab() {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<QuoteRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 등록/수정 모달
  const [modalOpen, setModalOpen] = useState(false)
  const [editRow, setEditRow] = useState<QuoteRow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [modalMsg, setModalMsg] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<'send' | 'convert' | 'accept' | 'reject' | 'expire' | null>(null)

  // 삭제 확인
  const [delTarget, setDelTarget] = useState<QuoteRow | null>(null)
  const [delBusy, setDelBusy] = useState(false)

  // 토스트
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showToast = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setToast(m)
    setTimeout(() => setToast(null), 4500)
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/long-term-quotes?status=all', { headers })
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

  const openCreate = useCallback(() => {
    setEditRow(null); setForm({ ...emptyForm }); setModalMsg(null); setModalOpen(true)
  }, [])

  const openEdit = useCallback((r: QuoteRow) => {
    setEditRow(r)
    setForm({
      quote_no: r.quote_no || '',
      contract_type: r.contract_type || '기존차량',
      customer_name: r.customer_name || '',
      customer_phone: r.customer_phone || '',
      customer_email: r.customer_email || '',
      customer_company: r.customer_company || '',
      vehicle_car_number: r.vehicle_car_number || '',
      vehicle_spec: r.vehicle_spec || '',
      start_date: r.start_date ? String(r.start_date).slice(0, 10) : '',
      months: r.months != null ? String(r.months) : '',
      end_date: r.end_date ? String(r.end_date).slice(0, 10) : '',
      monthly_fee: r.monthly_fee != null ? String(r.monthly_fee) : '',
      deposit: r.deposit != null ? String(r.deposit) : '',
      upfront_months: r.upfront_months != null ? String(r.upfront_months) : '',
      annual_km: r.annual_km != null ? String(r.annual_km) : '',
      insurance_option: r.insurance_option || '',
      delivery_fee: r.delivery_fee != null ? String(r.delivery_fee) : '',
      valid_until: r.valid_until ? String(r.valid_until).slice(0, 10) : '',
      owner_name: r.owner_name || '',
      memo: r.memo || '',
    })
    setModalMsg(null); setModalOpen(true)
  }, [])

  const save = useCallback(async () => {
    if (!form.customer_name.trim()) { setModalMsg('고객명은 필수입니다'); return }
    setSaving(true); setModalMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const body = {
        quote_no: form.quote_no.trim() || null,
        contract_type: form.contract_type || '기존차량',
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim() || null,
        customer_email: form.customer_email.trim() || null,
        customer_company: form.customer_company.trim() || null,
        vehicle_car_number: form.vehicle_car_number.trim() || null,
        vehicle_spec: form.vehicle_spec.trim() || null,
        start_date: form.start_date || null,
        months: form.months === '' ? null : Number(form.months),
        end_date: form.end_date || null,
        monthly_fee: form.monthly_fee === '' ? null : Number(form.monthly_fee),
        deposit: form.deposit === '' ? null : Number(form.deposit),
        upfront_months: form.upfront_months === '' ? null : Number(form.upfront_months),
        annual_km: form.annual_km === '' ? null : Number(form.annual_km),
        insurance_option: form.insurance_option.trim() || null,
        delivery_fee: form.delivery_fee === '' ? null : Number(form.delivery_fee),
        valid_until: form.valid_until || null,
        owner_name: form.owner_name.trim() || null,
        memo: form.memo.trim() || null,
      }
      const url = editRow ? `/api/long-term-quotes/${editRow.id}` : '/api/long-term-quotes'
      const res = await fetch(url, { method: editRow ? 'PATCH' : 'POST', headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '저장 실패')
      if (!editRow && json?.data) setEditRow(json.data as QuoteRow) // 새로 생성 → editRow 로 전환 (발송/공유 가능)
      showToast({ type: 'ok', text: editRow ? '견적 수정 완료' : '견적 등록 완료' })
      refresh()
    } catch (e) {
      setModalMsg((e as Error)?.message || '저장 오류')
    } finally { setSaving(false) }
  }, [form, editRow, refresh, showToast])

  // 발송 (status='sent', share_token 발급)
  const runSend = useCallback(async () => {
    if (!editRow) return
    setActionBusy('send')
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/long-term-quotes/${editRow.id}/send`, { method: 'POST', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '발송 실패')
      setEditRow(json.data as QuoteRow)
      showToast({ type: 'ok', text: '발송 완료 — 공유 링크가 생성됐습니다' })
      refresh()
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '발송 오류' })
    } finally { setActionBusy(null) }
  }, [editRow, refresh, showToast])

  // status 변경 (수락/거부/만료)
  const runStatus = useCallback(async (next: 'accepted' | 'rejected' | 'expired') => {
    if (!editRow) return
    setActionBusy(next === 'accepted' ? 'accept' : next === 'rejected' ? 'reject' : 'expire')
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/long-term-quotes/${editRow.id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ status: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '상태 변경 실패')
      setEditRow(json.data as QuoteRow)
      showToast({ type: 'ok', text: `상태가 ${STATUS_META[next]?.label || next} 로 변경됐습니다` })
      refresh()
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '상태 변경 오류' })
    } finally { setActionBusy(null) }
  }, [editRow, refresh, showToast])

  // 계약 전환 (convert)
  const runConvert = useCallback(async () => {
    if (!editRow) return
    if (!confirm(`「${editRow.customer_name}」 견적을 장기렌트 계약으로 전환합니다.\n계속하시겠습니까?`)) return
    setActionBusy('convert')
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/long-term-quotes/${editRow.id}/convert`, { method: 'POST', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '계약 전환 실패')
      const rentalId = json?.data?.rental?.id
      showToast({ type: 'ok', text: `계약 전환 완료 — long_term_rentals#${String(rentalId).slice(0, 8)}` })
      setModalOpen(false); setEditRow(null); refresh()
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '계약 전환 오류' })
    } finally { setActionBusy(null) }
  }, [editRow, refresh, showToast])

  // 공유 링크 복사
  const copyShareLink = useCallback(async () => {
    if (!editRow?.share_token) return
    const url = `${window.location.origin}/public/long-term-quote/${editRow.share_token}`
    try {
      await navigator.clipboard.writeText(url)
      showToast({ type: 'ok', text: '공유 링크가 클립보드에 복사됐습니다' })
    } catch {
      // 폴백 — prompt 로 표시
      prompt('공유 링크를 복사해주세요:', url)
    }
  }, [editRow, showToast])

  // PDF (window.print — 공유 페이지 새 창에서 print 트리거)
  const openPrint = useCallback(() => {
    if (!editRow?.share_token) return
    const url = `${window.location.origin}/public/long-term-quote/${editRow.share_token}?print=1`
    window.open(url, '_blank', 'noopener')
  }, [editRow])

  const runDelete = useCallback(async () => {
    if (!delTarget) return
    setDelBusy(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/long-term-quotes/${delTarget.id}`, { method: 'DELETE', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '삭제 실패')
      setDelTarget(null)
      showToast({ type: 'ok', text: '견적 삭제 완료' })
      refresh()
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '삭제 오류' })
    } finally { setDelBusy(false) }
  }, [delTarget, refresh, showToast])

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
      (r.vehicle_spec || '').toLowerCase().includes(q) ||
      (r.quote_no || '').toLowerCase().includes(q) ||
      (r.customer_phone || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = {
    all: data.all.length,
    draft: data.draft.length,
    sent: data.sent.length,
    accepted: data.accepted.length,
    converted: data.converted.length,
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
    {
      key: 'status', label: '상태', width: 92, align: 'center',
      sortBy: (r) => r.status || '',
      render: (r) => {
        const m = STATUS_META[r.status] || { label: r.status, bg: 'rgba(148,163,184,0.15)', fg: '#475569' }
        return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: m.bg, color: m.fg }}>{m.label}</span>
      },
    },
    {
      key: 'contract_type', label: '유형', width: 70, align: 'center',
      sortBy: (r) => r.contract_type || '',
      render: (r) => {
        const isNew = r.contract_type === '신차구입'
        return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap',
          background: isNew ? 'rgba(245,158,11,0.14)' : COLORS.bgBlue,
          color: isNew ? '#b45309' : COLORS.primary }}>
          {isNew ? '🆕 신차' : '🚗 기존'}
        </span>
      },
    },
    {
      key: 'quote_no', label: '견적번호', width: 110,
      sortBy: (r) => r.quote_no || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#475569', fontWeight: 600 }}>{r.quote_no || '-'}</span>,
    },
    {
      key: 'customer', label: '고객', width: 160,
      sortBy: (r) => r.customer_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: '#1e293b' }}>{r.customer_name}</span>
        {r.customer_company ? <span style={{ color: '#94a3b8' }}> · {r.customer_company}</span> : null}
      </span>,
    },
    {
      key: 'vehicle', label: '차량/스펙', width: 200,
      sortBy: (r) => r.vehicle_car_number || r.vehicle_spec || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 200, fontSize: 12 }}>
        {r.vehicle_car_number
          ? <><span style={{ fontWeight: 800, color: '#0f2440' }}>🚗 {r.vehicle_car_number}</span>{(r.vehicle_brand || r.vehicle_model) ? <span style={{ color: '#94a3b8' }}> · {[r.vehicle_brand, r.vehicle_model].filter(Boolean).join(' ')}</span> : null}</>
          : r.vehicle_spec
            ? <span style={{ color: '#b45309', fontWeight: 600 }}>🚚 {r.vehicle_spec}</span>
            : <span style={{ color: '#cbd5e1' }}>미지정</span>}
      </span>,
    },
    {
      key: 'months', label: '기간', width: 64, align: 'center',
      sortBy: (r) => Number(r.months || 0),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: '#475569' }}>{r.months ? `${r.months}개월` : '-'}</span>,
    },
    {
      key: 'monthly_fee', label: '월 렌트료(VAT포함)', width: 130, align: 'right',
      sortBy: (r) => Number(r.monthly_fee || 0),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: '#0f2440' }}>{fmtWon(r.monthly_fee)}</span>,
    },
    {
      key: 'owner', label: '담당자', width: 90, align: 'center',
      sortBy: (r) => r.owner_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#475569' }}>{r.owner_name || '-'}</span>,
    },
    {
      key: 'sent_at', label: '발송', width: 86, align: 'center',
      sortBy: (r) => r.sent_at || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: '#94a3b8' }}>{fmtDate(r.sent_at)}</span>,
    },
    {
      key: 'views', label: '조회', width: 56, align: 'center',
      sortBy: (r) => Number(r.share_views || 0),
      render: (r) => r.share_views > 0
        ? <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: COLORS.primary }}>👁 {r.share_views}</span>
        : <span style={{ color: '#cbd5e1', fontSize: 11 }}>-</span>,
    },
    {
      key: 'actions', label: '액션', width: 80, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
          <button onClick={(e) => { e.stopPropagation(); openEdit(r) }}
            style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✎ 상세</button>
          <button onClick={(e) => { e.stopPropagation(); setDelTarget(r) }}
            style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#991b1b', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>🗑</button>
        </span>
      ),
    },
  ]

  const mobileCard: MobileCardConfig<QuoteRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>{STATUS_META[r.status]?.label || r.status} · {r.customer_name}</span>,
    subtitle: (r) => `${r.vehicle_car_number || r.vehicle_spec || '미지정'} · ${r.months || '-'}개월 · ${fmtWon(r.monthly_fee)}/월`,
  }

  const fld = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const inputStyle = { ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' } as const
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 } as const

  const shareUrl = editRow?.share_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/public/long-term-quote/${editRow.share_token}`
    : null

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
        placeholder="고객 / 차량번호 / 견적번호 검색…"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as FilterKey)}
      />
      {err && (
        <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b' }}>
          ⚠ {err} — long_term_quotes 마이그레이션이 적용됐는지 확인해주세요.
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        loading={loading}
        emptyIcon="📝"
        emptyMessage="견적이 없습니다 — 「견적 작성」으로 추가하세요"
        mobileCard={mobileCard}
        defaultSort={{ key: 'sent_at', dir: 'desc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 견적 → 발송 → 수락 → 계약 전환 시 「계약/운영」 탭의 장기렌트로 자동 등록됩니다.
      </div>

      {/* 등록/상세 모달 */}
      {modalOpen && (
        <div onClick={() => !saving && !actionBusy && setModalOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ ...GLASS.L5, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', width: 'min(720px, 96vw)', maxHeight: '92vh', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>
                📝 장기렌트 견적 {editRow ? '상세' : '작성'}
              </h3>
              {editRow && (
                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800,
                  background: STATUS_META[editRow.status]?.bg || 'rgba(148,163,184,0.15)',
                  color: STATUS_META[editRow.status]?.fg || '#475569' }}>
                  {STATUS_META[editRow.status]?.label || editRow.status}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={() => !saving && !actionBusy && setModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
              {/* 기본 정보 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>견적번호 <span style={{ color: '#cbd5e1', fontWeight: 500 }}>(선택)</span></label>
                  <input value={form.quote_no} onChange={(e) => fld('quote_no', e.target.value)} placeholder="자동" style={inputStyle} /></div>
                <div><label style={labelStyle}>계약 유형</label>
                  <select value={form.contract_type} onChange={(e) => fld('contract_type', e.target.value)} style={inputStyle}>
                    {CONTRACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select></div>
                <div><label style={labelStyle}>담당자</label>
                  <input value={form.owner_name} onChange={(e) => fld('owner_name', e.target.value)} placeholder="영업 담당자명" style={inputStyle} /></div>
              </div>

              {/* 고객 */}
              <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: `1px solid ${COLORS.borderBlue}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.primary, marginBottom: 8 }}>👤 고객 정보</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={labelStyle}>고객명 *</label>
                    <input value={form.customer_name} onChange={(e) => fld('customer_name', e.target.value)} placeholder="필수" style={inputStyle} /></div>
                  <div><label style={labelStyle}>연락처</label>
                    <input value={form.customer_phone} onChange={(e) => fld('customer_phone', e.target.value)} placeholder="010-…" style={inputStyle} /></div>
                  <div><label style={labelStyle}>이메일</label>
                    <input value={form.customer_email} onChange={(e) => fld('customer_email', e.target.value)} placeholder="선택" style={inputStyle} /></div>
                  <div><label style={labelStyle}>회사 / 소속</label>
                    <input value={form.customer_company} onChange={(e) => fld('customer_company', e.target.value)} placeholder="선택" style={inputStyle} /></div>
                </div>
              </div>

              {/* 차량 */}
              <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: '1px solid rgba(245,158,11,0.25)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309', marginBottom: 8 }}>🚗 차량 / 스펙</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={labelStyle}>
                    차량번호
                    {form.contract_type === '신차구입' && <span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>(신차는 도착 후 입력)</span>}
                  </label>
                    <input value={form.vehicle_car_number} onChange={(e) => fld('vehicle_car_number', e.target.value)} placeholder="예: 12가3456" style={inputStyle} /></div>
                  <div><label style={labelStyle}>예정 차종 / 스펙</label>
                    <input value={form.vehicle_spec} onChange={(e) => fld('vehicle_spec', e.target.value)}
                      placeholder={form.contract_type === '신차구입' ? '예: GV80 디젤 5인승 25년식' : '선택'} style={inputStyle} /></div>
                </div>
              </div>

              {/* 기간 / 금액 */}
              <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: '1px solid rgba(16,185,129,0.25)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#065f46', marginBottom: 8 }}>💰 기간 / 금액 (VAT 포함)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div><label style={labelStyle}>계약 시작일</label>
                    <input type="date" value={form.start_date} onChange={(e) => fld('start_date', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>개월수</label>
                    <input type="number" value={form.months} onChange={(e) => fld('months', e.target.value)} placeholder="36 / 48 / 60" style={inputStyle} /></div>
                  <div><label style={labelStyle}>만기일</label>
                    <input type="date" value={form.end_date} onChange={(e) => fld('end_date', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>월 렌트료 (원, VAT 포함)</label>
                    <input type="number" value={form.monthly_fee} onChange={(e) => fld('monthly_fee', e.target.value)} placeholder="예: 1200000" style={inputStyle} /></div>
                  <div><label style={labelStyle}>보증금 (원)</label>
                    <input type="number" value={form.deposit} onChange={(e) => fld('deposit', e.target.value)} placeholder="예: 5000000" style={inputStyle} /></div>
                  <div><label style={labelStyle}>선납월수</label>
                    <input type="number" value={form.upfront_months} onChange={(e) => fld('upfront_months', e.target.value)} placeholder="선택" style={inputStyle} /></div>
                  <div><label style={labelStyle}>연 주행거리</label>
                    <input type="number" value={form.annual_km} onChange={(e) => fld('annual_km', e.target.value)} placeholder="15000 / 20000" style={inputStyle} /></div>
                  <div><label style={labelStyle}>인도비 (원)</label>
                    <input type="number" value={form.delivery_fee} onChange={(e) => fld('delivery_fee', e.target.value)} placeholder="선택" style={inputStyle} /></div>
                  <div><label style={labelStyle}>보험 옵션</label>
                    <input value={form.insurance_option} onChange={(e) => fld('insurance_option', e.target.value)} placeholder="자차/대물/대인 옵션" style={inputStyle} /></div>
                </div>
              </div>

              {/* 발송 / 유효 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>유효기간</label>
                  <input type="date" value={form.valid_until} onChange={(e) => fld('valid_until', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>메모</label>
                  <input value={form.memo} onChange={(e) => fld('memo', e.target.value)} placeholder="특이사항" style={inputStyle} /></div>
              </div>

              {/* 공유 / 액션 영역 (editRow 있을 때만) */}
              {editRow && shareUrl && (
                <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: `1px solid ${COLORS.borderBlue}` }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.primary, marginBottom: 8 }}>🔗 공유 링크</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input readOnly value={shareUrl} style={{ ...inputStyle, fontSize: 11, color: '#475569' }} onFocus={(e) => e.currentTarget.select()} />
                    <button onClick={copyShareLink}
                      style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>📋 복사</button>
                    <button onClick={openPrint}
                      style={{ ...GLASS.L3, padding: '9px 14px', borderRadius: 8, color: '#475569', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>🖨 PDF</button>
                  </div>
                  {editRow.share_views > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                      👁 조회 {editRow.share_views}회 · 최근 {fmtDate(editRow.share_last_viewed_at)}
                    </div>
                  )}
                </div>
              )}

              {modalMsg && <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>⚠️ {modalMsg}</div>}
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: '1px solid rgba(0,0,0,0.06)', flexWrap: 'wrap' }}>
              <button onClick={() => !saving && !actionBusy && setModalOpen(false)}
                style={{ padding: '9px 16px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>닫기</button>
              <div style={{ flex: 1 }} />
              {editRow && editRow.status !== 'converted' && (
                <>
                  {editRow.status === 'sent' && (
                    <>
                      <button onClick={() => runStatus('rejected')} disabled={!!actionBusy}
                        style={{ padding: '9px 14px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12, color: '#991b1b' }}>✗ 거부</button>
                      <button onClick={() => runStatus('accepted')} disabled={!!actionBusy}
                        style={{ padding: '9px 14px', background: 'rgba(16,185,129,0.12)', color: '#065f46', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12 }}>✅ 수락</button>
                    </>
                  )}
                  {(editRow.status === 'draft' || editRow.status === 'sent') && (
                    <button onClick={runSend} disabled={!!actionBusy}
                      style={{ padding: '9px 14px', background: 'rgba(124,58,237,0.12)', color: '#5b21b6', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12 }}>
                      {actionBusy === 'send' ? '발송 중…' : editRow.status === 'sent' ? '🔄 재발송' : '📤 발송'}
                    </button>
                  )}
                  {editRow.status === 'accepted' && (
                    <button onClick={runConvert} disabled={!!actionBusy}
                      style={{ padding: '9px 14px', background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', color: '#fff', border: 'none', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}>
                      {actionBusy === 'convert' ? '전환 중…' : '🔗 계약 전환'}
                    </button>
                  )}
                </>
              )}
              <button onClick={save} disabled={saving || !!actionBusy}
                style={{ padding: '9px 20px', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', border: 'none', borderRadius: 8, cursor: (saving || actionBusy) ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: (saving || actionBusy) ? 0.5 : 1 }}>
                {saving ? '저장 중…' : editRow ? '✎ 수정 저장' : '➕ 견적 등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 */}
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

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// /long-term-rentals — 장기렌트 관리 (PR-L1)
//
// 사용자 명시: 장기렌트 나간 차량이 operations 「사용가능」 에 잘못 떠 —
//   별도 구현. 대차(operations)와 분리된 장기 계약 원장.
//   1차 범위: 차량·고객·기간·월렌트료 등록 + 목록 (만기·월청구는 2차)
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type Row = {
  id: string
  vehicle_id: string | null
  vehicle_car_number: string | null
  vehicle_brand: string | null
  vehicle_model: string | null
  customer_name: string | null
  customer_phone: string | null
  contract_no: string | null
  start_date: string | null
  end_date: string | null
  monthly_fee: number | null
  deposit: number | null
  status: string | null
  notes: string | null
}

type FilterKey = 'all' | 'active' | 'expiring' | 'ended'

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  active:     { label: '🔵 계약중', bg: COLORS.bgBlue,            fg: COLORS.primary },
  expired:    { label: '⏳ 만기',   bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
  terminated: { label: '✗ 해지',   bg: 'rgba(239,68,68,0.12)',   fg: '#991b1b' },
}
const STATUS_OPTIONS = [
  { value: 'active', label: '계약중' },
  { value: 'expired', label: '만기' },
  { value: 'terminated', label: '해지' },
]

function fmtWon(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${Number(n).toLocaleString('ko-KR')}원`
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return '-'
  return String(s).slice(0, 10)
}
function daysUntil(end: string | null | undefined): number | null {
  if (!end) return null
  const e = new Date(String(end).slice(0, 10))
  if (isNaN(e.getTime())) return null
  return Math.ceil((e.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

const emptyForm = {
  vehicle_car_number: '', customer_name: '', customer_phone: '', contract_no: '',
  start_date: '', end_date: '', monthly_fee: '', deposit: '', status: 'active', notes: '',
}

export default function LongTermRentalsPage() {
  const [filter, setFilter] = useState<FilterKey>('active')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 등록/수정 모달
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [modalMsg, setModalMsg] = useState<string | null>(null)

  // 삭제 확인
  const [delTarget, setDelTarget] = useState<Row | null>(null)
  const [delBusy, setDelBusy] = useState(false)

  // 결과 토스트
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showToast = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setToast(m)
    setTimeout(() => setToast(null), 4500)
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/long-term-rentals?status=all', { headers })
      const json = await res.json().catch(() => ({}))
      if (Array.isArray(json?.data)) setRows(json.data as Row[])
      else { setRows([]); if (json?.error) setErr(json.error) }
    } catch (e: any) {
      setRows([]); setErr(e?.message || 'fetch 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (rows === null && !loading) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(() => { setRows(null); fetchAll() }, [fetchAll])

  const openCreate = useCallback(() => {
    setEditId(null); setForm({ ...emptyForm }); setModalMsg(null); setModalOpen(true)
  }, [])
  const openEdit = useCallback((r: Row) => {
    setEditId(r.id)
    setForm({
      vehicle_car_number: r.vehicle_car_number || '',
      customer_name: r.customer_name || '',
      customer_phone: r.customer_phone || '',
      contract_no: r.contract_no || '',
      start_date: r.start_date ? String(r.start_date).slice(0, 10) : '',
      end_date: r.end_date ? String(r.end_date).slice(0, 10) : '',
      monthly_fee: r.monthly_fee != null ? String(r.monthly_fee) : '',
      deposit: r.deposit != null ? String(r.deposit) : '',
      status: r.status || 'active',
      notes: r.notes || '',
    })
    setModalMsg(null); setModalOpen(true)
  }, [])

  const save = useCallback(async () => {
    if (!form.customer_name.trim()) { setModalMsg('고객명은 필수입니다'); return }
    setSaving(true); setModalMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const body = {
        vehicle_car_number: form.vehicle_car_number.trim() || null,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim() || null,
        contract_no: form.contract_no.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        monthly_fee: form.monthly_fee === '' ? null : Number(form.monthly_fee),
        deposit: form.deposit === '' ? null : Number(form.deposit),
        status: form.status,
        notes: form.notes.trim() || null,
      }
      const url = editId ? `/api/long-term-rentals/${editId}` : '/api/long-term-rentals'
      const res = await fetch(url, { method: editId ? 'PATCH' : 'POST', headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '저장 실패')
      setModalOpen(false)
      showToast({ type: 'ok', text: editId ? '장기렌트 수정 완료' : '장기렌트 등록 완료' })
      refresh()
    } catch (e: any) {
      setModalMsg(e?.message || '저장 오류')
    } finally {
      setSaving(false)
    }
  }, [form, editId, refresh, showToast])

  const runDelete = useCallback(async () => {
    if (!delTarget) return
    setDelBusy(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/long-term-rentals/${delTarget.id}`, { method: 'DELETE', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '삭제 실패')
      setDelTarget(null)
      showToast({ type: 'ok', text: '장기렌트 삭제 완료' })
      refresh()
    } catch (e: any) {
      showToast({ type: 'err', text: e?.message || '삭제 오류' })
    } finally {
      setDelBusy(false)
    }
  }, [delTarget, refresh, showToast])

  const allRows = rows || []
  const data = useMemo(() => {
    const active = allRows.filter((r) => r.status === 'active')
    return {
      all: allRows,
      active,
      expiring: active.filter((r) => { const d = daysUntil(r.end_date); return d != null && d >= 0 && d <= 30 }),
      ended: allRows.filter((r) => r.status === 'expired' || r.status === 'terminated'),
    }
  }, [allRows])

  const activeData = data[filter]
  const filtered = useMemo(() => {
    if (!search.trim()) return activeData
    const q = search.toLowerCase()
    return activeData.filter((r) =>
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.vehicle_car_number || '').toLowerCase().includes(q) ||
      (r.customer_phone || '').toLowerCase().includes(q) ||
      (r.contract_no || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = {
    all: data.all.length, active: data.active.length,
    expiring: data.expiring.length, ended: data.ended.length,
  }

  const statItems: StatItem[] = [
    { label: '📋 전체', value: counts.all, unit: '건', tint: 'blue' },
    { label: '🔵 계약중', value: counts.active, unit: '건', tint: 'green' },
    { label: '⏳ 만기임박 (30일)', value: counts.expiring, unit: '건', tint: 'amber' },
    { label: '✗ 만기·해지', value: counts.ended, unit: '건', tint: 'red' },
    { label: '🔍 검색결과', value: filtered.length, unit: '건', tint: 'purple' },
  ]
  const statActions: ActionButton[] = [
    { label: '장기렌트 등록', onClick: openCreate, variant: 'primary', icon: '➕' },
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'active', label: '🔵 계약중', count: counts.active },
    { key: 'expiring', label: '⏳ 만기임박', count: counts.expiring },
    { key: 'ended', label: '✗ 만기·해지', count: counts.ended },
    { key: 'all', label: '📋 전체', count: counts.all },
  ]

  const columns: TableColumn<Row>[] = [
    {
      key: 'vehicle', label: '차량', width: 150,
      sortBy: (r) => r.vehicle_car_number || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 150, fontSize: 12 }}>
        {r.vehicle_car_number
          ? <><span style={{ fontWeight: 800, color: '#0f2440' }}>🚗 {r.vehicle_car_number}</span>{(r.vehicle_brand || r.vehicle_model) ? <span style={{ color: '#94a3b8' }}> · {[r.vehicle_brand, r.vehicle_model].filter(Boolean).join(' ')}</span> : null}</>
          : <span style={{ color: '#cbd5e1' }}>미지정</span>}
      </span>,
    },
    {
      key: 'customer', label: '고객', width: 160,
      sortBy: (r) => r.customer_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: '#1e293b' }}>{r.customer_name || '-'}</span>
        {r.customer_phone ? <span style={{ color: '#94a3b8' }}> · {r.customer_phone}</span> : null}
      </span>,
    },
    {
      key: 'period', label: '계약기간', width: 186,
      sortBy: (r) => r.end_date || '9999',
      render: (r) => {
        const d = daysUntil(r.end_date)
        const soon = r.status === 'active' && d != null && d >= 0 && d <= 30
        return <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: soon ? '#b45309' : '#475569', fontWeight: soon ? 800 : 600 }}>
          {fmtDate(r.start_date)} ~ {fmtDate(r.end_date)}
          {soon ? <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 800 }}>D-{d}</span> : null}
        </span>
      },
    },
    {
      key: 'monthly_fee', label: '월 렌트료', width: 110, align: 'right',
      sortBy: (r) => Number(r.monthly_fee || 0),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: '#0f2440' }}>{fmtWon(r.monthly_fee)}</span>,
    },
    {
      key: 'deposit', label: '보증금', width: 104, align: 'right',
      sortBy: (r) => Number(r.deposit || 0),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#475569' }}>{fmtWon(r.deposit)}</span>,
    },
    {
      key: 'status', label: '상태', width: 96, align: 'center',
      sortBy: (r) => r.status || '',
      render: (r) => {
        const m = STATUS_META[r.status || ''] || { label: r.status || '-', bg: 'rgba(148,163,184,0.15)', fg: '#475569' }
        return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: m.bg, color: m.fg }}>{m.label}</span>
      },
    },
    {
      key: 'actions', label: '액션', width: 116, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
          <button onClick={(e) => { e.stopPropagation(); openEdit(r) }}
            style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✎ 수정</button>
          <button onClick={(e) => { e.stopPropagation(); setDelTarget(r) }}
            style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#991b1b', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>🗑</button>
        </span>
      ),
    },
  ]

  const mobileCard: MobileCardConfig<Row> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.vehicle_car_number || r.customer_name || r.id.slice(0, 8)}</span>,
    subtitle: (r) => `${STATUS_META[r.status || '']?.label || r.status || ''} · ${r.customer_name || ''} · ${fmtWon(r.monthly_fee)}/월`,
  }

  const fld = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const inputStyle = { ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' } as const
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 } as const

  return (
    <div className="page-bg">
      <div className="max-w-[1800px] mx-auto py-4 px-4 md:py-5 md:px-6">
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
          placeholder="고객 / 차량번호 / 연락처 / 계약번호 검색…"
          filters={filterItems}
          activeFilter={filter}
          onFilterChange={(k) => setFilter(k as FilterKey)}
        />
        {err && (
          <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b' }}>
            ⚠ {err} {' '}— long_term_rentals 마이그레이션이 적용됐는지 확인해주세요.
          </div>
        )}
        <NeuDataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          onRowClick={openEdit}
          loading={loading}
          emptyIcon="🔑"
          emptyMessage="장기렌트 계약이 없습니다 — 「장기렌트 등록」으로 추가하세요"
          mobileCard={mobileCard}
          defaultSort={{ key: 'period', dir: 'asc' }}
        />
        <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
          💡 장기렌트는 사고 대차와 별개 계약입니다. 여기 등록된 계약중 차량은 대차업무 「사용가능」에서 자동 제외됩니다.
        </div>

        {/* 등록/수정 모달 */}
        {modalOpen && (
          <div onClick={() => !saving && setModalOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ ...GLASS.L5, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', width: 'min(560px, 96vw)', maxHeight: '88vh', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>🔑 장기렌트 {editId ? '수정' : '등록'}</h3>
                <div style={{ flex: 1 }} />
                <button onClick={() => !saving && setModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={labelStyle}>차량번호</label>
                    <input value={form.vehicle_car_number} onChange={(e) => fld('vehicle_car_number', e.target.value)} placeholder="예: 12가3456" style={inputStyle} /></div>
                  <div><label style={labelStyle}>계약번호</label>
                    <input value={form.contract_no} onChange={(e) => fld('contract_no', e.target.value)} placeholder="선택" style={inputStyle} /></div>
                  <div><label style={labelStyle}>고객명 *</label>
                    <input value={form.customer_name} onChange={(e) => fld('customer_name', e.target.value)} placeholder="필수" style={inputStyle} /></div>
                  <div><label style={labelStyle}>연락처</label>
                    <input value={form.customer_phone} onChange={(e) => fld('customer_phone', e.target.value)} placeholder="010-…" style={inputStyle} /></div>
                  <div><label style={labelStyle}>계약 시작일</label>
                    <input type="date" value={form.start_date} onChange={(e) => fld('start_date', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>만기일</label>
                    <input type="date" value={form.end_date} onChange={(e) => fld('end_date', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>월 렌트료 (원)</label>
                    <input type="number" value={form.monthly_fee} onChange={(e) => fld('monthly_fee', e.target.value)} placeholder="예: 700000" style={inputStyle} /></div>
                  <div><label style={labelStyle}>보증금 (원)</label>
                    <input type="number" value={form.deposit} onChange={(e) => fld('deposit', e.target.value)} placeholder="예: 3000000" style={inputStyle} /></div>
                </div>
                <div><label style={labelStyle}>상태</label>
                  <select value={form.status} onChange={(e) => fld('status', e.target.value)} style={inputStyle}>
                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select></div>
                <div><label style={labelStyle}>메모</label>
                  <textarea value={form.notes} onChange={(e) => fld('notes', e.target.value)} rows={2} placeholder="특이사항"
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} /></div>
                {modalMsg && <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>⚠️ {modalMsg}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <button onClick={() => !saving && setModalOpen(false)}
                  style={{ padding: '9px 16px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>닫기</button>
                <div style={{ flex: 1 }} />
                <button onClick={save} disabled={saving}
                  style={{ padding: '9px 20px', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: saving ? 0.5 : 1 }}>
                  {saving ? '저장 중…' : editId ? '✎ 수정 저장' : '➕ 등록'}
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
                <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>🗑 장기렌트 삭제</h3>
                <div style={{ ...GLASS.L1, marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#1e293b' }}>
                  🚗 {delTarget.vehicle_car_number || '미지정'} · {delTarget.customer_name || '-'}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#991b1b' }}>이 장기렌트 계약을 삭제합니다. 되돌릴 수 없습니다.</div>
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
      </div>
    </div>
  )
}

'use client'

// ═══════════════════════════════════════════════════════════════
// 과태료·미납 관리 (2026-08-08 사용자 요청)
// 운행 중/반납 후 과태료·통행료 미납 고지 등록 → 당시 고객 자동 매칭 → 청구·납부 추적
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import DcStatStrip from '@/app/components/DcStatStrip'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'

const nf = (n: number) => (Number(n) || 0).toLocaleString()

const VTYPES = ['주정차위반', '속도위반', '신호위반', '통행료미납', '기타']
const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  open:          { label: '미처리', bg: 'rgba(254,202,202,0.5)', color: '#dc2626' },
  billed:        { label: '고객청구', bg: 'rgba(253,230,138,0.5)', color: '#b45309' },
  customer_paid: { label: '고객납부', bg: 'rgba(167,243,208,0.5)', color: '#059669' },
  company_paid:  { label: '회사부담', bg: 'rgba(221,214,254,0.7)', color: '#6d28d9' },
  dispute:       { label: '이의신청', bg: 'rgba(191,219,254,0.6)', color: '#2563eb' },
}

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700 }
const td: React.CSSProperties = { padding: '9px 12px', color: '#1e293b' }
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid #e6e8ec', fontSize: 12,
  background: '#fff', color: '#1e293b', outline: 'none',
}

export default function ViolationsPage() {
  const [rows, setRows] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [cars, setCars] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const emptyForm = {
    car_number: '', violation_at: '', vtype: '주정차위반', amount: '',
    notice_no: '', agency: '', due_date: '', customer_name: '', customer_phone: '', memo: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (statusFilter) p.set('status', statusFilter)
      if (q) p.set('q', q)
      const { ok, json } = await fetchWithAuth(`/api/violations?${p}`)
      if (ok) { setRows(json.rows || []); setSummary(json.summary || null) }
    } finally { setLoading(false) }
  }, [statusFilter, q])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetchWithAuth('/api/cars/ledger').then(({ ok, json }) => {
      if (ok) setCars((json.rows || json.cars || []).map((c: any) => c.number).filter(Boolean))
    }).catch(() => {})
  }, [])

  const save = async () => {
    if (!form.car_number || !form.violation_at) { alert('차량번호와 위반 일시를 입력하세요'); return }
    setSaving(true)
    try {
      if (editingId) {
        await fetchWithAuth('/api/violations', { method: 'PATCH', body: { id: editingId, ...form, violation_at: form.violation_at.replace('T', ' ') } })
      } else {
        const { json } = await fetchWithAuth('/api/violations', { method: 'POST', body: form })
        if (json.matched) alert(`당시 운행 고객 자동 매칭: ${json.matched.name} (${json.matched.source === 'fmi_rental' ? '단기 배차' : '장기계약'})`)
        else if (!form.customer_name) alert('해당 일시에 운행 기록이 없습니다 — 고객을 직접 입력해주세요 (수정 버튼)')
      }
      setShowAdd(false); setForm(emptyForm); setEditingId(null)
      load()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ padding: 20, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a1d23' }}>과태료·미납</h1>
        <span style={{ fontSize: 12, color: '#9aa1ad' }}>등록하면 당시 운행 고객이 자동 매칭됩니다 (단기 배차 → 장기계약 순)</span>
      </div>

      <DcStatStrip fullWidth stats={[
        { label: '미처리', value: nf(summary?.open?.cnt || 0), unit: '건', subValue: `${nf(summary?.open?.amt || 0)}원`, tint: 'red' as const, icon: '🚨', onClick: () => setStatusFilter('open'), active: statusFilter === 'open' },
        { label: '고객청구 중', value: nf(summary?.billed?.cnt || 0), unit: '건', subValue: `${nf(summary?.billed?.amt || 0)}원`, tint: 'amber' as const, icon: '📤', onClick: () => setStatusFilter('billed'), active: statusFilter === 'billed' },
        { label: '처리완료', value: nf(summary?.done || 0), unit: '건', tint: 'green' as const, icon: '✅', onClick: () => setStatusFilter(''), active: statusFilter === '' },
        { label: '회사부담 누계', value: nf(summary?.companyAmt || 0), unit: '원', tint: 'violet' as const, icon: '🏢' },
      ]} />

      <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        {['', 'open', 'billed', 'customer_paid', 'company_paid', 'dispute'].map(s => (
          <button key={s || 'all'} onClick={() => setStatusFilter(s)} style={{
            padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: `1px solid ${statusFilter === s ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
            background: statusFilter === s ? 'rgba(191,219,254,0.6)' : '#ffffff', color: '#1e293b',
          }}>{s === '' ? '전체' : STATUS[s].label}</button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="차량·고객·고지번호 검색" style={{ ...inputStyle, width: 190 }} />
        <span style={{ flex: 1 }} />
        <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowAdd(v => !v) }}
          style={{ ...BTN.sm, background: showAdd ? '#f1f5f9' : COLORS.primary, color: showAdd ? '#5b626e' : '#fff', border: 'none', padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
          {showAdd ? '닫기' : '＋ 고지 등록'}
        </button>
      </div>

      {showAdd && (
        <div style={{ ...GLASS.L4, borderRadius: 14, padding: 16, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>차량번호 *</div>
            <input list="vv-cars" style={{ ...inputStyle, width: 110 }} value={form.car_number} onChange={e => setForm(f => ({ ...f, car_number: e.target.value }))} />
            <datalist id="vv-cars">{cars.map((c: string) => <option key={c} value={c} />)}</datalist></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>위반 일시 *</div>
            <input type="datetime-local" style={{ ...inputStyle, width: 180 }} value={form.violation_at} onChange={e => setForm(f => ({ ...f, violation_at: e.target.value }))} /></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>유형</div>
            <select style={{ ...inputStyle, width: 110 }} value={form.vtype} onChange={e => setForm(f => ({ ...f, vtype: e.target.value }))}>
              {VTYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>금액</div>
            <input type="number" style={{ ...inputStyle, width: 90, textAlign: 'right' }} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>고지번호</div>
            <input style={{ ...inputStyle, width: 130 }} value={form.notice_no} onChange={e => setForm(f => ({ ...f, notice_no: e.target.value }))} /></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>부과기관</div>
            <input style={{ ...inputStyle, width: 110 }} value={form.agency} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))} placeholder="강동구청" /></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>납부기한</div>
            <input type="date" style={{ ...inputStyle, width: 130 }} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>고객 (비우면 자동 매칭)</div>
            <input style={{ ...inputStyle, width: 100 }} value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} /></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>메모</div>
            <input style={{ ...inputStyle, width: 150 }} value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} /></div>
          <button onClick={save} disabled={saving}
            style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', padding: '8px 18px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? '저장 중...' : editingId ? '수정 저장' : '등록'}
          </button>
        </div>
      )}

      <div style={{ ...GLASS.L4, borderRadius: 16, overflow: 'auto', boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(241,245,249,0.6)', color: '#475569', textAlign: 'left' }}>
              <th style={th}>위반 일시</th><th style={th}>차량</th><th style={th}>유형</th>
              <th style={{ ...th, textAlign: 'right' }}>금액</th>
              <th style={th}>고객 (당시 운행)</th><th style={th}>고지번호</th><th style={th}>부과기관</th>
              <th style={th}>납기</th><th style={th}>상태</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>불러오는 중...</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>
                등록된 건이 없습니다. 고지서가 오면 「＋ 고지 등록」으로 시작하세요.
              </td></tr>
            )}
            {rows.map(r => {
              const overdue = r.due_date && r.status === 'open' && new Date(r.due_date) < new Date()
              return (
                <tr key={r.id} style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{String(r.violation_at).slice(0, 16).replace('T', ' ')}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.car_number}</td>
                  <td style={td}>{r.vtype}</td>
                  <td style={{ ...num, fontWeight: 700 }}>{nf(r.amount)}</td>
                  <td style={td}>
                    {r.customer_name ? (
                      <>
                        <b>{r.customer_name}</b>
                        {r.customer_phone && <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 5 }}>{r.customer_phone}</span>}
                        {r.matched_source && r.matched_source !== 'manual' && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: 'rgba(167,243,208,0.4)', borderRadius: 5, padding: '1px 6px', marginLeft: 5 }}>
                            {r.matched_source === 'fmi_rental' ? '배차 매칭' : '장기 매칭'}
                          </span>
                        )}
                      </>
                    ) : (
                      <button onClick={async () => {
                        const { json } = await fetchWithAuth('/api/violations', { method: 'PATCH', body: { id: r.id, action: 'rematch' } })
                        alert(json.matched ? `매칭: ${json.matched.name}` : '해당 일시 운행 기록 없음 — 수정에서 직접 입력해주세요')
                        load()
                      }} style={{ ...BTN.sm, padding: '3px 9px', fontSize: 11, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}>
                        🔍 고객 찾기
                      </button>
                    )}
                  </td>
                  <td style={{ ...td, fontSize: 11, color: '#64748b' }}>{r.notice_no || '—'}</td>
                  <td style={td}>{r.agency || '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', color: overdue ? '#dc2626' : '#64748b', fontWeight: overdue ? 800 : 400 }}>
                    {r.due_date ? String(r.due_date).slice(0, 10) : '—'}{overdue ? ' ⚠' : ''}
                  </td>
                  <td style={td}>
                    <select value={r.status} onChange={async e => {
                      await fetchWithAuth('/api/violations', { method: 'PATCH', body: { id: r.id, status: e.target.value } })
                      load()
                    }} style={{ ...inputStyle, padding: '4px 6px', fontSize: 11, background: STATUS[r.status]?.bg, color: STATUS[r.status]?.color, fontWeight: 700, border: 'none' }}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => {
                      setEditingId(r.id)
                      setForm({
                        car_number: r.car_number, violation_at: String(r.violation_at).slice(0, 16).replace(' ', 'T'),
                        vtype: r.vtype, amount: String(r.amount), notice_no: r.notice_no || '', agency: r.agency || '',
                        due_date: r.due_date ? String(r.due_date).slice(0, 10) : '',
                        customer_name: r.customer_name || '', customer_phone: r.customer_phone || '', memo: r.memo || '',
                      })
                      setShowAdd(true)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }} style={{ ...BTN.sm, padding: '3px 8px', fontSize: 11, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}>수정</button>
                    <button onClick={async () => {
                      if (!confirm('이 건을 삭제할까요?')) return
                      await fetchWithAuth(`/api/violations?id=${r.id}`, { method: 'DELETE' })
                      load()
                    }} style={{ ...BTN.sm, padding: '3px 8px', fontSize: 11, background: '#fff', color: COLORS.danger, border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer', marginLeft: 4 }}>삭제</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

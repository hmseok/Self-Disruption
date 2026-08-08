'use client'

// ═══════════════════════════════════════════════════════════════════
// ConsultDrawer — 상담대기 드로어 (2026-08-07)
//   "상담도 드로워로, 상세로 가지 말고" + "접수내용 많으니 2~3열 배치"
//   좌: 접수 정보 (2열 그리드) / 우: 상담 기록 (입력 + 타임라인)
//   저장: dispatch_order 없으면 자동 생성(consulting) 후 POST /api/operations/consultations
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS } from '@/app/utils/ui-tokens'

export interface ConsultTarget {
  idno: string
  mddt: string
  srno: string | number
  preview?: Record<string, any>
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

const fmtDt = (d: any) => {
  if (!d) return '-'
  const s = String(d)
  return s.includes('T') ? s.slice(0, 16).replace('T', ' ') : s.slice(0, 16)
}

const CATEGORIES = ['일반', '차량요청', '일정조율', '보험사', '고객요청', '기타']

function Field({ label, value, wide }: { label: string; value: any; wide?: boolean }) {
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1a1d23', wordBreak: 'break-all', whiteSpace: wide ? 'pre-wrap' : undefined }}>
        {value == null || value === '' ? '-' : String(value)}
      </div>
    </div>
  )
}

export default function ConsultDrawer({
  target, onClose, onChanged,
}: {
  target: ConsultTarget | null
  onClose: () => void
  onChanged?: () => void
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<any>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [memo, setMemo] = useState('')
  const [category, setCategory] = useState('일반')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!target) return
    setLoading(true); setDetail(null); setNotes([]); setOrderId(null); setMemo(''); setMsg(null)
    try {
      const headers = await getAuthHeader()
      const p = new URLSearchParams({ otptidno: target.idno, otptmddt: target.mddt, otptsrno: String(target.srno) })
      const [dRes, oRes] = await Promise.all([
        fetch(`/api/operations/cafe24-dispatch-requests?${p}`, { headers }).catch(() => null),
        fetch(`/api/operations/dispatch-orders?cafe24_otpt_idno=${encodeURIComponent(target.idno)}&cafe24_otpt_mddt=${encodeURIComponent(target.mddt)}&cafe24_otpt_srno=${encodeURIComponent(String(target.srno))}`, { headers }).catch(() => null),
      ])
      if (dRes?.ok) {
        const j = await dRes.json()
        const rows = j.rows || j.data || []
        setDetail(Array.isArray(rows) ? rows[0] || null : rows)
      }
      let oid: string | null = null
      if (oRes?.ok) {
        const j = await oRes.json()
        const rows = j.rows || j.data || []
        oid = (Array.isArray(rows) ? rows[0]?.id : rows?.id) || null
        setOrderId(oid)
      }
      if (oid) {
        const cRes = await fetch(`/api/operations/consultations?dispatch_order_id=${oid}`, { headers }).catch(() => null)
        if (cRes?.ok) {
          const j = await cRes.json()
          setNotes(j.rows || j.data || [])
        }
      }
    } finally { setLoading(false) }
  }, [target])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!target) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [target, onClose])

  const saveMemo = async () => {
    if (!target || !memo.trim()) return
    setSaving(true); setMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      // 상담 기록은 dispatch_order 에 붙음 — 없으면 상담중 상태로 먼저 생성
      let oid = orderId
      if (!oid) {
        const res = await fetch('/api/operations/dispatch-orders', {
          method: 'POST', headers,
          body: JSON.stringify({
            status: 'consulting',
            cafe24_otpt_idno: target.idno,
            cafe24_otpt_mddt: target.mddt,
            cafe24_otpt_srno: typeof target.srno === 'string' ? parseInt(target.srno, 10) : target.srno,
          }),
        })
        const j = await res.json().catch(() => ({}))
        oid = j.id || j.row?.id || null
        if (oid) setOrderId(oid)
      }
      if (!oid) { setMsg({ ok: false, text: '상담 건 생성에 실패했습니다' }); return }

      const res = await fetch('/api/operations/consultations', {
        method: 'POST', headers,
        body: JSON.stringify({ dispatch_order_id: oid, note: memo.trim(), category }),
      })
      const j = await res.json().catch(() => ({}))
      if (j?.error) { setMsg({ ok: false, text: j.error }); return }
      setMemo('')
      setMsg({ ok: true, text: '상담 기록이 저장되었습니다' })
      load()
      onChanged?.()
    } catch {
      setMsg({ ok: false, text: '네트워크 오류' })
    } finally { setSaving(false) }
  }

  if (!target) return null
  const d = { ...(target.preview || {}), ...(detail || {}) }
  const detailUrl = `/operations/dispatch/${target.idno}/${target.mddt}/${target.srno}?mode=schedule`

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 90 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 920, maxWidth: '100vw', zIndex: 91,
        background: '#fff', boxShadow: '-8px 0 32px rgba(16,24,40,0.16)', display: 'flex', flexDirection: 'column',
      }}>
        {/* 헤더 */}
        <div style={{ padding: '15px 22px', borderBottom: '1px solid #f0f1f4', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>📞 상담대기</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1d23', marginTop: 2 }}>
              {d.otptcanm || '고객 미상'}
              <span style={{ fontSize: 13, fontWeight: 600, color: '#5b626e', marginLeft: 10 }}>{d.otptcahp || ''}</span>
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <button onClick={() => router.push(detailUrl)}
            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            🚗 배차 진행
          </button>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* 본문 — 좌: 접수 정보(2열) / 우: 상담 기록 */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 0 }}>
          {/* 좌 */}
          <div style={{ padding: '18px 20px', borderRight: '1px solid #f0f1f4', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {loading && <div style={{ color: '#94a3b8', fontSize: 13 }}>불러오는 중...</div>}

            <div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#334155', marginBottom: 10 }}>사고 · 접수</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px 16px' }}>
                <Field label="사고차량" value={d.cars_no} />
                <Field label="차종" value={d.cars_name || d.cars_model} />
                <Field label="보험사" value={d.otpttobm} />
                <Field label="대물접수번호" value={d.otpttobn} />
                <Field label="접수일시" value={fmtDt(d.otptrgdt || d.otptmddt)} />
                <Field label="접수번호" value={`${target.idno} / ${target.srno}`} />
                <Field label="사고일시" value={fmtDt(d.otptacdt)} />
                <Field label="정비공장" value={d.otptfcnm || d.factory_name} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#334155', marginBottom: 10 }}>고객</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px 16px' }}>
                <Field label="고객명" value={d.otptcanm} />
                <Field label="연락처" value={d.otptcahp} />
                <Field label="차주" value={d.cars_user} />
                <Field label="요청 차종" value={d.otptrqcr || d.request_car} />
                <Field label="접수 메모" value={d.otptcarm} wide />
              </div>
            </div>
          </div>

          {/* 우 */}
          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, background: '#fafbfc' }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#334155' }}>상담 기록</div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)} style={{
                  padding: '4px 11px', borderRadius: 14, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${category === c ? COLORS.primary : '#e6e8ec'}`,
                  background: category === c ? COLORS.primary : '#fff',
                  color: category === c ? '#fff' : '#5b626e',
                }}>{c}</button>
              ))}
            </div>

            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={4}
              placeholder="통화 내용, 요청 차종, 일정 등"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e6e8ec', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }} />

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={saveMemo} disabled={saving || !memo.trim()}
                style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: saving || !memo.trim() ? 'not-allowed' : 'pointer', opacity: !memo.trim() ? 0.5 : 1 }}>
                {saving ? '저장 중...' : '기록 저장'}
              </button>
              {msg && <span style={{ fontSize: 11.5, fontWeight: 700, color: msg.ok ? '#059669' : '#dc2626' }}>{msg.text}</span>}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {notes.length === 0 && !loading && (
                <div style={{ fontSize: 12, color: '#94a3b8', padding: '14px 0' }}>아직 상담 기록이 없습니다.</div>
              )}
              {notes.map((n, i) => (
                <div key={n.id || i} style={{ background: '#fff', border: '1px solid #eef0f3', borderRadius: 10, padding: '10px 12px' }}>
                  {n.category && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#2563eb', background: '#eff4ff', borderRadius: 5, padding: '1px 7px', marginRight: 6 }}>{n.category}</span>
                  )}
                  <span style={{ fontSize: 12.5, color: '#1a1d23', whiteSpace: 'pre-wrap' }}>{n.note || n.content || ''}</span>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>
                    {n.created_by_name || n.author_name || ''} {fmtDt(n.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

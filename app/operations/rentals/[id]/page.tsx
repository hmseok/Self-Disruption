'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getAuthHeader } from '@/app/utils/auth-client'
import ConsultationTimeline from '../../ConsultationTimeline'

// ═══════════════════════════════════════════════════════════════════
// /operations/rentals/[id] — 배차(대차) 상세·편집 (PR-V2)
//   모달 대신 상세 페이지에서 모든 필드 보기·수정 (고객·차량·사고·보험·배차·청구·부가세·영업지원)
// ═══════════════════════════════════════════════════════════════════

const STATUSES = ['request', 'consulting', 'new', 'pending', 'dispatched', 'returned', 'claiming', 'settled']
const STATUS_LABEL: Record<string, string> = {
  request: '대차요청', consulting: '상담중', new: '신규', pending: '배차예정',
  dispatched: '배차완료', returned: '회차완료', claiming: '청구중', settled: '정산완료',
}

const b01 = (x: any) => (x === true || x === 1 || x === '1')
const d10 = (x: any) => (x ? String(x).slice(0, 10) : '')

export default function RentalDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const [f, setF] = useState<any>(null)
  // 복귀 탭 — 진입 시 ?from= 으로 전달 (배차중/반납·청구), 없으면 claims
  const [fromTab] = useState<string>(() => {
    if (typeof window === 'undefined') return 'claims'
    const t = new URLSearchParams(window.location.search).get('from')
    return t && ['intake', 'available', 'dispatched', 'claims'].includes(t) ? t : 'claims'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/fmi-rentals/${id}`, { headers })
      const json = await res.json().catch(() => ({}))
      if (json?.data) setF(json.data)
      else setMsg({ type: 'err', text: json?.error || '불러오기 실패' })
    } catch (e: any) { setMsg({ type: 'err', text: e?.message || '오류' }) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { if (id) load() }, [id, load])

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  const save = useCallback(async () => {
    if (!f) return
    setSaving(true); setMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const body: any = {}
      const fields = ['customer_name', 'customer_phone', 'customer_birth', 'vehicle_car_number', 'vehicle_car_type',
        'customer_car_number', 'customer_car_type', 'insurance_company', 'insurance_claim_no', 'adjuster_name', 'adjuster_phone',
        'dispatch_location', 'repair_factory', 'dispatch_date', 'expected_return_date', 'actual_return_date',
        'claim_type', 'final_claim_amount', 'fault_rate', 'claim_rate', 'payment_memo', 'status', 'dispatch_seq', 'notes', 'consultation_note',
        'sales_order', 'sales_deposit_date', 'sales_deposit_amount', 'sales_payout_rate', 'vat_invoice_date', 'vat_paid_date']
      for (const k of fields) if (f[k] !== undefined) body[k] = f[k] === '' ? null : f[k]
      for (const k of ['self_vehicle_yn', 'vat_incl_yn', 'vat_invoice_issued_yn', 'vat_billed_yn', 'vat_paid_yn', 'sales_support_yn'])
        body[k] = b01(f[k]) ? 1 : 0
      const res = await fetch(`/api/fmi-rentals/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (json?.error) throw new Error(json.error)
      if (json?.data) setF(json.data)
      setMsg({ type: 'ok', text: '저장됨' })
    } catch (e: any) { setMsg({ type: 'err', text: e?.message || '저장 실패' }) }
    finally { setSaving(false) }
  }, [f, id])

  if (loading) return <div className="page-bg"><div style={{ padding: 40, color: '#64748b' }}>불러오는 중…</div></div>
  if (!f) return <div className="page-bg"><div style={{ padding: 40, color: '#991b1b' }}>{msg?.text || '없음'}</div></div>

  const inp = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, color: '#1e293b', background: '#fff' } as const
  const lab = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5 } as const
  const card = { background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, padding: 16, marginBottom: 14 } as const
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 } as const
  const Field = ({ k, label, type = 'text', wide = false }: any) => (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label style={lab}>{label}</label>
      <input type={type} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} style={inp} />
    </div>
  )
  const Chk = ({ k, label }: any) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
      <input type="checkbox" checked={b01(f[k])} onChange={(e) => set(k, e.target.checked ? 1 : 0)} style={{ width: 16, height: 16, accentColor: '#3b6eb5', cursor: 'pointer' }} />
      {label}
    </label>
  )

  const claim = Number(f.final_claim_amount) || 0
  const supply = b01(f.vat_incl_yn) ? Math.round(claim / 1.1) : claim
  const vat = b01(f.vat_incl_yn) ? (claim - supply) : Math.round(claim * 0.1)

  return (
    <div className="page-bg">
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '18px 16px 60px' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => router.push(`/operations?tab=${fromTab}`)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>← 목록</button>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f2440' }}>🚗 {f.vehicle_car_number} <span style={{ fontSize: 13, color: '#94a3b8' }}>↔ 사고 {f.customer_car_number || '-'}</span></div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: 'rgba(59,110,181,0.1)', padding: '3px 10px', borderRadius: 20 }}>{STATUS_LABEL[f.status] || f.status}</div>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{f.rental_no}</span>
          <div style={{ flex: 1 }} />
          <button onClick={save} disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontWeight: 800, fontSize: 13, opacity: saving ? 0.5 : 1 }}>{saving ? '저장 중…' : '💾 저장'}</button>
        </div>
        {msg && <div style={{ fontSize: 12, fontWeight: 700, color: msg.type === 'ok' ? '#15803d' : '#991b1b', marginBottom: 12 }}>{msg.type === 'ok' ? '✅' : '⚠️'} {msg.text}</div>}

        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', marginBottom: 12 }}>👤 고객 정보</div>
          <div style={grid}>
            <Field k="customer_name" label="고객명" />
            <Field k="customer_phone" label="연락처" />
            <Field k="customer_birth" label="생년월일" />
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#b45309', marginBottom: 12 }}>🚗 차량 / 사고</div>
          <div style={grid}>
            <Field k="vehicle_car_number" label="대차차량(우리)" />
            <Field k="vehicle_car_type" label="대차 차종" />
            <Field k="customer_car_number" label="사고차량번호" />
            <Field k="customer_car_type" label="사고 차종" />
            <div style={{ alignSelf: 'end', paddingBottom: 8 }}><Chk k="self_vehicle_yn" label="자차" /></div>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#065f46', marginBottom: 12 }}>🛡 보험 / 담당 / 배차</div>
          <div style={grid}>
            <Field k="insurance_company" label="보험사" />
            <Field k="insurance_claim_no" label="보험 접수번호" />
            <Field k="adjuster_name" label="담당자" />
            <Field k="adjuster_phone" label="담당 연락처" />
            <Field k="repair_factory" label="입고공장" />
            <Field k="dispatch_location" label="배차 주소" wide />
            <Field k="dispatch_date" label="출고일시" type="datetime-local" />
            <Field k="expected_return_date" label="예상 반납" type="datetime-local" />
            <Field k="actual_return_date" label="실제 반납" type="datetime-local" />
            <div>
              <label style={lab}>상태</label>
              <select value={f.status || ''} onChange={(e) => set('status', e.target.value)} style={inp as any}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#4338ca', marginBottom: 12 }}>💰 청구</div>
          <div style={grid}>
            <Field k="claim_type" label="청구유형" />
            <Field k="final_claim_amount" label="최종 청구액(공급가)" type="number" />
            <Field k="fault_rate" label="과실율(%)" type="number" />
            <Field k="claim_rate" label="청구율(%)" type="number" />
            <Field k="payment_memo" label="지급 메모" wide />
          </div>
        </div>

        {/* 부가세 */}
        <div style={{ ...card, border: '1px solid rgba(59,110,181,0.25)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', marginBottom: 10 }}>🧾 부가세</div>
          <div style={{ marginBottom: 10 }}><Chk k="vat_incl_yn" label="청구액에 부가세 포함 (체크 ÷1.1 / 미체크 +10%)" /></div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ color: '#64748b' }}>공급가 <b style={{ color: '#0f2440' }}>{supply.toLocaleString('ko-KR')}원</b></span>
            <span style={{ color: '#64748b' }}>부가세 <b style={{ color: '#1d4ed8' }}>{vat.toLocaleString('ko-KR')}원</b></span>
            <span style={{ color: '#64748b' }}>합계 <b style={{ color: '#0f2440' }}>{(supply + vat).toLocaleString('ko-KR')}원</b></span>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chk k="vat_invoice_issued_yn" label="세금계산서 발행" />
            {b01(f.vat_invoice_issued_yn) && <input type="date" value={d10(f.vat_invoice_date)} onChange={(e) => set('vat_invoice_date', e.target.value)} style={{ ...inp, width: 150 }} />}
            <Chk k="vat_billed_yn" label="부가세 청구" />
            <Chk k="vat_paid_yn" label="지급(입금)" />
            {b01(f.vat_paid_yn) && <input type="date" value={d10(f.vat_paid_date)} onChange={(e) => set('vat_paid_date', e.target.value)} style={{ ...inp, width: 150 }} />}
          </div>
          {!b01(f.vat_billed_yn) && <div style={{ fontSize: 11, color: '#b45309', marginTop: 8 }}>※ 부가세 청구 미체크 — 미회수(법인 등). 회수 대상 제외</div>}
        </div>

        {/* 영업지원 */}
        <div style={{ ...card, border: '1px solid rgba(16,185,129,0.25)' }}>
          <div style={{ marginBottom: 10 }}><Chk k="sales_support_yn" label="📌 영업지원 (따봉)" /></div>
          {b01(f.sales_support_yn) && (
            <div style={grid}>
              <Field k="sales_order" label="오더" />
              <Field k="sales_deposit_date" label="입금일" type="date" />
              <Field k="sales_deposit_amount" label="입금액" type="number" />
              <Field k="sales_payout_rate" label="지급율(%)" type="number" />
            </div>
          )}
        </div>

        <div style={card}>
          <label style={lab}>💬 상담 기록</label>
          <ConsultationTimeline
            value={f.consultation_note}
            onAppend={(next) => set('consultation_note', next)}
            onRawChange={(raw) => set('consultation_note', raw)}
            pendingHint
          />
        </div>

        <div style={card}>
          <label style={lab}>메모</label>
          <textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={3} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' } as any} />
        </div>
      </div>
    </div>
  )
}

'use client'

// ═══════════════════════════════════════════════════════════════
// 차량 상세 — 4탭 재정리 (2026-08-03, 목업 cars-redesign 확정안)
//   ① 기본·서류  제원 + 보험 요약 + 서류함(등록증/보험증권/지입계약서/차량사진)
//   ② 원가·금융  취득원가 구성(인라인 편집) + 대출 + 지입 계약
//   ③ 운행·계약  배차 이력(단기) + 장기계약 + 검사/차령 일정
//   ④ 손익      기존 PnlTab 재사용
// 데이터: /api/cars/[id]/overview (1회 호출) · 편집: PATCH /api/cars/[id]
// 구 CarDetail(인라인 8탭)은 rebuild-fresh 원칙에 따라 대체 — 9단계에서 삭제.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS } from '@/app/utils/ui-tokens'
import PnlTab from './PnlTab'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

const nf = (n: any) => Number(n || 0).toLocaleString('ko-KR')
const d10 = (s: any) => (s ? String(s).slice(0, 10) : '—')
const N = (v: any) => Number(v || 0)

type Tab = 'basic' | 'finance' | 'usage' | 'pnl'

const COST_FIELDS: Array<[string, string]> = [
  ['purchase_price', '차량가'],
  ['registration_tax', '취득세'],
  ['bond_amount', '공채'],
  ['delivery_fee', '탁송비'],
  ['plate_fee', '번호판'],
  ['agency_fee', '등록대행'],
  ['other_initial_cost', '기타 초기비용'],
]

const RENTAL_STATUS: Record<string, string> = {
  dispatched: '배차중', returned: '반납', claiming: '청구중', settled: '정산완료', completed: '종결', billed: '청구',
}
const CAR_STATUS: Record<string, string> = {
  available: '대기', active: '운용중', rented: '운용중', returned: '반납/대기',
  accident: '사고', maintenance: '정비', sold: '매각',
}

export default function CarDetailV2({ carId }: { carId: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('basic')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editCost, setEditCost] = useState(false)
  const [costDraft, setCostDraft] = useState<Record<string, string>>({})
  const uploadRef = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<'registration_image_url' | 'image_url' | 'consignment_contract_url'>('registration_image_url')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/cars/${carId}/overview`, { headers })
      const json = await res.json()
      if (json?.data) setData(json.data)
    } finally { setLoading(false) }
  }, [carId])
  useEffect(() => { load() }, [load])

  const patchCar = useCallback(async (body: Record<string, any>) => {
    setBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/cars/${carId}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (json?.error) { alert(`저장 실패: ${json.error}`); return false }
      await load()
      return true
    } finally { setBusy(false) }
  }, [carId, load])

  const handleUpload = useCallback(async (file: File) => {
    setBusy(true)
    try {
      const headers = await getAuthHeader()
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'cars')
      const res = await fetch('/api/upload', { method: 'POST', headers, body: fd })
      const json = await res.json()
      if (json?.error || !json?.url) { alert(`업로드 실패: ${json?.error || 'URL 없음'}`); return }
      await patchCar({ [uploadTarget.current]: json.url })
    } finally {
      setBusy(false)
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }, [patchCar])

  const car = data?.car
  const insurance = data?.insurance || []
  const latestIns = insurance[0] || null
  const loans = data?.loans || []
  const rentals = data?.rentals || []
  const longterm = data?.longterm || []
  const isRide = car?.ownership_type === '빌려타'

  const costTotal = car ? COST_FIELDS.reduce((s, [f]) => s + N(car[f]), 0) : 0
  const insDday = latestIns?.end_date ? Math.ceil((new Date(latestIns.end_date).getTime() - Date.now()) / 86400000) : null

  // ── 공용 스타일 ──
  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12, boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden' }
  const sec: React.CSSProperties = { border: `1px solid ${COLORS.borderFaint}`, borderRadius: 10, overflow: 'hidden' }
  const sh: React.CSSProperties = { padding: '10px 14px', fontSize: 12.5, fontWeight: 700, background: '#fafbfc', borderBottom: `1px solid ${COLORS.borderFaint}`, display: 'flex', alignItems: 'center' }
  const kv: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '8px 14px', fontSize: 12.5, borderBottom: '1px solid #f8f9fb' }
  const kLabel: React.CSSProperties = { color: COLORS.textSecondary }
  const vVal: React.CSSProperties = { fontWeight: 600 }
  const actBtn: React.CSSProperties = { marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: COLORS.primary, background: 'none', border: 'none', cursor: 'pointer' }

  function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
    return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 6, background: bg, color: fg, whiteSpace: 'nowrap' }}>{label}</span>
  }

  function DocCard({ title, url, icon, onUpload }: { title: string; url: string | null; icon: string; onUpload?: () => void }) {
    return (
      <div style={{ border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 10, overflow: 'hidden', textAlign: 'center' }}>
        <div
          onClick={() => url && window.open(url, '_blank')}
          style={{ height: 84, background: 'linear-gradient(135deg,#f1f5f9,#e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, cursor: url ? 'pointer' : 'default', overflow: 'hidden' }}>
          {url && !url.endsWith('.pdf')
            ? <img src={url} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : icon}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, padding: '7px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          {title}
          {url
            ? <span style={{ color: COLORS.success, fontWeight: 700 }}>✓</span>
            : onUpload
              ? <button onClick={onUpload} style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.primary, background: 'none', border: 'none', cursor: 'pointer' }}>업로드</button>
              : <span style={{ color: COLORS.textDim }}>—</span>}
        </div>
      </div>
    )
  }

  if (loading && !data) return <div style={{ padding: 40, color: COLORS.textMuted, fontSize: 13 }}>불러오는 중...</div>
  if (!car) return <div style={{ padding: 40, color: COLORS.textMuted, fontSize: 13 }}>차량을 찾을 수 없습니다</div>

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1180, color: COLORS.textPrimary, fontSize: 14 }}>
      <button onClick={() => router.push('/cars')}
        style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSecondary, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        ← 차량 목록
      </button>

      <div style={card}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18, borderBottom: `1px solid ${COLORS.borderFaint}` }}>
          <div style={{ width: 92, height: 64, borderRadius: 9, background: 'linear-gradient(135deg,#e2e8f0,#cbd5e1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, overflow: 'hidden', flex: 'none' }}>
            {car.image_url ? <img src={car.image_url} alt="차량" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚗'}
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {car.number} · {[car.brand, car.model, car.trim].filter(Boolean).join(' ')}
            </h1>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {car.year ? `${car.year}년식` : null} {car.fuel ? `· ${car.fuel}` : null} {car.vin ? `· VIN ${String(car.vin).slice(0, 11)}***` : null}
              {isRide
                ? <Badge label="빌려타 지입" bg="#ede9fe" fg="#6d28d9" />
                : <Badge label="FMI 직영" bg="#dbeafe" fg="#1d4ed8" />}
              <Badge label={CAR_STATUS[car.status] || car.status} bg={COLORS.borderFaint} fg={COLORS.textSecondary} />
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {/* 상태 변경 (2026-08-05 사용자 요청) */}
            <select value={car.status || 'available'} disabled={busy}
              onChange={(e) => patchCar({ status: e.target.value })}
              style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`, fontSize: 12, fontWeight: 600, background: '#fff', color: COLORS.textSecondary }}>
              <option value="available">대기</option>
              <option value="rented">운용중</option>
              <option value="returned">반납/대기</option>
              <option value="maintenance">정비</option>
              <option value="accident">사고</option>
              <option value="sold">매각</option>
            </select>
            <select value={car.ownership_type || 'company'} disabled={busy}
              onChange={(e) => { if (confirm(`소속을 변경할까요? 청구·입금·손익 구분이 함께 바뀝니다.`)) patchCar({ ownership_type: e.target.value }) }}
              style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`, fontSize: 12, fontWeight: 600, background: '#fff', color: COLORS.textSecondary }}>
              <option value="company">FMI 직영</option>
              <option value="빌려타">빌려타 지입</option>
            </select>
          </div>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', padding: '0 14px', borderBottom: `1.5px solid ${COLORS.borderFaint}` }}>
          {([['basic', '① 기본·서류'], ['finance', '② 원가·금융'], ['usage', '③ 운행·계약'], ['pnl', '④ 손익']] as Array<[Tab, string]>).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{
                padding: '11px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none',
                borderBottom: '2.5px solid', marginBottom: -1.5,
                borderBottomColor: tab === k ? COLORS.primary : 'transparent',
                color: tab === k ? COLORS.primary : COLORS.textMuted,
              }}>{label}</button>
          ))}
        </div>

        <div style={{ padding: 18 }}>
          {/* ═══ ① 기본·서류 ═══ */}
          {tab === 'basic' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={sec}>
                  <div style={sh}>기본 제원</div>
                  <div style={kv}><span style={kLabel}>차량번호 / 연식</span><span style={vVal}>{car.number} · {car.year || '—'}</span></div>
                  <div style={kv}><span style={kLabel}>주행거리</span><span style={vVal}>{car.mileage ? `${nf(car.mileage)} km` : '—'}</span></div>
                  <div style={kv}><span style={kLabel}>검사 만기</span><span style={vVal}>{d10(car.inspection_end_date)}</span></div>
                  <div style={kv}><span style={kLabel}>차령 만기</span><span style={vVal}>{d10(car.vehicle_age_expiry)}</span></div>
                  <div style={kv}><span style={kLabel}>위치</span><span style={vVal}>{car.location || '—'}</span></div>
                </div>
                <div style={sec}>
                  <div style={sh}>보험 {insurance.length > 1 && <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted, marginLeft: 6 }}>이력 {insurance.length}건</span>}</div>
                  {latestIns ? (
                    <>
                      <div style={kv}><span style={kLabel}>보험사 / 증권</span><span style={vVal}>{latestIns.insurance_company || '—'} {latestIns.policy_number ? `· ${latestIns.policy_number}` : ''}</span></div>
                      <div style={kv}><span style={kLabel}>기간</span><span style={vVal}>
                        {d10(latestIns.start_date)} ~ {d10(latestIns.end_date)}
                        {insDday != null && insDday >= 0 && insDday <= 90 && <span style={{ marginLeft: 6 }}><Badge label={`D-${insDday}`} bg={COLORS.bgAmber} fg={COLORS.warning} /></span>}
                      </span></div>
                      <div style={kv}><span style={kLabel}>자차 가입</span><span style={vVal}>{latestIns.coverage_own_damage || '—'}</span></div>
                      <div style={kv}><span style={kLabel}>보험료</span><span style={vVal}>{N(latestIns.total_premium) || N(latestIns.premium) ? `${nf(N(latestIns.total_premium) || N(latestIns.premium))}원` : '—'}</span></div>
                    </>
                  ) : (
                    <div style={{ padding: '18px 14px', fontSize: 12.5, color: COLORS.textMuted }}>
                      등록된 보험 계약이 없습니다{isRide ? ' — 빌려타 부보 여부를 확인하세요' : ''}
                    </div>
                  )}
                </div>
              </div>

              {/* 서류함 */}
              <div style={{ ...sec, marginTop: 14 }}>
                <div style={sh}>서류함 — 사진·문서
                  <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted, marginLeft: 8 }}>카드를 누르면 원본이 열립니다</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, padding: 14 }}>
                  <DocCard title="자동차 등록증" icon="📄" url={car.registration_image_url}
                    onUpload={() => { uploadTarget.current = 'registration_image_url'; uploadRef.current?.click() }} />
                  <DocCard title="보험 증권" icon="🛡️" url={latestIns?.certificate_url || latestIns?.insurance_image_url || null} />
                  <DocCard title="차량 사진" icon="📷" url={car.image_url}
                    onUpload={() => { uploadTarget.current = 'image_url'; uploadRef.current?.click() }} />
                  {isRide && <DocCard title="지입 계약서" icon="🤝" url={car.consignment_contract_url}
                    onUpload={() => { uploadTarget.current = 'consignment_contract_url'; uploadRef.current?.click() }} />}
                </div>
                {car.registration_image_url && (
                  <div style={{ display: 'flex', gap: 8, padding: '0 14px 12px' }}>
                    <button onClick={() => { uploadTarget.current = 'registration_image_url'; uploadRef.current?.click() }}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', background: '#fff', color: COLORS.textSecondary, border: `1px solid ${COLORS.borderSubtle}` }}>등록증 교체</button>
                  </div>
                )}
              </div>
              <input ref={uploadRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
            </>
          )}

          {/* ═══ ② 원가·금융 ═══ */}
          {tab === 'finance' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* 취득 원가 (직영) 또는 지입 계약 (지입) */}
              {!isRide ? (
                <div style={sec}>
                  <div style={sh}>취득 원가 구성
                    {!editCost
                      ? <button style={actBtn} onClick={() => {
                          const draft: Record<string, string> = {}
                          for (const [f] of COST_FIELDS) draft[f] = car[f] != null ? String(N(car[f])) : ''
                          setCostDraft(draft); setEditCost(true)
                        }}>수정</button>
                      : <button style={{ ...actBtn, color: COLORS.success }} disabled={busy} onClick={async () => {
                          const body: Record<string, any> = {}
                          for (const [f] of COST_FIELDS) body[f] = costDraft[f] === '' ? null : Number(costDraft[f])
                          body.total_cost = COST_FIELDS.reduce((s, [f]) => s + (Number(costDraft[f]) || 0), 0)
                          if (await patchCar(body)) setEditCost(false)
                        }}>저장</button>}
                  </div>
                  {COST_FIELDS.map(([f, label]) => (
                    <div key={f} style={kv}>
                      <span style={kLabel}>{label}</span>
                      {editCost
                        ? <input type="number" value={costDraft[f] ?? ''} onChange={(e) => setCostDraft((d) => ({ ...d, [f]: e.target.value }))}
                            style={{ width: 130, padding: '3px 8px', borderRadius: 6, border: `1px solid ${COLORS.borderSubtle}`, fontSize: 12, textAlign: 'right', outline: 'none' }} />
                        : <span style={{ ...vVal, fontVariantNumeric: 'tabular-nums' }}>{N(car[f]) ? nf(car[f]) : '—'}</span>}
                    </div>
                  ))}
                  <div style={{ ...kv, background: '#f0f6ff' }}>
                    <span style={{ ...kLabel, fontWeight: 700 }}>총 취득가</span>
                    <span style={{ fontWeight: 800, color: '#1d4ed8', fontVariantNumeric: 'tabular-nums' }}>
                      {nf(editCost ? COST_FIELDS.reduce((s, [f]) => s + (Number(costDraft[f]) || 0), 0) : (N(car.total_cost) || costTotal))}
                    </span>
                  </div>
                  {car.is_used ? <div style={{ padding: '8px 14px', fontSize: 11.5, color: COLORS.textMuted }}>중고 매입 차량 — 부가세 환급 적용 여부는 장부에서 확인</div> : null}
                </div>
              ) : (
                <div style={sec}>
                  <div style={sh}>지입 계약 (빌려타)</div>
                  <div style={kv}><span style={kLabel}>지입사 / 명의</span><span style={vVal}>{car.owner_name || '빌려타'}</span></div>
                  <div style={{ ...kv, background: '#faf9ff' }}><span style={{ ...kLabel, fontWeight: 700 }}>월 지입료</span><span style={{ fontWeight: 800, color: '#6d28d9', fontVariantNumeric: 'tabular-nums' }}>{N(car.consignment_fee) ? `${nf(car.consignment_fee)}원` : '미입력'}</span></div>
                  <div style={kv}><span style={kLabel}>계약 기간</span><span style={vVal}>{d10(car.consignment_start)} ~ {d10(car.consignment_end)}</span></div>
                  <div style={kv}><span style={kLabel}>보험 부보</span><span style={vVal}>{car.insurance_by === 'company' ? '당사' : car.insurance_by === 'owner' ? '지입사(빌려타)' : car.insurance_by || '—'}</span></div>
                  <div style={kv}><span style={kLabel}>지입 계좌</span><span style={vVal}>{car.owner_bank ? `${car.owner_bank} ${car.owner_account || ''}` : '—'}</span></div>
                  <div style={kv}><span style={kLabel}>계약서</span><span style={vVal}>{car.consignment_contract_url ? '📄 첨부됨' : <span style={{ color: COLORS.textDim }}>미첨부 — 기본·서류 탭에서 업로드</span>}</span></div>
                </div>
              )}

              {/* 대출/할부 */}
              <div style={sec}>
                <div style={sh}>대출 / 할부
                  <button style={actBtn} onClick={() => router.push('/loans')}>대출 페이지 →</button>
                </div>
                {loans.length === 0 && <div style={{ padding: '18px 14px', fontSize: 12.5, color: COLORS.textMuted }}>연결된 대출이 없습니다</div>}
                {loans.map((l: any) => (
                  <div key={l.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f8f9fb' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{l.finance_name || '금융사 미상'} <span style={{ fontWeight: 500, color: COLORS.textMuted, fontSize: 11.5 }}>{l.type || ''}</span></div>
                    <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 3 }}>
                      총 {nf(l.total_amount)}원 · 월 {nf(l.monthly_payment)}원 · {l.interest_rate ? `${l.interest_rate}%` : '—'} · {d10(l.start_date)}~{d10(l.end_date)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ ③ 운행·계약 ═══ */}
          {tab === 'usage' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
                {[
                  { k: '누적 배차', v: data?.rentalStats ? `${data.rentalStats.total}건` : '—' },
                  { k: '최근 배차', v: data?.rentalStats?.last ? d10(data.rentalStats.last) : '—' },
                  { k: '장기계약', v: longterm.length ? `${longterm.length}건` : '없음' },
                ].map((c, i) => (
                  <div key={i} style={{ background: COLORS.bgGray, borderRadius: 10, padding: '10px 13px' }}>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>{c.k}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{c.v}</div>
                  </div>
                ))}
              </div>

              {longterm.length > 0 && (
                <div style={{ ...sec, marginBottom: 14 }}>
                  <div style={sh}>장기계약</div>
                  {longterm.map((l: any) => (
                    <div key={l.id} style={{ ...kv }}>
                      <span style={vVal}>{l.customer_name}</span>
                      <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{d10(l.start_date)}~{d10(l.end_date)} · 월 {nf(l.monthly_fee)}원 · {l.status === 'active' ? '운영중' : l.status}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={sec}>
                <div style={sh}>배차 이력 (최근 20건)
                  <button style={actBtn} onClick={() => router.push('/operations')}>단기·대차 →</button>
                </div>
                {rentals.length === 0 && <div style={{ padding: '18px 14px', fontSize: 12.5, color: COLORS.textMuted }}>배차 이력이 없습니다</div>}
                {rentals.map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid #f8f9fb', fontSize: 12.5 }}>
                    <span style={{ color: COLORS.textMuted, fontSize: 11.5, minWidth: 78 }}>{d10(r.dispatch_date)}</span>
                    <b>{r.customer_name || '—'}</b>
                    <span style={{ color: COLORS.textMuted, fontSize: 11.5 }}>{r.insurance_company || ''} {r.customer_car_number ? `· 고객차 ${r.customer_car_number}` : ''}</span>
                    <span style={{ marginLeft: 'auto' }}>
                      <Badge label={RENTAL_STATUS[r.status] || r.status || '—'} bg={COLORS.borderFaint} fg={COLORS.textSecondary} />
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ═══ ④ 손익 ═══ */}
          {tab === 'pnl' && <PnlTab carId={carId} companyId={car.company_id} car={car} />}
        </div>
      </div>
    </div>
  )
}

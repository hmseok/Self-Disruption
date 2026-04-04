'use client'
import { auth } from '@/lib/auth-client'
import { useApp } from '../../context/AppContext'
import { useState, useEffect, useCallback } from 'react'

// ============================================================================
// AUTH HELPER
// ============================================================================
async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

// ============================================================================
// LOTTE QUICK RATE DATA (빠른 계산기용 — 1~3일 기준가)
// ============================================================================
const LOTTE_QUICK: { cat: string; name: string; rate: number }[] = [
  { cat: '경차', name: '스파크, 모닝', rate: 115000 },
  { cat: '경차', name: '레이', rate: 120000 },
  { cat: '경차', name: '캐스퍼', rate: 130000 },
  { cat: '소형', name: '아반떼(G)', rate: 143000 },
  { cat: '소형', name: '아반떼(H)', rate: 175000 },
  { cat: '중형', name: '쏘나타(G), K5(G)', rate: 197000 },
  { cat: '중형', name: '쏘나타(H)', rate: 233000 },
  { cat: '준대형', name: 'K8 2.5', rate: 324000 },
  { cat: '준대형', name: '그랜저 2.5(G)', rate: 340000 },
  { cat: '대형', name: 'G80 2.5(G)', rate: 449000 },
  { cat: '대형', name: 'G80 3.5(G)', rate: 502000 },
  { cat: '대형', name: 'G90 3.5(G)', rate: 537000 },
  { cat: 'SUV소형', name: '코나, 셀토스, 니로', rate: 217000 },
  { cat: 'SUV중형', name: '투싼, 스포티지', rate: 262000 },
  { cat: 'SUV중형', name: '쏘렌토, 싼타페', rate: 330000 },
  { cat: 'SUV중형', name: '팰리세이드', rate: 402000 },
  { cat: 'SUV중형', name: 'GV70', rate: 469000 },
  { cat: 'SUV중형', name: 'GV80', rate: 529000 },
  { cat: '승합', name: '스타리아 11인승', rate: 313000 },
  { cat: '승합', name: '카니발 9인승(D)', rate: 336000 },
  { cat: '승합', name: '카니발 하이리무진(H)', rate: 529000 },
  { cat: '전기차', name: '코나EV, 니로EV', rate: 208000 },
  { cat: '전기차', name: '아이오닉5 2WD', rate: 230000 },
  { cat: '전기차', name: '아이오닉6', rate: 350000 },
  { cat: '전기차', name: 'EV9', rate: 472000 },
  { cat: '수입차', name: 'BMW 320D, BENZ C200', rate: 505000 },
  { cat: '수입차', name: 'BMW 520D, BENZ E200', rate: 575000 },
  { cat: '수입차', name: 'BMW X5, BENZ GLE', rate: 703000 },
]
const LOTTE_CATS = ['전체', ...Array.from(new Set(LOTTE_QUICK.map(l => l.cat)))]

function calcQuickRate(baseRate: number, discountPct: number, days: number, hours: number): number {
  const discounted = Math.round(baseRate * (1 - discountPct / 100))
  const dayMultiplier = days >= 7 ? 0.80 : days >= 5 ? 0.85 : days >= 4 ? 0.90 : 1.0
  const hourRate = hours <= 0 ? 0
    : hours <= 6 ? Math.round(discounted * 0.75)
    : hours <= 10 ? discounted
    : Math.round(discounted * 1.12)
  if (days > 0 && hours > 0) {
    return Math.round(discounted * dayMultiplier) * days + hourRate
  } else if (days > 0) {
    return Math.round(discounted * dayMultiplier) * days
  } else if (hours > 0) {
    return hourRate
  }
  return 0
}

const f = (n: number) => Math.round(n || 0).toLocaleString()

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function ShortTermCalcPage() {
  const { user, company, role, adminSelectedCompanyId } = useApp()
  const companyId = role === 'admin' ? adminSelectedCompanyId : company?.id

  // ── Calculator State ──
  const [calcDiscount, setCalcDiscount] = useState(40)
  const [calcCat, setCalcCat] = useState('전체')
  const [calcSearch, setCalcSearch] = useState('')
  const [calcSelected, setCalcSelected] = useState<typeof LOTTE_QUICK[0] | null>(null)
  const [calcDays, setCalcDays] = useState(1)
  const [calcHours, setCalcHours] = useState(0)
  const [calcDelivery, setCalcDelivery] = useState(0)
  const [calcFaultEnabled, setCalcFaultEnabled] = useState(false)
  const [calcFaultPercent, setCalcFaultPercent] = useState(100)
  const [calcServiceSupport, setCalcServiceSupport] = useState(0)

  // ── Invoice Modal State ──
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [qSaving, setQSaving] = useState(false)
  const [invManualAmount, setInvManualAmount] = useState(0)
  const [companyStamp, setCompanyStamp] = useState('')
  const [inv, setInv] = useState({
    tenant_name: '', tenant_phone: '', tenant_birth: '', tenant_address: '',
    license_number: '', license_type: '1종보통',
    rental_car: '', rental_plate: '', fuel_type: '전기',
    rental_start: '', return_datetime: '',
    fuel_out: '1', fuel_in: '1',
    memo: '',
  })
  const setField = (k: keyof typeof inv, v: string) => setInv(p => ({ ...p, [k]: v }))

  // ── Auto-hyphen formatters ──
  const fmtPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 3) return d
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  }
  const fmtBirth = (v: string) => {
    const d = v.replace(/[^0-9*]/g, '').slice(0, 13)
    if (d.length <= 6) return d
    return `${d.slice(0, 6)}-${d.slice(6)}`
  }
  const fmtLicense = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 12)
    if (d.length <= 2) return d
    if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`
    if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`
    return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 10)}-${d.slice(10)}`
  }

  // ── Daum address search ──
  const openAddressSearch = () => {
    if (!(window as any).daum?.Postcode) {
      const s = document.createElement('script')
      s.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
      s.onload = () => runDaumPostcode()
      document.head.appendChild(s)
    } else { runDaumPostcode() }
  }
  const runDaumPostcode = () => {
    new (window as any).daum.Postcode({
      oncomplete: (data: any) => {
        const addr = data.roadAddress || data.jibunAddress
        setField('tenant_address', addr)
      }
    }).open()
  }

  // ── Company stamp ──
  useEffect(() => {
    const loadStamp = async () => {
      if (!companyId) return
      try {
        const headers = await getAuthHeader()
        const res = await fetch('/api/company/settings?key=pdf_defaults', { headers })
        const json = await res.json()
        const data = json.data
        if (data?.value?.company_stamp) {
          setCompanyStamp(data.value.company_stamp)
        } else {
          try {
            const stampRes = await fetch('/images/company_stamp.png')
            if (stampRes.ok) {
              const blob = await stampRes.blob()
              const reader = new FileReader()
              reader.onload = () => setCompanyStamp(reader.result as string)
              reader.readAsDataURL(blob)
            }
          } catch {}
        }
      } catch (e) {
        console.error('회사 설정 로드 실패:', e)
      }
    }
    loadStamp()
  }, [companyId])

  // ── Calc derived values ──
  const calcFiltered = LOTTE_QUICK.filter(l => {
    if (calcCat !== '전체' && l.cat !== calcCat) return false
    if (calcSearch && !l.name.toLowerCase().includes(calcSearch.toLowerCase()) && !l.cat.includes(calcSearch)) return false
    return true
  })

  const calcRentOnly = calcSelected
    ? calcQuickRate(calcSelected.rate, calcDiscount, calcDays, calcHours) : 0
  const calcFaultActive = calcFaultEnabled
  const calcFaultAmount = calcFaultActive ? Math.round(calcRentOnly * calcFaultPercent / 100) : calcRentOnly
  const calcSupportAmount = calcFaultActive && calcServiceSupport > 0 ? Math.round(calcRentOnly * calcServiceSupport / 100) : 0
  const calcFinalRent = calcFaultActive ? Math.max(0, calcFaultAmount - calcSupportAmount) : calcRentOnly
  const calcResult = calcFinalRent + calcDelivery * 10000

  // ── Invoice save handler ──
  const handleInvoiceSave = useCallback(async (download: boolean, totalAmount: number) => {
    if (!companyId) return alert('회사 정보를 찾을 수 없습니다.')
    if (!inv.tenant_name.trim()) return alert('임차인 이름을 입력해주세요.')

    const carInfo = calcSelected ? `${calcSelected.cat} ${calcSelected.name}` : (inv.rental_car || '대차')
    const periodDesc = calcSelected
      ? `${calcDays > 0 ? `${calcDays}일` : ''}${calcHours > 0 ? ` ${calcHours}시간` : ''}`.trim()
      : ''

    setQSaving(true)
    try {
      const memoText = [
        `[청구서] ${carInfo}`,
        periodDesc ? `기간: ${periodDesc}` : '',
        inv.tenant_phone.trim() ? `연락처: ${inv.tenant_phone.trim()}` : '',
        inv.memo || '',
      ].filter(Boolean).join(' | ')

      const invoiceDetail = {
        tenant_name: inv.tenant_name.trim(),
        tenant_phone: inv.tenant_phone.trim(),
        tenant_birth: inv.tenant_birth,
        tenant_address: inv.tenant_address,
        license_number: inv.license_number,
        license_type: inv.license_type,
        rental_car: carInfo,
        rental_plate: inv.rental_plate,
        fuel_type: inv.fuel_type,
        rental_start: inv.rental_start,
        return_datetime: inv.return_datetime,
        fuel_out: inv.fuel_out,
        fuel_in: inv.fuel_in,
        memo: inv.memo,
        total_amount: totalAmount,
        type: 'invoice',
      }

      const basePayload: Record<string, any> = {
        customer_name: inv.tenant_name.trim(),
        rent_fee: totalAmount,
        deposit: 0,
        memo: memoText,
        status: 'draft',
        quote_detail: invoiceDetail,
      }

      const headers = await getAuthHeader()
      let res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          ...basePayload,
          rental_type: '청구서',
        })
      })
      let data = (await res.json()).data

      if (!res.ok) {
        delete basePayload.quote_detail
        res = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ ...basePayload, rental_type: '청구서' })
        })
        data = (await res.json()).data
      }

      if (!res.ok) throw new Error('견적 저장 실패')

      if (download) {
        try {
          const res = await fetch('/api/quotes/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quote_id: data.id,
              company_name: '주식회사에프엠아이',
              company_phone: '01033599559',
              company_address: '경기 연천군 왕징면 백동로236번길 190 3동1호',
              representative: '대표 박진숙',
              company_stamp: companyStamp,
              staff_name: user?.email?.split('@')[0] || '',
              staff_phone: '',
              tenant_name: inv.tenant_name.trim(),
              tenant_phone: inv.tenant_phone.trim(),
              tenant_birth: inv.tenant_birth,
              tenant_address: inv.tenant_address,
              license_number: inv.license_number,
              license_type: inv.license_type,
              rental_car: carInfo,
              rental_plate: inv.rental_plate,
              fuel_type: inv.fuel_type,
              rental_start: inv.rental_start.replace('T', ' ').replace(/-/g, '/'),
              fuel_out: `${inv.fuel_out}%`,
              fuel_in: `${inv.fuel_in}%`,
              return_datetime: inv.return_datetime.replace('T', ' ').replace(/-/g, '/'),
              rental_hours: periodDesc || '배차중',
              total_fee: f(totalAmount),
              memo: inv.memo || '',
            }),
          })
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}))
            throw new Error(errData.error || 'PDF 생성 실패')
          }
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `보험계약서_${inv.tenant_name.trim()}_${carInfo}.pdf`
          a.click()
          URL.revokeObjectURL(url)
        } catch (pdfErr: any) {
          alert(`저장 완료! PDF 다운로드 실패: ${pdfErr.message}`)
        }
      }

      setInv({
        tenant_name: '', tenant_phone: '', tenant_birth: '', tenant_address: '',
        license_number: '', license_type: '1종보통',
        rental_car: '', rental_plate: '', fuel_type: '전기', rental_start: '', return_datetime: '',
        fuel_out: '1', fuel_in: '1', memo: '',
      })
      setInvManualAmount(0)
      alert('청구서가 저장되었습니다!')
    } catch (err: any) {
      alert(`저장 실패: ${err?.message || JSON.stringify(err)}`)
    } finally {
      setQSaving(false)
    }
  }, [companyId, inv, calcSelected, calcDays, calcHours, calcDiscount, invManualAmount, user, companyStamp])

  // ── God admin guard ──
  if (role === 'admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="p-12 md:p-20 text-center text-gray-400 text-sm bg-white rounded-2xl">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#f9fafb' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#1e3a5f', marginBottom: 4 }}>단기렌트 견적</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>차종을 선택하고 일수/시간을 설정하여 요금을 계산하세요</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        {/* 왼쪽: 차종 선택 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          {/* 할인율 */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>롯데 기준 할인율</span>
              <input
                type="range" min="0" max="60" step="5" value={calcDiscount}
                onChange={e => setCalcDiscount(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#2d5fa8' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number" min="0" max="70" value={calcDiscount}
                  onChange={e => setCalcDiscount(Math.min(70, Math.max(0, Number(e.target.value))))}
                  style={{ width: 52, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 4px', fontSize: 14, fontWeight: 800, color: '#2d5fa8' }}
                />
                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 700 }}>%</span>
              </div>
            </div>
          </div>

          {/* 카테고리 + 검색 */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center' }}>
            <select
              value={calcCat}
              onChange={e => { setCalcCat(e.target.value); setCalcSelected(null) }}
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, fontWeight: 600 }}
            >
              {LOTTE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text" placeholder="차종명으로 검색 (예: 쏘나타, G80, 카니발)"
              value={calcSearch} onChange={e => setCalcSearch(e.target.value)}
              style={{ flex: 1, padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
            />
          </div>

          {/* 차종 리스트 */}
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {calcFiltered.map((v, i) => (
              <div
                key={i}
                onClick={() => setCalcSelected(v)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 20px', cursor: 'pointer', transition: 'background 0.1s',
                  background: calcSelected === v ? '#eff6ff' : 'transparent',
                  borderBottom: '1px solid #f3f4f6', borderLeft: calcSelected === v ? '3px solid #2d5fa8' : '3px solid transparent',
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, marginRight: 8 }}>{v.cat}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{v.name}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 12, color: '#9ca3af', textDecoration: 'line-through', marginRight: 8 }}>{f(v.rate)}원</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#2d5fa8' }}>{f(Math.round(v.rate * (1 - calcDiscount / 100)))}원</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>/일</span>
                </div>
              </div>
            ))}
            {calcFiltered.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>검색 결과가 없습니다</div>
            )}
          </div>
        </div>

        {/* 오른쪽: 계산 패널 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 340, flexShrink: 0 }}>
          {/* 설정 카드 */}
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '2px 16px' }}>
            {/* 일수 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>일수</span>
              <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => setCalcDays(Math.max(0, calcDays - 1))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>−</button>
                <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{calcDays}</span>
                <button onClick={() => setCalcDays(calcDays + 1)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
              </div>
            </div>
            {/* 시간 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>시간</span>
              <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => setCalcHours(Math.max(0, calcHours - 1))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>−</button>
                <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{calcHours}</span>
                <button onClick={() => setCalcHours(Math.min(23, calcHours + 1))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
              </div>
            </div>
            {/* 사고과실 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>사고과실</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {calcFaultEnabled && <span style={{ fontSize: 12, fontWeight: 800, color: '#ea580c' }}>{calcFaultPercent}%</span>}
                <button onClick={() => setCalcFaultEnabled(!calcFaultEnabled)}
                  style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: calcFaultEnabled ? '#ea580c' : '#e2e8f0', color: calcFaultEnabled ? '#fff' : '#94a3b8' }}>
                  {calcFaultEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
            {calcFaultEnabled && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 12, color: '#c2410c', paddingLeft: 10 }}>↳ 자차과실</span>
                  <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                    <button onClick={() => setCalcFaultPercent(Math.max(0, calcFaultPercent - 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>−</button>
                    <span style={{ minWidth: 38, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{calcFaultPercent}%</span>
                    <button onClick={() => setCalcFaultPercent(Math.min(100, calcFaultPercent + 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 12, color: '#15803d', paddingLeft: 10 }}>↳ 서비스지원</span>
                  <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                    <button onClick={() => setCalcServiceSupport(Math.max(0, calcServiceSupport - 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>−</button>
                    <span style={{ minWidth: 38, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{calcServiceSupport}%</span>
                    <button onClick={() => setCalcServiceSupport(Math.min(100, calcServiceSupport + 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
                  </div>
                </div>
              </>
            )}
            {/* 탁송비 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>탁송비</span>
              <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => setCalcDelivery(Math.max(0, calcDelivery - 1))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>−</button>
                <span style={{ minWidth: 36, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{calcDelivery}<span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 1 }}>만</span></span>
                <button onClick={() => setCalcDelivery(calcDelivery + 1)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
              </div>
            </div>
          </div>

          {/* 결과 카드 */}
          <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderRadius: 10, padding: 18, textAlign: 'center' }}>
            {calcSelected ? (
              <>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                  {calcSelected.cat} · {calcSelected.name} · {calcDays > 0 ? `${calcDays}일` : ''}{calcHours > 0 ? ` ${calcHours}시간` : ''}
                </div>
                <div style={{ fontSize: 34, fontWeight: 900, color: '#fff', letterSpacing: -1 }}>
                  {f(calcResult)}<span style={{ fontSize: 14, color: '#475569', marginLeft: 2 }}>원</span>
                </div>
                {calcDays > 0 && (
                  <div style={{ fontSize: 12, color: '#60a5fa', marginTop: 2 }}>
                    하루 {f(Math.round(calcResult / calcDays))}원
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>렌트 {f(calcRentOnly)}</span>
                  {calcFaultActive && <span style={{ fontSize: 11, color: '#fb923c' }}>과실 {calcFaultPercent}%</span>}
                  {calcSupportAmount > 0 && <span style={{ fontSize: 11, color: '#4ade80' }}>지원 -{calcServiceSupport}%</span>}
                  {calcDelivery > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>탁송 {calcDelivery}만</span>}
                </div>
                {/* 상세 내역 */}
                <div style={{ borderTop: '1px solid #334155', paddingTop: 10, marginTop: 10, textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                    <span style={{ color: '#94a3b8' }}>렌트비 (할인 {calcDiscount}%)</span>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>{f(calcRentOnly)}원</span>
                  </div>
                  {calcFaultActive && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                        <span style={{ color: '#fb923c' }}>자차과실 ({calcFaultPercent}%)</span>
                        <span style={{ color: '#fb923c', fontWeight: 600 }}>{f(calcFaultAmount)}원</span>
                      </div>
                      {calcSupportAmount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                          <span style={{ color: '#4ade80' }}>서비스지원 (-{calcServiceSupport}%)</span>
                          <span style={{ color: '#4ade80', fontWeight: 600 }}>-{f(calcSupportAmount)}원</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2, borderTop: '1px solid #334155', paddingTop: 4, marginTop: 2 }}>
                        <span style={{ color: '#fff', fontWeight: 900 }}>실부담금</span>
                        <span style={{ color: '#fff', fontWeight: 900 }}>{f(calcFinalRent)}원</span>
                      </div>
                    </>
                  )}
                  {calcDelivery > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: '#94a3b8' }}>탁송비</span>
                      <span style={{ color: '#94a3b8', fontWeight: 600 }}>{f(calcDelivery * 10000)}원</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>차종을 선택하면 예상금액이 표시됩니다</p>
            )}
          </div>

          {/* 청구서 작성 버튼 */}
          {calcSelected && calcResult > 0 && (
            <button
              onClick={() => setInvoiceOpen(true)}
              style={{
                marginTop: 12, width: '100%', padding: '14px', border: 'none', borderRadius: 10,
                background: 'linear-gradient(135deg, #2d5fa8, #1e40af)', color: '#fff',
                fontWeight: 800, fontSize: 15, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(45,95,168,0.3)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(45,95,168,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(45,95,168,0.3)' }}
            >
              📄 청구서 작성
            </button>
          )}
        </div>
      </div>

      {/* ═══ 청구서 작성 모달 ═══ */}
      {invoiceOpen && (() => {
        const iS = { width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' as const, outline: 'none' }
        const lS = { fontSize: 10, fontWeight: 700 as const, color: '#6b7280', display: 'block', marginBottom: 2 }
        const rentalCarValue = calcSelected ? `${calcSelected.cat} ${calcSelected.name}` : inv.rental_car || ''
        return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setInvoiceOpen(false)}
          />
          <div style={{
            position: 'relative', background: '#fff', borderRadius: 16, padding: '24px 28px',
            width: '90%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            animation: 'fadeInUp 0.2s ease-out',
          }}>
            <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1e3a5f' }}>📄 청구서 작성</div>
              <button onClick={() => setInvoiceOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>✕</button>
            </div>
            {calcSelected && (
              <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderRadius: 10, padding: 14, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>{calcSelected.cat} · {calcSelected.name} · {calcDays > 0 ? `${calcDays}일` : ''}{calcHours > 0 ? ` ${calcHours}시간` : ''}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>{f(calcResult)}<span style={{ fontSize: 12, color: '#475569', marginLeft: 2 }}>원</span></div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e3a5f', marginBottom: 8, borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>임차인 정보</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div><label style={lS}>임차인 *</label><input value={inv.tenant_name} onChange={e => setField('tenant_name', e.target.value)} placeholder="홍길동" style={iS} /></div>
                  <div><label style={lS}>연락처</label><input value={inv.tenant_phone} onChange={e => setField('tenant_phone', fmtPhone(e.target.value))} placeholder="010-0000-0000" style={iS} inputMode="tel" /></div>
                  <div><label style={lS}>생년월일</label><input value={inv.tenant_birth} onChange={e => setField('tenant_birth', fmtBirth(e.target.value))} placeholder="900101-1******" style={iS} /></div>
                  <div>
                    <label style={lS}>주소</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input value={inv.tenant_address} onChange={e => setField('tenant_address', e.target.value)} placeholder="주소 검색" readOnly style={{ ...iS, flex: 1, cursor: 'pointer', background: '#fafafa' }} onClick={openAddressSearch} />
                      <button onClick={openAddressSearch} type="button" style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb', fontSize: 11, fontWeight: 700, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>검색</button>
                    </div>
                  </div>
                  <div><label style={lS}>운전면허번호</label><input value={inv.license_number} onChange={e => setField('license_number', fmtLicense(e.target.value))} placeholder="00-00-000000-00" style={iS} inputMode="numeric" /></div>
                  <div><label style={lS}>면허구분</label><select value={inv.license_type} onChange={e => setField('license_type', e.target.value)} style={iS}><option>1종보통</option><option>2종보통</option><option>1종대형</option></select></div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e3a5f', marginBottom: 8, borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>대차 정보</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div><label style={lS}>차종 {calcSelected ? '(연동)' : ''}</label><input value={rentalCarValue} onChange={e => { if (!calcSelected) setField('rental_car' as any, e.target.value) }} readOnly={!!calcSelected} placeholder="차종" style={{ ...iS, ...(calcSelected ? { background: '#f3f4f6' } : {}) }} /></div>
                  <div><label style={lS}>차량번호</label><input value={inv.rental_plate} onChange={e => setField('rental_plate', e.target.value)} placeholder="00하0000" style={iS} /></div>
                  <div><label style={lS}>유종</label><select value={inv.fuel_type} onChange={e => setField('fuel_type', e.target.value)} style={iS}><option>전기</option><option>가솔린</option><option>디젤</option><option>LPG</option><option>하이브리드</option></select></div>
                  <div><label style={lS}>대여일시</label><input type="datetime-local" value={inv.rental_start} onChange={e => setField('rental_start', e.target.value)} style={iS} /></div>
                  <div><label style={lS}>반납예정일</label><input type="datetime-local" value={inv.return_datetime} onChange={e => setField('return_datetime', e.target.value)} style={iS} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={lS}>배차 유류</label>
                      <div style={{ position: 'relative' }}>
                        <input type="number" min={0} max={100} value={inv.fuel_out} onChange={e => setField('fuel_out', e.target.value.replace(/\D/g, '').slice(0, 3))} style={{ ...iS, paddingRight: 24 }} inputMode="numeric" />
                        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9ca3af', pointerEvents: 'none' }}>%</span>
                      </div>
                    </div>
                    <div>
                      <label style={lS}>반납 유류</label>
                      <div style={{ position: 'relative' }}>
                        <input type="number" min={0} max={100} value={inv.fuel_in} onChange={e => setField('fuel_in', e.target.value.replace(/\D/g, '').slice(0, 3))} style={{ ...iS, paddingRight: 24 }} inputMode="numeric" />
                        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9ca3af', pointerEvents: 'none' }}>%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e3a5f', marginBottom: 8, borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>기타 / 저장</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div><label style={lS}>메모</label><textarea value={inv.memo} onChange={e => setField('memo', e.target.value)} placeholder="기타 계약사항" rows={3} style={{ ...iS, resize: 'vertical' }} /></div>
                  {!calcSelected && (
                    <div><label style={lS}>직접 금액 (원)</label><input type="number" value={invManualAmount} onChange={e => setInvManualAmount(Number(e.target.value))} style={{ ...iS, fontSize: 14, fontWeight: 900, color: '#2d5fa8', textAlign: 'right' }} /></div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 20 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', lineHeight: '32px' }}>발송:</span>
                <button
                  onClick={async () => {
                    if (!inv.tenant_phone.trim()) return alert('연락처를 입력해주세요.')
                    const phone = inv.tenant_phone.replace(/-/g, '')
                    const carInfo = calcSelected ? `${calcSelected.cat} ${calcSelected.name}` : (inv.rental_car || '대차')
                    const amount = f(calcSelected ? calcResult : invManualAmount)
                    const msg = `[에프엠아이 렌터카]\n${inv.tenant_name}님 청구서\n차종: ${carInfo}\n금액: ${amount}원\n감사합니다.`
                    try {
                      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
                      if (!token) return alert('로그인이 필요합니다.')
                      const res = await fetch('/api/send-sms', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ phone, message: msg, title: '청구서 안내', recipientName: inv.tenant_name }),
                      })
                      const result = await res.json()
                      if (result.success) {
                        alert('문자가 발송되었습니다.')
                      } else {
                        alert(`발송 실패: ${result.error || '알 수 없는 오류'}`)
                      }
                    } catch (err: any) {
                      alert(`발송 오류: ${err.message}`)
                    }
                  }}
                  style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 12, fontWeight: 700, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >💬 문자</button>
                <button
                  onClick={async () => {
                    if (!inv.tenant_phone.trim()) return alert('연락처를 입력해주세요.')
                    const phone = inv.tenant_phone.replace(/-/g, '')
                    const carInfo = calcSelected ? `${calcSelected.cat} ${calcSelected.name}` : (inv.rental_car || '대차')
                    const amount = f(calcSelected ? calcResult : invManualAmount)
                    const msg = `[에프엠아이 렌터카] ${inv.tenant_name}님 청구서 - 차종: ${carInfo}, 금액: ${amount}원`
                    window.open(`https://sharer.kakao.com/talk/friends/picker/link?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(msg)}`, '_blank', 'width=480,height=640')
                  }}
                  style={{ padding: '6px 14px', border: '1px solid #fcd34d', borderRadius: 8, background: '#fffbeb', fontSize: 12, fontWeight: 700, color: '#92400e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >💛 카카오톡</button>
                <button
                  onClick={() => {
                    const carInfo = calcSelected ? `${calcSelected.cat} ${calcSelected.name}` : (inv.rental_car || '대차')
                    const amount = f(calcSelected ? calcResult : invManualAmount)
                    const subject = `[에프엠아이 렌터카] ${inv.tenant_name}님 청구서`
                    const body = `안녕하세요, ${inv.tenant_name}님.\n\n에프엠아이 렌터카 청구서입니다.\n\n■ 차종: ${carInfo}\n■ 금액: ${amount}원\n${inv.rental_start ? `■ 대여일시: ${inv.rental_start.replace('T', ' ')}` : ''}\n${inv.return_datetime ? `■ 반납예정: ${inv.return_datetime.replace('T', ' ')}` : ''}\n\n감사합니다.\n주식회사에프엠아이`
                    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank')
                  }}
                  style={{ padding: '6px 14px', border: '1px solid #93c5fd', borderRadius: 8, background: '#eff6ff', fontSize: 12, fontWeight: 700, color: '#1d4ed8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >📧 이메일</button>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setInvoiceOpen(false)} style={{ padding: '10px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#6b7280', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>취소</button>
                <button
                  onClick={() => { handleInvoiceSave(false, calcSelected ? calcResult : invManualAmount); setInvoiceOpen(false) }}
                  disabled={qSaving}
                  style={{ padding: '10px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: qSaving ? 0.5 : 1 }}
                >{qSaving ? '저장 중...' : '저장'}</button>
                <button
                  onClick={() => { handleInvoiceSave(true, calcSelected ? calcResult : invManualAmount); setInvoiceOpen(false) }}
                  disabled={qSaving}
                  style={{ padding: '10px 24px', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg, #2d5fa8, #1e40af)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 14px rgba(45,95,168,0.3)', opacity: qSaving ? 0.5 : 1 }}
                >{qSaving ? '처리 중...' : '저장 + PDF 다운로드'}</button>
              </div>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}

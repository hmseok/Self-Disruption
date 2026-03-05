'use client'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

// ============================================================================
// TYPES
// ============================================================================
type MainTab = 'long_term' | 'short_term' | 'invoice' | 'calc'
type StatusFilter = 'all' | 'draft' | 'shared' | 'signed' | 'contracted' | 'archived'
type ShortStatusFilter = 'all' | 'draft' | 'sent' | 'accepted' | 'contracted' | 'cancelled'
type SortOption = 'latest' | 'customer' | 'expiry' | 'rent'

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
  // 일수별 할인: 1~3일=100%, 4일=90%, 5~6일=85%, 7일+=80%
  const dayMultiplier = days >= 7 ? 0.80 : days >= 5 ? 0.85 : days >= 4 ? 0.90 : 1.0
  // 시간 비율: 6h 이하=75%, 7~10h=100%, 11h+=112% (시간만 사용 시 1일 기준, 일+시간 시 추가분)
  const hourRate = hours <= 0 ? 0
    : hours <= 6 ? Math.round(discounted * 0.75)
    : hours <= 10 ? discounted
    : Math.round(discounted * 1.12)
  if (days > 0 && hours > 0) {
    // 일수 + 시간: 일수분 + 시간 추가분
    return Math.round(discounted * dayMultiplier) * days + hourRate
  } else if (days > 0) {
    // 일수만
    return Math.round(discounted * dayMultiplier) * days
  } else if (hours > 0) {
    // 시간만
    return hourRate
  }
  return 0
}

// ============================================================================
// QUOTE STATUS BADGE (장기 — 계약관리 스타일 통일)
// ============================================================================
function QuoteStatusBadge({ quote }: { quote: any }) {
  if (quote.status === 'archived') {
    return <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#f3f4f6', color: '#9ca3af' }}>보관</span>
  }
  if (quote.contract) {
    return <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#e5e7eb', color: '#6b7280' }}>계약전환</span>
  }
  if (quote.signed_at) {
    return <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#16a34a' }}>서명완료</span>
  }
  if (quote.shared_at) {
    return <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#2563eb' }}>발송됨</span>
  }
  return <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#d97706' }}>작성중</span>
}

// ============================================================================
// SHORT-TERM STATUS BADGE
// ============================================================================
function ShortTermStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    draft: { label: '작성중', bg: '#fef3c7', color: '#d97706' },
    sent: { label: '발송됨', bg: '#dbeafe', color: '#2563eb' },
    accepted: { label: '수락됨', bg: '#dcfce7', color: '#16a34a' },
    contracted: { label: '계약완료', bg: '#e5e7eb', color: '#6b7280' },
    cancelled: { label: '취소', bg: '#f3f4f6', color: '#9ca3af' },
  }
  const s = map[status] || map.draft
  return <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>
}

// ============================================================================
// SHORT-TERM QUOTE DETAIL MODAL
// ============================================================================
function ShortTermDetailModal({
  quote,
  onClose,
  onStatusChange,
  onDelete,
}: {
  quote: any
  onClose: () => void
  onStatusChange: (id: string, status: string) => void
  onDelete: (id: string) => void
}) {
  const detail = quote.quote_detail || {}
  const items = detail.items || []
  const risk = detail.riskFactors || {}
  const f = (n: number) => (n || 0).toLocaleString()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-start">
          <div>
            <p className="text-xs text-gray-400 font-bold mb-1">{quote.quote_number}</p>
            <h3 className="text-lg font-black text-gray-900">{quote.customer_name}</h3>
            {quote.customer_phone && <p className="text-sm text-gray-500 mt-0.5">{quote.customer_phone}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 text-lg">✕</button>
        </div>

        {/* Status */}
        <div className="px-5 pt-4 flex items-center gap-3">
          <ShortTermStatusBadge status={quote.status} />
          {quote.expires_at && new Date(quote.expires_at) < new Date() && quote.status === 'draft' && (
            <span className="text-xs text-red-500 font-bold">만료됨</span>
          )}
        </div>

        {/* Amount Summary */}
        <div className="p-5">
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200/50">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600 font-bold">합계 (VAT포함)</span>
              <span className="text-xl font-black text-amber-700">{f(detail.totalWithVat || detail.total || 0)}원</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>공급가액: {f(detail.supplyPrice || 0)}원</span>
              <span>부가세: {f(detail.vat || 0)}원</span>
            </div>
            {detail.globalDiscount && (
              <div className="mt-2 text-xs text-amber-600 font-bold">적용 할인율: {detail.globalDiscount}%</div>
            )}
          </div>
        </div>

        {/* Items */}
        {items.length > 0 && (
          <div className="px-5 pb-4">
            <h4 className="text-xs font-bold text-gray-500 mb-2">견적 항목</h4>
            <div className="space-y-1.5">
              {items.map((item: any, i: number) => (
                <div key={i} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-lg text-sm">
                  <div>
                    <span className="font-bold text-gray-700">{item.vehicleClass || item.group}</span>
                    <span className="text-xs text-gray-400 ml-2">일단가 {f(item.dailyRate)}원</span>
                  </div>
                  <div className="text-right">
                    {item.byDays && Object.entries(item.byDays).map(([days, amt]: [string, any]) => (
                      <div key={days} className="text-xs">
                        <span className="text-gray-500">{days}일:</span>{' '}
                        <span className="font-bold text-gray-800">{f(amt)}원</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk Factors */}
        {risk.totalRisk && (
          <div className="px-5 pb-4">
            <h4 className="text-xs font-bold text-gray-500 mb-2">리스크 팩터</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-gray-50 rounded-lg"><span className="text-gray-400">사고율</span><br /><span className="font-bold">{risk.accidentRate}%</span></div>
              <div className="p-2 bg-gray-50 rounded-lg"><span className="text-gray-400">수리일수</span><br /><span className="font-bold">{risk.repairDays}일</span></div>
              <div className="p-2 bg-gray-50 rounded-lg"><span className="text-gray-400">고장율</span><br /><span className="font-bold">{risk.breakdownRate}%</span></div>
              <div className="p-2 bg-gray-50 rounded-lg"><span className="text-gray-400">고장수리</span><br /><span className="font-bold">{risk.breakdownDays}일</span></div>
            </div>
          </div>
        )}

        {/* Memo */}
        {detail.memo && (
          <div className="px-5 pb-4">
            <h4 className="text-xs font-bold text-gray-500 mb-1">메모</h4>
            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{detail.memo}</p>
          </div>
        )}

        {/* Actions */}
        <div className="p-5 border-t border-gray-100 flex flex-wrap gap-2">
          {quote.status === 'draft' && (
            <button onClick={() => { onStatusChange(quote.id, 'sent'); onClose() }}
              className="flex-1 py-2.5 px-3 text-sm font-bold rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors">발송 처리</button>
          )}
          {quote.status === 'sent' && (
            <button onClick={() => { onStatusChange(quote.id, 'accepted'); onClose() }}
              className="flex-1 py-2.5 px-3 text-sm font-bold rounded-xl bg-green-500 text-white hover:bg-green-600 transition-colors">수락 처리</button>
          )}
          {quote.status === 'accepted' && (
            <button onClick={() => { onStatusChange(quote.id, 'contracted'); onClose() }}
              className="flex-1 py-2.5 px-3 text-sm font-bold rounded-xl bg-purple-500 text-white hover:bg-purple-600 transition-colors">계약 완료</button>
          )}
          {quote.status !== 'cancelled' && quote.status !== 'contracted' && (
            <button onClick={() => { onStatusChange(quote.id, 'cancelled'); onClose() }}
              className="py-2.5 px-4 text-sm font-bold rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">취소</button>
          )}
          <button onClick={() => {
            if (confirm('이 견적서를 삭제하시겠습니까?')) { onDelete(quote.id); onClose() }
          }} className="py-2.5 px-4 text-sm font-bold rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors">삭제</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ROW ACTIONS (⋯ 메뉴)
// ============================================================================
function RowActions({
  quote,
  onEdit,
  onArchive,
  onDelete,
}: {
  quote: any
  onEdit: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, right: 0 })

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation()
          if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect()
            setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
          }
          setOpen(!open)
        }}
        style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', fontSize: 16 }}
      >
        ⋯
      </button>
      {open && (
        <div style={{ position: 'fixed', top: pos.top, right: pos.right, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 130 }}>
          {(quote.rental_type === '청구서' || quote.memo?.startsWith('[청구서]')) && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                setOpen(false)
                try {
                  const res = await fetch('/api/quotes/generate-pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      quote_id: quote.id,
                      company_name: '주식회사에프엠아이',
                      company_phone: '01033599559',
                      tenant_name: quote.customer_name || '',
                      rental_car: (() => { const m = quote.memo?.match(/\[청구서\]\s*(.+?)(?:\s*\||$)/); return m?.[1] || '' })(),
                      total_fee: quote.rent_fee ? parseInt(quote.rent_fee).toLocaleString() : '',
                      rental_hours: (() => { const m = quote.memo?.match(/기간:\s*(.+?)(?:\s*\||$)/); return m?.[1] || '' })(),
                      sign_tenant: quote.customer_name || '',
                      memo: quote.memo || '',
                    }),
                  })
                  if (!res.ok) throw new Error('PDF 생성 실패')
                  const blob = await res.blob()
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `견적서_${quote.customer_name || 'draft'}.pdf`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch (err: any) {
                  alert(`PDF 다운로드 실패: ${err.message}`)
                }
              }}
              style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#2563eb', border: 'none', background: 'none', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >📄 PDF 다운로드</button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(quote.id); setOpen(false) }}
            style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151', border: 'none', background: 'none', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >수정</button>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(quote.id); setOpen(false) }}
            style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151', border: 'none', background: 'none', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >보관</button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              const msg = quote.contract
                ? '이 견적서에 연결된 계약이 있습니다.\n계약과 함께 삭제하시겠습니까?'
                : '이 견적서를 삭제하시겠습니까?'
              if (confirm(msg)) onDelete(quote.id)
              setOpen(false)
            }}
            style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >삭제</button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// NEW QUOTE DROPDOWN BUTTON
// ============================================================================
function NewQuoteButton({ mainTab }: { mainTab: MainTab }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '7px 16px', background: '#2d5fa8', color: '#fff', border: 'none',
          borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}
      >
        + 새 견적
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 8,
          background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 200, overflow: 'hidden',
        }}>
          <Link
            href="/quotes/pricing"
            onClick={() => setOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
              textDecoration: 'none', borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 14 }}>📋</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>장기렌트 견적</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>렌탈료 산출 · 견적서 작성</div>
            </div>
          </Link>
          <Link
            href="/quotes/short-term"
            onClick={() => setOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
              textDecoration: 'none', transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 14 }}>⏱️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>단기렌트 견적</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>대차 · 단기 렌탈 견적</div>
            </div>
          </Link>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function QuoteListPage() {
  const { user, company, role, adminSelectedCompanyId } = useApp()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [quotes, setQuotes] = useState<any[]>([])
  const [shortQuotes, setShortQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const initialTab = (searchParams.get('tab') as MainTab) || 'long_term'
  const [mainTab, setMainTab] = useState<MainTab>(initialTab)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [shortStatusFilter, setShortStatusFilter] = useState<ShortStatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('latest')
  const [customers, setCustomers] = useState<Map<string, any>>(new Map())
  const [selectedShortQuote, setSelectedShortQuote] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // ── Quick Calculator State ──
  const [calcDiscount, setCalcDiscount] = useState(40)
  const [calcCat, setCalcCat] = useState('전체')
  const [calcSearch, setCalcSearch] = useState('')
  const [calcSelected, setCalcSelected] = useState<typeof LOTTE_QUICK[0] | null>(null)
  const [calcDays, setCalcDays] = useState(1)
  const [calcHours, setCalcHours] = useState(0)
  const [calcDelivery, setCalcDelivery] = useState(0)
  const [calcFaultEnabled, setCalcFaultEnabled] = useState(false)
  const [calcFaultPercent, setCalcFaultPercent] = useState(100) // 자차과실 %
  const [calcServiceSupport, setCalcServiceSupport] = useState(0) // 서비스지원 %

  // ── 청구서(단기렌트 계약서) State ──
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [qSaving, setQSaving] = useState(false)
  const [invManualAmount, setInvManualAmount] = useState(0)
  const [inv, setInv] = useState({
    // 임차인 정보
    tenant_name: '', tenant_phone: '', tenant_birth: '', tenant_address: '',
    license_number: '', license_type: '1종보통',
    // 대차 정보
    rental_car: '', rental_plate: '', fuel_type: '전기',
    rental_start: '', return_datetime: '',
    fuel_out: '1%', fuel_in: '1%',
    // 메모
    memo: '',
  })
  const setField = (k: keyof typeof inv, v: string) => setInv(p => ({ ...p, [k]: v }))

  const f = (n: number) => Math.round(n || 0).toLocaleString()
  const formatDate = (dateString: string) => dateString?.split('T')[0] || ''

  // 청구서 memo에서 차량 정보 파싱: "[청구서] 경차 · 스파크, 모닝 | 기간: 6일 3시간 | ..."
  const isInvoice = (q: any) => q.rental_type === '청구서' || q.memo?.startsWith('[청구서]')
  const parseInvoiceMemo = (memo: string) => {
    const carMatch = memo?.match(/\[청구서\]\s*(.+?)(?:\s*\||$)/)
    const periodMatch = memo?.match(/기간:\s*(.+?)(?:\s*\||$)/)
    return { car: carMatch?.[1] || '-', period: periodMatch?.[1] || '-' }
  }

  const companyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // ── Fetch all data ──
  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) { setLoading(false); return }

      try {
        // Quotes
        const { data: quotesData, error: quotesError } = await supabase
          .from('quotes').select('*').eq('company_id', companyId).order('id', { ascending: false })
        if (quotesError) console.error('견적 목록 로드 실패:', quotesError.message)

        // Cars
        const carIds = (quotesData || []).map((q) => q.car_id).filter(Boolean)
        const { data: carsData } = carIds.length > 0
          ? await supabase.from('cars').select('*').in('id', carIds)
          : { data: [] }

        // Contracts from quotes
        const quoteIds = (quotesData || []).map((q) => q.id)
        const { data: contractsFromQuotes } = quoteIds.length > 0
          ? await supabase.from('contracts').select('id, quote_id, status').in('quote_id', quoteIds)
          : { data: [] }

        // Short-term quotes
        const { data: stQuotesData } = await supabase
          .from('short_term_quotes').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
        setShortQuotes(stQuotesData || [])

        // Customers
        const customerIds = [
          ...(quotesData || []).map((q) => q.customer_id),
        ].filter(Boolean)
        const uniqueCustomerIds = [...new Set(customerIds)]
        const { data: customersData } = uniqueCustomerIds.length > 0
          ? await supabase.from('customers').select('id, name, phone, email').in('id', uniqueCustomerIds)
          : { data: [] }

        const customersMap = new Map()
        customersData?.forEach((c) => customersMap.set(c.id, c))
        setCustomers(customersMap)

        const allCars = carsData || []

        // Combine quotes
        const combinedQuotes = (quotesData || []).map((quote) => ({
          ...quote,
          car: allCars.find((c) => c.id === quote.car_id),
          contract: (contractsFromQuotes || []).find((c) => c.quote_id === quote.id),
          customer: customersMap.get(quote.customer_id),
        }))

        setQuotes(combinedQuotes)
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [companyId])

  // ── Stats ──
  const longTermQuotes = quotes
  const shortTermQuotes = shortQuotes

  // Long-term status counts (새 상태 기준)
  const statusCounts: Record<StatusFilter, number> = {
    all: longTermQuotes.filter(q => q.status !== 'archived').length,
    draft: longTermQuotes.filter(q => !q.contract && !q.shared_at && !q.signed_at && q.status !== 'archived').length,
    shared: longTermQuotes.filter(q => q.shared_at && !q.signed_at && !q.contract && q.status !== 'archived').length,
    signed: longTermQuotes.filter(q => q.signed_at && !q.contract && q.status !== 'archived').length,
    contracted: longTermQuotes.filter(q => q.contract).length,
    archived: longTermQuotes.filter(q => q.status === 'archived').length,
  }

  // Short-term status counts
  const shortStatusCounts: Record<ShortStatusFilter, number> = {
    all: shortTermQuotes.length,
    draft: shortTermQuotes.filter(q => q.status === 'draft').length,
    sent: shortTermQuotes.filter(q => q.status === 'sent').length,
    accepted: shortTermQuotes.filter(q => q.status === 'accepted').length,
    contracted: shortTermQuotes.filter(q => q.status === 'contracted').length,
    cancelled: shortTermQuotes.filter(q => q.status === 'cancelled').length,
  }

  const mainTabCounts: Record<MainTab, number> = {
    long_term: longTermQuotes.filter(q => q.status !== 'archived').length,
    short_term: shortTermQuotes.length,
  }

  // ── Filter + Sort (장기) ──
  const getFilteredQuotes = useCallback(() => {
    let result: any[]
    switch (statusFilter) {
      case 'draft': result = longTermQuotes.filter(q => !q.contract && !q.shared_at && !q.signed_at && q.status !== 'archived'); break
      case 'shared': result = longTermQuotes.filter(q => q.shared_at && !q.signed_at && !q.contract && q.status !== 'archived'); break
      case 'signed': result = longTermQuotes.filter(q => q.signed_at && !q.contract && q.status !== 'archived'); break
      case 'contracted': result = longTermQuotes.filter(q => q.contract); break
      case 'archived': result = longTermQuotes.filter(q => q.status === 'archived'); break
      default: result = longTermQuotes.filter(q => q.status !== 'archived')
    }
    // 검색어 필터
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(q =>
        (q.customer_name || '').toLowerCase().includes(term) ||
        (q.car?.number || '').toLowerCase().includes(term) ||
        (q.car?.brand || '').toLowerCase().includes(term) ||
        (q.car?.model || '').toLowerCase().includes(term)
      )
    }
    // 정렬
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'customer': return (a.customer_name || '').localeCompare(b.customer_name || '')
        case 'expiry': return (a.end_date || '').localeCompare(b.end_date || '')
        case 'rent': return (b.rent_fee || 0) - (a.rent_fee || 0)
        default: return 0 // latest — already sorted by id desc from DB
      }
    })
    return result
  }, [statusFilter, longTermQuotes, searchTerm, sortBy])

  // ── Filter (단기) ──
  const getFilteredShortQuotes = useCallback(() => {
    let result = shortStatusFilter === 'all' ? shortTermQuotes : shortTermQuotes.filter(q => q.status === shortStatusFilter)
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(q =>
        (q.customer_name || '').toLowerCase().includes(term) ||
        (q.quote_number || '').toLowerCase().includes(term)
      )
    }
    return result
  }, [shortStatusFilter, shortTermQuotes, searchTerm])

  const displayedQuotes = getFilteredQuotes()
  const displayedShortQuotes = getFilteredShortQuotes()

  // ── Handlers ──
  const handleEdit = useCallback((quoteId: string) => {
    router.push(`/quotes/pricing?quote_id=${quoteId}`)
  }, [router])

  const handleArchive = useCallback(async (quoteId: string) => {
    try {
      const { error } = await supabase.from('quotes').update({ status: 'archived' }).eq('id', quoteId)
      if (error) throw error
      setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: 'archived' } : q))
    } catch { alert('보관 중 오류가 발생했습니다.') }
  }, [])

  const handleDelete = useCallback(async (quoteId: string) => {
    try {
      console.log('[DELETE] 견적 삭제 시작:', quoteId)

      // 1. 연결된 contracts 조회
      const { data: linkedContracts } = await supabase
        .from('contracts').select('id').eq('quote_id', quoteId)

      // 2. 연결된 payment_schedules 삭제
      if (linkedContracts && linkedContracts.length > 0) {
        const contractIds = linkedContracts.map(c => c.id)
        await supabase.from('payment_schedules').delete().in('contract_id', contractIds)
      }

      // 3. 연결된 contracts 삭제
      await supabase.from('contracts').delete().eq('quote_id', quoteId)

      // 4. quote_shares 삭제
      await supabase.from('quote_shares').delete().eq('quote_id', quoteId)

      // 5. customer_signatures 삭제
      const { error: sigErr } = await supabase.from('customer_signatures').delete().eq('quote_id', quoteId)
      if (sigErr) {
        console.warn('[DELETE] 서명 직접 삭제 실패 (RLS 제한), RPC 시도:', sigErr.message)
        const { error: rpcErr } = await supabase.rpc('delete_quote_cascade', { p_quote_id: quoteId })
        if (rpcErr) {
          console.error('[DELETE] RPC 우회도 실패:', rpcErr.message)
          await supabase.from('quote_share_tokens').delete().eq('quote_id', quoteId)
          const { error: sigErr2 } = await supabase.from('customer_signatures').delete().eq('quote_id', quoteId)
          if (sigErr2) {
            throw new Error(
              `고객 서명 데이터 삭제 실패 (RLS 정책 없음)\n\n` +
              `Supabase SQL Editor에서 아래 SQL을 실행해주세요:\n` +
              `DELETE FROM customer_signatures WHERE quote_id = ${quoteId};\n\n` +
              `또는 sql/065_signature_delete_policy.sql 마이그레이션을 실행하세요.`
            )
          }
        } else {
          console.log('[DELETE] RPC 우회 삭제 성공')
        }
      }

      // 6. quote_share_tokens 삭제
      await supabase.from('quote_share_tokens').delete().eq('quote_id', quoteId)

      // 7. 견적서 삭제
      const { error: qErr } = await supabase.from('quotes').delete().eq('id', quoteId)
      if (qErr) throw new Error(`견적서 삭제 실패: ${qErr.message}`)

      setQuotes(prev => prev.filter(q => q.id !== quoteId))
    } catch (err: any) {
      console.error('[DELETE] 최종 에러:', err)
      alert(`삭제 중 오류:\n${err?.message || JSON.stringify(err)}`)
    }
  }, [])

  // Short-term handlers
  const handleShortStatusChange = useCallback(async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('short_term_quotes').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      setShortQuotes(prev => prev.map(q => q.id === id ? { ...q, status } : q))
    } catch { alert('상태 변경 중 오류가 발생했습니다.') }
  }, [])

  const handleShortDelete = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('short_term_quotes').delete().eq('id', id)
      if (error) throw error
      setShortQuotes(prev => prev.filter(q => q.id !== id))
    } catch { alert('삭제 중 오류가 발생했습니다.') }
  }, [])

  // ── 단기렌트 계약서 저장 + PDF 다운로드 ──
  const handleInvoiceSave = useCallback(async (download: boolean, totalAmount: number) => {
    if (!companyId) return alert('회사 정보를 찾을 수 없습니다.')
    if (!inv.tenant_name.trim()) return alert('임차인 이름을 입력해주세요.')

    const carInfo = calcSelected ? `${calcSelected.cat} ${calcSelected.name}` : (inv.rental_car || '대차')
    const periodDesc = calcSelected
      ? `${calcDays > 0 ? `${calcDays}일` : ''}${calcHours > 0 ? ` ${calcHours}시간` : ''}`.trim()
      : ''

    setQSaving(true)
    try {
      // DB 저장
      const memoText = [
        `[청구서] ${carInfo}`,
        periodDesc ? `기간: ${periodDesc}` : '',
        inv.tenant_phone.trim() ? `연락처: ${inv.tenant_phone.trim()}` : '',
        inv.memo || '',
      ].filter(Boolean).join(' | ')

      const basePayload: Record<string, any> = {
        company_id: companyId,
        customer_name: inv.tenant_name.trim(),
        rent_fee: totalAmount,
        deposit: 0,
        memo: memoText,
        status: 'draft',
      }

      let { data, error } = await supabase.from('quotes').insert({
        ...basePayload,
        rental_type: '청구서',
      }).select().single()

      if (error && error.message.includes('column')) {
        const result = await supabase.from('quotes').insert(basePayload).select().single()
        data = result.data
        error = result.error
      }

      if (error) throw error
      setQuotes(prev => [{ ...data, car: null, contract: null, customer: null }, ...prev])

      // PDF 다운로드
      if (download) {
        try {
          const res = await fetch('/api/quotes/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quote_id: data.id,
              // 회사/담당자
              company_name: '주식회사에프엠아이',
              company_phone: '01033599559',
              staff_name: user?.email?.split('@')[0] || '',
              staff_phone: '',
              // 임차인
              tenant_name: inv.tenant_name.trim(),
              tenant_phone: inv.tenant_phone.trim(),
              tenant_birth: inv.tenant_birth,
              tenant_address: inv.tenant_address,
              license_number: inv.license_number,
              license_type: inv.license_type,
              // 대차
              rental_car: carInfo,
              rental_plate: inv.rental_plate,
              fuel_type: inv.fuel_type,
              rental_start: inv.rental_start,
              fuel_out: inv.fuel_out,
              fuel_in: inv.fuel_in,
              // 요금
              return_datetime: inv.return_datetime,
              rental_hours: periodDesc || '배차중',
              total_fee: f(totalAmount),
              // 메모
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
        fuel_out: '1%', fuel_in: '1%', memo: '',
      })
      setInvManualAmount(0)
      alert('청구서가 저장되었습니다!')
    } catch (err: any) {
      alert(`저장 실패: ${err?.message || JSON.stringify(err)}`)
    } finally {
      setQSaving(false)
    }
  }, [companyId, inv, calcSelected, calcDays, calcHours, calcDiscount, invManualAmount, user])

  // ── Calc filtered vehicles ──
  const calcFiltered = LOTTE_QUICK.filter(l => {
    if (calcCat !== '전체' && l.cat !== calcCat) return false
    if (calcSearch && !l.name.toLowerCase().includes(calcSearch.toLowerCase()) && !l.cat.includes(calcSearch)) return false
    return true
  })

  const calcRentOnly = calcSelected
    ? calcQuickRate(calcSelected.rate, calcDiscount, calcDays, calcHours)
    : 0
  // 과실비율 적용: 토글 ON이면 항상 적용 (자차과실% + 서비스지원% 즉시 반영)
  const calcFaultActive = calcFaultEnabled
  const calcFaultAmount = calcFaultActive ? Math.round(calcRentOnly * calcFaultPercent / 100) : calcRentOnly
  const calcSupportAmount = calcFaultActive && calcServiceSupport > 0 ? Math.round(calcRentOnly * calcServiceSupport / 100) : 0
  const calcFinalRent = calcFaultActive ? Math.max(0, calcFaultAmount - calcSupportAmount) : calcRentOnly
  const calcResult = calcFinalRent + calcDelivery * 10000

  // ============================================================================
  // RENDER
  // ============================================================================
  if (role === 'god_admin' && !adminSelectedCompanyId) {
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

      {/* ═══ 통합 탭 (언더라인 스타일) ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', flex: 1 }}>
          {([
            { key: 'long_term' as MainTab, label: '장기', count: mainTabCounts.long_term },
            { key: 'short_term' as MainTab, label: '단기', count: mainTabCounts.short_term },
            { key: 'invoice' as MainTab, label: '청구서', count: null },
            { key: 'calc' as MainTab, label: '계산기', count: null },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => { setMainTab(t.key); setStatusFilter('all'); setShortStatusFilter('all'); setSearchTerm(''); setSortBy('latest') }}
              style={{
                padding: '10px 20px', border: 'none', cursor: 'pointer', background: 'transparent',
                fontSize: 14, fontWeight: 700, transition: 'all 0.15s',
                color: mainTab === t.key ? '#1e3a5f' : '#9ca3af',
                borderBottom: mainTab === t.key ? '2px solid #1e3a5f' : '2px solid transparent',
                marginBottom: -2,
              }}
            >
              {t.label}
              {t.count !== null && (
                <span style={{
                  marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 8,
                  background: mainTab === t.key ? '#eef2ff' : '#f3f4f6',
                  color: mainTab === t.key ? '#1e3a5f' : '#9ca3af',
                }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
        {(mainTab === 'long_term' || mainTab === 'short_term') && <NewQuoteButton mainTab={mainTab} />}
      </div>

      {/* ═══ 칩 필터 + 정렬 + 검색 (계약관리 동일 스타일) ═══ */}
      {(mainTab === 'long_term' || mainTab === 'short_term') && !loading && (
        <div style={{ marginBottom: 16 }}>
          {/* 칩 필터 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {mainTab === 'long_term' ? (
              ([
                { id: 'all' as StatusFilter, label: '전체', count: statusCounts.all },
                { id: 'draft' as StatusFilter, label: '작성중', count: statusCounts.draft },
                { id: 'shared' as StatusFilter, label: '발송됨', count: statusCounts.shared },
                { id: 'signed' as StatusFilter, label: '서명완료', count: statusCounts.signed },
                { id: 'contracted' as StatusFilter, label: '계약전환', count: statusCounts.contracted },
                { id: 'archived' as StatusFilter, label: '보관', count: statusCounts.archived },
              ]).map(chip => (
                <button
                  key={chip.id}
                  onClick={() => setStatusFilter(chip.id)}
                  style={{
                    padding: '6px 16px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                    background: statusFilter === chip.id ? '#2d5fa8' : '#f3f4f6',
                    color: statusFilter === chip.id ? '#fff' : '#6b7280',
                  }}
                >
                  {statusFilter === chip.id && '● '}{chip.label}
                  <span style={{
                    marginLeft: 6, fontSize: 11, fontWeight: 700,
                    background: statusFilter === chip.id ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
                    color: statusFilter === chip.id ? '#fff' : '#6b7280',
                    padding: '1px 7px', borderRadius: 10,
                  }}>{chip.count}</span>
                </button>
              ))
            ) : (
              ([
                { id: 'all' as ShortStatusFilter, label: '전체', count: shortStatusCounts.all },
                { id: 'draft' as ShortStatusFilter, label: '작성중', count: shortStatusCounts.draft },
                { id: 'sent' as ShortStatusFilter, label: '발송됨', count: shortStatusCounts.sent },
                { id: 'accepted' as ShortStatusFilter, label: '수락됨', count: shortStatusCounts.accepted },
                { id: 'contracted' as ShortStatusFilter, label: '계약완료', count: shortStatusCounts.contracted },
                { id: 'cancelled' as ShortStatusFilter, label: '취소', count: shortStatusCounts.cancelled },
              ]).map(chip => (
                <button
                  key={chip.id}
                  onClick={() => setShortStatusFilter(chip.id)}
                  style={{
                    padding: '6px 16px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                    background: shortStatusFilter === chip.id ? '#2d5fa8' : '#f3f4f6',
                    color: shortStatusFilter === chip.id ? '#fff' : '#6b7280',
                  }}
                >
                  {shortStatusFilter === chip.id && '● '}{chip.label}
                  <span style={{
                    marginLeft: 6, fontSize: 11, fontWeight: 700,
                    background: shortStatusFilter === chip.id ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
                    color: shortStatusFilter === chip.id ? '#fff' : '#6b7280',
                    padding: '1px 7px', borderRadius: 10,
                  }}>{chip.count}</span>
                </button>
              ))
            )}
          </div>

          {/* 정렬 + 검색 */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>정렬:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                style={{
                  padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8,
                  fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer', background: '#fff',
                }}
              >
                <option value="latest">최신순</option>
                <option value="customer">고객명순</option>
                <option value="expiry">만료일순</option>
                <option value="rent">렌트료순</option>
              </select>
            </div>
            <input
              type="text"
              placeholder="🔍 고객명, 차량번호, 브랜드 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                flex: 1, padding: '7px 14px', border: '1px solid #e5e7eb', borderRadius: 8,
                fontSize: 13, outline: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            />
          </div>
        </div>
      )}

      {/* ═══ TAB: 빠른 계산기 ═══ */}
      {mainTab === 'calc' && (
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

          {/* 오른쪽: 계산 패널 (미니멀 플랫) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 340, flexShrink: 0 }}>

            {/* 설정 카드 — 수평 row 구조 */}
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
              {/* 자차과실 (과실 ON일 때만) */}
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

            {/* 결과 카드 — 다크 네이비 */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderRadius: 10, padding: 18, textAlign: 'center' }}>
              {calcSelected ? (
                <>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                    {calcSelected.cat} · {calcSelected.name} · {calcDays > 0 ? `${calcDays}일` : ''}{calcHours > 0 ? ` ${calcHours}시간` : ''}
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 900, color: '#fff', letterSpacing: -1 }}>
                    {f(calcResult)}<span style={{ fontSize: 14, color: '#475569', marginLeft: 2 }}>원</span>
                  </div>
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
                onClick={() => setMainTab('invoice')}
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
      )}

      {/* ═══ TAB: 청구서 작성 ═══ */}
      {mainTab === 'invoice' && (() => {
        const iS = { width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' as const, outline: 'none' }
        const lS = { fontSize: 10, fontWeight: 700 as const, color: '#6b7280', display: 'block', marginBottom: 2 }
        const secTitle = (t: string) => <div style={{ fontSize: 13, fontWeight: 800, color: '#1e3a5f', padding: '10px 0 6px', borderBottom: '1px solid #e5e7eb', marginBottom: 10 }}>{t}</div>
        const rentalCarValue = calcSelected ? `${calcSelected.cat} ${calcSelected.name}` : inv.rental_car || ''
        return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

          {/* ── 좌측: 청구서 입력 폼 ── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px' }}>

            {/* 임차인 정보 */}
            {secTitle('임차인 정보')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={lS}>임차인 *</label>
                <input value={inv.tenant_name} onChange={e => setField('tenant_name', e.target.value)} placeholder="홍길동" style={iS} />
              </div>
              <div>
                <label style={lS}>연락처</label>
                <input value={inv.tenant_phone} onChange={e => setField('tenant_phone', e.target.value)} placeholder="010-0000-0000" style={iS} />
              </div>
              <div>
                <label style={lS}>생년월일</label>
                <input value={inv.tenant_birth} onChange={e => setField('tenant_birth', e.target.value)} placeholder="900101-1******" style={iS} />
              </div>
              <div>
                <label style={lS}>면허구분</label>
                <select value={inv.license_type} onChange={e => setField('license_type', e.target.value)} style={iS}>
                  <option>1종보통</option><option>2종보통</option><option>1종대형</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={lS}>주소</label>
              <input value={inv.tenant_address} onChange={e => setField('tenant_address', e.target.value)} placeholder="주소 입력" style={iS} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lS}>운전면허번호</label>
              <input value={inv.license_number} onChange={e => setField('license_number', e.target.value)} placeholder="00-00-000000-00" style={iS} />
            </div>

            {/* 대차 정보 */}
            {secTitle('대차 정보')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div>
                <label style={lS}>대차 차종 {calcSelected ? '(계산기 연동)' : ''}</label>
                <input
                  value={rentalCarValue}
                  onChange={e => { if (!calcSelected) setField('rental_car' as any, e.target.value) }}
                  readOnly={!!calcSelected}
                  placeholder="차종 입력 (계산기에서 자동입력)"
                  style={{ ...iS, ...(calcSelected ? { background: '#f3f4f6', color: '#6b7280' } : {}) }}
                />
              </div>
              <div>
                <label style={lS}>차량번호</label>
                <input value={inv.rental_plate} onChange={e => setField('rental_plate', e.target.value)} placeholder="00하0000" style={iS} />
              </div>
              <div>
                <label style={lS}>유종</label>
                <select value={inv.fuel_type} onChange={e => setField('fuel_type', e.target.value)} style={iS}>
                  <option>전기</option><option>가솔린</option><option>디젤</option><option>LPG</option><option>하이브리드</option>
                </select>
              </div>
              <div>
                <label style={lS}>대여일시</label>
                <input value={inv.rental_start} onChange={e => setField('rental_start', e.target.value)} placeholder="2026/01/01 10:00" style={iS} />
              </div>
              <div>
                <label style={lS}>반납예정일</label>
                <input value={inv.return_datetime} onChange={e => setField('return_datetime', e.target.value)} placeholder="2026/01/08 10:00" style={iS} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={lS}>배차 유류</label>
                  <input value={inv.fuel_out} onChange={e => setField('fuel_out', e.target.value)} placeholder="1%" style={iS} />
                </div>
                <div>
                  <label style={lS}>반납 유류</label>
                  <input value={inv.fuel_in} onChange={e => setField('fuel_in', e.target.value)} placeholder="1%" style={iS} />
                </div>
              </div>
            </div>

            {/* 메모 */}
            {secTitle('기타 계약사항')}
            <div style={{ marginBottom: 8 }}>
              <textarea value={inv.memo} onChange={e => setField('memo', e.target.value)} placeholder="기타 계약사항 메모"
                rows={3} style={{ ...iS, resize: 'vertical' }} />
            </div>
          </div>

          {/* ── 우측: 요금 요약 + 버튼 ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 320, flexShrink: 0 }}>

            {/* 요금 요약 카드 */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderRadius: 10, padding: 18, textAlign: 'center' }}>
              {calcSelected ? (
                <>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                    {calcSelected.cat} · {calcSelected.name} · {calcDays > 0 ? `${calcDays}일` : ''}{calcHours > 0 ? ` ${calcHours}시간` : ''}
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 900, color: '#fff', letterSpacing: -1 }}>
                    {f(calcResult)}<span style={{ fontSize: 14, color: '#475569', marginLeft: 2 }}>원</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>렌트 {f(calcRentOnly)}</span>
                    {calcFaultActive && <span style={{ fontSize: 11, color: '#fb923c' }}>과실 {calcFaultPercent}%</span>}
                    {calcSupportAmount > 0 && <span style={{ fontSize: 11, color: '#4ade80' }}>지원 -{calcServiceSupport}%</span>}
                    {calcDelivery > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>탁송 {calcDelivery}만</span>}
                  </div>
                </>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>계산기에서 차종을 선택하면</div>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>요금이 자동으로 표시됩니다</div>
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => setMainTab('calc')}
                      style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#cbd5e1', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      계산기로 이동
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 직접 금액 입력 (계산기 미사용 시) */}
            {!calcSelected && (
              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>직접 금액 입력 (원)</label>
                <input
                  type="number"
                  value={invManualAmount}
                  onChange={e => setInvManualAmount(Number(e.target.value))}
                  placeholder="0"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 16, fontWeight: 900, color: '#2d5fa8', textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
                />
                {invManualAmount > 0 && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, textAlign: 'right' }}>{f(invManualAmount)}원</div>
                )}
              </div>
            )}

            {/* 안내 */}
            <div style={{ background: '#eff6ff', borderRadius: 10, padding: '12px 16px', border: '1px solid #dbeafe' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', marginBottom: 4 }}>단기렌트 계약서 PDF</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
                입력한 정보로 단기렌트 계약서 PDF가 생성됩니다. 계산기에서 차종 선택 후 이 탭으로 이동하면 금액이 자동 연동됩니다.
              </div>
            </div>

            {/* 저장 / PDF 다운로드 버튼 */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleInvoiceSave(false, calcSelected ? calcResult : invManualAmount)}
                disabled={qSaving}
                style={{
                  flex: 1, padding: '12px', border: '1px solid #e5e7eb', borderRadius: 10,
                  background: '#fff', color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  opacity: qSaving ? 0.5 : 1,
                }}
              >
                {qSaving ? '저장 중...' : '저장만'}
              </button>
              <button
                onClick={() => handleInvoiceSave(true, calcSelected ? calcResult : invManualAmount)}
                disabled={qSaving}
                style={{
                  flex: 2, padding: '12px', border: 'none', borderRadius: 10,
                  background: 'linear-gradient(135deg, #2d5fa8, #1e40af)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(45,95,168,0.3)',
                  opacity: qSaving ? 0.5 : 1,
                }}
              >
                {qSaving ? '처리 중...' : '저장 + PDF 다운로드'}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* ═══ TAB: 견적 목록 (장기/단기) ═══ */}
      {(mainTab === 'long_term' || mainTab === 'short_term') && (<>

      {/* Short-term detail modal */}
      {selectedShortQuote && (
        <ShortTermDetailModal
          quote={selectedShortQuote}
          onClose={() => setSelectedShortQuote(null)}
          onStatusChange={handleShortStatusChange}
          onDelete={handleShortDelete}
        />
      )}

      {/* ── 테이블 (계약관리와 동일 스타일) ── */}
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        {loading ? (
          <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
        ) : mainTab === 'short_term' ? (
          /* ======================== SHORT-TERM TAB ======================== */
          displayedShortQuotes.length === 0 ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⏱️</div>
              {shortQuotes.length === 0 ? '단기렌트 견적이 없습니다.' : '해당 조건의 견적이 없습니다.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-left text-sm" style={{ minWidth: 800 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 16px', paddingLeft: 24, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>상태</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>견적번호</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>고객/업체</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>연락처</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>차종 구성</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>합계</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>할인</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>작성일</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedShortQuotes.map((sq, idx) => {
                    const detail = sq.quote_detail || {}
                    const items = detail.items || []
                    const total = detail.totalWithVat || detail.total || 0
                    const vehicleSummary = items.length > 0
                      ? items.slice(0, 2).map((it: any) => it.vehicleClass || it.group).join(', ') + (items.length > 2 ? ` 외 ${items.length - 2}건` : '')
                      : '-'
                    return (
                      <tr key={sq.id}
                        onClick={() => setSelectedShortQuote(sq)}
                        style={{ cursor: 'pointer', borderBottom: idx < displayedShortQuotes.length - 1 ? '1px solid #f3f4f6' : 'none', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '12px 16px', paddingLeft: 24 }}><ShortTermStatusBadge status={sq.status} /></td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827', fontFamily: 'monospace', fontSize: 12 }}>{sq.quote_number || '-'}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827' }}>{sq.customer_name}</td>
                        <td style={{ padding: '12px 16px', color: '#4b5563', fontSize: 13 }}>{sq.customer_phone || '-'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>{vehicleSummary}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <span style={{ fontWeight: 900, color: '#2d5fa8' }}>{f(total)}원</span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706', background: '#fffbeb', padding: '2px 8px', borderRadius: 4 }}>{sq.discount_percent || 0}%</span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{formatDate(sq.created_at)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            {sq.status === 'draft' && (
                              <button onClick={() => handleShortStatusChange(sq.id, 'sent')} style={{ fontSize: 11, background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: 'none', cursor: 'pointer' }}>발송</button>
                            )}
                            {sq.status === 'sent' && (
                              <button onClick={() => handleShortStatusChange(sq.id, 'accepted')} style={{ fontSize: 11, background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: 'none', cursor: 'pointer' }}>수락</button>
                            )}
                            {sq.status === 'accepted' && (
                              <button onClick={() => handleShortStatusChange(sq.id, 'contracted')} style={{ fontSize: 11, background: '#faf5ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: 'none', cursor: 'pointer' }}>계약</button>
                            )}
                            {sq.status !== 'cancelled' && sq.status !== 'contracted' && (
                              <button onClick={() => handleShortStatusChange(sq.id, 'cancelled')} style={{ fontSize: 11, background: '#f3f4f6', color: '#9ca3af', padding: '2px 8px', borderRadius: 6, fontWeight: 700, border: 'none', cursor: 'pointer' }}>취소</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* ======================== LONG-TERM QUOTES TAB ======================== */
          displayedQuotes.length === 0 ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              {quotes.length === 0 ? '발행된 견적서가 없습니다.' : '해당 조건의 견적서가 없습니다.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-left text-sm" style={{ minWidth: 800 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 16px', paddingLeft: 24, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>상태</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>고객명</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>차량</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>견적기간</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>보증금</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>월 렌트료</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>발송일</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>작성일</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedQuotes.map((quote, idx) => (
                    <tr
                      key={quote.id}
                      onClick={() => router.push(`/quotes/${quote.id}`)}
                      style={{
                        cursor: 'pointer', transition: 'background 0.15s',
                        borderBottom: idx < displayedQuotes.length - 1 ? '1px solid #f3f4f6' : 'none',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', paddingLeft: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <QuoteStatusBadge quote={quote} />
                          {(quote.rental_type === '청구서' || quote.memo?.startsWith('[청구서]')) && (
                            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#d97706' }}>청구</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827' }}>{quote.customer_name}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {(quote.rental_type === '청구서' || quote.memo?.startsWith('[청구서]')) ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #fde68a', flexShrink: 0 }}>
                              <span style={{ fontSize: 16 }}>✍️</span>
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#111827', fontSize: 12 }}>{parseInvoiceMemo(quote.memo).car}</div>
                              <div style={{ fontSize: 11, color: '#d97706' }}>청구서</div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f3f4f6', overflow: 'hidden', border: '1px solid #e5e7eb', flexShrink: 0 }}>
                              {quote.car?.image_url ? (
                                <img src={quote.car.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <span style={{ fontSize: 9, color: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>No Img</span>
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#111827', fontSize: 12 }}>{quote.car?.number || '-'}</div>
                              <div style={{ fontSize: 11, color: '#6b7280' }}>{quote.car?.brand} {quote.car?.model}</div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#4b5563', fontSize: 13 }}>
                        {(quote.rental_type === '청구서' || quote.memo?.startsWith('[청구서]'))
                          ? parseInvoiceMemo(quote.memo).period
                          : `${formatDate(quote.start_date)} ~ ${formatDate(quote.end_date)}`
                        }
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280', fontSize: 13 }}>{f(quote.deposit)}원</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <span style={{ fontWeight: 900, color: '#2d5fa8' }}>{f(Math.round((quote.rent_fee || 0) * 1.1))}원</span>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>{(quote.rental_type === '청구서' || quote.memo?.startsWith('[청구서]')) ? '/총액 (VAT포함)' : '/월 (VAT포함)'}</div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                        {quote.shared_at ? formatDate(quote.shared_at) : '-'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{formatDate(quote.created_at)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <RowActions quote={quote} onEdit={handleEdit} onArchive={handleArchive} onDelete={handleDelete} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      </>)}
    </div>
  )
}

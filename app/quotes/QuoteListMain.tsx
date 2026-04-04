'use client'
import { auth } from '@/lib/auth-client'
import { useApp } from '../context/AppContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ShortTermReplacementBuilder from './short-term/ShortTermReplacementBuilder'

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
// TYPES
// ============================================================================
type MainTab = 'long_term' | 'short_term' | 'lotte_rate'
type StatusFilter = 'all' | 'draft' | 'shared' | 'signed' | 'contracted' | 'archived'
type ShortStatusFilter = 'all' | 'draft' | 'sent' | 'accepted' | 'contracted' | 'cancelled'
type InvoiceStatusFilter = 'all' | 'draft' | 'shared' | 'signed'
type SortOption = 'latest' | 'customer' | 'expiry' | 'rent'

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
              <div style={{ fontSize: 11, color: '#9ca3af' }}>빠른 계산기 · 청구서 작성</div>
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
  const refetchRef = useRef(0)
  const fetchDataRef = useRef<(() => Promise<void>) | null>(null)

  // URL의 tab 파라미터 변경 시 탭 동기화 + 데이터 리프레시
  useEffect(() => {
    const tab = searchParams.get('tab') as MainTab
    if (tab && ['long_term', 'short_term', 'lotte_rate'].includes(tab)) {
      setMainTab(tab)
      // 첫 로드 이후 탭 전환 시 refetch
      if (refetchRef.current > 0 && fetchDataRef.current) {
        setLoading(true)
        fetchDataRef.current()
      }
      refetchRef.current++
    }
  }, [searchParams])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [shortStatusFilter, setShortStatusFilter] = useState<ShortStatusFilter>('all')
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<InvoiceStatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('latest')
  const [customers, setCustomers] = useState<Map<string, any>>(new Map())
  const [selectedShortQuote, setSelectedShortQuote] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // (계산기는 /quotes/short-term 페이지로 이동됨)

  // ── 회사 도장 (companyId 선언 후 useEffect는 아래에) ──
  const [companyStamp, setCompanyStamp] = useState('')

  // ── 청구서(단기렌트 계약서) State ──
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)
  const [qSaving, setQSaving] = useState(false)
  const [invManualAmount, setInvManualAmount] = useState(0)
  const [inv, setInv] = useState({
    // 임차인 정보
    tenant_name: '', tenant_phone: '', tenant_birth: '', tenant_address: '',
    license_number: '', license_type: '1종보통',
    // 대차 정보
    rental_car: '', rental_plate: '', fuel_type: '전기',
    rental_start: '', return_datetime: '',
    fuel_out: '1', fuel_in: '1',
    // 메모
    memo: '',
  })
  const setField = (k: keyof typeof inv, v: string) => setInv(p => ({ ...p, [k]: v }))

  // ── 자동 하이픈 포맷터 ──
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

  // ── 다음 주소검색 ──
  const openAddressSearch = () => {
    if (!(window as any).daum?.Postcode) {
      const s = document.createElement('script')
      s.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
      s.onload = () => runDaumPostcode()
      document.head.appendChild(s)
    } else {
      runDaumPostcode()
    }
  }
  const runDaumPostcode = () => {
    new (window as any).daum.Postcode({
      oncomplete: (data: any) => {
        const addr = data.roadAddress || data.jibunAddress
        setField('tenant_address', addr)
      }
    }).open()
  }

  const f = (n: number) => Math.round(n || 0).toLocaleString()
  const formatDate = (dateString: string) => dateString?.split('T')[0] || ''

  // 청구서 memo에서 차량 정보 파싱: "[청구서] 경차 · 스파크, 모닝 | 기간: 6일 3시간 | ..."
  const isInvoice = (q: any) => q.rental_type === '청구서' || q.memo?.startsWith('[청구서]')
  const parseInvoiceMemo = (memo: string) => {
    const carMatch = memo?.match(/\[청구서\]\s*(.+?)(?:\s*\||$)/)
    const periodMatch = memo?.match(/기간:\s*(.+?)(?:\s*\||$)/)
    return { car: carMatch?.[1] || '-', period: periodMatch?.[1] || '-' }
  }

  const companyId = role === 'admin' ? adminSelectedCompanyId : company?.id

  // ── 회사 도장 로드 ──
  useEffect(() => {
    const loadStamp = async () => {
      if (!companyId) return
      try {
        const headers = await getAuthHeader()
        const res = await fetch(`/api/quotes/company-settings?company_id=${companyId}`, { headers })
        const json = await res.json()
        const data = json.data ?? json
        if (data?.value?.company_stamp) {
          setCompanyStamp(data.value.company_stamp)
        } else {
          try {
            const res = await fetch('/images/company_stamp.png')
            if (res.ok) {
              const blob = await res.blob()
              const reader = new FileReader()
              reader.onload = () => setCompanyStamp(reader.result as string)
              reader.readAsDataURL(blob)
            }
          } catch {}
        }
      } catch (error) {
        console.error('Failed to load company stamp:', error)
        try {
          const res = await fetch('/images/company_stamp.png')
          if (res.ok) {
            const blob = await res.blob()
            const reader = new FileReader()
            reader.onload = () => setCompanyStamp(reader.result as string)
            reader.readAsDataURL(blob)
          }
        } catch {}
      }
    }
    loadStamp()
  }, [companyId])

  // ── Fetch all data ──
  const fetchData = useCallback(async () => {
    if (!companyId) { setLoading(false); return }

    try {
      const headers = await getAuthHeader()

      // Quotes
      const quotesRes = await fetch('/api/quotes', { headers })
      const quotesJson = await quotesRes.json()
      const quotesData = quotesJson.data || []
      if (quotesJson.error) console.error('견적 목록 로드 실패:', quotesJson.error)

      // Cars
      const carIds = quotesData.map((q: any) => q.car_id).filter(Boolean)
      let carsData: any[] = []
      if (carIds.length > 0) {
        const carsRes = await fetch('/api/cars', { headers })
        const carsJson = await carsRes.json()
        carsData = carsJson.data || []
      }

      // Contracts from quotes
      const quoteIds = quotesData.map((q: any) => q.id)
      let contractsFromQuotes: any[] = []
      if (quoteIds.length > 0) {
        const contractsRes = await fetch('/api/contracts', { headers })
        const contractsJson = await contractsRes.json()
        contractsFromQuotes = (contractsJson.data || []).filter((c: any) => quoteIds.includes(c.quote_id))
      }

      // Short-term quotes
      const stRes = await fetch('/api/short-term-quotes', { headers })
      const stJson = await stRes.json()
      setShortQuotes(stJson.data || [])

      // Customers
      const customerIds = quotesData.map((q: any) => q.customer_id).filter(Boolean)
      const uniqueCustomerIds = [...new Set(customerIds)]
      let customersData: any[] = []
      if (uniqueCustomerIds.length > 0) {
        const custRes = await fetch('/api/customers', { headers })
        const custJson = await custRes.json()
        customersData = custJson.data || []
      }

      const customersMap = new Map()
      customersData?.forEach((c: any) => customersMap.set(c.id, c))
      setCustomers(customersMap)

      const allCars = carsData || []

      // Combine quotes
      const combinedQuotes = quotesData.map((quote: any) => ({
        ...quote,
        car: allCars.find((c) => c.id === quote.car_id),
        contract: contractsFromQuotes.find((c) => c.quote_id === quote.id),
        customer: customersMap.get(quote.customer_id),
      }))

      setQuotes(combinedQuotes)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  // fetchDataRef에 저장하여 searchParams 변경 시 호출 가능하게
  useEffect(() => {
    fetchDataRef.current = fetchData
  }, [fetchData])

  // 초기 로드
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Stats ──
  const longTermQuotes = quotes.filter(q => !isInvoice(q))
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

  // 청구서 필터 (quotes에서 rental_type='청구서' 또는 memo가 [청구서]로 시작)
  const invoiceQuotes = quotes.filter(q => isInvoice(q))

  // Invoice status counts
  const invoiceStatusCounts: Record<InvoiceStatusFilter, number> = {
    all: invoiceQuotes.length,
    draft: invoiceQuotes.filter(q => !q.shared_at && !q.signed_at).length,
    shared: invoiceQuotes.filter(q => q.shared_at && !q.signed_at).length,
    signed: invoiceQuotes.filter(q => q.signed_at).length,
  }

  // 청구서 필터링 + 검색
  const filteredInvoiceQuotes = useMemo(() => {
    let result = invoiceQuotes
    if (invoiceStatusFilter === 'draft') result = result.filter(q => !q.shared_at && !q.signed_at)
    else if (invoiceStatusFilter === 'shared') result = result.filter(q => q.shared_at && !q.signed_at)
    else if (invoiceStatusFilter === 'signed') result = result.filter(q => q.signed_at)
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(q =>
        (q.customer_name || '').toLowerCase().includes(term) ||
        (q.memo || '').toLowerCase().includes(term)
      )
    }
    return result.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [invoiceQuotes, invoiceStatusFilter, searchTerm])

  const mainTabCounts: Record<MainTab, number> = {
    long_term: longTermQuotes.filter(q => q.status !== 'archived' && !isInvoice(q)).length,
    short_term: invoiceQuotes.length,
    lotte_rate: shortTermQuotes.length,
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
      const headers = await getAuthHeader()
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: 'archived' } : q))
    } catch { alert('보관 중 오류가 발생했습니다.') }
  }, [])

  const handleDelete = useCallback(async (quoteId: string) => {
    try {
      console.log('[DELETE] 견적 삭제 시작:', quoteId)
      const headers = await getAuthHeader()

      // 1. 연결된 contracts 조회
      const contractsRes = await fetch(`/api/contracts?quote_id=${quoteId}`, { headers })
      const contractsJson = await contractsRes.json()
      const linkedContracts = contractsJson.data || []

      // 2. 연결된 payment_schedules 삭제
      if (linkedContracts.length > 0) {
        const contractIds = linkedContracts.map((c: any) => c.id)
        for (const contractId of contractIds) {
          await fetch(`/api/contracts/${contractId}`, { method: 'DELETE', headers })
        }
      }

      // 3. quote_shares 삭제
      const sharesRes = await fetch(`/api/quote-shares?quote_id=${quoteId}`, { headers })
      const sharesJson = await sharesRes.json()
      const shares = sharesJson.data || []
      for (const share of shares) {
        await fetch(`/api/quote-shares/${share.id}`, { method: 'DELETE', headers })
      }

      // 4. customer_signatures 삭제
      const sigsRes = await fetch(`/api/customer-signatures?quote_id=${quoteId}`, { headers })
      const sigsJson = await sigsRes.json()
      const sigs = sigsJson.data || []
      for (const sig of sigs) {
        await fetch(`/api/customer-signatures/${sig.id}`, { method: 'DELETE', headers })
      }

      // 5. quote_share_tokens 삭제
      const tokensRes = await fetch(`/api/quote-share-tokens?quote_id=${quoteId}`, { headers })
      const tokensJson = await tokensRes.json()
      const tokens = tokensJson.data || []
      for (const token of tokens) {
        await fetch(`/api/quote-share-tokens/${token.id}`, { method: 'DELETE', headers })
      }

      // 6. 견적서 삭제
      const qRes = await fetch(`/api/quotes/${quoteId}`, { method: 'DELETE', headers })
      const qJson = await qRes.json()
      if (qJson.error) throw new Error(`견적서 삭제 실패: ${qJson.error}`)

      setQuotes(prev => prev.filter(q => q.id !== quoteId))
    } catch (err: any) {
      console.error('[DELETE] 최종 에러:', err)
      alert(`삭제 중 오류:\n${err?.message || JSON.stringify(err)}`)
    }
  }, [])

  // Short-term handlers
  const handleShortStatusChange = useCallback(async (id: string, status: string) => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/short-term-quotes/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setShortQuotes(prev => prev.map(q => q.id === id ? { ...q, status } : q))
    } catch { alert('상태 변경 중 오류가 발생했습니다.') }
  }, [])

  const handleShortDelete = useCallback(async (id: string) => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/short-term-quotes/${id}`, { method: 'DELETE', headers })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setShortQuotes(prev => prev.filter(q => q.id !== id))
    } catch { alert('삭제 중 오류가 발생했습니다.') }
  }, [])

  // ── 단기렌트 계약서 저장 + PDF 다운로드 ──
  const handleInvoiceSave = useCallback(async (download: boolean, totalAmount: number) => {
    if (!companyId) return alert('회사 정보를 찾을 수 없습니다.')
    if (!inv.tenant_name.trim()) return alert('임차인 이름을 입력해주세요.')

    const carInfo = inv.rental_car || '대차'
    const periodDesc = ''

    setQSaving(true)
    try {
      // DB 저장
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

      let data: any = null
      let error: any = null
      const headers = await getAuthHeader()

      if (editingQuoteId) {
        // ── 수정 모드: 기존 청구서 업데이트 ──
        const updatePayload: Record<string, any> = { ...basePayload }
        delete updatePayload.status // 상태는 유지
        const res = await fetch(`/api/quotes/${editingQuoteId}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        })
        const json = await res.json()
        data = json.data
        error = json.error

        if (error && error.includes?.('column')) {
          delete updatePayload.quote_detail
          const res2 = await fetch(`/api/quotes/${editingQuoteId}`, {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload),
          })
          const json2 = await res2.json()
          data = json2.data
          error = json2.error
        }

        if (error) throw error
        // 리스트 갱신
        setQuotes(prev => prev.map(q => q.id === editingQuoteId ? { ...q, ...data } : q))
      } else {
        // ── 새 청구서 생성 ──
        const res = await fetch('/api/quotes', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...basePayload,
            rental_type: '청구서',
          }),
        })
        const json = await res.json()
        data = json.data
        error = json.error

        if (error && error.includes?.('column')) {
          delete basePayload.quote_detail
          const res2 = await fetch('/api/quotes', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...basePayload,
              rental_type: '청구서',
            }),
          })
          const json2 = await res2.json()
          data = json2.data
          error = json2.error
        }

        if (error) throw error
        setQuotes(prev => [{ ...data, car: null, contract: null, customer: null }, ...prev])
      }

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
              company_address: '경기 연천군 왕징면 백동로236번길 190 3동1호',
              representative: '대표 박진숙',
              company_stamp: companyStamp,
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
              rental_start: inv.rental_start.replace('T', ' ').replace(/-/g, '/'),
              fuel_out: `${inv.fuel_out}%`,
              fuel_in: `${inv.fuel_in}%`,
              // 요금
              return_datetime: inv.return_datetime.replace('T', ' ').replace(/-/g, '/'),
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
        fuel_out: '1', fuel_in: '1', memo: '',
      })
      setInvManualAmount(0)
      setEditingQuoteId(null)
      if (!download) { /* 문자발송 버튼에서 호출 시 alert 생략 — 호출부에서 처리 */ }
      return data
    } catch (err: any) {
      alert(`저장 실패: ${err?.message || JSON.stringify(err)}`)
      return null
    } finally {
      setQSaving(false)
    }
  }, [companyId, inv, invManualAmount, user, companyStamp, editingQuoteId])

  // ============================================================================
  // RENDER
  // ============================================================================
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
      <style>{`@media (max-width: 767px) { .q-main-tabs { gap: 0 !important; } .q-main-tabs button { padding: 8px 10px !important; font-size: 12px !important; } .q-chip-wrap { gap: 4px !important; margin-bottom: 6px !important; } .q-chip-wrap button { padding: 4px 10px !important; font-size: 11px !important; } .q-sort-search { gap: 6px !important; } .q-sort-search input { font-size: 12px !important; padding: 6px 10px !important; } .q-new-btn { padding: 6px 10px !important; font-size: 11px !important; } .q-sort-label { display: none !important; } }`}</style>

      {/* ═══ 통합 탭 (언더라인 스타일) ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div className="q-main-tabs" style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', flex: 1, overflow: 'auto' }}>
          {([
            { key: 'long_term' as MainTab, label: '장기', count: mainTabCounts.long_term },
            { key: 'short_term' as MainTab, label: '단기', count: mainTabCounts.short_term },
            { key: 'lotte_rate' as MainTab, label: '롯데렌터카요금표', shortLabel: '요금표', count: null },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => { setMainTab(t.key); setStatusFilter('all'); setShortStatusFilter('all'); setInvoiceStatusFilter('all'); setSearchTerm(''); setSortBy('latest') }}
              style={{
                padding: '10px 20px', border: 'none', cursor: 'pointer', background: 'transparent',
                fontSize: 14, fontWeight: 700, transition: 'all 0.15s', whiteSpace: 'nowrap',
                color: mainTab === t.key ? '#1e3a5f' : '#9ca3af',
                borderBottom: mainTab === t.key ? '2px solid #1e3a5f' : '2px solid transparent',
                marginBottom: -2,
              }}
            >
              {t.label}
              {t.count !== null && (
                <span style={{
                  marginLeft: 4, fontSize: 11, padding: '1px 6px', borderRadius: 8,
                  background: mainTab === t.key ? '#eef2ff' : '#f3f4f6',
                  color: mainTab === t.key ? '#1e3a5f' : '#9ca3af',
                }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
        {/* 장기 탭: 새 견적(장기) 버튼 */}
        {mainTab === 'long_term' && (
          <Link
            href="/quotes/pricing"
            className="q-new-btn"
            style={{
              padding: '7px 16px', background: '#2d5fa8', color: '#fff', border: 'none',
              borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
              marginLeft: 8, flexShrink: 0,
            }}
          >
            + 새 견적
          </Link>
        )}
        {/* 단기 탭: 새 견적 */}
        {mainTab === 'short_term' && (
          <Link
            href="/quotes/short-term"
            className="q-new-btn"
            style={{
              padding: '7px 14px', background: '#2d5fa8', color: '#fff', border: 'none',
              borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
              textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
              marginLeft: 8, flexShrink: 0,
            }}
          >
            + 새 견적
          </Link>
        )}
      </div>

      {/* ═══ 칩 필터 + 정렬 + 검색 (계약관리 동일 스타일) ═══ */}
      {(mainTab === 'long_term' || mainTab === 'short_term') && !loading && (
        <div style={{ marginBottom: 12 }}>
          {/* 칩 필터 */}
          <div className="q-chip-wrap" style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {(mainTab === 'long_term'
              ? [
                  { id: 'all' as StatusFilter, label: '전체', count: statusCounts.all },
                  { id: 'draft' as StatusFilter, label: '작성중', count: statusCounts.draft },
                  { id: 'shared' as StatusFilter, label: '발송됨', count: statusCounts.shared },
                  { id: 'signed' as StatusFilter, label: '서명완료', count: statusCounts.signed },
                  { id: 'contracted' as StatusFilter, label: '계약전환', count: statusCounts.contracted },
                  { id: 'archived' as StatusFilter, label: '보관', count: statusCounts.archived },
                ]
              : [
                  { id: 'all' as InvoiceStatusFilter, label: '전체', count: invoiceStatusCounts.all },
                  { id: 'draft' as InvoiceStatusFilter, label: '임시저장', count: invoiceStatusCounts.draft },
                  { id: 'shared' as InvoiceStatusFilter, label: '발송됨', count: invoiceStatusCounts.shared },
                  { id: 'signed' as InvoiceStatusFilter, label: '서명완료', count: invoiceStatusCounts.signed },
                ]
            ).map(chip => {
              const isActive = mainTab === 'long_term' ? statusFilter === chip.id : invoiceStatusFilter === chip.id
              const onClick = () => {
                if (mainTab === 'long_term') setStatusFilter(chip.id as StatusFilter)
                else setInvoiceStatusFilter(chip.id as InvoiceStatusFilter)
              }
              return (
                <button
                  key={chip.id}
                  onClick={onClick}
                  style={{
                    padding: '6px 16px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                    background: isActive ? '#2d5fa8' : '#f3f4f6',
                    color: isActive ? '#fff' : '#6b7280',
                  }}
                >
                  {isActive && '● '}{chip.label}
                  <span style={{
                    marginLeft: 6, fontSize: 11, fontWeight: 700,
                    background: isActive ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
                    color: isActive ? '#fff' : '#6b7280',
                    padding: '1px 7px', borderRadius: 10,
                  }}>{chip.count}</span>
                </button>
              )
            })}
          </div>

          {/* 정렬 + 검색 */}
          <div className="q-sort-search" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span className="q-sort-label" style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>정렬:</span>
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

      {/* ═══ TAB: 단기 리스트 (구 청구서) ═══ */}
      {mainTab === 'short_term' && (() => {
        const openInvoice = (q: any) => {
          const detail = q.quote_detail || {}
          const parsed = parseInvoiceMemo(q.memo || '')
          setEditingQuoteId(q.id)
          setInv({
            tenant_name: detail.tenant_name || q.customer_name || '',
            tenant_phone: detail.tenant_phone || '',
            tenant_birth: detail.tenant_birth || '',
            tenant_address: detail.tenant_address || '',
            license_number: detail.license_number || '',
            license_type: detail.license_type || '1종보통',
            rental_car: detail.rental_car || parsed.car || '',
            rental_plate: detail.rental_plate || '',
            fuel_type: detail.fuel_type || '전기',
            rental_start: detail.rental_start || '',
            return_datetime: detail.return_datetime || '',
            fuel_out: detail.fuel_out || '1',
            fuel_in: detail.fuel_in || '1',
            memo: detail.memo || '',
          })
          setInvManualAmount(detail.total_amount || q.rent_fee || 0)
          setInvoiceOpen(true)
        }
        const getBadge = (q: any) => q.signed_at
          ? { label: '서명완료', bg: '#dcfce7', color: '#16a34a' }
          : q.shared_at
          ? { label: '발송됨', bg: '#dbeafe', color: '#2563eb' }
          : { label: '임시저장', bg: '#fef3c7', color: '#d97706' }

        return (
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
          {filteredInvoiceQuotes.length === 0 ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              {invoiceQuotes.length === 0 ? '단기렌트 청구서가 없습니다.' : '해당 조건의 청구서가 없습니다.'}
            </div>
          ) : (<>
            {/* 데스크톱: 테이블 */}
            <div className="hidden md:block" style={{ overflowX: 'auto' }}>
              <table className="w-full text-left text-sm" style={{ minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 16px', paddingLeft: 24, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>상태</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>임차인</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>차종</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>대여기간</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>금액</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>작성일</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoiceQuotes.map((q: any, idx: number) => {
                    const parsed = parseInvoiceMemo(q.memo || '')
                    const badge = getBadge(q)
                    return (
                      <tr key={q.id} onClick={() => openInvoice(q)}
                        style={{ cursor: 'pointer', borderBottom: idx < filteredInvoiceQuotes.length - 1 ? '1px solid #f3f4f6' : 'none', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '12px 16px', paddingLeft: 24 }}>
                          <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color }}>{badge.label}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827' }}>{q.customer_name || '(미입력)'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>{parsed.car || '-'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>{parsed.period || '-'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <span style={{ fontWeight: 900, color: '#2d5fa8' }}>{f(q.rent_fee || 0)}원</span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{formatDate(q.created_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* 모바일: 카드형 */}
            <div className="md:hidden">
              {filteredInvoiceQuotes.map((q: any) => {
                const parsed = parseInvoiceMemo(q.memo || '')
                const badge = getBadge(q)
                return (
                  <div key={q.id} onClick={() => openInvoice(q)}
                    style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, flexShrink: 0 }}>{badge.label}</span>
                        <span style={{ fontWeight: 700, color: '#111827', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customer_name || '(미입력)'}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{parsed.car || '-'} · {parsed.period || '-'}</span>
                      </div>
                      <span style={{ fontWeight: 900, color: '#2d5fa8', fontSize: 14, flexShrink: 0, marginLeft: 8 }}>{f(q.rent_fee || 0)}원</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>)}
        </div>
        )
      })()}

      {/* ═══ TAB: 롯데렌터카요금표 ═══ */}
      {mainTab === 'lotte_rate' && (
        <ShortTermReplacementBuilder />
      )}

      {/* ═══ TAB: 장기 견적 목록 ═══ */}
      {mainTab === 'long_term' && (
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        {loading ? (
          <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
        ) : (
          displayedQuotes.length === 0 ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              {quotes.length === 0 ? '발행된 견적서가 없습니다.' : '해당 조건의 견적서가 없습니다.'}
            </div>
          ) : (<>
            {/* 데스크톱: 테이블 */}
            <div className="hidden md:block" style={{ overflowX: 'auto' }}>
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
            {/* 모바일: 카드형 */}
            <div className="md:hidden">
              {displayedQuotes.map((quote) => {
                const isInv = quote.rental_type === '청구서' || quote.memo?.startsWith('[청구서]')
                const parsed = isInv ? parseInvoiceMemo(quote.memo) : null
                return (
                  <div key={quote.id} onClick={() => router.push(`/quotes/${quote.id}`)}
                    style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <QuoteStatusBadge quote={quote} />
                        {isInv && <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#d97706' }}>청구</span>}
                        <span style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>{quote.customer_name || '(미입력)'}</span>
                      </div>
                      <span style={{ fontWeight: 900, color: '#2d5fa8', fontSize: 14, flexShrink: 0 }}>{f(Math.round((quote.rent_fee || 0) * 1.1))}원</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 2 }}>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>
                        {isInv
                          ? `${parsed?.car || '-'} · ${parsed?.period || '-'}`
                          : `${quote.car?.brand || ''} ${quote.car?.model || ''} ${quote.car?.number ? `(${quote.car.number})` : ''}`
                        }
                      </span>
                      <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>
                        {isInv ? '' : `${formatDate(quote.start_date)}~${formatDate(quote.end_date)}`}
                        {' '}{formatDate(quote.created_at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>)
        )}
      </div>
      )}

      {/* ═══ 청구서 작성 모달 ═══ */}
      {invoiceOpen && (() => {
        const iS = { width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' as const, outline: 'none' }
        const lS = { fontSize: 10, fontWeight: 700 as const, color: '#6b7280', display: 'block', marginBottom: 2 }
        return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => { setInvoiceOpen(false); setEditingQuoteId(null) }}
          />
          <div style={{
            position: 'relative', background: '#fff', borderRadius: 16, padding: '24px 28px',
            width: '90%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            animation: 'fadeInUp 0.2s ease-out',
          }}>
            <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1e3a5f' }}>📄 {editingQuoteId ? '청구서 수정' : '청구서 작성'}</div>
              <button onClick={() => { setInvoiceOpen(false); setEditingQuoteId(null) }} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>✕</button>
            </div>

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
                  <div><label style={lS}>차종</label><input value={inv.rental_car} onChange={e => setField('rental_car', e.target.value)} placeholder="차종" style={iS} /></div>
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
                  <div><label style={lS}>금액 (원)</label><input type="number" value={invManualAmount} onChange={e => setInvManualAmount(Number(e.target.value))} style={{ ...iS, fontSize: 14, fontWeight: 900, color: '#2d5fa8', textAlign: 'right' }} /></div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 20 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', lineHeight: '32px' }}>발송:</span>
                <button
                  onClick={async () => {
                    if (!inv.tenant_name.trim()) return alert('임차인 이름을 입력해주세요.')
                    if (!inv.tenant_phone.trim()) return alert('연락처를 입력해주세요.')
                    const phone = inv.tenant_phone.replace(/-/g, '')
                    const carInfo = inv.rental_car || '대차'
                    const amount = f(invManualAmount)
                    try {
                      // 1) 저장
                      const saved = await handleInvoiceSave(false, invManualAmount)
                      if (!saved) return
                      const quoteId = (saved as any)?.id
                      if (!quoteId) return alert('저장 실패')
                      // 2) 토큰 생성
                      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
                      if (!token) return alert('로그인이 필요합니다.')
                      const shareRes = await fetch(`/api/quotes/${quoteId}/share`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ expiryDays: 7 }),
                      })
                      const shareData = await shareRes.json()
                      if (!shareData.shareUrl) return alert('링크 생성 실패')
                      // 3) SMS 발송 (링크 포함)
                      const msg = `[에프엠아이 렌터카]\n${inv.tenant_name}님 청구서\n차종: ${carInfo}\n금액: ${amount}원\n\n확인 및 서명:\n${shareData.shareUrl}`
                      const smsRes = await fetch('/api/send-sms', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ phone, message: msg, title: '청구서 안내', recipientName: inv.tenant_name, relatedId: quoteId }),
                      })
                      const smsResult = await smsRes.json()
                      if (smsResult.success) {
                        alert('청구서가 저장되고 문자가 발송되었습니다.')
                        setInvoiceOpen(false)
                      } else {
                        alert(`저장 완료, 문자 발송 실패: ${smsResult.error || '알 수 없는 오류'}`)
                      }
                    } catch (err: any) {
                      alert(`오류: ${err.message}`)
                    }
                  }}
                  style={{ padding: '6px 14px', border: '1px solid #2d5fa8', borderRadius: 8, background: 'linear-gradient(135deg, #2d5fa8, #1e40af)', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >📱 저장 + 문자발송</button>
                <button
                  onClick={() => {
                    const carInfo = inv.rental_car || '대차'
                    const amount = f(invManualAmount)
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
                  onClick={() => { handleInvoiceSave(false, invManualAmount); setInvoiceOpen(false) }}
                  disabled={qSaving}
                  style={{ padding: '10px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: qSaving ? 0.5 : 1 }}
                >{qSaving ? '저장 중...' : '저장'}</button>
                <button
                  onClick={() => { handleInvoiceSave(true, invManualAmount); setInvoiceOpen(false) }}
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

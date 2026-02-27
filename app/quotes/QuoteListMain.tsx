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
type MainTab = 'long_term' | 'short_term' | 'contracts'
type StatusFilter = 'all' | 'draft' | 'shared' | 'confirmed' | 'archived'
type ShortStatusFilter = 'all' | 'draft' | 'sent' | 'accepted' | 'contracted' | 'cancelled'

// ============================================================================
// MAIN TAB BAR COMPONENT
// ============================================================================
function MainTabBar({
  activeTab,
  onTabChange,
  counts,
}: {
  activeTab: MainTab
  onTabChange: (tab: MainTab) => void
  counts: Record<MainTab, number>
}) {
  const tabs: { value: MainTab; label: string; icon: string }[] = [
    { value: 'long_term', label: '장기렌트', icon: '📋' },
    { value: 'short_term', label: '단기렌트', icon: '⏱️' },
    { value: 'contracts', label: '계약', icon: '✅' },
  ]

  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
            activeTab === tab.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.icon} {tab.label}
          <span className={`ml-1.5 text-xs ${activeTab === tab.value ? 'text-steel-600' : 'opacity-60'}`}>
            {counts[tab.value] || 0}
          </span>
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// STATUS FILTER TABS (sub-filter for quotes)
// ============================================================================
function StatusFilterTabs({
  activeFilter,
  onFilterChange,
  counts,
}: {
  activeFilter: StatusFilter
  onFilterChange: (filter: StatusFilter) => void
  counts: Record<StatusFilter, number>
}) {
  const tabs: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'draft', label: '견적단계' },
    { value: 'shared', label: '발송됨' },
    { value: 'confirmed', label: '계약확정' },
    { value: 'archived', label: '보관' },
  ]

  return (
    <div className="flex gap-1.5 flex-wrap">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onFilterChange(tab.value)}
          className={`px-3 py-2 rounded-lg font-bold text-xs transition-all ${
            activeFilter === tab.value
              ? 'bg-steel-600 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {tab.label} <span className="opacity-75">({counts[tab.value] || 0})</span>
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// NEW QUOTE DROPDOWN BUTTON
// ============================================================================
function NewQuoteButton() {
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-4 py-2.5 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-all flex items-center gap-1.5 shadow-lg shadow-steel-600/10 whitespace-nowrap"
      >
        <span className="text-lg leading-none">+</span> 새 견적
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-xl border border-gray-200 shadow-xl z-50 min-w-[200px] overflow-hidden">
          <Link
            href="/quotes/pricing"
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100"
            onClick={() => setOpen(false)}
          >
            <span className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-base">📋</span>
            <div>
              <p className="font-bold text-sm text-gray-900">장기렌트 견적</p>
              <p className="text-[11px] text-gray-400">렌탈료 산출 · 견적서 작성</p>
            </div>
          </Link>
          <Link
            href="/quotes/short-term"
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            onClick={() => setOpen(false)}
          >
            <span className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-base">⏱️</span>
            <div>
              <p className="font-bold text-sm text-gray-900">단기렌트 견적</p>
              <p className="text-[11px] text-gray-400">대차 · 단기 렌탈 견적</p>
            </div>
          </Link>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// ROW ACTIONS COMPONENT (Desktop)
// ============================================================================
function DesktopRowActions({
  quote,
  onEdit,
  onArchive,
  onDelete,
}: {
  quote: any
  onEdit: (quoteId: string) => void
  onArchive: (quoteId: string) => void
  onDelete: (quoteId: string) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  useEffect(() => {
    if (!showMenu) return
    const close = () => setShowMenu(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [showMenu])

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation()
          if (!showMenu && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect()
            setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
          }
          setShowMenu(!showMenu)
        }}
        className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 cursor-pointer"
      >
        ⋯
      </button>
      {showMenu && (
        <div style={{ top: menuPos.top, right: menuPos.right }}
          className="fixed bg-white rounded-lg border border-gray-200 shadow-lg z-50 min-w-[140px]">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(quote.id); setShowMenu(false) }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 font-medium text-gray-700"
          >✏️ 수정</button>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(quote.id); setShowMenu(false) }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 font-medium text-gray-700"
          >📦 보관</button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              const msg = quote.contract
                ? '⚠️ 이 견적서에 연결된 계약이 있습니다.\n계약과 함께 삭제하시겠습니까?'
                : '이 견적서를 삭제하시겠습니까?'
              if (confirm(msg)) onDelete(quote.id)
              setShowMenu(false)
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 font-medium text-red-600"
          >🗑️ 삭제</button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// QUOTE STATUS BADGE COMPONENT
// ============================================================================
function QuoteStatusBadge({ quote }: { quote: any }) {
  if (quote.status === 'archived') {
    return <span className="px-2 py-1 rounded-md text-xs font-black bg-gray-300 text-gray-700 shadow-sm">📦 보관됨</span>
  }
  if (quote.contract) {
    return <span className="px-2 py-1 rounded-md text-xs font-black bg-steel-600 text-white shadow-sm">✅ 계약확정</span>
  }
  if (quote.signed_at) {
    return <span className="px-2 py-1 rounded-md text-xs font-black bg-green-100 text-green-700 shadow-sm">서명완료</span>
  }
  if (quote.shared_at) {
    return <span className="px-2 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-700">발송됨</span>
  }
  return <span className="px-2 py-1 rounded-md text-xs font-bold bg-yellow-100 text-yellow-700">✏️ 견적단계</span>
}

// ============================================================================
// SHORT-TERM STATUS FILTER TABS
// ============================================================================
function ShortStatusFilterTabs({
  activeFilter,
  onFilterChange,
  counts,
}: {
  activeFilter: ShortStatusFilter
  onFilterChange: (filter: ShortStatusFilter) => void
  counts: Record<ShortStatusFilter, number>
}) {
  const tabs: { value: ShortStatusFilter; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'draft', label: '작성중' },
    { value: 'sent', label: '발송됨' },
    { value: 'accepted', label: '수락됨' },
    { value: 'contracted', label: '계약완료' },
    { value: 'cancelled', label: '취소' },
  ]

  return (
    <div className="flex gap-1.5 flex-wrap">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onFilterChange(tab.value)}
          className={`px-3 py-2 rounded-lg font-bold text-xs transition-all ${
            activeFilter === tab.value
              ? 'bg-amber-500 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {tab.label} <span className="opacity-75">({counts[tab.value] || 0})</span>
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// SHORT-TERM STATUS BADGE
// ============================================================================
function ShortTermStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: '✏️ 작성중', cls: 'bg-amber-100 text-amber-700' },
    sent: { label: '📤 발송됨', cls: 'bg-blue-100 text-blue-700' },
    accepted: { label: '✅ 수락됨', cls: 'bg-green-100 text-green-700' },
    contracted: { label: '📝 계약완료', cls: 'bg-purple-100 text-purple-700' },
    cancelled: { label: '취소', cls: 'bg-gray-200 text-gray-500' },
  }
  const s = map[status] || map.draft
  return <span className={`px-2 py-1 rounded-md text-xs font-bold ${s.cls}`}>{s.label}</span>
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
              className="flex-1 py-2.5 px-3 text-sm font-bold rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors">📤 발송 처리</button>
          )}
          {quote.status === 'sent' && (
            <button onClick={() => { onStatusChange(quote.id, 'accepted'); onClose() }}
              className="flex-1 py-2.5 px-3 text-sm font-bold rounded-xl bg-green-500 text-white hover:bg-green-600 transition-colors">✅ 수락 처리</button>
          )}
          {quote.status === 'accepted' && (
            <button onClick={() => { onStatusChange(quote.id, 'contracted'); onClose() }}
              className="flex-1 py-2.5 px-3 text-sm font-bold rounded-xl bg-purple-500 text-white hover:bg-purple-600 transition-colors">📝 계약 완료</button>
          )}
          {quote.status !== 'cancelled' && quote.status !== 'contracted' && (
            <button onClick={() => { onStatusChange(quote.id, 'cancelled'); onClose() }}
              className="py-2.5 px-4 text-sm font-bold rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">취소</button>
          )}
          <button onClick={() => {
            if (confirm('이 견적서를 삭제하시겠습니까?')) { onDelete(quote.id); onClose() }
          }} className="py-2.5 px-4 text-sm font-bold rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors">🗑️ 삭제</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// CONTRACT STATUS BADGE
// ============================================================================
function ContractStatusBadge({ contract }: { contract: any }) {
  const paidCount = contract.paidCount || 0
  const totalCount = contract.totalCount || 0
  if (contract.status === 'completed') {
    return <span className="px-2 py-1 rounded-md text-xs font-black bg-green-600 text-white">완납</span>
  }
  if (paidCount > 0) {
    return <span className="px-2 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-700">수납 {paidCount}/{totalCount}</span>
  }
  return <span className="px-2 py-1 rounded-md text-xs font-bold bg-steel-600 text-white">진행중</span>
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function QuoteListPage() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [quotes, setQuotes] = useState<any[]>([])
  const [shortQuotes, setShortQuotes] = useState<any[]>([])
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const initialTab = (searchParams.get('tab') as MainTab) || 'long_term'
  const [mainTab, setMainTab] = useState<MainTab>(initialTab)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [shortStatusFilter, setShortStatusFilter] = useState<ShortStatusFilter>('all')
  const [customers, setCustomers] = useState<Map<string, any>>(new Map())
  const [selectedShortQuote, setSelectedShortQuote] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const f = (n: number) => Math.round(n || 0).toLocaleString()
  const formatDate = (dateString: string) => dateString?.split('T')[0] || ''

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

        // All contracts (for contracts tab)
        const { data: allContracts, error: contractsError } = await supabase
          .from('contracts').select('*').eq('company_id', companyId).order('id', { ascending: false })
        if (contractsError) console.error('계약 목록 로드 실패:', contractsError.message)

        // Payment schedules for contracts
        const contractIds = (allContracts || []).map(c => c.id)
        const { data: paymentsData } = contractIds.length > 0
          ? await supabase.from('payment_schedules').select('contract_id, status').in('contract_id', contractIds)
          : { data: [] }

        // Customers
        const customerIds = [
          ...(quotesData || []).map((q) => q.customer_id),
          ...(allContracts || []).map((c) => c.customer_id),
        ].filter(Boolean)
        const uniqueCustomerIds = [...new Set(customerIds)]
        const { data: customersData } = uniqueCustomerIds.length > 0
          ? await supabase.from('customers').select('id, name, phone, email').in('id', uniqueCustomerIds)
          : { data: [] }

        const customersMap = new Map()
        customersData?.forEach((c) => customersMap.set(c.id, c))
        setCustomers(customersMap)

        // Contract car IDs (additional cars not in quotes)
        const contractCarIds = (allContracts || []).map(c => c.car_id).filter(Boolean).filter((id: string) => !carIds.includes(id))
        let allCars = carsData || []
        if (contractCarIds.length > 0) {
          const { data: moreCarData } = await supabase.from('cars').select('*').in('id', contractCarIds)
          allCars = [...allCars, ...(moreCarData || [])]
        }

        // Combine quotes
        const combinedQuotes = (quotesData || []).map((quote) => ({
          ...quote,
          car: allCars.find((c) => c.id === quote.car_id),
          contract: (contractsFromQuotes || []).find((c) => c.quote_id === quote.id),
          customer: customersMap.get(quote.customer_id),
        }))

        // Combine contracts with payment stats
        const combinedContracts = (allContracts || []).map((contract) => {
          const payments = (paymentsData || []).filter(p => p.contract_id === contract.id)
          return {
            ...contract,
            car: allCars.find(c => c.id === contract.car_id),
            customer: customersMap.get(contract.customer_id),
            totalCount: payments.length,
            paidCount: payments.filter(p => p.status === 'paid').length,
          }
        })

        setQuotes(combinedQuotes)
        setContracts(combinedContracts)
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [companyId])

  // ── Filter logic ──
  const longTermQuotes = quotes
  const shortTermQuotes = shortQuotes

  // Short-term status counts
  const shortStatusCounts: Record<ShortStatusFilter, number> = {
    all: shortTermQuotes.length,
    draft: shortTermQuotes.filter(q => q.status === 'draft').length,
    sent: shortTermQuotes.filter(q => q.status === 'sent').length,
    accepted: shortTermQuotes.filter(q => q.status === 'accepted').length,
    contracted: shortTermQuotes.filter(q => q.status === 'contracted').length,
    cancelled: shortTermQuotes.filter(q => q.status === 'cancelled').length,
  }

  // Short-term filtered
  const filteredShortQuotes = useCallback(() => {
    if (shortStatusFilter === 'all') return shortTermQuotes
    return shortTermQuotes.filter(q => q.status === shortStatusFilter)
  }, [shortStatusFilter, shortTermQuotes])

  const statusCounts: Record<StatusFilter, number> = {
    all: longTermQuotes.filter(q => q.status !== 'archived').length,
    draft: longTermQuotes.filter(q => !q.contract && !q.shared_at && q.status !== 'archived').length,
    shared: longTermQuotes.filter(q => (q.shared_at || q.signed_at) && !q.contract && q.status !== 'archived').length,
    confirmed: longTermQuotes.filter(q => q.contract).length,
    archived: longTermQuotes.filter(q => q.status === 'archived').length,
  }

  const filteredQuotes = useCallback(() => {
    const base = mainTab === 'long_term' ? longTermQuotes : shortTermQuotes
    let result: any[]
    switch (statusFilter) {
      case 'draft': result = base.filter(q => !q.contract && !q.shared_at && q.status !== 'archived'); break
      case 'shared': result = base.filter(q => (q.shared_at || q.signed_at) && !q.contract && q.status !== 'archived'); break
      case 'confirmed': result = base.filter(q => q.contract); break
      case 'archived': result = base.filter(q => q.status === 'archived'); break
      default: result = base.filter(q => q.status !== 'archived')
    }
    // 검색어 필터
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(q =>
        (q.customer_name || '').toLowerCase().includes(term) ||
        (q.car?.number || '').toLowerCase().includes(term) ||
        (q.car?.brand || '').toLowerCase().includes(term) ||
        (q.car?.model || '').toLowerCase().includes(term) ||
        (q.customer?.phone || '').includes(term)
      )
    }
    return result
  }, [mainTab, statusFilter, longTermQuotes, shortTermQuotes, searchTerm])

  const mainTabCounts: Record<MainTab, number> = {
    long_term: longTermQuotes.filter(q => q.status !== 'archived').length,
    short_term: shortTermQuotes.length,
    contracts: contracts.length,
  }

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

      // 5. customer_signatures 삭제 (RLS에 DELETE 정책이 없으면 실패 → RPC로 우회)
      const { error: sigErr } = await supabase.from('customer_signatures').delete().eq('quote_id', quoteId)
      if (sigErr) {
        console.warn('[DELETE] 서명 직접 삭제 실패 (RLS 제한), RPC 시도:', sigErr.message)
        // RPC 함수로 우회 삭제 시도
        const { error: rpcErr } = await supabase.rpc('delete_quote_cascade', { p_quote_id: quoteId })
        if (rpcErr) {
          console.error('[DELETE] RPC 우회도 실패:', rpcErr.message)
          // quote_share_tokens도 삭제 시도 (customer_signatures.token_id FK)
          await supabase.from('quote_share_tokens').delete().eq('quote_id', quoteId)
          // 다시 시도
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

      // 6. quote_share_tokens 삭제 (customer_signatures 삭제 후)
      await supabase.from('quote_share_tokens').delete().eq('quote_id', quoteId)

      // 7. 견적서 삭제
      const { error: qErr } = await supabase.from('quotes').delete().eq('id', quoteId)
      if (qErr) throw new Error(`견적서 삭제 실패: ${qErr.message}`)

      setQuotes(prev => prev.filter(q => q.id !== quoteId))
      if (linkedContracts && linkedContracts.length > 0) {
        const contractIds = linkedContracts.map(c => c.id)
        setContracts(prev => prev.filter(c => !contractIds.includes(c.id)))
      }
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

  const displayedQuotes = filteredQuotes()
  const displayedShortQuotes = filteredShortQuotes()

  // 계약 목록에도 검색어 필터 적용
  const filteredContracts = searchTerm
    ? contracts.filter(c => {
        const term = searchTerm.toLowerCase()
        return (
          (c.customer?.name || c.customer_name || '').toLowerCase().includes(term) ||
          (c.car?.number || '').toLowerCase().includes(term) ||
          (c.car?.brand || '').toLowerCase().includes(term) ||
          (c.car?.model || '').toLowerCase().includes(term)
        )
      })
    : contracts

  // KPI 통계
  const kpiStats = {
    totalQuotes: quotes.filter(q => q.status !== 'archived').length,
    draftQuotes: quotes.filter(q => !q.contract && !q.shared_at && q.status !== 'archived').length,
    sharedQuotes: quotes.filter(q => (q.shared_at || q.signed_at) && !q.contract && q.status !== 'archived').length,
    confirmedQuotes: quotes.filter(q => q.contract).length,
    totalContracts: contracts.length,
    activeContracts: contracts.filter(c => c.status !== 'completed').length,
    completedContracts: contracts.filter(c => c.status === 'completed').length,
    totalMonthlyRent: contracts.filter(c => c.status !== 'completed').reduce((s, c) => s + (c.monthly_rent || 0), 0),
    shortQuotes: shortQuotes.length,
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 16px', minHeight: '100vh', background: '#f9fafb' }}>
        <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14, background: '#fff', borderRadius: 16 }}>
          <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>🏢</span>
          <p style={{ fontWeight: 700, color: '#4b5563' }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#f9fafb' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ textAlign: 'left' }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0 }}>📑 견적/계약 관리</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>견적 작성·발송 및 계약 체결 관리</p>
        </div>
        <NewQuoteButton />
      </div>

      {/* ── KPI 대시보드 ── */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          <div style={{ background: '#fff', padding: '12px 16px', borderRadius: 12, border: '1px solid #e5e7eb', cursor: 'pointer' }}
            onClick={() => { setMainTab('long_term'); setStatusFilter('all') }}>
            <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>장기견적</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#111827', marginTop: 4 }}>{kpiStats.totalQuotes}<span style={{ fontSize: 13, color: '#9ca3af', marginLeft: 2 }}>건</span></p>
          </div>
          <div style={{ background: '#eff6ff', padding: '12px 16px', borderRadius: 12, border: '1px solid #bfdbfe', cursor: 'pointer' }}
            onClick={() => { setMainTab('long_term'); setStatusFilter('shared') }}>
            <p style={{ fontSize: 11, color: '#2563eb', fontWeight: 700 }}>발송됨</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', marginTop: 4 }}>{kpiStats.sharedQuotes}<span style={{ fontSize: 13, color: '#60a5fa', marginLeft: 2 }}>건</span></p>
          </div>
          <div style={{ background: '#f0fdf4', padding: '12px 16px', borderRadius: 12, border: '1px solid #bbf7d0', cursor: 'pointer' }}
            onClick={() => { setMainTab('long_term'); setStatusFilter('confirmed') }}>
            <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>계약확정</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#15803d', marginTop: 4 }}>{kpiStats.confirmedQuotes}<span style={{ fontSize: 13, color: '#4ade80', marginLeft: 2 }}>건</span></p>
          </div>
          <div style={{ background: '#faf5ff', padding: '12px 16px', borderRadius: 12, border: '1px solid #e9d5ff', cursor: 'pointer' }}
            onClick={() => { setMainTab('contracts'); }}>
            <p style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>진행중 계약</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#6d28d9', marginTop: 4 }}>{kpiStats.activeContracts}<span style={{ fontSize: 13, color: '#a78bfa', marginLeft: 2 }}>건</span></p>
          </div>
          <div style={{ background: '#eff6ff', padding: '12px 16px', borderRadius: 12, border: '1px solid #bfdbfe' }}>
            <p style={{ fontSize: 11, color: '#2563eb', fontWeight: 700 }}>월 렌트수익</p>
            <p style={{ fontSize: 18, fontWeight: 900, color: '#1d4ed8', marginTop: 4 }}>{f(Math.round(kpiStats.totalMonthlyRent * 1.1))}<span style={{ fontSize: 12, color: '#60a5fa', marginLeft: 2 }}>원</span></p>
          </div>
        </div>
      )}

      {/* ── Main Tabs (보험 페이지 스타일 인라인) ── */}
      <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', padding: 4, borderRadius: 12, marginBottom: 20 }}>
        {[
          { value: 'long_term' as MainTab, label: '장기렌트', icon: '📋', count: mainTabCounts.long_term },
          { value: 'short_term' as MainTab, label: '단기렌트', icon: '⏱️', count: mainTabCounts.short_term },
          { value: 'contracts' as MainTab, label: '계약', icon: '✅', count: mainTabCounts.contracts },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => { setMainTab(tab.value); setStatusFilter('all'); setShortStatusFilter('all'); setSearchTerm('') }}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: 14,
              transition: 'all 0.15s', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              background: mainTab === tab.value ? '#fff' : 'transparent',
              color: mainTab === tab.value ? '#111827' : '#6b7280',
              boxShadow: mainTab === tab.value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {tab.icon} {tab.label}
            <span style={{ marginLeft: 6, fontSize: 12, color: mainTab === tab.value ? '#2d5fa8' : undefined, opacity: mainTab === tab.value ? 1 : 0.6 }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Sub-filter + 검색 바 ── */}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'row', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Status sub-filters */}
          {mainTab === 'long_term' && (
            <div style={{ display: 'flex', gap: 6, overflow: 'auto', paddingBottom: 2 }}>
              {[
                { value: 'all' as StatusFilter, label: '전체', count: statusCounts.all },
                { value: 'draft' as StatusFilter, label: '견적단계', count: statusCounts.draft },
                { value: 'shared' as StatusFilter, label: '발송됨', count: statusCounts.shared },
                { value: 'confirmed' as StatusFilter, label: '계약확정', count: statusCounts.confirmed },
                { value: 'archived' as StatusFilter, label: '보관', count: statusCounts.archived },
              ].map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: statusFilter === tab.value ? 'none' : '1px solid #e5e7eb',
                    background: statusFilter === tab.value ? '#2d5fa8' : '#fff',
                    color: statusFilter === tab.value ? '#fff' : '#6b7280',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          )}
          {mainTab === 'short_term' && (
            <div style={{ display: 'flex', gap: 6, overflow: 'auto', paddingBottom: 2 }}>
              {[
                { value: 'all' as ShortStatusFilter, label: '전체', count: shortStatusCounts.all },
                { value: 'draft' as ShortStatusFilter, label: '작성중', count: shortStatusCounts.draft },
                { value: 'sent' as ShortStatusFilter, label: '발송됨', count: shortStatusCounts.sent },
                { value: 'accepted' as ShortStatusFilter, label: '수락됨', count: shortStatusCounts.accepted },
                { value: 'contracted' as ShortStatusFilter, label: '계약완료', count: shortStatusCounts.contracted },
                { value: 'cancelled' as ShortStatusFilter, label: '취소', count: shortStatusCounts.cancelled },
              ].map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setShortStatusFilter(tab.value)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: shortStatusFilter === tab.value ? 'none' : '1px solid #e5e7eb',
                    background: shortStatusFilter === tab.value ? '#f59e0b' : '#fff',
                    color: shortStatusFilter === tab.value ? '#fff' : '#6b7280',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          )}
          {/* 검색바 */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              type="text"
              placeholder="고객명, 차량번호, 브랜드 검색..."
              style={{
                width: '100%', padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8,
                fontSize: 14, outline: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Short-term detail modal */}
      {selectedShortQuote && (
        <ShortTermDetailModal
          quote={selectedShortQuote}
          onClose={() => setSelectedShortQuote(null)}
          onStatusChange={handleShortStatusChange}
          onDelete={handleShortDelete}
        />
      )}

      {/* ── Content by Tab ── */}
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        {loading ? (
          <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
        ) : mainTab === 'contracts' ? (
          /* ======================== CONTRACTS TAB ======================== */
          filteredContracts.length === 0 ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af' }}>
              {contracts.length === 0 ? '계약 내역이 없습니다.' : '해당 조건의 계약이 없습니다.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-left text-sm" style={{ minWidth: 800 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 16px', paddingLeft: 24, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>상태</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>고객명</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>차량</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>계약기간</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>보증금</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>월 렌트료</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>수납</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>계약일</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContracts.map((c, idx) => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/contracts/${c.id}`)}
                      style={{ cursor: 'pointer', borderBottom: idx < filteredContracts.length - 1 ? '1px solid #f3f4f6' : 'none', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', paddingLeft: 24 }}><ContractStatusBadge contract={c} /></td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827' }}>{c.customer?.name || c.customer_name}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f3f4f6', overflow: 'hidden', border: '1px solid #e5e7eb', flexShrink: 0 }}>
                            {c.car?.image_url ? (
                              <img src={c.car.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <span style={{ fontSize: 9, color: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>No Img</span>
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#111827', fontSize: 12 }}>{c.car?.number || '-'}</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>{c.car?.brand} {c.car?.model}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#4b5563', fontSize: 13 }}>
                        {formatDate(c.start_date)} ~ {formatDate(c.end_date)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280', fontSize: 13 }}>{f(c.deposit)}원</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <span style={{ fontWeight: 900, color: '#2d5fa8' }}>{f(Math.round((c.monthly_rent || 0) * 1.1))}원</span>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>/월 (VAT포함)</div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <div style={{ width: 60, height: 6, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#22c55e', borderRadius: 999, transition: 'all 0.3s', width: `${c.totalCount > 0 ? (c.paidCount / c.totalCount) * 100 : 0}%` }} />
                          </div>
                          <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 700 }}>{c.paidCount}/{c.totalCount}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{formatDate(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : mainTab === 'short_term' ? (
          /* ======================== SHORT-TERM TAB ======================== */
          displayedShortQuotes.length === 0 ? (
            <div style={{ padding: '64px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 48, marginBottom: 16 }}>⏱️</p>
              <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
                {shortStatusFilter === 'all' ? '단기렌트 견적이 없습니다.' : '해당 상태의 견적이 없습니다.'}
              </p>
              <Link href="/quotes/short-term" style={{ display: 'inline-block', padding: '12px 24px', background: '#2d5fa8', color: '#fff', borderRadius: 12, fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>
                단기렌트 견적 작성하기
              </Link>
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
                          <span style={{ fontWeight: 900, color: '#b45309' }}>{f(total)}원</span>
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
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af', fontWeight: 500 }}>
              {quotes.length === 0 ? '발행된 견적서가 없습니다.' : '해당 조건의 견적서가 없습니다.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-left text-sm" style={{ minWidth: 900 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 16px', paddingLeft: 24, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>상태</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>고객명</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>연락처</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>대상 차량</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>계약 기간</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>보증금</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>월 렌트료</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>작성일</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedQuotes.map((quote, idx) => (
                    <tr
                      key={quote.id}
                      onClick={() => {
                        if (quote.contract) router.push(`/contracts/${quote.contract.id}`)
                        else router.push(`/quotes/${quote.id}`)
                      }}
                      style={{
                        cursor: 'pointer', transition: 'background 0.15s',
                        borderBottom: idx < displayedQuotes.length - 1 ? '1px solid #f3f4f6' : 'none',
                        background: quote.contract ? 'rgba(45,95,168,0.03)' : 'transparent',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = quote.contract ? 'rgba(45,95,168,0.06)' : '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = quote.contract ? 'rgba(45,95,168,0.03)' : 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', paddingLeft: 24 }}><QuoteStatusBadge quote={quote} /></td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827' }}>{quote.customer_name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#4b5563' }}>{quote.customer?.phone || '-'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f3f4f6', overflow: 'hidden', border: '1px solid #e5e7eb', flexShrink: 0 }}>
                            {quote.car?.image_url ? (
                              <img src={quote.car.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <span style={{ fontSize: 11, color: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>No Img</span>
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 900, color: '#111827', fontSize: 15 }}>{quote.car?.number || '-'}</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>{quote.car?.brand} {quote.car?.model}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#4b5563', fontWeight: 500, fontSize: 13 }}>{formatDate(quote.start_date)} ~ {formatDate(quote.end_date)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280', fontSize: 13 }}>{f(quote.deposit)}원</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <span style={{ fontWeight: 900, color: '#2d5fa8', fontSize: 15 }}>{f(quote.rent_fee + quote.rent_fee * 0.1)}원</span>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>/월</div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{formatDate(quote.created_at)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <DesktopRowActions quote={quote} onEdit={handleEdit} onArchive={handleArchive} onDelete={handleDelete} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}

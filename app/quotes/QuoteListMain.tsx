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
        className="px-4 py-2.5 text-sm bg-steel-600 text-white rounded-xl font-bold hover:bg-steel-700 transition-all flex items-center gap-1.5"
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

  const f = (n: number) => Math.round(n || 0).toLocaleString()
  const formatDate = (dateString: string) => dateString?.split('T')[0] || ''

  const companyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // ── Fetch all data ──
  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) { setLoading(false); return }

      try {
        // Quotes
        const { data: quotesData } = await supabase
          .from('quotes').select('*').eq('company_id', companyId).order('id', { ascending: false })

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
        const { data: allContracts } = await supabase
          .from('contracts').select('*').eq('company_id', companyId).order('id', { ascending: false })

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
    switch (statusFilter) {
      case 'draft': return base.filter(q => !q.contract && !q.shared_at && q.status !== 'archived')
      case 'shared': return base.filter(q => (q.shared_at || q.signed_at) && !q.contract && q.status !== 'archived')
      case 'confirmed': return base.filter(q => q.contract)
      case 'archived': return base.filter(q => q.status === 'archived')
      default: return base.filter(q => q.status !== 'archived')
    }
  }, [mainTab, statusFilter, longTermQuotes, shortTermQuotes])

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
      await supabase.from('contracts').delete().eq('quote_id', quoteId)
      const { error } = await supabase.from('quotes').delete().eq('id', quoteId)
      if (error) throw error
      setQuotes(prev => prev.filter(q => q.id !== quoteId))
    } catch { alert('삭제 중 오류가 발생했습니다.') }
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

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">📑 견적/계약 관리</h1>
        </div>
        <NewQuoteButton />
      </div>

      {/* ── Main Tabs ── */}
      <div className="mb-5">
        <MainTabBar activeTab={mainTab} onTabChange={(tab) => { setMainTab(tab); setStatusFilter('all'); setShortStatusFilter('all') }} counts={mainTabCounts} />
      </div>

      {/* ── Content by Tab ── */}
      {mainTab === 'contracts' ? (
        /* ======================== CONTRACTS TAB ======================== */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-20 text-center text-gray-400">로딩 중...</div>
          ) : contracts.length === 0 ? (
            <div className="p-20 text-center text-gray-400">계약 내역이 없습니다.</div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-4 pl-6">상태</th>
                      <th className="p-4">고객명</th>
                      <th className="p-4">차량</th>
                      <th className="p-4">계약기간</th>
                      <th className="p-4 text-right">보증금</th>
                      <th className="p-4 text-right">월 렌트료</th>
                      <th className="p-4 text-center">수납</th>
                      <th className="p-4 text-center">계약일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {contracts.map(c => (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/contracts/${c.id}`)}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="p-4 pl-6"><ContractStatusBadge contract={c} /></td>
                        <td className="p-4 font-bold text-gray-900">{c.customer?.name || c.customer_name}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                              {c.car?.image_url ? (
                                <img src={c.car.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[9px] text-gray-300 flex items-center justify-center h-full">No Img</span>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-gray-900 text-xs">{c.car?.number || '-'}</div>
                              <div className="text-[11px] text-gray-500">{c.car?.brand} {c.car?.model}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-gray-600 text-sm">
                          {formatDate(c.start_date)} ~ {formatDate(c.end_date)}
                        </td>
                        <td className="p-4 text-right text-gray-500 text-sm">{f(c.deposit)}원</td>
                        <td className="p-4 text-right">
                          <span className="font-black text-steel-700">{f(Math.round((c.monthly_rent || 0) * 1.1))}원</span>
                          <div className="text-[10px] text-gray-400">/월 (VAT포함)</div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${c.totalCount > 0 ? (c.paidCount / c.totalCount) * 100 : 0}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-500 font-bold">{c.paidCount}/{c.totalCount}</span>
                          </div>
                        </td>
                        <td className="p-4 text-center text-gray-400 text-xs">{formatDate(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile */}
              <div className="md:hidden divide-y divide-gray-100">
                {contracts.map(c => (
                  <div
                    key={c.id}
                    onClick={() => router.push(`/contracts/${c.id}`)}
                    className="p-4 cursor-pointer active:bg-gray-50"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <ContractStatusBadge contract={c} />
                      <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                        {c.car?.image_url ? (
                          <img src={c.car.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[9px] text-gray-300 flex items-center justify-center h-full">No Img</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900 text-sm">{c.customer?.name || c.customer_name}</div>
                        <div className="text-xs text-gray-500">{c.car?.number} · {c.car?.brand} {c.car?.model}</div>
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-2">{formatDate(c.start_date)} ~ {formatDate(c.end_date)}</div>
                      <div className="flex justify-between items-center mb-2">
                        <div><div className="text-[10px] text-gray-400">보증금</div><div className="font-bold text-sm">{f(c.deposit)}원</div></div>
                        <div className="text-right"><div className="text-[10px] text-gray-400">월 렌트료</div><div className="font-black text-steel-700 text-lg">{f(Math.round((c.monthly_rent || 0) * 1.1))}원</div></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${c.totalCount > 0 ? (c.paidCount / c.totalCount) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 font-bold">{c.paidCount}/{c.totalCount}회</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        /* ======================== QUOTES TAB (long/short) ======================== */
        <>
          {/* Status sub-filter */}
          {!loading && mainTab === 'long_term' && (
            <div className="mb-4">
              <StatusFilterTabs activeFilter={statusFilter} onFilterChange={setStatusFilter} counts={statusCounts} />
            </div>
          )}
          {!loading && mainTab === 'short_term' && (
            <div className="mb-4">
              <ShortStatusFilterTabs activeFilter={shortStatusFilter} onFilterChange={setShortStatusFilter} counts={shortStatusCounts} />
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

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-20 text-center text-gray-400">로딩 중...</div>
            ) : mainTab === 'short_term' ? (
              /* Short-term quotes list */
              displayedShortQuotes.length === 0 ? (
                <div className="p-16 text-center">
                  <p className="text-4xl mb-4">⏱️</p>
                  <p className="text-gray-500 text-sm mb-4">
                    {shortStatusFilter === 'all' ? '단기렌트 견적이 없습니다.' : `${shortStatusFilter === 'draft' ? '작성중' : shortStatusFilter === 'sent' ? '발송됨' : shortStatusFilter === 'accepted' ? '수락됨' : shortStatusFilter === 'contracted' ? '계약완료' : '취소'} 상태의 견적이 없습니다.`}
                  </p>
                  <Link href="/quotes/short-term" className="inline-block px-6 py-3 bg-steel-600 text-white rounded-xl font-bold hover:bg-steel-700 transition-colors">
                    단기렌트 견적 작성하기
                  </Link>
                </div>
              ) : (
                <>
                  {/* Desktop */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left text-sm">
                      <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
                        <tr>
                          <th className="p-4 pl-6">상태</th>
                          <th className="p-4">견적번호</th>
                          <th className="p-4">고객/업체</th>
                          <th className="p-4">연락처</th>
                          <th className="p-4">차종 구성</th>
                          <th className="p-4 text-right">합계</th>
                          <th className="p-4 text-center">할인</th>
                          <th className="p-4 text-center">작성일</th>
                          <th className="p-4 text-center">액션</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayedShortQuotes.map(sq => {
                          const detail = sq.quote_detail || {}
                          const items = detail.items || []
                          const total = detail.totalWithVat || detail.total || 0
                          const vehicleSummary = items.length > 0
                            ? items.slice(0, 2).map((it: any) => it.vehicleClass || it.group).join(', ') + (items.length > 2 ? ` 외 ${items.length - 2}건` : '')
                            : '-'
                          return (
                            <tr key={sq.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedShortQuote(sq)}>
                              <td className="p-4 pl-6"><ShortTermStatusBadge status={sq.status} /></td>
                              <td className="p-4 font-bold text-gray-900 font-mono text-xs">{sq.quote_number || '-'}</td>
                              <td className="p-4 font-bold text-gray-900">{sq.customer_name}</td>
                              <td className="p-4 text-gray-600 text-sm">{sq.customer_phone || '-'}</td>
                              <td className="p-4 text-xs text-gray-500">{vehicleSummary}</td>
                              <td className="p-4 text-right">
                                <span className="font-black text-amber-700">{f(total)}원</span>
                              </td>
                              <td className="p-4 text-center">
                                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{sq.discount_percent || 0}%</span>
                              </td>
                              <td className="p-4 text-center text-gray-400 text-xs">{formatDate(sq.created_at)}</td>
                              <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                <div className="flex gap-1 justify-center">
                                  {sq.status === 'draft' && (
                                    <button onClick={() => handleShortStatusChange(sq.id, 'sent')} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-lg font-bold hover:bg-blue-100">발송</button>
                                  )}
                                  {sq.status === 'sent' && (
                                    <button onClick={() => handleShortStatusChange(sq.id, 'accepted')} className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded-lg font-bold hover:bg-green-100">수락</button>
                                  )}
                                  {sq.status === 'accepted' && (
                                    <button onClick={() => handleShortStatusChange(sq.id, 'contracted')} className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-lg font-bold hover:bg-purple-100">계약</button>
                                  )}
                                  {sq.status !== 'cancelled' && sq.status !== 'contracted' && (
                                    <button onClick={() => handleShortStatusChange(sq.id, 'cancelled')} className="text-xs bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded-lg font-bold hover:bg-gray-100">취소</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile */}
                  <div className="md:hidden divide-y divide-gray-100">
                    {displayedShortQuotes.map(sq => {
                      const detail = sq.quote_detail || {}
                      const items = detail.items || []
                      const total = detail.totalWithVat || detail.total || 0
                      return (
                        <div key={sq.id} className="p-4 cursor-pointer active:bg-gray-50" onClick={() => setSelectedShortQuote(sq)}>
                          <div className="flex justify-between items-start mb-2">
                            <ShortTermStatusBadge status={sq.status} />
                            <span className="text-xs text-gray-400">{formatDate(sq.created_at)}</span>
                          </div>
                          <div className="mb-3">
                            <p className="font-bold text-gray-900 text-sm">{sq.customer_name}</p>
                            <p className="text-xs text-gray-500">{sq.quote_number}</p>
                            {sq.customer_phone && <p className="text-xs text-gray-400 mt-0.5">{sq.customer_phone}</p>}
                          </div>
                          <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-100">
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="text-xs text-gray-500 font-bold">할인 {sq.discount_percent || 0}%</span>
                              <span className="text-lg font-black text-amber-700">{f(total)}원</span>
                            </div>
                            {items.length > 0 && (
                              <p className="text-[11px] text-gray-500">
                                {items.slice(0, 3).map((it: any) => it.vehicleClass || it.group).join(' · ')}
                                {items.length > 3 && ` 외 ${items.length - 3}건`}
                              </p>
                            )}
                          </div>
                          {/* Inline actions */}
                          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                            {sq.status === 'draft' && (
                              <button onClick={() => handleShortStatusChange(sq.id, 'sent')} className="flex-1 px-3 py-2 text-xs rounded-lg bg-blue-100 text-blue-600 font-bold hover:bg-blue-200 transition-colors">📤 발송</button>
                            )}
                            {sq.status === 'sent' && (
                              <button onClick={() => handleShortStatusChange(sq.id, 'accepted')} className="flex-1 px-3 py-2 text-xs rounded-lg bg-green-100 text-green-600 font-bold hover:bg-green-200 transition-colors">✅ 수락</button>
                            )}
                            {sq.status === 'accepted' && (
                              <button onClick={() => handleShortStatusChange(sq.id, 'contracted')} className="flex-1 px-3 py-2 text-xs rounded-lg bg-purple-100 text-purple-600 font-bold hover:bg-purple-200 transition-colors">📝 계약</button>
                            )}
                            {sq.status !== 'cancelled' && sq.status !== 'contracted' && (
                              <button onClick={() => handleShortStatusChange(sq.id, 'cancelled')} className="px-3 py-2 text-xs rounded-lg bg-gray-100 text-gray-500 font-bold hover:bg-gray-200 transition-colors">취소</button>
                            )}
                            <button onClick={() => { if (confirm('삭제하시겠습니까?')) handleShortDelete(sq.id) }} className="px-3 py-2 text-xs rounded-lg bg-red-50 text-red-500 font-bold hover:bg-red-100 transition-colors">🗑️</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            ) : displayedQuotes.length === 0 ? (
              <div className="p-20 text-center text-gray-400 font-medium">
                {statusFilter === 'all' && '발행된 견적서가 없습니다.'}
                {statusFilter === 'draft' && '견적 단계의 견적서가 없습니다.'}
                {statusFilter === 'shared' && '발송된 견적서가 없습니다.'}
                {statusFilter === 'confirmed' && '계약확정된 견적서가 없습니다.'}
                {statusFilter === 'archived' && '보관된 견적서가 없습니다.'}
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
                      <tr>
                        <th className="p-4 pl-6">상태</th>
                        <th className="p-4">고객명</th>
                        <th className="p-4">연락처</th>
                        <th className="p-4">대상 차량</th>
                        <th className="p-4">계약 기간</th>
                        <th className="p-4 text-right">보증금</th>
                        <th className="p-4 text-right">월 렌트료</th>
                        <th className="p-4 text-center">작성일</th>
                        <th className="p-4 text-center">작업</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {displayedQuotes.map((quote) => (
                        <tr
                          key={quote.id}
                          onClick={() => {
                            if (quote.contract) router.push(`/contracts/${quote.contract.id}`)
                            else router.push(`/quotes/${quote.id}`)
                          }}
                          className={`transition-colors cursor-pointer group ${
                            quote.contract ? 'bg-steel-50/30 hover:bg-steel-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="p-4 pl-6"><QuoteStatusBadge quote={quote} /></td>
                          <td className="p-4"><div className="font-bold text-gray-900">{quote.customer_name}</div></td>
                          <td className="p-4"><div className="text-sm text-gray-600">{quote.customer?.phone || '-'}</div></td>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                                {quote.car?.image_url ? (
                                  <img src={quote.car.image_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xs text-gray-300 flex items-center justify-center h-full">No Img</span>
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-gray-900">{quote.car?.number || '-'}</div>
                                <div className="text-xs text-gray-500">{quote.car?.brand} {quote.car?.model}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-gray-600 font-medium text-sm">{formatDate(quote.start_date)} ~ {formatDate(quote.end_date)}</td>
                          <td className="p-4 text-right text-gray-500 text-sm">{f(quote.deposit)}원</td>
                          <td className="p-4 text-right">
                            <span className="font-black text-steel-700 text-base">{f(quote.rent_fee + quote.rent_fee * 0.1)}원</span>
                            <div className="text-xs text-gray-400">/월</div>
                          </td>
                          <td className="p-4 text-center text-gray-400 text-xs">{formatDate(quote.created_at)}</td>
                          <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <DesktopRowActions quote={quote} onEdit={handleEdit} onArchive={handleArchive} onDelete={handleDelete} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-gray-100">
                  {displayedQuotes.map((quote) => (
                    <div
                      key={quote.id}
                      onClick={() => {
                        if (quote.contract) router.push(`/contracts/${quote.contract.id}`)
                        else router.push(`/quotes/${quote.id}`)
                      }}
                      className={`p-4 cursor-pointer active:bg-gray-50 transition-colors ${quote.contract ? 'bg-steel-50/30' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <QuoteStatusBadge quote={quote} />
                        <span className="text-xs text-gray-400">{formatDate(quote.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                          {quote.car?.image_url ? (
                            <img src={quote.car.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs text-gray-300 flex items-center justify-center h-full">No Img</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-900 text-sm">{quote.customer_name}</div>
                          <div className="text-xs text-gray-500">{quote.car?.number} · {quote.car?.brand} {quote.car?.model}</div>
                          {quote.customer?.phone && <div className="text-xs text-gray-500 mt-1">{quote.customer.phone}</div>}
                        </div>
                      </div>
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-2">{formatDate(quote.start_date)} ~ {formatDate(quote.end_date)}</div>
                        <div className="flex justify-between items-center">
                          <div><div className="text-xs text-gray-500">보증금</div><div className="font-bold text-gray-900">{f(quote.deposit)}원</div></div>
                          <div className="text-right"><div className="text-xs text-gray-500">월 렌트료</div><div className="font-black text-steel-700 text-lg">{f(quote.rent_fee + quote.rent_fee * 0.1)}원</div></div>
                        </div>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(quote.id) }} className="flex-1 px-3 py-2 text-xs rounded-lg bg-steel-100 text-steel-600 font-bold hover:bg-steel-200 transition-colors">✏️ 수정</button>
                          <button onClick={(e) => { e.stopPropagation(); handleArchive(quote.id) }} className="flex-1 px-3 py-2 text-xs rounded-lg bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 transition-colors">📦 보관</button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const msg = quote.contract ? '⚠️ 연결된 계약도 함께 삭제됩니다.' : '이 견적서를 삭제하시겠습니까?'
                              if (confirm(msg)) handleDelete(quote.id)
                            }}
                            className="flex-1 px-3 py-2 text-xs rounded-lg bg-red-100 text-red-600 font-bold hover:bg-red-200 transition-colors"
                          >🗑️ 삭제</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

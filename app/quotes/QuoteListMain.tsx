'use client'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'

// ============================================================================
// STATUS FILTER TABS COMPONENT
// ============================================================================
function StatusFilterTabs({
  activeFilter,
  onFilterChange,
  counts,
}: {
  activeFilter: string
  onFilterChange: (filter: string) => void
  counts: Record<string, number>
}) {
  const tabs = [
    { value: 'all', label: '전체', icon: '📋' },
    { value: 'draft', label: '견적단계', icon: '✏️' },
    { value: 'contract', label: '계약확정', icon: '✅' },
    { value: 'archived', label: '보관', icon: '📦' },
  ]

  return (
    <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-4">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onFilterChange(tab.value)}
          className={`px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${
            activeFilter === tab.value
              ? 'bg-steel-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {tab.icon} {tab.label} <span className="ml-1 text-xs opacity-75">({counts[tab.value] || 0})</span>
        </button>
      ))}
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

  // 외부 클릭 시 닫기
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
            onClick={(e) => {
              e.stopPropagation()
              onEdit(quote.id)
              setShowMenu(false)
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 font-medium text-gray-700"
          >
            ✏️ 수정
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onArchive(quote.id)
              setShowMenu(false)
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 font-medium text-gray-700"
          >
            📦 보관
          </button>
          {!quote.contract && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirm('이 견적서를 삭제하시겠습니까?')) {
                  onDelete(quote.id)
                }
                setShowMenu(false)
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 font-medium text-red-600"
            >
              🗑️ 삭제
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MOBILE ROW ACTIONS COMPONENT
// ============================================================================
function MobileRowActions({
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
  return (
    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
      <button
        onClick={(e) => {
          e.stopPropagation()
          onEdit(quote.id)
        }}
        className="flex-1 px-3 py-2 text-xs rounded-lg bg-steel-100 text-steel-600 font-bold hover:bg-steel-200 transition-colors"
      >
        ✏️ 수정
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onArchive(quote.id)
        }}
        className="flex-1 px-3 py-2 text-xs rounded-lg bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 transition-colors"
      >
        📦 보관
      </button>
      {!quote.contract && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm('이 견적서를 삭제하시겠습니까?')) {
              onDelete(quote.id)
            }
          }}
          className="flex-1 px-3 py-2 text-xs rounded-lg bg-red-100 text-red-600 font-bold hover:bg-red-200 transition-colors"
        >
          🗑️ 삭제
        </button>
      )}
    </div>
  )
}

// ============================================================================
// QUOTE STATUS BADGE COMPONENT
// ============================================================================
function QuoteStatusBadge({ quote }: { quote: any }) {
  if (quote.status === 'archived') {
    return (
      <span className="px-2 py-1 rounded-md text-xs font-black bg-gray-300 text-gray-700 shadow-sm">
        📦 보관됨
      </span>
    )
  }
  if (quote.contract) {
    return (
      <span className="px-2 py-1 rounded-md text-xs font-black bg-steel-600 text-white shadow-sm">
        ✅ 계약확정
      </span>
    )
  }
  return (
    <span className="px-2 py-1 rounded-md text-xs font-bold bg-yellow-100 text-yellow-700">
      ✏️ 견적단계
    </span>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function QuoteListPage() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const router = useRouter()
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [customers, setCustomers] = useState<Map<string, any>>(new Map())

  // Number formatter
  const f = (n: number) => Math.round(n || 0).toLocaleString()

  // Format date to YYYY-MM-DD
  const formatDate = (dateString: string) => dateString?.split('T')[0] || ''

  // Determine company ID based on role
  const companyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // Fetch quotes and related data
  useEffect(() => {
    const fetchQuotes = async () => {
      if (!company && role !== 'god_admin') {
        setLoading(false)
        return
      }

      if (!companyId) {
        setLoading(false)
        return
      }

      try {
        // Fetch quotes
        const { data: quotesData, error: quoteError } = await supabase
          .from('quotes')
          .select('*')
          .eq('company_id', companyId)
          .order('id', { ascending: false })

        if (quoteError || !quotesData) {
          setLoading(false)
          return
        }

        // Fetch all related cars
        const carIds = quotesData.map((q) => q.car_id).filter(Boolean)
        const { data: carsData } = await supabase.from('cars').select('*').in('id', carIds)

        // Fetch all related contracts
        const quoteIds = quotesData.map((q) => q.id)
        const { data: contractsData } = await supabase
          .from('contracts')
          .select('id, quote_id, status')
          .in('quote_id', quoteIds)

        // Fetch all related customers
        const customerIds = quotesData.map((q) => q.customer_id).filter(Boolean)
        const { data: customersData } = await supabase
          .from('customers')
          .select('id, name, phone, email')
          .in('id', customerIds)

        // Build customers map
        const customersMap = new Map()
        customersData?.forEach((customer) => {
          customersMap.set(customer.id, customer)
        })
        setCustomers(customersMap)

        // Combine data
        const combinedData = quotesData.map((quote) => {
          const matchingCar = carsData?.find((c) => c.id === quote.car_id)
          const matchingContract = contractsData?.find((c) => c.quote_id === quote.id)
          const matchingCustomer = customersMap.get(quote.customer_id)

          return {
            ...quote,
            car: matchingCar,
            contract: matchingContract,
            customer: matchingCustomer,
          }
        })

        setQuotes(combinedData)
      } catch (error) {
        console.error('Error fetching quotes:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchQuotes()
  }, [companyId, company, role, adminSelectedCompanyId])

  // Filter quotes based on active filter
  const filteredQuotes = useCallback(() => {
    switch (activeFilter) {
      case 'draft':
        // 견적단계: no linked contract AND status != 'archived'
        return quotes.filter((q) => !q.contract && q.status !== 'archived')
      case 'contract':
        // 계약확정: has linked contract
        return quotes.filter((q) => q.contract)
      case 'archived':
        // 보관: status === 'archived'
        return quotes.filter((q) => q.status === 'archived')
      case 'all':
      default:
        // 전체: show all except archived
        return quotes.filter((q) => q.status !== 'archived')
    }
  }, [quotes, activeFilter])

  // Calculate counts for each filter
  const counts = {
    all: quotes.filter((q) => q.status !== 'archived').length,
    draft: quotes.filter((q) => !q.contract && q.status !== 'archived').length,
    contract: quotes.filter((q) => q.contract).length,
    archived: quotes.filter((q) => q.status === 'archived').length,
  }

  // Handle edit
  const handleEdit = useCallback(
    (quoteId: string) => {
      router.push(`/quotes/pricing?quote_id=${quoteId}`)
    },
    [router]
  )

  // Handle archive
  const handleArchive = useCallback(
    async (quoteId: string) => {
      try {
        const { error } = await supabase
          .from('quotes')
          .update({ status: 'archived' })
          .eq('id', quoteId)

        if (error) throw error

        setQuotes((prev) =>
          prev.map((q) => (q.id === quoteId ? { ...q, status: 'archived' } : q))
        )
      } catch (error) {
        console.error('Error archiving quote:', error)
        alert('보관 중 오류가 발생했습니다.')
      }
    },
    []
  )

  // Handle delete
  const handleDelete = useCallback(
    async (quoteId: string) => {
      try {
        const { error } = await supabase.from('quotes').delete().eq('id', quoteId)

        if (error) throw error

        setQuotes((prev) => prev.filter((q) => q.id !== quoteId))
      } catch (error) {
        console.error('Error deleting quote:', error)
        alert('삭제 중 오류가 발생했습니다.')
      }
    },
    []
  )

  const displayedQuotes = filteredQuotes()

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-12 md:px-6 bg-gray-50/50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900">📄 견적 및 계약 관리</h1>
          <p className="text-gray-500 mt-2">
            전체 견적: <span className="font-bold text-steel-600">{counts.all}</span>건
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <Link
            href="/"
            className="px-3 py-2 text-xs md:px-6 md:py-3 md:text-sm border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            🚗 차량 관리로
          </Link>
          <Link
            href="/quotes/pricing"
            className="px-3 py-2 text-xs md:px-6 md:py-3 md:text-sm border border-steel-300 rounded-xl font-bold text-steel-600 hover:bg-steel-50 transition-colors"
          >
            💰 렌트가 산출기
          </Link>
          <Link
            href="/quotes/pricing"
            className="px-3 py-2 text-xs md:px-6 md:py-3 md:text-sm bg-steel-600 text-white rounded-xl font-bold hover:bg-steel-700 shadow-lg transition-colors"
          >
            + 새 견적 작성
          </Link>
        </div>
      </div>

      {/* Status Filter Tabs */}
      {!loading && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <StatusFilterTabs
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            counts={counts}
          />
        </div>
      )}

      {/* Quotes List Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-20 text-center text-gray-400 font-medium">로딩 중...</div>
        ) : displayedQuotes.length === 0 ? (
          <div className="p-20 text-center text-gray-400 font-medium">
            {activeFilter === 'all' && '발행된 견적서가 없습니다.'}
            {activeFilter === 'draft' && '견적 단계의 견적서가 없습니다.'}
            {activeFilter === 'contract' && '계약확정된 견적서가 없습니다.'}
            {activeFilter === 'archived' && '보관된 견적서가 없습니다.'}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
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
                        if (quote.contract) {
                          router.push(`/contracts/${quote.contract.id}`)
                        } else {
                          router.push(`/quotes/${quote.id}`)
                        }
                      }}
                      className={`transition-colors cursor-pointer group ${
                        quote.contract ? 'bg-steel-50/30 hover:bg-steel-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="p-4 pl-6">
                        <QuoteStatusBadge quote={quote} />
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-gray-900">{quote.customer_name}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-gray-600">
                          {quote.customer?.phone || '정보없음'}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                            {quote.car?.image_url ? (
                              <img
                                src={quote.car.image_url}
                                alt={quote.car.number}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs text-gray-300 flex items-center justify-center h-full">
                                No Img
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">{quote.car?.number || '정보없음'}</div>
                            <div className="text-xs text-gray-500">
                              {quote.car?.brand} {quote.car?.model}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-gray-600 font-medium">
                        <div className="text-sm">
                          {formatDate(quote.start_date)} ~ {formatDate(quote.end_date)}
                        </div>
                      </td>
                      <td className="p-4 text-right text-gray-500">
                        <div className="text-sm">{f(quote.deposit)}원</div>
                      </td>
                      <td className="p-4 text-right">
                        <span className="font-black text-steel-700 text-base">
                          {f(quote.rent_fee + quote.rent_fee * 0.1)}원
                        </span>
                        <div className="text-xs text-gray-400">/월</div>
                      </td>
                      <td className="p-4 text-center text-gray-400 text-xs">
                        {formatDate(quote.created_at)}
                      </td>
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <DesktopRowActions
                          quote={quote}
                          onEdit={handleEdit}
                          onArchive={handleArchive}
                          onDelete={handleDelete}
                        />
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
                    if (quote.contract) {
                      router.push(`/contracts/${quote.contract.id}`)
                    } else {
                      router.push(`/quotes/${quote.id}`)
                    }
                  }}
                  className={`p-4 cursor-pointer active:bg-gray-50 transition-colors ${
                    quote.contract ? 'bg-steel-50/30' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <QuoteStatusBadge quote={quote} />
                    <span className="text-xs text-gray-400">{formatDate(quote.created_at)}</span>
                  </div>

                  {/* Customer & Car Info */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                      {quote.car?.image_url ? (
                        <img
                          src={quote.car.image_url}
                          alt={quote.car.number}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-gray-300 flex items-center justify-center h-full">
                          No Img
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-sm">{quote.customer_name}</div>
                      <div className="text-xs text-gray-500">
                        {quote.car?.number} · {quote.car?.brand} {quote.car?.model}
                      </div>
                      {quote.customer?.phone && (
                        <div className="text-xs text-gray-500 mt-1">{quote.customer.phone}</div>
                      )}
                    </div>
                  </div>

                  {/* Dates & Amounts */}
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-2">
                      {formatDate(quote.start_date)} ~ {formatDate(quote.end_date)}
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-xs text-gray-500">보증금</div>
                        <div className="font-bold text-gray-900">{f(quote.deposit)}원</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">월 렌트료</div>
                        <div className="font-black text-steel-700 text-lg">
                          {f(quote.rent_fee + quote.rent_fee * 0.1)}원
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Actions */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <MobileRowActions
                      quote={quote}
                      onEdit={handleEdit}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

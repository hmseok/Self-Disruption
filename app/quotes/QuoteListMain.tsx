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
type MainTab = 'long_term' | 'short_term'
type StatusFilter = 'all' | 'draft' | 'shared' | 'signed' | 'contracted' | 'archived'
type ShortStatusFilter = 'all' | 'draft' | 'sent' | 'accepted' | 'contracted' | 'cancelled'
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
  const { company, role, adminSelectedCompanyId } = useApp()
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

      {/* ── 장기/단기 탭 ── */}
      <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', padding: 4, borderRadius: 12, marginBottom: 16 }}>
        {[
          { value: 'long_term' as MainTab, label: '장기렌트', icon: '📋', count: mainTabCounts.long_term },
          { value: 'short_term' as MainTab, label: '단기렌트', icon: '⏱️', count: mainTabCounts.short_term },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => { setMainTab(tab.value); setStatusFilter('all'); setShortStatusFilter('all'); setSearchTerm(''); setSortBy('latest') }}
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

      {/* ── 칩 필터 + 정렬 + 검색 (계약관리 동일 스타일) ── */}
      {!loading && (
        <div style={{ marginBottom: 16 }}>
          {/* 칩 필터 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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

            {/* 새 견적 버튼 — 우측 */}
            <div style={{ marginLeft: 'auto' }}>
              <NewQuoteButton mainTab={mainTab} />
            </div>
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
                      <td style={{ padding: '12px 16px', paddingLeft: 24 }}><QuoteStatusBadge quote={quote} /></td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827' }}>{quote.customer_name}</td>
                      <td style={{ padding: '12px 16px' }}>
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
                      </td>
                      <td style={{ padding: '12px 16px', color: '#4b5563', fontSize: 13 }}>
                        {formatDate(quote.start_date)} ~ {formatDate(quote.end_date)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280', fontSize: 13 }}>{f(quote.deposit)}원</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <span style={{ fontWeight: 900, color: '#2d5fa8' }}>{f(Math.round((quote.rent_fee || 0) * 1.1))}원</span>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>/월 (VAT포함)</div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                        {quote.shared_at ? formatDate(quote.shared_at) : '-'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{formatDate(quote.created_at)}</td>
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

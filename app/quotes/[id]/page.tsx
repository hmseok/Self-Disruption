'use client'

import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
export const dynamic = "force-dynamic";

// CostBar 컴포넌트 (메인 컴포넌트 외부에 정의)
const CostBar = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => {
  const pct = total > 0 ? Math.abs(value) / total * 100 : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 text-gray-500 text-xs">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="w-24 text-right font-bold text-xs">{Math.round(value || 0).toLocaleString()}원</span>
      <span className="w-10 text-right text-gray-400 text-[11px]">{pct.toFixed(0)}%</span>
    </div>
  )
}

// 고객 정보 카드 컴포넌트
const CustomerInfoCard = ({ quote }: { quote: any }) => {
  const [customer, setCustomer] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchCustomer = async () => {
      if (!quote.customer_id) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const { data } = await supabase.from('customers').select('*').eq('id', quote.customer_id).single()
        if (data) setCustomer(data)
      } catch (e) {
        console.error('고객 정보 불러오기 오류:', e)
      }
      setLoading(false)
    }
    fetchCustomer()
  }, [quote.customer_id])

  const displayName = customer?.name || quote.customer_name || '미등록'
  const displayPhone = customer?.phone || quote.customer_phone || '-'
  const displayEmail = customer?.email || quote.customer_email || '-'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <span>👤</span> 고객 정보
        </h3>
      </div>
      <div className="p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-sm">고객명</span>
          <span className="font-bold text-gray-900 text-lg">{displayName}</span>
        </div>
        {displayPhone && displayPhone !== '-' && (
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">전화</span>
            <span className="text-gray-700 font-medium">{displayPhone}</span>
          </div>
        )}
        {displayEmail && displayEmail !== '-' && (
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">이메일</span>
            <span className="text-gray-700 font-medium text-sm">{displayEmail}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-sm">계약기간</span>
          <span className="text-gray-700 font-medium">{quote.start_date} ~ {quote.end_date}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-sm">렌탈 유형</span>
          <span className="px-3 py-1 bg-steel-50 text-steel-600 rounded-lg text-sm font-bold">{quote.rental_type}</span>
        </div>
      </div>
    </div>
  )
}

// 만료일 경고 컴포넌트
const ExpirationWarning = ({ expiresAt }: { expiresAt: string }) => {
  const today = new Date()
  const expDate = new Date(expiresAt)
  const daysUntilExpiry = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
        <span className="text-2xl">⚠️</span>
        <div>
          <h4 className="font-bold text-red-700">견적 만료됨</h4>
          <p className="text-red-600 text-sm">{Math.abs(daysUntilExpiry)}일 전에 만료되었습니다.</p>
        </div>
      </div>
    )
  }

  if (daysUntilExpiry < 7) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <span className="text-2xl">⏰</span>
        <div>
          <h4 className="font-bold text-amber-700">곧 만료됩니다</h4>
          <p className="text-amber-600 text-sm">{daysUntilExpiry}일 남음 - {expiresAt}에 만료됩니다.</p>
        </div>
      </div>
    )
  }

  return null
}

export default function QuoteDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const quoteId = Array.isArray(id) ? id[0] : id

  const [loading, setLoading] = useState(true)
  const [quote, setQuote] = useState<any>(null)
  const [linkedContract, setLinkedContract] = useState<any>(null)
  const [worksheet, setWorksheet] = useState<any>(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    const fetchQuoteDetail = async () => {
      if (!quoteId) return

      // 1. 견적서 정보
      const { data: quoteData, error } = await supabase.from('quotes').select('*').eq('id', quoteId).single()
      if (error || !quoteData) {
        alert('견적서를 찾을 수 없습니다.');
        router.push('/quotes');
        return
      }

      // 2. 차량 정보
      let carData = null
      if (quoteData.car_id) {
        const { data } = await supabase.from('cars').select('*').eq('id', quoteData.car_id).single()
        carData = data

        // 3. 산출 근거데이터 (pricing_worksheets)
        const { data: wsData } = await supabase
          .from('pricing_worksheets')
          .select('*')
          .eq('car_id', quoteData.car_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single()
        if (wsData) setWorksheet(wsData)
      }

      // 4. 연결된 계약 확인
      const { data: contractData } = await supabase
        .from('contracts')
        .select('*')
        .eq('quote_id', quoteId)
        .single()

      setQuote({ ...quoteData, car: carData })
      if (contractData) setLinkedContract(contractData)
      setLoading(false)
    }
    fetchQuoteDetail()
  }, [quoteId, router])

  // 견적 상태 업데이트 (보관)
  const handleArchiveQuote = async () => {
    if (!confirm('이 견적을 보관하시겠습니까?')) return

    setUpdating(true)
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ status: 'archived' })
        .eq('id', quoteId)

      if (error) throw error

      alert('✅ 견적이 보관되었습니다.')
      setQuote({ ...quote, status: 'archived' })
    } catch (e: any) {
      alert('에러: ' + e.message)
    }
    setUpdating(false)
  }

  // 계약 확정 로직
  const handleCreateContract = async () => {
    if (linkedContract) return alert('이미 계약이 확정된 건입니다.')
    if (quote.status === 'archived') return alert('보관된 견적서로는 계약을 확정할 수 없습니다.')

    // 만료일 확인
    if (quote.expires_at) {
      const expDate = new Date(quote.expires_at)
      const today = new Date()
      if (today > expDate) {
        return alert('만료된 견적서로는 계약을 확정할 수 없습니다.')
      }
    }

    if (!confirm('이 견적서로 계약을 확정하시겠습니까?')) return

    setCreating(true)
    try {
      const termMonths = worksheet?.term_months || 36

      const { data: contract, error: cErr } = await supabase.from('contracts').insert([{
        quote_id: quote.id,
        car_id: quote.car_id,
        customer_id: quote.customer_id || null,
        customer_name: quote.customer_name,
        start_date: quote.start_date,
        end_date: quote.end_date,
        term_months: termMonths,
        deposit: quote.deposit,
        monthly_rent: quote.rent_fee,
        status: 'active'
      }]).select().single()

      if (cErr) throw cErr

      const schedules = []
      const rent = quote.rent_fee
      const vat = Math.round(rent * 0.1)
      const startDate = new Date(quote.start_date)

      if (quote.deposit > 0) {
        schedules.push({
          contract_id: contract.id,
          round_number: 0,
          due_date: quote.start_date,
          amount: quote.deposit,
          vat: 0,
          status: 'unpaid'
        })
      }

      for (let i = 1; i <= termMonths; i++) {
        const d = new Date(startDate)
        d.setMonth(d.getMonth() + i)
        schedules.push({
          contract_id: contract.id,
          round_number: i,
          due_date: d.toISOString().split('T')[0],
          amount: rent + vat,
          vat: vat,
          status: 'unpaid'
        })
      }

      await supabase.from('payment_schedules').insert(schedules)
      await supabase.from('cars').update({ status: 'rented' }).eq('id', quote.car_id)

      alert('✅ 계약 확정 완료!')
      router.push(`/contracts/${contract.id}`)
    } catch (e: any) {
      alert('에러: ' + e.message)
    }
    setCreating(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-steel-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 font-bold">견적서 불러오는 중...</p>
      </div>
    </div>
  )
  if (!quote) return null

  const f = (n: number) => Math.round(n || 0).toLocaleString()
  const totalCost = worksheet ? worksheet.total_monthly_cost : 0
  const margin = worksheet ? worksheet.target_margin : 0

  // 계약 확정 버튼 활성화 여부
  const canCreateContract = !linkedContract && quote.status !== 'archived' && (!quote.expires_at || new Date(quote.expires_at) > new Date())

  return (
    <div className="max-w-[1400px] mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">

      {/* 헤더 + 네비게이션 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-8 no-print">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/quotes" className="text-gray-400 hover:text-gray-600 text-sm">견적 관리</Link>
            <span className="text-gray-300">/</span>
            <span className="text-steel-600 font-bold text-sm">견적 상세</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900">
            견적서 #{String(quote.id).slice(0, 8)}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {quote.created_at?.split('T')[0]} 작성
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => window.print()} className="px-4 py-2 text-sm border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-50">
            🖨️ 인쇄
          </button>
          <button
            onClick={() => router.push(`/quotes/new?quote_id=${quoteId}`)}
            className="px-4 py-2 text-sm border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-50"
          >
            ✏️ 수정
          </button>
          <button
            onClick={handleArchiveQuote}
            disabled={updating || quote.status === 'archived'}
            className="px-4 py-2 text-sm border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {updating ? '처리 중...' : '📦 보관'}
          </button>
          {canCreateContract && (
            <button
              onClick={handleCreateContract}
              disabled={creating}
              className="px-6 py-2 text-sm bg-steel-600 text-white rounded-xl font-bold hover:bg-steel-700 shadow-lg disabled:opacity-50 transition-colors"
            >
              {creating ? '처리 중...' : '🚀 계약 확정'}
            </button>
          )}
          {!canCreateContract && (
            <button
              disabled
              className="px-6 py-2 text-sm bg-gray-300 text-gray-500 rounded-xl font-bold shadow-lg opacity-50 cursor-not-allowed"
            >
              🚀 계약 확정
            </button>
          )}
        </div>
      </div>

      {/* 계약 확정 배너 */}
      {linkedContract && (
        <div className="bg-steel-600 text-white p-5 rounded-2xl shadow-lg mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 no-print">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">✅ 계약 확정 완료</h2>
            <p className="text-steel-100 text-sm mt-0.5">계약번호: {String(linkedContract.id).slice(0, 8)}</p>
          </div>
          <button
            onClick={() => router.push(`/contracts/${linkedContract.id}`)}
            className="bg-white text-steel-700 px-5 py-2.5 rounded-xl font-bold hover:bg-gray-100 shadow-md text-sm"
          >
            계약서 상세 →
          </button>
        </div>
      )}

      {/* 메인 콘텐츠 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ===== 왼쪽: 견적 정보 ===== */}
        <div className="lg:col-span-7 space-y-6">

          {/* 만료 경고 */}
          {quote.expires_at && (
            <ExpirationWarning expiresAt={quote.expires_at} />
          )}

          {/* 고객 정보 카드 */}
          <CustomerInfoCard quote={quote} />

          {/* 차량 정보 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <span>🚗</span> 차량 정보
              </h3>
            </div>
            <div className="p-6">
              {quote.car ? (
                <div className="flex items-center gap-5">
                  <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden border flex-shrink-0">
                    {quote.car.image_url ? (
                      <img src={quote.car.image_url} className="w-full h-full object-cover" alt="car" />
                    ) : (
                      <span className="text-gray-300 text-xs flex items-center justify-center h-full">No Image</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-black text-lg text-gray-900">{quote.car.brand} {quote.car.model}</span>
                      <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold">{quote.car.number}</span>
                    </div>
                    {quote.car.year && (
                      <div className="flex gap-4 text-sm text-gray-500">
                        <span>{quote.car.year}년식</span>
                        {quote.car.mileage && <span>{quote.car.mileage?.toLocaleString()}km</span>}
                      </div>
                    )}
                    {quote.car.purchase_price && (
                      <div className="text-sm">
                        <span className="text-gray-500">매입가 </span>
                        <span className="font-bold text-steel-600">{f(quote.car.purchase_price)}원</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-red-500 text-sm">차량 정보를 찾을 수 없습니다.</p>
              )}
            </div>
          </div>

          {/* 가격 요약 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <span>💰</span> 가격 요약
              </h3>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-500">보증금</span>
                <span className="font-bold text-gray-800 text-lg">{f(quote.deposit)}원</span>
              </div>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-500">월 렌트료 (VAT 별도)</span>
                <span className="font-bold text-gray-800 text-lg">{f(quote.rent_fee)}원</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">부가세 (10%)</span>
                <span className="text-gray-400">{f(Math.round(quote.rent_fee * 0.1))}원</span>
              </div>
              <div className="border-t-2 border-steel-200 pt-4 mt-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-700 text-lg">월 납입금 (VAT 포함)</span>
                  <span className="font-black text-2xl text-steel-600">{f(Math.round(quote.rent_fee * 1.1))}원</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== 오른쪽: 산출 근거데이터 ===== */}
        <div className="lg:col-span-5 space-y-6">

          {worksheet ? (
            <>
              {/* 산출 결과 패널 */}
              <div className="bg-gray-900 text-white rounded-2xl shadow-xl p-6 sticky top-6">
                <div className="border-b border-gray-700 pb-4 mb-5">
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Pricing Analysis</p>
                  <h2 className="text-xl font-black mt-1">산출 근거데이터</h2>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">📉 감가상각</span><span className="font-bold">{f(worksheet.monthly_depreciation)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">🏦 금융이자</span><span className="font-bold">{f(worksheet.monthly_loan_interest)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">📊 기회비용</span><span className="font-bold">{f(worksheet.monthly_opportunity_cost)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">🛡️ 보험료</span><span className="font-bold">{f(worksheet.monthly_insurance)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">🔧 정비예비비</span><span className="font-bold">{f(worksheet.monthly_maintenance)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">🏛️ 자동차세</span><span className="font-bold">{f(worksheet.monthly_tax)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">⚠️ 리스크적립</span><span className="font-bold">{f(worksheet.monthly_risk_reserve)}원</span></div>

                  {(worksheet.monthly_deposit_discount > 0 || worksheet.monthly_prepayment_discount > 0) && (
                    <>
                      <div className="border-t border-gray-700 my-2" />
                      {worksheet.monthly_deposit_discount > 0 && (
                        <div className="flex justify-between text-green-400"><span>💳 보증금할인</span><span className="font-bold">-{f(worksheet.monthly_deposit_discount)}원</span></div>
                      )}
                      {worksheet.monthly_prepayment_discount > 0 && (
                        <div className="flex justify-between text-green-400"><span>💵 선납할인</span><span className="font-bold">-{f(worksheet.monthly_prepayment_discount)}원</span></div>
                      )}
                    </>
                  )}

                  <div className="border-t border-gray-700 my-3 pt-3">
                    <div className="flex justify-between"><span className="text-gray-300 font-bold">총 원가</span><span className="font-black text-lg">{f(worksheet.total_monthly_cost)}원</span></div>
                  </div>
                  <div className="flex justify-between text-green-400">
                    <span className="font-bold">+ 마진</span>
                    <span className="font-bold">{f(worksheet.target_margin)}원</span>
                  </div>
                  <div className="border-t border-gray-500 my-3 pt-3">
                    <div className="text-right">
                      <p className="text-xs text-yellow-400 font-bold mb-1">산출 렌트료 (VAT별도)</p>
                      <p className="text-3xl font-black tracking-tight">{f(worksheet.suggested_rent)}<span className="text-lg ml-1">원</span></p>
                    </div>
                  </div>
                </div>

                {/* 원가 비중 차트 */}
                <div className="mt-5 pt-4 border-t border-gray-700">
                  <p className="text-xs text-gray-400 mb-3 font-bold">원가 비중 분석</p>
                  <div className="space-y-2">
                    <CostBar label="감가" value={worksheet.monthly_depreciation} total={worksheet.total_monthly_cost + (worksheet.monthly_deposit_discount || 0) + (worksheet.monthly_prepayment_discount || 0)} color="bg-red-500" />
                    <CostBar label="금융" value={worksheet.monthly_loan_interest + worksheet.monthly_opportunity_cost} total={worksheet.total_monthly_cost + (worksheet.monthly_deposit_discount || 0) + (worksheet.monthly_prepayment_discount || 0)} color="bg-blue-500" />
                    <CostBar label="보험+세금" value={worksheet.monthly_insurance + worksheet.monthly_tax} total={worksheet.total_monthly_cost + (worksheet.monthly_deposit_discount || 0) + (worksheet.monthly_prepayment_discount || 0)} color="bg-purple-500" />
                    <CostBar label="정비" value={worksheet.monthly_maintenance} total={worksheet.total_monthly_cost + (worksheet.monthly_deposit_discount || 0) + (worksheet.monthly_prepayment_discount || 0)} color="bg-amber-500" />
                    <CostBar label="리스크" value={worksheet.monthly_risk_reserve} total={worksheet.total_monthly_cost + (worksheet.monthly_deposit_discount || 0) + (worksheet.monthly_prepayment_discount || 0)} color="bg-red-400" />
                  </div>
                </div>

                {/* 추가 정보 */}
                <div className="mt-5 pt-4 border-t border-gray-700 space-y-2 text-xs text-gray-400">
                  <div className="flex justify-between"><span>계약기간</span><span className="text-white font-bold">{worksheet.term_months}개월</span></div>
                  <div className="flex justify-between"><span>매입가</span><span className="text-white font-bold">{f(worksheet.purchase_price)}원</span></div>
                  <div className="flex justify-between"><span>현재시장가</span><span className="text-white font-bold">{f(worksheet.current_market_value)}원</span></div>
                  {worksheet.market_avg_rent > 0 && (
                    <div className="flex justify-between"><span>시장평균렌트</span><span className="text-white font-bold">{f(worksheet.market_avg_rent)}원</span></div>
                  )}
                </div>
              </div>

              {/* 수익성 요약 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h3 className="font-bold text-gray-700 mb-4 text-sm">📊 수익성 요약</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">월 순이익</span>
                    <span className="font-bold text-green-600">{f(worksheet.target_margin)}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">연 순이익</span>
                    <span className="font-bold text-green-600">{f(worksheet.target_margin * 12)}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">계약기간 총이익</span>
                    <span className="font-black text-green-700 text-lg">{f(worksheet.target_margin * worksheet.term_months)}원</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">마진율</span>
                      <span className="font-bold text-steel-600">
                        {worksheet.suggested_rent > 0 ? (worksheet.target_margin / worksheet.suggested_rent * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">투자수익률 (ROI)</span>
                      <span className="font-bold text-steel-600">
                        {worksheet.purchase_price > 0 ? ((worksheet.target_margin * 12) / worksheet.purchase_price * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📋</span>
              </div>
              <h3 className="font-bold text-gray-700 mb-2">산출 근거데이터 없음</h3>
              <p className="text-gray-400 text-sm mb-4">
                이 견적에 대한 렌트가 산출 분석이 아직 수행되지 않았습니다.
              </p>
              <Link
                href="/quotes/pricing"
                className="inline-block px-5 py-2.5 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-colors"
              >
                렌트가 산출 빌더 →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* 인쇄 스타일 */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  )
}

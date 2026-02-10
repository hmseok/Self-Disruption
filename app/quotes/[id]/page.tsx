'use client'

import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
export const dynamic = "force-dynamic";

export default function QuoteDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const quoteId = Array.isArray(id) ? id[0] : id

  const [loading, setLoading] = useState(true)
  const [quote, setQuote] = useState<any>(null)
  const [linkedContract, setLinkedContract] = useState<any>(null)
  const [creating, setCreating] = useState(false)

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
      }

      // 3. 연결된 계약 확인
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

  // 계약 확정 로직
  const handleCreateContract = async () => {
    if (linkedContract) return alert('이미 계약이 확정된 건입니다.')
    if (!confirm('이 견적서로 계약을 확정하시겠습니까?')) return

    setCreating(true)
    try {
      // (1) 계약 생성
      const { data: contract, error: cErr } = await supabase.from('contracts').insert([{
        quote_id: quote.id,
        car_id: quote.car_id,
        customer_name: quote.customer_name,
        start_date: quote.start_date,
        end_date: quote.end_date,
        term_months: 36,
        deposit: quote.deposit,
        monthly_rent: quote.rent_fee,
        status: 'active'
      }]).select().single()

      if (cErr) throw cErr

      // (2) 스케줄 생성
      const schedules = []
      const rent = quote.rent_fee
      const vat = Math.round(rent * 0.1)
      const startDate = new Date(quote.start_date)

      // 보증금
      if (quote.deposit > 0) {
        schedules.push({ contract_id: contract.id, round_number: 0, due_date: quote.start_date, amount: quote.deposit, vat: 0, status: 'unpaid' })
      }
      // 36회차
      for (let i = 1; i <= 36; i++) {
        const d = new Date(startDate)
        d.setMonth(d.getMonth() + i)
        schedules.push({ contract_id: contract.id, round_number: i, due_date: d.toISOString().split('T')[0], amount: rent + vat, vat: vat, status: 'unpaid' })
      }

      await supabase.from('payment_schedules').insert(schedules)

      // (3) 차량 상태 변경
      await supabase.from('cars').update({ status: 'rented' }).eq('id', quote.car_id)

      alert('✅ 계약 확정 완료!')
      router.push(`/contracts/${contract.id}`)

    } catch (e: any) {
      alert('에러: ' + e.message)
    }
    setCreating(false)
  }

  if (loading) return <div className="p-20 text-center">불러오는 중...</div>
  if (!quote) return null

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-12 md:px-6 bg-gray-50/50 min-h-screen">

      {linkedContract && (
        <div className="bg-steel-600 text-white p-6 rounded-2xl shadow-lg mb-8 flex justify-between items-center no-print">
            <div>
                <h2 className="text-xl font-bold flex items-center gap-2">✅ 계약 확정된 건입니다</h2>
                <p className="text-steel-100 text-sm mt-1">계약번호: {String(linkedContract.id).slice(0,8)}</p>
            </div>
            <button
                onClick={() => router.push(`/contracts/${linkedContract.id}`)}
                className="bg-white text-steel-700 px-6 py-3 rounded-xl font-bold hover:bg-gray-100 shadow-md"
            >
                계약서 상세 보기 →
            </button>
        </div>
      )}

      <div className="flex justify-between items-center mb-6 no-print">
        <button onClick={() => router.push('/quotes')} className="text-gray-500 font-bold hover:text-black">← 목록</button>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="bg-gray-200 text-black px-4 py-2 rounded-lg font-bold hover:bg-gray-300">🖨️ 인쇄</button>

          {!linkedContract && (
            <button
                onClick={handleCreateContract}
                disabled={creating}
                className="bg-steel-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-black shadow-lg"
            >
                {creating ? '처리 중...' : '🚀 이 견적으로 계약 확정'}
            </button>
          )}
        </div>
      </div>

      <div className={`bg-white p-10 rounded-xl shadow-2xl border ${linkedContract ? 'border-steel-200' : 'border-gray-200'} relative overflow-hidden print:shadow-none print:border-none`}>

        {linkedContract && (
            <div className="absolute top-10 right-10 border-4 border-steel-600 text-steel-600 font-black text-4xl p-4 rounded-xl rotate-12 opacity-30 select-none print:opacity-100">
                CONTRACTED
            </div>
        )}

        <div className="border-b-2 border-black pb-6 mb-8 flex justify-between items-end">
          <div>
            <span className="text-gray-500 font-bold text-sm">RENTCAR QUOTATION</span>
            <h1 className="text-4xl font-black mt-2">렌트 견적서</h1>
          </div>
          <div className="text-right">
            {/* 👇 [수정됨] 에러 안 나게 String()으로 감싸고 자름 */}
            <p className="text-sm text-gray-500">No. {String(quote.id).slice(0, 8)}</p>
            <p className="text-sm text-gray-500">{quote.created_at?.split('T')[0]}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-10 mb-10">
          <div><h3 className="font-bold text-lg border-b pb-2 mb-4">👤 고객 정보</h3>
            <div className="space-y-1">
              <p className="flex justify-between"><span className="text-gray-500">고객명</span><b>{quote.customer_name}</b></p>
              <p className="flex justify-between"><span className="text-gray-500">계약기간</span><span>{quote.start_date} ~ {quote.end_date}</span></p>
              <p className="flex justify-between"><span className="text-gray-500">유형</span><span className="text-steel-600 font-bold">{quote.rental_type}</span></p>
            </div>
          </div>
          <div><h3 className="font-bold text-lg border-b pb-2 mb-4">🚗 차량 정보</h3>
            {quote.car ? (
              <div className="space-y-1">
                <p className="flex justify-between"><span className="text-gray-500">모델명</span><b>{quote.car.brand} {quote.car.model}</b></p>
                <p className="flex justify-between"><span className="text-gray-500">차량번호</span><b>{quote.car.number}</b></p>
              </div>
            ) : <p className="text-red-500">차량 정보 없음</p>}
          </div>
        </div>

        <div className="bg-gray-50 p-6 rounded-lg text-lg space-y-3 print:bg-white print:border">
            <div className="flex justify-between"><span>보증금</span><b>{f(quote.deposit)}원</b></div>
            <div className="border-b my-2"></div>
            <div className="flex justify-between"><span>월 렌트료 (VAT 별도)</span><b>{f(quote.rent_fee)}원</b></div>
            <div className="flex justify-between text-gray-500 text-sm"><span>부가세 (10%)</span><span>{f(Math.round(quote.rent_fee * 0.1))}원</span></div>
            <div className="border-t border-black pt-4 mt-4 flex justify-between text-2xl font-black text-steel-600">
                <span>월 납입금 (VAT 포함)</span><span>{f(quote.rent_fee * 1.1)}원</span>
            </div>
        </div>

        <div className="mt-20 flex justify-between text-sm text-gray-500">
          <div><p className="font-bold text-black">Self-Disruption ERP</p><p>담당자: 관리자</p></div>
          <div className="text-right mt-5"><span className="font-bold text-black text-lg">서명: ________________ (인)</span></div>
        </div>
      </div>

      {/* 👇 스타일 태그 문법 오류 방지 */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .shadow-2xl { box-shadow: none !important; }
        }
      `}</style>
    </div>
  )
}
'use client'
import { supabase } from '../../utils/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { generateContractPdf, renderTermsHtml } from '@/lib/contract-pdf'
import type { ContractPdfData } from '@/lib/contract-pdf'
import { CONTRACT_TERMS, RETURN_TYPE_ADDENDUM, BUYOUT_TYPE_ADDENDUM } from '@/lib/contract-terms'

// Sub-component: Contract Info Card
function ContractInfoCard({ contract }: { contract: any }) {
  const f = (n: number) => Math.round(n || 0).toLocaleString()

  if (!contract) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <span>📋</span> 계약 정보
        </h3>
      </div>
      <div className="p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-sm">고객명</span>
          <span className="font-bold text-gray-900">{contract.customer_name}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-sm">계약기간</span>
          <span className="text-gray-700 text-sm font-medium">
            {contract.start_date} ~ {contract.end_date}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-sm">계약개월</span>
          <span className="px-3 py-1 bg-steel-50 text-steel-600 rounded-lg text-sm font-bold">
            {contract.term_months || 36}개월
          </span>
        </div>
        <div className="border-t border-gray-100 pt-3 mt-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">보증금</span>
            <span className="font-bold text-gray-800">{f(contract.deposit)}원</span>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-sm">월 렌트료</span>
          <span className="font-bold text-gray-800">{f(contract.monthly_rent)}원</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-sm">납입금(VAT포함)</span>
          <span className="font-black text-xl text-steel-600">
            {f(Math.round(contract.monthly_rent * 1.1))}원
          </span>
        </div>
      </div>
    </div>
  )
}

// Sub-component: Vehicle Info Card
function VehicleInfoCard({ car }: { car: any }) {
  if (!car) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <span>🚗</span> 차량 정보
        </h3>
      </div>
      <div className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden border flex-shrink-0">
            {car.image_url ? (
              <img src={car.image_url} className="w-full h-full object-cover" alt="car" />
            ) : (
              <span className="text-gray-300 text-xs flex items-center justify-center h-full">
                No Img
              </span>
            )}
          </div>
          <div>
            <p className="font-bold text-gray-900">
              {car.brand} {car.model}
            </p>
            <p className="text-sm text-gray-500">{car.number}</p>
            {car.year && <p className="text-xs text-gray-400">{car.year}년식</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// Sub-component: Collection Status Panel
function CollectionStatusPanel({ schedules }: { schedules: any[] }) {
  const f = (n: number) => Math.round(n || 0).toLocaleString()

  const paidCount = schedules.filter(s => s.status === 'paid').length
  const totalCount = schedules.length
  const paidPercent = totalCount > 0 ? (paidCount / totalCount * 100) : 0
  const unpaidTotal = schedules.filter(s => s.status === 'unpaid').reduce((a, c) => a + c.amount, 0)
  const overdueCount = schedules.filter(
    s => new Date(s.due_date) < new Date() && s.status === 'unpaid'
  ).length

  return (
    <div className="bg-gray-900 text-white rounded-2xl shadow-xl p-6">
      <div className="border-b border-gray-700 pb-3 mb-4">
        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
          Collection Status
        </p>
        <h3 className="text-lg font-black mt-1">수납 현황</h3>
      </div>
      <div className="flex justify-between items-end mb-3">
        <span className="text-4xl font-black text-green-400">
          {paidCount}
          <span className="text-lg text-gray-400">회</span>
        </span>
        <span className="text-gray-400 text-sm">/ 총 {totalCount}회</span>
      </div>
      <div className="w-full bg-gray-700 h-3 rounded-full overflow-hidden">
        <div
          className="bg-green-500 h-full rounded-full transition-all duration-500"
          style={{ width: `${paidPercent}%` }}
        />
      </div>
      <div className="mt-4 flex justify-between text-xs">
        <span className="text-gray-400">
          진행률 <span className="text-white font-bold">{paidPercent.toFixed(0)}%</span>
        </span>
        <span className="text-gray-400">
          미수금 <span className="text-red-400 font-bold">{f(unpaidTotal)}원</span>
        </span>
      </div>
      {overdueCount > 0 && (
        <div className="mt-3 px-3 py-2 bg-red-500/20 rounded-xl text-red-300 text-xs font-bold">
          ⚠️ 연체 {overdueCount}건 발생
        </div>
      )}
    </div>
  )
}

// Sub-component: Quote Link Section
function QuoteLinkSection({ contract }: { contract: any }) {
  if (!contract?.quote_id) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <span>📄</span> 출처
        </h3>
      </div>
      <div className="p-6">
        <Link
          href={`/quotes/${contract.quote_id}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-steel-50 text-steel-600 rounded-xl font-bold hover:bg-steel-100 transition-colors"
        >
          <span>🔗</span> 출처 견적 보기
        </Link>
      </div>
    </div>
  )
}

// Sub-component: Contract PDF Download (with auto-upload to server)
function ContractPdfSection({ contract, schedules }: { contract: any; schedules: any[] }) {
  const [pdfLoading, setPdfLoading] = useState(false)
  const [savedPdfUrl, setSavedPdfUrl] = useState<string | null>(contract?.contract_pdf_url || null)

  const handleGeneratePdf = async () => {
    setPdfLoading(true)
    try {
      // 계약에 연결된 약관 조회 (없으면 정적 약관 fallback)
      let termsArticles: Array<{ title: string; content: string }> = []
      if (contract.terms_version_id) {
        const { data: articles } = await supabase
          .from('contract_term_articles')
          .select('article_number, title, content')
          .eq('terms_id', contract.terms_version_id)
          .order('article_number')
        if (articles && articles.length > 0) {
          termsArticles = articles.map((a: any) => ({
            title: `제${a.article_number}조 (${a.title})`,
            content: a.content,
          }))
        }
      }
      // DB 약관이 없으면 정적 약관 사용
      if (termsArticles.length === 0) {
        termsArticles = CONTRACT_TERMS.map(t => ({ title: t.title, content: t.content }))
      }

      // 견적/고객 정보 조회
      let quote: any = null
      if (contract.quote_id) {
        const { data: qData, error: qErr } = await supabase
          .from('quotes')
          .select('*')
          .eq('id', contract.quote_id)
          .single()
        if (qErr) console.error('Quote fetch error:', qErr.message, qErr.code)
        quote = qData
        // 고객 정보 별도 조회
        if (qData?.customer_id) {
          const { data: custData } = await supabase
            .from('customers')
            .select('*')
            .eq('id', qData.customer_id)
            .single()
          if (custData) quote = { ...quote, customer: custData }
        }
      }

      // 회사 정보는 quote_detail에서 활용
      let company: any = null

      // 서명 데이터 조회
      let signatureData = null
      let signatureIp = null
      if (contract.signature_id) {
        const { data: sig, error: sigErr } = await supabase
          .from('customer_signatures')
          .select('signature_data, ip_address')
          .eq('id', contract.signature_id)
          .single()
        if (sigErr) console.error('Signature fetch error:', sigErr.message, sigErr.code)
        if (sig) {
          signatureData = sig.signature_data
          signatureIp = sig.ip_address
        }
      } else {
        console.warn('No signature_id on contract:', contract.id)
      }

      const detail = quote?.quote_detail || {}
      const car = contract.car || {}

      const pdfData: ContractPdfData = {
        contractId: String(contract.id),
        signedAt: quote?.signed_at || contract.created_at,
        company: {
          name: company?.name || '',
          business_number: company?.business_number || '',
          representative: company?.representative || '',
          address: company?.address || '',
          phone: company?.phone || '',
          logo_url: company?.logo_url || '',
        },
        customer: {
          name: contract.customer_name || quote?.customer?.name || '',
          phone: quote?.customer?.phone || '',
          email: quote?.customer?.email || '',
          address: quote?.customer?.address || '',
        },
        car: {
          brand: car.brand || '',
          model: car.model || '',
          trim: car.trim || '',
          year: car.year || 0,
          fuel_type: car.fuel_type || '',
          number: car.number || '',
          factory_price: detail.factory_price || car.factory_price || 0,
        },
        terms: {
          contractType: detail.contract_type || 'return',
          termMonths: contract.term_months || 36,
          startDate: contract.start_date || '',
          endDate: contract.end_date || '',
          monthlyRent: contract.monthly_rent || 0,
          deposit: contract.deposit || 0,
          prepayment: detail.prepayment || 0,
          annualMileage: detail.annualMileage || 2,
          excessMileageRate: detail.excess_mileage_rate || 0,
          maintPackage: detail.maint_package || 'basic',
          deductible: detail.deductible || 0,
          buyoutPrice: detail.buyout_price || 0,
        },
        signatureData,
        signatureIp,
        specialTerms: contract.special_terms || undefined,
        paymentSchedule: schedules.map(s => ({
          round: s.round_number,
          dueDate: s.due_date,
          amount: s.amount,
          vat: s.vat || 0,
        })),
      }

      const contractType = detail.contract_type || 'return'
      const addendum = !contract.terms_version_id
        ? (contractType === 'buyout' ? BUYOUT_TYPE_ADDENDUM : RETURN_TYPE_ADDENDUM)
        : undefined
      const termsHtml = renderTermsHtml(
        termsArticles,
        addendum || contract.special_terms || undefined,
        '본 전자계약서는 전자서명법 제3조 및 전자문서 및 전자거래 기본법에 의거하여 자필서명과 동일한 법적 효력을 가집니다.'
      )

      const { blob, filename } = await generateContractPdf(pdfData, termsHtml)

      // 다운로드
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // 서버에 PDF 자동 저장 (아직 저장되지 않은 경우)
      if (!savedPdfUrl) {
        try {
          const reader = new FileReader()
          reader.onload = async () => {
            const base64 = reader.result as string
            const token = sessionStorage.getItem('supabase_access_token') || ''
            const res = await fetch(`/api/contracts/${contract.id}/generate-pdf`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ pdfBase64: base64, quoteId: contract.quote_id }),
            })
            const data = await res.json()
            if (data.success && data.pdf_url) {
              setSavedPdfUrl(data.pdf_url)
            }
          }
          reader.readAsDataURL(blob)
        } catch { /* PDF 저장 실패해도 다운로드는 이미 성공 */ }
      }
    } catch (err) {
      console.error('PDF 생성 실패:', err)
      alert('PDF 생성에 실패했습니다.')
    }
    setPdfLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <span>📑</span> 계약서
        </h3>
      </div>
      <div className="p-6 space-y-2">
        {savedPdfUrl && (
          <a
            href={savedPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '10px 16px', borderRadius: 12, fontWeight: 700, fontSize: 13,
              background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0',
              textDecoration: 'none', marginBottom: 8,
            }}
          >
            ✅ 저장된 계약서 PDF 열기
          </a>
        )}
        <button
          onClick={handleGeneratePdf}
          disabled={pdfLoading}
          className={`w-full px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            pdfLoading
              ? 'bg-gray-100 text-gray-400 cursor-wait'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
          }`}
        >
          {pdfLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              생성 중...
            </>
          ) : (
            <>📄 계약서 PDF {savedPdfUrl ? '재생성' : '다운로드'}</>
          )}
        </button>
        <p className="text-[10px] text-gray-400 text-center">
          약관·서명·납부스케줄 포함 정식 계약서 {savedPdfUrl ? '(서버에 저장됨)' : ''}
        </p>
      </div>
    </div>
  )
}

// Sub-component: Contract Timeline
function ContractTimeline({ quoteId }: { quoteId?: string }) {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!quoteId) return
    setLoading(true)
    const token = sessionStorage.getItem('supabase_access_token') || ''
    fetch(`/api/quotes/${quoteId}/timeline`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [quoteId])

  if (!quoteId || (events.length === 0 && !loading)) return null

  const EVENT_CFG: Record<string, { icon: string; label: string; color: string }> = {
    created:          { icon: '📄', label: '견적 생성',   color: '#6b7280' },
    shared:           { icon: '🔗', label: '링크 공유',   color: '#2563eb' },
    sent:             { icon: '📤', label: '견적 발송',   color: '#7c3aed' },
    viewed:           { icon: '👁️', label: '고객 열람',   color: '#0891b2' },
    signed:           { icon: '✍️', label: '고객 서명',   color: '#059669' },
    contract_created: { icon: '📋', label: '계약 생성',   color: '#059669' },
    revoked:          { icon: '🚫', label: '링크 비활성화', color: '#dc2626' },
    pdf_stored:       { icon: '💾', label: 'PDF 저장',    color: '#0369a1' },
  }

  const fTime = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <span>📋</span> 활동 타임라인
          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>{events.length}건</span>
        </h3>
      </div>
      <div className="p-6">
        {loading ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>불러오는 중...</p>
        ) : (
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 15, top: 8, bottom: 8, width: 2, background: '#e5e7eb' }} />
            {events.slice(0, 10).map((ev: any, i: number) => {
              const cfg = EVENT_CFG[ev.event_type] || { icon: '•', label: ev.event_type, color: '#6b7280' }
              return (
                <div key={ev.id} style={{ display: 'flex', gap: 12, marginBottom: i < Math.min(events.length, 10) - 1 ? 14 : 0, position: 'relative' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', background: '#f9fafb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, flexShrink: 0, zIndex: 1, border: `2px solid ${cfg.color}30`,
                  }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>{fTime(ev.created_at)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Sub-component: Payment Schedule Table (Desktop)
function DesktopPaymentTable({
  schedules,
  onTogglePayment,
}: {
  schedules: any[]
  onTogglePayment: (scheduleId: string, currentStatus: string) => void
}) {
  const f = (n: number) => Math.round(n || 0).toLocaleString()

  return (
    <div className="hidden md:block" style={{ maxHeight: 700, overflowY: 'auto', overflowX: 'auto' }}>
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs sticky top-0 z-10 border-b">
          <tr>
            <th className="p-4 pl-6">회차</th>
            <th className="p-4">예정일</th>
            <th className="p-4 text-right">공급가</th>
            <th className="p-4 text-right">VAT</th>
            <th className="p-4 text-right">합계</th>
            <th className="p-4 text-center">상태</th>
            <th className="p-4 text-right pr-6">처리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {schedules.map((item) => {
            const isOverdue = new Date(item.due_date) < new Date() && item.status === 'unpaid'
            const isDeposit = item.round_number === 0
            const supplyPrice = Math.round((item.amount || 0) / 1.1)
            const vatAmount = item.amount - supplyPrice

            return (
              <tr
                key={item.id}
                className={`hover:bg-gray-50 transition-colors ${
                  isDeposit
                    ? 'bg-steel-50 border-l-4 border-steel-600'
                    : item.status === 'paid'
                      ? 'bg-green-50/30'
                      : isOverdue
                        ? 'bg-red-50/30'
                        : ''
                }`}
              >
                <td className="p-4 pl-6 font-bold text-gray-600">
                  {isDeposit ? (
                    <span className="px-2 py-0.5 bg-steel-100 text-steel-600 rounded text-xs font-black">
                      💳 보증금
                    </span>
                  ) : (
                    `${item.round_number}회차`
                  )}
                </td>
                <td className={`p-4 ${isOverdue ? 'text-red-500 font-bold' : 'text-gray-600'}`}>
                  {item.due_date}
                  {isOverdue && (
                    <span className="text-[10px] ml-1 px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-bold">
                      연체
                    </span>
                  )}
                </td>
                <td className="p-4 text-right font-bold text-gray-800">{f(supplyPrice)}원</td>
                <td className="p-4 text-right font-bold text-gray-800">{f(vatAmount)}원</td>
                <td className="p-4 text-right font-bold text-gray-900">{f(item.amount)}원</td>
                <td className="p-4 text-center">
                  {item.status === 'paid' ? (
                    <span className="px-2.5 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-bold">
                      완납 {item.paid_date}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-red-100 text-red-600 text-xs font-bold">
                      미납
                    </span>
                  )}
                </td>
                <td className="p-4 text-right pr-6">
                  <button
                    onClick={() => onTogglePayment(item.id, item.status)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      item.status === 'paid'
                        ? 'border border-gray-200 text-gray-400 hover:bg-gray-100'
                        : 'bg-steel-600 text-white hover:bg-steel-700 shadow-md'
                    }`}
                  >
                    {item.status === 'paid' ? '취소' : '수납확인'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Sub-component: Payment Schedule Cards (Mobile)
function MobilePaymentCards({ schedules, onTogglePayment }: { schedules: any[], onTogglePayment: (id: string, status: string) => void }) {
  const f = (n: number) => Math.round(n || 0).toLocaleString()
  if (!schedules.length) return null
  return (
    <div className="md:hidden space-y-3">
      {schedules.map((item: any) => {
        const isOverdue = item.status !== 'paid' && new Date(item.due_date) < new Date()
        return (
          <div key={item.id} className={`p-4 rounded-xl border ${isOverdue ? 'border-red-200 bg-red-50' : item.status === 'paid' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-sm">
                {item.round_number === 0 ? '💳 보증금' : `${item.round_number}회차`}
              </span>
              {item.status === 'paid' ? (
                <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-bold">완납</span>
              ) : isOverdue ? (
                <span className="px-2 py-0.5 rounded bg-red-100 text-red-600 text-xs font-bold">연체</span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-xs font-bold">미납</span>
              )}
            </div>
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>납부일</span><span>{item.due_date}</span>
            </div>
            <div className="flex justify-between text-sm font-bold mb-3">
              <span>금액</span><span>{f(item.amount)}원</span>
            </div>
            <button
              onClick={() => onTogglePayment(item.id, item.status)}
              className={`w-full py-2 rounded-lg text-xs font-bold ${
                item.status === 'paid'
                  ? 'border border-gray-200 text-gray-400'
                  : 'bg-steel-600 text-white shadow-md'
              }`}
            >
              {item.status === 'paid' ? '수납 취소' : '수납확인'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// Sub-component: Linked Transactions
function LinkedTransactionsSection({ transactions }: { transactions: any[] }) {
  const f = (n: number) => Math.round(Math.abs(n || 0)).toLocaleString()
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const totalExpense = transactions.filter(t => t.type !== 'income').reduce((s, t) => s + Math.abs(t.amount || 0), 0)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <span>💰</span> 연결된 거래 내역
          {transactions.length > 0 && <span className="text-xs font-bold text-white bg-violet-500 px-2 py-0.5 rounded-full">{transactions.length}</span>}
        </h3>
      </div>
      {transactions.length === 0 ? (
        <div className="p-6 text-center text-gray-400 text-sm">
          연결된 거래 내역이 없습니다.
          <br />
          <span className="text-xs text-gray-300 mt-1 block">카드/통장 관리에서 거래를 이 계약에 연결하세요</span>
        </div>
      ) : (
        <>
          <div className="px-6 py-3 border-b border-gray-100 flex gap-4 text-sm">
            {totalIncome > 0 && <span className="text-blue-600 font-bold">입금 +{f(totalIncome)}원</span>}
            {totalExpense > 0 && <span className="text-red-500 font-bold">출금 -{f(totalExpense)}원</span>}
          </div>
          <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {transactions.map(tx => (
              <div key={tx.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 shrink-0">{tx.transaction_date}</span>
                    <span className="text-sm font-bold text-gray-800 truncate">{tx.client_name || tx.description || '-'}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{tx.category || '미분류'}</div>
                </div>
                <span className={`text-sm font-bold shrink-0 ml-3 ${tx.type === 'income' ? 'text-blue-600' : 'text-red-500'}`}>
                  {tx.type === 'income' ? '+' : '-'}{f(tx.amount)}원
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Main Component
export default function ContractDetailPage() {
  const { id } = useParams()
  const contractId = Array.isArray(id) ? id[0] : id
  const router = useRouter()

  const [contract, setContract] = useState<any>(null)
  const [schedules, setSchedules] = useState<any[]>([])
  const [linkedTransactions, setLinkedTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const f = (n: number) => Math.round(n || 0).toLocaleString()

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!contractId) return
    try {
      let { data: cData, error: cErr } = await supabase
        .from('contracts')
        .select('*, car:cars!car_id(*)')
        .eq('id', contractId)
        .single()

      // car JOIN 실패 시 계약만 조회
      if (cErr || !cData) {
        console.error('Contract fetch failed:', cErr?.message, cErr?.code)
        const { data: fallback } = await supabase
          .from('contracts')
          .select('*')
          .eq('id', contractId)
          .single()
        cData = fallback ? { ...fallback, car: null } : null
      }

      setContract(cData)

      const [sRes, tRes] = await Promise.all([
        supabase.from('payment_schedules').select('*').eq('contract_id', contractId).order('round_number', { ascending: true }),
        supabase.from('transactions').select('id, transaction_date, client_name, description, category, amount, type, payment_method').eq('related_type', 'contract').eq('related_id', contractId).order('transaction_date', { ascending: false }),
      ])
      setSchedules(sRes.data || [])
      setLinkedTransactions(tRes.data || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [contractId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Toggle payment status
  const togglePayment = async (scheduleId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid'
    const paidDate = newStatus === 'paid' ? new Date().toISOString().split('T')[0] : null

    const { error } = await supabase
      .from('payment_schedules')
      .update({ status: newStatus, paid_date: paidDate })
      .eq('id', scheduleId)

    if (error) {
      alert('오류: ' + error.message)
    } else {
      fetchData()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-steel-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-bold">계약서 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 font-bold">계약서를 찾을 수 없습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '2rem' }}>
        <div style={{ textAlign: 'left' }}>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/quotes" className="text-gray-400 hover:text-gray-600 text-sm">
              견적/계약 관리
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-steel-600 font-bold text-sm">계약 상세</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900">
            {contract.customer_name}님 계약 현황
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {contract.car?.brand} {contract.car?.model} · {contract.car?.number}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/quotes"
            className="px-4 py-2 text-sm border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-50"
          >
            ← 계약 관리
          </Link>
          <Link
            href="/quotes"
            className="px-4 py-2 text-sm border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-50"
          >
            견적 목록
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Summary Cards */}
        <div className="lg:col-span-4 space-y-6">
          <ContractInfoCard contract={contract} />
          <VehicleInfoCard car={contract.car} />
          <ContractPdfSection contract={contract} schedules={schedules} />
          <CollectionStatusPanel schedules={schedules} />
          <LinkedTransactionsSection transactions={linkedTransactions} />
          <QuoteLinkSection contract={contract} />
          <ContractTimeline quoteId={contract.quote_id} />
        </div>

        {/* Right: Payment Schedule Table */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <span>📅</span> 월별 수납 장부
              </h3>
              <span className="text-xs text-gray-400">* 클릭하여 수납처리</span>
            </div>

            <DesktopPaymentTable schedules={schedules} onTogglePayment={togglePayment} />
            <MobilePaymentCards schedules={schedules} onTogglePayment={togglePayment} />
          </div>
        </div>
      </div>
    </div>
  )
}

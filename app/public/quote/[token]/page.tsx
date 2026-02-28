'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import SignaturePad from '@/app/components/signature/SignaturePad'
import { generateContractPdf, renderTermsHtml } from '@/lib/contract-pdf'
import type { ContractPdfData } from '@/lib/contract-pdf'
import { CONTRACT_TERMS, RETURN_TYPE_ADDENDUM, BUYOUT_TYPE_ADDENDUM, ESIGN_NOTICE } from '@/lib/contract-terms'

const f = (n: number | undefined | null) => (n ?? 0).toLocaleString('ko-KR')
const MAINT: Record<string, string> = { self: '자가정비', oil_only: '오일류만', basic: '기본정비', full: '완전정비' }

type PageState = 'loading' | 'valid' | 'signed' | 'expired' | 'error'

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [quote, setQuote] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // 서명 폼 상태
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  // 견적 데이터 로드
  useEffect(() => {
    if (!token) return
    fetch(`/api/public/quote/${token}`)
      .then(async (res) => {
        const data = await res.json()
        if (data.code === 'SIGNED') {
          setState('signed')
        } else if (data.code === 'EXPIRED' || data.code === 'REVOKED') {
          setState('expired')
          setErrorMsg(data.error)
        } else if (data.error) {
          setState('error')
          setErrorMsg(data.error)
        } else {
          setQuote(data)
          setCustomerName(data.customer_name || '')
          setState('valid')
        }
      })
      .catch(() => {
        setState('error')
        setErrorMsg('서버에 연결할 수 없습니다.')
      })
  }, [token])

  // 서명 제출
  const handleSubmit = useCallback(async () => {
    if (!customerName.trim()) return alert('서명자 이름을 입력해주세요.')
    if (!signatureData) return alert('서명을 해주세요.')
    if (!agreedTerms) return alert('계약 조건에 동의해주세요.')

    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/quote/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          customer_email: customerEmail.trim() || null,
          signature_data: signatureData,
          agreed_terms: agreedTerms
        })
      })
      const data = await res.json()
      if (data.success) {
        setSubmitted(true)
      } else {
        alert(data.error || '서명 처리에 실패했습니다.')
      }
    } catch {
      alert('서버 오류가 발생했습니다.')
    }
    setSubmitting(false)
  }, [token, customerName, customerPhone, customerEmail, signatureData, agreedTerms])

  // ── PDF 다운로드 ──
  const handleDownloadPdf = useCallback(async () => {
    setPdfLoading(true)
    try {
      // PDF 데이터 API 호출
      const res = await fetch(`/api/public/contract/${token}/pdf`)
      if (!res.ok) throw new Error('PDF 데이터 조회 실패')
      const pdfData = await res.json()

      // 약관 HTML 생성 (addendum: 부속 약관, specialTerms: 특약사항)
      const termsHtml = renderTermsHtml(
        pdfData.termsArticles || [],
        pdfData.addendum || pdfData.specialTerms || undefined,
        '본 전자계약서는 전자서명법 제3조 및 전자문서 및 전자거래 기본법에 의거하여 자필서명과 동일한 법적 효력을 가집니다.'
      )

      // PDF 생성
      const contractPdfData: ContractPdfData = {
        contractId: String(pdfData.contractId),
        contractNumber: pdfData.contractNumber,
        signedAt: pdfData.signedAt,
        company: pdfData.company,
        customer: pdfData.customer,
        car: pdfData.car,
        terms: pdfData.terms,
        signatureData: pdfData.signatureData,
        signatureIp: pdfData.signatureIp,
        paymentSchedule: pdfData.paymentSchedule,
        specialTerms: pdfData.specialTerms,
      }

      const { blob, filename } = await generateContractPdf(contractPdfData, termsHtml)

      // 다운로드
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // 서버에 PDF 자동 저장 (fire-and-forget)
      try {
        const reader = new FileReader()
        reader.onload = async () => {
          const base64 = reader.result as string
          await fetch(`/api/contracts/${pdfData.contractId}/generate-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdfBase64: base64, quoteId: quote?.id }),
          }).catch(() => {})
        }
        reader.readAsDataURL(blob)
      } catch { /* PDF 서버 저장 실패해도 다운로드는 이미 성공 */ }
    } catch (err) {
      console.error('PDF 생성 실패:', err)
      alert('계약서 PDF 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
    setPdfLoading(false)
  }, [token])

  // ── 로딩 ──
  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-bold">견적서 불러오는 중...</p>
        </div>
      </div>
    )
  }

  // ── 이미 서명됨 ──
  if (state === 'signed' || submitted) {
    return (
      <div className="space-y-4">
        {/* 계약 완료 확인 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-2">계약이 완료되었습니다</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            서명이 정상적으로 접수되었습니다.<br />
            {customerEmail ? '입력하신 이메일로 계약서가 발송됩니다.' : '아래 버튼으로 계약서 PDF를 다운로드하세요.'}
          </p>
        </div>

        {/* PDF 다운로드 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">계약서 다운로드</p>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className={`w-full py-3.5 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
              pdfLoading
                ? 'bg-gray-100 text-gray-400 cursor-wait'
                : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-lg shadow-blue-200'
            }`}
          >
            {pdfLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                계약서 생성 중...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                계약서 PDF 다운로드
              </>
            )}
          </button>
          <p className="text-[10px] text-gray-400 text-center">
            계약 내용, 약관, 서명이 모두 포함된 정식 계약서입니다.
          </p>
        </div>

        {/* 안내 */}
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">안내사항</p>
          <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside leading-relaxed">
            <li>계약서 PDF는 세무서 비용처리 및 관할관청 제출에 사용 가능합니다.</li>
            <li>전자서명은 전자서명법에 의거 자필서명과 동일한 법적 효력을 가집니다.</li>
            <li>담당자가 별도로 연락드려 차량 인도 일정을 안내드리겠습니다.</li>
          </ul>
        </div>

        {/* 푸터 */}
        <div className="text-center py-4">
          <p className="text-[10px] text-gray-300">
            {quote?.company?.name || ''}
          </p>
        </div>
      </div>
    )
  }

  // ── 만료 / 취소 ──
  if (state === 'expired') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center bg-white rounded-2xl shadow-lg p-8 max-w-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-2">링크가 만료되었습니다</h2>
          <p className="text-gray-500 text-sm">{errorMsg || '담당자에게 새 링크를 요청해주세요.'}</p>
        </div>
      </div>
    )
  }

  // ── 에러 ──
  if (state === 'error' || !quote) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center bg-white rounded-2xl shadow-lg p-8 max-w-sm">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-2">오류</h2>
          <p className="text-gray-500 text-sm">{errorMsg || '견적서를 불러올 수 없습니다.'}</p>
        </div>
      </div>
    )
  }

  // ── 유효한 견적 → 서명 폼 ──
  const car = quote.car || {}
  const rentFee = quote.rent_fee || 0
  const rentVAT = Math.round(rentFee * 0.1)
  const termMonths = quote.term_months || 36
  const annualMileage = quote.annual_mileage || 2
  const totalMileageLimit = annualMileage * 10000 * (termMonths / 12)

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
        {quote.company?.logo_url && (
          <img src={quote.company.logo_url} alt="" className="h-10 mx-auto mb-2 object-contain" />
        )}
        <h1 className="text-lg font-black text-gray-900">
          {quote.company?.name || '장기렌트'}
        </h1>
        <p className="text-gray-400 text-xs mt-1">견적서 확인 및 계약 서명</p>
      </div>

      {/* 차량 정보 */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">차량 정보</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">차종</span>
            <span className="font-black">{car.brand} {car.model}</span>
          </div>
          {car.trim && (
            <div className="flex justify-between">
              <span className="text-gray-500">트림</span>
              <span className="font-bold">{car.trim}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">연식</span>
            <span className="font-bold">{car.year}년</span>
          </div>
          {car.fuel_type && (
            <div className="flex justify-between">
              <span className="text-gray-500">연료</span>
              <span className="font-bold">{car.fuel_type}</span>
            </div>
          )}
          {car.number && (
            <div className="flex justify-between">
              <span className="text-gray-500">차량번호</span>
              <span className="font-bold">{car.number}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">차량가격</span>
            <span className="font-bold">{f(car.factory_price)}원</span>
          </div>
        </div>
      </div>

      {/* 계약 조건 */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">계약 조건</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">계약유형</span>
            <span className="font-black">{quote.contract_type === 'buyout' ? '인수형 장기렌트' : '반납형 장기렌트'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">계약기간</span>
            <span className="font-bold">{termMonths}개월</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">약정주행</span>
            <span className="font-bold">연 {f(annualMileage * 10000)}km (총 {f(Math.round(totalMileageLimit))}km)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">정비상품</span>
            <span className="font-bold">{MAINT[quote.maint_package] || quote.maint_package}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">보험연령</span>
            <span className="font-bold">만 {quote.driver_age_group}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">자차 면책금</span>
            <span className="font-bold">{quote.deductible === 0 ? '완전자차 (0원)' : `${f(quote.deductible)}원`}</span>
          </div>
        </div>
      </div>

      {/* 월 렌탈료 (핵심) */}
      <div className="bg-gray-900 text-white rounded-2xl shadow-xl p-5">
        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">Monthly Rental</p>
        <div className="text-center py-3">
          <p className="text-3xl font-black tracking-tight">{f(rentFee)}<span className="text-base ml-1">원</span></p>
          <p className="text-xs text-gray-400 mt-1">VAT 포함 시 {f(rentFee + rentVAT)}원/월</p>
        </div>
        <div className="border-t border-gray-700 pt-3 mt-2 space-y-1.5 text-xs">
          {quote.deposit > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-400">보증금</span>
              <span className="font-bold">{f(quote.deposit)}원</span>
            </div>
          )}
          {quote.prepayment > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-400">선납금</span>
              <span className="font-bold">{f(quote.prepayment)}원</span>
            </div>
          )}
          {quote.contract_type === 'buyout' && quote.buyout_price > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-400">인수가격 (만기 시)</span>
              <span className="font-bold">{f(quote.buyout_price)}원</span>
            </div>
          )}
          {quote.excess_mileage_rate > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-400">초과주행 단가</span>
              <span className="font-bold">{f(quote.excess_mileage_rate)}원/km</span>
            </div>
          )}
        </div>
      </div>

      {/* 유의사항 */}
      <div className="bg-amber-50 rounded-2xl p-4">
        <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest mb-2">유의사항</p>
        <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
          <li>본 견적서는 발행일로부터 유효합니다.</li>
          <li>월 렌탈료는 부가세(VAT 10%) 별도 금액입니다.</li>
          <li>약정주행거리 초과 시 추가 요금이 발생합니다.</li>
          <li>차량 인도일 기준으로 계약이 시작됩니다.</li>
          {quote.contract_type === 'buyout' && (
            <li>인수형 계약: 만기 시 잔존가격으로 차량을 인수할 수 있습니다.</li>
          )}
        </ul>
      </div>

      {/* 서명 영역 */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <div>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-3">계약 서명</p>
        </div>

        {/* 서명자 정보 */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">서명자 이름 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="이름을 입력해주세요"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">연락처</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="010-1234-5678"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">이메일</label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="email@example.com"
              />
            </div>
          </div>
        </div>

        {/* 약관 보기 */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTerms(!showTerms)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-left"
          >
            <span className="text-xs font-bold text-gray-700">자동차 장기대여 약관 보기</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showTerms ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {showTerms && (
            <div className="max-h-[400px] overflow-y-auto px-4 py-3 space-y-3 border-t border-gray-200">
              {/* DB 약관 우선, 없으면 정적 약관 fallback */}
              {(quote.termsArticles || CONTRACT_TERMS).map((term: any, i: number) => (
                <div key={i}>
                  <p className="text-[11px] font-bold text-gray-800">{term.title}</p>
                  <p className="text-[10px] text-gray-600 whitespace-pre-line leading-relaxed mt-0.5">{term.content}</p>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-700">부속 약관</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {quote.contract_type === 'buyout' ? BUYOUT_TYPE_ADDENDUM : RETURN_TYPE_ADDENDUM}
                </p>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-[10px] text-blue-600">{ESIGN_NOTICE}</p>
              </div>
            </div>
          )}
        </div>

        {/* 동의 */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600 leading-relaxed">
            상기 견적 내용 및 <button type="button" onClick={() => setShowTerms(true)} className="text-blue-600 underline font-bold">약관</button>을 확인하였으며, 계약 조건 및 개인정보 수집·이용에 동의합니다.
          </span>
        </label>

        {/* 서명 패드 */}
        <div className="flex flex-col items-center">
          <p className="text-xs font-bold text-gray-600 mb-2 self-start">서명 <span className="text-red-500">*</span></p>
          <SignaturePad
            onSignatureChange={setSignatureData}
            width={340}
            height={140}
          />
        </div>

        {/* 제출 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !customerName.trim() || !signatureData || !agreedTerms}
          className={`w-full py-3.5 rounded-xl font-black text-sm transition-all ${
            submitting || !customerName.trim() || !signatureData || !agreedTerms
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-lg shadow-blue-200'
          }`}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              처리 중...
            </span>
          ) : '계약 동의 및 서명 제출'}
        </button>

        <p className="text-[10px] text-gray-400 text-center">
          서명 제출 시 계약이 자동으로 체결됩니다.
        </p>
      </div>

      {/* 푸터 */}
      <div className="text-center py-4">
        <p className="text-[10px] text-gray-300">
          {quote.company?.name} · 사업자번호 {quote.company?.business_number || '-'}
        </p>
      </div>
    </div>
  )
}

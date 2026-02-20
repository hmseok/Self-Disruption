'use client'

import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ============================================
// 유틸
// ============================================
const f = (n: number) => Math.round(n).toLocaleString()
const fDate = (d: string) => {
  const dt = new Date(d)
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
}

// ============================================
// 정비 패키지 라벨
// ============================================
const MAINT_PACKAGE_LABELS: Record<string, string> = {
  self: '자가정비',
  oil_only: '엔진오일 교환',
  basic: '기본정비',
  full: '종합정비',
}

const MAINT_PACKAGE_DESC: Record<string, string> = {
  self: '고객 직접 정비 (렌탈료 미포함)',
  oil_only: '엔진오일+필터 교환 포함',
  basic: '오일+에어필터+브레이크점검+순회정비 포함',
  full: '오일+필터+브레이크+타이어+배터리+와이퍼+냉각수 전항목 포함',
}

// 초과주행 km당 추가요금 fallback (빌더에서 전달 안된 경우)
const getExcessMileageRateFallback = (factoryPrice: number): number => {
  if (factoryPrice < 25000000) return 110
  if (factoryPrice < 40000000) return 150
  if (factoryPrice < 60000000) return 200
  if (factoryPrice < 80000000) return 250
  if (factoryPrice < 120000000) return 320
  return 450
}

// ============================================
// 타입
// ============================================
interface QuoteBuilderData {
  car: {
    id: string | number; brand: string; model: string; trim: string;
    year: number; fuel: string; mileage: number; number: string;
    status: string; engine_cc: number;
  }
  factoryPrice: number
  purchasePrice: number
  totalAcquisitionCost: number
  contractType: 'return' | 'buyout'
  termMonths: number
  deposit: number
  prepayment: number
  annualMileage: number
  depCurvePreset: string
  carAgeMode: string
  customCarAge?: number
  residualRate: number
  calculations: {
    monthlyDepreciation: number; totalMonthlyFinance: number;
    monthlyLoanInterest: number; monthlyOpportunityCost: number;
    monthlyTax: number; monthlyRiskReserve: number;
    totalDiscount: number; totalMonthlyCost: number;
    suggestedRent: number; rentWithVAT: number;
    currentMarketValue: number; endMarketValue: number;
    residualValue: number; buyoutPrice: number;
    costBase: number; yearDep: number; yearDepEnd: number;
    totalDepRate: number; totalDepRateEnd: number;
    depClass: string; classMult: number;
    purchaseDiscount: number; marketAvg: number; marketDiff: number;
    avgLoanBalance?: number; avgEquityBalance?: number;
    monthlyDepositDiscount?: number; monthlyPrepaymentDiscount?: number;
  }
  monthlyInsuranceCost: number
  monthlyMaintenance: number
  maintPackage: string
  annualTax: number
  loanAmount: number; loanRate: number; investmentRate: number
  deductible: number; riskRate: number; margin: number
  excessMileageRate?: number
  registrationRegion?: string
  bondCost?: number
  acquisitionTax?: number
  companyId: string
  createdAt: string
  worksheetId?: string
  baselineKm?: number
  driverAgeGroup?: string
  insEstimate?: any
}

interface Customer {
  id: string; name: string; phone: string; email: string;
  type: string; business_number?: string; address?: string;
}

// ============================================
// 메인 컴포넌트
// ============================================
export default function QuoteCreator() {
  const router = useRouter()
  const { company: appCompany, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : appCompany?.id
  const printRef = useRef<HTMLDivElement>(null)

  // 데이터
  const [data, setData] = useState<QuoteBuilderData | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [company, setCompany] = useState<any>(null)
  // 직접 입력 고객 (미등록)
  const [customerMode, setCustomerMode] = useState<'select' | 'manual'>('select')
  const [manualCustomer, setManualCustomer] = useState({ name: '', phone: '', email: '', business_number: '' })

  // 견적서 커스텀
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [quoteNote, setQuoteNote] = useState('')
  const [saving, setSaving] = useState(false)

  // 단계
  const [step, setStep] = useState<'setup' | 'preview'>('setup')

  // 초기 데이터 로드
  useEffect(() => {
    const raw = sessionStorage.getItem('quoteBuilderData')
    if (!raw) {
      alert('견적 데이터가 없습니다. 렌트가 산출 빌더에서 분석을 먼저 진행해주세요.')
      router.push('/quotes/pricing')
      return
    }
    setData(JSON.parse(raw))
  }, [router])

  useEffect(() => {
    if (!effectiveCompanyId) {
      // effectiveCompanyId 없어도 appCompany가 있으면 그대로 사용
      if (appCompany) setCompany(appCompany)
      return
    }
    const fetchData = async () => {
      const [custRes, compRes] = await Promise.all([
        supabase.from('customers').select('*').eq('company_id', effectiveCompanyId).order('name'),
        supabase.from('companies').select('*').eq('id', effectiveCompanyId).single(),
      ])
      if (custRes.data) setCustomers(custRes.data)
      if (compRes.data) setCompany(compRes.data)
      else if (appCompany) setCompany(appCompany) // DB fetch 실패 시 appCompany fallback
    }
    fetchData()
  }, [effectiveCompanyId, appCompany])

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-steel-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const { car, calculations: calc } = data
  const selectedCustomer: Partial<Customer> | undefined = customerMode === 'select'
    ? customers.find(c => c.id === selectedCustomerId)
    : manualCustomer.name ? { ...manualCustomer, id: '', type: '직접입력' } : undefined

  // 계약 종료일 계산
  const endDate = (() => {
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + data.termMonths)
    return d.toISOString().split('T')[0]
  })()

  // VAT 계산
  const rentVAT = Math.round(calc.suggestedRent * 0.1)

  // 총 납입금 계산
  const totalPayments = calc.rentWithVAT * data.termMonths
  const totalWithDeposit = totalPayments + data.deposit
  const totalWithBuyout = data.contractType === 'buyout'
    ? totalWithDeposit + calc.buyoutPrice
    : totalWithDeposit

  // 초과주행 km당 추가요금 (빌더에서 전달받은 값 우선, 없으면 fallback)
  const excessMileageRate = data.excessMileageRate || getExcessMileageRateFallback(data.factoryPrice)
  // 약정 총 주행거리
  const totalMileageLimit = data.annualMileage * 10000 * (data.termMonths / 12)

  // ============================================
  // 저장
  // ============================================
  const handleSaveQuote = async (status: 'draft' | 'active') => {
    if (customerMode === 'select' && !selectedCustomerId) return alert('고객을 선택해주세요.')
    if (customerMode === 'manual' && !manualCustomer.name.trim()) return alert('고객명을 입력해주세요.')
    setSaving(true)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    // 확장 데이터 (quote_detail JSONB) — 견적서 출력에 필요한 전체 원가분석 포함
    const detailData = {
      manual_customer: customerMode === 'manual' ? manualCustomer : null,
      contract_type: data.contractType,
      residual_rate: data.residualRate,
      residual_value: calc.residualValue,
      buyout_price: calc.buyoutPrice,
      factory_price: data.factoryPrice,
      purchase_price: data.purchasePrice,
      total_acquisition_cost: data.totalAcquisitionCost,
      car_info: {
        brand: car.brand, model: car.model, trim: car.trim,
        year: car.year, fuel: car.fuel, engine_cc: car.engine_cc,
        mileage: car.mileage,
      },
      cost_breakdown: {
        depreciation: calc.monthlyDepreciation,
        finance: calc.totalMonthlyFinance,
        loan_interest: calc.monthlyLoanInterest,
        opportunity_cost: calc.monthlyOpportunityCost,
        avg_loan_balance: calc.avgLoanBalance,
        avg_equity_balance: calc.avgEquityBalance,
        insurance: data.monthlyInsuranceCost,
        maintenance: data.monthlyMaintenance,
        tax: calc.monthlyTax,
        risk: calc.monthlyRiskReserve,
        deposit_discount: calc.monthlyDepositDiscount,
        prepayment_discount: calc.monthlyPrepaymentDiscount,
        discount: calc.totalDiscount,
      },
      // 금융 상세
      loan_amount: data.loanAmount,
      loan_rate: data.loanRate,
      investment_rate: data.investmentRate,
      // 계약 조건
      term_months: data.termMonths,
      annualMileage: data.annualMileage,
      baselineKm: data.baselineKm,
      deposit: data.deposit,
      prepayment: data.prepayment,
      deductible: data.deductible,
      margin: data.margin,
      // 보험/정비
      driver_age_group: data.driverAgeGroup,
      ins_estimate: data.insEstimate,
      maint_package: data.maintPackage,
      // 초과주행
      excess_mileage_rate: excessMileageRate,
      // 감가
      dep_curve_preset: data.depCurvePreset,
      current_market_value: calc.currentMarketValue,
      end_market_value: calc.endMarketValue,
      year_dep: calc.yearDep,
      year_dep_end: calc.yearDepEnd,
      total_dep_rate: calc.totalDepRate,
      total_dep_rate_end: calc.totalDepRateEnd,
      cost_base: calc.costBase,
      purchase_discount: calc.purchaseDiscount,
      // 메타
      note: quoteNote || null,
      worksheet_id: data.worksheetId || null,
    }

    // 먼저 quotes 테이블의 실제 컬럼 조회
    try {
      // 방법 1: 기본 컬럼으로 insert 시도
      // companyId: sessionStorage에서 전달받은 값 또는 현재 로그인 회사
      const resolvedCompanyId = data.companyId || effectiveCompanyId
      const basePayload: Record<string, any> = {
        company_id: resolvedCompanyId,
        car_id: (!car.id || String(car.id).startsWith('newcar-')) ? null : Number(car.id) || car.id,
        customer_id: customerMode === 'select' ? selectedCustomerId : null,
        start_date: startDate,
        end_date: endDate,
        deposit: data.deposit,
        rent_fee: calc.suggestedRent,
        status,
      }

      // term 컬럼 시도 (이전 에러에서 문제가 되었음 - 스키마 캐시 이슈일 수 있음)
      const payloadWithTerm = { ...basePayload, term: data.termMonths }

      // 확장 컬럼 (migration 실행 후 사용 가능)
      const extendedCols: Record<string, any> = {
        customer_name: customerMode === 'select' ? (selectedCustomer?.name || '') : manualCustomer.name.trim(),
        rental_type: data.contractType === 'buyout' ? '인수형렌트' : '반납형렌트',
        margin: data.margin,
        memo: quoteNote || null,
        quote_detail: detailData,
        expires_at: expiresAt.toISOString(),
        worksheet_id: data.worksheetId || null,
      }

      // 전체 시도
      let fullPayload = { ...payloadWithTerm, ...extendedCols }
      let { data: insertData, error } = await supabase.from('quotes').insert([fullPayload]).select()

      // 에러 시 → term 없이 재시도
      if (error && error.message.includes('term')) {
        console.warn('Insert with term failed, retrying without term:', error.message)
        fullPayload = { ...basePayload, ...extendedCols }
        const result = await supabase.from('quotes').insert([fullPayload]).select()
        error = result.error
        insertData = result.data
      }

      // 에러 시 → 확장컬럼 빼고 재시도
      if (error && error.message.includes('column')) {
        console.warn('Full insert failed, trying base only:', error.message)
        const result = await supabase.from('quotes').insert([payloadWithTerm]).select()
        error = result.error
        insertData = result.data

        // term도 안되면 최소 컬럼
        if (error && error.message.includes('term')) {
          const result2 = await supabase.from('quotes').insert([basePayload]).select()
          error = result2.error
          insertData = result2.data
        }
      }

      setSaving(false)

      if (error) {
        console.error('Quote save error:', error)
        alert('저장 실패: ' + error.message +
          '\n\nSupabase SQL Editor에서 다음 마이그레이션을 실행해주세요:\n' +
          '파일: sql/014_quotes_enhancement.sql')
      } else {
        sessionStorage.removeItem('quoteBuilderData')
        alert(`견적서가 ${status === 'draft' ? '임시저장' : '확정'}되었습니다.`)
        router.push('/quotes')
      }
    } catch (err: any) {
      setSaving(false)
      console.error('Unexpected error:', err)
      alert('저장 중 오류 발생: ' + (err?.message || String(err)))
    }
  }

  // ============================================
  // 인쇄
  // ============================================
  const handlePrint = () => {
    window.print()
  }

  // ============================================
  // Step 1: 고객 선택 + 날짜 설정
  // ============================================
  if (step === 'setup') {
    return (
      <div className="max-w-[800px] mx-auto py-8 px-4 min-h-screen bg-gray-50/50">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/quotes/pricing" className="text-gray-400 hover:text-gray-600 text-sm">&larr; 산출 빌더</Link>
          <span className="text-gray-300">/</span>
          <span className="text-steel-600 font-bold text-sm">견적서 작성</span>
        </div>

        <h1 className="text-2xl font-black text-gray-900 mb-2">견적서 작성</h1>
        <p className="text-gray-500 text-sm mb-8">렌트가 산출 결과를 바탕으로 고객용 견적서를 생성합니다.</p>

        {/* 분석 요약 */}
        <div className="bg-gray-900 text-white rounded-2xl p-5 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-xs">분석 차량</p>
              <p className="font-black text-lg">{car.brand} {car.model}</p>
              <p className="text-gray-400 text-sm">{car.trim} · {car.year}년식</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs">산출 렌트가 (VAT 포함)</p>
              <p className="text-2xl font-black text-yellow-400">{f(calc.rentWithVAT)}원<span className="text-sm text-gray-400">/월</span></p>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold mt-1 inline-block
                ${data.contractType === 'return' ? 'bg-steel-600/30 text-steel-300' : 'bg-amber-500/30 text-amber-300'}`}>
                {data.contractType === 'return' ? '반납형' : '인수형'} · {data.termMonths}개월
              </span>
            </div>
          </div>
        </div>

        {/* 고객 선택 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-700 text-sm">고객 정보</h3>
            <div className="flex gap-1.5">
              <button
                onClick={() => setCustomerMode('select')}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition-colors
                  ${customerMode === 'select' ? 'bg-steel-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
              >
                등록 고객
              </button>
              <button
                onClick={() => setCustomerMode('manual')}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition-colors
                  ${customerMode === 'manual' ? 'bg-steel-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
              >
                직접 입력
              </button>
            </div>
          </div>

          {customerMode === 'select' ? (
            <>
              <select
                className="w-full p-3 border border-gray-200 rounded-xl font-bold text-base focus:border-steel-500 outline-none mb-3"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
              >
                <option value="">고객을 선택하세요</option>
                {customers.map(cust => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name} ({cust.type}) - {cust.phone}
                  </option>
                ))}
              </select>
              {selectedCustomer && (
                <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">이름</span>
                    <span className="font-bold">{selectedCustomer.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">연락처</span>
                    <span className="font-bold">{selectedCustomer.phone}</span>
                  </div>
                  {selectedCustomer.email && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">이메일</span>
                      <span className="font-bold">{selectedCustomer.email}</span>
                    </div>
                  )}
                  {selectedCustomer.business_number && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">사업자번호</span>
                      <span className="font-bold">{selectedCustomer.business_number}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">고객 등록 전에도 견적서를 작성할 수 있습니다.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">고객명 *</label>
                  <input
                    type="text"
                    placeholder="홍길동 / (주)ABC"
                    value={manualCustomer.name}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">연락처</label>
                  <input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={manualCustomer.phone}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">이메일</label>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={manualCustomer.email}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">사업자번호</label>
                  <input
                    type="text"
                    placeholder="000-00-00000"
                    value={manualCustomer.business_number}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, business_number: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 계약 시작일 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <h3 className="font-bold text-gray-700 text-sm mb-3">계약 기간</h3>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 font-bold text-sm focus:border-steel-500 outline-none"
              />
            </div>
            <span className="text-gray-300 mt-5">&rarr;</span>
            <div>
              <label className="text-xs text-gray-400 block mb-1">종료일 (자동)</label>
              <div className="border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 font-bold text-sm text-gray-600">
                {fDate(endDate)}
              </div>
            </div>
            <div className="mt-5 text-sm text-gray-500 font-bold">{data.termMonths}개월</div>
          </div>
        </div>

        {/* 비고 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <h3 className="font-bold text-gray-700 text-sm mb-3">비고 (선택)</h3>
          <textarea
            placeholder="견적서에 표시할 특이사항, 프로모션 안내 등..."
            value={quoteNote}
            onChange={(e) => setQuoteNote(e.target.value)}
            className="w-full border border-gray-200 rounded-xl p-3 text-sm h-20 resize-none focus:border-steel-500 outline-none"
          />
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <Link href="/quotes/pricing"
            className="flex-1 py-3 text-center border border-gray-300 rounded-xl font-bold text-gray-500 hover:bg-gray-50">
            &larr; 산출 빌더로
          </Link>
          <button
            onClick={() => {
              if (customerMode === 'select' && !selectedCustomerId) return alert('고객을 선택해주세요.')
              if (customerMode === 'manual' && !manualCustomer.name.trim()) return alert('고객명을 입력해주세요.')
              setStep('preview')
            }}
            className="flex-[2] py-3 bg-gray-900 text-white rounded-xl font-black hover:bg-gray-800 transition-colors"
          >
            견적서 미리보기 &rarr;
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // Step 2: 견적서 미리보기 — 대형 렌터카사 스타일
  // ============================================
  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4">
      {/* 상단 액션 바 (인쇄 시 숨김) */}
      <div className="max-w-[800px] mx-auto mb-4 flex justify-between items-center print:hidden">
        <button onClick={() => setStep('setup')} className="text-sm text-gray-500 hover:text-gray-700 font-bold">
          &larr; 설정으로 돌아가기
        </button>
        <div className="flex gap-2">
          <button onClick={handlePrint}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-white">
            인쇄
          </button>
          <button onClick={() => handleSaveQuote('draft')} disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-white disabled:opacity-50">
            {saving ? '저장중...' : '임시저장'}
          </button>
          <button onClick={() => handleSaveQuote('active')} disabled={saving}
            className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-black hover:bg-gray-800 disabled:opacity-50">
            {saving ? '저장중...' : '견적서 확정'}
          </button>
        </div>
      </div>

      {/* =============================================
          견적서 본문 (인쇄 대상) — 고객용 견적서
          ============================================= */}
      <div ref={printRef} className="max-w-[800px] mx-auto bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:rounded-none">

        {/* 헤더 */}
        <div className="bg-gray-900 text-white px-8 py-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black tracking-tight">장기렌트 견적서</h1>
              <p className="text-gray-400 text-sm mt-1">LONG-TERM RENTAL QUOTATION</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs">견적일</p>
              <p className="font-bold">{fDate(data.createdAt)}</p>
              <p className="text-gray-400 text-xs mt-1">유효기간</p>
              <p className="text-sm text-yellow-400 font-bold">발행일로부터 30일</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* 1. 임대인 / 임차인 정보 */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">임대인</p>
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
                <p className="font-black text-base">{company?.name || '당사'}</p>
                {company?.business_number && <p className="text-gray-500">사업자번호: {company.business_number}</p>}
                {company?.address && <p className="text-gray-500">{company.address}</p>}
                {company?.phone && <p className="text-gray-500">TEL: {company.phone}</p>}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">임차인</p>
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
                <p className="font-black text-base">{selectedCustomer?.name || '-'}</p>
                {selectedCustomer?.business_number && <p className="text-gray-500">사업자번호: {selectedCustomer.business_number}</p>}
                {selectedCustomer?.phone && <p className="text-gray-500">연락처: {selectedCustomer.phone}</p>}
                {selectedCustomer?.email && <p className="text-gray-500">{selectedCustomer.email}</p>}
                {selectedCustomer?.address && <p className="text-gray-500">{selectedCustomer.address}</p>}
              </div>
            </div>
          </div>

          {/* 2. 차량 정보 */}
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">차량 정보</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500 w-28">차종</td>
                    <td className="px-4 py-2.5 font-black">{car.brand} {car.model}</td>
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500 w-28">트림</td>
                    <td className="px-4 py-2.5 font-bold">{car.trim || '-'}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">연식</td>
                    <td className="px-4 py-2.5">{car.year}년</td>
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">연료</td>
                    <td className="px-4 py-2.5">{car.fuel || '-'}</td>
                  </tr>
                  <tr>
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">차량가격</td>
                    <td className="px-4 py-2.5 font-bold">{f(data.factoryPrice)}원</td>
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">차량번호</td>
                    <td className="px-4 py-2.5">{car.number || '(출고 전)'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. 계약 조건 */}
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">계약 조건</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500 w-28">계약유형</td>
                    <td className="px-4 py-2.5 font-black">
                      {data.contractType === 'buyout' ? '인수형 장기렌트' : '반납형 장기렌트'}
                    </td>
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500 w-28">계약기간</td>
                    <td className="px-4 py-2.5 font-bold">{data.termMonths}개월</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">시작일</td>
                    <td className="px-4 py-2.5">{fDate(startDate)}</td>
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">종료일</td>
                    <td className="px-4 py-2.5">{fDate(endDate)}</td>
                  </tr>
                  <tr>
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">약정주행</td>
                    <td className="px-4 py-2.5">연 {f(data.annualMileage * 10000)}km (총 {f(totalMileageLimit)}km)</td>
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">정비상품</td>
                    <td className="px-4 py-2.5">{MAINT_PACKAGE_LABELS[data.maintPackage] || data.maintPackage}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. 핵심 — 월 납입 요금 안내 */}
          <div className="border-2 border-gray-900 rounded-2xl overflow-hidden">
            <div className="bg-gray-900 text-white px-6 py-3">
              <p className="font-black text-base">월 렌탈료 안내</p>
            </div>
            <div className="p-6">
              {/* 핵심 금액 카드 */}
              <div className={`grid ${data.contractType === 'buyout' ? 'grid-cols-3' : 'grid-cols-2'} gap-4 mb-5`}>
                {/* 보증금 */}
                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-400 font-bold mb-1">보증금 (계약 시 1회)</p>
                  <p className="text-xl font-black text-gray-800">{f(data.deposit)}<span className="text-sm font-bold">원</span></p>
                  {data.deposit === 0 && <p className="text-[10px] text-green-500 font-bold">무보증금</p>}
                </div>
                {/* 월 렌탈료 */}
                <div className="text-center p-5 bg-blue-50 rounded-xl border-2 border-blue-300">
                  <p className="text-xs text-blue-500 font-bold mb-1">월 렌탈료 (VAT 포함)</p>
                  <p className="text-3xl font-black text-blue-700">{f(calc.rentWithVAT)}<span className="text-sm font-bold">원</span></p>
                  <p className="text-[11px] text-blue-400 mt-1">공급가 {f(calc.suggestedRent)}원 + VAT {f(rentVAT)}원</p>
                </div>
                {/* 인수가격 (인수형) */}
                {data.contractType === 'buyout' && (
                  <div className="text-center p-4 bg-amber-50 rounded-xl border-2 border-amber-200">
                    <p className="text-xs text-amber-600 font-bold mb-1">인수가격 (만기 시)</p>
                    <p className="text-xl font-black text-amber-700">{f(calc.buyoutPrice)}<span className="text-sm font-bold">원</span></p>
                    <p className="text-[10px] text-amber-400">인수 미희망 시 반납 가능</p>
                  </div>
                )}
              </div>

              {/* 선납금 표시 (있는 경우만) */}
              {data.prepayment > 0 && (
                <div className="bg-gray-50 rounded-lg px-4 py-2 mb-4 flex justify-between items-center text-sm">
                  <span className="text-gray-500">선납금 (계약 시 1회)</span>
                  <span className="font-bold">{f(data.prepayment)}원</span>
                </div>
              )}

              {/* 총 납입금 요약 테이블 */}
              <div className="bg-gray-50 rounded-xl p-4">
                <table className="w-full text-sm">
                  <tbody>
                    {data.deposit > 0 && (
                      <tr className="border-b border-gray-200">
                        <td className="py-2 text-gray-500">보증금</td>
                        <td className="py-2 text-right font-bold">{f(data.deposit)}원</td>
                      </tr>
                    )}
                    {data.prepayment > 0 && (
                      <tr className="border-b border-gray-200">
                        <td className="py-2 text-gray-500">선납금</td>
                        <td className="py-2 text-right font-bold">{f(data.prepayment)}원</td>
                      </tr>
                    )}
                    {data.contractType === 'buyout' && (
                      <tr className="border-b border-gray-200">
                        <td className="py-2 text-amber-600 font-bold">인수가격 (만기 시)</td>
                        <td className="py-2 text-right font-black text-amber-600">{f(calc.buyoutPrice)}원</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 5. 렌탈료 포함 서비스 (대형사 핵심 정보!) */}
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">렌탈료 포함 서비스</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left font-bold text-gray-500 w-40">항목</th>
                    <th className="px-4 py-2.5 text-center font-bold text-gray-500 w-20">포함</th>
                    <th className="px-4 py-2.5 text-left font-bold text-gray-500">상세</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-2.5 font-bold">자동차보험</td>
                    <td className="px-4 py-2.5 text-center text-green-600 font-bold">O</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      종합보험 (대인 무한 / 대물 1억 / 자손 1억)
                      {data.deductible > 0 && (
                        <span className="text-gray-400"> · 자차 면책금 {f(data.deductible)}원</span>
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-2.5 font-bold">자동차세</td>
                    <td className="px-4 py-2.5 text-center text-green-600 font-bold">O</td>
                    <td className="px-4 py-2.5 text-gray-600">계약기간 내 자동차세 전액 포함</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-2.5 font-bold">정비</td>
                    <td className="px-4 py-2.5 text-center font-bold">
                      {data.maintPackage === 'self' ? (
                        <span className="text-red-400">X</span>
                      ) : (
                        <span className="text-green-600">O</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {MAINT_PACKAGE_DESC[data.maintPackage] || '-'}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-2.5 font-bold">취득세</td>
                    <td className="px-4 py-2.5 text-center text-green-600 font-bold">O</td>
                    <td className="px-4 py-2.5 text-gray-600">영업용 취득세 4% 포함 (자동차대여업 기준)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-2.5 font-bold">공채매입</td>
                    <td className="px-4 py-2.5 text-center font-bold">
                      {(data.bondCost && data.bondCost > 0)
                        ? <span className="text-green-600">O</span>
                        : <span className="text-gray-400">-</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {(() => {
                        const region = data.registrationRegion || '서울'
                        const isSubway = ['서울', '부산', '대구'].includes(region)
                        if (!isSubway) return `${region} 지역 영업용 등록 → 공채매입 면제`
                        if (data.bondCost && data.bondCost > 0) return `${region} 도시철도채권 (영업용 요율 적용, 할인매도 후 실부담 포함)`
                        return `${region} 도시철도채권 (배기량 기준 면제 대상)`
                      })()}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-bold">등록비용</td>
                    <td className="px-4 py-2.5 text-center text-green-600 font-bold">O</td>
                    <td className="px-4 py-2.5 text-gray-600">번호판(영업용 허/하/호) · 인지세 · 등록대행비 포함</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 6. 약정 조건 (초과주행, 중도해지, 보험면책 등) */}
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">약정 조건</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500 w-36">약정 주행거리</td>
                    <td className="px-4 py-2.5">
                      연간 {f(data.annualMileage * 10000)}km (계약기간 총 {f(totalMileageLimit)}km)
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">초과주행 요금</td>
                    <td className="px-4 py-2.5">
                      <span className="font-bold text-red-500">km당 {f(excessMileageRate)}원</span>
                      <span className="text-gray-400 text-xs ml-2">(약정거리 초과 시 계약 종료 시점 정산)</span>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">자차 면책금</td>
                    <td className="px-4 py-2.5">
                      사고 시 자기부담금 <span className="font-bold">{f(data.deductible)}원</span>
                      {data.deductible === 0 && <span className="text-green-500 text-xs ml-2 font-bold">완전면책</span>}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">중도해지</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      잔여 렌탈료의 30~40% 위약금 발생 (잔여 기간에 따라 차등 적용)
                    </td>
                  </tr>
                  <tr>
                    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500">반납 조건</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {data.contractType === 'buyout'
                        ? '만기 시 인수 또는 반납 선택 가능 (반납 시 차량 상태 평가 후 보증금 정산)'
                        : '만기 시 차량 반납 (차량 상태 평가 후 보증금 정산)'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 7. 인수 조건 (인수형만) */}
          {data.contractType === 'buyout' && (
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">인수 안내</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                  <div>
                    <p className="text-amber-600 text-xs font-bold mb-1">인수가격 (VAT 별도)</p>
                    <p className="font-black text-amber-700 text-xl">{f(calc.buyoutPrice)}원</p>
                  </div>
                  <div>
                    <p className="text-amber-600 text-xs font-bold mb-1">인수 시 추가 비용</p>
                    <p className="font-bold text-gray-700">취득세 + 이전등록비 별도</p>
                  </div>
                </div>
                <div className="text-xs text-amber-700 space-y-1">
                  <p>* 계약 만기 시 상기 인수가격으로 차량 소유권을 이전받으실 수 있습니다.</p>
                  <p>* 인수를 원하지 않으실 경우 차량 반납도 가능합니다.</p>
                  <p>* 인수 시 취득세 및 이전등록비는 임차인 부담입니다.</p>
                </div>
              </div>
            </div>
          )}

          {/* 8. 비고 */}
          {quoteNote && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-xs font-bold text-yellow-700 mb-1">비고</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{quoteNote}</p>
            </div>
          )}

          {/* 9. 유의사항 */}
          <div className="border-t border-gray-200 pt-5">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">유의사항 및 특약</p>
            <div className="text-xs text-gray-500 space-y-1.5">
              <p>1. 본 견적서는 발행일로부터 30일간 유효하며, 차량 재고 및 시장 상황에 따라 변동될 수 있습니다.</p>
              <p>2. 보증금은 계약 종료 시 차량 상태 확인 후 손해액을 공제한 잔액을 환불합니다.</p>
              <p>3. 약정주행거리 초과 시 계약 종료 시점에 km당 {f(excessMileageRate)}원의 추가 요금이 정산됩니다.</p>
              <p>4. 사고 발생 시 자차 면책금 {f(data.deductible)}원은 임차인 부담이며, 면책금 초과 수리비는 보험 처리됩니다.</p>
              <p>5. 중도해지 시 잔여 렌탈료 기준 위약금이 발생하며, 상세 기준은 계약서를 따릅니다.</p>
              <p>6. 렌탈 차량은 타인에게 전대, 양도할 수 없으며 임대인의 사전 동의 없이 차량 개조 불가합니다.</p>
              {data.contractType === 'buyout' && (
                <p>7. 인수 시 소유권 이전에 필요한 취득세 및 수수료는 임차인 부담입니다.</p>
              )}
            </div>
          </div>

          {/* 10. 서명란 */}
          <div className="grid grid-cols-2 gap-8 pt-6">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-10">임대인 (서명/인)</p>
              <div className="border-t border-gray-300 pt-2">
                <p className="text-sm font-bold text-gray-700">{company?.name || '당사'}</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-10">임차인 (서명/인)</p>
              <div className="border-t border-gray-300 pt-2">
                <p className="text-sm font-bold text-gray-700">{selectedCustomer?.name || '고객명'}</p>
              </div>
            </div>
          </div>

        </div>

        {/* 푸터 */}
        <div className="bg-gray-50 px-8 py-4 border-t border-gray-200 text-center">
          <p className="text-[10px] text-gray-400">
            본 견적서는 {company?.name || '당사'}에서 발행한 공식 견적서입니다. 문의: {company?.phone || '-'}
          </p>
        </div>
      </div>

      {/* 하단 액션 (인쇄 시 숨김) */}
      <div className="max-w-[800px] mx-auto mt-4 flex gap-3 print:hidden">
        <button onClick={() => setStep('setup')}
          className="flex-1 py-3 border border-gray-300 rounded-xl font-bold text-gray-500 hover:bg-white">
          &larr; 수정
        </button>
        <button onClick={handlePrint}
          className="flex-1 py-3 border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-white">
          인쇄 / PDF
        </button>
        <button onClick={() => handleSaveQuote('draft')} disabled={saving}
          className="flex-1 py-3 bg-gray-600 text-white rounded-xl font-bold hover:bg-gray-700 disabled:opacity-50">
          임시저장
        </button>
        <button onClick={() => handleSaveQuote('active')} disabled={saving}
          className="flex-[2] py-3 bg-gray-900 text-white rounded-xl font-black hover:bg-gray-800 disabled:opacity-50">
          {saving ? '저장 중...' : '견적서 확정'}
        </button>
      </div>
    </div>
  )
}

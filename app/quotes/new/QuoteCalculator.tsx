'use client'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ============================================================
// SUB-COMPONENTS (외부 정의)
// ============================================================

function CustomerSelector({ customers, selectedCustomerId, onChange }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border shadow-sm">
      <label className="block text-sm font-bold text-gray-500 mb-2">고객 선택</label>
      <select
        className="w-full p-4 border border-gray-200 rounded-xl font-bold text-lg focus:border-steel-500 outline-none"
        value={selectedCustomerId}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">고객을 선택하세요</option>
        {customers.map((cust: any) => (
          <option key={cust.id} value={cust.id}>
            {cust.name} ({cust.type}) - {cust.phone}
          </option>
        ))}
      </select>
    </div>
  )
}

function CarSelector({ cars, commonCodes, selectedCar, onCarChange, worksheetData, estimatedPrice, rules }: any) {
  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="bg-white p-6 rounded-3xl border shadow-sm">
      <label className="block text-sm font-bold text-gray-500 mb-2">대상 차량 선택</label>
      <select
        className="w-full p-4 border border-steel-100 rounded-xl font-bold text-lg bg-steel-50 focus:border-steel-500 outline-none"
        value={selectedCar?.id || ''}
        onChange={(e) => onCarChange(e.target.value)}
      >
        <option value="">차량을 선택하세요</option>
        {cars.map((car: any) => (
          <option key={car.id} value={car.id}>
            [{car.number}] {car.brand} {car.model}
          </option>
        ))}
      </select>

      {selectedCar && (
        <div className="mt-4 space-y-2">
          <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-600 flex justify-between">
            <span>매입가: <b>{f(selectedCar.purchase_price)}원</b></span>
            <span>
              연료: <b>{commonCodes.find((c: any) => c.category === 'FUEL' && c.code === selectedCar.fuel)?.value || selectedCar.fuel}</b>
            </span>
          </div>

          <div className="p-4 bg-steel-50 border border-steel-100 rounded-xl flex justify-between items-center animate-pulse">
            <div className="text-steel-800 text-sm">
              <span className="font-bold">🤖 AI 시세 분석</span>
              <span className="block text-xs text-steel-600 opacity-80">
                연식감가 {(rules.DEP_YEAR * 100)}% + 주행감가 {(rules.DEP_MILEAGE_10K * 100)}% 적용
              </span>
            </div>
            <div className="text-right">
              <span className="block text-xs text-gray-500">적정 기준가</span>
              <span className="font-black text-xl text-steel-600">{f(estimatedPrice)}원</span>
            </div>
          </div>

          {worksheetData && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
              <span className="text-green-600 text-sm font-bold">✅ 렌트가 산출 분석 데이터 연동됨</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CostBreakdown({ costs, commonCodes, onMaintenanceChange, autoInfo }: any) {
  const f = (n: number) => n?.toLocaleString() || '0'
  const p = (v: string) => Number(v.replace(/,/g, ''))

  return (
    <div className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
      <h3 className="font-bold text-gray-800 border-b pb-2">📊 월 지출 원가 (BEP)</h3>
      <div className="flex justify-between items-center">
        <span className="text-gray-500">🏦 월 할부금</span>
        <span className="font-bold text-lg">{f(costs.monthly_finance)}원</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-gray-500">🛡️ 월 보험료</span>
        <span className="font-bold text-lg">{f(costs.monthly_insurance)}원</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-gray-500">🔧 정비예비비</span>
        <input
          className="w-24 text-right border-b font-bold"
          value={f(costs.maintenance)}
          onChange={(e) => onMaintenanceChange(p(e.target.value))}
        />
      </div>
      {costs.monthly_tax > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-gray-500">🏛️ 월 자동차세</span>
          <span className="font-bold text-lg">{f(costs.monthly_tax)}원</span>
        </div>
      )}
      {autoInfo && <p className="text-xs text-steel-500 bg-steel-50 px-3 py-1.5 rounded-lg">📊 기준표 자동적용: {autoInfo}</p>}
      <div className="flex justify-between items-center pt-3 border-t border-dashed text-red-500">
        <span className="font-bold">🩸 총 원가</span>
        <span className="font-black text-2xl">{f(costs.total_cost)}원</span>
      </div>
    </div>
  )
}

function MarginSetting({ margin, onMarginChange }: any) {
  const f = (n: number) => n?.toLocaleString() || '0'
  const p = (v: string) => Number(v.replace(/,/g, ''))

  return (
    <div className="bg-steel-50/50 p-6 rounded-3xl border border-steel-200">
      <h3 className="font-bold text-steel-900 mb-4">💰 마진 설정</h3>
      <div className="flex items-center gap-4">
        <input
          type="text"
          className="w-full p-4 border border-steel-200 rounded-xl text-right font-black text-2xl text-steel-600 outline-none"
          value={f(margin)}
          onChange={(e) => onMarginChange(p(e.target.value))}
        />
        <span className="font-bold text-gray-500 whitespace-nowrap">원 남기기</span>
      </div>
      <div className="mt-4 flex gap-2">
        {[50000, 100000, 200000, 300000].map((m) => (
          <button
            key={m}
            onClick={() => onMarginChange(m)}
            className="flex-1 py-2 bg-white border border-steel-200 rounded-lg text-steel-600 font-bold hover:bg-steel-100"
          >
            +{m / 10000}만
          </button>
        ))}
      </div>
    </div>
  )
}

function QuotationPanel({ selectedCustomerId, customers, term, onTermChange, deposit, onDepositChange, costs, margin, isEditing, onSaveDraft, onSaveActive }: any) {
  const f = (n: number) => n?.toLocaleString() || '0'
  const p = (v: string) => Number(v.replace(/,/g, ''))

  const final_rent_fee = costs.total_cost + margin
  const vat = Math.round(final_rent_fee * 0.1)
  const billing_amount = final_rent_fee + vat

  const selectedCustomer = customers.find((c: any) => c.id === selectedCustomerId)
  const customerName = selectedCustomer?.name || '미선택'

  return (
    <div className="bg-steel-950 text-white p-8 rounded-3xl shadow-2xl sticky top-10">
      <div className="text-center border-b border-gray-700 pb-6 mb-6">
        <p className="text-gray-400 text-sm font-bold uppercase tracking-widest">
          {isEditing ? 'Quote Edit' : 'Quotation'}
        </p>
        <h2 className="text-3xl font-black mt-2">{isEditing ? '견적 편집' : '최종 견적서'}</h2>
      </div>
      <div className="space-y-6">
        <div className="flex justify-between">
          <span className="text-gray-400">고객명</span>
          <span className="font-bold text-yellow-400 text-lg">{customerName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">계약 기간</span>
          <select
            className="bg-gray-800 text-white font-bold rounded p-1"
            value={term}
            onChange={(e) => onTermChange(Number(e.target.value))}
          >
            <option value={12}>12개월</option>
            <option value={24}>24개월</option>
            <option value={36}>36개월</option>
          </select>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">보증금</span>
          <input
            className="bg-transparent text-right font-bold text-white w-32 border-b border-gray-700"
            value={f(deposit)}
            onChange={(e) => onDepositChange(p(e.target.value))}
          />
        </div>
        <div className="border-t border-gray-700 my-4"></div>
        <div className="flex justify-between items-end">
          <span className="text-gray-300 font-bold">공급가액 (월)</span>
          <span className="text-2xl font-bold">{f(final_rent_fee)}원</span>
        </div>
        <div className="flex justify-between items-end text-gray-400 text-sm">
          <span>부가세 (10%)</span>
          <span>{f(vat)}원</span>
        </div>
        <div className="border-t border-gray-500 my-6"></div>
        <div className="text-right">
          <p className="text-sm text-yellow-400 font-bold mb-1">청구 금액 (VAT포함)</p>
          <p className="text-5xl font-black tracking-tight">
            {f(billing_amount)}<span className="text-2xl ml-1">원</span>
          </p>
        </div>
      </div>

      <div className="space-y-3 mt-8">
        <button
          onClick={onSaveDraft}
          className="w-full bg-gray-600 hover:bg-gray-700 text-white font-black py-4 rounded-2xl transition-colors text-lg"
        >
          임시저장
        </button>
        <button
          onClick={onSaveActive}
          className="w-full bg-white text-black font-black py-5 rounded-2xl hover:bg-gray-200 transition-colors text-lg"
        >
          {isEditing ? '견적 편집 완료' : '견적 확정'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function QuoteCalculator() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // 공통 상태
  const [loading, setLoading] = useState(false)
  const [commonCodes, setCommonCodes] = useState<any[]>([])
  const [cars, setCars] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])

  // 편집 모드
  const [isEditing, setIsEditing] = useState(false)
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)

  // 선택된 데이터
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedCar, setSelectedCar] = useState<any>(null)
  const [finance, setFinance] = useState<any>(null)
  const [insurance, setInsurance] = useState<any>(null)

  // 견적 조건
  const [term, setTerm] = useState(12)
  const [deposit, setDeposit] = useState(1000000)
  const [margin, setMargin] = useState(100000)

  // 비용 항목
  const [costs, setCosts] = useState({
    monthly_finance: 0,
    monthly_insurance: 0,
    maintenance: 50000,
    monthly_tax: 0,
    total_cost: 0,
  })

  // AI 시세 분석
  const [rules, setRules] = useState<any>({})
  const [estimatedPrice, setEstimatedPrice] = useState(0)

  // 기준표 데이터
  const [insuranceRates, setInsuranceRates] = useState<any[]>([])
  const [maintenanceCosts, setMaintenanceCosts] = useState<any[]>([])
  const [taxRates, setTaxRates] = useState<any[]>([])
  const [autoInfo, setAutoInfo] = useState('')

  // 가격 워크시트
  const [worksheetData, setWorksheetData] = useState<any>(null)

  // ============================================================
  // LOAD INITIAL DATA
  // ============================================================

  useEffect(() => {
    const fetchData = async () => {
      const { data: codeData } = await supabase.from('common_codes').select('*')
      setCommonCodes(codeData || [])

      const { data: ruleData } = await supabase.from('business_rules').select('*')
      if (ruleData) {
        const ruleMap = ruleData.reduce((acc: any, cur) => ({ ...acc, [cur.key]: cur.value }), {})
        setRules(ruleMap)
      }

      const { data: carData } = await supabase.from('cars').select('*').eq('status', 'available')
      setCars(carData || [])

      const { data: custData } = await supabase.from('customers').select('*').order('name')
      setCustomers(custData || [])

      const [insRes, maintRes, taxRes] = await Promise.all([
        supabase.from('insurance_rate_table').select('*'),
        supabase.from('maintenance_cost_table').select('*'),
        supabase.from('vehicle_tax_table').select('*'),
      ])
      setInsuranceRates(insRes.data || [])
      setMaintenanceCosts(maintRes.data || [])
      setTaxRates(taxRes.data || [])
    }
    fetchData()
  }, [])

  // ============================================================
  // LOAD QUOTE IF EDITING
  // ============================================================

  useEffect(() => {
    const loadQuote = async () => {
      const quoteId = searchParams.get('quote_id')
      if (!quoteId) return

      const { data: quoteData, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .single()

      if (error || !quoteData) {
        console.error('Failed to load quote:', error)
        return
      }

      // 편집 모드 활성화
      setIsEditing(true)
      setEditingQuoteId(quoteId)

      // 필드 채우기
      setSelectedCustomerId(quoteData.customer_id || '')
      setTerm(quoteData.term || 12)
      setDeposit(quoteData.deposit || 0)
      setMargin(quoteData.margin || 0)

      // 차량 선택
      if (quoteData.car_id) {
        await handleCarSelect(quoteData.car_id)
      }
    }

    loadQuote()
  }, [searchParams])

  // ============================================================
  // URL PARAMS PROCESSING
  // ============================================================

  useEffect(() => {
    const processUrlParams = async () => {
      const carId = searchParams.get('car_id')
      const depositParam = searchParams.get('deposit')
      const termParam = searchParams.get('term')

      if (carId && cars.length > 0) {
        await handleCarSelect(carId)

        const { data: worksheetData } = await supabase
          .from('pricing_worksheets')
          .select('*')
          .eq('car_id', carId)
          .single()
        if (worksheetData) {
          setWorksheetData(worksheetData)
        }
      }

      if (depositParam) {
        setDeposit(Number(depositParam))
      }

      if (termParam) {
        setTerm(Number(termParam))
      }
    }

    if (cars.length > 0) {
      processUrlParams()
    }
  }, [searchParams, cars.length])

  // rent_fee URL param → 마진 계산
  useEffect(() => {
    const rentFee = searchParams.get('rent_fee')
    if (rentFee && costs.total_cost > 0) {
      const calculatedMargin = Number(rentFee) - costs.total_cost
      if (calculatedMargin > 0) setMargin(calculatedMargin)
    }
  }, [costs.total_cost, searchParams])

  // ============================================================
  // CAR SELECTION
  // ============================================================

  const handleCarSelect = useCallback(async (carId: string) => {
    if (!carId) return
    setLoading(true)

    const { data: carData } = await supabase.from('cars').select('*').eq('id', carId).single()
    setSelectedCar(carData)

    const { data: finData } = await supabase
      .from('financial_products')
      .select('*')
      .eq('car_id', carId)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    setFinance(finData)

    const { data: insData } = await supabase
      .from('insurance_contracts')
      .select('*')
      .eq('car_id', carId)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    setInsurance(insData)

    if (carData) {
      const IMPORT_B = ['벤츠', 'BMW', '아우디', '테슬라', '볼보', '포르쉐', '렉서스', '재규어', '폭스바겐', '미니', '링컨']
      const isImport = IMPORT_B.some((b) => (carData.brand || '').includes(b))
      const isEV = (carData.fuel_type || '').includes('전기')
      const isHEV = (carData.fuel_type || '').includes('하이브리드')

      // 보험
      if (!insData) {
        const insType = isEV ? '전기차' : isImport ? '수입 승용' : '국산 승용'
        const insRecord = insuranceRates.find(
          (r: any) =>
            r.vehicle_type === insType &&
            carData.purchase_price >= r.value_min &&
            carData.purchase_price <= r.value_max
        )
        if (insRecord) {
          const m_ins = Math.round(insRecord.annual_premium / 12)
          setCosts((prev) => ({ ...prev, monthly_insurance: m_ins }))
        }
      }

      // 정비비
      const carAge = new Date().getFullYear() - (carData.year || new Date().getFullYear())
      let maintType = '국산 중형'
      let fuelCat = '내연기관'
      if (isEV) {
        maintType = '전기차'
        fuelCat = '전기'
      } else if (isHEV) {
        maintType = '하이브리드'
        fuelCat = '하이브리드'
      } else if (isImport) {
        maintType = '수입차'
        fuelCat = '내연기관'
      } else if (carData.purchase_price < 25000000) {
        maintType = '국산 경차/소형'
      } else if (carData.purchase_price >= 40000000) {
        maintType = '국산 대형/SUV'
      }

      const maintRecord = maintenanceCosts.find(
        (r: any) =>
          r.vehicle_type === maintType &&
          r.fuel_type === fuelCat &&
          carAge >= r.age_min &&
          carAge <= r.age_max
      )
      if (maintRecord) {
        setCosts((prev) => ({ ...prev, maintenance: maintRecord.monthly_cost }))
      }

      // 자동차세
      const cc = carData.engine_cc || 0
      const fuelCategory = isEV ? '전기' : '내연기관'
      const taxRecord = taxRates.find(
        (r: any) =>
          r.tax_type === '영업용' &&
          r.fuel_category === fuelCategory &&
          cc >= r.cc_min &&
          cc <= r.cc_max
      )
      if (taxRecord) {
        let tax = taxRecord.fixed_annual > 0 ? taxRecord.fixed_annual : Math.round(cc * taxRecord.rate_per_cc)
        tax = Math.round(tax * (1 + taxRecord.education_tax_rate / 100))
        setCosts((prev) => ({ ...prev, monthly_tax: Math.round(tax / 12) }))
      }

      setAutoInfo(`${maintType} · 차령 ${carAge}년`)
    }

    setLoading(false)
  }, [insuranceRates, maintenanceCosts, taxRates])

  // ============================================================
  // AI PRICE ESTIMATION
  // ============================================================

  useEffect(() => {
    if (selectedCar && rules.DEP_YEAR) {
      const thisYear = new Date().getFullYear()
      const carAge = thisYear - selectedCar.year
      const mileageUnit = selectedCar.mileage / 10000

      const ageDep = carAge * rules.DEP_YEAR
      const mileDep = mileageUnit * (rules.DEP_MILEAGE_10K || 0.02)
      const totalDepRate = ageDep + mileDep

      const estimated = Math.round(selectedCar.purchase_price * Math.max(0.1, 1 - totalDepRate))
      setEstimatedPrice(estimated)
    }
  }, [selectedCar, rules])

  // ============================================================
  // COST CALCULATION
  // ============================================================

  useEffect(() => {
    const m_fin = finance?.monthly_payment || 0
    const m_ins = insurance?.total_premium ? Math.round(insurance.total_premium / 12) : costs.monthly_insurance
    const m_maint = costs.maintenance
    const m_tax = costs.monthly_tax || 0
    const total = m_fin + m_ins + m_maint + m_tax

    setCosts((prev) => ({
      ...prev,
      monthly_finance: m_fin,
      monthly_insurance: m_ins,
      total_cost: total,
    }))
  }, [selectedCar, finance, insurance, costs.maintenance, costs.monthly_tax])

  // ============================================================
  // SAVE QUOTE
  // ============================================================

  const handleSaveQuote = async (status: 'draft' | 'active') => {
    if (role === 'god_admin' && !adminSelectedCompanyId) {
      return alert('⚠️ 회사를 먼저 선택해주세요.')
    }
    if (!selectedCar) return alert('차량을 선택해주세요.')
    if (!selectedCustomerId) return alert('고객을 선택해주세요.')

    const now = new Date()
    const expiresAt = new Date(now.setDate(now.getDate() + 30)).toISOString().split('T')[0]

    const quoteData = {
      car_id: selectedCar.id,
      customer_id: selectedCustomerId,
      rental_type: '월렌트',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(new Date().setMonth(new Date().getMonth() + term)).toISOString().split('T')[0],
      term: term,
      deposit: deposit,
      rent_fee: costs.total_cost + margin,
      margin: margin,
      status: status,
      expires_at: expiresAt,
      company_id: effectiveCompanyId,
    }

    if (isEditing && editingQuoteId) {
      // UPDATE
      const { error } = await supabase.from('quotes').update(quoteData).eq('id', editingQuoteId)

      if (error) {
        alert('저장 실패: ' + error.message)
      } else {
        alert(`✅ 견적서가 ${status === 'draft' ? '임시저장' : '확정'}되었습니다!`)
        router.push('/quotes')
      }
    } else {
      // INSERT
      const { error } = await supabase.from('quotes').insert([quoteData])

      if (error) {
        alert('저장 실패: ' + error.message)
      } else {
        alert(`✅ 견적서가 ${status === 'draft' ? '임시저장' : '생성'}되었습니다!`)
        router.push('/quotes')
      }
    }
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-12 md:px-6 bg-gray-50/50 min-h-screen">
      <h1 className="text-3xl font-black text-gray-900 mb-8">
        {isEditing ? '✏️ 견적 편집' : '🧮 스마트 렌탈료 계산기'}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* --- 왼쪽: 설정 영역 --- */}
        <div className="lg:col-span-7 space-y-6">
          <CustomerSelector
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            onChange={setSelectedCustomerId}
          />

          <CarSelector
            cars={cars}
            commonCodes={commonCodes}
            selectedCar={selectedCar}
            onCarChange={handleCarSelect}
            worksheetData={worksheetData}
            estimatedPrice={estimatedPrice}
            rules={rules}
          />

          <CostBreakdown
            costs={costs}
            commonCodes={commonCodes}
            onMaintenanceChange={(value) => setCosts({ ...costs, maintenance: value })}
            autoInfo={autoInfo}
          />

          <MarginSetting margin={margin} onMarginChange={setMargin} />
        </div>

        {/* --- 오른쪽: 견적 패널 --- */}
        <div className="lg:col-span-5">
          <QuotationPanel
            selectedCustomerId={selectedCustomerId}
            customers={customers}
            term={term}
            onTermChange={setTerm}
            deposit={deposit}
            onDepositChange={setDeposit}
            costs={costs}
            margin={margin}
            isEditing={isEditing}
            onSaveDraft={() => handleSaveQuote('draft')}
            onSaveActive={() => handleSaveQuote('active')}
          />
        </div>
      </div>
    </div>
  )
}

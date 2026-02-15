'use client'

import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ============================================
// 타입 정의
// ============================================
interface CarData {
  id: string
  number: string
  brand: string
  model: string
  trim?: string
  year?: number
  fuel?: string
  mileage?: number
  purchase_price: number
  factory_price?: number
  engine_cc?: number
  image_url?: string
  status: string
}

interface MarketComp {
  id?: string
  competitor_name: string
  vehicle_info: string
  monthly_rent: number
  deposit: number
  term_months: number
  source: string
}

interface NewCarOption {
  name: string
  price: number
  description?: string
}

interface NewCarColor {
  name: string
  code?: string
  price: number
}

interface NewCarTrim {
  name: string
  base_price: number
  note?: string
  exterior_colors?: NewCarColor[]
  interior_colors?: NewCarColor[]
  options: NewCarOption[]
}

interface NewCarVariant {
  variant_name: string
  fuel_type: string
  engine_cc: number
  consumption_tax?: string    // 개별소비세 구분 (예: "개별소비세 5%", "개별소비세 3.5%")
  trims: NewCarTrim[]
}

interface NewCarResult {
  brand: string
  model: string
  year: number
  variants: NewCarVariant[]
  available: boolean
  message?: string
  source?: string
}

interface BusinessRules {
  [key: string]: number
}

// ============================================
// 🏭 브랜드 프리셋 (국내 / 수입)
// ============================================
const DOMESTIC_BRANDS = ['기아', '현대', '제네시스', '쉐보레', '르노코리아', 'KG모빌리티']
const IMPORT_BRAND_PRESETS = ['BMW', '벤츠', '아우디', '폭스바겐', '볼보', '테슬라', '토요타', '렉서스', '포르쉐', '미니', '랜드로버', '푸조', '혼다']

// ============================================
// 🆕 기준 테이블 차종 매핑 유틸
// ============================================
const IMPORT_BRANDS = ['벤츠', 'BMW', 'BENZ', 'Mercedes', '아우디', 'Audi', '폭스바겐', 'VW', '렉서스', 'Lexus',
  '포르쉐', 'Porsche', '볼보', 'Volvo', '재규어', 'Jaguar', '랜드로버', '링컨', 'Lincoln', '캐딜락',
  '인피니티', '미니', 'MINI', '마세라티', '페라리', '람보르기니', '벤틀리', '롤스로이스', '맥라렌',
  '테슬라', 'Tesla', '리비안', 'Rivian', '폴스타', 'Polestar']

const PREMIUM_MODELS = ['S-Class', 'S클래스', '7시리즈', 'A8', 'LS', 'G80', 'G90', 'GV80', 'GV70',
  '카이엔', '파나메라', 'Cayenne', 'Panamera', 'X7', 'GLS', 'Q8', 'Range Rover']

const EV_KEYWORDS = ['전기', 'EV', 'Electric', 'ev6', 'ev9', '아이오닉', 'ioniq', 'Model', '모델', 'EQE', 'EQS', 'iX', 'i4', 'e-tron']
const HEV_KEYWORDS = ['하이브리드', 'HEV', 'PHEV', 'Hybrid']

// 차량 데이터 → 잔가율 카테고리 자동 매핑
function mapToDepCategory(brand: string, model: string, fuelType?: string, purchasePrice?: number): string {
  const b = (brand || '').toUpperCase()
  const m = (model || '').toUpperCase()
  const f = (fuelType || '').toUpperCase()
  const isImport = IMPORT_BRANDS.some(ib => b.includes(ib.toUpperCase()))
  const isEV = EV_KEYWORDS.some(k => m.includes(k.toUpperCase()) || f.includes(k.toUpperCase()))
  const isHEV = HEV_KEYWORDS.some(k => m.includes(k.toUpperCase()) || f.includes(k.toUpperCase()))
  const isPremium = PREMIUM_MODELS.some(pm => m.includes(pm.toUpperCase()))

  if (isEV && isImport) return '전기차 수입'
  if (isEV) return '전기차 국산'
  if (isHEV) return '하이브리드'
  if (isImport && isPremium) return '수입 프리미엄'
  if (isImport) {
    const price = purchasePrice || 0
    if (price >= 80000000) return '수입 대형 세단'
    if (m.includes('SUV') || m.includes('GLC') || m.includes('X3') || m.includes('X5') || m.includes('Q5') || m.includes('Q7'))
      return '수입 중형 SUV'
    return '수입 중형 세단'
  }
  // 국산차
  if (m.includes('팰리세이드') || m.includes('쏘렌토') || m.includes('모하비') || m.includes('EV9'))
    return '국산 대형 SUV'
  if (m.includes('투싼') || m.includes('스포티지') || m.includes('싼타페') || m.includes('SANTA'))
    return '국산 중형 SUV'
  if (m.includes('셀토스') || m.includes('코나') || m.includes('XM3') || m.includes('트랙스'))
    return '국산 소형 SUV'
  if (m.includes('카니발') || m.includes('스타리아') || m.includes('CARNIVAL') || m.includes('STARIA'))
    return '국산 MPV/미니밴'
  if (m.includes('모닝') || m.includes('레이') || m.includes('캐스퍼') || m.includes('MORNING') || m.includes('RAY'))
    return '국산 경차'
  if (m.includes('그랜저') || m.includes('K8') || m.includes('GRANDEUR'))
    return '국산 중형 세단'
  if (m.includes('제네시스') || m.includes('GENESIS'))
    return '국산 대형 세단'
  if (m.includes('쏘나타') || m.includes('K5') || m.includes('SONATA'))
    return '국산 준중형 세단'
  if (m.includes('아반떼') || m.includes('K3') || m.includes('AVANTE'))
    return '국산 소형 세단'
  // 폴백: 가격 기준
  const price = purchasePrice || 0
  if (price < 20000000) return '국산 경차'
  if (price < 35000000) return '국산 준중형 세단'
  if (price < 50000000) return '국산 중형 세단'
  return '국산 대형 SUV'
}

// 보험 유형 매핑
function mapToInsuranceType(brand: string, fuelType?: string): string {
  const isImport = IMPORT_BRANDS.some(ib => (brand || '').toUpperCase().includes(ib.toUpperCase()))
  const isEV = EV_KEYWORDS.some(k => (fuelType || '').toUpperCase().includes(k.toUpperCase()))
  if (isEV) return '전기차'
  if (isImport) return '수입 승용'
  return '국산 승용'
}

// 정비 유형 매핑
function mapToMaintenanceType(brand: string, model: string, fuelType?: string, purchasePrice?: number): { type: string, fuel: string } {
  const isImport = IMPORT_BRANDS.some(ib => (brand || '').toUpperCase().includes(ib.toUpperCase()))
  const isEV = EV_KEYWORDS.some(k => ((fuelType || '') + (model || '')).toUpperCase().includes(k.toUpperCase()))
  const isHEV = HEV_KEYWORDS.some(k => ((fuelType || '') + (model || '')).toUpperCase().includes(k.toUpperCase()))

  if (isEV) return { type: '전기차', fuel: '전기' }
  if (isHEV) return { type: '하이브리드', fuel: '하이브리드' }
  if (isImport) return { type: '수입차', fuel: '내연기관' }

  const price = purchasePrice || 0
  if (price >= 40000000) return { type: '국산 대형/SUV', fuel: '내연기관' }
  if (price >= 25000000) return { type: '국산 중형', fuel: '내연기관' }
  return { type: '국산 경차/소형', fuel: '내연기관' }
}

// ============================================
// 숫자 포맷 유틸
// ============================================
const f = (n: number) => Math.round(n).toLocaleString()
const parseNum = (v: string) => Number(v.replace(/,/g, '')) || 0

// ============================================
// 서브 컴포넌트 (렌더 밖에 정의 — 커서 이탈 방지)
// ============================================

// 원가 비중 바
const CostBar = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => {
  const pct = total > 0 ? Math.abs(value) / total * 100 : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-gray-500 text-xs">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="w-24 text-right font-bold text-xs">{f(value)}원</span>
      <span className="w-10 text-right text-gray-400 text-xs">{pct.toFixed(0)}%</span>
    </div>
  )
}

// 섹션 카드 래퍼
const Section = ({ icon, title, children, className = '' }: {
  icon: string; title: string; children: React.ReactNode; className?: string
}) => (
  <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
      <h3 className="font-bold text-gray-800 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
)

// 입력 행
const InputRow = ({ label, value, onChange, suffix = '원', type = 'money', sub = '' }: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; type?: string; sub?: string
}) => (
  <div className="flex items-center justify-between py-2">
    <div>
      <span className="text-gray-600 text-sm">{label}</span>
      {sub && <span className="block text-xs text-gray-400">{sub}</span>}
    </div>
    <div className="flex items-center gap-1">
      <input
        type="text"
        className="w-32 text-right border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
        value={type === 'percent' ? value : f(value)}
        onChange={(e) => {
          const v = type === 'percent' ? parseFloat(e.target.value) || 0 : parseNum(e.target.value)
          onChange(v)
        }}
      />
      <span className="text-xs text-gray-400 w-8">{suffix}</span>
    </div>
  </div>
)

// 결과 행
const ResultRow = ({ label, value, highlight = false, negative = false }: {
  label: string; value: number; highlight?: boolean; negative?: boolean
}) => (
  <div className={`flex justify-between items-center py-2 ${highlight ? 'text-lg' : 'text-sm'}`}>
    <span className={highlight ? 'font-bold text-gray-800' : 'text-gray-500'}>{label}</span>
    <span className={`font-bold ${highlight ? 'text-xl' : ''} ${negative ? 'text-green-600' : highlight ? 'text-steel-600' : 'text-gray-800'}`}>
      {negative ? '-' : ''}{f(Math.abs(value))}원
    </span>
  </div>
)

// ============================================
// 메인 컴포넌트
// ============================================
export default function RentPricingBuilder() {
  const router = useRouter()
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // --- 데이터 로딩 ---
  const [cars, setCars] = useState<CarData[]>([])
  const [selectedCar, setSelectedCar] = useState<CarData | null>(null)
  const [rules, setRules] = useState<BusinessRules>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // --- 가격 분석 입력값 ---
  const [factoryPrice, setFactoryPrice] = useState(0)      // 출고가
  const [purchasePrice, setPurchasePrice] = useState(0)     // 매입가

  // 감가 설정
  const [depYear1Rate, setDepYear1Rate] = useState(15)      // 1년차 감가 %
  const [depYear2Rate, setDepYear2Rate] = useState(8)        // 2년차~ 감가 %
  const [depMileageRate, setDepMileageRate] = useState(2)     // 만km당 감가 %
  const [annualMileage, setAnnualMileage] = useState(1.5)    // 연간 주행거리 (만km)

  // 금융비용
  const [loanAmount, setLoanAmount] = useState(0)            // 대출 원금
  const [loanRate, setLoanRate] = useState(4.5)              // 대출 이자율 %
  const [investmentRate, setInvestmentRate] = useState(6.0)  // 투자수익률 %

  // 운영비용
  const [monthlyMaintenance, setMonthlyMaintenance] = useState(50000)
  const [monthlyInsuranceCost, setMonthlyInsuranceCost] = useState(0)
  const [annualTax, setAnnualTax] = useState(0)              // 연간 자동차세
  const [engineCC, setEngineCC] = useState(0)                // 배기량

  // 리스크
  const [deductible, setDeductible] = useState(500000)       // 면책금
  const [riskRate, setRiskRate] = useState(0.5)              // 리스크 적립률 %

  // 보증금/선납금
  const [deposit, setDeposit] = useState(3000000)
  const [prepayment, setPrepayment] = useState(0)
  const [depositDiscountRate, setDepositDiscountRate] = useState(0.4) // %
  const [prepaymentDiscountRate, setPrepaymentDiscountRate] = useState(0.5)

  // 계약 조건
  const [termMonths, setTermMonths] = useState(36)
  const [margin, setMargin] = useState(150000)

  // 시장 비교
  const [marketComps, setMarketComps] = useState<MarketComp[]>([])
  const [newComp, setNewComp] = useState<MarketComp>({
    competitor_name: '', vehicle_info: '', monthly_rent: 0,
    deposit: 0, term_months: 36, source: ''
  })

  // 보험 & 금융상품 연동
  const [linkedInsurance, setLinkedInsurance] = useState<any>(null)
  const [linkedFinance, setLinkedFinance] = useState<any>(null)

  // 🆕 기준 테이블 데이터
  const [depreciationDB, setDepreciationDB] = useState<any[]>([])
  const [insuranceRates, setInsuranceRates] = useState<any[]>([])
  const [maintenanceCosts, setMaintenanceCosts] = useState<any[]>([])
  const [taxRates, setTaxRates] = useState<any[]>([])
  const [financeRates, setFinanceRates] = useState<any[]>([])
  const [regCosts, setRegCosts] = useState<any[]>([])

  // 🆕 취득원가 관련
  const [acquisitionTax, setAcquisitionTax] = useState(0)
  const [bondCost, setBondCost] = useState(0)
  const [deliveryFee, setDeliveryFee] = useState(350000)
  const [miscFee, setMiscFee] = useState(167000)
  const [totalAcquisitionCost, setTotalAcquisitionCost] = useState(0)

  // 🆕 자동 매핑 결과 표시
  const [autoCategory, setAutoCategory] = useState('')
  const [autoInsType, setAutoInsType] = useState('')
  const [autoMaintType, setAutoMaintType] = useState('')

  // 🆕 신차 조회 모드
  const [lookupMode, setLookupMode] = useState<'registered' | 'newcar' | 'saved'>('registered')
  const [newCarBrand, setNewCarBrand] = useState('')
  const [newCarModel, setNewCarModel] = useState('')
  const [newCarResult, setNewCarResult] = useState<NewCarResult | null>(null)
  const [newCarSelectedTax, setNewCarSelectedTax] = useState<string>('')       // 개별소비세 구분
  const [newCarSelectedFuel, setNewCarSelectedFuel] = useState<string>('')
  const [newCarSelectedVariant, setNewCarSelectedVariant] = useState<NewCarVariant | null>(null)
  const [newCarSelectedTrim, setNewCarSelectedTrim] = useState<NewCarTrim | null>(null)
  const [newCarSelectedOptions, setNewCarSelectedOptions] = useState<NewCarOption[]>([])
  const [newCarSelectedExterior, setNewCarSelectedExterior] = useState<NewCarColor | null>(null)
  const [newCarSelectedInterior, setNewCarSelectedInterior] = useState<NewCarColor | null>(null)
  const [newCarPurchasePrice, setNewCarPurchasePrice] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState('')
  // brandModels, isLoadingModels 제거됨 — 모델명은 직접 타이핑
  const [isParsingQuote, setIsParsingQuote] = useState(false)
  const [savedCarPrices, setSavedCarPrices] = useState<any[]>([])
  const [isSavingPrice, setIsSavingPrice] = useState(false)
  const [carSearchQuery, setCarSearchQuery] = useState('')

  // 저장된 워크시트 목록
  const [worksheets, setWorksheets] = useState<any[]>([])

  // --- 데이터 로드 ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      try {
        // 비즈니스 규칙
        const { data: rulesData } = await supabase.from('business_rules').select('*')
        if (rulesData) {
          const ruleMap: BusinessRules = {}
          rulesData.forEach((r: any) => { ruleMap[r.key] = Number(r.value) })
          setRules(ruleMap)

          // 기본값 설정 (DB값이 % 단위인지 소수인지 자동 판별)
          const toPercent = (v: number) => v > 0 && v < 1 ? v * 100 : v
          if (ruleMap.DEP_YEAR_1) setDepYear1Rate(toPercent(ruleMap.DEP_YEAR_1))
          else if (ruleMap.DEP_YEAR) setDepYear1Rate(toPercent(ruleMap.DEP_YEAR))
          if (ruleMap.DEP_YEAR_2PLUS) setDepYear2Rate(toPercent(ruleMap.DEP_YEAR_2PLUS))
          if (ruleMap.DEP_MILEAGE_10K) setDepMileageRate(toPercent(ruleMap.DEP_MILEAGE_10K))
          if (ruleMap.LOAN_INTEREST_RATE) setLoanRate(ruleMap.LOAN_INTEREST_RATE)
          if (ruleMap.INVESTMENT_RETURN_RATE) setInvestmentRate(ruleMap.INVESTMENT_RETURN_RATE)
          if (ruleMap.MONTHLY_MAINTENANCE_BASE) setMonthlyMaintenance(ruleMap.MONTHLY_MAINTENANCE_BASE)
          if (ruleMap.DEDUCTIBLE_AMOUNT) setDeductible(ruleMap.DEDUCTIBLE_AMOUNT)
          if (ruleMap.RISK_RESERVE_RATE) setRiskRate(ruleMap.RISK_RESERVE_RATE)
          if (ruleMap.DEPOSIT_DISCOUNT_RATE) setDepositDiscountRate(ruleMap.DEPOSIT_DISCOUNT_RATE)
          if (ruleMap.PREPAYMENT_DISCOUNT_RATE) setPrepaymentDiscountRate(ruleMap.PREPAYMENT_DISCOUNT_RATE)
        }

        // 차량 목록 — 등록 페이지와 동일한 company_id 필터링
        let carsQuery = supabase
          .from('cars')
          .select('*')
          .in('status', ['available', 'rented'])
        if (role === 'god_admin') {
          if (adminSelectedCompanyId) carsQuery = carsQuery.eq('company_id', adminSelectedCompanyId)
        } else if (company) {
          carsQuery = carsQuery.eq('company_id', company.id)
        }
        const { data: carsData } = await carsQuery.order('created_at', { ascending: false })
        setCars(carsData || [])

        // 기준 테이블 일괄 로드 (개별 에러 허용)
        try {
          const [depRes, insRes, maintRes, taxRes, finRes, regRes] = await Promise.all([
            supabase.from('depreciation_db').select('*').order('category'),
            supabase.from('insurance_rate_table').select('*'),
            supabase.from('maintenance_cost_table').select('*'),
            supabase.from('vehicle_tax_table').select('*'),
            supabase.from('finance_rate_table').select('*'),
            supabase.from('registration_cost_table').select('*'),
          ])
          setDepreciationDB(depRes.data || [])
          setInsuranceRates(insRes.data || [])
          setMaintenanceCosts(maintRes.data || [])
          setTaxRates(taxRes.data || [])
          setFinanceRates(finRes.data || [])
          setRegCosts(regRes.data || [])
        } catch (refErr) {
          console.warn('기준 테이블 로드 실패 (무시):', refErr)
        }
      } catch (err) {
        console.error('데이터 로드 실패:', err)
      }

      setLoading(false)
    }
    if (!loading || true) fetchData()
  }, [role, company, adminSelectedCompanyId])

  // ============================================
  // 🆕 공통 기준 테이블 매핑 함수
  // ============================================
  const applyReferenceTableMappings = useCallback((carInfo: {
    brand: string, model: string, fuel_type?: string,
    purchase_price: number, engine_cc?: number, year?: number,
    factory_price?: number
  }, opts?: { skipInsurance?: boolean, skipFinance?: boolean }) => {
    // 차종 카테고리 자동 매핑
    const category = mapToDepCategory(carInfo.brand, carInfo.model, carInfo.fuel_type, carInfo.purchase_price)
    setAutoCategory(category)

    // 잔존가치율 자동 적용 (depreciation_db)
    const depRecord = depreciationDB.find(d => d.category === category)
    if (depRecord) {
      const thisYear = new Date().getFullYear()
      const carAge = thisYear - (carInfo.year || thisYear)
      setDepYear1Rate(100 - depRecord.rate_1yr)
      if (depRecord.rate_1yr > depRecord.rate_3yr) {
        setDepYear2Rate(Math.round((depRecord.rate_1yr - depRecord.rate_3yr) / 2))
      }
    }

    // 보험료 자동 조회 (insurance_rate_table)
    const insType = mapToInsuranceType(carInfo.brand, carInfo.fuel_type)
    setAutoInsType(insType)
    if (!opts?.skipInsurance) {
      const insRecord = insuranceRates.find(r =>
        r.vehicle_type === insType &&
        carInfo.purchase_price >= r.value_min &&
        carInfo.purchase_price <= r.value_max
      )
      if (insRecord) {
        setMonthlyInsuranceCost(Math.round(insRecord.annual_premium / 12))
      }
    }

    // 정비비 자동 조회 (maintenance_cost_table)
    const maintMapping = mapToMaintenanceType(carInfo.brand, carInfo.model, carInfo.fuel_type, carInfo.purchase_price)
    setAutoMaintType(maintMapping.type)
    const carAge = new Date().getFullYear() - (carInfo.year || new Date().getFullYear())
    const maintRecord = maintenanceCosts.find(r =>
      r.vehicle_type === maintMapping.type &&
      r.fuel_type === maintMapping.fuel &&
      carAge >= r.age_min && carAge <= r.age_max
    )
    if (maintRecord) {
      setMonthlyMaintenance(maintRecord.monthly_cost)
    }

    // 자동차세 계산 (vehicle_tax_table — 영업용!)
    const cc = carInfo.engine_cc || 0
    const fuelCat = (carInfo.fuel_type || '').includes('전기') ? '전기' : '내연기관'
    const taxRecord = taxRates.find(r =>
      r.tax_type === '영업용' &&
      r.fuel_category === fuelCat &&
      cc >= r.cc_min && cc <= r.cc_max
    )
    let tax = 0
    if (taxRecord) {
      if (taxRecord.fixed_annual > 0) tax = taxRecord.fixed_annual
      else tax = Math.round(cc * taxRecord.rate_per_cc)
      tax = Math.round(tax * (1 + taxRecord.education_tax_rate / 100))
    } else {
      if (cc <= 1000) tax = cc * 80
      else if (cc <= 1600) tax = cc * 140
      else tax = cc * 200
      tax = Math.round(tax * 1.3)
    }
    setAnnualTax(tax)
    setEngineCC(cc)

    // 금리 자동 조회 (finance_rate_table)
    if (!opts?.skipFinance) {
      const rateRecord = financeRates.find(r =>
        r.finance_type === '캐피탈대출' &&
        termMonths >= r.term_months_min && termMonths <= r.term_months_max
      )
      if (rateRecord) setLoanRate(Number(rateRecord.annual_rate))
    }

    // 취득원가 계산 (registration_cost_table)
    const acqTaxRecord = regCosts.find(r => r.cost_type === '취득세' && (r.vehicle_category === (fuelCat === '전기' ? '전기차' : '승용')))
    const bondRecord = regCosts.find(r => r.cost_type === '공채매입' && r.region === '서울')
    const bondDiscountRecord = regCosts.find(r => r.cost_type === '공채할인')
    const deliveryRecord = regCosts.find(r => r.cost_type === '탁송료')

    const acqTaxAmt = acqTaxRecord ? Math.round(carInfo.purchase_price * acqTaxRecord.rate / 100) : Math.round(carInfo.purchase_price * 0.07)
    setAcquisitionTax(acqTaxAmt)

    const bondGross = bondRecord ? Math.round(carInfo.purchase_price * bondRecord.rate / 100) : 0
    const bondDiscount = bondDiscountRecord ? bondGross * bondDiscountRecord.rate / 100 : 0
    const bondNet = Math.round(bondGross - bondDiscount)
    setBondCost(bondNet)

    const dlvFee = deliveryRecord?.fixed_amount || 350000
    setDeliveryFee(dlvFee)

    const miscItems = regCosts.filter(r => ['번호판', '인지세', '대행료', '검사비'].includes(r.cost_type))
    const miscTotal = miscItems.reduce((s, r) => s + (r.fixed_amount || 0), 0) || 167000
    setMiscFee(miscTotal)

    const totalAcq = carInfo.purchase_price + acqTaxAmt + bondNet + dlvFee + miscTotal
    setTotalAcquisitionCost(totalAcq)
  }, [depreciationDB, insuranceRates, maintenanceCosts, taxRates, financeRates, regCosts, termMonths])

  // ============================================
  // 등록 차량 선택 시 연관 데이터 로드
  // ============================================
  const handleCarSelect = useCallback(async (carId: string) => {
    if (!carId) {
      setSelectedCar(null)
      return
    }

    const car = cars.find(c => String(c.id) === String(carId))
    if (!car) return

    setSelectedCar(car)
    setFactoryPrice(car.factory_price || Math.round(car.purchase_price * 1.15))
    setPurchasePrice(car.purchase_price)
    setEngineCC(car.engine_cc || 0)
    setLoanAmount(Math.round(car.purchase_price * 0.7))

    // 연동된 보험 조회
    const { data: insData } = await supabase
      .from('insurance_contracts')
      .select('*')
      .eq('car_id', carId)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    setLinkedInsurance(insData)
    if (insData?.total_premium) {
      setMonthlyInsuranceCost(Math.round(insData.total_premium / 12))
    }

    // 연동된 금융상품 조회
    const { data: finData } = await supabase
      .from('financial_products')
      .select('*')
      .eq('car_id', carId)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    setLinkedFinance(finData)
    if (finData) {
      if (finData.loan_amount) setLoanAmount(finData.loan_amount)
      if (finData.interest_rate) setLoanRate(finData.interest_rate)
    }

    // 시장 비교 데이터 조회
    const { data: compData } = await supabase
      .from('market_comparisons')
      .select('*')
      .eq('car_id', carId)
    setMarketComps(compData || [])

    // 공통 기준 테이블 매핑 적용
    applyReferenceTableMappings(
      {
        brand: car.brand,
        model: car.model,
        fuel_type: car.fuel_type || car.fuel,
        purchase_price: car.purchase_price,
        engine_cc: car.engine_cc,
        year: car.year,
        factory_price: car.factory_price,
      },
      { skipInsurance: !!insData, skipFinance: !!finData }
    )
  }, [cars, applyReferenceTableMappings])

  // ============================================
  // 🆕 브랜드 선택 → 모델명은 직접 타이핑 (AI 자동조회 비활성화)
  // ============================================

  // ============================================
  // 🆕 신차 AI 조회 (가격표)
  // ============================================
  const handleNewCarLookup = useCallback(async () => {
    if (!newCarBrand.trim() || !newCarModel.trim()) return
    setIsLookingUp(true)
    setLookupError('')
    setNewCarResult(null)
    setNewCarSelectedTax('')
    setNewCarSelectedFuel('')
    setNewCarSelectedVariant(null)
    setNewCarSelectedTrim(null)
    setNewCarSelectedOptions([])
    setNewCarSelectedExterior(null)
    setNewCarSelectedInterior(null)
    setNewCarSelectedOptions([])
    setNewCarPurchasePrice('')
    setSelectedCar(null)

    try {
      const res = await fetch('/api/lookup-new-car', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: newCarBrand.trim(), model: newCarModel.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '조회 실패')
      if (!data.available) {
        setLookupError(data.message || '해당 차종을 찾을 수 없습니다.')
        return
      }
      setNewCarResult(data)
    } catch (err: any) {
      setLookupError(err.message || 'AI 조회 중 오류가 발생했습니다.')
    } finally {
      setIsLookingUp(false)
    }
  }, [newCarBrand, newCarModel])

  // 🆕 견적서 업로드 → AI 파싱
  const handleQuoteUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // 파일 선택 초기화 (같은 파일 재선택 가능)
    e.target.value = ''

    setIsParsingQuote(true)
    setLookupError('')
    setNewCarResult(null)
    setNewCarSelectedTax('')
    setNewCarSelectedFuel('')
    setNewCarSelectedVariant(null)
    setNewCarSelectedTrim(null)
    setNewCarSelectedOptions([])
    setNewCarSelectedExterior(null)
    setNewCarSelectedInterior(null)
    setNewCarPurchasePrice('')
    setSelectedCar(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/parse-quote', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '견적서 분석 실패')
      if (!data.available) {
        setLookupError(data.message || '견적서에서 차량 정보를 추출할 수 없습니다.')
        return
      }
      // 견적서에서 추출한 브랜드/모델 반영
      if (data.brand) setNewCarBrand(data.brand)
      if (data.model) setNewCarModel(data.model)
      setNewCarResult(data)
    } catch (err: any) {
      setLookupError(err.message || '견적서 분석 중 오류가 발생했습니다.')
    } finally {
      setIsParsingQuote(false)
    }
  }, [])

  // 🆕 저장된 신차 가격 데이터 조회
  const fetchSavedPrices = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data } = await supabase
      .from('new_car_prices')
      .select('*')
      .eq('company_id', effectiveCompanyId)
      .order('created_at', { ascending: false })
    setSavedCarPrices(data || [])
  }, [effectiveCompanyId])

  useEffect(() => {
    if (effectiveCompanyId) {
      fetchSavedPrices()
    }
  }, [effectiveCompanyId, fetchSavedPrices])

  // 🆕 신차 가격 데이터 DB 저장
  const handleSaveCarPrice = useCallback(async () => {
    if (!newCarResult) { alert('저장할 가격 데이터가 없습니다.'); return }
    if (!effectiveCompanyId) { alert('회사 정보를 불러올 수 없습니다. 다시 로그인해주세요.'); return }
    setIsSavingPrice(true)
    try {
      const payload = {
        company_id: effectiveCompanyId,
        brand: newCarResult.brand,
        model: newCarResult.model,
        year: newCarResult.year,
        source: newCarResult.source || 'AI 조회',
        price_data: newCarResult,
      }
      // 같은 브랜드+모델+연식이면 업데이트, 없으면 신규 등록
      const { data: existing } = await supabase
        .from('new_car_prices')
        .select('id')
        .eq('company_id', effectiveCompanyId)
        .eq('brand', newCarResult.brand)
        .eq('model', newCarResult.model)
        .eq('year', newCarResult.year)
        .maybeSingle()

      let error: any = null
      if (existing) {
        const { error: e } = await supabase
          .from('new_car_prices')
          .update({ source: payload.source, price_data: payload.price_data, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        error = e
      } else {
        const { error: e } = await supabase.from('new_car_prices').insert([payload])
        error = e
      }
      if (error) {
        console.error('[가격저장] DB 에러:', error)
        throw error
      }
      await fetchSavedPrices()
      alert('가격 데이터가 저장되었습니다.')
    } catch (err: any) {
      console.error('[가격저장] 실패:', err)
      const msg = err?.message || err?.details || JSON.stringify(err)
      alert(`저장 실패: ${msg}\n\n※ new_car_prices 테이블이 없으면 Supabase SQL Editor에서 supabase_new_car_prices.sql을 실행해주세요.`)
    } finally {
      setIsSavingPrice(false)
    }
  }, [newCarResult, effectiveCompanyId, fetchSavedPrices])

  // 🆕 저장된 가격 데이터 불러오기
  const handleLoadSavedPrice = useCallback((saved: any) => {
    const data = saved.price_data
    if (!data) return
    setNewCarBrand(data.brand || '')
    setNewCarModel(data.model || '')
    setNewCarResult(data)
    setNewCarSelectedTax('')
    setNewCarSelectedFuel('')
    setNewCarSelectedVariant(null)
    setNewCarSelectedTrim(null)
    setNewCarSelectedOptions([])
    setNewCarSelectedExterior(null)
    setNewCarSelectedInterior(null)
    setNewCarPurchasePrice('')
    setLookupError('')
    setLookupMode('newcar')
  }, [])

  // 🆕 저장된 가격 데이터 삭제
  const handleDeleteSavedPrice = useCallback(async (id: string) => {
    if (!confirm('이 가격 데이터를 삭제하시겠습니까?')) return
    await supabase.from('new_car_prices').delete().eq('id', id)
    await fetchSavedPrices()
  }, [fetchSavedPrices])

  // 저장된 워크시트 조회
  const fetchWorksheets = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data } = await supabase
      .from('pricing_worksheets')
      .select('*, cars(number, brand, model, trim, year)')
      .eq('company_id', effectiveCompanyId)
      .order('updated_at', { ascending: false })
      .limit(50)
    setWorksheets(data || [])
  }, [effectiveCompanyId])

  useEffect(() => {
    if (effectiveCompanyId) fetchWorksheets()
  }, [effectiveCompanyId, fetchWorksheets])

  // 저장된 워크시트 삭제
  const handleDeleteWorksheet = async (id: string) => {
    if (!confirm('이 워크시트를 삭제하시겠습니까?')) return
    await supabase.from('pricing_worksheets').delete().eq('id', id)
    fetchWorksheets()
  }

  // 저장된 워크시트 로드
  const handleLoadWorksheet = (ws: any) => {
    // 차량 정보 복원
    if (ws.car_id && ws.cars) {
      const car: CarData = {
        id: ws.car_id,
        number: ws.cars.number || '',
        brand: ws.cars.brand || '',
        model: ws.cars.model || '',
        trim: ws.cars.trim || '',
        year: ws.cars.year || new Date().getFullYear(),
        fuel: '',
        mileage: 0,
        purchase_price: ws.purchase_price || 0,
        factory_price: ws.factory_price || 0,
        engine_cc: 0,
        status: 'active',
      }
      setSelectedCar(car)
      setLookupMode('registered')
    } else if (ws.newcar_info) {
      const info = ws.newcar_info
      const tempCar: CarData = {
        id: `newcar-loaded-${ws.id}`,
        number: '',
        brand: info.brand || '',
        model: info.model || '',
        trim: info.trim || '',
        year: info.year || new Date().getFullYear(),
        fuel: info.fuel || '',
        mileage: 0,
        purchase_price: ws.purchase_price || 0,
        factory_price: ws.factory_price || 0,
        engine_cc: 0,
        status: 'new-car-pricing',
      }
      setSelectedCar(tempCar)
      setLookupMode('newcar')
    }
    // 모든 값 복원
    setFactoryPrice(ws.factory_price || 0)
    setPurchasePrice(ws.purchase_price || 0)
    setLoanAmount(ws.loan_amount || 0)
    setLoanRate(ws.loan_interest_rate || 4.5)
    setInvestmentRate(ws.investment_rate || 6.0)
    setMonthlyInsuranceCost(ws.monthly_insurance || 0)
    setMonthlyMaintenance(ws.monthly_maintenance || 50000)
    setDeductible(ws.deductible || 500000)
    setDeposit(ws.deposit_amount || 3000000)
    setPrepayment(ws.prepayment_amount || 0)
    setTermMonths(ws.term_months || 36)
    setMargin(ws.target_margin || 150000)
    setAnnualMileage(ws.annual_mileage || 1.5)
    setDepMileageRate(ws.dep_mileage_rate || 2)
  }

  // 🆕 신차 트림 선택 후 분석 시작 (옵션 합산 반영)
  const handleNewCarAnalysis = useCallback(() => {
    if (!newCarResult || !newCarSelectedVariant || !newCarSelectedTrim) return

    // 출고가 = 트림 기본가 + 선택 옵션 합산 + 컬러 추가금
    const optionsTotal = newCarSelectedOptions.reduce((sum, opt) => sum + opt.price, 0)
    const colorExtra = (newCarSelectedExterior?.price || 0) + (newCarSelectedInterior?.price || 0)
    const factoryTotal = newCarSelectedTrim.base_price + optionsTotal + colorExtra
    const purchasePrice = parseNum(newCarPurchasePrice) || Math.round(factoryTotal * 0.87)

    // 컬러 + 옵션 이름 리스트 (트림 표시에 포함)
    const colorNames = [newCarSelectedExterior?.name, newCarSelectedInterior?.name].filter(Boolean)
    const optionNames = [...colorNames, ...newCarSelectedOptions.map(o => o.name)].length > 0
      ? ` + ${[...colorNames, ...newCarSelectedOptions.map(o => o.name)].join(', ')}`
      : ''

    // selectedCar에 임시 데이터 설정 (기존 산출 로직 호환)
    const tempCar: CarData = {
      id: `newcar-${Date.now()}`,
      number: '',
      brand: newCarResult.brand,
      model: newCarResult.model,
      trim: `${newCarSelectedVariant.variant_name} / ${newCarSelectedTrim.name}${optionNames}`,
      year: newCarResult.year,
      fuel: newCarSelectedVariant.fuel_type,
      mileage: 0,
      purchase_price: purchasePrice,
      factory_price: factoryTotal,
      engine_cc: newCarSelectedVariant.engine_cc,
      status: 'new-car-pricing',
    }
    setSelectedCar(tempCar)
    setFactoryPrice(factoryTotal)
    setPurchasePrice(purchasePrice)
    setEngineCC(newCarSelectedVariant.engine_cc || 0)
    setLoanAmount(Math.round(purchasePrice * 0.7))

    // 신차는 DB 연동 없음
    setLinkedInsurance(null)
    setLinkedFinance(null)
    setMarketComps([])

    // 공통 기준 테이블 매핑 적용
    applyReferenceTableMappings({
      brand: newCarResult.brand,
      model: newCarResult.model,
      fuel_type: newCarSelectedVariant.fuel_type,
      purchase_price: purchasePrice,
      engine_cc: newCarSelectedVariant.engine_cc,
      year: newCarResult.year,
      factory_price: factoryTotal,
    })
  }, [newCarResult, newCarSelectedVariant, newCarSelectedTrim, newCarSelectedOptions, newCarPurchasePrice, applyReferenceTableMappings])

  // ============================================
  // 자동 계산 로직
  // ============================================
  const calculations = useMemo(() => {
    if (!selectedCar) return null

    const thisYear = new Date().getFullYear()
    const carAge = thisYear - (selectedCar.year || thisYear)
    const mileage10k = (selectedCar.mileage || 0) / 10000

    // 1. 시세하락 / 감가 (계약기간 반영)
    // 현재 시점 감가율
    const yearDepNow = carAge <= 1
      ? depYear1Rate
      : depYear1Rate + (depYear2Rate * (carAge - 1))
    const mileageDepNow = mileage10k * depMileageRate
    const totalDepRateNow = Math.min(yearDepNow + mileageDepNow, 85)
    const currentMarketValue = Math.round(factoryPrice * (1 - totalDepRateNow / 100))

    // 계약 종료 시점 감가율 (계약기간 + 예상주행 반영)
    const termYears = termMonths / 12
    const endAge = carAge + termYears
    const yearDepEnd = endAge <= 1
      ? depYear1Rate
      : depYear1Rate + (depYear2Rate * (endAge - 1))
    // 연간 주행거리 × 계약기간 → 종료 시 예상 주행거리
    const projectedMileage10k = mileage10k + (termYears * annualMileage)
    const mileageDepEnd = projectedMileage10k * depMileageRate
    const totalDepRateEnd = Math.min(yearDepEnd + mileageDepEnd, 85)
    const endMarketValue = Math.round(factoryPrice * (1 - totalDepRateEnd / 100))

    // 계약기간 동안의 실제 감가 = 현재시세 - 종료시세
    const yearDep = yearDepNow   // UI 표시용 (현재)
    const mileageDep = mileageDepNow // UI 표시용 (현재)
    const totalDepRate = totalDepRateNow // UI 표시용 (현재)

    // 취득원가 기준 월 감가비
    const costBase = totalAcquisitionCost > 0 ? totalAcquisitionCost : purchasePrice
    const residualValue = Math.round(endMarketValue * 0.8) // 종료시점 시세 × 80%
    const monthlyDepreciation = Math.round(Math.max(0, costBase - residualValue) / termMonths)

    // 2. 금융비용
    const equityAmount = purchasePrice - loanAmount
    const monthlyLoanInterest = Math.round(loanAmount * (loanRate / 100) / 12)
    const monthlyOpportunityCost = Math.round(equityAmount * (investmentRate / 100) / 12)
    const totalMonthlyFinance = monthlyLoanInterest + monthlyOpportunityCost

    // 3. 운영비용
    const monthlyTax = Math.round(annualTax / 12)
    const totalMonthlyOperation = monthlyInsuranceCost + monthlyMaintenance + monthlyTax

    // 4. 리스크 적립
    const monthlyRiskReserve = Math.round(purchasePrice * (riskRate / 100) / 12)

    // 5. 보증금/선납금 할인
    const monthlyDepositDiscount = Math.round(deposit * (depositDiscountRate / 100))
    const monthlyPrepaymentDiscount = Math.round(prepayment * (prepaymentDiscountRate / 100))
    const totalDiscount = monthlyDepositDiscount + monthlyPrepaymentDiscount

    // 6. 총 원가
    const totalMonthlyCost = Math.max(0,
      monthlyDepreciation +
      totalMonthlyFinance +
      totalMonthlyOperation +
      monthlyRiskReserve -
      totalDiscount
    )

    // 7. 최종 렌트가
    const suggestedRent = totalMonthlyCost + margin
    const rentWithVAT = Math.round(suggestedRent * 1.1)

    // 8. 시장 비교
    const validComps = marketComps.filter(c => c.monthly_rent > 0)
    const marketAvg = validComps.length > 0
      ? Math.round(validComps.reduce((sum, c) => sum + c.monthly_rent, 0) / validComps.length)
      : 0
    const marketDiff = marketAvg > 0 ? ((rentWithVAT - marketAvg) / marketAvg * 100) : 0

    // 9. 매입가 대비 출고가 할인율
    const purchaseDiscount = factoryPrice > 0
      ? ((factoryPrice - purchasePrice) / factoryPrice * 100)
      : 0

    // 10. 원가 비중
    const costBreakdown = {
      depreciation: monthlyDepreciation,
      finance: totalMonthlyFinance,
      operation: totalMonthlyOperation,
      risk: monthlyRiskReserve,
      discount: -totalDiscount,
    }

    return {
      carAge, mileage10k, termYears,
      // 감가 — 현재
      yearDep, mileageDep, totalDepRate,
      currentMarketValue,
      // 감가 — 계약 종료 시점
      yearDepEnd, mileageDepEnd, totalDepRateEnd,
      endMarketValue, projectedMileage10k,
      monthlyDepreciation,
      // 금융
      equityAmount, monthlyLoanInterest, monthlyOpportunityCost, totalMonthlyFinance,
      // 운영
      monthlyTax, totalMonthlyOperation,
      // 리스크
      monthlyRiskReserve,
      // 보증금
      monthlyDepositDiscount, monthlyPrepaymentDiscount, totalDiscount,
      // 합계
      totalMonthlyCost, suggestedRent, rentWithVAT,
      // 시장
      marketAvg, marketDiff, purchaseDiscount,
      // 비중
      costBreakdown,
    }
  }, [
    selectedCar, factoryPrice, purchasePrice, depYear1Rate, depYear2Rate, depMileageRate, annualMileage,
    loanAmount, loanRate, investmentRate,
    monthlyInsuranceCost, monthlyMaintenance, annualTax,
    riskRate, deposit, prepayment, depositDiscountRate, prepaymentDiscountRate,
    termMonths, margin, marketComps, deductible, totalAcquisitionCost
  ])

  // 시장비교 추가
  const addMarketComp = async () => {
    if (!newComp.competitor_name || !newComp.monthly_rent) return
    if (!selectedCar || !effectiveCompanyId) return

    const { data, error } = await supabase.from('market_comparisons').insert([{
      company_id: effectiveCompanyId,
      car_id: selectedCar.id,
      ...newComp
    }]).select().single()

    if (!error && data) {
      setMarketComps(prev => [...prev, data])
      setNewComp({ competitor_name: '', vehicle_info: '', monthly_rent: 0, deposit: 0, term_months: 36, source: '' })
    }
  }

  const removeMarketComp = async (id: string) => {
    await supabase.from('market_comparisons').delete().eq('id', id)
    setMarketComps(prev => prev.filter(c => c.id !== id))
  }

  // 워크시트 저장 (등록차량 + 신차 모두 지원)
  const handleSaveWorksheet = async () => {
    if (!selectedCar) { alert('차량을 먼저 선택해주세요.'); return }
    if (!effectiveCompanyId) { alert('회사 정보를 불러올 수 없습니다. 다시 로그인해주세요.'); return }
    if (!calculations) { alert('산출 결과가 없습니다. 차량을 먼저 분석해주세요.'); return }
    setSaving(true)

    const baseData = {
      company_id: effectiveCompanyId,
      factory_price: factoryPrice,
      purchase_price: purchasePrice,
      current_market_value: calculations.currentMarketValue,
      total_depreciation_rate: calculations.totalDepRate,
      monthly_depreciation: calculations.monthlyDepreciation,
      loan_amount: loanAmount,
      loan_interest_rate: loanRate,
      monthly_loan_interest: calculations.monthlyLoanInterest,
      equity_amount: calculations.equityAmount,
      investment_rate: investmentRate,
      monthly_opportunity_cost: calculations.monthlyOpportunityCost,
      monthly_insurance: monthlyInsuranceCost,
      monthly_maintenance: monthlyMaintenance,
      monthly_tax: calculations.monthlyTax,
      deductible: deductible,
      monthly_risk_reserve: calculations.monthlyRiskReserve,
      deposit_amount: deposit,
      prepayment_amount: prepayment,
      monthly_deposit_discount: calculations.monthlyDepositDiscount,
      monthly_prepayment_discount: calculations.monthlyPrepaymentDiscount,
      total_monthly_cost: calculations.totalMonthlyCost,
      target_margin: margin,
      suggested_rent: calculations.suggestedRent,
      market_avg_rent: calculations.marketAvg,
      market_position: calculations.marketAvg > 0
        ? (calculations.marketDiff > 5 ? 'premium' : calculations.marketDiff < -5 ? 'economy' : 'average')
        : 'average',
      term_months: termMonths,
      annual_mileage: annualMileage,
      dep_mileage_rate: depMileageRate,
      status: 'draft',
      updated_at: new Date().toISOString(),
    }

    let error: any = null

    try {
      if (lookupMode === 'registered') {
        // 등록차량: car_id로 기존 워크시트 조회 후 insert/update
        const { data: existing } = await supabase
          .from('pricing_worksheets')
          .select('id')
          .eq('company_id', effectiveCompanyId)
          .eq('car_id', selectedCar.id)
          .maybeSingle()

        if (existing) {
          const { error: e } = await supabase
            .from('pricing_worksheets')
            .update({ ...baseData, car_id: selectedCar.id })
            .eq('id', existing.id)
          error = e
        } else {
          const { error: e } = await supabase
            .from('pricing_worksheets')
            .insert([{ ...baseData, car_id: selectedCar.id }])
          error = e
        }
      } else {
        // 신차 분석: car_id 없이 insert + 차량정보 JSONB
        const { error: e } = await supabase
          .from('pricing_worksheets')
          .insert([{
            ...baseData,
            car_id: null,
            newcar_info: {
              brand: selectedCar.brand,
              model: selectedCar.model,
              year: selectedCar.year,
              fuel: selectedCar.fuel,
              trim: selectedCar.trim || '',
              exterior_color: newCarSelectedExterior?.name || '',
              interior_color: newCarSelectedInterior?.name || '',
            },
          }])
        error = e
      }
    } catch (err: any) {
      error = err
    }

    if (error) alert('저장 실패: ' + (error.message || JSON.stringify(error)))
    else {
      alert(lookupMode === 'registered' ? '산출 워크시트가 저장되었습니다.' : '신차 분석이 저장되었습니다.')
      fetchWorksheets()
    }
    setSaving(false)
  }

  // 견적서로 전환
  const handleCreateQuote = () => {
    if (!calculations) return
    const params = new URLSearchParams({
      car_id: selectedCar!.id,
      rent_fee: String(calculations.suggestedRent),
      deposit: String(deposit),
      term: String(termMonths),
    })
    router.push(`/quotes/new?${params.toString()}`)
  }

  // ============================================
  // 렌더링
  // ============================================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-steel-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-bold">데이터 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">

      {/* ===== 헤더 ===== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/quotes" className="text-gray-400 hover:text-gray-600 text-sm">견적 관리</Link>
            <span className="text-gray-300">/</span>
            <span className="text-steel-600 font-bold text-sm">렌트가 산출</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900">
            렌트가 산출 빌더
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            견적 작성 전 모든 비용 요소를 분석하여 적정 렌트가를 산출합니다
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/quotes" className="px-4 py-2 text-sm border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-50">
            목록으로
          </Link>
          {selectedCar && calculations && (
            <button onClick={handleSaveWorksheet} disabled={saving}
              className="px-4 py-2 text-sm bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-900 disabled:opacity-50">
              {saving ? '저장 중...' : '워크시트 저장'}
            </button>
          )}
        </div>
      </div>


      {/* ===== 차량 선택 ===== */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-8 overflow-hidden">
        {/* 모드 탭 */}
        <div className="flex border-b border-gray-200">
          {[
            { key: 'registered', label: '등록차량', icon: '🚗' },
            { key: 'newcar', label: '신차 조회', icon: '✨' },
            { key: 'saved', label: '저장 목록', icon: '📋', count: worksheets.length + savedCarPrices.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setLookupMode(tab.key as any)
                if (tab.key === 'registered') {
                  setSelectedCar(null)
                  setNewCarResult(null)
                  setNewCarSelectedTax('')
                  setNewCarSelectedFuel('')
                  setNewCarSelectedVariant(null)
                  setNewCarSelectedTrim(null)
                  setNewCarSelectedOptions([])
                  setNewCarSelectedExterior(null)
                  setNewCarSelectedInterior(null)
                  setLookupError('')
                } else if (tab.key === 'newcar') {
                  setSelectedCar(null)
                }
              }}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-bold border-b-2 transition-colors ${
                lookupMode === tab.key
                  ? 'border-steel-600 text-steel-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="bg-gray-100 text-gray-600 text-[11px] font-bold px-1.5 py-0.5 rounded-full ml-1">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6">

        {/* === 등록차량 모드 === */}
        {lookupMode === 'registered' && (
          <div>
            <label className="block text-sm font-bold text-gray-500 mb-3">분석 대상 차량 선택</label>
            {/* 선택된 차량 표시 */}
            {selectedCar && (
              <div className="flex items-center justify-between p-4 bg-steel-50 border-2 border-steel-400 rounded-xl mb-3">
                <div>
                  <span className="font-black text-steel-800 text-lg">{selectedCar.brand} {selectedCar.model}</span>
                  <span className="ml-2 text-sm text-gray-500">{selectedCar.trim || ''}</span>
                  {selectedCar.number && <span className="ml-3 text-sm font-bold text-steel-600">[{selectedCar.number}]</span>}
                  <span className="ml-2 text-xs text-gray-400">{selectedCar.year}년식</span>
                </div>
                <button onClick={() => { setSelectedCar(null); setCarSearchQuery('') }}
                  className="text-sm text-gray-400 hover:text-red-500 font-bold">변경</button>
              </div>
            )}
            {/* 차량 검색 + 리스트 */}
            {!selectedCar && (
              <>
                <input
                  type="text"
                  placeholder="차량번호, 브랜드, 모델명으로 검색..."
                  value={carSearchQuery}
                  onChange={(e) => setCarSearchQuery(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl font-bold text-sm bg-white focus:border-steel-500 outline-none mb-3"
                />
                <div className="max-h-[320px] overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {cars
                    .filter(car => {
                      if (!carSearchQuery.trim()) return true
                      const q = carSearchQuery.toLowerCase()
                      return (
                        (car.number || '').toLowerCase().includes(q) ||
                        (car.brand || '').toLowerCase().includes(q) ||
                        (car.model || '').toLowerCase().includes(q) ||
                        (car.trim || '').toLowerCase().includes(q)
                      )
                    })
                    .map(car => (
                      <button
                        key={String(car.id)}
                        onClick={() => { handleCarSelect(String(car.id)); setCarSearchQuery('') }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-steel-50 transition-colors text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800">{car.brand} {car.model}</span>
                            <span className="text-xs text-gray-400">{car.trim || ''}</span>
                            {car.status === 'rented' && (
                              <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">렌트중</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {car.number && <span className="text-xs font-bold text-steel-600">{car.number}</span>}
                            <span className="text-xs text-gray-400">{car.year}년식</span>
                            {car.mileage ? <span className="text-xs text-gray-400">{(car.mileage / 10000).toFixed(1)}만km</span> : null}
                            {car.purchase_price ? <span className="text-xs text-gray-400">매입 {(car.purchase_price / 10000).toLocaleString()}만원</span> : null}
                          </div>
                        </div>
                        <span className="text-gray-300 text-sm ml-2">→</span>
                      </button>
                    ))
                  }
                  {cars.filter(car => {
                    if (!carSearchQuery.trim()) return true
                    const q = carSearchQuery.toLowerCase()
                    return (car.number || '').toLowerCase().includes(q) || (car.brand || '').toLowerCase().includes(q) || (car.model || '').toLowerCase().includes(q) || (car.trim || '').toLowerCase().includes(q)
                  }).length === 0 && (
                    <p className="text-center text-gray-400 py-6 text-sm">
                      {carSearchQuery ? '검색 결과가 없습니다' : '등록된 차량이 없습니다'}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* === 신차 조회 모드 === */}
        {lookupMode === 'newcar' && (
          <div>
            {/* ── 브랜드(드롭다운) + 모델명 + AI 조회 ── */}
            <div className="flex gap-3 mb-4 items-end">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 mb-1">브랜드</label>
                <select
                  value={[...DOMESTIC_BRANDS, ...IMPORT_BRAND_PRESETS].includes(newCarBrand) ? newCarBrand : (newCarBrand ? '__custom__' : '')}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '__custom__') {
                      setNewCarBrand('')
                    } else {
                      setNewCarBrand(val)
                    }
                    setNewCarModel(''); setNewCarResult(null); setNewCarSelectedTax(''); setNewCarSelectedFuel(''); setNewCarSelectedVariant(null); setNewCarSelectedTrim(null); setNewCarSelectedOptions([]); setLookupError('')
                  }}
                  className="w-40 p-3 border border-gray-200 rounded-xl font-bold text-base bg-white focus:border-blue-400 outline-none"
                >
                  <option value="">선택</option>
                  <optgroup label="국내">
                    {DOMESTIC_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </optgroup>
                  <optgroup label="수입">
                    {IMPORT_BRAND_PRESETS.map(b => <option key={b} value={b}>{b}</option>)}
                  </optgroup>
                  <option value="__custom__">직접 입력</option>
                </select>
              </div>
              {/* 직접 입력 모드 */}
              {![...DOMESTIC_BRANDS, ...IMPORT_BRAND_PRESETS].includes(newCarBrand) && newCarBrand !== '' ? null : null}
              {(newCarBrand === '' || (![...DOMESTIC_BRANDS, ...IMPORT_BRAND_PRESETS].includes(newCarBrand) && newCarBrand !== '')) ? null : null}
              {(() => {
                const isCustom = newCarBrand !== '' && ![...DOMESTIC_BRANDS, ...IMPORT_BRAND_PRESETS].includes(newCarBrand)
                if (!isCustom) return null
                return (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 mb-1">브랜드명</label>
                    <input
                      type="text"
                      placeholder="브랜드 입력"
                      value={newCarBrand}
                      onChange={(e) => setNewCarBrand(e.target.value)}
                      className="w-32 p-3 border border-gray-200 rounded-xl font-bold text-base focus:border-blue-400 outline-none"
                    />
                  </div>
                )
              })()}
              <div className="flex-1">
                <label className="block text-[11px] font-bold text-gray-400 mb-1">모델명</label>
                <input
                  type="text"
                  placeholder="모델명 입력 (예: K5, 아반떼, 싼타페)"
                  value={newCarModel}
                  onChange={(e) => {
                    setNewCarModel(e.target.value)
                    setNewCarResult(null); setNewCarSelectedTax(''); setNewCarSelectedFuel(''); setNewCarSelectedVariant(null); setNewCarSelectedTrim(null); setNewCarSelectedOptions([]); setLookupError('')
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleNewCarLookup()}
                  className="w-full p-3 border border-gray-200 rounded-xl font-bold text-base focus:border-blue-400 outline-none"
                />
              </div>
              <button
                onClick={handleNewCarLookup}
                disabled={isLookingUp || isParsingQuote || !newCarBrand.trim() || !newCarModel.trim()}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {isLookingUp ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span> 조회 중...
                  </span>
                ) : '🔍 AI 조회'}
              </button>
              {/* 견적서 업로드 버튼 */}
              <label className={`px-5 py-3 rounded-xl font-bold text-sm transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                isLookingUp || isParsingQuote
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
              }`}>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleQuoteUpload}
                  disabled={isLookingUp || isParsingQuote}
                  className="hidden"
                />
                {isParsingQuote ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span> 분석 중...
                  </span>
                ) : '📄 견적서'}
              </label>
            </div>

            {/* 에러 메시지 */}
            {lookupError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium mb-4">
                {lookupError}
              </div>
            )}


            {/* ====== 계층형 선택 UI: 개별소비세 → 유종 → 차종 그룹 → 트림 → 옵션 ====== */}
            {newCarResult && newCarResult.variants?.length > 0 && (() => {
              // 개별소비세 그룹 추출 (중복 제거)
              const taxTypes = [...new Set(
                newCarResult.variants
                  .map(v => v.consumption_tax || '')
                  .filter(t => t !== '')
              )]
              const hasTaxGroups = taxTypes.length > 1

              // 개별소비세 필터링
              const taxFilteredVariants = hasTaxGroups && newCarSelectedTax
                ? newCarResult.variants.filter(v => v.consumption_tax === newCarSelectedTax)
                : newCarResult.variants

              // 유종 리스트 추출 (개별소비세 필터 적용 후, 중복 제거)
              const fuelTypes = [...new Set(taxFilteredVariants.map(v => v.fuel_type))]
              // 유종 필터링된 차종 그룹
              const filteredVariants = newCarSelectedFuel
                ? taxFilteredVariants.filter(v => v.fuel_type === newCarSelectedFuel)
                : taxFilteredVariants

              // 단계 번호 계산 (개별소비세 있으면 +1)
              const stepOffset = hasTaxGroups ? 1 : 0
              const stepIcons = ['①', '②', '③', '④', '⑤', '⑥']

              return (
              <div className="mt-2 space-y-4">
                {/* 모델 헤더 + 저장 버튼 */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-bold text-gray-700">
                    {newCarResult.brand} {newCarResult.model} — {newCarResult.year}년식
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold">
                    차종 {newCarResult.variants.length}개
                  </span>
                  {newCarResult.source?.includes('견적서') && (
                    <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                      📄 견적서 추출
                    </span>
                  )}
                  <button
                    onClick={handleSaveCarPrice}
                    disabled={isSavingPrice}
                    className="ml-auto text-xs px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-bold hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                  >
                    {isSavingPrice ? '저장 중...' : '💾 가격 저장'}
                  </button>
                </div>

                {/* ── STEP 0 (조건부): 개별소비세 선택 ── */}
                {hasTaxGroups && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2">① 개별소비세 선택</label>
                    <div className="flex flex-wrap gap-2">
                      {taxTypes.map(tax => (
                        <button
                          key={tax}
                          onClick={() => {
                            setNewCarSelectedTax(tax)
                            setNewCarSelectedFuel('')
                            setNewCarSelectedVariant(null)
                            setNewCarSelectedTrim(null)
                            setNewCarSelectedOptions([])
                            setNewCarPurchasePrice('')
                            setSelectedCar(null)
                            // 해당 세율의 유종이 1개뿐이면 자동 선택
                            const matchedFuels = [...new Set(
                              newCarResult.variants
                                .filter(v => v.consumption_tax === tax)
                                .map(v => v.fuel_type)
                            )]
                            if (matchedFuels.length === 1) {
                              setNewCarSelectedFuel(matchedFuels[0])
                              const matched = newCarResult.variants.filter(v => v.consumption_tax === tax && v.fuel_type === matchedFuels[0])
                              if (matched.length === 1) setNewCarSelectedVariant(matched[0])
                            }
                          }}
                          className={`px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                            newCarSelectedTax === tax
                              ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-md'
                              : 'border-gray-200 hover:border-amber-300 bg-white text-gray-700'
                          }`}
                        >
                          <span>🏷️ {tax}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── STEP: 유종(연료) 선택 (개별소비세 없거나 선택 완료 후) ── */}
                {(!hasTaxGroups || newCarSelectedTax) && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">{stepIcons[stepOffset]} 유종 선택</label>
                  <div className="flex flex-wrap gap-2">
                    {fuelTypes.map(fuel => {
                      const fuelIcon: Record<string, string> = { '휘발유': '⛽', '경유': '🛢️', 'LPG': '🔵', '전기': '⚡', '하이브리드': '🔋' }
                      return (
                        <button
                          key={fuel}
                          onClick={() => {
                            setNewCarSelectedFuel(fuel)
                            setNewCarSelectedVariant(null)
                            setNewCarSelectedTrim(null)
                            setNewCarSelectedOptions([])
                            setNewCarPurchasePrice('')
                            setSelectedCar(null)
                            // 유종에 해당하는 차종이 1개뿐이면 자동 선택
                            const matched = taxFilteredVariants.filter(v => v.fuel_type === fuel)
                            if (matched.length === 1) setNewCarSelectedVariant(matched[0])
                          }}
                          className={`px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                            newCarSelectedFuel === fuel
                              ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                              : 'border-gray-200 hover:border-blue-300 bg-white text-gray-700'
                          }`}
                        >
                          <span>{fuelIcon[fuel] || '🚗'} {fuel}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                )}

                {/* ── STEP: 차종 그룹 선택 (유종 선택 후, 2개 이상일 때만 표시) ── */}
                {newCarSelectedFuel && filteredVariants.length > 1 && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2">{stepIcons[1 + stepOffset]} 차종 그룹 선택</label>
                    <div className="flex flex-wrap gap-2">
                      {filteredVariants.map((v, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setNewCarSelectedVariant(v)
                            setNewCarSelectedTrim(null)
                            setNewCarSelectedOptions([])
                            setNewCarPurchasePrice('')
                            setSelectedCar(null)
                          }}
                          className={`px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                            newCarSelectedVariant?.variant_name === v.variant_name
                              ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                              : 'border-gray-200 hover:border-blue-300 bg-white text-gray-700'
                          }`}
                        >
                          <span>{v.variant_name}</span>
                          <span className="ml-2 text-xs opacity-60">{v.engine_cc > 0 ? `${f(v.engine_cc)}cc` : '전기'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── STEP 3: 트림 선택 (차종 그룹 선택 후) ── */}
                {newCarSelectedVariant && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2">
                      {stepIcons[2 + stepOffset]} 트림 선택 — {newCarSelectedVariant.variant_name}
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {newCarSelectedVariant.trims.map((trim, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setNewCarSelectedTrim(trim)
                            setNewCarSelectedOptions([])
                            setNewCarPurchasePrice('')
                            setSelectedCar(null)
                          }}
                          className={`p-4 rounded-xl border-2 transition-all text-left ${
                            newCarSelectedTrim?.name === trim.name
                              ? 'border-blue-500 bg-blue-50 shadow-md'
                              : 'border-gray-200 hover:border-blue-300 bg-white'
                          }`}
                        >
                          <p className="font-bold text-gray-800">{trim.name}</p>
                          <p className="text-blue-600 font-bold mt-1">{f(trim.base_price)}원</p>
                          {trim.note && <p className="text-xs text-gray-400 mt-1">{trim.note}</p>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 외장 컬러 선택 */}
                {newCarSelectedTrim && (newCarSelectedTrim.exterior_colors?.length ?? 0) > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2">{stepIcons[3 + stepOffset]} 외장 컬러</label>
                    <div className="flex flex-wrap gap-2">
                      {newCarSelectedTrim.exterior_colors!.map((color, idx) => (
                        <button
                          key={idx}
                          onClick={() => setNewCarSelectedExterior(
                            newCarSelectedExterior?.name === color.name ? null : color
                          )}
                          className={`px-3 py-2 text-xs rounded-xl border font-bold transition-colors ${
                            newCarSelectedExterior?.name === color.name
                              ? 'bg-gray-800 text-white border-gray-800'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          {color.name}
                          {color.code && <span className="ml-1 text-gray-400">({color.code})</span>}
                          {color.price > 0 && <span className="ml-1 text-blue-500">+{(color.price).toLocaleString()}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {newCarSelectedTrim && (!newCarSelectedTrim.exterior_colors || newCarSelectedTrim.exterior_colors.length === 0) && (
                  <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3 mt-2">
                    이 가격표에 컬러 정보가 포함되지 않았습니다. 새로 AI 조회하면 컬러가 표시됩니다.
                  </div>
                )}

                {/* 내장 컬러 선택 */}
                {newCarSelectedTrim && (newCarSelectedTrim.interior_colors?.length ?? 0) > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2">{stepIcons[4 + stepOffset]} 내장 컬러</label>
                    <div className="flex flex-wrap gap-2">
                      {newCarSelectedTrim.interior_colors!.map((color, idx) => (
                        <button
                          key={idx}
                          onClick={() => setNewCarSelectedInterior(
                            newCarSelectedInterior?.name === color.name ? null : color
                          )}
                          className={`px-3 py-2 text-xs rounded-xl border font-bold transition-colors ${
                            newCarSelectedInterior?.name === color.name
                              ? 'bg-gray-800 text-white border-gray-800'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          {color.name}
                          {color.code && <span className="ml-1 text-gray-400">({color.code})</span>}
                          {color.price > 0 && <span className="ml-1 text-blue-500">+{(color.price).toLocaleString()}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── STEP 5: 선택 옵션 (트림 선택 후, 옵션이 있을 때) ── */}
                {newCarSelectedTrim && newCarSelectedTrim.options?.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2">
                      {stepIcons[5 + stepOffset]} 선택 옵션/패키지 <span className="text-gray-400 font-normal">(복수 선택 가능)</span>
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {newCarSelectedTrim.options.map((opt, idx) => {
                        const isChecked = newCarSelectedOptions.some(o => o.name === opt.name)
                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              setNewCarSelectedOptions(prev =>
                                isChecked
                                  ? prev.filter(o => o.name !== opt.name)
                                  : [...prev, opt]
                              )
                              setNewCarPurchasePrice('')
                              setSelectedCar(null)
                            }}
                            className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                              isChecked
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-blue-300 bg-white'
                            }`}
                          >
                            <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                              isChecked ? 'bg-blue-600 text-white' : 'bg-gray-100 border border-gray-300'
                            }`}>
                              {isChecked && <span className="text-xs">✓</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-gray-800">{opt.name}</p>
                              <p className="text-blue-600 font-bold text-sm">+{f(opt.price)}원</p>
                              {opt.description && <p className="text-xs text-gray-400 mt-0.5">{opt.description}</p>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── STEP 5: 최종 가격 요약 + 매입가 + 분석 시작 ── */}
                {newCarSelectedTrim && (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    {/* 가격 요약 */}
                    <div className="mb-3 pb-3 border-b border-gray-200">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">기본 출고가</span>
                        <span className="font-bold text-gray-700">{f(newCarSelectedTrim.base_price)}원</span>
                      </div>
                      {newCarSelectedOptions.length > 0 && (
                        <>
                          {newCarSelectedOptions.map((opt, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm mt-1">
                              <span className="text-gray-400">+ {opt.name}</span>
                              <span className="font-bold text-blue-600">+{f(opt.price)}원</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-gray-200">
                            <span className="font-bold text-gray-700">최종 출고가</span>
                            <span className="font-bold text-lg text-gray-900">
                              {f(newCarSelectedTrim.base_price + newCarSelectedOptions.reduce((s, o) => s + o.price, 0))}원
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* 매입가 입력 + 분석 시작 */}
                    <div className="flex items-end gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-500 mb-1">
                          예상 매입가 (할인 후)
                        </label>
                        <input
                          type="text"
                          placeholder={`${f(Math.round((newCarSelectedTrim.base_price + newCarSelectedOptions.reduce((s, o) => s + o.price, 0)) * 0.87))}원 (약 13% 할인)`}
                          value={newCarPurchasePrice}
                          onChange={(e) => setNewCarPurchasePrice(e.target.value.replace(/[^0-9,]/g, ''))}
                          className="w-full p-3 border border-gray-200 rounded-lg font-bold text-base focus:border-blue-400 outline-none"
                        />
                      </div>
                      <button
                        onClick={handleNewCarAnalysis}
                        className="px-6 py-3 bg-gray-800 text-white rounded-xl font-bold text-sm hover:bg-gray-900 transition-colors whitespace-nowrap"
                      >
                        분석 시작
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      * 매입가를 비워두면 최종 출고가의 약 87% (13% 할인)로 자동 계산됩니다
                    </p>
                  </div>
                )}

                <p className="text-xs text-gray-400 text-right">
                  * AI 자동 조회 결과입니다. 실제 출고가와 차이가 있을 수 있습니다.
                </p>
              </div>
              )
            })()}
          </div>
        )}

        {/* 선택된 차량 요약 */}
        {selectedCar && (
          <div className="mt-4">
            {lookupMode === 'newcar' && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-bold">✨ 신차 시뮬레이션</span>
                <span className="text-xs text-gray-400">임시 분석 — 정식 등록 전 참고용</span>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {(lookupMode === 'newcar' ? [
                { label: '구분', value: '🆕 신차' },
                { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}` },
                { label: '트림', value: selectedCar.trim || '-' },
                { label: '출고가', value: `${f(selectedCar.factory_price || 0)}원` },
                { label: '예상 매입가', value: `${f(selectedCar.purchase_price)}원` },
              ] : [
                { label: '차량번호', value: selectedCar.number },
                { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}` },
                { label: '연식', value: `${selectedCar.year}년` },
                { label: '주행거리', value: `${f(selectedCar.mileage || 0)}km` },
                { label: '매입가', value: `${f(selectedCar.purchase_price)}원` },
              ]).map((item, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-3 text-center">
                  <span className="text-xs text-gray-400 block">{item.label}</span>
                  <span className="font-bold text-gray-800 text-sm">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === 저장 목록 탭 === */}
        {lookupMode === 'saved' && (
          <div className="space-y-6">
            {/* 저장된 워크시트 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-black text-gray-700">산출 워크시트</span>
                <span className="bg-steel-100 text-steel-700 text-[11px] font-bold px-2 py-0.5 rounded-full">{worksheets.length}</span>
              </div>
              {worksheets.length === 0 ? (
                <p className="text-center text-gray-400 py-6 text-sm bg-gray-50 rounded-xl">저장된 워크시트가 없습니다</p>
              ) : (
                <div className="space-y-1.5">
                  {worksheets.map((ws: any) => {
                    const carLabel = ws.cars
                      ? `${ws.cars.brand} ${ws.cars.model} ${ws.cars.trim || ''}`.trim()
                      : ws.newcar_info
                        ? `[신차] ${ws.newcar_info.brand} ${ws.newcar_info.model}`.trim()
                        : '차량 정보 없음'
                    const dateStr = ws.updated_at
                      ? new Date(ws.updated_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                      : '-'
                    return (
                      <div key={ws.id} className="flex items-center justify-between px-4 py-3 bg-white border border-gray-150 rounded-xl hover:border-steel-300 group cursor-pointer"
                        onClick={() => handleLoadWorksheet(ws)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800 text-sm">{carLabel}</span>
                            {ws.status === 'draft' && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold">임시</span>}
                            {ws.status === 'confirmed' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">확정</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px] text-gray-400">{dateStr}</span>
                            <span className="text-[11px] text-gray-500">렌트가 {(ws.suggested_rent || 0).toLocaleString()}원</span>
                            <span className="text-[11px] text-gray-400">{ws.term_months}개월</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <span className="text-[11px] text-steel-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">불러오기</span>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteWorksheet(ws.id) }}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-xs p-0.5">✕</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 저장된 가격표 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-black text-gray-700">신차 가격표</span>
                <span className="bg-indigo-100 text-indigo-600 text-[11px] font-bold px-2 py-0.5 rounded-full">{savedCarPrices.length}</span>
              </div>
              {savedCarPrices.length === 0 ? (
                <p className="text-center text-gray-400 py-6 text-sm bg-gray-50 rounded-xl">저장된 가격표가 없습니다. 신차 조회 탭에서 AI 조회 후 저장하세요.</p>
              ) : (
                <div>
                  {(() => {
                    const grouped: Record<string, any[]> = {}
                    savedCarPrices.forEach((sp: any) => {
                      const brand = sp.brand || '기타'
                      if (!grouped[brand]) grouped[brand] = []
                      grouped[brand].push(sp)
                    })
                    return Object.entries(grouped).map(([brand, items]) => (
                      <div key={brand} className="mb-3 last:mb-0">
                        <div className="flex items-center gap-2 mb-1.5 px-1">
                          <span className="text-xs font-black text-gray-500 uppercase tracking-wide">{brand}</span>
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-[10px] text-gray-400">{items.length}개 모델</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                          {items.map((sp: any) => (
                            <div
                              key={sp.id}
                              className="flex items-center justify-between px-3 py-2.5 bg-white border border-gray-150 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/40 transition-all group cursor-pointer"
                              onClick={() => handleLoadSavedPrice(sp)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-gray-800 text-sm">{sp.model}</span>
                                  <span className="text-[11px] text-gray-400">{sp.year}년</span>
                                  <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">{sp.price_data?.variants?.length || 0}차종</span>
                                  {sp.source?.includes('견적서') ? (
                                    <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold">견적서</span>
                                  ) : (
                                    <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-bold">AI</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-gray-400 mt-0.5 block">
                                  {new Date(sp.updated_at || sp.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })} 저장
                                </span>
                              </div>
                              <div className="flex items-center gap-1 ml-2 shrink-0">
                                <span className="text-[11px] text-indigo-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">선택</span>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteSavedPrice(sp.id) }}
                                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-0.5 text-xs">✕</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {!selectedCar && lookupMode !== 'saved' ? (
        <div className="text-center py-20 text-gray-400">
          <span className="text-6xl block mb-4">🏗️</span>
          <p className="text-lg font-bold">차량을 선택하면 렌트가 산출 분석이 시작됩니다</p>
        </div>
      ) : calculations && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ===== 왼쪽: 입력/분석 영역 ===== */}
          <div className="lg:col-span-8 space-y-6">

            {/* 🆕 0. AI 자동분류 결과 */}
            {autoCategory && (
              <div className="bg-gradient-to-r from-steel-50 to-blue-50 border border-steel-200 rounded-2xl p-4 flex flex-wrap gap-3 items-center">
                <span className="text-sm font-bold text-steel-800">🤖 기준표 자동 매핑:</span>
                <span className="bg-steel-600 text-white text-xs font-bold px-3 py-1 rounded-full">잔가: {autoCategory}</span>
                <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">보험: {autoInsType}</span>
                <span className="bg-amber-600 text-white text-xs font-bold px-3 py-1 rounded-full">정비: {autoMaintType}</span>
              </div>
            )}

            {/* 1. 출고가 & 매입가 관계 */}
            <Section icon="🏭" title="출고가 & 매입가 관계">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <InputRow label="출고가 (신차가)" value={factoryPrice} onChange={setFactoryPrice} />
                  <InputRow label="매입가 (실 구매가)" value={purchasePrice} onChange={setPurchasePrice} />
                </div>
                <div className="bg-gradient-to-br from-steel-50 to-steel-100/50 rounded-xl p-5 flex flex-col justify-center">
                  <div className="text-center">
                    <span className="text-xs text-steel-600 font-bold block mb-1">매입 할인율</span>
                    <span className="text-4xl font-black text-steel-700">
                      {calculations.purchaseDiscount.toFixed(1)}%
                    </span>
                    <span className="text-sm text-steel-500 block mt-1">
                      출고가 대비 {f(factoryPrice - purchasePrice)}원 할인
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 🆕 1.5 취득원가 분석 */}
            <Section icon="📋" title="취득원가 분석 (차량가 + 등록비)">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <ResultRow label="차량 매입가" value={purchasePrice} />
                  <InputRow label="취득세 (7%)" value={acquisitionTax} onChange={setAcquisitionTax} />
                  <InputRow label="공채 실부담" value={bondCost} onChange={setBondCost} sub="서울12% × (1-할인6%)" />
                  <InputRow label="탁송료" value={deliveryFee} onChange={setDeliveryFee} />
                  <InputRow label="기타 (번호판/인지/대행/검사)" value={miscFee} onChange={setMiscFee} />
                </div>
                <div>
                  <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-xl p-5">
                    <div className="text-center">
                      <span className="text-xs text-red-500 font-bold block mb-1">실제 취득원가</span>
                      <span className="text-3xl font-black text-red-700">{f(totalAcquisitionCost)}원</span>
                      <span className="text-sm text-red-400 block mt-2">
                        차량가 대비 <b>+{f(totalAcquisitionCost - purchasePrice)}원</b> ({purchasePrice > 0 ? ((totalAcquisitionCost - purchasePrice) / purchasePrice * 100).toFixed(1) : 0}%)
                      </span>
                      <p className="text-xs text-gray-500 mt-3 bg-white/60 rounded-lg p-2">
                        이 금액이 렌트가 산정의 진짜 원가 기준입니다.<br/>
                        차량가만 기준하면 등록비용분 손실 발생!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* 2. 시세하락 분석 */}
            <Section icon="📉" title={`시세하락 / 감가 분석 (${termMonths}개월 계약)`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <InputRow label="1년차 감가율" value={depYear1Rate} onChange={setDepYear1Rate} suffix="%" type="percent" />
                  <InputRow label="2년차~ 연간 감가율" value={depYear2Rate} onChange={setDepYear2Rate} suffix="%" type="percent" />
                  <InputRow label="주행거리 감가율" value={depMileageRate} onChange={setDepMileageRate} suffix="%/만km" type="percent" />

                  {/* 연간 주행거리 설정 */}
                  <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-bold text-gray-500 mb-2">연간 예상 주행거리</p>
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {[
                        { val: 1, label: '1만' },
                        { val: 1.5, label: '1.5만' },
                        { val: 2, label: '2만' },
                        { val: 3, label: '3만' },
                        { val: 5, label: '무제한' },
                      ].map(opt => (
                        <button key={opt.val}
                          onClick={() => setAnnualMileage(opt.val)}
                          className={`py-1.5 px-3 text-xs rounded-lg border font-bold transition-colors
                            ${annualMileage === opt.val
                              ? 'bg-steel-600 text-white border-steel-600'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="w-24 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                        value={annualMileage}
                        onChange={(e) => setAnnualMileage(parseFloat(e.target.value) || 0)}
                      />
                      <span className="text-xs text-gray-400">만km/년</span>
                    </div>
                  </div>

                  <div className="border-t mt-3 pt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">현재 차령</span>
                      <span className="font-bold">{calculations.carAge}년</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">현재 주행거리</span>
                      <span className="font-bold">{calculations.mileage10k.toFixed(1)}만km</span>
                    </div>
                    <div className="flex justify-between text-sm text-blue-600">
                      <span>종료 시 차령</span>
                      <span className="font-bold">{(calculations.carAge + calculations.termYears).toFixed(1)}년</span>
                    </div>
                    <div className="flex justify-between text-sm text-blue-600">
                      <span>종료 시 주행 (추정)</span>
                      <span className="font-bold">{calculations.projectedMileage10k.toFixed(1)}만km</span>
                    </div>
                  </div>
                </div>
                <div>
                  {/* 현재 시점 */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-3">
                    <p className="text-xs font-bold text-gray-400 mb-2">현재 시점</p>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-500">연식 감가</span>
                      <span className="font-bold text-red-500">{calculations.yearDep.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-500">주행 감가</span>
                      <span className="font-bold text-red-500">{calculations.mileageDep.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-sm font-bold text-gray-700">총 감가율</span>
                      <span className="font-black text-red-600">{calculations.totalDepRate.toFixed(1)}%</span>
                    </div>
                    <div className="text-right text-sm text-gray-600 mt-1">
                      추정 시세: <b>{f(calculations.currentMarketValue)}원</b>
                    </div>
                  </div>
                  {/* 계약 종료 시점 */}
                  <div className="bg-blue-50 rounded-xl p-4 mb-3">
                    <p className="text-xs font-bold text-blue-400 mb-2">{termMonths}개월 후 (종료 시점)</p>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-blue-500">연식 감가</span>
                      <span className="font-bold text-blue-600">{calculations.yearDepEnd.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-blue-500">주행 감가</span>
                      <span className="font-bold text-blue-600">{calculations.mileageDepEnd.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-200">
                      <span className="text-sm font-bold text-blue-700">총 감가율</span>
                      <span className="font-black text-blue-700">{calculations.totalDepRateEnd.toFixed(1)}%</span>
                    </div>
                    <div className="text-right text-sm text-blue-600 mt-1">
                      추정 시세: <b>{f(calculations.endMarketValue)}원</b>
                    </div>
                  </div>
                  {/* 월 감가비용 */}
                  <div className="bg-red-50 rounded-xl p-4 text-center">
                    <span className="text-xs text-red-400 block">계약기간 중 시세 하락</span>
                    <span className="text-lg font-black text-red-600">
                      {f(calculations.currentMarketValue - calculations.endMarketValue)}원
                    </span>
                    <span className="text-xs text-gray-500 block mt-1">
                      월 감가비용: <b className="text-red-500">{f(calculations.monthlyDepreciation)}원</b>
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 3. 금융비용 분석 */}
            <Section icon="🏦" title="금융비용 분석 (대출 + 기회비용)">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <InputRow label="대출 원금" value={loanAmount} onChange={setLoanAmount} sub={`매입가의 ${purchasePrice > 0 ? (loanAmount/purchasePrice*100).toFixed(0) : 0}%`} />
                  <InputRow label="대출 이자율 (연)" value={loanRate} onChange={setLoanRate} suffix="%" type="percent" />
                  <div className="border-t mt-3 pt-3">
                    <InputRow label="투자수익률 (기회비용)" value={investmentRate} onChange={setInvestmentRate} suffix="%" type="percent" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    {[50, 60, 70, 80].map(pct => (
                      <button key={pct}
                        onClick={() => setLoanAmount(Math.round(purchasePrice * pct / 100))}
                        className={`flex-1 py-1.5 text-xs rounded-lg border font-bold transition-colors
                          ${Math.round(loanAmount / purchasePrice * 100) === pct
                            ? 'bg-steel-600 text-white border-steel-600'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <ResultRow label="자기자본 투입" value={calculations.equityAmount} />
                    <ResultRow label="월 대출이자" value={calculations.monthlyLoanInterest} />
                    <ResultRow label="월 기회비용" value={calculations.monthlyOpportunityCost} />
                    <div className="border-t pt-3">
                      <ResultRow label="총 월 금융비용" value={calculations.totalMonthlyFinance} highlight />
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* 4. 보험료 & 세금 */}
            <Section icon="🛡️" title="보험료 & 세금">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <InputRow label="월 보험료" value={monthlyInsuranceCost} onChange={setMonthlyInsuranceCost}
                    sub={linkedInsurance ? `✅ 보험계약 연동 (연 ${f(linkedInsurance.total_premium || 0)}원)` : autoInsType ? `📊 기준표 (${autoInsType}) 자동적용 · 연 ${f(monthlyInsuranceCost * 12)}원` : '직접 입력'} />
                  <InputRow label="배기량" value={engineCC} onChange={(v) => {
                    setEngineCC(v)
                    // 🆕 영업용 자동차세 재계산
                    const fuelCat = selectedCar?.fuel_type?.includes('전기') ? '전기' : '내연기관'
                    const tr = taxRates.find(r => r.tax_type === '영업용' && r.fuel_category === fuelCat && v >= r.cc_min && v <= r.cc_max)
                    let tax = 0
                    if (tr) {
                      tax = tr.fixed_annual > 0 ? tr.fixed_annual : Math.round(v * tr.rate_per_cc)
                      tax = Math.round(tax * (1 + tr.education_tax_rate / 100))
                    } else {
                      if (v <= 1000) tax = v * 18; else if (v <= 1600) tax = v * 18; else tax = v * 19
                      tax = Math.round(tax * 1.3)
                    }
                    setAnnualTax(tax)
                  }} suffix="cc" />
                  <InputRow label="연간 자동차세" value={annualTax} onChange={setAnnualTax} />
                </div>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <ResultRow label="월 보험료" value={monthlyInsuranceCost} />
                  <ResultRow label="월 자동차세" value={calculations.monthlyTax} />
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-700 text-sm">월 보험+세금 합계</span>
                      <span className="font-black text-lg text-gray-800">
                        {f(monthlyInsuranceCost + calculations.monthlyTax)}원
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* 5. 정비비용 */}
            <Section icon="🔧" title="정비비용">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <InputRow label="월 정비예비비" value={monthlyMaintenance} onChange={setMonthlyMaintenance} />
                  <div className="mt-3 flex gap-2">
                    {[30000, 50000, 80000, 100000].map(v => (
                      <button key={v}
                        onClick={() => setMonthlyMaintenance(v)}
                        className={`flex-1 py-1.5 text-xs rounded-lg border font-bold transition-colors
                          ${monthlyMaintenance === v
                            ? 'bg-steel-600 text-white border-steel-600'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                      >
                        {v / 10000}만
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    {autoMaintType
                      ? `📊 기준표 자동적용: ${autoMaintType} (차령 ${selectedCar ? new Date().getFullYear() - (selectedCar.year || 0) : 0}년)`
                      : '* 오일교환, 타이어, 브레이크 등 소모품 교체 비용 예비비'}
                  </p>
                </div>
                <div className="bg-amber-50 rounded-xl p-4 flex flex-col justify-center items-center">
                  <span className="text-xs text-amber-600 font-bold mb-1">계약기간 총 정비 예산</span>
                  <span className="text-3xl font-black text-amber-700">{f(monthlyMaintenance * termMonths)}원</span>
                  <span className="text-xs text-gray-500 mt-1">{termMonths}개월 × {f(monthlyMaintenance)}원</span>
                </div>
              </div>
            </Section>

            {/* 6. 사고 면책금 & 리스크 적립 */}
            <Section icon="⚠️" title="사고수리 면책금 & 리스크 적립">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <InputRow label="사고 시 자기부담금 (면책금)" value={deductible} onChange={setDeductible} />
                  <InputRow label="사고위험 적립률 (차량가 대비)" value={riskRate} onChange={setRiskRate} suffix="%" type="percent" />
                  <div className="mt-3 flex gap-2">
                    {[300000, 500000, 1000000, 1500000].map(v => (
                      <button key={v}
                        onClick={() => setDeductible(v)}
                        className={`flex-1 py-1.5 text-xs rounded-lg border font-bold transition-colors
                          ${deductible === v
                            ? 'bg-red-500 text-white border-red-500'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                      >
                        {v / 10000}만
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-red-50 rounded-xl p-4 space-y-3">
                  <div className="text-center">
                    <span className="text-xs text-red-400 block">월 리스크 적립금</span>
                    <span className="text-2xl font-black text-red-600">{f(calculations.monthlyRiskReserve)}원</span>
                    <span className="text-xs text-gray-500 block mt-1">
                      차량가 {f(purchasePrice)}원 × {riskRate}% ÷ 12
                    </span>
                  </div>
                  <div className="border-t pt-3 text-center">
                    <span className="text-xs text-gray-500 block">면책금 설정</span>
                    <span className="text-lg font-bold text-gray-800">{f(deductible)}원/건</span>
                    <p className="text-xs text-gray-400 mt-1">
                      * 고객 과실 사고 시 고객에게 청구할 금액
                    </p>
                  </div>
                </div>
              </div>
            </Section>

            {/* 7. 보증금 & 선납금 */}
            <Section icon="💰" title="보증금 & 선납금 효과">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <InputRow label="보증금" value={deposit} onChange={setDeposit} />
                  <InputRow label="보증금 월할인률" value={depositDiscountRate} onChange={setDepositDiscountRate} suffix="%" type="percent" />
                  <div className="border-t my-3" />
                  <InputRow label="선납금" value={prepayment} onChange={setPrepayment} />
                  <InputRow label="선납금 월할인률" value={prepaymentDiscountRate} onChange={setPrepaymentDiscountRate} suffix="%" type="percent" />
                  <div className="mt-3 flex gap-2">
                    {[1000000, 3000000, 5000000, 10000000].map(v => (
                      <button key={v}
                        onClick={() => setDeposit(v)}
                        className={`flex-1 py-1.5 text-xs rounded-lg border font-bold transition-colors
                          ${deposit === v
                            ? 'bg-green-600 text-white border-green-600'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                      >
                        {v / 10000}만
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-green-50 rounded-xl p-4 space-y-4">
                  <div>
                    <span className="text-xs text-green-600 block">보증금 효과</span>
                    <span className="text-lg font-bold text-green-700">
                      월 -{f(calculations.monthlyDepositDiscount)}원 할인
                    </span>
                    <span className="text-xs text-gray-500 block">
                      {f(deposit)}원 × {depositDiscountRate}%
                    </span>
                  </div>
                  {prepayment > 0 && (
                    <div>
                      <span className="text-xs text-green-600 block">선납금 효과</span>
                      <span className="text-lg font-bold text-green-700">
                        월 -{f(calculations.monthlyPrepaymentDiscount)}원 할인
                      </span>
                    </div>
                  )}
                  <div className="border-t pt-3">
                    <span className="text-xs text-green-700 font-bold block">총 월 할인</span>
                    <span className="text-2xl font-black text-green-700">
                      -{f(calculations.totalDiscount)}원
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 8. 시장 비교 */}
            <Section icon="📊" title="시중 동일유형 렌트가 비교">
              <div className="space-y-4">
                {/* 등록된 비교 데이터 */}
                {marketComps.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="p-3 text-left">경쟁사</th>
                          <th className="p-3 text-left">차량정보</th>
                          <th className="p-3 text-right">월 렌트</th>
                          <th className="p-3 text-right">보증금</th>
                          <th className="p-3 text-center">기간</th>
                          <th className="p-3 text-center">삭제</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {marketComps.map((comp, idx) => (
                          <tr key={comp.id || idx} className="hover:bg-gray-50">
                            <td className="p-3 font-bold">{comp.competitor_name}</td>
                            <td className="p-3 text-gray-600">{comp.vehicle_info}</td>
                            <td className="p-3 text-right font-bold">{f(comp.monthly_rent)}원</td>
                            <td className="p-3 text-right text-gray-500">{f(comp.deposit)}원</td>
                            <td className="p-3 text-center text-gray-500">{comp.term_months}개월</td>
                            <td className="p-3 text-center">
                              <button onClick={() => comp.id && removeMarketComp(comp.id)}
                                className="text-red-400 hover:text-red-600 text-xs font-bold">삭제</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 시장 평균 비교 */}
                {calculations.marketAvg > 0 && (
                  <div className={`rounded-xl p-4 text-center ${calculations.marketDiff > 10 ? 'bg-red-50' : calculations.marketDiff < -5 ? 'bg-green-50' : 'bg-blue-50'}`}>
                    <span className="text-xs text-gray-500 block">시장 평균 대비</span>
                    <span className={`text-3xl font-black ${calculations.marketDiff > 10 ? 'text-red-600' : calculations.marketDiff < -5 ? 'text-green-600' : 'text-blue-600'}`}>
                      {calculations.marketDiff > 0 ? '+' : ''}{calculations.marketDiff.toFixed(1)}%
                    </span>
                    <span className="text-sm text-gray-500 block mt-1">
                      시장 평균: {f(calculations.marketAvg)}원 / 내 가격: {f(calculations.rentWithVAT)}원
                    </span>
                  </div>
                )}

                {/* 새 비교 추가 */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 mb-3">시장 데이터 추가</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <input placeholder="경쟁사명" className="px-3 py-2 border rounded-lg text-sm"
                      value={newComp.competitor_name}
                      onChange={e => setNewComp({ ...newComp, competitor_name: e.target.value })} />
                    <input placeholder="차량정보" className="px-3 py-2 border rounded-lg text-sm"
                      value={newComp.vehicle_info}
                      onChange={e => setNewComp({ ...newComp, vehicle_info: e.target.value })} />
                    <input placeholder="월 렌트 (원)" className="px-3 py-2 border rounded-lg text-sm text-right"
                      value={newComp.monthly_rent || ''}
                      onChange={e => setNewComp({ ...newComp, monthly_rent: parseNum(e.target.value) })} />
                    <button onClick={addMarketComp}
                      className="bg-steel-600 text-white rounded-lg font-bold text-sm hover:bg-steel-700">
                      추가
                    </button>
                  </div>
                </div>
              </div>
            </Section>

          </div>

          {/* ===== 오른쪽: 최종 산출 요약 (Sticky) ===== */}
          <div className="lg:col-span-4">
            <div className="sticky top-6 space-y-6">

              {/* 계약 조건 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h3 className="font-bold text-gray-700 mb-4 text-sm">계약 조건 설정</h3>
                <div className="flex gap-2 mb-4">
                  {[12, 24, 36, 48, 60].map(t => (
                    <button key={t}
                      onClick={() => {
                        setTermMonths(t)
                        // 🆕 기간 변경 시 금리 자동 연동
                        const rateRecord = financeRates.find(r =>
                          r.finance_type === '캐피탈대출' &&
                          t >= r.term_months_min && t <= r.term_months_max
                        )
                        if (rateRecord) setLoanRate(Number(rateRecord.annual_rate))
                      }}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors
                        ${termMonths === t
                          ? 'bg-steel-600 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                      {t}개월
                    </button>
                  ))}
                </div>
                <InputRow label="목표 마진" value={margin} onChange={setMargin} />
                <div className="mt-2 flex gap-2">
                  {[100000, 150000, 200000, 300000].map(m => (
                    <button key={m}
                      onClick={() => setMargin(m)}
                      className={`flex-1 py-1 text-xs rounded border font-bold
                        ${margin === m
                          ? 'bg-steel-600 text-white border-steel-600'
                          : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                    >
                      {m / 10000}만
                    </button>
                  ))}
                </div>
              </div>

              {/* 최종 산출 영수증 */}
              <div className="bg-gray-950 text-white rounded-2xl shadow-2xl p-6">
                <div className="text-center border-b border-gray-700 pb-4 mb-4">
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">PRICING ANALYSIS</p>
                  <h2 className="text-2xl font-black mt-1">렌트가 산출 결과</h2>
                </div>

                <div className="space-y-3 text-sm">
                  {totalAcquisitionCost > 0 && (
                    <div className="flex justify-between text-xs text-gray-500 pb-2 border-b border-gray-800">
                      <span>취득원가 기준</span>
                      <span className="font-bold text-gray-400">{f(totalAcquisitionCost)}원</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 감가비용</span>
                    <span className="font-bold">{f(calculations.monthlyDepreciation)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 금융비용</span>
                    <span className="font-bold">{f(calculations.totalMonthlyFinance)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 보험료</span>
                    <span className="font-bold">{f(monthlyInsuranceCost)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 세금</span>
                    <span className="font-bold">{f(calculations.monthlyTax)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 정비비</span>
                    <span className="font-bold">{f(monthlyMaintenance)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 리스크적립</span>
                    <span className="font-bold">{f(calculations.monthlyRiskReserve)}원</span>
                  </div>
                  <div className="flex justify-between text-green-400">
                    <span>보증금/선납 할인</span>
                    <span className="font-bold">-{f(calculations.totalDiscount)}원</span>
                  </div>

                  <div className="border-t border-gray-700 my-4" />

                  <div className="flex justify-between text-red-400">
                    <span className="font-bold">총 월 원가</span>
                    <span className="font-black text-lg">{f(calculations.totalMonthlyCost)}원</span>
                  </div>
                  <div className="flex justify-between text-yellow-400">
                    <span className="font-bold">+ 마진</span>
                    <span className="font-bold">{f(margin)}원</span>
                  </div>

                  <div className="border-t border-gray-500 my-4" />

                  <div className="flex justify-between items-end">
                    <span className="text-gray-300">공급가액 (월)</span>
                    <span className="text-xl font-bold">{f(calculations.suggestedRent)}원</span>
                  </div>
                  <div className="flex justify-between text-gray-400 text-xs">
                    <span>부가세 (10%)</span>
                    <span>{f(calculations.suggestedRent * 0.1)}원</span>
                  </div>

                  <div className="border-t border-gray-500 my-4" />

                  <div className="text-right">
                    <p className="text-sm text-yellow-400 font-bold mb-1">최종 렌트가 (VAT 포함)</p>
                    <p className="text-4xl font-black tracking-tight">
                      {f(calculations.rentWithVAT)}<span className="text-lg ml-1">원</span>
                    </p>
                  </div>
                </div>

                {/* 원가 비중 차트 */}
                <div className="mt-6 pt-4 border-t border-gray-700">
                  <p className="text-xs text-gray-400 mb-3 font-bold">원가 비중 분석</p>
                  <div className="space-y-2">
                    <CostBar label="감가" value={calculations.monthlyDepreciation} total={calculations.totalMonthlyCost + calculations.totalDiscount} color="bg-red-500" />
                    <CostBar label="금융" value={calculations.totalMonthlyFinance} total={calculations.totalMonthlyCost + calculations.totalDiscount} color="bg-blue-500" />
                    <CostBar label="보험+세금" value={monthlyInsuranceCost + calculations.monthlyTax} total={calculations.totalMonthlyCost + calculations.totalDiscount} color="bg-purple-500" />
                    <CostBar label="정비" value={monthlyMaintenance} total={calculations.totalMonthlyCost + calculations.totalDiscount} color="bg-amber-500" />
                    <CostBar label="리스크" value={calculations.monthlyRiskReserve} total={calculations.totalMonthlyCost + calculations.totalDiscount} color="bg-red-400" />
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="mt-6 space-y-3">
                  <button onClick={handleCreateQuote}
                    className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-gray-200 transition-colors text-base">
                    이 분석으로 견적서 작성 →
                  </button>
                  <button onClick={handleSaveWorksheet} disabled={saving}
                    className="w-full bg-gray-800 text-gray-300 font-bold py-3 rounded-xl hover:bg-gray-700 transition-colors text-sm disabled:opacity-50">
                    {saving ? '저장 중...' : '워크시트 저장'}
                  </button>
                </div>
              </div>

              {/* 수익성 요약 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h3 className="font-bold text-gray-700 mb-4 text-sm">수익성 요약</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">월 순이익</span>
                    <span className="font-bold text-green-600">{f(margin)}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">연 순이익</span>
                    <span className="font-bold text-green-600">{f(margin * 12)}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">계약기간 총이익</span>
                    <span className="font-black text-green-700 text-lg">{f(margin * termMonths)}원</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">마진율</span>
                      <span className="font-bold text-steel-600">
                        {calculations.suggestedRent > 0 ? (margin / calculations.suggestedRent * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">투자수익률 (ROI)</span>
                      <span className="font-bold text-steel-600">
                        {purchasePrice > 0 ? ((margin * 12) / purchasePrice * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  )
}

'use client'
import { auth } from '@/lib/auth-client'

import { useApp } from '../../context/AppContext'
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { DEFAULT_INSURANCE_COVERAGE, DEFAULT_QUOTE_NOTICES, DEFAULT_CALC_PARAMS } from '@/lib/contract-terms'
import { f, fDate, parseNum, safeNum, safeDiv, formatWonCompact, MAINT_PACKAGE_LABELS, MAINT_PACKAGE_DESC } from '@/lib/quote-utils'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { CarData, MarketComp, NewCarOption, NewCarColor, NewCarTrim, NewCarVariant, NewCarResult, BusinessRules, DepAxes, InsVehicleClass, DriverAgeGroup } from '@/lib/rent-calc-types'
import { DOMESTIC_BRANDS, IMPORT_BRAND_PRESETS, IMPORT_BRANDS, PREMIUM_MODELS, EV_FUEL_KEYWORDS, EV_MODEL_KEYWORDS, HEV_KEYWORDS } from '@/lib/rent-calc-types'
import { mapToDepAxes, mapToDepCategory, mapToInsuranceType, getInsVehicleClass, estimateInsurance, mapToMaintenanceType, getMaintCostPerKm, getCarAgeFactor, getDeductibleDiscount, buildCurveFromDbRates, getDepRateFromCurve, calcIRR, calcMonthlyIRR, getExcessMileageRateFallback, getExcessMileageRateKey, getExcessMileageRateFromTerms, INS_BASE_ANNUAL, INS_OWN_DAMAGE_RATE, DEDUCTIBLE_DISCOUNT, DRIVER_AGE_FACTORS, DEP_CURVE_PRESETS, DEP_CLASS_MULTIPLIER, MAINTENANCE_PACKAGES, MAINT_MULTIPLIER, MAINT_ITEMS, DepCurvePreset, MaintenancePackage, MaintItem } from '@/lib/rent-calc'
import { calculateRentCost, calculateAcquisitionCost, calculateVehicleTax, calculatePrepaymentDiscount, type CalcInput, type CalcResult, type CostBreakdown } from '@/lib/rent-calc-engine'

import { CostBar, Section, InputRow, ResultRow } from './components'
import OptionHPanel, { type PresetMode as OptionHPresetMode } from './OptionHPanel'
import OptionHTable, { type HTableRow } from './OptionHTable'
import { PricingProvider } from './PricingContext'
import VehicleStep from './VehicleStep'
import AnalysisStep from './AnalysisStep'
import { CustomerStep, PreviewStep } from './CustomerPreviewStep'

// ============================================
// 메인 컴포넌트
// ============================================
export default function RentPricingBuilder() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'admin' ? adminSelectedCompanyId : company?.id
  const printRef = useRef<HTMLDivElement>(null)
  const initialLoadDone = useRef(false)

  // --- 위저드 단계 ---
  type WizardStep = 'vehicle' | 'options' | 'analysis' | 'customer' | 'preview'
  const [wizardStep, setWizardStep] = useState<WizardStep>('vehicle')
  const [advancedMode, setAdvancedMode] = useState(false)

  // --- 견적 수정 모드 ---
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)
  const [quoteCompany, setQuoteCompany] = useState<any>(null)

  // --- 고객 정보 (Step 2) ---
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customerMode, setCustomerMode] = useState<'select' | 'manual'>('select')
  const [manualCustomer, setManualCustomer] = useState({ name: '', phone: '', email: '', business_number: '' })
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [quoteNote, setQuoteNote] = useState('')
  const [quoteSaving, setQuoteSaving] = useState(false)

  // --- 데이터 로딩 ---
  const [cars, setCars] = useState<CarData[]>([])
  const [selectedCar, setSelectedCar] = useState<CarData | null>(null)
  const [rules, setRules] = useState<BusinessRules>({})
  const [loading, setLoading] = useState(true)
  const [editLoading, setEditLoading] = useState(false) // 견적 수정 모드 로딩
  const [saving, setSaving] = useState(false)
  const [currentWorksheetId, setCurrentWorksheetId] = useState<string | null>(null)

  // --- 가격 분석 입력값 ---
  const [factoryPrice, setFactoryPrice] = useState(0)      // 출고가
  const [purchasePrice, setPurchasePrice] = useState(0)     // 매입가

  // 감가 설정
  const [carAgeMode, setCarAgeMode] = useState<'new' | 'used'>('new')  // 신차 / 연식차량 구분
  const [customCarAge, setCustomCarAge] = useState(0)         // 수동 설정 차령 (연식차량 시)
  const [depCurvePreset, setDepCurvePreset] = useState<DepCurvePreset>('optimistic')  // 감가 곡선 프리셋 (기본: 낙관적 — 실거래 기반)
  const [depCustomCurve, setDepCustomCurve] = useState<number[]>([0, 20, 32, 40, 48, 54, 59, 63, 66.5, 69.5, 72])  // 사용자 정의 곡선
  const [depClassOverride, setDepClassOverride] = useState<string>('')  // 차종 클래스 수동 오버라이드 (빈값 = 자동)
  const [depYear1Rate, setDepYear1Rate] = useState(15)      // 1년차 감가 % (레거시, custom 모드에서만)
  const [depYear2Rate, setDepYear2Rate] = useState(8)        // 2년차~ 감가 % (레거시, custom 모드에서만)
  const [annualMileage, setAnnualMileage] = useState(2)      // 계약 약정 주행거리 (만km/년)
  const [baselineKm, setBaselineKm] = useState(2)            // 0% 감가 기준 주행거리 (만km/년)
  const [excessMileageRate, setExcessMileageRate] = useState(0) // 초과주행 km당 요금 (원)

  // 금융비용
  const [loanAmount, setLoanAmount] = useState(0)            // 대출 원금
  const [loanRate, setLoanRate] = useState(4.5)              // 대출 이자율 %
  const [investmentRate, setInvestmentRate] = useState(0)  // 투자수익률 % (0=기회비용 미반영)

  // 운영비용 — 정비 패키지
  const [maintPackage, setMaintPackage] = useState<MaintenancePackage>('self')
  const [oilChangeFreq, setOilChangeFreq] = useState<1 | 2>(1)
  const [monthlyMaintenance, setMonthlyMaintenance] = useState(0)
  const [monthlyInsuranceCost, setMonthlyInsuranceCost] = useState(0)
  const [driverAgeGroup, setDriverAgeGroup] = useState<DriverAgeGroup>('26세이상')
  const [insEstimate, setInsEstimate] = useState<ReturnType<typeof estimateInsurance> | null>(null)
  const [insAutoMode, setInsAutoMode] = useState(true) // true=추정자동, false=직접입력
  const [annualTax, setAnnualTax] = useState(0)              // 연간 자동차세
  const [engineCC, setEngineCC] = useState(0)                // 배기량

  // 자차보장
  const [ownDamageCoverageRatio, setOwnDamageCoverageRatio] = useState(60)  // 자차보장비율 % (기본 60%, 100%=전액보장)

  // 리스크
  const [deductible, setDeductible] = useState(500000)       // 면책금
  const [riskRate, setRiskRate] = useState(0)              // 리스크 적립률 % (0=보험으로 커버)

  // 보증금/선납금
  const [deposit, setDeposit] = useState(0)
  const [prepayment, setPrepayment] = useState(0)
  const [depositDiscountRate, setDepositDiscountRate] = useState(0.4) // %
  const [prepaymentDiscountRate, setPrepaymentDiscountRate] = useState(0.5)

  // 계약 조건
  const [contractType, setContractType] = useState<'return' | 'buyout'>('return')  // 반납형 / 인수형
  const [residualRate, setResidualRate] = useState(80)  // 잔존가치 설정율 (종료시점 시세 대비 %)
  const [buyoutPremium, setBuyoutPremium] = useState(0) // 인수형 추가 마진 (원/월)
  const [termMonths, setTermMonths] = useState(36)
  const [margin, setMargin] = useState(0)
  const [savedPricesOpen, setSavedPricesOpen] = useState(true)
  // Option H: 락 (역산 시 변경하지 않을 레버들)
  const [lockedParams, setLockedParams] = useState<Set<string>>(new Set())
  const toggleLock = (key: string) => setLockedParams(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  // Option H: 비교모드 기준값 (월 단위)
  const [hBaseline, setHBaseline] = useState<{ [k: string]: number } | null>(null)

  // 시장 비교
  const [marketComps, setMarketComps] = useState<MarketComp[]>([])
  const [newComp, setNewComp] = useState<MarketComp>({
    competitor_name: '', vehicle_info: '', monthly_rent: 0,
    deposit: 0, term_months: 36, source: ''
  })

  // 보험 & 금융상품 연동
  const [linkedInsurance, setLinkedInsurance] = useState<any>(null)
  const [linkedFinance, setLinkedFinance] = useState<any>(null)

  // 계약 조건 DB 설정
  const [termsConfig, setTermsConfig] = useState<{
    id: number
    insurance_coverage: any[]
    quote_notices: any[]
    calc_params: Record<string, any>
  } | null>(null)

  // 🆕 기준 테이블 데이터
  const [depreciationDB, setDepreciationDB] = useState<any[]>([])      // legacy 유지 (fallback)
  const [depRates, setDepRates] = useState<any[]>([])                  // 3축 depreciation_rates
  const [depAdjustments, setDepAdjustments] = useState<any[]>([])      // 보정계수 depreciation_adjustments
  const [insuranceRates, setInsuranceRates] = useState<any[]>([])
  const [maintenanceCosts, setMaintenanceCosts] = useState<any[]>([])
  const [taxRates, setTaxRates] = useState<any[]>([])
  const [financeRates, setFinanceRates] = useState<any[]>([])
  const [regCosts, setRegCosts] = useState<any[]>([])
  const [inspectionCosts, setInspectionCosts] = useState<any[]>([])         // inspection_cost_table
  const [inspectionSchedules, setInspectionSchedules] = useState<any[]>([]) // inspection_schedule_table
  const [insBasePremiums, setInsBasePremiums] = useState<any[]>([])         // insurance_base_premium (실데이터 기반)
  const [insOwnRates, setInsOwnRates] = useState<any[]>([])                // insurance_own_vehicle_rate (실데이터 기반)
  // 인기도 등급 선택 (보정계수)
  const [popularityGrade, setPopularityGrade] = useState<string>('B등급 (일반)')
  // 기준표 차종 수동 오버라이드 (3축 각각)
  const [dbOriginOverride, setDbOriginOverride] = useState<string>('')
  const [dbVehicleClassOverride, setDbVehicleClassOverride] = useState<string>('')
  const [dbFuelTypeOverride, setDbFuelTypeOverride] = useState<string>('')

  // 🆕 취득원가 관련
  const [acquisitionTax, setAcquisitionTax] = useState(0)
  const [bondCost, setBondCost] = useState(0)
  const [deliveryFee, setDeliveryFee] = useState(350000)
  const [miscFee, setMiscFee] = useState(167000)
  const [totalAcquisitionCost, setTotalAcquisitionCost] = useState(0)
  const [carCostItems, setCarCostItems] = useState<{category: string, item_name: string, amount: number}[]>([])  // 등록 페이지 비용 항목
  const hasCarCostsRef = useRef(false)  // applyReferenceTableMappings에서 totalAcquisitionCost 덮어쓰기 방지용
  // 🆕 차량등록 지역 (공채매입 계산용)
  const [registrationRegion, setRegistrationRegion] = useState('서울')

  // 🆕 자동 매핑 결과 표시
  const [autoCategory, setAutoCategory] = useState('')
  const [autoInsType, setAutoInsType] = useState('')
  const [autoMaintType, setAutoMaintType] = useState('')

  // 🆕 신차 조회 모드
  const [lookupMode, setLookupMode] = useState<'registered' | 'newcar' | 'saved'>('registered')

  // 🆕 Step 1 탭 네비게이션
  const [activeTab, setActiveTab] = useState<'registered' | 'newcar' | 'catalog'>('registered')

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
  const [lookupStage, setLookupStage] = useState<string>('')
  const [lookupStartTime, setLookupStartTime] = useState<number>(0)
  const [lookupElapsed, setLookupElapsed] = useState<number>(0)
  const [lookupError, setLookupError] = useState('')
  // brandModels, isLoadingModels 제거됨 — 모델명은 직접 타이핑
  const [isParsingQuote, setIsParsingQuote] = useState(false)
  const [parseStage, setParseStage] = useState<string>('')  // 업로드 단계 표시
  const [parseStartTime, setParseStartTime] = useState<number>(0)
  const [parseElapsed, setParseElapsed] = useState<number>(0)
  const [savedCarPrices, setSavedCarPrices] = useState<any[]>([])
  const [savedWorksheets, setSavedWorksheets] = useState<any[]>([])
  const [isSavingPrice, setIsSavingPrice] = useState(false)
  const [carSearchQuery, setCarSearchQuery] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const dropFileRef = useRef<HTMLInputElement>(null)
  // ── 카달로그 통합 리스트 검색/필터/정렬 ──
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'worksheets' | 'prices'>('all')
  const [catalogSort, setCatalogSort] = useState<'recent' | 'price_asc' | 'price_desc' | 'brand'>('recent')
  const [showAddPanel, setShowAddPanel] = useState(false)  // 카달로그 내 "+ 가격표 추가" 토글
  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set())  // 저장 목록 일괄삭제용 체크

  // --- 데이터 로드 ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      try {
        const headers = await getAuthHeader()

        // 비즈니스 규칙
        const rulesRes = await fetch('/api/business-rules', { headers })
        const rulesJson = await rulesRes.json()
        if (rulesJson.data) {
          const ruleMap: BusinessRules = {}
          rulesJson.data.forEach((r: any) => { ruleMap[r.key] = Number(r.value) })
          setRules(ruleMap)

          // 기본값 설정 — 최초 로드 시에만 (사용자가 수동 변경한 값 보존)
          if (!initialLoadDone.current) {
            const toPercent = (v: number) => v > 0 && v < 1 ? v * 100 : v
            // ── 기존 연동 항목 ──
            if (ruleMap.DEP_YEAR_1) setDepYear1Rate(toPercent(ruleMap.DEP_YEAR_1))
            else if (ruleMap.DEP_YEAR) setDepYear1Rate(toPercent(ruleMap.DEP_YEAR))
            if (ruleMap.DEP_YEAR_2PLUS) setDepYear2Rate(toPercent(ruleMap.DEP_YEAR_2PLUS))
            if (ruleMap.LOAN_INTEREST_RATE) setLoanRate(ruleMap.LOAN_INTEREST_RATE)
            if (ruleMap.INVESTMENT_RETURN_RATE) setInvestmentRate(ruleMap.INVESTMENT_RETURN_RATE)
            if (ruleMap.MONTHLY_MAINTENANCE_BASE) setMonthlyMaintenance(ruleMap.MONTHLY_MAINTENANCE_BASE)
            if (ruleMap.DEDUCTIBLE_AMOUNT) setDeductible(ruleMap.DEDUCTIBLE_AMOUNT)
            if (ruleMap.RISK_RESERVE_RATE) setRiskRate(ruleMap.RISK_RESERVE_RATE)
            if (ruleMap.DEPOSIT_DISCOUNT_RATE) setDepositDiscountRate(ruleMap.DEPOSIT_DISCOUNT_RATE)
            if (ruleMap.PREPAYMENT_DISCOUNT_RATE) setPrepaymentDiscountRate(ruleMap.PREPAYMENT_DISCOUNT_RATE)
            // ── 신규 연동 항목 (기존 하드코딩 → BusinessRules 설정값) ──
            if (ruleMap.DEFAULT_TERM_MONTHS) setTermMonths(ruleMap.DEFAULT_TERM_MONTHS)
            if (ruleMap.DEFAULT_DEPOSIT) setDeposit(ruleMap.DEFAULT_DEPOSIT)
            if (ruleMap.DEFAULT_MARGIN_RATE) setMargin(ruleMap.DEFAULT_MARGIN_RATE)
          }
        }

        // 차량 목록
        const carsRes = await fetch('/api/cars', { headers })
        const carsJson = await carsRes.json()
        setCars(carsJson.data || [])

        // 기준 테이블 일괄 로드 (개별 에러 허용)
        try {
          const [depRes, depRatesRes, depAdjRes, insRes, maintRes, taxRes, finRes, regRes, inspCostRes, inspSchedRes, insBaseRes, insOwnRes] = await Promise.all([
            fetch('/api/pricing-standards?table=depreciation_db', { headers }),
            fetch('/api/pricing-standards?table=depreciation_rates', { headers }),
            fetch('/api/pricing-standards?table=depreciation_adjustments', { headers }),
            fetch('/api/pricing-standards?table=insurance_rate_table', { headers }),
            fetch('/api/pricing-standards?table=maintenance_cost_table', { headers }),
            fetch('/api/pricing-standards?table=vehicle_tax_table', { headers }),
            fetch('/api/pricing-standards?table=finance_rate_table', { headers }),
            fetch('/api/pricing-standards?table=registration_cost_table', { headers }),
            fetch('/api/pricing-standards?table=inspection_cost_table', { headers }),
            fetch('/api/pricing-standards?table=inspection_schedule_table', { headers }),
            fetch('/api/pricing-standards?table=insurance_base_premium', { headers }),
            fetch('/api/pricing-standards?table=insurance_own_vehicle_rate', { headers }),
          ])
          const depJson = await depRes.json()
          const depRatesJson = await depRatesRes.json()
          const depAdjJson = await depAdjRes.json()
          const insJson = await insRes.json()
          const maintJson = await maintRes.json()
          const taxJson = await taxRes.json()
          const finJson = await finRes.json()
          const regJson = await regRes.json()
          const inspCostJson = await inspCostRes.json()
          const inspSchedJson = await inspSchedRes.json()
          const insBaseJson = await insBaseRes.json()
          const insOwnJson = await insOwnRes.json()

          setDepreciationDB(depJson.data || [])
          setDepRates(depRatesJson.data || [])
          setDepAdjustments(depAdjJson.data || [])
          setInsuranceRates(insJson.data || [])
          setMaintenanceCosts(maintJson.data || [])
          setTaxRates(taxJson.data || [])
          setFinanceRates(finJson.data || [])
          setRegCosts(regJson.data || [])
          setInspectionCosts(inspCostJson.data || [])
          setInspectionSchedules(inspSchedJson.data || [])
          setInsBasePremiums(insBaseJson.data || [])
          setInsOwnRates(insOwnJson.data || [])
        } catch (refErr) {
          console.warn('기준 테이블 로드 실패 (무시):', refErr)
        }
      } catch (err) {
        console.error('데이터 로드 실패:', err)
      }

      setLoading(false)
      initialLoadDone.current = true
    }
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCompanyId])

  // 계약 조건 DB 설정 로드
  useEffect(() => {
    if (!effectiveCompanyId) return
    const fetchTerms = async () => {
      try {
        const headers = await getAuthHeader()
        const res = await fetch('/api/contract-terms?status=active', { headers })
        const json = await res.json()
        const data = json.data ?? json ?? null
        if (data) setTermsConfig(data)
      } catch (error) {
        console.warn('계약 조건 로드 실패 (DB 기본값 사용):', error)
      }
    }
    fetchTerms()
  }, [effectiveCompanyId])

  // 탭 변경 시 lookupMode 동기화
  useEffect(() => {
    if (activeTab === 'registered') setLookupMode('registered')
    else if (activeTab === 'newcar') setLookupMode('newcar')
    // 카달로그 탭: showAddPanel이 켜진 경우만 newcar 모드로 (가격표 추가 UI 활성화)
    else if (activeTab === 'catalog' && showAddPanel) setLookupMode('newcar')
  }, [activeTab, showAddPanel])

  // ============================================
  // 🆕 공통 기준 테이블 매핑 함수
  // ============================================
  const applyReferenceTableMappings = useCallback((rawCarInfo: {
    brand: string, model: string, fuel_type?: string, fuel?: string,
    purchase_price: number, engine_cc?: number, year?: number,
    factory_price?: number, is_commercial?: boolean, displacement?: number, trim?: string
  }, opts?: { skipInsurance?: boolean, skipFinance?: boolean }) => {
    // ★ 안전장치: DB에서 문자열로 올 수 있는 숫자 필드를 강제 변환
    const carInfo = {
      ...rawCarInfo,
      purchase_price: Number(rawCarInfo.purchase_price) || 0,
      engine_cc: Number(rawCarInfo.engine_cc) || 0,
      factory_price: Number(rawCarInfo.factory_price) || 0,
    }
    // fuel_type 우선, 없으면 fuel 사용
    const resolvedFuel = carInfo.fuel_type || carInfo.fuel || ''
    // 3축 카테고리 자동 매핑
    const axes = mapToDepAxes(carInfo.brand, carInfo.model, resolvedFuel, carInfo.purchase_price)
    setAutoCategory(axes.label)

    // 3축 기준표 매칭 (depreciation_rates) → DB 기반 동적 곡선 생성
    const depRateRecord = depRates.find(d =>
      d.origin === axes.origin && d.vehicle_class === axes.vehicle_class && d.fuel_type === axes.fuel_type
    )
    if (depRateRecord) {
      // DB 기반 곡선 프리셋을 기본값으로 자동 설정
      setDepCurvePreset('db_based')
      // depYear1Rate/depYear2Rate도 동기화 (하위 호환)
      setDepYear1Rate(100 - Number(depRateRecord.rate_1yr))
      if (Number(depRateRecord.rate_1yr) > Number(depRateRecord.rate_3yr)) {
        setDepYear2Rate(Math.round((Number(depRateRecord.rate_1yr) - Number(depRateRecord.rate_3yr)) / 2))
      }
    } else {
      // 3축 매칭 실패 시 legacy depreciation_db로 fallback
      const category = axes.label
      const depRecord = depreciationDB.find(d => d.category === category)
      if (depRecord) {
        setDepYear1Rate(100 - depRecord.rate_1yr)
        if (depRecord.rate_1yr > depRecord.rate_3yr) {
          setDepYear2Rate(Math.round((depRecord.rate_1yr - depRecord.rate_3yr) / 2))
        }
      }
    }

    // 보험료 자동 조회 — 실데이터 기반 (insurance_base_premium + insurance_own_vehicle_rate)
    const insType = mapToInsuranceType(carInfo.brand, resolvedFuel)
    setAutoInsType(insType)
    if (!opts?.skipInsurance) {
      let annualPremium = 0

      // 1순위: 실데이터 기반 산출 (기본분담금 + 자차요율 × 차량가액)
      const isMultiSeat = (carInfo.model || '').includes('카니발') || (carInfo.model || '').includes('스타리아')
      const baseRec = insBasePremiums.find(r => r.vehicle_usage === (isMultiSeat ? '다인승' : '승용'))
      const fuelKey = (() => {
        const f = resolvedFuel.toLowerCase()
        if (['전기', 'ev', 'electric', 'bev'].some(k => f.includes(k))) return '전기'
        if (['하이브리드', 'hybrid', 'hev', 'phev'].some(k => f.includes(k))) return '하이브리드'
        if (['디젤', 'diesel'].some(k => f.includes(k))) return '디젤'
        if (['lpg', 'lng'].some(k => f.includes(k))) return 'LPG'
        return '가솔린'
      })()
      const isImport = IMPORT_BRANDS.some(ib => (carInfo.brand || '').toUpperCase().includes(ib.toUpperCase()))
      const originKey = isImport ? '수입' : '국산'

      // 자차요율 DB 매칭 (원산지+연료+차량가액)
      const ownRateRec = insOwnRates.find(r =>
        r.origin === originKey && r.fuel_type === fuelKey &&
        carInfo.purchase_price >= r.value_min && carInfo.purchase_price <= r.value_max
      ) || insOwnRates.find(r =>
        r.origin === originKey && r.fuel_type === '전체' &&
        carInfo.purchase_price >= r.value_min && carInfo.purchase_price <= r.value_max
      )

      if (baseRec && ownRateRec) {
        const baseCost = baseRec.base_total
        const ownCost = Math.round(carInfo.purchase_price * (ownRateRec.own_vehicle_rate / 100))
        annualPremium = baseCost + ownCost
      }

      // 2순위 fallback: 기존 insurance_rate_table
      if (!annualPremium) {
        const insRecord = insuranceRates.find(r =>
          r.vehicle_type === insType &&
          carInfo.purchase_price >= r.value_min &&
          carInfo.purchase_price <= r.value_max
        )
        if (insRecord) annualPremium = insRecord.annual_premium
      }

      if (annualPremium > 0) {
        setMonthlyInsuranceCost(Math.round(annualPremium / 12))
      }
    }

    // 정비 유형 자동 매핑 + 패키지 비용 계산
    const maintMapping = mapToMaintenanceType(carInfo.brand, carInfo.model, resolvedFuel, carInfo.purchase_price)
    setAutoMaintType(maintMapping.type)
    // 전기차면 엔진오일 패키지 → 기본정비로 자동 전환
    if (maintMapping.type === '전기차' && maintPackage === 'oil_only') {
      setMaintPackage('basic')
    }
    // 패키지 기반 비용 계산
    const multiplier = MAINT_MULTIPLIER[maintMapping.type] || 1.0
    const baseCost = MAINTENANCE_PACKAGES[maintPackage].monthly
    const oilAdjust = maintPackage === 'oil_only' && oilChangeFreq === 2 ? 1.8 : 1.0
    setMonthlyMaintenance(Math.round(baseCost * multiplier * oilAdjust))

    // 자동차세 계산 (영업용/비영업용 구분)
    const cc = carInfo.engine_cc || 0
    const fuelCat = resolvedFuel.includes('전기') || EV_FUEL_KEYWORDS.some(k => resolvedFuel.toUpperCase().includes(k.toUpperCase())) || EV_MODEL_KEYWORDS.some(k => carInfo.model.toUpperCase().includes(k.toUpperCase())) ? '전기' : '내연기관'
    const isCommercial = carInfo.is_commercial !== false // 기본값 영업용 (렌터카)
    const taxType = isCommercial ? '영업용' : '비영업용'
    const taxRecord = taxRates.find(r =>
      r.tax_type === taxType &&
      r.fuel_category === fuelCat &&
      cc >= r.cc_min && cc <= r.cc_max
    )
    let tax = 0
    if (taxRecord) {
      if (taxRecord.fixed_annual > 0) tax = taxRecord.fixed_annual
      else tax = Math.round(cc * taxRecord.rate_per_cc)
      tax = Math.round(tax * (1 + taxRecord.education_tax_rate / 100))
    } else {
      // fallback: 법정 기본 세율 적용
      if (fuelCat === '전기') {
        // 전기차 고정세액 (지방세법 시행령)
        if (isCommercial) {
          tax = 20000 // 영업용 전기차: 연 2만원, 교육세 비과세
        } else {
          tax = Math.round(130000 * 1.3) // 비영업용 전기차: 연 13만원 + 교육세 30% = 169,000원
        }
      } else if (isCommercial) {
        // 영업용 내연기관 fallback: 구간별 세율 (지방세법 시행령 제131조)
        // 1,000cc 이하: 18원/cc, 1,001~1,600cc: 18원/cc, 1,601cc 이상: 19원/cc
        const taxRate = cc > 1600 ? 19 : 18
        tax = cc * taxRate
      } else {
        // 비영업용 내연기관 fallback: cc 구간별 세율 + 교육세 30%
        if (cc <= 1000) tax = cc * 80
        else if (cc <= 1600) tax = cc * 140
        else tax = cc * 200
        tax = Math.round(tax * 1.3)
      }
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

    // ============================================
    // 취득원가 계산
    // ============================================
    // ★ 취득세: 영업용 4% / 비영업용 승용 7% (지방세법 제12조)
    const acqCategory = isCommercial
      ? (fuelCat === '전기' ? '영업용 전기' : '영업용')
      : (fuelCat === '전기' ? '비영업용 전기' : '비영업용')
    const acqTaxRecord = regCosts.find(r => r.cost_type === '취득세' && r.vehicle_category === acqCategory)
      || regCosts.find(r => r.cost_type === '취득세' && r.vehicle_category === (isCommercial ? '영업용' : '비영업용'))
    const deliveryRecord = regCosts.find(r => r.cost_type === '탁송료')

    // 취득세: 영업용 4%, 비영업용 7% (지방세법 제12조)
    const defaultAcqRate = isCommercial ? 0.04 : 0.07
    let acqTaxAmt = acqTaxRecord ? Math.round(carInfo.purchase_price * acqTaxRecord.rate / 100) : Math.round(carInfo.purchase_price * defaultAcqRate)

    // ★ 경차 취득세 감면 (지방세특례제한법 제75조)
    // 경차(배기량 1,000cc 미만) 취득세 75만원까지 면제
    // 예: 14,900,000 × 4% = 596,000원 < 750,000원 → 전액 면제
    const isLightCar = (carInfo.engine_cc > 0 && carInfo.engine_cc < 1000)
      || /레이|Ray|모닝|Morning|다마스|라보|마티즈|스파크|Spark/i.test(`${carInfo.model || ''} ${carInfo.trim || ''}`)
    const LIGHT_CAR_TAX_EXEMPT_LIMIT = 750000 // 경차 취득세 면제 한도
    if (isLightCar && acqTaxAmt <= LIGHT_CAR_TAX_EXEMPT_LIMIT) {
      acqTaxAmt = 0 // 전액 면제
    } else if (isLightCar && acqTaxAmt > LIGHT_CAR_TAX_EXEMPT_LIMIT) {
      acqTaxAmt = acqTaxAmt - LIGHT_CAR_TAX_EXEMPT_LIMIT // 초과분만 납부
    }
    setAcquisitionTax(acqTaxAmt)

    // ============================================
    // 공채매입: 지역별 + 영업용 기준
    // ============================================
    // 채권 종류: 서울/부산/대구 = 도시철도채권, 그 외 = 지역개발채권
    // 핵심: 지역개발채권 지역에서는 영업용 등록 시 공채매입 면제!
    //       도시철도채권 지역(서울/부산/대구)에서는 영업용에도 매입 의무
    //
    // [서울 도시철도채권 - 영업용 승용차 매입비율]
    //   배기량 2,000cc 이상: 8%
    //   배기량 1,600cc~2,000cc 미만: 5%
    //   배기량 1,000cc~1,600cc 미만: 면제 (2025.12.31까지)
    //   배기량 1,000cc 미만: 면제
    //   ※ 비영업용: 2000cc↑ 20%, 1600~2000cc 12%
    //
    // [부산 도시철도채권 - 영업용 승용차 매입비율]
    //   배기량 2,000cc 이상: 4%
    //   배기량 1,600cc~2,000cc 미만: 2%
    //   배기량 1,600cc 미만: 면제
    //
    // [대구 도시철도채권 - 영업용 승용차 매입비율]
    //   배기량 2,000cc 이상: 4%
    //   배기량 1,600cc~2,000cc 미만: 2%
    //   배기량 1,600cc 미만: 면제
    //
    // [그 외 지역 - 지역개발채권] → 영업용 전차종 면제
    //
    // 공채할인: 매입 즉시 할인 매도 가능 (할인율 약 4~8%, 시장 금리에 따라 변동)

    const bondCC = carInfo.engine_cc || engineCC || cc || 0

    // ★ 공채매입: DB 연동 (registration_cost_table에서 영업용 데이터 조회)
    // 배기량 기준으로 영업용/영업용 중형/영업용 소형 카테고리 매칭
    const getBondCategoryForCC = (cc: number): string => {
      if (cc >= 2000) return '영업용'       // 대형: 2000cc 이상
      if (cc >= 1600) return '영업용 중형'   // 중형: 1600~2000cc
      return '영업용 소형'                    // 소형: 1600cc 미만
    }
    const bondCategory = getBondCategoryForCC(bondCC)

    // DB에서 해당 지역 + 배기량 카테고리 공채매입 데이터 조회
    let bondRecord = regCosts.find(r =>
      r.cost_type === '공채매입' && r.region === registrationRegion && r.vehicle_category === bondCategory
    )
    // 정확한 배기량 카테고리가 없으면 해당 지역의 기본 '영업용' 카테고리로 폴백
    if (!bondRecord) {
      bondRecord = regCosts.find(r =>
        r.cost_type === '공채매입' && r.region === registrationRegion && r.vehicle_category === '영업용'
      )
    }
    // 지역 데이터 자체가 없으면 '기타' 지역으로 폴백 (영업용 면제)
    if (!bondRecord) {
      bondRecord = regCosts.find(r =>
        r.cost_type === '공채매입' && r.region === '기타' && r.vehicle_category === '영업용'
      )
    }

    const bondRate = bondRecord ? Number(bondRecord.rate) : 0
    const bondGross = Math.round(carInfo.purchase_price * bondRate / 100)
    // 공채할인율: DB에서 조회, 없으면 기본 6%
    const bondDiscountRecord = regCosts.find(r => r.cost_type === '공채할인')
    const bondDiscountRate = bondDiscountRecord ? Number(bondDiscountRecord.rate) / 100 : 0.06
    const bondNet = bondRate > 0 ? Math.round(bondGross * (1 - bondDiscountRate)) : 0
    setBondCost(bondNet)

    const dlvFee = Number(deliveryRecord?.fixed_amount) || 350000
    setDeliveryFee(dlvFee)

    const miscItems = regCosts.filter(r => ['번호판', '인지세', '대행료', '검사비'].includes(r.cost_type))
    const miscTotal = miscItems.reduce((s, r) => s + (Number(r.fixed_amount) || 0), 0) || 167000
    setMiscFee(miscTotal)

    const totalAcq = Number(carInfo.purchase_price) + acqTaxAmt + bondNet + dlvFee + miscTotal
    // car_costs 실데이터가 있으면 해당 합계 유지, 없을 때만 자동계산값 적용
    if (!hasCarCostsRef.current) {
      setTotalAcquisitionCost(totalAcq)
    }
  }, [depreciationDB, depRates, insuranceRates, maintenanceCosts, taxRates, financeRates, regCosts, termMonths, maintPackage, oilChangeFreq, registrationRegion, engineCC])

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
    setFactoryPrice(Number(car.factory_price) || Math.round(Number(car.purchase_price) * 1.15))
    setPurchasePrice(Number(car.purchase_price) || 0)
    setEngineCC(Number(car.engine_cc) || 0)
    setLoanAmount(Math.round(Number(car.purchase_price) * (rules.LOAN_LTV_DEFAULT ? rules.LOAN_LTV_DEFAULT / 100 : 0.7)))
    // 신차/중고차 구분: DB의 is_used 반영, 없으면 연식 기반 추정
    const thisY = new Date().getFullYear()
    if (car.is_used === false && (car.year || thisY) >= thisY) {
      setCarAgeMode('new')
      setCustomCarAge(0)
    } else {
      setCarAgeMode('used')
      setCustomCarAge(Math.max(0, thisY - (car.year || thisY)))
    }

    // 연동된 보험 조회
    const headers = await getAuthHeader()
    const insRes = await fetch(`/api/insurance-contracts?car_id=${carId}`, { headers })
    const insJson = await insRes.json()
    const insData = insJson.data ?? insJson ?? null
    setLinkedInsurance(insData)
    if (insData?.premium) {
      setMonthlyInsuranceCost(Math.round(insData.premium / 12))
      setInsAutoMode(false)  // 실제 보험 데이터가 있으면 자동추정 비활성화
    }

    // 연동된 금융상품 조회
    const finRes = await fetch(`/api/financial-products?car_id=${carId}`, { headers })
    const finJson = await finRes.json()
    const finData = finJson.data ?? finJson ?? null
    setLinkedFinance(finData)
    if (finData) {
      if (finData.loan_amount) setLoanAmount(Number(finData.loan_amount) || 0)
      if (finData.interest_rate) setLoanRate(Number(finData.interest_rate) || 0)
    }

    // 시장 비교 데이터 조회
    const compRes = await fetch(`/api/market-comparisons?car_id=${carId}`, { headers })
    const compJson = await compRes.json()
    const compData = compJson.data ?? compJson ?? []
    setMarketComps(compData || [])

    // 등록 페이지 구입비용 상세 (car_costs) 항목별 로드
    const costsRes = await fetch(`/api/car-costs?car_id=${carId}`, { headers })
    const costsJson = await costsRes.json()
    const costsData = costsJson.data ?? costsJson ?? []
    const hasCarCosts = Boolean(costsData && costsData.length > 0)
    hasCarCostsRef.current = hasCarCosts
    if (hasCarCosts && costsData) {
      setCarCostItems(costsData.map((c: any) => ({ category: c.category, item_name: c.item_name, amount: Number(c.amount) || 0 })))
    } else {
      setCarCostItems([])
    }

    // 공통 기준 테이블 매핑 적용 (먼저 실행 → 자동계산값 세팅)
    applyReferenceTableMappings(
      {
        brand: car.brand,
        model: car.model,
        fuel_type: car.fuel_type || car.fuel,
        purchase_price: Number(car.purchase_price) || 0,
        engine_cc: Number(car.engine_cc) || 0,
        year: car.year,
        factory_price: Number(car.factory_price) || 0,
        is_commercial: car.is_commercial,
      },
      { skipInsurance: !!insData, skipFinance: !!finData }
    )

    // car_costs 실데이터가 있으면 → 자동계산 덮어쓰기 (마지막에 세팅해야 React 배치에서 이 값이 최종 반영됨)
    if (hasCarCosts && costsData) {
      const costTotal = costsData.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0)
      if (costTotal > 0) {
        setTotalAcquisitionCost(costTotal)
      }
    }
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
    setLookupStage('🔍 검색 준비 중...')
    setLookupStartTime(Date.now())
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
      setLookupStage('🤖 AI가 가격 정보를 검색하고 있습니다...')
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
      const res = await fetch('/api/lookup-new-car', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
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
      setLookupStage('')
      setLookupStartTime(0)
    }
  }, [newCarBrand, newCarModel])

  // 🆕 저장된 신차 가격 데이터 조회
  const fetchSavedPrices = useCallback(async () => {
    if (!effectiveCompanyId) return
    const headers = await getAuthHeader()
    const res = await fetch('/api/new-car-prices', { headers })
    const json = await res.json()
    const data = json.data ?? json ?? []
    // 상세모델명(model)이 다르면 별도 항목으로 유지
    setSavedCarPrices(data || [])
  }, [effectiveCompanyId])

  // 🆕 저장된 산출 워크시트 조회
  const fetchSavedWorksheets = useCallback(async () => {
    if (!effectiveCompanyId) return
    const headers = await getAuthHeader()
    const res = await fetch('/api/pricing-worksheets', { headers })
    const json = await res.json()
    const data = json.data ?? json ?? []
    setSavedWorksheets(data || [])
  }, [effectiveCompanyId])

  useEffect(() => {
    if (effectiveCompanyId) {
      fetchSavedPrices()
      fetchSavedWorksheets()
    }
  }, [effectiveCompanyId, fetchSavedPrices, fetchSavedWorksheets])

  // --- 고객 데이터 로드 (Step 2용) ---
  useEffect(() => {
    if (!effectiveCompanyId) return
    const fetchCustomers = async () => {
      try {
        const headers = await getAuthHeader()
        const [custRes, compRes] = await Promise.all([
          fetch('/api/customers', { headers }),
          fetch(`/api/companies/${effectiveCompanyId}`, { headers }),
        ])
        const custJson = await custRes.json()
        const compJson = await compRes.json()
        if (custJson.data) setCustomers(custJson.data)
        if (compJson.data) setQuoteCompany(compJson.data)
        else if (company) setQuoteCompany(company)
      } catch (err) {
        console.error('Error fetching customers/companies:', err)
      }
    }
    fetchCustomers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCompanyId])

  // --- quote_id 파라미터로 기존 견적 로드 (수정 모드) ---
  const quoteLoadedRef = useRef<string | null>(null)
  useEffect(() => {
    const quoteId = searchParams.get('quote_id')
    if (!quoteId) return
    // 이미 로드한 quote_id면 스킵 (searchParams 참조 변경에 의한 중복 실행 방지)
    if (quoteLoadedRef.current === quoteId) return
    quoteLoadedRef.current = quoteId

    const loadQuoteForEdit = async () => {
      setEditLoading(true)
      try {
        const headers = await getAuthHeader()
        const res = await fetch(`/api/quotes/${quoteId}`, { headers })
        const json = await res.json()
        const q = json.data
        if (!q) { setEditLoading(false); return }
        setEditingQuoteId(quoteId)
        const d = q.quote_detail || {}
        // 고객 정보 복원
        if (q.customer_id) {
          setSelectedCustomerId(q.customer_id)
          setCustomerMode('select')
        } else if (d.manual_customer) {
          setManualCustomer(d.manual_customer)
          setCustomerMode('manual')
        }
        if (q.start_date) setStartDate(q.start_date)
        if (d.note) setQuoteNote(d.note)
        // 계약 조건 복원 (safeNum 방어)
        if (d.term_months) setTermMonths(safeNum(d.term_months, 36))
        if (d.contract_type) setContractType(d.contract_type)
        if (d.deposit !== undefined) setDeposit(safeNum(d.deposit, 0))
        if (d.prepayment !== undefined) setPrepayment(safeNum(d.prepayment, 0))
        if (d.annualMileage) setAnnualMileage(Math.max(2, safeNum(d.annualMileage, 2)))
        if (d.baselineKm) setBaselineKm(Math.max(2, safeNum(d.baselineKm, 2)))
        if (d.deductible !== undefined) setDeductible(safeNum(d.deductible, 500000))
        if (d.own_damage_coverage_ratio !== undefined) setOwnDamageCoverageRatio(safeNum(d.own_damage_coverage_ratio, 1))
        if (d.margin !== undefined) setMargin(safeNum(d.margin, 0))
        if (d.maint_package) setMaintPackage(d.maint_package)
        if (d.driver_age_group) setDriverAgeGroup(d.driver_age_group)
        if (d.dep_curve_preset) setDepCurvePreset(d.dep_curve_preset)
        if (d.residual_rate !== undefined) setResidualRate(safeNum(d.residual_rate, 0))
        if (d.excess_mileage_rate) setExcessMileageRate(safeNum(d.excess_mileage_rate, 0))
        // 금융 복원 (safeNum 방어)
        if (d.loan_amount !== undefined) setLoanAmount(safeNum(d.loan_amount, 0))
        if (d.loan_rate !== undefined) setLoanRate(safeNum(d.loan_rate, 4.5))
        if (d.investment_rate !== undefined) setInvestmentRate(safeNum(d.investment_rate, 6.0))
        // 가격 복원 (safeNum 방어 - 오버플로우 차단)
        if (d.factory_price) setFactoryPrice(safeNum(d.factory_price, 0))
        if (d.purchase_price) setPurchasePrice(safeNum(d.purchase_price, 0))
        // 차량 복원: car_id가 있으면 등록차량 선택
        let loadedInsData: any = null
        let loadedFinData: any = null
        if (q.car_id) {
          // cars를 직접 fetch로 조회
          const carRes = await fetch(`/api/cars/${q.car_id}`, { headers })
          const carJson = await carRes.json()
          const carData = carJson.data
          if (carData) {
            setSelectedCar(carData)
            // 기존 워크시트 로드 시: 차량이 이미 선택되어 있으므로 원가분석 단계로 바로 이동
            setWizardStep('analysis')
          setLookupMode('registered')
          if (!d.factory_price) setFactoryPrice(Number(carData.factory_price) || Math.round(Number(carData.purchase_price) * 1.15))
          if (!d.purchase_price) setPurchasePrice(Number(carData.purchase_price) || 0)
          setEngineCC(Number(carData.engine_cc) || 0)
          // 신차/중고차 구분
          const thisY = new Date().getFullYear()
          if (carData.is_used === false && (carData.year || thisY) >= thisY) {
            setCarAgeMode('new')
            setCustomCarAge(0)
          } else {
            setCarAgeMode('used')
            setCustomCarAge(Math.max(0, thisY - (carData.year || thisY)))
          }

          // --- 취득원가 구성 항목 로드 (car_costs) ---
          const headers = await getAuthHeader()
          const costsRes = await fetch(`/api/car-costs?car_id=${q.car_id}`, { headers })
          const costsJson = await costsRes.json()
          const costsData = costsJson.data ?? costsJson ?? []
          const hasCarCosts = Boolean(costsData && costsData.length > 0)
          hasCarCostsRef.current = hasCarCosts
          if (hasCarCosts && costsData) {
            setCarCostItems(costsData.map((c: any) => ({ category: c.category, item_name: c.item_name, amount: Number(c.amount) || 0 })))
            const costTotal = costsData.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0)
            if (costTotal > 0) setTotalAcquisitionCost(costTotal)
          }
          // quote_detail에 저장된 totalAcquisitionCost가 있으면 우선 사용
          if (Number(d.total_acquisition_cost) > 0) {
            setTotalAcquisitionCost(safeNum(d.total_acquisition_cost, 0))
          }

          // --- 연동 보험/금융 로드 ---
          const insRes = await fetch(`/api/insurance-contracts?car_id=${q.car_id}`, { headers })
          const insJson = await insRes.json()
          const insData = insJson.data ?? insJson ?? null
          loadedInsData = insData
          setLinkedInsurance(insData)
          if (insData?.premium) {
            setMonthlyInsuranceCost(Math.round(insData.premium / 12))
            setInsAutoMode(false)
          }
          const finRes = await fetch(`/api/financial-products?car_id=${q.car_id}`, { headers })
          const finJson = await finRes.json()
          const finData = finJson.data ?? finJson ?? null
          loadedFinData = finData
          setLinkedFinance(finData)
          if (finData) {
            if (finData.loan_amount) setLoanAmount(Number(finData.loan_amount) || 0)
            if (finData.interest_rate) setLoanRate(Number(finData.interest_rate) || 0)
          }

          // 기준 테이블 매핑 적용
          applyReferenceTableMappings(
            {
              brand: carData.brand,
              model: carData.model,
              fuel_type: carData.fuel_type,
              purchase_price: Number(carData.purchase_price) || 0,
              engine_cc: Number(carData.engine_cc) || 0,
              year: carData.year,
              factory_price: Number(carData.factory_price) || 0,
              is_commercial: carData.is_commercial,
            },
            { skipInsurance: !!insData, skipFinance: !!finData }
          )
          // car_costs가 있으면 자동계산된 totalAcquisitionCost를 다시 덮어쓰기
          if (hasCarCosts) {
            const costTotal = costsData!.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0)
            if (costTotal > 0) setTotalAcquisitionCost(costTotal)
          }
          if (Number(d.total_acquisition_cost) > 0) {
            setTotalAcquisitionCost(safeNum(d.total_acquisition_cost, 0))
          }
        }
      }
      // 신차 견적 (car_id 없음): quote_detail.car_info에서 차량 데이터 복원
      if (!q.car_id && d.car_info) {
        const ci = d.car_info
        const currentYear = new Date().getFullYear()
        const tempCar: CarData = {
          id: `restored-${quoteId}`,
          number: ci.number || '',
          brand: ci.brand || '',
          model: ci.model || '',
          trim: ci.trim || '',
          year: ci.year || currentYear,
          fuel: ci.fuel || '',
          fuel_type: ci.fuel || '',
          mileage: ci.mileage || 0,
          purchase_price: d.purchase_price || ci.purchase_price || 0,
          factory_price: d.factory_price || ci.factory_price || 0,
          engine_cc: ci.engine_cc || 0,
          status: 'new-car-pricing',
        }
        setSelectedCar(tempCar)
        setLookupMode('newcar')
        setFactoryPrice(safeNum(d.factory_price, safeNum(tempCar.factory_price, 0)))
        setPurchasePrice(safeNum(d.purchase_price, safeNum(tempCar.purchase_price, 0)))
        setEngineCC(ci.engine_cc || 0)
        setCarAgeMode('new')
        setCustomCarAge(0)
        if (Number(d.total_acquisition_cost) > 0) {
          setTotalAcquisitionCost(safeNum(d.total_acquisition_cost, 0))
        }
        // 기준 테이블 매핑 적용
        applyReferenceTableMappings(
          {
            brand: ci.brand,
            model: ci.model,
            fuel_type: ci.fuel,
            purchase_price: Number(d.purchase_price || tempCar.purchase_price) || 0,
            engine_cc: ci.engine_cc,
            year: ci.year || currentYear,
            factory_price: Number(d.factory_price || tempCar.factory_price) || 0,
          },
          {}
        )
        if (Number(d.total_acquisition_cost) > 0) {
          setTotalAcquisitionCost(safeNum(d.total_acquisition_cost, 0))
        }
      }

      // worksheet 연결 시 워크시트 데이터 완전 로드
      const wsId = searchParams.get('worksheet_id') || q.worksheet_id || d.worksheet_id
      if (wsId) {
        const wsRes = await fetch(`/api/pricing-worksheets?id=${wsId}`, { headers })
        const wsJson = await wsRes.json()
        const ws = wsJson.data ?? wsJson ?? null
        if (ws) {
          // 워크시트 ID 기억
          setCurrentWorksheetId(ws.id)

          // 위에서 로드한 연동 보험/금융 데이터 참조 (덮어쓰기 방지)
          const hasLinkedIns = !!(loadedInsData?.premium)
          const hasLinkedFin = !!(loadedFinData?.loan_amount)

          // 차량 정보는 이미 위에서 복원됨 → 워크시트의 산출 데이터만 복원
          // ★ safeNum으로 빈문자열/null/NaN/오버플로우(1e15+) 방어 (80경원 버그 방지)
          setFactoryPrice(safeNum(ws.factory_price, safeNum(d.factory_price, 0)))
          setPurchasePrice(safeNum(ws.purchase_price, safeNum(d.purchase_price, 0)))
          // 금융: 연동 금융이 있으면 워크시트 값으로 덮어쓰지 않음
          if (!hasLinkedFin) {
            setLoanAmount(safeNum(ws.loan_amount, safeNum(d.loan_amount, 0)))
            setLoanRate(safeNum(ws.loan_interest_rate, safeNum(d.loan_rate, 4.5)))
          }
          setInvestmentRate(safeNum(ws.investment_rate, safeNum(d.investment_rate, 6.0)))
          // 보험: 연동 보험이 있으면 워크시트 값으로 덮어쓰지 않음
          if (!hasLinkedIns) {
            setMonthlyInsuranceCost(safeNum(ws.monthly_insurance, 0))
            if (ws.ins_auto_mode !== undefined) setInsAutoMode(ws.ins_auto_mode)
          }
          if (ws.driver_age_group) setDriverAgeGroup(ws.driver_age_group as DriverAgeGroup)
          setMonthlyMaintenance(safeNum(ws.monthly_maintenance, safeNum(d.cost_breakdown?.maintenance, 0)))
          if (ws.maint_package) setMaintPackage(ws.maint_package as MaintenancePackage)
          if (ws.oil_change_freq) setOilChangeFreq(ws.oil_change_freq as 1 | 2)
          setDeductible(safeNum(ws.deductible, safeNum(d.deductible, 500000)))
          if (ws.own_damage_coverage_ratio !== undefined) setOwnDamageCoverageRatio(safeNum(ws.own_damage_coverage_ratio, 1))
          setDeposit(safeNum(ws.deposit_amount, safeNum(d.deposit, 0)))
          setPrepayment(safeNum(ws.prepayment_amount, safeNum(d.prepayment, 0)))
          if (ws.deposit_discount_rate !== undefined && ws.deposit_discount_rate !== null) setDepositDiscountRate(safeNum(ws.deposit_discount_rate, 0))
          if (ws.prepayment_discount_rate !== undefined && ws.prepayment_discount_rate !== null) setPrepaymentDiscountRate(safeNum(ws.prepayment_discount_rate, 0))
          if (ws.registration_region) setRegistrationRegion(ws.registration_region)
          setTermMonths(safeNum(ws.term_months, safeNum(d.term_months, 36)))
          setMargin(safeNum(ws.target_margin, safeNum(d.margin, 0)))
          // annual_mileage / baseline_km 은 나눗셈에 사용 → 최소값 2 보장 (divide-by-zero 방어)
          setAnnualMileage(Math.max(2, safeNum(ws.annual_mileage, safeNum(d.annualMileage, 2))))
          setBaselineKm(Math.max(2, safeNum(ws.baseline_km, safeNum(d.baselineKm, 2))))
          if (ws.excess_mileage_rate) setExcessMileageRate(ws.excess_mileage_rate)
          if (ws.excess_rate_margin_pct !== undefined) setExcessRateMarginPct(ws.excess_rate_margin_pct)
          if (ws.dep_curve_preset) setDepCurvePreset(ws.dep_curve_preset as DepCurvePreset)
          if (ws.dep_custom_curve) setDepCustomCurve(ws.dep_custom_curve)
          if (ws.dep_class_override !== undefined) setDepClassOverride(ws.dep_class_override || '')
          if (ws.contract_type) setContractType(ws.contract_type as 'return' | 'buyout')
          if (ws.residual_rate !== undefined) setResidualRate(ws.residual_rate)
          if (ws.buyout_premium !== undefined) setBuyoutPremium(ws.buyout_premium)
          // 차령 모드 복원
          if (ws.car_age_mode) {
            setCarAgeMode(ws.car_age_mode as 'new' | 'used')
            setCustomCarAge(ws.custom_car_age || 0)
          }
        }
        router.replace(`/quotes/create?worksheet_id=${wsId}&car_id=${q.car_id || ''}&quote_id=${quoteId}`)
      }
      setEditLoading(false)
    } catch (error) {
      console.error('Error loading quote:', error)
      setEditLoading(false)
    }
    }
    loadQuoteForEdit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 파일 처리 공통 함수
  const processUploadFile = useCallback(async (file: File) => {
    // 회사 미선택 시 업로드 차단
    if (!effectiveCompanyId) {
      alert('회사를 먼저 선택해주세요. (어드민은 상단에서 회사 선택 필요)')
      return
    }

    setIsParsingQuote(true)
    setParseStage('📤 파일 업로드 중...')
    setParseStartTime(Date.now())

    try {
      setParseStage('🤖 AI 분석 중... (복잡한 가격표는 30초 이상 소요)')
      const formData = new FormData()
      formData.append('file', file)

      // 인증 토큰 가져오기
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : ''

      const res = await fetch('/api/parse-quote', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '가격표 분석 실패')
      if (!data.available) {
        alert(data.message || '가격표에서 차량 정보를 추출할 수 없습니다.')
        return
      }

      if (!data.brand || !data.model || !data.year) {
        alert('가격표에서 브랜드/모델/연식 정보를 추출하지 못했습니다.')
        return
      }

      setParseStage('💾 저장 중...')

      // 저장 목록에 바로 추가 — 상세모델명(model_detail)을 가격표 제목으로 사용
      const displayModel = data.model_detail || data.model
      const payload = {
        brand: data.brand,
        model: displayModel,
        year: data.year,
        source: data.source || '가격표 업로드',
        price_data: data,
      }
      // brand + model(상세) + year + source(파일명)로 중복 체크
      // → 같은 모델이라도 다른 파일이면 별도 저장
      const headers = await getAuthHeader()
      const existRes = await fetch(`/api/new-car-prices?brand=${encodeURIComponent(data.brand)}&model=${encodeURIComponent(displayModel)}&year=${data.year}`, { headers })
      if (!existRes.ok) {
        console.error('[가격표저장] 조회 에러:', existRes.status)
        throw new Error(`DB 조회 실패: ${existRes.statusText}`)
      }
      const existJson = await existRes.json().catch(() => ({}))
      // 서버는 {data: row|null, error: null} 또는 {data: [], error: null}를 돌려준다.
      // data가 null/빈배열이면 "없음"으로 처리하고 POST 분기로 진입해야 한다.
      const rawExist = existJson?.data
      const existing = Array.isArray(rawExist) ? (rawExist[0] || null) : (rawExist || null)

      let saveRes: Response
      if (existing && existing.id) {
        saveRes = await fetch(`/api/new-car-prices/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ source: payload.source, price_data: payload.price_data })
        })
      } else {
        saveRes = await fetch('/api/new-car-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(payload)
        })
      }

      if (!saveRes.ok) {
        const errText = await saveRes.text().catch(() => '')
        let errMsg = ''
        try { errMsg = JSON.parse(errText)?.error || '' } catch { errMsg = errText }
        console.error('[가격표저장] DB 에러:', saveRes.status, errText)
        throw new Error(`저장 실패 (HTTP ${saveRes.status}): ${errMsg || '알 수 없는 오류'}`)
      }

      setParseStage('✅ 완료!')
      await fetchSavedPrices()
      setLookupMode('saved')
      setActiveTab('catalog')  // 저장된 목록이 카달로그 탭에 노출되므로 자동 전환
      alert(`${data.brand} ${displayModel} 가격표가 저장 목록에 추가되었습니다.`)
    } catch (err: any) {
      console.error('[가격표 업로드] 실패:', err)
      alert(err.message || '가격표 분석/저장 중 오류가 발생했습니다.')
    } finally {
      setIsParsingQuote(false)
      setParseStage('')
      setParseStartTime(0)
    }
  }, [effectiveCompanyId, fetchSavedPrices])

  // 드래그앤드롭 핸들러
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const onDragLeave = useCallback(() => setIsDragging(false), [])
  const onDropFile = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      processUploadFile(file)
    }
  }, [processUploadFile])

  // 파일 input onChange → processUploadFile 호출
  const handleQuoteUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) processUploadFile(file)
  }, [processUploadFile])

  // 🆕 신차 가격 데이터 DB 저장
  const handleSaveCarPrice = useCallback(async () => {
    if (!newCarResult) { alert('저장할 가격 데이터가 없습니다.'); return }
    if (!effectiveCompanyId) { alert('회사 정보를 불러올 수 없습니다. 다시 로그인해주세요.'); return }
    setIsSavingPrice(true)
    try {
      const displayModel = newCarResult.model_detail || newCarResult.model
      const payload = {
        brand: newCarResult.brand,
        model: displayModel,
        year: newCarResult.year,
        source: newCarResult.source || 'AI 조회',
        price_data: newCarResult,
      }
      // 같은 브랜드+상세모델+연식이면 업데이트, 없으면 신규 등록
      const headers = await getAuthHeader()
      const existRes = await fetch(`/api/new-car-prices?brand=${encodeURIComponent(newCarResult.brand)}&model=${encodeURIComponent(displayModel)}&year=${newCarResult.year}`, { headers })
      const existJson = await existRes.json().catch(() => ({}))
      const rawExist = existJson?.data
      const existing = Array.isArray(rawExist) ? (rawExist[0] || null) : (rawExist || null)
      let res: Response
      if (existing && existing.id) {
        res = await fetch(`/api/new-car-prices/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ source: payload.source, price_data: payload.price_data })
        })
      } else {
        res = await fetch('/api/new-car-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(payload)
        })
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        let errMsg = ''
        try { errMsg = JSON.parse(errText)?.error || '' } catch { errMsg = errText }
        console.error('[가격저장] DB 에러:', res.status, errText)
        throw new Error(`HTTP ${res.status}: ${errMsg || '알 수 없는 오류'}`)
      }
      await fetchSavedPrices()
      alert('가격 데이터가 저장되었습니다.')
    } catch (err: any) {
      console.error('[가격저장] 실패:', err)
      const msg = err?.message || err?.details || JSON.stringify(err)
      alert(`저장 실패: ${msg}\n\n※ new_car_prices 테이블이 없으면 DB 마이그레이션을 실행해주세요.`)
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
    setNewCarSelectedOptions([])
    setNewCarSelectedExterior(null)
    setNewCarSelectedInterior(null)
    setNewCarPurchasePrice('')
    setLookupError('')
    // 저장목록에서 선택 → 신차 선택 UI 활성화
    setLookupMode('saved')

    // 자동 선택: variants가 하나뿐이거나 트림이 하나뿐이면 자동 선택 후 옵션 스텝으로 이동
    const variants = data.variants || []
    if (variants.length > 0) {
      // 개별소비세 자동 선택
      const taxTypes = [...new Set(variants.map((v: any) => v.consumption_tax || '').filter((t: string) => t !== ''))]
      if (taxTypes.length === 1) setNewCarSelectedTax(taxTypes[0] as string)
      else setNewCarSelectedTax('')

      // 유종 자동 선택
      const fuelTypes = [...new Set(variants.map((v: any) => v.fuel_type))]
      if (fuelTypes.length === 1) setNewCarSelectedFuel(fuelTypes[0])
      else setNewCarSelectedFuel('')

      // variant 필터링 후 자동 선택
      const filteredVariants = variants.filter((v: any) => {
        if (taxTypes.length > 1 && taxTypes[0]) return v.consumption_tax === taxTypes[0]
        if (fuelTypes.length > 1 && fuelTypes[0]) return v.fuel_type === fuelTypes[0]
        return true
      })
      const targetVariant = filteredVariants.length === 1 ? filteredVariants[0] : (variants.length === 1 ? variants[0] : null)

      if (targetVariant) {
        setNewCarSelectedVariant(targetVariant)
        // 트림이 1개면 자동 선택 → 옵션 스텝으로 바로 이동
        if (targetVariant.trims?.length === 1) {
          const trim = targetVariant.trims[0]
          setNewCarSelectedTrim(trim)
          setFactoryPrice(Number(trim.base_price))
          setPurchasePrice(Number(trim.base_price))
          setWizardStep('options')
        } else {
          setNewCarSelectedTrim(null)
        }
      } else {
        setNewCarSelectedVariant(null)
        setNewCarSelectedTrim(null)
      }
    } else {
      setNewCarSelectedTax('')
      setNewCarSelectedFuel('')
      setNewCarSelectedVariant(null)
      setNewCarSelectedTrim(null)
    }
  }, [])

  // 🆕 저장된 가격 데이터 삭제
  const handleDeleteSavedPrice = useCallback(async (id: string) => {
    if (!confirm('이 가격 데이터를 삭제하시겠습니까?')) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/new-car-prices/${id}`, {
        method: 'DELETE',
        headers
      })
      if (!res.ok) throw new Error('삭제 실패')
      await fetchSavedPrices()
    } catch (e) {
      console.error('삭제 실패:', e)
      alert('삭제에 실패했습니다.')
    }
  }, [fetchSavedPrices])

  // 워크시트 개별 삭제
  const handleDeleteWorksheet = useCallback(async (id: string) => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/pricing-worksheets/${id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error('삭제 실패')
      await fetchSavedWorksheets()
    } catch (e) {
      console.error('워크시트 삭제 실패:', e)
      alert('삭제에 실패했습니다.')
    }
  }, [fetchSavedWorksheets])

  // 일괄 삭제 (체크된 행)
  const handleBulkDelete = useCallback(async () => {
    if (checkedRows.size === 0) return
    if (!confirm(`선택된 ${checkedRows.size}개 항목을 삭제하시겠습니까?`)) return
    const headers = await getAuthHeader()
    const errors: string[] = []
    for (const rowId of checkedRows) {
      // rowId 형식: "ws-{id}" 또는 "sp-{id}"
      const [type, id] = [rowId.substring(0, 2), rowId.substring(3)]
      try {
        const url = type === 'ws' ? `/api/pricing-worksheets/${id}` : `/api/new-car-prices/${id}`
        const res = await fetch(url, { method: 'DELETE', headers })
        if (!res.ok) errors.push(id)
      } catch { errors.push(id) }
    }
    setCheckedRows(new Set())
    await fetchSavedWorksheets()
    await fetchSavedPrices()
    if (errors.length > 0) alert(`${errors.length}개 항목 삭제 실패`)
  }, [checkedRows, fetchSavedWorksheets, fetchSavedPrices])

  // 업로드 경과 시간 타이머
  useEffect(() => {
    if (!isParsingQuote || !parseStartTime) { setParseElapsed(0); return }
    const timer = setInterval(() => {
      setParseElapsed(Math.floor((Date.now() - parseStartTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [isParsingQuote, parseStartTime])

  // AI 조회 경과 시간 타이머
  useEffect(() => {
    if (!isLookingUp || !lookupStartTime) { setLookupElapsed(0); return }
    const timer = setInterval(() => {
      setLookupElapsed(Math.floor((Date.now() - lookupStartTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [isLookingUp, lookupStartTime])

  // 🆕 신차 트림 선택 후 분석 시작 (옵션 합산 반영)
  const handleNewCarAnalysis = useCallback(() => {
    if (!newCarResult || !newCarSelectedVariant || !newCarSelectedTrim) return

    // 출고가 = 트림 기본가 + 선택 옵션 합산 + 컬러 추가금
    const optionsTotal = newCarSelectedOptions.reduce((sum, opt) => sum + Number(opt.price), 0)
    const colorExtra = Number(newCarSelectedExterior?.price || 0) + Number(newCarSelectedInterior?.price || 0)
    const factoryTotal = Number(newCarSelectedTrim.base_price) + optionsTotal + colorExtra
    // 매입가 = 출고가 - 할인금액 (할인 없으면 출고가 그대로)
    const discountAmount = parseNum(newCarPurchasePrice) || 0
    const purchasePrice = factoryTotal - discountAmount

    // 컬러 + 옵션 이름 리스트 (트림 표시에 포함)
    const colorNames = [newCarSelectedExterior?.name, newCarSelectedInterior?.name].filter(Boolean)
    const optionNames = [...colorNames, ...newCarSelectedOptions.map(o => o.name)].length > 0
      ? ` + ${[...colorNames, ...newCarSelectedOptions.map(o => o.name)].join(', ')}`
      : ''

    // selectedCar에 임시 데이터 설정 (기존 산출 로직 호환)
    // 신차 조회이므로 연식은 현재 연도 이상으로 보정 (AI가 과거 연식을 반환할 수 있음)
    const currentYear = new Date().getFullYear()
    const newCarYear = Math.max(newCarResult.year || currentYear, currentYear)
    const tempCar: CarData = {
      id: `newcar-${Date.now()}`,
      number: '',
      brand: newCarResult.brand,
      model: newCarResult.model,
      trim: `${newCarSelectedVariant.variant_name} / ${newCarSelectedTrim.name}${optionNames}`,
      year: newCarYear,
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
    setLoanAmount(Math.round(purchasePrice * (rules.LOAN_LTV_DEFAULT ? rules.LOAN_LTV_DEFAULT / 100 : 0.7)))
    setCarAgeMode('new')  // 신차 분석이므로 차령 0
    setCustomCarAge(0)

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
      year: newCarYear,
      factory_price: factoryTotal,
    })
  }, [newCarResult, newCarSelectedVariant, newCarSelectedTrim, newCarSelectedOptions, newCarPurchasePrice, applyReferenceTableMappings])

  // ============================================
  // 초과주행 km당 요금 자동 산출 (출고가 기반)
  // ============================================
  // 대형 렌터카사 기준:
  //   경차/소형 (~2500만): 100~120원/km
  //   중형 (2500~4000만): 130~150원/km
  //   준대형 (4000~6000만): 180~220원/km
  //   대형/수입 (6000~8000만): 220~280원/km
  //   프리미엄 (8000만~1.2억): 280~350원/km
  //   초과주행 요금 = 감가비 + 정비비 + 마진 (감가 모델 연동)
  const [excessRateMarginPct, setExcessRateMarginPct] = useState(50) // 마진율 %
  // 초과주행 km당 요금: 현재 약정 vs 무제한(5만km) 감가 차이 기반 패널티 산출
  const UNLIMITED_KM = 5  // 무제한 = 5만km/년
  const excessRateBreakdown = useMemo(() => {
    const ZERO = { depCost: 0, maintCost: 0, margin: 0, total: 0, depDiffPct: 0, extraKm: 0, depAmount: 0, tierPenalty: 1, maintItems: [] as { name: string; perKm: number }[], baseCost: 0 }
    // 출고가 없으면 매입가로 대체 (수동 입력 모드 등)
    const basePrice = factoryPrice > 0 ? factoryPrice : purchasePrice
    if (basePrice <= 0) return ZERO
    // 무제한 약정이면 초과주행 자체가 없음 → 전부 0
    if (annualMileage >= UNLIMITED_KM) return ZERO

    // 체감감소 주행감가 함수 (메인 calculations와 동일 로직)
    const _calcMileDep = (excess10k: number): number => {
      if (excess10k === 0) return 0
      const sign = excess10k > 0 ? 1 : -1
      const abs = Math.abs(excess10k)
      let dep = 0
      if (abs <= 5) dep = abs * 2.0
      else if (abs <= 10) dep = 5 * 2.0 + (abs - 5) * 1.5
      else dep = 5 * 2.0 + 5 * 1.5 + (abs - 10) * 1.0
      return sign * dep
    }
    const termYears = termMonths / 12
    const carAge = carAgeMode === 'new' ? 0 : customCarAge > 0 ? customCarAge : 0
    const curMileage10k = (selectedCar?.mileage || 0) / 10000
    const endAge = carAge + termYears
    const avgMileageAtEnd = endAge * baselineKm

    // ① 현재 약정 기준 종료 시점 주행감가
    const projectedAtContract = curMileage10k + (termYears * annualMileage)
    const excessAtContract = projectedAtContract - avgMileageAtEnd
    const mileageDepAtContract = _calcMileDep(excessAtContract)

    // ② 무제한(5만km/년) 기준 종료 시점 주행감가
    const projectedUnlimited = curMileage10k + (termYears * UNLIMITED_KM)
    const excessUnlimited = projectedUnlimited - avgMileageAtEnd
    const mileageDepUnlimited = _calcMileDep(excessUnlimited)

    // ③ 감가율 차이 → 금액 차이 → km당 비용
    const depDiffPct = mileageDepUnlimited - mileageDepAtContract  // %p 차이
    const depAmountDiff = Math.round(basePrice * (depDiffPct / 100))
    const extraKm = (UNLIMITED_KM - annualMileage) * termYears * 10000  // 약정↔무제한 총 km 차이

    // 약정이 낮을수록 초과 시 감가 패널티 가중 (무제한 대비 비율)
    // 무제한(5만)=1.0, 3만=1.67, 2만=2.5, 1.5만=3.33, 1만=5.0
    const tierPenalty = annualMileage > 0 ? UNLIMITED_KM / annualMileage : 1
    const depCostPerKm = extraKm > 0 ? Math.round((depAmountDiff / extraKm) * tierPenalty) : 0

    // km당 정비비: 실제 정비 항목별 교체주기·비용 기반 직접 산출
    const isImport = selectedCar ? IMPORT_BRANDS.some(ib => (selectedCar.brand || '').toUpperCase().includes(ib.toUpperCase())) : false
    const cc = selectedCar?.engine_cc || 0
    const maintMult = isImport ? 1.8
      : cc <= 1000 ? 0.7
      : cc <= 2000 ? 1.0
      : 1.3
    const isEV = selectedCar?.fuel_type === '전기' || selectedCar?.fuel_type === 'EV'
    const maintBreakdown = getMaintCostPerKm(maintPackage, maintMult, isEV)
    const maintCostPerKm = maintBreakdown.total

    // 원가 합계 (감가비 + 정비비)
    const baseCost = depCostPerKm + maintCostPerKm
    // 마진 적용
    const marginPerKm = Math.round(baseCost * (excessRateMarginPct / 100))
    const total = baseCost + marginPerKm
    return { depCost: depCostPerKm, maintCost: maintCostPerKm, margin: marginPerKm, total, depDiffPct, extraKm, depAmount: depAmountDiff, tierPenalty, maintItems: maintBreakdown.items, baseCost }
  }, [factoryPrice, purchasePrice, monthlyMaintenance, baselineKm, excessRateMarginPct, annualMileage, termMonths, selectedCar, carAgeMode, customCarAge, maintPackage])

  // 자동 연동
  useEffect(() => {
    if (excessRateBreakdown.total > 0) {
      setExcessMileageRate(excessRateBreakdown.total)
    }
  }, [excessRateBreakdown.total])

  // 보험료 자동 추정 (공제조합 기준)
  useEffect(() => {
    if (!selectedCar || !insAutoMode) return
    const cc = selectedCar.engine_cc || engineCC || 0
    const carAge = (() => {
      if (carAgeMode === 'used') return customCarAge > 0 ? customCarAge : 0
      const year = selectedCar.year || new Date().getFullYear()
      return new Date().getFullYear() - year
    })()
    const est = estimateInsurance({
      cc,
      brand: selectedCar.brand || '',
      purchasePrice: purchasePrice,
      factoryPrice: factoryPrice,
      fuelType: selectedCar.fuel_type,
      driverAge: driverAgeGroup,
      deductible: deductible,
      carAge: carAge,
      isCommercial: selectedCar.is_commercial,
      ownDamageCoverageRatio: ownDamageCoverageRatio,
    })
    setInsEstimate(est)
    setMonthlyInsuranceCost(est.totalMonthly)
  }, [selectedCar, factoryPrice, purchasePrice, engineCC, driverAgeGroup, deductible, carAgeMode, customCarAge, insAutoMode, ownDamageCoverageRatio])

  // 초과주행 요금: 사용자 수동 입력값 → 약관 DB → fallback 순서
  const termsExcessInfo = useMemo(() => {
    const vc = insEstimate?.vehicleClass || getInsVehicleClass(engineCC, selectedCar?.brand || '', factoryPrice || purchasePrice)
    return getExcessMileageRateFromTerms(termsConfig?.calc_params, vc, factoryPrice || purchasePrice)
  }, [termsConfig, insEstimate, engineCC, selectedCar, factoryPrice, purchasePrice])

  // ============================================
  // 자동 계산 로직 (v2.0 엔진 연동)
  // ============================================
  const calculations = useMemo(() => {
    if (!selectedCar) return null

    // ★ 안전장치: 외부에서 문자열이 유입될 수 있으므로 핵심 가격변수를 숫자로 강제 변환
    const _factoryPrice = Number(factoryPrice) || 0
    const _purchasePrice = Number(purchasePrice) || 0
    const _totalAcquisitionCost = Number(totalAcquisitionCost) || 0
    const _loanAmount = Number(loanAmount) || 0

    // ── v2.0 엔진 입력 구성 ──
    const calcInput: CalcInput = {
      vehicle: {
        brand: selectedCar.brand || '',
        model: selectedCar.model || '',
        trim: selectedCar.trim,
        fuel: selectedCar.fuel || selectedCar.fuel_type || '',
        year: selectedCar.year,
        engine_cc: Number(selectedCar.engine_cc) || engineCC || 0,
        factory_price: _factoryPrice,
        purchase_price: _purchasePrice,
        mileage: selectedCar.mileage || 0,
        purchase_mileage: selectedCar.purchase_mileage,
        is_commercial: selectedCar.is_commercial !== false,
      },
      contract: {
        term_months: termMonths,
        car_age_mode: carAgeMode,
        custom_car_age: customCarAge,
        contract_type: contractType,
        residual_rate: residualRate,
        buyout_premium: buyoutPremium,
        annual_mileage: annualMileage,
        baseline_km: baselineKm,
      },
      depreciation: {
        curve_preset: depCurvePreset,
        custom_curve: depCustomCurve,
        class_override: depClassOverride,
        origin_override: dbOriginOverride,
        vehicle_class_override: dbVehicleClassOverride,
        fuel_type_override: dbFuelTypeOverride,
        popularity_grade: popularityGrade,
      },
      finance: {
        loan_amount: _loanAmount,
        loan_rate: loanRate,
        investment_rate: investmentRate,
      },
      insurance: {
        auto_mode: insAutoMode,
        monthly_cost: monthlyInsuranceCost,
        driver_age: driverAgeGroup,
        deductible: deductible,
        own_damage_ratio: ownDamageCoverageRatio,
      },
      maintenance: {
        package: maintPackage,
        oil_change_freq: oilChangeFreq,
        monthly_cost: monthlyMaintenance,
      },
      tax: {
        annual_tax: annualTax,
        engine_cc: engineCC,
        registration_region: registrationRegion,
      },
      risk: {
        rate: riskRate,
      },
      overhead: {
        overhead_rate: rules.OVERHEAD_RATE || 0,
        margin: margin,
        insurance_loading: rules.INSURANCE_LOADING || 0,
      },
      deposit_prepay: {
        deposit,
        prepayment,
        deposit_discount_rate: depositDiscountRate,
        prepayment_discount_rate: prepaymentDiscountRate,
      },
      acquisition: {
        total_cost: _totalAcquisitionCost,
        acquisition_tax: acquisitionTax,
        bond_cost: bondCost,
        delivery_fee: deliveryFee,
        misc_fee: miscFee,
      },
      reference: {
        dep_rates: depRates,
        dep_adjustments: depAdjustments,
        dep_db: depreciationDB,
        tax_rates: taxRates,
        reg_costs: regCosts,
        inspection_costs: inspectionCosts,
        inspection_schedules: inspectionSchedules,
        ins_base_premiums: insBasePremiums,
        ins_own_rates: insOwnRates,
        insurance_rates: insuranceRates,
        finance_rates: financeRates,
        maintenance_costs: maintenanceCosts,
        terms_config: termsConfig ? { calc_params: termsConfig.calc_params } : undefined,
      },
      rules,
    }

    // ── v2.0 엔진 실행 ──
    const result = calculateRentCost(calcInput)
    const da = result.depreciation_analysis
    const bd = result.breakdown

    // ── 호환 레이어: 기존 UI가 참조하는 모든 프로퍼티를 엔진 결과에서 매핑 ──
    const thisYear = new Date().getFullYear()
    const carAge = da.car_age
    const mileage10k = (selectedCar.mileage || 0) / 10000
    const isUsedCar = carAgeMode === 'used' && carAge > 0
    const termYears = termMonths / 12

    // ── v2.0 엔진 결과 → 기존 UI 호환 매핑 ──
    // 감가 분석
    const autoAxes = da.axes
    const effectiveAxes = da.effective_axes
    const matchedDepRate = da.matched_db_rate
    const activeCurve = da.active_curve
    const classMult = da.class_multiplier
    const adjustmentFactor = da.adjustment_factor
    const mileageFactor = 1.0
    const marketFactor = adjustmentFactor // (simplified — engine handles internally)
    const popularityFactor = 1.0 // (included in adjustmentFactor)
    const depClass = da.effective_axes?.label || ''
    const currentMarketValue = da.current_market_value
    const endMarketValue = da.end_market_value
    const effectiveEndMarketValue = da.effective_end_market_value
    const residualValue = da.residual_value
    const buyoutPrice = da.buyout_price
    const costBase = da.cost_base

    // 감가율
    const yearDep = da.year_dep_now
    const mileageDep = da.mileage_dep_now
    const totalDepRate = da.total_dep_rate_now
    const yearDepEnd = da.year_dep_end
    const mileageDepEnd = da.mileage_dep_end
    const totalDepRateEnd = da.total_dep_rate_end
    const excessMileageNow = mileage10k - (carAge * baselineKm)
    const avgMileageNow = carAge * baselineKm
    const projectedMileage10k = mileage10k + (termYears * annualMileage)
    const avgMileageEnd = (carAge + termYears) * baselineKm
    const excessMileageEnd = projectedMileage10k - avgMileageEnd

    // 중고차 분석
    const purchaseMileage10k = isUsedCar ? (selectedCar.purchase_mileage || 0) / 10000 : 0
    const purchaseAvgMileage = carAge * baselineKm
    const purchaseExcessMileage = purchaseMileage10k - purchaseAvgMileage
    const purchaseMileageDep = 0 // engine handles
    const purchaseYearDep = da.year_dep_now
    const purchaseTotalDep = da.total_dep_rate_now
    const theoreticalMarketValue = currentMarketValue
    const purchasePremiumPct = theoreticalMarketValue > 0 ? ((_purchasePrice - theoreticalMarketValue) / theoreticalMarketValue * 100) : 0
    const customerDriven10k = termYears * annualMileage
    const standardAddition10k = termYears * baselineKm
    const customerExcessMileage = isUsedCar ? (customerDriven10k - standardAddition10k) : excessMileageEnd
    const customerMileageDep = 0
    const customerYearDep = yearDepEnd - da.year_dep_now
    const customerTotalDepChange = isUsedCar ? customerYearDep : 0
    const usedCarEndTotalDep = da.total_dep_rate_end
    const usedCarEndMarketValue = effectiveEndMarketValue
    const carActualEndMarketValue = endMarketValue

    // 월별 원가 (엔진 결과에서)
    const monthlyDepreciation = bd.depreciation.monthly
    const monthlyLoanInterest = bd.finance.loan_interest
    const monthlyOpportunityCost = bd.finance.opportunity_cost
    const totalMonthlyFinance = bd.finance.monthly
    const effectiveLoan = Math.min(_loanAmount, _purchasePrice)
    const equityAmount = costBase - effectiveLoan
    const avgLoanBalance = bd.finance.avg_loan_balance
    const loanEndBalance = 0
    const avgEquityBalance = bd.finance.avg_equity_balance
    const equityEndBalance = 0
    const monthlyTax = bd.tax_inspection.monthly_tax
    const monthlyInspectionCost = bd.tax_inspection.monthly_inspection
    const inspectionCostPerTime = 65000 // (shown in detail UI)
    const inspectionsInTerm = bd.tax_inspection.inspections_in_term
    const inspIntervalMonths = 12
    const totalMonthlyOperation = bd.insurance.monthly + bd.maintenance.monthly + bd.tax_inspection.monthly
    const monthlyRiskReserve = bd.risk.monthly
    const monthlyDepositDiscount = bd.discount.deposit_discount
    const monthlyPrepaymentDiscount = bd.discount.prepayment_discount
    const totalDiscount = monthlyDepositDiscount + monthlyPrepaymentDiscount

    // 합계
    const totalMonthlyCost = result.total_monthly_cost
    const suggestedRent = result.suggested_rent
    const rentWithVAT = result.rent_with_vat

    // (주행감가 계산은 v2.0 엔진에서 처리)

    // (기존 감가/중고차 계산은 v2.0 엔진에서 처리, 위 매핑 참조)
    // (금융비용 계산은 v2.0 엔진에서 처리)

    // (운영비용·검사·리스크·할인·합계 계산은 v2.0 엔진에서 처리)

    // 시장 비교
    const validComps = marketComps.filter(c => c.monthly_rent > 0)
    const marketAvg = validComps.length > 0
      ? Math.round(validComps.reduce((sum, c) => sum + c.monthly_rent, 0) / validComps.length)
      : 0
    const marketDiff = marketAvg > 0 ? ((rentWithVAT - marketAvg) / marketAvg * 100) : 0
    const purchaseDiscount = _factoryPrice > 0 ? ((_factoryPrice - _purchasePrice) / _factoryPrice * 100) : 0

    // 원가 비중 (기존 UI 호환)
    const costBreakdown = {
      depreciation: monthlyDepreciation,
      finance: totalMonthlyFinance,
      operation: totalMonthlyOperation,
      risk: monthlyRiskReserve,
      discount: -totalDiscount,
      overhead: bd.overhead.monthly,       // 🆕 간접비 추가
      insurance: bd.insurance.monthly,     // 🆕 보험 별도 표시
      maintenance: bd.maintenance.monthly, // 🆕 정비 별도 표시
    }

    // IRR (엔진에서 계산)
    const irrResult = result.irr_result

    // 🆕 v2.0 엔진 전체 결과 (감사추적용)
    const engineResult = result

    return {
      carAge, mileage10k, termYears, isUsedCar,
      yearDep, mileageDep, totalDepRate,
      excessMileageNow, avgMileageNow, currentMarketValue,
      yearDepEnd, mileageDepEnd, totalDepRateEnd,
      excessMileageEnd, avgMileageEnd,
      endMarketValue, projectedMileage10k, effectiveEndMarketValue,
      monthlyDepreciation,
      purchaseMileage10k, purchaseAvgMileage, purchaseExcessMileage,
      purchaseMileageDep, purchaseYearDep, purchaseTotalDep,
      theoreticalMarketValue, purchasePremiumPct,
      customerDriven10k, standardAddition10k,
      customerExcessMileage, customerMileageDep, customerYearDep, customerTotalDepChange,
      usedCarEndTotalDep, usedCarEndMarketValue, carActualEndMarketValue,
      residualValue, buyoutPrice, costBase,
      depClass, classMult,
      matchedDepRate, autoAxes, effectiveAxes, activeCurve,
      adjustmentFactor, mileageFactor, marketFactor, popularityFactor,
      effectiveLoan, equityAmount, monthlyLoanInterest, monthlyOpportunityCost, totalMonthlyFinance,
      avgLoanBalance, loanEndBalance, avgEquityBalance, equityEndBalance,
      monthlyTax, monthlyInspectionCost, inspectionCostPerTime, inspectionsInTerm, inspIntervalMonths, totalMonthlyOperation,
      monthlyRiskReserve,
      monthlyDepositDiscount, monthlyPrepaymentDiscount, totalDiscount,
      totalMonthlyCost, suggestedRent, rentWithVAT,
      marketAvg, marketDiff, purchaseDiscount,
      costBreakdown,
      irrResult,
      // 🆕 v2.0 추가
      engineResult,
    }
  }, [
    selectedCar, factoryPrice, purchasePrice, carAgeMode, customCarAge, depCurvePreset, depCustomCurve, depClassOverride, depYear1Rate, depYear2Rate, annualMileage, baselineKm,
    contractType, residualRate, buyoutPremium, depRates, depAdjustments, popularityGrade, dbOriginOverride, dbVehicleClassOverride, dbFuelTypeOverride,
    loanAmount, loanRate, investmentRate,
    monthlyInsuranceCost, monthlyMaintenance, annualTax, insAutoMode, driverAgeGroup, ownDamageCoverageRatio,
    riskRate, deposit, prepayment, depositDiscountRate, prepaymentDiscountRate,
    termMonths, margin, marketComps, deductible, totalAcquisitionCost,
    inspectionCosts, inspectionSchedules, registrationRegion, engineCC,
    maintPackage, oilChangeFreq, rules,
    depreciationDB, taxRates, regCosts, insBasePremiums, insOwnRates, insuranceRates, financeRates, maintenanceCosts, termsConfig,
    acquisitionTax, bondCost, deliveryFee, miscFee,
  ])

  // 시장비교 추가
  const addMarketComp = async () => {
    if (!newComp.competitor_name || !newComp.monthly_rent) return
    if (!selectedCar || !effectiveCompanyId) return

    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/market-comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          car_id: selectedCar.id,
          ...newComp
        })
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setMarketComps(prev => [...prev, json.data])
        setNewComp({ competitor_name: '', vehicle_info: '', monthly_rent: 0, deposit: 0, term_months: 36, source: '' })
      }
    } catch (e) {
      console.error('시장비교 추가 실패:', e)
    }
  }

  const removeMarketComp = async (id: string) => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/market-comparisons/${id}`, {
        method: 'DELETE',
        headers
      })
      if (res.ok) {
        setMarketComps(prev => prev.filter(c => c.id !== id))
      }
    } catch (e) {
      console.error('시장비교 삭제 실패:', e)
    }
  }

  // 워크시트 저장 (등록차량 + 신차 모두 지원)
  const handleSaveWorksheet = async () => {
    if (!selectedCar) { alert('차량을 먼저 선택해주세요.'); return }
    if (!effectiveCompanyId) { alert('회사 정보를 불러올 수 없습니다. 다시 로그인해주세요.'); return }
    if (!calculations) { alert('산출 결과가 없습니다. 차량을 먼저 분석해주세요.'); return }
    setSaving(true)

    const baseData = {
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
      driver_age_group: driverAgeGroup,
      ins_auto_mode: insAutoMode,
      monthly_maintenance: monthlyMaintenance,
      maint_package: maintPackage,
      oil_change_freq: oilChangeFreq,
      car_age_mode: carAgeMode,
      custom_car_age: customCarAge,
      dep_curve_preset: depCurvePreset,
      dep_custom_curve: depCustomCurve,
      dep_class_override: depClassOverride,
      contract_type: contractType,
      residual_rate: residualRate,
      buyout_premium: buyoutPremium,
      monthly_tax: calculations.monthlyTax,
      deductible: deductible,
      monthly_risk_reserve: calculations.monthlyRiskReserve,
      deposit_amount: deposit,
      prepayment_amount: prepayment,
      deposit_discount_rate: depositDiscountRate,
      prepayment_discount_rate: prepaymentDiscountRate,
      registration_region: registrationRegion,
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
      baseline_km: baselineKm,
      excess_mileage_rate: excessMileageRate,
      excess_rate_margin_pct: excessRateMarginPct,
      status: 'draft',
      updated_at: new Date().toISOString(),
    }

    let error: any = null
    let savedWorksheetId: string | null = null

    try {
      if (lookupMode === 'registered') {
        // 등록차량: car_id로 기존 워크시트 조회 후 insert/update
        const headers = await getAuthHeader()
        const existRes = await fetch(`/api/pricing-worksheets?car_id=${selectedCar.id}`, { headers })
        const existJson = await existRes.json().catch(() => ({}))
        // API가 이제 단일 객체(또는 null)를 반환. 과거 배열 응답도 방어적으로 처리.
        const raw = existJson?.data
        const existing = Array.isArray(raw) ? (raw[0] || null) : (raw || null)

        if (existing && existing.id) {
          const updateRes = await fetch(`/api/pricing-worksheets/${existing.id}`, {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...baseData, car_id: selectedCar.id })
          })
          if (!updateRes.ok) {
            const errJson = await updateRes.json()
            error = new Error(errJson.error || 'Update failed')
          }
          savedWorksheetId = existing.id
        } else {
          const insertRes = await fetch('/api/pricing-worksheets', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...baseData, car_id: selectedCar.id })
          })
          if (insertRes.ok) {
            const insertJson = await insertRes.json()
            const data = insertJson.data ?? insertJson ?? {}
            savedWorksheetId = data?.id || null
          } else {
            const errJson = await insertRes.json()
            error = new Error(errJson.error || 'Insert failed')
          }
        }
      } else {
        // 신차 분석: car_id 없이 insert + 차량정보 JSONB
        const headers = await getAuthHeader()
        const insertRes = await fetch('/api/pricing-worksheets', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
          })
        })
        if (insertRes.ok) {
          const insertJson = await insertRes.json()
          const data = insertJson.data ?? insertJson ?? {}
          savedWorksheetId = data?.id || null
        } else {
          const errJson = await insertRes.json()
          error = new Error(errJson.error || 'Insert failed')
        }
      }
    } catch (err: any) {
      error = err
    }

    if (error) alert('저장 실패: ' + (error.message || JSON.stringify(error)))
    else {
      alert(lookupMode === 'registered' ? '산출 워크시트가 저장되었습니다.' : '신차 분석이 저장되었습니다.')
      if (savedWorksheetId) setCurrentWorksheetId(savedWorksheetId)
    }
    setSaving(false)
  }

  // 견적서로 전환 — 워크시트 저장 후 위저드 Step 2로 이동
  const handleGoToCustomerStep = async () => {
    if (!calculations || !selectedCar) return

    // 워크시트가 아직 저장 안 된 경우 먼저 저장
    if (!currentWorksheetId) {
      setSaving(true)
      await handleSaveWorksheet()
      setSaving(false)
    }

    setWizardStep('customer')
  }

  // ============================================
  // 견적서 저장 (Step 3에서 호출)
  // ============================================
  const handleSaveQuote = async (status: 'draft' | 'active') => {
    if (!calculations || !selectedCar) return
    if (customerMode === 'select' && !selectedCustomerId) return alert('고객을 선택해주세요.')
    if (customerMode === 'manual' && !manualCustomer.name.trim()) return alert('고객명을 입력해주세요.')
    setQuoteSaving(true)

    const calc = calculations
    const car = selectedCar
    const resolvedExcessRate = excessMileageRate || termsExcessInfo.rate

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const selectedCustomer = customerMode === 'select'
      ? customers.find((c: any) => String(c.id) === String(selectedCustomerId))
      : manualCustomer.name ? { ...manualCustomer, id: '', type: '직접입력' } : undefined

    // 견적서 종료일
    const endDateObj = new Date(startDate)
    endDateObj.setMonth(endDateObj.getMonth() + termMonths)
    const endDate = endDateObj.toISOString().split('T')[0]

    // 확장 데이터 (quote_detail JSONB)
    const detailData = {
      manual_customer: customerMode === 'manual' ? manualCustomer : null,
      contract_type: contractType,
      residual_rate: residualRate,
      residual_value: calc.residualValue,
      buyout_price: calc.buyoutPrice,
      factory_price: factoryPrice,
      purchase_price: purchasePrice,
      total_acquisition_cost: totalAcquisitionCost,
      car_info: {
        brand: car.brand, model: car.model, trim: car.trim || '',
        year: car.year, fuel: car.fuel || '', engine_cc: car.engine_cc || engineCC,
        mileage: car.mileage || 0,
      },
      cost_breakdown: {
        depreciation: calc.monthlyDepreciation,
        finance: calc.totalMonthlyFinance,
        loan_interest: calc.monthlyLoanInterest,
        opportunity_cost: calc.monthlyOpportunityCost,
        avg_loan_balance: calc.avgLoanBalance,
        avg_equity_balance: calc.avgEquityBalance,
        insurance: monthlyInsuranceCost,
        maintenance: monthlyMaintenance,
        tax: calc.monthlyTax,
        risk: calc.monthlyRiskReserve,
        deposit_discount: calc.monthlyDepositDiscount,
        prepayment_discount: calc.monthlyPrepaymentDiscount,
        discount: calc.totalDiscount,
      },
      loan_amount: loanAmount, loan_rate: loanRate, investment_rate: investmentRate,
      term_months: termMonths, annualMileage, baselineKm,
      deposit, prepayment, deductible, margin, own_damage_coverage_ratio: ownDamageCoverageRatio,
      driver_age_group: driverAgeGroup,
      ins_estimate: insEstimate ? {
        vehicleClass: insEstimate.vehicleClass, basePremium: insEstimate.basePremium,
        ownDamagePremium: insEstimate.ownDamagePremium, totalAnnual: insEstimate.totalAnnual,
      } : null,
      maint_package: maintPackage,
      excess_mileage_rate: resolvedExcessRate,
      excess_mileage_source: excessMileageRate > 0 ? 'manual' : termsExcessInfo.source,
      excess_mileage_terms_key: termsExcessInfo.key || null,
      early_termination_rate: termsConfig?.calc_params?.early_termination_rate || 35,
      early_termination_rates_by_period: termsConfig?.calc_params?.early_termination_rates_by_period || null,
      insurance_coverage: termsConfig?.insurance_coverage || null,
      quote_notices: termsConfig?.quote_notices || null,
      insurance_note: termsConfig?.calc_params?.insurance_note || null,
      terms_id: termsConfig?.id || null,
      dep_curve_preset: depCurvePreset,
      current_market_value: calc.currentMarketValue,
      end_market_value: calc.endMarketValue,
      year_dep: calc.yearDep, year_dep_end: calc.yearDepEnd,
      total_dep_rate: calc.totalDepRate, total_dep_rate_end: calc.totalDepRateEnd,
      cost_base: calc.costBase, purchase_discount: calc.purchaseDiscount,
      note: quoteNote || null,
      worksheet_id: currentWorksheetId || null,
    }

    try {
      // ID 값 정리 유틸 — UUID/숫자형 상관없이 원본값 그대로 전달, 빈값만 null
      const cleanId = (val: any): any => {
        if (val === null || val === undefined || val === '' || val === 0) return null
        const num = Number(val)
        return isNaN(num) ? val : num  // DB bigint 컬럼 호환
      }
      const rawCarId = (car.id && !String(car.id).startsWith('newcar-')) ? car.id : null
      const rawCustomerId = customerMode === 'select' ? selectedCustomerId : null

      const basePayload: Record<string, any> = {
        car_id: cleanId(rawCarId),
        customer_id: cleanId(rawCustomerId),
        start_date: startDate,
        end_date: endDate,
        deposit,
        rent_fee: calc.suggestedRent,
        status,
      }
      const extendedCols: Record<string, any> = {
        customer_name: customerMode === 'select' ? (selectedCustomer?.name || '') : manualCustomer.name.trim(),
        rental_type: contractType === 'buyout' ? '인수형렌트' : '반납형렌트',
        margin,
        memo: quoteNote || null,
        quote_detail: detailData,
        expires_at: expiresAt.toISOString(),
        worksheet_id: cleanId(currentWorksheetId),
      }

      console.log('Quote save payload:', { car_id: basePayload.car_id, customer_id: basePayload.customer_id })

      // 저장 시도 순서:
      // 1) 풀 페이로드 → 2) _id 컬럼 제거 → 3) 최소 페이로드
      // UUID/BIGINT 타입 불일치 시 _id 컬럼을 제거해서 재시도
      const fullPayload = { ...basePayload, ...extendedCols }
      const noFkPayload = { ...fullPayload }
      delete noFkPayload.car_id
      delete noFkPayload.customer_id
      delete noFkPayload.worksheet_id
      const minPayload = {
        start_date: startDate,
        end_date: endDate,
        deposit,
        rent_fee: calc.suggestedRent,
        status,
        quote_detail: detailData,
        customer_name: extendedCols.customer_name,
      }

      const payloadsToTry = [fullPayload, noFkPayload, minPayload]

      let error: any = null
      let insertData: any = null
      const errors: string[] = []

      const headers = await getAuthHeader()
      for (let i = 0; i < payloadsToTry.length; i++) {
        const payload = payloadsToTry[i]
        try {
          let res: Response
          if (editingQuoteId) {
            res = await fetch(`/api/quotes/${editingQuoteId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...headers },
              body: JSON.stringify(payload)
            })
          } else {
            res = await fetch('/api/quotes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...headers },
              body: JSON.stringify(payload)
            })
          }
          if (res.ok) {
            const json = await res.json()
            insertData = json.data
            error = null
            break
          } else {
            const json = await res.json()
            error = json.error
            const msg = error?.message || JSON.stringify(error)
            errors.push(`시도${i + 1}(${Object.keys(payload).length}cols): ${msg}`)
            console.warn(`Quote save attempt ${i + 1} failed:`, msg)
          }
        } catch (e: any) {
          error = e
          errors.push(`시도${i + 1}: ${e.message}`)
          console.warn(`Quote save attempt ${i + 1} failed:`, e)
        }
      }

      setQuoteSaving(false)
      if (error) {
        console.error('Quote save failed:', errors)
        alert('저장 실패:\n' + errors.join('\n'))
      } else {
        const savedId = editingQuoteId || (Array.isArray(insertData) ? insertData?.[0]?.id : insertData?.id)
        alert(`견적서가 ${status === 'draft' ? '임시저장' : '확정'}되었습니다.`)
        if (savedId) {
          router.push(`/quotes/${savedId}`)
        } else {
          router.push('/quotes')
        }
      }
    } catch (err: any) {
      setQuoteSaving(false)
      console.error('Unexpected error:', err)
      alert('저장 중 오류 발생: ' + (err?.message || String(err)))
    }
  }

  // ============================================
  // 렌더링 — 모듈 분리 v2.0
  // ============================================

  // PricingContext에 전달할 상태 객체 (모든 하위 컴포넌트가 접근)
  const pricingCtx = {
    // 위저드
    wizardStep, setWizardStep,
    advancedMode, setAdvancedMode,
    // 견적 수정
    editingQuoteId, quoteCompany,
    effectiveCompanyId,
    // 고객
    customers, selectedCustomerId, setSelectedCustomerId,
    customerMode, setCustomerMode,
    manualCustomer, setManualCustomer,
    startDate, setStartDate,
    quoteNote, setQuoteNote,
    quoteSaving,
    // 데이터
    cars, loading, editLoading,
    selectedCar, setSelectedCar,
    rules,
    calculations,
    saving, setSaving,
    currentWorksheetId, setCurrentWorksheetId,
    // 가격
    factoryPrice, setFactoryPrice,
    purchasePrice, setPurchasePrice,
    // 감가
    carAgeMode, setCarAgeMode,
    customCarAge, setCustomCarAge,
    depCurvePreset, setDepCurvePreset,
    depCustomCurve, setDepCustomCurve,
    depClassOverride, setDepClassOverride,
    depYear1Rate, setDepYear1Rate,
    depYear2Rate, setDepYear2Rate,
    annualMileage, setAnnualMileage,
    baselineKm, setBaselineKm,
    excessMileageRate, setExcessMileageRate,
    excessRateMarginPct, setExcessRateMarginPct,
    excessRateBreakdown,
    // 금융
    loanAmount, setLoanAmount,
    loanRate, setLoanRate,
    investmentRate, setInvestmentRate,
    // 운영
    maintPackage, setMaintPackage,
    oilChangeFreq, setOilChangeFreq,
    monthlyMaintenance, setMonthlyMaintenance,
    monthlyInsuranceCost, setMonthlyInsuranceCost,
    driverAgeGroup, setDriverAgeGroup,
    insEstimate, insAutoMode, setInsAutoMode,
    ownDamageCoverageRatio, setOwnDamageCoverageRatio,
    annualTax, setAnnualTax,
    engineCC, setEngineCC,
    // 리스크
    deductible, setDeductible,
    riskRate, setRiskRate,
    // 보증금/선납금
    deposit, setDeposit,
    prepayment, setPrepayment,
    depositDiscountRate, setDepositDiscountRate,
    prepaymentDiscountRate, setPrepaymentDiscountRate,
    // 계약
    contractType, setContractType,
    residualRate, setResidualRate,
    buyoutPremium, setBuyoutPremium,
    termMonths, setTermMonths,
    margin, setMargin,
    // 시장비교
    marketComps, setMarketComps,
    newComp, setNewComp,
    addMarketComp, removeMarketComp,
    // 취득원가
    totalAcquisitionCost, setTotalAcquisitionCost,
    acquisitionTax, setAcquisitionTax,
    bondCost, setBondCost,
    deliveryFee, setDeliveryFee,
    miscFee, setMiscFee,
    registrationRegion, setRegistrationRegion,
    carCostItems,
    // 기준표
    depRates, depAdjustments, depreciationDB,
    insuranceRates, maintenanceCosts, taxRates, financeRates, regCosts,
    inspectionCosts, inspectionSchedules, insBasePremiums, insOwnRates,
    popularityGrade, setPopularityGrade,
    dbOriginOverride, setDbOriginOverride,
    dbVehicleClassOverride, setDbVehicleClassOverride,
    dbFuelTypeOverride, setDbFuelTypeOverride,
    // 자동매핑
    autoCategory, autoInsType, autoMaintType,
    // Option H
    hBaseline, setHBaseline,
    lockedParams, toggleLock,
    savedPricesOpen, setSavedPricesOpen,
    // 신차
    lookupMode, setLookupMode,
    activeTab, setActiveTab,
    newCarBrand, setNewCarBrand,
    newCarModel, setNewCarModel,
    newCarResult, setNewCarResult,
    newCarSelectedTax, setNewCarSelectedTax,
    newCarSelectedFuel, setNewCarSelectedFuel,
    newCarSelectedVariant, setNewCarSelectedVariant,
    newCarSelectedTrim, setNewCarSelectedTrim,
    newCarSelectedOptions, setNewCarSelectedOptions,
    newCarSelectedExterior, setNewCarSelectedExterior,
    newCarSelectedInterior, setNewCarSelectedInterior,
    newCarPurchasePrice, setNewCarPurchasePrice,
    isLookingUp, lookupStage, lookupError, lookupElapsed,
    handleNewCarLookup,
    isParsingQuote, parseStage, parseElapsed,
    savedCarPrices, savedWorksheets,
    isSavingPrice,
    carSearchQuery, setCarSearchQuery,
    isDragging, setIsDragging,
    catalogSearch, setCatalogSearch,
    catalogFilter, setCatalogFilter,
    catalogSort, setCatalogSort,
    showAddPanel, setShowAddPanel,
    checkedRows, setCheckedRows,
    dropFileRef,
    // 핸들러
    handleCarSelect,
    handleNewCarAnalysis,
    handleSaveNewCarPrice: handleSaveCarPrice,
    handleLoadSavedPrice,
    handleDeleteSavedPrice,
    handleDeleteSavedWorksheet: handleDeleteWorksheet,
    handleBulkDeletePrices: handleBulkDelete,
    handleQuoteImageUpload: handleQuoteUpload,
    onDropFile,
    handleSaveWorksheet,
    handleSaveQuote,
    handleConvertToQuote: handleGoToCustomerStep,
    applyReferenceTableMappings,
    // 기타
    termsExcessInfo, termsConfig,
    linkedInsurance, linkedFinance,
    printRef,
  }

  if (loading || editLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-steel-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-bold">데이터 불러오는 중...</p>
        </div>
      </div>
    )
  }

  // Customer / Preview 스텝은 early return
  if (wizardStep === 'customer') {
    return (
      <PricingProvider value={pricingCtx}>
        <CustomerStep />
      </PricingProvider>
    )
  }

  if (wizardStep === 'preview' && calculations && selectedCar) {
    return (
      <PricingProvider value={pricingCtx}>
        <PreviewStep />
      </PricingProvider>
    )
  }

  // 메인 레이아웃 (차량선택 / 옵션 / 분석)
  return (
    <PricingProvider value={pricingCtx}>
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">

        {/* ===== 스텝 인디케이터 + 헤더 ===== */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, background: 'rgba(255,255,255,0.72)', padding: '16px 24px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', marginBottom: 16, boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
            {[
              { key: 'vehicle' as const,  label: '차량선택', desc: '브랜드 · 모델 · 트림', num: 1, done: !!(selectedCar || newCarSelectedTrim) },
              { key: 'options' as const,   label: '차량옵션', desc: '색상 · 패키지',        num: 2, done: !!(selectedCar) },
              { key: 'analysis' as const,  label: '상세견적', desc: '계약조건 · 렌트가',    num: 3, done: !!(selectedCar && calculations && (wizardStep === 'customer' || wizardStep === 'preview')) },
              { key: 'customer' as const,  label: '고객정보', desc: '임차인 · 계약기간',    num: 4, done: false },
              { key: 'preview' as const,   label: '견적서',   desc: '미리보기 · 발송',      num: 5, done: false },
            ].map((s, i) => {
              const active = s.key === wizardStep
              const clickable =
                (s.key === 'vehicle') ||
                (s.key === 'options' && !!(selectedCar || newCarSelectedTrim)) ||
                (s.key === 'analysis' && !!selectedCar) ||
                (s.key === 'customer' && !!(selectedCar && calculations)) ||
                (s.key === 'preview' && !!(selectedCar && calculations))
              return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  onClick={() => { if (clickable) setWizardStep(s.key) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: clickable ? 'pointer' : 'default',
                    padding: '8px 16px', borderRadius: 10,
                    background: active ? 'rgba(59,130,246,0.9)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 13,
                    background: active ? '#fff' : s.done ? '#dcfce7' : 'rgba(0,0,0,0.04)',
                    color: active ? 'rgba(59,130,246,0.9)' : s.done ? '#16a34a' : '#9ca3af',
                  }}>
                    {s.done && !active ? '✓' : s.num}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: active ? '#fff' : '#111827' }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>{s.desc}</div>
                  </div>
                </div>
                {i < 4 && <div style={{ width: 24, height: 2, background: s.done ? '#16a34a' : 'rgba(0,0,0,0.06)', margin: '0 2px', transition: 'background 0.15s' }} />}
              </div>
            )})}
          </div>
          {/* 헤더 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: 0, letterSpacing: -0.5 }}>장기렌터카 견적</h1>
              <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>렌트가 산출 및 견적서 생성</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/quotes" style={{ padding: '8px 16px', fontSize: 13, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, fontWeight: 700, color: '#6b7280', background: '#fff', textDecoration: 'none', display: 'inline-block' }}>
                목록으로
              </Link>
              {selectedCar && calculations && (
                <button onClick={handleSaveWorksheet} disabled={saving}
                  style={{ padding: '8px 16px', fontSize: 13, background: '#3b6eb5', color: '#fff', borderRadius: 10, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                  {saving ? '저장 중...' : '워크시트 저장'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 차량선택 + 옵션 스텝 */}
        {(wizardStep === 'vehicle' || wizardStep === 'options') && <VehicleStep />}

        {/* 상세견적 스텝 */}
        {wizardStep === 'analysis' && <AnalysisStep />}

      </div>
    </PricingProvider>
  )
}

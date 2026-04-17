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


import { CostBar, Section, InputRow, ResultRow } from './components'
import OptionHPanel, { type PresetMode as OptionHPresetMode } from './OptionHPanel'
import OptionHTable, { type HTableRow } from './OptionHTable'

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
        // 영업용 내연기관 fallback: 18원/cc, 교육세 비과세
        tax = cc * 18
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
    const isLightCar = (carInfo.displacement && carInfo.displacement < 1000)
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
    setLoanAmount(Math.round(Number(car.purchase_price) * 0.7))
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
    setLoanAmount(Math.round(purchasePrice * 0.7))
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
  // 자동 계산 로직
  // ============================================
  const calculations = useMemo(() => {
    if (!selectedCar) return null

    // ★ 안전장치: 외부에서 문자열이 유입될 수 있으므로 핵심 가격변수를 숫자로 강제 변환
    const _factoryPrice = Number(factoryPrice) || 0
    const _purchasePrice = Number(purchasePrice) || 0
    const _totalAcquisitionCost = Number(totalAcquisitionCost) || 0
    const _loanAmount = Number(loanAmount) || 0



    const thisYear = new Date().getFullYear()
    // 차령: 신차 모드면 0, 연식차량 모드면 사용자 설정값 또는 연식 기반 자동 계산
    const carAge = carAgeMode === 'new'
      ? 0
      : customCarAge > 0
        ? customCarAge
        : Math.max(0, thisYear - (selectedCar.year || thisYear))
    const mileage10k = (selectedCar.mileage || 0) / 10000

    // 1. 시세하락 / 감가 (비선형 곡선 모델)
    // ── 3축 매핑 + DB 기반 감가 곡선
    const autoAxes = selectedCar
      ? mapToDepAxes(selectedCar.brand, selectedCar.model, selectedCar.fuel, _factoryPrice)
      : null
    // 수동 오버라이드 적용: 사용자가 선택한 축이 있으면 그것으로 대체
    const effectiveAxes = autoAxes ? {
      origin: (dbOriginOverride || autoAxes.origin) as DepAxes['origin'],
      vehicle_class: (dbVehicleClassOverride || autoAxes.vehicle_class) as DepAxes['vehicle_class'],
      fuel_type: (dbFuelTypeOverride || autoAxes.fuel_type) as DepAxes['fuel_type'],
      label: `${dbOriginOverride || autoAxes.origin} ${(dbVehicleClassOverride || autoAxes.vehicle_class).replace(/_/g, ' ')} ${(dbFuelTypeOverride || autoAxes.fuel_type) !== '내연기관' ? (dbFuelTypeOverride || autoAxes.fuel_type) : ''}`.trim(),
    } : null
    const autoDepClass = effectiveAxes?.label || ''
    const depClass = depClassOverride || autoDepClass

    // DB 기반 곡선: depreciation_rates 테이블에서 3축 매칭 (오버라이드 반영)
    const matchedDepRate = effectiveAxes
      ? depRates.find(d => d.origin === effectiveAxes.origin && d.vehicle_class === effectiveAxes.vehicle_class && d.fuel_type === effectiveAxes.fuel_type)
      : null
    const dbCurve = matchedDepRate ? buildCurveFromDbRates(matchedDepRate) : null

    // ── 감가 곡선 결정
    const activeCurve = depCurvePreset === 'custom'
      ? depCustomCurve
      : depCurvePreset === 'db_based'
        ? (dbCurve || DEP_CURVE_PRESETS.standard.curve)
        : DEP_CURVE_PRESETS[depCurvePreset as keyof typeof DEP_CURVE_PRESETS]?.curve || DEP_CURVE_PRESETS.standard.curve

    // ── 클래스 보정 승수 결정
    // DB 기반(db_based): rate가 이미 3축(origin×vehicle_class×fuel_type)별로 분리되어 있으므로
    //   추가 보정 불필요 → 1.0 (전기차/하이브리드 포함)
    // 프리셋 기반: DEP_CLASS_MULTIPLIER에서 키 매칭, 없으면 1.0 fallback
    const classMult = depCurvePreset === 'db_based'
      ? 1.0
      : (DEP_CLASS_MULTIPLIER[depClass]?.mult ?? 1.0)

    // ── 보정계수 (depreciation_adjustments) 적용
    // 주행거리 약정 factor
    // ※ calcMileageDep에서 초과주행 감가를 직접 계산하므로,
    //   여기서 주행거리 factor까지 적용하면 이중 차감됨 → 1.0으로 비활성화
    //   (주행거리 영향은 calcMileageDep 한 곳에서만 처리)
    const mileageFactor = 1.0
    // 시장상황 factor (활성화된 것만)
    const marketFactor = (() => {
      const marketAdjs = depAdjustments.filter(a =>
        a.adjustment_type === 'market_condition' && a.is_active && Number(a.factor) !== 1.0
      )
      if (marketAdjs.length === 0) return 1.0
      return marketAdjs.reduce((acc, a) => acc * Number(a.factor), 1.0)
    })()
    // 인기도 factor
    const popularityFactor = (() => {
      const popAdjs = depAdjustments.filter(a => a.adjustment_type === 'popularity' && a.is_active)
      const match = popAdjs.find(a => a.label === popularityGrade)
      if (match) return Number(match.factor)
      // DB에 인기도 데이터 없으면 기본값 사용
      const defaultPop: Record<string, number> = { 'S등급 (인기)': 1.05, 'A등급 (준인기)': 1.02, 'B등급 (일반)': 1.0, 'C등급 (비인기)': 0.97, 'D등급 (저인기)': 0.93 }
      return defaultPop[popularityGrade] ?? 1.0
    })()
    // 종합 보정계수
    const adjustmentFactor = mileageFactor * marketFactor * popularityFactor

    // ── 중고차 여부 판별 & 구입시 주행거리
    const isUsedCar = carAgeMode === 'used' && carAge > 0
    const purchaseMileage10k = isUsedCar ? (selectedCar.purchase_mileage || 0) / 10000 : 0

    // ── 현재 시점 연식 감가율 (비선형 곡선 기반)
    // 잔가율표 곡선에는 이미 "평균 주행거리"가 반영되어 있음
    const yearDepNow = getDepRateFromCurve(activeCurve, carAge, classMult)

    // ── 주행감가: 0% 감가 기준(baselineKm) 대비 초과/미달분만 보정
    // baselineKm = 0% 감가 기준 (만km/년), annualMileage = 계약 약정 주행거리
    // 체감감소(디미니싱) 구간별 감가율: 초과분이 많을수록 만km당 감가율 둔화
    //   0~5만km 초과: 2%/만km, 5~10만km: 1.5%/만km, 10만km~: 1%/만km
    //   저주행(음수)은 동일 구간 역적용 (저주행 프리미엄 체감)
    const calcMileageDep = (excess10k: number): number => {
      if (excess10k === 0) return 0
      const sign = excess10k > 0 ? 1 : -1
      const abs = Math.abs(excess10k)
      let dep = 0
      if (abs <= 5) {
        dep = abs * 2.0
      } else if (abs <= 10) {
        dep = 5 * 2.0 + (abs - 5) * 1.5
      } else {
        dep = 5 * 2.0 + 5 * 1.5 + (abs - 10) * 1.0
      }
      return sign * dep
    }

    const avgMileageNow = carAge * baselineKm  // 0% 감가 기준 누적 주행거리
    const excessMileageNow = mileage10k - avgMileageNow  // 양수=초과, 음수=저주행
    const mileageDepNow = calcMileageDep(excessMileageNow)
    const totalDepRateNow = Math.max(0, Math.min(yearDepNow + mileageDepNow, 90))
    // 보정계수 적용: 현재 시장가에도 반영
    const adjustedNowResidualPct = carAge === 0 ? 1.0
      : Math.max(0, Math.min((1 - totalDepRateNow / 100) * adjustmentFactor, 1.0))
    const currentMarketValue = Math.round(_factoryPrice * adjustedNowResidualPct)

    // ── 계약 종료 시점 감가율
    const termYears = termMonths / 12
    const endAge = carAge + termYears
    const yearDepEnd = getDepRateFromCurve(activeCurve, endAge, classMult)

    // 약정 주행거리(annualMileage)로 종료 시점 예상 주행거리 산출
    const projectedMileage10k = mileage10k + (termYears * annualMileage)
    // 0% 감가 기준(baselineKm)으로 초과/미달 판정
    const avgMileageEnd = endAge * baselineKm
    const excessMileageEnd = projectedMileage10k - avgMileageEnd
    const mileageDepEnd = calcMileageDep(excessMileageEnd)
    const totalDepRateEnd = Math.max(0, Math.min(yearDepEnd + mileageDepEnd, 90))
    // 보정계수 적용: 잔존율에 factor 곱셈 (factor>1 → 잔존율↑ → 시장가↑)
    const adjustedEndResidualPct = Math.max(0, Math.min((1 - totalDepRateEnd / 100) * adjustmentFactor, 1.0))
    const endMarketValue = Math.round(_factoryPrice * adjustedEndResidualPct)

    // ── 중고차 감가 분리 계산 (회사 부담 / 고객 부담)
    // 구입 시점 주행감가 (회사 부담 = 구입가에 이미 반영)
    const purchaseAvgMileage = carAge * baselineKm                         // 구입차령 기준 표준주행 (만km)
    const purchaseExcessMileage = purchaseMileage10k - purchaseAvgMileage   // 구입시 초과/미달 (만km)
    const purchaseMileageDep = calcMileageDep(purchaseExcessMileage)     // 구입시 주행감가율 (%)
    const purchaseYearDep = yearDepNow                                      // 구입시 연식감가율 (%)
    const purchaseTotalDep = Math.max(0, Math.min(purchaseYearDep + purchaseMileageDep, 90))
    const theoreticalMarketValue = Math.round(_factoryPrice * Math.max(0, (1 - purchaseTotalDep / 100) * adjustmentFactor))
    const purchasePremiumPct = theoreticalMarketValue > 0
      ? ((_purchasePrice - theoreticalMarketValue) / theoreticalMarketValue * 100)
      : 0

    // ── 고객 귀책 주행감가: 순수하게 계약기간 동안 기준 대비 초과 주행분만
    // 구입시 주행상태(-4% 등)는 회사가 가져간 것이므로 고객과 무관
    // 예: 연3만 약정, 기준2만, 3년계약 → (3-2)×3 = 3만km 초과 → 6% 감가
    const customerDriven10k = termYears * annualMileage          // 고객 계약기간 총주행 (만km)
    const standardAddition10k = termYears * baselineKm           // 계약기간 기준주행 (만km)
    const customerExcessMileage = isUsedCar
      ? (customerDriven10k - standardAddition10k)                // 중고: 계약기간 초과분만
      : excessMileageEnd                                         // 신차: 전체 초과분 (기존 로직)
    const customerMileageDep = calcMileageDep(customerExcessMileage)
    // 고객 적용 연식감가 차이분 (구입차령 → 종료차령)
    const customerYearDep = yearDepEnd - purchaseYearDep
    // 고객 적용 총 감가율 변동분
    const customerTotalDepChange = isUsedCar
      ? (customerYearDep + customerMileageDep)
      : 0  // 신차는 기존 로직 그대로

    // ── 중고차 종료시 감가 (고객 비용 산출용)
    // 연식감가(전체, 신차부터) + 고객 귀책 주행감가만 (구입시 주행상태는 제외)
    const usedCarEndTotalDep = isUsedCar
      ? Math.max(0, Math.min(yearDepEnd + customerMileageDep, 90))
      : totalDepRateEnd
    const usedCarEndResidualPct = isUsedCar
      ? Math.max(0, Math.min((1 - usedCarEndTotalDep / 100) * adjustmentFactor, 1.0))
      : adjustedEndResidualPct
    const usedCarEndMarketValue = isUsedCar
      ? Math.round(_factoryPrice * usedCarEndResidualPct)
      : endMarketValue
    // 차량 실제 잔존가 (회사 처분용, 전체 주행감가 포함)
    const carActualEndMarketValue = endMarketValue

    // UI 표시용
    const yearDep = yearDepNow
    const mileageDep = mileageDepNow
    const totalDepRate = totalDepRateNow

    // 취득원가 기준 월 감가비
    // 등록 페이지 구입비용 상세(car_costs) 합계가 있으면 실투자금으로 사용
    // 없으면 매입가(purchasePrice)를 기준으로 사용
    const costBase = _totalAcquisitionCost > 0 ? _totalAcquisitionCost : _purchasePrice
    // 잔존가치 결정
    // 중고차: usedCarEndMarketValue 사용 (전체연식감가 + 고객귀책 주행감가만 반영)
    // 신차: endMarketValue 사용 (전체 감가 반영)
    const effectiveEndMarketValue = isUsedCar ? usedCarEndMarketValue : endMarketValue
    // 반납형: 잔존가치 = 종료 시점 시세 100% (차량 회수 후 처분)
    // 인수형: 잔존가치 = 종료 시점 시세 × residualRate% (고객 인수가격)
    const residualValue = contractType === 'return'
      ? effectiveEndMarketValue
      : Math.round(effectiveEndMarketValue * (residualRate / 100))
    const buyoutPrice = residualValue  // 인수형일 때만 의미 있음
    const monthlyDepreciation = Math.round(Math.max(0, costBase - residualValue) / termMonths)

    // 2. 금융비용 (평균잔액법) — 총취득원가 기준
    // 대출: 차량매입가 한도 내 (담보가치 기준, 부대비용은 대출 불가)
    // 자기자본: 총취득원가 - 대출금 (취득세·공채·탁송 등 부대비용 포함)
    const effectiveLoan = Math.min(_loanAmount, _purchasePrice) // 대출은 매입가 초과 불가
    const residualRatio = costBase > 0 ? Math.max(0, residualValue / costBase) : 0
    const loanEndBalance = Math.round(effectiveLoan * residualRatio)
    const avgLoanBalance = Math.round((effectiveLoan + loanEndBalance) / 2)

    const equityAmount = costBase - effectiveLoan // 총취득원가 - 대출 = 자기자본 (부대비용 포함)
    const equityEndBalance = Math.round(equityAmount * residualRatio)
    const avgEquityBalance = Math.round((equityAmount + equityEndBalance) / 2)

    const monthlyLoanInterest = Math.round(avgLoanBalance * (loanRate / 100) / 12)
    const monthlyOpportunityCost = Math.round(avgEquityBalance * (investmentRate / 100) / 12)
    const totalMonthlyFinance = monthlyLoanInterest + monthlyOpportunityCost

    // 3. 운영비용
    const monthlyTax = Math.round(annualTax / 12)
    // 자동차 정기검사비 — DB 기준표 연동 (유종별 차등 적용)
    // 유종 매핑 먼저 (차급 판정에서 전기차 분기에 필요)
    const inspFuelType = (() => {
      const rawFuel = (selectedCar?.fuel || selectedCar?.fuel_type || '').toLowerCase()
      // EV 모델명 기반 판별도 추가 (fuel 필드가 비어있는 경우 대비)
      const modelName = (selectedCar?.model || '').toUpperCase()
      const isEVByModel = EV_MODEL_KEYWORDS.some(k => modelName.includes(k.toUpperCase()))
      if (isEVByModel || ['전기', 'ev', 'electric', 'bev'].some(k => rawFuel.includes(k))) return '전기'
      if (['수소', 'hydrogen', 'fcev', 'fuel cell'].some(k => rawFuel.includes(k))) return '수소'
      if (['하이브리드', 'hybrid', 'hev', 'phev'].some(k => rawFuel.includes(k))) return '하이브리드'
      if (['디젤', 'diesel'].some(k => rawFuel.includes(k))) return '디젤'
      if (['lpg', 'lng', 'cng'].some(k => rawFuel.includes(k))) return 'LPG'
      return '가솔린' // 기본값
    })()
    // 차종 매핑: 배기량 기반, 전기차/수소차는 가격 기반
    const inspVehicleClass = (() => {
      const cc = selectedCar?.engine_cc || engineCC || 0
      // 전기차/수소차는 engine_cc가 없으므로 가격 기반 차급 판정
      if (cc === 0 || inspFuelType === '전기' || inspFuelType === '수소') {
        const price = _purchasePrice || _factoryPrice || 0
        if (price < 20000000) return '경형'
        if (price < 35000000) return '소형'
        if (price < 50000000) return '중형'
        return '대형'
      }
      if (cc <= 1000) return '경형'
      if (cc <= 1600) return '소형'
      if (cc <= 2000) return '중형'
      return '대형'
    })()
    // DB에서 검사비용 조회 (종합검사 + 유종 + 지역 매칭, 단계적 fallback)
    const inspCostRecord =
      // 1순위: 유종 + 지역 정확 매칭
      inspectionCosts.find(r =>
        r.vehicle_class === inspVehicleClass && r.fuel_type === inspFuelType &&
        r.inspection_type === '종합검사' && r.region === registrationRegion
      ) ||
      // 2순위: 유종 + 전국
      inspectionCosts.find(r =>
        r.vehicle_class === inspVehicleClass && r.fuel_type === inspFuelType &&
        r.inspection_type === '종합검사' && r.region === '전국'
      ) ||
      // 3순위: 전체 유종 + 지역
      inspectionCosts.find(r =>
        r.vehicle_class === inspVehicleClass && r.fuel_type === '전체' &&
        r.inspection_type === '종합검사' && r.region === registrationRegion
      ) ||
      // 4순위: 전체 유종 + 전국
      inspectionCosts.find(r =>
        r.vehicle_class === inspVehicleClass && r.fuel_type === '전체' &&
        r.inspection_type === '종합검사' && r.region === '전국'
      )
    const inspectionCostPerTime = inspCostRecord?.total_cost || 65000  // DB fallback

    // DB에서 검사 주기 조회 함수 (차령에 따라 주기가 변하므로)
    const getInspInterval = (ageYr: number): number => {
      const rec =
        inspectionSchedules.find(r =>
          r.vehicle_usage === '사업용_승용' && r.fuel_type === inspFuelType &&
          ageYr >= r.age_from && ageYr <= r.age_to
        ) ||
        inspectionSchedules.find(r =>
          r.vehicle_usage === '사업용_승용' && (r.fuel_type === '전체' || !r.fuel_type) &&
          ageYr >= r.age_from && ageYr <= r.age_to
        ) ||
        inspectionSchedules.find(r =>
          r.vehicle_usage === '사업용' && ageYr >= r.age_from && ageYr <= r.age_to
        )
      return rec?.interval_months || 12  // fallback: 매년
    }
    const firstInspSchedule = inspectionSchedules.find(r =>
      r.vehicle_usage === '사업용_승용' && (r.fuel_type === inspFuelType || r.fuel_type === '전체' || !r.fuel_type) &&
      0 >= r.age_from && 0 <= r.age_to
    )
    const firstInspMonths = firstInspSchedule?.first_inspection_months || 24
    const inspIntervalMonths = getInspInterval(Math.floor(carAge))  // 현재 시점 주기 (표시용)

    // 계약 기간 내 검사 횟수 계산 — 차령 변화에 따른 주기 변동 반영
    // 월 단위로 시뮬레이션하여 정확한 횟수 산출
    const inspectionsInTerm = (() => {
      const startAgeMonths = Math.round(carAge * 12)
      const firstInspAt = carAge === 0 ? firstInspMonths : 0  // 신차면 첫 검사까지 대기
      let count = 0
      let monthSinceLastInsp = 0
      for (let m = 1; m <= termMonths; m++) {
        const currentAgeMonths = startAgeMonths + m
        if (currentAgeMonths < firstInspAt) continue  // 첫 검사 전 기간은 스킵
        const currentAgeYears = Math.floor(currentAgeMonths / 12)
        const interval = getInspInterval(currentAgeYears)
        monthSinceLastInsp++
        if (monthSinceLastInsp >= interval) {
          count++
          monthSinceLastInsp = 0
        }
      }
      return count
    })()
    const totalInspectionCost = inspectionsInTerm * inspectionCostPerTime
    const monthlyInspectionCost = termMonths > 0 ? Math.round(totalInspectionCost / termMonths) : 0
    const totalMonthlyOperation = monthlyInsuranceCost + monthlyMaintenance + monthlyTax + monthlyInspectionCost

    // 4. 리스크 적립
    const monthlyRiskReserve = Math.round(_purchasePrice * (riskRate / 100) / 12)

    // 5. 보증금/선납금 할인
    // 보증금: 보증금 × 월할인률%
    const monthlyDepositDiscount = Math.round(deposit * (depositDiscountRate / 100))
    // 선납금: 선납금 ÷ 계약기간 (단순 분할)
    const monthlyPrepaymentDiscount = termMonths > 0 ? Math.round(prepayment / termMonths) : 0
    const totalDiscount = monthlyDepositDiscount + monthlyPrepaymentDiscount

    // 6. 총 원가
    const totalMonthlyCost = Math.max(0,
      monthlyDepreciation +
      totalMonthlyFinance +
      totalMonthlyOperation +
      monthlyRiskReserve -
      totalDiscount
    )

    // 7. 최종 렌트가 (천원단위 반올림)
    const rawSuggestedRent = totalMonthlyCost + margin
    const suggestedRent = Math.round(rawSuggestedRent / 1000) * 1000
    const rentWithVAT = Math.round(suggestedRent * 1.1 / 1000) * 1000

    // 8. 시장 비교
    const validComps = marketComps.filter(c => c.monthly_rent > 0)
    const marketAvg = validComps.length > 0
      ? Math.round(validComps.reduce((sum, c) => sum + c.monthly_rent, 0) / validComps.length)
      : 0
    const marketDiff = marketAvg > 0 ? ((rentWithVAT - marketAvg) / marketAvg * 100) : 0

    // 9. 매입가 대비 출고가 할인율
    const purchaseDiscount = _factoryPrice > 0
      ? ((_factoryPrice - _purchasePrice) / _factoryPrice * 100)
      : 0

    // 10. 원가 비중
    const costBreakdown = {
      depreciation: monthlyDepreciation,
      finance: totalMonthlyFinance,
      operation: totalMonthlyOperation,
      risk: monthlyRiskReserve,
      discount: -totalDiscount,
    }

    // 11. IRR (렌트사 투자 수익률)
    // 현금흐름: t0=-취득원가+보증금+선납금, t1~N=월렌트료(공급가), tN+=잔존가치-보증금반환
    const irrResult = calcIRR(costBase, suggestedRent, termMonths, residualValue, deposit, prepayment)

    return {
      carAge, mileage10k, termYears, isUsedCar,
      // 감가 — 현재
      yearDep, mileageDep, totalDepRate,
      excessMileageNow, avgMileageNow,
      currentMarketValue,
      // 감가 — 계약 종료 시점
      yearDepEnd, mileageDepEnd, totalDepRateEnd,
      excessMileageEnd, avgMileageEnd,
      endMarketValue, projectedMileage10k,
      effectiveEndMarketValue,
      monthlyDepreciation,
      // 중고차 감가 분리 분석
      purchaseMileage10k, purchaseAvgMileage, purchaseExcessMileage,
      purchaseMileageDep, purchaseYearDep, purchaseTotalDep,
      theoreticalMarketValue, purchasePremiumPct,
      customerDriven10k, standardAddition10k,
      customerExcessMileage, customerMileageDep, customerYearDep, customerTotalDepChange,
      usedCarEndTotalDep, usedCarEndMarketValue, carActualEndMarketValue,
      // 잔존가치 & 인수
      residualValue, buyoutPrice, costBase,
      // 감가 곡선 참조
      depClass, classMult,
      // 3축 매칭 & 보정계수
      matchedDepRate, autoAxes, effectiveAxes, activeCurve,
      adjustmentFactor, mileageFactor, marketFactor, popularityFactor,
      // 금융
      effectiveLoan, equityAmount, monthlyLoanInterest, monthlyOpportunityCost, totalMonthlyFinance,
      avgLoanBalance, loanEndBalance, avgEquityBalance, equityEndBalance,
      // 운영
      monthlyTax, monthlyInspectionCost, inspectionCostPerTime, inspectionsInTerm, inspIntervalMonths, totalMonthlyOperation,
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
      // IRR
      irrResult,
    }
  }, [
    selectedCar, factoryPrice, purchasePrice, carAgeMode, customCarAge, depCurvePreset, depCustomCurve, depClassOverride, depYear1Rate, depYear2Rate, annualMileage, baselineKm,
    contractType, residualRate, depRates, depAdjustments, popularityGrade, dbOriginOverride, dbVehicleClassOverride, dbFuelTypeOverride,
    loanAmount, loanRate, investmentRate,
    monthlyInsuranceCost, monthlyMaintenance, annualTax,
    riskRate, deposit, prepayment, depositDiscountRate, prepaymentDiscountRate,
    termMonths, margin, marketComps, deductible, totalAcquisitionCost,
    inspectionCosts, inspectionSchedules, registrationRegion, engineCC
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
  // 렌더링
  // ============================================
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

  // --- 견적서 미리보기용 파생값 ---
  const quoteSelectedCustomer = customerMode === 'select'
    ? customers.find((c: any) => String(c.id) === String(selectedCustomerId))
    : manualCustomer.name ? { ...manualCustomer, id: '', type: '직접입력' } : undefined
  const quoteEndDate = (() => {
    const d = new Date(startDate); d.setMonth(d.getMonth() + termMonths)
    return d.toISOString().split('T')[0]
  })()
  const quoteExcessRate = excessMileageRate || termsExcessInfo.rate
  const quoteTotalMileage = annualMileage * 10000 * (termMonths / 12)

  // ============================================
  // Step 2: 고객 정보 입력
  // ============================================
  if (wizardStep === 'customer') {
    const calc = calculations
    return (
      <div className="max-w-[800px] mx-auto py-8 px-4">
        {/* 스텝 인디케이터 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 24, background: 'rgba(255,255,255,0.72)', padding: '16px 24px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
          {[
            { key: 'vehicle' as const,  label: '차량선택', desc: '브랜드 · 모델 · 트림', num: 1, done: true },
            { key: 'options' as const,   label: '차량옵션', desc: '색상 · 패키지',        num: 2, done: true },
            { key: 'analysis' as const,  label: '상세견적', desc: '계약조건 · 렌트가',    num: 3, done: true },
            { key: 'customer' as const,  label: '고객정보', desc: '임차인 · 계약기간',    num: 4, done: false },
            { key: 'preview' as const,   label: '견적서',   desc: '미리보기 · 발송',      num: 5, done: false },
          ].map((s, i) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                onClick={() => { if (s.key !== 'customer' && s.key !== 'preview') setWizardStep(s.key) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: s.done ? 'pointer' : 'default',
                  padding: '8px 16px', borderRadius: 10,
                  background: s.key === 'customer' ? 'rgba(59,130,246,0.9)' : 'transparent',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 13,
                  background: s.key === 'customer' ? '#fff' : s.done ? '#dcfce7' : 'rgba(0,0,0,0.04)',
                  color: s.key === 'customer' ? 'rgba(59,130,246,0.9)' : s.done ? '#16a34a' : '#9ca3af',
                }}>
                  {s.done ? '✓' : s.num}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: s.key === 'customer' ? '#fff' : '#111827' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: s.key === 'customer' ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>{s.desc}</div>
                </div>
              </div>
              {i < 4 && <div style={{ width: 24, height: 2, background: s.done ? '#16a34a' : 'rgba(0,0,0,0.06)', margin: '0 2px' }} />}
            </div>
          ))}
        </div>

        {/* 분석 요약 */}
        {selectedCar && calc && (
          <div className="bg-steel-900 text-white rounded-2xl p-5 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 text-xs">분석 차량</p>
                <p className="font-black text-lg">{selectedCar.brand} {selectedCar.model}</p>
                <p className="text-slate-500 text-sm">{selectedCar.trim || ''} · {selectedCar.year}년식</p>
              </div>
              <div className="text-right">
                <p className="text-slate-500 text-xs">산출 렌트가 (VAT 포함)</p>
                <p className="text-2xl font-black text-yellow-400">{f(calc.rentWithVAT)}원<span className="text-sm text-slate-500">/월</span></p>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold mt-1 inline-block
                  ${contractType === 'return' ? 'bg-steel-600/30 text-steel-300' : 'bg-amber-500/30 text-amber-300'}`}>
                  {contractType === 'return' ? '반납형' : '인수형'} · {termMonths}개월
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 고객 선택 */}
        <div className="rounded-2xl border border-black/[0.06] p-6 mb-4" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-600 text-sm">고객 정보</h3>
            <div className="flex gap-1.5">
              <button onClick={() => setCustomerMode('select')}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition-colors
                  ${customerMode === 'select' ? 'bg-steel-600 text-white' : 'bg-gray-100 text-slate-500 hover:bg-gray-100'}`}>
                등록 고객
              </button>
              <button onClick={() => setCustomerMode('manual')}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition-colors
                  ${customerMode === 'manual' ? 'bg-steel-600 text-white' : 'bg-gray-100 text-slate-500 hover:bg-gray-100'}`}>
                직접 입력
              </button>
            </div>
          </div>

          {customerMode === 'select' ? (
            <>
              <select className="w-full p-3 border border-black/[0.06] rounded-xl font-bold text-base focus:border-steel-500 outline-none mb-3"
                value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
                <option value="">고객을 선택하세요</option>
                {customers.map((cust: any) => (
                  <option key={cust.id} value={cust.id}>{cust.name} ({cust.type}) - {cust.phone}</option>
                ))}
              </select>
              {quoteSelectedCustomer && (
                <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">이름</span><span className="font-bold">{quoteSelectedCustomer.name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">연락처</span><span className="font-bold">{quoteSelectedCustomer.phone}</span></div>
                  {quoteSelectedCustomer.email && <div className="flex justify-between"><span className="text-slate-500">이메일</span><span className="font-bold">{quoteSelectedCustomer.email}</span></div>}
                  {quoteSelectedCustomer.business_number && <div className="flex justify-between"><span className="text-slate-500">사업자번호</span><span className="font-bold">{quoteSelectedCustomer.business_number}</span></div>}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">고객 등록 전에도 견적서를 작성할 수 있습니다.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">고객명 *</label>
                  <input type="text" placeholder="홍길동 / (주)ABC" value={manualCustomer.name}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-black/[0.06] rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">연락처</label>
                  <input type="tel" placeholder="010-0000-0000" value={manualCustomer.phone}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full border border-black/[0.06] rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">이메일</label>
                  <input type="email" placeholder="email@example.com" value={manualCustomer.email}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-black/[0.06] rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">사업자번호</label>
                  <input type="text" placeholder="000-00-00000" value={manualCustomer.business_number}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, business_number: e.target.value }))}
                    className="w-full border border-black/[0.06] rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 계약 시작일 */}
        <div className="rounded-2xl border border-black/[0.06] p-6 mb-4" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
          <h3 className="font-bold text-slate-600 text-sm mb-3">계약 기간</h3>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">시작일</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="border border-black/[0.06] rounded-lg px-3 py-2 font-bold text-sm focus:border-steel-500 outline-none" />
            </div>
            <span className="text-slate-400 mt-5">&rarr;</span>
            <div>
              <label className="text-xs text-slate-500 block mb-1">종료일 (자동)</label>
              <div className="border border-black/5 bg-gray-50 rounded-lg px-3 py-2 font-bold text-sm text-slate-400">{fDate(quoteEndDate)}</div>
            </div>
            <div className="mt-5 text-sm text-slate-500 font-bold">{termMonths}개월</div>
          </div>
        </div>

        {/* 비고 */}
        <div className="rounded-2xl border border-black/[0.06] p-6 mb-6" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
          <h3 className="font-bold text-slate-600 text-sm mb-3">비고 (선택)</h3>
          <textarea placeholder="견적서에 표시할 특이사항, 프로모션 안내 등..." value={quoteNote}
            onChange={(e) => setQuoteNote(e.target.value)}
            className="w-full border border-black/[0.06] rounded-xl p-3 text-sm h-20 resize-none focus:border-steel-500 outline-none" />
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button onClick={() => setWizardStep('analysis')}
            className="flex-1 py-3 text-center border border-black/[0.06] rounded-xl font-bold text-slate-500 hover:bg-gray-50">
            &larr; 원가분석으로
          </button>
          <button
            onClick={() => {
              if (customerMode === 'select' && !selectedCustomerId) return alert('고객을 선택해주세요.')
              if (customerMode === 'manual' && !manualCustomer.name.trim()) return alert('고객명을 입력해주세요.')
              setWizardStep('preview')
            }}
            className="flex-[2] py-3 bg-steel-900 text-white rounded-xl font-black hover:bg-steel-800 transition-colors">
            견적서 미리보기 &rarr;
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // Step 3: 견적서 미리보기 + 저장
  // ============================================
  if (wizardStep === 'preview' && calculations && selectedCar) {
    const calc = calculations
    const car = selectedCar
    const rentVAT = Math.round(calc.suggestedRent * 0.1 / 1000) * 1000  // 천원단위 반올림

    return (
      <div className="min-h-screen py-6 px-4 quote-print-wrapper" style={{ background: '#f9fafb' }}>
        {/* 스텝 인디케이터 */}
        <div className="max-w-[800px] mx-auto print:hidden" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, background: '#fff', padding: '16px 24px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
          {[
            { key: 'vehicle' as const,  label: '차량선택', desc: '브랜드 · 모델 · 트림', num: 1, done: true },
            { key: 'options' as const,   label: '차량옵션', desc: '색상 · 패키지',        num: 2, done: true },
            { key: 'analysis' as const,  label: '상세견적', desc: '계약조건 · 렌트가',    num: 3, done: true },
            { key: 'customer' as const,  label: '고객정보', desc: '임차인 · 계약기간',    num: 4, done: true },
            { key: 'preview' as const,   label: '견적서',   desc: '미리보기 · 발송',      num: 5, done: false },
          ].map((s, i) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                onClick={() => { if (s.key !== 'preview') setWizardStep(s.key) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: s.done ? 'pointer' : 'default',
                  padding: '8px 16px', borderRadius: 10,
                  background: s.key === 'preview' ? 'rgba(59,130,246,0.9)' : 'transparent',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 13,
                  background: s.key === 'preview' ? '#fff' : s.done ? '#dcfce7' : 'rgba(0,0,0,0.04)',
                  color: s.key === 'preview' ? 'rgba(59,130,246,0.9)' : s.done ? '#16a34a' : '#9ca3af',
                }}>
                  {s.done ? '✓' : s.num}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: s.key === 'preview' ? '#fff' : '#111827' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: s.key === 'preview' ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>{s.desc}</div>
                </div>
              </div>
              {i < 4 && <div style={{ width: 24, height: 2, background: s.done ? '#16a34a' : 'rgba(0,0,0,0.06)', margin: '0 2px' }} />}
            </div>
          ))}
        </div>
        </div>

        {/* 상단 액션 바 */}
        <div className="max-w-[800px] mx-auto mb-4 flex justify-between items-center print:hidden">
          <button onClick={() => setWizardStep('customer')} className="text-sm text-slate-500 hover:text-slate-600 font-bold">
            &larr; 고객정보로 돌아가기
          </button>
          <div className="flex gap-2">
            <button onClick={() => window.print()}
              className="px-4 py-2 border border-white/10 rounded-xl text-sm font-bold text-slate-400 hover:bg-white">인쇄</button>
            <button onClick={() => handleSaveQuote('draft')} disabled={quoteSaving}
              className="px-4 py-2 border border-white/10 rounded-xl text-sm font-bold text-slate-400 hover:bg-white disabled:opacity-50">
              {quoteSaving ? '저장중...' : '임시저장'}</button>
            <button onClick={() => handleSaveQuote('active')} disabled={quoteSaving}
              className="px-5 py-2 bg-steel-900 text-white rounded-xl text-sm font-black hover:bg-steel-800 disabled:opacity-50">
              {quoteSaving ? '저장중...' : '견적서 확정'}</button>
          </div>
        </div>

        {/* 견적서 본문 */}
        <div ref={printRef} className="max-w-[800px] mx-auto bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:rounded-none quote-print-area">

          {/* ========== PAGE 1: 핵심 정보 ========== */}
          <div className="quote-page-1">
            {/* 헤더 */}
            <div className="bg-steel-900 text-white px-6 py-4 print:px-5 print:py-3 quote-header-bg">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-black tracking-tight print:text-xl">장기렌트 견적서</h1>
                  <p className="text-slate-500 text-xs mt-0.5">LONG-TERM RENTAL QUOTATION</p>
                </div>
                <div className="text-right text-sm">
                  <span className="text-slate-500 text-xs">견적일 </span>
                  <span className="font-bold">{fDate(new Date().toISOString())}</span>
                  <span className="text-slate-500 mx-2">|</span>
                  <span className="text-yellow-400 text-xs font-bold">유효기간 30일</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 space-y-3 print:px-5 print:py-3 print:space-y-2">
              {/* 1. 임대인 / 임차인 — 컴팩트 2컬럼 */}
              <div className="grid grid-cols-2 gap-4 quote-section">
                <div>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">임대인</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-0.5">
                    <p className="font-black text-sm">{quoteCompany?.name || company?.name || '당사'}</p>
                    {(quoteCompany?.business_number || company?.business_number) && <p className="text-slate-500">사업자번호: {quoteCompany?.business_number || company?.business_number}</p>}
                    {(quoteCompany?.address || company?.address) && <p className="text-slate-500">{quoteCompany?.address || company?.address}</p>}
                    {(quoteCompany?.phone || company?.phone) && <p className="text-slate-500">TEL: {quoteCompany?.phone || company?.phone}</p>}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">임차인</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-0.5">
                    <p className="font-black text-sm">{quoteSelectedCustomer?.name || '-'}</p>
                    {quoteSelectedCustomer?.business_number && <p className="text-slate-500">사업자번호: {quoteSelectedCustomer.business_number}</p>}
                    {quoteSelectedCustomer?.phone && <p className="text-slate-500">연락처: {quoteSelectedCustomer.phone}</p>}
                    {quoteSelectedCustomer?.email && <p className="text-slate-500">{quoteSelectedCustomer.email}</p>}
                  </div>
                </div>
              </div>

              {/* 2. 차량 정보 — 컴팩트 */}
              <div className="quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">차량 정보</p>
                <div className="border border-black/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-24">차종</td>
                        <td className="px-3 py-1.5 font-black">{car.brand} {car.model}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-24">트림</td>
                        <td className="px-3 py-1.5 font-bold">{car.trim || '-'}</td>
                      </tr>
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">연식</td>
                        <td className="px-3 py-1.5">{car.year}년</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">연료</td>
                        <td className="px-3 py-1.5">{car.fuel || '-'}</td>
                      </tr>
                      <tr>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">차량가격</td>
                        <td className="px-3 py-1.5 font-bold">{f(factoryPrice)}원</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">차량번호</td>
                        <td className="px-3 py-1.5">{car.number || '(출고 전)'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. 계약 조건 — 컴팩트 */}
              <div className="quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">계약 조건</p>
                <div className="border border-black/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-24">계약유형</td>
                        <td className="px-3 py-1.5 font-black">{contractType === 'buyout' ? '인수형 장기렌트' : '반납형 장기렌트'}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-24">계약기간</td>
                        <td className="px-3 py-1.5 font-bold">{termMonths}개월</td>
                      </tr>
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">시작일</td>
                        <td className="px-3 py-1.5">{fDate(startDate)}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">종료일</td>
                        <td className="px-3 py-1.5">{fDate(quoteEndDate)}</td>
                      </tr>
                      <tr>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">약정주행</td>
                        <td className="px-3 py-1.5">연 {f(annualMileage * 10000)}km (총 {f(quoteTotalMileage)}km)</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">정비상품</td>
                        <td className="px-3 py-1.5">{MAINT_PACKAGE_LABELS[maintPackage] || maintPackage}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. 월 렌탈료 — 핵심 강조 */}
              <div className="border-2 border-steel-900 rounded-lg overflow-hidden quote-rental-highlight">
                <div className="bg-steel-900 text-white px-4 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-slate-500">월 렌탈료 (VAT 포함)</p>
                    <p className="text-2xl font-black tracking-tight">{f(calc.rentWithVAT)}<span className="text-sm ml-0.5">원</span></p>
                  </div>
                  <div className="text-right text-[10px] text-slate-500 space-y-0.5">
                    <p>공급가 {f(calc.suggestedRent)}원</p>
                    <p>부가세 {f(rentVAT)}원</p>
                  </div>
                </div>
                <div className="border border-black/[0.06] rounded-b-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    {deposit > 0 && (
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-28">보증금</td>
                        <td className="px-3 py-1.5 font-bold text-slate-700">{f(deposit)}원 <span className="text-[10px] text-slate-500">(계약 시 1회)</span></td>
                      </tr>
                    )}
                    {prepayment > 0 && (
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">선납금</td>
                        <td className="px-3 py-1.5 font-bold text-slate-700">{f(prepayment)}원 <span className="text-[10px] text-slate-500">(계약 시 1회)</span></td>
                      </tr>
                    )}
                    {contractType === 'buyout' && (
                      <tr className="border-b border-black/5 bg-amber-50">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600">인수가격 (만기)</td>
                        <td className="px-3 py-1.5 font-black text-amber-700">{f(calc.buyoutPrice)}원</td>
                      </tr>
                    )}
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">약정주행</td>
                      <td className="px-3 py-1.5">연 {f(annualMileage * 10000)}km · 초과 시 <span className="font-bold text-red-500">km당 {f(quoteExcessRate)}원</span></td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">자차 면책금</td>
                      <td className="px-3 py-1.5">사고 시 <span className="font-bold">{f(deductible)}원</span>{deductible === 0 && <span className="text-green-500 text-xs ml-1 font-bold">완전면책</span>}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="px-3 py-1.5 text-[10px] text-slate-500">
                        렌탈료 포함: 자동차보험(종합) · 자동차세 · 취득세 · 등록비{maintPackage !== 'self' ? ` · ${MAINT_PACKAGE_LABELS[maintPackage] || '정비'}` : ''}
                      </td>
                    </tr>
                  </tbody></table>
                </div>
              </div>

              {/* 4-1. 보험 보장항목 상세 */}
              <div className="quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">자동차보험 보장내역</p>
                <div className="border border-black/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-black/5 bg-gray-50">
                      <td className="px-3 py-1 font-bold text-slate-500 w-36">보장항목</td>
                      <td className="px-3 py-1 font-bold text-slate-500">보장내용</td>
                    </tr>
                    {(termsConfig?.insurance_coverage || DEFAULT_INSURANCE_COVERAGE).map((item: any, idx: number) => (
                      <tr key={idx} className={idx < (termsConfig?.insurance_coverage || DEFAULT_INSURANCE_COVERAGE).length - 1 ? 'border-b border-black/5' : ''}>
                        <td className="px-3 py-1.5 font-bold text-slate-600">{item.label}</td>
                        <td className="px-3 py-1.5 text-slate-400">
                          {item.description
                            .replace(/\{deductible\}/g, f(deductible))
                          }
                          {item.description.includes('{deductible}') && deductible === 0 && (
                            <span className="text-green-600 font-bold ml-1">(완전면책)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
                <p className="text-[8px] text-slate-500 mt-1">※ {termsConfig?.calc_params?.insurance_note || '렌터카 공제조합 가입 · 보험기간: 계약기간 동안 연단위 자동갱신 · 보험료 렌탈료 포함'}</p>
              </div>

              {/* (주요 약정 → 렌탈료 카드로 통합됨) */}
            </div>
          </div>

          {/* ========== PAGE 2: 상세 안내 + 서명 ========== */}
          <div className="quote-page-2 print:flex print:flex-col" style={{ minHeight: 'auto' }}>
            {/* 상단 콘텐츠 */}
            <div className="px-6 py-4 space-y-3 print:px-5 print:py-3 print:space-y-2 print:flex-1">

              {/* 6. 상세 약정 조건 */}
              <div className="quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">상세 약정 조건</p>
                <div className="border border-black/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-28">약정 주행거리</td>
                      <td className="px-3 py-1.5">연간 {f(annualMileage * 10000)}km (계약기간 총 {f(quoteTotalMileage)}km)</td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">초과주행 요금</td>
                      <td className="px-3 py-1.5"><span className="font-bold text-red-500">km당 {f(quoteExcessRate)}원</span><span className="text-slate-500 text-[10px] ml-1">(계약 종료 시점 정산)</span></td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">자차 면책금</td>
                      <td className="px-3 py-1.5">사고 시 자기부담금 <span className="font-bold">{f(deductible)}원</span>{deductible === 0 && <span className="text-green-500 text-[10px] ml-1 font-bold">완전면책</span>}</td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">중도해지</td>
                      <td className="px-3 py-1.5">
                        {(() => {
                          // 기간별 차등 위약금율 (약관 DB)
                          const periodRates = termsConfig?.calc_params?.early_termination_rates_by_period
                          if (periodRates && Array.isArray(periodRates)) {
                            const matched = periodRates.find((r: any) => termMonths >= r.months_from && termMonths <= r.months_to)
                            const rate = matched?.rate || termsConfig?.calc_params?.early_termination_rate || 35
                            return <>잔여 렌탈료의 <span className="font-bold text-red-500">{rate}%</span> 위약금 발생</>
                          }
                          return <>잔여 렌탈료의 <span className="font-bold text-red-500">{termsConfig?.calc_params?.early_termination_rate || 35}%</span> 위약금 발생</>
                        })()}
                      </td>
                    </tr>
                    <tr>
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">반납 조건</td>
                      <td className="px-3 py-1.5 text-slate-400">{contractType === 'buyout' ? '만기 시 인수 또는 반납 선택 가능' : '만기 시 차량 반납 (차량 상태 평가 후 보증금 정산)'}</td>
                    </tr>
                  </tbody></table>
                </div>
              </div>

              {/* 6-1. 렌탈료 포함 서비스 안내 */}
              <div className="quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">렌탈료 포함 서비스</p>
                <div className="border border-black/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-black/5">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700 w-28">자동차보험</td>
                      <td className="px-3 py-1 text-blue-600">종합 (대인II·대물1억·자손·무보험차·자차)</td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">세금</td>
                      <td className="px-3 py-1 text-blue-600">자동차세·취득세 렌탈료 포함</td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">등록비용</td>
                      <td className="px-3 py-1 text-blue-600">번호판·인지세·공채·등록대행</td>
                    </tr>
                    <tr>
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">{maintPackage !== 'self' ? MAINT_PACKAGE_LABELS[maintPackage] || '정비' : '정기검사'}</td>
                      <td className="px-3 py-1 text-blue-600">{maintPackage !== 'self' ? (MAINT_PACKAGE_DESC[maintPackage] || '정비 포함') : '자동차 정기검사(종합검사) 포함'}</td>
                    </tr>
                  </tbody></table>
                </div>
              </div>

              {/* 7. 인수 안내 (인수형만) */}
              {contractType === 'buyout' && (
                <div className="quote-section">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">인수 안내</p>
                  <div className="border border-amber-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs"><tbody>
                      <tr className="border-b border-amber-100">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600 w-28">인수가격</td>
                        <td className="px-3 py-1.5 font-black text-amber-700 text-sm">{f(calc.buyoutPrice)}원 <span className="text-[10px] font-normal text-slate-500">(VAT 별도)</span></td>
                      </tr>
                      <tr className="border-b border-amber-100">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600">추가 비용</td>
                        <td className="px-3 py-1.5 text-slate-600">취득세 + 이전등록비 별도 (임차인 부담)</td>
                      </tr>
                      <tr>
                        <td colSpan={2} className="px-3 py-1 text-[10px] text-amber-600 bg-amber-50/50">
                          * 만기 시 상기 가격으로 소유권 이전 가능 · 인수 미희망 시 반납 가능
                        </td>
                      </tr>
                    </tbody></table>
                  </div>
                </div>
              )}

              {/* 8. 비고 */}
              {quoteNote && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-yellow-700 mb-0.5">비고</p>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{quoteNote}</p>
                </div>
              )}

              {/* 9. 유의사항 */}
              <div className="border-t border-black/[0.06] pt-3 quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">유의사항 및 특약</p>
                <div className="text-[10px] text-slate-500 space-y-1 quote-notices">
                  {(termsConfig?.quote_notices || DEFAULT_QUOTE_NOTICES).map((item: any, idx: number) => {
                    // Handle conditional items (e.g., show only for buyout)
                    if (item.condition === 'buyout' && contractType !== 'buyout') {
                      return null
                    }

                    // Replace placeholders with actual values
                    let text = item.text || item
                    if (typeof text === 'string') {
                      text = text
                        .replace(/\{deductible\}/g, f(deductible))
                        .replace(/\{excessRate\}/g, f(quoteExcessRate))
                        .replace(/\{earlyTerminationRate\}/g, (termsConfig?.calc_params?.early_termination_rate || 35).toString())
                    }

                    return <p key={idx}>{idx + 1}. {text}</p>
                  })}
                </div>
              </div>
            </div>

            {/* 서명란 + 푸터 — 마지막 페이지 하단 고정 */}
            <div className="print:mt-auto">
              <div className="px-6 print:px-5">
                <div className="grid grid-cols-2 gap-8 pt-6 pb-4 quote-signature">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 mb-10">임대인 (서명/인)</p>
                    <div className="border-t border-white/10 pt-2">
                      <p className="text-xs font-bold text-slate-600">{quoteCompany?.name || company?.name || '당사'}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 mb-10">임차인 (서명/인)</p>
                    <div className="border-t border-white/10 pt-2">
                      <p className="text-xs font-bold text-slate-600">{quoteSelectedCustomer?.name || '고객명'}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-6 py-2 border-t border-black/[0.06] text-center">
                <p className="text-[9px] text-slate-500">
                  본 견적서는 {quoteCompany?.name || company?.name || '당사'}에서 발행한 공식 견적서입니다. 문의: {quoteCompany?.phone || company?.phone || '-'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 하단 액션 */}
        <div className="max-w-[800px] mx-auto mt-4 flex gap-3 print:hidden">
          <button onClick={() => setWizardStep('customer')}
            className="flex-1 py-3 border border-black/[0.06] rounded-xl font-bold text-slate-500 hover:bg-white">&larr; 수정</button>
          <button onClick={() => window.print()}
            className="flex-1 py-3 border border-black/[0.06] rounded-xl font-bold text-slate-400 hover:bg-white">인쇄 / PDF</button>
          <button onClick={() => handleSaveQuote('draft')} disabled={quoteSaving}
            className="flex-1 py-3 bg-steel-600 text-white rounded-xl font-bold hover:bg-steel-700 disabled:opacity-50">임시저장</button>
          <button onClick={() => handleSaveQuote('active')} disabled={quoteSaving}
            className="flex-[2] py-3 bg-steel-900 text-white rounded-xl font-black hover:bg-steel-800 disabled:opacity-50">
            {quoteSaving ? '저장 중...' : '견적서 확정'}</button>
        </div>
      </div>
    )
  }

  // ============================================
  // Step 1: 원가분석 (기존 UI)
  // ============================================
  return (
    <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">

      {/* ===== 스텝 인디케이터 + 헤더 ===== */}
      <div style={{ marginBottom: 24 }}>
        {/* 스텝 인디케이터 — 5단계 (차량선택 → 차량옵션 → 상세견적 → 고객정보 → 견적서) */}
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

      {/* ===== Step 1: 차량선택 (탭 네비 + 등록/카달로그 패널) ===== */}
      {wizardStep === 'vehicle' && (<>
      {/* ===== 탭 네비게이션 ===== */}
      <div className="flex justify-center mb-6">
        <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-2xl p-1 inline-flex gap-1 shadow-sm">
          {[
            { id: 'registered' as const, label: '등록차량' },
            { id: 'catalog' as const, label: '카달로그' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === t.id
                  ? 'bg-white/90 text-slate-900 shadow-sm border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== 가격표 드래그앤드롭 업로드 영역 (카달로그에서 + 가격표 추가 클릭 시 펼침) ===== */}
      {activeTab === 'catalog' && showAddPanel && (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDropFile}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center mb-6 transition-all duration-300 ${
          isParsingQuote
            ? 'border-amber-400 bg-amber-50'
            : isDragging
              ? 'border-steel-500 bg-steel-50 scale-[1.01]'
              : 'border-white/10 bg-white hover:border-steel-300'
        }`}
      >
        <input
          ref={dropFileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={handleQuoteUpload}
          disabled={isParsingQuote}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        {isParsingQuote ? (
          <div className="pointer-events-none">
            <span className="inline-block w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-amber-700 font-bold text-sm">{parseStage || '분석 중...'}</p>
            {parseElapsed > 0 && <p className="text-xs text-amber-500 mt-1">{parseElapsed}초 경과</p>}
            {parseElapsed >= 15 && <p className="text-xs text-slate-500 mt-1">복잡한 가격표는 시간이 더 소요될 수 있습니다</p>}
          </div>
        ) : (
          <div className="pointer-events-none">
            <span className="text-4xl mb-2 block">📄</span>
            <p className="text-slate-400 font-bold text-sm">가격표를 여기에 놓거나 클릭하세요</p>
            <p className="text-xs text-slate-500 mt-2">PDF · 이미지(JPG, PNG) → AI 자동 분석 후 저장 목록에 추가</p>
          </div>
        )}
      </div>
      )}

      {/* ===== 카달로그 통합 리스트 (Compact Row + 검색/필터) ===== */}
      {activeTab === 'catalog' && (() => {
        // 1) 두 소스를 단일 행 모델로 정규화
        type Row = {
          id: string
          kind: 'worksheet' | 'price'
          brand: string
          model: string
          trim: string
          year: number | string
          number: string
          isUsed: boolean | undefined
          rent: number | null
          updatedAt: string
          orphan: boolean
          raw: any
        }
        const wsRows: Row[] = savedWorksheets.map((ws: any) => {
          const car = ws.cars
          const nc = ws.newcar_info
          const orphan = !car && !nc?.brand && !nc?.model
          return {
            id: `ws-${ws.id}`,
            kind: 'worksheet' as const,
            brand: car?.brand || nc?.brand || (orphan ? '미분류' : '기타'),
            model: car?.model || nc?.model || '차종 미확인',
            trim: car?.trim || nc?.trim || '',
            year: car?.year || nc?.year || '',
            number: car?.number || '',
            isUsed: car?.is_used,
            rent: ws.suggested_rent ? Math.round(ws.suggested_rent) : null,
            updatedAt: ws.updated_at || ws.created_at,
            orphan,
            raw: ws,
          }
        })
        // 동일 (브랜드|모델|연식) 중복 제거 — 최신 updated_at만 유지
        const spDedup = new Map<string, any>()
        savedCarPrices.forEach((sp: any) => {
          const key = `${(sp.brand || '').trim().toLowerCase()}|${(sp.model || '').trim().toLowerCase()}|${sp.year || ''}`
          const prev = spDedup.get(key)
          const cur = new Date(sp.updated_at || sp.created_at).getTime()
          const prevT = prev ? new Date(prev.updated_at || prev.created_at).getTime() : -1
          if (!prev || cur > prevT) spDedup.set(key, sp)
        })
        const spRows: Row[] = Array.from(spDedup.values()).map((sp: any) => ({
          id: `sp-${sp.id}`,
          kind: 'price' as const,
          brand: sp.brand || '기타',
          model: sp.model || '',
          trim: sp.price_data?.variants?.length ? `${sp.price_data.variants.length}차종` : '',
          year: sp.year || '',
          number: '',
          isUsed: undefined,
          rent: null,
          updatedAt: sp.updated_at || sp.created_at,
          orphan: false,
          raw: sp,
        }))
        const all: Row[] =
          catalogFilter === 'worksheets' ? wsRows :
          catalogFilter === 'prices' ? spRows :
          [...wsRows, ...spRows]

        // 2) 검색 필터 (브랜드/모델/트림/번호판)
        const q = catalogSearch.trim().toLowerCase()
        const filtered = q
          ? all.filter(r =>
              r.brand.toLowerCase().includes(q) ||
              r.model.toLowerCase().includes(q) ||
              r.trim.toLowerCase().includes(q) ||
              r.number.toLowerCase().includes(q)
            )
          : all

        // 3) 정렬
        const sorted = [...filtered].sort((a, b) => {
          if (catalogSort === 'price_asc')  return (a.rent || Infinity) - (b.rent || Infinity)
          if (catalogSort === 'price_desc') return (b.rent || -Infinity) - (a.rent || -Infinity)
          if (catalogSort === 'brand')      return a.brand.localeCompare(b.brand, 'ko')
          // recent
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        })

        // 4) 브랜드별 그룹 (정렬 모드가 brand이면 그룹 헤더 강조)
        const byBrand: Record<string, Row[]> = {}
        sorted.forEach(r => { (byBrand[r.brand] = byBrand[r.brand] || []).push(r) })
        const brandOrder = Object.keys(byBrand).sort((a, b) => {
          if (a === '미분류') return 1
          if (b === '미분류') return -1
          return a.localeCompare(b, 'ko')
        })

        const totalAll = wsRows.length + spRows.length
        if (totalAll === 0) return null

      return (
      <div className="rounded-2xl border border-black/[0.06] mb-6 overflow-hidden" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
        {/* Header — 항상 펼침 (Compact Row가 작아서 접을 필요 없음) */}
        <div className="w-full px-5 py-3 border-b border-black/5 flex items-center justify-between gap-3 bg-gray-50/40">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
            <span className="font-black text-slate-700 text-sm shrink-0">📋 저장 목록</span>
            <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0">
              {sorted.length}{q || catalogFilter !== 'all' ? ` / ${totalAll}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {checkedRows.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition-colors"
              >
                선택 삭제 ({checkedRows.size})
              </button>
            )}
          </div>
        </div>

        {/* Toolbar: 검색 + 필터 칩 + 정렬 */}
        <div className="px-5 py-3 border-b border-black/5 flex items-center gap-2 flex-wrap bg-white/60">
          {/* 검색 */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="브랜드, 모델, 트림, 차량번호 검색..."
              className="w-full pl-8 pr-3 py-2 text-xs font-semibold rounded-lg border border-black/[0.06] outline-none focus:border-indigo-300"
              style={{ background: 'rgba(255,255,255,0.4)', boxShadow: 'inset 2px 2px 4px rgba(140,170,210,0.10)' }}
            />
          </div>
          {/* 필터 칩 */}
          <div className="flex items-center gap-1 bg-gray-100/70 rounded-lg p-0.5">
            {([
              ['all', '전체', wsRows.length + spRows.length],
              ['worksheets', '🧮 워크시트', wsRows.length],
              ['prices', '🚘 가격표', spRows.length],
            ] as const).map(([key, label, cnt]) => (
              <button
                key={key}
                onClick={() => setCatalogFilter(key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                  catalogFilter === key ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label} <span className="text-slate-400">{cnt}</span>
              </button>
            ))}
          </div>
          {/* 정렬 */}
          <select
            value={catalogSort}
            onChange={(e) => setCatalogSort(e.target.value as any)}
            className="text-[11px] font-bold text-slate-600 border border-black/[0.06] rounded-lg px-2 py-1.5 bg-white outline-none cursor-pointer"
          >
            <option value="recent">최근순</option>
            <option value="brand">브랜드순</option>
            <option value="price_desc">렌트가↓</option>
            <option value="price_asc">렌트가↑</option>
          </select>
          {/* + 가격표 추가 (AI 조회 / 견적서 업로드 패널 토글) */}
          <button
            onClick={() => setShowAddPanel(v => !v)}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
              showAddPanel
                ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
            }`}
            title="견적서 업로드 또는 AI로 신차 가격표 조회"
          >
            {showAddPanel ? '✕ 추가 패널 닫기' : '+ 가격표 추가'}
          </button>
        </div>

        {/* Body: 결과 없음 / Compact Row 그룹 */}
        {sorted.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 text-xs">
            {q ? `"${catalogSearch}" 검색 결과 없음` : '항목이 없습니다'}
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04]">
            {brandOrder.map(brand => {
              const rows = byBrand[brand]
              return (
                <div key={`grp-${brand}`}>
                  {/* 브랜드 그룹 헤더 */}
                  <div className="px-5 py-1.5 bg-slate-50/60 flex items-center gap-2">
                    <span className={`text-[10px] font-black ${brand === '미분류' ? 'text-slate-400' : 'text-slate-500'}`}>
                      {brand === '미분류' ? '🕳️ 미분류' : brand}
                    </span>
                    <span className="text-[10px] text-slate-400">{rows.length}</span>
                  </div>
                  {/* 행들 */}
                  {rows.map(row => {
                    const isPrice = row.kind === 'price'
                    const isSelected = isPrice && newCarResult && newCarResult.brand === row.brand && (
                      newCarResult.model === row.model ||
                      (newCarResult.model_detail || newCarResult.model) === row.model ||
                      row.model?.startsWith(newCarResult.model)
                    )
                    const handleClick = () => {
                      if (row.orphan) return
                      if (row.kind === 'worksheet') {
                        const ws = row.raw
                        const carId = ws.cars?.id
                        if (carId) handleCarSelect(String(carId))
                        router.push(`/quotes/create?worksheet_id=${ws.id}&car_id=${carId || ''}`)
                      } else {
                        handleLoadSavedPrice(row.raw)
                      }
                    }
                    return (
                      <div
                        key={row.id}
                        className={`group px-5 py-2.5 grid gap-x-3 gap-y-0.5 transition-colors ${
                          row.orphan ? 'cursor-default opacity-60'
                          : isSelected ? 'bg-indigo-50/70 cursor-pointer'
                          : 'cursor-pointer hover:bg-indigo-50/40'
                        }`}
                        style={{
                          gridTemplateColumns: '20px 24px minmax(0, 1fr) 100px 76px 24px',
                          gridTemplateRows: 'auto auto',
                        }}
                      >
                        {/* ── Line 1 ── */}
                        {/* 체크박스 */}
                        <div className="self-center" style={{ gridColumn: 1, gridRow: 1 }}>
                          <input
                            type="checkbox"
                            checked={checkedRows.has(row.id)}
                            onChange={(e) => {
                              e.stopPropagation()
                              setCheckedRows(prev => {
                                const next = new Set(prev)
                                if (next.has(row.id)) next.delete(row.id)
                                else next.add(row.id)
                                return next
                              })
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer"
                          />
                        </div>
                        {/* 아이콘 */}
                        <span
                          className={`text-sm self-center ${row.orphan ? 'text-slate-300' : isPrice ? 'text-indigo-500' : 'text-steel-500'}`}
                          style={{ gridColumn: 2, gridRow: 1 }}
                          onClick={handleClick}
                        >
                          {row.orphan ? '🕳️' : isPrice ? '🚘' : '🧮'}
                        </span>
                        {/* 모델명 + 번호판 + 뱃지 */}
                        <div
                          className="min-w-0 flex items-center gap-1.5 flex-wrap"
                          style={{ gridColumn: 3, gridRow: 1 }}
                          onClick={handleClick}
                        >
                          <span className={`font-black text-[13px] ${row.orphan ? 'italic text-slate-400' : 'text-slate-800'}`}>
                            {row.model || '차종 미확인'}
                          </span>
                          {row.number && <span className="text-[10px] font-bold text-steel-600">[{row.number}]</span>}
                          {row.year && <span className="text-[10px] text-slate-500">{row.year}년</span>}
                          {row.isUsed !== undefined && (
                            <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${row.isUsed ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                              {row.isUsed ? '중고' : '신차'}
                            </span>
                          )}
                          {isPrice && (
                            row.raw.source?.includes('견적서') ? (
                              <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-emerald-50 text-emerald-600">견적서</span>
                            ) : (
                              <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-violet-50 text-violet-600">AI</span>
                            )
                          )}
                          {isPrice && row.raw.price_data?.variants?.length > 0 && (
                            <span className="text-[9px] text-slate-400 font-bold">{row.raw.price_data.variants.length}차종</span>
                          )}
                          {isSelected && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">선택</span>}
                        </div>
                        {/* 렌트가 */}
                        <div
                          className="text-right text-[11px] font-bold text-emerald-600 tabular-nums self-center whitespace-nowrap"
                          style={{ gridColumn: 4, gridRow: 1 }}
                          onClick={handleClick}
                        >
                          {row.rent ? `${row.rent.toLocaleString()}원` : <span className="text-slate-300">—</span>}
                        </div>
                        {/* 날짜 */}
                        <div
                          className="text-right text-[10px] text-slate-400 tabular-nums self-center whitespace-nowrap"
                          style={{ gridColumn: 5, gridRow: 1 }}
                          onClick={handleClick}
                        >
                          {new Date(row.updatedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                        </div>
                        {/* 삭제 버튼 (모든 행에 hover 시 표시) */}
                        <div className="text-center self-center" style={{ gridColumn: 6, gridRow: 1 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!confirm(`"${row.model || '항목'}" 을(를) 삭제하시겠습니까?`)) return
                              if (isPrice) handleDeleteSavedPrice(row.raw.id)
                              else handleDeleteWorksheet(row.raw.id)
                            }}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all text-xs p-0.5"
                            title="삭제"
                          >
                            ✕
                          </button>
                        </div>
                        {/* ── Line 2 (트림/옵션) ── */}
                        {row.trim && (
                          <div
                            className="text-[10.5px] text-slate-500 leading-snug break-words"
                            style={{ gridColumn: '3 / span 4', gridRow: 2 }}
                            onClick={handleClick}
                          >
                            {row.trim}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        </div>
      );
      })()}

      {/* ===== 등록차량 선택 (보험/가입 페이지 디자인 기준) ===== */}
      {activeTab === 'registered' && (
      <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 16, boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.06)', marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b6eb5' }} />
          <h3 style={{ fontWeight: 900, color: '#1f2937', fontSize: 14, margin: 0 }}>🚗 등록차량 선택</h3>
        </div>

        {/* 선택된 차량 표시 */}
        {selectedCar && (
          <div style={{ margin: '16px 24px', padding: 16, background: '#eff6ff', border: '2px solid #60a5fa', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, color: '#1e3a5f', fontSize: 18 }}>{selectedCar.brand} {selectedCar.model}</span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{selectedCar.trim || ''}</span>
              {selectedCar.number && <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(59,130,246,0.9)' }}>[{selectedCar.number}]</span>}
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{selectedCar.year}년식</span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 800, background: selectedCar.is_used ? '#fff7ed' : '#eff6ff', color: selectedCar.is_used ? '#c2410c' : '#1d4ed8' }}>
                {selectedCar.is_used ? '중고' : '신차'}
              </span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 800, background: selectedCar.is_commercial === false ? '#f0fdfa' : '#f1f5f9', color: selectedCar.is_commercial === false ? '#0f766e' : '#475569' }}>
                {selectedCar.is_commercial === false ? '비영업' : '영업'}
              </span>
              {selectedCar.is_used && selectedCar.purchase_mileage ? (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>구입시 {(selectedCar.purchase_mileage / 10000).toFixed(1)}만km</span>
              ) : null}
            </div>
            <button onClick={() => { setSelectedCar(null); setCarSearchQuery('') }}
              style={{ fontSize: 13, color: '#9ca3af', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>변경</button>
          </div>
        )}

        {/* 차량 미선택 시: KPI + 필터 + 테이블 */}
        {!selectedCar && (
          <div style={{ padding: '16px 24px 24px' }}>
            {/* KPI 카드 */}
            {cars.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 100px', background: '#fff', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, margin: 0 }}>전체 차량</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: '4px 0 0' }}>{cars.length}<span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 2 }}>대</span></p>
                </div>
                <div style={{ flex: '1 1 100px', background: '#f0fdf4', padding: '12px 16px', borderRadius: 12, border: '1px solid #dcfce7' }}>
                  <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, margin: 0 }}>대기</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#15803d', margin: '4px 0 0' }}>{cars.filter(c => c.status === 'available' || !c.status).length}<span style={{ fontSize: 12, color: '#86efac', marginLeft: 2 }}>대</span></p>
                </div>
                <div style={{ flex: '1 1 100px', background: '#eff6ff', padding: '12px 16px', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                  <p style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, margin: 0 }}>렌트중</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', margin: '4px 0 0' }}>{cars.filter(c => c.status === 'rented').length}<span style={{ fontSize: 12, color: '#93c5fd', marginLeft: 2 }}>대</span></p>
                </div>
              </div>
            )}

            {/* 검색 바 */}
            <input
              type="text"
              placeholder="차량번호, 브랜드, 모델명으로 검색..."
              value={carSearchQuery}
              onChange={(e) => setCarSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, fontSize: 13, fontWeight: 600, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
            />

            {/* 차량 테이블 */}
            <div style={{ maxHeight: 420, overflowY: 'auto', overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.72)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.40)', boxShadow: 'inset 2px 2px 4px rgba(140,170,210,0.12)', borderBottom: '2px solid rgba(0,0,0,0.06)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>차량번호</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>브랜드/모델</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>트림</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>연식</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>구분</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>출고가</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>매입가</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {cars
                    .filter(car => {
                      if (!carSearchQuery.trim()) return true
                      const q = carSearchQuery.toLowerCase()
                      return (car.number || '').toLowerCase().includes(q) || (car.brand || '').toLowerCase().includes(q) || (car.model || '').toLowerCase().includes(q) || (car.trim || '').toLowerCase().includes(q)
                    })
                    .map(car => (
                      <tr
                        key={String(car.id)}
                        onClick={() => { handleCarSelect(String(car.id)); setCarSearchQuery('') }}
                        style={{ cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.04)', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0f7ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 900, fontSize: 15, color: '#111827', whiteSpace: 'nowrap', letterSpacing: 1 }}>{car.number || '-'}</td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 800, color: 'rgba(59,130,246,0.9)' }}>{car.brand}</span>
                          <span style={{ marginLeft: 4, fontWeight: 600, color: '#374151' }}>{car.model}</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: 12 }}>{car.trim || '-'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280', fontFamily: 'monospace' }}>{car.year}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800, marginRight: 2, background: car.is_used ? '#fff7ed' : '#eff6ff', color: car.is_used ? '#ea580c' : '#2563eb' }}>
                            {car.is_used ? '중고' : '신차'}
                          </span>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800, background: car.is_commercial === false ? '#f0fdfa' : '#f1f5f9', color: car.is_commercial === false ? '#0d9488' : '#64748b' }}>
                            {car.is_commercial === false ? '비영업' : '영업'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {car.factory_price ? `${Math.round(car.factory_price / 10000).toLocaleString()}만` : '-'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: 'rgba(59,130,246,0.9)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {car.purchase_price ? `${Math.round(car.purchase_price / 10000).toLocaleString()}만` : '-'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {car.status === 'rented'
                            ? <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: '#fef3c7', color: '#d97706' }}>렌트중</span>
                            : <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: '#dcfce7', color: '#16a34a' }}>대기</span>
                          }
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
              {cars.filter(car => {
                if (!carSearchQuery.trim()) return true
                const q = carSearchQuery.toLowerCase()
                return (car.number || '').toLowerCase().includes(q) || (car.brand || '').toLowerCase().includes(q) || (car.model || '').toLowerCase().includes(q) || (car.trim || '').toLowerCase().includes(q)
              }).length === 0 && (
                <p style={{ textAlign: 'center', color: '#9ca3af', padding: '48px 0', fontSize: 13 }}>
                  {carSearchQuery ? '검색 결과가 없습니다' : '등록된 차량이 없습니다'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      )}

        {/* ====== 공통 계층형 선택 UI: 개별소비세 → 유종 → 차종 그룹 → 트림 → 컬러 → 옵션 ====== */}
        {/* 저장목록에서 차량 데이터 선택 시 표시 */}
        {(activeTab === 'newcar' || activeTab === 'catalog') && (lookupMode === 'newcar' || lookupMode === 'saved') && newCarResult && newCarResult.variants?.length > 0 && (() => {
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
          <div className="mt-4 p-5 border border-steel-200 rounded-2xl space-y-4" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
            {/* 모델 헤더 + 저장 버튼 */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-slate-600">
                {newCarResult.brand} {newCarResult.model} — {newCarResult.year}년식
              </span>
              <span className="text-xs px-2 py-0.5 bg-steel-100 text-steel-700 rounded-full font-bold">
                차종 {newCarResult.variants.length}개
              </span>
              {newCarResult.source?.includes('견적서') && (
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                  📄 견적서 추출
                </span>
              )}
              {lookupMode === 'saved' && (
                <button
                  onClick={() => { setNewCarResult(null); setSelectedCar(null) }}
                  className="ml-auto text-xs px-3 py-1 bg-gray-100 text-slate-500 border border-black/[0.06] rounded-lg font-bold hover:bg-gray-100 transition-colors"
                >
                  ✕ 선택 해제
                </button>
              )}
              {lookupMode === 'newcar' && (
                <button
                  onClick={handleSaveCarPrice}
                  disabled={isSavingPrice}
                  className="ml-auto text-xs px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-bold hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                >
                  {isSavingPrice ? '저장 중...' : '💾 가격 저장'}
                </button>
              )}
            </div>

            {/* ── STEP 0 (조건부): 개별소비세 선택 ── */}
            {hasTaxGroups && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">① 개별소비세 선택</label>
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
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
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
                          : 'border-black/[0.06] hover:border-amber-300 bg-white text-slate-600'
                      }`}
                    >
                      <span>🏷️ {tax}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP: 유종(연료) 선택 ── */}
            {(!hasTaxGroups || newCarSelectedTax) && (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">{stepIcons[stepOffset]} 유종 선택</label>
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
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
                        setNewCarPurchasePrice('')
                        setSelectedCar(null)
                        const matched = taxFilteredVariants.filter(v => v.fuel_type === fuel)
                        if (matched.length === 1) setNewCarSelectedVariant(matched[0])
                      }}
                      className={`px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                        newCarSelectedFuel === fuel
                          ? 'border-steel-500 bg-steel-50 text-steel-700 shadow-md'
                          : 'border-black/[0.06] hover:border-steel-300 bg-white text-slate-600'
                      }`}
                    >
                      <span>{fuelIcon[fuel] || '🚗'} {fuel}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            )}

            {/* ── STEP: 차종 그룹 선택 ── */}
            {newCarSelectedFuel && filteredVariants.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">{stepIcons[1 + stepOffset]} 차종 그룹 선택</label>
                <div className="flex flex-wrap gap-2">
                  {filteredVariants.map((v, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setNewCarSelectedVariant(v)
                        setNewCarSelectedTrim(null)
                        setNewCarSelectedOptions([])
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
                        setNewCarPurchasePrice('')
                        setSelectedCar(null)
                      }}
                      className={`px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                        newCarSelectedVariant?.variant_name === v.variant_name
                          ? 'border-steel-500 bg-steel-50 text-steel-700 shadow-md'
                          : 'border-black/[0.06] hover:border-steel-300 bg-white text-slate-600'
                      }`}
                    >
                      <span>{v.variant_name}</span>
                      <span className="ml-2 text-xs opacity-60">{v.engine_cc > 0 ? `${f(v.engine_cc)}cc` : '전기'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP: 트림 선택 ── */}
            {newCarSelectedVariant && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">
                  {stepIcons[2 + stepOffset]} 트림 선택 — {newCarSelectedVariant.variant_name}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {newCarSelectedVariant.trims.map((trim, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setNewCarSelectedTrim(trim)
                        setNewCarSelectedOptions([])
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
                        setNewCarPurchasePrice('')
                        setSelectedCar(null)
                        // 트림 선택 시 출고가/매입가 즉시 반영
                        setFactoryPrice(Number(trim.base_price))
                        setPurchasePrice(Number(trim.base_price))
                        // 트림 선택 즉시 차량옵션 스텝으로 이동
                        setWizardStep('options')
                      }}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        newCarSelectedTrim?.name === trim.name
                          ? 'border-steel-500 bg-steel-50 shadow-md'
                          : 'border-black/[0.06] hover:border-steel-300 bg-white'
                      }`}
                    >
                      <p className="font-bold text-slate-700">{trim.name}</p>
                      <p className="text-steel-600 font-bold mt-1">{f(trim.base_price)}원</p>
                      {trim.note && <p className="text-xs text-slate-500 mt-1">{trim.note}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── 트림 선택 시 자동으로 options step 이동 (별도 안내바 불필요) ── */}

            {/* ── STEP: 외장 컬러 선택 (vehicle step에서 숨김) ── */}
            {wizardStep !== 'vehicle' && newCarSelectedTrim && (newCarSelectedTrim.exterior_colors?.length ?? 0) > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">{stepIcons[3 + stepOffset]} 외장 컬러</label>
                <div className="flex flex-wrap gap-2">
                  {newCarSelectedTrim.exterior_colors!.map((color, idx) => (
                    <button
                      key={idx}
                      onClick={() => setNewCarSelectedExterior(
                        newCarSelectedExterior?.name === color.name ? null : color
                      )}
                      className={`px-3 py-2 text-xs rounded-xl border font-bold transition-colors ${
                        newCarSelectedExterior?.name === color.name
                          ? 'bg-gray-100 text-white border-black/[0.06]'
                          : 'bg-white text-slate-400 border-black/[0.06] hover:border-gray-400'
                      }`}
                    >
                      {color.name}
                      {color.code && <span className="ml-1 opacity-60">({color.code})</span>}
                      {color.price > 0 && <span className="ml-1 text-steel-400">+{(color.price).toLocaleString()}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP: 내장 컬러 선택 (vehicle step에서 숨김) ── */}
            {wizardStep !== 'vehicle' && newCarSelectedTrim && (newCarSelectedTrim.interior_colors?.length ?? 0) > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">{stepIcons[4 + stepOffset]} 내장 컬러</label>
                <div className="flex flex-wrap gap-2">
                  {newCarSelectedTrim.interior_colors!.map((color, idx) => (
                    <button
                      key={idx}
                      onClick={() => setNewCarSelectedInterior(
                        newCarSelectedInterior?.name === color.name ? null : color
                      )}
                      className={`px-3 py-2 text-xs rounded-xl border font-bold transition-colors ${
                        newCarSelectedInterior?.name === color.name
                          ? 'bg-gray-100 text-white border-black/[0.06]'
                          : 'bg-white text-slate-400 border-black/[0.06] hover:border-gray-400'
                      }`}
                    >
                      {color.name}
                      {color.code && <span className="ml-1 opacity-60">({color.code})</span>}
                      {color.price > 0 && <span className="ml-1 text-steel-400">+{(color.price).toLocaleString()}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {wizardStep !== 'vehicle' && newCarSelectedTrim && (!newCarSelectedTrim.exterior_colors || newCarSelectedTrim.exterior_colors.length === 0) && (!newCarSelectedTrim.interior_colors || newCarSelectedTrim.interior_colors.length === 0) && (
              <div className="text-xs text-slate-500 bg-gray-50 rounded-xl p-3">
                이 가격표에 컬러 정보가 포함되지 않았습니다. 신차 선택 탭에서 AI 조회하면 컬러가 표시될 수 있습니다.
              </div>
            )}

            {/* ── STEP: 선택 옵션 (vehicle step에서 숨김) ── */}
            {wizardStep !== 'vehicle' && newCarSelectedTrim && newCarSelectedTrim.options?.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">
                  {stepIcons[5 + stepOffset]} 선택 옵션/패키지 <span className="text-slate-500 font-normal">(복수 선택 가능)</span>
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
                            ? 'border-steel-500 bg-steel-50'
                            : 'border-black/[0.06] hover:border-steel-300 bg-white'
                        }`}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                          isChecked ? 'bg-steel-600 text-white' : 'bg-gray-100 border border-white/10'
                        }`}>
                          {isChecked && <span className="text-xs">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-slate-700">{opt.name}</p>
                          <p className="text-steel-600 font-bold text-sm">+{f(opt.price)}원</p>
                          {opt.description && <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── 최종 가격 요약 + 매입가 + 분석 시작 (vehicle step에서 숨김) ── */}
            {wizardStep !== 'vehicle' && newCarSelectedTrim && (
              <div className="p-4 bg-gray-50 rounded-xl border border-black/[0.06]">
                {/* 가격 요약 */}
                <div className="mb-3 pb-3 border-b border-black/[0.06]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">기본 출고가</span>
                    <span className="font-bold text-slate-600">{f(newCarSelectedTrim.base_price)}원</span>
                  </div>
                  {(newCarSelectedExterior?.price || 0) > 0 && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-slate-500">+ 외장 {newCarSelectedExterior!.name}</span>
                      <span className="font-bold text-steel-600">+{f(newCarSelectedExterior!.price)}원</span>
                    </div>
                  )}
                  {(newCarSelectedInterior?.price || 0) > 0 && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-slate-500">+ 내장 {newCarSelectedInterior!.name}</span>
                      <span className="font-bold text-steel-600">+{f(newCarSelectedInterior!.price)}원</span>
                    </div>
                  )}
                  {newCarSelectedOptions.length > 0 && (
                    <>
                      {newCarSelectedOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm mt-1">
                          <span className="text-slate-500">+ {opt.name}</span>
                          <span className="font-bold text-steel-600">+{f(opt.price)}원</span>
                        </div>
                      ))}
                    </>
                  )}
                  {(newCarSelectedOptions.length > 0 || (newCarSelectedExterior?.price || 0) > 0 || (newCarSelectedInterior?.price || 0) > 0) && (
                    <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-black/[0.06]">
                      <span className="font-bold text-slate-600">최종 출고가</span>
                      <span className="font-bold text-lg text-slate-800">
                        {f(Number(newCarSelectedTrim.base_price) + newCarSelectedOptions.reduce((s, o) => s + Number(o.price), 0) + Number(newCarSelectedExterior?.price || 0) + Number(newCarSelectedInterior?.price || 0))}원
                      </span>
                    </div>
                  )}
                </div>

                {/* 매입 할인 입력 + 분석 시작 */}
                {(() => {
                  const colorExtra = Number(newCarSelectedExterior?.price || 0) + Number(newCarSelectedInterior?.price || 0)
                  const totalFactory = Number(newCarSelectedTrim.base_price) + newCarSelectedOptions.reduce((s, o) => s + Number(o.price), 0) + colorExtra
                  const discountAmt = parseNum(newCarPurchasePrice)
                  const finalPurchase = discountAmt > 0 ? totalFactory - discountAmt : totalFactory
                  return (
                    <>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="font-bold text-slate-600">예상 매입가</span>
                        <span className="font-black text-lg text-slate-800">{f(finalPurchase)}원</span>
                      </div>
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-500 mb-1">
                            할인 금액
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="0"
                              value={newCarPurchasePrice}
                              onChange={(e) => setNewCarPurchasePrice(e.target.value.replace(/[^0-9,]/g, ''))}
                              className="w-full p-3 pr-8 border border-black/[0.06] rounded-lg font-bold text-base focus:border-steel-400 outline-none"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">원</span>
                          </div>
                          {discountAmt > 0 && (
                            <span className="text-[11px] text-steel-600 font-bold mt-1 block">
                              출고가 대비 {(discountAmt / totalFactory * 100).toFixed(1)}% 할인
                            </span>
                          )}
                        </div>
                        <button
                          onClick={handleNewCarAnalysis}
                          className="px-6 py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          분석 시작
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        * 할인 없으면 비워두세요. 매입가 = 출고가 그대로 적용됩니다.
                      </p>
                    </>
                  )
                })()}
              </div>
            )}

            <p className="text-xs text-slate-500 text-right">
              * AI 자동 조회 결과입니다. 실제 출고가와 차이가 있을 수 있습니다.
            </p>
          </div>
          )
        })()}

        {/* 선택된 차량 요약 */}
        {selectedCar && (
          <div className="mt-4">
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-black/5 bg-gray-50/50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-steel-500" />
                <span className="text-xs font-bold text-slate-400">
                  {wizardStep === 'vehicle' ? '선택된 차량' : '분석 차량 정보'}
                </span>
                {(lookupMode === 'newcar' || lookupMode === 'saved') && newCarResult && (
                  <span className="text-[10px] px-2 py-0.5 bg-steel-100 text-steel-700 rounded-full font-bold ml-auto">✨ 신차 시뮬레이션</span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100">
                {((lookupMode === 'newcar' || lookupMode === 'saved') && newCarResult ? [
                  { label: '구분', value: '🆕 신차', accent: false },
                  { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}`, accent: true },
                  { label: '트림', value: selectedCar.trim || '-', accent: false },
                  { label: '출고가', value: `${f(selectedCar.factory_price || 0)}원`, accent: true },
                ] : [
                  { label: '차량번호', value: selectedCar.number, accent: true },
                  { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}`, accent: true },
                  { label: '구분', value: `${selectedCar.is_used ? '중고' : '신차'} / ${selectedCar.is_commercial === false ? '비영업' : '영업'}`, accent: false },
                  { label: '연식', value: `${selectedCar.year}년`, accent: false },
                  { label: '주행거리', value: `${f(selectedCar.mileage || 0)}km`, accent: false },
                  ...(selectedCar.is_used && selectedCar.purchase_mileage ? [
                    { label: '구입시 주행', value: `${f(selectedCar.purchase_mileage)}km`, accent: false },
                  ] : []),
                  { label: '매입가', value: `${f(selectedCar.purchase_price)}원`, accent: true },
                ]).map((item: any, i: number) => (
                  <div key={i} className="bg-white px-4 py-3">
                    <span className="text-[10px] text-slate-500 block mb-0.5">{item.label}</span>
                    <span className={`font-bold text-sm ${item.accent ? 'text-slate-800' : 'text-slate-400'}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 차량선택 → 차량옵션 다음 단계 네비게이션 */}
        {selectedCar && wizardStep === 'vehicle' && (
          <div className="max-w-[800px] mx-auto mt-4 flex items-center justify-between bg-blue-50/80 border border-blue-200/60 rounded-xl px-4 py-3">
            <span className="text-xs font-bold text-blue-600">✓ {selectedCar.brand} {selectedCar.model} 선택됨</span>
            <button
              onClick={() => setWizardStep('options')}
              className="px-4 py-1.5 rounded-lg text-white text-xs font-bold hover:opacity-90 transition-opacity"
              style={{ background: '#3b6eb5' }}
            >
              다음: 차량옵션 →
            </button>
          </div>
        )}

        {/* 카탈로그 트림 선택 시 버튼은 카드 안에 포함 (line ~3663) → 하단 fallback 불필요 */}
      </>)}

      {/* ===== Step 2: 차량옵션 (색상 · 패키지 · 매입가) ===== */}
      {wizardStep === 'options' && (<>
        {/* 차량 요약 바 */}
        <div className="mb-4 flex items-center justify-between bg-white/70 backdrop-blur-md border border-black/5 rounded-2xl px-4 py-2.5">
          <div className="flex items-center gap-3 text-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-bold text-slate-700">
              {newCarResult ? `${newCarResult.brand} ${newCarResult.model}` : selectedCar ? `${selectedCar.brand} ${selectedCar.model}` : ''}
            </span>
            {newCarSelectedVariant && (
              <><span className="text-slate-400">·</span><span className="text-slate-500 text-xs">{newCarSelectedVariant.variant_name}</span></>
            )}
            {newCarSelectedTrim && (
              <><span className="text-slate-400">·</span><span className="text-slate-500 text-xs">{newCarSelectedTrim.name}</span></>
            )}
            {selectedCar && !newCarResult && (
              <><span className="text-slate-400">·</span><span className="text-slate-500 text-xs">{selectedCar.year}년 · {selectedCar.number || ''}</span></>
            )}
          </div>
          <button onClick={() => setWizardStep('vehicle')} className="text-xs text-slate-500 hover:text-slate-700 font-bold px-3 py-1 rounded-lg hover:bg-slate-100">
            ← 차량 변경
          </button>
        </div>

        {/* === 신차 카탈로그: 외장/내장/옵션/가격 === */}
        {(lookupMode === 'newcar' || lookupMode === 'saved') && newCarSelectedTrim && (
          <div className="p-5 border border-steel-200 rounded-2xl space-y-4" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
            {/* 트림 요약 헤더 */}
            <div className="flex items-center gap-3 pb-3 border-b border-black/[0.06]">
              <span className="text-sm font-bold text-slate-600">
                {newCarResult?.brand} {newCarResult?.model} — {newCarSelectedVariant?.variant_name} / {newCarSelectedTrim.name}
              </span>
              <span className="text-xs px-2 py-0.5 bg-steel-100 text-steel-700 rounded-full font-bold">
                기본가 {f(newCarSelectedTrim.base_price)}원
              </span>
            </div>

            {/* 외장 컬러 선택 */}
            {newCarSelectedTrim.exterior_colors?.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">① 외장 컬러</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {newCarSelectedTrim.exterior_colors.map((color: any, idx: number) => (
                    <button key={idx}
                      onClick={() => { setNewCarSelectedExterior(color); setNewCarPurchasePrice(''); setSelectedCar(null) }}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border-2 transition-all text-left ${
                        newCarSelectedExterior?.name === color.name
                          ? 'border-steel-500 bg-steel-50 shadow-md'
                          : 'border-black/[0.06] hover:border-steel-300 bg-white'
                      }`}
                    >
                      {color.hex && <div className="w-6 h-6 rounded-full border border-black/10 shrink-0" style={{ background: color.hex }} />}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs text-slate-700 truncate">{color.name}</p>
                        {color.price > 0 && <p className="text-steel-600 font-bold text-xs">+{f(color.price)}원</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 내장 컬러 선택 */}
            {newCarSelectedTrim.interior_colors?.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">② 내장 컬러</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {newCarSelectedTrim.interior_colors.map((color: any, idx: number) => (
                    <button key={idx}
                      onClick={() => { setNewCarSelectedInterior(color); setNewCarPurchasePrice(''); setSelectedCar(null) }}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border-2 transition-all text-left ${
                        newCarSelectedInterior?.name === color.name
                          ? 'border-steel-500 bg-steel-50 shadow-md'
                          : 'border-black/[0.06] hover:border-steel-300 bg-white'
                      }`}
                    >
                      {color.hex && <div className="w-6 h-6 rounded-full border border-black/10 shrink-0" style={{ background: color.hex }} />}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs text-slate-700 truncate">{color.name}</p>
                        {color.price > 0 && <p className="text-steel-600 font-bold text-xs">+{f(color.price)}원</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 컬러 정보 없음 안내 */}
            {(!newCarSelectedTrim.exterior_colors || newCarSelectedTrim.exterior_colors.length === 0) && (!newCarSelectedTrim.interior_colors || newCarSelectedTrim.interior_colors.length === 0) && (
              <div className="text-xs text-slate-500 bg-gray-50 rounded-xl p-3">
                이 가격표에 컬러 정보가 포함되지 않았습니다.
              </div>
            )}

            {/* 선택 옵션/패키지 */}
            {newCarSelectedTrim.options?.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">
                  ③ 선택 옵션/패키지 <span className="text-slate-500 font-normal">(복수 선택 가능)</span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {newCarSelectedTrim.options.map((opt: any, idx: number) => {
                    const isChecked = newCarSelectedOptions.some((o: any) => o.name === opt.name)
                    return (
                      <button key={idx}
                        onClick={() => { setNewCarSelectedOptions((prev: any[]) => isChecked ? prev.filter((o: any) => o.name !== opt.name) : [...prev, opt]); setNewCarPurchasePrice(''); setSelectedCar(null) }}
                        className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                          isChecked ? 'border-steel-500 bg-steel-50' : 'border-black/[0.06] hover:border-steel-300 bg-white'
                        }`}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${isChecked ? 'bg-steel-600 text-white' : 'bg-gray-100 border border-white/10'}`}>
                          {isChecked && <span className="text-xs">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-slate-700">{opt.name}</p>
                          <p className="text-steel-600 font-bold text-sm">+{f(opt.price)}원</p>
                          {opt.description && <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 최종 가격 요약 + 매입 할인 + 분석 시작 */}
            <div className="p-4 bg-gray-50 rounded-xl border border-black/[0.06]">
              {/* 가격 요약 */}
              <div className="mb-3 pb-3 border-b border-black/[0.06]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">기본 출고가</span>
                  <span className="font-bold text-slate-600">{f(newCarSelectedTrim.base_price)}원</span>
                </div>
                {(newCarSelectedExterior?.price || 0) > 0 && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-slate-500">+ 외장 {newCarSelectedExterior!.name}</span>
                    <span className="font-bold text-steel-600">+{f(newCarSelectedExterior!.price)}원</span>
                  </div>
                )}
                {(newCarSelectedInterior?.price || 0) > 0 && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-slate-500">+ 내장 {newCarSelectedInterior!.name}</span>
                    <span className="font-bold text-steel-600">+{f(newCarSelectedInterior!.price)}원</span>
                  </div>
                )}
                {newCarSelectedOptions.length > 0 && newCarSelectedOptions.map((opt: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-sm mt-1">
                    <span className="text-slate-500">+ {opt.name}</span>
                    <span className="font-bold text-steel-600">+{f(opt.price)}원</span>
                  </div>
                ))}
                {(() => {
                  const colorExtra = Number(newCarSelectedExterior?.price || 0) + Number(newCarSelectedInterior?.price || 0)
                  const totalFactory = Number(newCarSelectedTrim.base_price) + newCarSelectedOptions.reduce((s: number, o: any) => s + Number(o.price), 0) + colorExtra
                  return (newCarSelectedOptions.length > 0 || colorExtra > 0) ? (
                    <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-black/[0.06]">
                      <span className="font-bold text-slate-600">최종 출고가</span>
                      <span className="font-bold text-lg text-slate-800">{f(totalFactory)}원</span>
                    </div>
                  ) : null
                })()}
              </div>

              {/* 매입 할인 입력 + 분석 시작 */}
              {(() => {
                const colorExtra = Number(newCarSelectedExterior?.price || 0) + Number(newCarSelectedInterior?.price || 0)
                const totalFactory = Number(newCarSelectedTrim.base_price) + newCarSelectedOptions.reduce((s: number, o: any) => s + Number(o.price), 0) + colorExtra
                const discountAmt = parseNum(newCarPurchasePrice)
                const finalPurchase = discountAmt > 0 ? totalFactory - discountAmt : totalFactory
                return (
                  <>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-bold text-slate-600">예상 매입가</span>
                      <span className="font-black text-lg text-slate-800">{f(finalPurchase)}원</span>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-1">할인 금액</label>
                        <div className="relative">
                          <input type="text" placeholder="0" value={newCarPurchasePrice}
                            onChange={(e) => setNewCarPurchasePrice(e.target.value.replace(/[^0-9,]/g, ''))}
                            className="w-full p-3 pr-8 border border-black/[0.06] rounded-lg font-bold text-base focus:border-steel-400 outline-none" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">원</span>
                        </div>
                        {discountAmt > 0 && (
                          <span className="text-[11px] text-steel-600 font-bold mt-1 block">
                            출고가 대비 {(discountAmt / totalFactory * 100).toFixed(1)}% 할인
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => { handleNewCarAnalysis(); setWizardStep('analysis') }}
                        className="px-6 py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        다음: 상세견적 →
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">* 할인 없으면 비워두세요. 매입가 = 출고가 그대로 적용됩니다.</p>
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* === 등록차량: 간단 요약 + 다음 === */}
        {lookupMode === 'registered' && selectedCar && (
          <div className="space-y-4">
            {/* 차량 상세 요약 카드 */}
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-black/5 bg-gray-50/50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-slate-400">등록 차량 정보</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100">
                {[
                  { label: '차량번호', value: selectedCar.number, accent: true },
                  { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}`, accent: true },
                  { label: '구분', value: `${selectedCar.is_used ? '중고' : '신차'} / ${selectedCar.is_commercial === false ? '비영업' : '영업'}`, accent: false },
                  { label: '연식', value: `${selectedCar.year}년`, accent: false },
                  { label: '주행거리', value: `${f(selectedCar.mileage || 0)}km`, accent: false },
                  { label: '출고가', value: `${f(selectedCar.factory_price || 0)}원`, accent: false },
                  { label: '매입가', value: `${f(selectedCar.purchase_price)}원`, accent: true },
                  { label: '배기량', value: `${(selectedCar.engine_cc || 0).toLocaleString()}cc`, accent: false },
                ].map((item: any, i: number) => (
                  <div key={i} className="bg-white px-4 py-3">
                    <span className="text-[10px] text-slate-500 block mb-0.5">{item.label}</span>
                    <span className={`font-bold text-sm ${item.accent ? 'text-slate-800' : 'text-slate-400'}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-xs text-emerald-600 font-bold">등록차량은 이미 사양이 확정되어 있습니다. 바로 상세견적으로 이동합니다.</p>
            </div>

            {/* 네비게이션 */}
            <div className="flex justify-between">
              <button onClick={() => setWizardStep('vehicle')} className="text-sm text-slate-500 hover:text-slate-600 font-bold">
                ← 차량 변경
              </button>
              <button onClick={() => setWizardStep('analysis')}
                className="px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 shadow-sm"
                style={{ background: '#3b6eb5' }}>
                다음: 상세견적 →
              </button>
            </div>
          </div>
        )}

        {/* === 신차인데 아직 옵션/가격 확인 전 (selectedCar 있음) → 바로 다음 단계 === */}
        {(lookupMode === 'newcar' || lookupMode === 'saved') && selectedCar && !newCarSelectedTrim && (
          <div className="flex justify-between mt-6">
            <button onClick={() => setWizardStep('vehicle')} className="text-sm text-slate-500 hover:text-slate-600 font-bold">
              ← 차량 변경
            </button>
            <button onClick={() => setWizardStep('analysis')}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 shadow-sm"
              style={{ background: '#3b6eb5' }}>
              다음: 상세견적 →
            </button>
          </div>
        )}
      </>)}

      {/* ===== Step 3: 상세견적 (계약조건 · 렌트가) ===== */}
      {wizardStep === 'analysis' && selectedCar && (
        <div className="mb-4 flex items-center justify-between bg-white/70 backdrop-blur-md border border-black/5 rounded-2xl px-4 py-2.5">
          <div className="flex items-center gap-3 text-sm">
            <span className="w-2 h-2 rounded-full bg-steel-500" />
            <span className="font-bold text-slate-700">{selectedCar.brand} {selectedCar.model}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 text-xs">{selectedCar.year}년 · {selectedCar.is_used ? '중고' : '신차'}</span>
            {selectedCar.number && <><span className="text-slate-400">·</span><span className="text-slate-500 text-xs">{selectedCar.number}</span></>}
          </div>
          <button
            onClick={() => setWizardStep('vehicle')}
            className="text-xs text-slate-500 hover:text-slate-700 font-bold px-3 py-1 rounded-lg hover:bg-slate-100"
          >
            ← 차량 변경
          </button>
        </div>
      )}

      {wizardStep === 'analysis' && selectedCar && calculations && (
        <>
          {/* ===== Option H: 상단 컨트롤 (프리셋 + 비교 + 역산 + 시중가) — 고급만 ===== */}
          {advancedMode && (<><OptionHPanel
            monthlyTotalCost={calculations.totalMonthlyCost}
            monthlyRentWithVat={calculations.rentWithVAT}
            brand={selectedCar.brand}
            model={selectedCar.model}
            year={selectedCar.year}
            termMonths={termMonths}
            annualMileage={annualMileage}
            onApplyPreset={(mode: OptionHPresetMode) => {
              // 프리셋에 따른 주요 레버 일괄 세팅
              if (mode === 'conservative') {
                setMargin(15); setResidualRate(Math.max(residualRate, 50)); setLoanRate(Math.min(loanRate, 4.5))
              } else if (mode === 'standard') {
                setMargin(10); setResidualRate(45); setLoanRate(5.5)
              } else if (mode === 'aggressive') {
                setMargin(5); setResidualRate(40); setLoanRate(6.5)
              }
            }}
            onCaptureBaseline={() => {
              // 행별 비교를 위해 주요 월 단위 원가를 전부 저장
              const snap = {
                depreciation: calculations.monthlyDepreciation,
                finance: calculations.totalMonthlyFinance,
                insurance: monthlyInsuranceCost,
                tax: calculations.monthlyTax,
                maintenance: monthlyMaintenance,
                risk: calculations.monthlyRiskReserve,
                discount: -calculations.totalDiscount,
                total: calculations.totalMonthlyCost,
                rent: calculations.rentWithVAT,
              }
              setHBaseline(snap)
              return {
                monthlyTotalCost: calculations.totalMonthlyCost,
                monthlyRentWithVat: calculations.rentWithVAT,
                capturedAt: new Date().toISOString(),
              }
            }}
            onReverseSolve={(targetRent: number) => {
              // 다단계 역산 (Phase 4): 락 해제된 레버 순서대로 조정
              // 1) margin  2) residualRate  3) depositDiscountRate
              // rentWithVAT = (totalMonthlyCost + margin) * 1.1  (천원반올림 무시)
              const targetSuggested = targetRent / 1.1
              let needed = targetSuggested - calculations.totalMonthlyCost // +면 margin ↑, -면 원가 ↓ 필요
              // Lever 1: margin (고정원가 위에 얹는 절대값)
              if (!lockedParams.has('margin')) {
                const nextMargin = Math.max(0, Math.min(calculations.totalMonthlyCost * 0.5, (margin + needed)))
                setMargin(Math.round(nextMargin / 100) * 100)
                needed = needed - (nextMargin - margin)
                if (Math.abs(needed) < 1000) return // 오차 1천원 이내면 종료
              }
              // Lever 2: 잔가율 (needed<0일 때 잔가↑로 감가↓, needed>0일 때 잔가↓로 감가↑)
              if (!lockedParams.has('residualRate') && Math.abs(needed) >= 1000) {
                // 감가 민감도: 1%p 잔가 변화 ≈ costBase * 0.01 / termMonths
                const sens = (calculations.costBase * 0.01) / termMonths
                if (sens > 0) {
                  const deltaRR = -needed / sens // needed>0 → 잔가↓
                  const nextRR = Math.max(20, Math.min(70, residualRate + deltaRR))
                  setResidualRate(Math.round(nextRR * 10) / 10)
                  needed = needed - (-(nextRR - residualRate) * sens)
                  if (Math.abs(needed) < 1000) return
                }
              }
              // Lever 3: 보증금 할인율 (절대값 단위는 월)
              if (!lockedParams.has('depositDiscountRate') && Math.abs(needed) >= 1000 && deposit > 0) {
                // 월할인 = deposit * rate/100 (대략)
                const sens = deposit / 100
                if (sens > 0) {
                  const deltaRate = needed / sens
                  const nextRate = Math.max(0, Math.min(5, depositDiscountRate - deltaRate))
                  setDepositDiscountRate(Math.round(nextRate * 100) / 100)
                }
              }
            }}
          />

          {/* ===== Option H: 스프레드시트 요약 테이블 ===== */}
          {(() => {
            const c = calculations
            const total = Math.max(1, c.totalMonthlyCost)
            const share = (n: number) => (n / total) * 100
            const rows: HTableRow[] = [
              { id: 'acq_factory', group: '취득', label: '출고가', detail: '공장 출고 기준', total: factoryPrice, monthly: undefined, share: undefined, tone: 'blue', strong: false, baseline: undefined, locked: lockedParams.has('factoryPrice'), onToggleLock: () => toggleLock('factoryPrice') },
              { id: 'acq_purchase', group: '취득', label: '매입가', detail: '실제 매입 원가', total: purchasePrice, monthly: undefined, share: undefined, tone: 'blue', locked: lockedParams.has('purchasePrice'), onToggleLock: () => toggleLock('purchasePrice') },
              { id: 'acq_residual', group: '취득', label: '잔존가치', detail: `잔가율 ${residualRate}%`, total: c.residualValue, monthly: undefined, share: undefined, tone: 'blue', locked: lockedParams.has('residualRate'), onToggleLock: () => toggleLock('residualRate') },
              { id: 'dep_monthly', group: '감가', label: '월 감가', detail: `${termMonths}개월 균분`, total: c.monthlyDepreciation * termMonths, monthly: c.monthlyDepreciation, share: share(c.monthlyDepreciation), baseline: hBaseline?.depreciation, tone: 'violet', locked: lockedParams.has('depreciation'), onToggleLock: () => toggleLock('depreciation') },
              { id: 'fin_monthly', group: '금융', label: '금융비용', detail: `이자 ${loanRate}% · 대출 ${f(loanAmount)}원`, total: c.totalMonthlyFinance * termMonths, monthly: c.totalMonthlyFinance, share: share(c.totalMonthlyFinance), baseline: hBaseline?.finance, tone: 'amber', locked: lockedParams.has('finance'), onToggleLock: () => toggleLock('finance') },
              { id: 'ins_monthly', group: '보험', label: '월 보험료', detail: '연동 보험상품 기준', total: monthlyInsuranceCost * termMonths, monthly: monthlyInsuranceCost, share: share(monthlyInsuranceCost), baseline: hBaseline?.insurance, tone: 'emerald', locked: lockedParams.has('insurance'), onToggleLock: () => toggleLock('insurance') },
              { id: 'tax_monthly', group: '세금', label: '세금/검사', detail: `연세+정기검사`, total: (c.monthlyTax + c.monthlyInspectionCost) * termMonths, monthly: c.monthlyTax + c.monthlyInspectionCost, share: share(c.monthlyTax + c.monthlyInspectionCost), tone: 'slate', locked: lockedParams.has('tax'), onToggleLock: () => toggleLock('tax') },
              { id: 'mnt_monthly', group: '정비', label: '월 정비', detail: '정비 패키지', total: monthlyMaintenance * termMonths, monthly: monthlyMaintenance, share: share(monthlyMaintenance), baseline: hBaseline?.maintenance, tone: 'slate', locked: lockedParams.has('maintenance'), onToggleLock: () => toggleLock('maintenance') },
              { id: 'risk_monthly', group: '정비', label: '리스크 적립', detail: '예비비', total: c.monthlyRiskReserve * termMonths, monthly: c.monthlyRiskReserve, share: share(c.monthlyRiskReserve), baseline: hBaseline?.risk, tone: 'slate', locked: lockedParams.has('risk'), onToggleLock: () => toggleLock('risk') },
              { id: 'dep_discount', group: '보증금', label: '보증금 할인', detail: `${f(deposit)}원 × ${depositDiscountRate}%`, total: -c.monthlyDepositDiscount * termMonths, monthly: -c.monthlyDepositDiscount, share: undefined, baseline: hBaseline?.discount, tone: 'rose', locked: lockedParams.has('depositDiscountRate'), onToggleLock: () => toggleLock('depositDiscountRate') },
              { id: 'sum_total', group: '합계', label: '월 총원가', detail: `${f(c.totalMonthlyCost)}원/월 (마진 전)`, total: c.totalMonthlyCost * termMonths, monthly: c.totalMonthlyCost, share: 100, baseline: hBaseline?.total, tone: 'slate', strong: true },
              { id: 'sum_rent', group: '합계', label: '월 렌트가 (VAT포함)', detail: `마진 ${f(margin)}원 + VAT 10%`, total: c.rentWithVAT * termMonths, monthly: c.rentWithVAT, share: undefined, baseline: hBaseline?.rent, tone: 'slate', strong: true },
            ]
            return <OptionHTable rows={rows} compactUnit={false} />
          })()}
          </>)}

        {/* ===== 심플/고급 뷰 토글 ===== */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-2xl p-1 inline-flex gap-1 shadow-sm">
            <button
              onClick={() => setAdvancedMode(false)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                !advancedMode ? 'bg-white/90 text-slate-900 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              📋 심플 뷰
            </button>
            <button
              onClick={() => setAdvancedMode(true)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                advancedMode ? 'bg-white/90 text-slate-900 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              🔬 고급 분석
            </button>
          </div>
          {!advancedMode && (
            <span className="text-[11px] text-slate-500">계약조건 위주 · 원가 항목은 전역 기본값 적용</span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ===== 왼쪽: 입력/분석 영역 ===== */}
          {/* 카달로그 탭에서도 가격표 선택 후 분석 영역 노출 */}
          {(activeTab !== 'catalog' || (lookupMode === 'saved' && newCarResult)) && (
          <div className="lg:col-span-8 space-y-4">

            {/* 🆕 0. AI 자동분류 결과 (고급만) */}
            {advancedMode && autoCategory && (
              <div className="bg-gradient-to-r from-steel-50 to-steel-50 border border-steel-200 rounded-xl p-3 flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold text-steel-800">🤖 기준표 자동 매핑:</span>
                <span className="bg-steel-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">잔가: {autoCategory}</span>
                <span className="bg-steel-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">보험: {autoInsType}</span>
                <span className="bg-amber-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">정비: {autoMaintType}</span>
              </div>
            )}

            {/* === 고급 분석 영역 시작 (advancedMode) === */}
            {advancedMode && (<>
            {/* 1. 차량 취득원가 (3단계: 기준가 → 매입가 → 취득원가) */}
            <Section icon="💰" title={`차량 취득원가 — ${carAgeMode === 'used' ? '중고차' : '신차'}`}>
              {/* ── STEP 1: 기준가 (가격표/시세) ── */}
              <div className="mb-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-black">1</span>
                  <span className="text-xs font-bold text-slate-600">{carAgeMode === 'used' ? '시세 (이론적 시장가)' : '가격표 금액 (출고가)'}</span>
                  <span className="text-[10px] text-slate-500 ml-auto">{carAgeMode === 'used' ? '연식·주행거리 기반 이론가' : '옵션 포함 정가'}</span>
                </div>
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <InputRow label={carAgeMode === 'used' ? '신차 출고가 (감가 기준)' : '출고가 (가격표)'} value={factoryPrice} onChange={setFactoryPrice} />
                    </div>
                    <div className="text-right pl-4 shrink-0">
                      {carAgeMode === 'used' && calculations.theoreticalMarketValue > 0 ? (
                        <>
                          <p className="text-[10px] text-slate-500">차령 {customCarAge}년 이론 시세</p>
                          <p className="text-base font-black text-blue-700">{f(calculations.theoreticalMarketValue)}원</p>
                          <p className="text-[10px] text-slate-500">감가율 {calculations.purchaseTotalDep.toFixed(1)}%</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] text-slate-500">정가 기준</p>
                          <p className="text-base font-black text-blue-700">{f(factoryPrice)}원</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── STEP 2: 매입가 (실구매가) ── */}
              <div className="mb-1">
                <div className="flex items-center gap-2 mb-2 mt-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-black">2</span>
                  <span className="text-xs font-bold text-slate-600">{carAgeMode === 'used' ? '매입가 (실구매가)' : '매입가 (실구매가)'}</span>
                  <span className="text-[10px] text-slate-500 ml-auto">{carAgeMode === 'used' ? '실제 협상/낙찰가' : '할인 반영 실제 결제가'}</span>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <InputRow label={carAgeMode === 'used' ? '중고 매입가' : '매입가 (실 구매가)'} value={purchasePrice} onChange={setPurchasePrice} />
                    </div>
                    <div className="text-right pl-4 shrink-0">
                      {carAgeMode === 'used' ? (
                        calculations.theoreticalMarketValue > 0 ? (
                          <>
                            <p className="text-[10px] text-slate-500">시세 대비 매입</p>
                            <p className={`text-xl font-black ${calculations.purchasePremiumPct <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {calculations.purchasePremiumPct > 0 ? '+' : ''}{calculations.purchasePremiumPct.toFixed(1)}%
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {calculations.purchasePremiumPct <= 0 ? '시세 이하 매입 👍' : '시세 대비 프리미엄'}
                            </p>
                          </>
                        ) : null
                      ) : (
                        factoryPrice > 0 ? (
                          <>
                            <p className="text-[10px] text-slate-500">출고가 대비</p>
                            <p className="text-base font-black text-emerald-600">
                              -{calculations.purchaseDiscount.toFixed(1)}%
                            </p>
                            <p className="text-[10px] text-slate-500">{f(factoryPrice - purchasePrice)}원 할인</p>
                          </>
                        ) : null
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── STEP 3: 취득원가 (매입가 + 부대비용) ── */}
              <div>
                <div className="flex items-center gap-2 mb-2 mt-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-black">3</span>
                  <span className="text-xs font-bold text-slate-600">취득원가 (매입가 + 부대비용)</span>
                  <span className="text-[10px] text-slate-500 ml-auto">렌트가 산정 원가 기준</span>
                </div>

                {/* 등록 지역 선택 */}
                <div className="mb-3 p-3 bg-gray-50 rounded-xl border border-black/[0.06]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-400">차량 등록 지역</p>
                    <span className="text-[10px] text-slate-500">
                      {['서울', '부산', '대구'].includes(registrationRegion)
                        ? `${registrationRegion}: 도시철도채권 · 영업용 매입 의무`
                        : `${registrationRegion}: 지역개발채권 · 영업용 매입 면제`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
                      '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'].map(region => (
                      <button
                        key={region}
                        onClick={() => setRegistrationRegion(region)}
                        className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-colors
                          ${registrationRegion === region
                            ? ['서울', '부산', '대구'].includes(region)
                              ? 'bg-red-500 text-white'
                              : 'bg-green-500 text-white'
                            : 'bg-white text-slate-500 hover:bg-gray-100 border border-black/[0.06]'
                          }`}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                  {bondCost === 0 && (
                    <p className="text-xs text-green-600 font-bold mt-2">
                      {['서울', '부산', '대구'].includes(registrationRegion)
                        ? `배기량 ${engineCC || 0}cc → 면제 대상`
                        : `${registrationRegion} 지역 영업용(렌터카) → 공채매입 면제`}
                    </p>
                  )}
                  {bondCost > 0 && (
                    <p className="text-xs text-red-500 font-bold mt-2">
                      {registrationRegion} 도시철도채권: 영업용 {engineCC >= 2000 ? (registrationRegion === '서울' ? '8%' : '4%') : (registrationRegion === '서울' ? '5%' : '2%')} × 할인매도 후 실부담 {f(bondCost)}원
                    </p>
                  )}
                </div>

                {/* 등록 차량: car_costs 실데이터 / 신차 가격표: 수동 입력 */}
                {carCostItems.length > 0 ? (
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span className="text-xs font-bold text-emerald-700">등록 페이지 비용 데이터 연동</span>
                      </div>
                      <span className="text-[10px] text-emerald-500 font-bold">{carCostItems.length}개 항목</span>
                    </div>
                    {/* 항목별 리스트 */}
                    <div className="space-y-1.5">
                      {carCostItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-gray-100 text-slate-500 w-8 text-center">{item.category}</span>
                            <span className={`font-medium ${item.amount > 0 ? 'text-slate-600' : 'text-slate-400'}`}>{item.item_name}</span>
                          </div>
                          {item.amount > 0 ? (
                            <span className="font-bold text-slate-700">{f(item.amount)}원</span>
                          ) : (
                            <span className="text-[11px] text-slate-400">미입력</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* 합계 */}
                    <div className="pt-3 mt-3 border-t-2 border-emerald-300">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-800">취득원가 합계</span>
                        <span className="text-base font-black text-emerald-800">{f(totalAcquisitionCost)}원</span>
                      </div>
                      {purchasePrice > 0 && totalAcquisitionCost > purchasePrice && (
                        <p className="text-[11px] text-emerald-600 text-right mt-1">
                          매입가 대비 부대비용 +{f(totalAcquisitionCost - purchasePrice)}원 ({((totalAcquisitionCost - purchasePrice) / purchasePrice * 100).toFixed(1)}%)
                        </p>
                      )}
                      {carCostItems.filter(c => c.amount === 0).length > 0 && (
                        <p className="text-[11px] text-amber-500 text-right mt-1">
                          {carCostItems.filter(c => c.amount === 0).length}개 항목 미입력 — 등록 상세에서 입력하세요
                        </p>
                      )}
                    </div>
                    {/* 등록 상세 바로가기 */}
                    {selectedCar && selectedCar.id && !String(selectedCar.id).startsWith('newcar-') && (
                      <button
                        onClick={() => window.open(`/registration/${selectedCar.id}`, '_blank')}
                        className="w-full mt-3 py-2.5 px-4 bg-steel-600 hover:bg-steel-700 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2"
                      >
                        📋 등록 상세에서 비용 수정 →
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    {/* 데이터 없음 안내 */}
                    {selectedCar && selectedCar.id && !String(selectedCar.id).startsWith('newcar-') && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex items-start gap-2">
                        <span className="text-amber-500 text-sm mt-0.5">⚠️</span>
                        <div>
                          <p className="text-xs font-bold text-amber-700">등록 페이지에 비용 데이터가 없습니다</p>
                          <p className="text-[11px] text-amber-600 mt-0.5">아래 수동 입력값으로 산정됩니다. 등록 상세에서 비용을 입력하면 자동 연동됩니다.</p>
                          <button
                            onClick={() => window.open(`/registration/${selectedCar.id}`, '_blank')}
                            className="mt-2 text-xs font-bold text-steel-600 hover:text-steel-800 underline underline-offset-2"
                          >
                            등록 상세에서 비용 입력하기 →
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <ResultRow label="차량 매입가" value={purchasePrice} />
                        <InputRow label={acquisitionTax === 0 && factoryPrice > 0 ? '취득세 (경차 면제)' : `취득세 (${selectedCar?.is_commercial === false ? '비영업용 7%' : '영업용 4%'})`} value={acquisitionTax} onChange={setAcquisitionTax} sub={acquisitionTax === 0 && factoryPrice > 0 ? '경차 취득세 감면' : selectedCar?.is_commercial === false ? '비영업용(일반) 승용차 기준' : '렌터카 대여업 영업용 기준'} />
                        <InputRow
                          label={bondCost > 0 ? `공채 실부담 (${registrationRegion})` : `공채 (${registrationRegion})`}
                          value={bondCost}
                          onChange={setBondCost}
                          sub={bondCost > 0
                            ? `${registrationRegion} 도시철도채권 영업용 · 할인매도 후`
                            : `영업용 매입 면제`}
                        />
                        <InputRow label="탁송료" value={deliveryFee} onChange={setDeliveryFee} />
                        <InputRow label="기타 (번호판/인지/대행/검사)" value={miscFee} onChange={setMiscFee} />
                      </div>
                      <div>
                        <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-xl p-3 h-full flex flex-col justify-center">
                          <div className="text-center">
                            <span className="text-xs text-red-500 font-bold block mb-1">실제 취득원가</span>
                            <span className="text-base font-black text-red-700">{f(totalAcquisitionCost)}원</span>
                            <span className="text-xs text-red-400 block mt-1">
                              매입가 대비 <b>+{f(totalAcquisitionCost - purchasePrice)}원</b> ({purchasePrice > 0 ? ((totalAcquisitionCost - purchasePrice) / purchasePrice * 100).toFixed(1) : 0}%)
                            </span>
                            <p className="text-[11px] text-slate-500 mt-1.5 bg-white/60 rounded-lg p-1.5">
                              수동 입력 기준 산정
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* 2. 시세하락 분석 */}
            <Section icon="📉" title={`시세하락 / 감가 분석 (${termMonths}개월 계약)`} defaultOpen={false} summary={calculations ? <span className="flex items-center gap-2"><span className="text-slate-500">감가율 {calculations.totalDepRateEnd.toFixed(1)}%</span><span className="text-red-500 font-bold">월 {f(calculations.monthlyDepreciation)}원</span></span> : undefined}>
              {/* 차량 구분: 신차 / 연식차량 */}
              <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-black/[0.06]">
                <p className="text-xs font-bold text-slate-500 mb-2.5">차량 구분</p>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => { setCarAgeMode('new'); setCustomCarAge(0) }}
                    className={`flex-1 py-2 px-3 rounded-xl border-2 font-bold text-xs transition-all ${
                      carAgeMode === 'new'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                        : 'border-black/[0.06] bg-white text-slate-500 hover:border-emerald-300'
                    }`}
                  >
                    🆕 신차 <span className="text-xs font-normal ml-1">(차령 0년, 감가 0%에서 시작)</span>
                  </button>
                  <button
                    onClick={() => {
                      setCarAgeMode('used')
                      // 연식 기반 자동 차령 계산
                      if (selectedCar) {
                        const autoAge = Math.max(0, new Date().getFullYear() - (selectedCar.year || new Date().getFullYear()))
                        setCustomCarAge(autoAge)
                      }
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl border-2 font-bold text-xs transition-all ${
                      carAgeMode === 'used'
                        ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm'
                        : 'border-black/[0.06] bg-white text-slate-500 hover:border-amber-300'
                    }`}
                  >
                    🚗 연식차량 <span className="text-xs font-normal ml-1">(차령만큼 이미 감가됨)</span>
                  </button>
                </div>
                {carAgeMode === 'used' && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-slate-500 whitespace-nowrap">현재 차령</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        step="1"
                        value={customCarAge}
                        onChange={(e) => setCustomCarAge(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 text-center border border-black/[0.06] rounded-lg px-2 py-1.5 text-sm font-bold focus:border-amber-500 outline-none"
                      />
                      <span className="text-xs text-slate-500">년</span>
                    </div>
                    {selectedCar && (
                      <span className="text-[11px] text-slate-500">
                        ({selectedCar.year}년식 기준 자동계산: {Math.max(0, new Date().getFullYear() - (selectedCar.year || new Date().getFullYear()))}년)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 감가 기준 설정 (3축 분류 + 곡선 + 보정 통합) */}
              <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-black/[0.06]">
                {/* ① 차종 분류 + 곡선 선택 — 한 줄씩 */}
                {calculations?.autoAxes && (
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-xs font-bold text-slate-400 shrink-0">차종</span>
                    <select value={dbOriginOverride || calculations.autoAxes.origin}
                      onChange={(e) => setDbOriginOverride(e.target.value === calculations.autoAxes?.origin ? '' : e.target.value)}
                      className="text-[11px] border border-black/[0.06] rounded-lg px-2 py-1 bg-white focus:border-steel-500 outline-none font-bold">
                      {['국산', '수입'].map(v => (
                        <option key={v} value={v}>{v}{v === calculations.autoAxes?.origin && !dbOriginOverride ? ' (자동)' : ''}</option>
                      ))}
                    </select>
                    <select value={dbVehicleClassOverride || calculations.autoAxes.vehicle_class}
                      onChange={(e) => setDbVehicleClassOverride(e.target.value === calculations.autoAxes?.vehicle_class ? '' : e.target.value)}
                      className="text-[11px] border border-black/[0.06] rounded-lg px-2 py-1 bg-white focus:border-steel-500 outline-none font-bold">
                      {['경차', '소형_세단', '준중형_세단', '중형_세단', '대형_세단', '소형_SUV', '중형_SUV', '대형_SUV', 'MPV', '프리미엄'].map(v => (
                        <option key={v} value={v}>{v.replace(/_/g, ' ')}{v === calculations.autoAxes?.vehicle_class && !dbVehicleClassOverride ? ' (자동)' : ''}</option>
                      ))}
                    </select>
                    <select value={dbFuelTypeOverride || calculations.autoAxes.fuel_type}
                      onChange={(e) => setDbFuelTypeOverride(e.target.value === calculations.autoAxes?.fuel_type ? '' : e.target.value)}
                      className="text-[11px] border border-black/[0.06] rounded-lg px-2 py-1 bg-white focus:border-steel-500 outline-none font-bold">
                      {['내연기관', '하이브리드', '전기'].map(v => (
                        <option key={v} value={v}>{v}{v === calculations.autoAxes?.fuel_type && !dbFuelTypeOverride ? ' (자동)' : ''}</option>
                      ))}
                    </select>
                    {calculations.matchedDepRate ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-md">DB 매칭</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-md">매칭 없음</span>
                    )}
                    {(dbOriginOverride || dbVehicleClassOverride || dbFuelTypeOverride) && (
                      <button onClick={() => { setDbOriginOverride(''); setDbVehicleClassOverride(''); setDbFuelTypeOverride('') }}
                        className="px-1.5 py-0.5 text-[9px] bg-gray-100 text-slate-400 rounded font-bold hover:bg-gray-100">초기화</button>
                    )}
                  </div>
                )}

                {/* 곡선 프리셋 선택 */}
                <div className="flex gap-1.5 flex-wrap mb-3">
                  <button onClick={() => setDepCurvePreset('db_based')}
                    className={`py-1.5 px-3 text-xs rounded-lg border font-bold transition-colors
                      ${depCurvePreset === 'db_based' ? 'bg-steel-600 text-white border-steel-600' : 'border-black/[0.06] bg-white text-slate-500 hover:border-steel-300'}`}>
                    기준표
                  </button>
                  {(Object.entries(DEP_CURVE_PRESETS) as [string, { label: string; desc: string; curve: number[] }][]).map(([key, preset]) => (
                    <button key={key} onClick={() => setDepCurvePreset(key as DepCurvePreset)}
                      className={`py-1.5 px-3 text-xs rounded-lg border font-bold transition-colors
                        ${depCurvePreset === key ? 'bg-amber-500 text-white border-amber-500' : 'border-black/[0.06] bg-white text-slate-500 hover:border-amber-300'}`}>
                      {preset.label}
                    </button>
                  ))}
                  <button onClick={() => {
                      setDepCurvePreset('custom')
                      if (depCurvePreset !== 'custom' && depCurvePreset !== 'db_based') {
                        setDepCustomCurve([...DEP_CURVE_PRESETS[depCurvePreset as keyof typeof DEP_CURVE_PRESETS].curve])
                      } else if (depCurvePreset === 'db_based' && calculations?.activeCurve) {
                        setDepCustomCurve([...calculations.activeCurve])
                      }
                    }}
                    className={`py-1.5 px-3 text-xs rounded-lg border font-bold transition-colors
                      ${depCurvePreset === 'custom' ? 'bg-amber-500 text-white border-amber-500' : 'border-black/[0.06] bg-white text-slate-500 hover:border-amber-300'}`}>
                    직접입력
                  </button>
                </div>

                {/* ② 감가율 표 (DB 잔존율 + 곡선 통합) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="text-left py-1 pr-2">연차</th>
                        {Array.from({ length: 8 }, (_, i) => (
                          <th key={i} className="text-center py-1 px-1">{i}년</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-slate-400">
                        <td className="py-1 pr-2 text-slate-500 font-bold whitespace-nowrap">
                          누적감가{calculations && calculations.classMult !== 1.0 ? ` ×${calculations.classMult.toFixed(2)}` : ''}
                        </td>
                        {Array.from({ length: 8 }, (_, i) => {
                          const activeCurve = depCurvePreset === 'custom'
                            ? depCustomCurve
                            : calculations?.activeCurve || DEP_CURVE_PRESETS.standard.curve
                          const rate = getDepRateFromCurve(activeCurve, i, calculations?.classMult ?? 1.0)
                          return (
                            <td key={i} className={`text-center py-1 px-1 font-bold
                              ${i === 0 ? 'text-slate-400' : rate > 50 ? 'text-red-500' : 'text-amber-600'}`}>
                              {depCurvePreset === 'custom' && i > 0 ? (
                                <input type="number" step="0.5" min="0" max="95"
                                  value={depCustomCurve[i] ?? ''}
                                  onChange={(e) => { const c = [...depCustomCurve]; c[i] = parseFloat(e.target.value) || 0; setDepCustomCurve(c) }}
                                  className="w-12 text-center border border-amber-200 rounded px-0.5 py-0.5 text-[11px] font-bold focus:border-amber-500 outline-none" />
                              ) : `${rate.toFixed(1)}%`}
                            </td>
                          )
                        })}
                      </tr>
                      <tr className="text-slate-500 border-t border-black/5">
                        <td className="py-1 pr-2 font-bold whitespace-nowrap">잔가율</td>
                        {Array.from({ length: 8 }, (_, i) => {
                          const activeCurve = depCurvePreset === 'custom'
                            ? depCustomCurve
                            : calculations?.activeCurve || DEP_CURVE_PRESETS.standard.curve
                          const rate = getDepRateFromCurve(activeCurve, i, calculations?.classMult ?? 1.0)
                          return <td key={i} className="text-center py-1 px-1">{(100 - rate).toFixed(1)}%</td>
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* ③ 보정 설정 — 인기도 + 차종클래스 + 보정계수 통합 한 줄 */}
                <div className="mt-2 pt-2 border-t border-black/[0.06] flex items-center gap-2 flex-wrap">
                  {calculations?.autoAxes && (
                    <>
                      <span className="text-xs font-bold text-slate-400 shrink-0">인기도</span>
                      <select value={popularityGrade} onChange={(e) => setPopularityGrade(e.target.value)}
                        className="text-[11px] border border-black/[0.06] rounded-lg px-2 py-1 bg-white focus:border-steel-500 outline-none">
                        {depAdjustments.filter(a => a.adjustment_type === 'popularity' && a.is_active).length > 0
                          ? depAdjustments.filter(a => a.adjustment_type === 'popularity' && a.is_active).map(a => (
                              <option key={a.id} value={a.label}>{a.label} (×{Number(a.factor).toFixed(3)})</option>
                            ))
                          : [
                              { label: 'S등급 (인기)', factor: 1.05 },
                              { label: 'A등급 (준인기)', factor: 1.02 },
                              { label: 'B등급 (일반)', factor: 1.0 },
                              { label: 'C등급 (비인기)', factor: 0.97 },
                              { label: 'D등급 (저인기)', factor: 0.93 },
                            ].map(a => (
                              <option key={a.label} value={a.label}>{a.label} (×{a.factor.toFixed(3)})</option>
                            ))
                        }
                      </select>
                    </>
                  )}
                  {calculations && (
                    <>
                      <span className="w-px h-4 bg-gray-100 mx-0.5" />
                      <span className="text-xs font-bold text-slate-400 shrink-0">차종클래스</span>
                      {depCurvePreset === 'db_based' ? (
                        <span className="text-[11px] text-steel-600 font-bold">{calculations.depClass} (기준표 직접)</span>
                      ) : (
                        <select value={depClassOverride} onChange={(e) => setDepClassOverride(e.target.value)}
                          className="text-[11px] border border-black/[0.06] rounded-lg px-2 py-1 bg-white focus:border-amber-500 outline-none">
                          <option value="">자동 ({calculations.depClass})</option>
                          {Object.entries(DEP_CLASS_MULTIPLIER).map(([key, { label, mult }]) => (
                            <option key={key} value={key}>{label} (×{mult.toFixed(2)})</option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                  {calculations && calculations.adjustmentFactor !== 1.0 && (
                    <>
                      <span className="w-px h-4 bg-gray-100 mx-0.5" />
                      <span className="text-[10px] text-slate-500">
                        보정 ×{calculations.adjustmentFactor.toFixed(3)}
                        {calculations.popularityFactor !== 1.0 && <span className="text-purple-600 ml-1">인기도×{calculations.popularityFactor.toFixed(3)}</span>}
                        {calculations.mileageFactor !== 1.0 && <span className="text-blue-600 ml-1">주행×{calculations.mileageFactor.toFixed(3)}</span>}
                        {calculations.marketFactor !== 1.0 && <span className="text-orange-600 ml-1">시장×{calculations.marketFactor.toFixed(3)}</span>}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* ── 중고차 감가 분석 카드 ── */}
              {calculations?.isUsedCar && (
                <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-300">
                  <p className="text-xs font-bold text-amber-700 mb-3">🔄 중고차 감가 분석 (회사/고객 부담 분리)</p>

                  {/* 매입 분석 */}
                  <div className="mb-3 p-3 bg-white rounded-lg border border-amber-200">
                    <p className="text-[11px] font-bold text-slate-400 mb-2">■ 매입 분석</p>
                    <table className="w-full text-[11px]">
                      <tbody>
                        <tr><td className="text-slate-500 py-0.5 pr-2">출고가 (신차)</td><td className="text-right font-bold py-0.5">{factoryPrice.toLocaleString()}원</td></tr>
                        <tr><td className="text-slate-500 py-0.5 pr-2">중고 매입가</td><td className="text-right font-bold text-blue-600 py-0.5">{purchasePrice.toLocaleString()}원</td></tr>
                        {totalAcquisitionCost > 0 && totalAcquisitionCost !== purchasePrice && (
                          <tr><td className="text-slate-500 py-0.5 pr-2">구입비용 합계 (부대비용 포함)</td><td className="text-right font-bold text-blue-700 py-0.5">{totalAcquisitionCost.toLocaleString()}원</td></tr>
                        )}
                        <tr className="border-t border-amber-100"><td className="text-slate-500 py-0.5 pr-2 pt-1">구입 시 차령</td><td className="text-right font-bold py-0.5 pt-1">{calculations.carAge}년</td></tr>
                        <tr><td className="text-slate-500 py-0.5 pr-2">구입 시 연식감가율</td><td className="text-right font-bold text-amber-600 py-0.5">{calculations.purchaseYearDep.toFixed(1)}%</td></tr>
                        <tr><td className="text-slate-500 py-0.5 pr-2">구입 시 주행거리</td><td className="text-right font-bold py-0.5">{(calculations.purchaseMileage10k * 10000).toLocaleString()}km</td></tr>
                        <tr><td className="text-slate-500 py-0.5 pr-2">구입차령 기준주행</td><td className="text-right font-bold py-0.5">{(calculations.purchaseAvgMileage * 10000).toLocaleString()}km</td></tr>
                        <tr>
                          <td className="text-slate-500 py-0.5 pr-2">구입 시 주행감가</td>
                          <td className={`text-right font-bold py-0.5 ${calculations.purchaseMileageDep > 0 ? 'text-red-500' : calculations.purchaseMileageDep < 0 ? 'text-blue-500' : 'text-slate-500'}`}>
                            {calculations.purchaseMileageDep > 0 ? '+' : ''}{calculations.purchaseMileageDep.toFixed(1)}%
                            {calculations.purchaseExcessMileage < 0 ? ' (저주행)' : calculations.purchaseExcessMileage > 0 ? ' (과주행)' : ''}
                          </td>
                        </tr>
                        <tr><td className="text-slate-500 py-0.5 pr-2">구입시점 총감가율</td><td className="text-right font-bold text-amber-600 py-0.5">{calculations.purchaseTotalDep.toFixed(1)}%</td></tr>
                        <tr className="border-t border-amber-100">
                          <td className="text-slate-500 py-0.5 pr-2 pt-1">이론 시장가</td>
                          <td className="text-right font-bold py-0.5 pt-1">{calculations.theoreticalMarketValue.toLocaleString()}원</td>
                        </tr>
                        <tr>
                          <td className="text-slate-500 font-bold py-0.5 pr-2">시세 대비</td>
                          <td className={`text-right font-bold py-0.5 ${calculations.purchasePremiumPct < 0 ? 'text-green-600' : calculations.purchasePremiumPct > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                            {calculations.theoreticalMarketValue > 0 ? `${(purchasePrice / calculations.theoreticalMarketValue * 100).toFixed(1)}%` : '-'}
                            {calculations.purchasePremiumPct < -1 ? ` (${Math.abs(calculations.purchasePremiumPct).toFixed(1)}% 절감)` : calculations.purchasePremiumPct > 1 ? ` (${calculations.purchasePremiumPct.toFixed(1)}% 프리미엄)` : ' (적정)'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 고객 적용 감가 */}
                  <div className="mb-3 p-3 bg-white rounded-lg border border-amber-200">
                    <p className="text-[11px] font-bold text-slate-400 mb-2">■ 고객 적용 감가 ({termMonths}개월 후)</p>
                    <table className="w-full text-[11px]">
                      <tbody>
                        <tr><td colSpan={2} className="text-slate-500 font-bold pt-1 pb-0.5">연식감가</td></tr>
                        <tr><td className="text-slate-500 pl-2 py-0.5">구입시 → 종료시</td><td className="text-right font-bold py-0.5">{calculations.purchaseYearDep.toFixed(1)}% → {calculations.yearDepEnd.toFixed(1)}%</td></tr>
                        <tr><td className="text-slate-500 pl-2 py-0.5">고객 적용분</td><td className="text-right font-bold text-amber-600 py-0.5">+{calculations.customerYearDep.toFixed(1)}%p</td></tr>

                        <tr><td colSpan={2} className="text-slate-500 font-bold pt-2 pb-0.5">주행감가 (계약기간 기준초과분만)</td></tr>
                        <tr><td className="text-slate-500 pl-2 py-0.5">계약기간 고객주행</td><td className="text-right font-bold py-0.5 whitespace-nowrap">{(calculations.customerDriven10k * 10000).toLocaleString()}km</td></tr>
                        <tr><td className="text-slate-500 pl-2 py-0.5">계약기간 기준주행</td><td className="text-right font-bold py-0.5 whitespace-nowrap">{(calculations.standardAddition10k * 10000).toLocaleString()}km</td></tr>
                        <tr>
                          <td className="text-slate-500 pl-2 py-0.5 font-bold">고객 초과주행</td>
                          <td className={`text-right font-bold py-0.5 whitespace-nowrap ${calculations.customerExcessMileage > 0 ? 'text-red-500' : calculations.customerExcessMileage < 0 ? 'text-blue-500' : 'text-slate-500'}`}>
                            {calculations.customerExcessMileage > 0 ? '+' : ''}{(calculations.customerExcessMileage * 10000).toLocaleString()}km
                          </td>
                        </tr>
                        <tr>
                          <td className="text-slate-500 pl-2 py-0.5">고객 주행감가율</td>
                          <td className={`text-right font-bold py-0.5 ${calculations.customerMileageDep > 0 ? 'text-red-500' : calculations.customerMileageDep < 0 ? 'text-blue-500' : 'text-slate-500'}`}>
                            {calculations.customerMileageDep > 0 ? '+' : ''}{calculations.customerMileageDep.toFixed(1)}%
                          </td>
                        </tr>
                        <tr className="border-t border-amber-100">
                          <td colSpan={2} className="text-slate-500 text-[10px] pt-1 pl-2">
                            종료시 총 {((calculations.purchaseMileage10k + calculations.customerDriven10k) * 10000).toLocaleString()}km
                            (구입시 {(calculations.purchaseMileage10k * 10000).toLocaleString()} + 계약 {(calculations.customerDriven10k * 10000).toLocaleString()})
                            {' '}· 추가부담: {((calculations.purchaseMileage10k + calculations.standardAddition10k) * 10000).toLocaleString()}km 초과시
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 종합 월감가비 */}
                  <div className="p-3 bg-amber-100/50 rounded-lg border border-amber-300">
                    <p className="text-[11px] font-bold text-slate-400 mb-2">■ 종합</p>
                    <table className="w-full text-[11px]">
                      <tbody>
                        <tr><td className="text-slate-500 py-0.5">고객 적용 감가율</td><td className="text-right font-bold py-0.5 whitespace-nowrap">연식 {calculations.yearDepEnd.toFixed(1)}% + 주행 {calculations.customerMileageDep > 0 ? '+' : ''}{calculations.customerMileageDep.toFixed(1)}% = {calculations.usedCarEndTotalDep.toFixed(1)}%</td></tr>
                        <tr><td className="text-slate-500 py-0.5">종료시 잔존가 (고객기준)</td><td className="text-right font-bold py-0.5">{calculations.usedCarEndMarketValue.toLocaleString()}원</td></tr>
                        <tr><td className="text-slate-500 py-0.5">차량 실제 잔존가 (처분용)</td><td className="text-right font-bold text-slate-500 py-0.5">{calculations.carActualEndMarketValue.toLocaleString()}원</td></tr>
                        {calculations.usedCarEndMarketValue !== calculations.carActualEndMarketValue && (
                          <tr>
                            <td className="text-slate-500 pl-2 py-0.5">회사 손익 (주행상태)</td>
                            <td className={`text-right font-bold py-0.5 ${calculations.carActualEndMarketValue > calculations.usedCarEndMarketValue ? 'text-green-600' : 'text-red-500'}`}>
                              {calculations.carActualEndMarketValue > calculations.usedCarEndMarketValue ? '+' : ''}{(calculations.carActualEndMarketValue - calculations.usedCarEndMarketValue).toLocaleString()}원
                            </td>
                          </tr>
                        )}
                        <tr className="border-t border-amber-200"><td className="text-slate-500 pt-1 py-0.5">원가 ({totalAcquisitionCost > 0 ? '구입비용 합계' : '구입가'})</td><td className="text-right font-bold text-blue-600 pt-1 py-0.5">{calculations.costBase.toLocaleString()}원</td></tr>
                        {totalAcquisitionCost > 0 && totalAcquisitionCost !== purchasePrice && (
                          <>
                            <tr><td className="text-slate-500 pl-2 py-0.5">순수 매입가</td><td className="text-right text-slate-500 py-0.5">{purchasePrice.toLocaleString()}원</td></tr>
                            <tr><td className="text-slate-500 pl-2 py-0.5">부대비용</td><td className="text-right text-slate-500 py-0.5">+{(totalAcquisitionCost - purchasePrice).toLocaleString()}원</td></tr>
                          </>
                        )}
                        <tr><td className="text-slate-500 font-bold py-0.5">계약기간 감가액</td><td className="text-right font-bold text-red-500 py-0.5">{(calculations.costBase - calculations.effectiveEndMarketValue).toLocaleString()}원</td></tr>
                        <tr><td className="text-slate-500 font-bold py-0.5">월 감가비</td><td className="text-right font-bold text-red-600 text-sm py-0.5">{calculations.monthlyDepreciation.toLocaleString()}원</td></tr>
                      </tbody>
                    </table>
                    <p className="mt-2 text-[10px] text-slate-500">
                      ※ 주행감가는 구입시 주행상태(회사부담)를 제외하고, 고객이 계약기간 동안 기준 대비 추가 주행한 부분만 적용
                    </p>
                  </div>
                </div>
              )}

              {/* ── ① 선택: 주행 설정 ── */}
              <div className="border-t mt-3 pt-2">
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-400 shrink-0">약정주행</span>
                  {[
                    { val: 1, label: '1만' },
                    { val: 1.5, label: '1.5만' },
                    { val: 2, label: '2만' },
                    { val: 3, label: '3만' },
                    { val: 5, label: '무제한' },
                  ].map(opt => {
                    const adjPct = (opt.val - baselineKm) * 2
                    return (
                      <button key={opt.val}
                        onClick={() => setAnnualMileage(opt.val)}
                        className={`py-1 px-2.5 text-xs rounded-lg border font-bold transition-colors
                          ${annualMileage === opt.val ? 'bg-steel-600 text-white border-steel-600' : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}
                      >
                        {opt.label}
                        {opt.val < 5 && <span className={`text-[9px] ml-0.5 ${annualMileage === opt.val ? 'text-white/70' : adjPct > 0 ? 'text-red-400' : adjPct < 0 ? 'text-green-500' : 'text-slate-500'}`}>{adjPct === 0 ? '(기준)' : `(${adjPct > 0 ? '+' : ''}${adjPct.toFixed(0)}%)`}</span>}
                      </button>
                    )
                  })}
                  <span className="w-px h-4 bg-gray-100 mx-0.5" />
                  <span className="text-xs font-bold text-slate-400 shrink-0">0%기준</span>
                  <input type="number" step="0.5" min="0.5"
                    className="w-16 text-right border border-black/[0.06] rounded-lg px-2 py-1 text-xs font-bold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={baselineKm} onChange={(e) => setBaselineKm(parseFloat(e.target.value) || 2)} />
                  <span className="text-[11px] text-slate-500">만km/년</span>
                </div>
                {annualMileage < 5 && (() => {
                  const yearlyAdj = (annualMileage - baselineKm) * 2
                  const totalAdj = yearlyAdj * (termMonths / 12)
                  return yearlyAdj !== 0 ? (
                    <p className={`text-[10px] font-bold mb-2 ${yearlyAdj > 0 ? 'text-red-500' : 'text-green-600'}`}>
                      기준대비 {yearlyAdj > 0 ? '+' : ''}{yearlyAdj.toFixed(1)}%p/년 → {termMonths}개월 총 {totalAdj > 0 ? '+' : ''}{totalAdj.toFixed(1)}%p {yearlyAdj > 0 ? '증가' : '감소'}
                    </p>
                  ) : null
                })()}
              </div>

              {/* ── 초과주행 요금 선택 ── */}
              <div className="border-t mt-3 pt-2">
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-400 shrink-0">초과요금</span>
                  <input type="number" step="10" min="0"
                    className="w-20 text-right border border-black/[0.06] rounded-lg px-2 py-1 text-xs font-bold focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    value={excessMileageRate} onChange={(e) => setExcessMileageRate(parseInt(e.target.value) || 0)} />
                  <span className="text-[11px] text-slate-500">원/km</span>
                  <span className="w-px h-4 bg-gray-100 mx-0.5" />
                  <span className="text-xs font-bold text-slate-400 shrink-0">마진</span>
                  {[
                    { val: 30, label: '30%' },
                    { val: 50, label: '50%' },
                    { val: 80, label: '80%' },
                    { val: 100, label: '100%' },
                  ].map(opt => (
                    <button key={opt.val} onClick={() => setExcessRateMarginPct(opt.val)}
                      className={`py-0.5 px-2 text-[11px] rounded-lg border font-bold transition-colors
                        ${excessRateMarginPct === opt.val ? 'bg-orange-500 text-white border-orange-500' : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}
                    >{opt.label}</button>
                  ))}
                </div>

                {/* 약관 DB 기준값 안내 */}
                {termsExcessInfo.source === 'terms_db' && (
                  <div className="flex items-center gap-1.5 mb-2 text-[10px]">
                    <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 font-bold">
                      약관 기준
                    </span>
                    <span className="text-slate-500">
                      {termsExcessInfo.key}: <strong className="text-blue-700">{termsExcessInfo.rate.toLocaleString()}원/km</strong>
                    </span>
                    {excessMileageRate > 0 && excessMileageRate !== termsExcessInfo.rate && (
                      <span className="text-amber-600 font-bold">
                        (수동 {excessMileageRate.toLocaleString()}원 적용 중 · 약관과 {excessMileageRate > termsExcessInfo.rate ? '+' : ''}{excessMileageRate - termsExcessInfo.rate}원 차이)
                      </span>
                    )}
                    {!excessMileageRate && (
                      <span className="text-green-600 font-bold">(약관 자동적용)</span>
                    )}
                  </div>
                )}
                {termsExcessInfo.source === 'fallback' && (
                  <div className="flex items-center gap-1.5 mb-2 text-[10px]">
                    <span className="inline-flex items-center gap-0.5 bg-gray-100 text-slate-500 border border-black/[0.06] rounded px-1.5 py-0.5 font-bold">
                      기본값
                    </span>
                    <span className="text-slate-500">약관 DB 미설정 — 출고가 기반 자동산출 {termsExcessInfo.rate.toLocaleString()}원/km</span>
                  </div>
                )}

                {/* 원가 분석 상세 */}
                <div className="bg-orange-50 rounded-lg p-3 space-y-0.5 mb-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">감가율차이 +{excessRateBreakdown.depDiffPct.toFixed(1)}%p {excessRateBreakdown.tierPenalty !== 1 ? `(패널티 ×${excessRateBreakdown.tierPenalty.toFixed(2)})` : ''}</span>
                    <span className="font-bold text-slate-600">감가비 {f(excessRateBreakdown.depCost)}원/km</span>
                  </div>
                  {excessRateBreakdown.maintItems.length > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">정비비 ({MAINTENANCE_PACKAGES[maintPackage].label})</span>
                      <span className="font-bold text-slate-600">{f(excessRateBreakdown.maintCost)}원/km</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs border-t border-orange-200 pt-1 mt-1">
                    <span className="font-bold text-slate-600">원가 소계</span>
                    <span className="font-bold text-slate-600">{f(excessRateBreakdown.baseCost)}원/km</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-orange-600 font-bold">마진 {excessRateMarginPct}%</span>
                    <span className="font-bold text-orange-600">+{f(excessRateBreakdown.margin)}원/km</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-orange-300 pt-1 mt-1">
                    <span className="font-bold text-slate-600">산출 합계</span>
                    <span className="font-black text-red-600">{f(excessRateBreakdown.total)}원/km</span>
                  </div>
                </div>
              </div>

              {/* ── ② 상세: 현재 vs 종료 시점 비교 ── */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-gray-50/80 rounded-lg p-3 space-y-0.5">
                  <div className="flex justify-between text-[10px] mb-1"><span className="font-bold text-slate-500">현재 {calculations.carAge === 0 ? '(신차)' : `(${calculations.carAge}년)`}</span><span className="text-slate-500">시세 {f(calculations.currentMarketValue)}원</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">연식 {calculations.yearDep.toFixed(1)}% + 주행 {calculations.mileageDep === 0 ? '0' : `${calculations.mileageDep > 0 ? '+' : ''}${calculations.mileageDep.toFixed(1)}`}%</span><span className="font-black text-red-600">= {calculations.totalDepRate.toFixed(1)}%</span></div>
                </div>
                <div className="bg-steel-50/80 rounded-lg p-3 space-y-0.5">
                  <div className="flex justify-between text-[10px] mb-1"><span className="font-bold text-steel-400">{termMonths}개월 후 ({(calculations.carAge + calculations.termYears).toFixed(1)}년)</span><span className="text-steel-500">시세 {f(calculations.endMarketValue)}원</span></div>
                  <div className="flex justify-between text-xs"><span className="text-steel-500">연식 {calculations.yearDepEnd.toFixed(1)}% + 주행 {calculations.mileageDepEnd === 0 ? '0' : `${calculations.mileageDepEnd > 0 ? '+' : ''}${calculations.mileageDepEnd.toFixed(1)}`}%</span><span className="font-black text-steel-700">= {calculations.totalDepRateEnd.toFixed(1)}%</span></div>
                </div>
              </div>

              {/* 차량정보 밴드 */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 px-1 text-[10px] text-slate-500">
                <span>{carAgeMode === 'new' ? '신차' : '연식'} · {calculations.carAge}년 · {calculations.mileage10k.toFixed(1)}만km</span>
                <span className="text-steel-500">→ {(calculations.carAge + calculations.termYears).toFixed(1)}년 / {calculations.projectedMileage10k.toFixed(1)}만km</span>
              </div>

              {/* ── ③ 결과 ── */}
              <div className="flex items-center justify-between py-2 px-3 bg-red-50 rounded-lg mt-3">
                <span className="font-bold text-xs text-red-700">월 감가비용 <span className="text-[10px] font-normal text-red-400">시세하락 {f(calculations.currentMarketValue - calculations.endMarketValue)}원 ÷ {termMonths}개월</span></span>
                <span className="font-black text-sm text-red-600">{f(calculations.monthlyDepreciation)}원</span>
              </div>
            </Section>

            {/* 3. 금융비용 분석 */}
            <Section icon="🏦" title="금융비용 분석" defaultOpen={false} summary={calculations ? <span className="flex items-center gap-2"><span className="text-slate-500">대출 {f(calculations.effectiveLoan)}원 · 자기자본 {f(calculations.equityAmount)}원</span><span className="text-blue-600 font-bold">월 {f(calculations.totalMonthlyFinance)}원</span></span> : undefined}>
              {/* 투자 기준 안내 */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">총취득원가</span>
                  <span className="font-black text-slate-700">{f(totalAcquisitionCost || purchasePrice)}원</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">대출한도 (매입가)</span>
                  <span className="font-bold text-slate-600">{f(purchasePrice)}원</span>
                </div>
              </div>

              {/* ① 선택: 조달방식 + LTV */}
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs font-bold text-slate-400 shrink-0">조달방식</span>
                {[
                  { val: 'loan', label: '대출100%' },
                  { val: 'equity', label: '자기자본100%' },
                  { val: 'mixed', label: '혼합' },
                ].map(opt => {
                  const current = loanAmount <= 0 ? 'equity' : loanAmount >= purchasePrice ? 'loan' : 'mixed'
                  return (
                    <button key={opt.val}
                      onClick={() => {
                        if (opt.val === 'loan') setLoanAmount(purchasePrice) // 매입가 한도까지
                        else if (opt.val === 'equity') setLoanAmount(0)
                        else setLoanAmount(Math.round(purchasePrice * 0.7))
                      }}
                      className={`py-1 px-2.5 text-xs rounded-lg border font-bold transition-colors
                        ${current === opt.val
                          ? 'bg-steel-600 text-white border-steel-600'
                          : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
                {loanAmount > 0 && (
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-xs font-bold text-slate-400 shrink-0">대출비율</span>
                    {[30, 50, 70, 80, 90, 100].map(pct => (
                      <button key={pct}
                        onClick={() => setLoanAmount(Math.round(purchasePrice * pct / 100))}
                        className={`py-0.5 px-2 text-[11px] rounded-lg border font-bold transition-colors
                          ${purchasePrice > 0 && Math.round(loanAmount / purchasePrice * 100) === pct
                            ? 'bg-steel-600 text-white border-steel-600'
                            : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ② 설정 입력 */}
              <div className="space-y-1 mb-3">
                {loanAmount > 0 && (
                  <>
                    <InputRow label="대출 원금" value={loanAmount} onChange={(v: number) => setLoanAmount(Math.min(v, purchasePrice))} sub={`매입가의 ${purchasePrice > 0 ? (loanAmount/purchasePrice*100).toFixed(0) : 0}% (한도: ${f(purchasePrice)}원)`} />
                    <InputRow label="대출 이자율 (연)" value={loanRate} onChange={setLoanRate} suffix="%" type="percent" />
                  </>
                )}
                {calculations && calculations.equityAmount > 0 && (
                  <>
                    <InputRow label="자기자본" value={calculations.equityAmount} onChange={(v: number) => setLoanAmount(Math.max(0, Math.min((totalAcquisitionCost || purchasePrice) - v, purchasePrice)))} sub={`총취득원가의 ${(totalAcquisitionCost || purchasePrice) > 0 ? (calculations.equityAmount / (totalAcquisitionCost || purchasePrice) * 100).toFixed(0) : 0}%${loanAmount < purchasePrice && totalAcquisitionCost > purchasePrice ? ' (부대비용 포함)' : ''}`} />
                    <InputRow label="투자수익률 (연)" value={investmentRate} onChange={setInvestmentRate} suffix="%" type="percent" sub="자기자본 기회비용" />
                  </>
                )}
              </div>

              {/* ③ 상세: 산출 내역 */}
              <div className="bg-gray-50/80 rounded-lg p-3 space-y-0.5 mb-3">
                <div className="flex justify-between text-xs py-0.5 text-slate-500 mb-1">
                  <span>투자 기준: 총취득원가 {f(calculations.costBase)}원</span>
                  <span>대출 한도: 매입가 {f(purchasePrice)}원</span>
                </div>
                {calculations.effectiveLoan > 0 && (
                  <>
                    <div className="flex justify-between text-xs py-0.5"><span className="text-slate-500">대출잔액</span><span className="font-bold text-slate-600">{f(calculations.effectiveLoan)} → {f(calculations.loanEndBalance)} (평균 {f(calculations.avgLoanBalance)})</span></div>
                    <ResultRow label="월 대출이자" value={calculations.monthlyLoanInterest} />
                  </>
                )}
                {calculations.equityAmount > 0 && (
                  <>
                    {calculations.effectiveLoan > 0 && <div className="border-t border-black/[0.06] my-1" />}
                    <div className="flex justify-between text-xs py-0.5"><span className="text-slate-500">자기자본{totalAcquisitionCost > purchasePrice && loanAmount >= purchasePrice ? ' (부대비용 포함)' : ''}</span><span className="font-bold text-slate-600">{f(calculations.equityAmount)} → {f(calculations.equityEndBalance)} (평균 {f(calculations.avgEquityBalance)})</span></div>
                    <ResultRow label="월 기회비용" value={calculations.monthlyOpportunityCost} />
                  </>
                )}
                <p className="text-[10px] text-slate-500 pt-1 border-t border-black/[0.06] mt-1">평균잔액법 · 총취득원가 기준 · 대출은 매입가 한도</p>
              </div>

              {/* ④ 결과 */}
              <ResultRow label="총 월 금융비용" value={calculations.totalMonthlyFinance} highlight />
            </Section>
            </>)}
            {/* === 고급 분석 영역 끝 === */}

            {/* 4. 보험료 (공제조합) */}
            <Section icon="🛡️" title="보험료 (공제조합)" defaultOpen={false} summary={<span className="flex items-center gap-2">{linkedInsurance ? <span className="text-slate-500">연동</span> : <span className="text-slate-500">자동산출</span>}<span className="text-green-600 font-bold">월 {f(monthlyInsuranceCost)}원</span></span>}>
              {/* ① 선택: 모드 + 연령 — 한 줄 */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span className="text-xs font-bold text-slate-400 shrink-0">산출</span>
                <button onClick={() => setInsAutoMode(true)}
                  className={`py-1 px-2.5 text-xs rounded-lg border font-bold transition-colors ${insAutoMode ? 'bg-steel-600 text-white border-steel-600' : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}>🤖 추정</button>
                <button onClick={() => setInsAutoMode(false)}
                  className={`py-1 px-2.5 text-xs rounded-lg border font-bold transition-colors ${!insAutoMode ? 'bg-steel-600 text-white border-steel-600' : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}>✏️ 직접</button>
                {linkedInsurance && <span className="text-[11px] text-green-600 font-bold">✅ 연동</span>}
                <span className="w-px h-4 bg-gray-100 mx-0.5" />
                <span className="text-xs font-bold text-slate-400 shrink-0">연령</span>
                {(Object.entries(DRIVER_AGE_FACTORS) as [DriverAgeGroup, typeof DRIVER_AGE_FACTORS[DriverAgeGroup]][]).map(([key, info]) => (
                  <button key={key} onClick={() => setDriverAgeGroup(key)}
                    className={`py-1 px-2.5 text-xs rounded-lg border font-bold transition-colors
                      ${driverAgeGroup === key
                        ? key === '26세이상' ? 'bg-steel-600 text-white border-steel-600'
                          : key === '21세이상' ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-red-500 text-white border-red-500'
                        : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}
                  >
                    {info.label} <span className="text-[9px] opacity-70">{info.factor > 1.0 ? `+${((info.factor - 1) * 100).toFixed(0)}%` : '기준'}</span>
                  </button>
                ))}
              </div>

              {/* ①-2 자차보장비율 선택 */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span className="text-xs font-bold text-slate-400 shrink-0">자차보장</span>
                {[60, 70, 80, 90, 100].map(v => (
                  <button key={v} onClick={() => setOwnDamageCoverageRatio(v)}
                    className={`py-0.5 px-2 text-[11px] rounded-lg border font-bold transition-colors
                      ${ownDamageCoverageRatio === v
                        ? v <= 70 ? 'bg-green-600 text-white border-green-600'
                          : v <= 90 ? 'bg-steel-600 text-white border-steel-600'
                          : 'bg-orange-500 text-white border-orange-500'
                        : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}
                  >{v}%</button>
                ))}
                <span className="text-[10px] text-slate-500 ml-1">
                  {ownDamageCoverageRatio < 100 ? `차량가액의 ${ownDamageCoverageRatio}%만 보장 → 보험료 절감` : '전액보장'}
                </span>
              </div>

              {/* ② 직접입력 시 */}
              {!insAutoMode && (
                <div className="mb-3">
                  <InputRow label="월 보험료" value={monthlyInsuranceCost} onChange={setMonthlyInsuranceCost} sub={`연 ${f(monthlyInsuranceCost * 12)}원`} />
                </div>
              )}

              {/* ③ 상세: 산출 내역 */}
              {insAutoMode && insEstimate ? (
                <div className="bg-gray-50/80 rounded-lg p-3 space-y-0.5 mb-3">
                  {insEstimate.breakdown.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs py-0.5">
                      <span className="text-slate-500">{item.label}</span>
                      <span className="font-bold text-slate-600">{f(item.monthly)}원</span>
                    </div>
                  ))}
                  <div className="border-t border-black/[0.06] mt-1 pt-1 flex justify-between text-xs">
                    <span className="text-slate-500">기본공제 {f(Math.round(insEstimate.basePremium / 12))}원 + 자차 {f(Math.round(insEstimate.ownDamagePremium / 12))}원</span>
                    <span className="text-[10px] text-slate-500">{insEstimate.vehicleClass} · 연 {f(insEstimate.totalAnnual)}원</span>
                  </div>
                </div>
              ) : insAutoMode ? (
                <div className="bg-gray-50/80 rounded-lg p-3 mb-3">
                  <div className="flex justify-between text-xs"><span className="text-slate-500">{linkedInsurance ? `연동 · 연 ${f(linkedInsurance.premium || 0)}원` : autoInsType ? `기준표 (${autoInsType})` : '직접 입력'}</span></div>
                </div>
              ) : null}

              {/* 면책금 & 리스크 — 선택 영역 (보험료 산출에 영향) */}
              <div className="border-t mt-3 pt-2 mb-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-400 shrink-0">면책금</span>
                  {[0, 300000, 500000, 1000000, 1500000, 2000000].map(v => (
                    <button key={v} onClick={() => setDeductible(v)}
                      className={`py-0.5 px-1.5 text-[11px] rounded-lg border font-bold transition-colors
                        ${deductible === v ? v === 0 ? 'bg-steel-500 text-white border-steel-500' : 'bg-red-500 text-white border-red-500' : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}
                    >{v === 0 ? '완전자차' : `${v / 10000}만`}</button>
                  ))}
                  <span className="w-px h-4 bg-gray-100 mx-0.5" />
                  <span className="text-xs font-bold text-slate-400 shrink-0">리스크 적립</span>
                  {[{ val: 0, label: '0%' }, { val: 0.3, label: '0.3%' }, { val: 0.5, label: '0.5%' }, { val: 0.8, label: '0.8%' }, { val: 1.0, label: '1.0%' }].map(opt => (
                    <button key={opt.val} onClick={() => setRiskRate(opt.val)}
                      className={`py-0.5 px-1.5 text-[11px] rounded-lg border font-bold transition-colors
                        ${riskRate === opt.val ? 'bg-orange-500 text-white border-orange-500' : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* ④ 결과: 리스크 적립 → 월 보험료(최종) */}
              <div className="space-y-1.5 mt-3">
                <div className="flex justify-between items-center py-2 px-3 bg-red-50 rounded-lg">
                  <span className="text-xs text-red-600">면책 {f(deductible)}원 · 적립률 {riskRate}%</span>
                  <span className="font-black text-sm text-red-600">월 적립 {f(calculations.monthlyRiskReserve)}원</span>
                </div>
                <ResultRow label="월 보험료" value={monthlyInsuranceCost} highlight />
              </div>
            </Section>

            {/* 4-2. 자동차세 (고급만) */}
            {advancedMode && (
            <Section icon="🏛️" title={`자동차세 (${selectedCar?.is_commercial === false ? '비영업용' : '영업용'})`} defaultOpen={false} summary={calculations ? <span className="flex items-center gap-2"><span className="text-slate-500">{engineCC || 0}cc</span><span className="text-purple-600 font-bold">월 {f(calculations.monthlyTax)}원</span></span> : undefined}>
              {/* ① 입력 */}
              <div className="space-y-1 mb-3">
                <InputRow label="배기량" value={engineCC} onChange={(v) => {
                  setEngineCC(v)
                  const fuelCat = selectedCar?.fuel_type?.includes('전기') ? '전기' : '내연기관'
                  const isComm = selectedCar?.is_commercial !== false
                  const taxTypeKey = isComm ? '영업용' : '비영업용'
                  const tr = taxRates.find(r => r.tax_type === taxTypeKey && r.fuel_category === fuelCat && v >= r.cc_min && v <= r.cc_max)
                  let tax = 0
                  if (tr) {
                    tax = tr.fixed_annual > 0 ? tr.fixed_annual : Math.round(v * tr.rate_per_cc)
                    tax = Math.round(tax * (1 + tr.education_tax_rate / 100))
                  } else if (fuelCat === '전기') {
                    tax = isComm ? 20000 : Math.round(130000 * 1.3) // 전기차 고정세액
                  } else if (isComm) {
                    tax = v * 18 // 영업용 내연기관 fallback
                  } else {
                    if (v <= 1000) tax = v * 80; else if (v <= 1600) tax = v * 140; else tax = v * 200
                    tax = Math.round(tax * 1.3) // 비영업용 내연기관 + 교육세 30%
                  }
                  setAnnualTax(tax)
                }} suffix="cc" />
                <InputRow label="연간 자동차세" value={annualTax} onChange={setAnnualTax} sub={`${selectedCar?.is_commercial === false ? '비영업용' : '영업용'} 세율`} />
              </div>
              {/* ② 결과 */}
              <ResultRow label="월 자동차세" value={calculations.monthlyTax} highlight />
            </Section>
            )}

            {/* 5. 정비 상품 */}
            <Section icon="🔧" title="정비 상품" defaultOpen={false} summary={<span className="flex items-center gap-2"><span className="text-slate-500">{MAINTENANCE_PACKAGES[maintPackage].icon} {MAINTENANCE_PACKAGES[maintPackage].label}</span><span className="text-amber-600 font-bold">월 {f(monthlyMaintenance)}원</span></span>}>
              {/* ① 선택: 패키지 + 오일교환 */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span className="text-xs font-bold text-slate-400 shrink-0">상품</span>
                {(Object.entries(MAINTENANCE_PACKAGES) as [MaintenancePackage, typeof MAINTENANCE_PACKAGES[MaintenancePackage]][]).map(([key, pkg]) => {
                  const isEV = autoMaintType === '전기차'
                  const disabled = isEV && key === 'oil_only'
                  return (
                    <button key={key}
                      onClick={() => {
                        if (disabled) return
                        setMaintPackage(key)
                        const multiplier = MAINT_MULTIPLIER[autoMaintType] || 1.0
                        const oilAdj = key === 'oil_only' && oilChangeFreq === 2 ? 1.8 : 1.0
                        setMonthlyMaintenance(Math.round(pkg.monthly * multiplier * oilAdj))
                      }}
                      className={`py-1 px-2.5 rounded-lg border font-bold text-xs transition-all ${
                        disabled ? 'border-black/5 bg-gray-50 text-slate-400 cursor-not-allowed'
                          : maintPackage === key ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-black/[0.06] text-slate-500 hover:border-amber-300 bg-white'
                      }`}
                    >
                      <span>{pkg.icon}</span>
                      <span className="ml-0.5">{pkg.label}</span>
                      {disabled && <span className="text-[9px] text-red-400 ml-1">불가</span>}
                    </button>
                  )
                })}
                {maintPackage === 'oil_only' && (
                  <>
                    <span className="w-px h-4 bg-gray-100 mx-0.5" />
                    <span className="text-xs font-bold text-slate-400 shrink-0">교환주기</span>
                    {([1, 2] as const).map(freq => (
                      <button key={freq}
                        onClick={() => {
                          setOilChangeFreq(freq)
                          const multiplier = MAINT_MULTIPLIER[autoMaintType] || 1.0
                          const oilAdj = freq === 2 ? 1.8 : 1.0
                          setMonthlyMaintenance(Math.round(MAINTENANCE_PACKAGES.oil_only.monthly * multiplier * oilAdj))
                        }}
                        className={`py-1 px-2.5 rounded-lg border font-bold text-xs transition-all ${
                          oilChangeFreq === freq ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-black/[0.06] text-slate-500 hover:border-amber-300'
                        }`}
                      >연 {freq}회</button>
                    ))}
                  </>
                )}
              </div>

              {/* ② 상세: 포함 항목 + 수동입력 */}
              <div className="bg-gray-50/80 rounded-lg p-3 mb-3">
                {maintPackage !== 'self' ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
                    {MAINT_ITEMS.map((item, idx) => {
                      const isEV = autoMaintType === '전기차'
                      if (isEV && item.evExclude) return null
                      const included = item.packages.includes(maintPackage)
                      return (
                        <span key={idx} className={`text-[11px] ${included ? 'text-green-700 font-medium' : 'text-slate-400'}`}>
                          {included ? '✓' : '·'} {item.name}
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 mb-2">🙋 고객 직접 정비 · 렌트가 미포함</p>
                )}
                <div className="flex items-center gap-2 pt-2 border-t border-black/[0.06]">
                  <InputRow label="월 정비비" value={monthlyMaintenance} onChange={setMonthlyMaintenance} />
                  {autoMaintType && <span className="text-[10px] text-slate-500 shrink-0">{autoMaintType} ×{MAINT_MULTIPLIER[autoMaintType] || 1.0}</span>}
                </div>
              </div>

              {/* ③ 결과 */}
              <div className="flex items-center justify-between py-2 px-3 bg-amber-50 rounded-lg">
                <span className="font-bold text-xs text-amber-700">{MAINTENANCE_PACKAGES[maintPackage].icon} {MAINTENANCE_PACKAGES[maintPackage].label}</span>
                <span className="font-black text-sm text-amber-700">{f(monthlyMaintenance)}원<span className="text-[10px] font-normal text-amber-500">/월</span> <span className="text-[10px] text-slate-500 font-normal">{termMonths}개월 = {f(monthlyMaintenance * termMonths)}원</span></span>
              </div>
            </Section>

            {/* 면책금 & 리스크 → 보험 섹션으로 이동됨 */}

            {/* 7. 보증금 & 선납금 */}
            <Section icon="💰" title="보증금 & 선납금 효과" defaultOpen={false} summary={calculations && calculations.totalDiscount > 0 ? <span className="text-green-600 font-bold">월 -{f(calculations.totalDiscount)}원</span> : <span className="text-slate-500">미설정</span>}>
              {/* ① 선택: 보증금 */}
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-400 shrink-0 w-12">보증금</span>
                  <input type="text" inputMode="numeric"
                    className="w-12 text-center border border-black/[0.06] rounded-lg px-1 py-1 text-xs font-bold focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
                    value={purchasePrice > 0 ? Math.round(deposit / purchasePrice * 100) : 0}
                    onChange={(e) => { setDeposit(Math.round(purchasePrice * (parseInt(e.target.value) || 0) / 100)) }}
                  />
                  <span className="text-[11px] text-slate-500">%</span>
                  <input type="text"
                    className="flex-1 text-right border border-black/[0.06] rounded-lg px-2 py-1 text-xs font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                    value={f(deposit)} onChange={(e) => setDeposit(parseNum(e.target.value))}
                  />
                  <span className="text-[11px] text-slate-500">원</span>
                  {deposit > 0 && <span className="text-[10px] text-green-600 font-bold ml-1">→ 월 -{f(calculations.monthlyDepositDiscount)}원</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-400 shrink-0 w-12">할인률</span>
                  {[0.3, 0.4, 0.5, 0.6, 0.8].map(r => (
                    <button key={r} onClick={() => setDepositDiscountRate(r)}
                      className={`py-0.5 px-2 text-[11px] rounded-lg border font-bold transition-colors
                        ${depositDiscountRate === r ? 'bg-green-600 text-white border-green-600' : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}
                    >{r}%</button>
                  ))}
                </div>
              </div>
              {/* ② 선택: 선납금 */}
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs font-bold text-slate-400 shrink-0 w-12">선납금</span>
                <input type="text"
                  className="flex-1 text-right border border-black/[0.06] rounded-lg px-2 py-1 text-xs font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                  value={f(prepayment)} onChange={(e) => setPrepayment(parseNum(e.target.value))}
                />
                <span className="text-[11px] text-slate-500">원</span>
                {prepayment > 0 && <span className="text-[10px] text-green-600 font-bold ml-1">→ 월 -{f(calculations.monthlyPrepaymentDiscount)}원 ({termMonths}개월)</span>}
              </div>
              {/* ② 결과 */}
              {calculations.totalDiscount > 0 && (
                <div className="flex items-center justify-between py-2 px-3 bg-green-50 rounded-lg">
                  <span className="font-bold text-xs text-green-700">총 월 할인</span>
                  <span className="font-black text-sm text-green-700">-{f(calculations.totalDiscount)}원</span>
                </div>
              )}
            </Section>

            {/* 8. 시장 비교 */}
            <Section icon="📊" title="시중 동일유형 렌트가 비교" defaultOpen={false} summary={calculations && calculations.marketAvg > 0 ? <span className="flex items-center gap-2"><span className="text-slate-500">시장평균 {f(calculations.marketAvg)}원</span><span className={`font-bold ${calculations.marketDiff > 0 ? 'text-red-500' : 'text-green-600'}`}>{calculations.marketDiff > 0 ? '+' : ''}{calculations.marketDiff.toFixed(1)}%</span></span> : <span className="text-slate-500">{marketComps.length}건</span>}>
              <div className="space-y-3">
                {/* 등록된 비교 데이터 */}
                {marketComps.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-slate-500">
                        <tr>
                          <th className="p-2 text-left">경쟁사</th>
                          <th className="p-2 text-left">차량정보</th>
                          <th className="p-2 text-right">월 렌트</th>
                          <th className="p-2 text-right">보증금</th>
                          <th className="p-2 text-center">기간</th>
                          <th className="p-2 text-center">삭제</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {marketComps.map((comp, idx) => (
                          <tr key={comp.id || idx} className="hover:bg-gray-50">
                            <td className="p-2 font-bold">{comp.competitor_name}</td>
                            <td className="p-2 text-slate-400">{comp.vehicle_info}</td>
                            <td className="p-2 text-right font-bold">{f(comp.monthly_rent)}원</td>
                            <td className="p-2 text-right text-slate-500">{f(comp.deposit)}원</td>
                            <td className="p-2 text-center text-slate-500">{comp.term_months}개월</td>
                            <td className="p-2 text-center">
                              <button onClick={() => comp.id && removeMarketComp(comp.id)}
                                className="text-red-400 hover:text-red-600 text-xs font-bold">삭제</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 새 비교 추가 — 인라인 */}
                <div className="flex gap-1.5 items-center flex-wrap">
                  <input placeholder="경쟁사" className="px-2 py-1 border border-black/[0.06] rounded-lg text-xs w-24 font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                    value={newComp.competitor_name}
                    onChange={e => setNewComp({ ...newComp, competitor_name: e.target.value })} />
                  <input placeholder="차량" className="px-2 py-1 border border-black/[0.06] rounded-lg text-xs w-28 font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                    value={newComp.vehicle_info}
                    onChange={e => setNewComp({ ...newComp, vehicle_info: e.target.value })} />
                  <input placeholder="월렌트(원)" className="px-2 py-1 border border-black/[0.06] rounded-lg text-xs text-right w-24 font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                    value={newComp.monthly_rent || ''}
                    onChange={e => setNewComp({ ...newComp, monthly_rent: parseNum(e.target.value) })} />
                  <button onClick={addMarketComp}
                    className="bg-steel-600 text-white rounded-lg font-bold text-xs px-2.5 py-1 hover:bg-steel-700">추가</button>
                </div>

                {/* 시장 평균 비교 — 결과 */}
                {calculations.marketAvg > 0 && (
                  <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${calculations.marketDiff > 10 ? 'bg-red-50' : calculations.marketDiff < -5 ? 'bg-green-50' : 'bg-steel-50'}`}>
                    <span className="text-xs text-slate-500">시장평균 {f(calculations.marketAvg)}원 vs 내 가격 {f(calculations.rentWithVAT)}원</span>
                    <span className={`font-black text-sm ${calculations.marketDiff > 10 ? 'text-red-600' : calculations.marketDiff < -5 ? 'text-green-600' : 'text-steel-600'}`}>
                      {calculations.marketDiff > 0 ? '+' : ''}{calculations.marketDiff.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </Section>

          </div>
          )}

          {/* ===== 오른쪽: 계약조건 + 최종 렌트가 산출 ===== */}
          <div className="lg:col-span-4">
            <div className="sticky top-2 space-y-2">

              {/* 계약 조건 설정 */}
              <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm px-3 py-2.5">
                {/* 견적 프리셋 */}
                <div className="mb-3 pb-3 border-b border-black/5">
                  <p className="text-[11px] font-bold text-slate-500 mb-2">⚡ 빠른 설정</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: '💰 최저가', desc: '원가 수준',
                        preset: { termMonths: 60, margin: 0, contractType: 'return' as const, maintPackage: 'self' as any, annualMileage: 2, deposit: 0, prepayment: 0 } },
                      { label: '⭐ 표준', desc: '소폭 마진',
                        preset: { termMonths: 36, margin: 50000, contractType: 'return' as const, maintPackage: 'self' as any, annualMileage: 2, deposit: 0, prepayment: 0 } },
                      { label: '🏢 법인', desc: '정비포함',
                        preset: { termMonths: 48, margin: 50000, contractType: 'return' as const, maintPackage: 'basic' as any, annualMileage: 2.5, deposit: 0, prepayment: 0 } },
                      { label: '🔑 인수형', desc: '소유권 확보',
                        preset: { termMonths: 48, margin: 0, contractType: 'buyout' as const, maintPackage: 'self' as any, annualMileage: 2, deposit: 0, prepayment: 0 } },
                    ].map(p => (
                      <button key={p.label}
                        onClick={() => {
                          setTermMonths(p.preset.termMonths)
                          setMargin(p.preset.margin)
                          setContractType(p.preset.contractType)
                          setMaintPackage(p.preset.maintPackage)
                          // 정비 패키지에 맞는 월 정비비 동기화
                          const multiplier = MAINT_MULTIPLIER[autoMaintType] || 1.0
                          const oilAdj = p.preset.maintPackage === 'oil_only' && oilChangeFreq === 2 ? 1.8 : 1.0
                          setMonthlyMaintenance(Math.round(MAINTENANCE_PACKAGES[p.preset.maintPackage as MaintenancePackage]?.monthly * multiplier * oilAdj || 0))
                          setAnnualMileage(p.preset.annualMileage)
                          setDeposit(p.preset.deposit)
                          setPrepayment(p.preset.prepayment)
                        }}
                        className="text-left px-2.5 py-2 rounded-xl border border-black/[0.06] hover:border-steel-300 hover:bg-steel-50/50 transition-colors group">
                        <span className="text-xs font-bold text-slate-600 group-hover:text-steel-700">{p.label}</span>
                        <span className="block text-[10px] text-slate-500">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 계약기간 */}
                <div className="mb-2">
                  <p className="text-[11px] font-bold text-slate-500 mb-1">계약기간</p>
                  <div className="flex gap-1">
                    {[12, 24, 36, 48, 60].map(t => (
                      <button key={t}
                        onClick={() => {
                          setTermMonths(t)
                          const rateRecord = financeRates.find(r =>
                            r.finance_type === '캐피탈대출' &&
                            t >= r.term_months_min && t <= r.term_months_max
                          )
                          if (rateRecord) setLoanRate(Number(rateRecord.annual_rate))
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                          ${termMonths === t
                            ? 'bg-steel-600 text-white'
                            : 'bg-gray-100 text-slate-500 hover:bg-gray-100'}`}
                      >
                        {t}개월
                      </button>
                    ))}
                  </div>
                </div>
                {/* 계약유형 + 목표마진 — 2열 */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 mb-1">계약유형</p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setContractType('return')}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors
                          ${contractType === 'return'
                            ? 'bg-steel-600 text-white border-steel-600'
                            : 'border-black/[0.06] bg-white text-slate-500 hover:border-steel-300'}`}
                      >
                        반납형
                      </button>
                      <button
                        onClick={() => setContractType('buyout')}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors
                          ${contractType === 'buyout'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'border-black/[0.06] bg-white text-slate-500 hover:border-amber-300'}`}
                      >
                        인수형
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 mb-1">목표마진</p>
                    <div className="flex gap-1">
                      {[10, 15, 20, 30].map(m => (
                        <button key={m}
                          onClick={() => setMargin(m * 10000)}
                          className={`flex-1 py-1.5 text-xs rounded-lg border font-bold transition-colors
                            ${margin === m * 10000
                              ? 'bg-steel-600 text-white border-steel-600'
                              : 'border-black/[0.06] text-slate-500 hover:bg-gray-50'}`}
                        >
                          {m}만
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* 마진 직접입력 */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 shrink-0">직접입력</span>
                  <input
                    type="number"
                    value={margin}
                    onChange={(e) => setMargin(Math.max(0, parseInt(e.target.value) || 0))}
                    className="flex-1 border border-black/[0.06] rounded-lg px-2 py-1 text-xs font-bold text-right focus:border-steel-500 outline-none"
                  />
                  <span className="text-xs text-slate-500 shrink-0">원</span>
                </div>
                {/* 인수형 전용 */}
                {contractType === 'buyout' && (
                  <div className="mt-2 p-2 rounded-xl border bg-amber-50/50 border-amber-200/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-slate-500">🏷️ 인수가격</span>
                      <div className="flex gap-1">
                        {[90, 100, 110, 120, 130].map(r => (
                          <button key={r}
                            onClick={() => setResidualRate(r)}
                            className={`px-1.5 py-0.5 text-[11px] rounded border font-bold
                              ${residualRate === r
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'border-black/[0.06] text-slate-500 hover:bg-gray-100'}`}
                          >
                            {r}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 shrink-0">직접입력</span>
                      <input
                        type="number"
                        min="50" max={150} step="1"
                        value={residualRate}
                        onChange={(e) => setResidualRate(Math.max(50, Math.min(150, parseInt(e.target.value) || 100)))}
                        className="w-14 text-center border border-black/[0.06] rounded px-1 py-1 text-xs font-bold focus:border-amber-500 outline-none"
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                    {calculations && (
                      <div className="mt-1.5 pt-1.5 border-t border-amber-100 space-y-0.5 text-xs">
                        <div className="flex justify-between"><span className="text-slate-500">추정시세</span><span className="font-bold text-slate-400">{f(calculations.endMarketValue)}원</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">인수가</span><span className="font-bold text-amber-600">{f(calculations.residualValue)}원</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">감가대상</span><span className="font-bold text-red-500">{f(Math.max(0, calculations.costBase - calculations.residualValue))}원</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 선택 차량 정보 */}
              {selectedCar && (
                <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm px-4 py-3">
                  <div className="flex items-center gap-3">
                    {selectedCar.image_url ? (
                      <img src={selectedCar.image_url} alt="" className="w-16 h-12 object-cover rounded-lg bg-gray-100" />
                    ) : (
                      <div className="w-16 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-slate-400 text-lg">🚗</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-800 truncate">{selectedCar.brand} {selectedCar.model}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {selectedCar.trim && <span>{selectedCar.trim} · </span>}
                        {selectedCar.year && <span>{selectedCar.year}년 · </span>}
                        {selectedCar.fuel && <span>{selectedCar.fuel} · </span>}
                        {selectedCar.engine_cc ? `${selectedCar.engine_cc.toLocaleString()}cc` : ''}
                      </p>
                    </div>
                    {selectedCar.number && (
                      <span className="text-[10px] font-bold text-slate-500 bg-gray-100 px-2 py-0.5 rounded-md shrink-0">{selectedCar.number}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-black/5">
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500">출고가</p>
                      <p className="text-xs font-bold text-slate-600">{f(factoryPrice)}원</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500">매입가</p>
                      <p className="text-xs font-bold text-slate-600">{f(purchasePrice)}원</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500">할인율</p>
                      <p className="text-xs font-bold text-green-600">{factoryPrice > 0 ? ((factoryPrice - purchasePrice) / factoryPrice * 100).toFixed(1) : 0}%</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 렌트가 산출 결과 */}
              <div className="bg-gray-50 text-white rounded-2xl shadow-2xl px-4 py-3 flex flex-col">
                {/* 헤더 */}
                <div className="flex items-center justify-between border-b border-gray-700 pb-2 mb-2.5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">렌트가 산출</p>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold
                    ${contractType === 'return' ? 'bg-steel-600/30 text-steel-300' : 'bg-amber-500/30 text-amber-300'}`}>
                    {contractType === 'return' ? '반납' : '인수'} {termMonths}개월
                  </span>
                </div>

                {/* 원가 기준 */}
                <div className="pb-2 mb-2 border-b border-black/[0.06]">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{calculations.isUsedCar ? '중고차 원가' : '취득원가'}</span>
                    <span className="font-bold text-slate-400">{f(calculations.costBase)}원</span>
                  </div>
                  {calculations.isUsedCar && (
                    <div className="flex justify-between text-xs mt-0.5">
                      <span className="text-slate-400">잔존가</span>
                      <span className="font-bold text-slate-500">{f(calculations.effectiveEndMarketValue)}원</span>
                    </div>
                  )}
                </div>

                {/* 원가 항목 — 2컬럼 */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
                  <div className="flex justify-between"><span className="text-slate-500">감가</span><span className="font-bold">{f(calculations.monthlyDepreciation)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">금융</span><span className="font-bold">{f(calculations.totalMonthlyFinance)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">보험</span><span className="font-bold">{f(monthlyInsuranceCost)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">세금</span><span className="font-bold">{f(calculations.monthlyTax)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">정비</span><span className="font-bold">{f(monthlyMaintenance)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">리스크</span><span className="font-bold">{f(calculations.monthlyRiskReserve)}</span></div>
                  {calculations.monthlyInspectionCost > 0 && (
                    <div className="flex justify-between"><span className="text-slate-500">검사</span><span className="font-bold">{f(calculations.monthlyInspectionCost)}</span></div>
                  )}
                  {calculations.totalDiscount > 0 && (
                    <div className="flex justify-between text-green-400"><span>할인</span><span className="font-bold">-{f(calculations.totalDiscount)}</span></div>
                  )}
                </div>

                {/* 원가 비중 바 차트 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  <CostBar label="감가" value={calculations.monthlyDepreciation} total={calculations.totalMonthlyCost} color="bg-red-500" />
                  <CostBar label="금융" value={calculations.totalMonthlyFinance} total={calculations.totalMonthlyCost} color="bg-blue-500" />
                  <CostBar label="보험" value={monthlyInsuranceCost} total={calculations.totalMonthlyCost} color="bg-purple-500" />
                  <CostBar label="세금" value={calculations.monthlyTax} total={calculations.totalMonthlyCost} color="bg-indigo-400" />
                  <CostBar label="정비" value={monthlyMaintenance} total={calculations.totalMonthlyCost} color="bg-amber-500" />
                  <CostBar label="리스크" value={calculations.monthlyRiskReserve} total={calculations.totalMonthlyCost} color="bg-red-400" />
                </div>

                {/* 합계 */}
                <div className="border-t border-gray-700 pt-2 mb-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-red-400 font-bold">월 원가</span>
                    <span className="text-red-400 font-bold">{f(calculations.totalMonthlyCost)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-400 font-bold">+ 마진</span>
                    <span className="text-yellow-400 font-bold">{f(margin)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">공급가액</span>
                    <span className="font-bold text-slate-600">{f(calculations.suggestedRent)}원</span>
                  </div>
                </div>

                {/* 최종가 */}
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-center">
                  <p className="text-xs text-yellow-400 font-bold mb-0.5">최종 월 렌트가 (VAT 포함)</p>
                  <p className="text-xl font-black tracking-tight">
                    {f(calculations.rentWithVAT)}<span className="text-sm ml-1">원</span>
                  </p>
                  {contractType === 'buyout' && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-700 space-y-0.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-amber-400">인수가</span>
                        <span className="font-bold text-amber-400">{f(calculations.buyoutPrice)}원</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">총납입+인수</span>
                        <span className="font-bold text-slate-500">{f(calculations.rentWithVAT * termMonths + deposit + calculations.buyoutPrice)}원</span>
                      </div>
                    </div>
                  )}
                  {contractType === 'return' && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-700 flex justify-between text-xs text-slate-500">
                      <span>반납 시 회수가</span>
                      <span className="font-bold text-slate-500">{f(calculations.residualValue)}원</span>
                    </div>
                  )}
                </div>

                {/* 액션 버튼 */}
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700">
                  <button onClick={handleGoToCustomerStep}
                    className="flex-1 bg-white text-black font-black py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-xs whitespace-nowrap">
                    견적서 작성 →
                  </button>
                  <button onClick={handleSaveWorksheet} disabled={saving}
                    className="flex-1 bg-gray-100 text-slate-400 font-bold py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-xs disabled:opacity-50 whitespace-nowrap">
                    {saving ? '저장 중...' : '워크시트 저장'}
                  </button>
                </div>
              </div>

              {/* 수익성 요약 */}
              <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm px-3 py-2.5">
                <h3 className="font-bold text-slate-600 mb-2 text-xs flex items-center gap-2">
                  <span className="w-1 h-3 bg-green-500 rounded-full"></span>
                  수익성 요약
                </h3>
                {/* 핵심 지표 */}
                <div className="space-y-1 mb-2">
                  <div className="bg-green-50 rounded px-2.5 py-1 border border-green-100 flex items-center justify-between">
                    <span className="text-xs text-green-600 font-bold">월 순이익</span>
                    <span className="text-xs font-black text-green-700">{f(margin)}원</span>
                  </div>
                  <div className="bg-green-50 rounded px-2.5 py-1 border border-green-100 flex items-center justify-between">
                    <span className="text-xs text-green-600 font-bold">계약기간 총이익</span>
                    <span className="text-xs font-black text-green-800">{f(margin * termMonths)}원</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="bg-steel-50 rounded px-2.5 py-1 border border-steel-100 flex items-center justify-between">
                      <span className="text-xs text-steel-500 font-bold">마진율</span>
                      <span className="text-xs font-black text-steel-700">{calculations.suggestedRent > 0 ? (margin / calculations.suggestedRent * 100).toFixed(1) : 0}%</span>
                    </div>
                    <div className="bg-steel-50 rounded px-2.5 py-1 border border-steel-100 flex items-center justify-between">
                      <span className="text-xs text-steel-500 font-bold">연 ROI</span>
                      <span className="text-xs font-black text-steel-700">{purchasePrice > 0 ? ((margin * 12) / purchasePrice * 100).toFixed(1) : 0}%</span>
                    </div>
                  </div>
                  {/* IRR 투자수익률 분석 */}
                  {calculations.irrResult && (
                    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)', border: '1px solid #bfdbfe' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ fontSize: 13 }}>📈</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#1e40af' }}>투자 IRR 분석</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: '8px 10px', border: '1px solid #dbeafe', textAlign: 'center' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', margin: 0 }}>연 IRR</p>
                          <p style={{ fontSize: 18, fontWeight: 900, color: calculations.irrResult.annualIRR >= 0 ? '#059669' : '#dc2626', margin: '2px 0 0', lineHeight: 1.1 }}>
                            {calculations.irrResult.annualIRR.toFixed(1)}%
                          </p>
                        </div>
                        <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: '8px 10px', border: '1px solid #dbeafe', textAlign: 'center' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', margin: 0 }}>투자배수</p>
                          <p style={{ fontSize: 18, fontWeight: 900, color: '#1d4ed8', margin: '2px 0 0', lineHeight: 1.1 }}>
                            {calculations.irrResult.multiple.toFixed(2)}x
                          </p>
                        </div>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 10, color: '#6b7280', lineHeight: 1.4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>월 IRR</span>
                          <span style={{ fontWeight: 700, color: '#374151' }}>{calculations.irrResult.monthlyIRR.toFixed(3)}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>총 투자수익</span>
                          <span style={{ fontWeight: 700, color: calculations.irrResult.totalReturn >= 0 ? '#059669' : '#dc2626' }}>{calculations.irrResult.totalReturn >= 0 ? '+' : ''}{f(calculations.irrResult.totalReturn)}원</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 계약 유형별 수익 분석 */}
                <div className="bg-gray-50 rounded-lg p-2 border border-black/5 space-y-1 text-xs">
                  <p className="text-[11px] font-bold text-slate-500 mb-0.5">
                    {contractType === 'return' ? '🔄 반납형' : '🏷️ 인수형'} 수익 분석
                  </p>
                  {contractType === 'return' ? (
                    <>
                      <div className="flex justify-between"><span className="text-slate-500">렌트료 수입</span><span className="font-bold text-slate-600">{f(calculations.rentWithVAT * termMonths)}원</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">반납 회수가</span><span className="font-bold text-steel-600">{f(calculations.residualValue)}원</span></div>
                      <div className="flex justify-between border-t border-black/[0.06] pt-1"><span className="text-slate-600 font-bold">총 회수</span><span className="font-black text-green-600">{f(calculations.rentWithVAT * termMonths + calculations.residualValue)}원</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">원가대비</span><span className="font-bold text-steel-600">{calculations.costBase > 0 ? (((calculations.rentWithVAT * termMonths + calculations.residualValue) / calculations.costBase) * 100).toFixed(1) : 0}%</span></div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between"><span className="text-amber-500">인수가격</span><span className="font-bold text-amber-600">{f(calculations.buyoutPrice)}원</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">렌트료 수입</span><span className="font-bold text-slate-600">{f(calculations.rentWithVAT * termMonths)}원</span></div>
                      <div className="flex justify-between border-t border-black/[0.06] pt-1"><span className="text-slate-600 font-bold">고객 총 지불</span><span className="font-bold text-slate-600">{f(calculations.rentWithVAT * termMonths + deposit + calculations.buyoutPrice)}원</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">인수 차익</span><span className={`font-bold ${calculations.buyoutPrice >= calculations.endMarketValue ? 'text-green-600' : 'text-red-500'}`}>{calculations.buyoutPrice >= calculations.endMarketValue ? '+' : ''}{f(calculations.buyoutPrice - calculations.endMarketValue)}원</span></div>
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
        </>
      )}
    </div>
  )
}

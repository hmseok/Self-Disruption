'use client'

import { createContext, useContext, Dispatch, SetStateAction, RefObject } from 'react'
import type { CalcResult } from '@/lib/rent-calc-engine'
import type {
  CarData, MarketComp, BusinessRules, DepAxes, DriverAgeGroup,
  NewCarResult, NewCarVariant, NewCarTrim, NewCarOption, NewCarColor,
} from '@/lib/rent-calc-types'
import type { DepCurvePreset, MaintenancePackage } from '@/lib/rent-calc'
import type { estimateInsurance } from '@/lib/rent-calc'
import type { HTableRow } from './OptionHTable'

/**
 * 견적 빌더 공유 상태 컨텍스트
 *
 * RentPricingBuilder의 모든 상태를 하위 스텝 컴포넌트에 전달하는 컨텍스트.
 * 5,853줄 단일 파일 → 모듈 분리의 핵심 접착제 역할.
 *
 * PricingState: 130+ 프로퍼티를 논리적 그룹으로 구조화한 타입 정의
 */

// ────────────────────────────────────────────────────────────────
// 초과주행 원가 분해 (excessRateBreakdown)
// ────────────────────────────────────────────────────────────────
export interface ExcessRateBreakdown {
  depCost: number
  maintCost: number
  margin: number
  total: number
  depDiffPct: number
  extraKm: number
  depAmount: number
  tierPenalty: number
  maintItems: { name: string; perKm: number }[]
  baseCost: number
}

// ────────────────────────────────────────────────────────────────
// 계산 결과 (calculations useMemo)
// ────────────────────────────────────────────────────────────────
export interface Calculations {
  // 차량 기본
  carAge: number
  mileage10k: number
  termYears: number
  isUsedCar: boolean

  // 감가 분석 — 현재
  yearDep: number
  mileageDep: number
  totalDepRate: number
  excessMileageNow: number
  avgMileageNow: number
  currentMarketValue: number

  // 감가 분석 — 종료 시점
  yearDepEnd: number
  mileageDepEnd: number
  totalDepRateEnd: number
  excessMileageEnd: number
  avgMileageEnd: number
  endMarketValue: number
  projectedMileage10k: number
  effectiveEndMarketValue: number

  // 월 감가
  monthlyDepreciation: number

  // 중고차 분석
  purchaseMileage10k: number
  purchaseAvgMileage: number
  purchaseExcessMileage: number
  purchaseMileageDep: number
  purchaseYearDep: number
  purchaseTotalDep: number
  theoreticalMarketValue: number
  purchasePremiumPct: number
  customerDriven10k: number
  standardAddition10k: number
  customerExcessMileage: number
  customerMileageDep: number
  customerYearDep: number
  customerTotalDepChange: number
  usedCarEndTotalDep: number
  usedCarEndMarketValue: number
  carActualEndMarketValue: number

  // 잔존가치
  residualValue: number
  buyoutPrice: number
  costBase: number

  // 감가 매핑 데이터
  depClass: string
  classMult: number
  matchedDepRate: any
  autoAxes: DepAxes | null
  effectiveAxes: DepAxes | null
  activeCurve: number[]
  adjustmentFactor: number
  mileageFactor: number
  marketFactor: number
  popularityFactor: number

  // 금융
  effectiveLoan: number
  equityAmount: number
  monthlyLoanInterest: number
  monthlyOpportunityCost: number
  totalMonthlyFinance: number
  avgLoanBalance: number
  loanEndBalance: number
  avgEquityBalance: number
  equityEndBalance: number

  // 운영비
  monthlyTax: number
  monthlyInspectionCost: number
  inspectionCostPerTime: number
  inspectionsInTerm: number
  inspIntervalMonths: number
  totalMonthlyOperation: number

  // 리스크·할인
  monthlyRiskReserve: number
  monthlyDepositDiscount: number
  monthlyPrepaymentDiscount: number
  totalDiscount: number

  // 합계
  totalMonthlyCost: number
  suggestedRent: number
  rentWithVAT: number

  // 시장비교
  marketAvg: number
  marketDiff: number
  purchaseDiscount: number

  // 원가 비중
  costBreakdown: {
    depreciation: number
    finance: number
    operation: number
    risk: number
    discount: number
    overhead: number
    insurance: number
    maintenance: number
  }

  // IRR
  irrResult: any

  // v2.0 엔진 전체 결과
  engineResult: CalcResult
}

// ────────────────────────────────────────────────────────────────
// PricingState — 전체 컨텍스트 타입
// ────────────────────────────────────────────────────────────────
type WizardStep = 'vehicle' | 'options' | 'analysis' | 'customer' | 'preview'
type Setter<T> = Dispatch<SetStateAction<T>>

export interface PricingState {
  // ── 위저드 ──
  wizardStep: WizardStep
  setWizardStep: Setter<WizardStep>
  advancedMode: boolean
  setAdvancedMode: Setter<boolean>

  // ── 견적 수정 ──
  editingQuoteId: string | null
  quoteCompany: any
  effectiveCompanyId: string | undefined

  // ── 고객 ──
  customers: any[]
  selectedCustomerId: string
  setSelectedCustomerId: Setter<string>
  customerMode: 'select' | 'manual'
  setCustomerMode: Setter<'select' | 'manual'>
  manualCustomer: { name: string; phone: string; email: string; business_number: string }
  setManualCustomer: Setter<{ name: string; phone: string; email: string; business_number: string }>
  startDate: string
  setStartDate: Setter<string>
  quoteNote: string
  setQuoteNote: Setter<string>
  quoteSaving: boolean

  // ── 데이터 ──
  cars: CarData[]
  loading: boolean
  editLoading: boolean
  selectedCar: CarData | null
  setSelectedCar: Setter<CarData | null>
  rules: BusinessRules
  calculations: Calculations | null
  saving: boolean
  setSaving: Setter<boolean>
  currentWorksheetId: string | null
  setCurrentWorksheetId: Setter<string | null>

  // ── 가격 ──
  factoryPrice: number
  setFactoryPrice: Setter<number>
  purchasePrice: number
  setPurchasePrice: Setter<number>

  // ── 감가 ──
  carAgeMode: 'new' | 'used'
  setCarAgeMode: Setter<'new' | 'used'>
  customCarAge: number
  setCustomCarAge: Setter<number>
  depCurvePreset: DepCurvePreset
  setDepCurvePreset: Setter<DepCurvePreset>
  depCustomCurve: number[]
  setDepCustomCurve: Setter<number[]>
  depClassOverride: string
  setDepClassOverride: Setter<string>
  depYear1Rate: number
  setDepYear1Rate: Setter<number>
  depYear2Rate: number
  setDepYear2Rate: Setter<number>
  annualMileage: number
  setAnnualMileage: Setter<number>
  baselineKm: number
  setBaselineKm: Setter<number>
  excessMileageRate: number
  setExcessMileageRate: Setter<number>
  excessRateMarginPct: number
  setExcessRateMarginPct: Setter<number>
  excessRateBreakdown: ExcessRateBreakdown

  // ── 금융 ──
  loanAmount: number
  setLoanAmount: Setter<number>
  loanRate: number
  setLoanRate: Setter<number>
  investmentRate: number
  setInvestmentRate: Setter<number>

  // ── 운영 ──
  maintPackage: MaintenancePackage
  setMaintPackage: Setter<MaintenancePackage>
  oilChangeFreq: 1 | 2
  setOilChangeFreq: Setter<1 | 2>
  monthlyMaintenance: number
  setMonthlyMaintenance: Setter<number>
  monthlyInsuranceCost: number
  setMonthlyInsuranceCost: Setter<number>
  driverAgeGroup: DriverAgeGroup
  setDriverAgeGroup: Setter<DriverAgeGroup>
  insEstimate: ReturnType<typeof estimateInsurance> | null
  insAutoMode: boolean
  setInsAutoMode: Setter<boolean>
  ownDamageCoverageRatio: number
  setOwnDamageCoverageRatio: Setter<number>
  annualTax: number
  setAnnualTax: Setter<number>
  engineCC: number
  setEngineCC: Setter<number>

  // ── 리스크 ──
  deductible: number
  setDeductible: Setter<number>
  riskRate: number
  setRiskRate: Setter<number>

  // ── 보증금·선납금 ──
  deposit: number
  setDeposit: Setter<number>
  prepayment: number
  setPrepayment: Setter<number>
  depositDiscountRate: number
  setDepositDiscountRate: Setter<number>
  prepaymentDiscountRate: number
  setPrepaymentDiscountRate: Setter<number>

  // ── 계약 ──
  contractType: 'return' | 'buyout'
  setContractType: Setter<'return' | 'buyout'>
  residualRate: number
  setResidualRate: Setter<number>
  buyoutPremium: number
  setBuyoutPremium: Setter<number>
  termMonths: number
  setTermMonths: Setter<number>
  margin: number
  setMargin: Setter<number>

  // ── 시장비교 ──
  marketComps: MarketComp[]
  setMarketComps: Setter<MarketComp[]>
  newComp: MarketComp
  setNewComp: Setter<MarketComp>
  addMarketComp: () => Promise<void>
  removeMarketComp: (id: string) => Promise<void>

  // ── 취득원가 ──
  totalAcquisitionCost: number
  setTotalAcquisitionCost: Setter<number>
  acquisitionTax: number
  setAcquisitionTax: Setter<number>
  bondCost: number
  setBondCost: Setter<number>
  deliveryFee: number
  setDeliveryFee: Setter<number>
  miscFee: number
  setMiscFee: Setter<number>
  registrationRegion: string
  setRegistrationRegion: Setter<string>
  carCostItems: { category: string; item_name: string; amount: number }[]

  // ── 기준표 데이터 ──
  depRates: any[]
  depAdjustments: any[]
  depreciationDB: any[]
  insuranceRates: any[]
  maintenanceCosts: any[]
  taxRates: any[]
  financeRates: any[]
  regCosts: any[]
  inspectionCosts: any[]
  inspectionSchedules: any[]
  insBasePremiums: any[]
  insOwnRates: any[]
  popularityGrade: string
  setPopularityGrade: Setter<string>
  dbOriginOverride: string
  setDbOriginOverride: Setter<string>
  dbVehicleClassOverride: string
  setDbVehicleClassOverride: Setter<string>
  dbFuelTypeOverride: string
  setDbFuelTypeOverride: Setter<string>

  // ── 자동매핑 ──
  autoCategory: string
  autoInsType: string
  autoMaintType: string

  // ── Option H ──
  hBaseline: { [k: string]: number } | null
  setHBaseline: Setter<{ [k: string]: number } | null>
  lockedParams: Set<string>
  toggleLock: (key: string) => void
  savedPricesOpen: boolean
  setSavedPricesOpen: Setter<boolean>

  // ── 신차 조회 ──
  lookupMode: 'registered' | 'newcar' | 'saved'
  setLookupMode: Setter<'registered' | 'newcar' | 'saved'>
  activeTab: 'registered' | 'newcar' | 'catalog'
  setActiveTab: Setter<'registered' | 'newcar' | 'catalog'>
  newCarBrand: string
  setNewCarBrand: Setter<string>
  newCarModel: string
  setNewCarModel: Setter<string>
  newCarResult: NewCarResult | null
  setNewCarResult: Setter<NewCarResult | null>
  newCarSelectedTax: string
  setNewCarSelectedTax: Setter<string>
  newCarSelectedFuel: string
  setNewCarSelectedFuel: Setter<string>
  newCarSelectedVariant: NewCarVariant | null
  setNewCarSelectedVariant: Setter<NewCarVariant | null>
  newCarSelectedTrim: NewCarTrim | null
  setNewCarSelectedTrim: Setter<NewCarTrim | null>
  newCarSelectedOptions: NewCarOption[]
  setNewCarSelectedOptions: Setter<NewCarOption[]>
  newCarSelectedExterior: NewCarColor | null
  setNewCarSelectedExterior: Setter<NewCarColor | null>
  newCarSelectedInterior: NewCarColor | null
  setNewCarSelectedInterior: Setter<NewCarColor | null>
  newCarPurchasePrice: string
  setNewCarPurchasePrice: Setter<string>
  isLookingUp: boolean
  lookupStage: string
  lookupError: string
  lookupElapsed: number
  handleNewCarLookup: () => Promise<void>
  isParsingQuote: boolean
  parseStage: string
  parseElapsed: number
  savedCarPrices: any[]
  savedWorksheets: any[]
  isSavingPrice: boolean
  carSearchQuery: string
  setCarSearchQuery: Setter<string>
  isDragging: boolean
  setIsDragging: Setter<boolean>

  // ── 카탈로그 ──
  catalogSearch: string
  setCatalogSearch: Setter<string>
  catalogFilter: 'all' | 'worksheets' | 'prices'
  setCatalogFilter: Setter<'all' | 'worksheets' | 'prices'>
  catalogSort: 'recent' | 'price_asc' | 'price_desc' | 'brand'
  setCatalogSort: Setter<'recent' | 'price_asc' | 'price_desc' | 'brand'>
  showAddPanel: boolean
  setShowAddPanel: Setter<boolean>
  checkedRows: Set<string>
  setCheckedRows: Setter<Set<string>>
  dropFileRef: RefObject<HTMLInputElement | null>

  // ── 핸들러 ──
  handleCarSelect: (car: CarData) => void
  handleNewCarAnalysis: (selection: any) => void
  handleSaveNewCarPrice: (data: any) => Promise<void>
  handleLoadSavedPrice: (saved: any) => void
  handleDeleteSavedPrice: (id: string) => Promise<void>
  handleDeleteSavedWorksheet: (id: string) => Promise<void>
  handleBulkDeletePrices: () => Promise<void>
  handleQuoteImageUpload: (e: any) => Promise<void>
  onDropFile: (e: any) => void
  handleSaveWorksheet: () => Promise<void>
  handleSaveQuote: () => Promise<void>
  handleConvertToQuote: () => void
  applyReferenceTableMappings: (car: CarData) => void

  // ── 기타 ──
  termsExcessInfo: any
  termsConfig: { id: number; insurance_coverage: any[]; quote_notices: any[]; calc_params: Record<string, any> } | null
  linkedInsurance: any
  linkedFinance: any
  printRef: RefObject<HTMLDivElement | null>
}

// ────────────────────────────────────────────────────────────────
// Context + Hook
// ────────────────────────────────────────────────────────────────
const PricingContext = createContext<PricingState | null>(null)

export function usePricing(): PricingState {
  const ctx = useContext(PricingContext)
  if (!ctx) throw new Error('usePricing must be used within PricingProvider')
  return ctx
}

export const PricingProvider = PricingContext.Provider
export default PricingContext

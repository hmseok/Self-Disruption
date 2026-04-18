'use client'

import { usePricing } from './PricingContext'
import { f, safeNum, safeDiv, formatWonCompact, MAINT_PACKAGE_LABELS, MAINT_PACKAGE_DESC } from '@/lib/quote-utils'
import { DEP_CURVE_PRESETS, DEP_CLASS_MULTIPLIER, MAINTENANCE_PACKAGES, MAINT_MULTIPLIER, MAINT_ITEMS, DRIVER_AGE_FACTORS, INS_BASE_ANNUAL, INS_OWN_DAMAGE_RATE, DEDUCTIBLE_DISCOUNT } from '@/lib/rent-calc'
import { DOMESTIC_BRANDS, IMPORT_BRAND_PRESETS, IMPORT_BRANDS, PREMIUM_MODELS, EV_FUEL_KEYWORDS, EV_MODEL_KEYWORDS, HEV_KEYWORDS } from '@/lib/rent-calc-types'
import type { DepCurvePreset, MaintenancePackage, MaintItem } from '@/lib/rent-calc'
import type { DriverAgeGroup } from '@/lib/rent-calc-types'
import { CostBar, Section, InputRow, ResultRow } from './components'
import OptionHPanel, { type PresetMode as OptionHPresetMode } from './OptionHPanel'
import OptionHTable, { type HTableRow } from './OptionHTable'

/**
 * AnalysisStep — 상세견적 (계약조건·원가분석·렌트가)
 * RentPricingBuilder에서 분리된 Step 3 컴포넌트
 */
export default function AnalysisStep() {
  const ctx = usePricing()
  const {
    selectedCar, calculations, wizardStep, setWizardStep,
    advancedMode, setAdvancedMode,
    termMonths, setTermMonths,
    margin, setMargin,
    deposit, setDeposit,
    prepayment, setPrepayment,
    contractType, setContractType,
    residualRate, setResidualRate,
    buyoutPremium, setBuyoutPremium,
    loanAmount, setLoanAmount,
    loanRate, setLoanRate,
    investmentRate, setInvestmentRate,
    maintPackage, setMaintPackage,
    oilChangeFreq, setOilChangeFreq,
    monthlyMaintenance, setMonthlyMaintenance,
    monthlyInsuranceCost, setMonthlyInsuranceCost,
    driverAgeGroup, setDriverAgeGroup,
    insEstimate, insAutoMode, setInsAutoMode,
    ownDamageCoverageRatio, setOwnDamageCoverageRatio,
    deductible, setDeductible,
    riskRate, setRiskRate,
    annualTax, setAnnualTax,
    engineCC, setEngineCC,
    annualMileage, setAnnualMileage,
    baselineKm, setBaselineKm,
    excessMileageRate, setExcessMileageRate,
    excessRateMarginPct, setExcessRateMarginPct,
    excessRateBreakdown,
    depCurvePreset, setDepCurvePreset,
    depCustomCurve, setDepCustomCurve,
    depClassOverride, setDepClassOverride,
    depYear1Rate, setDepYear1Rate,
    depYear2Rate, setDepYear2Rate,
    depositDiscountRate, setDepositDiscountRate,
    prepaymentDiscountRate, setPrepaymentDiscountRate,
    factoryPrice, purchasePrice,
    carAgeMode, setCarAgeMode,
    customCarAge, setCustomCarAge,
    marketComps, setMarketComps,
    newComp, setNewComp,
    addMarketComp, removeMarketComp,
    autoCategory, autoInsType, autoMaintType,
    totalAcquisitionCost, acquisitionTax, bondCost, deliveryFee, miscFee,
    setTotalAcquisitionCost, setAcquisitionTax, setBondCost, setDeliveryFee, setMiscFee,
    registrationRegion, setRegistrationRegion,
    depRates, depAdjustments, depreciationDB,
    popularityGrade, setPopularityGrade,
    dbOriginOverride, setDbOriginOverride,
    dbVehicleClassOverride, setDbVehicleClassOverride,
    dbFuelTypeOverride, setDbFuelTypeOverride,
    rules,
    hBaseline, setHBaseline,
    lockedParams, toggleLock,
    saving,
    handleSaveWorksheet,
    handleConvertToQuote,
    termsExcessInfo,
    termsConfig,
    linkedInsurance, linkedFinance,
    carCostItems,
  } = ctx

  if (!selectedCar) return null

  return (
    <>
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
                        else setLoanAmount(Math.round(purchasePrice * (rules.LOAN_LTV_DEFAULT ? rules.LOAN_LTV_DEFAULT / 100 : 0.7)))
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
    </>
  )
}

'use client'

import { useEffect, useState, useMemo } from 'react'
import { fetchPricingStandardsData } from '@/app/utils/pricing-standards'
import { calculateRentCost, calculateAcquisitionCost, type CalcInput, type CalcResult } from '@/lib/rent-calc-engine'
import { mapToDepAxes, getInsVehicleClass, estimateInsurance, mapToMaintenanceType, getMaintCostPerKm, buildCurveFromDbRates, getExcessMileageRateFromTerms, DEP_CURVE_PRESETS, DEP_CLASS_MULTIPLIER, MAINTENANCE_PACKAGES, MAINT_MULTIPLIER } from '@/lib/rent-calc'

/**
 * 실시간 시뮬레이션 패널
 * 기준표 설정 페이지 우측에 표시, 설정값 변경 → 즉시 렌트료 재계산
 */
export default function SimulationPanel() {
  // 시뮬레이션 입력
  const [vehiclePrice, setVehiclePrice] = useState(35000000)
  const [termMonths, setTermMonths] = useState(36)
  const [engineCC, setEngineCC] = useState(2000)
  const [brand, setBrand] = useState('현대')
  const [model, setModel] = useState('쏘나타')
  const [fuel, setFuel] = useState('가솔린')
  const [contractType, setContractType] = useState<'return' | 'buyout'>('return')

  // DB 기준표 데이터
  const [rules, setRules] = useState<Record<string, number>>({})
  const [depRates, setDepRates] = useState<any[]>([])
  const [depAdjustments, setDepAdjustments] = useState<any[]>([])
  const [depDB, setDepDB] = useState<any[]>([])
  const [taxRates, setTaxRates] = useState<any[]>([])
  const [regCosts, setRegCosts] = useState<any[]>([])
  const [inspCosts, setInspCosts] = useState<any[]>([])
  const [inspSchedules, setInspSchedules] = useState<any[]>([])
  const [insBasePremiums, setInsBasePremiums] = useState<any[]>([])
  const [insOwnRates, setInsOwnRates] = useState<any[]>([])
  const [insuranceRates, setInsuranceRates] = useState<any[]>([])
  const [financeRates, setFinanceRates] = useState<any[]>([])
  const [maintCosts, setMaintCosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  // 데이터 로드
  const loadAllData = async () => {
    try {
      setLoading(true)
      const [rulesData, depR, depA, depD, tax, reg, inspC, inspS, insB, insO, insR, fin, maint] = await Promise.all([
        fetchPricingStandardsData('business_rules'),
        fetchPricingStandardsData('depreciation_rates'),
        fetchPricingStandardsData('depreciation_adjustments'),
        fetchPricingStandardsData('depreciation_db'),
        fetchPricingStandardsData('vehicle_tax_table'),
        fetchPricingStandardsData('registration_cost_table'),
        fetchPricingStandardsData('inspection_cost_table'),
        fetchPricingStandardsData('inspection_schedule_table'),
        fetchPricingStandardsData('insurance_base_premium'),
        fetchPricingStandardsData('insurance_own_vehicle_rate'),
        fetchPricingStandardsData('insurance_rate_table'),
        fetchPricingStandardsData('finance_rate_table'),
        fetchPricingStandardsData('maintenance_cost_table'),
      ])
      const ruleMap: Record<string, number> = {}
      ;(rulesData || []).forEach((r: any) => { ruleMap[r.key] = Number(r.value) || 0 })
      setRules(ruleMap)
      setDepRates(depR || [])
      setDepAdjustments(depA || [])
      setDepDB(depD || [])
      setTaxRates(tax || [])
      setRegCosts(reg || [])
      setInspCosts(inspC || [])
      setInspSchedules(inspS || [])
      setInsBasePremiums(insB || [])
      setInsOwnRates(insO || [])
      setInsuranceRates(insR || [])
      setFinanceRates(fin || [])
      setMaintCosts(maint || [])
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'))
    } catch (e) {
      console.error('SimulationPanel load error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAllData() }, [])

  // 계산 실행
  const result = useMemo<CalcResult | null>(() => {
    if (loading || !vehiclePrice) return null
    try {
      const loanRate = rules.LOAN_INTEREST_RATE || 6.5
      const investmentRate = rules.INVESTMENT_RETURN_RATE || 4.0
      const ltvDefault = rules.LOAN_LTV_DEFAULT || 70
      const loanAmount = Math.round(vehiclePrice * ltvDefault / 100)

      // 취득원가 계산
      const acqResult = calculateAcquisitionCost({
        purchase_price: vehiclePrice,
        engine_cc: engineCC,
        model,
        fuel,
        is_commercial: true,
        registration_region: '서울',
        reg_costs: regCosts,
      })

      const calcInput: CalcInput = {
        vehicle: {
          brand, model, fuel, engine_cc: engineCC,
          factory_price: Math.round(vehiclePrice * 1.15),
          purchase_price: vehiclePrice,
          mileage: 0, is_commercial: true,
        },
        contract: {
          term_months: termMonths,
          car_age_mode: 'new', custom_car_age: 0,
          contract_type: contractType,
          residual_rate: contractType === 'buyout' ? 60 : 100,
          buyout_premium: 0,
          annual_mileage: 2.0, baseline_km: 2.0,
        },
        depreciation: {
          curve_preset: 'db_based',
          popularity_grade: 'B등급 (일반)',
        },
        finance: { loan_amount: loanAmount, loan_rate: loanRate, investment_rate: investmentRate },
        insurance: { auto_mode: true, monthly_cost: 0, driver_age: '26세이상', deductible: rules.DEDUCTIBLE_AMOUNT || 500000, own_damage_ratio: 100 },
        maintenance: { package: 'basic', oil_change_freq: 1, monthly_cost: 0 },
        tax: { annual_tax: 0, engine_cc: engineCC, registration_region: '서울' },
        risk: { rate: rules.RISK_RESERVE_RATE || 2.0 },
        overhead: {
          overhead_rate: rules.OVERHEAD_RATE || 5,
          margin: rules.DEFAULT_MARGIN_RATE ? rules.DEFAULT_MARGIN_RATE * 10000 : 100000,
          insurance_loading: rules.INSURANCE_LOADING || 15,
        },
        deposit_prepay: { deposit: 0, prepayment: 0, deposit_discount_rate: 0, prepayment_discount_rate: 0 },
        acquisition: {
          total_cost: acqResult.total,
          acquisition_tax: acqResult.acquisition_tax,
          bond_cost: acqResult.bond_cost,
          delivery_fee: acqResult.delivery_fee,
          misc_fee: acqResult.misc_fee,
        },
        reference: {
          dep_rates: depRates, dep_adjustments: depAdjustments, dep_db: depDB,
          tax_rates: taxRates, reg_costs: regCosts,
          inspection_costs: inspCosts, inspection_schedules: inspSchedules,
          ins_base_premiums: insBasePremiums, ins_own_rates: insOwnRates,
          insurance_rates: insuranceRates, finance_rates: financeRates,
          maintenance_costs: maintCosts,
        },
        rules,
      }

      return calculateRentCost(calcInput)
    } catch (e) {
      console.error('Simulation calc error:', e)
      return null
    }
  }, [vehiclePrice, termMonths, engineCC, brand, model, fuel, contractType, rules, depRates, depAdjustments, depDB, taxRates, regCosts, inspCosts, inspSchedules, insBasePremiums, insOwnRates, insuranceRates, financeRates, maintCosts, loading])

  const f = (n: number) => n.toLocaleString('ko-KR')

  const presets = [
    { label: '모닝', price: 14900000, cc: 998, brand: '기아', model: '모닝', fuel: '가솔린' },
    { label: '아반떼', price: 22000000, cc: 1598, brand: '현대', model: '아반떼', fuel: '가솔린' },
    { label: '쏘나타', price: 35000000, cc: 1999, brand: '현대', model: '쏘나타', fuel: '가솔린' },
    { label: '그랜저', price: 45000000, cc: 2497, brand: '현대', model: '그랜저', fuel: '가솔린' },
    { label: 'BMW 520i', price: 68000000, cc: 1998, brand: 'BMW', model: '520i', fuel: '가솔린' },
  ]

  if (loading) {
    return (
      <div className="bg-white/70 rounded-2xl p-5 border border-black/[0.06] text-center">
        <p className="text-xs text-slate-400">기준표 로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="bg-white/70 rounded-2xl border border-black/[0.06] shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 py-3 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border-b border-black/[0.04]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">🧮</span>
            <h3 className="text-xs font-bold text-slate-800">실시간 시뮬레이션</h3>
          </div>
          <button onClick={loadAllData} className="text-[10px] text-blue-500 hover:text-blue-700 font-medium">
            🔄 새로고침
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5">기준표 설정값으로 즉시 렌트료 산출</p>
      </div>

      <div className="p-4 space-y-3">
        {/* 차량 프리셋 */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 mb-1.5 block">차량 프리셋</label>
          <div className="flex flex-wrap gap-1">
            {presets.map(p => (
              <button key={p.label}
                onClick={() => { setVehiclePrice(p.price); setEngineCC(p.cc); setBrand(p.brand); setModel(p.model); setFuel(p.fuel) }}
                className={`px-2 py-1 text-[10px] rounded-lg border transition-all ${
                  model === p.model ? 'bg-blue-500 text-white border-blue-500' : 'bg-white/60 text-slate-600 border-black/[0.06] hover:bg-blue-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 차량가 입력 */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 mb-1 block">매입가</label>
          <input type="text" value={f(vehiclePrice)}
            onChange={e => setVehiclePrice(parseInt(e.target.value.replace(/,/g, '')) || 0)}
            className="w-full px-3 py-2 text-xs border border-black/[0.08] rounded-lg bg-white/40 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {/* 기간 & 유형 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 mb-1 block">기간</label>
            <div className="flex gap-1">
              {[24, 36, 48, 60].map(m => (
                <button key={m} onClick={() => setTermMonths(m)}
                  className={`flex-1 py-1.5 text-[10px] rounded-lg border ${
                    termMonths === m ? 'bg-blue-500 text-white border-blue-500' : 'bg-white/60 text-slate-600 border-black/[0.06]'
                  }`}
                >
                  {m}월
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 mb-1 block">유형</label>
            <div className="flex gap-1">
              {[{ v: 'return' as const, l: '반납형' }, { v: 'buyout' as const, l: '인수형' }].map(t => (
                <button key={t.v} onClick={() => setContractType(t.v)}
                  className={`flex-1 py-1.5 text-[10px] rounded-lg border ${
                    contractType === t.v ? 'bg-blue-500 text-white border-blue-500' : 'bg-white/60 text-slate-600 border-black/[0.06]'
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 결과 */}
        {result && (
          <div className="space-y-2 pt-2 border-t border-black/[0.04]">
            {/* 월 렌탈료 */}
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl text-white">
              <div className="text-[10px] opacity-80">월 렌탈료 (VAT 포함)</div>
              <div className="text-xl font-black">{f(result.rent_with_vat)}원</div>
              <div className="text-[10px] opacity-70 mt-0.5">VAT 별도: {f(result.suggested_rent)}원</div>
            </div>

            {/* 7대 원가 구성 */}
            <div className="p-3 bg-white/50 rounded-xl border border-black/[0.04]">
              <div className="text-[10px] font-bold text-slate-600 mb-2">원가 구성 (월)</div>
              <div className="space-y-1.5">
                {[
                  { label: '감가상각', value: result.breakdown.depreciation.monthly, color: 'bg-blue-400' },
                  { label: '금융비용', value: result.breakdown.finance.monthly, color: 'bg-indigo-400' },
                  { label: '보험료', value: result.breakdown.insurance.monthly, color: 'bg-green-400' },
                  { label: '정비비', value: result.breakdown.maintenance.monthly, color: 'bg-amber-400' },
                  { label: '세금·검사', value: result.breakdown.tax_inspection.monthly, color: 'bg-red-400' },
                  { label: '리스크적립', value: result.breakdown.risk.monthly, color: 'bg-purple-400' },
                  { label: '간접비', value: result.breakdown.overhead.monthly, color: 'bg-slate-400' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${item.color}`} />
                      <span className="text-slate-600">{item.label}</span>
                    </div>
                    <span className="font-semibold text-slate-800">{f(item.value)}원</span>
                  </div>
                ))}
                {result.breakdown.discount.monthly < 0 && (
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-emerald-600">할인</span>
                    </div>
                    <span className="font-semibold text-emerald-600">{f(result.breakdown.discount.monthly)}원</span>
                  </div>
                )}
              </div>
            </div>

            {/* 시장 분석 */}
            <div className="p-3 bg-white/50 rounded-xl border border-black/[0.04]">
              <div className="text-[10px] font-bold text-slate-600 mb-2">시장 분석</div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-slate-400">렌트/차량가</span>
                  <div className="font-bold text-slate-800">{result.market_analysis.rent_to_price_ratio}%</div>
                </div>
                <div>
                  <span className="text-slate-400">경쟁력 지수</span>
                  <div className={`font-bold ${result.market_analysis.competitive_index <= 1.0 ? 'text-green-600' : 'text-amber-600'}`}>
                    {result.market_analysis.competitive_index}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">마진율</span>
                  <div className="font-bold text-slate-800">{result.market_analysis.margin_rate}%</div>
                </div>
                <div>
                  <span className="text-slate-400">손익분기</span>
                  <div className="font-bold text-slate-800">{result.market_analysis.breakeven_months}개월</div>
                </div>
              </div>
            </div>

            {/* IRR */}
            {result.irr_result && (
              <div className="p-2 bg-slate-50/80 rounded-lg text-[10px] text-center">
                <span className="text-slate-400">연 IRR: </span>
                <span className="font-bold text-slate-700">{(result.irr_result.annualIRR * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>
        )}

        <div className="text-[9px] text-slate-300 text-center pt-1">
          마지막 갱신: {lastUpdated}
        </div>
      </div>
    </div>
  )
}

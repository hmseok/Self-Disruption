// ============================================
// 급여 계산 유틸 (2025년 기준)
// 4대보험 + 소득세 자동 계산
// + 실수령액 역계산, 부양가족 반영, 식대초과 계산
// ============================================

// ── 4대보험 요율 (2025년 기준, 근로자 부담분) ──
export const INSURANCE_RATES = {
  nationalPension: 0.045,       // 국민연금 4.5%
  healthInsurance: 0.03545,     // 건강보험 3.545%
  longCareRate: 0.1281,         // 장기요양 = 건강보험의 12.81%
  employmentInsurance: 0.009,   // 고용보험 0.9%
}

// 국민연금 상한/하한 (월 기준소득월액)
const NP_MIN = 370000   // 하한
const NP_MAX = 5900000  // 상한 (590만원)

// ── 비과세 기본값 ──
export const NON_TAXABLE_ITEMS: Record<string, number> = {
  '식대': 200000,      // 월 20만원 비과세
  '자가운전보조금': 200000,
}

// ── HR 전문 수당 목록 ──
export const ALLOWANCE_TYPES = [
  { key: '식대', label: '식대', defaultAmount: 200000, nonTaxableLimit: 200000, description: '비과세 한도 월 20만원' },
  { key: '교통비', label: '교통비', defaultAmount: 0, nonTaxableLimit: 0, description: '과세 대상' },
  { key: '자가운전보조금', label: '자가운전보조금', defaultAmount: 0, nonTaxableLimit: 200000, description: '비과세 한도 월 20만원' },
  { key: '직책수당', label: '직책수당', defaultAmount: 0, nonTaxableLimit: 0, description: '직급에 따른 수당' },
  { key: '가족수당', label: '가족수당', defaultAmount: 0, nonTaxableLimit: 0, description: '부양가족 수당' },
  { key: '야간수당', label: '야간근무수당', defaultAmount: 0, nonTaxableLimit: 0, description: '22시~06시 근무 150%' },
  { key: '연장수당', label: '연장근무수당', defaultAmount: 0, nonTaxableLimit: 0, description: '주 40시간 초과 150%' },
  { key: '연차수당', label: '연차미사용수당', defaultAmount: 0, nonTaxableLimit: 0, description: '미사용 연차 보상' },
  { key: '상여금', label: '상여금', defaultAmount: 0, nonTaxableLimit: 0, description: '성과/명절 상여' },
]

// ── 수동 공제 항목 목록 ──
export const DEDUCTION_TYPES = [
  { key: '노조비', label: '노조비', description: '노동조합비' },
  { key: '기숙사비', label: '기숙사비', description: '사택/기숙사 비용' },
  { key: '학자금상환', label: '학자금상환', description: 'ICL 학자금 대출 상환' },
  { key: '선급금상환', label: '선급금상환', description: '급여 선지급분 상환' },
  { key: '기타공제', label: '기타공제', description: '기타 수동 공제' },
]

// ── 고용형태 ──
export const EMPLOYMENT_TYPES = [
  { key: '정규직', label: '정규직', description: '4대보험 + 근로소득세' },
  { key: '계약직', label: '계약직', description: '4대보험 + 근로소득세' },
  { key: '일용직', label: '일용직', description: '일급제, 일용근로소득세' },
  { key: '프리랜서', label: '프리랜서(3.3%)', description: '사업소득 3.3% 원천징수' },
]

// ── 급여형태 ──
export const SALARY_TYPES = [
  { key: '연봉제', label: '연봉제', description: '연봉 ÷ 12' },
  { key: '월급제', label: '월급제', description: '월 고정급' },
  { key: '시급제', label: '시급제', description: '시급 × 근무시간' },
  { key: '일급제', label: '일급제', description: '일급 × 근무일수' },
]

// ── 과세 소득 계산 ──
export function calcTaxableIncome(
  baseSalary: number,
  allowances: Record<string, number>
): number {
  let totalNonTaxable = 0
  for (const [key, amount] of Object.entries(allowances)) {
    const limit = NON_TAXABLE_ITEMS[key]
    if (limit) {
      totalNonTaxable += Math.min(amount, limit)
    }
  }
  const totalAllowances = Object.values(allowances).reduce((s, v) => s + v, 0)
  return baseSalary + totalAllowances - totalNonTaxable
}

// ── 국민연금 ──
export function calcNationalPension(taxableIncome: number): number {
  const base = Math.min(Math.max(taxableIncome, NP_MIN), NP_MAX)
  return Math.round(base * INSURANCE_RATES.nationalPension / 10) * 10
}

// ── 건강보험 ──
export function calcHealthInsurance(taxableIncome: number): number {
  return Math.round(taxableIncome * INSURANCE_RATES.healthInsurance / 10) * 10
}

// ── 장기요양보험 ──
export function calcLongCareInsurance(healthInsurance: number): number {
  return Math.round(healthInsurance * INSURANCE_RATES.longCareRate / 10) * 10
}

// ── 고용보험 ──
export function calcEmploymentInsurance(taxableIncome: number): number {
  return Math.round(taxableIncome * INSURANCE_RATES.employmentInsurance / 10) * 10
}

// ── 근로소득세 (간이세액표 기반 간소화) ──
// 2025년 간이세액표 근사치 (부양가족 1인 기준)
const INCOME_TAX_BRACKETS = [
  { min: 0,         max: 1060000,  tax: 0 },
  { min: 1060000,   max: 1500000,  tax: 19060 },
  { min: 1500000,   max: 2000000,  tax: 34060 },
  { min: 2000000,   max: 2500000,  tax: 60440 },
  { min: 2500000,   max: 3000000,  tax: 101720 },
  { min: 3000000,   max: 3500000,  tax: 143900 },
  { min: 3500000,   max: 4000000,  tax: 175730 },
  { min: 4000000,   max: 4500000,  tax: 214900 },
  { min: 4500000,   max: 5000000,  tax: 261400 },
  { min: 5000000,   max: 6000000,  tax: 330730 },
  { min: 6000000,   max: 7000000,  tax: 454730 },
  { min: 7000000,   max: 8000000,  tax: 583060 },
  { min: 8000000,   max: 10000000, tax: 742060 },
  { min: 10000000,  max: 14000000, tax: 1157390 },
  { min: 14000000,  max: 28000000, tax: 2265090 },
  { min: 28000000,  max: 30000000, tax: 5765090 },
  { min: 30000000,  max: 45000000, tax: 6315090 },
  { min: 45000000,  max: 87000000, tax: 10765090 },
  { min: 87000000,  max: Infinity, tax: 27465090 },
]

// 부양가족 공제: 본인 포함 1인 150만원/년 = 12.5만원/월
const DEPENDENT_DEDUCTION_MONTHLY = 125000

export function calcIncomeTax(taxableIncome: number, dependentsCount: number = 1): number {
  // 부양가족 추가 공제 반영 (본인 포함, 1인당 연 150만원 = 월 125,000원)
  const dependentDeduction = Math.max(0, (dependentsCount - 1)) * DEPENDENT_DEDUCTION_MONTHLY
  const adjustedIncome = Math.max(0, taxableIncome - dependentDeduction)

  for (let i = INCOME_TAX_BRACKETS.length - 1; i >= 0; i--) {
    if (adjustedIncome >= INCOME_TAX_BRACKETS[i].min) {
      const bracket = INCOME_TAX_BRACKETS[i]
      if (i < INCOME_TAX_BRACKETS.length - 1) {
        const nextBracket = INCOME_TAX_BRACKETS[i + 1]
        const ratio = (adjustedIncome - bracket.min) / (bracket.max - bracket.min)
        const tax = bracket.tax + ratio * (nextBracket.tax - bracket.tax)
        return Math.round(tax / 10) * 10
      }
      return Math.round(bracket.tax / 10) * 10
    }
  }
  return 0
}

// ── 지방소득세 (소득세의 10%) ──
export function calcLocalIncomeTax(incomeTax: number): number {
  return Math.round(incomeTax * 0.1 / 10) * 10
}

// ── 사업소득 3.3% 계산 ──
export function calcBusinessTax(grossSalary: number): { incomeTax: number; localTax: number } {
  const incomeTax = Math.round(grossSalary * 0.03 / 10) * 10
  const localTax = Math.round(incomeTax * 0.1 / 10) * 10
  return { incomeTax, localTax }
}

// ── 연봉→월급 / 시급→월급 변환 ──
export function annualToMonthly(annualSalary: number): number {
  return Math.round(annualSalary / 12)
}

export function hourlyToMonthly(hourlyRate: number, hoursPerWeek: number = 40): number {
  // 월 근무시간 = 주당 시간 × 52주 / 12개월
  const monthlyHours = (hoursPerWeek * 52) / 12
  return Math.round(hourlyRate * monthlyHours)
}

export function dailyToMonthly(dailyRate: number, daysPerMonth: number = 22): number {
  return Math.round(dailyRate * daysPerMonth)
}

// ── 식대 초과 공제 계산 ──
export function calcMealExcessDeduction(
  totalMealSpending: number,
  baseAllowance: number = 200000
): { excessAmount: number; isExcess: boolean; usageRate: number } {
  const excess = Math.max(0, totalMealSpending - baseAllowance)
  return {
    excessAmount: excess,
    isExcess: excess > 0,
    usageRate: baseAllowance > 0 ? Math.round((totalMealSpending / baseAllowance) * 100) : 0,
  }
}

// ── 전체 급여 계산 (종합) ──
export interface PayrollCalcInput {
  baseSalary: number
  allowances: Record<string, number>
  taxType: '근로소득' | '사업소득3.3%'
  expenseClaims?: number
  expenseDeductions?: number
  dependentsCount?: number
  customDeductions?: Record<string, number>
  mealExcessDeduction?: number
  overtimePay?: number
}

export interface PayrollCalcResult {
  baseSalary: number
  totalAllowances: number
  grossSalary: number
  taxableIncome: number
  // 4대보험
  nationalPension: number
  healthInsurance: number
  longCareInsurance: number
  employmentInsurance: number
  totalInsurance: number
  // 세금
  incomeTax: number
  localIncomeTax: number
  totalTax: number
  // 수동 공제
  customDeductionsTotal: number
  mealExcessDeduction: number
  // 합계
  totalDeductions: number
  expenseClaims: number
  expenseDeductions: number
  overtimePay: number
  netSalary: number
}

export function calculatePayroll(input: PayrollCalcInput): PayrollCalcResult {
  const totalAllowances = Object.values(input.allowances).reduce((s, v) => s + v, 0)
  const overtimePay = input.overtimePay || 0
  const grossSalary = input.baseSalary + totalAllowances + overtimePay
  const taxableIncome = calcTaxableIncome(input.baseSalary, input.allowances) + overtimePay
  const dependents = input.dependentsCount || 1

  let nationalPension = 0
  let healthInsurance = 0
  let longCareInsurance = 0
  let employmentInsurance = 0
  let incomeTax = 0
  let localIncomeTax = 0

  if (input.taxType === '근로소득') {
    nationalPension = calcNationalPension(taxableIncome)
    healthInsurance = calcHealthInsurance(taxableIncome)
    longCareInsurance = calcLongCareInsurance(healthInsurance)
    employmentInsurance = calcEmploymentInsurance(taxableIncome)
    incomeTax = calcIncomeTax(taxableIncome, dependents)
    localIncomeTax = calcLocalIncomeTax(incomeTax)
  } else {
    const biz = calcBusinessTax(grossSalary)
    incomeTax = biz.incomeTax
    localIncomeTax = biz.localTax
  }

  const totalInsurance = nationalPension + healthInsurance + longCareInsurance + employmentInsurance
  const totalTax = incomeTax + localIncomeTax
  const customDeductionsTotal = Object.values(input.customDeductions || {}).reduce((s, v) => s + v, 0)
  const mealExcess = input.mealExcessDeduction || 0

  const totalDeductions = totalInsurance + totalTax + customDeductionsTotal + mealExcess + (input.expenseDeductions || 0)
  const netSalary = grossSalary - totalDeductions + (input.expenseClaims || 0)

  return {
    baseSalary: input.baseSalary,
    totalAllowances,
    grossSalary,
    taxableIncome,
    nationalPension,
    healthInsurance,
    longCareInsurance,
    employmentInsurance,
    totalInsurance,
    incomeTax,
    localIncomeTax,
    totalTax,
    customDeductionsTotal,
    mealExcessDeduction: mealExcess,
    totalDeductions,
    expenseClaims: input.expenseClaims || 0,
    expenseDeductions: input.expenseDeductions || 0,
    overtimePay,
    netSalary,
  }
}

// ═══════════════════════════════════════════════
// 실수령액 기준 역계산 (Binary Search)
// targetNetSalary를 달성하기 위한 baseSalary 계산
// ═══════════════════════════════════════════════
export interface ReverseCalcResult {
  baseSalary: number
  calculatedNet: number
  difference: number
  fullCalc: PayrollCalcResult
}

export function reverseCalculatePayroll(
  targetNetSalary: number,
  allowances: Record<string, number>,
  taxType: '근로소득' | '사업소득3.3%',
  dependentsCount: number = 1,
  customDeductions?: Record<string, number>,
  mealExcessDeduction?: number,
): ReverseCalcResult {
  let low = 1000000   // 최소 100만원
  let high = 100000000 // 최대 1억
  let bestResult: PayrollCalcResult | null = null
  let bestBase = 0

  // Binary search: 50회 반복이면 충분히 수렴
  for (let i = 0; i < 50; i++) {
    const mid = Math.round((low + high) / 2)
    const result = calculatePayroll({
      baseSalary: mid,
      allowances,
      taxType,
      dependentsCount,
      customDeductions,
      mealExcessDeduction,
    })

    bestResult = result
    bestBase = mid

    if (Math.abs(result.netSalary - targetNetSalary) <= 100) {
      break // 차이 100원 이내 수렴
    }

    if (result.netSalary < targetNetSalary) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return {
    baseSalary: bestBase,
    calculatedNet: bestResult?.netSalary || 0,
    difference: (bestResult?.netSalary || 0) - targetNetSalary,
    fullCalc: bestResult!,
  }
}

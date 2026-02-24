// ============================================
// 급여 계산 유틸 (2025년 기준)
// 4대보험 + 소득세 자동 계산
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

export function calcIncomeTax(taxableIncome: number): number {
  // 간이세액표에서 구간 찾기
  for (let i = INCOME_TAX_BRACKETS.length - 1; i >= 0; i--) {
    if (taxableIncome >= INCOME_TAX_BRACKETS[i].min) {
      // 구간 내 비례 계산
      const bracket = INCOME_TAX_BRACKETS[i]
      if (i < INCOME_TAX_BRACKETS.length - 1) {
        const nextBracket = INCOME_TAX_BRACKETS[i + 1]
        const ratio = (taxableIncome - bracket.min) / (bracket.max - bracket.min)
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

// ── 전체 급여 계산 (종합) ──
export interface PayrollCalcInput {
  baseSalary: number
  allowances: Record<string, number>
  taxType: '근로소득' | '사업소득3.3%'
  expenseClaims?: number    // 실비정산 지급액
  expenseDeductions?: number // 개인경비 공제액
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
  // 세금
  incomeTax: number
  localIncomeTax: number
  // 합계
  totalDeductions: number
  expenseClaims: number
  expenseDeductions: number
  netSalary: number
}

export function calculatePayroll(input: PayrollCalcInput): PayrollCalcResult {
  const totalAllowances = Object.values(input.allowances).reduce((s, v) => s + v, 0)
  const grossSalary = input.baseSalary + totalAllowances
  const taxableIncome = calcTaxableIncome(input.baseSalary, input.allowances)

  let nationalPension = 0
  let healthInsurance = 0
  let longCareInsurance = 0
  let employmentInsurance = 0
  let incomeTax = 0
  let localIncomeTax = 0

  if (input.taxType === '근로소득') {
    // 4대보험
    nationalPension = calcNationalPension(taxableIncome)
    healthInsurance = calcHealthInsurance(taxableIncome)
    longCareInsurance = calcLongCareInsurance(healthInsurance)
    employmentInsurance = calcEmploymentInsurance(taxableIncome)
    // 소득세
    incomeTax = calcIncomeTax(taxableIncome)
    localIncomeTax = calcLocalIncomeTax(incomeTax)
  } else {
    // 사업소득 3.3%
    const biz = calcBusinessTax(grossSalary)
    incomeTax = biz.incomeTax
    localIncomeTax = biz.localTax
  }

  const totalDeductions = nationalPension + healthInsurance + longCareInsurance
    + employmentInsurance + incomeTax + localIncomeTax + (input.expenseDeductions || 0)

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
    incomeTax,
    localIncomeTax,
    totalDeductions,
    expenseClaims: input.expenseClaims || 0,
    expenseDeductions: input.expenseDeductions || 0,
    netSalary,
  }
}

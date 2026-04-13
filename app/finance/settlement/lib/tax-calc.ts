// ============================================
// 투자자 정산 시스템 — 세금 계산
// 세금계산서: 배분금 = 공급가 + VAT(10%) → 실수령 = 배분금
// 사업소득(3.3%): 원천징수 3.3% → 실수령 = 배분금 - 3.3%
// 이자소득(27.5%): 원천징수 27.5% → 실수령 = 배분금 - 27.5%
// ============================================

export type TaxResult = {
  taxType: string
  taxRate: number
  taxAmount: number
  supplyAmount: number   // 공급가 (세금계산서용)
  netPayout: number      // 실수령액
}

/**
 * 세전 금액과 세금 유형으로 세금 계산
 */
export function calculateTax(grossAmount: number, taxType: string): TaxResult {
  if (taxType === '세금계산서') {
    const supplyAmount = grossAmount > 0 ? Math.round(grossAmount / 1.1) : 0
    const taxAmount = grossAmount - supplyAmount // VAT
    return {
      taxType,
      taxRate: 10,
      taxAmount,
      supplyAmount,
      netPayout: grossAmount, // 세금계산서는 실수령 = 배분금
    }
  }

  if (taxType === '사업소득(3.3%)') {
    const taxRate = 3.3
    const taxAmount = grossAmount > 0 ? Math.round(grossAmount * taxRate / 100) : 0
    return {
      taxType,
      taxRate,
      taxAmount,
      supplyAmount: 0,
      netPayout: grossAmount - taxAmount,
    }
  }

  if (taxType === '이자소득(27.5%)') {
    const taxRate = 27.5
    const taxAmount = grossAmount > 0 ? Math.round(grossAmount * taxRate / 100) : 0
    return {
      taxType,
      taxRate,
      taxAmount,
      supplyAmount: 0,
      netPayout: grossAmount - taxAmount,
    }
  }

  // 기본: 세금 없음
  return { taxType, taxRate: 0, taxAmount: 0, supplyAmount: 0, netPayout: grossAmount }
}

/**
 * ContractsTab 하위호환용: 세후 금액 계산
 */
export function calcAfterTax(amount: number, taxType?: string): number {
  if (!taxType || !amount) return amount
  const result = calculateTax(amount, taxType)
  return result.netPayout
}

/**
 * ContractsTab 하위호환용: 세금 라벨
 */
export function taxLabel(taxType?: string): string {
  if (!taxType) return ''
  if (taxType === '세금계산서') return '(VAT 포함)'
  if (taxType.includes('3.3')) return '(-3.3%)'
  if (taxType.includes('27.5')) return '(-27.5%)'
  return ''
}

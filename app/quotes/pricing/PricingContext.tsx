'use client'

import { createContext, useContext } from 'react'

/**
 * 견적 빌더 공유 상태 컨텍스트
 *
 * RentPricingBuilder의 모든 상태를 하위 스텝 컴포넌트에 전달하는 컨텍스트.
 * 5,853줄 단일 파일 → 모듈 분리의 핵심 접착제 역할.
 *
 * TODO: 단계적으로 PricingState 인터페이스를 정의하여 타입 안전성 확보
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PricingContext = createContext<any>(null)

export function usePricing() {
  const ctx = useContext(PricingContext)
  if (!ctx) throw new Error('usePricing must be used within PricingProvider')
  return ctx
}

export const PricingProvider = PricingContext.Provider
export default PricingContext

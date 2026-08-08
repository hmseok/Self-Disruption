'use client'

// ═══════════════════════════════════════════════════════════════
// 급여 운영 — 독립 페이지 (2026-08-08 인사 마스터 재작성과 함께 분리)
// 기존: /hr?tab=payroll 임베드 → 신규: /hr/payroll 전용 페이지
// 내용은 기존 PayrollOps 컴포넌트 그대로 사용
// ═══════════════════════════════════════════════════════════════

import { COLORS } from '@/app/utils/ui-tokens'
import PayrollOps from '../_components/PayrollOps'

export default function PayrollPage() {
  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, color: COLORS.textPrimary, fontSize: 14 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 21, letterSpacing: '-0.02em', fontWeight: 700 }}>급여 운영</h1>
        <p style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 3 }}>
          급여 대장 생성과 식대·프리랜서 지급을 관리합니다 — 지급 기준은 인사 마스터의 직원별 급여 설정을 따릅니다
        </p>
      </div>
      <PayrollOps />
    </div>
  )
}

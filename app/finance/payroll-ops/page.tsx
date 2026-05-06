'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// /finance/payroll-ops → /hr/payroll 로 통합 (2026-05-06 PR-B4)
// 사용자 명시: "관리에 분산된 급여를 인사 영역에 통합"
export default function PayrollOpsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/hr/payroll') }, [router])
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(0,0,0,0.06)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 13, color: '#94a3b8' }}>급여 운영으로 이동 중...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}

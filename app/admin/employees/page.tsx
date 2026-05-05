'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ============================================
// /admin/employees → /hr/people 로 이전 (2026-05-05 PR-A4)
// 「조직/권한 관리」 가 「인력 마스터」 + 「조직 마스터」 로 분할됨
// ============================================

export default function EmployeesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/hr/people') }, [router])
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(0,0,0,0.06)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 13, color: '#94a3b8' }}>인력 마스터로 이동 중...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}

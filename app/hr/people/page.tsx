'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// /hr/people → /hr 로 통합 (2026-05-05 PR-B1)
export default function PeopleRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/hr') }, [router])
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(0,0,0,0.06)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 13, color: '#94a3b8' }}>인사 마스터로 이동 중...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}

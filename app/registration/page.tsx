'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ═══════════════════════════════════════════════════════════════
// 차량 등록증 페이지 — 폐지 (2026-04-29)
// → /cars 의 차량 상세 페이지 "등록증" 탭으로 통합
// 이 페이지는 호환성 유지를 위해 redirect 만 처리
// ═══════════════════════════════════════════════════════════════

export default function RegistrationPage() {
  const router = useRouter()

  useEffect(() => {
    const t = setTimeout(() => router.replace('/cars'), 1500)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', flexDirection: 'column', gap: 16, padding: 24,
    }}>
      <div style={{ fontSize: 48 }}>🚗</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
        차량 등록증 페이지가 차량 관리로 통합되었습니다
      </h2>
      <p style={{ fontSize: 14, color: '#64748b' }}>
        잠시 후 차량 관리 페이지로 자동 이동합니다...
      </p>
      <button onClick={() => router.replace('/cars')} style={{
        padding: '8px 20px', borderRadius: 8, fontWeight: 600,
        background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
      }}>
        지금 이동
      </button>
    </div>
  )
}

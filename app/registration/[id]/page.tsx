'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

// /registration/[id] 폐지 — /cars/[id] 로 redirect
export default function RegistrationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = String(params?.id || '')

  useEffect(() => {
    const t = setTimeout(() => {
      if (id) router.replace(`/cars/${id}`)
      else router.replace('/cars')
    }, 1500)
    return () => clearTimeout(t)
  }, [id, router])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', flexDirection: 'column', gap: 16, padding: 24,
    }}>
      <div style={{ fontSize: 48 }}>🚗</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
        차량 등록증 상세가 차량 상세 페이지로 통합되었습니다
      </h2>
      <p style={{ fontSize: 14, color: '#64748b' }}>잠시 후 자동 이동합니다...</p>
      <button onClick={() => router.replace(id ? `/cars/${id}` : '/cars')} style={{
        padding: '8px 20px', borderRadius: 8, fontWeight: 600,
        background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
      }}>지금 이동</button>
    </div>
  )
}

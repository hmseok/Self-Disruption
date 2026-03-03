'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// /jiip → /invest?tab=jiip 리다이렉트 (통합 페이지)
export default function JiipRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/invest?tab=jiip')
  }, [router])

  return (
    <div style={{ padding: 80, textAlign: 'center', color: '#9ca3af', fontWeight: 700 }}>
      페이지 이동 중...
    </div>
  )
}

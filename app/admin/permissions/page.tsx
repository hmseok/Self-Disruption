'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ============================================
// 권한 설정 페이지 → 직원 관리(역할 관리 탭)로 리다이렉트
// 역할 기반 권한 시스템으로 전환되어 /admin/employees 에서 통합 관리
// ============================================

export default function PermissionsPage() {
  const router = useRouter()

  useEffect(() => {
    // 직원 관리 페이지의 역할 관리 탭으로 이동
    router.replace('/admin/employees')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600 mx-auto mb-4"></div>
        <p className="text-sm text-slate-400">권한 관리 페이지로 이동 중...</p>
      </div>
    </div>
  )
}

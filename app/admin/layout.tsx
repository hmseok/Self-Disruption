'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'

// ============================================
// Admin Layout - 관리자 영역 권한 체크
// god_admin + master 접근 가능
// 사이드바는 ClientLayout에서 통합 제공
// ============================================

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, role, loading } = useApp()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.replace('/')
      return
    }

    // god_admin 또는 master만 접근 가능
    if (role !== 'god_admin' && role !== 'master') {
      router.replace('/dashboard')
      return
    }

    setChecking(false)
  }, [user, role, loading])

  if (loading || checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold text-sm">접속 중...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

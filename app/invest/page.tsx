'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// /invest → /finance/settlement 리다이렉트
// 계약 현황이 정산/계약 관리 페이지로 통합되었습니다.
export default function InvestRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/finance/settlement')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-500">정산/계약 관리 페이지로 이동 중...</p>
      </div>
    </div>
  )
}

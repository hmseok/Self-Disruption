'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 정비 단가 DB는 산출 기준 관리 > 정비비 탭으로 통합되었습니다
export default function MaintenanceRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/db/pricing-standards')
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center max-w-md">
        <div className="text-4xl mb-3">🔧</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">정비 단가 관리</h2>
        <p className="text-xs text-gray-500 mb-4">
          정비 단가표는 <strong>산출 기준 관리</strong> 페이지의 정비비 탭으로 통합되었습니다.
        </p>
        <button
          onClick={() => router.push('/db/pricing-standards')}
          className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-800"
        >
          산출 기준 관리로 이동
        </button>
      </div>
    </div>
  )
}

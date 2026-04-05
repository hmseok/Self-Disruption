'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * [DEPRECATED] /quotes/new → /quotes/create 로 통합
 * 기존 북마크/링크 호환을 위해 redirect 처리
 */
export default function LegacyNewQuoteRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/quotes/create')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">견적 작성 페이지로 이동 중...</p>
      </div>
    </div>
  )
}

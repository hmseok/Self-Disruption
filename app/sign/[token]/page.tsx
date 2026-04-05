'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

/**
 * [DEPRECATED] 레거시 서명 페이지
 *
 * /sign/[token] → /public/quote/[token] 으로 통합되었습니다.
 * 기존 고객에게 전달된 링크를 위해 자동 redirect 처리합니다.
 */
export default function LegacySignRedirect() {
  const params = useParams()
  const router = useRouter()

  useEffect(() => {
    const token = params?.token as string
    if (token) {
      router.replace(`/public/quote/${token}`)
    }
  }, [params, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">페이지를 이동하고 있습니다...</p>
      </div>
    </div>
  )
}

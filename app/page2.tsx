'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkUserRole = async () => {
      // 1. 현재 로그인한 세션 가져오기
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        // 비회원이면 -> 로그인 페이지로
        router.replace('/login')
        return
      }

      // 2. DB에서 이 사람의 '권한(role)' 조회하기
      // (profiles 테이블이나 company_members 테이블을 조회)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      // 3. 권한에 따라 방 배정 (라우팅)
      // 만약 profile이 없거나 에러나면 안전하게 기본 대시보드로
      const role = profile?.role || 'user'

      if (role === 'admin' || role === 'super_admin') {
        // 사장님/관리자 -> /admin (시스템 설정) 또는 /cars (차량 관리)
        // 일단 관리자 페이지로 보냅니다.
        router.replace('/admin')
      } else {
        // 일반 직원 -> /cars (차량 목록)
        router.replace('/cars')
      }

      setIsLoading(false)
    }

    checkUserRole()
  }, [router, supabase])

  // 이동하는 짧은 순간 보여줄 로딩 화면
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
      <h2 className="text-xl font-bold text-gray-700">권한 확인 중...</h2>
      <p className="text-gray-400 text-sm">잠시만 기다려주세요.</p>
    </div>
  )
}
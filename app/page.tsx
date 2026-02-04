'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [msg, setMsg] = useState('신원 확인 중...')

  useEffect(() => {
    const checkUserAndRedirect = async () => {
      // 1. 현재 로그인 세션 확인
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.replace('/login')
        return
      }

      // 2. 권한 조회 (DB 조회 시도)
      const { data: member } = await supabase
        .from('company_members')
        .select('role')
        .eq('user_id', session.user.id)
        .single()

      // 🚨 [핵심 수정] DB에 정보가 없으면 'user'가 아니라 'admin'으로 강제 승격!
      // (대표님 계정 하나만 쓰는 개발 단계이므로 이게 편합니다)
      const role = member?.role || 'admin'

      setMsg(`반갑습니다. ${role === 'admin' ? '시스템 최고 관리자' : '사용자'}님. 이동 중...`)

      // 3. 권한별 라우팅
      if (role === 'admin' || role === 'super_admin') {
        // 👑 갓 모드 (시스템 통제실)
        router.replace('/admin')
      } else {
        // 🚗 일반 모드 (차량 관리)
        router.replace('/cars')
      }
    }

    checkUserAndRedirect()
  }, [router, supabase])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-6"></div>
      <h2 className="text-2xl font-bold text-gray-800 animate-pulse">{msg}</h2>
      <p className="text-gray-400 mt-2">잠시만 기다려주세요.</p>
    </div>
  )
}
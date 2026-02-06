'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../utils/supabase' // 경로 확인! (../../utils/supabase 일 수도 있음)
import Link from 'next/link'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)

  // ... (위쪽 import 생략)

  // useEffect 안쪽 로직 수정
  const checkAdmin = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, status') // status(승인상태)도 같이 조회
        .eq('id', session.user.id)
        .maybeSingle()

      // 👑 프리패스 대상: God Admin 또는 회사 대표(Master) 또는 승인된(approved) 유저
      const isGod = profile?.role === 'god_admin'
      const isMaster = profile?.role === 'master'
      const isApproved = profile?.status === 'approved'

      if (isGod || isMaster || isApproved) {
        setIsAuthorized(true)
      } else {
        // 🚫 승인 대기 중일 때
        alert('⏳ 관리자의 승인을 기다리고 있습니다. 승인 후 이용 가능합니다.')
        await supabase.auth.signOut() // 로그아웃 시키기
        router.replace('/')
      }
    } catch (e) {
      // ... (에러 처리 생략)
    } finally {
      setLoading(false)
    }
  }
    checkAdmin()
  }, [])

  // 👇 로그아웃 함수 추가
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/') // 로그인 페이지로 쫓아냄
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-xl font-bold text-gray-800 mb-2">👑 관리자 권한 확인 중...</div>
          <div className="text-sm text-gray-500">잠시만 기다려주세요.</div>
        </div>
      </div>
    )
  }

  if (!isAuthorized) return null

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* 사이드바 */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold">SECONDLIFE <span className="text-blue-500">ADMIN</span></h1>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link href="/admin" className="block px-4 py-3 rounded-lg bg-blue-600 text-white font-medium">
            대시보드
          </Link>
          {/* 메뉴들 추가 예정... */}
        </nav>

        {/* 👇 하단 로그아웃 버튼 영역 */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-slate-800 hover:bg-red-600/90 text-slate-300 hover:text-white transition-all font-medium text-sm group"
          >
            <span>🚪</span> 로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 (사이드바 너비만큼 밀어주기 pl-64) */}
      <main className="flex-1 ml-64 p-8">
        {children}
      </main>
    </div>
  )
}
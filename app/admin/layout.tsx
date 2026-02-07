'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
// 👇 [핵심] 구형 utils 대신 신형 클라이언트 사용 (쿠키 인식)
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const supabase = createClientComponentClient() // 신형 열쇠 생성
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          // 로그인이 안 되어 있으면 대문으로 보냄
          router.replace('/')
          return
        }

        // 로그인 되어 있으면 통과! (여기서 추가 권한 체크를 할 수도 있음)
        setLoading(false)

      } catch (e) {
        console.error('세션 체크 에러:', e)
        router.replace('/')
      }
    }

    checkSession()
  }, [])

  // ⏳ 로딩 중일 때 흰 화면 대신 "로딩 중" 표시
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold">Sideline 접속 중...</p>
        </div>
      </div>
    )
  }

  // ✅ 접속 성공 시 보여줄 레이아웃 (사이드바 포함)
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* 사이드바 */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-20 shadow-xl">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-extrabold tracking-tight">
            Sideline <span className="text-blue-500">ERP</span>
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link href="/admin" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600/10 text-blue-400 font-bold hover:bg-blue-600 hover:text-white transition-all">
            <span>📊</span> 대시보드
          </Link>
          {/* 메뉴 추가 가능 */}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace('/'); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-red-600/90 text-slate-300 hover:text-white font-bold transition-all"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 (사이드바만큼 띄워줌) */}
      <main className="flex-1 ml-64 p-8">
        {children}
      </main>
    </div>
  )
}
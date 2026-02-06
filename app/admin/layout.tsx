'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
// 👇 경로 수정: utils가 루트에 있다면 점 두 개(../..)가 맞습니다.
import { supabase } from '../../utils/supabase'
import Link from 'next/link'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          router.replace('/')
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role, status')
          .eq('id', session.user.id)
          .maybeSingle()

        // 👑 권한 체크 로직
        const isGod = profile?.role === 'god_admin'
        const isMaster = profile?.role === 'master'
        const isApproved = profile?.status === 'approved'

        if (isGod || isMaster || isApproved) {
          setIsAuthorized(true)
        } else {
          alert('⏳ 관리자의 승인을 기다리고 있습니다. 승인 후 이용 가능합니다.')
          await supabase.auth.signOut()
          router.replace('/')
        }
      } catch (e) {
        console.error('관리자 체크 에러:', e)
        router.replace('/')
      } finally {
        setLoading(false)
      }
    }

    checkAdmin()
  }, []) // 👈 에러가 났던 부분 (이제 해결됨)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/')
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
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold">Sideline <span className="text-blue-500">ADMIN</span></h1>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link href="/admin" className="block px-4 py-3 rounded-lg bg-blue-600 text-white font-medium">
            대시보드
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-slate-800 hover:bg-red-600/90 text-slate-300 hover:text-white transition-all font-medium text-sm group"
          >
            <span>🚪</span> 로그아웃
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-8">
        {children}
      </main>
    </div>
  )
}
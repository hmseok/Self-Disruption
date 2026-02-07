'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'

export default function AdminDashboard() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const checkRoleAndData = async () => {
      // 1. 내 정보 확인
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return; }

      const userId = session.user.id

      // 2. 내 권한 확인 (프로필 테이블 조회)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, company_id') // role과 소속 회사 ID 가져옴
        .eq('id', userId)
        .single()

      // 3. 분기 처리 (교통정리)
      if (profile?.role === 'god_admin' || profile?.role === 'master') {
        // 👑 관리자다! -> 전체 회사 목록 가져오기
        setIsAdmin(true)
        const { data: allCompanies } = await supabase
          .from('companies')
          .select('*')
          .order('created_at', { ascending: false })

        setCompanies(allCompanies || [])
        setLoading(false)

      } else if (profile?.company_id) {
        // 👤 일반 직원이다! -> 자기 회사 방([id])으로 바로 이동
        router.replace(`/admin/${profile.company_id}`)

      } else {
        // ❓ 소속이 없다? (낙동강 오리알) -> 일단 빈 화면 보여줌 (혹은 문의하기 안내)
        setLoading(false)
      }
    }

    checkRoleAndData()
  }, [])

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="text-blue-600 font-bold animate-pulse">권한 확인 중... ⏳</div>
    </div>
  )

  // 👇 관리자(Master)만 보는 화면 (전체 회사 목록)
  if (isAdmin) {
    return (
      <div className="p-10 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">통합 대시보드</h1>
            <p className="text-slate-500 mt-1">등록된 모든 회사를 관리합니다.</p>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); router.replace('/'); }} className="text-sm font-bold text-slate-400 hover:text-red-500">
            로그아웃
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {companies.map(c => (
            <Link key={c.id} href={`/admin/${c.id}`} className="block group">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">🏢</div>
                  <h2 className="text-lg font-bold text-slate-900">{c.name}</h2>
                </div>
                <p className="text-sm text-slate-500">사업자: {c.business_number}</p>
              </div>
            </Link>
          ))}

          {companies.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <p className="text-slate-400">등록된 회사가 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 소속 없는 사용자용 안내 (혹시 몰라서 넣음)
  return (
    <div className="flex flex-col h-screen items-center justify-center">
      <h1 className="text-2xl font-bold mb-4">소속된 회사가 없습니다.</h1>
      <p className="text-gray-500 mb-8">관리자에게 초대를 요청하거나, 새로운 회사를 등록하세요.</p>
      <button onClick={async () => { await supabase.auth.signOut(); router.replace('/'); }} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold">
        로그아웃 후 다시 시작
      </button>
    </div>
  )
}
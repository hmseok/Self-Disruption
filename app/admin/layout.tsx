'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClientComponentClient()
  const [status, setStatus] = useState('권한 확인 중...')
  const [debugData, setDebugData] = useState<any>(null)

  useEffect(() => {
    const checkSaaSRole = async () => {
      // 1. 내 정보 가져오기
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setStatus('❌ 로그인 안 됨')
        return
      }

      // 2. SaaS 권한 체크: '내가 속한 회사에서 관리자(Admin)인가?' 확인
      // companies 테이블과 company_members 테이블을 조인해서 확인해야 합니다.
      const { data: memberData, error } = await supabase
        .from('company_members')
        .select(`
          *,
          company_roles ( name ),
          companies ( name )
        `)
        .eq('user_id', session.user.id)
        .single() // 회사가 하나라고 가정 (여러 개면 로직 달라짐)

      setDebugData({
        user_id: session.user.id,
        member_info: memberData,
        error_log: error
      })

      if (memberData) {
        setStatus(`✅ 확인 완료: ${memberData.companies?.name}의 ${memberData.company_roles?.name} 권한`)
      } else {
        setStatus('⚠️ 회사 소속 정보가 없음 (DB 확인 필요)')
      }
    }

    checkSaaSRole()
  }, [])

  // 🚨 절대 리다이렉트 하지 않음 (화면에 상태만 표시)
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 디버깅용 상단 바 */}
      <div className="bg-gray-800 text-white p-4 text-sm font-mono">
        <p><strong>현재 상태:</strong> {status}</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-yellow-400">🔍 DB 조회 데이터 보기 (클릭)</summary>
          <pre className="mt-2 bg-black p-4 rounded overflow-auto max-h-40">
            {JSON.stringify(debugData, null, 2)}
          </pre>
        </details>
      </div>

      {/* 실제 관리자 페이지 내용 */}
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
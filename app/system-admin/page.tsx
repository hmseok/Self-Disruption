'use client'
import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

// 아이콘 매핑 (ClientLayout과 동일)
const IconMap: any = {
  Truck: () => <span title="지입/정산">🚛</span>,
  Doc: () => <span title="견적/영업">📄</span>,
  Car: () => <span title="차량관리">🚗</span>,
  Setting: () => <span title="설정">⚙️</span>,
}

export default function SystemAdminPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<any[]>([])
  const [modules, setModules] = useState<any[]>([])
  const [matrix, setMatrix] = useState<any>({}) // { companyId_moduleId: true/false }

  // 초기 로딩
  useEffect(() => {
    checkPermissionAndLoad()
  }, [])

  const checkPermissionAndLoad = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    // 1. 보안 검사: 진짜 슈퍼 어드민 맞아?
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user?.id)
      .single()

    if (!profile?.is_super_admin) {
      alert('접근 권한이 없습니다. (시스템 총괄 전용)')
      router.replace('/') // 쫓아내기
      return
    }

    // 2. 데이터 로딩 (모든 회사 & 모든 모듈)
    const { data: compData } = await supabase.from('companies').select('*').order('created_at', { ascending: false })
    const { data: modData } = await supabase.from('system_modules').select('*').order('path')

    // 3. 현재 설정 상태 로딩 (누가 뭘 쓰고 있나)
    const { data: activeData } = await supabase.from('company_modules').select('*')

    if (compData && modData) {
      setCompanies(compData)
      setModules(modData)

      // 매트릭스 데이터 구성
      const statusMap: any = {}
      activeData?.forEach((item: any) => {
        statusMap[`${item.company_id}_${item.module_id}`] = item.is_active
      })
      setMatrix(statusMap)
    }
    setLoading(false)
  }

  // 기능 ON/OFF 토글 함수
  const toggleModule = async (companyId: string, moduleId: string, currentStatus: boolean) => {
    // 1. UI 즉시 반영 (Optimistic UI)
    const key = `${companyId}_${moduleId}`
    setMatrix((prev: any) => ({ ...prev, [key]: !currentStatus }))

    // 2. DB 업데이트 (Upsert: 없으면 만들고, 있으면 수정)
    const { error } = await supabase
      .from('company_modules')
      .upsert({
        company_id: companyId,
        module_id: moduleId,
        is_active: !currentStatus
      }, { onConflict: 'company_id, module_id' })

    if (error) {
      alert('설정 저장 실패: ' + error.message)
      setMatrix((prev: any) => ({ ...prev, [key]: currentStatus })) // 롤백
    }
  }

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">시스템 권한 확인 중...🕵️</div>

  return (
    <div className="min-h-screen bg-gray-900 text-white p-10 animate-fade-in">
      <div className="max-w-7xl mx-auto">

        {/* 헤더 */}
        <div className="flex justify-between items-end mb-10 border-b border-gray-700 pb-6">
          <div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
              GOD MODE ⚡
            </h1>
            <p className="text-gray-400 mt-2">전체 고객사(Company)의 서비스 구독 상태를 제어합니다.</p>
          </div>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-bold transition-colors">
            ← 돌아가기
          </button>
        </div>

        {/* 메인 매트릭스 테이블 */}
        <div className="bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-700">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-950 text-gray-400 text-xs uppercase tracking-wider">
                <th className="p-6 w-1/4">고객사 정보 (Company)</th>
                {modules.map((mod) => (
                  <th key={mod.id} className="p-4 text-center border-l border-gray-800">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-2xl">{IconMap[mod.icon_key]?.()}</span>
                      <span>{mod.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {companies.map((comp) => (
                <tr key={comp.id} className="hover:bg-gray-750 transition-colors group">
                  <td className="p-6">
                    <div className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors">
                      {comp.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 font-mono">{comp.id}</div>
                  </td>

                  {/* 각 모듈별 스위치 */}
                  {modules.map((mod) => {
                    const isActive = matrix[`${comp.id}_${mod.id}`]
                    return (
                      <td key={mod.id} className="p-4 text-center border-l border-gray-700">
                        <button
                          onClick={() => toggleModule(comp.id, mod.id, !!isActive)}
                          className={`
                            relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2  focus-visible:ring-white focus-visible:ring-opacity-75
                            ${isActive ? 'bg-blue-600' : 'bg-gray-600'}
                          `}
                        >
                          <span className="sr-only">Use setting</span>
                          <span
                            aria-hidden="true"
                            className={`
                              pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out
                              ${isActive ? 'translate-x-6' : 'translate-x-0'}
                            `}
                          />
                        </button>
                        <div className="mt-2 text-[10px] font-bold text-gray-500">
                          {isActive ? 'ON' : 'OFF'}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 text-center text-xs text-gray-600">
          * 이 페이지는 Super Admin(개발자) 계정에서만 접근 가능합니다. <br/>
          * 스위치를 끄면 해당 회사의 모든 직원에게서 메뉴가 즉시 사라집니다.
        </div>

      </div>
    </div>
  )
}
'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// DB에서 가져올 데이터 타입 정의
type Module = {
  id: string
  name: string
  icon_key: string
  path: string
}

export default function AdminPage() {
  const supabase = createClientComponentClient()
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)

  // 1. DB에서 시스템 모듈 목록 가져오기
  useEffect(() => {
    const fetchModules = async () => {
      const { data, error } = await supabase
        .from('system_modules')
        .select('*')
        .order('name', { ascending: true })

      if (data) setModules(data)
      if (error) console.error('모듈 로딩 실패:', error)
      setLoading(false)
    }

    fetchModules()
  }, [supabase])

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* 헤더 섹션 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">시스템 환경설정</h1>
          <p className="text-gray-500 mt-2">
            회사에서 사용할 기능을 선택하고 관리 권한을 설정합니다.
          </p>
        </div>
        <button className="mt-4 md:mt-0 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition shadow-sm">
          변경사항 저장
        </button>
      </div>

      {/* 2. 모듈 관리 섹션 (DB 데이터 연동) */}
      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          📦 기능 모듈 관리
          <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {modules.length}개 발견됨
          </span>
        </h2>

        {loading ? (
          <div className="text-gray-400 py-10 text-center">데이터를 불러오는 중...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((mod) => (
              <div
                key={mod.id}
                className="group relative bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all duration-200 hover:border-indigo-300"
              >
                <div className="flex justify-between items-start mb-4">
                  {/* 아이콘 영역 (단순화를 위해 텍스트 이모지로 대체하거나 매핑 가능) */}
                  <div className={`p-3 rounded-lg ${
                    mod.icon_key === 'Car' ? 'bg-blue-100 text-blue-600' :
                    mod.icon_key === 'Truck' ? 'bg-green-100 text-green-600' :
                    mod.icon_key === 'Doc' ? 'bg-yellow-100 text-yellow-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                     {/* 아이콘 매핑 로직 */}
                     {mod.icon_key === 'Car' ? '🚗' :
                      mod.icon_key === 'Truck' ? '🚚' :
                      mod.icon_key === 'Doc' ? '📄' : '⚙️'}
                  </div>

                  {/* 토글 스위치 UI (모양만 구현) */}
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-gray-900 mb-1">{mod.name}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                  {mod.path} 경로에 연결된 {mod.name} 관리 모듈입니다.
                  활성화 시 직원 메뉴에 즉시 반영됩니다.
                </p>

                <div className="flex items-center justify-between text-xs text-gray-400 mt-auto pt-4 border-t border-gray-100">
                  <span>ID: {mod.id.slice(0, 8)}...</span>
                  <span className="text-indigo-500 font-medium group-hover:underline cursor-pointer">
                    상세 설정 &rarr;
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. 예시: 직원 관리 섹션 (아직 데이터 없으므로 UI만) */}
      <section className="pt-8 border-t">
         <h2 className="text-xl font-bold text-gray-800 mb-4">👥 관리자 현황</h2>
         <div className="bg-gray-50 rounded-lg p-8 text-center border border-dashed border-gray-300">
            <p className="text-gray-500">아직 등록된 추가 관리자가 없습니다.</p>
            <button className="mt-2 text-indigo-600 font-medium hover:underline">
              + 새 관리자 초대하기
            </button>
         </div>
      </section>
    </div>
  )
}
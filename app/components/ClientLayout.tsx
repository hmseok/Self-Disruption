'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useApp } from '../context/AppContext'

// --- 1. 아이콘 컴포넌트 정의 ---
const Icons: any = {
  Menu: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  ChevronDown: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>,

  // DB의 icon_key와 매칭될 아이콘들
  Truck: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  Doc: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Car: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>, // 임시 아이콘
  Setting: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const pathname = usePathname()

  const { currentCompany, setCurrentCompany } = useApp()
  const [myCompanies, setMyCompanies] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)

  // 🔥 DB에서 불러온 '진짜 메뉴'를 담을 상태
  const [menus, setMenus] = useState<any[]>([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  // 1. [초기화] 사용자 및 회사 목록 로드
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)

      const { data: members } = await supabase
        .from('company_members')
        .select('role, company:companies(id, name)')
        .eq('user_id', user.id)

      if (members && members.length > 0) {
        const companies = members.map((m: any) => ({
            id: m.company.id,
            name: m.company.name,
            role: m.role
        }))
        setMyCompanies(companies)

        // 저장된 회사 복구 로직
        const savedJson = localStorage.getItem('selected_company')
        let targetCompany = companies[0]
        if (savedJson) {
            try {
                const savedId = JSON.parse(savedJson).id
                const found = companies.find((c: any) => c.id === savedId)
                if (found) targetCompany = found
            } catch (e) {}
        }
        setCurrentCompany(targetCompany)
      }
    }
    init()
  }, [])

  // 2. [핵심] 회사가 바뀔 때마다 '해당 회사의 메뉴'를 DB에서 가져옴
  useEffect(() => {
    const fetchMenus = async () => {
        if (!currentCompany) return

        // company_modules 테이블에서 '켜져 있는(is_active=true)' 메뉴만 가져옴
        // system_modules 테이블을 JOIN해서 이름, 경로, 아이콘 정보를 함께 가져옴
        const { data, error } = await supabase
            .from('company_modules')
            .select(`
                is_active,
                module:system_modules ( id, name, path, icon_key )
            `)
            .eq('company_id', currentCompany.id)
            .eq('is_active', true)
            // (선택) 정렬 순서를 위한 컬럼이 있다면 .order() 추가 가능

        if (!error && data) {
            // 데이터 가공: DB 구조를 프론트엔드 메뉴 객체로 변환
            const formattedMenus = data.map((item: any) => ({
                id: item.module.id,
                name: item.module.name,
                path: item.module.path,
                // 문자열("Truck")을 실제 컴포넌트(Icons.Truck)로 변환
                icon: Icons[item.module.icon_key] || Icons.Doc
            }))
            setMenus(formattedMenus)
        }
    }
    fetchMenus()
  }, [currentCompany]) // currentCompany가 변경될 때마다 실행됨!


  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value
    const selected = myCompanies.find(c => c.id === selectedId)
    if (selected) setCurrentCompany(selected)
  }

  if (pathname === '/' || pathname === '/auth') return <>{children}</>

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-gray-900 text-white transition-all duration-300 overflow-hidden flex flex-col fixed h-full z-20`}>
        <div className="p-6 flex items-center justify-between">
            <span className="text-xl font-black text-white tracking-tight">SECONDLIFE ERP</span>
        </div>

        {/* 회사 선택 */}
        <div className="px-4 mb-6">
            <div className="relative">
                <select
                    className="w-full appearance-none bg-gray-800 border border-gray-700 text-white py-3 px-4 pr-8 rounded-xl focus:outline-none focus:border-indigo-500 font-bold text-sm cursor-pointer hover:bg-gray-700 transition-colors"
                    value={currentCompany?.id || ''}
                    onChange={handleCompanyChange}
                >
                    {myCompanies.map((comp) => (
                        <option key={comp.id} value={comp.id}>🏢 {comp.name}</option>
                    ))}
                    {myCompanies.length === 0 && <option>소속된 회사 없음</option>}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                    <Icons.ChevronDown />
                </div>
            </div>
            {currentCompany && (
                <div className="mt-2 text-right px-1">
                    <span className="text-[10px] text-gray-400 font-medium">내 권한: </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${currentCompany.role === 'admin' ? 'bg-red-900 text-red-200' : 'bg-gray-700 text-gray-300'}`}>
                        {currentCompany.role?.toUpperCase()}
                    </span>
                </div>
            )}
        </div>

        {/* 🔥 동적 메뉴 리스트 (DB 데이터 기반) */}
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
            {menus.length === 0 ? (
                <div className="text-gray-600 text-xs text-center py-4">사용 가능한 메뉴가 없습니다.<br/>관리자에게 문의하세요.</div>
            ) : (
                menus.map((menu) => {
                    const IconComponent = menu.icon
                    const isActive = pathname.startsWith(menu.path)
                    return (
                        <Link
                            key={menu.id}
                            href={menu.path}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm
                                ${isActive
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
                                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'}
                            `}
                        >
                            {/* 아이콘 컴포넌트 렌더링 */}
                            <IconComponent />
                            {menu.name}
                        </Link>
                    )
                })
            )}
        </nav>

        <div className="p-4 border-t border-gray-800">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold">
                    {user?.email?.[0].toUpperCase()}
                </div>
                <div className="overflow-hidden">
                    <p className="text-sm font-bold truncate">{user?.email}</p>
                    <button onClick={() => supabase.auth.signOut().then(() => router.push('/'))} className="text-xs text-gray-400 hover:text-white transition-colors">
                        로그아웃
                    </button>
                </div>
            </div>
        </div>
      </aside>

      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <div className="min-h-screen">
            {children}
        </div>
      </main>

    </div>
  )
}
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useApp } from '../context/AppContext'

// 아이콘 (필요한 것만 심플하게)
const Icons = {
  Menu: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  ChevronDown: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>,
  // 메뉴 아이콘들
  Truck: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  Doc: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Money: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Setting: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
}

// 1단계: 임시 메뉴판 (추후 DB에서 가져오는 방식으로 교체 예정)
const TEMP_MENUS = [
    { id: 'quotes', name: '견적 관리', path: '/quotes', icon: Icons.Doc },
    { id: 'jiip', name: '지입 정산', path: '/jiip', icon: Icons.Truck },
    { id: 'admin', name: '설정 (Admin)', path: '/admin', icon: Icons.Setting },
]

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const pathname = usePathname()

  // AppContext에서 전역 상태 가져오기
  const { currentCompany, setCurrentCompany } = useApp()

  const [myCompanies, setMyCompanies] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  // 1. 초기 로딩: 내 회사 목록 불러오기
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/') // 로그인 안했으면 튕겨내기
        return
      }
      setUser(user)

      // 내가 소속된 회사 목록 조회 (roles 포함)
      const { data: members } = await supabase
        .from('company_members')
        .select('role, company:companies(id, name)')
        .eq('user_id', user.id)

      if (members && members.length > 0) {
        // 보기 좋게 데이터 가공
        const companies = members.map((m: any) => ({
            id: m.company.id,
            name: m.company.name,
            role: m.role // 내 직급
        }))
        setMyCompanies(companies)

        // 만약 선택된 회사가 없으면(첫 진입), 첫 번째 회사를 자동으로 선택
        if (!currentCompany) {
            setCurrentCompany(companies[0])
        }
      } else {
        // 소속된 회사가 아예 없는 신규 유저 -> 회사 생성 유도 필요
        // (이 부분은 나중에 처리)
      }
    }
    init()
  }, []) // 최초 1회 실행

  // 2. 회사 변경 핸들러 (옷 갈아입기)
  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value
    const selected = myCompanies.find(c => c.id === selectedId)
    if (selected) {
        setCurrentCompany(selected) // 전역 상태 업데이트 -> 모든 페이지에 전파됨
        // (선택사항) 회사 바꿀 때 메인으로 이동시킬지 여부
        // router.push('/dashboard')
    }
  }

  // 로그인 페이지 등에서는 레이아웃 숨김
  if (pathname === '/' || pathname === '/auth') return <>{children}</>

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* --- 사이드바 (Sidebar) --- */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-gray-900 text-white transition-all duration-300 overflow-hidden flex flex-col fixed h-full z-20`}>

        {/* 로고 영역 */}
        <div className="p-6 flex items-center justify-between">
            <span className="text-xl font-black text-white tracking-tight">SECONDLIFE ERP</span>
        </div>

        {/* 🔥 [핵심 기능] 회사 선택 드롭다운 (Switcher) */}
        <div className="px-4 mb-6">
            <div className="relative">
                <select
                    className="w-full appearance-none bg-gray-800 border border-gray-700 text-white py-3 px-4 pr-8 rounded-xl focus:outline-none focus:border-indigo-500 font-bold text-sm cursor-pointer hover:bg-gray-700 transition-colors"
                    value={currentCompany?.id || ''} // 현재 선택된 회사 ID
                    onChange={handleCompanyChange}   // 변경 시 실행
                >
                    {myCompanies.map((comp) => (
                        <option key={comp.id} value={comp.id}>
                            🏢 {comp.name}
                        </option>
                    ))}
                    {myCompanies.length === 0 && <option>소속된 회사 없음</option>}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                    <Icons.ChevronDown />
                </div>
            </div>
            {/* 내 권한 표시 */}
            {currentCompany && (
                <div className="mt-2 text-right px-1">
                    <span className="text-[10px] text-gray-400 font-medium">내 권한: </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${currentCompany.role === 'admin' ? 'bg-red-900 text-red-200' : 'bg-gray-700 text-gray-300'}`}>
                        {currentCompany.role?.toUpperCase()}
                    </span>
                </div>
            )}
        </div>

        {/* 메뉴 리스트 (일단은 임시 메뉴판 사용) */}
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
            {TEMP_MENUS.map((menu) => {
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
                        <menu.icon />
                        {menu.name}
                    </Link>
                )
            })}
        </nav>

        {/* 하단 유저 정보 */}
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

      {/* --- 메인 컨텐츠 (Main Content) --- */}
      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* 상단 모바일 토글 버튼 등은 생략 (깔끔하게) */}
        <div className="min-h-screen">
            {children}
        </div>
      </main>

    </div>
  )
}
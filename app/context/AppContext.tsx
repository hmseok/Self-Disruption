'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../utils/supabase'
import type { Profile, UserPagePermission, Position, Department } from '../types/rbac'

// ============================================
// AppContext - 전역 상태 (사용자 + 권한)
// FMI 단독 ERP (주식회사 에프엠아이)
// ============================================

type AppContextType = {
  user: any
  profile: Profile | null
  role: string                    // 'admin' | 'user'
  position: Position | null
  department: Department | null
  permissions: UserPagePermission[]
  loading: boolean
  refreshAuth: () => Promise<void>
  // 사이드바 메뉴 새로고침 트리거
  menuRefreshKey: number
  triggerMenuRefresh: () => void
  // ★ 하위 호환: 기존 코드에서 참조하는 필드 (제거 전 과도기)
  company: any
  allCompanies: any[]
  adminSelectedCompanyId: string | null
  setAdminSelectedCompanyId: (id: string | null) => void
}

const AppContext = createContext<AppContextType>({
  user: null,
  profile: null,
  role: '',
  position: null,
  department: null,
  permissions: [],
  loading: true,
  refreshAuth: async () => {},
  menuRefreshKey: 0,
  triggerMenuRefresh: () => {},
  // 하위 호환
  company: null,
  allCompanies: [],
  adminSelectedCompanyId: null,
  setAdminSelectedCompanyId: () => {},
})

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [role, setRole] = useState('')
  const [position, setPosition] = useState<Position | null>(null)
  const [department, setDepartment] = useState<Department | null>(null)
  const [permissions, setPermissions] = useState<UserPagePermission[]>([])
  const [loading, setLoading] = useState(true)

  // 사이드바 메뉴 새로고침 키
  const [menuRefreshKey, setMenuRefreshKey] = useState(0)
  const triggerMenuRefresh = () => setMenuRefreshKey(prev => prev + 1)

  // ★ 무한루프 완전 차단: 데이터 로드 완료 플래그
  const isLoadedRef = useRef(false)
  const isFetchingRef = useRef(false)

  // 세션 없을 때 상태 초기화
  const clearState = () => {
    setUser(null)
    setProfile(null)
    setRole('')
    setPosition(null)
    setDepartment(null)
    setPermissions([])
  }

  // ★ 프로필 데이터 로드
  const loadUserData = async (authUser: any) => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setLoading(true)
    try {
      setUser(authUser)

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(`
          *,
          position:positions(*),
          department:departments(*)
        `)
        .eq('id', authUser.id)
        .maybeSingle()

      if (profileError) {
        console.error('프로필 로드 에러:', profileError.message)
      }

      if (profileData) {
        // ★ role 매핑: admin/master → admin (DB 마이그레이션 전 과도기)
        let mappedRole = profileData.role || 'user'
        if (mappedRole === 'admin' || mappedRole === 'master') {
          mappedRole = 'admin'
        }

        console.log('AppContext 로드 완료:', mappedRole, profileData.position?.name)
        setProfile(profileData as Profile)
        setRole(mappedRole)
        setPosition(profileData.position || null)
        setDepartment(profileData.department || null)

        // ★ 페이지 권한 로드 (사용자 기준)
        const { data: permsData } = await supabase
          .from('user_page_permissions')
          .select('*')
          .eq('user_id', authUser.id)

        setPermissions(permsData || [])
      } else {
        setRole('user')
      }

      isLoadedRef.current = true
    } catch (error: any) {
      console.error('AppContext 로딩 에러:', error)
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }

  // refreshAuth: 외부에서 강제 새로고침
  const refreshAuth = async () => {
    isLoadedRef.current = false
    isFetchingRef.current = false
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await loadUserData(session.user)
    }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth:', event, isLoadedRef.current ? '(loaded, skip)' : '(processing)')

        if (event === 'SIGNED_OUT') {
          isLoadedRef.current = false
          isFetchingRef.current = false
          clearState()
          setLoading(false)
          return
        }

        if (isLoadedRef.current) return

        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.user) {
          loadUserData(session.user)
        } else if (event === 'INITIAL_SESSION' && !session) {
          clearState()
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // ★ 하위 호환용 company 객체 (FMI 고정)
  const fmiCompany = {
    id: 'fmi-single',
    name: '주식회사 에프엠아이',
    is_active: true,
  }

  return (
    <AppContext.Provider value={{
      user,
      profile,
      role,
      position,
      department,
      permissions,
      loading,
      refreshAuth,
      menuRefreshKey,
      triggerMenuRefresh,
      // 하위 호환
      company: fmiCompany,
      allCompanies: [fmiCompany],
      adminSelectedCompanyId: fmiCompany.id,
      setAdminSelectedCompanyId: () => {},
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)

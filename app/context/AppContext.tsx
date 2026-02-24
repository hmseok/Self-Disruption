'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../utils/supabase'
import type { Profile, PagePermission, Position, Department } from '../types/rbac'

// ============================================
// AppContext - 전역 상태 (사용자 + 권한)
// ============================================

type AppContextType = {
  user: any
  profile: Profile | null
  company: any
  role: string
  position: Position | null
  department: Department | null
  permissions: PagePermission[]
  loading: boolean
  refreshAuth: () => Promise<void>     // 외부에서 새로고침 호출용
  // god_admin 회사 선택 기능
  allCompanies: any[]
  adminSelectedCompanyId: string | null  // null = 전체, string = 특정 회사
  setAdminSelectedCompanyId: (id: string | null) => void
  // 사이드바 메뉴 새로고침 트리거
  menuRefreshKey: number
  triggerMenuRefresh: () => void
}

const AppContext = createContext<AppContextType>({
  user: null,
  profile: null,
  company: null,
  role: '',
  position: null,
  department: null,
  permissions: [],
  loading: true,
  refreshAuth: async () => {},
  allCompanies: [],
  adminSelectedCompanyId: null,
  setAdminSelectedCompanyId: () => {},
  menuRefreshKey: 0,
  triggerMenuRefresh: () => {},
})

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [company, setCompany] = useState<any>(null)
  const [role, setRole] = useState('')
  const [position, setPosition] = useState<Position | null>(null)
  const [department, setDepartment] = useState<Department | null>(null)
  const [permissions, setPermissions] = useState<PagePermission[]>([])
  const [loading, setLoading] = useState(true)

  // god_admin 회사 선택 상태
  const [allCompanies, setAllCompanies] = useState<any[]>([])
  const [adminSelectedCompanyId, setAdminSelectedCompanyId] = useState<string | null>(null)

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
    setCompany(null)
    setRole('')
    setPosition(null)
    setDepartment(null)
    setPermissions([])
    setAllCompanies([])
    setAdminSelectedCompanyId(null)
  }

  // ★ 프로필 데이터 로드 (getSession 호출 없음)
  const loadUserData = async (authUser: any) => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      setUser(authUser)

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(`
          *,
          companies(*),
          position:positions(*),
          department:departments(*)
        `)
        .eq('id', authUser.id)
        .maybeSingle()

      if (profileError) {
        console.error('프로필 로드 에러:', profileError.message)
      }

      if (profileData) {
        console.log('AppContext 로드 완료:', profileData.role, profileData.position?.name)
        setProfile(profileData as Profile)
        setRole(profileData.role || 'user')
        setCompany(profileData.companies)
        setPosition(profileData.position || null)
        setDepartment(profileData.department || null)

        // 권한 로드: 부서별 + 부서/직급별 (부서가 있으면 부서 기반, 없으면 구형 position 기반)
        if (profileData.company_id && (profileData.department_id || profileData.position_id)) {
          let permsQuery = supabase
            .from('page_permissions')
            .select('*')
            .eq('company_id', profileData.company_id)

          if (profileData.department_id) {
            // 부서가 있는 경우: 해당 부서의 모든 권한 로드 (부서기본 + 부서/직급별)
            permsQuery = permsQuery.eq('department_id', profileData.department_id)
          } else if (profileData.position_id) {
            // 구형 호환: 부서 없이 직급만 있는 경우
            permsQuery = permsQuery.eq('position_id', profileData.position_id).is('department_id', null)
          }

          const { data: permsData } = await permsQuery
          setPermissions(permsData || [])
        }

        if (profileData.role === 'god_admin') {
          const { data: companiesData } = await supabase
            .from('companies')
            .select('id, name, plan, is_active')
            .eq('is_active', true)
            .order('name')
          setAllCompanies(companiesData || [])
        }
      } else {
        setRole('user')
      }

      // ★ 로드 완료 표시 → 이후 SIGNED_IN 이벤트 무시
      isLoadedRef.current = true
    } catch (error: any) {
      console.error('AppContext 로딩 에러:', error)
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }

  // refreshAuth: 외부에서 강제 새로고침 (설정 변경 등)
  const refreshAuth = async () => {
    isLoadedRef.current = false
    isFetchingRef.current = false
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await loadUserData(session.user)
    }
  }

  useEffect(() => {
    // ★ onAuthStateChange 하나로 통합 — fetchSession/getSession 별도 호출 안 함
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

        // ★ 핵심: 이미 로드 완료 상태면 SIGNED_IN/INITIAL_SESSION 전부 무시
        if (isLoadedRef.current) return

        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.user) {
          loadUserData(session.user)
        } else if (event === 'INITIAL_SESSION' && !session) {
          // 세션 없음 → 로그인 페이지 표시
          clearState()
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AppContext.Provider value={{
      user,
      profile,
      company,
      role,
      position,
      department,
      permissions,
      loading,
      refreshAuth,
      allCompanies,
      adminSelectedCompanyId,
      setAdminSelectedCompanyId,
      menuRefreshKey,
      triggerMenuRefresh,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)

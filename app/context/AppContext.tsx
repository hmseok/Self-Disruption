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

  // ★ 무한루프 방지: fetchSession 중복 호출 차단
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

  const fetchSession = async () => {
    // 이미 로딩 중이면 중복 호출 방지
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      // 1. 세션 확인
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      // Refresh Token 만료/무효 → 강제 로그아웃
      if (sessionError) {
        console.warn('⚠️ 세션 에러 (토큰 만료 등):', sessionError.message)
        await supabase.auth.signOut().catch(() => {})
        clearState()
        setLoading(false)
        return
      }

      if (!session) {
        clearState()
        setLoading(false)
        return
      }
      setUser(session.user)

      // 2. 프로필 + 직급 + 부서 + 회사 한 번에 로드
      // ★ RLS 정상 동작 — SECURITY DEFINER 함수로 무한재귀 해결됨
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(`
          *,
          companies(*),
          position:positions(*),
          department:departments(*)
        `)
        .eq('id', session.user.id)
        .maybeSingle()

      if (profileError) {
        console.error('❌ 프로필 로드 에러:', profileError.message)
      }

      if (profileData) {
        console.log('✅ AppContext 로드:', profileData.role, profileData.position?.name)
        setProfile(profileData as Profile)
        setRole(profileData.role || 'user')
        setCompany(profileData.companies)
        setPosition(profileData.position || null)
        setDepartment(profileData.department || null)

        // 3. 페이지 권한 로드 (직급이 있는 경우만)
        if (profileData.position_id && profileData.company_id) {
          const { data: permsData } = await supabase
            .from('page_permissions')
            .select('*')
            .eq('company_id', profileData.company_id)
            .eq('position_id', profileData.position_id)

          setPermissions(permsData || [])
        }
        // god_admin이나 master는 권한 테이블 없어도 전체 허용 (usePermission에서 처리)

        // god_admin: 전체 회사 목록 로드
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
    } catch (error: any) {
      console.error('AppContext 로딩 에러:', error)
      // 인증 관련 에러인 경우 강제 로그아웃
      if (error?.message?.includes('Refresh Token') || error?.message?.includes('JWT') || error?.status === 401) {
        console.warn('⚠️ 인증 토큰 에러 → 로그아웃 처리')
        await supabase.auth.signOut().catch(() => {})
        clearState()
      }
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }

  useEffect(() => {
    // 초기 세션 로드
    fetchSession()

    // ✅ 핵심: 로그인/로그아웃 이벤트 감지 → 자동으로 상태 갱신
    // 초기 SIGNED_IN 이벤트는 fetchSession()에서 이미 처리하므로 무시
    let initialEventSkipped = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('🔄 Auth 상태 변경:', event)
        if (event === 'SIGNED_IN' && !initialEventSkipped) {
          // 초기 마운트 시 발생하는 SIGNED_IN은 건너뜀 (fetchSession()이 이미 처리)
          initialEventSkipped = true
          return
        }
        initialEventSkipped = true

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          fetchSession()
        } else if (event === 'SIGNED_OUT') {
          setLoading(true)
          clearState()
          setLoading(false)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
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
      refreshAuth: fetchSession,
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

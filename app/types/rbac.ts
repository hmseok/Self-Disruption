// ============================================
// RBAC 타입 정의 - 권한 시스템
// ============================================

// 직급
export interface Position {
  id: string
  company_id: string
  name: string        // 대표, 이사, 팀장, 사원
  level: number       // 1=최상위, 숫자 클수록 하위
  description?: string
  created_at: string
  updated_at: string
}

// 부서
export interface Department {
  id: string
  company_id: string
  name: string        // 경영지원, 영업, 차량관리
  description?: string
  created_at: string
  updated_at: string
}

// 프로필 (확장)
export interface Profile {
  id: string
  company_id: string
  role: 'god_admin' | 'master' | 'user'
  is_super_admin: boolean
  position_id?: string
  department_id?: string
  employee_name?: string
  phone?: string
  is_active: boolean
  // 조인된 데이터
  position?: Position
  department?: Department
  companies?: Company
}

// 회사
export interface Company {
  id: string
  name: string
  business_number?: string
  plan: string
  owner_id: string
  created_at: string
}

// 페이지 권한
// 부서별(department_id만) 또는 부서+직급별(department_id+position_id)로 설정
export interface PagePermission {
  id: string
  company_id: string
  department_id: string | null   // NULL이면 구형 직급 전용 권한
  position_id: string | null     // NULL이면 부서 기본 권한
  page_path: string              // /cars, /quotes, /finance 등
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  data_scope: 'all' | 'department' | 'own'
  created_at: string
  updated_at: string
}

// 권한 체크에 사용하는 액션 타입
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete'

// 데이터 범위
export type DataScope = 'all' | 'department' | 'own'

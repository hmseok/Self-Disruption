// ============================================
// RBAC 타입 정의 - 권한 시스템
// FMI 단독 ERP (주식회사 에프엠아이)
// ============================================

// 직급
export interface Position {
  id: string
  name: string        // 대표, 이사, 팀장, 사원
  level: number       // 1=최상위, 숫자 클수록 하위
  description?: string
  created_at: string
  updated_at: string
}

// 부서
export interface Department {
  id: string
  name: string        // 경영지원, 영업, 차량관리
  description?: string
  created_at: string
  updated_at: string
}

// 프로필
export interface Profile {
  id: string
  role: 'admin' | 'user'
  position_id?: string
  department_id?: string
  employee_name?: string
  phone?: string
  email?: string
  is_active: boolean
  is_approved: boolean       // 가입 승인 여부
  // 조인된 데이터
  position?: Position
  department?: Department
}

// ============================================
// 사용자별 페이지 권한
// ============================================
export interface UserPagePermission {
  id: string
  user_id: string
  page_path: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  data_scope: DataScope
  created_at: string
  updated_at: string
}

// 하위 호환용 (기존 코드에서 PagePermission 참조하는 곳)
export type PagePermission = UserPagePermission

// 권한 체크에 사용하는 액션 타입
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete'

// 데이터 범위
export type DataScope = 'all' | 'department' | 'own'

// ============================================
// 하위 호환 타입 (마이그레이션 과도기)
// ============================================
export interface Company {
  id: string
  name: string
  business_number?: string
  owner_id?: string
  created_at?: string
}

'use client'

import { useApp } from '../context/AppContext'
import type { PermissionAction, DataScope, PagePermission } from '../types/rbac'

// ============================================
// usePermission - 권한 체크 Hook
// ============================================
// 권한 해석 순서:
// 1. 부서+직급별 (department_id + position_id) → 최우선
// 2. 부서별 기본 (department_id만, position_id NULL) → 차선
// 3. 구형 호환 (department_id NULL, position_id만) → 레거시
// 4. 매칭 없음 → 권한 없음
//
// 사용법:
//   const { canView, canCreate, canEdit, canDelete, getDataScope } = usePermission('/cars')

export function usePermission(pagePath?: string) {
  const { role, permissions, profile } = useApp()

  // god_admin은 항상 모든 권한
  const isGodAdmin = role === 'god_admin'

  // 해당 페이지에 대한 최적 권한 레코드 찾기
  const findBestPermission = (page: string): PagePermission | null => {
    const positionId = profile?.position_id
    const departmentId = profile?.department_id

    // 같은 page_path에 대한 모든 권한 레코드
    const pagePerms = permissions.filter(p => p.page_path === page)
    if (pagePerms.length === 0) return null

    // 1순위: 부서+직급 정확 매칭
    if (departmentId && positionId) {
      const exact = pagePerms.find(p => p.department_id === departmentId && p.position_id === positionId)
      if (exact) return exact
    }

    // 2순위: 부서 기본 (position_id가 NULL인 것)
    if (departmentId) {
      const deptDefault = pagePerms.find(p => p.department_id === departmentId && !p.position_id)
      if (deptDefault) return deptDefault
    }

    // 3순위: 구형 호환 (department_id NULL, position_id만)
    if (positionId) {
      const legacy = pagePerms.find(p => !p.department_id && p.position_id === positionId)
      if (legacy) return legacy
    }

    return null
  }

  // 특정 페이지의 특정 액션 권한 확인
  const checkPermission = (page: string, action: PermissionAction): boolean => {
    if (isGodAdmin) return true
    if (role === 'master') return true

    const perm = findBestPermission(page)
    if (!perm) return false

    switch (action) {
      case 'view': return perm.can_view
      case 'create': return perm.can_create
      case 'edit': return perm.can_edit
      case 'delete': return perm.can_delete
      default: return false
    }
  }

  // 데이터 범위 확인 (all / department / own)
  const getDataScope = (page?: string): DataScope => {
    if (isGodAdmin || role === 'master') return 'all'

    const targetPage = page || pagePath
    if (!targetPage) return 'own'

    const perm = findBestPermission(targetPage)
    return (perm?.data_scope as DataScope) || 'own'
  }

  // pagePath가 지정된 경우 편의 속성 제공
  const canView = pagePath ? checkPermission(pagePath, 'view') : false
  const canCreate = pagePath ? checkPermission(pagePath, 'create') : false
  const canEdit = pagePath ? checkPermission(pagePath, 'edit') : false
  const canDelete = pagePath ? checkPermission(pagePath, 'delete') : false

  // 특정 페이지에 view 권한이 있는지 (메뉴 표시용)
  const hasPageAccess = (page: string): boolean => {
    return checkPermission(page, 'view')
  }

  return {
    canView,
    canCreate,
    canEdit,
    canDelete,
    checkPermission,
    hasPageAccess,
    getDataScope,
    isGodAdmin,
  }
}

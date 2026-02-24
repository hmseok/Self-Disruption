'use client'

import { useApp } from '../context/AppContext'
import type { PermissionAction, DataScope } from '../types/rbac'

// ============================================
// usePermission - 권한 체크 Hook (사용자별 권한)
// ============================================
// 권한 해석:
//   god_admin / master → 항상 모든 권한
//   일반 user → user_page_permissions에서 해당 page_path 조회
//
// 사용법:
//   const { canView, canCreate, canEdit, canDelete } = usePermission('/cars')
//   const { hasPageAccess } = usePermission()

export function usePermission(pagePath?: string) {
  const { role, permissions } = useApp()

  const isGodAdmin = role === 'god_admin'

  // 특정 페이지의 특정 액션 권한 확인
  const checkPermission = (page: string, action: PermissionAction): boolean => {
    if (isGodAdmin) return true
    if (role === 'master') return true

    const perm = permissions.find(p => p.page_path === page)
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

    const perm = permissions.find(p => p.page_path === targetPage)
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

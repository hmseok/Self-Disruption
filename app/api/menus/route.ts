// ═══════════════════════════════════════════════════════════════════
// GET /api/menus
//   lib/menu-registry 의 GROUPS + MENUS 한 번에 반환 — 공용 메뉴 source.
//
// PR-HR-13 (2026-05-27, hr 세션) — InviteModal 페이지 권한 동기화 구조 개선.
//   기존 문제:
//     · InviteModal.tsx 가 자체 hardcoded PAGE_GROUPS (5개) + PATH_TO_GROUP
//       사용 → menu-registry (12 그룹) 와 불일치 → 새 메뉴/그룹 추가 시
//       페이지 권한에 자동 반영 안 됨 (사용자 보고: 「실제 페이지 항목 동기화 안됨」).
//   조치 (사용자 결정: 옵션 C 공용 API):
//     · 본 API 가 단일 source — menu-registry 한 곳만 수정하면 자동 반영.
//
// 쿼리:
//   ?for=permission       → 권한 부여 대상만 (isPermissionMenu 필터)
//   ?include_hidden=1     → hidden 메뉴 포함 (디버그 — 디폴트 X)
//
// 응답:
//   { data: { groups: MenuGroup[], menus: MenuEntry[] }, error: null }
//
// 사용처:
//   · app/components/InviteModal.tsx (페이지 권한 트리 — 본 PR)
//   · 향후: app/admin/employees 권한 페이지, 다른 권한 UI (별 PR)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { MENUS, GROUPS, type MenuEntry } from '@/lib/menu-registry'

// menu-registry 의 module-local isRequirePermission 과 동일 로직 (인라인 — Rule 14):
//   · menu.requirePermission 명시되어 있으면 그 값
//   · 그 외: 비즈니스 그룹 (asset/operation/finance/sales/admin) 은 기본 권한 대상
function isPermissionMenu(menu: MenuEntry): boolean {
  if (typeof menu.requirePermission === 'boolean') return menu.requirePermission
  return ['asset', 'operation', 'finance', 'sales', 'admin'].includes(menu.group)
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const sp = request.nextUrl.searchParams
    const forPermission = sp.get('for') === 'permission'
    const includeHidden = sp.get('include_hidden') === '1'

    // GROUPS 정렬 — sortOrder 오름차순
    const groups = [...GROUPS].sort((a, b) => a.sortOrder - b.sortOrder)

    // MENUS 필터 + 정렬
    let menus = MENUS.filter(m => {
      if (!includeHidden && m.hidden) return false
      if (forPermission && !isPermissionMenu(m)) return false
      return true
    })
    menus = menus.sort((a, b) => a.sortOrder - b.sortOrder)

    return NextResponse.json({
      data: { groups, menus },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'menu-registry load error' }, { status: 500 })
  }
}

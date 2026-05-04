import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { toSystemModules } from '@/lib/menu-registry'

// ═══════════════════════════════════════════════════════════════════
// /api/system_modules — 시스템 모듈 목록 (권한 페이지 / 초대 페이지 데이터)
//
// ★ 단일 SOURCE: lib/menu-registry.ts (toSystemModules)
// 새 페이지 추가 시 lib/menu-registry.ts 의 MENUS 배열에만 entry 추가하면
// 본 API + 사이드바 + 권한 페이지 모두 자동 동기화.
//
// 본 API 가 반환하는 메뉴 = 권한 부여 대상 (requirePermission=true 또는
// group=asset/operation/finance/sales/admin)
// 직장인필수 / CX팀 / 설정 메뉴는 권한 부여 대상 X (모든 사용자 또는 admin 코드 처리)
// ═══════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    return NextResponse.json({ data: toSystemModules(), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

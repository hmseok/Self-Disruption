// ═══════════════════════════════════════════════════════════════
// /api/menu-layout — 사이드바 트리 구조 설정 (2026-08-08)
//   GET    효과 레이아웃 (저장본 없으면 menu-registry 기본값) — 로그인 사용자
//   PUT    레이아웃 저장 — admin/master
//   DELETE 기본값으로 초기화 — admin/master
// 저장 형식: { groups: [{id, label}], items: { [path]: groupId } } — 배열 순서 = 표시 순서
// 메뉴의 존재·권한은 menu-registry 가 원천, 여기는 「배치」만 담당.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'
import { MENUS, BUSINESS_GROUPS, getDisplayName } from '@/lib/menu-registry'

const KEY = 'menu_layout'

function defaultLayout() {
  const groups = BUSINESS_GROUPS
    .filter(g => MENUS.some(m => m.group === g.id && !m.hidden && !m.sidebarHidden))
    .map(g => ({ id: g.id, label: g.label }))
  const items: Record<string, string> = {}
  for (const g of groups) {
    for (const m of MENUS.filter(m => m.group === g.id && !m.hidden && !m.sidebarHidden)
      .sort((a, b) => a.sortOrder - b.sortOrder)) {
      items[m.path] = g.id
    }
  }
  return { groups, items }
}

async function loadSaved(): Promise<{ groups: { id: string; label: string }[]; items: Record<string, string> } | null> {
  const r = await prisma.$queryRawUnsafe<any[]>(
    `SELECT setting_value FROM app_settings WHERE setting_key = ?`, KEY)
  if (!r[0]?.setting_value) return null
  try { return JSON.parse(r[0].setting_value) } catch { return null }
}

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const saved = await loadSaved()
  const def = defaultLayout()
  const layout = saved || def

  // 레지스트리에 새로 추가된 메뉴가 저장본에 없으면 기본 그룹으로 보강
  const validGroupIds = new Set(layout.groups.map(g => g.id))
  for (const [path, gid] of Object.entries(def.items)) {
    if (!layout.items[path]) layout.items[path] = validGroupIds.has(gid) ? gid : layout.groups[0]?.id
  }
  // 삭제된 메뉴 정리
  const validPaths = new Set(Object.keys(def.items))
  for (const path of Object.keys(layout.items)) {
    if (!validPaths.has(path)) delete layout.items[path]
  }

  // 메뉴 메타 (설정 화면 표시용)
  const menuMeta = Object.keys(def.items).map(path => {
    const m = MENUS.find(x => x.path === path)!
    return { path, name: getDisplayName(m), iconKey: m.iconKey }
  })

  return NextResponse.json({ layout, isCustomized: Boolean(saved), menuMeta })
}

export async function PUT(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user || !['admin', 'master'].includes(user.role)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 })
  }
  const b = await req.json()
  const groups = Array.isArray(b.groups) ? b.groups : null
  const items = b.items && typeof b.items === 'object' ? b.items : null
  if (!groups || !items || groups.length === 0) {
    return NextResponse.json({ error: '레이아웃 형식이 올바르지 않습니다' }, { status: 400 })
  }
  // 검증: 그룹 라벨 비어있지 않게, 모든 메뉴가 존재하는 그룹에
  const gids = new Set<string>()
  for (const g of groups) {
    if (!g.id || !String(g.label || '').trim()) return NextResponse.json({ error: '그룹 이름이 비어 있습니다' }, { status: 400 })
    gids.add(String(g.id))
  }
  for (const [path, gid] of Object.entries(items)) {
    if (!gids.has(String(gid))) return NextResponse.json({ error: `메뉴(${path})가 없는 그룹에 배정되어 있습니다` }, { status: 400 })
  }
  const cleaned = {
    groups: groups.map((g: any) => ({ id: String(g.id).slice(0, 40), label: String(g.label).trim().slice(0, 30) })),
    items: Object.fromEntries(Object.entries(items).map(([p, g]) => [String(p).slice(0, 100), String(g).slice(0, 40)])),
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    KEY, JSON.stringify(cleaned))
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user || !['admin', 'master'].includes(user.role)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 })
  }
  await prisma.$executeRawUnsafe(`DELETE FROM app_settings WHERE setting_key = ?`, KEY)
  return NextResponse.json({ ok: true })
}

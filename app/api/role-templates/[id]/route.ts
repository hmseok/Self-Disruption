// ═══════════════════════════════════════════════════════════════
// /api/role-templates/[id] — 단일 템플릿 (페이지 권한 포함)
//
// PR-HR-16 (2026-05-28, hr 세션)
//
// GET     — 템플릿 + 페이지 권한 목록
// PATCH   — 템플릿 헤더 (label / description / sort_order / is_active)
// PUT     — 페이지 권한 일괄 교체 (pages: PagePerm[])
// DELETE  — 템플릿 삭제 (cascade: role_template_pages)
//
// 페이지 권한 형식 (PUT body):
//   { pages: [{ page_path, can_view, can_create, can_edit, can_delete, data_scope }, ...] }
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface PageRow {
  id: string
  template_id: string
  page_path: string
  can_view: number
  can_create: number
  can_edit: number
  can_delete: number
  data_scope: string
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const { id } = await params

    const tplRows = await prisma.$queryRaw<any[]>`
      SELECT rt.*, c.company_key, c.label as company_label
        FROM role_templates rt
        LEFT JOIN companies c ON c.id = rt.company_id
       WHERE rt.id = ${id} LIMIT 1
    `
    if (tplRows.length === 0) {
      return NextResponse.json({ error: '템플릿을 찾을 수 없습니다' }, { status: 404 })
    }

    const pages = await prisma.$queryRaw<PageRow[]>`
      SELECT id, template_id, page_path, can_view, can_create, can_edit, can_delete, data_scope
        FROM role_template_pages
       WHERE template_id = ${id}
       ORDER BY page_path ASC
    `

    const tpl = tplRows[0]
    return NextResponse.json({
      data: {
        ...tpl,
        is_active: Boolean(tpl.is_active),
        pages: pages.map(p => ({
          ...p,
          can_view: Boolean(p.can_view),
          can_create: Boolean(p.can_create),
          can_edit: Boolean(p.can_edit),
          can_delete: Boolean(p.can_delete),
        })),
      },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'SELECT 실패' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'admin 권한 필요' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()

    const ALLOWED = new Set(['label', 'description', 'sort_order', 'is_active'])
    const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/

    const updates: string[] = []
    const values: any[] = []
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED.has(key) || !SAFE_COL.test(key)) continue
      updates.push(`\`${key}\` = ?`)
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value)
    }
    values.push(id)

    if (updates.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE role_templates SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
        ...values
      )
    }

    const updated = await prisma.$queryRaw<any[]>`
      SELECT * FROM role_templates WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: updated[0] || null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'UPDATE 실패' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 페이지 권한 일괄 교체 — body.pages 의 전체 (DELETE all + INSERT all)
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'admin 권한 필요' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()
    const pages = Array.isArray(body?.pages) ? body.pages : []

    // 템플릿 존재 검증
    const tplRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM role_templates WHERE id = ${id} LIMIT 1
    `
    if (tplRows.length === 0) {
      return NextResponse.json({ error: '템플릿을 찾을 수 없습니다' }, { status: 404 })
    }

    // 전체 교체 — DELETE all + INSERT all (트랜잭션)
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM role_template_pages WHERE template_id = ${id}`

      for (const p of pages) {
        if (!p?.page_path) continue
        await tx.$executeRaw`
          INSERT INTO role_template_pages (
            id, template_id, page_path, can_view, can_create, can_edit, can_delete, data_scope,
            created_at, updated_at
          ) VALUES (
            UUID(), ${id}, ${p.page_path},
            ${p.can_view ? 1 : 0}, ${p.can_create ? 1 : 0},
            ${p.can_edit ? 1 : 0}, ${p.can_delete ? 1 : 0},
            ${p.data_scope || 'all'},
            NOW(), NOW()
          )
        `
      }
    })

    return NextResponse.json({
      data: { template_id: id, pages_count: pages.length },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'PUT 실패' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'admin 권한 필요' }, { status: 403 })

  try {
    const { id } = await params

    // FK cascade 없으니 수동 — pages 먼저 삭제
    await prisma.$executeRaw`DELETE FROM role_template_pages WHERE template_id = ${id}`
    await prisma.$executeRaw`DELETE FROM role_templates WHERE id = ${id}`

    return NextResponse.json({ data: { deleted: id }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DELETE 실패' }, { status: 500 })
  }
}

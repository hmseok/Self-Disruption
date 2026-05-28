// ═══════════════════════════════════════════════════════════════
// /api/role-templates — 회사 × 역할 페이지 권한 템플릿 CRUD
//
// PR-HR-16 (2026-05-28, hr 세션) — 사용자 「실수할까봐 두려움」 직접 해결.
//   설계: CLAUDE.md § PR-HR-15+16 통합 설계서 v2
//   마이그: migrations/2026-05-28_pr_hr_16_role_templates.sql
//
// GET   ?company_key=FMI            — 회사별 템플릿 목록 (sort_order ASC)
// GET   ?company_id=<uuid>           — UUID 로 조회
// POST                                — 새 템플릿 추가
//
// 응답: { data, error: null }
// Rule 23 — 마이그 미적용 시 graceful fallback.
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface TemplateRow {
  id: string
  company_id: string
  company_key: string | null
  company_label: string | null
  role_key: string
  label: string
  description: string | null
  sort_order: number
  is_active: number
  page_count: bigint | number
  created_at: Date
  updated_at: Date
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const sp = request.nextUrl.searchParams
    const companyKey = sp.get('company_key')
    const companyId = sp.get('company_id')
    const includeInactive = sp.get('include_inactive') === '1'

    // company 필터 (둘 다 없으면 전체)
    let rows: TemplateRow[]
    if (companyId) {
      rows = await prisma.$queryRaw<TemplateRow[]>`
        SELECT rt.id, rt.company_id, c.company_key, c.label as company_label,
               rt.role_key, rt.label, rt.description, rt.sort_order, rt.is_active,
               (SELECT COUNT(*) FROM role_template_pages WHERE template_id = rt.id) as page_count,
               rt.created_at, rt.updated_at
          FROM role_templates rt
          LEFT JOIN companies c ON c.id = rt.company_id
         WHERE rt.company_id = ${companyId}
           AND (${includeInactive} = TRUE OR rt.is_active = 1)
         ORDER BY rt.sort_order ASC
      `
    } else if (companyKey) {
      rows = await prisma.$queryRaw<TemplateRow[]>`
        SELECT rt.id, rt.company_id, c.company_key, c.label as company_label,
               rt.role_key, rt.label, rt.description, rt.sort_order, rt.is_active,
               (SELECT COUNT(*) FROM role_template_pages WHERE template_id = rt.id) as page_count,
               rt.created_at, rt.updated_at
          FROM role_templates rt
          LEFT JOIN companies c ON c.id = rt.company_id
         WHERE c.company_key = ${companyKey}
           AND (${includeInactive} = TRUE OR rt.is_active = 1)
         ORDER BY rt.sort_order ASC
      `
    } else {
      rows = await prisma.$queryRaw<TemplateRow[]>`
        SELECT rt.id, rt.company_id, c.company_key, c.label as company_label,
               rt.role_key, rt.label, rt.description, rt.sort_order, rt.is_active,
               (SELECT COUNT(*) FROM role_template_pages WHERE template_id = rt.id) as page_count,
               rt.created_at, rt.updated_at
          FROM role_templates rt
          LEFT JOIN companies c ON c.id = rt.company_id
         WHERE (${includeInactive} = TRUE OR rt.is_active = 1)
         ORDER BY c.sort_order ASC, rt.sort_order ASC
      `
    }

    return NextResponse.json({
      data: rows.map(r => ({
        ...r,
        is_active: Boolean(r.is_active),
        page_count: Number(r.page_count),
      })),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({
      data: [],
      error: null,
      _migration_pending: true,
      _debug: String(e?.message || e),
    })
  }
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'admin 권한 필요' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const {
      company_id, role_key, label, description, sort_order = 100,
    } = body || {}

    if (!company_id || !role_key || !label) {
      return NextResponse.json({ error: 'company_id + role_key + label 필수' }, { status: 400 })
    }

    // 회사 존재 검증
    const compExists = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM companies WHERE id = ${company_id} LIMIT 1
    `
    if (compExists.length === 0) {
      return NextResponse.json({ error: '회사를 찾을 수 없습니다' }, { status: 404 })
    }

    // (company_id, role_key) UNIQUE 중복 차단
    const dupe = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM role_templates
       WHERE company_id = ${company_id} AND role_key = ${role_key} LIMIT 1
    `
    if (dupe.length > 0) {
      return NextResponse.json({ error: `이 회사에 ${role_key} 역할이 이미 있습니다` }, { status: 409 })
    }

    await prisma.$executeRaw`
      INSERT INTO role_templates (id, company_id, role_key, label, description, sort_order, is_active, created_at, updated_at)
      VALUES (UUID(), ${company_id}, ${role_key}, ${label}, ${description || null}, ${sort_order}, 1, NOW(), NOW())
    `

    const created = await prisma.$queryRaw<TemplateRow[]>`
      SELECT rt.id, rt.company_id, c.company_key, c.label as company_label,
             rt.role_key, rt.label, rt.description, rt.sort_order, rt.is_active,
             0 as page_count, rt.created_at, rt.updated_at
        FROM role_templates rt
        LEFT JOIN companies c ON c.id = rt.company_id
       WHERE rt.company_id = ${company_id} AND rt.role_key = ${role_key}
       LIMIT 1
    `

    return NextResponse.json({
      data: created[0] || null,
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'INSERT 실패' }, { status: 500 })
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/role-templates/[id]/apply — 템플릿을 직원에 일괄 적용
//
// PR-HR-16 (2026-05-28, hr 세션) — 사용자 「실수할까봐 두려움」 직접 해결.
//
// Body:
//   { user_ids: string[], mode?: 'replace' | 'merge' }
//
// 동작:
//   1. 템플릿의 role_template_pages 조회
//   2. 각 user_id 에 대해 user_page_permissions 처리:
//      - mode='replace' (디폴트): 해당 page_path 의 기존 권한 DELETE 후 INSERT
//      - mode='merge': UPSERT (기존 권한 보존 + 새 권한 추가)
//   3. source_template_id 컬럼에 템플릿 id 기록 (추적용)
//   4. 결과 — { applied: N, skipped: M, errors: [...] }
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface PageRow {
  page_path: string
  can_view: number
  can_create: number
  can_edit: number
  can_delete: number
  data_scope: string
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'admin 권한 필요' }, { status: 403 })

  try {
    const { id: templateId } = await params
    const body = await request.json()
    const userIds: string[] = Array.isArray(body?.user_ids) ? body.user_ids : []
    const mode: 'replace' | 'merge' = body?.mode === 'merge' ? 'merge' : 'replace'

    if (userIds.length === 0) {
      return NextResponse.json({ error: 'user_ids 빈 배열' }, { status: 400 })
    }

    // 1. 템플릿 페이지 권한 조회
    const pages = await prisma.$queryRaw<PageRow[]>`
      SELECT page_path, can_view, can_create, can_edit, can_delete, data_scope
        FROM role_template_pages WHERE template_id = ${templateId}
    `
    if (pages.length === 0) {
      return NextResponse.json({
        data: { applied: 0, skipped: userIds.length, errors: [] },
        error: null,
        _notice: '템플릿에 페이지 권한이 없습니다 — 빈 적용',
      })
    }

    let applied = 0
    let skipped = 0
    const errors: string[] = []

    for (const userId of userIds) {
      try {
        // user 존재 검증
        const userRows = await prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM profiles WHERE id = ${userId} LIMIT 1
        `
        if (userRows.length === 0) {
          skipped++
          errors.push(`user_id ${userId} 존재 X`)
          continue
        }

        await prisma.$transaction(async (tx) => {
          if (mode === 'replace') {
            // 템플릿 페이지에 해당하는 기존 권한만 삭제 (다른 page_path 권한은 보존)
            for (const p of pages) {
              await tx.$executeRaw`
                DELETE FROM user_page_permissions
                 WHERE user_id = ${userId} AND page_path = ${p.page_path}
              `
            }
          }

          for (const p of pages) {
            if (mode === 'merge') {
              // 이미 존재 시 OR 합치기 (can_* 권한은 OR / data_scope 는 더 넓은 쪽)
              const exists = await tx.$queryRaw<any[]>`
                SELECT can_view, can_create, can_edit, can_delete, data_scope
                  FROM user_page_permissions
                 WHERE user_id = ${userId} AND page_path = ${p.page_path} LIMIT 1
              `
              if (exists.length > 0) {
                const e0 = exists[0]
                await tx.$executeRaw`
                  UPDATE user_page_permissions SET
                    can_view = ${(e0.can_view ? 1 : 0) | (p.can_view ? 1 : 0)},
                    can_create = ${(e0.can_create ? 1 : 0) | (p.can_create ? 1 : 0)},
                    can_edit = ${(e0.can_edit ? 1 : 0) | (p.can_edit ? 1 : 0)},
                    can_delete = ${(e0.can_delete ? 1 : 0) | (p.can_delete ? 1 : 0)},
                    source_template_id = ${templateId},
                    updated_at = NOW()
                   WHERE user_id = ${userId} AND page_path = ${p.page_path}
                `
                continue
              }
            }
            await tx.$executeRaw`
              INSERT INTO user_page_permissions (
                id, user_id, page_path, can_view, can_create, can_edit, can_delete,
                data_scope, source_template_id, created_at, updated_at
              ) VALUES (
                UUID(), ${userId}, ${p.page_path},
                ${p.can_view ? 1 : 0}, ${p.can_create ? 1 : 0},
                ${p.can_edit ? 1 : 0}, ${p.can_delete ? 1 : 0},
                ${p.data_scope || 'all'}, ${templateId},
                NOW(), NOW()
              )
            `
          }
        })

        applied++
      } catch (e: any) {
        skipped++
        errors.push(`user_id ${userId}: ${String(e?.message || e)}`)
      }
    }

    return NextResponse.json({
      data: {
        applied,
        skipped,
        errors,
        pages_count: pages.length,
        mode,
      },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'APPLY 실패' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/finance/auto-classify/apply
 *
 * dry-run 결과 중 사용자가 확정한 거래에 분류 적용.
 * DB 안전망:
 *   - applied 0건이면 즉시 응답 (무한 루프 방지)
 *   - 하나의 거래마다 단순 UPDATE — 트랜잭션 X (실패해도 부분 적용 OK)
 *
 * body:
 *   {
 *     items: [
 *       { id, category, subcategory?, related_type?, related_id?, classification_status? }
 *     ]
 *   }
 *
 * 응답:
 *   { applied: number, failed: number, errors: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const items: Array<{
      id: string
      category: string
      subcategory?: string | null
      related_type?: string | null
      related_id?: string | null
      classification_status?: string
    }> = body.items || []

    if (items.length === 0) {
      return NextResponse.json({ applied: 0, failed: 0, errors: [], message: '적용할 항목 없음' })
    }
    if (items.length > 10000) {
      return NextResponse.json({ error: '한 번에 10000건 초과 — 분할 호출 필요' }, { status: 400 })
    }

    let applied = 0
    let failed = 0
    const errors: Array<{ id: string; error: string }> = []

    for (const it of items) {
      if (!it.id || !it.category) {
        failed++
        errors.push({ id: it.id || '?', error: 'id/category 필수' })
        continue
      }
      try {
        // category + final_category 동시 설정 (검수 완료 표시)
        // related_type/related_id 가 명시되면 같이 set, 명시 안 됐으면 그대로 둠
        const setRelated = it.related_type !== undefined && it.related_id !== undefined
        if (setRelated) {
          await prisma.$executeRaw`
            UPDATE transactions
            SET category = ${it.category},
                final_category = ${it.category},
                related_type = ${it.related_type},
                related_id = ${it.related_id},
                updated_at = NOW()
            WHERE id = ${it.id} AND deleted_at IS NULL
          `
        } else {
          await prisma.$executeRaw`
            UPDATE transactions
            SET category = ${it.category},
                final_category = ${it.category},
                updated_at = NOW()
            WHERE id = ${it.id} AND deleted_at IS NULL
          `
        }
        applied++
      } catch (e: any) {
        failed++
        errors.push({ id: it.id, error: e?.message?.slice(0, 200) || 'unknown' })
      }
    }

    return NextResponse.json({ applied, failed, errors: errors.slice(0, 50) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

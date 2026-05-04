// ═══════════════════════════════════════════════════════════════════
// GET  /factory-search/api/axes — 전체 분류 축 정의 조회
// POST /factory-search/api/axes — 일괄 upsert (UI 의 saveAxes 대상)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import type { CodeAxis } from '../../groups/defaults'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAxis(r: any): CodeAxis {
  return {
    key: r.axis_key,
    title: r.title,
    emoji: r.emoji ?? '',
    description: r.description ?? '',
    editable: r.editable,
    custom: !!r.is_custom_items,
    match: r.axis_match,
    items: typeof r.items_json === 'string' ? JSON.parse(r.items_json) : (r.items_json ?? []),
    axisHidden: !!r.axis_hidden,
    axisCustom: !!r.is_user_axis,
  }
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, axis_key, title, emoji, description, editable,
             is_custom_items, axis_match, axis_hidden, is_user_axis,
             sort_order, items_json
      FROM factory_axis_definitions
      ORDER BY sort_order ASC, id ASC
    `
    const axes = rows.map(rowToAxis)
    return NextResponse.json({ success: true, data: axes })
  } catch (e: unknown) {
    // 마이그레이션 미적용 graceful fallback (규칙 23)
    return NextResponse.json({
      success: true,
      data: [],
      _migration_pending: true,
      error: e instanceof Error ? e.message : 'unknown',
    })
  }
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  try {
    const body = await request.json() as { axes: CodeAxis[] }
    const axes = body.axes || []

    // 트랜잭션: 기존 모두 삭제 + 새로 INSERT (단순 일괄 동기화)
    await prisma.$transaction(async (tx) => {
      const incomingKeys = axes.map(a => a.key)
      if (incomingKeys.length === 0) {
        await tx.$executeRaw`DELETE FROM factory_axis_definitions`
      } else {
        // axis_key 가 incomingKeys 에 없는 행 삭제
        await tx.$executeRawUnsafe(
          `DELETE FROM factory_axis_definitions WHERE axis_key NOT IN (${incomingKeys.map(() => '?').join(',')})`,
          ...incomingKeys,
        )
      }
      for (let i = 0; i < axes.length; i++) {
        const a = axes[i]
        await tx.$executeRaw`
          INSERT INTO factory_axis_definitions
            (axis_key, title, emoji, description, editable,
             is_custom_items, axis_match, axis_hidden, is_user_axis,
             sort_order, items_json)
          VALUES
            (${a.key}, ${a.title}, ${a.emoji ?? ''}, ${a.description ?? ''}, ${a.editable},
             ${a.custom ? 1 : 0}, ${a.match}, ${a.axisHidden ? 1 : 0}, ${a.axisCustom ? 1 : 0},
             ${i}, ${JSON.stringify(a.items)})
          ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            emoji = VALUES(emoji),
            description = VALUES(description),
            editable = VALUES(editable),
            is_custom_items = VALUES(is_custom_items),
            axis_match = VALUES(axis_match),
            axis_hidden = VALUES(axis_hidden),
            is_user_axis = VALUES(is_user_axis),
            sort_order = VALUES(sort_order),
            items_json = VALUES(items_json)
        `
      }
    })

    return NextResponse.json({ success: true, data: { saved: axes.length } })
  } catch (e: unknown) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : 'save failed',
    }, { status: 500 })
  }
}

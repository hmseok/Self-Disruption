// POST /factory-search/api/axes/reset — 13축 기본 + 매핑 모두 비우기 (초기 설정 / 첫 시드)
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { DEFAULT_AXES } from '../../../groups/defaults'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM factory_classifications`
      await tx.$executeRaw`DELETE FROM factory_axis_definitions`
      for (let i = 0; i < DEFAULT_AXES.length; i++) {
        const a = DEFAULT_AXES[i]
        await tx.$executeRaw`
          INSERT INTO factory_axis_definitions
            (axis_key, title, emoji, description, editable,
             is_custom_items, axis_match, axis_hidden, is_user_axis,
             sort_order, items_json)
          VALUES
            (${a.key}, ${a.title}, ${a.emoji ?? ''}, ${a.description ?? ''}, ${a.editable},
             ${a.custom ? 1 : 0}, ${a.match}, 0, 0,
             ${i}, ${JSON.stringify(a.items)})
        `
      }
    })
    return NextResponse.json({ success: true, data: { seeded: DEFAULT_AXES.length } })
  } catch (e: unknown) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : 'reset failed',
    }, { status: 500 })
  }
}

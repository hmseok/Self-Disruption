// ═══════════════════════════════════════════════════════════════════
// GET  /factory-search/api/mappings           — 전체 매핑 (통계용)
// POST /factory-search/api/mappings           — 한 공장의 부여 일괄 저장
//   body: { factcode: string, mapping: { [axisKey]: string[] } }
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  try {
    const rows = await prisma.$queryRaw<{ factcode: string; axis_key: string; item_key: string }[]>`
      SELECT factcode, axis_key, item_key FROM factory_classifications
    `
    // { [factcode]: { [axisKey]: string[] } } 형태로 그루핑
    const grouped: Record<string, Record<string, string[]>> = {}
    for (const r of rows) {
      grouped[r.factcode] = grouped[r.factcode] || {}
      grouped[r.factcode][r.axis_key] = grouped[r.factcode][r.axis_key] || []
      grouped[r.factcode][r.axis_key].push(r.item_key)
    }
    return NextResponse.json({ success: true, data: grouped })
  } catch (e: unknown) {
    return NextResponse.json({
      success: true,
      data: {},
      _migration_pending: true,
      error: e instanceof Error ? e.message : 'unknown',
    })
  }
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  try {
    const body = await request.json() as {
      factcode: string
      mapping: Record<string, string[]>
    }
    if (!body.factcode) {
      return NextResponse.json({ success: false, error: 'factcode required' }, { status: 400 })
    }
    const { factcode, mapping } = body

    await prisma.$transaction(async (tx) => {
      // 이 공장의 기존 부여 모두 삭제 후 재 INSERT (단순 일괄 동기화)
      await tx.$executeRaw`DELETE FROM factory_classifications WHERE factcode = ${factcode}`
      for (const axisKey of Object.keys(mapping || {})) {
        for (const itemKey of (mapping[axisKey] || [])) {
          if (!itemKey) continue
          await tx.$executeRaw`
            INSERT IGNORE INTO factory_classifications (factcode, axis_key, item_key)
            VALUES (${factcode}, ${axisKey}, ${itemKey})
          `
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : 'save failed',
    }, { status: 500 })
  }
}

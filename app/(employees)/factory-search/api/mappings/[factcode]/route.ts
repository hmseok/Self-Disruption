// GET    /factory-search/api/mappings/[factcode] — 한 공장의 부여 조회
// DELETE /factory-search/api/mappings/[factcode] — 한 공장의 부여 모두 초기화
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ factcode: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const { factcode } = await params
  try {
    const rows = await prisma.$queryRaw<{ axis_key: string; item_key: string }[]>`
      SELECT axis_key, item_key FROM factory_classifications WHERE factcode = ${factcode}
    `
    const mapping: Record<string, string[]> = {}
    for (const r of rows) {
      mapping[r.axis_key] = mapping[r.axis_key] || []
      mapping[r.axis_key].push(r.item_key)
    }
    return NextResponse.json({ success: true, data: mapping })
  } catch (e: unknown) {
    return NextResponse.json({
      success: true,
      data: {},
      _migration_pending: true,
      error: e instanceof Error ? e.message : 'unknown',
    })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ factcode: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const { factcode } = await params
  try {
    await prisma.$executeRaw`DELETE FROM factory_classifications WHERE factcode = ${factcode}`
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : 'delete failed',
    }, { status: 500 })
  }
}

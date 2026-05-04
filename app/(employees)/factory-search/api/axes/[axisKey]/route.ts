// DELETE /factory-search/api/axes/[axisKey] — 개별 축 삭제 + 그 축 부여 매핑도 cascade
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ axisKey: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const { axisKey } = await params
  if (!axisKey) return NextResponse.json({ success: false, error: 'axisKey required' }, { status: 400 })

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM factory_classifications  WHERE axis_key = ${axisKey}`
      await tx.$executeRaw`DELETE FROM factory_axis_definitions WHERE axis_key = ${axisKey}`
    })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : 'delete failed',
    }, { status: 500 })
  }
}

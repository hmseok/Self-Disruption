/**
 * /api/ride-vision/lotto-entries/[id]
 *
 * DELETE — 본인 구매 기록 삭제 (user_id 일치하는 행만)
 *
 * RideVision 세션 — PR-VISION-2b
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function isMissingTable(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e)
  return /doesn't exist|Unknown table|no such table/i.test(msg)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ success: false, error: 'id 필요' }, { status: 400 })
  }

  try {
    // user_id 조건 → 본인 기록만 삭제 가능
    const affected = await prisma.$executeRaw`
      DELETE FROM ride_lotto_entries
       WHERE id = ${id} AND user_id = ${user.id}
    `
    if (affected === 0) {
      return NextResponse.json(
        { success: false, error: '해당 기록 없음 (또는 권한 없음)' },
        { status: 404 }
      )
    }
    return NextResponse.json({ success: true, deleted: affected })
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json(
        { success: false, error: 'migration 미적용 — migrations/2026-05-24_ride_vision_lotto.sql 실행 필요' },
        { status: 503 }
      )
    }
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-vision/lotto-entries/[id] DELETE]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

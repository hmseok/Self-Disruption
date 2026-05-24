/**
 * /api/ride-vision/lotto-entries/[id]
 *
 * DELETE — 구매 기록 삭제. 슈퍼어드민(admin/master) 전용.
 *   손실 추적 무결성을 위해 일반 직원은 자기 기록도 삭제 불가 —
 *   정정·정리는 관리자만 (낙첨 기록을 임의 삭제하면 손익 집계가 무의미).
 *
 * RideVision 세션 — PR-VISION-2b → 10
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

const DELETE_ROLES = ['admin', 'master'] // 슈퍼어드민 tier

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

  // 슈퍼어드민 전용
  const role = String((user as { role?: string }).role || '')
  if (!DELETE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: '삭제 권한 없음 — 관리자(admin/master) 전용입니다' },
      { status: 403 }
    )
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ success: false, error: 'id 필요' }, { status: 400 })
  }

  try {
    // 슈퍼어드민은 모든 직원의 기록 삭제 가능 (정정·정리용)
    const affected = await prisma.$executeRaw`
      DELETE FROM ride_lotto_entries WHERE id = ${id}
    `
    if (affected === 0) {
      return NextResponse.json({ success: false, error: '해당 기록 없음' }, { status: 404 })
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

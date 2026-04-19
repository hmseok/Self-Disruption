import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { syncSharesPaid } from '../../_lib/paid-helper'

/**
 * PATCH /api/settlement/shares/[id]/paid
 *
 * 단건 정산 공유의 paid_at을 토글한다.
 * body (optional): { action?: 'mark' | 'unmark' } — 미지정 시 토글
 *
 * Side effect:
 *   - mark   → transactions 원장에 지급 레코드 INSERT
 *   - unmark → 해당 share의 transactions DELETE
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    let action: 'mark' | 'unmark' | undefined = undefined
    try {
      const body = await request.json()
      if (body?.action === 'mark' || body?.action === 'unmark') action = body.action
    } catch {}

    const result = await syncSharesPaid([id], action)
    return NextResponse.json({ success: true, ...result, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/settlement/shares/[id]/paid]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

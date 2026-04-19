import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { syncSharesPaid } from '../_lib/paid-helper'

/**
 * PATCH /api/settlement/shares/bulk-paid
 *
 * 복수 정산 공유의 paid_at을 일괄 처리한다.
 * body: { ids: string[], action?: 'mark' | 'unmark' }  (action 미지정 시 'mark')
 *
 * Side effect:
 *   - mark  → 각 share의 transactions 원장 INSERT
 *   - unmark → 각 share의 transactions DELETE
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids 필수' }, { status: 400 })
    }
    const action: 'mark' | 'unmark' = body?.action === 'unmark' ? 'unmark' : 'mark'

    const result = await syncSharesPaid(ids, action)
    return NextResponse.json({
      success: true,
      action,
      ...result,
      error: null,
    })
  } catch (e: any) {
    console.error('[PATCH /api/settlement/shares/bulk-paid]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

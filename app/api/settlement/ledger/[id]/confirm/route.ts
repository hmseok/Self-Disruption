import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/settlement/ledger/[id]/confirm
 * Body: { revert?: boolean }
 *
 * ledger를 '지급완료(paid)'로 확정. revert=true이면 'matched'로 되돌림.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const revert: boolean = !!body.revert

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, status FROM settlement_ledger WHERE id=${id} LIMIT 1
    `
    if (!rows[0]) return NextResponse.json({ error: '항목을 찾을 수 없습니다' }, { status: 404 })

    const now = new Date()

    if (revert) {
      // paid → matched 되돌림 (paid_at만 null 처리, matched_tx_ids는 유지)
      await prisma.$executeRaw`
        UPDATE settlement_ledger
           SET status='matched', paid_at=NULL, updated_at=${now}
         WHERE id=${id}
      `
      return NextResponse.json({ data: { id, status: 'matched' }, error: null })
    }

    // 지급완료 확정
    await prisma.$executeRaw`
      UPDATE settlement_ledger
         SET status='paid', paid_at=${now}, updated_at=${now}
       WHERE id=${id}
    `
    return NextResponse.json({ data: { id, status: 'paid' }, error: null })
  } catch (e: any) {
    console.error('[POST /api/settlement/ledger/[id]/confirm]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

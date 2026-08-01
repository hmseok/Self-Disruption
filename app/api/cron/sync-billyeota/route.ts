import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { verifyUser } from '@/lib/auth-server'
import { syncBillyeota } from '@/lib/billyeota-sync'

// ═══════════════════════════════════════════════════════════════════
// POST /api/cron/sync-billyeota — 구글시트 「빌려타」 → fmi_rentals 동기화
//   트리거: Cloud Scheduler (X-Cron-Secret) 1일 2회, 또는 admin 수동 호출.
//   전환기 한정 (2026-08-01 사용자 확정: 당분간 시트 운영, 정제 후 이관).
// ═══════════════════════════════════════════════════════════════════
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      const user = await verifyUser(request)
      if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    }
    const result = await syncBillyeota()
    console.log('[sync-billyeota]', JSON.stringify({ ...result, insertedList: result.insertedList.length }))
    return NextResponse.json({ data: result, error: null })
  } catch (e: any) {
    console.error('[POST /api/cron/sync-billyeota]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}

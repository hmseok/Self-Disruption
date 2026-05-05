/**
 * GET /api/cafe24/probe
 * 카페24 DB 헬스체크 (admin 디버그용).
 * version / sql_mode / collation / time_zone / total_tables 반환.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { cafe24Db } from '@/lib/cafe24-db'

export async function GET(request: Request) {
  // ── admin 권한 체크 (Q8=D 일단 관리자 전용) ──
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }

  // ── probe 수행 ──
  try {
    const meta = await cafe24Db.probe()
    return NextResponse.json({
      success: meta.ok,
      data: meta,
      meta: {
        fetched_at: new Date().toISOString(),
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/cafe24/probe] error:', err.code, err.message)
    return NextResponse.json(
      {
        success: false,
        data: { ok: false, error: `${err.code || 'no-code'}: ${err.message || String(e)}` },
        error: 'cafe24-unavailable',
      },
      { status: 200 } // graceful — UI 가 에러 처리 가능하게 200
    )
  }
}

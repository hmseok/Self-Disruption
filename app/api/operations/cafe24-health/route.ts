/**
 * GET /api/operations/cafe24-health — P2.2 hotfix
 *
 * cafe24-db 연결 진단 endpoint.
 * cafe24Db.probe() 호출 → 연결 가능 여부 / 버전 / sql_mode / 에러 반환.
 *
 * 사용 시나리오:
 *   /operations/intake 에서 「cafe24-unavailable」 에러 발생 시,
 *   본 endpoint 호출로 cafe24-db 자체 상태 확인 (vs production 환경 변수 / 네트워크 문제 등).
 *
 * 호출:
 *   /api/operations/cafe24-health
 *   Authorization: Bearer <fmi_token>
 *
 * 응답:
 *   { ok: true, version, variant, sql_mode, collation, time_zone, total_tables }
 *   { ok: false, error: 'ETIMEDOUT: ...' }
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { cafe24Db } from '@/lib/cafe24-db'

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const probe = await cafe24Db.probe()
    return NextResponse.json({
      success: probe.ok,
      data: probe,
      meta: {
        fetched_at: new Date().toISOString(),
        elapsed_ms: Date.now() - startedAt,
        env_vars_present: {
          host: !!process.env.CAFE24_DB_HOST,
          port: !!process.env.CAFE24_DB_PORT,
          user: !!process.env.CAFE24_DB_USER,
          password: !!process.env.CAFE24_DB_PASSWORD,
          name: !!process.env.CAFE24_DB_NAME,
        },
        // password 는 마스킹, host/user/db 는 노출 (디버깅 용)
        env_summary: {
          host: process.env.CAFE24_DB_HOST || '(unset)',
          port: process.env.CAFE24_DB_PORT || '(unset)',
          user: process.env.CAFE24_DB_USER || '(unset)',
          name: process.env.CAFE24_DB_NAME || '(unset)',
        },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    return NextResponse.json({
      success: false,
      data: null,
      error: `${err.code || 'no-code'}: ${err.message || String(e)}`,
      meta: {
        fetched_at: new Date().toISOString(),
        elapsed_ms: Date.now() - startedAt,
      },
    }, { status: 200 })
  }
}

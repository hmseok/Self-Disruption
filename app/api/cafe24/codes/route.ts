/**
 * GET /api/cafe24/codes
 *
 * 카페24 ERP 코드 마스터 (`comcbsdm`) — OTPT* / ESOS* / 기타 한국어 라벨 매핑.
 *
 * 카페24 PHP 측 fs_bscddesc 함수와 동일 source.
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       "OTPTACBN": { "B": "보불", "D": "단독", ... },
 *       "OTPTRGTP": { "1": "접수", "2": "완료", ... },
 *       "ESOSTYPP": { "S": "긴급출동", ... },
 *       ...
 *     }
 *   }
 *
 * 클라이언트는 본 응답을 한 번 fetch + 메모리 캐시 (코드 마스터는 자주 변하지 않음).
 *
 * cafe24-db: MariaDB 10.1
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

interface CodeRow extends RowDataPacket {
  cbsdgubn: string
  cbsdcode: string
  cbsddesc: string
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  // 코드 마스터 — RideAccidents / RideAccidentReports 둘 중 하나라도 권한 있으면 통과
  const allowed = await canAccessPage(user, ['/RideAccidents', '/RideAccidentReports'])
  if (!allowed) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    // 본 모듈에서 사용하는 코드 패밀리만 (OTPT, ESOS) — 다른 모듈 추가 시 확장
    const sql = `
      SELECT cbsdgubn, cbsdcode, cbsddesc
        FROM comcbsdm
       WHERE cbsdgubn LIKE 'OTPT%'
          OR cbsdgubn LIKE 'ESOS%'
       ORDER BY cbsdgubn, cbsdsort, cbsdcode
    `
    const rows = await cafe24Db.query<CodeRow>(sql)

    // 그룹별 dict 로 변환
    const data: Record<string, Record<string, string>> = {}
    for (const r of rows) {
      if (!data[r.cbsdgubn]) data[r.cbsdgubn] = {}
      data[r.cbsdgubn][r.cbsdcode] = r.cbsddesc
    }

    return NextResponse.json({
      success: true,
      data,
      meta: {
        fetched_at: new Date().toISOString(),
        groups: Object.keys(data).length,
        total: rows.length,
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/cafe24/codes] error:', err.code, err.message)
    return NextResponse.json(
      {
        success: false,
        data: {},
        error: 'cafe24-unavailable',
        meta: { db_error: err.code || 'no-code' },
      },
      { status: 200 }
    )
  }
}

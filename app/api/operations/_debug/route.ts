/**
 * GET /api/operations/_debug — P2.1b 디버그
 *
 * 모든 endpoint 결과 한 번에 진단:
 *   1. cafe24-health (probe)
 *   2. dispatch-orders count
 *   3. cafe24-dispatch-requests (안전 SQL — 최소 컬럼만, 시간 범위 1년)
 *
 * 응답으로 어디서 fail 하는지 즉시 파악 가능.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { cafe24Db } from '@/lib/cafe24-db'

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  const result: any = {
    timestamp: new Date().toISOString(),
    steps: {},
  }

  // 1. cafe24 health
  try {
    const probe = await cafe24Db.probe()
    result.steps['1_cafe24_health'] = probe
  } catch (e: any) {
    result.steps['1_cafe24_health'] = { error: e?.message }
  }

  // 2. dispatch-orders count (operations_dispatch_orders)
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS cnt FROM operations_dispatch_orders`
    )
    result.steps['2_dispatch_orders_count'] = { ok: true, count: Number(rows[0]?.cnt || 0) }
  } catch (e: any) {
    result.steps['2_dispatch_orders_count'] = { ok: false, error: e?.message?.slice(0, 300) }
  }

  // 2b. dispatch-orders 컬럼 — cafe24_otpt_* 마이그 적용 여부
  try {
    const cols = await prisma.$queryRawUnsafe<any[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'operations_dispatch_orders'
          AND column_name LIKE 'cafe24_otpt_%'`
    )
    result.steps['2b_dispatch_orders_cafe24_keys_migration'] = {
      ok: cols.length === 3,
      columns_present: cols.map((r: any) => r.column_name || r.COLUMN_NAME),
      expected: ['cafe24_otpt_idno', 'cafe24_otpt_mddt', 'cafe24_otpt_srno'],
    }
  } catch (e: any) {
    result.steps['2b_dispatch_orders_cafe24_keys_migration'] = { ok: false, error: e?.message?.slice(0, 300) }
  }

  // 3. acrotpth row 1건 SELECT (최소 — 컬럼 의존성 X)
  try {
    const rows = await cafe24Db.query<any>(
      `SELECT otptidno, otptmddt, otptsrno, otptdcyn, otptrgst FROM acrotpth
        WHERE CHAR_LENGTH(otptmddt) = 8
          AND otptmddt BETWEEN '20260101' AND '20261231'
        ORDER BY otptmddt DESC LIMIT 1`
    )
    result.steps['3_acrotpth_minimal'] = { ok: true, count: rows.length, sample: rows[0] || null }
  } catch (e: any) {
    result.steps['3_acrotpth_minimal'] = { ok: false, error: e?.message?.slice(0, 300) }
  }

  // 4. acrotpth 의 본 세션 P2.1b 컬럼 7개 시도 (otptdsli/dsbh/dsbn/dsre/care/acrn/adfg)
  try {
    const rows = await cafe24Db.query<any>(
      `SELECT otptidno, otptdsli, otptdsbh, otptdsbn, otptdsre, otptcare, otptacrn, otptadfg
         FROM acrotpth
        WHERE CHAR_LENGTH(otptmddt) = 8
          AND otptmddt BETWEEN '20260101' AND '20261231'
        ORDER BY otptmddt DESC LIMIT 1`
    )
    result.steps['4_acrotpth_p2_1b_7cols'] = { ok: true, count: rows.length, sample: rows[0] || null }
  } catch (e: any) {
    result.steps['4_acrotpth_p2_1b_7cols'] = { ok: false, error: e?.message?.slice(0, 300) }
  }

  // 5. 추가 컬럼 시도 (otptbdnm/otptpknm/otptdsus/otptdstl)
  try {
    const rows = await cafe24Db.query<any>(
      `SELECT otptidno, otptbdnm, otptpknm, otptdsus, otptdstl
         FROM acrotpth
        WHERE CHAR_LENGTH(otptmddt) = 8
          AND otptmddt BETWEEN '20260101' AND '20261231'
        ORDER BY otptmddt DESC LIMIT 1`
    )
    result.steps['5_acrotpth_extra_4cols'] = { ok: true, count: rows.length, sample: rows[0] || null }
  } catch (e: any) {
    result.steps['5_acrotpth_extra_4cols'] = { ok: false, error: e?.message?.slice(0, 300) }
  }

  // 6. acrparth (파손부위) 테이블 존재 확인
  try {
    const rows = await cafe24Db.query<any>(
      `SELECT COUNT(*) AS cnt FROM acrparth LIMIT 1`
    )
    result.steps['6_acrparth_exists'] = { ok: true, count: Number(rows[0]?.cnt || 0) }
  } catch (e: any) {
    result.steps['6_acrparth_exists'] = { ok: false, error: e?.message?.slice(0, 300) }
  }

  return NextResponse.json(result)
}

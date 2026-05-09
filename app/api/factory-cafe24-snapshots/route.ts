/**
 * /api/factory-cafe24-snapshots
 *
 * GET  — snapshot list (filter: batch / factcode / q)
 * POST — 새 snapshot batch 생성 (서버측 카페24 fetch + insert)
 *
 * PR-6.12.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { prisma } from '@/lib/prisma'
import { cafe24Db } from '@/lib/cafe24-db'
import { randomUUID } from 'crypto'
import type { RowDataPacket } from 'mysql2'

interface SnapshotRow {
  id: string
  fetch_batch: string
  factcode: string
  factname: string | null
  factaddr: string | null
  facthpno: string | null
  facttel: string | null
  factbsno: string | null
  factconm: string | null
  facttype: string | null
  factmemo: string | null
  factfrdt: string | null
  facttodt: string | null
  raw_extra: unknown
  fetched_by: string | null
  fetched_by_name: string | null
  fetched_at: Date | string
}

interface FactoryCafe24Row extends RowDataPacket {
  factcode: string
  factname: string | null
  factaddr: string | null
  facthpno: string | null
  facttel: string | null
  factbsno: string | null
  factconm: string | null
  facttype: string | null
  factmemo: string | null
  factfrdt: string | null
  facttodt: string | null
  [key: string]: unknown
}

const SNAPSHOT_COLS = `
  id, fetch_batch, factcode, factname, factaddr, facthpno, facttel,
  factbsno, factconm, facttype, factmemo, factfrdt, facttodt,
  raw_extra, fetched_by, fetched_by_name, fetched_at
`

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json(
      { success: false, data: [], error: 'unauthorized' },
      { status: 401 }
    )
  const allowed = await canAccessPage(user, [
    '/factory-search',
    '/factory-search/mgmt',
  ])
  if (!allowed)
    return NextResponse.json(
      { success: false, data: [], error: 'forbidden' },
      { status: 403 }
    )

  const url = new URL(request.url)
  const batch = url.searchParams.get('batch')
  const factcode = url.searchParams.get('factcode')
  const q = (url.searchParams.get('q') || '').trim()
  const latest = url.searchParams.get('latest') === '1'
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '5000', 10) || 5000, 1),
    20000
  )

  try {
    // latest=1 → 가장 최근 batch_id 조회 후 그 batch row 만
    let effectiveBatch = batch
    if (latest && !batch) {
      const [latestRow] = await prisma.$queryRaw<{ fetch_batch: string }[]>`
        SELECT fetch_batch FROM factory_cafe24_snapshots
         ORDER BY fetched_at DESC LIMIT 1
      `
      effectiveBatch = latestRow?.fetch_batch || null
    }

    const conds: string[] = []
    const args: (string | number)[] = []
    if (effectiveBatch) {
      conds.push('fetch_batch = ?')
      args.push(effectiveBatch)
    }
    if (factcode) {
      conds.push('factcode = ?')
      args.push(factcode)
    }
    if (q) {
      conds.push('(factname LIKE ? OR factaddr LIKE ? OR factbsno LIKE ?)')
      const like = `%${q}%`
      args.push(like, like, like)
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''
    const sql = `SELECT ${SNAPSHOT_COLS} FROM factory_cafe24_snapshots ${where}
                 ORDER BY factcode ASC LIMIT ${limit}`
    const rows = await prisma.$queryRawUnsafe<SnapshotRow[]>(sql, ...args)

    // batch 메타 (별도 쿼리)
    let batchInfo: { batch: string | null; count: number; fetched_at: string | null } = {
      batch: effectiveBatch,
      count: rows.length,
      fetched_at: rows.length > 0 ? String(rows[0].fetched_at) : null,
    }
    if (effectiveBatch) {
      const [bm] = await prisma.$queryRaw<{ count: bigint; fetched_at: Date | string }[]>`
        SELECT COUNT(*) AS count, MIN(fetched_at) AS fetched_at
          FROM factory_cafe24_snapshots
         WHERE fetch_batch = ${effectiveBatch}
      `
      if (bm) {
        batchInfo = {
          batch: effectiveBatch,
          count: Number(bm.count),
          fetched_at: bm.fetched_at ? String(bm.fetched_at) : null,
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        count: rows.length,
        batch: batchInfo,
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { _migration_pending: true },
      })
    }
    console.error('[/api/factory-cafe24-snapshots GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

/**
 * POST — 새 snapshot batch 생성 (카페24 fetch + 적재)
 *
 * Body: { include_terminated?: boolean, limit?: number }
 *
 * 흐름: 1) 카페24 pmcfactm SELECT *
 *       2) 새 fetch_batch UUID
 *       3) 각 row 를 factory_cafe24_snapshots 에 INSERT (raw_extra 에 가변 컬럼)
 *       4) batch + count 응답
 */
export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const allowed = await canAccessPage(user, [
    '/factory-search',
    '/factory-search/mgmt',
  ])
  if (!allowed)
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })

  let body: { include_terminated?: boolean; limit?: number } = {}
  try {
    body = await request.json()
  } catch {
    /* optional */
  }
  const includeTerminated = body.include_terminated === true
  const fetchLimit = Math.min(
    Math.max(typeof body.limit === 'number' ? body.limit : 10000, 1),
    20000
  )

  const userTyped = user as { id: string; name?: string }
  const batchId = randomUUID()

  // 1. 카페24 fetch (SELECT *)
  // pmcfactm 은 효력기간 컬럼 미존재 — 단순 facttype 만 필터
  let rows: FactoryCafe24Row[]
  try {
    const conds: string[] = []
    const args: (string | number)[] = []
    if (!includeTerminated) {
      conds.push("(facttype IS NULL OR facttype <> 'Z')")
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''
    const sql = `SELECT * FROM pmcfactm ${where}
                 ORDER BY factcode ASC LIMIT ${fetchLimit}`
    rows = await cafe24Db.query<FactoryCafe24Row>(sql, args)
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `카페24 fetch 실패: ${(e as Error).message}` },
      { status: 500 }
    )
  }

  if (rows.length === 0) {
    return NextResponse.json({
      success: true,
      batch: batchId,
      inserted: 0,
      message: '카페24 결과 0건',
    })
  }

  // 2. snapshot 적재
  const KNOWN_COLS = new Set([
    'factcode', 'factname', 'factaddr', 'facthpno', 'facttel',
    'factbsno', 'factconm', 'facttype', 'factmemo', 'factfrdt', 'facttodt',
  ])
  let inserted = 0
  for (const r of rows) {
    try {
      // raw_extra: 알려진 컬럼 외 나머지
      const extra: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(r)) {
        if (!KNOWN_COLS.has(k)) extra[k] = v
      }
      await prisma.$executeRaw`
        INSERT INTO factory_cafe24_snapshots
          (id, fetch_batch, factcode, factname, factaddr, facthpno, facttel,
           factbsno, factconm, facttype, factmemo, factfrdt, facttodt,
           raw_extra, fetched_by, fetched_by_name)
        VALUES
          (${randomUUID()}, ${batchId}, ${r.factcode}, ${r.factname}, ${r.factaddr},
           ${r.facthpno}, ${r.facttel}, ${r.factbsno}, ${r.factconm},
           ${r.facttype}, ${r.factmemo}, ${r.factfrdt}, ${r.facttodt},
           ${JSON.stringify(extra)}, ${userTyped.id}, ${userTyped.name || null})
      `
      inserted++
    } catch (e) {
      console.warn('[snapshot insert]', r.factcode, (e as Error).message)
    }
  }

  return NextResponse.json({
    success: true,
    batch: batchId,
    fetched: rows.length,
    inserted,
    fetched_at: new Date().toISOString(),
  })
}

/**
 * DELETE — 특정 batch 또는 전체 snapshot 삭제 (관리자 정리용)
 *
 * Query: ?batch=xxx → 특정 batch만 / ?all=1 → 전체
 */
export async function DELETE(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const allowed = await canAccessPage(user, [
    '/factory-search',
    '/factory-search/mgmt',
  ])
  if (!allowed)
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const batch = url.searchParams.get('batch')
  const all = url.searchParams.get('all') === '1'

  if (!batch && !all) {
    return NextResponse.json(
      { success: false, error: 'batch= 또는 all=1 필요' },
      { status: 400 }
    )
  }

  try {
    let deleted = 0
    if (all) {
      const r = await prisma.$executeRaw`DELETE FROM factory_cafe24_snapshots`
      deleted = Number(r)
    } else if (batch) {
      const r = await prisma.$executeRaw`DELETE FROM factory_cafe24_snapshots WHERE fetch_batch = ${batch}`
      deleted = Number(r)
    }
    return NextResponse.json({ success: true, deleted })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/factory-cafe24-snapshots DELETE]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

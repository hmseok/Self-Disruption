/**
 * /api/ride-assets/bulk
 *
 * POST — 자산 대량 일괄 등록 (권한자만)
 *        인라인 리스트 입력 + 엑셀 업로드 둘 다 본 API 로 등록.
 *
 * body: {
 *   rows: [{
 *     category_id, name,
 *     acquired_at?, acquired_cost?,
 *     assigned_to_kind?, assigned_to_id?,
 *     location?, notes?
 *   }]
 * }
 *
 * 안전망:
 *   - 1회 최대 200건 (Rule 1 batch 보호)
 *   - 트랜잭션 — 카테고리별 next_seq 락 후 순차 자산코드 부여
 *   - 행별 검증 결과 반환 (Rule 10 — apply 후 검증)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isAssetAdmin } from '@/lib/ride-asset-perm'
import { randomUUID } from 'crypto'

const MAX_ROWS = 200

interface InputRow {
  category_id?: unknown
  name?: unknown
  acquired_at?: unknown
  acquired_cost?: unknown
  assigned_to_kind?: unknown
  assigned_to_id?: unknown
  location?: unknown
  notes?: unknown
}

interface CleanRow {
  category_id: string
  name: string
  acquired_at: string | null
  acquired_cost: string | null
  assigned_to_kind: string | null
  assigned_to_id: string | null
  location: string | null
  notes: string | null
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isAssetAdmin(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 자산 권한자만 가능' }, { status: 403 })
  }

  let body: { rows?: InputRow[] }
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const rawRows = Array.isArray(body.rows) ? body.rows : []
  if (rawRows.length === 0) {
    return NextResponse.json({ success: false, error: '등록할 행이 없습니다' }, { status: 400 })
  }
  if (rawRows.length > MAX_ROWS) {
    return NextResponse.json({ success: false, error: `1회 최대 ${MAX_ROWS}건까지 등록 가능 (요청: ${rawRows.length}건)` }, { status: 400 })
  }

  // ── 1단계: 행 검증 ──
  const valid: CleanRow[] = []
  const errors: Array<{ row: number; error: string }> = []

  rawRows.forEach((r, idx) => {
    const categoryId = String(r.category_id || '').trim()
    const name = String(r.name || '').trim()
    if (!categoryId) { errors.push({ row: idx + 1, error: '카테고리 누락' }); return }
    if (!name) { errors.push({ row: idx + 1, error: '자산명 누락' }); return }

    const rawKind = r.assigned_to_kind ? String(r.assigned_to_kind).trim() : ''
    const kind = rawKind === 'employee' || rawKind === 'freelancer' ? rawKind : null
    const assignedId = kind && r.assigned_to_id ? String(r.assigned_to_id).trim() : null

    valid.push({
      category_id: categoryId,
      name,
      acquired_at: r.acquired_at ? String(r.acquired_at).trim() || null : null,
      acquired_cost: r.acquired_cost != null && r.acquired_cost !== '' ? String(r.acquired_cost).replace(/,/g, '') : null,
      assigned_to_kind: kind,
      assigned_to_id: assignedId,
      location: r.location ? String(r.location).trim() || null : null,
      notes: r.notes ? String(r.notes) || null : null,
    })
  })

  if (valid.length === 0) {
    return NextResponse.json({
      success: false, error: '유효한 행이 없습니다',
      data: { created: 0, failed: errors.length, errors },
    }, { status: 400 })
  }

  // ── 2단계: 트랜잭션 일괄 INSERT ──
  try {
    const created: Array<{ asset_code: string; name: string }> = []

    await prisma.$transaction(async (tx) => {
      // 카테고리별 next_seq 캐시 (락 1회 후 메모리 증가)
      const seqCache = new Map<string, { code: string; seq: number }>()

      for (const row of valid) {
        let cat = seqCache.get(row.category_id)
        if (!cat) {
          const catRows = await tx.$queryRaw<Array<{ code: string; next_seq: number }>>`
            SELECT code, next_seq FROM ride_asset_categories
             WHERE id = ${row.category_id} AND is_active = 1
             FOR UPDATE
          `
          if (!catRows.length) throw new Error(`category not found: ${row.category_id}`)
          cat = { code: catRows[0].code, seq: catRows[0].next_seq }
          seqCache.set(row.category_id, cat)
        }

        const year = new Date().getFullYear()
        const assetCode = `${cat.code}-${year}-${String(cat.seq).padStart(4, '0')}`
        cat.seq += 1

        const id = randomUUID()
        const qrToken = randomUUID()

        await tx.$executeRaw`
          INSERT INTO ride_assets
            (id, asset_code, category_id, name,
             acquired_at, acquired_cost, status,
             assigned_to_kind, assigned_to_id, location, notes, qr_token, created_by)
          VALUES
            (${id}, ${assetCode}, ${row.category_id}, ${row.name},
             ${row.acquired_at}, ${row.acquired_cost}, 'active',
             ${row.assigned_to_kind}, ${row.assigned_to_id}, ${row.location}, ${row.notes}, ${qrToken}, ${user.id})
        `
        await tx.$executeRaw`
          INSERT INTO ride_asset_logs (asset_id, action, to_user_id, to_status, to_location, by_user_id, note)
          VALUES (${id}, 'created', ${row.assigned_to_id}, 'active', ${row.location}, ${user.id}, '대량 등록')
        `
        created.push({ asset_code: assetCode, name: row.name })
      }

      // 카테고리별 next_seq 최종 반영
      for (const [catId, c] of seqCache) {
        await tx.$executeRaw`UPDATE ride_asset_categories SET next_seq = ${c.seq} WHERE id = ${catId}`
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        created: created.length,
        failed: errors.length,
        errors,
        created_codes: created.map(c => c.asset_code),
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-assets/bulk POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

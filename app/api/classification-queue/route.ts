import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ============================================
// 분류 큐 API (PHASE 3 확장)
// GET  /api/classification-queue?status=...&limit=500  조회
// POST /api/classification-queue  개별 승인/수정/거부
// PATCH /api/classification-queue  일괄 승인
// ============================================

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const statusParam = searchParams.get('status') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10) || 500, 2000)

    const statuses = statusParam
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    let rows: any[]
    if (statuses.length === 0) {
      rows = await prisma.$queryRaw<any[]>`
        SELECT id, ai_category, ai_matched_type, ai_matched_id,
               final_category, final_matched_type, final_matched_id,
               status, queue_item_type, queue_summary,
               source_data, created_at, updated_at
        FROM classification_queue
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    } else {
      const placeholders = statuses.map(() => '?').join(',')
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, ai_category, ai_matched_type, ai_matched_id,
                final_category, final_matched_type, final_matched_id,
                status, queue_item_type, queue_summary,
                source_data, created_at, updated_at
         FROM classification_queue
         WHERE status IN (${placeholders})
         ORDER BY created_at DESC
         LIMIT ?`,
        ...statuses,
        limit
      )
    }

    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    console.error('[GET /api/classification-queue]', e)
    return NextResponse.json({ data: [], error: e.message }, { status: 500 })
  }
}

// ── POST: 개별 분류 확정 (승인/수정/거부) ──
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { queue_id, action, final_category } = body
    // action: 'approve' (AI 카테고리 승인), 'edit' (수정), 'dismiss' (거부/무시)

    if (!queue_id) {
      return NextResponse.json({ error: 'queue_id 필요' }, { status: 400 })
    }

    // 큐 아이템 조회
    const items = await prisma.$queryRaw<any[]>`
      SELECT id, ai_category, source_data, status
      FROM classification_queue WHERE id = ${queue_id} LIMIT 1
    `
    if (items.length === 0) {
      return NextResponse.json({ error: '큐 아이템 없음' }, { status: 404 })
    }
    const item = items[0]

    if (action === 'dismiss') {
      // 거부 — 큐 아이템만 dismissed 처리
      await prisma.$executeRaw`
        UPDATE classification_queue
        SET status = 'dismissed', updated_at = NOW()
        WHERE id = ${queue_id}
      `
      return NextResponse.json({ ok: true, action: 'dismissed' })
    }

    // approve 또는 edit
    const category = action === 'edit' ? final_category : item.ai_category
    if (!category) {
      return NextResponse.json({ error: '카테고리 없음' }, { status: 400 })
    }

    // 큐 아이템 확정
    await prisma.$executeRaw`
      UPDATE classification_queue
      SET status = 'confirmed',
          final_category = ${category},
          updated_at = NOW()
      WHERE id = ${queue_id}
    `

    // 연결된 transaction에 카테고리 적용
    let sourceData: any = {}
    try {
      sourceData = typeof item.source_data === 'string'
        ? JSON.parse(item.source_data)
        : item.source_data || {}
    } catch { /* */ }

    if (sourceData.transaction_id) {
      await prisma.$executeRaw`
        UPDATE transactions
        SET category = ${category},
            final_category = ${category},
            updated_at = NOW()
        WHERE id = ${sourceData.transaction_id}
      `
    }

    return NextResponse.json({ ok: true, action, category })
  } catch (e: any) {
    console.error('[POST /api/classification-queue]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── PATCH: 일괄 승인 (AI 카테고리 그대로 확정) ──
export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { queue_ids } = body // string[]

    if (!queue_ids || !Array.isArray(queue_ids) || queue_ids.length === 0) {
      return NextResponse.json({ error: 'queue_ids 배열 필요' }, { status: 400 })
    }

    let confirmed = 0
    for (const qId of queue_ids) {
      const items = await prisma.$queryRaw<any[]>`
        SELECT id, ai_category, source_data
        FROM classification_queue
        WHERE id = ${qId} AND status = 'pending'
        LIMIT 1
      `
      if (items.length === 0) continue

      const item = items[0]
      if (!item.ai_category) continue

      // 큐 확정
      await prisma.$executeRaw`
        UPDATE classification_queue
        SET status = 'confirmed', final_category = ${item.ai_category}, updated_at = NOW()
        WHERE id = ${qId}
      `

      // transaction 업데이트
      let sourceData: any = {}
      try {
        sourceData = typeof item.source_data === 'string'
          ? JSON.parse(item.source_data)
          : item.source_data || {}
      } catch { /* */ }

      if (sourceData.transaction_id) {
        await prisma.$executeRaw`
          UPDATE transactions
          SET category = ${item.ai_category},
              final_category = ${item.ai_category},
              updated_at = NOW()
          WHERE id = ${sourceData.transaction_id}
        `
      }

      confirmed++
    }

    return NextResponse.json({ ok: true, confirmed, total: queue_ids.length })
  } catch (e: any) {
    console.error('[PATCH /api/classification-queue]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

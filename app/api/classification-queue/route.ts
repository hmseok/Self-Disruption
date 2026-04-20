import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ============================================
// 분류 큐 조회 API
// GET /api/classification-queue?status=confirmed,auto_confirmed&limit=500
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

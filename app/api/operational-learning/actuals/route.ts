import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { serialize } from '@/lib/operational-learning-helpers'

// ═══════════════════════════════════════════════════════════════
// 실적 (operational_actuals) API
//   GET  /api/operational-learning/actuals?snapshotId=xxx
//        /api/operational-learning/actuals?contractId=xxx
//   POST /api/operational-learning/actuals
//     - 단일 입력 또는 batch 입력 지원
//     - UPSERT: (snapshot_id, recorded_month) UNIQUE 제약 활용
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const snapshotId = searchParams.get('snapshotId')
    const contractId = searchParams.get('contractId')

    if (!snapshotId && !contractId) {
      return NextResponse.json({ error: 'snapshotId 또는 contractId 필수' }, { status: 400 })
    }

    let rows: any[]
    if (snapshotId) {
      rows = await prisma.$queryRaw<any[]>`
        SELECT * FROM operational_actuals
        WHERE snapshot_id = ${snapshotId}
        ORDER BY recorded_month ASC
      `
    } else {
      rows = await prisma.$queryRaw<any[]>`
        SELECT * FROM operational_actuals
        WHERE contract_id = ${contractId}
        ORDER BY recorded_month ASC
      `
    }

    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    // body 형태: { entries: ActualEntry[] } 또는 단일 객체
    const entries: any[] = Array.isArray(body.entries) ? body.entries : [body]

    const results: any[] = []

    for (const e of entries) {
      const {
        snapshot_id, contract_id, recorded_month,
        actual_depreciation, actual_insurance, actual_maintenance,
        actual_tax, actual_accident_cost,
        source = 'manual', notes,
      } = e

      if (!recorded_month || !/^\d{4}-\d{2}$/.test(recorded_month)) {
        return NextResponse.json({ error: 'recorded_month는 YYYY-MM 형식 필수' }, { status: 400 })
      }
      if (!snapshot_id && !contract_id) {
        return NextResponse.json({ error: 'snapshot_id 또는 contract_id 필수' }, { status: 400 })
      }

      // 기존 row 검색 (UPSERT 수동 처리)
      const existing = snapshot_id
        ? await prisma.$queryRaw<any[]>`
            SELECT id FROM operational_actuals
            WHERE snapshot_id = ${snapshot_id} AND recorded_month = ${recorded_month}
            LIMIT 1
          `
        : []

      if (existing.length > 0) {
        // UPDATE
        await prisma.$executeRaw`
          UPDATE operational_actuals
          SET
            actual_depreciation = ${actual_depreciation ?? null},
            actual_insurance = ${actual_insurance ?? null},
            actual_maintenance = ${actual_maintenance ?? null},
            actual_tax = ${actual_tax ?? null},
            actual_accident_cost = ${actual_accident_cost ?? null},
            source = ${source},
            notes = ${notes ?? null},
            updated_at = NOW()
          WHERE id = ${existing[0].id}
        `
        results.push({ id: existing[0].id, action: 'updated' })
      } else {
        // INSERT
        const id = crypto.randomUUID()
        await prisma.$executeRaw`
          INSERT INTO operational_actuals (
            id, snapshot_id, contract_id, recorded_month,
            actual_depreciation, actual_insurance, actual_maintenance,
            actual_tax, actual_accident_cost,
            source, notes, created_at, updated_at
          ) VALUES (
            ${id}, ${snapshot_id ?? null}, ${contract_id ?? null}, ${recorded_month},
            ${actual_depreciation ?? null}, ${actual_insurance ?? null}, ${actual_maintenance ?? null},
            ${actual_tax ?? null}, ${actual_accident_cost ?? null},
            ${source}, ${notes ?? null}, NOW(), NOW()
          )
        `
        results.push({ id, action: 'created' })
      }
    }

    return NextResponse.json({ data: results, error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

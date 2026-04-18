import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { analyzeActualVsPredicted } from '@/lib/rent-calc-engine'
import type { CostBreakdown } from '@/lib/rent-calc-engine'
import { averageActuals, serialize } from '@/lib/operational-learning-helpers'

// ═══════════════════════════════════════════════════════════════
// 단건 비교 분석 API
//   GET /api/operational-learning/analyze?snapshotId=xxx
//     → analyzeActualVsPredicted(predicted, averageActuals(actuals)) 호출
//     → items[], overall_accuracy, recommendations 반환
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const snapshotId = searchParams.get('snapshotId')
    if (!snapshotId) {
      return NextResponse.json({ error: 'snapshotId 필수' }, { status: 400 })
    }

    // 1. 스냅샷 로드
    const snaps = await prisma.$queryRaw<any[]>`
      SELECT * FROM calc_snapshots WHERE id = ${snapshotId} LIMIT 1
    `
    if (snaps.length === 0) {
      return NextResponse.json({ error: '스냅샷을 찾을 수 없습니다' }, { status: 404 })
    }
    const snap = snaps[0]

    // 2. 실적 로드 (여러 월 합산 평균)
    const actualRows = await prisma.$queryRaw<any[]>`
      SELECT * FROM operational_actuals
      WHERE snapshot_id = ${snapshotId}
      ORDER BY recorded_month ASC
    `

    if (actualRows.length === 0) {
      return NextResponse.json({
        data: {
          snapshot: serialize(snap),
          actuals: [],
          analysis: {
            items: [],
            overall_accuracy: 0,
            recommendations: ['실적 데이터가 없습니다. 실적 입력 후 분석이 가능합니다.'],
          },
        },
        error: null,
      })
    }

    const averaged = averageActuals(actualRows as any[])

    // 3. CostBreakdown 복원 (result_json → CalcResult.breakdown)
    let predicted: CostBreakdown | null = null
    if (snap.result_json) {
      try {
        const result = JSON.parse(snap.result_json)
        predicted = result.breakdown as CostBreakdown
      } catch {
        // fallback: DB 컬럼에서 재구성
      }
    }

    if (!predicted) {
      // 스냅샷 컬럼값으로 최소 breakdown 재구성
      predicted = {
        depreciation: { monthly: Number(snap.predicted_depreciation || 0), total: 0, source: 'db', formula: '' } as any,
        insurance:    { monthly: Number(snap.predicted_insurance || 0), total: 0, source: 'db', formula: '' } as any,
        maintenance:  { monthly: Number(snap.predicted_maintenance || 0), total: 0, source: 'db', formula: '' } as any,
        tax_inspection:{ monthly: Number(snap.predicted_tax || 0), total: 0, source: 'db', formula: '' } as any,
        risk:         { monthly: Number(snap.predicted_accident_cost || 0), total: 0, source: 'db', formula: '' } as any,
        overhead:     { monthly: Number(snap.predicted_overhead || 0), total: 0, source: 'db', formula: '' } as any,
        margin:       { monthly: Number(snap.predicted_margin || 0), total: 0, source: 'db', formula: '' } as any,
        finance:      { monthly: 0, total: 0, source: 'db', formula: '' } as any,
        discount:     { monthly: 0, total: 0, source: 'db', formula: '' } as any,
      } as unknown as CostBreakdown
    }

    const analysis = analyzeActualVsPredicted(predicted, averaged)

    return NextResponse.json({
      data: {
        snapshot: serialize(snap),
        actuals: serialize(actualRows),
        averaged,
        analysis,
      },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

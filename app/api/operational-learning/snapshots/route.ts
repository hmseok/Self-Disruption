import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { serialize } from '@/lib/operational-learning-helpers'

// ═══════════════════════════════════════════════════════════════
// 운영학습 스냅샷 API
//   GET  /api/operational-learning/snapshots
//     - 필터: from, to, vehicle_class, contract_type, quote_id
//   POST /api/operational-learning/snapshots
//     - Quote 저장 직후 프론트엔드에서 호출. body에 CalcResult + input 요약 전달
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const from = searchParams.get('from') // 'YYYY-MM-DD'
    const to = searchParams.get('to')
    const vehicleClass = searchParams.get('vehicle_class')
    const contractType = searchParams.get('contract_type')
    const quoteId = searchParams.get('quote_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 1000)

    const wheres: string[] = []
    const params: any[] = []

    if (from) { wheres.push('snapshot_date >= ?'); params.push(from + ' 00:00:00') }
    if (to) { wheres.push('snapshot_date <= ?'); params.push(to + ' 23:59:59') }
    if (vehicleClass) { wheres.push('vehicle_class = ?'); params.push(vehicleClass) }
    if (contractType) { wheres.push('contract_type = ?'); params.push(contractType) }
    if (quoteId) { wheres.push('quote_id = ?'); params.push(quoteId) }

    const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : ''
    const sql = `SELECT * FROM calc_snapshots ${whereClause} ORDER BY snapshot_date DESC LIMIT ${limit}`

    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
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
    const {
      quote_id, vehicle_id, contract_id,
      purchase_price, term_months, contract_type, annual_mileage, loan_rate, vehicle_class,
      calc_result, // 전체 CalcResult 객체
    } = body

    if (!quote_id) {
      return NextResponse.json({ error: 'quote_id 필수' }, { status: 400 })
    }
    if (!calc_result || !calc_result.breakdown) {
      return NextResponse.json({ error: 'calc_result.breakdown 필수' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    const b = calc_result.breakdown

    const predDep = Math.round(Number(b.depreciation?.monthly || 0))
    const predIns = Math.round(Number(b.insurance?.monthly || 0))
    const predMnt = Math.round(Number(b.maintenance?.monthly || 0))
    const predTax = Math.round(Number(b.tax_inspection?.monthly || 0))
    const predAcc = Math.round(Number(b.risk?.monthly || 0))
    const predOvh = Math.round(Number(b.overhead?.monthly || 0))
    const predMgn = Math.round(Number(b.margin?.monthly || 0))
    const predRnt = Math.round(Number(calc_result.monthly_rent || 0))

    await prisma.$executeRawUnsafe(
      `INSERT INTO calc_snapshots (
        id, quote_id, vehicle_id, contract_id,
        purchase_price, term_months, contract_type, annual_mileage, loan_rate, vehicle_class,
        predicted_depreciation, predicted_insurance, predicted_maintenance,
        predicted_tax, predicted_accident_cost, predicted_overhead,
        predicted_margin, predicted_rent,
        result_json, snapshot_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      id, quote_id, vehicle_id || null, contract_id || null,
      Number(purchase_price || 0), Number(term_months || 36),
      contract_type || 'return', Number(annual_mileage || 20000),
      Number(loan_rate || 0), vehicle_class || 'auto',
      predDep, predIns, predMnt, predTax, predAcc, predOvh, predMgn, predRnt,
      JSON.stringify(calc_result),
    )

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM calc_snapshots WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

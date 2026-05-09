/**
 * GET /api/cafe24/factory-vehicles?factcode=
 *
 * 카페24 ajaoderh — 특정 공장에 배정된 차량 list
 * 응답: [{ car_number, car_model, customer, assigned_date, ... }]
 *
 * PR-6.12.d
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { cafe24Db } from '@/lib/cafe24-db'
import { prisma } from '@/lib/prisma'
import type { RowDataPacket } from 'mysql2'

interface VehicleRow extends RowDataPacket {
  car_number: string | null
  car_model: string | null
  customer: string | null
  assigned_date: string | null
  oderstat: string | null
  oderidno: string | null
  odermddt: string | null
  odersrno: number | null
}

interface EnrichRow {
  car_number: string | null
  product_name: string | null
  cust_name: string | null
  source: string  // 'capital_report' | 'contract'
}

/**
 * product_name → 정산구분 (턴키/실비/?)
 * 키워드 매칭:
 *   Self / 실비 / *Basic(실비정산) → 실비
 *   Platinum / Premium / VIP / Basic / 턴키 → 턴키
 */
function classifySettlement(product: string | null | undefined): '턴키' | '실비' | '?' {
  if (!product) return '?'
  const lower = product.toLowerCase()
  if (lower.includes('실비') || lower.includes('self')) return '실비'
  if (
    lower.includes('platinum') ||
    lower.includes('premium') ||
    lower.includes('vip') ||
    lower.includes('basic') ||
    lower.includes('턴키')
  )
    return '턴키'
  return '?'
}

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
  const factcode = (url.searchParams.get('factcode') || '').trim()
  if (!factcode) {
    return NextResponse.json(
      { success: false, data: [], error: 'factcode 필요' },
      { status: 400 }
    )
  }
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 1),
    5000
  )

  // FULL — pmccarsm + pmccustm join (차량번호 + 차종 + 고객사)
  const FULL_SQL = `
    SELECT c.carsnums  AS car_number,
           c.carsodnm  AS car_model,
           cu.custname AS customer,
           o.odermddt  AS assigned_date,
           o.oderstat,
           o.oderidno, o.odermddt, o.odersrno
      FROM ajaoderh o
      LEFT JOIN pmccarsm c
        ON c.carsidno = o.oderidno
       AND o.odermddt BETWEEN c.carsfrdt AND c.carstodt
      LEFT JOIN pmccustm cu
        ON cu.custcode = c.carscust
     WHERE o.oderfact = ?
       AND o.oderstat <> 'X'
     ORDER BY o.odermddt DESC
     LIMIT ${limit}
  `

  // SIMPLE — ajaoderh 만 (join 회피)
  const SIMPLE_SQL = `
    SELECT NULL AS car_number, NULL AS car_model, NULL AS customer,
           odermddt AS assigned_date, oderstat,
           oderidno, odermddt, odersrno
      FROM ajaoderh
     WHERE oderfact = ?
       AND oderstat <> 'X'
     ORDER BY odermddt DESC
     LIMIT ${limit}
  `

  let rows: VehicleRow[]
  let mode: 'full' | 'simple' | 'empty' = 'full'
  try {
    rows = await cafe24Db.query<VehicleRow>(FULL_SQL, [factcode])
  } catch (e1) {
    console.warn('[factory-vehicles FULL fallback]', (e1 as Error).message)
    try {
      rows = await cafe24Db.query<VehicleRow>(SIMPLE_SQL, [factcode])
      mode = 'simple'
    } catch (e2) {
      console.warn('[factory-vehicles SIMPLE fallback]', (e2 as Error).message)
      rows = []
      mode = 'empty'
    }
  }

  // ── 자체 DB enrichment — car_number → product_name (계약/보고) → 정산구분 ──
  const carNumbers = Array.from(
    new Set(rows.map(r => r.car_number).filter((v): v is string => !!v))
  )
  const enrichByCar = new Map<string, EnrichRow>()
  if (carNumbers.length > 0) {
    try {
      const placeholders = carNumbers.map(() => '?').join(',')
      // ride_contracts (계약상품 우선)
      const contractRows = await prisma.$queryRawUnsafe<EnrichRow[]>(
        `SELECT car_number, contract_product AS product_name, contractor AS cust_name, 'contract' AS source
           FROM ride_contracts
          WHERE car_number IN (${placeholders})`,
        ...carNumbers
      )
      for (const c of contractRows) {
        if (c.car_number) enrichByCar.set(c.car_number, c)
      }
      // ride_capital_reports (계약 없으면 보고의 정비상품)
      const reportRows = await prisma.$queryRawUnsafe<EnrichRow[]>(
        `SELECT car_number, maint_product AS product_name, cust_name, 'capital_report' AS source
           FROM ride_capital_reports
          WHERE car_number IN (${placeholders})
          ORDER BY report_date DESC`,
        ...carNumbers
      )
      for (const r of reportRows) {
        if (r.car_number && !enrichByCar.has(r.car_number)) {
          enrichByCar.set(r.car_number, r)
        }
      }
    } catch (e) {
      console.warn('[factory-vehicles enrichment]', (e as Error).message)
    }
  }

  // 메모리 merge — settlement_type / own_product / own_customer 추가
  const enriched = rows.map(r => {
    const e = r.car_number ? enrichByCar.get(r.car_number) : null
    return {
      ...r,
      own_product: e?.product_name || null,
      own_customer: e?.cust_name || null,
      enrich_source: e?.source || null,
      settlement_type: classifySettlement(e?.product_name),
    }
  })

  return NextResponse.json({
    success: true,
    data: enriched,
    meta: {
      fetched_at: new Date().toISOString(),
      count: enriched.length,
      factcode,
      mode,
      enriched_count: Array.from(enrichByCar.keys()).length,
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// POST /api/admin/migration-backfill
// Supabase → MySQL 마이그레이션 잔여 NULL 필드 일괄 복구용
//
// 현재 지원 작업:
//   - shares_total_amount : settlement_shares.total_amount = Σ items[].amount
//   - cars_mileage        : body.cars = [{ id, mileage }]  수동 지정 복구
//
// body: { op: 'shares_total_amount' } | { op: 'cars_mileage', cars: [...] }
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  try {
    const body = await request.json()
    const op: string = body?.op || ''

    if (op === 'shares_total_amount') {
      // settlement_shares.total_amount 백필
      const rows = await prisma.$queryRaw<Array<{ id: string; items: any }>>`
        SELECT id, items FROM settlement_shares WHERE total_amount IS NULL
      `
      let ok = 0
      let fail = 0
      const errors: string[] = []
      for (const r of rows) {
        try {
          let items: any[] = []
          if (typeof r.items === 'string') {
            try { items = JSON.parse(r.items) } catch { items = [] }
          } else if (Array.isArray(r.items)) {
            items = r.items
          }
          const total = items.reduce((s, it) => s + (Number(it?.amount) || 0), 0)
          if (!Number.isFinite(total) || total <= 0) {
            fail++
            if (errors.length < 10) errors.push(`${r.id}: invalid items sum = ${total}`)
            continue
          }
          const result = await prisma.$executeRaw`
            UPDATE settlement_shares SET total_amount = ${total}, updated_at = NOW() WHERE id = ${r.id}
          `
          if (result > 0) ok++
          else { fail++; if (errors.length < 10) errors.push(`${r.id}: 0 rows affected`) }
        } catch (e: any) {
          fail++
          if (errors.length < 10) errors.push(`${r.id}: ${e.message}`)
        }
      }
      return NextResponse.json({ data: { op, scanned: rows.length, ok, fail, errors }, error: null })
    }

    if (op === 'cars_mileage') {
      const cars: Array<{ id: string | number; mileage: number }> = Array.isArray(body?.cars) ? body.cars : []
      if (cars.length === 0) return NextResponse.json({ error: 'cars 배열 필요' }, { status: 400 })

      let ok = 0
      let fail = 0
      const errors: string[] = []
      for (const c of cars) {
        const m = Number(c.mileage)
        if (!Number.isFinite(m) || m < 0) {
          fail++
          if (errors.length < 10) errors.push(`${c.id}: bad mileage`)
          continue
        }
        try {
          const result = await prisma.$executeRaw`
            UPDATE cars SET mileage = ${m}, updated_at = NOW() WHERE id = ${String(c.id)}
          `
          if (result > 0) ok++
          else { fail++; if (errors.length < 10) errors.push(`${c.id}: 0 rows affected`) }
        } catch (e: any) {
          fail++
          if (errors.length < 10) errors.push(`${c.id}: ${e.message}`)
        }
      }
      return NextResponse.json({ data: { op, total: cars.length, ok, fail, errors }, error: null })
    }

    return NextResponse.json({ error: `unknown op: ${op}` }, { status: 400 })
  } catch (e: any) {
    console.error('[POST /api/admin/migration-backfill]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

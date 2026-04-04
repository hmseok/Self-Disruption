import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/dashboard — All dashboard KPI stats
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const today = new Date().toISOString().split('T')[0]
    const weekLater = new Date()
    weekLater.setDate(weekLater.getDate() + 7)
    const weekLaterStr = weekLater.toISOString().split('T')[0]
    const monthStart = today.substring(0, 7) + '-01'
    const nowMonth = new Date().toISOString().slice(0, 7)
    const [yr, mo] = nowMonth.split('-').map(Number)
    const lastDayOfMonth = new Date(yr, mo, 0).getDate()
    const monthEnd = `${nowMonth}-${String(lastDayOfMonth).padStart(2, '0')}`

    const [
      modulesData, carsData, custCount, investData, jiipCount,
      revenueData, financeData, insuranceData,
      deliveriesData, returnsData,
      maintWaitCount, maintShopCount,
      inspDueCount, inspOverCount, accActiveCount,
      accMonthData, schedData,
    ] = await Promise.all([
      // system_modules
      prisma.$queryRaw<any[]>`SELECT path FROM system_modules WHERE is_active = 1`,
      // cars
      prisma.$queryRaw<any[]>`SELECT id, status FROM cars`,
      // customers count
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as count FROM customers`,
      // investments
      prisma.$queryRaw<any[]>`SELECT invest_amount FROM general_investments`,
      // jiip count
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as count FROM jiip_contracts`,
      // quotes revenue
      prisma.$queryRaw<any[]>`SELECT rent_fee FROM quotes WHERE status = 'active'`,
      // financial products
      prisma.$queryRaw<any[]>`SELECT monthly_payment FROM financial_products`,
      // insurance
      prisma.$queryRaw<any[]>`SELECT total_premium FROM insurance_contracts`,
      // today deliveries
      prisma.$queryRawUnsafe<any[]>(
        `SELECT vo.id, vo.scheduled_date, vo.scheduled_time, vo.status, vo.operation_type,
                c.number as car_number, c.brand as car_brand, c.model as car_model,
                cu.name as customer_name
         FROM vehicle_operations vo
         LEFT JOIN cars c ON vo.car_id = c.id
         LEFT JOIN customers cu ON vo.customer_id = cu.id
         WHERE vo.operation_type = 'delivery' AND vo.scheduled_date = ?
         ORDER BY vo.scheduled_time`,
        today
      ),
      // today returns
      prisma.$queryRawUnsafe<any[]>(
        `SELECT vo.id, vo.scheduled_date, vo.scheduled_time, vo.status, vo.operation_type,
                c.number as car_number, c.brand as car_brand, c.model as car_model,
                cu.name as customer_name
         FROM vehicle_operations vo
         LEFT JOIN cars c ON vo.car_id = c.id
         LEFT JOIN customers cu ON vo.customer_id = cu.id
         WHERE vo.operation_type = 'return' AND vo.scheduled_date = ?
         ORDER BY vo.scheduled_time`,
        today
      ),
      // maintenance waiting
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as count FROM maintenance_records WHERE status IN ('requested', 'approved')`,
      // maintenance in shop
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as count FROM maintenance_records WHERE status = 'in_shop'`,
      // inspections due soon
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as count FROM inspection_records WHERE due_date <= ? AND due_date >= ? AND status IN ('scheduled', 'in_progress')`,
        weekLaterStr, today
      ),
      // inspections overdue
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as count FROM inspection_records WHERE due_date < ? AND status IN ('scheduled', 'in_progress', 'overdue')`,
        today
      ),
      // active accidents
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as count FROM accident_records WHERE status IN ('reported', 'insurance_filed', 'repairing')`,
      // accidents this month
      prisma.$queryRawUnsafe<any[]>(
        `SELECT ar.id, ar.accident_date, ar.accident_type, ar.status,
                c.number as car_number, c.brand as car_brand, c.model as car_model
         FROM accident_records ar
         LEFT JOIN cars c ON ar.car_id = c.id
         WHERE ar.accident_date >= ?
         ORDER BY ar.accident_date DESC LIMIT 3`,
        monthStart
      ),
      // payment schedules
      prisma.$queryRawUnsafe<any[]>(
        `SELECT status, expected_amount, actual_amount, payment_date
         FROM expected_payment_schedules
         WHERE payment_date >= ? AND payment_date <= ?`,
        monthStart, monthEnd
      ),
    ])

    const cars = carsData || []
    const totalInvest = (investData || []).reduce((s: number, i: any) => s + (Number(i.invest_amount) || 0), 0)
    const monthlyRevenue = (revenueData || []).reduce((s: number, q: any) => s + (Number(q.rent_fee) || 0), 0)
    const totalFinance = (financeData || []).reduce((s: number, f: any) => s + (Number(f.monthly_payment) || 0), 0)
    const totalInsurance = (insuranceData || []).reduce((s: number, i: any) => s + Math.round((Number(i.total_premium) || 0) / 12), 0)

    const sched = schedData || []
    const pendingItems = sched.filter((s: any) => s.status === 'pending' && s.payment_date >= today)
    const overdueItems = sched.filter((s: any) => s.status === 'pending' && s.payment_date < today)
    const completedItems = sched.filter((s: any) => s.status === 'completed' || s.status === 'partial')
    const totalExpected = sched.reduce((a: number, s: any) => a + Number(s.expected_amount || 0), 0)
    const totalActual = completedItems.reduce((a: number, s: any) => a + Number(s.actual_amount || s.expected_amount || 0), 0)

    return NextResponse.json({
      data: serialize({
        modules: (modulesData || []).map((m: any) => m.path).filter(Boolean),
        stats: {
          totalCars: cars.length,
          availableCars: cars.filter((c: any) => c.status === 'available').length,
          rentedCars: cars.filter((c: any) => c.status === 'rented').length,
          maintenanceCars: cars.filter((c: any) => c.status === 'maintenance').length,
          totalCustomers: Number((custCount[0] as any)?.count || 0),
          activeInvestments: (investData || []).length,
          totalInvestAmount: totalInvest,
          jiipContracts: Number((jiipCount[0] as any)?.count || 0),
          monthlyRevenue,
          monthlyExpense: totalFinance + totalInsurance,
          netProfit: monthlyRevenue - (totalFinance + totalInsurance),
        },
        opsStats: {
          todayDeliveries: deliveriesData,
          todayReturns: returnsData,
          maintenanceWaiting: Number((maintWaitCount[0] as any)?.count || 0),
          maintenanceInShop: Number((maintShopCount[0] as any)?.count || 0),
          inspectionsDueSoon: Number((inspDueCount[0] as any)?.count || 0),
          inspectionsOverdue: Number((inspOverCount[0] as any)?.count || 0),
          activeAccidents: Number((accActiveCount[0] as any)?.count || 0),
          accidentsThisMonth: accMonthData,
        },
        collectionStats: {
          pendingAmount: pendingItems.reduce((a: number, s: any) => a + Number(s.expected_amount || 0), 0),
          pendingCount: pendingItems.length,
          completedAmount: totalActual,
          completedCount: completedItems.length,
          overdueAmount: overdueItems.reduce((a: number, s: any) => a + Number(s.expected_amount || 0), 0),
          overdueCount: overdueItems.length,
          collectionRate: totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : 0,
        },
      }),
      error: null,
    })
  } catch (e: any) {
    console.error('[GET /api/dashboard]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

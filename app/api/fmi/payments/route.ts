import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ));
}

// ============================================================
// FMI 지급/재무 관리 API (Prisma)
// 외부렌트비, 투자수익, 수리비, 운영비 등 지출 관리
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // 지급 현황 요약
    if (action === 'summary') {
      const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);
      const monthStart = new Date(`${month}-01`);
      const nextMonth = new Date(monthStart);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const [payments, settlements] = await prisma.$transaction([
        prisma.fmiPayment.findMany({
          select: { payment_category: true, amount: true, total_amount: true, payment_status: true },
          where: {
            payment_date: { gte: monthStart, lt: nextMonth },
          },
        }),
        prisma.fmiSettlement.findMany({
          select: { amount: true, settlement_type: true },
          where: {
            payment_date: { gte: monthStart, lt: nextMonth },
          },
        }),
      ]);

      const totalIncome = settlements.reduce((sum, s) => sum + Number(s.amount ?? 0), 0);
      const totalExpense = payments
        .filter(p => p.payment_status === 'paid')
        .reduce((sum, p) => sum + Number(p.total_amount ?? p.amount ?? 0), 0);

      const byCategory: Record<string, number> = {};
      payments.forEach(p => {
        byCategory[p.payment_category] = (byCategory[p.payment_category] || 0)
          + Number(p.total_amount ?? p.amount ?? 0);
      });

      return NextResponse.json({
        data: {
          month,
          total_income: totalIncome,
          total_expense: totalExpense,
          profit: totalIncome - totalExpense,
          by_category: byCategory,
          payment_count: payments.length,
        },
      });
    }

    // 미지급 목록 (지급예정)
    if (action === 'pending') {
      const payments = await prisma.fmiPayment.findMany({
        where: { payment_status: 'pending' },
        orderBy: { due_date: 'asc' },
      });

      const totalPending = payments.reduce(
        (sum, p) => sum + Number(p.total_amount ?? p.amount ?? 0), 0
      );

      return NextResponse.json({ data: serialize(payments), total_pending: totalPending });
    }

    // 투자자별 수익 현황
    if (action === 'investor_summary') {
      const [vehicles, payments] = await prisma.$transaction([
        prisma.fmiVehicle.findMany({
          where: { investor: { not: null } },
          select: {
            investor: true,
            investment_amount: true,
            investment_return_rate: true,
            car_number: true,
            car_type: true,
            status: true,
          },
        }),
        prisma.fmiPayment.findMany({
          where: { payment_category: 'investor_return' },
          select: { payee_name: true, amount: true, payment_date: true, payment_status: true },
        }),
      ]);

      const investors: Record<string, any> = {};
      vehicles.forEach(v => {
        const inv = v.investor!;
        if (!investors[inv]) {
          investors[inv] = { vehicles: [], total_investment: 0, total_paid: 0 };
        }
        investors[inv].vehicles.push({
          car_number: v.car_number,
          car_type: v.car_type,
          status: v.status,
        });
        investors[inv].total_investment += Number(v.investment_amount ?? 0);
      });

      payments
        .filter(p => p.payment_status === 'paid')
        .forEach(p => {
          if (investors[p.payee_name]) {
            investors[p.payee_name].total_paid += Number(p.amount ?? 0);
          }
        });

      return NextResponse.json({ data: serialize(investors) });
    }

    // 지급 목록
    const where: Prisma.FmiPaymentWhereInput = {};
    if (category) where.payment_category = category;
    if (status) where.payment_status = status;
    if (from) where.payment_date = { gte: new Date(from) };
    if (to) {
      where.payment_date = {
        ...(where.payment_date as object),
        lte: new Date(to),
      };
    }

    const [payments, total] = await prisma.$transaction([
      prisma.fmiPayment.findMany({
        where,
        include: {
          vehicle: { select: { car_number: true, car_type: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.fmiPayment.count({ where }),
    ]);

    return NextResponse.json({ data: serialize(payments), total });

  } catch (error: any) {
    console.error('FMI Payments GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ...payload } = body;

    switch (action) {
      // 지급 등록
      case 'create': {
        const totalAmount = (Number(payload.amount) || 0) + (Number(payload.tax_amount) || 0);
        const payment = await prisma.fmiPayment.create({
          data: { ...payload, total_amount: totalAmount },
        });
        return NextResponse.json({ success: true, data: serialize(payment) });
      }

      // 지급 승인
      case 'approve': {
        const { id } = payload;
        const payment = await prisma.fmiPayment.update({
          where: { id },
          data: { payment_status: 'approved' },
        });
        return NextResponse.json({ success: true, data: serialize(payment) });
      }

      // 지급 완료
      case 'pay': {
        const { id, payment_date, payment_method } = payload;
        const payment = await prisma.fmiPayment.update({
          where: { id },
          data: {
            payment_status: 'paid',
            payment_date: payment_date ? new Date(payment_date) : new Date(),
            payment_method,
          },
        });
        return NextResponse.json({ success: true, data: serialize(payment) });
      }

      // 월 렌트비 일괄 생성
      case 'generate_monthly_rent': {
        const { month } = payload; // 'YYYY-MM'

        const vehicles = await prisma.fmiVehicle.findMany({
          where: { ownership_type: 'external_rent', NOT: { status: 'inactive' } },
        });

        if (!vehicles.length) {
          return NextResponse.json({
            success: true,
            message: '외부렌트 차량이 없습니다',
            count: 0,
          });
        }

        const paymentsData = vehicles.map(v => ({
          payment_category: 'external_rent',
          payee_name: v.rental_company || '미지정',
          vehicle_id: v.id,
          amount: v.rental_monthly_cost ?? 0,
          tax_amount: new Prisma.Decimal(0),
          total_amount: v.rental_monthly_cost ?? 0,
          due_date: new Date(`${month}-25`),
          is_recurring: true,
          recurring_period: 'monthly',
          notes: `${month} ${v.car_number} 월 렌트비`,
        }));

        await prisma.fmiPayment.createMany({ data: paymentsData });

        return NextResponse.json({ success: true, count: paymentsData.length });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('FMI Payments POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

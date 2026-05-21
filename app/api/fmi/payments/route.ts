import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { verifyUser } from '@/lib/auth-server';

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
    const user = await verifyUser(req);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
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
    // PR-E4 (2026-05-16) 차량 테이블 통합: fmi_vehicles 폐기 — 투자 차량 정보는
    //   general_investments 가 본체. 현재는 지급(payments) 기준 집계만.
    if (action === 'investor_summary') {
      const payments = await prisma.fmiPayment.findMany({
        where: { payment_category: 'investor_return' },
        select: { payee_name: true, amount: true, payment_date: true, payment_status: true },
      });

      const investors: Record<string, any> = {};
      payments
        .filter(p => p.payment_status === 'paid')
        .forEach(p => {
          if (!investors[p.payee_name]) {
            investors[p.payee_name] = { vehicles: [], total_investment: 0, total_paid: 0 };
          }
          investors[p.payee_name].total_paid += Number(p.amount ?? 0);
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
        // PR-E3 (2026-05-16) 차량 통합: vehicle relation → Car (cars 컬럼 number/brand)
        include: {
          vehicle: { select: { number: true, brand: true } },
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
    const user = await verifyUser(req);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
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
      // PR-E4 (2026-05-16) 차량 테이블 통합: fmi_vehicles 폐기로 비활성.
      //   cars 에 rental_monthly_cost 미존재 — 임차차량 관리 모델 필요 시 별도 재구현.
      case 'generate_monthly_rent': {
        return NextResponse.json({
          success: true,
          count: 0,
          message: '외부렌트 월렌트비 기능은 차량 테이블 통합(PR-E)으로 비활성화되었습니다',
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('FMI Payments POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

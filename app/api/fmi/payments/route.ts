import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================
// FMI 지급/재무 관리 API
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
      const monthStart = `${month}-01`;
      const nextMonth = new Date(monthStart);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const monthEnd = nextMonth.toISOString().split('T')[0];

      const { data: payments } = await supabase
        .from('fmi_payments')
        .select('payment_category, amount, total_amount, payment_status')
        .gte('payment_date', monthStart)
        .lt('payment_date', monthEnd);

      const { data: settlements } = await supabase
        .from('fmi_settlements')
        .select('amount, settlement_type')
        .gte('payment_date', monthStart)
        .lt('payment_date', monthEnd);

      const totalIncome = settlements?.reduce((sum, s) => sum + (s.amount || 0), 0) || 0;
      const totalExpense = payments?.filter(p => p.payment_status === 'paid')
        .reduce((sum, p) => sum + (p.total_amount || p.amount || 0), 0) || 0;

      const byCategory: Record<string, number> = {};
      payments?.forEach(p => {
        const cat = p.payment_category;
        byCategory[cat] = (byCategory[cat] || 0) + (p.total_amount || p.amount || 0);
      });

      return NextResponse.json({
        data: {
          month,
          total_income: totalIncome,
          total_expense: totalExpense,
          profit: totalIncome - totalExpense,
          by_category: byCategory,
          payment_count: payments?.length || 0,
        }
      });
    }

    // 미지급 목록 (지급예정)
    if (action === 'pending') {
      const { data, error } = await supabase
        .from('fmi_payments')
        .select('*')
        .eq('payment_status', 'pending')
        .order('due_date', { ascending: true });

      if (error) throw error;

      const totalPending = data?.reduce((sum, p) => sum + (p.total_amount || p.amount || 0), 0) || 0;

      return NextResponse.json({ data, total_pending: totalPending });
    }

    // 투자자별 수익 현황
    if (action === 'investor_summary') {
      const { data: vehicles } = await supabase
        .from('fmi_vehicles')
        .select('investor, investment_amount, investment_return_rate, car_number, car_type, status')
        .not('investor', 'is', null);

      const { data: payments } = await supabase
        .from('fmi_payments')
        .select('payee_name, amount, payment_date, payment_status')
        .eq('payment_category', 'investor_return');

      const investors: Record<string, any> = {};
      vehicles?.forEach(v => {
        const inv = v.investor!;
        if (!investors[inv]) {
          investors[inv] = { vehicles: [], total_investment: 0, total_paid: 0 };
        }
        investors[inv].vehicles.push({ car_number: v.car_number, car_type: v.car_type, status: v.status });
        investors[inv].total_investment += v.investment_amount || 0;
      });

      payments?.filter(p => p.payment_status === 'paid').forEach(p => {
        if (investors[p.payee_name]) {
          investors[p.payee_name].total_paid += p.amount || 0;
        }
      });

      return NextResponse.json({ data: investors });
    }

    // 지급 목록
    let query = supabase
      .from('fmi_payments')
      .select('*, fmi_vehicles(car_number, car_type)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (category) query = query.eq('payment_category', category);
    if (status) query = query.eq('payment_status', status);
    if (from) query = query.gte('payment_date', from);
    if (to) query = query.lte('payment_date', to);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ data, total: count });

  } catch (error: any) {
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
        const totalAmount = (payload.amount || 0) + (payload.tax_amount || 0);
        const { data, error } = await supabase
          .from('fmi_payments')
          .insert({ ...payload, total_amount: totalAmount })
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      // 지급 승인
      case 'approve': {
        const { id } = payload;
        const { data, error } = await supabase
          .from('fmi_payments')
          .update({ payment_status: 'approved' })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      // 지급 완료
      case 'pay': {
        const { id, payment_date, payment_method } = payload;
        const { data, error } = await supabase
          .from('fmi_payments')
          .update({
            payment_status: 'paid',
            payment_date: payment_date || new Date().toISOString().split('T')[0],
            payment_method,
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      // 월 렌트비 일괄 생성
      case 'generate_monthly_rent': {
        const { month } = payload; // 'YYYY-MM'

        // 외부렌트 차량 조회
        const { data: vehicles } = await supabase
          .from('fmi_vehicles')
          .select('*')
          .eq('ownership_type', 'external_rent')
          .neq('status', 'inactive');

        if (!vehicles?.length) {
          return NextResponse.json({ success: true, message: '외부렌트 차량이 없습니다', count: 0 });
        }

        const payments = vehicles.map(v => ({
          payment_category: 'external_rent',
          payee_name: v.rental_company || '미지정',
          vehicle_id: v.id,
          amount: v.rental_monthly_cost || 0,
          tax_amount: 0,
          total_amount: v.rental_monthly_cost || 0,
          due_date: `${month}-25`, // 매월 25일 지급
          is_recurring: true,
          recurring_period: 'monthly',
          notes: `${month} ${v.car_number} 월 렌트비`,
        }));

        const { data, error } = await supabase
          .from('fmi_payments')
          .insert(payments)
          .select();

        if (error) throw error;
        return NextResponse.json({ success: true, data, count: data?.length });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ============================================================
// FMI 차량 관리 API
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const ownership = searchParams.get('ownership');

    // 차량 상세
    if (action === 'detail' && id) {
      const { data, error } = await supabase
        .from('fmi_vehicles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      // 해당 차량의 대차 이력
      const { data: rentalHistory } = await supabase
        .from('fmi_rentals')
        .select('id, rental_no, customer_name, dispatch_date, actual_return_date, rental_days, total_rental_fee, status')
        .eq('vehicle_id', id)
        .order('dispatch_date', { ascending: false })
        .limit(20);

      return NextResponse.json({ data: { ...data, rental_history: rentalHistory } });
    }

    // 배차 가능 차량 목록
    if (action === 'available') {
      const { data, error } = await supabase
        .from('fmi_vehicles')
        .select('*')
        .eq('status', 'available')
        .order('car_type');

      if (error) throw error;
      return NextResponse.json({ data });
    }

    // 차량 현황 요약
    if (action === 'summary') {
      const { data: vehicles } = await supabase
        .from('fmi_vehicles')
        .select('status, ownership_type');

      const summary = {
        total: vehicles?.length || 0,
        by_status: {} as Record<string, number>,
        by_ownership: {} as Record<string, number>,
      };

      vehicles?.forEach(v => {
        summary.by_status[v.status] = (summary.by_status[v.status] || 0) + 1;
        summary.by_ownership[v.ownership_type] = (summary.by_ownership[v.ownership_type] || 0) + 1;
      });

      return NextResponse.json({ data: summary });
    }

    // 차량 목록
    let query = supabase
      .from('fmi_vehicles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (ownership) query = query.eq('ownership_type', ownership);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ data, total: count });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json();
    const { action, ...payload } = body;

    switch (action) {
      // 차량 등록
      case 'create': {
        const { data, error } = await supabase
          .from('fmi_vehicles')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      // 차량 정보 수정
      case 'update': {
        const { id, ...updateData } = payload;
        const { data, error } = await supabase
          .from('fmi_vehicles')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      // 차량 상태 변경
      case 'change_status': {
        const { id, status: newStatus, notes } = payload;
        const { data, error } = await supabase
          .from('fmi_vehicles')
          .update({ status: newStatus, notes })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      // 차량 비활성화 (폐차/매각)
      case 'deactivate': {
        const { id, reason } = payload;
        const { data, error } = await supabase
          .from('fmi_vehicles')
          .update({ status: 'inactive', notes: reason })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

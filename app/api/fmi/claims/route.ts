import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================
// FMI 보험 청구 관리 API
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';
    const status = searchParams.get('status');
    const insurance = searchParams.get('insurance');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // 청구 현황 요약
    if (action === 'summary') {
      const { data: claims } = await supabase
        .from('fmi_claims')
        .select('status, total_claim_amount, approved_amount');

      const summary = {
        total: claims?.length || 0,
        by_status: {} as Record<string, { count: number; amount: number }>,
        total_claimed: 0,
        total_approved: 0,
        total_pending: 0,
      };

      claims?.forEach(c => {
        if (!summary.by_status[c.status]) {
          summary.by_status[c.status] = { count: 0, amount: 0 };
        }
        summary.by_status[c.status].count++;
        summary.by_status[c.status].amount += c.total_claim_amount || 0;

        summary.total_claimed += c.total_claim_amount || 0;
        summary.total_approved += c.approved_amount || 0;

        if (['sent', 'received', 'under_review'].includes(c.status)) {
          summary.total_pending += c.total_claim_amount || 0;
        }
      });

      return NextResponse.json({ data: summary });
    }

    // 보험사별 청구 현황
    if (action === 'by_insurance') {
      const { data: claims } = await supabase
        .from('fmi_claims')
        .select('insurance_company, status, total_claim_amount, approved_amount');

      const byInsurance: Record<string, { total: number; claimed: number; approved: number; pending: number }> = {};

      claims?.forEach(c => {
        const ins = c.insurance_company || '미지정';
        if (!byInsurance[ins]) {
          byInsurance[ins] = { total: 0, claimed: 0, approved: 0, pending: 0 };
        }
        byInsurance[ins].total++;
        byInsurance[ins].claimed += c.total_claim_amount || 0;
        byInsurance[ins].approved += c.approved_amount || 0;
        if (['sent', 'received', 'under_review'].includes(c.status)) {
          byInsurance[ins].pending += c.total_claim_amount || 0;
        }
      });

      return NextResponse.json({ data: byInsurance });
    }

    // 청구 목록
    let query = supabase
      .from('fmi_claims')
      .select('*, fmi_rentals(rental_no, customer_name, vehicle_car_number, rental_days)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (insurance) query = query.eq('insurance_company', insurance);
    if (from) query = query.gte('claim_date', from);
    if (to) query = query.lte('claim_date', to);

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
      // 청구서 발송 처리
      case 'send': {
        const { claim_id, claim_method, fax_number } = payload;

        const { data, error } = await supabase
          .from('fmi_claims')
          .update({
            status: 'sent',
            claim_method,
            fax_number,
            claim_date: new Date().toISOString(),
            fax_sent_at: claim_method === 'fax' ? new Date().toISOString() : null,
          })
          .eq('id', claim_id)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      // 보험사 응답 등록
      case 'response': {
        const { claim_id, approved_amount, rejected_amount, rejection_reason, negotiation_memo } = payload;

        let newStatus = 'approved';
        if (rejected_amount > 0 && approved_amount > 0) newStatus = 'partial_approved';
        else if (rejected_amount > 0 && !approved_amount) newStatus = 'rejected';

        const { data, error } = await supabase
          .from('fmi_claims')
          .update({
            status: newStatus,
            approved_amount,
            rejected_amount,
            rejection_reason,
            negotiation_memo,
            response_date: new Date().toISOString(),
          })
          .eq('id', claim_id)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      // 재청구
      case 'resubmit': {
        const { claim_id, new_amount, memo } = payload;

        const { data, error } = await supabase
          .from('fmi_claims')
          .update({
            status: 'resubmitted',
            total_claim_amount: new_amount || undefined,
            negotiation_memo: memo,
            claim_date: new Date().toISOString(),
          })
          .eq('id', claim_id)
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

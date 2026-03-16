import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const action = req.nextUrl.searchParams.get('action');

  if (action === 'payment_dates_2026') {
    // Find vehicle_operations with payment dates in 2026
    const { data, error } = await supabase
      .from('vehicle_operations')
      .select('id, car_id, insurance_company_billing, insurance_payment_date, insurance_billing_status, replacement_start_date, replacement_end_date, notes, repair_shop_name')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .gte('insurance_payment_date', '2026-01-01')
      .lte('insurance_payment_date', '2026-12-31')
      .order('insurance_payment_date', { ascending: true });
    return NextResponse.json({ count: data?.length, data, error: error?.message });
  }

  if (action === 'unconnected_transactions') {
    // Find transactions that are income type but not connected to vehicles
    const { data, error } = await supabase
      .from('transactions')
      .select('id, transaction_date, counterpart, description, amount, category, sub_category, related_type, related_id, memo')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .eq('type', 'income')
      .is('related_id', null)
      .order('transaction_date', { ascending: false })
      .limit(50);
    return NextResponse.json({ count: data?.length, data, error: error?.message });
  }

  if (action === 'income_transactions') {
    // Get ALL income transactions for this company
    const { data, error } = await supabase
      .from('transactions')
      .select('id, transaction_date, counterpart, description, amount, category, sub_category, related_type, related_id, memo')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .eq('type', 'income')
      .order('transaction_date', { ascending: false })
      .limit(100);
    return NextResponse.json({ count: data?.length, data, error: error?.message });
  }

  if (action === 'cars') {
    const { data, error } = await supabase
      .from('cars')
      .select('id, number, brand, model')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a');
    return NextResponse.json({ data, error: error?.message });
  }

  if (action === 'update_transaction') {
    const txId = req.nextUrl.searchParams.get('tx_id');
    const carId = req.nextUrl.searchParams.get('car_id');
    if (!txId || !carId) {
      return NextResponse.json({ error: 'tx_id and car_id required' });
    }
    const { data, error } = await supabase
      .from('transactions')
      .update({ related_type: 'car', related_id: carId })
      .eq('id', txId)
      .select();
    return NextResponse.json({ data, error: error?.message });
  }

  if (action === 'all_ops') {
    // Get ALL vehicle_operations for company
    const { data, error } = await supabase
      .from('vehicle_operations')
      .select('id, car_id, insurance_company_billing, insurance_payment_date, insurance_billing_status, replacement_start_date, replacement_end_date, notes, repair_shop_name')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .order('scheduled_date', { ascending: false })
      .limit(500);
    return NextResponse.json({ count: data?.length, data, error: error?.message });
  }

  if (action === 'search_notes') {
    const refs = req.nextUrl.searchParams.get('refs')?.split(',') || [];
    const { data, error } = await supabase
      .from('vehicle_operations')
      .select('id, car_id, insurance_company_billing, insurance_payment_date, replacement_start_date, replacement_end_date, notes, repair_shop_name')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .limit(500);

    if (error) return NextResponse.json({ error: error.message });

    const results: Record<string, any> = {};
    for (const ref of refs) {
      const match = data?.find(rec => rec.notes && rec.notes.includes(ref));
      results[ref] = match || null;
    }
    return NextResponse.json(results);
  }

  if (action === 'find_tables') {
    // Check which tables exist
    const tables = ['classification_queue', 'bank_statements', 'raw_transactions', 'bank_transactions'];
    const results: Record<string, any> = {};
    for (const t of tables) {
      const { data, error } = await supabase.from(t).select('*').limit(1);
      results[t] = { exists: !error, columns: data?.[0] ? Object.keys(data[0]) : [], error: error?.message?.substring(0, 80) };
    }
    return NextResponse.json(results);
  }

  if (action === 'cq_data') {
    const { data, error } = await supabase
      .from('classification_queue')
      .select('*')
      .limit(10);
    return NextResponse.json({ count: data?.length, columns: data?.[0] ? Object.keys(data[0]) : [], data: data?.slice(0, 3), error: error?.message });
  }

  if (action === 'tx_by_amounts') {
    // Find transactions by specific amounts
    const amounts = [631800, 600600, 519920, 878000, 142590, 442810, 1029600, 423300, 607750, 1027190, 1239730, 805560];
    const { data, error } = await supabase
      .from('transactions')
      .select('id, transaction_date, client_name, description, amount, type, category, related_type, related_id, memo')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .in('amount', amounts)
      .order('transaction_date', { ascending: false });
    return NextResponse.json({ count: data?.length, data, error: error?.message });
  }

  if (action === 'tx_recent_income') {
    // Get recent income transactions
    const { data, error } = await supabase
      .from('transactions')
      .select('id, transaction_date, client_name, description, amount, type, category, related_type, related_id')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .eq('type', 'income')
      .gte('transaction_date', '2026-01-01')
      .order('transaction_date', { ascending: false })
      .limit(30);
    return NextResponse.json({ count: data?.length, data, error: error?.message });
  }

  if (action === 'tx_schema') {
    // Get column info for transactions table
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .limit(3);
    return NextResponse.json({
      columns: data?.[0] ? Object.keys(data[0]) : [],
      sample: data?.[0],
      error: error?.message
    });
  }

  if (action === 'tx_insurance') {
    // Find transactions with insurance company client_names
    const { data, error } = await supabase
      .from('transactions')
      .select('id, transaction_date, client_name, description, amount, type, category, related_type, related_id, memo')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .or('client_name.ilike.%삼성%,client_name.ilike.%현대%,client_name.ilike.%메츠%,client_name.ilike.%DB손보%,client_name.ilike.%메리츠%,client_name.ilike.%디비%')
      .order('transaction_date', { ascending: false })
      .limit(30);
    return NextResponse.json({ count: data?.length, data, error: error?.message });
  }

  if (action === 'cq_raw') {
    // Get all car-linked entries and return first one's full data
    const { data, error } = await supabase
      .from('classification_queue')
      .select('*')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .eq('final_matched_type', 'car')
      .limit(1);
    return NextResponse.json({ data: data?.[0], error: error?.message });
  }

  if (action === 'cq_car_linked') {
    const { data, error } = await supabase
      .from('classification_queue')
      .select('id, status, final_matched_type, final_matched_id, source_data, alternatives')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .eq('final_matched_type', 'car')
      .limit(20);
    return NextResponse.json({ count: data?.length, data: data?.map(d => ({id: d.id, type: d.final_matched_type, mid: d.final_matched_id, ai_type: d.ai_matched_type, ai_id: d.ai_matched_id, client: d.alternatives?.source_data?.client_name || d.source_data?.client_name})), error: error?.message });
  }

  if (action === 'cq_insurance') {
    // Find classification_queue entries that are insurance deposits (unclassified income)
    const { data, error } = await supabase
      .from('classification_queue')
      .select('id, status, ai_category, final_matched_type, final_matched_id, transaction_id, source_data, alternatives')
      .eq('company_id', '971784ff-f42c-49cf-a4b5-32ce7883c00a')
      .is('final_matched_id', null)
      .limit(50);
    return NextResponse.json({ count: data?.length, data, error: error?.message });
  }

  if (action === 'update_cq') {
    const cqId = req.nextUrl.searchParams.get('cq_id');
    const carId = req.nextUrl.searchParams.get('car_id');
    if (!cqId || !carId) {
      return NextResponse.json({ error: 'cq_id and car_id required' });
    }
    const { data, error } = await supabase
      .from('classification_queue')
      .update({ final_matched_type: 'car', final_matched_id: carId })
      .eq('id', cqId)
      .select('id, final_matched_type, final_matched_id');
    return NextResponse.json({ data, error: error?.message });
  }

  if (action === 'batch_update_cq') {
    const mappings = req.nextUrl.searchParams.get('mappings')?.split(',') || [];
    const results: any[] = [];
    for (const m of mappings) {
      const [cqId, carId] = m.split(':');
      if (!cqId || !carId) continue;
      const { data, error } = await supabase
        .from('classification_queue')
        .update({
          final_matched_type: 'car',
          final_matched_id: carId,
          ai_matched_type: 'car',
          ai_matched_id: carId
        })
        .eq('id', cqId)
        .select('id, final_matched_type, final_matched_id, ai_matched_type, ai_matched_id');
      results.push({ cqId, carId, data, error: error?.message });
    }
    return NextResponse.json({ results });
  }

  return NextResponse.json({ actions: ['payment_dates_2026', 'all_ops', 'search_notes', 'unconnected_transactions', 'income_transactions', 'cars', 'update_transaction', 'tx_schema', 'tx_insurance', 'cq_insurance', 'update_cq', 'batch_update_cq'] });
}

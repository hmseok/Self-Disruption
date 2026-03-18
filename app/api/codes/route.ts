import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET /api/codes — 코드마스터 조회
// ?group=OTPTSTAT → 특정 그룹
// ?groups=OTPTSTAT,BHNAME,OTPTACBN → 여러 그룹
// (없으면 전체)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const group = searchParams.get('group') || '';
    const groups = searchParams.get('groups') || '';

    let query = supabase
      .from('code_master')
      .select('group_code, group_name, code, label, sort_order, description, source')
      .eq('is_active', true)
      .order('group_code')
      .order('sort_order')
      .order('code');

    if (group) {
      query = query.eq('group_code', group);
    } else if (groups) {
      query = query.in('group_code', groups.split(','));
    }

    const { data, error } = await query;
    if (error) throw error;

    // 그룹별로 정리: { OTPTSTAT: { '1': '접수', '2': '입고' }, ... }
    const codeMap: Record<string, Record<string, string>> = {};
    const groupNames: Record<string, string> = {};

    (data || []).forEach((row: any) => {
      if (!codeMap[row.group_code]) {
        codeMap[row.group_code] = {};
        groupNames[row.group_code] = row.group_name;
      }
      codeMap[row.group_code][row.code] = row.label;
    });

    return NextResponse.json({
      success: true,
      codeMap,
      groupNames,
      raw: data,
    });
  } catch (error: any) {
    console.error('코드마스터 조회 에러:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/codes — 코드 추가/수정
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, data } = body;

    if (action === 'upsert') {
      const { error } = await supabase
        .from('code_master')
        .upsert(data, { onConflict: 'company_id,group_code,code' });
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      const { id } = data;
      const { error } = await supabase
        .from('code_master')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('코드마스터 수정 에러:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

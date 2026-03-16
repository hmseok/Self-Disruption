import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  assignHandler,
  executeAssignment,
  suggestAssignment,
  type AccidentForAssignment,
} from '../lib/assignment-engine'

// ── Supabase Admin
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ============================================
// GET — 배정 현황 조회
// ============================================
// ?action=workload    → 담당자별 워크로드
// ?action=rules       → 배정 룰 목록
// ?action=suggest&id= → 특정 사고건 배정 추천
// ?action=log&id=     → 배정 이력
// ?action=unassigned  → 미배정 건 목록
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'workload'
  const companyId = searchParams.get('company_id')
  const accidentId = searchParams.get('id')

  if (!companyId) {
    return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  switch (action) {
    // ── 담당자별 워크로드
    case 'workload': {
      const { data: handlers } = await supabase
        .from('handler_capacity')
        .select(`
          *,
          handler:profiles!handler_capacity_handler_id_fkey(
            id, employee_name, phone, avatar_url
          )
        `)
        .eq('company_id', companyId)
        .order('created_at')

      if (!handlers) return NextResponse.json({ handlers: [] })

      // 각 담당자의 활성 건 수 조회
      const result = await Promise.all(handlers.map(async (h) => {
        const { count: activeCount } = await supabase
          .from('accident_records')
          .select('id', { count: 'exact', head: true })
          .eq('handler_id', h.handler_id)
          .eq('company_id', companyId)
          .in('status', ['reported', 'insurance_filed', 'repairing'])

        const { count: totalCount } = await supabase
          .from('accident_records')
          .select('id', { count: 'exact', head: true })
          .eq('handler_id', h.handler_id)
          .eq('company_id', companyId)

        return {
          ...h,
          active_count: activeCount || 0,
          total_count: totalCount || 0,
          utilization: ((activeCount || 0) / (h.max_cases || 20) * 100).toFixed(0),
        }
      }))

      return NextResponse.json({ handlers: result })
    }

    // ── 배정 룰 목록
    case 'rules': {
      const { data: rules } = await supabase
        .from('assignment_rules')
        .select(`
          *,
          handler:profiles!assignment_rules_handler_id_fkey(
            id, employee_name
          )
        `)
        .eq('company_id', companyId)
        .order('priority')
        .order('rule_type')

      return NextResponse.json({ rules: rules || [] })
    }

    // ── 배정 추천
    case 'suggest': {
      if (!accidentId) {
        return NextResponse.json({ error: 'id (사고건 ID) 필요' }, { status: 400 })
      }

      const { data: accident } = await supabase
        .from('accident_records')
        .select('*')
        .eq('id', parseInt(accidentId))
        .single()

      if (!accident) {
        return NextResponse.json({ error: '사고건을 찾을 수 없습니다' }, { status: 404 })
      }

      const suggestion = await suggestAssignment(supabase, accident as AccidentForAssignment)
      return NextResponse.json(suggestion)
    }

    // ── 배정 이력
    case 'log': {
      const query = supabase
        .from('assignment_log')
        .select(`
          *,
          handler:profiles!assignment_log_handler_id_fkey(employee_name),
          assigner:profiles!assignment_log_assigned_by_fkey(employee_name)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (accidentId) {
        query.eq('accident_id', parseInt(accidentId))
      }

      const { data: logs } = await query
      return NextResponse.json({ logs: logs || [] })
    }

    // ── 미배정 건 목록
    case 'unassigned': {
      const { data: unassigned } = await supabase
        .from('accident_records')
        .select(`
          id, accident_date, accident_time, accident_location,
          client_name, fault_type, region_sido, region_sigungu,
          driver_name, insurance_company, status, vehicle_condition,
          repair_shop_name, notes,
          car:cars(number, brand, model)
        `)
        .eq('company_id', companyId)
        .is('handler_id', null)
        .in('status', ['reported', 'insurance_filed', 'repairing'])
        .order('accident_date', { ascending: false })

      return NextResponse.json({ accidents: unassigned || [] })
    }

    default:
      return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 })
  }
}

// ============================================
// POST — 수동 배정 / 룰 생성 / 담당자 등록
// ============================================
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action } = body

  const supabase = getSupabaseAdmin()

  switch (action) {
    // ── 수동 배정
    case 'assign': {
      const { accident_id, handler_id, assigned_by } = body

      if (!accident_id || !handler_id) {
        return NextResponse.json({ error: 'accident_id, handler_id 필요' }, { status: 400 })
      }

      const result = await executeAssignment(supabase, accident_id, handler_id, {
        match_type: 'manual',
        matched_rule: '수동 배정',
        is_auto: false,
        assigned_by,
      })

      if (result.success) {
        await supabase.from('accident_records').update({
          assigned_at: new Date().toISOString(),
          assignment_type: 'manual',
          assignment_rule: '수동 배정',
        }).eq('id', accident_id)
      }

      return NextResponse.json(result)
    }

    // ── 배정 룰 생성
    case 'create_rule': {
      const { company_id, rule_type, rule_value, handler_id, priority, description } = body

      if (!company_id || !rule_type || !rule_value || !handler_id) {
        return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('assignment_rules')
        .insert({
          company_id,
          rule_type,
          rule_value,
          handler_id,
          priority: priority || 10,
          description: description || '',
          is_active: true,
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      return NextResponse.json({ rule: data })
    }

    // ── 담당자 등록/수정
    case 'upsert_handler': {
      const { company_id, handler_id, max_cases, is_available, team, speciality, regions } = body

      if (!company_id || !handler_id) {
        return NextResponse.json({ error: 'company_id, handler_id 필요' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('handler_capacity')
        .upsert({
          company_id,
          handler_id,
          max_cases: max_cases || 20,
          is_available: is_available !== false,
          team: team || 'accident',
          speciality: speciality || [],
          regions: regions || [],
        }, { onConflict: 'company_id,handler_id' })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      return NextResponse.json({ handler: data })
    }

    // ── 일괄 자동 배정 (미배정 건 전체)
    case 'auto_assign_all': {
      const { company_id } = body

      const { data: unassigned } = await supabase
        .from('accident_records')
        .select('*')
        .eq('company_id', company_id)
        .is('handler_id', null)
        .in('status', ['reported', 'insurance_filed', 'repairing'])

      if (!unassigned || unassigned.length === 0) {
        return NextResponse.json({ message: '미배정 건 없음', assigned: 0 })
      }

      let assigned = 0
      const results: Array<{ id: number; handler: string | null; rule: string | null }> = []

      for (const acc of unassigned) {
        const result = await assignHandler(supabase, acc as AccidentForAssignment)

        if (result.handler_id) {
          await executeAssignment(supabase, acc.id, result.handler_id, {
            match_type: result.match_type,
            matched_rule: result.matched_rule,
            is_auto: true,
          })

          await supabase.from('accident_records').update({
            assigned_at: new Date().toISOString(),
            assignment_type: 'auto',
            assignment_rule: result.matched_rule,
          }).eq('id', acc.id)

          assigned++
        }

        results.push({
          id: acc.id,
          handler: result.handler_name,
          rule: result.matched_rule,
        })
      }

      return NextResponse.json({ assigned, total: unassigned.length, results })
    }

    default:
      return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 })
  }
}

// ============================================
// PUT — 룰 수정
// ============================================
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('assignment_rules')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ rule: data })
}

// ============================================
// DELETE — 룰 삭제
// ============================================
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { error } = await supabase
    .from('assignment_rules')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

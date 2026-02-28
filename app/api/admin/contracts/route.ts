import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/utils/auth-guard'
import { createClient } from '@supabase/supabase-js'

/**
 * 계약 관리 대시보드 API
 * GET /api/admin/contracts
 *
 * 계약 목록 + 통계 + 필터 + 검색 + 페이지네이션
 * god_admin은 company_id 없이 전체 조회 가능
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id') || ''
    const status = searchParams.get('status') || 'all'
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const sb = createClient(supabaseUrl, supabaseServiceKey)
    const offset = (page - 1) * limit

    // god_admin 여부 확인 (company_id 없이 전체 조회 허용)
    if (!companyId) {
      const { data: profile } = await sb
        .from('profiles')
        .select('role')
        .eq('id', auth.userId)
        .single()
      if (profile?.role !== 'god_admin') {
        return NextResponse.json({ error: 'company_id가 필요합니다.' }, { status: 400 })
      }
    }

    // 1. 통계 조회 (기본 컬럼만 사용 - migration 없이도 동작)
    let statsQuery = sb
      .from('contracts')
      .select('id, status, created_at, end_date')
    if (companyId) statsQuery = statsQuery.eq('company_id', companyId)

    const { data: allContracts, error: statsError } = await statsQuery
    if (statsError) {
      console.error('[admin/contracts] 통계 조회 에러:', statsError.message)
    }

    const stats = {
      total: 0,
      this_month: 0,
      pending_sign: 0,
      active: 0,
      expiring_soon: 0,
    }

    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const todayStr = now.toISOString().split('T')[0]

    if (allContracts) {
      stats.total = allContracts.length
      stats.this_month = allContracts.filter(c => c.created_at >= thisMonthStart).length
      stats.pending_sign = allContracts.filter(c => c.status === 'pending' || c.status === 'draft').length
      stats.active = allContracts.filter(c => c.status === 'active').length
      stats.expiring_soon = allContracts.filter(c =>
        c.status === 'active' && c.end_date && c.end_date <= thirtyDaysLater && c.end_date >= todayStr
      ).length
    }

    // 2. 필터링된 목록 조회 (기본 컬럼만 - contract_pdf_url은 선택적으로 시도)
    let query = sb
      .from('contracts')
      .select('*', { count: 'exact' })
    if (companyId) query = query.eq('company_id', companyId)
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // 상태 필터
    if (status === 'pending') {
      query = query.in('status', ['pending', 'draft'])
    } else if (status === 'active') {
      query = query.eq('status', 'active')
    } else if (status === 'expiring') {
      query = query.eq('status', 'active').lte('end_date', thirtyDaysLater).gte('end_date', todayStr)
    } else if (status === 'ended') {
      query = query.in('status', ['ended', 'completed', 'expired'])
    } else if (status === 'cancelled') {
      query = query.in('status', ['cancelled', 'terminated'])
    }

    // 검색 (고객명 또는 차량번호)
    if (search) {
      query = query.or(`customer_name.ilike.%${search}%`)
    }

    const { data: contracts, count, error } = await query
    if (error) throw error

    // 3. 차량 정보 일괄 조회
    const carIds = [...new Set((contracts || []).filter(c => c.car_id).map(c => c.car_id))]
    let carsMap: Record<string, any> = {}
    if (carIds.length > 0) {
      const { data: cars } = await sb
        .from('cars')
        .select('id, brand, model, trim, number, year, image_url')
        .in('id', carIds)
      if (cars) {
        carsMap = Object.fromEntries(cars.map(c => [c.id, c]))
      }
    }

    // 4. 서명 정보 조회
    const sigIds = [...new Set((contracts || []).filter(c => c.signature_id).map(c => c.signature_id))]
    let sigsMap: Record<string, any> = {}
    if (sigIds.length > 0) {
      const { data: sigs } = await sb
        .from('customer_signatures')
        .select('id, signed_at, customer_name, customer_phone')
        .in('id', sigIds)
      if (sigs) {
        sigsMap = Object.fromEntries(sigs.map(s => [s.id, s]))
      }
    }

    // 5. 응답 조합
    const enrichedContracts = (contracts || []).map(c => ({
      id: c.id,
      quote_id: c.quote_id,
      car_id: c.car_id,
      customer_id: c.customer_id,
      customer_name: c.customer_name || '미지정',
      start_date: c.start_date,
      end_date: c.end_date,
      term_months: c.term_months || 0,
      deposit: c.deposit || 0,
      monthly_rent: c.monthly_rent || 0,
      status: c.status || 'active',
      signature_id: c.signature_id,
      contract_pdf_url: c.contract_pdf_url || null,
      created_at: c.created_at,
      updated_at: c.updated_at,
      company_id: c.company_id,
      car: carsMap[c.car_id] || null,
      signature: sigsMap[c.signature_id] || null,
    }))

    // 상태별 카운트 (필터 탭용)
    const statusCounts = {
      all: stats.total,
      pending: stats.pending_sign,
      active: stats.active,
      expiring: stats.expiring_soon,
      ended: allContracts?.filter(c => ['ended', 'completed', 'expired'].includes(c.status)).length || 0,
      cancelled: allContracts?.filter(c => ['cancelled', 'terminated'].includes(c.status)).length || 0,
    }

    return NextResponse.json({
      contracts: enrichedContracts,
      stats,
      statusCounts,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (e: any) {
    console.error('[admin/contracts] 에러:', e.message)
    return NextResponse.json({ error: '계약 목록 조회 오류: ' + e.message }, { status: 500 })
  }
}

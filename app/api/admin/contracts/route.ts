import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/utils/auth-guard'
import { prisma } from '@/lib/prisma'

/**
 * 계약 관리 대시보드 API
 * GET /api/admin/contracts
 *
 * 계약 목록 + 통계 + 필터 + 검색 + 페이지네이션
 * admin은 company_id 없이 전체 조회 가능
 */

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

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

    const offset = (page - 1) * limit

    // admin 여부 확인
    if (!companyId) {
      const profile = await prisma.$queryRaw<any[]>`
        SELECT role FROM profiles WHERE id = ${auth.userId} LIMIT 1
      `
      if (!profile || profile.length === 0 || profile[0].role !== 'admin') {
        return NextResponse.json({ error: 'company_id가 필요합니다.' }, { status: 400 })
      }
    }

    // 1. 통계 조회
    const allContracts = await prisma.$queryRaw<any[]>`
      SELECT id, status, created_at, end_date FROM contracts
    `

    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const todayStr = now.toISOString().split('T')[0]

    const stats = {
      total: allContracts?.length || 0,
      this_month: allContracts?.filter((c: any) => c.created_at >= thisMonthStart).length || 0,
      pending_sign: allContracts?.filter((c: any) => c.status === 'pending' || c.status === 'draft').length || 0,
      active: allContracts?.filter((c: any) => c.status === 'active').length || 0,
      expiring_soon: allContracts?.filter((c: any) =>
        c.status === 'active' && c.end_date && c.end_date <= thirtyDaysLater && c.end_date >= todayStr
      ).length || 0,
    }

    // 2. 필터링된 목록 조회
    let query = `
      SELECT c.*, COUNT(*) OVER() as total_count FROM contracts c
      WHERE 1=1
    `

    const params: any[] = []

    // 상태 필터
    if (status === 'pending') {
      query += ` AND c.status IN ('pending', 'draft')`
    } else if (status === 'active') {
      query += ` AND c.status = 'active'`
    } else if (status === 'expiring') {
      query += ` AND c.status = 'active' AND c.end_date <= ? AND c.end_date >= ?`
      params.push(thirtyDaysLater, todayStr)
    } else if (status === 'ended') {
      query += ` AND c.status IN ('ended', 'completed', 'expired')`
    } else if (status === 'cancelled') {
      query += ` AND c.status IN ('cancelled', 'terminated')`
    }

    // 검색
    if (search) {
      query += ` AND c.customer_name LIKE ?`
      params.push(`%${search}%`)
    }

    query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const contracts = await prisma.$queryRawUnsafe<any[]>(query, ...params)

    const count = contracts.length > 0 ? contracts[0].total_count : 0

    // 3. 차량 정보 일괄 조회
    const carIds = [...new Set((contracts || []).filter((c: any) => c.car_id).map((c: any) => c.car_id))]
    let carsMap: Record<string, any> = {}
    if (carIds.length > 0) {
      const carsQuery = `SELECT id, brand, model, trim, number, year, image_url FROM cars WHERE id IN (${carIds.map(() => '?').join(',')})`
      const cars = await prisma.$queryRawUnsafe<any[]>(carsQuery, ...carIds)
      if (cars) {
        carsMap = Object.fromEntries(cars.map((c: any) => [c.id, c]))
      }
    }

    // 4. 서명 정보 조회
    const sigIds = [...new Set((contracts || []).filter((c: any) => c.signature_id).map((c: any) => c.signature_id))]
    let sigsMap: Record<string, any> = {}
    if (sigIds.length > 0) {
      const sigsQuery = `SELECT id, signed_at, customer_name, customer_phone FROM customer_signatures WHERE id IN (${sigIds.map(() => '?').join(',')})`
      const sigs = await prisma.$queryRawUnsafe<any[]>(sigsQuery, ...sigIds)
      if (sigs) {
        sigsMap = Object.fromEntries(sigs.map((s: any) => [s.id, s]))
      }
    }

    // 5. 응답 조합
    const enrichedContracts = (contracts || []).map((c: any) => ({
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
      car: carsMap[c.car_id] || null,
      signature: sigsMap[c.signature_id] || null,
    }))

    // 상태별 카운트
    const statusCounts = {
      all: stats.total,
      pending: stats.pending_sign,
      active: stats.active,
      expiring: stats.expiring_soon,
      ended: allContracts?.filter((c: any) => ['ended', 'completed', 'expired'].includes(c.status)).length || 0,
      cancelled: allContracts?.filter((c: any) => ['cancelled', 'terminated'].includes(c.status)).length || 0,
    }

    return NextResponse.json(serialize({
      contracts: enrichedContracts,
      stats,
      statusCounts,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    }))
  } catch (e: any) {
    console.error('[admin/contracts] 에러:', e.message)
    return NextResponse.json({ error: '계약 목록 조회 오류: ' + e.message }, { status: 500 })
  }
}

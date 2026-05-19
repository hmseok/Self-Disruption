/**
 * /api/ride-compliance/annual-plans
 *
 * GET — 연간 관리계획 마스터 list (filter: year/status)
 *       manager+ 권한.
 *
 * POST — 신규 연간계획 등록 (보통 매년 1월 1행 — 시드 외 추가) — manager+
 *
 * 매뉴얼 근거: 별첨 7 RIDE-PLAN-2026-001 + 개인정보보호법 제29조.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager, getOfficerRole } from '@/lib/ride-compliance-perm'
import { randomUUID } from 'crypto'

interface PlanRow {
  id: string
  plan_year: number
  plan_code: string
  title: string
  prepared_by_user_id: string | null
  prepared_by_user_name: string | null
  approved_by_user_id: string | null
  approved_by_user_name: string | null
  approved_at: string | null
  effective_date: string
  scope: string | null
  legal_basis: string | null
  notes: string | null
  status: string
  created_at: string
  updated_at: string
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })

  const role = await getOfficerRole(user)
  const url = new URL(request.url)
  const year = (url.searchParams.get('year') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()

  try {
    const rows = await prisma.$queryRaw<PlanRow[]>`
      SELECT p.id, p.plan_year, p.plan_code, p.title,
             p.prepared_by_user_id, pu.name AS prepared_by_user_name,
             p.approved_by_user_id, au.name AS approved_by_user_name,
             p.approved_at, p.effective_date, p.scope, p.legal_basis, p.notes, p.status,
             p.created_at, p.updated_at
        FROM ride_compliance_annual_plans p
        LEFT JOIN profiles pu ON pu.id = p.prepared_by_user_id
        LEFT JOIN profiles au ON au.id = p.approved_by_user_id
       WHERE (${year} = '' OR p.plan_year = ${year ? parseInt(year, 10) : 0})
         AND (${status} = '' OR p.status = ${status})
       ORDER BY p.plan_year DESC
       LIMIT 50
    `
    return NextResponse.json({
      success: true,
      data: rows,
      meta: { count: rows.length, my_role: role },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true, data: [],
        meta: { _migration_pending: 'phase12', my_role: role },
      })
    }
    console.error('[/api/ride-compliance/annual-plans GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — manager+ only' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const planYear = parseInt(String(body.plan_year || '0'), 10)
  const planCode = String(body.plan_code || '').trim()
  const title = String(body.title || '').trim()
  const effectiveDate = body.effective_date ? String(body.effective_date).trim() : null
  const scope = body.scope ? String(body.scope).trim() : null
  const legalBasis = body.legal_basis ? String(body.legal_basis).trim() : null
  const notes = body.notes ? String(body.notes) : null

  if (!planYear || planYear < 2020 || planYear > 2100) return NextResponse.json({ success: false, error: 'plan_year 유효 범위 외' }, { status: 400 })
  if (!planCode) return NextResponse.json({ success: false, error: 'plan_code 필수' }, { status: 400 })
  if (!title) return NextResponse.json({ success: false, error: 'title 필수' }, { status: 400 })
  if (!effectiveDate) return NextResponse.json({ success: false, error: 'effective_date 필수' }, { status: 400 })

  try {
    const id = randomUUID()
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_annual_plans
        (id, plan_year, plan_code, title, prepared_by_user_id, effective_date, scope, legal_basis, notes, status)
      VALUES
        (${id}, ${planYear}, ${planCode}, ${title}, ${user.id}, ${effectiveDate}, ${scope}, ${legalBasis}, ${notes}, 'active')
    `
    const [row] = await prisma.$queryRaw<PlanRow[]>`
      SELECT p.id, p.plan_year, p.plan_code, p.title,
             p.prepared_by_user_id, pu.name AS prepared_by_user_name,
             p.approved_by_user_id, au.name AS approved_by_user_name,
             p.approved_at, p.effective_date, p.scope, p.legal_basis, p.notes, p.status,
             p.created_at, p.updated_at
        FROM ride_compliance_annual_plans p
        LEFT JOIN profiles pu ON pu.id = p.prepared_by_user_id
        LEFT JOIN profiles au ON au.id = p.approved_by_user_id
       WHERE p.id = ${id} LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: 'plan_year 또는 plan_code 중복' }, { status: 409 })
    }
    console.error('[/api/ride-compliance/annual-plans POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

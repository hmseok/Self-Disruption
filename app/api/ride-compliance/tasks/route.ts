/**
 * /api/ride-compliance/tasks
 *
 * GET  — 월별 task carousel (filter: month/category/status/upcoming_days/q)
 *        manager+ 전체 / handler 는 본인 assignee 만
 * POST — 신규 task 등록 (시드 외 ad-hoc 추가) — manager+
 *
 * 매뉴얼 근거: 통합본 5.17 별첨 7 「2026년 월별 관리 일정」 12개월 carousel.
 *
 * 사용자 추가-B: due_date 임박 시 D-7/D-3/D-day 시각화. 알림 발송 추적 컬럼.
 *               upcoming_days=7 → 향후 7일 이내 due task. =0 → overdue + today.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager, getOfficerRole } from '@/lib/ride-compliance-perm'
import { randomUUID } from 'crypto'

interface TaskRow {
  id: string
  annual_plan_id: string
  task_code: string
  scheduled_month: number
  category: string
  title: string
  description: string | null
  legal_reference: string | null
  related_form_codes: string | null
  assignee_user_id: string | null
  assignee_user_name: string | null
  due_date: string
  reminder_d7_sent: number
  reminder_d3_sent: number
  reminder_dday_sent: number
  status: string
  completed_at: string | null
  completed_by_user_id: string | null
  completed_by_user_name: string | null
  evidence_notes: string | null
  cpo_reviewed_at: string | null
  cpo_review_note: string | null
  plan_code: string | null
  created_at: string
  updated_at: string
}

const CATEGORIES = ['plan', 'education', 'inspection', 'destruction', 'audit', 'processor', 'drill', 'access_review', 'backup_test', 'closing'] as const

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })

  const role = await getOfficerRole(user)
  const isMgr = role === 'cpo' || role === 'manager'

  const url = new URL(request.url)
  const month = (url.searchParams.get('month') || '').trim()
  const category = (url.searchParams.get('category') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()
  const upcomingDaysRaw = url.searchParams.get('upcoming_days')
  const upcomingDays = upcomingDaysRaw ? parseInt(upcomingDaysRaw, 10) : null
  const planYear = url.searchParams.get('plan_year')
  const q = (url.searchParams.get('q') || '').trim()
  const like = q ? `%${q}%` : null

  try {
    const rows = await prisma.$queryRaw<TaskRow[]>`
      SELECT t.id, t.annual_plan_id, t.task_code, t.scheduled_month, t.category,
             t.title, t.description, t.legal_reference, t.related_form_codes,
             t.assignee_user_id, au.name AS assignee_user_name,
             t.due_date,
             t.reminder_d7_sent, t.reminder_d3_sent, t.reminder_dday_sent,
             t.status,
             t.completed_at, t.completed_by_user_id, cu.name AS completed_by_user_name,
             t.evidence_notes, t.cpo_reviewed_at, t.cpo_review_note,
             p.plan_code,
             t.created_at, t.updated_at
        FROM ride_compliance_tasks t
        LEFT JOIN ride_compliance_annual_plans p ON p.id = t.annual_plan_id
        LEFT JOIN profiles au ON au.id = t.assignee_user_id
        LEFT JOIN profiles cu ON cu.id = t.completed_by_user_id
       WHERE (${isMgr ? '__ALL__' : user.id} = '__ALL__' OR t.assignee_user_id = ${user.id})
         AND (${month} = '' OR t.scheduled_month = ${month ? parseInt(month, 10) : 0})
         AND (${category} = '' OR t.category = ${category})
         AND (${status} = '' OR t.status = ${status})
         AND (${planYear ? planYear : ''} = '' OR p.plan_year = ${planYear ? parseInt(planYear, 10) : 0})
         AND (${upcomingDays === null ? -1 : upcomingDays} = -1
              OR (t.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ${upcomingDays === null ? 0 : upcomingDays} DAY)
                  AND t.status IN ('pending','in_progress')))
         AND (${like} IS NULL OR t.title LIKE ${like} OR t.task_code LIKE ${like} OR t.description LIKE ${like})
       ORDER BY t.scheduled_month ASC, t.due_date ASC
       LIMIT 200
    `
    return NextResponse.json({
      success: true,
      data: rows,
      meta: { count: rows.length, my_role: role, filters: { month, category, status, upcoming_days: upcomingDays, plan_year: planYear, q } },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true, data: [],
        meta: { _migration_pending: 'phase12', migration: '2026-05-18_ride_compliance_phase12.sql', my_role: role },
      })
    }
    console.error('[/api/ride-compliance/tasks GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 관리자(manager) 이상만 task 등록 가능' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const annualPlanId = String(body.annual_plan_id || '').trim()
  const scheduledMonth = parseInt(String(body.scheduled_month || '0'), 10)
  const category = String(body.category || '').trim()
  const title = String(body.title || '').trim()
  const description = body.description ? String(body.description) : null
  const legalReference = body.legal_reference ? String(body.legal_reference) : null
  const relatedFormCodes = body.related_form_codes ? String(body.related_form_codes) : null
  const assigneeUserId = body.assignee_user_id ? String(body.assignee_user_id).trim() : null
  const dueDate = body.due_date ? String(body.due_date).trim() : null

  if (!annualPlanId) return NextResponse.json({ success: false, error: 'annual_plan_id 필수' }, { status: 400 })
  if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    return NextResponse.json({ success: false, error: `category 는 ${CATEGORIES.join('/')} 중 하나` }, { status: 400 })
  }
  if (scheduledMonth < 1 || scheduledMonth > 12) return NextResponse.json({ success: false, error: 'scheduled_month 1~12' }, { status: 400 })
  if (!title) return NextResponse.json({ success: false, error: 'title 필수' }, { status: 400 })
  if (!dueDate) return NextResponse.json({ success: false, error: 'due_date 필수 (YYYY-MM-DD)' }, { status: 400 })

  try {
    const year = new Date().getFullYear()
    const prefix = `TASK-${year}-${String(scheduledMonth).padStart(2, '0')}-`
    // 같은 월의 max sequence 찾기 (ad-hoc 추가용 — 시드 12 외 추가 시 -02, -03 등)
    const result = await prisma.$transaction(async (tx) => {
      const seqRows = await tx.$queryRaw<Array<{ max_code: string | null }>>`
        SELECT MAX(task_code) AS max_code FROM ride_compliance_tasks
         WHERE task_code LIKE ${`${prefix}%`}
      `
      let seq = 2  // 시드 1번 이미 존재 가정
      const maxCode = seqRows[0]?.max_code
      if (maxCode && maxCode.startsWith(prefix)) {
        const tail = maxCode.substring(prefix.length)
        const n = parseInt(tail, 10)
        if (!isNaN(n)) seq = n + 1
      } else if (maxCode === null) {
        // 같은 월의 시드 task_code (예: TASK-2026-01) 가 prefix 안 매칭됨
        seq = 2
      }
      // 시드 task_code 는 'TASK-2026-01' (suffix 없음). ad-hoc 는 'TASK-2026-01-02' 형식.
      const taskCode = `${prefix}${String(seq).padStart(2, '0')}`
      const id = randomUUID()
      await tx.$executeRaw`
        INSERT INTO ride_compliance_tasks
          (id, annual_plan_id, task_code, scheduled_month, category, title, description, legal_reference,
           related_form_codes, assignee_user_id, due_date, status)
        VALUES
          (${id}, ${annualPlanId}, ${taskCode}, ${scheduledMonth}, ${category}, ${title}, ${description}, ${legalReference},
           ${relatedFormCodes}, ${assigneeUserId}, ${dueDate}, 'pending')
      `
      return { id, taskCode }
    })

    const [row] = await prisma.$queryRaw<TaskRow[]>`
      SELECT t.id, t.annual_plan_id, t.task_code, t.scheduled_month, t.category,
             t.title, t.description, t.legal_reference, t.related_form_codes,
             t.assignee_user_id, au.name AS assignee_user_name,
             t.due_date,
             t.reminder_d7_sent, t.reminder_d3_sent, t.reminder_dday_sent,
             t.status, t.completed_at, t.completed_by_user_id, cu.name AS completed_by_user_name,
             t.evidence_notes, t.cpo_reviewed_at, t.cpo_review_note,
             p.plan_code, t.created_at, t.updated_at
        FROM ride_compliance_tasks t
        LEFT JOIN ride_compliance_annual_plans p ON p.id = t.annual_plan_id
        LEFT JOIN profiles au ON au.id = t.assignee_user_id
        LEFT JOIN profiles cu ON cu.id = t.completed_by_user_id
       WHERE t.id = ${result.id} LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: 'task_code 중복' }, { status: 409 })
    }
    console.error('[/api/ride-compliance/tasks POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

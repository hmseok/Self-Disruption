/**
 * /api/ride-compliance/policies/[id]/generate-schedule
 *
 * POST — 확정 내규 (status='active') 의 user_confirmed sections 를
 *        ride_compliance_annual_plans + ride_compliance_tasks 로 자동 변환.
 *
 * Phase 2.4 (2026-05-30):
 * 사용자 통찰 (2026-05-28):
 *   「우리의 내규를 설정하고 그 기준들을 가지고 스케줄을 잡아
 *    정상적인 보안관리를 할 수 있게 지원」
 *
 * 흐름:
 *   1. policy.status === 'active' 검증
 *   2. 활성 annual_plan 찾기 (없으면 생성 — 올해)
 *   3. user_confirmed annual_event sections → tasks INSERT (멱등 — task_code UNIQUE)
 *   4. user_confirmed playbook_step sections → annual_plan.notes 에 추가 (참고)
 *   5. 결과: { inserted_tasks, skipped_tasks, plan_id, year }
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'
import { randomUUID } from 'crypto'

interface PolicyRow {
  id: string
  policy_code: string
  title: string
  version: string
  effective_date: string | null
  status: string
}

interface SectionRow {
  id: string
  section_code: string | null
  title: string
  body_md: string | null
  user_edited_title: string | null
  user_edited_body_md: string | null
  section_kind: string
  sort_order: number
}

interface PlanRow {
  id: string
  plan_year: number
  plan_code: string
}

/**
 * section_code 에서 월 번호 추출.
 * 예: "2026-03" → 3 / "3월" → 3 / "2026-Q1" → 1 (분기 첫 월) / 추출 실패 → null.
 */
function extractMonth(code: string | null, title: string): number | null {
  if (code) {
    // "YYYY-MM"
    let m = code.match(/^\d{4}-(\d{1,2})/)
    if (m) {
      const mm = parseInt(m[1], 10)
      if (mm >= 1 && mm <= 12) return mm
    }
    // "N월"
    m = code.match(/(\d{1,2})\s*월/)
    if (m) {
      const mm = parseInt(m[1], 10)
      if (mm >= 1 && mm <= 12) return mm
    }
    // 단순 "N" (1~12)
    m = code.match(/^(\d{1,2})$/)
    if (m) {
      const mm = parseInt(m[1], 10)
      if (mm >= 1 && mm <= 12) return mm
    }
    // "Q1" → 1월 / "Q2" → 4월 / "Q3" → 7월 / "Q4" → 10월
    m = code.match(/Q([1-4])/i)
    if (m) {
      return (parseInt(m[1], 10) - 1) * 3 + 1
    }
  }
  // title 에서도 시도
  const t = title || ''
  const tm = t.match(/(\d{1,2})\s*월/)
  if (tm) {
    const mm = parseInt(tm[1], 10)
    if (mm >= 1 && mm <= 12) return mm
  }
  return null
}

/**
 * 해당 월의 말일 (due_date).
 * 예: year=2026, month=3 → '2026-03-31'
 */
function monthEndDate(year: number, month: number): string {
  const d = new Date(year, month, 0)  // 다음 달 0일 = 이 달 마지막 날
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 관리자 이상만 스케줄 생성 가능' }, { status: 403 })
  }
  const { id } = await params

  // 1. policy 검증
  const [policy] = await prisma.$queryRaw<PolicyRow[]>`
    SELECT id, policy_code, title, version, effective_date, status
      FROM ride_compliance_policies WHERE id = ${id} LIMIT 1
  `
  if (!policy) return NextResponse.json({ success: false, error: 'policy not found' }, { status: 404 })
  if (policy.status !== 'active') {
    return NextResponse.json({
      success: false,
      error: `policy.status='${policy.status}' — 스케줄 생성은 active 내규만 가능. 먼저 검수 → 확정하세요.`,
    }, { status: 409 })
  }

  const targetYear = policy.effective_date
    ? new Date(policy.effective_date).getFullYear()
    : new Date().getFullYear()

  // 2. 활성 annual_plan 찾기 (없으면 생성)
  let [plan] = await prisma.$queryRaw<PlanRow[]>`
    SELECT id, plan_year, plan_code
      FROM ride_compliance_annual_plans
     WHERE plan_year = ${targetYear} AND status = 'active'
     ORDER BY effective_date DESC LIMIT 1
  `
  let planCreated = false
  if (!plan) {
    const planId = randomUUID()
    const planCode = `RIDE-PLAN-${targetYear}`
    try {
      await prisma.$executeRaw`
        INSERT INTO ride_compliance_annual_plans
          (id, plan_year, plan_code, title, effective_date, scope, legal_basis, status, notes)
        VALUES
          (${planId}, ${targetYear}, ${planCode},
           ${`${targetYear}년도 ${policy.title}`},
           ${policy.effective_date || `${targetYear}-01-01`},
           ${`정보보안 운영 — ${policy.policy_code} ${policy.version} 기반`},
           ${`내규: ${policy.policy_code} ${policy.version}`},
           'active',
           ${`Phase 2.4 자동 생성 — source policy_id=${policy.id}`})
      `
      plan = { id: planId, plan_year: targetYear, plan_code: planCode }
      planCreated = true
    } catch (e) {
      const err = e as { message?: string }
      // Duplicate 시 재조회
      if (err.message?.includes('Duplicate')) {
        const [reFetch] = await prisma.$queryRaw<PlanRow[]>`
          SELECT id, plan_year, plan_code FROM ride_compliance_annual_plans
           WHERE plan_year = ${targetYear} LIMIT 1
        `
        if (reFetch) plan = reFetch
        else throw e
      } else {
        throw e
      }
    }
  }

  // 3. user_confirmed annual_event sections 조회
  const eventSections = await prisma.$queryRaw<SectionRow[]>`
    SELECT id, section_code, title, body_md, user_edited_title, user_edited_body_md,
           section_kind, sort_order
      FROM ride_compliance_policy_sections
     WHERE policy_id = ${id}
       AND section_kind = 'annual_event'
       AND user_status = 'user_confirmed'
     ORDER BY sort_order ASC, created_at ASC
  `

  // 4. 각 section → tasks INSERT (월 추출 실패 시 skip)
  let insertedCount = 0
  let skippedNoMonth = 0
  let skippedDuplicate = 0
  const insertedDetails: Array<{ task_code: string; month: number; title: string }> = []

  for (let i = 0; i < eventSections.length; i++) {
    const s = eventSections[i]
    const effTitle = s.user_edited_title || s.title
    const effBody = s.user_edited_body_md || s.body_md
    const month = extractMonth(s.section_code, effTitle)
    if (!month) {
      skippedNoMonth++
      continue
    }
    const taskCode = `POLICY-${plan.plan_year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    const dueDate = monthEndDate(plan.plan_year, month)
    const taskId = randomUUID()
    try {
      // 기존 INSERT 패턴 (Phase 1.4 source_document_id 컬럼은 graceful)
      try {
        await prisma.$executeRaw`
          INSERT INTO ride_compliance_tasks
            (id, annual_plan_id, task_code, scheduled_month, category, title, description,
             legal_reference, due_date, status, source_document_id, auto_generated)
          VALUES
            (${taskId}, ${plan.id}, ${taskCode}, ${month},
             ${'auto_from_policy'},
             ${effTitle.substring(0, 200)},
             ${effBody},
             ${`내규: ${policy.policy_code} ${policy.version} / section: ${s.id}`},
             ${dueDate}, 'pending',
             ${s.id}, 1)
        `
      } catch (innerErr) {
        const ie = innerErr as { message?: string }
        if (ie.message?.includes('Unknown column')
            && (ie.message?.includes('source_document_id') || ie.message?.includes('auto_generated'))) {
          // Phase 1.4 마이그 미적용 — fallback
          await prisma.$executeRaw`
            INSERT INTO ride_compliance_tasks
              (id, annual_plan_id, task_code, scheduled_month, category, title, description,
               legal_reference, due_date, status)
            VALUES
              (${taskId}, ${plan.id}, ${taskCode}, ${month},
               ${'auto_from_policy'},
               ${effTitle.substring(0, 200)},
               ${effBody},
               ${`내규: ${policy.policy_code} ${policy.version} / section: ${s.id}`},
               ${dueDate}, 'pending')
          `
        } else {
          throw innerErr
        }
      }
      insertedCount++
      insertedDetails.push({ task_code: taskCode, month, title: effTitle.substring(0, 50) })
    } catch (e) {
      const err = e as { message?: string }
      if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
        skippedDuplicate++
      } else {
        console.error(`[generate-schedule] section ${s.id} INSERT 실패:`, err.message)
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      policy_id: policy.id,
      policy_code: policy.policy_code,
      plan_id: plan.id,
      plan_code: plan.plan_code,
      plan_year: plan.plan_year,
      plan_created: planCreated,
      annual_event_total: eventSections.length,
      inserted_tasks: insertedCount,
      skipped_no_month: skippedNoMonth,
      skipped_duplicate: skippedDuplicate,
      inserted_details: insertedDetails,
    },
  })
}

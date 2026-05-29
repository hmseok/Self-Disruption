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
 * section_code / title / body 에서 적용 월 배열 추출.
 *
 * 우선순위:
 *   1. section_code 의 "YYYY-MM" / "N월" / "QN" — 단일 월
 *   2. title 의 "N월" — 단일 월
 *   3. body / title 의 빈도 키워드:
 *      · 매월 / 매 월 → [1..12]
 *      · 분기 / 분기별 / 분기 1회 (1·4·7·10월) → [1,4,7,10]
 *      · 반기 / 반기별 (1·7월) → [1,7]
 *      · 연 N회 → N=1: [1] / N=2: [1,7] / N=4: [1,4,7,10]
 *      · 매년 N월 → [N]
 *
 * 추출 실패 → 빈 배열.
 */
function extractMonths(code: string | null, title: string, body: string | null): number[] {
  // 1. section_code 단일 월
  if (code) {
    let m = code.match(/^\d{4}-(\d{1,2})/)
    if (m) {
      const mm = parseInt(m[1], 10)
      if (mm >= 1 && mm <= 12) return [mm]
    }
    m = code.match(/(\d{1,2})\s*월/)
    if (m) {
      const mm = parseInt(m[1], 10)
      if (mm >= 1 && mm <= 12) return [mm]
    }
    m = code.match(/^(\d{1,2})$/)
    if (m) {
      const mm = parseInt(m[1], 10)
      if (mm >= 1 && mm <= 12) return [mm]
    }
    m = code.match(/Q([1-4])/i)
    if (m) return [(parseInt(m[1], 10) - 1) * 3 + 1]
  }

  const t = title || ''
  const b = body || ''
  const combined = `${t}\n${b}`

  // 2. title 의 단일 「N월」 (단 「매년 N월」 / 「연 N회」 패턴 회피)
  const titleM = t.match(/(?<!매년\s*)(?<!연\s*)(\d{1,2})\s*월(?![별간])/)
  if (titleM) {
    const mm = parseInt(titleM[1], 10)
    if (mm >= 1 && mm <= 12) return [mm]
  }

  // 3. 빈도 키워드 (body + title 종합)
  //    가장 광범위한 것부터 검사 — 매월 > 분기 > 반기 > 연 N회 > 매년 N월

  // 매월 / 매 월 / 매월 1회 / 매월 N회 — body 의 「매월」 키워드
  if (/매\s*월|월\s*1회|월\s*N회|월별/.test(combined)) {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  }

  // 분기 / 분기별 / 분기 1회 / 분기 1회(1·4·7·10) — 1·4·7·10월
  if (/분기/.test(combined)) {
    return [1, 4, 7, 10]
  }

  // 반기 / 반기별 — 1·7월
  if (/반기/.test(combined)) {
    return [1, 7]
  }

  // 연 N회 — N에 따라
  const yearlyN = combined.match(/연\s*(\d+)\s*회/)
  if (yearlyN) {
    const n = parseInt(yearlyN[1], 10)
    if (n === 1) return [1]
    if (n === 2) return [1, 7]
    if (n === 3) return [1, 5, 9]
    if (n === 4) return [1, 4, 7, 10]
    if (n === 6) return [1, 3, 5, 7, 9, 11]
    if (n === 12) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    return [1] // 기본 1월
  }

  // 매년 N월 — 명시된 월
  const yearlyMonth = combined.match(/매년\s*(\d{1,2})\s*월/)
  if (yearlyMonth) {
    const mm = parseInt(yearlyMonth[1], 10)
    if (mm >= 1 && mm <= 12) return [mm]
  }

  // 연 1회 변형 — 「연 1회」 / 「연1회」 / 「1년 1회」
  if (/연\s*1\s*회|1\s*년\s*1\s*회|연차/.test(combined)) {
    return [1]
  }

  // 추출 실패
  return []
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
    const months = extractMonths(s.section_code, effTitle, effBody)
    if (months.length === 0) {
      skippedNoMonth++
      continue
    }
    // 각 월별로 task INSERT (멱등 — task_code UNIQUE 로 중복 방지)
    for (const month of months) {
      const taskCode = `POLICY-${plan.plan_year}-${String(month).padStart(2, '0')}-S${String(i + 1).padStart(2, '0')}`
      const dueDate = monthEndDate(plan.plan_year, month)
      const taskId = randomUUID()
      try {
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
          console.error(`[generate-schedule] section ${s.id} month ${month} INSERT 실패:`, err.message)
        }
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

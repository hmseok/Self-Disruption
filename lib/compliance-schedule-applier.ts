/**
 * lib/compliance-schedule-applier.ts
 *
 * Phase 1.4-D — 추출된 액션 → ride_compliance_tasks 자동 INSERT.
 * 사용자 비전 (2026-05-19): "최종 정정 또는 완료 승인이 되면 기준에 따라 적용 스케줄, 스텝별 작동"
 *
 * 호출 시점:
 *   · /api/ride-compliance/documents/[id]/approve POST 안에서 (CPO 승인 직후)
 *
 * 동작:
 *   1. documents.extracted_actions JSON 읽기
 *   2. type='task' 만 골라 frequency·months 따라 task row 자동 INSERT
 *   3. 기존 task 와 중복 (task_code 또는 같은 month+category) 회피
 *   4. tasks.source_document_id + auto_generated=1 추적
 *   5. documents.schedule_applied_at = NOW()
 *
 * Rule 24 멱등: 같은 doc 의 같은 액션은 한 번만 INSERT (UNIQUE task_code).
 */

import { prisma } from './prisma'
import type { ExtractedAction } from './compliance-action-extractor'
import { randomUUID } from 'crypto'

const FREQUENCY_TO_MONTHS: Record<string, number[]> = {
  annual: [1],
  biannual: [5, 10],
  quarterly: [3, 6, 9, 12],
  monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  on_event: [],
}

const VALID_CATEGORIES = ['plan', 'education', 'inspection', 'destruction', 'audit', 'processor', 'drill', 'access_review', 'backup_test', 'closing']

interface ApplyResult {
  document_id: string
  doc_code: string
  total_actions: number
  applied_tasks: number
  skipped_duplicates: number
  skipped_invalid: number
  applied_task_codes: string[]
  errors: string[]
}

/**
 * 매뉴얼 승인 시 추출된 액션을 task 로 변환·INSERT.
 *
 * @param documentId  ride_compliance_documents.id
 * @param userId      승인자 (CPO) 의 user_id
 */
export async function applySchedule(documentId: string, userId: string): Promise<ApplyResult> {
  // 1. 문서 로드
  const docs = await prisma.$queryRaw<Array<{
    id: string
    doc_code: string
    extracted_actions: unknown
    is_master_verified: number
  }>>`
    SELECT id, doc_code, extracted_actions, is_master_verified
      FROM ride_compliance_documents
     WHERE id = ${documentId} LIMIT 1
  `
  if (!docs.length) {
    return { document_id: documentId, doc_code: '?', total_actions: 0, applied_tasks: 0, skipped_duplicates: 0, skipped_invalid: 0, applied_task_codes: [], errors: ['document not found'] }
  }
  const doc = docs[0]

  let actions: ExtractedAction[] = []
  try {
    const parsed = typeof doc.extracted_actions === 'string' ? JSON.parse(doc.extracted_actions) : doc.extracted_actions
    actions = parsed?.actions || []
  } catch {
    actions = []
  }

  const result: ApplyResult = {
    document_id: documentId,
    doc_code: doc.doc_code,
    total_actions: actions.length,
    applied_tasks: 0,
    skipped_duplicates: 0,
    skipped_invalid: 0,
    applied_task_codes: [],
    errors: [],
  }

  // 2. type='task' 만 필터
  const taskActions = actions.filter(a => a.type === 'task')

  // 3. annual_plan_id (2026 기본)
  const plans = await prisma.$queryRaw<Array<{ id: string; plan_year: number }>>`
    SELECT id, plan_year FROM ride_compliance_annual_plans
     WHERE plan_year = 2026 AND status = 'active' LIMIT 1
  `
  if (!plans.length) {
    result.errors.push('2026 active annual plan not found — annual_plans 시드 적용 필요')
    return result
  }
  const planId = plans[0].id
  const year = plans[0].plan_year

  // 4. 각 task action 처리
  for (const action of taskActions) {
    const months = action.months && action.months.length > 0
      ? action.months
      : (action.frequency ? FREQUENCY_TO_MONTHS[action.frequency] : [])

    if (months.length === 0) {
      result.skipped_invalid++
      continue
    }

    const category = action.category && VALID_CATEGORIES.includes(action.category) ? action.category : 'plan'

    for (const month of months) {
      // task_code 생성: TASK-2026-{MM}-{doc_short}-{seq}
      const docShort = doc.doc_code.replace(/[^A-Za-z0-9]/g, '').substring(0, 6)
      const monthStr = String(month).padStart(2, '0')

      try {
        const seqRows = await prisma.$queryRaw<Array<{ max_code: string | null }>>`
          SELECT MAX(task_code) AS max_code FROM ride_compliance_tasks
           WHERE task_code LIKE ${`TASK-${year}-${monthStr}-%`}
        `
        // 신규 seq — 기존 시드 TASK-2026-01 같은 게 있으므로 -10 부터 시작 (충돌 회피)
        let seq = 10
        const maxCode = seqRows[0]?.max_code
        if (maxCode) {
          const m = maxCode.match(new RegExp(`TASK-${year}-${monthStr}-?(\\d*)`))
          if (m && m[1]) {
            const n = parseInt(m[1], 10)
            if (!isNaN(n)) seq = Math.max(seq, n + 1)
          }
        }
        const taskCode = `TASK-${year}-${monthStr}-${docShort}-${String(seq).padStart(2, '0')}`

        // 중복 체크 — 같은 month + category + source_document_id 가 이미 있으면 skip
        const dupRows = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM ride_compliance_tasks
           WHERE scheduled_month = ${month}
             AND category = ${category}
             AND source_document_id = ${documentId}
             AND annual_plan_id = ${planId}
           LIMIT 1
        `
        if (dupRows.length > 0) {
          result.skipped_duplicates++
          continue
        }

        // due_date — 해당 월 마지막 일
        const lastDay = new Date(year, month, 0).getDate()
        const dueDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

        const id = randomUUID()
        const description = action.description?.substring(0, 200) || '(자동 생성)'
        const legalRef = action.legal_reference || null
        const formCodesJson = action.form_codes && action.form_codes.length > 0
          ? JSON.stringify(action.form_codes)
          : null
        const title = `[자동] ${doc.doc_code} · ${action.description?.substring(0, 60) || category}`

        await prisma.$executeRaw`
          INSERT INTO ride_compliance_tasks
            (id, annual_plan_id, task_code, scheduled_month, category,
             title, description, legal_reference, related_form_codes,
             due_date, status, source_document_id, auto_generated)
          VALUES
            (${id}, ${planId}, ${taskCode}, ${month}, ${category},
             ${title}, ${description}, ${legalRef}, ${formCodesJson},
             ${dueDate}, 'pending', ${documentId}, 1)
        `
        result.applied_tasks++
        result.applied_task_codes.push(taskCode)
      } catch (e) {
        const err = e as { message?: string }
        if (err.message?.includes('Duplicate')) {
          result.skipped_duplicates++
        } else {
          result.errors.push(`month=${month} category=${category}: ${err.message}`)
        }
      }
    }
  }

  // 5. documents.schedule_applied_at 갱신
  try {
    void userId  // 향후 created_by 추적용 (현재 사용 X)
    await prisma.$executeRaw`
      UPDATE ride_compliance_documents
         SET schedule_applied_at = NOW(),
             updated_at = NOW()
       WHERE id = ${documentId}
    `
  } catch (e) {
    result.errors.push(`schedule_applied_at 갱신 실패: ${(e as Error).message}`)
  }

  return result
}

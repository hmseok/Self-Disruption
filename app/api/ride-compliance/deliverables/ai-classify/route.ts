/**
 * /api/ride-compliance/deliverables/ai-classify
 *
 * POST — 산출물 본문 텍스트 → AI 분류 (저장 X, 결과만 반환).
 *
 * 입력 body:
 *   { content_text: "...본문 텍스트..." }
 *
 * 출력:
 *   ClassificationResult — UI 가 사용자 검수 후 일괄 POST /deliverables 로 확정.
 *
 * 사이드 효과:
 *   1. 확정 내규 (policies.status='active') 의 user_confirmed playbook_step sections 조회
 *   2. 다음 사용 가능한 code 시퀀스 추론 (해당 카테고리의 최대 시퀀스 + 1)
 *
 * Rule 3 안전망: lib/compliance-deliverable-classifier.ts 의 timeout / 본문 길이 제한.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'
import {
  classifyDeliverable,
  isLlmAvailable,
  DELIVERABLE_CATEGORIES,
  type PlaybookStepHint,
} from '@/lib/compliance-deliverable-classifier'

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 관리자 이상만 AI 분류 가능' }, { status: 403 })
  }
  if (!isLlmAvailable()) {
    return NextResponse.json({ success: false, error: 'GEMINI_API_KEY 미설정' }, { status: 503 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const contentText = String(body.content_text || '').trim()
  if (!contentText || contentText.length < 50) {
    return NextResponse.json({ success: false, error: 'content_text 필수 (50자 이상)' }, { status: 400 })
  }

  // ── 1) 확정 내규의 user_confirmed Playbook sections 조회 ──────
  let playbookHints: PlaybookStepHint[] = []
  try {
    const rows = await prisma.$queryRaw<{ id: string; section_code: string | null; title: string; user_edited_title: string | null }[]>`
      SELECT s.id, s.section_code, s.title, s.user_edited_title
        FROM ride_compliance_policy_sections s
        INNER JOIN ride_compliance_policies p ON p.id = s.policy_id
       WHERE p.status = 'active'
         AND s.section_kind = 'playbook_step'
         AND s.user_status = 'user_confirmed'
       ORDER BY s.sort_order ASC, s.created_at ASC
       LIMIT 30
    `
    playbookHints = rows.map(r => ({
      id: r.id,
      code: r.section_code,
      title: r.user_edited_title || r.title,
    }))
  } catch (e) {
    // 마이그 미적용 / 테이블 없음 — 빈 hints 로 진행 (Playbook 매핑 없음)
    console.warn('[ai-classify] playbook hints 조회 실패 (정상 — Phase 2.0 미적용 환경):', e)
    playbookHints = []
  }

  // ── 2) 임시 코드 시퀀스 힌트 ─────────────────────────────────
  // 본 endpoint 는 분류만 — 실제 시퀀스 확정은 POST /deliverables 시점.
  // 분류 결과의 category 가 정해진 후 카운트.
  // 여기서는 단순히 1 부터 시작 (사용자가 검수 시 수정 가능).
  const year = new Date().getFullYear()
  let codeHint = 1
  try {
    const [{ next_seq }] = await prisma.$queryRaw<{ next_seq: number }[]>`
      SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(deliverable_code, '-', -1) AS UNSIGNED)), 0) + 1 AS next_seq
        FROM ride_compliance_deliverables
       WHERE deliverable_code LIKE ${`%-${year}-%`}
    `
    if (next_seq && next_seq > 0) codeHint = Number(next_seq)
  } catch (e) {
    console.warn('[ai-classify] codeHint 추론 실패:', e)
  }

  // ── 3) Gemini 분류 호출 ─────────────────────────────────────
  let result
  try {
    result = await classifyDeliverable(contentText, codeHint, playbookHints)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ai-classify]', msg)
    return NextResponse.json({ success: false, error: `AI 분류 실패: ${msg}` }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: result,
    meta: {
      playbook_available: playbookHints.length > 0,
      playbook_count: playbookHints.length,
      categories: DELIVERABLE_CATEGORIES,
    },
  })
}

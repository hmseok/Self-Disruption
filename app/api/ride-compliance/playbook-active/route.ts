/**
 * /api/ride-compliance/playbook-active
 *
 * GET — 확정 내규 (status='active') 의 user_confirmed playbook_step sections.
 *       모듈 main page.tsx 의 PLAYBOOK_STEPS const 를 동적으로 대체.
 *
 * Phase 2.1 (2026-05-30):
 *   사용자 통찰 — 「내규에 정해진 운영 가이드」 가 코드 const 가 아니라
 *   사용자가 등록·확정한 내규에서 자동 도출되어야 함.
 *
 * 응답:
 *   { active: false }                           — 확정 내규 없음 (const fallback)
 *   { active: true, policy_id, policy_title,
 *     steps: [{ id, code, title, body }] }      — 확정 내규 + N 단계
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface PlaybookStepRow {
  id: string
  section_code: string | null
  title: string
  body_md: string | null
  user_edited_title: string | null
  user_edited_body_md: string | null
  sort_order: number
  policy_id: string
  policy_title: string
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  try {
    const rows = await prisma.$queryRaw<PlaybookStepRow[]>`
      SELECT s.id, s.section_code, s.title, s.body_md,
             s.user_edited_title, s.user_edited_body_md, s.sort_order,
             p.id AS policy_id, p.title AS policy_title
        FROM ride_compliance_policy_sections s
        INNER JOIN ride_compliance_policies p ON p.id = s.policy_id
       WHERE p.status = 'active'
         AND s.section_kind = 'playbook_step'
         AND s.user_status = 'user_confirmed'
       ORDER BY p.effective_date DESC, s.sort_order ASC, s.created_at ASC
       LIMIT 50
    `

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: { active: false, steps: [] },
        meta: { reason: 'no_confirmed_playbook' },
      })
    }

    // 가장 최근 확정 내규 1개만 (effective_date desc)
    const topPolicyId = rows[0].policy_id
    const sameSteps = rows.filter(r => r.policy_id === topPolicyId)

    return NextResponse.json({
      success: true,
      data: {
        active: true,
        policy_id: topPolicyId,
        policy_title: rows[0].policy_title,
        steps: sameSteps.map((r, idx) => ({
          id: r.id,
          code: r.section_code,
          num: extractStepNum(r.section_code, r.sort_order, idx),
          title: r.user_edited_title || r.title,
          body: r.user_edited_body_md || r.body_md || '',
        })),
      },
      meta: { count: sameSteps.length },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      // 마이그 미적용 — Phase 2.0 / 2.2 환경에서는 동작 X. Graceful fallback.
      return NextResponse.json({
        success: true,
        data: { active: false, steps: [] },
        meta: { _migration_pending: 'phase20', reason: 'tables not found' },
      })
    }
    console.error('[/api/ride-compliance/playbook-active]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

/**
 * section_code 에서 단계 번호 추출.
 * 예: "step-3" → 3 / "1단계" → 1 / 추출 실패 시 sort_order + 1 또는 idx + 1.
 */
function extractStepNum(code: string | null, sortOrder: number, idx: number): number {
  if (code) {
    const m = code.match(/(\d+)/)
    if (m) return parseInt(m[1], 10)
  }
  if (sortOrder > 0) return sortOrder
  return idx + 1
}

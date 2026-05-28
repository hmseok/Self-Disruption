/**
 * /api/ride-compliance/policies/[id]/version-info
 *
 * GET — 내규 버전 정보 + chain + (선택) 이전 버전 diff.
 *
 * Phase 19 (2026-05-31) — 버전 관리.
 *
 * Query params:
 *   ?compare_with={other_policy_id}  → diff 결과 추가 포함
 *
 * 응답:
 *   {
 *     success,
 *     data: {
 *       current: { id, version, effective_date, ... },
 *       chain: [{ id, version, effective_date, status }],  // 역순 (최신 → 과거)
 *       diff?: DiffResult  // compare_with 지정 시
 *     }
 *   }
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { jsonSafe } from '@/lib/json-safe'
import { diffSections, type SectionForDiff } from '@/lib/compliance-version-diff'

interface PolicyRow {
  id: string
  policy_code: string
  title: string
  version: string
  effective_date: string | null
  status: string
  superseded_by_id: string | null
  change_reason: string | null
  change_category: string | null
  announced_at: string | null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  const url = new URL(request.url)
  const compareWith = (url.searchParams.get('compare_with') || '').trim()

  try {
    // 1. current
    const [current] = await prisma.$queryRaw<PolicyRow[]>`
      SELECT id, policy_code, title, version, effective_date, status, superseded_by_id,
             change_reason, change_category, announced_at
        FROM ride_compliance_policies
       WHERE id = ${id} LIMIT 1
    `
    if (!current) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })

    // 2. chain — 같은 policy_code 의 모든 버전 (역순)
    const chain = await prisma.$queryRaw<PolicyRow[]>`
      SELECT id, policy_code, title, version, effective_date, status, superseded_by_id,
             change_reason, change_category, announced_at
        FROM ride_compliance_policies
       WHERE policy_code = ${current.policy_code}
       ORDER BY effective_date DESC, created_at DESC
       LIMIT 50
    `

    // 3. (옵션) diff
    let diffData: ReturnType<typeof diffSections> | null = null
    if (compareWith) {
      const beforeSections = await prisma.$queryRaw<SectionForDiff[]>`
        SELECT id, section_kind, section_code, title, body_md, user_edited_title, user_edited_body_md, user_status
          FROM ride_compliance_policy_sections
         WHERE policy_id = ${compareWith}
      `
      const afterSections = await prisma.$queryRaw<SectionForDiff[]>`
        SELECT id, section_kind, section_code, title, body_md, user_edited_title, user_edited_body_md, user_status
          FROM ride_compliance_policy_sections
         WHERE policy_id = ${id}
      `
      diffData = diffSections(beforeSections, afterSections)
    }

    return NextResponse.json({
      success: true,
      data: jsonSafe({
        current,
        chain,
        diff: diffData,
        compare_with: compareWith || null,
      }),
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/policies/[id]/version-info]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

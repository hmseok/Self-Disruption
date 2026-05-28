/**
 * /api/ride-compliance/policies/at-date/[date]
 *
 * GET — 특정 일자 기준 적용 (active 또는 superseded) 내규 1건 조회.
 *
 * Phase 19 (2026-05-31) — 사용자 통찰:
 *   「내규도 변경될 수 있고 시기에 따른 변화 규정이나 히스토리가 관리도 되어야 한다」
 *
 * 감사·소송 대응 필수 — 「2024-03-15 기준 어떤 내규가 적용됐나?」
 *
 * 매칭 로직:
 *   - effective_date <= 대상일자 인 내규 중
 *   - superseded_by_id 가 null 또는 (해당 새 버전의 effective_date > 대상일자)
 *   - 가장 최근 effective_date 1건
 *
 * 입력: [date] path param — 'YYYY-MM-DD'
 * 응답: { success, data: { policy_id, policy_code, title, version, effective_date, status } }
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { jsonSafe } from '@/lib/json-safe'

interface PolicyRow {
  id: string
  policy_code: string
  title: string
  version: string
  effective_date: string | null
  status: string
  superseded_by_id: string | null
  superseded_by_effective_date: string | null
  superseded_by_version: string | null
}

export async function GET(request: Request, { params }: { params: Promise<{ date: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const { date } = await params

  // YYYY-MM-DD 검증
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, error: 'date 형식 — YYYY-MM-DD' }, { status: 400 })
  }

  try {
    const rows = await prisma.$queryRaw<PolicyRow[]>`
      SELECT p.id, p.policy_code, p.title, p.version, p.effective_date, p.status, p.superseded_by_id,
             sb.effective_date AS superseded_by_effective_date,
             sb.version        AS superseded_by_version
        FROM ride_compliance_policies p
        LEFT JOIN ride_compliance_policies sb ON sb.id = p.superseded_by_id
       WHERE p.status IN ('active', 'superseded')
         AND p.effective_date IS NOT NULL
         AND p.effective_date <= ${date}
         AND (p.superseded_by_id IS NULL
              OR sb.effective_date IS NULL
              OR sb.effective_date > ${date})
       ORDER BY p.effective_date DESC
       LIMIT 1
    `

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        meta: { reason: 'no_active_policy_at_date', date },
      })
    }

    return NextResponse.json({ success: true, data: jsonSafe(rows[0]), meta: { date } })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/policies/at-date]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

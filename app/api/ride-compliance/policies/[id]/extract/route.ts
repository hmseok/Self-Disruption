/**
 * /api/ride-compliance/policies/[id]/extract
 *
 * POST — 내규 본문 텍스트를 받아 chunk 분할 → Gemini 호출 → policy_sections INSERT.
 *
 * 입력 body:
 *   { content_text: "...전체 텍스트..." }  // PPTX/PDF 추출 후 client 가 전달
 *
 * 결과:
 *   - ride_compliance_policy_sections 에 sections 일괄 INSERT (status='ai_draft')
 *   - ride_compliance_policies status='ai_extracted', ai_extracted_at, ai_model, ai_confidence 갱신
 *
 * Rule 3 안전망:
 *   - lib/compliance-policy-extractor.ts 가 chunk 병렬 호출 + dedupe + graceful 처리
 *   - 1 chunk 실패해도 나머지 chunk 결과로 INSERT (debug 에 결과 포함)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'
import { extractPolicyFromText, isLlmAvailable } from '@/lib/compliance-policy-extractor'
import { randomUUID } from 'crypto'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 관리자 이상만 AI 추출 가능' }, { status: 403 })
  }
  if (!isLlmAvailable()) {
    return NextResponse.json({ success: false, error: 'GEMINI_API_KEY 미설정' }, { status: 503 })
  }

  const { id } = await params

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const contentText = String(body.content_text || '').trim()
  if (!contentText || contentText.length < 100) {
    return NextResponse.json({ success: false, error: 'content_text 필수 (100자 이상)' }, { status: 400 })
  }

  // 1. policy 존재 확인
  const [policy] = await prisma.$queryRaw<{ id: string; title: string; status: string }[]>`
    SELECT id, title, status FROM ride_compliance_policies WHERE id = ${id} LIMIT 1
  `
  if (!policy) return NextResponse.json({ success: false, error: 'policy not found' }, { status: 404 })

  // 2. chunk 분할 + Gemini 호출
  let extracted
  try {
    extracted = await extractPolicyFromText(contentText)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[/api/ride-compliance/policies/[id]/extract]', msg)
    return NextResponse.json({ success: false, error: `AI 추출 실패: ${msg}` }, { status: 500 })
  }

  // 3. 기존 ai_draft sections 삭제 (재추출 시) — user_confirmed 는 보존
  try {
    await prisma.$executeRaw`
      DELETE FROM ride_compliance_policy_sections
       WHERE policy_id = ${id}
         AND user_status IN ('ai_draft', 'rejected')
    `
  } catch (e) {
    console.error('[extract] 기존 ai_draft 삭제 실패:', e)
  }

  // 4. 새 sections INSERT
  let insertedCount = 0
  for (let i = 0; i < extracted.sections.length; i++) {
    const s = extracted.sections[i]
    if (!s.title || s.title.trim().length === 0) continue
    if (!['article', 'attachment', 'playbook_step', 'annual_event', 'screen_spec'].includes(s.kind)) continue

    const sid = randomUUID()
    try {
      await prisma.$executeRaw`
        INSERT INTO ride_compliance_policy_sections
          (id, policy_id, section_kind, section_code, title, body_md,
           ai_confidence, ai_raw_excerpt, sort_order, user_status)
        VALUES
          (${sid}, ${id}, ${s.kind}, ${s.code || null}, ${s.title.substring(0, 300)},
           ${s.body || null}, ${s.confidence != null ? Number(s.confidence) : null},
           ${s.raw_excerpt || null}, ${i}, 'ai_draft')
      `
      insertedCount++
    } catch (e) {
      console.error(`[extract] section ${s.kind}/${s.code} INSERT 실패:`, e)
    }
  }

  // 5. policy 메타 갱신
  try {
    await prisma.$executeRaw`
      UPDATE ride_compliance_policies
         SET status            = CASE WHEN status = 'uploaded' THEN 'ai_extracted' ELSE status END,
             ai_extracted_at   = NOW(),
             ai_model          = ${extracted.debug.model},
             ai_confidence     = ${extracted.confidence || null},
             ai_summary_md     = COALESCE(${extracted.summary || null}, ai_summary_md),
             title             = COALESCE(${extracted.policy_title || null}, title),
             version           = CASE WHEN version IN ('', 'v1.0') AND ${extracted.policy_version || null} IS NOT NULL
                                       THEN ${extracted.policy_version || null} ELSE version END,
             ai_raw_response   = ${JSON.stringify(extracted.debug).substring(0, 4_000_000)},
             updated_at        = NOW()
       WHERE id = ${id}
    `
  } catch (e) {
    console.error('[extract] policy 메타 UPDATE 실패:', e)
  }

  return NextResponse.json({
    success: true,
    data: {
      inserted_sections: insertedCount,
      policy_title: extracted.policy_title,
      policy_version: extracted.policy_version,
      summary: extracted.summary,
      confidence: extracted.confidence,
      by_kind: {
        article: extracted.sections.filter(s => s.kind === 'article').length,
        attachment: extracted.sections.filter(s => s.kind === 'attachment').length,
        playbook_step: extracted.sections.filter(s => s.kind === 'playbook_step').length,
        annual_event: extracted.sections.filter(s => s.kind === 'annual_event').length,
      },
      debug: extracted.debug,
    },
  })
}

/**
 * /api/ride-compliance/policies/upload
 *
 * POST (multipart/form-data) — 파일 1개 업로드 → 자동 텍스트 추출 → AI 분석 → policy + sections INSERT.
 *
 * Phase 2.3 (2026-05-28) — 사용자 통찰:
 *   「그냥 파일 등록하면 자동 항목 입력되어야 하는데 사용자 입력 너무 많다」
 *
 * 입력:
 *   FormData {
 *     file: File,                  // PPTX/PDF/DOCX/XLSX/TXT
 *     policy_code?: string,        // 옵션 — 비어있으면 자동 생성
 *   }
 *
 * 처리:
 *   1. 파일 → buffer → officeparser 텍스트 추출
 *   2. lib/compliance-policy-extractor → chunk Gemini → JSON (5 카테고리)
 *   3. ride_compliance_policies INSERT (메타 + AI 추출 결과)
 *   4. ride_compliance_policy_sections INSERT (각 section)
 *   5. response: { policy_id, ... } → UI 가 즉시 검수 모달로 이동
 *
 * 응답:
 *   { success, data: { policy_id, policy_title, sections_count, by_kind, ... } }
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'
import { extractTextFromBuffer, extractExt } from '@/lib/policy-file-extractor'
import { extractPolicyFromText, isLlmAvailable } from '@/lib/compliance-policy-extractor'
import { randomUUID } from 'crypto'

export const maxDuration = 300  // 5분 (큰 PPTX + chunk Gemini)

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 관리자 이상만 등록 가능' }, { status: 403 })
  }
  if (!isLlmAvailable()) {
    return NextResponse.json({ success: false, error: 'GEMINI_API_KEY 미설정' }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'multipart/form-data 필수' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'file 필드 필수 (multipart)' }, { status: 400 })
  }
  const userCode = (formData.get('policy_code') as string || '').trim()

  // 1. 파일 → Buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const ext = extractExt(file.name)

  // 2. 텍스트 추출
  let extracted
  try {
    extracted = await extractTextFromBuffer(buffer, file.name)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, error: `파일 추출 실패: ${msg}` }, { status: 400 })
  }

  if (extracted.text.length < 100) {
    return NextResponse.json({
      success: false,
      error: `추출 텍스트가 너무 짧음 (${extracted.text.length} chars) — 이미지/스캔본 PDF 일 가능성. TXT 또는 텍스트 기반 PDF 권장.`,
    }, { status: 422 })
  }

  // 3. AI 분석 (chunk Gemini)
  let aiResult
  try {
    aiResult = await extractPolicyFromText(extracted.text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[policies/upload] AI 추출 실패:', msg)
    return NextResponse.json({ success: false, error: `AI 분석 실패: ${msg}` }, { status: 500 })
  }

  // 4. policy 메타 결정 (AI 추출값 우선, 없으면 fallback)
  const policyTitle = (aiResult.policy_title || file.name.replace(/\.[^.]+$/, '')).substring(0, 300)
  const policyVersion = aiResult.policy_version || 'v1.0'
  const currentYear = new Date().getFullYear()

  // 5. policy_code 결정
  let policyCode = userCode
  if (!policyCode) {
    // 자동 생성 — 같은 prefix 시퀀스 카운트
    const prefix = `POLICY-${currentYear}`
    try {
      const [{ next_seq }] = await prisma.$queryRaw<{ next_seq: number }[]>`
        SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(policy_code, '-', -1) AS UNSIGNED)), 0) + 1 AS next_seq
          FROM ride_compliance_policies
         WHERE policy_code LIKE ${`${prefix}-%`}
      `
      policyCode = `${prefix}-${String(next_seq || 1).padStart(3, '0')}`
    } catch (e) {
      policyCode = `${prefix}-001`
    }
  }

  // 6. policy INSERT
  const policyId = randomUUID()
  try {
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_policies
        (id, policy_code, title, version,
         source_file_name, source_file_type, file_size_bytes,
         uploaded_at, uploaded_by,
         ai_extracted_at, ai_model, ai_confidence, ai_summary_md, ai_raw_response,
         status)
      VALUES
        (${policyId}, ${policyCode}, ${policyTitle}, ${policyVersion},
         ${file.name}, ${ext}, ${buffer.length},
         NOW(), ${user.id},
         NOW(), ${aiResult.debug.model}, ${aiResult.confidence || null},
         ${aiResult.summary || null}, ${JSON.stringify(aiResult.debug).substring(0, 4_000_000)},
         'ai_extracted')
    `
  } catch (e) {
    const err = e as { message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: `policy_code 중복: ${policyCode}` }, { status: 409 })
    }
    console.error('[policies/upload] policy INSERT 실패:', err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }

  // 7. sections INSERT
  let insertedCount = 0
  for (let i = 0; i < aiResult.sections.length; i++) {
    const s = aiResult.sections[i]
    if (!s.title || s.title.trim().length === 0) continue
    if (!['article', 'attachment', 'playbook_step', 'annual_event', 'screen_spec'].includes(s.kind)) continue
    const sid = randomUUID()
    try {
      await prisma.$executeRaw`
        INSERT INTO ride_compliance_policy_sections
          (id, policy_id, section_kind, section_code, title, body_md,
           ai_confidence, ai_raw_excerpt, sort_order, user_status)
        VALUES
          (${sid}, ${policyId}, ${s.kind}, ${s.code || null},
           ${s.title.substring(0, 300)}, ${s.body || null},
           ${s.confidence != null ? Number(s.confidence) : null},
           ${s.raw_excerpt || null}, ${i}, 'ai_draft')
      `
      insertedCount++
    } catch (e) {
      console.error(`[policies/upload] section ${s.kind}/${s.code} INSERT 실패:`, e)
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      policy_id: policyId,
      policy_code: policyCode,
      policy_title: policyTitle,
      policy_version: policyVersion,
      source_file_name: file.name,
      source_file_type: ext,
      file_size_bytes: buffer.length,
      extracted_text_length: extracted.text.length,
      ai_confidence: aiResult.confidence,
      ai_summary: aiResult.summary,
      sections_inserted: insertedCount,
      by_kind: {
        article: aiResult.sections.filter(s => s.kind === 'article').length,
        attachment: aiResult.sections.filter(s => s.kind === 'attachment').length,
        playbook_step: aiResult.sections.filter(s => s.kind === 'playbook_step').length,
        annual_event: aiResult.sections.filter(s => s.kind === 'annual_event').length,
        screen_spec: aiResult.sections.filter(s => s.kind === 'screen_spec').length,
      },
      warnings: extracted.warnings,
      debug: aiResult.debug,
    },
  })
}

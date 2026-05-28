/**
 * /api/ride-compliance/policies/upload
 *
 * POST (multipart/form-data) — 파일 1개 업로드 → 자동 텍스트 추출 → AI 분석 → INSERT.
 *
 * Phase 2.3 hotfix8 (2026-05-28) — Cloudflare first-byte timeout (~100s) 회피.
 * 사용자 진단: Cloud Run 600s 늘렸지만 Cloudflare 가 앞단에서 컷 → 503.
 *
 * 해결 — Streaming response:
 *   1. 즉시 첫 byte (' ') 보내기 → Cloudflare first-byte timeout 회피
 *   2. 45초마다 keep-alive ' ' 보내기 → idle timeout 회피
 *   3. heavy work 완료 후 JSON 결과 enqueue → controller.close()
 *
 * Client (CreateModal) 는 fetch().then(r => r.json()) 사용 — JSON.parse 가 leading whitespace 무시.
 * Status code 는 항상 200 — success 필드로 client 가 분기.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'
import { extractTextFromBuffer, extractExt } from '@/lib/policy-file-extractor'
import { extractPolicyFromText, isLlmAvailable } from '@/lib/compliance-policy-extractor'
import { randomUUID } from 'crypto'

export const maxDuration = 600  // 10분 (Cloud Run timeout 600s 와 일치)

type UploadResult = { success: boolean; [k: string]: unknown }

export async function POST(request: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // 1. 즉시 첫 byte — Cloudflare first-byte timeout (~100s) 회피
      try { controller.enqueue(encoder.encode(' ')) } catch { /* ignore */ }

      // 2. 45초마다 keep-alive — idle timeout 회피
      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(' ')) } catch { /* ignore */ }
      }, 45_000)

      // 3. heavy work
      let result: UploadResult
      try {
        result = await doUpload(request)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const stack = e instanceof Error && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : null
        console.error('[policies/upload] unhandled:', e)
        result = {
          success: false,
          error: `처리 실패: ${msg}`,
          stage: 'unhandled',
          error_stack: stack,
        }
      }

      // 4. 결과 JSON enqueue + close
      clearInterval(keepAlive)
      try {
        controller.enqueue(encoder.encode(JSON.stringify(result)))
      } catch { /* ignore */ }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

// ════════════════════════════════════════════════════════════════
// heavy work — Response 객체 대신 응답 body 객체 반환 (stream 안에서 호출)
// ════════════════════════════════════════════════════════════════
async function doUpload(request: Request): Promise<UploadResult> {
  const user = await verifyUser(request)
  if (!user) return { success: false, error: 'unauthorized', status: 401 }
  if (!(await isManager(user))) {
    return { success: false, error: 'forbidden — 관리자 이상만 등록 가능', status: 403 }
  }
  if (!isLlmAvailable()) {
    return { success: false, error: 'GEMINI_API_KEY 미설정', status: 503 }
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[policies/upload] formData parse 실패:', msg)
    return { success: false, error: `multipart parse 실패: ${msg}`, stage: 'formData' }
  }

  const file = formData.get('file')
  console.log('[policies/upload] file received:', {
    isFile: file instanceof File,
    type: typeof file,
    name: file && typeof file === 'object' && 'name' in file ? (file as { name: string }).name : null,
    size: file && typeof file === 'object' && 'size' in file ? (file as { size: number }).size : null,
  })
  if (!(file instanceof File)) {
    return { success: false, error: 'file 필드 필수 (multipart) — 파일이 도착하지 않음', stage: 'file_check' }
  }
  const userCode = (formData.get('policy_code') as string || '').trim()

  // 1. 파일 → Buffer
  let buffer: Buffer
  let ext: string
  try {
    const arrayBuffer = await file.arrayBuffer()
    buffer = Buffer.from(arrayBuffer)
    ext = extractExt(file.name)
    console.log(`[policies/upload] buffer ${buffer.length} bytes, ext .${ext}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[policies/upload] buffer 변환 실패:', msg)
    return { success: false, error: `buffer 변환 실패: ${msg}`, stage: 'buffer' }
  }

  // 2. 텍스트 추출 (officeparser — hotfix7: file path + AST.toText)
  let extracted
  try {
    extracted = await extractTextFromBuffer(buffer, file.name)
    console.log(`[policies/upload] extracted ${extracted.text.length} chars, warnings=${extracted.warnings.length}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : null
    console.error('[policies/upload] 텍스트 추출 실패 전체:', e)
    return {
      success: false,
      error: `파일 추출 실패: ${msg}`,
      stage: 'extract',
      file_ext: ext,
      file_size: buffer.length,
      error_stack: stack,
    }
  }

  if (extracted.text.length < 100) {
    return {
      success: false,
      error: `추출 텍스트가 너무 짧음 (${extracted.text.length} chars) — 이미지/스캔본 PDF 일 가능성. TXT 또는 텍스트 기반 PDF 권장.`,
      stage: 'extract_short',
    }
  }

  // 3. AI 분석 (chunk Gemini)
  let aiResult
  try {
    aiResult = await extractPolicyFromText(extracted.text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[policies/upload] AI 추출 실패:', msg)
    return { success: false, error: `AI 분석 실패: ${msg}`, stage: 'ai' }
  }

  // 4. policy 메타 결정
  const policyTitle = (aiResult.policy_title || file.name.replace(/\.[^.]+$/, '')).substring(0, 300)
  const policyVersion = aiResult.policy_version || 'v1.0'
  const currentYear = new Date().getFullYear()

  // 5. policy_code 결정
  let policyCode = userCode
  if (!policyCode) {
    const prefix = `POLICY-${currentYear}`
    try {
      const [{ next_seq }] = await prisma.$queryRaw<{ next_seq: number }[]>`
        SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(policy_code, '-', -1) AS UNSIGNED)), 0) + 1 AS next_seq
          FROM ride_compliance_policies
         WHERE policy_code LIKE ${`${prefix}-%`}
      `
      policyCode = `${prefix}-${String(next_seq || 1).padStart(3, '0')}`
    } catch {
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
      return { success: false, error: `policy_code 중복: ${policyCode}`, stage: 'insert_policy_dup' }
    }
    console.error('[policies/upload] policy INSERT 실패:', err.message)
    return { success: false, error: String(err.message), stage: 'insert_policy' }
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

  return {
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
  }
}

// NextResponse 는 첫 줄 import 만 — streaming 에서는 사용 안 함. 그래도 import 유지 (다른 곳 호환).
void NextResponse

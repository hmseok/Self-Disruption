/**
 * /api/ride-compliance/policies/upload
 *
 * POST (multipart/form-data) — 파일 업로드 + 백그라운드 AI 분석.
 *
 * Phase 2.3 hotfix9 (2026-05-28) — Cloudflare 502 회피 (background job):
 *   streaming response 도 1분 후 Cloudflare 가 끊음 → 비동기 패턴 전환.
 *
 * 흐름:
 *   1. 파일 → 텍스트 추출 (~1초)
 *   2. policies INSERT (status='ai_extracting', AI 메타 NULL)
 *   3. 즉시 `{ success: true, policy_id, status: 'ai_extracting' }` 반환 (~3초)
 *   4. **백그라운드** 에서 AI chunk Gemini 호출 + policies UPDATE + sections INSERT
 *   5. Client 는 GET /policies/[id] polling — status='ai_extracted' 까지 5초마다
 *
 * Cloud Run 의 background promise:
 *   - Request 끝나도 instance 가 cpu_throttling=false 면 promise 계속 실행
 *   - 단, instance 가 scale-down 되면 promise 도 끝남
 *   - 안전 — Cloud Run 설정 `--no-cpu-throttling` 또는 `min-instances=1` 권장
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'
import { extractTextFromBuffer, extractExt } from '@/lib/policy-file-extractor'
import { extractPolicyFromText, isLlmAvailable } from '@/lib/compliance-policy-extractor'
import { randomUUID } from 'crypto'

export const maxDuration = 60  // 즉시 응답 — 60초면 충분

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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, error: `multipart parse 실패: ${msg}`, stage: 'formData' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'file 필드 필수', stage: 'file_check' }, { status: 400 })
  }
  const userCode = (formData.get('policy_code') as string || '').trim()

  // 1. 파일 → Buffer → 텍스트 추출 (synchronous — ~1초)
  let buffer: Buffer
  let ext: string
  try {
    buffer = Buffer.from(await file.arrayBuffer())
    ext = extractExt(file.name)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, error: `buffer 변환 실패: ${msg}`, stage: 'buffer' }, { status: 400 })
  }

  let extracted
  try {
    extracted = await extractTextFromBuffer(buffer, file.name)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : null
    console.error('[policies/upload] 텍스트 추출 실패:', e)
    return NextResponse.json({
      success: false,
      error: `파일 추출 실패: ${msg}`,
      stage: 'extract',
      file_ext: ext, file_size: buffer.length, error_stack: stack,
    }, { status: 400 })
  }

  if (extracted.text.length < 100) {
    return NextResponse.json({
      success: false,
      error: `추출 텍스트가 너무 짧음 (${extracted.text.length} chars)`,
      stage: 'extract_short',
    }, { status: 422 })
  }

  // 2. policy 메타 결정
  const fileTitle = file.name.replace(/\.[^.]+$/, '')
  const policyTitleInitial = fileTitle.substring(0, 300)  // AI 추출 전 임시 (file name)
  const currentYear = new Date().getFullYear()

  let policyCode = userCode
  if (!policyCode) {
    const prefix = `POLICY-${currentYear}`
    try {
      const [{ next_seq }] = await prisma.$queryRaw<{ next_seq: number | bigint }[]>`
        SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(policy_code, '-', -1) AS UNSIGNED)), 0) + 1 AS next_seq
          FROM ride_compliance_policies
         WHERE policy_code LIKE ${`${prefix}-%`}
      `
      policyCode = `${prefix}-${String(Number(next_seq) || 1).padStart(3, '0')}`
    } catch {
      policyCode = `${prefix}-001`
    }
  }

  // 3. policy INSERT (status='ai_extracting' — 즉시 응답 후 백그라운드에서 갱신)
  const policyId = randomUUID()
  try {
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_policies
        (id, policy_code, title, version,
         source_file_name, source_file_type, file_size_bytes,
         uploaded_at, uploaded_by, status)
      VALUES
        (${policyId}, ${policyCode}, ${policyTitleInitial}, 'v1.0',
         ${file.name}, ${ext}, ${buffer.length},
         NOW(), ${user.id}, 'ai_extracting')
    `
  } catch (e) {
    const err = e as { message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: `policy_code 중복: ${policyCode}` }, { status: 409 })
    }
    console.error('[policies/upload] policy INSERT 실패:', err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }

  // 4. AI 분석 시작 — **background, await 안 함**
  //    Cloud Run instance 가 살아있는 동안 promise 끝까지 실행.
  //    instance 가 scale-down 되면 promise 도 끝 — Cloud Run --no-cpu-throttling 권장.
  const aiStartedAt = Date.now()
  console.log(`[policies/upload] policy ${policyId} 즉시 응답 → 백그라운드 AI 분석 시작 (text ${extracted.text.length} chars)`)

  // background promise (no await)
  void (async () => {
    try {
      const aiResult = await extractPolicyFromText(extracted.text)
      const elapsedMs = Date.now() - aiStartedAt

      // policy 갱신
      const policyTitleFinal = (aiResult.policy_title || policyTitleInitial).substring(0, 300)
      const policyVersionFinal = aiResult.policy_version || 'v1.0'
      try {
        await prisma.$executeRaw`
          UPDATE ride_compliance_policies
             SET title           = ${policyTitleFinal},
                 version         = ${policyVersionFinal},
                 ai_extracted_at = NOW(),
                 ai_model        = ${aiResult.debug.model},
                 ai_confidence   = ${aiResult.confidence || null},
                 ai_summary_md   = ${aiResult.summary || null},
                 ai_raw_response = ${JSON.stringify(aiResult.debug).substring(0, 4_000_000)},
                 status          = 'ai_extracted',
                 updated_at      = NOW()
           WHERE id = ${policyId}
        `
      } catch (e) {
        console.error(`[policies/upload BG] policy ${policyId} UPDATE 실패:`, e)
        return
      }

      // sections INSERT
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
          console.error(`[policies/upload BG] section ${s.kind}/${s.code} INSERT 실패:`, e)
        }
      }

      console.log(`[policies/upload BG] policy ${policyId} 완료 — ${insertedCount} sections / ${(elapsedMs / 1000).toFixed(1)}s`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[policies/upload BG] policy ${policyId} AI 실패:`, msg)
      // 실패 시 policy status='ai_failed' 로 갱신
      try {
        await prisma.$executeRaw`
          UPDATE ride_compliance_policies
             SET status         = 'ai_failed',
                 ai_summary_md  = ${`AI 추출 실패: ${msg}`.substring(0, 1000)},
                 updated_at     = NOW()
           WHERE id = ${policyId}
        `
      } catch (e2) {
        console.error(`[policies/upload BG] policy ${policyId} fail UPDATE 실패:`, e2)
      }
    }
  })()

  // 5. 즉시 응답 — Client 가 polling 으로 진행 확인
  return NextResponse.json({
    success: true,
    data: {
      policy_id: policyId,
      policy_code: policyCode,
      policy_title: policyTitleInitial,
      source_file_name: file.name,
      source_file_type: ext,
      file_size_bytes: buffer.length,
      extracted_text_length: extracted.text.length,
      status: 'ai_extracting',
      message: 'AI 분석을 백그라운드에서 시작했습니다. /policies/[id] polling 으로 진행 상황 확인.',
      polling_url: `/api/ride-compliance/policies/${policyId}`,
      polling_interval_ms: 5000,
    },
  })
}

/**
 * /api/ride-compliance/documents/[id]/single-review
 *
 * POST — 매뉴얼·서식 자동 검토 (Phase 1.4-A1 + A2).
 *        1. 법적/보안/품질 lint 14 규칙 자동 실행
 *        2. 액션 자동 추출 (정규식 + LLM 옵션)
 *        3. 결과를 documents.review_results / extracted_actions JSON 컬럼에 저장
 *
 * 권한: manager+ (관리자 이상이 검토 실행).
 *
 * body (옵션):
 *   { use_llm?: boolean }   — true 면 Gemini 호출 (env 미설정 시 정규식만)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'
import { runComplianceLint } from '@/lib/compliance-lint-rules'
import { extractActions } from '@/lib/compliance-action-extractor'
import { extractActionsHybrid, isLlmAvailable } from '@/lib/compliance-llm-extractor'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — manager+ only' }, { status: 403 })
  }

  const params = await context.params
  const id = params?.id
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

  let body: { use_llm?: boolean } = {}
  try { body = await request.json() } catch { /* allow empty body */ }
  const useLlm = body.use_llm !== false  // 기본 true (env 있으면 호출)

  try {
    // 1. 문서 로드
    const docs = await prisma.$queryRaw<Array<{
      id: string
      doc_code: string
      doc_type: string
      title: string
      content_md: string | null
      classification: string
    }>>`
      SELECT id, doc_code, doc_type, title, content_md, classification
        FROM ride_compliance_documents
       WHERE id = ${id} LIMIT 1
    `
    if (!docs.length) return NextResponse.json({ success: false, error: 'document not found' }, { status: 404 })
    const doc = docs[0]

    if (!doc.content_md || doc.content_md.length < 50) {
      return NextResponse.json({
        success: false,
        error: 'content_md 미입력 또는 너무 짧음 — 본문 입력 후 검토 가능',
        meta: { content_length: doc.content_md?.length || 0 },
      }, { status: 400 })
    }

    // 2. Lint 실행 (코드 기반, 즉시)
    const lintResult = runComplianceLint(doc.content_md, {
      doc_code: doc.doc_code,
      doc_type: doc.doc_type,
      classification: doc.classification,
    })

    // 3. 액션 추출 — 정규식 1차
    const regexResult = extractActions(doc.content_md, { doc_code: doc.doc_code, doc_type: doc.doc_type })

    // 4. LLM 2차 (옵션)
    let actionResult = regexResult
    let llmDebug: Record<string, unknown> | undefined
    if (useLlm && isLlmAvailable()) {
      actionResult = await extractActionsHybrid(doc.content_md, doc, regexResult)
      llmDebug = { llm_called: true, total: actionResult.total_actions, engine: actionResult.extraction_method }
    } else {
      llmDebug = { llm_called: false, reason: useLlm ? 'GEMINI_API_KEY 미설정' : 'use_llm=false' }
    }

    // 5. DB 저장 — Phase 1.4-fix1: history 배열로 누적 (사용자 통찰 "재확인·2차 확인" 추적)
    // 기존 review_results 가져와서 history append
    const existing = await prisma.$queryRaw<Array<{ review_results: unknown }>>`
      SELECT review_results FROM ride_compliance_documents WHERE id = ${id} LIMIT 1
    `
    let prevHistory: Array<Record<string, unknown>> = []
    try {
      const prev = typeof existing[0]?.review_results === 'string'
        ? JSON.parse(existing[0].review_results as string)
        : (existing[0]?.review_results as { history?: Array<Record<string, unknown>> } | undefined)
      if (prev?.history && Array.isArray(prev.history)) prevHistory = prev.history
    } catch { /* 첫 검토 또는 schema 변경 — 빈 history 로 시작 */ }

    const newEntry = {
      id: `rev-${Date.now()}`,
      engine: actionResult.extraction_method,
      checked_by: user.id,
      checked_at: new Date().toISOString(),
      score: lintResult.score,
      lint: {
        total_rules: lintResult.total_rules,
        passed: lintResult.passed,
        errors: lintResult.errors,
        warnings: lintResult.warnings,
        infos: lintResult.infos,
        issues: lintResult.issues,
        passed_issues: lintResult.passed_issues,
      },
      action_summary: {
        total: actionResult.total_actions,
        by_type: actionResult.by_type,
      },
      llm_debug: llmDebug,
    }
    // 최신 10건만 보관
    prevHistory.push(newEntry)
    if (prevHistory.length > 10) prevHistory = prevHistory.slice(-10)

    const reviewResultsJson = JSON.stringify({
      latest_id: newEntry.id,
      latest: newEntry,
      history: prevHistory,
    })
    const actionsJson = JSON.stringify(actionResult)

    try {
      await prisma.$executeRaw`
        UPDATE ride_compliance_documents
           SET review_results = ${reviewResultsJson},
               extracted_actions = ${actionsJson},
               last_reviewed_at = NOW(),
               review_score = ${lintResult.score},
               review_engine = ${actionResult.extraction_method},
               updated_at = NOW()
         WHERE id = ${id}
      `
    } catch (e) {
      const err = e as { message?: string }
      if (err.message?.includes('Unknown column')) {
        return NextResponse.json({
          success: true,
          data: { lint: lintResult, actions: actionResult, llm_debug: llmDebug },
          meta: { _migration_pending: 'phase14', migration: '2026-05-19_ride_compliance_phase14.sql' },
        })
      }
      throw e
    }

    return NextResponse.json({
      success: true,
      data: {
        lint: {
          score: lintResult.score,
          total_rules: lintResult.total_rules,
          passed: lintResult.passed,
          errors: lintResult.errors,
          warnings: lintResult.warnings,
          infos: lintResult.infos,
          issues: lintResult.issues,
          passed_issues: lintResult.passed_issues,
        },
        actions: actionResult,
        llm_debug: llmDebug,
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true, data: null,
        meta: { _migration_pending: 'phase14' },
      })
    }
    console.error('[/api/ride-compliance/documents/[id]/single-review POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

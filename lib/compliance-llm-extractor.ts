/**
 * lib/compliance-llm-extractor.ts
 *
 * Phase 1.4-A2 — Gemini LLM 기반 액션 추출 (정규식 보강).
 * 사용자 결단 (2026-05-19, 3+LLM): "정규식 1차 + LLM 2차"
 *
 * Rule 3 외부 LLM 안전망:
 *   [A] 모델 quirk:
 *     · gemini-2.5-flash: thinking 기본 활성 → thinkingConfig: { thinkingBudget: 0 }
 *     · JSON 강제: responseMimeType: 'application/json'
 *     · response parts는 배열로 split 가능 → parts.map(p => p.text).join('')
 *
 *   [B] N=1 dry-run:
 *     · 첫 실행 시 rawTextSample / finishReason / usageMetadata 응답에 포함
 *
 *   [C] 안전망:
 *     · timeout 25초
 *     · 본문 길이 100,000 chars 제한 (Gemini 입력 제약)
 *     · 응답 파싱 실패 시 정규식 결과만 반환
 *     · GEMINI_API_KEY 미설정 시 graceful fallback (정규식 결과 그대로)
 *
 * 호출 방식: 기존 app/api/receipts/ocr/route.ts 와 동일한 REST 직접 호출.
 */

import type { ExtractedAction, ActionExtractionResult } from './compliance-action-extractor'

interface LlmAction {
  type: string
  frequency?: string
  months?: number[]
  category?: string
  description?: string
  form_codes?: string[]
  legal_reference?: string
  responsible?: string
}

interface LlmResponse {
  actions?: LlmAction[]
  summary?: string
}

const MAX_CONTENT_LENGTH = 100_000
const LLM_TIMEOUT_MS = 25_000

/**
 * Gemini 사용 가능 여부 (env 미설정 시 false).
 */
export function isLlmAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY)
}

/**
 * 매뉴얼 본문 → Gemini 액션 추출.
 * 정규식 결과 (regexActions) 와 병합 — LLM 결과가 우선, 정규식이 보완.
 *
 * 실패 시 graceful — 정규식 결과만 반환.
 */
export async function extractActionsWithLlm(
  content: string,
  doc: { doc_code: string; doc_type: string; title: string },
  regexActions: ExtractedAction[]
): Promise<{ actions: ExtractedAction[]; engine: 'regex' | 'llm' | 'hybrid'; debug?: Record<string, unknown> }> {
  // Graceful fallback — env 미설정
  if (!isLlmAvailable()) {
    return { actions: regexActions, engine: 'regex', debug: { reason: 'GEMINI_API_KEY 미설정' } }
  }

  // 본문 길이 제한
  const trimmed = content.length > MAX_CONTENT_LENGTH
    ? content.substring(0, MAX_CONTENT_LENGTH) + '\n\n... (이하 생략 — 본문이 100,000 자 초과)'
    : content

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL_COMPLIANCE || process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const prompt = buildPrompt(doc, trimmed, regexActions)

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      // Rule 3 [A] — gemini-2.5-* thinking off
      thinkingConfig: { thinkingBudget: 0 },
      temperature: 0.1,  // deterministic 한 추출
      maxOutputTokens: 8192,
    },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[LLM] Gemini HTTP error:', res.status, errText.substring(0, 500))
      return { actions: regexActions, engine: 'regex', debug: { reason: `Gemini HTTP ${res.status}`, sample: errText.substring(0, 200) } }
    }

    const json = await res.json()
    // parts 배열 join (Rule 3 [A])
    const parts = json?.candidates?.[0]?.content?.parts || []
    const rawText = parts.map((p: { text?: string }) => p.text || '').join('').trim()
    const finishReason = json?.candidates?.[0]?.finishReason
    const usage = json?.usageMetadata

    let parsed: LlmResponse | null = null
    try {
      parsed = JSON.parse(rawText)
    } catch (parseErr) {
      console.error('[LLM] JSON 파싱 실패:', (parseErr as Error).message, 'rawText:', rawText.substring(0, 500))
      return { actions: regexActions, engine: 'regex', debug: { reason: 'JSON 파싱 실패', rawSample: rawText.substring(0, 500), finishReason } }
    }

    const llmActions = (parsed?.actions || []).map(a => normalizeLlmAction(a)).filter((a): a is ExtractedAction => a !== null)

    // 정규식 + LLM 병합 — LLM 우선, 정규식 중 중복 안 되는 것만 추가
    const merged = mergeActions(llmActions, regexActions)

    return {
      actions: merged,
      engine: 'hybrid',
      debug: {
        llm_count: llmActions.length,
        regex_count: regexActions.length,
        merged_count: merged.length,
        finishReason,
        usage,
        rawSample: rawText.substring(0, 300),
      },
    }
  } catch (e) {
    clearTimeout(timer)
    const err = e as Error
    if (err.name === 'AbortError') {
      return { actions: regexActions, engine: 'regex', debug: { reason: 'LLM timeout 25s' } }
    }
    console.error('[LLM] 호출 오류:', err.message)
    return { actions: regexActions, engine: 'regex', debug: { reason: err.message } }
  }
}

function buildPrompt(
  doc: { doc_code: string; title: string },
  content: string,
  regexHints: ExtractedAction[]
): string {
  const hintsText = regexHints.length > 0
    ? `\n\n## 정규식 1차 추출 결과 (참고용 — 누락된 항목 보완)\n${JSON.stringify(regexHints.slice(0, 10), null, 2)}`
    : ''

  return `당신은 라이드케어의 정보보안 담당 보조 AI 입니다. 매뉴얼 본문에서 운영 액션을 추출하세요.

## 문서 정보
코드: ${doc.doc_code}
제목: ${doc.title}

## 추출 규칙
1. JSON 형식 (마크다운 코드블록·백틱 X) — { "actions": [...], "summary": "..." }
2. action 타입:
   - "task": 주기적 운영 (연/반기/분기/월별)
   - "form": 서식 작성 (F-M01-01 등)
   - "notify": 통지·보고 의무 (24시간·즉시)
   - "policy": 정책 적용 (등급·암호화·접근권한)
3. action 필드:
   - type: 위 4종 중 하나
   - frequency: "annual" | "biannual" | "quarterly" | "monthly" | "on_event"
   - months: 해당 달 (1~12, 배열). annual=[1], biannual=[5,10], quarterly=[3,6,9,12]
   - category: "plan" | "education" | "audit" | "destruction" | "processor" | "inspection" | "drill" | "backup_test" | "access_review" | "closing"
   - description: 80자 이내 요약
   - form_codes: 관련 서식 (예: ["F-M01-01"])
   - legal_reference: 매뉴얼 조항 (예: "제22조")
   - responsible: "CPO" | "관리자" | "취급자" | "관리팀"
4. summary: 본문 전체 운영 흐름 한 문단 (200자 이내)
5. 추출 안 되는 행은 생략 — 추측 금지.

## 본문
${content}
${hintsText}

위 본문에서 actions 배열로 모든 운영 액션을 추출하세요. 동일 액션 중복 없이.`
}

function normalizeLlmAction(a: LlmAction): ExtractedAction | null {
  if (!a.type) return null
  const validTypes = ['task', 'form', 'notify', 'policy']
  if (!validTypes.includes(a.type)) return null

  return {
    type: a.type as ExtractedAction['type'],
    frequency: a.frequency as ExtractedAction['frequency'],
    months: Array.isArray(a.months) ? a.months.filter(m => m >= 1 && m <= 12) : undefined,
    category: a.category,
    description: a.description || '(설명 없음)',
    form_codes: Array.isArray(a.form_codes) ? a.form_codes : undefined,
    legal_reference: a.legal_reference,
    responsible: a.responsible,
    evidence_text: 'LLM 추출',
  }
}

/** LLM 결과 + 정규식 결과 병합 — 중복 제거 (type+category+frequency+description prefix 기준) */
function mergeActions(llm: ExtractedAction[], regex: ExtractedAction[]): ExtractedAction[] {
  const seen = new Set<string>()
  const result: ExtractedAction[] = []
  const key = (a: ExtractedAction) => `${a.type}|${a.category || ''}|${a.frequency || ''}|${(a.description || '').substring(0, 30)}`

  // LLM 결과 먼저 (우선)
  for (const a of llm) {
    const k = key(a)
    if (!seen.has(k)) {
      seen.add(k)
      result.push(a)
    }
  }
  // 정규식 결과 중 중복 안 되는 것만 추가
  for (const a of regex) {
    const k = key(a)
    if (!seen.has(k)) {
      seen.add(k)
      result.push(a)
    }
  }
  return result
}

/**
 * 정규식 ActionExtractionResult + LLM 호출 → 최종 결과.
 * 호출 측에서 이 함수만 부르면 됨.
 */
export async function extractActionsHybrid(
  content: string,
  doc: { doc_code: string; doc_type: string; title: string },
  regexResult: ActionExtractionResult
): Promise<ActionExtractionResult> {
  const llmRes = await extractActionsWithLlm(content, doc, regexResult.actions)

  const byType: Record<string, number> = {}
  for (const a of llmRes.actions) {
    byType[a.type] = (byType[a.type] || 0) + 1
  }

  return {
    doc_code: doc.doc_code,
    total_actions: llmRes.actions.length,
    by_type: byType,
    actions: llmRes.actions,
    extracted_at: new Date().toISOString(),
    extraction_method: llmRes.engine as ActionExtractionResult['extraction_method'],
  }
}

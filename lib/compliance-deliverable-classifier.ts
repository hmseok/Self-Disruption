/**
 * lib/compliance-deliverable-classifier.ts
 *
 * Phase 2.2 — 산출물(deliverable) AI 분류 helper.
 *
 * 입력: 단일 산출물 본문 텍스트 (PDF/DOCX/PPTX 추출)
 * 출력: 카테고리 + 코드 제안 + 제목 + 요약 + Playbook step 매핑 + confidence
 *
 * Rule 3 외부 LLM 안전망:
 *   [A] gemini-2.5-flash, thinkingBudget: 0, responseMimeType: 'application/json'
 *   [B] 사용자 검수 의무 (저장 X — 분류 결과만 반환)
 *   [C] timeout 25s, 본문 30,000 chars 제한 (단일 산출물은 짧으므로)
 *
 * 사용자 결정 (2026-05-28):
 *   Q1 Playbook 9단계 매핑 — 확정 내규의 user_confirmed playbook_step sections 활용
 *   Q2 deliverable_code 자동 — 카테고리 prefix + 시퀀스 제안
 *   Q4 confidence — 분류 결과에 포함, UI 표시
 */

const MODEL = 'gemini-2.5-flash'
const MAX_CONTENT = 30_000
const TIMEOUT_MS = 25_000
const MAX_OUTPUT_TOKENS = 4096

export const DELIVERABLE_CATEGORIES = [
  { key: 'appointment',        label: '임명장',          code_prefix: 'APT' },
  { key: 'device_logbook',     label: '단말기 반출대장', code_prefix: 'DEV' },
  { key: 'destruction_cert',   label: '파기 확인서',     code_prefix: 'DST' },
  { key: 'breach_notice',      label: '유출 통지서',     code_prefix: 'BRC' },
  { key: 'audit_report',       label: '자체감사 결과서', code_prefix: 'AUD' },
  { key: 'inspection_request', label: '점검 의뢰',       code_prefix: 'INS' },
  { key: 'training_record',    label: '교육 결과 송부',  code_prefix: 'TRN' },
  { key: 'other',              label: '기타',            code_prefix: 'ETC' },
] as const

export interface PlaybookStepHint {
  id: string
  code: string | null      // 예: 'step-3'
  title: string            // 예: '정보자산 식별 및 등급 분류'
}

export interface ClassificationResult {
  category: string                  // DELIVERABLE_CATEGORIES.key 중 1
  category_label: string            // 한글 라벨
  code_suggestion: string           // 예: 'APT-2026-001'
  title_suggestion: string          // 문서 제목 제안
  summary: string                   // 200자 이내 요약
  playbook_step_ids: string[]       // 매핑된 policy_section.id (Playbook 만)
  playbook_step_titles: string[]    // 매칭된 step 제목 (UI 표시용)
  confidence: number                // 0.00 ~ 1.00
  external_recipient_suggestion: string | null  // 추론한 수신처
  debug: { elapsed_ms: number; model: string; tokens?: number; finishReason?: string }
}

export function isLlmAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY)
}

function buildPrompt(content: string, codeHint: number, playbookHints: PlaybookStepHint[]): string {
  const trimmed = content.length > MAX_CONTENT
    ? content.substring(0, MAX_CONTENT) + '\n... (이하 생략)'
    : content

  const catList = DELIVERABLE_CATEGORIES
    .map(c => `  - "${c.key}" (${c.label}, 코드 prefix: ${c.code_prefix})`)
    .join('\n')

  const playbookSection = playbookHints.length > 0
    ? `\n\n참고 — 확정 내규의 Playbook 9단계 (사용자가 검수 확정한 운영 가이드):\n${
        playbookHints.map(p => `  - id="${p.id}" / code=${p.code || '-'} / title="${p.title}"`).join('\n')
      }\n\n위 Playbook 중 본 산출물과 관련된 단계의 id 를 playbook_step_ids 배열에 넣어주세요 (0~3개).`
    : '\n\n참고: 확정된 내규 Playbook 없음 → playbook_step_ids: [] 로 반환.'

  const currentYear = new Date().getFullYear()

  return `다음은 「라이드주식회사」 의 정보보안 산출물 1건 의 본문 텍스트입니다.

이 산출물을 분석하여 8 카테고리 중 1개로 분류하고 메타데이터를 추출해 JSON 으로 반환해주세요.

분류 카테고리:
${catList}

JSON 스키마 (정확히 이 구조):

{
  "category": "appointment",
  "code_suggestion": "APT-${currentYear}-${String(codeHint).padStart(3, '0')}",
  "title_suggestion": "예: ${currentYear}년 CPO 임명장 (임성민 이사)",
  "summary": "이 산출물의 핵심 요약 200자 이내",
  "playbook_step_ids": ["..."],
  "external_recipient_suggestion": "수신처 추론 (없으면 null)",
  "confidence": 0.0~1.0
}

규칙:
- category 는 8개 키 (appointment/device_logbook/destruction_cert/breach_notice/audit_report/inspection_request/training_record/other) 중 정확히 1개
- code_suggestion 형식: {prefix}-{year}-{seq3}  (prefix 는 위 카테고리의 코드 prefix 사용)
- code 시퀀스 힌트: ${String(codeHint).padStart(3, '0')} (사용자가 수정 가능)
- title_suggestion: 문서 내용에서 추출한 정식 제목
- summary 는 산출물의 목적·대상·핵심 내용 200자 이내
- confidence 0.85+ 명확 / 0.5~0.85 추정 / 0.5 미만 불확실
- 환각 금지 — 본문에서 확인 가능한 정보만${playbookSection}

본문:
─────────────────────────────
${trimmed}
─────────────────────────────
`
}

async function callGemini(prompt: string): Promise<{ text: string; finishReason?: string; tokens?: number }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 미설정')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
      temperature: 0.1,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`)
    const cand = json.candidates?.[0]
    if (!cand) throw new Error('candidates 없음')
    const parts = cand.content?.parts || []
    const text = parts.map((p: { text?: string }) => p.text || '').join('')
    return {
      text,
      finishReason: cand.finishReason,
      tokens: json.usageMetadata?.totalTokenCount,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 산출물 본문 → 카테고리·코드·제목·요약·Playbook 매핑.
 *
 * @param content 본문 텍스트 (PDF/DOCX/PPTX 추출)
 * @param codeHint 코드 시퀀스 힌트 (예: 다음 사용 가능한 번호)
 * @param playbookHints 확정 내규의 user_confirmed playbook_step sections
 */
export async function classifyDeliverable(
  content: string,
  codeHint: number,
  playbookHints: PlaybookStepHint[] = []
): Promise<ClassificationResult> {
  if (!isLlmAvailable()) throw new Error('GEMINI_API_KEY 미설정 — AI 분류 불가')
  if (!content || content.trim().length < 50) throw new Error('본문이 너무 짧음 (50자 미만)')

  const start = Date.now()
  const prompt = buildPrompt(content, codeHint, playbookHints)
  const result = await callGemini(prompt)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(result.text)
  } catch (e) {
    throw new Error(`JSON 파싱 실패: ${e}. raw: ${result.text.slice(0, 300)}`)
  }

  const category = String(parsed.category || 'other').trim()
  const catDef = DELIVERABLE_CATEGORIES.find(c => c.key === category) || DELIVERABLE_CATEGORIES[7]

  const aiStepIds: string[] = Array.isArray(parsed.playbook_step_ids)
    ? parsed.playbook_step_ids.map(String).filter(Boolean)
    : []
  // 검증 — playbookHints 에 실제 존재하는 id 만 유지
  const validStepIds = aiStepIds.filter(id => playbookHints.some(h => h.id === id))
  const validStepTitles = validStepIds.map(id => {
    const h = playbookHints.find(p => p.id === id)
    return h ? h.title : ''
  }).filter(Boolean)

  return {
    category: catDef.key,
    category_label: catDef.label,
    code_suggestion: String(parsed.code_suggestion || `${catDef.code_prefix}-${new Date().getFullYear()}-${String(codeHint).padStart(3, '0')}`),
    title_suggestion: String(parsed.title_suggestion || '').substring(0, 200),
    summary: String(parsed.summary || '').substring(0, 500),
    playbook_step_ids: validStepIds,
    playbook_step_titles: validStepTitles,
    confidence: Number(parsed.confidence || 0),
    external_recipient_suggestion: parsed.external_recipient_suggestion ? String(parsed.external_recipient_suggestion).substring(0, 200) : null,
    debug: {
      elapsed_ms: Date.now() - start,
      model: MODEL,
      tokens: result.tokens,
      finishReason: result.finishReason,
    },
  }
}

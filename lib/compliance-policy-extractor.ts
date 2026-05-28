/**
 * lib/compliance-policy-extractor.ts
 *
 * Phase 2.0 — 내규 (Policy) AI 추출 helper.
 *
 * 입력: 내규 본문 전체 텍스트 (PPTX/PDF 에서 추출)
 * 출력: 4 종류 sections (article / attachment / playbook_step / annual_event)
 *
 * Rule 3 외부 LLM 안전망:
 *   [A] 모델 quirk:
 *     - gemini-2.5-flash, thinkingBudget: 0, responseMimeType: 'application/json'
 *     - temperature: 0.1 (deterministic)
 *
 *   [B] N=1 dry-run 결과 (2026-05-28):
 *     - finishReason: MAX_TOKENS @ 8192 → chunk 처리 필요
 *     - confidence 0.95, 제1~4조 정확 추출 (raw_excerpt 원문 인용 정상)
 *
 *   [C] 안전망:
 *     - chunk size: 슬라이드 12,000 chars / chunk (~15-20 slide)
 *     - 병렬 호출: Promise.allSettled (1 chunk 실패해도 나머지 진행)
 *     - timeout 50초 / call
 *     - 결과 dedupe (같은 code 중복 시 confidence 높은 것 우선)
 */

const MODEL = 'gemini-2.5-flash'
const CHUNK_SIZE = 12_000        // chars / chunk
const TIMEOUT_MS = 50_000
const MAX_OUTPUT_TOKENS = 8192

export interface ExtractedSection {
  kind: 'article' | 'attachment' | 'playbook_step' | 'annual_event'
  code: string | null
  title: string
  body: string | null
  raw_excerpt: string | null
  confidence: number
}

export interface PolicyExtractionResult {
  policy_title: string | null
  policy_version: string | null
  summary: string | null
  confidence: number
  sections: ExtractedSection[]
  debug: {
    chunks: number
    chunk_results: Array<{ idx: number; ok: boolean; sections: number; finishReason?: string; tokens?: number; error?: string }>
    elapsed_ms: number
    model: string
  }
}

export function isLlmAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY)
}

/**
 * 본문을 chunk 단위로 분할 — 슬라이드 경계 (## Slide N) 우선, 없으면 단순 길이.
 */
function splitChunks(content: string): string[] {
  if (content.length <= CHUNK_SIZE) return [content]
  const chunks: string[] = []
  // 슬라이드 경계로 우선 분할
  const slideMarks = content.match(/^## Slide \d+/gm)
  if (slideMarks && slideMarks.length > 4) {
    const parts = content.split(/(?=^## Slide \d+)/m)
    let buf = ''
    for (const p of parts) {
      if (buf.length + p.length > CHUNK_SIZE) {
        if (buf) chunks.push(buf)
        buf = p
      } else {
        buf += p
      }
    }
    if (buf) chunks.push(buf)
    return chunks
  }
  // 단순 길이 분할
  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    chunks.push(content.substring(i, i + CHUNK_SIZE))
  }
  return chunks
}

function buildPrompt(chunk: string, chunkIdx: number, totalChunks: number, policyHint?: string): string {
  return `다음은 회사 「라이드주식회사」의 내규(개인정보보호 내부관리계획서·매뉴얼) 문서의 일부입니다 (chunk ${chunkIdx + 1}/${totalChunks}).

이 chunk 에서 다음 4 종류의 구조를 추출해 JSON 으로 반환해주세요:

1. **article** — 「제N조」 형식의 조항 (예: 제1조 (목적))
2. **attachment** — 「별첨 N」 또는 「F-NN-NN」 형식의 별첨/서식
3. **playbook_step** — 운영 가이드 단계 (예: 1단계 책임자 지정)
4. **annual_event** — 연간 운영 일정 (월별)

JSON 스키마 (정확히 이 구조):

{
  "policy_title": "문서 제목 (chunk 에 명시되어 있을 때만, 없으면 null)",
  "policy_version": "버전/시행일 (있을 때만)",
  "summary": "이 chunk 의 핵심 요약 100자 이내",
  "confidence": 0.0~1.0,
  "sections": [
    {
      "kind": "article",
      "code": "제6조",
      "title": "개인정보 보호책임자 지정",
      "body": "본문 요약 (150자 이내 — 토큰 절약)",
      "raw_excerpt": "원본 인용 (120자 이내 — 토큰 절약)",
      "confidence": 0.0~1.0
    }
  ]
}

규칙:
- chunk 에 있는 항목만 추출 (환각 금지)
- body 150자 / raw_excerpt 120자 이내 (토큰 절약)
- confidence 0.85+ 명확 / 0.5~0.85 추정 / 0.5 미만 불확실
${policyHint ? `\n참고: 이 문서의 추정 제목 = ${policyHint}` : ''}

문서 본문 (chunk):
─────────────────────────────
${chunk}
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
 * 내규 본문 → 4 종류 sections 추출.
 * Chunk 병렬 호출 + 결과 merge + dedupe.
 */
export async function extractPolicyFromText(content: string): Promise<PolicyExtractionResult> {
  if (!isLlmAvailable()) {
    throw new Error('GEMINI_API_KEY 미설정 — Phase 2.0 AI 추출 불가')
  }
  if (!content || content.trim().length < 100) {
    throw new Error('본문이 너무 짧음 (100자 미만)')
  }

  const start = Date.now()
  const chunks = splitChunks(content)
  const debugResults: PolicyExtractionResult['debug']['chunk_results'] = []

  // chunk 1 먼저 호출 (policy_title hint 확보)
  const firstResult = await callGemini(buildPrompt(chunks[0], 0, chunks.length)).catch((e) => {
    debugResults.push({ idx: 0, ok: false, sections: 0, error: String(e?.message || e) })
    return null
  })
  let policyHint: string | undefined
  let policyTitle: string | null = null
  let policyVersion: string | null = null
  let policySummary: string | null = null
  let policyConfidence = 0
  const allSections: ExtractedSection[] = []

  if (firstResult) {
    try {
      const parsed = JSON.parse(firstResult.text)
      policyTitle = parsed.policy_title || null
      policyVersion = parsed.policy_version || null
      policySummary = parsed.summary || null
      policyConfidence = Number(parsed.confidence || 0)
      policyHint = policyTitle || undefined
      const sections = Array.isArray(parsed.sections) ? parsed.sections : []
      allSections.push(...sections)
      debugResults.push({
        idx: 0, ok: true, sections: sections.length,
        finishReason: firstResult.finishReason, tokens: firstResult.tokens,
      })
    } catch (e) {
      debugResults.push({ idx: 0, ok: false, sections: 0, error: `JSON parse: ${e}` })
    }
  }

  // chunk 2~N 병렬 호출
  if (chunks.length > 1) {
    const restPromises = chunks.slice(1).map((c, i) =>
      callGemini(buildPrompt(c, i + 1, chunks.length, policyHint))
        .then((r) => ({ idx: i + 1, result: r }))
        .catch((e) => ({ idx: i + 1, error: String(e?.message || e) }))
    )
    const restResults = await Promise.allSettled(restPromises)
    for (const r of restResults) {
      if (r.status !== 'fulfilled') continue
      const val = r.value as { idx: number; result?: { text: string; finishReason?: string; tokens?: number }; error?: string }
      if ('error' in val && val.error) {
        debugResults.push({ idx: val.idx, ok: false, sections: 0, error: val.error })
        continue
      }
      try {
        const parsed = JSON.parse(val.result!.text)
        const sections = Array.isArray(parsed.sections) ? parsed.sections : []
        allSections.push(...sections)
        debugResults.push({
          idx: val.idx, ok: true, sections: sections.length,
          finishReason: val.result!.finishReason, tokens: val.result!.tokens,
        })
      } catch (e) {
        debugResults.push({ idx: val.idx, ok: false, sections: 0, error: `JSON parse: ${e}` })
      }
    }
  }

  // dedupe — 같은 kind + code 중복 시 confidence 높은 것 유지
  const seen = new Map<string, ExtractedSection>()
  for (const s of allSections) {
    const key = `${s.kind}|${s.code || s.title}`
    const prev = seen.get(key)
    if (!prev || (s.confidence || 0) > (prev.confidence || 0)) {
      seen.set(key, s)
    }
  }
  const merged = Array.from(seen.values())

  return {
    policy_title: policyTitle,
    policy_version: policyVersion,
    summary: policySummary,
    confidence: policyConfidence,
    sections: merged,
    debug: {
      chunks: chunks.length,
      chunk_results: debugResults,
      elapsed_ms: Date.now() - start,
      model: MODEL,
    },
  }
}

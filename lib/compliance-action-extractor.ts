/**
 * lib/compliance-action-extractor.ts
 *
 * Phase 1.4-A1 — 매뉴얼 본문에서 운영 액션 자동 추출 (정규식 기반).
 * 사용자 비전 (2026-05-19): "행동·진행 스케줄·액션 영역이 요약 추출"
 *
 * 추출 대상:
 *   1. task   — 주기적 운영 (연·반기·분기·월별)
 *   2. form   — 서식 작성 (F-M01-01 등 인용)
 *   3. notify — 통지/보고 의무 (24시간·즉시)
 *   4. policy — 정책 적용 사항 (등급·암호화·접근권한)
 *
 * 정규식 기반 — deterministic, 빠름.
 * LLM 보강은 lib/compliance-llm-extractor.ts 별도.
 */

export interface ExtractedAction {
  type: 'task' | 'form' | 'notify' | 'policy'
  frequency?: 'annual' | 'biannual' | 'quarterly' | 'monthly' | 'on_event'
  months?: number[]                 // 해당 활동 발생 월 (annual=[1] / biannual=[5,10] / quarterly=[3,6,9,12])
  category?: string                 // task category (plan/education/inspection/audit/processor/drill/destruction/closing)
  description: string               // 인간이 읽을 액션 설명
  form_codes?: string[]             // 관련 서식 (F-M01-01 등)
  legal_reference?: string          // 매뉴얼 조항 (제22조 등)
  responsible?: string              // 책임자 ('CPO' / '관리자' / '취급자' / '관리팀')
  evidence_text?: string            // 원문 발견 위치 (디버깅용)
}

export interface ActionExtractionResult {
  doc_code: string
  total_actions: number
  by_type: Record<string, number>
  actions: ExtractedAction[]
  extracted_at: string
  extraction_method: 'regex'
}

/** 주기 키워드 → frequency + months 매핑 */
const FREQUENCY_PATTERNS: Array<{ pattern: RegExp; freq: ExtractedAction['frequency']; months: number[] }> = [
  { pattern: /연\s*1회|매년\s*1회|연간\s*1회/, freq: 'annual', months: [1] },
  { pattern: /연\s*2회|매년\s*2회|반기/, freq: 'biannual', months: [5, 10] },
  { pattern: /분기\s*1회|분기마다|매분기/, freq: 'quarterly', months: [3, 6, 9, 12] },
  { pattern: /매월|월\s*1회|매달/, freq: 'monthly', months: [1,2,3,4,5,6,7,8,9,10,11,12] },
  { pattern: /즉시|발생\s*즉시|24시간\s*이내/, freq: 'on_event', months: [] },
]

/** 카테고리 키워드 매핑 */
const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /교육|연수|인식\s*제고/, category: 'education' },
  { pattern: /자체\s*감사|감사\s*실시|감사\s*결과/, category: 'audit' },
  { pattern: /파기|파기대장|파기\s*신청/, category: 'destruction' },
  { pattern: /수탁사|수탁업체|위탁|제3자/, category: 'processor' },
  { pattern: /모의훈련|비상대응\s*훈련|훈련/, category: 'drill' },
  { pattern: /백업\s*복구|backup/, category: 'backup_test' },
  { pattern: /접근권한\s*검토|권한\s*적정성/, category: 'access_review' },
  { pattern: /계획\s*수립|관리계획/, category: 'plan' },
  { pattern: /정보보안\s*점검|체크리스트/, category: 'inspection' },
  { pattern: /결산|연간\s*결과/, category: 'closing' },
]

/** 책임자 키워드 매핑 */
const RESPONSIBLE_PATTERNS: Array<{ pattern: RegExp; responsible: string }> = [
  { pattern: /CPO|개인정보보호\s*책임자|책임자/, responsible: 'CPO' },
  { pattern: /개인정보보호\s*관리자|관리자/, responsible: '관리자' },
  { pattern: /취급자|전\s*임직원|임직원/, responsible: '취급자' },
  { pattern: /관리팀/, responsible: '관리팀' },
]

/** 한 문장에서 액션 1건 추출 (가능 시) */
function extractFromSentence(sentence: string, defaultCategory?: string): ExtractedAction | null {
  // 주기 매칭
  const freqMatch = FREQUENCY_PATTERNS.find(p => p.pattern.test(sentence))
  if (!freqMatch) return null

  // 카테고리
  const catMatch = CATEGORY_PATTERNS.find(p => p.pattern.test(sentence))
  const category = catMatch?.category || defaultCategory

  // 책임자
  const respMatch = RESPONSIBLE_PATTERNS.find(p => p.pattern.test(sentence))

  // 서식 코드
  const formMatches = sentence.match(/F-(?:M\d{2}-\d{2}|14-\d|\d{2})/g) || []

  // 매뉴얼 조항
  const legalMatch = sentence.match(/제\s*\d+\s*조/)

  // 단순한 설명: 첫 80자 + ...
  const description = sentence.length > 80 ? sentence.substring(0, 80) + '...' : sentence

  return {
    type: 'task',
    frequency: freqMatch.freq,
    months: freqMatch.months,
    category,
    description,
    form_codes: formMatches.length > 0 ? formMatches : undefined,
    legal_reference: legalMatch ? legalMatch[0].replace(/\s+/g, '') : undefined,
    responsible: respMatch?.responsible,
    evidence_text: sentence.length > 200 ? sentence.substring(0, 200) + '...' : sentence,
  }
}

/** 본문에서 정책 행 추출 (등급·암호화 등) */
function extractPolicies(content: string): ExtractedAction[] {
  const policies: ExtractedAction[] = []

  // 등급 분류
  if (/대외비|내부관리/.test(content)) {
    policies.push({
      type: 'policy',
      description: '문서 등급 분류 (대외비 등) 명시',
      legal_reference: '본문 분류 표시',
      evidence_text: '대외비 / 내부관리',
    })
  }

  // 암호화
  if (/암호화|마스킹/.test(content)) {
    policies.push({
      type: 'policy',
      description: '암호화·마스킹 적용 의무',
      legal_reference: '제13조',
      evidence_text: '암호화 / 마스킹',
    })
  }

  // 접근권한
  if (/2-factor|2FA|OTP|보안토큰/.test(content)) {
    policies.push({
      type: 'policy',
      description: '2단계 인증 / OTP / 보안토큰 사용',
      legal_reference: '제12조',
      evidence_text: '2FA / OTP',
    })
  }

  // 통지 의무
  if (/24시간\s*이내|24h/.test(content)) {
    policies.push({
      type: 'notify',
      frequency: 'on_event',
      description: '24시간 이내 정보주체 통지',
      legal_reference: '제25조',
      responsible: 'CPO',
      evidence_text: '24시간 이내 통지',
    })
  }

  return policies
}

/** 본문에서 form 행 추출 (서식 코드 인용) */
function extractFormReferences(content: string): ExtractedAction[] {
  const formMatches = content.match(/F-(?:M\d{2}-\d{2}|14-\d|\d{2})/g) || []
  const uniqForms = [...new Set(formMatches)]
  return uniqForms.map(code => ({
    type: 'form' as const,
    description: `서식 ${code} 작성 의무`,
    form_codes: [code],
    evidence_text: code,
  }))
}

/**
 * 본문 분석 → 액션 list 추출.
 * 1. 정책 (등급·암호화·통지) 자동 감지
 * 2. 서식 인용 자동 감지
 * 3. 문장 단위로 주기적 task 감지 (연·반기·분기·월)
 */
export function extractActions(
  content: string,
  doc: { doc_code: string; doc_type: string }
): ActionExtractionResult {
  const actions: ExtractedAction[] = []

  // 정책 추출
  actions.push(...extractPolicies(content))

  // 서식 추출
  actions.push(...extractFormReferences(content))

  // 문장 단위 task 추출 — 마침표·줄바꿈 기준 split
  const sentences = content.split(/[.。\n]/).map(s => s.trim()).filter(s => s.length > 10)
  const seen = new Set<string>()
  for (const sentence of sentences) {
    const action = extractFromSentence(sentence)
    if (action && action.type === 'task') {
      // 중복 제거 — frequency+category+description prefix 기준
      const key = `${action.frequency}|${action.category}|${action.description.substring(0, 30)}`
      if (seen.has(key)) continue
      seen.add(key)
      actions.push(action)
    }
  }

  // by_type 통계
  const byType: Record<string, number> = {}
  for (const a of actions) {
    byType[a.type] = (byType[a.type] || 0) + 1
  }

  return {
    doc_code: doc.doc_code,
    total_actions: actions.length,
    by_type: byType,
    actions,
    extracted_at: new Date().toISOString(),
    extraction_method: 'regex',
  }
}

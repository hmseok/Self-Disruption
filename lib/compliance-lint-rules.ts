/**
 * lib/compliance-lint-rules.ts
 *
 * Phase 1.4-A1 — 매뉴얼·서식 본문 자동 lint (법적/보안 기준 검토).
 * 사용자 비전 (2026-05-19): "업로드 서류의 기본 법적 또는 보안 기준 검토가 작동"
 *
 * 14 lint 규칙 — 코드 기반 (LLM 호출 없음, deterministic):
 *
 *   법적 (개인정보보호법 + 시행령 + 안전성기준):
 *     LEGAL-01  내부관리계획 의무사항 (목적·범위·책임자) 명시
 *     LEGAL-02  연 N회 교육 빈도 명시
 *     LEGAL-03  반기 자체감사 (제20조)
 *     LEGAL-04  분기 파기 + CPO 승인 (제28~33조)
 *     LEGAL-05  24시간 정보주체 통지 (제25조)
 *     LEGAL-06  보존기간 명시 (3년 최소)
 *     LEGAL-07  접근권한 매트릭스 명시 (제12조)
 *
 *   보안 (KISA 권고 + 매뉴얼 내 자체 기준):
 *     SEC-01    등급 분류 (대외비/내부/공개) 명시
 *     SEC-02    암호화 의무 (제13조)
 *     SEC-03    접근통제 (제14조)
 *     SEC-04    접속기록 위변조 방지 (제15조)
 *     SEC-05    물리적 접근제한 (제10조)
 *
 *   품질 (본문 자체 정합):
 *     QUAL-01   본문 길이 (1000 chars 이상)
 *     QUAL-02   서식 참조 일관성 (인용된 F-* 가 catalog 에 존재)
 */

export interface LintRule {
  id: string
  category: 'legal' | 'security' | 'quality'
  severity: 'error' | 'warning' | 'info'
  label: string
  description: string
  /** lint 결과 — true: 통과, false: 위반 */
  check: (content: string, doc: { doc_code: string; doc_type: string; classification?: string }) => boolean
  /** 위반 시 안내 메시지 */
  hint?: string
}

const LINT_RULES: LintRule[] = [
  // ────────── 법적 기준 ──────────
  {
    id: 'LEGAL-01', category: 'legal', severity: 'error',
    label: '내부관리계획 의무사항 (목적·범위·책임자)',
    description: '개인정보보호법 제29조 + 시행령 제30조 — 목적·범위·책임자 의무 명시',
    check: (c) => /목적|범위|책임자|CPO/.test(c) && /제29조|시행령\s*제30조|안전성/.test(c),
    hint: '"제29조" 또는 "시행령 제30조" 명시 + 목적·범위·책임자 항목 포함',
  },
  {
    id: 'LEGAL-02', category: 'legal', severity: 'warning',
    label: '교육 빈도 (연 2회 이상)',
    description: '제22~23조 — 연 2회 이상 교육 명시',
    check: (c) => /연\s*\d+회|연간\s*\d+회|반기|매년|2회\s*이상/.test(c),
    hint: '"연 2회 이상" 또는 "매년 2회" 빈도 표기 권장',
  },
  {
    id: 'LEGAL-03', category: 'legal', severity: 'warning',
    label: '자체감사 빈도 (반기 1회)',
    description: '제20~21조 — 반기 1회 자체감사',
    check: (c, d) => d.doc_code !== 'RIDE-PMP' || /반기\s*1회|상반기|하반기|자체감사|감사|점검/.test(c),
    hint: '"반기 1회" 또는 "상·하반기" 자체감사 빈도 명시',
  },
  {
    id: 'LEGAL-04', category: 'legal', severity: 'warning',
    label: '파기 + CPO 승인 (분기 1회)',
    description: '제28~33조 — 분기 1회 파기 + CPO 승인',
    check: (c, d) => !['RIDE-PMP', 'RIDE-M05'].includes(d.doc_code) || /분기\s*1회|파기.*승인|CPO.*승인|파기대장/.test(c),
    hint: 'M05 파기 매뉴얼 또는 통합본에 "분기 1회 파기 + CPO 승인" 명시 필요',
  },
  {
    id: 'LEGAL-05', category: 'legal', severity: 'error',
    label: '24시간 정보주체 통지',
    description: '제25조 — 유출 시 24시간 이내 정보주체 통지',
    check: (c, d) => !['RIDE-PMP', 'RIDE-M01'].includes(d.doc_code) || /24시간|24h|정보주체.*통지/.test(c),
    hint: 'M01 유출대응 매뉴얼 또는 통합본에 "24시간 정보주체 통지" 명시',
  },
  {
    id: 'LEGAL-06', category: 'legal', severity: 'info',
    label: '보존기간 명시',
    description: '제33조 (파기대장 3년) + 제15조 (접속기록) 보존기간 표기',
    check: (c) => /\d+\s*년\s*(이상\s*)?(보관|보존)/.test(c) || /3년\s*이상/.test(c),
    hint: '"3년 보관" 또는 "5년 보존" 보존기간 명시',
  },
  {
    id: 'LEGAL-07', category: 'legal', severity: 'warning',
    label: '접근권한 관리·인증',
    description: '제12조 — 접근권한 매트릭스 + 2-factor 인증 권고',
    check: (c, d) => d.doc_code !== 'RIDE-PMP' || /접근권한|2-factor|2FA|OTP|인증/.test(c),
    hint: '"접근권한 관리" 또는 "2FA" 명시',
  },

  // ────────── 보안 기준 ──────────
  {
    id: 'SEC-01', category: 'security', severity: 'error',
    label: '문서 등급 분류',
    description: '공개/내부/대외비 등급 표기 — 정보보호 분류 의무',
    check: (c, d) => d.classification !== undefined || /대외비|내부관리|public|internal|confidential/i.test(c),
    hint: 'documents.classification 컬럼 설정 또는 본문에 "대외비/내부/공개" 명시',
  },
  {
    id: 'SEC-02', category: 'security', severity: 'warning',
    label: '암호화 의무',
    description: '제13조 — 개인정보 암호화·마스킹',
    check: (c, d) => d.doc_code !== 'RIDE-PMP' || /암호화|마스킹|encrypt/i.test(c),
    hint: '"암호화" 또는 "마스킹" 의무 명시',
  },
  {
    id: 'SEC-03', category: 'security', severity: 'warning',
    label: '접근통제',
    description: '제14조 — 외부 접속 차단 + 접근통제',
    check: (c, d) => d.doc_code !== 'RIDE-PMP' || /접근통제|외부\s*접속|차단|IP\s*화이트|방화벽/.test(c),
    hint: '"접근통제" 또는 "외부 접속 차단" 명시',
  },
  {
    id: 'SEC-04', category: 'security', severity: 'info',
    label: '접속기록 위변조 방지',
    description: '제15조 — 접속기록 위변조 방지 + 12개월~3년 보관',
    check: (c, d) => d.doc_code !== 'RIDE-PMP' || /접속기록|위변조|로그|log/.test(c),
    hint: '"접속기록" 또는 "위변조 방지" 명시',
  },
  {
    id: 'SEC-05', category: 'security', severity: 'info',
    label: '물리적 접근제한',
    description: '제10조 — 보호구역 지정 + 출입통제 + 잠금장치',
    check: (c, d) => d.doc_code !== 'RIDE-PMP' || /물리적|보호구역|출입통제|잠금|locked/.test(c),
    hint: '"물리적 접근제한" 또는 "보호구역" 명시',
  },

  // ────────── 품질 ──────────
  {
    id: 'QUAL-01', category: 'quality', severity: 'warning',
    label: '본문 길이 (1000 chars 이상)',
    description: '본문이 너무 짧으면 운영 절차 부족',
    check: (c) => c.length >= 1000,
    hint: '본문 1000자 이상 권장 (현재 너무 짧으면 절차 누락 가능성)',
  },
  {
    id: 'QUAL-02', category: 'quality', severity: 'info',
    label: '서식 참조 명시 (form 인용)',
    description: '매뉴얼이 관련 서식 (F-M01-01 등) 을 명시 인용',
    check: (c, d) => d.doc_type !== 'manual' || /F-M\d{2}-\d{2}|F-\d{2}|F-14-\d/.test(c),
    hint: '본문에 관련 서식 코드 (예: F-M01-01) 명시 권장',
  },
]

export interface LintIssue {
  rule_id: string
  category: 'legal' | 'security' | 'quality'
  severity: 'error' | 'warning' | 'info'
  label: string
  description: string
  hint?: string
  passed: boolean  // true=통과, false=위반
}

export interface LintResult {
  doc_code: string
  doc_type: string
  total_rules: number
  passed: number
  errors: number
  warnings: number
  infos: number
  score: number  // 0~100
  issues: LintIssue[]  // 위반만 포함 (passed=false)
  passed_issues: LintIssue[]  // 통과 (passed=true)
}

/**
 * 본문에 대해 14 lint 규칙 실행.
 * 통과 룰은 passed_issues, 위반 룰은 issues 에 기록.
 * Score: 100 - error*10 - warning*3 - info*1.
 */
export function runComplianceLint(
  content: string,
  doc: { doc_code: string; doc_type: string; classification?: string }
): LintResult {
  const issues: LintIssue[] = []
  const passedIssues: LintIssue[] = []

  for (const rule of LINT_RULES) {
    const passed = rule.check(content, doc)
    const issue: LintIssue = {
      rule_id: rule.id,
      category: rule.category,
      severity: rule.severity,
      label: rule.label,
      description: rule.description,
      hint: rule.hint,
      passed,
    }
    if (passed) {
      passedIssues.push(issue)
    } else {
      issues.push(issue)
    }
  }

  const errors = issues.filter(i => i.severity === 'error').length
  const warnings = issues.filter(i => i.severity === 'warning').length
  const infos = issues.filter(i => i.severity === 'info').length
  const score = Math.max(0, 100 - errors * 10 - warnings * 3 - infos * 1)

  return {
    doc_code: doc.doc_code,
    doc_type: doc.doc_type,
    total_rules: LINT_RULES.length,
    passed: passedIssues.length,
    errors, warnings, infos, score,
    issues,
    passed_issues: passedIssues,
  }
}

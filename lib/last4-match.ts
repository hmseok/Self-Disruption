/**
 * last4-match.ts — 통장/카드 last4 매칭 공통 헬퍼.
 *
 * 모든 last4 기반 매칭은 이 헬퍼를 사용해 같은 알고리즘을 보장.
 *   - 진단 도구 (bank-match-diag, card-match-diag)
 *   - finance-upload SQL JOIN
 *   - 매핑 등록 시 backfill
 *
 * 원칙:
 *   - JS 측: 숫자만 추출 후 마지막 4자리
 *   - SQL 측: 안전 함수만 사용 (RIGHT, TRIM, CHAR_LENGTH) — REGEXP_* 회피
 *   - account_number / account_alias 둘 다 시도 (한쪽이 NULL 이거나 형식 다를 수 있음)
 *
 * (CLAUDE.md § 0-1 규칙 11/12/13 — DRY 원칙 + 의미적 검증 자동화)
 */

/** 문자열에서 숫자만 추출 → 마지막 4자리. 4자리 미만이면 null. */
export function extractLast4(s: string | null | undefined): string | null {
  if (!s) return null
  const digits = String(s).replace(/\D/g, '')
  if (digits.length < 4) return null
  return digits.slice(-4)
}

/** 매핑 row 의 후보 last4 (account_number / account_alias 둘 다 시도). */
export function mappingLast4Candidates(rec: {
  account_number?: string | null
  account_alias?: string | null
}): string[] {
  const set = new Set<string>()
  for (const src of [rec.account_number, rec.account_alias]) {
    const l4 = extractLast4(src)
    if (l4) set.add(l4)
  }
  return [...set]
}

/** SMS card_alias 또는 카드 번호에서 last4 추출. */
export function smsLast4(cardAlias: string | null | undefined): string | null {
  return extractLast4(cardAlias)
}

/**
 * SQL JOIN 단편 — 매핑 alias 정확 일치 OR last4 매칭.
 *
 * 사용 예:
 *   const sql = `
 *     ... LEFT JOIN bank_account_mappings bam
 *           ON ${bankMappingJoinSql('bam', 'sms')}
 *   `
 *
 * 안전 함수만 사용:
 *   - RIGHT, TRIM, CHAR_LENGTH (MySQL 5.7 / 8 모두 OK)
 *   - REGEXP_* 사용 안 함
 *
 * 주의: 이 SQL 은 `account_number` / `account_alias` 둘 다에서 last4 추출.
 *       하나라도 매칭되면 JOIN 성공.
 */
export function bankMappingJoinSql(bamAlias: string, smsAlias: string): string {
  return `(
    ${bamAlias}.account_alias = ${smsAlias}.card_alias
    OR (
      ${smsAlias}.card_alias IS NOT NULL
      AND CHAR_LENGTH(TRIM(${smsAlias}.card_alias)) >= 4
      AND (
        (${bamAlias}.account_number IS NOT NULL
         AND CHAR_LENGTH(TRIM(${bamAlias}.account_number)) >= 4
         AND RIGHT(TRIM(${bamAlias}.account_number), 4) = RIGHT(TRIM(${smsAlias}.card_alias), 4))
        OR
        (${bamAlias}.account_alias IS NOT NULL
         AND CHAR_LENGTH(TRIM(${bamAlias}.account_alias)) >= 4
         AND RIGHT(TRIM(${bamAlias}.account_alias), 4) = RIGHT(TRIM(${smsAlias}.card_alias), 4))
      )
    )
  )`
}

/**
 * SQL 단편 — SMS card_alias 에서 last4 추출.
 * REGEXP_SUBSTR 회피 — 단순 RIGHT(TRIM(...), 4) 사용.
 *
 * 한계: card_alias 가 "법인****7109" 같은 패턴이면 마지막 4글자는 숫자라 OK.
 *       끝이 숫자가 아니면 null 처리 필요 (호출 측에서 디지트 검증).
 */
export function smsLast4Sql(smsAliasCol: string): string {
  return `CASE
    WHEN ${smsAliasCol} IS NULL THEN NULL
    WHEN CHAR_LENGTH(TRIM(${smsAliasCol})) < 4 THEN NULL
    ELSE RIGHT(TRIM(${smsAliasCol}), 4)
  END`
}

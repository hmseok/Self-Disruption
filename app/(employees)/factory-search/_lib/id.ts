// ───────────────────────────────────────────────────────────────
// ID 컨벤션 유틸 (docs/ID_CONVENTION.md 참조)
// 빈값(null/undefined/''/0)만 null로 정리. 타입 변환은 DB가 결정.
// ───────────────────────────────────────────────────────────────

export const cleanId = <T,>(val: T | '' | 0 | null | undefined): T | null => {
  if (val === null || val === undefined) return null
  if ((val as unknown) === '' || (val as unknown) === 0) return null
  return val as T
}

export const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

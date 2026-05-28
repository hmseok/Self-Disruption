/**
 * lib/json-safe.ts
 *
 * BigInt → Number 변환 (JSON 직렬화 안전).
 *
 * 사용 사례:
 *   - Prisma $queryRaw 결과의 BIGINT 컬럼 (file_size_bytes 등)
 *   - JSON.stringify 가 BigInt 만나면 throw — 사전 변환 필요.
 */

/**
 * 객체의 모든 BigInt 값을 Number 로 변환 (재귀).
 * Number 의 safe integer 한계 (~9.0e15) 초과 시 string 으로 fallback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function jsonSafe<T = any>(input: T): T {
  if (input === null || input === undefined) return input
  if (typeof input === 'bigint') {
    const n = Number(input)
    return (Number.isSafeInteger(n) ? n : String(input)) as unknown as T
  }
  if (Array.isArray(input)) {
    return input.map(jsonSafe) as unknown as T
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = jsonSafe(v)
    }
    return out as unknown as T
  }
  return input
}

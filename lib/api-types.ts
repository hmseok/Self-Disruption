/**
 * API 응답 표준 타입
 *
 * 모든 API 라우트는 이 타입을 따라야 함.
 * - 성공: { data: T, error: null }
 * - 실패: { data: null | [] (배열 API인 경우), error: string }
 *
 * 배열 API는 에러 시 반드시 data: [] 를 반환하여 프론트에서 .filter/.map 안전 보장.
 */

export type ApiResponse<T> = {
  data: T
  error: string | null
}

export type ApiListResponse<T> = ApiResponse<T[]>

/** 성공 응답 생성 헬퍼 */
export function apiOk<T>(data: T) {
  return { data, error: null as string | null }
}

/** 배열 API의 에러 응답 헬퍼 — data: [] 보장 */
export function apiListError(error: unknown): ApiListResponse<never> {
  const msg = error instanceof Error ? error.message : String(error)
  return { data: [] as never[], error: msg }
}

/** 단건 API의 에러 응답 헬퍼 */
export function apiError(error: unknown): ApiResponse<null> {
  const msg = error instanceof Error ? error.message : String(error)
  return { data: null, error: msg }
}

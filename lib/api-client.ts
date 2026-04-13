/**
 * 프론트엔드 API 호출 표준 래퍼
 *
 * 사용법:
 *   const list = await apiGet<MaintenanceRecord[]>('/api/maintenance-records', [])
 *   const one = await apiGet<User | null>('/api/users/me', null)
 *   await apiPost('/api/maintenance-records', body)
 *
 * 특징:
 * - Authorization 헤더 자동 주입 (fmi_token)
 * - 응답 파싱 실패 / 에러 시 fallback 반환 (배열은 [], 단건은 null)
 * - .filter is not a function 같은 런타임 에러 근본 차단
 */

function getTokenHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const token = window.localStorage.getItem('fmi_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

async function request<T>(method: string, path: string, body?: any, fallback?: T): Promise<T> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getTokenHeader(),
    }
    const res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    // 표준 응답: { data, error }
    if (json && typeof json === 'object' && 'data' in json) {
      return json.data as T
    }
    // 표준을 따르지 않는 레거시 응답: json 자체가 데이터일 수 있음
    if (Array.isArray(json)) return json as unknown as T
    return (fallback !== undefined ? fallback : (json as T))
  } catch (e) {
    console.error(`[api-client] ${method} ${path} failed:`, e)
    return fallback as T
  }
}

export async function apiGet<T>(path: string, fallback: T): Promise<T> {
  return request<T>('GET', path, undefined, fallback)
}

export async function apiPost<T = any>(path: string, body?: any, fallback?: T): Promise<T> {
  return request<T>('POST', path, body, fallback)
}

export async function apiPatch<T = any>(path: string, body?: any, fallback?: T): Promise<T> {
  return request<T>('PATCH', path, body, fallback)
}

export async function apiPut<T = any>(path: string, body?: any, fallback?: T): Promise<T> {
  return request<T>('PUT', path, body, fallback)
}

export async function apiDelete<T = any>(path: string, fallback?: T): Promise<T> {
  return request<T>('DELETE', path, undefined, fallback)
}

/** 배열 API 안전 호출 — 항상 배열 보장 */
export async function apiGetList<T>(path: string): Promise<T[]> {
  const data = await apiGet<T[] | any>(path, [] as T[])
  return Array.isArray(data) ? data : []
}

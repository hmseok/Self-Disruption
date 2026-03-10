import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from './supabase'

// ============================================
// API 서비스 레이어
// Bearer 토큰 기반 HTTP 클라이언트
// 오프라인 큐잉 + 재시도 지원
// ============================================

const BASE_URL = 'https://hmseok.com'
const QUEUE_KEY = '@offline_request_queue'
const REQUEST_TIMEOUT = 30000 // 30초

// ── 타입 정의 ──────────────────────────────

interface ApiResponse<T = any> {
  data: T | null
  error: string | null
  status: number
}

interface QueuedRequest {
  id: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  body?: any
  createdAt: string
  retryCount: number
}

interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

type UploadProgressCallback = (progress: UploadProgress) => void

// ── 토큰 관리 ──────────────────────────────

async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
  } catch {
    return null
  }
}

function buildHeaders(token: string | null, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// ── 네트워크 상태 ──────────────────────────

async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch()
    return state.isConnected === true
  } catch {
    return true // 판단 불가 시 온라인 가정
  }
}

// ── 오프라인 큐 관리 ────────────────────────

async function getQueue(): Promise<QueuedRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

async function saveQueue(queue: QueuedRequest[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch (e) {
    console.error('[API] 큐 저장 실패:', e)
  }
}

async function enqueueRequest(req: Omit<QueuedRequest, 'id' | 'createdAt' | 'retryCount'>): Promise<void> {
  const queue = await getQueue()
  queue.push({
    ...req,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  })
  await saveQueue(queue)
  console.log(`[API] 오프라인 큐에 추가: ${req.method} ${req.path}`)
}

// 온라인 복구 시 큐된 요청 전송
export async function syncOfflineQueue(): Promise<{ success: number; failed: number }> {
  const online = await isOnline()
  if (!online) return { success: 0, failed: 0 }

  const queue = await getQueue()
  if (queue.length === 0) return { success: 0, failed: 0 }

  console.log(`[API] 오프라인 큐 동기화 시작: ${queue.length}건`)

  let success = 0
  let failed = 0
  const remaining: QueuedRequest[] = []

  for (const req of queue) {
    try {
      const token = await getAccessToken()
      const res = await fetchWithTimeout(`${BASE_URL}${req.path}`, {
        method: req.method,
        headers: buildHeaders(token),
        body: req.body ? JSON.stringify(req.body) : undefined,
      })

      if (res.ok || res.status < 500) {
        success++
      } else {
        req.retryCount++
        if (req.retryCount < 5) {
          remaining.push(req)
        }
        failed++
      }
    } catch {
      req.retryCount++
      if (req.retryCount < 5) {
        remaining.push(req)
      }
      failed++
    }
  }

  await saveQueue(remaining)
  console.log(`[API] 동기화 완료: 성공 ${success}, 실패 ${failed}, 재시도 대기 ${remaining.length}`)
  return { success, failed }
}

// ── fetch 래퍼 (타임아웃) ───────────────────

async function fetchWithTimeout(url: string, options: RequestInit, timeout = REQUEST_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timer)
  }
}

// ── 핵심 API 메서드 ─────────────────────────

export async function apiGet<T = any>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
  try {
    const token = await getAccessToken()
    let url = `${BASE_URL}${path}`

    if (params) {
      const qs = new URLSearchParams(params).toString()
      url += `?${qs}`
    }

    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: buildHeaders(token),
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      return { data: null, error: data?.error || `HTTP ${res.status}`, status: res.status }
    }

    return { data, error: null, status: res.status }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { data: null, error: '요청 시간이 초과되었습니다.', status: 0 }
    }
    return { data: null, error: e.message || '네트워크 오류', status: 0 }
  }
}

async function apiMutate<T = any>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: any,
  options?: { offlineQueue?: boolean }
): Promise<ApiResponse<T>> {
  const online = await isOnline()

  // 오프라인이고 큐잉 허용된 요청이면 큐에 저장
  if (!online && options?.offlineQueue !== false) {
    await enqueueRequest({ method, path, body })
    return { data: null, error: null, status: 202 } // 202 Accepted (큐잉됨)
  }

  try {
    const token = await getAccessToken()
    const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
      method,
      headers: buildHeaders(token),
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      return { data: null, error: data?.error || `HTTP ${res.status}`, status: res.status }
    }

    return { data, error: null, status: res.status }
  } catch (e: any) {
    // 네트워크 실패 시 큐잉
    if (options?.offlineQueue !== false) {
      await enqueueRequest({ method, path, body })
      return { data: null, error: null, status: 202 }
    }
    return { data: null, error: e.message || '네트워크 오류', status: 0 }
  }
}

export async function apiPost<T = any>(path: string, body?: any, options?: { offlineQueue?: boolean }): Promise<ApiResponse<T>> {
  return apiMutate<T>('POST', path, body, options)
}

export async function apiPut<T = any>(path: string, body?: any, options?: { offlineQueue?: boolean }): Promise<ApiResponse<T>> {
  return apiMutate<T>('PUT', path, body, options)
}

export async function apiPatch<T = any>(path: string, body?: any, options?: { offlineQueue?: boolean }): Promise<ApiResponse<T>> {
  return apiMutate<T>('PATCH', path, body, options)
}

export async function apiDelete<T = any>(path: string, options?: { offlineQueue?: boolean }): Promise<ApiResponse<T>> {
  return apiMutate<T>('DELETE', path, undefined, options)
}

// ── Supabase 직접 쿼리 헬퍼 ──────────────────

export async function supabaseQuery<T = any>(
  table: string,
  query: (q: any) => any
): Promise<ApiResponse<T>> {
  try {
    const q = supabase.from(table).select()
    const { data, error } = await query(q)

    if (error) {
      return { data: null, error: error.message, status: 400 }
    }

    return { data, error: null, status: 200 }
  } catch (e: any) {
    return { data: null, error: e.message || 'DB 쿼리 오류', status: 0 }
  }
}

// ── 파일 업로드 (Supabase Storage) ───────────

export async function uploadFile(
  uri: string,
  bucket: string,
  storagePath: string,
  onProgress?: UploadProgressCallback
): Promise<ApiResponse<{ publicUrl: string }>> {
  try {
    // 파일 읽기
    const fileResponse = await fetch(uri)
    if (!fileResponse.ok) {
      return { data: null, error: '파일을 읽을 수 없습니다.', status: 0 }
    }

    const blob = await fileResponse.blob()

    if (onProgress) {
      onProgress({ loaded: 0, total: blob.size, percent: 0 })
    }

    // Supabase Storage에 업로드
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, blob, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      return { data: null, error: uploadError.message, status: 400 }
    }

    if (onProgress) {
      onProgress({ loaded: blob.size, total: blob.size, percent: 100 })
    }

    // 공개 URL 가져오기
    const { data: publicData } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath)

    return {
      data: { publicUrl: publicData.publicUrl },
      error: null,
      status: 200,
    }
  } catch (e: any) {
    return { data: null, error: e.message || '업로드 실패', status: 0 }
  }
}

// ── 배치 파일 업로드 ─────────────────────────

export async function uploadFiles(
  files: Array<{ uri: string; storagePath: string }>,
  bucket: string,
  onProgress?: (completed: number, total: number) => void
): Promise<Array<{ storagePath: string; publicUrl: string | null; error: string | null }>> {
  const results: Array<{ storagePath: string; publicUrl: string | null; error: string | null }> = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const res = await uploadFile(file.uri, bucket, file.storagePath)

    results.push({
      storagePath: file.storagePath,
      publicUrl: res.data?.publicUrl || null,
      error: res.error,
    })

    if (onProgress) {
      onProgress(i + 1, files.length)
    }
  }

  return results
}

// ── 네트워크 상태 감지 + 자동 동기화 ────────────

let unsubscribeNetInfo: (() => void) | null = null

export function startNetworkListener(): void {
  if (unsubscribeNetInfo) return

  unsubscribeNetInfo = NetInfo.addEventListener(async (state) => {
    if (state.isConnected) {
      const queue = await getQueue()
      if (queue.length > 0) {
        console.log('[API] 네트워크 복구 감지. 큐 동기화 시작...')
        await syncOfflineQueue()
      }
    }
  })
}

export function stopNetworkListener(): void {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo()
    unsubscribeNetInfo = null
  }
}

// ── 편의 함수 ────────────────────────────────

// 큐 상태 확인
export async function getQueueCount(): Promise<number> {
  const queue = await getQueue()
  return queue.length
}

// 큐 초기화
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY)
}

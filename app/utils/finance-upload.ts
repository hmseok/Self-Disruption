export async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

/**
 * 인증 헤더를 자동 주입하는 fetch 래퍼
 * - body가 object/array면 JSON.stringify + Content-Type 자동 설정
 * - 에러 시 JSON body.error를 Error.message에 포함
 *
 * 사용:
 *   const res = await fetchWithAuth('/api/transactions?limit=100')
 *   const { ok, json, status } = await fetchWithAuth('/api/x', { method: 'POST', body: { foo: 1 } })
 */
export async function fetchWithAuth(url: string, opts: Omit<RequestInit, 'body'> & { body?: any } = {}) {
  const headers = await getAuthHeader()
  const { body, ...rest } = opts
  let finalBody: BodyInit | undefined = undefined
  const contentTypeHeader: Record<string, string> = {}
  if (body !== undefined && body !== null) {
    if (typeof body === 'string' || body instanceof FormData || body instanceof Blob) {
      finalBody = body as BodyInit
    } else {
      finalBody = JSON.stringify(body)
      contentTypeHeader['Content-Type'] = 'application/json'
    }
  }
  const response = await fetch(url, {
    ...rest,
    headers: { ...headers, ...contentTypeHeader, ...(rest.headers as Record<string, string> || {}) },
    body: finalBody,
  })
  let json: any = null
  try { json = await response.json() } catch { /* 빈 body 허용 */ }
  return { ok: response.ok, status: response.status, json: json || {} }
}

/**
 * upload_batches 연동용 배치 ID 생성기
 * 형식: `${prefix}_${yyyymmdd}_${ms}` — 전역 유니크 보장 (밀리초 타임스탬프)
 *
 * @param source  'excel_bank' | 'excel_card' | 'pdf_card' | 'codef_bank' | 'manual'
 * @param institution  기관명(선택) — '우리은행' → 'woori' 등 접미 붙임
 * @returns e.g. 'excel_bank_woori_20260420_1745000000123'
 */
export function generateBatchId(source: string, institution?: string): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const ms = now.getTime()
  const instSlug = institution ? `_${institution.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase().slice(0, 16)}` : ''
  return `${source}${instSlug}_${y}${m}${d}_${ms}`
}

/**
 * source_type prefix 자동 감지 — payment_method + 파일명 조합으로 판별
 */
export function detectSourceType(paymentMethod: string, fileName?: string): string {
  const pm = (paymentMethod || '').toLowerCase()
  const fn = (fileName || '').toLowerCase()
  if (fn.endsWith('.pdf')) {
    return pm === '카드' || pm === 'card' ? 'pdf_card' : 'pdf_card'
  }
  if (pm === '카드' || pm === 'card') return 'excel_card'
  return 'excel_bank'
}

/**
 * upload_batches 메타 선행 등록 — handleBulkSave 시점에 호출
 * 같은 ID가 있으면 file_name/memo만 업데이트 (ON DUPLICATE KEY UPDATE)
 */
export async function registerUploadBatch(params: {
  id: string
  source_type: string
  institution?: string | null
  file_name?: string | null
  memo?: string | null
}) {
  const { ok, json } = await fetchWithAuth('/api/upload-batches', {
    method: 'POST',
    body: params,
  })
  if (!ok) {
    console.warn('[registerUploadBatch]', params.id, json?.error)
    return null
  }
  return json?.data
}

export async function fetchFinanceData(table: string, action?: string, id?: string) {
  const headers = await getAuthHeader()
  let url = `/api/finance-upload?table=${table}`
  if (action) url += `&action=${action}`
  if (id) url += `&id=${id}`

  const response = await fetch(url, { headers })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch data')
  }
  const json = await response.json()
  return json.data
}

export async function updateFinanceRow(table: string, id: string, data: any) {
  const headers = await getAuthHeader()
  const response = await fetch(`/api/finance-upload?table=${table}&id=${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update data')
  }
  return response.json()
}

export async function insertFinanceRows(table: string, rows: any[]) {
  const headers = await getAuthHeader()
  const response = await fetch(`/api/finance-upload?table=${table}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(rows),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to insert data')
  }
  return response.json()
}

export async function deleteFinanceRow(table: string, id: string, soft: boolean = false) {
  const headers = await getAuthHeader()
  const url = `/api/finance-upload?table=${table}&id=${id}${soft ? '&soft=true' : ''}`
  const response = await fetch(url, {
    method: 'DELETE',
    headers,
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete data')
  }
  return response.json()
}

export async function batchUpdateFinanceRows(table: string, updates: Array<{ id: string; data: any }>) {
  const headers = await getAuthHeader()
  const results = await Promise.all(
    updates.map(({ id, data }) =>
      fetch(`/api/finance-upload?table=${table}&id=${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    )
  )

  const errors = results.filter(r => !r.ok)
  if (errors.length > 0) {
    throw new Error(`${errors.length} update(s) failed`)
  }

  return Promise.all(results.map(r => r.json()))
}

export async function batchDeleteFinanceRows(table: string, ids: string[], soft: boolean = false) {
  const headers = await getAuthHeader()
  const results = await Promise.all(
    ids.map(id =>
      fetch(`/api/finance-upload?table=${table}&id=${id}${soft ? '&soft=true' : ''}`, {
        method: 'DELETE',
        headers,
      })
    )
  )

  const errors = results.filter(r => !r.ok)
  if (errors.length > 0) {
    throw new Error(`${errors.length} delete(s) failed`)
  }

  return Promise.all(results.map(r => r.json()))
}

export async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/firebase')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
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

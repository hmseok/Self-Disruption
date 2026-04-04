
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

export async function fetchPricingStandardsData(table: string) {
  const headers = await getAuthHeader()
  const response = await fetch(`/api/pricing-standards?table=${table}`, { headers })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch data')
  }
  const json = await response.json()
  return json.data
}

export async function updatePricingStandardsRow(table: string, id: string, data: any) {
  const headers = await getAuthHeader()
  const response = await fetch(`/api/pricing-standards?table=${table}&id=${id}`, {
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

export async function insertPricingStandardsRows(table: string, rows: any[]) {
  const headers = await getAuthHeader()
  const response = await fetch(`/api/pricing-standards?table=${table}`, {
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

export async function deletePricingStandardsRow(table: string, id: string) {
  const headers = await getAuthHeader()
  const response = await fetch(`/api/pricing-standards?table=${table}&id=${id}`, {
    method: 'DELETE',
    headers,
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete data')
  }
  return response.json()
}

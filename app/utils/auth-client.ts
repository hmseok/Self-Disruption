'use client'

import { getStoredToken } from '@/lib/auth-client'

/**
 * API fetch용 Authorization 헤더 반환 (커스텀 JWT)
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

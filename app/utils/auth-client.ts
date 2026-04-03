'use client'

/**
 * Firebase Authentication 클라이언트 유틸리티
 * 모든 프론트엔드 fetch() 호출에 사용
 */
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

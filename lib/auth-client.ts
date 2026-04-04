/**
 * 커스텀 JWT 인증 클라이언트 (Firebase 대체)
 * - 토큰을 localStorage에 저장
 * - Firebase auth 객체와 동일한 인터페이스 제공 → 기존 코드 import 경로만 교체하면 됨
 */

const TOKEN_KEY = 'fmi_token'
const USER_KEY = 'fmi_user'

// ── 토큰 저장/조회/삭제 ──────────────────────────────────────
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): any | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function setAuth(token: string, user: any) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('fmi-auth-change'))
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('fmi-auth-change'))
  }
}

// ── Firebase 호환 currentUser 객체 생성 ──────────────────────
function makeCurrentUser(token: string, user: any) {
  return {
    uid: user.id,
    email: user.email,
    emailVerified: true,
    displayName: user.employee_name || user.name || null,
    getIdToken: async (_forceRefresh?: boolean): Promise<string> => token,
  }
}

// ── Firebase 호환 auth 객체 ───────────────────────────────────
export const auth = {
  get currentUser() {
    const token = getStoredToken()
    const user = getStoredUser()
    if (!token || !user) return null
    return makeCurrentUser(token, user)
  },

  onAuthStateChanged(callback: (user: any) => void): () => void {
    if (typeof window === 'undefined') {
      callback(null)
      return () => {}
    }

    // 초기 상태 전달
    const token = getStoredToken()
    const user = getStoredUser()
    callback(token && user ? makeCurrentUser(token, user) : null)

    // 변경 이벤트 리스닝
    const handler = () => {
      const t = getStoredToken()
      const u = getStoredUser()
      callback(t && u ? makeCurrentUser(t, u) : null)
    }
    window.addEventListener('fmi-auth-change', handler)
    return () => window.removeEventListener('fmi-auth-change', handler)
  },

  // 로그아웃 (Firebase signOut 호환)
  signOut: async (): Promise<void> => {
    clearAuth()
  },
}

export default auth

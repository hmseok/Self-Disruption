// Firebase Admin SDK (Server-side only)
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]

  // 서비스 계정 키 (환경변수에서 로드)
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[Firebase Admin] 환경변수 미설정 — Supabase JWT fallback 사용')
    return null
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  })
}

export const adminApp = getAdminApp()
export const adminAuth = adminApp ? getAuth(adminApp) : null

// Firebase Client SDK (Browser-side only)
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// SSR/빌드 환경에서는 초기화 생략 (API 키 없음)
let app: FirebaseApp
let auth: Auth

if (typeof window !== 'undefined' && firebaseConfig.apiKey) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
  auth = getAuth(app)
} else {
  // 서버사이드 / 빌드 타임: 더미 객체 (실제로 호출되지 않음)
  app = {} as FirebaseApp
  auth = {
    currentUser: null,
    onAuthStateChanged: () => () => {},
  } as unknown as Auth
}

export { auth }
export default app

import { createClient } from '@supabase/supabase-js'

// ============================================
// Supabase 클라이언트 (sessionStorage 기반)
// 브라우저를 닫으면 세션이 자동 만료됩니다.
// 같은 탭/브라우저 내에서는 새로고침해도 유지됩니다.
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // sessionStorage: 브라우저 닫으면 삭제, 새로고침은 유지
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

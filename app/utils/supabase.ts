import { createClient } from '@supabase/supabase-js'

// 1. 환경변수 가져오기
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// 2. 클라이언트 생성기 (에러 방지용 안전장치 포함)
const createSupabaseClient = () => {
  try {
    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ [주의] Supabase 환경변수가 없습니다. (로그인 기능 작동 안 함)')
      // 에러가 나도 앱이 죽지 않도록 빈 껍데기 반환
      return createClient('https://placeholder.supabase.co', 'placeholder')
    }
    return createClient(supabaseUrl, supabaseKey)
  } catch (error) {
    console.error('🚨 Supabase 클라이언트 생성 중 오류:', error)
    return createClient('https://placeholder.supabase.co', 'placeholder')
  }
}

export const supabase = createSupabaseClient()
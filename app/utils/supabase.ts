import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// ============================================
// Supabase 클라이언트 (쿠키 기반 세션 관리)
// RLS 정상 동작 — SECURITY DEFINER 함수 사용
// ============================================

export const supabase = createClientComponentClient()

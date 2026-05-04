import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// 격리 코드 마스터 — 클라이언트 FALLBACK과 병합되므로 빈 객체 반환 가능
// 추후 메인 /api/codes 와 합치고 싶다면 fetch 프록시로 교체
const codeMap: Record<string, Record<string, string>> = {}

export async function GET() {
  return NextResponse.json({ success: true, codeMap })
}

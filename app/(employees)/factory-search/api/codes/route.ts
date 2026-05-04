import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// 서버 측 코드 마스터. 실제 운영 시 DB(코드 마스터 테이블) 조회로 교체.
const codeMap: Record<string, Record<string, string>> = {
  // 클라이언트 FALLBACK과 합쳐지므로, 여기는 비워두거나 추가 코드만 둘 수 있음.
}

export async function GET() {
  return NextResponse.json({ success: true, codeMap })
}

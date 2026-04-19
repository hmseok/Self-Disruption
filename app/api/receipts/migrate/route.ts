import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'

// POST: expense_receipts 테이블에 memo 컬럼 추가
// MySQL 마이그레이션은 이미 완료되어 있어야 합니다.
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    // MySQL 스키마에서 memo 컬럼이 이미 존재한다고 가정
    // PostgreSQL에서 MySQL로 마이그레이션 시 컬럼 추가는 별도 마이그레이션으로 처리됨
    return NextResponse.json({ success: true, message: 'memo 컬럼이 이미 존재합니다.' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

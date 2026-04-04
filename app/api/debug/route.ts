import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  const results: any = { timestamp: new Date().toISOString(), buildVersion: 'v5-native-crypto' }

  // 1. Authorization 헤더 확인
  const authHeader = request.headers.get('authorization')
  results.authHeader = authHeader ? `Bearer ${authHeader.substring(7, 20)}...` : 'MISSING'

  // 2. auth-server.ts의 verifyUser 직접 호출 테스트
  try {
    const user = await verifyUser(request)
    results.verifyUserResult = user ? { id: user.id, role: user.role } : 'NULL'
  } catch (e: any) {
    results.verifyUserError = e.message
  }

  // 3. 인라인 인증 (profiles/me와 동일한 로직)
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken')
      const token = authHeader.replace('Bearer ', '')
      const secret = process.env.JWT_SECRET || 'fmi_dev_secret_change_in_production'
      const decoded = jwt.verify(token, secret) as any
      const userId = decoded.sub || decoded.userId || null
      results.inlineVerify = { userId, email: decoded.email, role: decoded.role }

      if (userId) {
        const profiles = await prisma.$queryRaw<any[]>`
          SELECT id, email, role FROM profiles WHERE id = ${userId} LIMIT 1
        `
        results.profileLookup = profiles.length > 0 ? profiles[0] : 'NOT FOUND'
      }
    } catch (e: any) {
      results.inlineVerifyError = e.message
    }
  }

  // 4. 모듈 상태
  results.jwtSecretSet = !!process.env.JWT_SECRET
  results.jwtSecretLength = (process.env.JWT_SECRET || '').length

  try {
    const dbTest = await prisma.$queryRaw<any[]>`SELECT 1 as ok`
    results.dbConnection = 'OK'
  } catch (e: any) {
    results.dbConnection = `FAIL: ${e.message}`
  }

  return NextResponse.json(results)
}

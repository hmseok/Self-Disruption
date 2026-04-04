import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const results: any = { timestamp: new Date().toISOString() }

  // 1. Authorization 헤더 확인
  const authHeader = request.headers.get('authorization')
  results.authHeader = authHeader ? `Bearer ${authHeader.substring(7, 20)}...` : 'MISSING'

  // 2. 토큰 디코딩 (base64)
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.replace('Bearer ', '')
      const parts = token.split('.')
      results.tokenParts = parts.length
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
        results.tokenPayload = {
          sub: payload.sub || 'MISSING',
          email: payload.email || 'MISSING',
          role: payload.role || 'MISSING',
          exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'MISSING',
        }
      }
    } catch (e: any) {
      results.tokenError = e.message
    }
  }

  // 3. jsonwebtoken 모듈 확인
  try {
    const jwt = require('jsonwebtoken')
    results.jwtModule = 'require OK'
    // 간단한 sign/verify 테스트
    const testToken = jwt.sign({ test: true }, 'test-secret')
    const decoded = jwt.verify(testToken, 'test-secret')
    results.jwtSignVerify = decoded.test === true ? 'OK' : 'FAIL'
  } catch (e: any) {
    results.jwtModule = `require FAIL: ${e.message}`
  }

  // 4. import 방식 확인
  try {
    const jwtImport = await import('jsonwebtoken')
    results.jwtImport = jwtImport.verify ? 'import OK' : 'import PARTIAL'
  } catch (e: any) {
    results.jwtImport = `import FAIL: ${e.message}`
  }

  // 5. JWT_SECRET 확인
  results.jwtSecretSet = !!process.env.JWT_SECRET
  results.jwtSecretLength = (process.env.JWT_SECRET || '').length

  // 6. 실제 토큰 검증 테스트
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken')
      const token = authHeader.replace('Bearer ', '')
      const secret = process.env.JWT_SECRET || 'fmi_dev_secret_change_in_production'
      const decoded = jwt.verify(token, secret)
      results.verifyResult = { sub: decoded.sub, email: decoded.email, role: decoded.role }
    } catch (e: any) {
      results.verifyError = e.message
    }
  }

  // 7. DB 연결 확인
  try {
    const dbTest = await prisma.$queryRaw<any[]>`SELECT 1 as ok`
    results.dbConnection = 'OK'
  } catch (e: any) {
    results.dbConnection = `FAIL: ${e.message}`
  }

  // 8. 프로필 테이블 확인
  if (results.tokenPayload?.sub && results.tokenPayload.sub !== 'MISSING') {
    try {
      const profiles = await prisma.$queryRaw<any[]>`
        SELECT id, email, role FROM profiles WHERE id = ${results.tokenPayload.sub} LIMIT 1
      `
      results.profileLookup = profiles.length > 0 ? profiles[0] : 'NOT FOUND'
    } catch (e: any) {
      results.profileLookup = `FAIL: ${e.message}`
    }
  }

  return NextResponse.json(results)
}

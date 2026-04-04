import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser, getUserIdFromToken, lastVerifyError } from '@/lib/auth-server'
import crypto from 'crypto'

const JWT_SECRET = process.env.JWT_SECRET || 'fmi_dev_secret_change_in_production'

export async function GET(request: NextRequest) {
  const results: any = { buildVersion: 'v6-deep-debug' }

  const authHeader = request.headers.get('authorization')
  results.authHeader = authHeader ? 'present' : 'MISSING'

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ ...results, error: 'no auth header' })
  }

  const token = authHeader.replace('Bearer ', '')

  // Test 1: auth-server.ts verifyUser (the one that fails)
  try {
    const user = await verifyUser(request)
    results.test1_verifyUser = user ? { id: user.id, role: user.role } : 'NULL'
    results.test1_lastError = lastVerifyError
  } catch (e: any) {
    results.test1_error = e.message
    results.test1_lastError = lastVerifyError
  }

  // Test 2: auth-server.ts getUserIdFromToken
  try {
    const uid = getUserIdFromToken(token)
    results.test2_getUserId = uid || 'NULL'
  } catch (e: any) {
    results.test2_error = e.message
  }

  // Test 3: inline base64 decode (no verification)
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    results.test3_base64 = { sub: payload.sub, email: payload.email }
  } catch (e: any) {
    results.test3_error = e.message
  }

  // Test 4: inline crypto verification (same logic as auth-server.ts)
  try {
    const parts = token.split('.')
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    results.test4_header = header

    const signatureInput = parts[0] + '.' + parts[1]
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(signatureInput).digest('base64url')
    const actualSig = parts[2]
    results.test4_sigMatch = expectedSig === actualSig
    results.test4_expectedSig = expectedSig.substring(0, 20)
    results.test4_actualSig = actualSig.substring(0, 20)
  } catch (e: any) {
    results.test4_error = e.message
  }

  // Test 5: is crypto module available?
  try {
    results.test5_crypto = typeof crypto.createHmac === 'function' ? 'OK' : 'NOT FUNCTION'
  } catch (e: any) {
    results.test5_error = e.message
  }

  // Test 6: require jsonwebtoken inline and verify
  try {
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, JWT_SECRET)
    results.test6_requireJwt = { sub: decoded.sub, email: decoded.email }
  } catch (e: any) {
    results.test6_error = e.message
  }

  return NextResponse.json(results)
}

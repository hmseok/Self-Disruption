import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { codefRequest } from '../lib/auth'
import { encryptPassword } from '../lib/crypto'

// Organization codes mapping
const ORG_CODES: Record<string, { code: string; name: string; type: 'bank' | 'card'; businessType: string }> = {
  '0020': { code: '0020', name: '우리은행',  type: 'bank', businessType: 'BK' },
  '0004': { code: '0004', name: '국민은행',  type: 'bank', businessType: 'BK' },
  '0019': { code: '0019', name: '우리카드',  type: 'card', businessType: 'CD' },
  '0381': { code: '0381', name: '국민카드',  type: 'card', businessType: 'CD' },
  '0041': { code: '0041', name: '현대카드',  type: 'card', businessType: 'CD' },
}

function isCodefSuccess(result: any): boolean {
  return result?.result?.code === 'CF-00000'
}

function getCodefError(result: any): string {
  const code = result?.result?.code || ''
  const message = result?.result?.message || ''
  if (code || message) return `[${code}] ${message}`.trim()
  return JSON.stringify(result)
}

// POST: Create or add account to connectedId
export async function POST(req: NextRequest) {
  try {
    const {
      action,
      orgCode,
      loginType,
      loginId,
      password,
      certFile,
      keyFile,
      certPassword,
      identity,
      accountNumber,
      connectedId,
    } = await req.json()

    const orgInfo = ORG_CODES[orgCode]
    if (!orgInfo) {
      return NextResponse.json({ error: 'Invalid organization code' }, { status: 400 })
    }

    const cleanAccountNumber = accountNumber?.replace(/-/g, '') || ''
    const usedLoginType = loginType || '1'
    const cleanIdentity = identity?.replace(/-/g, '') || ''

    let baseParams: Record<string, string>

    if (usedLoginType === '0') {
      const encryptedCertPassword = encryptPassword(certPassword)
      baseParams = {
        countryCode: 'KR',
        businessType: orgInfo.businessType,
        clientType: 'B',
        organization: orgCode,
        loginType: '0',
        certType: '1',
        certFile,
        keyFile,
        certPassword: encryptedCertPassword,
        ...(cleanIdentity && { identity: cleanIdentity }),
      }
    } else {
      const encryptedPassword = encryptPassword(password)
      baseParams = {
        countryCode: 'KR',
        businessType: orgInfo.businessType,
        clientType: 'B',
        organization: orgCode,
        loginType: '1',
        id: loginId,
        password: encryptedPassword,
        ...(cleanIdentity && { identity: cleanIdentity }),
      }
    }

    let result
    if (action === 'create') {
      result = await codefRequest('/v1/account/create', baseParams)
      console.log('[Codef] create 응답:', JSON.stringify(result))

      if (isCodefSuccess(result)) {
        const newConnectedId = result.data?.connectedId
        if (!newConnectedId) {
          return NextResponse.json({ error: 'connectedId를 받지 못했습니다.' }, { status: 400 })
        }

        await prisma.codefConnection.create({
          data: {
            connected_id: newConnectedId,
            org_type: orgInfo.type,
            org_code: orgCode,
            org_name: orgInfo.name,
            account_number: cleanAccountNumber || accountNumber,
            is_active: true,
          },
        })

        return NextResponse.json(
          { success: true, connectedId: newConnectedId, message: '계정이 정상적으로 연동되었습니다.' },
          { status: 200 }
        )
      } else {
        return NextResponse.json({ error: getCodefError(result), raw: result }, { status: 400 })
      }

    } else if (action === 'add') {
      if (!connectedId) {
        return NextResponse.json({ error: 'connectedId is required for add action' }, { status: 400 })
      }

      result = await codefRequest('/v1/account/add', { ...baseParams, connectedId })
      console.log('[Codef] add 응답:', JSON.stringify(result))

      if (isCodefSuccess(result)) {
        await prisma.codefConnection.create({
          data: {
            connected_id: connectedId,
            org_type: orgInfo.type,
            org_code: orgCode,
            org_name: orgInfo.name,
            account_number: cleanAccountNumber || accountNumber,
            is_active: true,
          },
        })

        return NextResponse.json(
          { success: true, connectedId, message: '계정이 추가되었습니다.' },
          { status: 200 }
        )
      } else {
        return NextResponse.json({ error: getCodefError(result), raw: result }, { status: 400 })
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Codef connect error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET: List connected accounts
export async function GET() {
  try {
    const connections = await prisma.codefConnection.findMany({
      where: { is_active: true },
    })
    return NextResponse.json({ connections }, { status: 200 })
  } catch (error) {
    console.error('Codef list error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE: Remove account
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    await prisma.codefConnection.update({
      where: { id },
      data: { is_active: false },
    })

    return NextResponse.json({ success: true, message: '계정이 해제되었습니다.' }, { status: 200 })
  } catch (error) {
    console.error('Codef delete error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

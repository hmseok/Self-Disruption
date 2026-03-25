import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { codefRequest } from '../lib/auth'
import { encryptPassword } from '../lib/crypto'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Organization codes mapping
const ORG_CODES: Record<string, { code: string; name: string; type: 'bank' | 'card'; businessType: string }> = {
  '0020': { code: '0020', name: '우리은행',  type: 'bank', businessType: 'BK' },
  '0004': { code: '0004', name: '국민은행',  type: 'bank', businessType: 'BK' },
  '0019': { code: '0019', name: '우리카드',  type: 'card', businessType: 'CD' },
  '0381': { code: '0381', name: '국민카드',  type: 'card', businessType: 'CD' },
  '0041': { code: '0041', name: '현대카드',  type: 'card', businessType: 'CD' },
}

// Codef 응답 성공 여부 확인 (CF-00000 = 성공)
function isCodefSuccess(result: any): boolean {
  return result?.result?.code === 'CF-00000'
}

// Codef 응답에서 에러 메시지 추출 (코드 + 메시지 함께)
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
      action,        // 'create' | 'add'
      orgCode,
      loginType,     // '0' = 공동인증서, '1' = ID/비밀번호
      loginId,       // loginType '1': 인터넷뱅킹 로그인 아이디
      password,      // loginType '1': 인터넷뱅킹 비밀번호
      certFile,      // loginType '0': signCert.der base64
      keyFile,       // loginType '0': signPri.key base64
      certPassword,  // loginType '0': 인증서 비밀번호
      identity,      // 사업자등록번호 (기업 계정 필수, 하이픈 없이)
      accountNumber, // 계좌/카드번호 (DB 저장용, 거래내역 조회 시 사용)
      connectedId,
    } = await req.json()

    const orgInfo = ORG_CODES[orgCode]
    if (!orgInfo) {
      return NextResponse.json({ error: 'Invalid organization code' }, { status: 400 })
    }

    // 계좌/카드번호에서 하이픈 제거 (DB 저장 및 거래내역 조회용)
    const cleanAccountNumber = accountNumber?.replace(/-/g, '') || ''

    const usedLoginType = loginType || '1'

    let baseParams: Record<string, string>

    // 사업자등록번호 정리 (하이픈 제거)
    const cleanIdentity = identity?.replace(/-/g, '') || ''

    if (usedLoginType === '0') {
      // 공동인증서 방식
      const encryptedCertPassword = encryptPassword(certPassword)
      baseParams = {
        countryCode: 'KR',
        businessType: orgInfo.businessType,
        clientType: 'B',                   // B: 기업 (은행기업 인증서)
        organization: orgCode,
        loginType: '0',
        certType: '1',                     // 1 = 공동인증서
        certFile: certFile,                // signCert.der base64
        keyFile: keyFile,                  // signPri.key base64
        certPassword: encryptedCertPassword,
        ...(cleanIdentity && { identity: cleanIdentity }), // 사업자등록번호
      }
    } else {
      // ID/비밀번호 방식
      const encryptedPassword = encryptPassword(password)
      baseParams = {
        countryCode: 'KR',
        businessType: orgInfo.businessType,
        clientType: 'B',                   // B: 기업
        organization: orgCode,
        loginType: '1',
        id: loginId,
        password: encryptedPassword,
        ...(cleanIdentity && { identity: cleanIdentity }), // 사업자등록번호
      }
    }

    let result
    if (action === 'create') {
      // 새 connectedId 생성
      result = await codefRequest('/v1/account/create', baseParams)

      console.log('[Codef] create 응답:', JSON.stringify(result))

      if (isCodefSuccess(result)) {
        const newConnectedId = result.data?.connectedId
        if (!newConnectedId) {
          return NextResponse.json({ error: 'connectedId를 받지 못했습니다.' }, { status: 400 })
        }

        await getSupabase().from('codef_connections').insert({
          connected_id: newConnectedId,
          org_type: orgInfo.type,
          org_code: orgCode,
          org_name: orgInfo.name,
          account_number: accountNumber,
          is_active: true,
        })

        return NextResponse.json(
          { success: true, connectedId: newConnectedId, message: '계정이 정상적으로 연동되었습니다.' },
          { status: 200 }
        )
      } else {
        return NextResponse.json(
          { error: getCodefError(result), raw: result },
          { status: 400 }
        )
      }

    } else if (action === 'add') {
      // 기존 connectedId에 계정 추가
      if (!connectedId) {
        return NextResponse.json({ error: 'connectedId is required for add action' }, { status: 400 })
      }

      result = await codefRequest('/v1/account/add', {
        ...baseParams,
        connectedId,
      })

      console.log('[Codef] add 응답:', JSON.stringify(result))

      if (isCodefSuccess(result)) {
        await getSupabase().from('codef_connections').insert({
          connected_id: connectedId,
          org_type: orgInfo.type,
          org_code: orgCode,
          org_name: orgInfo.name,
          account_number: accountNumber,
          is_active: true,
        })

        return NextResponse.json(
          { success: true, connectedId, message: '계정이 추가되었습니다.' },
          { status: 200 }
        )
      } else {
        return NextResponse.json(
          { error: getCodefError(result), raw: result },
          { status: 400 }
        )
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
    const { data, error } = await getSupabase()
      .from('codef_connections')
      .select('*')
      .eq('is_active', true)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ connections: data }, { status: 200 })
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

    const { error } = await getSupabase()
      .from('codef_connections')
      .update({ is_active: false })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: '계정이 해제되었습니다.' }, { status: 200 })
  } catch (error) {
    console.error('Codef delete error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWithTemplate } from '../../../utils/messaging'

// ============================================
// 정산 완료 알림 발송 API
// POST → 정산 완료된 건에 대해 SMS/이메일 발송
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await getSupabaseAdmin()
    .from('profiles').select('role, company_id').eq('id', user.id).single()
  if (!profile || !['god_admin', 'master'].includes(profile.role)) return null
  return { ...user, role: profile.role, company_id: profile.company_id }
}

type NotifyItem = {
  type: 'jiip' | 'invest'
  relatedId: string
  name: string
  amount: number
  dueDate: string
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    const body = await request.json()
    const { items, channel = 'sms', company_id } = body as {
      items: NotifyItem[]
      channel: 'sms' | 'email'
      company_id: string
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items 배열 필수' }, { status: 400 })
    }
    if (!company_id) {
      return NextResponse.json({ error: 'company_id 필수' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // 회사명 조회
    const { data: company } = await sb.from('companies').select('name').eq('id', company_id).single()
    const companyName = company?.name || '회사'

    const results: { name: string; success: boolean; error?: string }[] = []

    for (const item of items) {
      try {
        // 계약 정보에서 연락처 조회
        const tableName = item.type === 'jiip' ? 'jiip_contracts' : 'general_investments'
        const { data: contract } = await sb
          .from(tableName)
          .select('*')
          .eq('id', item.relatedId)
          .single()

        if (!contract) {
          results.push({ name: item.name, success: false, error: '계약 정보 없음' })
          continue
        }

        const phone = contract.investor_phone || contract.phone || ''
        const email = contract.investor_email || contract.email || ''
        const recipient = channel === 'sms' ? phone : email

        if (!recipient) {
          results.push({ name: item.name, success: false, error: `${channel === 'sms' ? '전화번호' : '이메일'} 없음` })
          continue
        }

        const variables: Record<string, string> = {
          company_name: companyName,
          customer_name: item.name,
          settlement_amount: Number(item.amount).toLocaleString(),
          settlement_date: item.dueDate,
          settlement_type: item.type === 'jiip' ? '지입 정산금' : '투자 이자',
        }

        const sendResult = await sendWithTemplate({
          companyId: company_id,
          templateKey: 'settlement_complete',
          channel,
          recipient,
          recipientName: item.name,
          variables,
          relatedType: item.type,
          relatedId: item.relatedId,
          sentBy: admin.id,
        })

        results.push({
          name: item.name,
          success: sendResult.success,
          error: sendResult.error,
        })
      } catch (err: any) {
        results.push({ name: item.name, success: false, error: err.message })
      }
    }

    const sent = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      success: true,
      total: results.length,
      sent,
      failed,
      results,
    })
  } catch (err: any) {
    console.error('[settlement/notify] 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

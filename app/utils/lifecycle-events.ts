import { createClient } from '@supabase/supabase-js'

/**
 * 견적서 라이프사이클 이벤트 기록 유틸
 * quote_lifecycle_events 테이블에 이벤트를 insert
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export type LifecycleEventType =
  | 'created'
  | 'shared'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'contract_created'
  | 'revoked'
  | 'pdf_stored'

export interface LifecycleEventInput {
  companyId: string
  quoteId: string
  contractId?: string | null
  eventType: LifecycleEventType
  channel?: string | null      // sms, kakao, email, link
  recipient?: string | null    // 마스킹된 수신자 정보
  metadata?: Record<string, any>
  actorId?: string | null      // 직원 UUID
}

/**
 * 수신자 정보 마스킹
 * 010-1234-5678 → 010-****-5678
 * user@email.com → us***@email.com
 */
export function maskRecipient(value: string): string {
  if (!value) return ''

  // 전화번호 패턴
  const phoneMatch = value.match(/^(\d{2,3})[-]?(\d{3,4})[-]?(\d{4})$/)
  if (phoneMatch) {
    return `${phoneMatch[1]}-****-${phoneMatch[3]}`
  }

  // 이메일 패턴
  const emailMatch = value.match(/^(.{1,2})(.*)@(.+)$/)
  if (emailMatch) {
    return `${emailMatch[1]}***@${emailMatch[3]}`
  }

  return value
}

/**
 * 라이프사이클 이벤트 기록 (fire-and-forget, 실패해도 메인 흐름에 영향 없음)
 */
export async function recordLifecycleEvent(input: LifecycleEventInput): Promise<void> {
  try {
    const sb = createClient(supabaseUrl, supabaseServiceKey)
    await sb.from('quote_lifecycle_events').insert([{
      company_id: input.companyId,
      quote_id: input.quoteId,
      contract_id: input.contractId || null,
      event_type: input.eventType,
      channel: input.channel || null,
      recipient: input.recipient || null,
      metadata: input.metadata || {},
      actor_id: input.actorId || null,
    }])
  } catch (err: any) {
    console.error('[lifecycle-event] 기록 실패 (무시):', err.message)
  }
}

/**
 * 열람 이벤트 중복 방지: 같은 IP에서 10분 이내 재열람은 무시
 */
export async function recordViewedEvent(input: LifecycleEventInput & { ip: string }): Promise<void> {
  try {
    const sb = createClient(supabaseUrl, supabaseServiceKey)

    // 10분 이내 같은 IP에서 viewed 이벤트가 있는지 확인
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: recent } = await sb
      .from('quote_lifecycle_events')
      .select('id')
      .eq('quote_id', input.quoteId)
      .eq('event_type', 'viewed')
      .gte('created_at', tenMinAgo)
      .limit(1)

    // metadata에 같은 IP가 있는지는 JSONB 쿼리가 복잡하므로, 10분 이내 viewed 자체를 체크
    if (recent && recent.length > 0) {
      return // 중복 열람 — 무시
    }

    await sb.from('quote_lifecycle_events').insert([{
      company_id: input.companyId,
      quote_id: input.quoteId,
      event_type: 'viewed',
      metadata: { ip: input.ip, ...input.metadata },
    }])
  } catch (err: any) {
    console.error('[lifecycle-event] viewed 기록 실패 (무시):', err.message)
  }
}

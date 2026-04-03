import { prisma } from '@/lib/prisma'

export type LifecycleEventType =
  | 'created' | 'shared' | 'sent' | 'viewed' | 'signed'
  | 'contract_created' | 'revoked' | 'pdf_stored'

export interface LifecycleEventInput {
  companyId: string
  quoteId: string
  contractId?: string | null
  eventType: LifecycleEventType
  channel?: string | null
  recipient?: string | null
  metadata?: Record<string, any>
  actorId?: string | null
}

export function maskRecipient(value: string): string {
  if (!value) return ''
  const phoneMatch = value.match(/^(\d{2,3})[-]?(\d{3,4})[-]?(\d{4})$/)
  if (phoneMatch) return `${phoneMatch[1]}-****-${phoneMatch[3]}`
  const emailMatch = value.match(/^(.{1,2})(.*)@(.+)$/)
  if (emailMatch) return `${emailMatch[1]}***@${emailMatch[3]}`
  return value
}

export async function recordLifecycleEvent(input: LifecycleEventInput): Promise<void> {
  try {
    await (prisma as any).quoteLifecycleEvent.create({
      data: {
        quote_id: input.quoteId,
        contract_id: input.contractId || null,
        event_type: input.eventType,
        channel: input.channel || null,
        recipient: input.recipient || null,
        metadata: input.metadata || {},
        actor_id: input.actorId || null,
      },
    })
  } catch (err: any) {
    console.error('[lifecycle-event] 기록 실패 (무시):', err.message)
  }
}

export async function recordViewedEvent(input: LifecycleEventInput & { ip: string }): Promise<void> {
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
    const recent = await (prisma as any).quoteLifecycleEvent.findFirst({
      where: { quote_id: input.quoteId, event_type: 'viewed', created_at: { gte: tenMinAgo } },
    })
    if (recent) return

    await (prisma as any).quoteLifecycleEvent.create({
      data: {
        quote_id: input.quoteId,
        event_type: 'viewed',
        metadata: { ip: input.ip, ...(input.metadata || {}) },
      },
    })
  } catch (err: any) {
    console.error('[lifecycle-event] viewed 기록 실패 (무시):', err.message)
  }
}

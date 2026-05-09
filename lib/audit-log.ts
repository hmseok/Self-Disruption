/**
 * lib/audit-log.ts — 라이드 모듈 공용 audit log 기록 helper
 *
 * 사용:
 *   await logAuditChanges('ride_capital_reports', recordId, changes, user)
 *   await logAuditAction('ride_contracts', recordId, 'delete', user)
 *
 * PR-6.10.g
 */
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

export interface AuditUser {
  id: string
  name?: string
}

/**
 * 변경 set 을 기록 (각 필드 1 row)
 */
export async function logAuditChanges(
  tableName: string,
  recordId: string,
  changes: Record<string, { old: unknown; new: unknown }>,
  user: AuditUser
): Promise<void> {
  const entries = Object.entries(changes).filter(
    ([, v]) => String(v.old ?? '') !== String(v.new ?? '')
  )
  if (entries.length === 0) return

  for (const [field, { old, new: newVal }] of entries) {
    try {
      await prisma.$executeRaw`
        INSERT INTO ride_audit_logs
          (id, table_name, record_id, action, field_name, old_value, new_value,
           changed_by, changed_by_name)
        VALUES
          (${randomUUID()}, ${tableName}, ${recordId}, 'update', ${field},
           ${old === null || old === undefined ? null : String(old)},
           ${newVal === null || newVal === undefined ? null : String(newVal)},
           ${user.id}, ${user.name || null})
      `
    } catch (e) {
      // audit log 실패해도 본 작업은 차단 X
      console.warn('[audit-log] insert failed', tableName, field, (e as Error).message)
    }
  }
}

/**
 * 단일 액션 기록 (insert / delete)
 */
export async function logAuditAction(
  tableName: string,
  recordId: string,
  action: 'insert' | 'delete',
  user: AuditUser,
  note?: string
): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO ride_audit_logs
        (id, table_name, record_id, action, field_name, new_value, changed_by, changed_by_name)
      VALUES
        (${randomUUID()}, ${tableName}, ${recordId}, ${action}, NULL,
         ${note || null}, ${user.id}, ${user.name || null})
    `
  } catch (e) {
    console.warn('[audit-log] action failed', tableName, action, (e as Error).message)
  }
}

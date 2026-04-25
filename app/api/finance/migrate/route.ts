import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════
// Finance 마이그레이션 API — 테이블 생성/변경
// POST /api/finance/migrate (인증 필수)
// ═══════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results: string[] = []

  // 1. bank_account_mappings 테이블
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS bank_account_mappings (
        id CHAR(36) NOT NULL PRIMARY KEY,
        account_alias VARCHAR(64) NOT NULL,
        bank_issuer VARCHAR(16) NOT NULL,
        bank_name VARCHAR(32),
        account_holder VARCHAR(64),
        assigned_car_id CHAR(36),
        purpose VARCHAR(32),
        memo VARCHAR(255),
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_account_alias (account_alias),
        KEY idx_bank_mappings_car (assigned_car_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    results.push('bank_account_mappings: OK')
  } catch (e: any) {
    results.push(`bank_account_mappings: ${e.message}`)
  }

  // 2. corporate_cards.card_issuer 컬럼
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE corporate_cards ADD COLUMN card_issuer VARCHAR(16) AFTER card_alias
    `)
    results.push('corporate_cards.card_issuer: ADDED')
  } catch (e: any) {
    if (e.message?.includes('Duplicate column')) {
      results.push('corporate_cards.card_issuer: EXISTS')
    } else {
      results.push(`corporate_cards.card_issuer: ${e.message}`)
    }
  }

  return NextResponse.json({ ok: true, results })
}

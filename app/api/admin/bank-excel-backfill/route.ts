import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * /api/admin/bank-excel-backfill
 *
 * 기존에 업로드된 통장 엑셀 거래 (transactions.imported_from='excel_bank') 의
 * raw_data 에 _account_last4 / _account_number / _bank_alias 메타를 backfill.
 *
 * 사용 시나리오:
 *   - 2026-05-02 BANK-FIX 이전에 업로드된 통장 거래는 raw_data 에 메타 없음
 *   - bank_account_mappings 의 매핑은 등록되어 있지만 last4 매칭이 SQL JOIN 시점에 실패
 *   - 이 API 가 매핑의 last4 를 raw_data 에 강제 backfill → JOIN 매칭 가능
 *
 * 단일 회사 ERP 라서 매핑이 1~2개 일 가능성 높음.
 *   매핑 1개  → 모든 excel_bank 거래에 자동 적용
 *   매핑 N개  → bank_name 으로 매칭 (우리은행 거래 → 우리은행 매핑)
 *
 * GET  : 진단 (mappings 목록 + 거래 통계)
 * POST : apply
 */

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    // 1) 매핑 목록 — bank_account_mappings 는 deleted_at 컬럼 없음 (schema:BankAccountMapping)
    const mappings = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, bank_name, account_number, account_alias, account_holder, purpose, assigned_car_id
      FROM bank_account_mappings
      ORDER BY bank_name, account_alias
    `)

    // 2) excel_bank 거래 통계 (raw_data 메타 보유 여부)
    const stats = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        bank_name,
        COUNT(*) AS total,
        SUM(CASE WHEN raw_data IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$._account_last4')) IS NOT NULL THEN 1 ELSE 0 END) AS has_meta,
        SUM(CASE WHEN raw_data IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$._account_last4')) IS NULL THEN 1 ELSE 0 END) AS missing_meta
      FROM transactions
      WHERE deleted_at IS NULL AND imported_from = 'excel_bank'
      GROUP BY bank_name
      ORDER BY total DESC
    `)

    // BigInt → Number 변환
    const statsNorm = stats.map(s => ({
      bank_name: s.bank_name,
      total: Number(s.total),
      has_meta: Number(s.has_meta),
      missing_meta: Number(s.missing_meta),
    }))

    return NextResponse.json({
      mappings: mappings.map(m => ({
        ...m,
        last4: (() => {
          const digits1 = String(m.account_number || '').replace(/\D/g, '')
          const digits2 = String(m.account_alias || '').replace(/\D/g, '')
          if (digits1.length >= 4) return digits1.slice(-4)
          if (digits2.length >= 4) return digits2.slice(-4)
          return null
        })(),
      })),
      stats: statsNorm,
    })
  } catch (e: any) {
    console.error('[bank-excel-backfill GET]', e)
    return NextResponse.json({ error: e.message || 'GET 실패' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const dryRun = !!body.dryRun
    const explicitMappingId: string | null = body.mapping_id || null

    // 1) 매핑 조회
    const mappings = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, bank_name, account_number, account_alias, account_holder
      FROM bank_account_mappings
    `)
    if (mappings.length === 0) {
      return NextResponse.json({ error: '등록된 통장 매핑이 없습니다. 먼저 매핑을 등록하세요.' }, { status: 400 })
    }

    // 매핑별 last4 추출
    const mappingsWithLast4 = mappings.map(m => {
      const digits1 = String(m.account_number || '').replace(/\D/g, '')
      const digits2 = String(m.account_alias || '').replace(/\D/g, '')
      let last4: string | null = null
      if (digits1.length >= 4) last4 = digits1.slice(-4)
      else if (digits2.length >= 4) last4 = digits2.slice(-4)
      return { ...m, last4 }
    }).filter(m => m.last4) // last4 없는 매핑 제외

    // 2) 매칭할 매핑 결정
    let targetMapping: any = null
    if (explicitMappingId) {
      targetMapping = mappingsWithLast4.find(m => m.id === explicitMappingId)
      if (!targetMapping) return NextResponse.json({ error: '지정한 매핑을 찾을 수 없습니다.' }, { status: 404 })
    } else if (mappingsWithLast4.length === 1) {
      targetMapping = mappingsWithLast4[0]
    }
    // else: 매핑 N개 → bank_name 으로 자동 매칭 (per-row)

    // 3) backfill 대상 조회
    const targets = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, bank_name, raw_data
      FROM transactions
      WHERE deleted_at IS NULL
        AND imported_from = 'excel_bank'
        AND (raw_data IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$._account_last4')) IS NULL)
      LIMIT 5000
    `)

    let updated = 0
    let skippedNoMatch = 0
    const sampleUpdates: any[] = []
    const sampleSkips: any[] = []

    for (const tx of targets) {
      // 매핑 결정
      let mapping = targetMapping
      if (!mapping) {
        // bank_name 으로 매핑 추측
        mapping = mappingsWithLast4.find(m =>
          m.bank_name && tx.bank_name &&
          String(m.bank_name).replace(/은행$/, '') === String(tx.bank_name).replace(/은행$/, '')
        )
      }

      if (!mapping) {
        skippedNoMatch++
        if (sampleSkips.length < 5) {
          sampleSkips.push({ id: tx.id, bank_name: tx.bank_name, reason: 'no_matching_mapping' })
        }
        continue
      }

      // raw_data 갱신
      let rawObj: any = {}
      if (tx.raw_data) {
        try {
          rawObj = typeof tx.raw_data === 'string' ? JSON.parse(tx.raw_data) : tx.raw_data
        } catch {
          rawObj = {}
        }
      }
      rawObj._account_last4 = mapping.last4
      if (mapping.account_number) rawObj._account_number = String(mapping.account_number).trim()
      if (mapping.account_holder) rawObj._account_holder = String(mapping.account_holder).trim()
      if (mapping.bank_name) rawObj._bank_alias = `${mapping.bank_name} ${mapping.last4}`

      if (sampleUpdates.length < 5) {
        sampleUpdates.push({
          id: tx.id,
          bank_name: tx.bank_name,
          mapping_id: mapping.id,
          new_last4: mapping.last4,
        })
      }

      if (!dryRun) {
        await prisma.$executeRawUnsafe(
          `UPDATE transactions SET raw_data = ?, updated_at = NOW() WHERE id = ?`,
          JSON.stringify(rawObj),
          tx.id
        )
      }
      updated++
    }

    return NextResponse.json({
      dryRun,
      target_count: targets.length,
      updated,
      skipped_no_match: skippedNoMatch,
      sample_updates: sampleUpdates,
      sample_skips: sampleSkips,
      target_mapping: targetMapping ? {
        id: targetMapping.id,
        bank_name: targetMapping.bank_name,
        last4: targetMapping.last4,
      } : 'auto-by-bank-name',
    })
  } catch (e: any) {
    console.error('[bank-excel-backfill POST]', e)
    return NextResponse.json({ error: e.message || 'POST 실패' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * /api/admin/bank-excel-backfill — REVERT 전용 도구
 *
 * 배경:
 *   초기 버전은 매핑 1개일 때 모든 통장 거래에 무조건 적용했음.
 *   하지만 한 회사가 여러 통장 (8777, 3582 등) 을 가질 수 있고,
 *   기존 거래는 어느 통장에서 온 건지 알 길이 없음 (raw_data 메타 없음).
 *   "기준없이 그냥 매핑" 되는 부정확한 결과 → 사용자 명령으로 apply 모드 제거.
 *
 * 정확한 흐름:
 *   1. 이 API 로 잘못된 backfill 결과 정리 (revert)
 *   2. 통장 엑셀 파일 그대로 재업로드
 *   3. 새 코드가 파일 상단의 「계좌번호 : XXXX」 를 raw_data 에 정확하게 저장
 *   4. SQL JOIN 이 자동 매칭
 *
 * GET  : 진단 (현재 raw_data 메타 보유 거래 수)
 * POST { revert: true, dryRun?: bool } : raw_data 의 메타 키 제거
 */

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    // raw_data 에 backfill 메타 키가 있는 통장 거래 통계
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

    const statsNorm = stats.map(s => ({
      bank_name: s.bank_name,
      total: Number(s.total),
      has_meta: Number(s.has_meta),
      missing_meta: Number(s.missing_meta),
    }))

    return NextResponse.json({ stats: statsNorm })
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
    const revert = !!body.revert

    // apply 모드는 의도적으로 제거 — 부정확한 추측 매핑 방지 (사용자 명령 2026-05-02)
    if (!revert) {
      return NextResponse.json({
        error: 'backfill apply 모드는 제거되었습니다. 정확한 매칭은 통장 엑셀 재업로드만 가능합니다. revert 만 지원합니다.',
      }, { status: 400 })
    }

    // raw_data 에서 _account_last4 / _account_number / _bank_alias / _account_holder 제거
    // (card_last4 등 다른 키는 유지)
    const targets = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, raw_data
      FROM transactions
      WHERE deleted_at IS NULL
        AND imported_from = 'excel_bank'
        AND raw_data IS NOT NULL
        AND (
          JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$._account_last4')) IS NOT NULL
          OR JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$._account_number')) IS NOT NULL
          OR JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$._bank_alias')) IS NOT NULL
          OR JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$._account_holder')) IS NOT NULL
        )
      LIMIT 5000
    `)

    let updated = 0
    for (const tx of targets) {
      let rawObj: any = {}
      try {
        rawObj = typeof tx.raw_data === 'string' ? JSON.parse(tx.raw_data) : tx.raw_data
      } catch {
        rawObj = {}
      }
      delete rawObj._account_last4
      delete rawObj._account_number
      delete rawObj._bank_alias
      delete rawObj._account_holder

      const newRaw = Object.keys(rawObj).length > 0 ? JSON.stringify(rawObj) : null

      if (!dryRun) {
        await prisma.$executeRawUnsafe(
          `UPDATE transactions SET raw_data = ?, updated_at = NOW() WHERE id = ?`,
          newRaw,
          tx.id
        )
      }
      updated++
    }

    return NextResponse.json({
      mode: 'revert',
      dryRun,
      target_count: targets.length,
      updated,
    })
  } catch (e: any) {
    console.error('[bank-excel-backfill POST]', e)
    return NextResponse.json({ error: e.message || 'POST 실패' }, { status: 500 })
  }
}

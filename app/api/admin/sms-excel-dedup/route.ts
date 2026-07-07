import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { loadDedupCandidates, findUniquePairs, findBankSelfDuplicates } from '@/lib/sms-excel-dedup'

// ═══════════════════════════════════════════════════════════════════
// SMS ↔ Excel 중복 거래 정리 API (관리자 전용)
//
//   GET  /api/admin/sms-excel-dedup?dryRun=true (기본)
//        → 1:1 매칭 페어 수, 모호 케이스 수, sample 5건 반환
//
//   POST /api/admin/sms-excel-dedup?apply=true&max=50
//        → Excel row 들을 soft-delete (deleted_at = NOW())
//          SMS row 는 유지 (사용자 결정 — SMS 가 더 정확)
//
// 안전망:
//   1) 1:1 unique 매칭만 처리 (모호한 1:N / N:1 / N:M 은 자동 skip)
//   2) Excel row 의 final_category 가 있으면 skip (사용자 수동 분류 보호)
//   3) max batch limit 200 강제
//   4) soft-delete (deleted_at) — 복원 가능
//   5) apply=true 명시 필수
// ═══════════════════════════════════════════════════════════════════

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// ─── GET: dry-run ─────────────────────────────────────────
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  try {
    const { smsRows, excelRows } = await loadDedupCandidates()
    const result = findUniquePairs(smsRows, excelRows)
    const selfDup = findBankSelfDuplicates(excelRows)  // 같은 출처 쌍둥이 (PR-BANK-DEDUP v2)

    return NextResponse.json({
      dryRun: true,
      total_sms: result.total_sms,
      total_excel: result.total_excel,
      self_dup: selfDup.delete_ids.length,
      will_delete_excel: result.pairs.length + selfDup.delete_ids.length,
      ambiguous: result.ambiguous,
      protected: result.protected,
      sample: serialize(result.pairs.slice(0, 5).map(p => ({
        date_diff_min: p.date_diff_min.toFixed(2),
        match_score: p.match_score.toFixed(2),
        sms: {
          id: p.sms.id,
          date: p.sms.transaction_date,
          desc: p.sms.description,
          amount: Number(p.sms.amount),
          card_company: p.sms.card_company,
        },
        excel_to_delete: {
          id: p.excel.id,
          date: p.excel.transaction_date,
          desc: p.excel.description,
          amount: Number(p.excel.amount),
          imported_from: p.excel.imported_from,
        },
      }))),
      note: 'POST /api/admin/sms-excel-dedup?apply=true&max=N 으로 실제 적용',
    })
  } catch (e: any) {
    console.error('[GET /api/admin/sms-excel-dedup]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── POST: apply ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  try {
    const sp = request.nextUrl.searchParams
    const apply = sp.get('apply') === 'true'
    const max = Math.min(Math.max(Number(sp.get('max') || 50), 1), 200)

    if (!apply) {
      return NextResponse.json(
        { error: 'apply=true 필수 (안전망)' },
        { status: 400 }
      )
    }

    const { smsRows, excelRows } = await loadDedupCandidates()
    const result = findUniquePairs(smsRows, excelRows)
    const selfDup = findBankSelfDuplicates(excelRows)  // 같은 출처 쌍둥이 (PR-BANK-DEDUP v2)

    let deleted = 0
    const errors: Array<{ id: string; reason: string }> = []
    const samples: any[] = []

    // 쌍둥이 삭제 (max 한도 공유)
    for (const id of selfDup.delete_ids.slice(0, max)) {
      try {
        await prisma.$executeRaw`
          UPDATE transactions SET deleted_at = NOW(), updated_at = NOW()
          WHERE id = ${id} AND deleted_at IS NULL
        `
        deleted++
      } catch (e: any) {
        errors.push({ id, reason: e?.message || 'unknown' })
      }
    }

    for (let i = 0; i < Math.min(result.pairs.length, Math.max(0, max - deleted)); i++) {
      const pair = result.pairs[i]
      // PR-BANK-DEDUP — delete_side 에 따라 삭제 (카드=excel 기존 동작, 은행=매칭·정보량 기준)
      const deleteId = pair.delete_side === 'sms' ? pair.sms.id : pair.excel.id
      try {
        await prisma.$executeRaw`
          UPDATE transactions SET
            deleted_at = NOW(),
            updated_at = NOW()
          WHERE id = ${deleteId} AND deleted_at IS NULL
        `
        deleted++
        if (samples.length < 5) {
          samples.push({
            deleted_side: pair.delete_side,
            deleted_id: deleteId,
            sms_desc: pair.sms.description,
            excel_desc: pair.excel.description,
            amount: Number(pair.sms.amount),
          })
        }
      } catch (e: any) {
        errors.push({ id: deleteId, reason: e?.message || 'unknown' })
      }
    }

    return NextResponse.json({
      apply: true,
      total_pairs_found: result.pairs.length,
      excel_deleted: deleted,
      ambiguous_skipped: result.ambiguous,
      protected_skipped: result.protected,
      errors,
      sample: samples,
      note:
        result.pairs.length > max
          ? `남은 페어 ${result.pairs.length - max}건 — 다시 호출 필요`
          : '모든 페어 처리 완료',
    })
  } catch (e: any) {
    console.error('[POST /api/admin/sms-excel-dedup]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

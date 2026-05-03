import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════════
// AI 분류 결과 검수 도구
//
// GET /api/admin/ai-classify-review
//
// 응답:
//   - summary: 카테고리별 분포 + 미분류 + 사용자 수정 카운트
//   - inconsistent: 같은 description 인데 다른 카테고리로 분류된 그룹
//   - user_overridden: 사용자가 final_category 수정한 케이스 (AI 분류와 다름)
//   - low_value: 미분류 + 합계 큰 거래 top 20 (우선 검수 대상)
// ═══════════════════════════════════════════════════════════════════

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    // 1) 카테고리별 분포 (final_category 기준)
    const byCategory = await prisma.$queryRaw<Array<{
      category: string | null
      cnt: bigint
      total_amount: any
    }>>`
      SELECT
        COALESCE(final_category, category, '미분류') AS category,
        COUNT(*) AS cnt,
        SUM(amount) AS total_amount
      FROM transactions
      WHERE deleted_at IS NULL
      GROUP BY COALESCE(final_category, category, '미분류')
      ORDER BY cnt DESC
      LIMIT 50
    `

    // 2) 사용자 수정 케이스 (final_category != category)
    const userOverridden = await prisma.$queryRaw<Array<{
      ai_category: string | null
      final_category: string | null
      cnt: bigint
    }>>`
      SELECT category AS ai_category, final_category, COUNT(*) AS cnt
      FROM transactions
      WHERE deleted_at IS NULL
        AND category IS NOT NULL
        AND final_category IS NOT NULL
        AND category != final_category
      GROUP BY category, final_category
      ORDER BY cnt DESC
      LIMIT 30
    `

    // 3) 같은 description 인데 다른 카테고리 (불일치)
    //    SMS merchant 또는 description 으로 그룹핑
    // desc 는 MySQL 예약어 — description_text 로 alias 사용
    const inconsistent = await prisma.$queryRaw<Array<{
      description_text: string
      categories: string
      total_count: bigint
    }>>`
      SELECT
        COALESCE(description, '') AS description_text,
        GROUP_CONCAT(DISTINCT COALESCE(final_category, category, '미분류') SEPARATOR '|') AS categories,
        COUNT(*) AS total_count
      FROM transactions
      WHERE deleted_at IS NULL
        AND description IS NOT NULL
        AND description != ''
      GROUP BY description
      HAVING COUNT(DISTINCT COALESCE(final_category, category, '미분류')) > 1
        AND COUNT(*) > 1
      ORDER BY total_count DESC
      LIMIT 30
    `

    // 4) 미분류 + 큰 금액 top 20 (우선 검수 대상)
    const lowValueUnclassified = await prisma.$queryRaw<Array<{
      id: string; description: string | null;
      amount: any; type: string;
      transaction_date: any; client_name: string | null
    }>>`
      SELECT id, description, amount, type, transaction_date, client_name
      FROM transactions
      WHERE deleted_at IS NULL
        AND (category IS NULL OR category = '' OR category = '미분류')
        AND (final_category IS NULL OR final_category = '' OR final_category = '미분류')
      ORDER BY amount DESC
      LIMIT 20
    `

    // 5) 사용자 검수 통계
    const totalRow = await prisma.$queryRaw<Array<{ total: bigint; classified: bigint; user_set: bigint }>>`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN final_category IS NOT NULL AND final_category != '' AND final_category != '미분류' THEN 1 ELSE 0 END) AS classified,
        SUM(CASE WHEN category IS NOT NULL AND final_category IS NOT NULL AND category != final_category THEN 1 ELSE 0 END) AS user_set
      FROM transactions
      WHERE deleted_at IS NULL
    `
    const totals = totalRow[0] || { total: 0n, classified: 0n, user_set: 0n }

    return NextResponse.json({
      summary: {
        total: Number(totals.total),
        classified: Number(totals.classified),
        unclassified: Number(totals.total) - Number(totals.classified),
        classification_rate: Number(totals.total) > 0
          ? Math.round(Number(totals.classified) / Number(totals.total) * 100) : 0,
        user_overridden_count: Number(totals.user_set),
      },
      by_category: byCategory.slice(0, 30).map(r => ({
        category: r.category,
        count: Number(r.cnt),
        total_amount: Number(r.total_amount || 0),
      })),
      inconsistent: inconsistent.map(r => ({
        description: r.description_text,
        categories: String(r.categories || '').split('|'),
        count: Number(r.total_count),
      })),
      user_overridden: await Promise.all(userOverridden.map(async (r: any) => {
        // sample description 추가 — 룰 자동 생성 위한 거래처 키워드 추출용
        const samples = await prisma.$queryRaw<Array<{ description: string | null; client_name: string | null }>>`
          SELECT description, client_name
            FROM transactions
           WHERE deleted_at IS NULL
             AND category = ${r.ai_category}
             AND final_category = ${r.final_category}
             AND category != final_category
           LIMIT 5
        `
        return {
          ai_category: r.ai_category,
          final_category: r.final_category,
          count: Number(r.cnt),
          samples: samples.map(s => s.client_name || (s.description || '').split(/[\s\(\)\[\]\/,\|]+/)[0]).filter(Boolean),
        }
      })),
      top_unclassified_high_value: serialize(lowValueUnclassified),
    })
  } catch (e: any) {
    console.error('[GET /api/admin/ai-classify-review]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

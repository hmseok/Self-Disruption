import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ── 중복 거래 감지 & 삭제 API ──
// GET: 중복 건수 조회
// DELETE: 중복 건 삭제 (가장 먼저 등록된 것만 남기고 나머지 삭제)

// ── 전체 데이터 페이지네이션 조회 (1000건 제한 해결) ──
async function fetchAllTransactions(_company_id?: string) {
  const allTxs = await prisma.$queryRaw<any[]>`
    SELECT id, transaction_date, client_name, amount, payment_method, description, created_at
    FROM transactions
    WHERE deleted_at IS NULL
    ORDER BY created_at ASC
  `
  return allTxs
}

// ── 중복 그룹핑 ──
// description(적요/메모)까지 포함하여 같은 날 같은 금액이라도 적요가 다르면 별건으로 취급
function groupDuplicates(allTxs: any[]) {
  const groups: Record<string, any[]> = {}
  for (const tx of allTxs) {
    // description 포함: 같은 날 같은 사람이 같은 금액을 이체해도
    // 적요(시간, 메모 등)가 다르면 중복이 아님
    const desc = (tx.description || '').trim()
    const key = `${tx.transaction_date}|${tx.client_name}|${Math.abs(Number(tx.amount || 0))}|${tx.payment_method}|${desc}`
    if (!groups[key]) groups[key] = []
    groups[key].push(tx)
  }
  return groups
}

// 중복 감지: 날짜 + 거래처 + 금액 + 결제수단이 동일한 건
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const company_id = searchParams.get('company_id')
    if (!company_id) return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })

    const allTxs = await fetchAllTransactions(company_id)

    // 해시로 그룹핑
    const groups = groupDuplicates(allTxs)

    // 2건 이상인 그룹 = 중복
    const duplicateGroups = Object.entries(groups).filter(([, txs]) => txs.length > 1)
    const duplicateIds: string[] = []
    const samples: any[] = []

    for (const [key, txs] of duplicateGroups) {
      // 첫 번째 제외하고 나머지가 중복
      const extras = txs.slice(1)
      duplicateIds.push(...extras.map(t => t.id))
      samples.push({
        key,
        count: txs.length,
        keepId: txs[0].id,
        removeIds: extras.map(t => t.id),
        sample: txs[0],
      })
    }

    return NextResponse.json({
      totalTransactions: allTxs.length,
      duplicateCount: duplicateIds.length,
      groupCount: duplicateGroups.length,
      duplicateIds,
      samples: samples.slice(0, 20), // 상위 20개 샘플
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { company_id } = await request.json()
    if (!company_id) return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })

    const allTxs = await fetchAllTransactions(company_id)

    // 해시로 그룹핑
    const groups = groupDuplicates(allTxs)

    // 중복 ID 수집 (첫 번째 제외)
    const idsToDelete: string[] = []
    for (const [, txs] of Object.entries(groups)) {
      if (txs.length > 1) {
        idsToDelete.push(...txs.slice(1).map(t => t.id))
      }
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({ message: '중복 거래가 없습니다.', deleted: 0 })
    }

    // 50건씩 배치 소프트 삭제
    const now = new Date().toISOString()
    let totalDeleted = 0
    for (let i = 0; i < idsToDelete.length; i += 50) {
      const batch = idsToDelete.slice(i, i + 50)
      try {
        await prisma.$executeRaw`
          UPDATE transactions SET deleted_at = ${now} WHERE id IN (${batch.join(',')})
        `
        totalDeleted += batch.length
      } catch (delErr) {
        console.error('Delete batch error:', delErr)
      }
    }

    // NOTE: classification_queue는 건드리지 않음
    // queue는 분류 파이프라인 데이터이므로, transactions 중복 삭제와 독립적으로 관리되어야 함

    return NextResponse.json({
      message: `${totalDeleted}건 중복 거래 삭제 완료`,
      deleted: totalDeleted,
      remaining: allTxs.length - totalDeleted,
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

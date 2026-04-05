import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ============================================
// 정산 지급완료 처리 API (Prisma 버전)
// PATCH → settlement_shares의 paid_at 업데이트
//       + transactions 레코드 생성 (지급완료 시)
//       + transactions 레코드 삭제 (취소 시)
// ============================================

function toMySQLDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  // TODO: Phase 5 - Replace with Firebase Auth
  // For now, extract userId from JWT payload (base64 decode)
  let userId: string | null = null
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
      userId = payload.sub || payload.user_id
    }
  } catch {}

  if (!userId) return null

  const profiles = await prisma.$queryRaw<any[]>`
    SELECT role FROM profiles WHERE id = ${userId} LIMIT 1
  `

  if (profiles.length === 0 || !['admin', 'master'].includes(profiles[0].role)) return null
  return { id: userId, role: profiles[0].role }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    const { share_ids, action } = await request.json() as {
      share_ids: string[]
      action: 'mark_paid' | 'unmark_paid'
    }

    if (!Array.isArray(share_ids) || share_ids.length === 0) {
      return NextResponse.json({ error: 'share_ids 필수' }, { status: 400 })
    }

    const now = toMySQLDatetime(new Date())
    const todayStr = now.slice(0, 10)

    if (action === 'mark_paid') {
      // ── 1. settlement_shares paid_at 업데이트 ──
      for (const shareId of share_ids) {
        await prisma.$executeRaw`
          UPDATE settlement_shares SET paid_at = ${now} WHERE id = ${shareId}
        `
      }

      // Get updated shares
      const updatedShares = await prisma.$queryRaw<any[]>`
        SELECT id, paid_at, items, total_amount, recipient_name, settlement_month, company_id
        FROM settlement_shares WHERE id IN (${share_ids.join(',')})
      `

      // ── 2. 각 share의 items를 파싱하여 transactions 생성 ──
      const txInserts: any[] = []

      for (const share of (updatedShares || [])) {
        let items: any[] = []
        try {
          items = typeof share.items === 'string' ? JSON.parse(share.items) : (Array.isArray(share.items) ? share.items : [])
        } catch {}

        if (!items || !Array.isArray(items)) continue

        for (const item of items) {
          // item: { type, relatedId, monthLabel, amount, detail, carNumber, carId, breakdown }
          const amount = item.amount || item.breakdown?.netPayout || 0
          if (amount <= 0) continue

          const relatedType = item.type === 'jiip' ? 'jiip_share' : item.type === 'invest' ? 'invest' : null
          const relatedId = item.relatedId || null

          if (!relatedType) continue

          const desc = item.type === 'jiip'
            ? `지입정산 ${share.recipient_name} ${item.monthLabel || ''}월분`
            : `투자이자 ${share.recipient_name} ${item.monthLabel || ''}월분`

          txInserts.push({
            transaction_date: todayStr,
            type: 'expense',
            status: 'completed',
            category: item.type === 'jiip' ? '지입정산' : '투자이자',
            client_name: share.recipient_name,
            description: desc,
            amount: amount,
            payment_method: '이체',
            related_type: relatedType,
            related_id: relatedId,
            memo: `settlement_share:${share.id}`,
          })
        }

        // items에 개별 항목이 없거나 relatedId가 없는 경우 → 총액으로 1건 생성
        if (txInserts.filter(t => t.memo === `settlement_share:${share.id}`).length === 0 && share.total_amount > 0) {
          txInserts.push({
            transaction_date: todayStr,
            type: 'expense',
            status: 'completed',
            category: '정산지급',
            client_name: share.recipient_name,
            description: `정산 지급 ${share.recipient_name} ${share.settlement_month}월분`,
            amount: share.total_amount,
            payment_method: '이체',
            related_type: null,
            related_id: null,
            memo: `settlement_share:${share.id}`,
          })
        }
      }

      // ── 3. transactions 일괄 삽입 ──
      if (txInserts.length > 0) {
        for (const tx of txInserts) {
          try {
            await prisma.$executeRaw`
              INSERT INTO transactions
              (transaction_date, type, status, category, client_name, description, amount, payment_method, related_type, related_id, memo, created_at)
              VALUES (
                ${tx.transaction_date}, ${tx.type}, ${tx.status}, ${tx.category},
                ${tx.client_name}, ${tx.description}, ${tx.amount}, ${tx.payment_method},
                ${tx.related_type}, ${tx.related_id}, ${tx.memo}, NOW()
              )
            `
          } catch (txErr) {
            console.error('[settlement/share/paid] 트랜잭션 생성 오류:', txErr)
          }
        }
      }

      return NextResponse.json({
        success: true,
        updated: updatedShares,
        transactions_created: txInserts.length,
      })

    } else {
      // ── unmark_paid: paid_at 초기화 + 관련 transactions 삭제 ──

      // 1. paid_at 초기화
      for (const shareId of share_ids) {
        await prisma.$executeRaw`
          UPDATE settlement_shares SET paid_at = NULL WHERE id = ${shareId}
        `
      }

      const data = await prisma.$queryRaw<any[]>`
        SELECT id, paid_at FROM settlement_shares WHERE id IN (${share_ids.join(',')})
      `

      // 2. 해당 share에서 생성된 transactions 삭제
      for (const shareId of share_ids) {
        const memoPattern = `settlement_share:${shareId}`
        await prisma.$executeRaw`
          DELETE FROM transactions WHERE memo = ${memoPattern}
        `
      }

      return NextResponse.json({ success: true, updated: data })
    }
  } catch (err: any) {
    console.error('[settlement/share/paid] 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

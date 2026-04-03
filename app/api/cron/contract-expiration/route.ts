import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ============================================
// 계약 자동 만료 처리 (Cron / 수동 호출)
// contract_end_date < today인 active 계약을 expired로 변경
// ============================================

export async function POST(request: NextRequest) {
  // 간단한 시크릿 키 인증 (cron 보안)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY

  // Bearer 토큰 또는 cron 시크릿 확인
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '')
    // 관리자 토큰 또는 cron 시크릿
    if (token !== cronSecret) {
      // TODO: Phase 5 Firebase Auth - JWT decode to verify admin
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString())
          const userId = decoded.sub || decoded.user_id
          if (!userId) {
            return NextResponse.json({ error: '인증 실패' }, { status: 401 })
          }

          const profile = await prisma.$queryRaw<any[]>`
            SELECT role FROM profiles WHERE id = ${userId} LIMIT 1
          `
          if (!profile || profile.length === 0 || profile[0].role !== 'admin') {
            return NextResponse.json({ error: 'admin만 실행 가능' }, { status: 403 })
          }
        } else {
          return NextResponse.json({ error: '인증 실패' }, { status: 401 })
        }
      } catch {
        return NextResponse.json({ error: '인증 실패' }, { status: 401 })
      }
    }
  } else {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    let totalExpired = 0

    // jiip_contracts 만료 처리
    const jiipExpired = await prisma.$queryRaw<any[]>`
      SELECT id, status FROM jiip_contracts
      WHERE status = 'active' AND contract_end_date < ${today}
    `

    if (jiipExpired && jiipExpired.length > 0) {
      const ids = jiipExpired.map(c => c.id)

      // 상태 업데이트
      for (const id of ids) {
        await prisma.$executeRaw`
          UPDATE jiip_contracts SET status = 'expired' WHERE id = ${id}
        `
      }

      // 이력 기록
      for (const c of jiipExpired) {
        await prisma.$executeRaw`
          INSERT INTO contract_status_history
          (contract_type, contract_id, old_status, new_status, change_reason, created_at)
          VALUES ('jiip', ${c.id}, 'active', 'expired', 'auto_expire', NOW())
        `
      }
      totalExpired += jiipExpired.length
    }

    // general_investments 만료 처리
    const investExpired = await prisma.$queryRaw<any[]>`
      SELECT id, status FROM general_investments
      WHERE status = 'active' AND contract_end_date < ${today}
    `

    if (investExpired && investExpired.length > 0) {
      const ids = investExpired.map(c => c.id)

      // 상태 업데이트
      for (const id of ids) {
        await prisma.$executeRaw`
          UPDATE general_investments SET status = 'expired' WHERE id = ${id}
        `
      }

      // 이력 기록
      for (const c of investExpired) {
        await prisma.$executeRaw`
          INSERT INTO contract_status_history
          (contract_type, contract_id, old_status, new_status, change_reason, created_at)
          VALUES ('invest', ${c.id}, 'active', 'expired', 'auto_expire', NOW())
        `
      }
      totalExpired += investExpired.length
    }

    return NextResponse.json({
      success: true,
      date: today,
      expired: {
        jiip: jiipExpired?.length || 0,
        invest: investExpired?.length || 0,
        total: totalExpired,
      },
    })
  } catch (e: any) {
    console.error('[cron/contract-expiration] 에러:', e.message)
    return NextResponse.json({ error: '처리 실패: ' + e.message }, { status: 500 })
  }
}

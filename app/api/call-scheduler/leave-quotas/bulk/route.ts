// ═══════════════════════════════════════════════════════════════════
// PUT /api/call-scheduler/leave-quotas/bulk
//   { year, leave_type, granted_days, carried_over_days?,
//     worker_ids: [...] (생략=전체 활성 워커),
//     mode: 'year' | 'monthly_all'   // monthly_all = 1~12월 매달 발급 (패밀리데이용)
//   }
// 기존 발급은 upsert
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const TYPES = ['annual', 'familyday', 'sick', 'unpaid', 'family', 'other'] as const

export async function PUT(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const body = await request.json()
    const year = Number(body?.year)
    const leave_type: string = String(body?.leave_type || '')
    const granted_days = Number(body?.granted_days || 0)
    const carried_over_days = Number(body?.carried_over_days || 0)
    const mode: 'year' | 'monthly_all' = body?.mode === 'monthly_all' ? 'monthly_all' : 'year'
    const memo: string | null = body?.memo ?? null

    if (!year || !TYPES.includes(leave_type as any)) {
      return NextResponse.json({ error: 'year / leave_type 필수' }, { status: 400 })
    }

    // 대상 워커 결정
    let workerIds: string[] = Array.isArray(body?.worker_ids) ? body.worker_ids : []
    if (workerIds.length === 0) {
      const allWorkers = await prisma.$queryRaw<any[]>`
        SELECT id FROM cs_workers WHERE is_active = 1
      `
      workerIds = allWorkers.map(w => w.id)
    }
    if (workerIds.length === 0) {
      return NextResponse.json({ error: '대상 워커 없음' }, { status: 400 })
    }

    // 적용할 month 목록
    const months: (number | null)[] = mode === 'monthly_all'
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      : [null]

    let inserted = 0
    let updated = 0

    for (const wId of workerIds) {
      for (const m of months) {
        // upsert (NULL 비교는 <=> 사용)
        const existing = await prisma.$queryRaw<any[]>`
          SELECT id FROM cs_leave_quotas
          WHERE worker_id = ${wId} AND year = ${year}
            AND leave_type = ${leave_type}
            AND (month <=> ${m})
          LIMIT 1
        `
        if (existing.length > 0) {
          await prisma.$executeRaw`
            UPDATE cs_leave_quotas
            SET granted_days = ${granted_days},
                carried_over_days = ${carried_over_days},
                memo = ${memo}, updated_at = NOW()
            WHERE id = ${existing[0].id}
          `
          updated++
        } else {
          await prisma.$executeRaw`
            INSERT INTO cs_leave_quotas
              (id, worker_id, year, month, leave_type, granted_days, carried_over_days, memo, created_at, updated_at)
            VALUES
              (${crypto.randomUUID()}, ${wId}, ${year}, ${m}, ${leave_type},
               ${granted_days}, ${carried_over_days}, ${memo}, NOW(), NOW())
          `
          inserted++
        }
      }
    }

    return NextResponse.json({
      data: serialize({
        inserted, updated,
        worker_count: workerIds.length,
        month_count: months.length,
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

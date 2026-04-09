import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// POST /api/admin/bulk-update-tx-amount
// body: { rows: { id: string, amount: number }[] }
// 긴급 마이그레이션용 — Supabase 원본 amount → MySQL transactions 복구
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  try {
    const body = await request.json()
    const rows: { id: string; amount: number | string }[] = Array.isArray(body?.rows) ? body.rows : []
    if (rows.length === 0) return NextResponse.json({ error: 'rows 필요' }, { status: 400 })

    let ok = 0
    let fail = 0
    const errors: string[] = []

    // 단건 UPDATE 반복 — 파라미터 바인딩으로 안전 + id별 amount 정확 적용
    for (const r of rows) {
      const amt = Number(r.amount)
      if (!Number.isFinite(amt)) { fail++; if (errors.length < 10) errors.push(`${r.id}: bad amount`); continue }
      try {
        const result = await prisma.$executeRaw`
          UPDATE transactions SET amount = ${amt}, updated_at = NOW() WHERE id = ${r.id}
        `
        if (result > 0) ok++
        else { fail++; if (errors.length < 10) errors.push(`${r.id}: 0 rows affected`) }
      } catch (e: any) {
        fail++
        if (errors.length < 10) errors.push(`${r.id}: ${e.message}`)
      }
    }

    return NextResponse.json({ data: { total: rows.length, ok, fail, errors }, error: null })
  } catch (e: any) {
    console.error('[POST /api/admin/bulk-update-tx-amount]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

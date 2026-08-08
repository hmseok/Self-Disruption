// ═══════════════════════════════════════════════════════════════
// /api/operations/cafe24-mirror — 카페24 접수 미러 동기화 (2026-08-08)
//   GET ?days=60          최근 N일 증분 동기화 (크론 30분 주기 / 수동)
//   GET ?from=20100101    전체 백필 (1회성 — 소요 김)
//   인증: 로그인 사용자 또는 X-Cron-Secret
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { syncCafe24Mirror } from '@/lib/cafe24-mirror'
import { prisma } from '@/lib/prisma'

export const maxDuration = 300

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')

export async function GET(req: NextRequest) {
  const cronOk = Boolean(process.env.CRON_SECRET) && req.headers.get('x-cron-secret') === process.env.CRON_SECRET
  if (!cronOk) {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const fromParam = sp.get('from')
  const days = Math.min(Number(sp.get('days')) || 60, 7000)

  const to = ymd(new Date(Date.now() + 86400000))
  const from = fromParam && /^\d{8}$/.test(fromParam)
    ? fromParam
    : ymd(new Date(Date.now() - days * 86400000))

  try {
    const started = Date.now()
    const r = await syncCafe24Mirror(from, to)
    const cnt = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) c, MIN(otptmddt) mn, MAX(otptmddt) mx FROM cafe24_accidents_mirror`)
    return NextResponse.json({
      ok: true, from, to, ...r,
      elapsedMs: Date.now() - started,
      mirror: { total: Number(cnt[0].c), range: `${cnt[0].mn}~${cnt[0].mx}` },
    })
  } catch (e: any) {
    console.error('[cafe24-mirror] 동기화 실패:', e)
    return NextResponse.json({ error: e.message || '동기화 실패' }, { status: 500 })
  }
}

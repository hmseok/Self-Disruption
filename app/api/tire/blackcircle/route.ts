// ═══════════════════════════════════════════════════════════════
// /api/tire/blackcircle — 블랙서클 연동 (2026-08-07)
//   GET                    상태 (아이디 설정 여부·마지막 동기화) — 인증
//   POST action:'save'     아이디/비밀번호 저장 (암호화) — 인증
//   POST action:'clear'    자격증명 삭제 — 인증
//   POST action:'sync'     전 품목 시세·재고 동기화 — 인증 또는 X-Cron-Secret
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { encrypt, getSetting, setSetting, bcSyncCatalog } from '@/lib/blackcircle'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [id, pw, lastSync, lastResult, margin] = await Promise.all([
    getSetting('bc_id'), getSetting('bc_pw'), getSetting('bc_last_sync'), getSetting('bc_last_result'),
    getSetting('sale_margin_percent'),
  ])
  return NextResponse.json({
    configured: Boolean(id && pw),
    id: id || null,               // 아이디는 표시 (비밀번호는 절대 반환 안 함)
    lastSync, lastResult,
    marginPercent: margin,
  })
}

export async function POST(req: NextRequest) {
  const cronOk = Boolean(process.env.CRON_SECRET) && req.headers.get('x-cron-secret') === process.env.CRON_SECRET
  const user = cronOk ? null : await verifyUser(req)
  if (!cronOk && !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const action = b.action || (cronOk ? 'sync' : '')

  if (action === 'save') {
    if (cronOk && !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = String(b.id || '').trim()
    const pw = String(b.password || '')
    if (!id || !pw) return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요' }, { status: 400 })
    await setSetting('bc_id', id)
    await setSetting('bc_pw', encrypt(pw))
    return NextResponse.json({ ok: true })
  }

  if (action === 'clear') {
    if (cronOk && !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await setSetting('bc_id', null)
    await setSetting('bc_pw', null)
    return NextResponse.json({ ok: true })
  }

  if (action === 'margin') {
    if (cronOk && !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const p = b.percent === '' || b.percent == null ? null : String(Math.max(0, Math.min(200, Number(b.percent) || 0)))
    await setSetting('sale_margin_percent', p)
    return NextResponse.json({ ok: true })
  }

  if (action === 'sync') {
    try {
      const r = await bcSyncCatalog()
      return NextResponse.json({ ok: true, ...r })
    } catch (e: any) {
      console.error('[blackcircle sync] 실패:', e)
      await setSetting('bc_last_result', `실패: ${e.message?.slice(0, 150)}`)
      return NextResponse.json({ error: e.message || '동기화 실패' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: '지원하지 않는 action' }, { status: 400 })
}

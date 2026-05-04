// ═══════════════════════════════════════════════════════════════════
// PATCH /api/call-scheduler/workers/[id] — 워커 수정 (cs_workers 직접)
//   PR-2QQ-b: is_external + external_pattern 지원
//   color_tone / group_label 도 cs_workers 에 직접 반영 (RideEmployees 와 분리)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

const ALLOWED = new Set([
  'color_tone', 'group_label', 'phone', 'email',
  'is_external', 'external_pattern',
])
const COLOR_TONES = new Set([
  'blue', 'gray', 'green', 'amber', 'violet', 'red', 'none',
  'indigo', 'sky', 'teal', 'lime', 'orange', 'pink', 'slate',
])

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const body = await request.json()

    // is_external/external_pattern 컬럼 존재 확인 (graceful)
    let hasExt = true
    try {
      await prisma.$queryRaw<any[]>`SELECT is_external FROM cs_workers LIMIT 1`
    } catch { hasExt = false }

    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(body || {})) {
      if (!ALLOWED.has(k)) continue
      if ((k === 'is_external' || k === 'external_pattern') && !hasExt) continue
      if (k === 'color_tone' && !COLOR_TONES.has(String(v))) continue
      if (k === 'is_external') {
        sets.push(`${k} = ?`); params.push(v ? 1 : 0); continue
      }
      sets.push(`${k} = ?`); params.push(v ?? null)
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: '변경할 항목 없음' }, { status: 400 })
    }
    sets.push('updated_at = NOW()')
    const sql = `UPDATE cs_workers SET ${sets.join(', ')} WHERE id = ?`
    params.push(id)
    await prisma.$executeRawUnsafe(sql, ...params)

    return NextResponse.json({ data: { id, updated: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/tire/catalog/facets — 신청 화면용 옵션 (공개, 2026-08-07)
// 브랜드 목록 + 사이즈 3구분 (폭/편평비/인치) — 표준 규격(245/45R19)에서 추출
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await prisma.$queryRawUnsafe<Array<{ brand: string; spec: string }>>(
    `SELECT DISTINCT brand, spec FROM tire_catalog WHERE active = 1`)

  const brands = new Map<string, number>()
  const widths = new Set<string>()
  const ratios = new Set<string>()
  const rims = new Set<string>()
  for (const r of rows) {
    brands.set(r.brand, (brands.get(r.brand) || 0) + 1)
    const m = String(r.spec || '').match(/^(\d{3})\/(\d{2})R(\d{2})$/)
    if (m) { widths.add(m[1]); ratios.add(m[2]); rims.add(m[3]) }
  }
  const numSort = (a: string, b: string) => Number(a) - Number(b)
  return NextResponse.json({
    brands: [...brands.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    widths: [...widths].sort(numSort),
    ratios: [...ratios].sort(numSort),
    rims: [...rims].sort(numSort),
  })
}

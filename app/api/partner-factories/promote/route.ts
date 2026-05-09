/**
 * POST /api/partner-factories/promote
 *
 * snapshot → partner_factories 일괄 등록 (정제 옵션 포함)
 *
 * Body:
 *   { snapshot_ids: string[],
 *     overrides?: { [snapshot_id]: { name?, group_label?, insurance_tags?, ... } },
 *     clean_name?: boolean }   기본 true — "(주)" 제거 등 자동 정제
 *
 * 결과: { promoted, skipped, errors }
 *
 * PR-6.12.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

interface SnapshotRow {
  id: string
  factcode: string
  factname: string | null
  factaddr: string | null
  facthpno: string | null
  factbsno: string | null
  factconm: string | null
  facttype: string | null
}

interface OverrideFields {
  name?: string
  group_label?: string
  insurance_tags?: string[]
  service_tags?: string[]
  region?: string
  district?: string
  note?: string
  status?: string
}

function cleanName(s: string | null): string {
  if (!s) return ''
  return s
    .replace(/\(주\)|（주）|㈜/g, '')
    .replace(/주식회사/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractRegion(addr: string | null): { region: string | null; district: string | null } {
  if (!addr) return { region: null, district: null }
  // "서울특별시 강남구 ...", "경기도 수원시 ...", 등
  const m = addr.match(/^(\S+(?:특별시|광역시|특별자치시|특별자치도|도))\s+(\S+(?:시|군|구))/)
  if (m) return { region: m[1], district: m[2] }
  const m2 = addr.match(/^(\S+(?:특별시|광역시|특별자치시|특별자치도|도))/)
  if (m2) return { region: m2[1], district: null }
  return { region: null, district: null }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const allowed = await canAccessPage(user, [
    '/factory-search',
    '/factory-search/mgmt',
  ])
  if (!allowed)
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })

  let body: {
    snapshot_ids?: string[]
    overrides?: Record<string, OverrideFields>
    clean_name?: boolean
  } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const snapshotIds = Array.isArray(body.snapshot_ids) ? body.snapshot_ids : []
  if (snapshotIds.length === 0) {
    return NextResponse.json({ success: false, error: 'snapshot_ids 필요' }, { status: 400 })
  }
  const cleanNames = body.clean_name !== false  // 기본 true
  const overrides = body.overrides || {}

  // 1. snapshot 조회
  const placeholders = snapshotIds.map(() => '?').join(',')
  let snaps: SnapshotRow[]
  try {
    snaps = await prisma.$queryRawUnsafe<SnapshotRow[]>(
      `SELECT id, factcode, factname, factaddr, facthpno, factbsno, factconm, facttype
         FROM factory_cafe24_snapshots
        WHERE id IN (${placeholders})`,
      ...snapshotIds
    )
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `snapshot 조회 실패: ${(e as Error).message}` },
      { status: 500 }
    )
  }

  // 2. 기존 partner_factories.cafe24_factcode 중복 체크
  const factcodes = snaps.map(s => s.factcode)
  let existingCodes = new Set<string>()
  if (factcodes.length > 0) {
    const fcPlaceholders = factcodes.map(() => '?').join(',')
    const existing = await prisma.$queryRawUnsafe<{ cafe24_factcode: string }[]>(
      `SELECT cafe24_factcode FROM partner_factories WHERE cafe24_factcode IN (${fcPlaceholders})`,
      ...factcodes
    )
    existingCodes = new Set(existing.map(e => e.cafe24_factcode))
  }

  const userTyped = user as { id: string; name?: string }
  let promoted = 0
  let skipped = 0
  const errors: string[] = []

  for (const s of snaps) {
    if (existingCodes.has(s.factcode)) {
      skipped++
      continue
    }
    const ov = overrides[s.id] || {}
    const finalName = ov.name || (cleanNames ? cleanName(s.factname) : s.factname) || s.factcode
    const { region, district } = extractRegion(s.factaddr)
    const id = randomUUID()
    try {
      await prisma.$executeRaw`
        INSERT INTO partner_factories
          (id, cafe24_factcode, snapshot_id,
           name, raw_name, address, phone, business_no, contact_person, factory_type,
           group_label, insurance_tags, service_tags,
           region, district, status, is_terminated, note,
           created_by, created_by_name)
        VALUES
          (${id}, ${s.factcode}, ${s.id},
           ${finalName}, ${s.factname}, ${s.factaddr}, ${s.facthpno},
           ${s.factbsno}, ${s.factconm}, ${s.facttype},
           ${ov.group_label || null},
           ${ov.insurance_tags ? JSON.stringify(ov.insurance_tags) : null},
           ${ov.service_tags ? JSON.stringify(ov.service_tags) : null},
           ${ov.region || region}, ${ov.district || district},
           ${ov.status || (s.facttype === 'Z' ? 'terminated' : 'active')},
           ${s.facttype === 'Z' ? 1 : 0},
           ${ov.note || null},
           ${userTyped.id}, ${userTyped.name || null})
      `
      promoted++
    } catch (e) {
      errors.push(`${s.factcode}: ${(e as Error).message}`)
      if (errors.length >= 10) break
    }
  }

  return NextResponse.json({
    success: true,
    counts: {
      requested: snapshotIds.length,
      found: snaps.length,
      promoted,
      skipped,
      errors: errors.length,
    },
    errors: errors.slice(0, 10),
  })
}

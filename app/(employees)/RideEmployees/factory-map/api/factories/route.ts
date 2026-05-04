import { NextResponse } from 'next/server'
import seed from '../../_data/factories.json'
import merged from '../../_data/factories-merged.json'

export const dynamic = 'force-dynamic'

// ───────────────────────────────────────────────────────────────
// 공장 목록 API (격리본)
// /RideEmployees/factory-map/api/factories
// 메인 DB 미연결 상태 — 시드 + 즐겨찾기 머지본 사용
// 추후 메인 DB 연동 시 이 파일만 교체 (스키마는 카페24 호환 유지)
// ───────────────────────────────────────────────────────────────

type Insurance = { mg: boolean | null; turnkey: boolean | null; meritz: boolean | null; autohands: boolean | null }
type FavoriteFactory = {
  placeId: string
  factcode: string
  name: string
  cleanName: string
  address: string
  aliases: string[]
  insurance: Insurance
  tags: string[]
  groups: string[]
  terminated: boolean
  lat?: number
  lng?: number
}

function toCafe24Shape(f: FavoriteFactory) {
  return {
    factcode: f.factcode,
    factname: f.cleanName || f.name,
    factaddr: f.address || '',
    facttype: f.terminated ? 'Z' : 'A',
    facthpno: '',
    facttelo: '',
    factusnm: '',
    factregi: '',
    factbknm: '',
    factbkno: '',
    factbkus: '',
    lat: typeof f.lat === 'number' ? f.lat : undefined,
    lng: typeof f.lng === 'number' ? f.lng : undefined,
    orderCount: 0,
    placeId: f.placeId,
    rawName: f.name,
    insurance: f.insurance,
    tags: f.tags,
    groups: f.groups,
    terminated: f.terminated,
  }
}

const FAV_LIST = ((merged as { factories: FavoriteFactory[] }).factories || []).map(toCafe24Shape)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL: any[] = [...(seed as any[]), ...FAV_LIST]

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const search = (searchParams.get('search') || '').trim().toLowerCase()
  const factType = searchParams.get('factType') || ''
  const insuranceFilter = (searchParams.get('insurance') || '').split(',').filter(Boolean)
  const groupFilter = (searchParams.get('groups') || '').split(',').filter(Boolean)
  const tagFilter = (searchParams.get('tag') || '').split(',').filter(Boolean)
  const onlyGeocoded = searchParams.get('onlyGeocoded') === '1'
  const detail = searchParams.get('detail') === 'true'
  const factCode = searchParams.get('factCode') || ''
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.max(1, Math.min(1000, Number(searchParams.get('limit') || 500)))

  if (detail && factCode) {
    const f = ALL.find(x => x.factcode === factCode)
    if (!f) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 })
    return NextResponse.json({ success: true, data: f, orders: [] })
  }

  let list = ALL
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (factType) list = list.filter((f: any) => f.facttype === factType)
  if (search) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list = list.filter((f: any) =>
      [f.factname, f.factcode, f.facthpno, f.facttelo, f.factaddr, f.factusnm, f.rawName, ...(f.aliases || [])]
        .some((v: string | undefined) => v?.toLowerCase?.().includes(search)),
    )
  }
  if (insuranceFilter.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list = list.filter((f: any) => insuranceFilter.some(k => f.insurance?.[k] === true))
  }
  if (groupFilter.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list = list.filter((f: any) => groupFilter.some(g => f.groups?.includes(g)))
  }
  if (tagFilter.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list = list.filter((f: any) => tagFilter.some(t => f.tags?.includes(t)))
  }
  if (onlyGeocoded) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list = list.filter((f: any) => typeof f.lat === 'number' && typeof f.lng === 'number')
  }

  const total = list.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = (page - 1) * limit
  const data = list.slice(start, start + limit)

  return NextResponse.json({
    success: true,
    data,
    pagination: { page, limit, total, totalPages },
  })
}

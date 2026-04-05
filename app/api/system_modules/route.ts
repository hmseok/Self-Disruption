import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// ★ FMI ERP 기본 모듈 — v2 3그룹 구조 (system_modules 테이블이 비어있을 때 fallback)
const DEFAULT_MODULES = [
  // ── 차량관리 (vehicle) ──
  { id: 'mod-cars', name: '차량 관리', path: '/cars', icon_key: 'Car', sort_order: 1 },
  { id: 'mod-reg', name: '차량 등록증', path: '/registration', icon_key: 'Doc', sort_order: 2 },
  { id: 'mod-ins', name: '보험/가입', path: '/insurance', icon_key: 'Shield', sort_order: 3 },
  { id: 'mod-vlookup', name: '거래처 차량조회', path: '/fleet/vehicle-lookup', icon_key: 'Car', sort_order: 4 },
  { id: 'mod-ops', name: '차량운영', path: '/operations', icon_key: 'Wrench', sort_order: 5 },
  { id: 'mod-intake', name: '접수/오더', path: '/operations/intake', icon_key: 'Clipboard', sort_order: 6 },
  { id: 'mod-maint', name: '정비/유지보수', path: '/maintenance', icon_key: 'WrenchScrewdriver', sort_order: 7 },
  { id: 'mod-factory', name: '공장/협력업체', path: '/fleet/factory-mgmt', icon_key: 'Building', sort_order: 8 },
  { id: 'mod-accident', name: '사고관리', path: '/claims/accident-mgmt', icon_key: 'ExclamationTriangle', sort_order: 9 },
  { id: 'mod-billing', name: '보험청구관리', path: '/claims/billing-mgmt', icon_key: 'Clipboard', sort_order: 10 },
  // ── 영업/계약 (sales) ──
  { id: 'mod-quotes', name: '견적 관리', path: '/quotes', icon_key: 'Doc', sort_order: 20 },
  { id: 'mod-contracts', name: '계약 관리', path: '/contracts', icon_key: 'Doc', sort_order: 21 },
  { id: 'mod-customers', name: '고객 관리', path: '/customers', icon_key: 'Users', sort_order: 22 },
  { id: 'mod-collections', name: '수금/회수', path: '/finance/collections', icon_key: 'Money', sort_order: 23 },
  { id: 'mod-settlement', name: '정산 관리', path: '/finance/settlement', icon_key: 'Chart', sort_order: 24 },
  { id: 'mod-pricing', name: '요금 기준표', path: '/db/pricing-standards', icon_key: 'Database', sort_order: 25 },
  // ── 재무/경영 (finance) ──
  { id: 'mod-finance', name: '재무 대시보드', path: '/finance', icon_key: 'Money', sort_order: 30 },
  { id: 'mod-fleet-fin', name: '차량 수익', path: '/finance/fleet', icon_key: 'Chart', sort_order: 31 },
  { id: 'mod-tax', name: '세금 관리', path: '/finance/tax', icon_key: 'Money', sort_order: 32 },
  { id: 'mod-upload', name: '카드/통장 관리', path: '/finance/upload', icon_key: 'Database', sort_order: 33 },
  { id: 'mod-codef', name: '은행/카드 자동연동', path: '/finance/codef', icon_key: 'Database', sort_order: 34 },
  { id: 'mod-cards', name: '카드 관리', path: '/finance/cards', icon_key: 'Money', sort_order: 35 },
  { id: 'mod-payroll', name: '급여 관리', path: '/admin/payroll', icon_key: 'Money', sort_order: 36 },
  { id: 'mod-report', name: '보고서', path: '/report', icon_key: 'Chart', sort_order: 37 },
  { id: 'mod-loans', name: '대출 관리', path: '/loans', icon_key: 'Money', sort_order: 38 },
  { id: 'mod-lotte', name: '경쟁사 벤치마크', path: '/db/lotte', icon_key: 'Database', sort_order: 39 },
]

// GET /api/system_modules — 시스템 모듈 목록
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    try {
      const data = await prisma.$queryRaw<any[]>`SELECT * FROM system_modules`
      // DB에 데이터가 있으면 사용, 없으면 기본 모듈 반환
      if (data && data.length > 0) {
        return NextResponse.json({ data: serialize(data), error: null })
      }
      // 빈 테이블 → fallback
      return NextResponse.json({ data: DEFAULT_MODULES, error: null })
    } catch (e: any) {
      // 테이블 미존재 또는 컬럼 에러 시 기본 모듈 반환
      if (e.message?.includes("doesn't exist") || e.message?.includes('Unknown column')) {
        return NextResponse.json({ data: DEFAULT_MODULES, error: null })
      }
      throw e
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

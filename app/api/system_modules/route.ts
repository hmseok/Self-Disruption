import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// ★ FMI ERP 기본 모듈 (system_modules 테이블이 비어있을 때 fallback)
const DEFAULT_MODULES = [
  // 차량
  { id: 'mod-cars', name: '차량 관리', path: '/cars', icon_key: 'Car', sort_order: 1 },
  { id: 'mod-reg', name: '차량 등록증', path: '/registration', icon_key: 'Doc', sort_order: 2 },
  { id: 'mod-ins', name: '보험/가입', path: '/insurance', icon_key: 'Shield', sort_order: 3 },
  { id: 'mod-vlookup', name: '거래처 차량조회', path: '/fleet/vehicle-lookup', icon_key: 'Car', sort_order: 4 },
  // 차량운영
  { id: 'mod-ops', name: '운영 관리', path: '/operations', icon_key: 'Wrench', sort_order: 10 },
  { id: 'mod-intake', name: '접수/오더', path: '/operations/intake', icon_key: 'Clipboard', sort_order: 11 },
  { id: 'mod-maint', name: '정비 관리', path: '/maintenance', icon_key: 'WrenchScrewdriver', sort_order: 12 },
  { id: 'mod-factory', name: '공장/협력업체 관리', path: '/fleet/factory-mgmt', icon_key: 'Building', sort_order: 13 },
  // 사고/보상
  { id: 'mod-accident', name: '사고관리', path: '/claims/accident-mgmt', icon_key: 'ExclamationTriangle', sort_order: 20 },
  { id: 'mod-billing', name: '청구관리', path: '/claims/billing-mgmt', icon_key: 'Clipboard', sort_order: 21 },
  // 영업
  { id: 'mod-quotes', name: '견적 관리', path: '/quotes', icon_key: 'Doc', sort_order: 30 },
  { id: 'mod-contracts', name: '계약 관리', path: '/contracts', icon_key: 'Doc', sort_order: 31 },
  { id: 'mod-customers', name: '고객 관리', path: '/customers', icon_key: 'Users', sort_order: 32 },
  { id: 'mod-econtract', name: '전자계약', path: '/e-contract', icon_key: 'Doc', sort_order: 33 },
  // 재무
  { id: 'mod-finance', name: '재무 관리', path: '/finance', icon_key: 'Money', sort_order: 40 },
  { id: 'mod-collections', name: '수금 관리', path: '/finance/collections', icon_key: 'Money', sort_order: 41 },
  { id: 'mod-settlement', name: '정산/계약 관리', path: '/finance/settlement', icon_key: 'Chart', sort_order: 42 },
  { id: 'mod-fleet-fin', name: '차량 수익', path: '/finance/fleet', icon_key: 'Chart', sort_order: 43 },
  { id: 'mod-tax', name: '세금 관리', path: '/finance/tax', icon_key: 'Money', sort_order: 44 },
  { id: 'mod-upload', name: '카드/통장 관리', path: '/finance/upload', icon_key: 'Database', sort_order: 45 },
  { id: 'mod-codef', name: '은행/카드 자동연동', path: '/finance/codef', icon_key: 'Database', sort_order: 46 },
  { id: 'mod-cards', name: '카드 관리', path: '/finance/cards', icon_key: 'Money', sort_order: 47 },
  { id: 'mod-payroll', name: '급여 관리', path: '/admin/payroll', icon_key: 'Money', sort_order: 48 },
  { id: 'mod-report', name: '보고서', path: '/report', icon_key: 'Chart', sort_order: 49 },
  { id: 'mod-loans', name: '대출 관리', path: '/loans', icon_key: 'Money', sort_order: 50 },
  // 데이터 관리
  { id: 'mod-pricing', name: '요금 기준표', path: '/db/pricing-standards', icon_key: 'Database', sort_order: 60 },
  { id: 'mod-lotte', name: '롯데 데이터', path: '/db/lotte', icon_key: 'Database', sort_order: 61 },
  // 관리자
  { id: 'mod-codemaster', name: '기초코드 관리', path: '/admin/code-master', icon_key: 'Setting', sort_order: 70 },
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

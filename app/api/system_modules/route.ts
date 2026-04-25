import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// ★ FMI ERP 기본 모듈 — v3 3그룹 구조 (코드가 유일한 소스 of truth)
// HIDDEN_PATHS에 해당하는 경로는 제거 완료 (ClientLayout에서 이중 필터 방지)
const DEFAULT_MODULES = [
  // ── 차량관리 (vehicle) ──
  { id: 'mod-cars', name: '차량 관리', path: '/cars', icon_key: 'Car', sort_order: 1 },
  { id: 'mod-reg', name: '차량 등록증', path: '/registration', icon_key: 'Doc', sort_order: 2 },
  { id: 'mod-ops', name: '차량운영', path: '/operations', icon_key: 'Wrench', sort_order: 5 },
  { id: 'mod-intake', name: '접수/오더', path: '/operations/intake', icon_key: 'Clipboard', sort_order: 6 },
  { id: 'mod-maint', name: '정비/유지보수', path: '/maintenance', icon_key: 'WrenchScrewdriver', sort_order: 7 },
  { id: 'mod-fleet-fin', name: '차량 수익', path: '/finance/fleet', icon_key: 'Chart', sort_order: 8 },
  // ── 영업/계약 (sales) ──
  { id: 'mod-quotes', name: '견적 관리', path: '/quotes', icon_key: 'Doc', sort_order: 20 },
  { id: 'mod-operational-learning', name: '운영학습', path: '/quotes/operational-learning', icon_key: 'Chart', sort_order: 21 },
  { id: 'mod-contracts', name: '계약/고객', path: '/contracts', icon_key: 'Doc', sort_order: 22 },
  { id: 'mod-settlement', name: '정산/수금', path: '/finance/settlement', icon_key: 'Chart', sort_order: 23 },
  // ── 재무 (finance) ──
  { id: 'mod-bank-card', name: '통장/카드 관리', path: '/finance/bank-card', icon_key: 'Money', sort_order: 30 },
  { id: 'mod-classify', name: '거래 분류', path: '/finance/classify', icon_key: 'Chart', sort_order: 31 },
  { id: 'mod-sms', name: 'SMS 수집', path: '/finance/sms', icon_key: 'Doc', sort_order: 32 },
  { id: 'mod-loans', name: '대출 관리', path: '/loans', icon_key: 'Money', sort_order: 33 },
  // ── 관리 (admin) ──
  { id: 'mod-payroll', name: '급여 관리', path: '/admin/payroll', icon_key: 'Money', sort_order: 40 },
]

// GET /api/system_modules — 시스템 모듈 목록
// ★ v3: DEFAULT_MODULES가 유일한 소스 (DB 테이블은 무시 — 오래된 데이터 문제 방지)
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    return NextResponse.json({ data: DEFAULT_MODULES, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

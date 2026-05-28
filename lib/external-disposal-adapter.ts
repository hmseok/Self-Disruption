/**
 * lib/external-disposal-adapter.ts
 *
 * Phase 4.0 — 외부 yangjaehee DB (카페24) 폐기 결재 시스템 어댑터.
 *
 * 사용자 통찰 (2026-05-28):
 *   PDF + SQL 제공. expired_approval + expired_data 조회 + JOIN.
 *
 * 어댑터 패턴 — 외부 DB 연결 방식 결정 후 plug-in 가능:
 *   · direct  : 별도 Prisma datasource (yangjaehee 스키마 직접 연결)
 *   · api     : 카페24 REST API
 *   · etl     : 일일 ETL → 본 시스템 mirror 테이블 직접 조회
 *   · mock    : 개발용 더미 데이터 (현재 default)
 *
 * env 로 모드 결정:
 *   DISPOSAL_ADAPTER_MODE = 'direct' | 'api' | 'etl' | 'mock'
 *
 * 본 파일은 인터페이스 + mock 구현 + 사용자 SQL 그대로 + JOIN 결과 shape.
 */

// ── 도메인 타입 ─────────────────────────────────────────────────

export interface ExternalApproval {
  id: number                              // yangjaehee.expired_approval.id
  request_at: string | null
  request_by: string | null
  expired_count: number
  approval_request_id: string | null      // 외부 전자결재 doc id
  approval_request_at: string | null
  deleted_at: string | null
  deleted_by: string | null
  confirmed_by: string | null
  confirmed_at: string | null
}

export interface ExternalDisposalItem {
  external_item_id: number | null         // yangjaehee.expired_data.id
  data_type: 'CONTRACT' | 'FILE'
  data_id: string
  // 사람-친화 (사용자 SQL JOIN 결과)
  custname: string | null
  // CONTRACT
  carsnums: string | null                 // 차량번호
  carsodnm: string | null                 // 차량 모델명
  // FILE
  imagkind_label: string | null           // get_cbsddesc('IMAGKIND', ...)
  imagonam: string | null                 // 원본 파일명
  external_deleted_at: string | null
}

export interface DisposalAdapter {
  mode: 'direct' | 'api' | 'etl' | 'mock'
  /** 외부 결재 마스터 list 조회 (status 필터 가능) */
  listApprovals(filter?: {
    pendingOnly?: boolean
    sinceDate?: string  // 'YYYY-MM-DD'
    limit?: number
  }): Promise<ExternalApproval[]>
  /** 단일 결재의 폐기 항목 상세 (사용자 SQL 그대로) */
  listItemsByApproval(approvalId: number): Promise<ExternalDisposalItem[]>
  /** (옵션) 본 시스템에서 외부 결재 상신 — 외부 결재 doc id 발급 */
  submitApproval?(approvalId: number, requestBy: string): Promise<{ approval_request_id: string }>
  /** (옵션) 본 시스템에서 직접 삭제 실행 — 사용자 결정에 따라 활성/비활성 */
  executeDeletion?(approvalId: number, deletedBy: string): Promise<{ deleted_count: number }>
}

// ── mode 결정 ────────────────────────────────────────────────────

export function getAdapterMode(): DisposalAdapter['mode'] {
  const m = (process.env.DISPOSAL_ADAPTER_MODE || 'mock').toLowerCase()
  if (m === 'direct' || m === 'api' || m === 'etl') return m
  return 'mock'
}

// ── Mock 구현 (개발/시연용) ─────────────────────────────────────

const MOCK_APPROVALS: ExternalApproval[] = [
  {
    id: 1,
    request_at: '2026-05-25 09:30:00',
    request_by: 'user001',
    expired_count: 3,
    approval_request_id: null,
    approval_request_at: null,
    deleted_at: null,
    deleted_by: null,
    confirmed_by: null,
    confirmed_at: null,
  },
  {
    id: 2,
    request_at: '2026-05-20 14:10:00',
    request_by: 'user002',
    expired_count: 5,
    approval_request_id: 'APV-2026-00120',
    approval_request_at: '2026-05-21 10:00:00',
    deleted_at: null,
    deleted_by: null,
    confirmed_by: null,
    confirmed_at: null,
  },
]

const MOCK_ITEMS: Record<number, ExternalDisposalItem[]> = {
  1: [
    {
      external_item_id: 1001, data_type: 'CONTRACT', data_id: 'VHC-20210101-001',
      custname: '홍길동',
      carsnums: '47하9604', carsodnm: '그랜저 IG 2021',
      imagkind_label: null, imagonam: null,
      external_deleted_at: null,
    },
    {
      external_item_id: 1002, data_type: 'CONTRACT', data_id: 'VHC-20210101-002',
      custname: '김영희',
      carsnums: '48하1234', carsodnm: '쏘렌토 MQ4 2021',
      imagkind_label: null, imagonam: null,
      external_deleted_at: null,
    },
    {
      external_item_id: 1003, data_type: 'FILE', data_id: 'FILE-99281',
      custname: '홍길동',
      carsnums: null, carsodnm: null,
      imagkind_label: '계약서 첨부 (운전면허증)', imagonam: '홍길동_운전면허_2021.jpg',
      external_deleted_at: null,
    },
  ],
  2: [
    {
      external_item_id: 2001, data_type: 'CONTRACT', data_id: 'VHC-20210320-005',
      custname: '박철수',
      carsnums: '49하5566', carsodnm: 'K5 DL3 2021',
      imagkind_label: null, imagonam: null,
      external_deleted_at: null,
    },
  ],
}

class MockDisposalAdapter implements DisposalAdapter {
  mode = 'mock' as const

  async listApprovals(filter?: {
    pendingOnly?: boolean
    sinceDate?: string
    limit?: number
  }): Promise<ExternalApproval[]> {
    let rows = [...MOCK_APPROVALS]
    if (filter?.pendingOnly) {
      rows = rows.filter(r => !r.confirmed_at)
    }
    if (filter?.sinceDate) {
      rows = rows.filter(r => (r.request_at || '') >= filter.sinceDate!)
    }
    if (filter?.limit) {
      rows = rows.slice(0, filter.limit)
    }
    return rows
  }

  async listItemsByApproval(approvalId: number): Promise<ExternalDisposalItem[]> {
    return MOCK_ITEMS[approvalId] || []
  }
}

// ── direct (별도 Prisma datasource) — stub ─────────────────────
// 사용자 결정 후 구현:
//   1. prisma/schema.prisma 에 datasource yangjaehee 추가
//   2. prisma generate 후 generated client import
//   3. 아래 stub 을 실제 쿼리로 교체
class DirectDbDisposalAdapter implements DisposalAdapter {
  mode = 'direct' as const

  async listApprovals(): Promise<ExternalApproval[]> {
    throw new Error('direct mode 미구현 — 사용자 결정 후 별도 Prisma datasource 추가 필요')
  }
  async listItemsByApproval(): Promise<ExternalDisposalItem[]> {
    throw new Error('direct mode 미구현')
  }
}

// ── api (카페24 REST) — stub ─────────────────────────────────
class ApiDisposalAdapter implements DisposalAdapter {
  mode = 'api' as const

  async listApprovals(): Promise<ExternalApproval[]> {
    throw new Error('api mode 미구현 — 카페24 endpoint + 인증 결정 필요')
  }
  async listItemsByApproval(): Promise<ExternalDisposalItem[]> {
    throw new Error('api mode 미구현')
  }
}

// ── etl (mirror 테이블 직접 조회) ──────────────────────────────
// 일일 ETL 로 ride_compliance_disposal_items 에 미리 sync 됐다고 가정.
// 본 시스템 DB 만 사용 — 가장 안전.
class EtlDisposalAdapter implements DisposalAdapter {
  mode = 'etl' as const

  async listApprovals(): Promise<ExternalApproval[]> {
    // mirror 테이블만 사용 — 외부 호출 없음.
    // 실제로는 prisma.ride_compliance_disposal_reviews 조회.
    // 본 어댑터에서는 시연용으로 빈 배열 반환 — 실 ETL 구축 후 활성.
    return []
  }
  async listItemsByApproval(): Promise<ExternalDisposalItem[]> {
    return []
  }
}

// ── factory ──────────────────────────────────────────────────────

export function getDisposalAdapter(): DisposalAdapter {
  const mode = getAdapterMode()
  switch (mode) {
    case 'direct': return new DirectDbDisposalAdapter()
    case 'api':    return new ApiDisposalAdapter()
    case 'etl':    return new EtlDisposalAdapter()
    case 'mock':
    default:       return new MockDisposalAdapter()
  }
}

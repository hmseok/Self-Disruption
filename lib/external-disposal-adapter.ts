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

// ── direct (cafe24Db read-only pool) — 실 구현 (2026-05-28 P12-D) ──
//
// 기존 lib/cafe24-db.ts (mysql2 pool + read-only enforce) 그대로 사용.
// 사용자 SQL 명세서 5장 그대로 (expired_approval + expired_data + JOIN pmccarsm/pmccustm/imrimagh).
//
// 활성화: 환경변수 DISPOSAL_ADAPTER_MODE=direct
// 필요 env: CAFE24_DB_HOST / CAFE24_DB_PORT / CAFE24_DB_USER / CAFE24_DB_PASSWORD / CAFE24_DB_NAME
//          (이미 .env.local / Cloud Run env 에 존재)
class DirectDbDisposalAdapter implements DisposalAdapter {
  mode = 'direct' as const

  async listApprovals(filter?: {
    pendingOnly?: boolean
    sinceDate?: string
    limit?: number
  }): Promise<ExternalApproval[]> {
    const { cafe24Db } = await import('./cafe24-db')

    const wheres: string[] = []
    const params: unknown[] = []
    if (filter?.pendingOnly) {
      wheres.push('(confirmed_at IS NULL OR confirmed_at = "")')
    }
    if (filter?.sinceDate) {
      // request_at 은 varchar(100) 'yyyy-MM-dd HH:mm:ss' — 문자열 비교 OK
      wheres.push('request_at >= ?')
      params.push(filter.sinceDate)
    }
    const whereSql = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : ''
    const limit = Math.max(1, Math.min(500, filter?.limit ?? 100))

    const sql = `
      SELECT id,
             request_at,
             request_by,
             expired_count,
             approval_request_id,
             approval_request_at,
             deleted_at,
             deleted_by,
             confirmed_by,
             confirmed_at
        FROM expired_approval
        ${whereSql}
       ORDER BY request_at DESC
       LIMIT ${limit}
    `
    const rows = await cafe24Db.query<any>(sql, params)
    return rows.map(r => ({
      id: Number(r.id),
      request_at: r.request_at ?? null,
      request_by: r.request_by ?? null,
      expired_count: Number(r.expired_count ?? 0),
      approval_request_id: r.approval_request_id ?? null,
      approval_request_at: r.approval_request_at ?? null,
      deleted_at: r.deleted_at ?? null,
      deleted_by: r.deleted_by ?? null,
      confirmed_by: r.confirmed_by ?? null,
      confirmed_at: r.confirmed_at ?? null,
    }))
  }

  async listItemsByApproval(approvalId: number): Promise<ExternalDisposalItem[]> {
    const { cafe24Db } = await import('./cafe24-db')

    // 사용자 SQL 명세서 그대로 — expired_approval_id 필터 추가.
    // 두 union (CONTRACT + FILE) — 각 type 별 JOIN.
    //
    // 주의: 사용자 SQL 은 expired_data 전체 대상이었으나,
    //       본 시스템은 결재 단위 (expired_approval_id) 로 좁힌다.
    const sql = `
      SELECT 'CONTRACT' AS data_type,
             ed.id AS external_item_id,
             ed.data_id AS data_id,
             ed.deleted_at AS external_deleted_at,
             cu.custname AS custname,
             MAX(ca.carsnums) AS carsnums,
             MAX(ca.carsodnm) AS carsodnm,
             NULL AS imagkind_label,
             NULL AS imagonam
        FROM expired_data ed
        JOIN pmccarsm ca ON ca.carsidno = ed.data_id
        JOIN pmccustm cu ON cu.custcode = ca.carscust
       WHERE ed.expired_approval_id = ?
         AND ed.data_type = 'CONTRACT'
       GROUP BY ed.id, ed.data_id, ed.deleted_at, cu.custname

      UNION ALL

      SELECT 'FILE' AS data_type,
             ed.id AS external_item_id,
             ed.data_id AS data_id,
             ed.deleted_at AS external_deleted_at,
             cu.custname AS custname,
             ca.carsnums AS carsnums,
             ca.carsodnm AS carsodnm,
             get_cbsddesc('IMAGKIND', img.imagkind) AS imagkind_label,
             img.imagonam AS imagonam
        FROM expired_data ed
        JOIN imrimagh img ON img.imagiuid = ed.data_id
        JOIN pmccarsm ca  ON ca.carsidno = img.imagidno
                         AND img.imagmddt BETWEEN ca.carsfrdt AND ca.carstodt
        JOIN pmccustm cu  ON cu.custcode = ca.carscust
       WHERE ed.expired_approval_id = ?
         AND ed.data_type = 'FILE'

       ORDER BY data_type, data_id
    `
    const rows = await cafe24Db.query<any>(sql, [approvalId, approvalId])
    return rows.map(r => ({
      external_item_id: r.external_item_id != null ? Number(r.external_item_id) : null,
      data_type: (r.data_type as 'CONTRACT' | 'FILE'),
      data_id: String(r.data_id ?? ''),
      custname: r.custname ?? null,
      carsnums: r.carsnums ?? null,
      carsodnm: r.carsodnm ?? null,
      imagkind_label: r.imagkind_label ?? null,
      imagonam: r.imagonam ?? null,
      external_deleted_at: r.external_deleted_at ?? null,
    }))
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

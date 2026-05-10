'use client'

/**
 * /RideCustomerData — 라이드 고객사 데이터 통합
 *
 * PR-6.10
 *
 * 4탭:
 *   1) 고객사 마스터 (ride_customer_companies)
 *   2) 캐피탈 보고  (ride_capital_reports — iM/메리츠/MG)
 *   3) 계약 마스터  (ride_contracts — 전산등록 B2B)
 *   4) 통합 검색    (차량번호 cross 검색 — 보고/계약/카페24)
 *
 * 사이드바: 관리자 운영 > 라이드 고객사 데이터
 * admin 전용
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import { usePermission } from '@/app/hooks/usePermission'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import RideOpsNavTabs from '@/app/components/ride-ops/NavTabs'
import RideOpsPageHeader from '@/app/components/ride-ops/PageHeader'

// ───────────────────────── 타입 ──────────────────────────────────
interface Company {
  id: string
  name: string
  type: string | null
  report_frequency: string | null
  active: number
  note: string | null
  created_at: string
  updated_at: string
}

interface CapitalReport {
  id: string
  customer_id: string | null
  customer_name_snap: string | null
  report_date: string | null
  source_file: string | null
  exec_no: string | null
  cust_name: string | null
  car_number: string | null
  car_model: string | null
  car_reg_date: string | null
  loan_start_date: string | null
  loan_end_date: string | null
  insurance_co: string | null
  ins_di: string | null
  ins_dm: string | null
  monthly_fee: string | null
  emergency: string | null
  closing_date: string | null
  termination_date: string | null
  sales_dept: string | null
  sales_manager: string | null
  cust_mobile: string | null
  cust_address: string | null
  note: string | null
  created_at: string
  updated_at: string
}

interface Contract {
  id: string
  customer_id: string | null
  exec_no: string | null
  contractor: string | null
  contract_product: string | null
  user_name: string | null
  car_number: string | null
  car_model: string | null
  car_reg_date: string | null
  contract_start: string | null
  contract_end: string | null
  insurance_co: string | null
  monthly_fee: string | null
  cust_manager: string | null
  cust_mobile: string | null
  cust_address: string | null
  status: string
  note: string | null
  created_at: string
  updated_at: string
}

type Tab = 'companies' | 'reports' | 'contracts' | 'search'

function fmt(v: string | null | undefined): string {
  return v ?? ''
}

// DB 컬럼 → 사용자 친화 한글 라벨 (상세 모달 + 표 헤더)
const COLUMN_LABEL_KO: Record<string, string> = {
  // 메타
  id: 'ID',
  customer_id: '고객사 ID',
  customer_name_snap: '고객사',
  report_date: '보고일자',
  source_file: '원본 파일',
  exec_no: '실행번호',
  // 고객/차량
  cust_name: '고객명',
  car_number: '차량번호',
  car_model: '차종',
  car_reg_date: '차량등록일',
  vin: '차대번호',
  car_options: '차량옵션',
  // 여신/계약
  loan_start_date: '여신/계약 시작일',
  loan_period: '기간',
  loan_end_date: '여신/계약 만기일',
  exec_reason: '실행사유',
  contract_start: '계약시작일',
  contract_period: '계약기간',
  contract_end: '계약종료일',
  is_new: '신규/재렌탈',
  contractor: '계약자',
  contract_product: '계약상품',
  user_name: '이용자',
  // 보험
  insurance_co: '보험사',
  age_band: '연령',
  ins_start_date: '보험 개시일',
  ins_period: '보험 기간',
  ins_di: '대인',
  ins_dm: '대물',
  ins_js: '자손/자기신체',
  ins_uninsured: '무보험',
  ins_deductible: '자기부담금',
  // 정비/긴출
  emergency: '긴급출동',
  monthly_fee: '월정비료',
  maint_product: '정비상품',
  snow_tire: '스노우타이어',
  snow_chain: '체인',
  // 담당자/연락처
  cust_manager: '고객담당자',
  cust_phone: '전화',
  office_phone: '사무실 전화',
  cust_mobile: '휴대폰',
  cust_address: '고객 주소',
  bill_address: '청구지 주소',
  // 운영 (메리츠 등)
  maint_company: '정비업체명',
  closing_date: '마감일자',
  termination_date: '해지일자',
  sales_dept: '영업부서',
  sales_manager: '영업담당자',
  registered_by: '실행등록자',
  // iM 추가
  rent_substitute: '렌트(대차)',
  additional_driver: '추가운전자',
  special_clause: '특약가입여부',
  // 기타
  status: '상태',
  note: '비고',
  raw_extra: '추가 데이터',
  created_by: '등록자',
  created_at: '등록일시',
  updated_at: '수정일시',
}

function labelKo(key: string): string {
  return COLUMN_LABEL_KO[key] || key
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    // ISO 날짜 → YYYY-MM-DD
    return v.substring(0, 10)
  }
  return String(v)
}

function clip(v: string | null | undefined, n = 30): string {
  if (!v) return ''
  return v.length > n ? v.substring(0, n) + '…' : v
}

// ───────────────────────── 메인 ──────────────────────────────────
export default function RideCustomerDataPage() {
  const [user, setUser] = useState<{ role?: string; id?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  // hotfix 2026-05-09: admin-only → admin OR hasPageAccess (사이드바 권한 시스템 일치)
  const { hasPageAccess } = usePermission()
  const canAccess = user?.role === 'admin' || hasPageAccess('/RideCustomerData')
  const [tab, setTab] = useState<Tab>('contracts')

  // 공통 — 고객사 마스터 (모든 탭에서 사용)
  const [companies, setCompanies] = useState<Company[]>([])
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [companiesError, setCompaniesError] = useState<string | null>(null)

  // Tab 2 — 캐피탈 보고
  const [reports, setReports] = useState<CapitalReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [reportFilter, setReportFilter] = useState<{ customer_id: string; q: string }>({
    customer_id: '',
    q: '',
  })

  // Tab 3 — 계약 마스터
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractsLoading, setContractsLoading] = useState(false)
  const [contractsError, setContractsError] = useState<string | null>(null)
  const [contractFilter, setContractFilter] = useState<{ customer_id: string; q: string }>({
    customer_id: '',
    q: '',
  })

  // 신규 고객사 모달
  const [companyModal, setCompanyModal] = useState<Partial<Company> | null>(null)

  // 보고/계약 상세 모달
  const [reportDetail, setReportDetail] = useState<CapitalReport | null>(null)
  const [contractDetail, setContractDetail] = useState<Contract | null>(null)

  // 엑셀 업로드 모달 (다중 파일)
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => {
    setUser(getStoredUser())
    setAuthChecked(true)
  }, [])

  // ─── 고객사 마스터 fetch ───────────────────────────────────────
  const fetchCompanies = useMemo(
    () =>
      async function () {
        setCompaniesLoading(true)
        setCompaniesError(null)
        try {
          const token = getStoredToken()
          const res = await fetch('/api/ride-customer-companies?all=1', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          if (!res.ok || !json.success) {
            setCompaniesError(json.error || `HTTP ${res.status}`)
            setCompanies([])
          } else {
            setCompanies(json.data || [])
            if (json.meta?._migration_pending) {
              setCompaniesError('⚠ 마이그레이션 미적용 — migrations/2026-05-08_ride_customer_data.sql')
            }
          }
        } catch (e) {
          setCompaniesError(String(e))
        } finally {
          setCompaniesLoading(false)
        }
      },
    []
  )

  // ─── 캐피탈 보고 fetch ─────────────────────────────────────────
  const fetchReports = useMemo(
    () =>
      async function () {
        setReportsLoading(true)
        setReportsError(null)
        try {
          const token = getStoredToken()
          const params = new URLSearchParams()
          if (reportFilter.customer_id) params.set('customer_id', reportFilter.customer_id)
          if (reportFilter.q.trim()) params.set('q', reportFilter.q.trim())
          const res = await fetch(`/api/ride-capital-reports?${params}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          if (!res.ok || !json.success) {
            setReportsError(json.error || `HTTP ${res.status}`)
            setReports([])
          } else {
            setReports(json.data || [])
            if (json.meta?._migration_pending) {
              setReportsError('⚠ 마이그레이션 미적용')
            }
          }
        } catch (e) {
          setReportsError(String(e))
        } finally {
          setReportsLoading(false)
        }
      },
    [reportFilter]
  )

  // ─── 계약 마스터 fetch ─────────────────────────────────────────
  const fetchContracts = useMemo(
    () =>
      async function () {
        setContractsLoading(true)
        setContractsError(null)
        try {
          const token = getStoredToken()
          const params = new URLSearchParams()
          if (contractFilter.customer_id) params.set('customer_id', contractFilter.customer_id)
          if (contractFilter.q.trim()) params.set('q', contractFilter.q.trim())
          const res = await fetch(`/api/ride-contracts?${params}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          if (!res.ok || !json.success) {
            setContractsError(json.error || `HTTP ${res.status}`)
            setContracts([])
          } else {
            setContracts(json.data || [])
            if (json.meta?._migration_pending) {
              setContractsError('⚠ 마이그레이션 미적용')
            }
          }
        } catch (e) {
          setContractsError(String(e))
        } finally {
          setContractsLoading(false)
        }
      },
    [contractFilter]
  )

  useEffect(() => {
    if (!authChecked || !canAccess) return
    fetchCompanies()
  }, [authChecked, user, fetchCompanies])

  useEffect(() => {
    if (!authChecked || !canAccess) return
    if (tab === 'reports') fetchReports()
    if (tab === 'contracts') fetchContracts()
  }, [authChecked, user, tab, fetchReports, fetchContracts])

  // ─── 권한 ─────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div style={{ padding: 24, color: COLORS.textSecondary }}>인증 확인 중…</div>
    )
  }
  if (!canAccess) {
    return (
      <div style={{ padding: 24, color: COLORS.danger }}>
        ⚠ 권한 필요 (관리자 또는 페이지 권한)
      </div>
    )
  }

  const companyName = (id: string | null | undefined): string => {
    if (!id) return ''
    return companies.find(c => c.id === id)?.name || ''
  }

  // ─── 컬럼 정의 ────────────────────────────────────────────────
  const companyCols: TableColumn<Company>[] = [
    {
      key: 'name',
      label: '고객사',
      sortBy: r => r.name,
      render: r => <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}</span>,
    },
    {
      key: 'type',
      label: '구분',
      sortBy: r => r.type || '',
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{r.type || '-'}</span>,
    },
    {
      key: 'freq',
      label: '주기',
      sortBy: r => r.report_frequency || '',
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{r.report_frequency || '-'}</span>,
    },
    {
      key: 'active',
      label: '상태',
      sortBy: r => r.active,
      render: r =>
        r.active ? (
          <span style={{ color: COLORS.success, whiteSpace: 'nowrap' }}>활성</span>
        ) : (
          <span style={{ color: COLORS.neutral, whiteSpace: 'nowrap' }}>비활성</span>
        ),
    },
    {
      key: 'note',
      label: '비고',
      sortBy: r => r.note || '',
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{clip(r.note, 40)}</span>,
    },
    {
      key: 'actions',
      label: '액션',
      render: r => (
        <button
          style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary }}
          onClick={() => setCompanyModal(r)}
        >
          편집
        </button>
      ),
    },
  ]

  const reportCols: TableColumn<CapitalReport>[] = [
    {
      key: 'report_date',
      label: '보고일',
      sortBy: r => r.report_date || '',
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{fmtValue(r.report_date)}</span>,
    },
    {
      key: 'customer',
      label: '고객사',
      sortBy: r => r.customer_name_snap || companyName(r.customer_id),
      render: r => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {r.customer_name_snap || companyName(r.customer_id) || '-'}
        </span>
      ),
    },
    {
      key: 'exec_no',
      label: '실행번호',
      sortBy: r => r.exec_no || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{fmt(r.exec_no)}</span>,
    },
    {
      key: 'car_number',
      label: '차량',
      sortBy: r => r.car_number || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{fmt(r.car_number)}</span>,
    },
    {
      key: 'car_model',
      label: '차종',
      sortBy: r => r.car_model || '',
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{clip(r.car_model, 24)}</span>,
    },
    {
      key: 'cust_name',
      label: '고객명',
      sortBy: r => r.cust_name || '',
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{fmt(r.cust_name)}</span>,
    },
    {
      key: 'insurance_co',
      label: '보험사',
      sortBy: r => r.insurance_co || '',
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{clip(r.insurance_co, 16)}</span>,
    },
    {
      key: 'monthly_fee',
      label: '월정비료',
      sortBy: r => Number(r.monthly_fee || 0),
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{fmt(r.monthly_fee)}</span>,
    },
    {
      key: 'closing_date',
      label: '마감/해지',
      sortBy: r => r.closing_date || r.termination_date || '',
      render: r => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {r.termination_date && r.termination_date !== '0000/00/00'
            ? <span style={{ color: COLORS.danger }}>해지 {r.termination_date}</span>
            : r.closing_date && r.closing_date !== '0000/00/00'
            ? <span style={{ color: COLORS.success }}>마감 {r.closing_date}</span>
            : '-'}
        </span>
      ),
    },
    {
      key: 'detail',
      label: '상세',
      render: r => (
        <button
          style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary }}
          onClick={() => setReportDetail(r)}
        >
          보기
        </button>
      ),
    },
  ]

  const contractCols: TableColumn<Contract>[] = [
    {
      key: 'exec_no',
      label: '실행번호',
      sortBy: r => r.exec_no || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{fmt(r.exec_no)}</span>,
    },
    {
      key: 'customer',
      label: '고객사',
      sortBy: r => companyName(r.customer_id),
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{companyName(r.customer_id) || '-'}</span>,
    },
    {
      key: 'contractor',
      label: '계약자',
      sortBy: r => r.contractor || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{clip(r.contractor, 20)}</span>,
    },
    {
      key: 'contract_product',
      label: '계약상품',
      sortBy: r => r.contract_product || '',
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{clip(r.contract_product, 18)}</span>,
    },
    {
      key: 'user_name',
      label: '이용자',
      sortBy: r => r.user_name || '',
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{clip(r.user_name, 20)}</span>,
    },
    {
      key: 'car_number',
      label: '차량',
      sortBy: r => r.car_number || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{fmt(r.car_number)}</span>,
    },
    {
      key: 'car_model',
      label: '차종',
      sortBy: r => r.car_model || '',
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{clip(r.car_model, 24)}</span>,
    },
    {
      key: 'period',
      label: '계약기간',
      sortBy: r => r.contract_start || '',
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
          {fmt(r.contract_start)} ~ {fmt(r.contract_end)}
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      sortBy: r => r.status,
      render: r =>
        r.status === 'active' ? (
          <span style={{ color: COLORS.success, whiteSpace: 'nowrap' }}>활성</span>
        ) : (
          <span style={{ color: COLORS.neutral, whiteSpace: 'nowrap' }}>{r.status}</span>
        ),
    },
    {
      key: 'detail',
      label: '상세',
      render: r => (
        <button
          style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary }}
          onClick={() => setContractDetail(r)}
        >
          보기
        </button>
      ),
    },
  ]

  const tabBtn = (id: Tab, label: string, count?: number): React.CSSProperties => ({
    padding: '10px 18px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    whiteSpace: 'nowrap',
    background: tab === id ? COLORS.primary : 'rgba(255,255,255,0.50)',
    color: tab === id ? '#fff' : COLORS.textSecondary,
    transition: 'all 0.15s',
  })

  return (
    <>
    <RideOpsNavTabs />
    <div style={{ padding: 16, maxWidth: 1600, margin: '0 auto' }}>
      {/* PR-6.13.b — 디자인 표준 헤더 */}
      <RideOpsPageHeader
        breadcrumb="관리자 운영"
        title="라이드 고객사 데이터"
        emoji="🏢"
        sub="📜 장기 계약 (B2B 만료/해지) · 📥 업로드 이력 (캐피탈 raw 누적)"
        actions={
          <button
            style={{ ...BTN.md, background: COLORS.bgViolet, color: '#7c3aed', border: `1px solid ${COLORS.borderViolet}` }}
            onClick={() => setCompanyModal({})}
          >
            + 고객사 추가
          </button>
        }
      />

      {/* ─── 탭 — 운영 메인 (장기 계약) → 마스터 → 히스토리 ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button style={tabBtn('contracts', '📜 장기 계약')} onClick={() => setTab('contracts')}>
          📜 장기 계약 (B2B 메인) {contracts.length > 0 && `(${contracts.length})`}
        </button>
        <button style={tabBtn('companies', '🏢 고객사 마스터')} onClick={() => setTab('companies')}>
          🏢 고객사 ({companies.length})
        </button>
        <button style={tabBtn('reports', '📥 업로드 이력')} onClick={() => setTab('reports')}>
          📥 업로드 이력 {reports.length > 0 && `(${reports.length})`}
        </button>
      </div>

      {/* ─── Tab: 캐피탈 보고 ─── */}
      {tab === 'reports' && (
        <div style={{ ...GLASS.L4, padding: 16, borderRadius: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)' }}
              value={reportFilter.customer_id}
              onChange={e => setReportFilter(s => ({ ...s, customer_id: e.target.value }))}
            >
              <option value="">전체 고객사</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="차량번호/실행번호/고객명/차종..."
              style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)', minWidth: 280 }}
              value={reportFilter.q}
              onChange={e => setReportFilter(s => ({ ...s, q: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') fetchReports()
              }}
            />
            <button style={{ ...BTN.sm, background: COLORS.primary, color: '#fff' }} onClick={fetchReports}>
              검색
            </button>
            <button
              style={{ ...BTN.sm, background: COLORS.bgGreen, color: COLORS.success, marginLeft: 'auto' }}
              onClick={() => setUploadOpen(true)}
            >
              📥 엑셀
            </button>
            <span style={{ color: COLORS.textMuted, fontSize: 12 }}>
              {reportsLoading ? '로딩 중…' : `${reports.length}건`}
            </span>
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: 6 }}>
            ℹ️ 업로드된 raw 보고 누적 이력 — 같은 차량이 여러 날짜에 중복 보고될 수 있음 (원본 추적용)
          </div>
          {reportsError && (
            <div style={{ padding: 8, background: COLORS.bgRed, color: COLORS.danger, borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
              {reportsError}
            </div>
          )}
          <NeuDataTable
            columns={reportCols}
            data={reports}
            rowKey={r => r.id}
            defaultSort={{ key: 'report_date', dir: 'desc' }}
            emptyMessage="업로드 이력 없음 — [📥 엑셀] 버튼으로 보고 파일 업로드"
          />
        </div>
      )}

      {/* ─── Tab: 계약 마스터 ─── */}
      {tab === 'contracts' && (
        <div style={{ ...GLASS.L4, padding: 16, borderRadius: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)' }}
              value={contractFilter.customer_id}
              onChange={e => setContractFilter(s => ({ ...s, customer_id: e.target.value }))}
            >
              <option value="">전체 고객사</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="계약자/이용자/차량번호/실행번호..."
              style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)', minWidth: 280 }}
              value={contractFilter.q}
              onChange={e => setContractFilter(s => ({ ...s, q: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') fetchContracts()
              }}
            />
            <button style={{ ...BTN.sm, background: COLORS.primary, color: '#fff' }} onClick={fetchContracts}>
              검색
            </button>
            <span style={{ color: COLORS.textMuted, fontSize: 12, marginLeft: 'auto' }}>
              {contractsLoading ? '로딩 중…' : `${contracts.length}건`}
            </span>
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: 6 }}>
            ℹ️ 활성 계약 1건 = 1 row — 계약자/이용자 분리된 B2B 마스터 (만료/해지 추적)
          </div>
          {contractsError && (
            <div style={{ padding: 8, background: COLORS.bgRed, color: COLORS.danger, borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
              {contractsError}
            </div>
          )}
          <NeuDataTable
            columns={contractCols}
            data={contracts}
            rowKey={r => r.id}
            defaultSort={{ key: 'exec_no', dir: 'desc' }}
            emptyMessage="계약 마스터 없음 — 엑셀 업로드 또는 수기 등록"
          />
        </div>
      )}

      {/* ─── Tab: 고객사 마스터 ─── */}
      {tab === 'companies' && (
        <div style={{ ...GLASS.L4, padding: 16, borderRadius: 16 }}>
          {companiesError && (
            <div style={{ padding: 8, background: COLORS.bgRed, color: COLORS.danger, borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
              {companiesError}
            </div>
          )}
          <NeuDataTable
            columns={companyCols}
            data={companies}
            rowKey={r => r.id}
            defaultSort={{ key: 'name', dir: 'asc' }}
            emptyMessage="고객사 없음"
          />
        </div>
      )}

      {/* ─── 고객사 모달 ─── */}
      {companyModal && (
        <CompanyModal
          init={companyModal}
          onClose={() => setCompanyModal(null)}
          onSaved={() => {
            setCompanyModal(null)
            fetchCompanies()
          }}
        />
      )}

      {/* ─── 보고 상세 모달 ─── */}
      {reportDetail && (
        <DetailModal
          title={`📥 업로드 이력 — ${reportDetail.car_number || reportDetail.exec_no || '상세'}`}
          rows={Object.entries(reportDetail).filter(([k]) => k !== 'id')}
          onClose={() => setReportDetail(null)}
        />
      )}

      {/* ─── 계약 상세 모달 ─── */}
      {contractDetail && (
        <DetailModal
          title={`📜 장기 계약 — ${contractDetail.car_number || contractDetail.exec_no || '상세'}`}
          rows={Object.entries(contractDetail).filter(([k]) => k !== 'id')}
          onClose={() => setContractDetail(null)}
        />
      )}

      {/* ─── 엑셀 업로드 모달 (다중 파일) ─── */}
      {uploadOpen && (
        <MultiUploadModal
          companies={companies}
          onClose={() => setUploadOpen(false)}
          onAnyApplied={() => {
            fetchReports()
            fetchContracts()
          }}
        />
      )}
    </div>
    </>
  )
}

// ───────────────────────── 모달들 ────────────────────────────────

function CompanyModal({
  init,
  onClose,
  onSaved,
}: {
  init: Partial<Company>
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: init.name || '',
    type: init.type || 'capital',
    report_frequency: init.report_frequency || 'monthly',
    note: init.note || '',
    active: init.active === undefined ? 1 : init.active,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const editing = !!init.id

  const save = async () => {
    if (!form.name.trim()) {
      setErr('고객사명 필수')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const token = getStoredToken()
      const method = editing ? 'PATCH' : 'POST'
      const url = editing ? `/api/ride-customer-companies/${init.id}` : '/api/ride-customer-companies'
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErr(json.error || `HTTP ${res.status}`)
        return
      }
      onSaved()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title={editing ? '🏢 고객사 편집' : '🏢 고객사 추가'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="고객사명 *">
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={inputStyle}
          />
        </Field>
        <Field label="구분">
          <select
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            style={inputStyle}
          >
            <option value="capital">capital (캐피탈)</option>
            <option value="finance">finance (금융사)</option>
            <option value="corp">corp (법인 일반)</option>
            <option value="other">other (기타)</option>
          </select>
        </Field>
        <Field label="보고 주기">
          <select
            value={form.report_frequency}
            onChange={e => setForm(f => ({ ...f, report_frequency: e.target.value }))}
            style={inputStyle}
          >
            <option value="daily">daily (매일)</option>
            <option value="weekly">weekly (주간)</option>
            <option value="monthly">monthly (월간)</option>
            <option value="on-demand">on-demand (수시)</option>
          </select>
        </Field>
        <Field label="비고">
          <textarea
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            style={{ ...inputStyle, minHeight: 60 }}
          />
        </Field>
        {editing && (
          <Field label="상태">
            <select
              value={form.active}
              onChange={e => setForm(f => ({ ...f, active: Number(e.target.value) }))}
              style={inputStyle}
            >
              <option value={1}>활성</option>
              <option value={0}>비활성</option>
            </select>
          </Field>
        )}
        {err && <div style={{ color: COLORS.danger, fontSize: 12 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={{ ...BTN.md, background: COLORS.bgGray, color: COLORS.textSecondary }} onClick={onClose}>
            취소
          </button>
          <button
            style={{ ...BTN.md, background: COLORS.primary, color: '#fff' }}
            onClick={save}
            disabled={busy}
          >
            {busy ? '저장 중…' : editing ? '저장' : '추가'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function DetailModal({
  title,
  rows,
  onClose,
}: {
  title: string
  rows: [string, unknown][]
  onClose: () => void
}) {
  // 표시 우선순위 — 비어있는 필드는 뒤로 (선택)
  // 그리고 'id' 와 'customer_id' (UUID) 같은 내부 필드는 숨김 또는 뒤로
  const HIDE_KEYS = new Set(['id', 'customer_id', 'created_by', 'raw_extra'])
  const visible = rows.filter(([k]) => !HIDE_KEYS.has(k))

  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
        {visible.map(([k, v]) => (
          <div
            key={k}
            style={{
              display: 'flex',
              borderBottom: '1px solid rgba(0,0,0,0.05)',
              padding: '6px 0',
              alignItems: 'baseline',
            }}
          >
            <span
              style={{
                width: 130,
                color: COLORS.textMuted,
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {labelKo(k)}
            </span>
            <span
              style={{
                color: COLORS.textPrimary,
                wordBreak: 'break-all',
                fontWeight: v ? 500 : 400,
              }}
            >
              {fmtValue(v)}
            </span>
          </div>
        ))}
      </div>
    </ModalShell>
  )
}

// ───────────────────────── MultiUploadModal ──────────────────────
// 여러 파일 동시 업로드 — 각 파일별 자동 감지 + 표 형식 미리보기

interface PreviewData {
  target: 'capital_reports' | 'contracts'
  detected: {
    file_name: string
    sheet?: string
    header_row_index?: number
    total_data_rows: number
    parsed_rows: number
    report_date?: string | null
    customer_id?: string | null
    customer_name_snap?: string | null
    suggested_customer_id?: string | null
    suggested_customer_name?: string | null
  }
  mapping: {
    mapped: Record<string, string>
    unmapped_headers: string[]
  }
  sample: {
    headers: string[]   // 한글 라벨
    cols?: string[]     // db 컬럼 (참고용)
    rows: (string | null)[][]
  }
}

interface FileItem {
  id: string
  file: File
  customer_id: string
  report_date: string
  target: 'capital_reports' | 'contracts'
  preview: PreviewData | null
  result: { inserted: number; skipped: number; errors: string[] } | null
  busy: boolean
  error: string | null
}

function MultiUploadModal({
  companies,
  onClose,
  onAnyApplied,
}: {
  companies: Company[]
  onClose: () => void
  onAnyApplied: () => void
}) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [bulkApplying, setBulkApplying] = useState(false)
  const [defaultCustomerId, setDefaultCustomerId] = useState('')

  const addFiles = async (fl: FileList | null) => {
    if (!fl || fl.length === 0) return
    const newItems: FileItem[] = Array.from(fl).map(f => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      file: f,
      customer_id: defaultCustomerId,
      report_date: '',
      target: 'capital_reports',
      preview: null,
      result: null,
      busy: false,
      error: null,
    }))
    setFiles(prev => [...prev, ...newItems])
    // 각 파일에 대해 자동 preview
    for (const item of newItems) {
      await runPreview(item.id, item.file, item.customer_id, '', '')
    }
  }

  const runPreview = async (
    id: string,
    file: File,
    customer_id: string,
    target: string,
    report_date: string
  ) => {
    setFiles(prev => prev.map(f => (f.id === id ? { ...f, busy: true, error: null } : f)))
    try {
      const token = getStoredToken()
      const fd = new FormData()
      fd.append('file', file)
      if (target) fd.append('target', target)
      if (customer_id) fd.append('customer_id', customer_id)
      if (report_date) fd.append('report_date', report_date)
      fd.append('mode', 'preview')
      const res = await fetch('/api/ride-customer-data/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      // 503 / HTML 에러 응답 안전 파싱
      const text = await res.text()
      let json: { success?: boolean; error?: string; target?: string; detected?: { report_date?: string | null; suggested_customer_id?: string | null } } & Record<string, unknown>
      try {
        json = JSON.parse(text)
      } catch {
        const status = res.status
        const snippet = text.slice(0, 100)
        setFiles(prev =>
          prev.map(f =>
            f.id === id
              ? { ...f, busy: false, error: `서버 ${status}: ${snippet}${text.length > 100 ? '…' : ''}` }
              : f
          )
        )
        return
      }
      if (!res.ok || !json.success) {
        setFiles(prev =>
          prev.map(f => (f.id === id ? { ...f, busy: false, error: json.error || `HTTP ${res.status}` } : f))
        )
        return
      }
      setFiles(prev =>
        prev.map(f =>
          f.id === id
            ? {
                ...f,
                busy: false,
                preview: json as unknown as PreviewData,
                target: (json.target as 'capital_reports' | 'contracts') || f.target,
                report_date: json.detected?.report_date || f.report_date,
                // 자동 추정된 customer_id 가 있고 사용자 미지정이면 자동 채택
                customer_id: f.customer_id || (json.detected?.suggested_customer_id ?? '') || '',
              }
            : f
        )
      )
    } catch (e) {
      setFiles(prev =>
        prev.map(f => (f.id === id ? { ...f, busy: false, error: String(e) } : f))
      )
    }
  }

  const applyOne = async (id: string) => {
    const item = files.find(f => f.id === id)
    if (!item) return
    setFiles(prev => prev.map(f => (f.id === id ? { ...f, busy: true, error: null } : f)))
    try {
      const token = getStoredToken()
      const fd = new FormData()
      fd.append('file', item.file)
      fd.append('target', item.target)
      if (item.customer_id) fd.append('customer_id', item.customer_id)
      if (item.report_date) fd.append('report_date', item.report_date)
      fd.append('mode', 'apply')
      const res = await fetch('/api/ride-customer-data/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      const text = await res.text()
      let json: { success?: boolean; error?: string; result?: { inserted: number; skipped: number; errors: string[] } }
      try {
        json = JSON.parse(text)
      } catch {
        setFiles(prev =>
          prev.map(f =>
            f.id === id
              ? { ...f, busy: false, error: `서버 ${res.status}: ${text.slice(0, 100)}` }
              : f
          )
        )
        return
      }
      if (!res.ok || !json.success) {
        setFiles(prev =>
          prev.map(f => (f.id === id ? { ...f, busy: false, error: json.error || `HTTP ${res.status}` } : f))
        )
        return
      }
      setFiles(prev =>
        prev.map(f => (f.id === id ? { ...f, busy: false, result: json.result || { inserted: 0, skipped: 0, errors: [] } } : f))
      )
      onAnyApplied()
    } catch (e) {
      setFiles(prev =>
        prev.map(f => (f.id === id ? { ...f, busy: false, error: String(e) } : f))
      )
    }
  }

  const applyAll = async () => {
    setBulkApplying(true)
    for (const f of files) {
      if (f.result) continue
      if (!f.preview) continue
      await applyOne(f.id)
    }
    setBulkApplying(false)
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const updateField = (id: string, patch: Partial<FileItem>) => {
    setFiles(prev => prev.map(f => (f.id === id ? { ...f, ...patch, result: null } : f)))
    // 변경 후 자동 re-preview (target / customer_id / report_date 변경 시)
    const item = files.find(f => f.id === id)
    if (item && (patch.target !== undefined || patch.customer_id !== undefined || patch.report_date !== undefined)) {
      const next = { ...item, ...patch }
      runPreview(id, next.file, next.customer_id, next.target, next.report_date)
    }
  }

  const totalInserted = files.reduce((s, f) => s + (f.result?.inserted || 0), 0)
  const totalSkipped = files.reduce((s, f) => s + (f.result?.skipped || 0), 0)
  const pendingCount = files.filter(f => !f.result && f.preview).length

  return (
    <ModalShell title="📥 엑셀 일괄 업로드 (다중 파일 + 양식 자동 감지)" onClose={onClose} wide>
      <div style={{ display: 'grid', gap: 12 }}>
        {/* 기본 고객사 (모든 파일 일괄 적용) */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>
            기본 고객사 (모든 파일):
          </span>
          <select
            value={defaultCustomerId}
            onChange={e => {
              const v = e.target.value
              setDefaultCustomerId(v)
              // 이미 추가된 파일에도 일괄 적용
              setFiles(prev => prev.map(f => ({ ...f, customer_id: v, result: null })))
              // re-preview
              files.forEach(f => runPreview(f.id, f.file, v, f.target, f.report_date))
            }}
            style={{ ...inputStyle, width: 'auto', minWidth: 200 }}
          >
            <option value="">파일별 개별 지정</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* 파일 추가 — 드래그 & 드롭 + 클릭 */}
        <DropZone onFiles={addFiles} />

        {/* 파일별 카드 */}
        {files.length === 0 ? (
          <div style={{ textAlign: 'center', color: COLORS.textMuted, fontSize: 12, padding: 20 }}>
            파일을 추가하면 자동으로 양식을 감지합니다
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, maxHeight: '50vh', overflow: 'auto' }}>
            {files.map(f => (
              <FileCard
                key={f.id}
                item={f}
                companies={companies}
                onRemove={() => removeFile(f.id)}
                onUpdate={patch => updateField(f.id, patch)}
                onApply={() => applyOne(f.id)}
              />
            ))}
          </div>
        )}

        {/* 총계 + 액션 */}
        {files.length > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              padding: '8px 0',
              borderTop: '1px solid rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
              파일 <b>{files.length}</b>개 · 저장 대기 <b>{pendingCount}</b>개
              {totalInserted > 0 && (
                <span>
                  {' '}
                  · 누적 신규 <b style={{ color: COLORS.success }}>{totalInserted}</b>건 / 중복 {totalSkipped}건
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...BTN.md, background: COLORS.bgGray, color: COLORS.textSecondary }} onClick={onClose}>
                닫기
              </button>
              <button
                style={{
                  ...BTN.md,
                  background: COLORS.success,
                  color: '#fff',
                  opacity: pendingCount === 0 ? 0.5 : 1,
                }}
                disabled={bulkApplying || pendingCount === 0}
                onClick={applyAll}
              >
                {bulkApplying ? '저장 중…' : `📥 ${pendingCount}개 일괄 저장`}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

// ─── 드래그-앤-드롭 영역 ────────────────────────────────────────
function DropZone({ onFiles }: { onFiles: (fl: FileList | null) => void }) {
  const [hover, setHover] = useState(false)
  const inputRef = (typeof window !== 'undefined' ? { current: null as HTMLInputElement | null } : { current: null })

  return (
    <label
      onDragOver={e => {
        e.preventDefault()
        setHover(true)
      }}
      onDragLeave={() => setHover(false)}
      onDrop={e => {
        e.preventDefault()
        setHover(false)
        onFiles(e.dataTransfer.files)
      }}
      style={{
        ...GLASS.L1,
        display: 'block',
        border: hover ? `2px dashed ${COLORS.primary}` : '2px dashed rgba(0,0,0,0.15)',
        borderRadius: 12,
        padding: '24px 16px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.15s',
        background: hover ? 'rgba(59,110,181,0.08)' : 'rgba(255,255,255,0.40)',
      }}
    >
      <input
        ref={el => {
          inputRef.current = el
        }}
        type="file"
        accept=".xlsx,.xls"
        multiple
        onChange={e => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
        style={{ display: 'none' }}
      />
      <div style={{ fontSize: 22, marginBottom: 4 }}>📁</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
        파일을 끌어오거나 클릭해서 선택
      </div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
        .xlsx / .xls — 여러 파일 동시 선택 가능 · 양식과 고객사 자동 감지
      </div>
    </label>
  )
}

// ─── 파일별 카드 ────────────────────────────────────────────────
function FileCard({
  item,
  companies,
  onRemove,
  onUpdate,
  onApply,
}: {
  item: FileItem
  companies: Company[]
  onRemove: () => void
  onUpdate: (patch: Partial<FileItem>) => void
  onApply: () => void
}) {
  const targetLabel = item.target === 'contracts' ? '📜 장기 계약' : '📊 정비 보고서'
  const customerName = companies.find(c => c.id === item.customer_id)?.name || ''
  const suggestedName = item.preview?.detected.suggested_customer_name || ''
  const isAutoMatched = !!suggestedName && customerName === suggestedName
  const status = item.result
    ? 'done'
    : item.error
    ? 'error'
    : item.busy
    ? 'busy'
    : item.preview
    ? 'ready'
    : 'pending'

  const borderColor =
    status === 'done'
      ? COLORS.borderGreen
      : status === 'error'
      ? COLORS.borderRed
      : status === 'ready'
      ? COLORS.borderBlue
      : COLORS.borderSubtle

  return (
    <div style={{ ...GLASS.L3, border: `1px solid ${borderColor}`, borderRadius: 12, padding: 12 }}>
      {/* 헤더 — 파일명 + 매칭 고객사 + target + 액션 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          📄 {item.file.name}
        </span>
        {customerName && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
              background: isAutoMatched ? COLORS.bgGreen : COLORS.bgGray,
              color: isAutoMatched ? COLORS.success : COLORS.textPrimary,
              whiteSpace: 'nowrap',
            }}
          >
            🏢 {customerName}{isAutoMatched && ' 🤖'}
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 4,
            background: item.target === 'contracts' ? COLORS.bgViolet : COLORS.bgBlue,
            color: item.target === 'contracts' ? '#7c3aed' : COLORS.primary,
            whiteSpace: 'nowrap',
          }}
        >
          {targetLabel}
        </span>
        <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
          {(item.file.size / 1024).toFixed(1)} KB
        </span>
        <button
          onClick={onRemove}
          style={{ ...BTN.sm, background: 'transparent', color: COLORS.textMuted }}
        >
          ✕
        </button>
      </div>

      {/* 설정 행 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={item.target}
          onChange={e => onUpdate({ target: e.target.value as 'capital_reports' | 'contracts' })}
          style={{ ...inputStyle, width: 'auto', fontSize: 11, padding: '4px 8px' }}
          title="대상 테이블"
        >
          <option value="capital_reports">📊 정비 보고서</option>
          <option value="contracts">📜 장기 계약</option>
        </select>
        <select
          value={item.customer_id}
          onChange={e => onUpdate({ customer_id: e.target.value })}
          style={{ ...inputStyle, width: 'auto', fontSize: 11, padding: '4px 8px' }}
        >
          <option value="">고객사 미지정</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {item.target === 'capital_reports' && (
          <input
            type="date"
            value={item.report_date}
            onChange={e => onUpdate({ report_date: e.target.value })}
            style={{ ...inputStyle, width: 'auto', fontSize: 11, padding: '4px 8px' }}
            placeholder="보고일자"
          />
        )}
      </div>

      {/* 진행 상태 */}
      {item.busy && (
        <div style={{ fontSize: 12, color: COLORS.primary }}>⏳ 분석 중…</div>
      )}
      {item.error && (
        <div style={{ fontSize: 12, color: COLORS.danger, padding: 8, background: COLORS.bgRed, borderRadius: 6 }}>
          ❌ {item.error}
        </div>
      )}

      {/* 미리보기 — 표 형식 */}
      {item.preview && !item.result && (
        <div style={{ marginTop: 4 }}>
          {/* 감지 요약 */}
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: COLORS.textSecondary, marginBottom: 6, flexWrap: 'wrap' }}>
            <span>
              ✓ <b>{item.preview.detected.parsed_rows}</b>건 / 전체 {item.preview.detected.total_data_rows}건
            </span>
            {item.preview.detected.report_date && (
              <span>
                📅 보고일: <b>{item.preview.detected.report_date}</b>
              </span>
            )}
            {customerName && (
              <span>
                🏢 <b>{customerName}</b>
              </span>
            )}
            <span>
              매핑 <b>{Object.keys(item.preview.mapping.mapped).length}</b> / 미매칭{' '}
              <b style={{ color: item.preview.mapping.unmapped_headers.length > 0 ? COLORS.warning : COLORS.success }}>
                {item.preview.mapping.unmapped_headers.length}
              </b>
            </span>
          </div>

          {/* 매핑 안 된 헤더 — 노란 경고 */}
          {item.preview.mapping.unmapped_headers.length > 0 && (
            <div style={{ fontSize: 11, color: COLORS.warning, padding: '4px 8px', background: COLORS.bgAmber, borderRadius: 6, marginBottom: 6 }}>
              ⚠ 매핑 안 된 컬럼 (저장 시 무시): {item.preview.mapping.unmapped_headers.join(', ')}
            </div>
          )}

          {/* 표 형식 미리보기 */}
          {item.preview.sample.headers.length > 0 && item.preview.sample.rows.length > 0 ? (
            <div style={{ overflow: 'auto', maxHeight: 200, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, background: 'rgba(255,255,255,0.6)' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
                <thead style={{ background: 'rgba(0,0,0,0.04)', position: 'sticky', top: 0 }}>
                  <tr>
                    {item.preview.sample.headers.map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '4px 6px',
                          textAlign: 'left',
                          fontSize: 10,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          borderBottom: '1px solid rgba(0,0,0,0.08)',
                          color: COLORS.textSecondary,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {item.preview.sample.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          style={{
                            padding: '4px 6px',
                            whiteSpace: 'nowrap',
                            borderBottom: '1px solid rgba(0,0,0,0.04)',
                            maxWidth: 180,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={cell ? String(cell) : ''}
                        >
                          {cell || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: COLORS.textMuted, padding: 8, textAlign: 'center' }}>
              파싱된 row 없음 — 양식 확인 필요
            </div>
          )}

          {/* 개별 저장 버튼 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              style={{ ...BTN.sm, background: COLORS.success, color: '#fff' }}
              onClick={onApply}
              disabled={item.busy || item.preview.detected.parsed_rows === 0}
            >
              💾 이 파일만 저장 ({item.preview.detected.parsed_rows}건)
            </button>
          </div>
        </div>
      )}

      {/* 결과 */}
      {item.result && (
        <div style={{ fontSize: 12, padding: 8, background: COLORS.bgGreen, borderRadius: 6, color: COLORS.success }}>
          ✅ 신규 <b>{item.result.inserted}</b>건 · 중복 skip {item.result.skipped}건
          {item.result.errors.length > 0 && (
            <span style={{ color: COLORS.danger, marginLeft: 8 }}>
              · 에러 {item.result.errors.length}건
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── 모달 셸 ───────────────────────────────

function ModalShell({
  title,
  children,
  onClose,
  wide,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...GLASS.L4,
          borderRadius: 16,
          padding: 20,
          width: '100%',
          maxWidth: wide ? 720 : 500,
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
          <button
            style={{ ...BTN.sm, background: 'transparent', color: COLORS.textMuted }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600, display: 'block', marginBottom: 4 }}>
        {label}
      </span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.10)',
  background: 'rgba(255,255,255,0.6)',
  fontSize: 13,
}

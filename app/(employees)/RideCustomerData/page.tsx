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
 * 사이드바: Employee of Ride Inc. > 관리자 운영 > 라이드 고객사 데이터
 * admin 전용
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

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

function clip(v: string | null | undefined, n = 30): string {
  if (!v) return ''
  return v.length > n ? v.substring(0, n) + '…' : v
}

// ───────────────────────── 메인 ──────────────────────────────────
export default function RideCustomerDataPage() {
  const [user, setUser] = useState<{ role?: string; id?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [tab, setTab] = useState<Tab>('reports')

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

  // 엑셀 업로드 모달
  const [uploadModal, setUploadModal] = useState<{
    target: 'capital_reports' | 'contracts'
    customer_id: string
    report_date: string
    file: File | null
    preview: { detected?: { parsed_rows: number; report_date?: string | null }; sample?: unknown[]; target?: string } | null
    busy: boolean
    result: { result: { inserted: number; skipped: number; errors: string[] } } | null
  } | null>(null)

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
    if (!authChecked || user?.role !== 'admin') return
    fetchCompanies()
  }, [authChecked, user, fetchCompanies])

  useEffect(() => {
    if (!authChecked || user?.role !== 'admin') return
    if (tab === 'reports') fetchReports()
    if (tab === 'contracts') fetchContracts()
  }, [authChecked, user, tab, fetchReports, fetchContracts])

  // ─── 권한 ─────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div style={{ padding: 24, color: COLORS.textSecondary }}>인증 확인 중…</div>
    )
  }
  if (user?.role !== 'admin') {
    return (
      <div style={{ padding: 24, color: COLORS.danger }}>
        ⚠ 관리자 권한 필요
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
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{fmt(r.report_date)}</span>,
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
    <div style={{ padding: 16, maxWidth: 1600, margin: '0 auto' }}>
      {/* ─── 헤더 ─── */}
      <div style={{ ...GLASS.L5, padding: '16px 20px', borderRadius: 16, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary }}>
            🏢 라이드 고객사 데이터
          </div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
            캐피탈/금융 고객사 정비 보고 + 장기 계약 마스터 통합 관리
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{ ...BTN.md, background: COLORS.bgGreen, color: COLORS.success, border: `1px solid ${COLORS.borderGreen}` }}
            onClick={() => setUploadModal({ target: 'capital_reports', customer_id: '', report_date: '', file: null, preview: null, busy: false, result: null })}
          >
            📥 엑셀 업로드
          </button>
          <button
            style={{ ...BTN.md, background: COLORS.bgViolet, color: '#7c3aed', border: `1px solid ${COLORS.borderViolet}` }}
            onClick={() => setCompanyModal({})}
          >
            + 고객사 추가
          </button>
        </div>
      </div>

      {/* ─── 탭 ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button style={tabBtn('reports', '📊 캐피탈 보고')} onClick={() => setTab('reports')}>
          📊 캐피탈 보고 {reports.length > 0 && `(${reports.length})`}
        </button>
        <button style={tabBtn('contracts', '📜 계약 마스터')} onClick={() => setTab('contracts')}>
          📜 계약 마스터 {contracts.length > 0 && `(${contracts.length})`}
        </button>
        <button style={tabBtn('companies', '🏢 고객사 마스터')} onClick={() => setTab('companies')}>
          🏢 고객사 ({companies.length})
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
            <span style={{ color: COLORS.textMuted, fontSize: 12, marginLeft: 'auto' }}>
              {reportsLoading ? '로딩 중…' : `${reports.length}건`}
            </span>
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
            emptyMessage="보고 데이터 없음 — 엑셀 업로드 또는 수기 등록"
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
            <button
              style={{ ...BTN.sm, background: COLORS.bgGreen, color: COLORS.success, marginLeft: 'auto' }}
              onClick={() => setUploadModal({ target: 'contracts', customer_id: '', report_date: '', file: null, preview: null, busy: false, result: null })}
            >
              📥 엑셀
            </button>
            <span style={{ color: COLORS.textMuted, fontSize: 12 }}>
              {contractsLoading ? '로딩 중…' : `${contracts.length}건`}
            </span>
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
          title={`📊 캐피탈 보고 — ${reportDetail.car_number || reportDetail.exec_no || '상세'}`}
          rows={Object.entries(reportDetail).filter(([k]) => k !== 'id')}
          onClose={() => setReportDetail(null)}
        />
      )}

      {/* ─── 계약 상세 모달 ─── */}
      {contractDetail && (
        <DetailModal
          title={`📜 계약 마스터 — ${contractDetail.car_number || contractDetail.exec_no || '상세'}`}
          rows={Object.entries(contractDetail).filter(([k]) => k !== 'id')}
          onClose={() => setContractDetail(null)}
        />
      )}

      {/* ─── 엑셀 업로드 모달 ─── */}
      {uploadModal && (
        <UploadModal
          companies={companies}
          state={uploadModal}
          onChange={s => setUploadModal(s)}
          onClose={() => setUploadModal(null)}
          onApplied={() => {
            if (uploadModal.target === 'capital_reports') fetchReports()
            else fetchContracts()
          }}
        />
      )}
    </div>
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
  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '4px 0' }}>
            <span style={{ width: 130, color: COLORS.textMuted, flexShrink: 0 }}>{k}</span>
            <span style={{ color: COLORS.textPrimary, wordBreak: 'break-all' }}>
              {v === null || v === undefined || v === '' ? '-' : String(v)}
            </span>
          </div>
        ))}
      </div>
    </ModalShell>
  )
}

function UploadModal({
  companies,
  state,
  onChange,
  onClose,
  onApplied,
}: {
  companies: Company[]
  state: NonNullable<{
    target: 'capital_reports' | 'contracts'
    customer_id: string
    report_date: string
    file: File | null
    preview: { detected?: { parsed_rows: number; report_date?: string | null }; sample?: unknown[]; target?: string } | null
    busy: boolean
    result: { result: { inserted: number; skipped: number; errors: string[] } } | null
  }>
  onChange: (s: typeof state | null) => void
  onClose: () => void
  onApplied: () => void
}) {
  const [err, setErr] = useState<string | null>(null)

  const submit = async (mode: 'preview' | 'apply') => {
    if (!state.file) {
      setErr('파일 선택 필요')
      return
    }
    setErr(null)
    onChange({ ...state, busy: true })
    try {
      const token = getStoredToken()
      const fd = new FormData()
      fd.append('file', state.file)
      fd.append('target', state.target)
      if (state.customer_id) fd.append('customer_id', state.customer_id)
      if (state.report_date) fd.append('report_date', state.report_date)
      fd.append('mode', mode)
      const res = await fetch('/api/ride-customer-data/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErr(json.error || `HTTP ${res.status}`)
        onChange({ ...state, busy: false })
        return
      }
      if (mode === 'preview') {
        onChange({ ...state, busy: false, preview: json, result: null })
      } else {
        onChange({ ...state, busy: false, result: json })
        onApplied()
      }
    } catch (e) {
      setErr(String(e))
      onChange({ ...state, busy: false })
    }
  }

  return (
    <ModalShell title={`📥 엑셀 업로드 — ${state.target === 'capital_reports' ? '캐피탈 보고' : '계약 마스터'}`} onClose={onClose} wide>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="대상 테이블">
          <select
            value={state.target}
            onChange={e => onChange({ ...state, target: e.target.value as 'capital_reports' | 'contracts', preview: null, result: null })}
            style={inputStyle}
          >
            <option value="capital_reports">캐피탈 보고 (ride_capital_reports)</option>
            <option value="contracts">계약 마스터 (ride_contracts)</option>
          </select>
        </Field>
        <Field label="고객사 (선택 — 미지정 시 컬럼 자동 감지)">
          <select
            value={state.customer_id}
            onChange={e => onChange({ ...state, customer_id: e.target.value })}
            style={inputStyle}
          >
            <option value="">미지정</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {state.target === 'capital_reports' && (
          <Field label="보고일자 (미지정 시 파일명에서 추정)">
            <input
              type="date"
              value={state.report_date}
              onChange={e => onChange({ ...state, report_date: e.target.value })}
              style={inputStyle}
            />
          </Field>
        )}
        <Field label="엑셀 파일">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={e => onChange({ ...state, file: e.target.files?.[0] || null, preview: null, result: null })}
            style={inputStyle}
          />
          {state.file && (
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
              {state.file.name} ({(state.file.size / 1024).toFixed(1)} KB)
            </div>
          )}
        </Field>
        {state.preview && (
          <div style={{ ...GLASS.L3, border: `1px solid ${COLORS.borderBlue}`, padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              미리보기 — {state.preview.detected?.parsed_rows} row 감지 ({state.preview.target})
            </div>
            <div style={{ fontSize: 11, color: COLORS.textSecondary }}>
              보고일자: {state.preview.detected?.report_date || '-'}
            </div>
            {Array.isArray(state.preview.sample) && state.preview.sample.length > 0 && (
              <pre style={{ fontSize: 10, marginTop: 8, maxHeight: 160, overflow: 'auto', background: 'rgba(0,0,0,0.03)', padding: 8, borderRadius: 6 }}>
                {JSON.stringify(state.preview.sample, null, 2)}
              </pre>
            )}
          </div>
        )}
        {state.result && (
          <div style={{ ...GLASS.L3, border: `1px solid ${COLORS.borderGreen}`, padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.success }}>
              ✅ 업로드 완료
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>
              <div>✓ 신규: <b>{state.result.result.inserted}</b>건</div>
              <div>· 중복 skip: {state.result.result.skipped}건</div>
              {state.result.result.errors?.length > 0 && (
                <div style={{ color: COLORS.danger, marginTop: 4 }}>
                  ❌ 에러 {state.result.result.errors.length}건 (앞 5개만 표시)
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {state.result.result.errors.map((e: string, i: number) => (
                      <li key={i} style={{ fontSize: 11 }}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
        {err && <div style={{ color: COLORS.danger, fontSize: 12 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={{ ...BTN.md, background: COLORS.bgGray, color: COLORS.textSecondary }} onClick={onClose}>
            닫기
          </button>
          <button
            style={{ ...BTN.md, background: COLORS.bgBlue, color: COLORS.primary }}
            onClick={() => submit('preview')}
            disabled={state.busy || !state.file}
          >
            {state.busy ? '...' : '미리보기'}
          </button>
          <button
            style={{ ...BTN.md, background: COLORS.success, color: '#fff' }}
            onClick={() => submit('apply')}
            disabled={state.busy || !state.file}
          >
            {state.busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </ModalShell>
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

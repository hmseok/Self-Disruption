'use client'
// ═══════════════════════════════════════════════════════════════
// CompanyEmployeePanel — 회사별 직원 마스터 통일 패널 (PR-HR-23a/b/c/d)
//
// 사용처:
//   · FMI 직원 탭   (PR-HR-23b — page.tsx 가 customEmployees + columns 주입)
//   · RIDE 직원 탭  (PR-HR-23c — page.tsx 가 RIDE 데이터 주입)
//   · 새 회사 탭    (자체 fetch — customEmployees 없으면 companyKey 기반 API 호출)
//
// 5층 표준 (UI-DESIGN-STANDARD § 0-A):
//   [DcStatStrip] [DcToolbar] [부서 트리 + NeuDataTable 2열]
//
// 동작 모드:
//   · customEmployees 주입 시 → 외부 데이터 사용 (fetch skip)
//   · customDepartments 주입 시 → 외부 부서 트리 사용
//   · columns 주입 시 → defaultColumns 대체 (extraColumns 는 병합)
//   · filters / activeFilter / onFilterChange 주입 시 → 외부 status 필터 제어
//
// PR-HR-23b (2026-05-29) — props 확장 (customEmployees, columns, onRowClick, actions, filters)
// ═══════════════════════════════════════════════════════════════
import React, { useEffect, useState, useMemo } from 'react'
import DcStatStrip, { StatItem, ActionButton } from '../../components/DcStatStrip'
import DcToolbar, { FilterItem } from '../../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../../components/NeuDataTable'
import { auth } from '@/lib/auth-client'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// primary tint — hex+alpha (8자리) 표기 (인라인 rgba 회피)
const TINT_PRIMARY_10 = `${COLORS.primary}1A` // 10% alpha

// ─── Types ──────────────────────────────────────────────────────
export interface EmployeeRow {
  id: string
  name?: string
  display_name?: string
  email?: string
  phone?: string
  department?: any            // string 또는 { name } — 회사별 다름
  department_id?: string
  position?: any              // string 또는 { name }
  hire_date?: string
  resign_date?: string
  is_active?: boolean
  company_key?: string
  employment_type?: string
  role?: string
  [key: string]: any
}

export interface DepartmentNode {
  id: string
  name: string
  parent_id?: string | null
  children?: DepartmentNode[]
  employee_count?: number
  color_tone?: string
}

interface CompanyEmployeePanelProps {
  /** 회사 키 — DB companies.company_key (예: 'FMI'|'RIDE'|'NEW1') */
  companyKey: string
  /** 라벨 오버라이드 (예: 'RIDE' → '라이드케어') */
  companyLabel?: string
  /** 현재 사용자 권한 */
  role?: 'admin' | 'master' | 'user'
  /** [PR-HR-23b] 외부 직원 데이터 주입 — 있으면 자체 fetch skip */
  customEmployees?: EmployeeRow[]
  /** [PR-HR-23b] 외부 부서 트리 주입 — 있으면 자체 fetch skip */
  customDepartments?: DepartmentNode[]
  /** [PR-HR-23b] 외부 컬럼 정의 — 있으면 defaultColumns 대체 */
  columns?: TableColumn<EmployeeRow>[]
  /** 회사별 추가 컬럼 (defaultColumns 와 병합) */
  extraColumns?: TableColumn<EmployeeRow>[]
  /** 행 클릭 핸들러 (편집 모달 트리거) */
  onRowClick?: (row: EmployeeRow) => void
  /** [PR-HR-23b] DcStatStrip 액션 버튼 (외부 주입 — 신규 직원/초대 등) */
  actions?: ActionButton[]
  /** [PR-HR-23b] 외부 status 필터 옵션 (없으면 활성만/비활성 포함 기본) */
  filters?: FilterItem[]
  activeFilter?: string
  onFilterChange?: (key: string) => void
  /** 모바일 카드 설정 */
  mobileCard?: MobileCardConfig<EmployeeRow>
  /** 검색 placeholder */
  searchPlaceholder?: string
  /** 회사별 엑셀 일괄 등록 활성화 (기본 false) */
  bulkExcel?: boolean
  /** 외부 loading state */
  loading?: boolean
  /** 회사별 stat 카드 외부 주입 (없으면 내부 기본 stats) */
  stats?: StatItem[]
}

// ─── 회사별 data source 분기 helper ────────────────────────────
function getEmployeesUrl(companyKey: string): string {
  if (companyKey === 'RIDE') return '/api/ride-employees'
  return `/api/employees?company_key=${encodeURIComponent(companyKey)}`
}

function getDepartmentsTreeUrl(companyKey: string): string {
  if (companyKey === 'RIDE') return '/api/ride-departments/tree'
  // PR-HR-23d — FMI tree endpoint (?tree=1) — graceful fallback 으로 평면도 처리
  return `/api/departments?company_key=${encodeURIComponent(companyKey)}&tree=1`
}

// ─── 기본 컬럼 (회사 공통 — Rule 18 모든 컬럼 sortBy) ──────────
function defaultColumns(): TableColumn<EmployeeRow>[] {
  const getDeptName = (r: EmployeeRow) => typeof r.department === 'string' ? r.department : (r.department?.name || '')
  const getPosName = (r: EmployeeRow) => typeof r.position === 'string' ? r.position : (r.position?.name || '')
  return [
    {
      key: 'name', label: '이름', sortBy: (r) => r.display_name || r.name || '',
      render: (r) => <span style={{ fontWeight: 600 }}>{r.display_name || r.name || '-'}</span>,
    },
    {
      key: 'department', label: '부서', sortBy: getDeptName,
      render: (r) => getDeptName(r) || '-',
    },
    {
      key: 'position', label: '직급', sortBy: getPosName,
      render: (r) => getPosName(r) || '-',
    },
    {
      key: 'employment_type', label: '고용', sortBy: (r) => r.employment_type || '',
      render: (r) => {
        const t = r.employment_type
        if (!t) return <span style={{ color: 'rgba(0,0,0,0.3)' }}>-</span>
        const labels: Record<string, string> = { regular: '정규직', outsourced: '외주', freelance: '프리랜서' }
        return <span style={{ fontSize: 11 }}>{labels[t] || t}</span>
      },
    },
    {
      key: 'hire_date', label: '입사일', sortBy: (r) => r.hire_date || '',
      render: (r) => r.hire_date ? new Date(r.hire_date).toLocaleDateString('ko-KR') : '-',
    },
    {
      key: 'phone', label: '연락처', sortBy: (r) => r.phone || '',
      render: (r) => r.phone || '-',
    },
    {
      key: 'is_active', label: '상태', sortBy: (r) => r.is_active ? 1 : 0,
      render: (r) => (
        <span style={{
          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
          background: r.is_active ? 'rgba(34,197,94,0.10)' : 'rgba(0,0,0,0.05)',
          color: r.is_active ? '#15803d' : 'rgba(0,0,0,0.40)',
          whiteSpace: 'nowrap',
        }}>
          {r.is_active ? '활성' : '비활성'}
        </span>
      ),
    },
  ]
}

// ─── 본 컴포넌트 ────────────────────────────────────────────────
export default function CompanyEmployeePanel({
  companyKey,
  companyLabel,
  role = 'user',
  customEmployees,
  customDepartments,
  columns: externalColumns,
  extraColumns,
  onRowClick,
  actions: externalActions,
  filters: externalFilters,
  activeFilter: externalActiveFilter,
  onFilterChange: externalOnFilterChange,
  mobileCard,
  searchPlaceholder,
  bulkExcel = false,
  loading: externalLoading,
  stats: externalStats,
}: CompanyEmployeePanelProps) {
  const [fetchedEmployees, setFetchedEmployees] = useState<EmployeeRow[]>([])
  const [fetchedDepartments, setFetchedDepartments] = useState<DepartmentNode[]>([])
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [internalLoading, setInternalLoading] = useState(false)

  // ─── data fetch (customEmployees/Departments 없을 때만) ─────
  const skipFetch = customEmployees !== undefined && customDepartments !== undefined

  async function loadEmployees() {
    if (customEmployees !== undefined) return
    try {
      const user = auth.currentUser
      if (!user) return
      const token = await user.getIdToken()
      const res = await fetch(getEmployeesUrl(companyKey), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = await res.json()
      setFetchedEmployees(Array.isArray(json.data) ? json.data : (json.data?.employees || []))
    } catch {
      setFetchedEmployees([])
    }
  }

  async function loadDepartments() {
    if (customDepartments !== undefined) return
    try {
      const user = auth.currentUser
      if (!user) return
      const token = await user.getIdToken()
      const res = await fetch(getDepartmentsTreeUrl(companyKey), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = await res.json()
      const raw = Array.isArray(json.data) ? json.data : (json.data?.tree || [])
      // PR-HR-23d graceful — 평면 응답이면 단일 루트 트리로 변환
      const tree = json._migration_pending || raw.every((n: any) => !n.children)
        ? raw.map((n: any) => ({ ...n, children: [] }))
        : raw
      setFetchedDepartments(tree)
    } catch {
      setFetchedDepartments([])
    }
  }

  useEffect(() => {
    if (skipFetch) return
    setInternalLoading(true)
    Promise.all([loadEmployees(), loadDepartments()]).finally(() => setInternalLoading(false))
  }, [companyKey, skipFetch])

  // ─── 실제 사용 데이터 (custom 우선) ─────────────────────────
  const employees: EmployeeRow[] = customEmployees ?? fetchedEmployees
  const departments: DepartmentNode[] = customDepartments ?? fetchedDepartments
  const loading = externalLoading ?? internalLoading

  // ─── 검색 + 부서 + 활성 필터 (외부 status 필터는 customEmployees 가 이미 처리) ─
  const filteredEmployees = useMemo(() => {
    let list = employees
    // 외부 filter 가 없을 때만 내부 활성/비활성 필터 적용
    if (externalFilters === undefined && !showInactive) {
      list = list.filter(e => e.is_active !== false)
    }
    if (selectedDeptId) list = list.filter(e => e.department_id === selectedDeptId)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        (e.display_name || e.name || '').toLowerCase().includes(q) ||
        (typeof e.department === 'string' ? e.department : e.department?.name || '').toLowerCase().includes(q) ||
        (typeof e.position === 'string' ? e.position : e.position?.name || '').toLowerCase().includes(q) ||
        (e.phone || '').includes(q) ||
        (e.email || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [employees, search, showInactive, selectedDeptId, externalFilters])

  const inactiveCount = useMemo(
    () => employees.filter(e => e.is_active === false).length,
    [employees]
  )

  // ─── stats (외부 주입 우선, 없으면 기본) ──────────────────
  const stats: StatItem[] = useMemo(() => {
    if (externalStats) return externalStats
    return [
      { label: '활성 직원', value: employees.filter(e => e.is_active !== false).length, unit: '명', tint: 'green', icon: '👥' },
      { label: '부서 수', value: departments.length, unit: '개', tint: 'blue', icon: '🏢' },
      { label: '이번 달 입사', value: 0, unit: '명', tint: 'amber', icon: '✨' },
      { label: '퇴사 예정', value: 0, unit: '명', tint: 'red', icon: '👋' },
    ]
  }, [employees, departments, externalStats])

  // ─── 컬럼 (외부 columns 주입 우선, 없으면 default + extraColumns) ──
  const columns: TableColumn<EmployeeRow>[] = useMemo(() => {
    if (externalColumns) return externalColumns
    return [...defaultColumns(), ...(extraColumns || [])]
  }, [externalColumns, extraColumns])

  // ─── actions (외부 주입 우선) ─────────────────────────────
  const actions: ActionButton[] = useMemo(() => {
    if (externalActions) return externalActions
    return [
      { label: '신규 직원', onClick: () => alert('PR-HR-23a 스켈레톤 — 모달은 외부에서 주입 (onRowClick) 또는 actions props'), variant: 'primary', icon: '+' },
      ...(bulkExcel ? [{ label: '엑셀 일괄 등록', onClick: () => alert('PR-HR-23c 에서 BulkExcelModal 추출'), variant: 'secondary' as const, icon: '⤴' }] : []),
    ]
  }, [externalActions, bulkExcel])

  // ─── filters (외부 주입 우선) ─────────────────────────────
  const filters: FilterItem[] = externalFilters ?? [
    { key: 'active', label: '활성만' },
    { key: 'all', label: `비활성 포함 (${inactiveCount})` },
  ]
  const activeFilter = externalActiveFilter ?? (showInactive ? 'all' : 'active')
  const onFilterChange = externalOnFilterChange ?? ((k: string) => setShowInactive(k === 'all'))

  // ─── 렌더 ────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 1. DcStatStrip */}
      <DcStatStrip stats={stats} actions={actions} />

      {/* 2. DcToolbar */}
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder={searchPlaceholder || '이름, 부서, 연락처 검색...'}
        filters={filters}
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
      />

      {/* 3. 부서 트리 + 직원 테이블 (2열) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: 12 }}>
        {/* 부서 트리 */}
        <div style={{
          ...GLASS.L3, padding: 12, borderRadius: 12,
          maxHeight: 600, overflowY: 'auto',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.7)', marginBottom: 8 }}>
            부서 트리 ({departments.length})
          </div>
          <button
            onClick={() => setSelectedDeptId(null)}
            style={{
              width: '100%', textAlign: 'left', padding: '6px 8px',
              background: selectedDeptId === null ? TINT_PRIMARY_10 : 'transparent',
              color: selectedDeptId === null ? COLORS.primary : '#1a1a1a',
              border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            전체 직원 ({employees.length})
          </button>
          {departments.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'rgba(0,0,0,0.4)', fontSize: 12 }}>
              부서 없음
            </div>
          ) : (
            <DepartmentTreeView nodes={departments} selectedId={selectedDeptId} onSelect={setSelectedDeptId} />
          )}
        </div>

        {/* 직원 테이블 */}
        <NeuDataTable
          columns={columns}
          data={filteredEmployees}
          rowKey={(r) => r.id}
          onRowClick={onRowClick}
          loading={loading}
          emptyMessage={`${companyLabel || companyKey} 직원이 없습니다`}
          mobileCard={mobileCard}
          defaultSort={{ key: 'name', dir: 'asc' }}
        />
      </div>
    </div>
  )
}

// ─── 부서 트리 재귀 렌더 ───────────────────────────────────────
function DepartmentTreeView({ nodes, selectedId, onSelect, depth = 0 }: {
  nodes: DepartmentNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  depth?: number
}) {
  return (
    <>
      {nodes.map(node => (
        <React.Fragment key={node.id}>
          <button
            onClick={() => onSelect(node.id)}
            style={{
              width: '100%', textAlign: 'left',
              padding: '6px 8px', paddingLeft: 8 + depth * 12,
              background: selectedId === node.id ? TINT_PRIMARY_10 : 'transparent',
              color: selectedId === node.id ? COLORS.primary : '#1a1a1a',
              border: 'none', borderRadius: 6, fontSize: 12,
              fontWeight: selectedId === node.id ? 600 : 400,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {node.color_tone && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: node.color_tone, display: 'inline-block', flexShrink: 0 }} />
              )}
              {node.name}
            </span>
            {typeof node.employee_count === 'number' && (
              <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', flexShrink: 0 }}>{node.employee_count}</span>
            )}
          </button>
          {node.children && node.children.length > 0 && (
            <DepartmentTreeView nodes={node.children} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          )}
        </React.Fragment>
      ))}
    </>
  )
}

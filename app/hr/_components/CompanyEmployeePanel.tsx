'use client'
// ═══════════════════════════════════════════════════════════════
// CompanyEmployeePanel — 회사별 직원 마스터 통일 패널 (스켈레톤)
//
// PR-HR-23a (2026-05-28, hr 세션) — 사용자 「우리 구조에 맞게 신설」.
//   설계: app/hr/_docs/COMPANY-EMPLOYEE-PANEL.md
//
// 본 PR-HR-23a 는 스켈레톤만 (실제 마이그은 23b/c/d):
//   · 23b: FMI 직원 탭 → 본 패널
//   · 23c: RIDE 직원 탭 → 본 패널 (RideOrgPanel 분해)
//   · 23d: FMI departments 트리 마이그
//
// 5층 표준 (UI-DESIGN-STANDARD § 0-A):
//   [DcStatStrip] [DcToolbar] [부서 트리 + NeuDataTable 2열]
// ═══════════════════════════════════════════════════════════════
import React, { useEffect, useState, useMemo } from 'react'
import DcStatStrip, { StatItem } from '../../components/DcStatStrip'
import DcToolbar from '../../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../../components/NeuDataTable'
import { auth } from '@/lib/auth-client'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// primary tint — hex+alpha (8자리) 표기 (인라인 rgba 회피)
const TINT_PRIMARY_10 = `${COLORS.primary}1A` // 10% alpha

// ─── Types ──────────────────────────────────────────────────────
export interface EmployeeRow {
  id: string
  name: string
  email?: string
  phone?: string
  department?: string
  department_id?: string
  position?: string
  hire_date?: string
  is_active?: boolean
  // 회사별 차이 (RIDE 만 있는 필드 등)
  company_key?: string
  employment_type?: 'regular' | 'outsourced' | 'freelance'
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
  /** 현재 사용자 권한 (admin = 모든 회사 / master/user = 자기 회사만) */
  role?: 'admin' | 'master' | 'user'
  /** 회사별 추가 컬럼 (기본 컬럼 외 회사 특화 — 권한, 직책 등) */
  extraColumns?: TableColumn<EmployeeRow>[]
  /** 회사별 엑셀 일괄 등록 활성화 (기본 false, RIDE 만 true 권장) */
  bulkExcel?: boolean
  /** 라벨 오버라이드 (예: 'RIDE' → '라이드케어') */
  companyLabel?: string
}

// ─── 회사별 data source 분기 helper ────────────────────────────
function getEmployeesUrl(companyKey: string): string {
  if (companyKey === 'RIDE') return '/api/ride-employees'
  return `/api/employees?company_key=${encodeURIComponent(companyKey)}`
}

function getDepartmentsTreeUrl(companyKey: string): string {
  if (companyKey === 'RIDE') return '/api/ride-departments/tree'
  // PR-HR-23d 에서 FMI tree endpoint 신설 — 그 전엔 평면 응답을 클라이언트에서 변환
  return `/api/departments?company_key=${encodeURIComponent(companyKey)}`
}

// ─── 기본 컬럼 (회사 공통 — extraColumns 으로 확장 가능) ──────
function defaultColumns(): TableColumn<EmployeeRow>[] {
  return [
    {
      key: 'name', label: '이름', sortBy: (r) => r.name || '',
      render: (r) => <span style={{ fontWeight: 600 }}>{r.name || '-'}</span>,
    },
    {
      key: 'department', label: '부서', sortBy: (r) => r.department || '',
      render: (r) => r.department || '-',
    },
    {
      key: 'position', label: '직급', sortBy: (r) => r.position || '',
      render: (r) => r.position || '-',
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
        }}>
          {r.is_active ? '활성' : '비활성'}
        </span>
      ),
    },
  ]
}

// ─── 본 컴포넌트 (스켈레톤 — 데이터 fetch + 렌더만) ─────────────
export default function CompanyEmployeePanel({
  companyKey,
  role = 'user',
  extraColumns,
  bulkExcel = false,
  companyLabel,
}: CompanyEmployeePanelProps) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [departments, setDepartments] = useState<DepartmentNode[]>([])
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // ─── data fetch (회사별 URL 분기) ────────────────────────────
  async function loadEmployees() {
    try {
      const user = auth.currentUser
      if (!user) return
      const token = await user.getIdToken()
      const res = await fetch(getEmployeesUrl(companyKey), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = await res.json()
      setEmployees(Array.isArray(json.data) ? json.data : (json.data?.employees || []))
    } catch {
      setEmployees([])
    }
  }

  async function loadDepartments() {
    try {
      const user = auth.currentUser
      if (!user) return
      const token = await user.getIdToken()
      const res = await fetch(getDepartmentsTreeUrl(companyKey), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = await res.json()
      setDepartments(Array.isArray(json.data) ? json.data : (json.data?.tree || []))
    } catch {
      setDepartments([])
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([loadEmployees(), loadDepartments()]).finally(() => setLoading(false))
  }, [companyKey])

  // ─── 필터링 ──────────────────────────────────────────────────
  const filteredEmployees = useMemo(() => {
    let list = employees
    if (!showInactive) list = list.filter(e => e.is_active !== false)
    if (selectedDeptId) list = list.filter(e => e.department_id === selectedDeptId)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.department || '').toLowerCase().includes(q) ||
        (e.phone || '').includes(q) ||
        (e.email || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [employees, search, showInactive, selectedDeptId])

  const inactiveCount = useMemo(
    () => employees.filter(e => e.is_active === false).length,
    [employees]
  )

  const stats: StatItem[] = useMemo(() => [
    { label: '활성 직원', value: employees.filter(e => e.is_active !== false).length, unit: '명', tint: 'green', icon: '👥' },
    { label: '부서 수', value: departments.length, unit: '개', tint: 'blue', icon: '🏢' },
    { label: '이번 달 입사', value: 0, unit: '명', tint: 'amber', icon: '✨' },
    { label: '퇴사 예정', value: 0, unit: '명', tint: 'red', icon: '👋' },
  ], [employees, departments])

  // ─── 렌더 ────────────────────────────────────────────────────
  const columns: TableColumn<EmployeeRow>[] = useMemo(
    () => [...defaultColumns(), ...(extraColumns || [])],
    [extraColumns]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 1. DcStatStrip */}
      <DcStatStrip
        stats={stats}
        actions={[
          { label: '신규 직원', onClick: () => alert('PR-HR-23a 스켈레톤 — 모달은 23b/c 에서 마이그'), variant: 'primary', icon: '+' },
          ...(bulkExcel ? [{ label: '엑셀 일괄 등록', onClick: () => alert('PR-HR-23c 에서 마이그'), variant: 'secondary' as const, icon: '⤴' }] : []),
        ]}
      />

      {/* 2. DcToolbar */}
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="이름, 부서, 연락처 검색..."
        filters={[
          { key: 'active', label: '활성만' },
          { key: 'all', label: `비활성 포함 (${inactiveCount})` },
        ]}
        activeFilter={showInactive ? 'all' : 'active'}
        onFilterChange={(k) => setShowInactive(k === 'all')}
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
          loading={loading}
          emptyMessage={`${companyLabel || companyKey} 회사 직원이 없습니다`}
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
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {node.color_tone && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: node.color_tone, display: 'inline-block' }} />
              )}
              {node.name}
            </span>
            {typeof node.employee_count === 'number' && (
              <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>{node.employee_count}</span>
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

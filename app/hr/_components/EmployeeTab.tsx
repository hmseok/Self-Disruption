'use client'

// ═══════════════════════════════════════════════════════════════
// 인사 마스터 — 직원 탭 (2026-08-08 재작성)
// 요약 카드 + 검색/필터 + 직원 테이블. 행 클릭 → 상세 드로어(부모 소유)
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import NeuDataTable, { TableColumn } from '@/app/components/NeuDataTable'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import DcStatStrip, { StatItem } from '@/app/components/DcStatStrip'
import { COLORS } from '@/app/utils/ui-tokens'
import {
  Employee, Department, Badge, ROLE_META, EMP_STATUS_META,
  getEmpStatus, empName, deptColor, d10,
} from './hr-shared'

type Props = {
  employees: Employee[]
  departments: Department[]
  loading: boolean
  onSelect: (emp: Employee) => void
}

type Filter = 'all' | 'active' | 'on_leave' | 'resigned' | 'no_dept'

export default function EmployeeTab({ employees, departments, loading, onSelect }: Props) {
  const [search, setSearch] = useState('')
  // 기본 「재직」 — 퇴사자는 보관함처럼 필터로만 조회 (구 화면 운영 결정 승계)
  const [filter, setFilter] = useState<Filter>('active')

  const counts = useMemo(() => {
    const c = { active: 0, on_leave: 0, resigned: 0, no_dept: 0 }
    for (const e of employees) {
      c[getEmpStatus(e)]++
      if (getEmpStatus(e) === 'active' && !e.department_id) c.no_dept++
    }
    return c
  }, [employees])

  const rows = useMemo(() => {
    let list = employees
    if (filter === 'no_dept') list = list.filter(e => getEmpStatus(e) === 'active' && !e.department_id)
    else if (filter !== 'all') list = list.filter(e => getEmpStatus(e) === filter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(e =>
        [empName(e), e.email, e.phone].filter(Boolean).some(v => String(v).toLowerCase().includes(q))
      )
    }
    return list
  }, [employees, filter, search])

  const stats: StatItem[] = [
    { label: '재직', value: counts.active, unit: '명', tint: 'green', onClick: () => setFilter('active'), active: filter === 'active' },
    { label: '휴직', value: counts.on_leave, unit: '명', tint: 'amber', onClick: () => setFilter('on_leave'), active: filter === 'on_leave' },
    { label: '퇴사', value: counts.resigned, unit: '명', tint: 'slate', onClick: () => setFilter('resigned'), active: filter === 'resigned' },
    { label: '부서 미지정', value: counts.no_dept, unit: '명', tint: counts.no_dept > 0 ? 'amber' : 'slate', onClick: () => setFilter('no_dept'), active: filter === 'no_dept' },
  ]

  const filters: FilterItem[] = [
    { key: 'all', label: '전체', count: employees.length },
    { key: 'active', label: '재직', count: counts.active },
    { key: 'on_leave', label: '휴직', count: counts.on_leave },
    { key: 'resigned', label: '퇴사', count: counts.resigned },
  ]

  const columns: TableColumn<Employee>[] = [
    {
      key: 'emp', label: '직원', width: '26%',
      sortBy: (e) => empName(e),
      render: (e) => (
        <div style={{ opacity: getEmpStatus(e) === 'resigned' ? 0.55 : 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{empName(e)}</div>
          <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 }}>{e.email}</div>
        </div>
      ),
    },
    {
      key: 'role', label: '권한', width: 100, align: 'center',
      sortBy: (e) => e.role,
      render: (e) => {
        const m = ROLE_META[e.role] || ROLE_META.user
        return <Badge label={m.label} bg={m.bg} fg={m.fg} />
      },
    },
    {
      key: 'position', label: '직급', width: 90,
      sortBy: (e) => e.position?.level ?? 99,
      render: (e) => e.position?.name
        ? <span style={{ fontSize: 12.5 }}>{e.position.name}</span>
        : <span style={{ fontSize: 11.5, color: COLORS.textDim }}>미지정</span>,
    },
    {
      key: 'department', label: '부서', width: 120,
      sortBy: (e) => e.department?.name || '',
      render: (e) => e.department?.name ? (
        <span style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: deptColor(departments, e.department_id), flex: 'none' }} />
          {e.department.name}
        </span>
      ) : getEmpStatus(e) === 'active'
        ? <Badge label="부서 미지정" bg={COLORS.bgAmber} fg={COLORS.warning} />
        : <span style={{ fontSize: 11.5, color: COLORS.textDim }}>—</span>,
    },
    {
      key: 'status', label: '재직 상태', width: 90, align: 'center',
      sortBy: (e) => getEmpStatus(e),
      render: (e) => {
        const m = EMP_STATUS_META[getEmpStatus(e)]
        return <Badge label={m.label} bg={m.bg} fg={m.fg} />
      },
    },
    {
      key: 'hire', label: '입사일', width: 110, align: 'center', hideOnMobile: true,
      sortBy: (e) => e.hire_date || '',
      render: (e) => {
        const status = getEmpStatus(e)
        if (status === 'resigned' && e.resign_date) {
          return <span style={{ fontSize: 12, color: COLORS.textMuted, fontVariantNumeric: 'tabular-nums' }}>{d10(e.resign_date)} 퇴사</span>
        }
        return e.hire_date
          ? <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{d10(e.hire_date)}</span>
          : <span style={{ fontSize: 11.5, color: COLORS.textDim }}>미입력</span>
      },
    },
    {
      key: 'account', label: '계정', width: 76, align: 'center',
      sortBy: (e) => (e.is_active ? 0 : 1),
      render: (e) => e.is_active
        ? <Badge label="활성" bg={COLORS.bgBlue} fg={COLORS.primary} />
        : <Badge label="차단" bg={COLORS.bgRed} fg={COLORS.danger} />,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DcStatStrip stats={stats} />
      <DcToolbar
        search={search} onSearchChange={setSearch} placeholder="이름 · 이메일 · 연락처 검색"
        filters={filters} activeFilter={filter === 'no_dept' ? 'active' : filter}
        onFilterChange={(k) => setFilter(k as Filter)}
      />
      <NeuDataTable
        columns={columns}
        data={rows}
        rowKey={(e) => e.id}
        onRowClick={onSelect}
        loading={loading}
        emptyMessage={search ? '검색 결과가 없습니다' : '등록된 직원이 없습니다'}
        mobileCard={{
          title: (e) => empName(e),
          subtitle: (e) => e.email,
          trailing: (e) => {
            const m = EMP_STATUS_META[getEmpStatus(e)]
            return <Badge label={m.label} bg={m.bg} fg={m.fg} />
          },
          badges: (e) => {
            const r = ROLE_META[e.role] || ROLE_META.user
            return (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <Badge label={r.label} bg={r.bg} fg={r.fg} />
                {e.department?.name && <Badge label={e.department.name} bg={COLORS.bgGray} fg={COLORS.textSecondary} />}
              </span>
            )
          },
        }}
      />
    </div>
  )
}

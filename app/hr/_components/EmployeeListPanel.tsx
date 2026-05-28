'use client'
// ═══════════════════════════════════════════════════════════════
// EmployeeListPanel — 회사별 직원 리스트 표준 패널
//
// PR-HR-20 (2026-05-28, hr 세션) — 사용자 「fmi/ride 탭 정리되어야」 직접 해결.
//   설계: app/hr/_components/EmployeeListPanel.tsx — 검색+필터+테이블 묶음
//
// 사용처:
//   · page.tsx 의 FMI 직원 탭 (기존 인라인 → 본 컴포넌트)
//   · 향후 RIDE 도 마이그 (PR-HR-20b — RideOrgPanel 의 직원 리스트 영역)
//   · 새 회사 추가 시 자동 재사용
//
// 책임 분리:
//   · 본 패널: 검색 / 필터 / 테이블 표현 (UI 표준화)
//   · 외부: employees state / columns 정의 / 모달 핸들러 (props 로 주입)
// ═══════════════════════════════════════════════════════════════
import React from 'react'
import DcToolbar, { FilterItem } from '../../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../../components/NeuDataTable'

interface EmployeeListPanelProps<T> {
  /** 회사 키 — 헤더 라벨 / 빈 메시지 분기 등에 사용 */
  companyKey?: string
  /** 표시할 직원 데이터 (외부에서 필터 적용 후 주입) */
  employees: T[]
  /** 검색 키워드 */
  searchTerm: string
  onSearchChange: (v: string) => void
  /** 활성/비활성 필터 옵션 + 현재 선택 */
  filters: FilterItem[]
  activeFilter: string
  onFilterChange: (k: string) => void
  /** 컬럼 정의 (회사별 다를 수 있음 — 외부 주입) */
  columns: TableColumn<T>[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  /** 빈 상태 메시지 */
  emptyMessage?: string
  /** 검색 placeholder */
  searchPlaceholder?: string
  /** 모바일 카드 설정 */
  mobileCard?: MobileCardConfig<T>
  loading?: boolean
}

export default function EmployeeListPanel<T>({
  companyKey,
  employees,
  searchTerm,
  onSearchChange,
  filters,
  activeFilter,
  onFilterChange,
  columns,
  rowKey,
  onRowClick,
  emptyMessage = '직원이 없습니다',
  searchPlaceholder = '이름, 이메일, 부서, 직급 검색...',
  mobileCard,
  loading,
}: EmployeeListPanelProps<T>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 검색 + 활성/비활성 필터 */}
      <DcToolbar
        search={searchTerm}
        onSearchChange={onSearchChange}
        placeholder={searchPlaceholder}
        filters={filters}
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
      />
      <NeuDataTable
        columns={columns}
        data={employees}
        rowKey={rowKey}
        onRowClick={onRowClick}
        emptyMessage={emptyMessage}
        mobileCard={mobileCard}
        loading={loading || false}
      />
    </div>
  )
}

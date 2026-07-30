'use client'

// ═══════════════════════════════════════════════════════════════
// 거래내역 탭 — 통장+카드 통합 리스트 (REDESIGN-2026-07 장부 3.💰)
// 2026-07-30 개편 2단계: 출처 구분 없이 돈의 입출을 한 리스트로.
//   미분류는 별도 페이지가 아니라 필터 상태. 분류·구분은 인라인 수정.
//   통장/카드 탭은 잔액 검증·업로드 기능 이관 전까지 병행 유지.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import DcToolbar from '@/app/components/DcToolbar'
import { COLORS } from '@/app/utils/ui-tokens'
import type { ManageDomain } from './MappingTab'

const nf = (n: number) => n ? Math.abs(n).toLocaleString() : '0'
const fmtDate = (d: string | null) => {
  if (!d) return '-'
  return String(d).replace('T', ' ').slice(0, 10)
}

// 화면 렌더 상한 — 전체를 그리면 브라우저가 버거움. 필터·검색으로 좁히도록 안내.
const MAX_ROWS = 1000

interface LedgerTabProps {
  transactions: any[]
  loading: boolean
  isBank: (t: any) => boolean
  domains: ManageDomain[]
  domainLabel: (code: string | null) => ManageDomain | undefined
  onAssignDomain: (ids: string[], code: string | null) => void
  onCategoryChange: (id: string, category: string | null) => void
  categoryOptions: string[]
}

export default function LedgerTab({
  transactions, loading, isBank,
  domains, domainLabel, onAssignDomain,
  onCategoryChange, categoryOptions,
}: LedgerTabProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | bank | card | unclassified

  const isUnclassified = (t: any) => !t.category || t.category === '미분류'

  const counts = useMemo(() => ({
    all: transactions.length,
    bank: transactions.filter(isBank).length,
    card: transactions.filter((t) => !isBank(t)).length,
    unclassified: transactions.filter(isUnclassified).length,
  }), [transactions, isBank])

  const filtered = useMemo(() => {
    let data = transactions
    if (filter === 'bank') data = data.filter(isBank)
    else if (filter === 'card') data = data.filter((t) => !isBank(t))
    else if (filter === 'unclassified') data = data.filter(isUnclassified)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      data = data.filter((t) =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.client_name || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q) ||
        String(t.amount || '').includes(q))
    }
    return data
  }, [transactions, filter, search, isBank])

  const shown = filtered.length > MAX_ROWS ? filtered.slice(0, MAX_ROWS) : filtered

  const columns: TableColumn<any>[] = [
    { key: 'date', label: '일시', width: 100,
      sortBy: (r) => r.transaction_date ? new Date(r.transaction_date).getTime() : 0,
      render: (r) => <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{fmtDate(r.transaction_date)}</span> },
    { key: 'source', label: '출처', width: 120,
      sortBy: (r) => isBank(r) ? `0${r.bank_mapped_name || r.bank_name || ''}` : `1${r.card_alias || r.card_company || ''}`,
      render: (r) => {
        if (isBank(r)) {
          const bankName = r.bank_mapped_name || r.bank_name || (r.card_company || '').replace('_BANK', '')
          const last4 = r.account_last4 || (r.bank_account_alias || '').match(/(\d{4})\s*$/)?.[1]
          return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(37,99,235,0.08)', color: '#1e40af', whiteSpace: 'nowrap' }}>
            {bankName || '통장'}{last4 ? ` ${last4}` : ''}
          </span>
        }
        const alias = r.card_alias || r.card_company || '카드'
        return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(124,58,237,0.08)', color: '#6d28d9', whiteSpace: 'nowrap' }}>
          {String(alias).replace('_BANK', '')}
        </span>
      }, hideOnMobile: true },
    { key: 'desc', label: '내용',
      sortBy: (r) => r.description || '',
      render: (r) => (
        <span style={{ fontSize: 13, fontWeight: 500, display: 'block', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description || ''}>
          {r.description || r.client_name || '-'}
        </span>
      ) },
    { key: 'counterpart', label: '거래처', width: 130,
      sortBy: (r) => r.client_name || '',
      render: (r) => <span style={{ fontSize: 12, color: COLORS.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 130 }}>{r.client_name || '-'}</span>,
      hideOnMobile: true },
    { key: 'amount', label: '금액', width: 120, align: 'right',
      sortBy: (r) => Number(r.amount || 0) * (r.type === 'income' ? 1 : -1),
      render: (r) => (
        <span style={{ fontWeight: 600, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: r.type === 'income' ? COLORS.income : COLORS.textPrimary }}>
          {nf(r.amount)}
        </span>
      ) },
    { key: 'category', label: '분류', width: 130,
      sortBy: (r) => r.category || '',
      render: (r) => (
        <select
          value={r.category || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onCategoryChange(r.id, e.target.value || null)}
          style={{
            fontSize: 11, fontWeight: 700, padding: '2px 4px', borderRadius: 6, maxWidth: 126,
            border: `1px solid ${r.category ? 'rgba(0,0,0,0.1)' : 'rgba(220,38,38,0.35)'}`,
            color: r.category ? COLORS.textPrimary : '#dc2626',
            background: 'transparent', cursor: 'pointer',
          }}
        >
          <option value="">미분류</option>
          {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          {r.category && !categoryOptions.includes(r.category) && <option value={r.category}>{r.category}</option>}
        </select>
      ) },
    { key: 'domain', label: '구분', width: 92,
      sortBy: (r) => r.manage_domain || '',
      render: (r) => {
        const cur = r.manage_domain || ''
        const d = domainLabel(cur)
        return (
          <select
            value={cur}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onAssignDomain([r.id], e.target.value || null)}
            style={{
              fontSize: 11, fontWeight: 700, padding: '2px 4px', borderRadius: 6, maxWidth: 88,
              border: `1px solid ${d?.color ? `${d.color}55` : 'rgba(0,0,0,0.1)'}`,
              color: d?.color || COLORS.textMuted, background: 'transparent', cursor: 'pointer',
            }}
          >
            <option value="">미지정</option>
            {domains.filter((x) => x.is_active).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
          </select>
        )
      }, hideOnMobile: true },
    { key: 'matched', label: '매칭', width: 100,
      sortBy: (r) => (!!r.related_type && !!r.related_id) ? 1 : 0,
      render: (r) => {
        if (r.related_type === 'fmi_rental' && r.related_id) return <span style={{ fontSize: 12, fontWeight: 600, color: '#059669', whiteSpace: 'nowrap' }}>대차 연결</span>
        if (r.related_type && r.related_id) return <span style={{ fontSize: 12, color: '#1e40af', whiteSpace: 'nowrap' }}>연결됨</span>
        if (r.bank_matched_car_number) return <span style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', whiteSpace: 'nowrap' }}>{r.bank_matched_car_number}</span>
        return <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
      }, hideOnMobile: true },
    { key: 'status', label: '상태', width: 80, align: 'center',
      sortBy: (r) => isUnclassified(r) ? 0 : 1,
      render: (r) => isUnclassified(r)
        ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(220,38,38,0.08)', color: '#dc2626' }}>미분류</span>
        : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(22,163,74,0.08)', color: '#15803d' }}>완료</span> },
  ]

  const mobile: MobileCardConfig<any> = {
    title: (r) => <span style={{ fontWeight: 600, fontSize: 14 }}>{fmtDate(r.transaction_date)} {r.description || '거래'}</span>,
    subtitle: (r) => <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{r.client_name || r.bank_name || r.card_alias || ''}</span>,
    trailing: (r) => (
      <span style={{ fontWeight: 700, fontSize: 14, color: r.type === 'income' ? COLORS.income : COLORS.expense }}>
        {nf(r.amount)}
      </span>
    ),
    badges: (r) => isUnclassified(r)
      ? <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>미분류</span>
      : <span style={{ fontSize: 11, color: '#15803d' }}>{r.category}</span>,
  }

  return (
    <>
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="내용, 거래처, 분류, 금액 검색..."
        filters={[
          { key: 'all', label: '전체', count: counts.all },
          { key: 'bank', label: '통장', count: counts.bank },
          { key: 'card', label: '카드', count: counts.card },
          { key: 'unclassified', label: '미분류', count: counts.unclassified },
        ]}
        activeFilter={filter}
        onFilterChange={setFilter}
      />
      {filtered.length > MAX_ROWS && (
        <div style={{ padding: '8px 12px', marginBottom: 8, borderRadius: 8, background: 'rgba(251,191,36,0.12)', fontSize: 12, color: '#92400e' }}>
          최근 {MAX_ROWS.toLocaleString()}건만 표시 중 (전체 {filtered.length.toLocaleString()}건) — 검색·필터로 좁혀 주세요.
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={shown}
        rowKey={(r) => r.id}
        mobileCard={mobile}
        loading={loading}
        emptyIcon="💰"
        emptyMessage="거래 데이터가 없습니다"
        defaultSort={{ key: 'date', dir: 'desc' }}
      />
    </>
  )
}

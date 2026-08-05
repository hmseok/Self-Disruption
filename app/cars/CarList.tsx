'use client'

// ═══════════════════════════════════════════════════════════════
// 차량 원장 — 2026-08-03 재정리 (목업 cars-redesign 확정안, rebuild-fresh)
//   소속 탭(지입 빌려타/직영 FMI) · 총 취득가/월 지입료 · 보험(최신 계약)
//   · 검사만기 · 서류 현황을 한 표에서. 데이터: /api/cars/ledger
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import NeuDataTable, { TableColumn } from '../components/NeuDataTable'
import DcToolbar from '../components/DcToolbar'
import { COLORS } from '@/app/utils/ui-tokens'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type LedgerCar = {
  id: string
  number: string | null
  brand: string | null
  model: string | null
  trim: string | null
  year: number | null
  status: string
  fuel: string | null
  mileage: number | null
  location: string | null
  vehicle_class: 'ride' | 'own' | 'unknown'
  owner_name: string | null
  consignment_fee: number | null
  consignment_cum: { total: number; months: number } | null
  total_cost: number | null
  purchase_price: number | null
  is_used: boolean
  purchase_method: string | null
  inspection_end_date: string | null
  inspection_dday: number | null
  insurance: { company: string | null; end_date: string | null; dday: number | null; own_damage: string | null; premium: number | null; has_certificate: boolean } | null
  docs: { registration: boolean; consignment_contract: boolean; photo: boolean }
}

const nf = (n: any) => Number(n || 0).toLocaleString('ko-KR')
const d10 = (s: any) => (s ? String(s).slice(0, 10) : '—')

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  available: { label: '대기', bg: COLORS.borderFaint, fg: COLORS.textSecondary },
  active: { label: '운용중', bg: COLORS.bgGreen, fg: COLORS.success },
  rented: { label: '운용중', bg: COLORS.bgGreen, fg: COLORS.success },
  returned: { label: '반납/대기', bg: COLORS.borderFaint, fg: COLORS.textSecondary },
  accident: { label: '사고', bg: COLORS.bgRed, fg: COLORS.danger },
  maintenance: { label: '정비', bg: COLORS.bgAmber, fg: COLORS.warning },
  sold: { label: '매각', bg: COLORS.borderFaint, fg: COLORS.textDim },
}

function ClassBadge({ cls }: { cls: LedgerCar['vehicle_class'] }) {
  if (cls === 'ride') return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 6, background: '#ede9fe', color: '#6d28d9', whiteSpace: 'nowrap' }}>빌려타 지입</span>
  if (cls === 'own') return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 6, background: '#dbeafe', color: '#1d4ed8', whiteSpace: 'nowrap' }}>FMI 직영</span>
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 6, background: COLORS.borderFaint, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>미지정</span>
}

export default function CarListPage() {
  const router = useRouter()
  const [cars, setCars] = useState<LedgerCar[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [cls, setCls] = useState<'all' | 'ride' | 'own'>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/cars/ledger', { headers })
      const json = await res.json()
      if (json?.data) { setCars(json.data); setSummary(json.summary) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = cars
    if (cls !== 'all') list = list.filter((c) => c.vehicle_class === cls)
    if (statusFilter === 'operating') list = list.filter((c) => ['active', 'rented'].includes(c.status))
    else if (statusFilter === 'idle') list = list.filter((c) => ['available', 'returned'].includes(c.status))
    else if (statusFilter === 'attention') list = list.filter((c) =>
      (c.insurance?.dday != null && c.insurance.dday <= 90) ||
      (c.inspection_dday != null && c.inspection_dday <= 60) ||
      !c.docs.registration)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((c) =>
        String(c.number || '').toLowerCase().includes(q) ||
        String(c.brand || '').toLowerCase().includes(q) ||
        String(c.model || '').toLowerCase().includes(q))
    }
    return list
  }, [cars, cls, statusFilter, search])

  const columns: TableColumn<LedgerCar>[] = [
    { key: 'car', label: '차량',
      sortBy: (c) => c.number || '',
      render: (c) => (
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.number || '—'}</div>
          <div style={{ fontSize: 11.5, color: COLORS.textMuted }}>
            {[c.brand, c.model].filter(Boolean).join(' ')}{c.year ? ` · ${c.year}` : ''}{c.fuel ? ` · ${c.fuel}` : ''}
          </div>
        </div>
      ) },
    { key: 'class', label: '소속', width: 96, align: 'center',
      sortBy: (c) => c.vehicle_class,
      render: (c) => <ClassBadge cls={c.vehicle_class} /> },
    { key: 'owner', label: '명의/지입사', width: 140,
      sortBy: (c) => c.owner_name || '',
      render: (c) => c.vehicle_class === 'ride'
        ? <span style={{ fontSize: 12.5 }}>{c.owner_name || '빌려타'}</span>
        : <span style={{ fontSize: 12.5 }}>{c.owner_name || '㈜에프엠아이'}</span> },
    { key: 'cost', label: '취득가 / 지입료', width: 150, align: 'right',
      sortBy: (c) => c.vehicle_class === 'ride' ? (c.consignment_fee || 0) : (c.total_cost || 0),
      render: (c) => c.vehicle_class === 'ride'
        ? c.consignment_fee
          ? <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9', fontVariantNumeric: 'tabular-nums' }}>월 {nf(c.consignment_fee)}</div>
              {c.consignment_cum && <div style={{ fontSize: 10.5, color: COLORS.textMuted }}>누적 {nf(c.consignment_cum.total)} ({c.consignment_cum.months}개월)</div>}
            </div>
          : <span style={{ fontSize: 11.5, color: COLORS.textDim }}>지입료 미입력</span>
        : c.total_cost
          ? <div>
              <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{nf(c.total_cost)}</div>
              <div style={{ fontSize: 10.5, color: COLORS.textMuted }}>
                {c.is_used ? '중고' : '신차'}{c.purchase_method ? ` · ${c.purchase_method}` : ''}
              </div>
            </div>
          : <span style={{ fontSize: 11.5, color: COLORS.textDim }}>미입력</span> },
    { key: 'purchase', label: '구입', width: 92, align: 'center',
      sortBy: (c) => `${c.is_used ? '중고' : '신차'}${c.purchase_method || ''}`,
      render: (c) => c.vehicle_class === 'ride'
        ? <span style={{ fontSize: 11.5, color: COLORS.textDim }}>—</span>
        : <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: c.is_used ? COLORS.bgAmber : COLORS.bgGreen, color: c.is_used ? COLORS.warning : COLORS.success }}>{c.is_used ? '중고' : '신차'}</span>
            {c.purchase_method
              ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: COLORS.bgBlue, color: COLORS.primary }}>{c.purchase_method}</span>
              : <span style={{ fontSize: 10.5, color: COLORS.textDim }}>방식?</span>}
          </div> },
    { key: 'insurance', label: '보험', width: 168,
      sortBy: (c) => c.insurance?.end_date || '',
      render: (c) => c.insurance
        ? <div style={{ fontSize: 12 }}>
            <div>{c.insurance.company || '보험사 미상'}{c.insurance.own_damage ? <span style={{ color: COLORS.textMuted, fontSize: 11 }}> · 자차 {c.insurance.own_damage}</span> : null}</div>
            <div style={{ fontSize: 11, color: c.insurance.dday != null && c.insurance.dday <= 90 ? COLORS.warning : COLORS.textMuted }}>
              ~{d10(c.insurance.end_date)}{c.insurance.dday != null && c.insurance.dday >= 0 && c.insurance.dday <= 90 ? ` (D-${c.insurance.dday})` : ''}
            </div>
          </div>
        : <span style={{ fontSize: 11.5, color: COLORS.textDim }}>계약 없음</span> },
    { key: 'inspection', label: '검사만기', width: 96, align: 'center',
      sortBy: (c) => c.inspection_end_date || '',
      render: (c) => c.inspection_end_date
        ? <span style={{ fontSize: 12, fontWeight: c.inspection_dday != null && c.inspection_dday <= 60 ? 700 : 500, color: c.inspection_dday != null && c.inspection_dday <= 60 ? COLORS.danger : COLORS.textSecondary, whiteSpace: 'nowrap' }}>
            {String(c.inspection_end_date).slice(0, 7)}
          </span>
        : <span style={{ fontSize: 11.5, color: COLORS.textDim }}>—</span> },
    { key: 'status', label: '상태', width: 84, align: 'center',
      sortBy: (c) => c.status,
      render: (c) => {
        const m = STATUS_META[c.status] || { label: c.status, bg: COLORS.borderFaint, fg: COLORS.textSecondary }
        return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: m.bg, color: m.fg, whiteSpace: 'nowrap' }}>{m.label}</span>
      } },
    { key: 'docs', label: '서류', width: 116, align: 'center',
      sortBy: (c) => Number(c.docs.registration),
      render: (c) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: c.docs.registration ? COLORS.bgGreen : COLORS.bgRed, color: c.docs.registration ? COLORS.success : COLORS.danger, whiteSpace: 'nowrap' }}>
            등록증 {c.docs.registration ? '✓' : '✗'}
          </span>
          {c.insurance?.has_certificate && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: COLORS.borderFaint, color: COLORS.textSecondary }}>증권</span>}
        </div>
      ) },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, color: COLORS.textPrimary, fontSize: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 21, letterSpacing: '-0.02em', fontWeight: 700 }}>차량</h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 3 }}>소속·취득가·보험·서류를 한 기준으로 관리합니다</p>
        </div>
        <button onClick={() => router.push('/cars/new')}
          style={{ background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + 차량 등록
        </button>
      </div>

      {/* 요약 카드 — 클릭 시 필터 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: '전체 차량', value: summary ? `${summary.total}대` : '—', sub: summary ? `지입 ${summary.ride} · 직영 ${summary.own}` : '', dot: COLORS.primary, onClick: () => { setCls('all'); setStatusFilter('all') } },
          { label: '직영 총 취득가', value: summary?.own_total_cost ? `${(summary.own_total_cost / 100000000).toFixed(2)}억` : '—', sub: '', dot: '#1d4ed8', onClick: () => setCls('own') },
          { label: '지입료 월 합계', value: summary?.ride_monthly_fee ? `${nf(summary.ride_monthly_fee)}원` : '—', sub: '', dot: '#6d28d9', onClick: () => setCls('ride') },
          { label: '보험 만기 90일 이내', value: summary ? `${summary.insurance_expiring}대` : '—', sub: '', dot: COLORS.warning, onClick: () => setStatusFilter('attention') },
          { label: '등록증 미첨부', value: summary ? `${summary.docs_missing}대` : '—', sub: '', dot: COLORS.danger, onClick: () => setStatusFilter('attention') },
        ].map((c, i) => (
          <div key={i} onClick={c.onClick}
            style={{ background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12, padding: '13px 15px', boxShadow: '0 1px 2px rgba(16,24,40,0.05)', cursor: 'pointer' }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, display: 'inline-block' }} />{c.label}
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, letterSpacing: '-0.02em' }}>{loading ? '…' : c.value}</div>
            {c.sub && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* 소속 탭 */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e6e8ec', marginBottom: 14 }}>
        {([
          ['all', '전체', null],
          ['ride', '지입', '빌려타'],
          ['own', '직영', 'FMI'],
        ] as Array<['all' | 'ride' | 'own', string, string | null]>).map(([k, label, co]) => (
          <button key={k} onClick={() => setCls(k)}
            style={{
              padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: '2.5px solid', marginBottom: -2,
              borderBottomColor: cls === k ? COLORS.primary : 'transparent',
              color: cls === k ? COLORS.textPrimary : COLORS.textMuted,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {label}
            {co && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: k === 'ride' ? '#ede9fe' : '#dbeafe', color: k === 'ride' ? '#6d28d9' : '#1d4ed8' }}>{co}</span>}
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: cls === k ? '#dbeafe' : '#eef1f5', color: cls === k ? COLORS.primary : COLORS.textMuted }}>
              {k === 'all' ? cars.length : cars.filter((c) => c.vehicle_class === k).length}
            </span>
          </button>
        ))}
      </div>

      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="차량번호, 브랜드, 모델 검색..."
        filters={[
          { key: 'all', label: '전체' },
          { key: 'operating', label: '운용중' },
          { key: 'idle', label: '대기' },
          { key: 'attention', label: '챙길 것' },
        ]}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
      />
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(c) => c.id}
        onRowClick={(c) => router.push(`/cars/${c.id}`)}
        loading={loading}
        emptyIcon="🚗"
        emptyMessage="등록된 차량이 없습니다"
        defaultSort={{ key: 'car', dir: 'asc' }}
      />
    </div>
  )
}

'use client'

/**
 * /RideMTOps/chargers — MT팀 충전기 (자산 + 유지보수 + 카페24 참고)
 *
 * sub-tab:
 *   · 자산      — ride_chargers (자체 등록 — CRUD)
 *   · 유지보수  — ride_charger_maintenance (b-1 골격, b-3 본격)
 *   · 카페24 참고 — pluglink_charger read (참고용)
 *
 * PR-6.14.b-1
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import DcStatStrip, { type StatItem, type ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar from '@/app/components/DcToolbar'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import MTOpsNavTabs from '@/app/components/ride-mt-ops/NavTabs'

// ─── 타입 ─────────────────────────────────────────────────────────
interface ChargerRow {
  id: string
  charger_code: string
  station_name: string | null
  address: string | null
  model: string | null
  charger_type: string | null
  capacity_kw: string | null
  installed_date: string | null
  status: string
  memo: string | null
  created_at: string
  updated_at: string
  created_by_name: string | null
}

interface MaintRow {
  id: string
  charger_id: string
  charger_code: string | null
  station_name: string | null
  maint_type: string
  scheduled_date: string | null
  maint_date: string | null
  title: string | null
  detail: string | null
  assignee: string | null
  cost: string | null
  status: string
  settled: number
  created_at: string
  updated_at: string
  created_by_name: string | null
}

interface Cafe24Row {
  id: number | string
  project_id: number | string | null
  model: string | null
  charger_number: string | null
  pluglink_id: string | null
  station_id: number | string | null
  station_name: string | null
  address: string | null
}

type Tab = 'assets' | 'maintenance' | 'cafe24'

const CHARGER_STATUS = ['정상', '점검중', '고장', '폐기']
const CHARGER_TYPES = ['급속', '완속']
const STATUS_COLOR: Record<string, string> = {
  정상: COLORS.success,
  점검중: COLORS.warning,
  고장: COLORS.danger,
  폐기: COLORS.textMuted,
}
const MAINT_STATUS_COLOR: Record<string, string> = {
  예정: COLORS.primary,
  진행중: COLORS.warning,
  완료: COLORS.success,
}

function clip(s: string | null | undefined, n = 30): string {
  if (!s) return ''
  return s.length > n ? s.substring(0, n) + '…' : s
}
function fmtAmount(v: string | number | null | undefined): string {
  const n = Number(v || 0)
  if (!Number.isFinite(n) || n === 0) return '-'
  return n.toLocaleString()
}

// ═══════════════════════════════════════════════════════════════
export default function ChargersPage() {
  const [user, setUser] = useState<{ role?: string; id?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [tab, setTab] = useState<Tab>('assets')
  const [search, setSearch] = useState('')

  // 자산
  const [assets, setAssets] = useState<ChargerRow[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [migrationPending, setMigrationPending] = useState(false)
  // 유지보수
  const [maint, setMaint] = useState<MaintRow[]>([])
  const [maintLoading, setMaintLoading] = useState(false)
  // 카페24
  const [cafe24, setCafe24] = useState<Cafe24Row[]>([])
  const [cafe24Loading, setCafe24Loading] = useState(false)
  const [cafe24Mode, setCafe24Mode] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ChargerRow | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    setUser(getStoredUser())
    setAuthChecked(true)
  }, [])

  // ─── fetch ──────────────────────────────────────────────────
  const fetchAssets = useCallback(async () => {
    setAssetsLoading(true)
    setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-chargers', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || `HTTP ${res.status}`)
        setAssets([])
      } else {
        setAssets(json.data || [])
        setMigrationPending(!!json.meta?._migration_pending)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setAssetsLoading(false)
    }
  }, [])

  const fetchMaint = useCallback(async () => {
    setMaintLoading(true)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-charger-maintenance', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      if (res.ok && json.success) {
        setMaint(json.data || [])
        if (json.meta?._migration_pending) setMigrationPending(true)
      }
    } catch {
      /* graceful */
    } finally {
      setMaintLoading(false)
    }
  }, [])

  const fetchCafe24 = useCallback(async (q: string) => {
    setCafe24Loading(true)
    try {
      const token = getStoredToken()
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/cafe24/chargers?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      if (res.ok && json.success) {
        setCafe24(json.data || [])
        setCafe24Mode(json.meta?.mode || null)
      }
    } catch {
      /* graceful */
    } finally {
      setCafe24Loading(false)
    }
  }, [])

  useEffect(() => {
    if (!authChecked) return
    fetchAssets()
    fetchMaint()
  }, [authChecked, fetchAssets, fetchMaint])

  useEffect(() => {
    if (!authChecked || tab !== 'cafe24') return
    fetchCafe24(search)
  }, [authChecked, tab, fetchCafe24, search])

  // ─── 검색 필터 ───────────────────────────────────────────────
  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return assets
    return assets.filter(
      r =>
        (r.charger_code || '').toLowerCase().includes(q) ||
        (r.station_name || '').toLowerCase().includes(q) ||
        (r.address || '').toLowerCase().includes(q) ||
        (r.model || '').toLowerCase().includes(q)
    )
  }, [assets, search])

  const filteredMaint = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return maint
    return maint.filter(
      r =>
        (r.charger_code || '').toLowerCase().includes(q) ||
        (r.title || '').toLowerCase().includes(q) ||
        (r.assignee || '').toLowerCase().includes(q)
    )
  }, [maint, search])

  // ─── stats ───────────────────────────────────────────────────
  const stats: StatItem[] = useMemo(() => {
    if (tab === 'assets') {
      const by = (s: string) => assets.filter(a => a.status === s).length
      return [
        { label: '전체 충전기', value: assets.length, tint: 'blue', icon: '🔌' },
        { label: '정상', value: by('정상'), tint: 'green' },
        { label: '점검중', value: by('점검중'), tint: 'amber' },
        { label: '고장', value: by('고장'), tint: 'red' },
        { label: '폐기', value: by('폐기'), tint: 'slate' },
      ]
    }
    if (tab === 'maintenance') {
      const by = (s: string) => maint.filter(m => m.status === s).length
      const unsettled = maint.filter(m => m.status === '완료' && !m.settled).length
      return [
        { label: '전체 작업', value: maint.length, tint: 'blue', icon: '🛠' },
        { label: '예정', value: by('예정'), tint: 'purple' },
        { label: '진행중', value: by('진행중'), tint: 'amber' },
        { label: '완료', value: by('완료'), tint: 'green' },
        { label: '미정산', value: unsettled, tint: 'red' },
      ]
    }
    return [{ label: '카페24 충전기', value: cafe24.length, tint: 'blue', icon: '📡' }]
  }, [tab, assets, maint, cafe24])

  const actions: ActionButton[] = useMemo(() => {
    if (tab === 'assets') {
      return [{ label: '충전기 등록', icon: '➕', variant: 'primary', onClick: () => setCreating(true) }]
    }
    return []
  }, [tab])

  // ─── 삭제 ────────────────────────────────────────────────────
  const handleDelete = async (row: ChargerRow) => {
    if (!confirm(`충전기 「${row.charger_code}」 삭제하시겠습니까?`)) return
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-chargers/${row.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || `삭제 실패 HTTP ${res.status}`)
        return
      }
      fetchAssets()
    } catch (e) {
      setError(String(e))
    }
  }

  // ─── 컬럼 ────────────────────────────────────────────────────
  const assetCols: TableColumn<ChargerRow>[] = [
    {
      key: 'charger_code',
      label: '충전기 ID',
      sortBy: r => r.charger_code || '',
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: 700 }}>
          {r.charger_code}
        </span>
      ),
    },
    {
      key: 'station_name',
      label: '개소명',
      sortBy: r => r.station_name || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{clip(r.station_name, 22)}</span>,
    },
    {
      key: 'address',
      label: '주소',
      sortBy: r => r.address || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{clip(r.address, 36)}</span>,
    },
    {
      key: 'model',
      label: '모델',
      sortBy: r => r.model || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{clip(r.model, 18)}</span>,
    },
    {
      key: 'charger_type',
      label: '타입',
      sortBy: r => r.charger_type || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.charger_type || '-'}</span>,
    },
    {
      key: 'capacity_kw',
      label: '용량(kW)',
      align: 'right',
      sortBy: r => Number(r.capacity_kw || 0),
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.capacity_kw ? Number(r.capacity_kw).toLocaleString() : '-'}</span>,
    },
    {
      key: 'installed_date',
      label: '설치일',
      sortBy: r => r.installed_date || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.installed_date || '-'}</span>,
    },
    {
      key: 'status',
      label: '상태',
      sortBy: r => r.status || '',
      render: r => (
        <span
          style={{
            whiteSpace: 'nowrap',
            fontSize: 11,
            fontWeight: 700,
            color: STATUS_COLOR[r.status] || COLORS.textSecondary,
          }}
        >
          ● {r.status}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '관리',
      render: r => (
        <div style={{ display: 'flex', gap: 4, whiteSpace: 'nowrap' }}>
          <button
            style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary }}
            onClick={e => {
              e.stopPropagation()
              setEditing(r)
            }}
          >
            편집
          </button>
          <button
            style={{ ...BTN.sm, background: COLORS.bgRed, color: COLORS.danger }}
            onClick={e => {
              e.stopPropagation()
              handleDelete(r)
            }}
          >
            삭제
          </button>
        </div>
      ),
    },
  ]

  const maintCols: TableColumn<MaintRow>[] = [
    {
      key: 'charger_code',
      label: '충전기',
      sortBy: r => r.charger_code || '',
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: 700 }}>
          {r.charger_code || '-'}
        </span>
      ),
    },
    {
      key: 'maint_type',
      label: '유형',
      sortBy: r => r.maint_type || '',
      render: r => (
        <span
          style={{
            whiteSpace: 'nowrap',
            fontSize: 11,
            fontWeight: 600,
            color: r.maint_type === '고장수리' ? COLORS.danger : COLORS.primary,
          }}
        >
          {r.maint_type}
        </span>
      ),
    },
    {
      key: 'scheduled_date',
      label: '예정일',
      sortBy: r => r.scheduled_date || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.scheduled_date || '-'}</span>,
    },
    {
      key: 'maint_date',
      label: '작업일',
      sortBy: r => r.maint_date || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.maint_date || '-'}</span>,
    },
    {
      key: 'title',
      label: '제목',
      sortBy: r => r.title || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{clip(r.title, 30)}</span>,
    },
    {
      key: 'assignee',
      label: '담당자',
      sortBy: r => r.assignee || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.assignee || '-'}</span>,
    },
    {
      key: 'cost',
      label: '비용',
      align: 'right',
      sortBy: r => Number(r.cost || 0),
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{fmtAmount(r.cost)}</span>,
    },
    {
      key: 'status',
      label: '상태',
      sortBy: r => r.status || '',
      render: r => (
        <span
          style={{
            whiteSpace: 'nowrap',
            fontSize: 11,
            fontWeight: 700,
            color: MAINT_STATUS_COLOR[r.status] || COLORS.textSecondary,
          }}
        >
          {r.status}
        </span>
      ),
    },
    {
      key: 'settled',
      label: '정산',
      sortBy: r => (r.settled ? 1 : 0),
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: r.settled ? COLORS.success : COLORS.textMuted }}>
          {r.settled ? '✓ 완료' : '미정산'}
        </span>
      ),
    },
  ]

  const cafe24Cols: TableColumn<Cafe24Row>[] = [
    {
      key: 'charger_number',
      label: '충전기 번호',
      sortBy: r => r.charger_number || '',
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: 700 }}>
          {r.charger_number || '-'}
        </span>
      ),
    },
    {
      key: 'station_name',
      label: '개소명',
      sortBy: r => r.station_name || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{clip(r.station_name, 24)}</span>,
    },
    {
      key: 'address',
      label: '주소',
      sortBy: r => r.address || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{clip(r.address, 40)}</span>,
    },
    {
      key: 'model',
      label: '모델',
      sortBy: r => r.model || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{clip(r.model, 20)}</span>,
    },
    {
      key: 'pluglink_id',
      label: 'pluglink ID',
      sortBy: r => r.pluglink_id || '',
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 10, fontFamily: 'monospace', color: COLORS.textMuted }}>
          {r.pluglink_id || '-'}
        </span>
      ),
    },
  ]

  if (!authChecked) return <div style={{ padding: 24, color: COLORS.textSecondary }}>인증 확인 중…</div>

  const tabFilters = [
    { key: 'assets', label: '🔧 자산', count: assets.length },
    { key: 'maintenance', label: '🛠 유지보수', count: maint.length },
    { key: 'cafe24', label: '📡 카페24 참고', count: cafe24.length },
  ]

  return (
    <>
      <MTOpsNavTabs />
      <div style={{ padding: 16}}>
        {migrationPending && (
          <div
            style={{
              padding: 10,
              background: COLORS.bgAmber,
              color: COLORS.warning,
              borderRadius: 8,
              marginBottom: 12,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ⚠ 마이그레이션 미적용 — migrations/2026-05-21_ride_chargers.sql 실행 필요
          </div>
        )}

        <DcStatStrip stats={stats} actions={actions} />

        <DcToolbar
          search={search}
          onSearchChange={setSearch}
          placeholder={
            tab === 'assets'
              ? '충전기 ID / 개소명 / 주소 / 모델...'
              : tab === 'maintenance'
                ? '충전기 / 제목 / 담당자...'
                : '충전기 번호 / 개소명 / 주소...'
          }
          filters={tabFilters}
          activeFilter={tab}
          onFilterChange={k => setTab(k as Tab)}
        />

        <div style={{ ...GLASS.L4, padding: 12, borderRadius: 12 }}>
          {error && (
            <div style={{ padding: 8, background: COLORS.bgRed, color: COLORS.danger, borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
              ❌ {error}
            </div>
          )}

          {tab === 'assets' && (
            <NeuDataTable
              columns={assetCols}
              data={filteredAssets}
              rowKey={r => r.id}
              onRowClick={r => setEditing(r)}
              loading={assetsLoading}
              defaultSort={{ key: 'charger_code', dir: 'asc' }}
              emptyMessage="등록된 충전기 없음 — [충전기 등록] 버튼으로 추가"
            />
          )}

          {tab === 'maintenance' && (
            <NeuDataTable
              columns={maintCols}
              data={filteredMaint}
              rowKey={r => r.id}
              loading={maintLoading}
              defaultSort={{ key: 'scheduled_date', dir: 'desc' }}
              emptyMessage="유지보수 이력 없음 — 일정/작업 등록은 다음 단계(b-3)에서 제공"
            />
          )}

          {tab === 'cafe24' && (
            <>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
                카페24 pluglink_charger 참고용 read
                {cafe24Mode === 'simple' && <span style={{ color: COLORS.warning, marginLeft: 6 }}>· enrichment 제한</span>}
                {cafe24Mode === 'empty' && <span style={{ color: COLORS.danger, marginLeft: 6 }}>· 데이터 미수신</span>}
              </div>
              <NeuDataTable
                columns={cafe24Cols}
                data={cafe24}
                rowKey={r => String(r.id)}
                loading={cafe24Loading}
                defaultSort={{ key: 'charger_number', dir: 'asc' }}
                emptyMessage="카페24 충전기 없음"
              />
            </>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <ChargerFormModal
          initial={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            fetchAssets()
          }}
        />
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// ChargerFormModal — 충전기 등록 / 편집 공용
// ═══════════════════════════════════════════════════════════════
function ChargerFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: ChargerRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!initial
  const [form, setForm] = useState({
    charger_code: initial?.charger_code || '',
    station_name: initial?.station_name || '',
    address: initial?.address || '',
    model: initial?.model || '',
    charger_type: initial?.charger_type || '',
    capacity_kw: initial?.capacity_kw || '',
    installed_date: initial?.installed_date || '',
    status: initial?.status || '정상',
    memo: initial?.memo || '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.charger_code.trim()) {
      setErr('충전기 ID 는 필수입니다')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const token = getStoredToken()
      const url = isEdit ? `/api/ride-chargers/${initial!.id}` : '/api/ride-chargers'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErr(json.error || `HTTP ${res.status}`)
        setBusy(false)
        return
      }
      onSaved()
    } catch (e) {
      setErr(String(e))
      setBusy(false)
    }
  }

  const fieldStyle = {
    ...GLASS.L1,
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.08)',
    fontSize: 12,
    width: '100%',
  }
  const labelStyle = { fontSize: 11, color: COLORS.textSecondary, fontWeight: 600, marginBottom: 4, display: 'block' }

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
        style={{ ...GLASS.L4, borderRadius: 16, padding: 20, width: '100%', maxWidth: 520, maxHeight: '92vh', overflow: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            {isEdit ? '🔧 충전기 편집' : '➕ 충전기 등록'}
          </span>
          <button style={{ ...BTN.sm, background: 'transparent', color: COLORS.textMuted }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <label style={labelStyle}>충전기 ID *</label>
            <input
              style={fieldStyle}
              value={form.charger_code}
              onChange={e => set('charger_code', e.target.value)}
              placeholder="예: CH-001"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>개소명</label>
              <input style={fieldStyle} value={form.station_name} onChange={e => set('station_name', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>모델</label>
              <input style={fieldStyle} value={form.model} onChange={e => set('model', e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>주소</label>
            <input style={fieldStyle} value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>충전 타입</label>
              <select style={fieldStyle} value={form.charger_type} onChange={e => set('charger_type', e.target.value)}>
                <option value="">선택</option>
                {CHARGER_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>용량(kW)</label>
              <input
                style={fieldStyle}
                type="number"
                value={form.capacity_kw}
                onChange={e => set('capacity_kw', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>상태</label>
              <select style={fieldStyle} value={form.status} onChange={e => set('status', e.target.value)}>
                {CHARGER_STATUS.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>설치일</label>
            <input
              style={fieldStyle}
              type="date"
              value={form.installed_date}
              onChange={e => set('installed_date', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>메모</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 56, resize: 'vertical' }}
              value={form.memo}
              onChange={e => set('memo', e.target.value)}
            />
          </div>

          {err && (
            <div style={{ fontSize: 11, color: COLORS.danger, padding: 6, background: COLORS.bgRed, borderRadius: 6 }}>
              ❌ {err}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button style={{ ...BTN.md, background: COLORS.bgGray, color: COLORS.textSecondary }} onClick={onClose}>
              취소
            </button>
            <button
              style={{ ...BTN.md, background: COLORS.success, color: '#fff', opacity: busy ? 0.6 : 1 }}
              onClick={save}
              disabled={busy}
            >
              {busy ? '저장 중…' : isEdit ? '수정 저장' : '등록'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

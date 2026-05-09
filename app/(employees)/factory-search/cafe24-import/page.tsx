'use client'

/**
 * /factory-search/cafe24-import
 *
 * 카페24 pmcfactm 가져오기 → 검토 → 정제 → 자체 DB 등록
 *
 * PR-6.12.b → PR-6.12.c (좌 컨트롤 / 우 데이터 2-pane)
 *
 * 레이아웃:
 *   좌측 (300px): 컨트롤 (가져오기 / 정제 옵션 / 등록 버튼 / 결과 통계)
 *   우측 (flex):  데이터 표 (snapshot 검토 + 운영 목록)
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import SubNav from '../_components/SubNav'

interface Snapshot {
  id: string
  fetch_batch: string
  factcode: string
  factname: string | null
  factaddr: string | null
  facthpno: string | null
  facttel: string | null
  factbsno: string | null
  factconm: string | null
  facttype: string | null
  factmemo: string | null
  fetched_at: string
}

interface PartnerFactory {
  id: string
  cafe24_factcode: string | null
  name: string
  address: string | null
  phone: string | null
  business_no: string | null
  group_label: string | null
  status: string
  is_terminated: number
  region: string | null
  district: string | null
  created_at: string
}

function clip(s: string | null | undefined, n = 30): string {
  if (!s) return ''
  return s.length > n ? s.substring(0, n) + '…' : s
}

type RightTab = 'snapshot' | 'partners'

interface FactoryStats {
  factcode: string
  assign_count: number
  last_assigned_date: string | null
  distinct_cars: number | null
  distinct_customers: number | null
}

interface FactoryVehicle {
  car_number: string | null
  car_model: string | null
  customer: string | null
  assigned_date: string | null
  oderstat: string | null
}

export default function Cafe24ImportPage() {
  const [user, setUser] = useState<{ role?: string; id?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const [fetching, setFetching] = useState(false)
  const [includeTerminated, setIncludeTerminated] = useState(false)
  const [fetchResult, setFetchResult] = useState<{ batch: string; fetched: number; inserted: number; fetched_at: string } | null>(null)

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [snapshotsBatch, setSnapshotsBatch] = useState<{ batch: string | null; count: number; fetched_at: string | null } | null>(null)
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [cleanName, setCleanName] = useState(true)
  const [defaultGroup, setDefaultGroup] = useState('')

  const [promoting, setPromoting] = useState(false)
  const [promoteResult, setPromoteResult] = useState<{ requested: number; found: number; promoted: number; skipped: number; errors: number; errorList: string[] } | null>(null)

  const [partners, setPartners] = useState<PartnerFactory[]>([])
  const [partnersLoading, setPartnersLoading] = useState(false)

  const [rightTab, setRightTab] = useState<RightTab>('snapshot')

  // PR-6.12.d — 공장별 stats Map (factcode → stats)
  const [statsMap, setStatsMap] = useState<Map<string, FactoryStats>>(new Map())
  const [statsMode, setStatsMode] = useState<'full' | 'simple' | 'empty' | 'idle'>('idle')

  // PR-6.12.d — 공장 detail drawer (배정 차량 list)
  const [vehicleDrawer, setVehicleDrawer] = useState<{ factcode: string; factname: string } | null>(null)
  const [vehicles, setVehicles] = useState<FactoryVehicle[]>([])
  const [vehiclesLoading, setVehiclesLoading] = useState(false)

  useEffect(() => {
    setUser(getStoredUser())
    setAuthChecked(true)
  }, [])

  const fetchSnapshots = useMemo(
    () =>
      async function (overrideBatch?: string) {
        setSnapshotsLoading(true)
        try {
          const token = getStoredToken()
          const params = new URLSearchParams()
          if (overrideBatch) params.set('batch', overrideBatch)
          else params.set('latest', '1')
          if (search.trim()) params.set('q', search.trim())
          const res = await fetch(`/api/factory-cafe24-snapshots?${params}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          if (json.success) {
            setSnapshots(json.data || [])
            setSnapshotsBatch(json.meta?.batch || null)
          }
        } catch (e) {
          console.error(e)
        } finally {
          setSnapshotsLoading(false)
        }
      },
    [search]
  )

  const fetchPartners = useMemo(
    () =>
      async function () {
        setPartnersLoading(true)
        try {
          const token = getStoredToken()
          const res = await fetch('/api/partner-factories?limit=2000', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          if (json.success) setPartners(json.data || [])
        } catch (e) {
          console.error(e)
        } finally {
          setPartnersLoading(false)
        }
      },
    []
  )

  // PR-6.12.d — 공장 stats fetch (한 번만)
  const fetchStats = useMemo(
    () =>
      async function () {
        try {
          const token = getStoredToken()
          const res = await fetch('/api/cafe24/factory-stats', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          if (json.success) {
            const m = new Map<string, FactoryStats>()
            for (const s of json.data || []) {
              if (s.factcode) m.set(s.factcode, s)
            }
            setStatsMap(m)
            setStatsMode(json.meta?.mode || 'empty')
          }
        } catch (e) {
          console.warn('[stats fetch]', e)
          setStatsMode('empty')
        }
      },
    []
  )

  const openVehicleDrawer = async (factcode: string, factname: string) => {
    setVehicleDrawer({ factcode, factname })
    setVehicles([])
    setVehiclesLoading(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/cafe24/factory-vehicles?factcode=${encodeURIComponent(factcode)}&limit=200`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      if (json.success) setVehicles(json.data || [])
    } catch (e) {
      console.warn('[vehicles fetch]', e)
    } finally {
      setVehiclesLoading(false)
    }
  }

  useEffect(() => {
    if (!authChecked || user?.role !== 'admin') return
    fetchSnapshots()
    fetchPartners()
    fetchStats()
  }, [authChecked, user, fetchSnapshots, fetchPartners, fetchStats])

  if (!authChecked)
    return (
      <>
        <SubNav />
        <div style={{ padding: 24, color: COLORS.textSecondary }}>인증 확인 중…</div>
      </>
    )
  if (user?.role !== 'admin')
    return (
      <>
        <SubNav />
        <div style={{ padding: 24, color: COLORS.danger }}>⚠ 관리자 권한 필요</div>
      </>
    )

  const runFetch = async () => {
    setFetching(true)
    setFetchResult(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/factory-cafe24-snapshots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ include_terminated: includeTerminated }),
      })
      const json = await res.json()
      if (json.success) {
        setFetchResult(json)
        setSelected(new Set())
        setRightTab('snapshot')
        fetchSnapshots(json.batch)
      } else {
        alert('가져오기 실패: ' + (json.error || 'unknown'))
      }
    } catch (e) {
      alert('가져오기 실패: ' + String(e))
    } finally {
      setFetching(false)
    }
  }

  const runPromote = async () => {
    if (selected.size === 0) {
      alert('등록할 row 선택 필요')
      return
    }
    setPromoting(true)
    setPromoteResult(null)
    try {
      const token = getStoredToken()
      const overrides: Record<string, { group_label?: string }> = {}
      if (defaultGroup.trim()) {
        for (const id of selected) {
          overrides[id] = { group_label: defaultGroup.trim() }
        }
      }
      const res = await fetch('/api/partner-factories/promote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          snapshot_ids: Array.from(selected),
          overrides,
          clean_name: cleanName,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setPromoteResult({
          requested: json.counts.requested,
          found: json.counts.found,
          promoted: json.counts.promoted,
          skipped: json.counts.skipped,
          errors: json.counts.errors,
          errorList: json.errors || [],
        })
        setSelected(new Set())
        setRightTab('partners')
        fetchPartners()
      } else {
        alert('등록 실패: ' + (json.error || 'unknown'))
      }
    } catch (e) {
      alert('등록 실패: ' + String(e))
    } finally {
      setPromoting(false)
    }
  }

  const toggleAll = () => {
    if (selected.size === snapshots.length) setSelected(new Set())
    else setSelected(new Set(snapshots.map(s => s.id)))
  }
  const toggleOne = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  // ── snapshot 테이블 ────────────────────────────────────────────
  const snapshotCols: TableColumn<Snapshot>[] = [
    {
      key: 'check',
      label: (
        <input
          type="checkbox"
          checked={snapshots.length > 0 && selected.size === snapshots.length}
          onChange={toggleAll}
        />
      ) as unknown as string,
      render: r => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onChange={() => toggleOne(r.id)}
          onClick={e => e.stopPropagation()}
        />
      ),
    },
    {
      key: 'factcode',
      label: '코드',
      sortBy: r => r.factcode,
      render: r => <span style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{r.factcode}</span>,
    },
    {
      key: 'factname',
      label: '공장명',
      sortBy: r => r.factname || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{clip(r.factname, 30)}</span>,
    },
    {
      key: 'factaddr',
      label: '주소',
      sortBy: r => r.factaddr || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{clip(r.factaddr, 40)}</span>,
    },
    {
      key: 'facthpno',
      label: '전화',
      sortBy: r => r.facthpno || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.facthpno || '-'}</span>,
    },
    {
      key: 'factbsno',
      label: '사업자',
      sortBy: r => r.factbsno || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontFamily: 'monospace' }}>{r.factbsno || '-'}</span>,
    },
    {
      key: 'factconm',
      label: '담당',
      sortBy: r => r.factconm || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.factconm || '-'}</span>,
    },
    {
      key: 'facttype',
      label: '종류',
      sortBy: r => r.facttype || '',
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: r.facttype === 'Z' ? COLORS.danger : COLORS.textPrimary }}>
          {r.facttype || '-'}
        </span>
      ),
    },
    // PR-6.12.d 배정 통계
    {
      key: 'assign_count',
      label: '배정',
      align: 'right',
      sortBy: r => statsMap.get(r.factcode)?.assign_count || 0,
      render: r => {
        const s = statsMap.get(r.factcode)
        if (!s || !s.assign_count) return <span style={{ fontSize: 11, color: COLORS.textMuted }}>-</span>
        return (
          <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: COLORS.primary }}>
            {s.assign_count.toLocaleString()}건
          </span>
        )
      },
    },
    {
      key: 'last_assigned',
      label: '최근 배정',
      sortBy: r => statsMap.get(r.factcode)?.last_assigned_date || '',
      render: r => {
        const s = statsMap.get(r.factcode)
        if (!s?.last_assigned_date) return <span style={{ fontSize: 11, color: COLORS.textMuted }}>-</span>
        const d = s.last_assigned_date
        const formatted = d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d
        return (
          <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{formatted}</span>
        )
      },
    },
    {
      key: 'detail',
      label: '차량',
      render: r => {
        const s = statsMap.get(r.factcode)
        if (!s || !s.assign_count) return <span style={{ fontSize: 11, color: COLORS.textMuted }}>-</span>
        return (
          <button
            style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary }}
            onClick={() => openVehicleDrawer(r.factcode, r.factname || r.factcode)}
          >
            {s.distinct_cars ? `${s.distinct_cars}대` : '보기'}
          </button>
        )
      },
    },
  ]

  const partnerCols: TableColumn<PartnerFactory>[] = [
    {
      key: 'factcode',
      label: '카페24',
      sortBy: r => r.cafe24_factcode || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{r.cafe24_factcode || '-'}</span>,
    },
    {
      key: 'name',
      label: '공장명',
      sortBy: r => r.name,
      render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{r.name}</span>,
    },
    {
      key: 'region',
      label: '지역',
      sortBy: r => `${r.region || ''}-${r.district || ''}`,
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.region || '-'} {r.district || ''}</span>,
    },
    {
      key: 'address',
      label: '주소',
      sortBy: r => r.address || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{clip(r.address, 30)}</span>,
    },
    {
      key: 'phone',
      label: '전화',
      sortBy: r => r.phone || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.phone || '-'}</span>,
    },
    {
      key: 'group',
      label: '그룹',
      sortBy: r => r.group_label || '',
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: r.group_label ? COLORS.primary : COLORS.textMuted }}>
          {r.group_label || '미분류'}
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      sortBy: r => r.status,
      render: r => (
        <span
          style={{
            whiteSpace: 'nowrap',
            fontSize: 11,
            fontWeight: 600,
            color: r.status === 'active' ? COLORS.success : COLORS.danger,
          }}
        >
          {r.status === 'active' ? '운영중' : r.status === 'terminated' ? '폐기' : r.status}
        </span>
      ),
    },
    // PR-6.12.d 배정 통계 (cafe24_factcode 매칭)
    {
      key: 'assign_count',
      label: '배정',
      align: 'right',
      sortBy: r => (r.cafe24_factcode && statsMap.get(r.cafe24_factcode)?.assign_count) || 0,
      render: r => {
        const s = r.cafe24_factcode ? statsMap.get(r.cafe24_factcode) : null
        if (!s || !s.assign_count) return <span style={{ fontSize: 11, color: COLORS.textMuted }}>-</span>
        return (
          <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: COLORS.primary }}>
            {s.assign_count.toLocaleString()}건
          </span>
        )
      },
    },
    {
      key: 'last_assigned',
      label: '최근 배정',
      sortBy: r => (r.cafe24_factcode && statsMap.get(r.cafe24_factcode)?.last_assigned_date) || '',
      render: r => {
        const s = r.cafe24_factcode ? statsMap.get(r.cafe24_factcode) : null
        if (!s?.last_assigned_date) return <span style={{ fontSize: 11, color: COLORS.textMuted }}>-</span>
        const d = s.last_assigned_date
        const formatted = d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d
        return <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{formatted}</span>
      },
    },
    {
      key: 'detail',
      label: '차량',
      render: r => {
        if (!r.cafe24_factcode) return <span style={{ fontSize: 11, color: COLORS.textMuted }}>-</span>
        const s = statsMap.get(r.cafe24_factcode)
        if (!s || !s.assign_count) return <span style={{ fontSize: 11, color: COLORS.textMuted }}>-</span>
        return (
          <button
            style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary }}
            onClick={() => openVehicleDrawer(r.cafe24_factcode!, r.name)}
          >
            {s.distinct_cars ? `${s.distinct_cars}대` : '보기'}
          </button>
        )
      },
    },
  ]

  return (
    <>
      <SubNav />
      <div style={{ padding: 16, maxWidth: 1700, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* ─── 좌측 컨트롤 패널 ─── */}
        <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>
          <div style={{ ...GLASS.L5, padding: '12px 16px', borderRadius: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>
              📥 카페24 가져오기
            </div>
            <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 4 }}>
              raw snapshot → 검토 → 정제 → DB 등록
            </div>
          </div>

          {/* Step 1 */}
          <div style={{ ...GLASS.L4, padding: 12, borderRadius: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>1️⃣ 가져오기</div>
            <label style={{ fontSize: 11, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <input type="checkbox" checked={includeTerminated} onChange={e => setIncludeTerminated(e.target.checked)} />
              종료 (Z) 포함
            </label>
            <button
              style={{ ...BTN.md, background: COLORS.primary, color: '#fff', width: '100%' }}
              onClick={runFetch}
              disabled={fetching}
            >
              {fetching ? '가져오는 중…' : '📥 카페24 pmcfactm'}
            </button>
            {fetchResult && (
              <div style={{ marginTop: 8, padding: 6, background: COLORS.bgGreen, borderRadius: 4, fontSize: 11, color: COLORS.success }}>
                ✓ fetched <b>{fetchResult.fetched}</b> / inserted <b>{fetchResult.inserted}</b>
              </div>
            )}
            {snapshotsBatch && snapshotsBatch.batch && (
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 6 }}>
                batch <code>{snapshotsBatch.batch.slice(0, 8)}</code> · {snapshotsBatch.count}건
                <br />
                {snapshotsBatch.fetched_at?.substring(0, 19)}
              </div>
            )}
          </div>

          {/* Step 2 검색 */}
          <div style={{ ...GLASS.L4, padding: 12, borderRadius: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>2️⃣ 검토 + 선택 ({selected.size}건)</div>
            <input
              type="text"
              placeholder="공장명/주소/사업자..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') fetchSnapshots()
              }}
              style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.05)', width: '100%', fontSize: 11 }}
            />
            <button
              style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', width: '100%', marginTop: 6 }}
              onClick={() => fetchSnapshots()}
            >
              검색
            </button>
          </div>

          {/* Step 3 정제 + 등록 */}
          <div style={{ ...GLASS.L4, padding: 12, borderRadius: 12, border: `1px solid ${COLORS.borderGreen}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>3️⃣ 정제 + DB 등록</div>
            <label style={{ fontSize: 11, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <input type="checkbox" checked={cleanName} onChange={e => setCleanName(e.target.checked)} />
              자동 이름 정제
            </label>
            <input
              type="text"
              placeholder="기본 그룹 라벨"
              value={defaultGroup}
              onChange={e => setDefaultGroup(e.target.value)}
              style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.05)', width: '100%', fontSize: 11, marginBottom: 6 }}
            />
            <button
              style={{
                ...BTN.md,
                background: COLORS.success,
                color: '#fff',
                width: '100%',
                opacity: selected.size === 0 ? 0.5 : 1,
              }}
              onClick={runPromote}
              disabled={promoting || selected.size === 0}
            >
              {promoting ? '등록 중…' : `💾 ${selected.size}건 등록`}
            </button>
            {promoteResult && (
              <div style={{ marginTop: 8, padding: 8, background: COLORS.bgGreen, borderRadius: 6, fontSize: 11 }}>
                <div style={{ fontWeight: 700, color: COLORS.success, marginBottom: 4 }}>✅ 등록 완료</div>
                <div>요청 <b>{promoteResult.requested}</b> / 등록 <b style={{ color: COLORS.success }}>{promoteResult.promoted}</b></div>
                <div>중복 skip <b style={{ color: COLORS.warning }}>{promoteResult.skipped}</b></div>
                {promoteResult.errors > 0 && (
                  <div style={{ color: COLORS.danger }}>
                    에러 <b>{promoteResult.errors}</b>
                    <ul style={{ margin: '4px 0 0 12px', padding: 0, fontSize: 10 }}>
                      {promoteResult.errorList.slice(0, 3).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── 우측 데이터 패널 ─── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 우측 탭 헤더 */}
          <div style={{ ...GLASS.L4, padding: '8px 12px', borderRadius: 12, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12,
                background: rightTab === 'snapshot' ? COLORS.primary : 'rgba(255,255,255,0.50)',
                color: rightTab === 'snapshot' ? '#fff' : COLORS.textSecondary,
              }}
              onClick={() => setRightTab('snapshot')}
            >
              📥 카페24 snapshot ({snapshotsLoading ? '…' : snapshots.length})
            </button>
            <button
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12,
                background: rightTab === 'partners' ? COLORS.primary : 'rgba(255,255,255,0.50)',
                color: rightTab === 'partners' ? '#fff' : COLORS.textSecondary,
              }}
              onClick={() => setRightTab('partners')}
            >
              📋 등록된 운영 공장 ({partnersLoading ? '…' : partners.length})
            </button>
          </div>

          {/* 우측 데이터 */}
          {/* PR-6.12.d — stats mode 안내 */}
          {statsMode === 'simple' && (
            <div style={{ fontSize: 11, color: COLORS.warning, padding: '4px 8px', background: COLORS.bgAmber, borderRadius: 6 }}>
              ⚠ 카페24 join 권한 제한 — 차량/고객 detail 일부 미노출 (배정건수만 표시)
            </div>
          )}
          {statsMode === 'empty' && (
            <div style={{ fontSize: 11, color: COLORS.danger, padding: '4px 8px', background: COLORS.bgRed, borderRadius: 6 }}>
              ⚠ 카페24 ajaoderh 접근 실패 — 배정 통계 미노출
            </div>
          )}

          {rightTab === 'snapshot' ? (
            <div style={{ ...GLASS.L4, padding: 12, borderRadius: 12 }}>
              <NeuDataTable
                columns={snapshotCols}
                data={snapshots}
                rowKey={r => r.id}
                defaultSort={{ key: 'factcode', dir: 'asc' }}
                emptyMessage="snapshot 없음 — 좌측 [📥 카페24 pmcfactm] 클릭"
              />
            </div>
          ) : (
            <div style={{ ...GLASS.L4, padding: 12, borderRadius: 12 }}>
              <NeuDataTable
                columns={partnerCols}
                data={partners}
                rowKey={r => r.id}
                defaultSort={{ key: 'name', dir: 'asc' }}
                emptyMessage="등록된 공장 없음 — snapshot 선택 후 좌측 [💾 N건 등록]"
              />
            </div>
          )}
        </div>
      </div>

      {/* PR-6.12.d — 공장별 배정 차량 drawer */}
      {vehicleDrawer && (
        <div
          onClick={() => setVehicleDrawer(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15,23,42,0.32)',
            backdropFilter: 'blur(2px)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              ...GLASS.L4,
              width: 720,
              maxWidth: '100vw',
              height: '100vh',
              overflow: 'auto',
              padding: '20px 24px',
              boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${COLORS.borderSubtle}` }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>🏭 {vehicleDrawer.factname}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                  factcode <code>{vehicleDrawer.factcode}</code> · 배정 차량 {vehicles.length}건
                </div>
              </div>
              <button style={{ ...BTN.sm, background: 'transparent', color: COLORS.textMuted }} onClick={() => setVehicleDrawer(null)}>
                × 닫기
              </button>
            </div>
            {vehiclesLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중…</div>
            ) : vehicles.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>배정 차량 없음</div>
            ) : (
              <div style={{ overflow: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                  <thead style={{ background: 'rgba(0,0,0,0.04)', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${COLORS.borderSubtle}` }}>차량번호</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${COLORS.borderSubtle}` }}>차종</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${COLORS.borderSubtle}` }}>고객사</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${COLORS.borderSubtle}` }}>배정일</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${COLORS.borderSubtle}` }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v, i) => (
                      <tr key={i}>
                        <td style={{ padding: '4px 8px', fontWeight: 600, borderBottom: '1px solid rgba(0,0,0,0.04)', whiteSpace: 'nowrap' }}>
                          {v.car_number || '-'}
                        </td>
                        <td style={{ padding: '4px 8px', fontSize: 11, borderBottom: '1px solid rgba(0,0,0,0.04)', whiteSpace: 'nowrap' }}>
                          {clip(v.car_model, 22)}
                        </td>
                        <td style={{ padding: '4px 8px', fontSize: 11, borderBottom: '1px solid rgba(0,0,0,0.04)', whiteSpace: 'nowrap' }}>
                          {clip(v.customer, 24)}
                        </td>
                        <td style={{ padding: '4px 8px', fontSize: 11, borderBottom: '1px solid rgba(0,0,0,0.04)', whiteSpace: 'nowrap' }}>
                          {v.assigned_date && v.assigned_date.length >= 8
                            ? `${v.assigned_date.slice(0, 4)}-${v.assigned_date.slice(4, 6)}-${v.assigned_date.slice(6, 8)}`
                            : v.assigned_date || '-'}
                        </td>
                        <td style={{ padding: '4px 8px', fontSize: 11, borderBottom: '1px solid rgba(0,0,0,0.04)', whiteSpace: 'nowrap' }}>
                          {v.oderstat || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

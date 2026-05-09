'use client'

/**
 * /factory-search/cafe24-import
 *
 * 카페24 pmcfactm 가져오기 → 검토 → 정제 → 자체 DB 등록
 *
 * PR-6.12.b
 *
 * 흐름:
 *   1. [📥 카페24 가져오기] 버튼 → POST /api/factory-cafe24-snapshots
 *      → 카페24 fetch + raw 적재 (batch UUID)
 *   2. 가장 최근 batch 의 snapshot 목록 노출 (검색 + 필터)
 *   3. 사용자 row 선택 (체크박스) + 정제 옵션
 *   4. [💾 선택 N건 DB 등록] → POST /api/partner-factories/promote
 *   5. 결과 통계 + 등록된 partner_factories 목록 표시
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

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

export default function Cafe24ImportPage() {
  const [user, setUser] = useState<{ role?: string; id?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  // 가져오기 상태
  const [fetching, setFetching] = useState(false)
  const [includeTerminated, setIncludeTerminated] = useState(false)
  const [fetchResult, setFetchResult] = useState<{ batch: string; fetched: number; inserted: number; fetched_at: string } | null>(null)

  // snapshot 목록
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [snapshotsBatch, setSnapshotsBatch] = useState<{ batch: string | null; count: number; fetched_at: string | null } | null>(null)
  const [search, setSearch] = useState('')

  // 선택 상태 (체크박스)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // 정제 옵션
  const [cleanName, setCleanName] = useState(true)
  const [defaultGroup, setDefaultGroup] = useState('')

  // 등록 결과
  const [promoting, setPromoting] = useState(false)
  const [promoteResult, setPromoteResult] = useState<{ requested: number; found: number; promoted: number; skipped: number; errors: number; errorList: string[] } | null>(null)

  // 등록된 partner 목록
  const [partners, setPartners] = useState<PartnerFactory[]>([])
  const [partnersLoading, setPartnersLoading] = useState(false)

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

  useEffect(() => {
    if (!authChecked || user?.role !== 'admin') return
    fetchSnapshots()
    fetchPartners()
  }, [authChecked, user, fetchSnapshots, fetchPartners])

  if (!authChecked) return <div style={{ padding: 24, color: COLORS.textSecondary }}>인증 확인 중…</div>
  if (user?.role !== 'admin')
    return <div style={{ padding: 24, color: COLORS.danger }}>⚠ 관리자 권한 필요</div>

  // ─── 카페24 가져오기 ──────────────────────────────────────────
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

  // ─── 일괄 등록 ───────────────────────────────────────────────
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

  // ─── 컬럼 정의 ────────────────────────────────────────────────
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
  ]

  return (
    <div style={{ padding: 16, maxWidth: 1600, margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ ...GLASS.L5, padding: '16px 20px', borderRadius: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary }}>
          🏭 카페24 공장 가져오기 → 정제 → DB 등록
        </div>
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
          카페24 pmcfactm 전체 가져오기 (raw snapshot) → 검토 / 선택 → 정제 (이름·지역 자동) → 자체 DB 등록
        </div>
      </div>

      {/* Step 1 — 카페24 가져오기 */}
      <div style={{ ...GLASS.L4, padding: 16, borderRadius: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>1️⃣ 카페24 가져오기 (raw snapshot)</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={includeTerminated}
              onChange={e => setIncludeTerminated(e.target.checked)}
            />
            종료 공장 (facttype=Z) 포함
          </label>
          <button
            style={{ ...BTN.md, background: COLORS.primary, color: '#fff' }}
            onClick={runFetch}
            disabled={fetching}
          >
            {fetching ? '가져오는 중…' : '📥 카페24 pmcfactm 가져오기'}
          </button>
          {snapshotsBatch && snapshotsBatch.batch && (
            <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 'auto' }}>
              현재 batch: <code style={{ fontSize: 10 }}>{snapshotsBatch.batch.slice(0, 8)}…</code> · {snapshotsBatch.count}건 · {snapshotsBatch.fetched_at?.substring(0, 19)}
            </span>
          )}
        </div>
        {fetchResult && (
          <div style={{ marginTop: 8, padding: 8, background: COLORS.bgGreen, borderRadius: 6, fontSize: 12, color: COLORS.success }}>
            ✅ 가져오기 완료 — fetched <b>{fetchResult.fetched}</b> / inserted <b>{fetchResult.inserted}</b>
          </div>
        )}
      </div>

      {/* Step 2 — snapshot 검토 + 선택 */}
      <div style={{ ...GLASS.L4, padding: 16, borderRadius: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>2️⃣ 검토 + 선택</span>
          <input
            type="text"
            placeholder="공장명 / 주소 / 사업자번호..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') fetchSnapshots()
            }}
            style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)', minWidth: 240 }}
          />
          <button
            style={{ ...BTN.sm, background: COLORS.primary, color: '#fff' }}
            onClick={() => fetchSnapshots()}
          >
            검색
          </button>
          <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 'auto' }}>
            {snapshotsLoading ? '로딩…' : `${snapshots.length}건 · ${selected.size}건 선택`}
          </span>
        </div>
        <NeuDataTable
          columns={snapshotCols}
          data={snapshots}
          rowKey={r => r.id}
          defaultSort={{ key: 'factcode', dir: 'asc' }}
          emptyMessage="snapshot 없음 — 위 [📥 카페24 가져오기] 실행"
        />
      </div>

      {/* Step 3 — 정제 옵션 + 등록 */}
      <div style={{ ...GLASS.L4, padding: 16, borderRadius: 16, marginBottom: 16, border: `1px solid ${COLORS.borderGreen}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>3️⃣ 정제 + DB 등록 ({selected.size}건 선택)</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={cleanName} onChange={e => setCleanName(e.target.checked)} />
            자동 이름 정제 ((주)/㈜/주식회사 제거 + 공백)
          </label>
          <input
            type="text"
            placeholder="기본 그룹 라벨 (선택, 모든 row 적용)"
            value={defaultGroup}
            onChange={e => setDefaultGroup(e.target.value)}
            style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)', minWidth: 220 }}
          />
          <button
            style={{
              ...BTN.md,
              background: COLORS.success,
              color: '#fff',
              opacity: selected.size === 0 ? 0.5 : 1,
              marginLeft: 'auto',
            }}
            onClick={runPromote}
            disabled={promoting || selected.size === 0}
          >
            {promoting ? '등록 중…' : `💾 선택 ${selected.size}건 DB 등록`}
          </button>
        </div>
        {promoteResult && (
          <div style={{ marginTop: 12, padding: 12, background: COLORS.bgGreen, borderRadius: 8, border: `1px solid ${COLORS.borderGreen}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.success, marginBottom: 4 }}>
              ✅ 등록 완료
            </div>
            <div style={{ fontSize: 11, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>요청 <b>{promoteResult.requested}</b></span>
              <span style={{ color: COLORS.success }}>등록 <b>{promoteResult.promoted}</b></span>
              <span style={{ color: COLORS.warning }}>중복 skip <b>{promoteResult.skipped}</b></span>
              {promoteResult.errors > 0 && (
                <span style={{ color: COLORS.danger }}>에러 <b>{promoteResult.errors}</b></span>
              )}
            </div>
            {promoteResult.errorList.length > 0 && (
              <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: 10, color: COLORS.danger }}>
                {promoteResult.errorList.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Step 4 — 등록된 partner_factories 목록 */}
      <div style={{ ...GLASS.L4, padding: 16, borderRadius: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>📋 등록된 운영 공장 목록</span>
          <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 'auto' }}>
            {partnersLoading ? '로딩…' : `${partners.length}건`}
          </span>
        </div>
        <NeuDataTable
          columns={partnerCols}
          data={partners}
          rowKey={r => r.id}
          defaultSort={{ key: 'name', dir: 'asc' }}
          emptyMessage="등록된 공장 없음 — 위에서 [DB 등록] 실행"
        />
      </div>
    </div>
  )
}

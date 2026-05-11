'use client'

/**
 * /RideMTOps/chargers — MT팀 충전기 (카페24 read)
 *
 * 카페24 pluglink_charger + pluglink_charger_station
 *
 * PR-6.14.a
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import MTOpsNavTabs from '@/app/components/ride-mt-ops/NavTabs'

interface ChargerRow {
  id: number | string
  project_id: number | string | null
  model: string | null
  charger_number: string | null
  pluglink_id: string | null
  station_id: number | string | null
  station_name: string | null
  address: string | null
}

function clip(s: string | null | undefined, n = 30): string {
  if (!s) return ''
  return s.length > n ? s.substring(0, n) + '…' : s
}

export default function ChargersPage() {
  const [user, setUser] = useState<{ role?: string; id?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const [rows, setRows] = useState<ChargerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<string | null>(null)

  useEffect(() => {
    setUser(getStoredUser())
    setAuthChecked(true)
  }, [])

  const fetchRows = useMemo(
    () =>
      async function () {
        setLoading(true)
        setError(null)
        try {
          const token = getStoredToken()
          const params = new URLSearchParams()
          if (search.trim()) params.set('q', search.trim())
          const res = await fetch(`/api/cafe24/chargers?${params}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          if (!res.ok || !json.success) {
            setError(json.error || `HTTP ${res.status}`)
            setRows([])
          } else {
            setRows(json.data || [])
            setMode(json.meta?.mode || null)
          }
        } catch (e) {
          setError(String(e))
        } finally {
          setLoading(false)
        }
      },
    [search]
  )

  useEffect(() => {
    if (!authChecked) return
    fetchRows()
  }, [authChecked, fetchRows])

  const cols: TableColumn<ChargerRow>[] = [
    {
      key: 'charger_number',
      label: '충전기 번호',
      sortBy: r => r.charger_number || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: 700 }}>{r.charger_number || '-'}</span>,
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
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 10, fontFamily: 'monospace', color: COLORS.textMuted }}>{r.pluglink_id || '-'}</span>,
    },
    {
      key: 'project_id',
      label: 'project',
      sortBy: r => String(r.project_id || ''),
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 10, color: COLORS.textMuted }}>{r.project_id || '-'}</span>,
    },
  ]

  if (!authChecked) return <div style={{ padding: 24, color: COLORS.textSecondary }}>인증 확인 중…</div>

  return (
    <>
      <MTOpsNavTabs />
      <div style={{ padding: 16, maxWidth: 1700, margin: '0 auto' }}>
        <div style={{ ...GLASS.L4, padding: 12, borderRadius: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="충전기 번호 / 개소명 / 주소 / 모델..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') fetchRows()
              }}
              style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)', minWidth: 280 }}
            />
            <button style={{ ...BTN.sm, background: COLORS.primary, color: '#fff' }} onClick={fetchRows}>
              검색
            </button>
            <span style={{ color: COLORS.textMuted, fontSize: 12, marginLeft: 'auto' }}>
              {loading ? '로딩 중…' : `${rows.length}건`}
              {mode === 'simple' && <span style={{ color: COLORS.warning, marginLeft: 6 }}>· enrichment 제한</span>}
              {mode === 'empty' && <span style={{ color: COLORS.danger, marginLeft: 6 }}>· 데이터 미수신</span>}
            </span>
          </div>
        </div>
        <div style={{ ...GLASS.L4, padding: 12, borderRadius: 12 }}>
          {error && (
            <div style={{ padding: 8, background: COLORS.bgRed, color: COLORS.danger, borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
              ❌ {error}
            </div>
          )}
          <NeuDataTable
            columns={cols}
            data={rows}
            rowKey={r => String(r.id)}
            defaultSort={{ key: 'charger_number', dir: 'asc' }}
            emptyMessage="충전기 없음 — 카페24 read"
          />
        </div>
      </div>
    </>
  )
}

'use client'

/**
 * /RideMTOps/maintenance-tours — MT팀 순회정비
 *
 * 카페24 pieclbsm + pmccarsm (순회 정비 가설 — 사용자 검수 후 정정)
 *
 * PR-6.14.a
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import MTOpsNavTabs from '@/app/components/ride-mt-ops/NavTabs'

interface TourRow {
  clbsidno: string
  clbsmddt: string
  clbssrno: number
  clbsseqn: number
  clbsmetp: string | null
  clbsfact: string | null
  clbsdvdt: string | null
  clbsacdt: string | null
  clbskilo: number | null
  cars_no: string | null
  cars_model: string | null
  cars_user: string | null
}

function fmtDate8(d: string | null | undefined): string {
  if (!d || d.length < 8) return d || '-'
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

function clip(s: string | null | undefined, n = 30): string {
  if (!s) return ''
  return s.length > n ? s.substring(0, n) + '…' : s
}

export default function MaintenanceToursPage() {
  const [user, setUser] = useState<{ role?: string; id?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const [rows, setRows] = useState<TourRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

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
          const res = await fetch(`/api/cafe24/maintenance-tours?${params}`, {
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
            setNote(json.meta?.note || null)
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

  const cols: TableColumn<TourRow>[] = [
    { key: 'clbsmddt', label: '접수일', sortBy: r => r.clbsmddt || '', render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtDate8(r.clbsmddt)}</span> },
    { key: 'cars_no', label: '차량번호', sortBy: r => r.cars_no || '', render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{r.cars_no || '-'}</span> },
    { key: 'cars_model', label: '차종', sortBy: r => r.cars_model || '', render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{clip(r.cars_model, 24)}</span> },
    { key: 'cars_user', label: '고객', sortBy: r => r.cars_user || '', render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{clip(r.cars_user, 16)}</span> },
    { key: 'clbsmetp', label: '정비 종류', sortBy: r => r.clbsmetp || '', render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.clbsmetp || '-'}</span> },
    { key: 'clbsfact', label: '정비공장', sortBy: r => r.clbsfact || '', render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{clip(r.clbsfact, 18)}</span> },
    { key: 'clbsdvdt', label: '출고일', sortBy: r => r.clbsdvdt || '', render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{fmtDate8(r.clbsdvdt)}</span> },
    { key: 'clbskilo', label: '마일리지', align: 'right', sortBy: r => Number(r.clbskilo || 0), render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.clbskilo?.toLocaleString() || '-'}</span> },
  ]

  if (!authChecked) return <div style={{ padding: 24, color: COLORS.textSecondary }}>인증 확인 중…</div>

  return (
    <>
      <MTOpsNavTabs />
      <div style={{ padding: 16, maxWidth: 1700, margin: '0 auto' }}>
        {note && (
          <div style={{ padding: 8, background: COLORS.bgAmber, color: COLORS.warning, borderRadius: 8, marginBottom: 8, fontSize: 11 }}>
            ⚠ {note}
          </div>
        )}
        <div style={{ ...GLASS.L4, padding: 12, borderRadius: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="차량번호 / 차종..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') fetchRows()
              }}
              style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)', minWidth: 240 }}
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
            rowKey={r => `${r.clbsidno}-${r.clbsmddt}-${r.clbssrno}-${r.clbsseqn}`}
            defaultSort={{ key: 'clbsmddt', dir: 'desc' }}
            emptyMessage="순회정비 내역 없음 — 가설 SQL 검수 필요"
          />
        </div>
      </div>
    </>
  )
}

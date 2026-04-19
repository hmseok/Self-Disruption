'use client'

import { useEffect, useState } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'

/**
 * 차량시세 (vehicle_market_price) 탭 — 3-column 비교 뷰
 *
 * Column 1: 외부시세 (크롤러/수동, market_price)
 * Column 2: 자체 매입가 평균 (cars.purchase_price AVG, ownership_type='company')
 * Column 3: 블렌드 결과 (외부 × DEP_MARKET_PRICE_WEIGHT + 매입가 × DEP_CURVE_WEIGHT)
 *
 * rent-calc-engine v2.1이 참조하는 감가 계산 마스터 기준표.
 */

interface MarketPriceRow {
  id: number
  brand: string
  model: string
  trim_name: string | null
  year: number
  fuel_type: string
  origin: string
  vehicle_class: string | null
  mileage_km: number | null
  market_price: number
  min_price: number | null
  max_price: number | null
  sample_count: number
  source_site: string
  source_url: string | null
  crawled_at: string
  note: string | null
  // comparison 전용
  fleet_count?: number
  avg_purchase_price?: number
  min_purchase_price?: number
  max_purchase_price?: number
  blended_price?: number
  deviation_pct?: number | null
}

interface Weights {
  market: number
  curve: number
}

const FUEL_TYPES = ['가솔린', '디젤', '하이브리드', '전기', 'LPG']
const ORIGINS = ['국산', '수입']
const VEHICLE_CLASSES = ['경형', '소형', '중형', '대형']

const glass = {
  level4: { background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 16, boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' },
  level3Blue:   { background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(191,219,254,0.80)',  borderRadius: 14 },
  level3Green:  { background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(187,247,208,0.80)',  borderRadius: 14 },
  level3Violet: { background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(221,214,254,0.80)',  borderRadius: 14 },
  level3Amber:  { background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(253,230,138,0.80)',  borderRadius: 14 },
  input: {
    background: 'rgba(255,255,255,0.40)',
    border: '1px solid rgba(0,0,0,0.05)',
    boxShadow: 'inset 2px 2px 4px rgba(140,170,210,0.08), inset -1px -1px 2px rgba(255,255,255,0.5)',
    borderRadius: 10, padding: '6px 10px', fontSize: 12,
  },
} as const

export default function MarketPriceTab() {
  const [rows, setRows] = useState<MarketPriceRow[]>([])
  const [weights, setWeights] = useState<Weights>({ market: 0.7, curve: 0.3 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newRow, setNewRow] = useState<Partial<MarketPriceRow>>({
    year: 2025, fuel_type: '가솔린', origin: '국산', vehicle_class: '중형', sample_count: 1, source_site: 'manual',
  })

  async function load() {
    setLoading(true); setError(null)
    try {
      // mode=comparison → 3-column 통합 조회
      // api-client는 json.data만 풀어 반환하므로 weights는 raw fetch로 별도 조회
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('fmi_token') : null
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch('/api/vehicle-market-prices?mode=comparison', { headers })
      const json = await res.json().catch(() => ({ data: [] }))
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setRows(Array.isArray(json.data) ? json.data : [])
      if (json.weights) setWeights(json.weights)
    } catch (e: any) {
      setError(e?.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSave(row: MarketPriceRow, patch: Partial<MarketPriceRow>) {
    try {
      await apiPatch(`/api/vehicle-market-prices?id=${row.id}`, patch)
      setEditingId(null)
      await load()
    } catch (e: any) {
      alert('저장 실패: ' + (e?.message || e))
    }
  }

  async function handleDelete(row: MarketPriceRow) {
    if (!confirm(`${row.brand} ${row.model} ${row.year} 시세를 비활성화하시겠습니까?`)) return
    try {
      await apiDelete(`/api/vehicle-market-prices?id=${row.id}`)
      await load()
    } catch (e: any) {
      alert('삭제 실패: ' + (e?.message || e))
    }
  }

  async function handleAdd() {
    try {
      if (!newRow.brand || !newRow.model || !newRow.year || !newRow.market_price) {
        alert('브랜드/모델/연식/시세 필수')
        return
      }
      await apiPost('/api/vehicle-market-prices', newRow)
      setShowAddForm(false)
      setNewRow({ year: 2025, fuel_type: '가솔린', origin: '국산', vehicle_class: '중형', sample_count: 1, source_site: 'manual' })
      await load()
    } catch (e: any) {
      alert('등록 실패: ' + (e?.message || e))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 헤더 + 가이드 */}
      <div style={{ ...glass.level4, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>🚗 차량시세 기준표</h2>
            <p style={{ fontSize: 12, color: '#64748b' }}>
              외부시세(크롤러) + 자체 매입가 = 감가 계산 기준. 블렌드 가중치{' '}
              <b>외부 {(weights.market * 100).toFixed(0)}% / 매입가 {(weights.curve * 100).toFixed(0)}%</b>
              {' '}(business_rules)
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(v => !v)}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 700, borderRadius: 10,
              border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.12)', color: '#2563eb',
              cursor: 'pointer',
            }}
          >
            {showAddForm ? '취소' : '＋ 시세 추가'}
          </button>
        </div>

        {/* 3-column 해설 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
          <div style={{ ...glass.level3Blue, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', marginBottom: 4 }}>① 외부시세</div>
            <div style={{ fontSize: 11, color: '#1e3a8a', lineHeight: 1.5 }}>엔카·KB차차차 등 중고차 시장가. 크롤러가 월 1회 갱신 (초기 시드는 매입가).</div>
          </div>
          <div style={{ ...glass.level3Green, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#047857', marginBottom: 4 }}>② 자체 매입가 평균</div>
            <div style={{ fontSize: 11, color: '#065f46', lineHeight: 1.5 }}>자체 보유 차량(ownership_type=company)의 실제 매입가 AVG — 실판매 근거.</div>
          </div>
          <div style={{ ...glass.level3Violet, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#6d28d9', marginBottom: 4 }}>③ 블렌드 결과</div>
            <div style={{ fontSize: 11, color: '#5b21b6', lineHeight: 1.5 }}>① × {(weights.market * 100).toFixed(0)}% + ② × {(weights.curve * 100).toFixed(0)}% → rent-calc-engine 감가 기준.</div>
          </div>
        </div>
      </div>

      {/* 신규 입력 폼 */}
      {showAddForm && (
        <div style={{ ...glass.level4, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>신규 시세 등록</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <input placeholder="브랜드 (예: BMW)"  value={newRow.brand || ''}  onChange={e => setNewRow(r => ({ ...r, brand: e.target.value }))} style={glass.input} />
            <input placeholder="모델 (예: M2)"    value={newRow.model || ''}  onChange={e => setNewRow(r => ({ ...r, model: e.target.value }))} style={glass.input} />
            <input placeholder="트림 (선택)"       value={newRow.trim_name || ''} onChange={e => setNewRow(r => ({ ...r, trim_name: e.target.value }))} style={glass.input} />
            <input type="number" placeholder="연식"  value={newRow.year || ''}   onChange={e => setNewRow(r => ({ ...r, year: Number(e.target.value) }))} style={glass.input} />
            <select value={newRow.fuel_type || '가솔린'} onChange={e => setNewRow(r => ({ ...r, fuel_type: e.target.value }))} style={glass.input}>
              {FUEL_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={newRow.origin || '국산'} onChange={e => setNewRow(r => ({ ...r, origin: e.target.value }))} style={glass.input}>
              {ORIGINS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={newRow.vehicle_class || '중형'} onChange={e => setNewRow(r => ({ ...r, vehicle_class: e.target.value }))} style={glass.input}>
              {VEHICLE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" placeholder="시세(원)" value={newRow.market_price || ''} onChange={e => setNewRow(r => ({ ...r, market_price: Number(e.target.value) }))} style={glass.input} />
            <input type="number" placeholder="주행거리(km)" value={newRow.mileage_km || 0} onChange={e => setNewRow(r => ({ ...r, mileage_km: Number(e.target.value) }))} style={glass.input} />
            <input placeholder="출처 (예: 엔카)" value={newRow.source_site || ''} onChange={e => setNewRow(r => ({ ...r, source_site: e.target.value }))} style={glass.input} />
            <input placeholder="메모 (선택)" value={newRow.note || ''} onChange={e => setNewRow(r => ({ ...r, note: e.target.value }))} style={glass.input} />
            <button onClick={handleAdd} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, borderRadius: 10, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.15)', color: '#047857', cursor: 'pointer' }}>저장</button>
          </div>
        </div>
      )}

      {/* 3-column 테이블 */}
      <div style={{ ...glass.level4, padding: 16, overflow: 'hidden' }}>
        {loading && <p style={{ color: '#64748b', fontSize: 12, padding: 12 }}>로딩 중...</p>}
        {error && <p style={{ color: '#dc2626', fontSize: 12, padding: 12 }}>❌ {error}</p>}

        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: 'rgba(241,245,249,0.8)' }}>
                  <th style={thStyle}>브랜드</th>
                  <th style={thStyle}>모델</th>
                  <th style={thStyle}>연식</th>
                  <th style={thStyle}>연료</th>
                  <th style={{ ...thStyle, background: 'rgba(219,234,254,0.6)' }}>① 외부시세</th>
                  <th style={thStyle}>(샘플)</th>
                  <th style={{ ...thStyle, background: 'rgba(220,252,231,0.6)' }}>② 매입가 평균</th>
                  <th style={thStyle}>(자체 대수)</th>
                  <th style={{ ...thStyle, background: 'rgba(237,233,254,0.6)' }}>③ 블렌드</th>
                  <th style={thStyle}>편차</th>
                  <th style={thStyle}>출처</th>
                  <th style={thStyle}>작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={12} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>등록된 시세가 없습니다.</td></tr>
                )}
                {rows.map((row) => (
                  <MarketPriceRowView
                    key={row.id}
                    row={row}
                    editing={editingId === row.id}
                    onEdit={() => setEditingId(row.id)}
                    onCancel={() => setEditingId(null)}
                    onSave={(patch) => handleSave(row, patch)}
                    onDelete={() => handleDelete(row)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 서브 컴포넌트 ──────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 11,
  fontWeight: 700,
  color: '#475569',
  textAlign: 'left',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '9px 8px',
  borderBottom: '1px solid rgba(0,0,0,0.03)',
  fontSize: 12,
  color: '#334155',
}

function MarketPriceRowView({
  row, editing, onEdit, onCancel, onSave, onDelete,
}: {
  row: MarketPriceRow
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (patch: Partial<MarketPriceRow>) => void
  onDelete: () => void
}) {
  const [val, setVal] = useState<number>(row.market_price)
  useEffect(() => { setVal(row.market_price) }, [row.market_price, editing])

  const hasPurchase = (row.fleet_count ?? 0) > 0
  const deviationColor = row.deviation_pct === null || row.deviation_pct === undefined
    ? '#94a3b8'
    : Math.abs(row.deviation_pct) < 5
      ? '#16a34a'
      : Math.abs(row.deviation_pct) < 15
        ? '#d97706'
        : '#dc2626'

  return (
    <tr style={{ transition: 'background 0.15s' }}>
      <td style={tdStyle}><b>{row.brand}</b></td>
      <td style={tdStyle}>{row.model}{row.trim_name ? ` (${row.trim_name})` : ''}</td>
      <td style={tdStyle}>{row.year}</td>
      <td style={tdStyle}>{row.fuel_type}</td>
      <td style={{ ...tdStyle, background: 'rgba(239,246,255,0.4)', fontWeight: 700, color: '#1d4ed8' }}>
        {editing ? (
          <input
            type="number"
            value={val}
            onChange={e => setVal(Number(e.target.value))}
            style={{ width: 120, padding: '4px 8px', border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6, fontSize: 12, background: 'rgba(255,255,255,0.7)' }}
          />
        ) : (
          Number(row.market_price).toLocaleString() + '원'
        )}
      </td>
      <td style={{ ...tdStyle, color: '#64748b', fontSize: 11 }}>n={row.sample_count}</td>
      <td style={{ ...tdStyle, background: 'rgba(240,253,244,0.4)', fontWeight: 700, color: hasPurchase ? '#047857' : '#94a3b8' }}>
        {hasPurchase ? Number(row.avg_purchase_price || 0).toLocaleString() + '원' : '—'}
      </td>
      <td style={{ ...tdStyle, color: '#64748b', fontSize: 11 }}>
        {hasPurchase ? `${row.fleet_count}대` : '—'}
      </td>
      <td style={{ ...tdStyle, background: 'rgba(245,243,255,0.4)', fontWeight: 800, color: '#6d28d9' }}>
        {Number(row.blended_price || 0).toLocaleString()}원
      </td>
      <td style={{ ...tdStyle, color: deviationColor, fontWeight: 700 }}>
        {row.deviation_pct === null || row.deviation_pct === undefined ? '—' : `${row.deviation_pct > 0 ? '+' : ''}${row.deviation_pct}%`}
      </td>
      <td style={{ ...tdStyle, fontSize: 11, color: '#64748b' }}>
        {row.source_site}
        <br />
        <span style={{ fontSize: 10, color: '#94a3b8' }}>
          {row.crawled_at ? new Date(row.crawled_at).toLocaleDateString('ko-KR') : ''}
        </span>
      </td>
      <td style={tdStyle}>
        {editing ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onSave({ market_price: val })} style={btnStylePrimary}>저장</button>
            <button onClick={onCancel} style={btnStyleGhost}>취소</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onEdit} style={btnStyleGhost}>수정</button>
            <button onClick={onDelete} style={btnStyleDanger}>삭제</button>
          </div>
        )}
      </td>
    </tr>
  )
}

const btnStylePrimary: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 8,
  border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.15)', color: '#047857',
  cursor: 'pointer',
}
const btnStyleGhost: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.6)', color: '#475569',
  cursor: 'pointer',
}
const btnStyleDanger: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 8,
  border: '1px solid rgba(239,68,68,0.30)', background: 'rgba(254,226,226,0.6)', color: '#dc2626',
  cursor: 'pointer',
}

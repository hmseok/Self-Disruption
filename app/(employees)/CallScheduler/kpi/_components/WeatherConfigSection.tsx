'use client'
// ═══════════════════════════════════════════════════════════════════
// WeatherConfigSection — KPI 설정 ⑤ 「⛅ 날씨 기준」 (Phase W-1d)
//   설계서: _docs/WEATHER-STAFFING-DESIGN.md §4-1
//
//   구성:
//     · OpenWeather 키 상태 + 마지막 fetch 시각
//     · 권역 테이블 — 추가/수정/삭제, weight_pct 합 100 라이브 검증
//     · 보정율 룰 테이블 — 추가/수정/삭제
//
//   API:
//     GET    /api/call-scheduler/kpi/weather/regions?include_inactive=1
//     POST   /api/call-scheduler/kpi/weather/regions    body { regions: [...] }
//     DELETE /api/call-scheduler/kpi/weather/regions?id=
//     GET    /api/call-scheduler/kpi/weather/factors
//     POST   /api/call-scheduler/kpi/weather/factors    body { factors: [...] }
//     DELETE /api/call-scheduler/kpi/weather/factors?id=
//     GET    /api/call-scheduler/kpi/weather  (키 상태 + 캐시 시각)
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

interface RegionRow {
  id: string
  code: string
  label: string
  lat: number
  lon: number
  weight_pct: number
  sort_order: number
  is_active: boolean
  _isNew?: boolean
}
interface FactorRow {
  id: string
  condition_key: string
  label: string
  factor: number
  openweather_codes: string
  sort_order: number
  _isNew?: boolean
}
interface WeatherStatus {
  api_key_set: boolean
  last_fetched_at: string | null
}
interface SaveResult {
  ok: boolean
  text: string
  detail?: string
  at: string
}

const nowLabel = () =>
  new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

const newPlaceholderId = () =>
  `new-${Math.random().toString(36).slice(2, 10)}`

export default function WeatherConfigSection() {
  const [regions, setRegions] = useState<RegionRow[]>([])
  const [factors, setFactors] = useState<FactorRow[]>([])
  const [status, setStatus] = useState<WeatherStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingR, setSavingR] = useState(false)
  const [savingF, setSavingF] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)
  const [deletedRegionIds, setDeletedRegionIds] = useState<Set<string>>(new Set())
  const [deletedFactorIds, setDeletedFactorIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const auth = await getAuthHeader()
      const [rRes, fRes, wRes] = await Promise.all([
        fetch('/api/call-scheduler/kpi/weather/regions?include_inactive=1',
          { headers: auth }),
        fetch('/api/call-scheduler/kpi/weather/factors', { headers: auth }),
        fetch('/api/call-scheduler/kpi/weather', { headers: auth }),
      ])
      const rJ = await rRes.json()
      const fJ = await fRes.json()
      const wJ = wRes.ok ? await wRes.json() : { data: null }
      if (!rRes.ok) throw new Error(rJ?.error || '권역 조회 실패')
      if (!fRes.ok) throw new Error(fJ?.error || '룰 조회 실패')

      setRegions((rJ?.data?.regions || []).map((r: any) => ({
        id: String(r.id),
        code: String(r.code),
        label: String(r.label),
        lat: Number(r.lat),
        lon: Number(r.lon),
        weight_pct: Number(r.weight_pct),
        sort_order: Number(r.sort_order),
        is_active: !!r.is_active,
        _isNew: false,
      })))
      setFactors((fJ?.data?.factors || []).map((f: any) => ({
        id: String(f.id),
        condition_key: String(f.condition_key),
        label: String(f.label),
        factor: Number(f.factor),
        openweather_codes: String(f.openweather_codes),
        sort_order: Number(f.sort_order),
        _isNew: false,
      })))

      const wRegions = wJ?.data?.regions || []
      const lastFetched = wRegions
        .map((r: any) => r.fetched_at)
        .filter((v: any) => !!v)
        .sort()
        .pop() ?? null
      setStatus({
        api_key_set: !!wJ?.data?.api_key_set,
        last_fetched_at: lastFetched,
      })
      setDeletedRegionIds(new Set())
      setDeletedFactorIds(new Set())
    } catch (e: any) {
      setResult({
        ok: false, text: '❌ 날씨 설정 조회 실패',
        detail: e?.message, at: nowLabel(),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── 권역 핸들러 ───────────────────────────────────────────────
  const updateRegion = (idx: number, patch: Partial<RegionRow>) => {
    setRegions(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  const addRegion = () => {
    const newR: RegionRow = {
      id: newPlaceholderId(),
      code: '', label: '',
      lat: 37.5, lon: 127.0,
      weight_pct: 0,
      sort_order: (regions.length + 1) * 10,
      is_active: true,
      _isNew: true,
    }
    setRegions(prev => [...prev, newR])
  }
  const removeRegion = (idx: number) => {
    const r = regions[idx]
    if (!r) return
    if (!r._isNew) {
      setDeletedRegionIds(s => new Set([...s, r.id]))
    }
    setRegions(prev => prev.filter((_, i) => i !== idx))
  }

  // ── 룰 핸들러 ────────────────────────────────────────────────
  const updateFactor = (idx: number, patch: Partial<FactorRow>) => {
    setFactors(prev => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }
  const addFactor = () => {
    const newF: FactorRow = {
      id: newPlaceholderId(),
      condition_key: '',
      label: '',
      factor: 1.0,
      openweather_codes: '',
      sort_order: (factors.length + 1) * 10,
      _isNew: true,
    }
    setFactors(prev => [...prev, newF])
  }
  const removeFactor = (idx: number) => {
    const f = factors[idx]
    if (!f) return
    if (!f._isNew) {
      setDeletedFactorIds(s => new Set([...s, f.id]))
    }
    setFactors(prev => prev.filter((_, i) => i !== idx))
  }

  // ── 저장 — 권역 (POST 일괄 + DELETE 누적) ──────────────────────
  const saveRegions = async () => {
    setSavingR(true); setResult(null)
    try {
      const auth = await getAuthHeader()
      const toPost = regions.map(r => ({
        ...(r._isNew ? {} : { id: r.id }),
        code: r.code,
        label: r.label,
        lat: r.lat,
        lon: r.lon,
        weight_pct: r.weight_pct,
        sort_order: r.sort_order,
        is_active: r.is_active,
      }))
      const pRes = await fetch('/api/call-scheduler/kpi/weather/regions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ regions: toPost }),
      })
      const pJ = await pRes.json()
      if (!pRes.ok) throw new Error(pJ?.error || '저장 실패')

      let deleted = 0
      for (const id of deletedRegionIds) {
        const dRes = await fetch(
          `/api/call-scheduler/kpi/weather/regions?id=${encodeURIComponent(id)}`,
          { method: 'DELETE', headers: auth },
        )
        if (dRes.ok) {
          const dJ = await dRes.json()
          deleted += Number(dJ?.data?.deleted || 0)
        }
      }

      const d = pJ.data || {}
      const errs: string[] = Array.isArray(d.errors) ? d.errors : []
      setResult({
        ok: errs.length === 0,
        text: errs.length === 0 ? '⛅ 권역 저장 완료' : '⚠ 권역 일부 저장',
        detail:
          `추가 ${d.inserted || 0} · 갱신 ${d.updated || 0} · 삭제 ${deleted}` +
          (errs.length > 0 ? ` · 실패 ${errs.length} (${errs.slice(0, 3).join(' / ')})` : ''),
        at: nowLabel(),
      })
      await load()
    } catch (e: any) {
      setResult({
        ok: false, text: '❌ 권역 저장 실패',
        detail: e?.message, at: nowLabel(),
      })
    } finally {
      setSavingR(false)
    }
  }

  // ── 저장 — 룰 ─────────────────────────────────────────────────
  const saveFactors = async () => {
    setSavingF(true); setResult(null)
    try {
      const auth = await getAuthHeader()
      const toPost = factors.map(f => ({
        ...(f._isNew ? {} : { id: f.id }),
        condition_key: f.condition_key,
        label: f.label,
        factor: f.factor,
        openweather_codes: f.openweather_codes,
        sort_order: f.sort_order,
      }))
      const pRes = await fetch('/api/call-scheduler/kpi/weather/factors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ factors: toPost }),
      })
      const pJ = await pRes.json()
      if (!pRes.ok) throw new Error(pJ?.error || '저장 실패')

      let deleted = 0
      for (const id of deletedFactorIds) {
        const dRes = await fetch(
          `/api/call-scheduler/kpi/weather/factors?id=${encodeURIComponent(id)}`,
          { method: 'DELETE', headers: auth },
        )
        if (dRes.ok) {
          const dJ = await dRes.json()
          deleted += Number(dJ?.data?.deleted || 0)
        }
      }

      const d = pJ.data || {}
      const errs: string[] = Array.isArray(d.errors) ? d.errors : []
      setResult({
        ok: errs.length === 0,
        text: errs.length === 0 ? '⛅ 보정율 룰 저장 완료' : '⚠ 보정율 룰 일부 저장',
        detail:
          `추가 ${d.inserted || 0} · 갱신 ${d.updated || 0} · 삭제 ${deleted}` +
          (errs.length > 0 ? ` · 실패 ${errs.length} (${errs.slice(0, 3).join(' / ')})` : ''),
        at: nowLabel(),
      })
      await load()
    } catch (e: any) {
      setResult({
        ok: false, text: '❌ 룰 저장 실패',
        detail: e?.message, at: nowLabel(),
      })
    } finally {
      setSavingF(false)
    }
  }

  // ── 가중치 합 (active 만) ─────────────────────────────────────
  const weightSum = Math.round(
    regions.filter(r => r.is_active).reduce(
      (s, r) => s + (Number.isFinite(Number(r.weight_pct)) ? Number(r.weight_pct) : 0),
      0,
    ) * 100,
  ) / 100
  const weightOk = Math.abs(weightSum - 100) < 0.1

  if (loading && regions.length === 0 && factors.length === 0) {
    return <div style={{ fontSize: 12, color: COLORS.textMuted }}>조회 중...</div>
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
        권역별 날씨 → 인입량 보정율 → WFM Erlang C λ 가산 — 17 광역 시드 +
        보정율 룰 10행 시드. 매니저가 자유롭게 추가·수정·삭제 가능.
      </div>

      <ResultPanel result={result} onClose={() => setResult(null)} />

      {/* ── 키 상태 + 캐시 ─────────────────────────────────────── */}
      <div style={{
        ...GLASS.L1, borderRadius: 8, padding: '8px 12px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        border: `1px solid ${
          status?.api_key_set ? COLORS.borderGreen : COLORS.borderAmber
        }`,
        background: status?.api_key_set ? COLORS.bgGreen : COLORS.bgAmber,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: status?.api_key_set ? COLORS.success : COLORS.warning,
        }}>
          {status?.api_key_set
            ? '✅ OpenWeather 키 설정됨'
            : '⚠ OpenWeather 키 미설정 (.env.local 의 OPENWEATHER_API_KEY)'}
        </span>
        <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
          마지막 fetch:{' '}
          {status?.last_fetched_at
            ? new Date(status.last_fetched_at).toLocaleString('ko-KR')
            : '아직 없음 — 첫 GET /weather 호출 시 캐시 채움'}
        </span>
      </div>

      {/* ── 권역 테이블 ─────────────────────────────────────────── */}
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: 12, marginBottom: 12,
        border: `1px solid ${COLORS.borderSubtle}`, overflow: 'auto',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
            🌏 권역 ({regions.length})
          </span>
          <span style={{
            fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
            background: weightOk ? COLORS.bgGreen : COLORS.bgAmber,
            color: weightOk ? COLORS.success : COLORS.warning,
            border: `1px solid ${weightOk ? COLORS.borderGreen : COLORS.borderAmber}`,
          }}>
            가중치 합 {weightSum.toFixed(2)}{weightOk ? ' ✓' : ' (100 권장)'}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={addRegion}
            disabled={savingR}
            style={{
              ...BTN.sm, background: 'transparent', color: COLORS.primary,
              border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer',
            }}>+ 권역 추가</button>
          <button type="button" onClick={saveRegions}
            disabled={savingR || regions.length === 0}
            style={{
              ...BTN.sm, background: COLORS.success, color: '#fff', border: 'none',
              cursor: (savingR || regions.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (savingR || regions.length === 0) ? 0.6 : 1,
            }}>
            {savingR ? '저장 중...' : '✓ 권역 저장'}
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
              <th style={thStyle}>code</th>
              <th style={thStyle}>이름</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>위도</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>경도</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>가중치%</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>순서</th>
              <th style={thStyle}>활성</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r, i) => (
              <tr key={r.id}
                style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                <td style={tdStyle}>
                  <input type="text" value={r.code} maxLength={16}
                    onChange={(e) => updateRegion(i, { code: e.target.value.toUpperCase() })}
                    placeholder="SEOUL"
                    style={{ ...inputStyle, width: 90 }} />
                </td>
                <td style={tdStyle}>
                  <input type="text" value={r.label} maxLength={32}
                    onChange={(e) => updateRegion(i, { label: e.target.value })}
                    placeholder="서울특별시"
                    style={{ ...inputStyle, width: 130 }} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <input type="number" value={r.lat} step={0.00001} min={33} max={39}
                    onChange={(e) => updateRegion(i, { lat: Number(e.target.value) })}
                    style={{ ...inputStyle, width: 80, textAlign: 'right' }} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <input type="number" value={r.lon} step={0.00001} min={124} max={132}
                    onChange={(e) => updateRegion(i, { lon: Number(e.target.value) })}
                    style={{ ...inputStyle, width: 80, textAlign: 'right' }} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <input type="number" value={r.weight_pct} step={0.1} min={0} max={100}
                    onChange={(e) => updateRegion(i, { weight_pct: Number(e.target.value) })}
                    style={{ ...inputStyle, width: 60, textAlign: 'right' }} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <input type="number" value={r.sort_order} step={1}
                    onChange={(e) => updateRegion(i, { sort_order: Number(e.target.value) })}
                    style={{ ...inputStyle, width: 50, textAlign: 'right' }} />
                </td>
                <td style={tdStyle}>
                  <input type="checkbox" checked={r.is_active}
                    onChange={(e) => updateRegion(i, { is_active: e.target.checked })}
                    style={{ width: 14, height: 14, cursor: 'pointer' }} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <button type="button" onClick={() => removeRegion(i)}
                    disabled={savingR}
                    style={{
                      ...BTN.sm, background: 'transparent', color: COLORS.danger,
                      border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer',
                      padding: '2px 8px', fontSize: 10,
                    }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 보정율 룰 테이블 ──────────────────────────────────────── */}
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: 12,
        border: `1px solid ${COLORS.borderSubtle}`, overflow: 'auto',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
            📈 보정율 룰 ({factors.length})
          </span>
          <span style={{ fontSize: 11, color: COLORS.textMuted }}>
            condition_code → λ 곱셈 factor (1.00 = 무영향)
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={addFactor}
            disabled={savingF}
            style={{
              ...BTN.sm, background: 'transparent', color: COLORS.primary,
              border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer',
            }}>+ 룰 추가</button>
          <button type="button" onClick={saveFactors}
            disabled={savingF || factors.length === 0}
            style={{
              ...BTN.sm, background: COLORS.success, color: '#fff', border: 'none',
              cursor: (savingF || factors.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (savingF || factors.length === 0) ? 0.6 : 1,
            }}>
            {savingF ? '저장 중...' : '✓ 룰 저장'}
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
              <th style={thStyle}>condition_key</th>
              <th style={thStyle}>이름</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>factor</th>
              <th style={thStyle}>OpenWeather codes (CSV)</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>순서</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {factors.map((f, i) => (
              <tr key={f.id}
                style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                <td style={tdStyle}>
                  <input type="text" value={f.condition_key} maxLength={32}
                    onChange={(e) => updateFactor(i, { condition_key: e.target.value })}
                    placeholder="rain_light"
                    style={{ ...inputStyle, width: 130 }} />
                </td>
                <td style={tdStyle}>
                  <input type="text" value={f.label} maxLength={32}
                    onChange={(e) => updateFactor(i, { label: e.target.value })}
                    placeholder="약한 비"
                    style={{ ...inputStyle, width: 110 }} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <input type="number" value={f.factor} step={0.05} min={0} max={10}
                    onChange={(e) => updateFactor(i, { factor: Number(e.target.value) })}
                    style={{ ...inputStyle, width: 65, textAlign: 'right' }} />
                </td>
                <td style={tdStyle}>
                  <input type="text" value={f.openweather_codes} maxLength={64}
                    onChange={(e) => updateFactor(i, { openweather_codes: e.target.value })}
                    placeholder="500,520"
                    style={{ ...inputStyle, width: 280 }} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <input type="number" value={f.sort_order} step={1}
                    onChange={(e) => updateFactor(i, { sort_order: Number(e.target.value) })}
                    style={{ ...inputStyle, width: 50, textAlign: 'right' }} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <button type="button" onClick={() => removeFactor(i)}
                    disabled={savingF}
                    style={{
                      ...BTN.sm, background: 'transparent', color: COLORS.danger,
                      border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer',
                      padding: '2px 8px', fontSize: 10,
                    }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{
          fontSize: 10, color: COLORS.textMuted, marginTop: 8, padding: '0 4px',
        }}>
          ℹ OpenWeather condition.id 참조:{' '}
          <a href="https://openweathermap.org/weather-conditions"
            target="_blank" rel="noreferrer"
            style={{ color: COLORS.primary, textDecoration: 'underline' }}>
            openweathermap.org/weather-conditions
          </a>
          {' '} — 2xx(천둥) · 3xx(이슬비) · 5xx(비) · 6xx(눈) · 7xx(안개) · 800(맑음) · 80x(흐림)
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '6px 8px', textAlign: 'left',
  color: COLORS.textSecondary, fontWeight: 700,
  whiteSpace: 'nowrap', fontSize: 11,
}
const tdStyle: React.CSSProperties = {
  padding: '6px 8px', whiteSpace: 'nowrap', color: COLORS.textPrimary,
}
const inputStyle: React.CSSProperties = {
  ...GLASS.L1, padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700,
  color: COLORS.textPrimary, fontFamily: 'inherit', boxSizing: 'border-box',
}

// ── 저장 결과 글래스 패널 (Rule 20 — alert 금지) ──────────────────
function ResultPanel({ result, onClose }: {
  result: SaveResult | null; onClose: () => void
}) {
  if (!result) return null
  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: 12, marginBottom: 12,
      border: `1px solid ${result.ok ? COLORS.borderGreen : COLORS.borderRed}`,
      background: result.ok ? COLORS.bgGreen : COLORS.bgRed,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 13, fontWeight: 800,
          color: result.ok ? COLORS.success : COLORS.danger,
        }}>
          {result.text}
          <span style={{
            fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 6,
          }}>{result.at}</span>
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 13, color: COLORS.textMuted, fontWeight: 700,
          }}>× 닫기</button>
      </div>
      {result.detail && (
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 6 }}>
          {result.detail}
        </div>
      )}
    </div>
  )
}

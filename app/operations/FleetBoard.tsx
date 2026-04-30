'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { COLORS, GLASS, pillStyle } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import TransportRequestModal from './TransportRequestModal'

// ═══════════════════════════════════════════════════════════════
// 배차 보드 — /operations 의 fleet 탭
// ═══════════════════════════════════════════════════════════════

const STATUS_META: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  active:      { label: '가용',     emoji: '✓', color: '#059669', bg: 'rgba(167,243,208,0.4)' },
  available:   { label: '가용',     emoji: '✓', color: '#059669', bg: 'rgba(167,243,208,0.4)' },
  rented:      { label: '대여중',   emoji: '🚗', color: '#1d4ed8', bg: 'rgba(191,219,254,0.5)' },
  dispatched:  { label: '대차배정', emoji: '🚙', color: '#1d4ed8', bg: 'rgba(191,219,254,0.5)' },
  in_transit:  { label: '탁송중',   emoji: '🚚', color: '#0891b2', bg: 'rgba(165,243,252,0.5)' },
  washing:     { label: '세차',     emoji: '💧', color: '#0284c7', bg: 'rgba(186,230,253,0.5)' },
  maintenance: { label: '정비',     emoji: '🔧', color: '#b45309', bg: 'rgba(254,215,170,0.5)' },
  repair:      { label: '수리',     emoji: '🛠', color: '#c2410c', bg: 'rgba(254,202,202,0.5)' },
  inspection:  { label: '검사',     emoji: '📋', color: '#7c3aed', bg: 'rgba(221,214,254,0.5)' },
  accident:    { label: '사고',     emoji: '⚠', color: '#b91c1c', bg: 'rgba(254,202,202,0.6)' },
  longterm:    { label: '장기보관', emoji: '🅿', color: '#64748b', bg: 'rgba(226,232,240,0.6)' },
}

const SERVICE_META: Record<string, { label: string; emoji: string; color: string }> = {
  accident_repair: { label: '사고수리', emoji: '⚠',  color: '#b91c1c' },
  dispatch:        { label: '배차',     emoji: '🚙', color: '#1d4ed8' },
  return:          { label: '회수',     emoji: '↩',  color: '#0d9488' },
  maint_in:        { label: '정비입고', emoji: '🔧', color: '#b45309' },
  maint_out:       { label: '정비출고', emoji: '🔧', color: '#059669' },
  sale:            { label: '매매',     emoji: '💰', color: '#7c3aed' },
  general:         { label: '일반',     emoji: '🚚', color: '#475569' },
}

const TR_STATUS_META: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' }> = {
  requested:    { label: '요청',     tone: 'warning' },
  assigned:     { label: '배정',     tone: 'info' },
  in_progress:  { label: '진행중',   tone: 'info' },
  completed:    { label: '완료',     tone: 'success' },
  cancelled:    { label: '취소',     tone: 'neutral' },
}

interface Car {
  id: string
  number: string
  brand: string
  model: string
  year: number
  status: string
  location: string | null
  location_code: string | null
  location_label: string | null
  location_address: string | null
  mileage: number
  group: 'available' | 'rented' | 'preparing' | 'offline'
  is_returning_today: boolean
}

interface ReturningOp {
  id: string
  car_id: string
  car_number: string
  brand: string
  model: string
  scheduled_date: string
  scheduled_time: string
  location: string
  status: string
  driver_name: string
}

interface Transport {
  id: string
  service_type: string
  trip_type: string
  route_summary: string
  status: string
  scheduled_at: string | null
  driver_name: string | null
  driver_phone: string | null
  photo_required: number
  photo_received: number
  stops_summary: string | null
}

interface Location {
  id: string
  code: string
  label: string
  address: string | null
  category: string
}

export default function FleetBoard() {
  const [data, setData] = useState<{
    stats: any
    cars: Car[]
    returning_today: ReturningOp[]
    transport_today: Transport[]
    locations: Location[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'rented' | 'preparing' | 'offline'>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const [showTransportModal, setShowTransportModal] = useState(false)
  const [editingTransportId, setEditingTransportId] = useState<string | null>(null)
  const [presetCarId, setPresetCarId] = useState<string | null>(null)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { json } = await fetchWithAuth('/api/operations/fleet')
      if (json?.error) { setError(json.error); return }
      if (json?.data) setData(json.data)
      setLastRefresh(new Date())
    } catch (e: any) {
      setError(e?.message || 'load failed')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // 자동 폴링 (60초, 페이지 visible 일 때만)
  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, load])

  const stats = data?.stats || { available: 0, rented: 0, returning_today: 0, preparing: 0, offline: 0, transport_active: 0 }
  const cars = data?.cars || []
  const returning = data?.returning_today || []
  const transport = data?.transport_today || []
  const locations = data?.locations || []

  // 필터링
  const filteredCars = useMemo(() => {
    return cars.filter(c => {
      if (statusFilter !== 'all' && c.group !== statusFilter) return false
      if (locationFilter !== 'all' && c.location_code !== locationFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !(c.number || '').toLowerCase().includes(q) &&
          !(c.brand || '').toLowerCase().includes(q) &&
          !(c.model || '').toLowerCase().includes(q) &&
          !(c.location || '').toLowerCase().includes(q) &&
          !(c.location_label || '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [cars, statusFilter, locationFilter, search])

  // 그룹별 분리
  const grouped = useMemo(() => ({
    available:  filteredCars.filter(c => c.group === 'available'),
    rented:     filteredCars.filter(c => c.group === 'rented'),
    preparing:  filteredCars.filter(c => c.group === 'preparing'),
    offline:    filteredCars.filter(c => c.group === 'offline'),
  }), [filteredCars])

  const openTransport = (carId?: string | null) => {
    setEditingTransportId(null)
    setPresetCarId(carId || null)
    setShowTransportModal(true)
  }

  const editTransport = (id: string) => {
    setEditingTransportId(id)
    setPresetCarId(null)
    setShowTransportModal(true)
  }

  const handleStatusChange = async (transportId: string, newStatus: string) => {
    if (!confirm(`상태를 「${TR_STATUS_META[newStatus]?.label || newStatus}」로 변경할까요?`)) return
    const { ok, json } = await fetchWithAuth(
      `/api/transport-requests?id=${transportId}&action=status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      }
    )
    if (ok) load()
    else alert(`상태 변경 실패: ${json?.error}`)
  }

  return (
    <div style={{ padding: '12px 0' }}>
      {/* 헤더 + 자동 새로고침 토글 */}
      <div style={{
        ...GLASS.L3, borderRadius: 12, padding: 12, marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>🚦 배차 보드</h2>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: COLORS.textSecondary, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          🔄 자동 60s
        </label>
        <button onClick={load} disabled={loading} style={{
          padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8,
          background: 'rgba(255,255,255,0.7)', color: COLORS.textSecondary,
          border: `1px solid ${COLORS.borderSubtle}`, cursor: 'pointer',
        }}>
          {loading ? '⏳' : '🔄 새로고침'}
        </button>
        {lastRefresh && (
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            {lastRefresh.toLocaleTimeString('ko-KR', { hour12: false })}
          </span>
        )}
        <button onClick={() => openTransport()} style={{
          padding: '8px 14px', fontSize: 13, fontWeight: 700,
          background: COLORS.primary, color: '#fff',
          border: 'none', borderRadius: 8, cursor: 'pointer',
        }}>
          + 탁송 요청
        </button>
      </div>

      {/* 통계 6장 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
        {[
          { key: 'available',       label: '가용',       value: stats.available,       tint: '#059669', emoji: '✓' },
          { key: 'rented',          label: '대여/운행중', value: stats.rented,          tint: '#1d4ed8', emoji: '🚗' },
          { key: 'returning_today', label: '오늘 입고',   value: stats.returning_today, tint: '#0891b2', emoji: '⏰' },
          { key: 'preparing',       label: '정비/세차',   value: stats.preparing,       tint: '#b45309', emoji: '🔧' },
          { key: 'transport_today', label: '탁송 진행',   value: stats.transport_active,tint: '#7c3aed', emoji: '🚚' },
          { key: 'offline',         label: '사고/오프라인', value: stats.offline,        tint: '#b91c1c', emoji: '⚠' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => {
              if (s.key === 'available' || s.key === 'rented' || s.key === 'preparing' || s.key === 'offline') {
                setStatusFilter(prev => prev === s.key ? 'all' : s.key as any)
              }
            }}
            style={{
              ...GLASS.L3, border: `1px solid ${s.tint}33`,
              borderRadius: 10, padding: 12, cursor: 'pointer',
              outline: statusFilter === s.key ? `2px solid ${s.tint}` : 'none',
              textAlign: 'left',
            }}>
            <div style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 }}>{s.emoji} {s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.tint }}>{Number(s.value).toLocaleString()}</div>
          </button>
        ))}
      </div>

      {/* 필터 바 */}
      <div style={{
        ...GLASS.L3, borderRadius: 12, padding: 10, marginBottom: 12,
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 차량/위치 검색"
          style={{
            padding: '6px 12px', fontSize: 12, borderRadius: 8,
            border: `1px solid ${COLORS.borderSubtle}`,
            background: 'rgba(255,255,255,0.7)', minWidth: 200,
          }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
          style={selectStyle}>
          <option value="all">상태: 전체</option>
          <option value="available">✓ 가용</option>
          <option value="rented">🚗 대여중</option>
          <option value="preparing">🔧 정비/세차</option>
          <option value="offline">⚠ 사고/오프라인</option>
        </select>
        <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}
          style={selectStyle}>
          <option value="all">위치: 전체</option>
          {locations.map(l => (
            <option key={l.id} value={l.code}>{l.label}</option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>
          {filteredCars.length}대 표시
        </span>
      </div>

      {error && (
        <div style={{ padding: 16, background: 'rgba(254,202,202,0.5)', borderRadius: 8, color: '#b91c1c', marginBottom: 12, fontSize: 13 }}>
          ❌ {error}
        </div>
      )}

      {/* 오늘 탁송 */}
      {transport.length > 0 && (
        <Section title="🚚 오늘 탁송" count={transport.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {transport.map(t => {
              const sm = SERVICE_META[t.service_type] || SERVICE_META.general
              const stm = TR_STATUS_META[t.status] || TR_STATUS_META.requested
              const stops = (t.stops_summary || '').split('||').map(s => s.split('|'))
              return (
                <div key={t.id} style={{
                  ...GLASS.L3, borderRadius: 10, padding: 12,
                  border: `1px solid ${sm.color}33`,
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
                }}>
                  <div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: sm.color, background: `${sm.color}15`, padding: '2px 8px', borderRadius: 99 }}>
                        {sm.emoji} {sm.label}
                      </span>
                      <span style={{ ...pillStyle(stm.tone), fontSize: 11 }}>{stm.label}</span>
                      {t.scheduled_at && (
                        <span style={{ fontSize: 12, color: COLORS.textPrimary, fontWeight: 600 }}>
                          ⏰ {new Date(t.scheduled_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {t.photo_required ? (
                        <span style={{ fontSize: 11, color: t.photo_received ? '#059669' : '#b45309' }}>
                          📷 {t.photo_received ? '수신완료' : '대기'}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>
                      {t.route_summary || '(경로 미입력)'}
                    </div>
                    {stops.length > 0 && (
                      <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                        {stops.map((parts, i) => {
                          const [order, type, label, phone, pickup, dropoff] = parts
                          if (!order) return null
                          return (
                            <div key={i}>
                              <strong>{type === 'departure' ? '출발' : type === 'destination' ? '도착' : `경유${order}`}</strong>
                              {' · '}{label || '?'}
                              {phone && <> · 📞 {phone}</>}
                              {pickup && <> · 🚗{pickup}</>}
                              {dropoff && dropoff !== pickup && <> → 🚗{dropoff}</>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
                      기사: {t.driver_name || '미배정'} {t.driver_phone && `· ${t.driver_phone}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {t.status === 'requested' && (
                      <button onClick={() => handleStatusChange(t.id, 'assigned')} style={miniBtn('#1d4ed8')}>배정완료</button>
                    )}
                    {t.status === 'assigned' && (
                      <button onClick={() => handleStatusChange(t.id, 'in_progress')} style={miniBtn('#0891b2')}>출발</button>
                    )}
                    {t.status === 'in_progress' && (
                      <button onClick={() => handleStatusChange(t.id, 'completed')} style={miniBtn('#059669')}>도착완료</button>
                    )}
                    <button onClick={() => editTransport(t.id)} style={miniBtn('#475569')}>편집</button>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* 오늘 입고 예정 */}
      {returning.length > 0 && (
        <Section title="⏰ 오늘 입고 예정" count={returning.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {returning.map(r => (
              <div key={r.id} style={{
                ...GLASS.L3, borderRadius: 8, padding: '10px 12px',
                border: `1px solid ${COLORS.borderSubtle}`,
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary, fontVariantNumeric: 'tabular-nums', minWidth: 50 }}>
                  {r.scheduled_time?.slice(0, 5) || '--:--'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{r.car_number}</span>
                <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{r.brand} {r.model}</span>
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>📍 {r.location || '?'}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>{r.driver_name || '기사 미배정'}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 차량 그룹 */}
      {loading && filteredCars.length === 0 && (
        <div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>불러오는 중...</div>
      )}
      {!loading && filteredCars.length === 0 && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚦</div>
          <div>표시할 차량이 없습니다</div>
        </div>
      )}

      {grouped.available.length > 0 && (
        <Section title="✓ 가용 차량" count={grouped.available.length}>
          <CarGrid cars={grouped.available} onTransport={openTransport} />
        </Section>
      )}
      {grouped.preparing.length > 0 && (
        <Section title="🔧 정비/세차 대기" count={grouped.preparing.length}>
          <CarGrid cars={grouped.preparing} onTransport={openTransport} />
        </Section>
      )}
      {grouped.rented.length > 0 && (
        <Section title="🚗 대여중/운행중" count={grouped.rented.length} collapsible defaultCollapsed>
          <CarGrid cars={grouped.rented} onTransport={openTransport} />
        </Section>
      )}
      {grouped.offline.length > 0 && (
        <Section title="⚠ 사고/오프라인" count={grouped.offline.length} collapsible defaultCollapsed>
          <CarGrid cars={grouped.offline} onTransport={openTransport} />
        </Section>
      )}

      {showTransportModal && (
        <TransportRequestModal
          requestId={editingTransportId}
          presetCarId={presetCarId}
          locations={locations}
          cars={cars}
          onClose={() => setShowTransportModal(false)}
          onSaved={() => { setShowTransportModal(false); load() }}
        />
      )}
    </div>
  )
}

// ─── 섹션 ───────────────────────────────────────────────────
function Section({ title, count, collapsible, defaultCollapsed, children }: {
  title: string; count: number; collapsible?: boolean; defaultCollapsed?: boolean; children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed)
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        onClick={() => collapsible && setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', cursor: collapsible ? 'pointer' : 'default',
          marginBottom: 8,
        }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
          {title}
          <span style={{ color: COLORS.textMuted, fontWeight: 500, marginLeft: 6 }}>({count})</span>
        </h3>
        {collapsible && (
          <span style={{ fontSize: 11, color: COLORS.textMuted }}>{collapsed ? '▶ 펼치기' : '▼ 접기'}</span>
        )}
      </div>
      {!collapsed && children}
    </div>
  )
}

// ─── 차량 그리드 ────────────────────────────────────────────
function CarGrid({ cars, onTransport }: { cars: Car[]; onTransport: (carId: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
      {cars.map(c => {
        const sm = STATUS_META[c.status] || STATUS_META.active
        return (
          <div key={c.id} style={{
            ...GLASS.L3, border: `1px solid ${COLORS.borderSubtle}`,
            borderRadius: 12, padding: 12,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                {c.number}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: sm.bg, color: sm.color,
              }}>
                {sm.emoji} {sm.label}
              </span>
            </div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
              {c.brand} {c.model} {c.year && `(${c.year})`}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textPrimary, lineHeight: 1.4 }}>
              📍 {c.location_label || '미지정'}
              {c.location && c.location !== c.location_label && (
                <div style={{ paddingLeft: 14, color: COLORS.textMuted }}>└ {c.location}</div>
              )}
            </div>
            {Number(c.mileage) > 0 && (
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                {Number(c.mileage).toLocaleString()}km
              </div>
            )}
            {c.is_returning_today && (
              <div style={{ fontSize: 11, color: '#0891b2', fontWeight: 600 }}>⏰ 오늘 입고 예정</div>
            )}
            <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
              <a href={`/cars/${c.id}`} style={{
                flex: 1, textAlign: 'center', textDecoration: 'none',
                padding: '5px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                background: 'rgba(0,0,0,0.04)', color: COLORS.textSecondary,
                border: `1px solid ${COLORS.borderSubtle}`,
              }}>상세</a>
              <button onClick={() => onTransport(c.id)} style={{
                flex: 1, padding: '5px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                background: 'rgba(124,58,237,0.1)', color: '#7c3aed',
                border: '1px solid rgba(124,58,237,0.35)', cursor: 'pointer',
              }}>🚚 탁송</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── 스타일 헬퍼 ────────────────────────────────────────────
const selectStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 12, borderRadius: 6,
  border: `1px solid ${COLORS.borderSubtle}`, background: '#fff',
  color: COLORS.textPrimary,
}

function miniBtn(color: string): React.CSSProperties {
  return {
    padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
    background: `${color}15`, color, border: `1px solid ${color}55`,
    cursor: 'pointer', whiteSpace: 'nowrap',
  }
}

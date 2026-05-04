'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS, GLASS, pillStyle } from '@/app/utils/ui-tokens'
import {
  Button, KpiCard, KpiRow, PageHeader, ScreenWrap, Section, Spinner, TextInput,
} from '../_components/ui'
import SubNav from '../_components/SubNav'
import { DEFAULT_AXES, PRIMARY_AXIS_KEYS, SECONDARY_AXIS_KEYS, type CodeAxis } from '../groups/defaults'

// ───────────────────────────────────────────────────────────────
// 공장 ↔ 분류 매핑 — 매니저 부여 UI
//   좌측: 공장 검색·목록·선택
//   우측: 선택 공장의 axis 별 항목 부여 (multi-select 칩)
//   저장: localStorage('ride_op_factory_classifications')
//     형태: { [factcode]: { [axisKey]: string[] /* itemKeys */ } }
// ───────────────────────────────────────────────────────────────

const AXES_STORAGE_KEY = 'ride_op_classifications_v2'
const MAPPING_STORAGE_KEY = 'ride_op_factory_classifications'

type FactoryMapping = Record<string, Record<string, string[]>>

type Factory = {
  factcode: string
  factname: string
  factaddr?: string | null
  facthpno?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

function loadAxes(): CodeAxis[] {
  if (typeof window === 'undefined') return DEFAULT_AXES
  try {
    const raw = window.localStorage.getItem(AXES_STORAGE_KEY)
    if (!raw) return DEFAULT_AXES
    const parsed = JSON.parse(raw) as CodeAxis[]
    return parsed.length > 0 ? parsed : DEFAULT_AXES
  } catch { return DEFAULT_AXES }
}

function loadMapping(): FactoryMapping {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(MAPPING_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as FactoryMapping
  } catch { return {} }
}

function saveMapping(m: FactoryMapping) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(m))
}

export default function MappingMain() {
  const [factories, setFactories] = useState<Factory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [axes, setAxes] = useState<CodeAxis[]>(DEFAULT_AXES)
  const [mapping, setMapping] = useState<FactoryMapping>({})
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    setAxes(loadAxes())
    setMapping(loadMapping())
  }, [])

  // 공장 목록 로드 — 즐겨찾기 우선 (factcode K* 시작)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '1000' })
      if (search) p.set('search', search)
      const res = await fetch(`/factory-search/api/factories?${p}`)
      const json = await res.json()
      if (json?.success) setFactories(json.data || [])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { load() }, [load])

  const selected = useMemo(
    () => factories.find(f => f.factcode === selectedCode) || null,
    [factories, selectedCode],
  )

  // 통계
  const stats = useMemo(() => {
    const totalFactories = factories.length
    const mappedFactories = Object.keys(mapping).filter(code => {
      const m = mapping[code]
      return m && Object.values(m).some(arr => arr.length > 0)
    }).length
    const totalAssignments = Object.values(mapping).reduce(
      (sum, m) => sum + Object.values(m).reduce((s, arr) => s + arr.length, 0),
      0,
    )
    return {
      totalFactories,
      mappedFactories,
      mappingRate: totalFactories > 0 ? Math.round((mappedFactories / totalFactories) * 100) : 0,
      totalAssignments,
    }
  }, [factories, mapping])

  // 항목 토글
  const toggleItem = (factcode: string, axisKey: string, itemKey: string) => {
    setMapping(prev => {
      const current = prev[factcode]?.[axisKey] || []
      const next = current.includes(itemKey)
        ? current.filter(k => k !== itemKey)
        : [...current, itemKey]
      return {
        ...prev,
        [factcode]: { ...prev[factcode], [axisKey]: next },
      }
    })
  }

  const persist = () => {
    saveMapping(mapping)
    setSavedAt(new Date().toLocaleTimeString('ko-KR'))
  }

  const clearFactory = (factcode: string) => {
    if (!confirm('이 공장의 모든 분류 부여를 초기화할까요?')) return
    setMapping(prev => {
      const next = { ...prev }
      delete next[factcode]
      return next
    })
  }

  // 표시할 axis — 숨김 처리되지 않은 것만, 메인/부가 영역 분리 (그룹 구성과 동일 패턴)
  const visibleAxes = axes.filter(a => !a.axisHidden)
  const primaryAxes = visibleAxes.filter(a =>
    PRIMARY_AXIS_KEYS.has(a.key) || (a.axisCustom === true) || (!PRIMARY_AXIS_KEYS.has(a.key) && !SECONDARY_AXIS_KEYS.has(a.key) && !a.axisCustom),
  )
  const secondaryAxes = visibleAxes.filter(a => SECONDARY_AXIS_KEYS.has(a.key))
  const [showSecondaryMapping, setShowSecondaryMapping] = useState(false)

  // 공장의 부여 카운트
  const factoryCount = (factcode: string): number => {
    const m = mapping[factcode]
    if (!m) return 0
    return Object.values(m).reduce((s, arr) => s + arr.length, 0)
  }

  return (
    <ScreenWrap>
      <PageHeader
        breadcrumb={['Employee of Ride Inc.', '협력공장 추천', '매핑']}
        title="공장 ↔ 분류 매핑"
        emoji="🔗"
        right={
          <>
            {savedAt && <span style={{ fontSize: 11, color: COLORS.success }}>✓ {savedAt} 저장됨</span>}
            <Button variant="primary" size="md" onClick={persist}>저장</Button>
          </>
        }
      />
      <SubNav />

      <KpiRow>
        <KpiCard label="전체 공장" value={stats.totalFactories} tone="emerald" icon="🏭" />
        <KpiCard label="매핑된 공장" value={stats.mappedFactories} tone="blue" icon="🔗" hint={`${stats.mappingRate}%`} />
        <KpiCard label="총 부여 수" value={stats.totalAssignments} tone="violet" icon="🏷" />
        <KpiCard label="활성 분류 축" value={visibleAxes.length} tone="amber" icon="🧩" hint={`${axes.length} 중`} />
      </KpiRow>

      {/* 좌: 공장 목록 / 우: 부여 패널 */}
      <div style={{
        padding: '8px 24px 24px',
        display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16,
      }}>
        {/* 좌측 — 공장 목록 */}
        <aside style={{ ...GLASS.L4, borderRadius: 12, overflow: 'hidden', height: 'calc(100vh - 320px)', minHeight: 500, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${COLORS.borderSubtle}` }}>
            <TextInput
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="공장명·코드·주소 검색"
            />
          </div>
          <div style={{ padding: '8px 12px', fontSize: 11, color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.borderFaint}` }}>
            총 <b style={{ color: COLORS.textPrimary }}>{factories.length}</b>개 — 선택해 우측에서 분류 부여
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <Spinner label="공장 불러오는 중..." /> : factories.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
                검색 결과 없음
              </div>
            ) : factories.map(f => {
              const cnt = factoryCount(f.factcode)
              const active = selectedCode === f.factcode
              return (
                <button
                  key={f.factcode}
                  onClick={() => setSelectedCode(f.factcode)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 14px',
                    background: active ? COLORS.bgBlue : 'transparent',
                    borderLeft: `3px solid ${active ? COLORS.primary : 'transparent'}`,
                    borderTop: 'none', borderRight: 'none',
                    borderBottom: `1px solid ${COLORS.borderFaint}`,
                    cursor: 'pointer', transition: 'all 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: active ? COLORS.primary : COLORS.textPrimary,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{f.factname}</span>
                    {cnt > 0 && <span style={pillStyle('info')}>{cnt}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.factaddr || '주소 미등록'}
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 1, fontFamily: 'monospace' }}>{f.factcode}</div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* 우측 — 부여 패널 */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!selected ? (
            <div style={{ ...GLASS.L4, borderRadius: 12, padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>👈</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textSecondary }}>좌측에서 공장을 선택하세요</div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>선택한 공장에 분류 항목을 부여할 수 있습니다.</div>
            </div>
          ) : (
            <>
              {/* 선택 공장 헤더 */}
              <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>{selected.factname}</div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{selected.factaddr || '주소 미등록'}</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: 'monospace' }}>{selected.factcode} {selected.facthpno && `· ${selected.facthpno}`}</div>
                </div>
                {factoryCount(selected.factcode) > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => clearFactory(selected.factcode)}>
                    🧹 이 공장 부여 초기화
                  </Button>
                )}
              </div>

              {/* 공장 분류 (메인 5축) */}
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                공장 분류 ({primaryAxes.length})
              </div>
              {primaryAxes.map(axis => renderAxisSection(axis, selected.factcode, mapping, toggleItem))}

              {/* 운영·사고 분류 (8축, 접기) */}
              {secondaryAxes.length > 0 && (
                <div style={{ borderLeft: `2px solid ${COLORS.borderFaint}`, paddingLeft: 12 }}>
                  <button
                    onClick={() => setShowSecondaryMapping(s => !s)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 11, fontWeight: 700, color: COLORS.textSecondary,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
                    }}
                  >
                    <span>{showSecondaryMapping ? '▾' : '▸'}</span>
                    <span>운영·사고 분류 ({secondaryAxes.length})</span>
                  </button>
                  {showSecondaryMapping && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {secondaryAxes.map(axis => renderAxisSection(axis, selected.factcode, mapping, toggleItem))}
                    </div>
                  )}
                </div>
              )}

              {/* 안내 */}
              <div style={{ ...GLASS.L2, borderRadius: 12, padding: 12, fontSize: 11, color: COLORS.textMuted, lineHeight: 1.6 }}>
                💡 부여한 분류는 공장 추천(가까운 공장 + 매칭 점수)·공장 목록 칩·지도 인포윈도우에서 활용됩니다.
                저장은 우측 상단 <b style={{ color: COLORS.primary }}>저장</b> 버튼 (브라우저 localStorage).
              </div>
            </>
          )}
        </main>
      </div>

      <style>{`
        @media (max-width: 900px) {
          main, aside { grid-column: 1 / -1; }
        }
      `}</style>
    </ScreenWrap>
  )
}

// ── axis 한 영역 렌더 (메인·부가 공통) ──────────────────────────
function renderAxisSection(
  axis: CodeAxis,
  factcode: string,
  mapping: FactoryMapping,
  toggleItem: (factcode: string, axisKey: string, itemKey: string) => void,
) {
  const assigned = mapping[factcode]?.[axis.key] || []
  return (
    <Section
      key={axis.key}
      title={`${axis.emoji} ${axis.title} ${assigned.length > 0 ? `(${assigned.length})` : ''}`}
      color={COLORS.borderBlue}
    >
      {axis.items.length === 0 ? (
        <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '6px 0' }}>
          이 축에 항목이 없습니다. <a href="/factory-search/groups" style={{ color: COLORS.primary }}>그룹 구성</a>에서 항목을 먼저 추가하세요.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {axis.items.filter(i => !i.hidden).map(item => {
            const on = assigned.includes(item.key)
            return (
              <button
                key={item.key}
                onClick={() => toggleItem(factcode, axis.key, item.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 12px', borderRadius: 999,
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.1s',
                  border: `1px solid ${on ? item.color : COLORS.borderFaint}`,
                  background: on ? item.color : '#fff',
                  color: on ? '#fff' : COLORS.textSecondary,
                }}
                title={item.description}
              >
                <span>{item.emoji}</span>
                <span>{item.label}</span>
                {on && <span style={{ marginLeft: 2 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </Section>
  )
}


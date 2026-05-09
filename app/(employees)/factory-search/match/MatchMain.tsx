'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS, GLASS, pillStyle } from '@/app/utils/ui-tokens'
import { Button, KpiCard, KpiRow, PageHeader, ScreenWrap, Section, Spinner, TextInput } from '../_components/ui'
import { getAuthHeader } from '@/app/utils/auth-client'
import SubNav from '../_components/SubNav'
import { geocode } from '../_lib/kakao'

// ───────────────────────────────────────────────────────────────
// 사고 매칭 — 카페24 사고 선택 → 공장 추천
// ───────────────────────────────────────────────────────────────

// 사고접수 (acrotpth 4-table JOIN) — RideAccidentReports 와 동일 스키마
interface AccidentRow {
  otptidno: string
  otptmddt: string
  otptsrno: number
  otptacdt: string | null
  otptactm: string | null
  otptacbn: string | null   // 사고 유형 (OTPTACBN: B/D/E/G/H/J/K/M/O/P/Q/S)
  otptrgst: string | null   // 처리 상태 (OTPTSTAT)
  otptrgtp: string | null
  otptmscs: string | null   // 사고 메모
  otptacad: string | null   // 사고 주소
  otptacrn: string | null   // 운행 가능 Y/N
  cars_no: string | null
  cars_model: string | null
  cars_user: string | null
  cust_name: string | null
  user_name: string | null
}

interface ScoredFactory {
  factcode: string
  factname: string
  factaddr: string
  lat?: number
  lng?: number
  distanceKm: number | null
  score: number
  breakdown: {
    distance: number
    capital: number
    manageType: number
    vehicle: number
    accidentType: number
    repair: number
  }
  matched: {
    capital: boolean
    manageType: boolean
    vehicle: boolean
    accidentType: boolean
    repair: boolean
  }
}

// 차종 → vehicle axis item.key 추정
function inferVehicleKey(model: string | null): string | undefined {
  if (!model) return undefined
  const m = model.toUpperCase()
  if (/(테슬라|TESLA|MODEL\s*[3SXY])/.test(m)) return 'tesla-only'
  if (/(BMW|벤츠|BENZ|MERCEDES|AUDI|아우디|볼보|VOLVO|렉서스|LEXUS|JAGUAR|재규어|PORSCHE|포르쉐|MINI|미니|랜드로버|MASERATI|FERRARI|페라리|람보)/.test(m)) return 'foreign-only'
  return 'domestic'
}

// 정비 종류 추출 — acrotpth 사고접수에는 직접 정비 종류 컬럼 없음.
// 메모(otptmscs) 키워드 분석 또는 운행불가(otptacrn='N') → 'move' (견인) 추론.
// 추후 매핑 페이지에서 공장에 정비 종류 부여하면 매칭 가산.
function inferRepairKeys(a: AccidentRow): string[] {
  const out: string[] = []
  const memo = (a.otptmscs || '').toLowerCase()
  if (/배터리|battery|방전/.test(memo)) out.push('battery')
  if (/타이어|tire|펑크/.test(memo)) out.push('tire')
  if (/오일|oil|누유/.test(memo)) out.push('oil')
  if (/잠김|키.*분실|lock/.test(memo)) out.push('lock')
  if (a.otptacrn === 'N' || /견인|tow|이동/.test(memo)) out.push('move')
  if (/긴급|help|출동/.test(memo)) out.push('help')
  return out
}

const fmtDate = (s: string | null) => {
  if (!s || s.length < 8) return ''
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}
const fmtTime = (s: string | null) => {
  if (!s || s.length < 4) return ''
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`
}

export default function MatchMain() {
  const [accidents, setAccidents] = useState<AccidentRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<AccidentRow | null>(null)

  // 추천 결과
  const [recommending, setRecommending] = useState(false)
  const [recommendError, setRecommendError] = useState<string | null>(null)
  const [recs, setRecs] = useState<ScoredFactory[]>([])
  const [origin, setOrigin] = useState<{ lat: number; lng: number; matched: string } | null>(null)

  // 사고 목록 로드
  const loadAccidents = useCallback(async () => {
    setLoading(true)
    setConnectionError(null)
    try {
      const auth = await getAuthHeader()
      const sp = new URLSearchParams({ limit: '100' })
      if (q.trim()) sp.set('q', q.trim())
      const res = await fetch(`/factory-search/api/cafe24-accidents?${sp}`, { headers: auth, cache: 'no-store' })
      const json = await res.json()
      if (json?.success) {
        setAccidents(json.data || [])
        setTotal(json.total || 0)
      } else {
        setConnectionError(json?.error || '카페24 연결 실패')
        setAccidents([])
        setTotal(0)
      }
    } catch (e: unknown) {
      setConnectionError(e instanceof Error ? e.message : '카페24 연결 실패')
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => { loadAccidents() }, [loadAccidents])

  // 사고 선택 → 자동 공장 추천
  const recommend = useCallback(async (acc: AccidentRow) => {
    setRecommending(true)
    setRecommendError(null)
    setRecs([])
    setOrigin(null)
    try {
      // 1) 사고 주소 → 좌표
      let coord: { lat: number; lng: number } | null = null
      if (acc.otptacad) {
        try { coord = await geocode(acc.otptacad) } catch { /* fallback */ }
      }
      if (coord) setOrigin({ ...coord, matched: acc.otptacad || '' })

      // 2) 매칭 컨텍스트
      const repairKeys = inferRepairKeys(acc)
      const vehicleKey = inferVehicleKey(acc.cars_model)
      const accidentTypeKey = acc.otptacbn || undefined

      // 3) 추천 API 호출
      const auth = await getAuthHeader()
      const res = await fetch('/factory-search/api/recommend', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accident: {
            address: acc.otptacad,
            lat: coord?.lat,
            lng: coord?.lng,
            vehicleKey,
            accidentTypeKey,
            repairKeys,
            // capitalKey 추후 보강: 사고의 cust_name → axis 'capital' item.key 매핑 룩업 필요
          },
          limit: 5,
        }),
      })
      const json = await res.json()
      if (json?.success) {
        setRecs(json.data?.factories || [])
      } else {
        setRecommendError(json?.error || '추천 실패')
      }
    } catch (e: unknown) {
      setRecommendError(e instanceof Error ? e.message : '추천 실패')
    } finally {
      setRecommending(false)
    }
  }, [])

  const handleSelect = (acc: AccidentRow) => {
    setSelected(acc)
    recommend(acc)
  }

  const stats = useMemo(() => {
    const top = recs[0]
    return {
      total,
      selected: selected ? 1 : 0,
      topScore: top ? top.score.toFixed(2) : '-',
      topName: top?.factname || '-',
    }
  }, [recs, total, selected])

  return (
    <ScreenWrap>
      <PageHeader
        breadcrumb={['Employee of Ride Inc.', '협력공장 추천', '사고 매칭']}
        title="사고 매칭"
        emoji="🔎"
      />
      <SubNav />

      <KpiRow>
        <KpiCard label="카페24 사고" value={stats.total} tone="emerald" icon="🚨" hint="aceesosh + pmccarsm" />
        <KpiCard label="선택" value={stats.selected ? selected?.otptidno || '-' : '-'} tone="blue" icon="📋" />
        <KpiCard label="추천 Top1" value={stats.topName} tone="violet" icon="🏆" hint={stats.topScore !== '-' ? `점수 ${stats.topScore}` : ''} />
        <KpiCard label="추천 공장" value={recs.length} tone="amber" icon="🔧" />
      </KpiRow>

      <div style={{
        padding: '8px 24px 24px',
        display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16,
      }}>
        {/* 좌측 — 사고 검색·목록 */}
        <aside style={{ ...GLASS.L4, borderRadius: 12, overflow: 'hidden', height: 'calc(100vh - 320px)', minHeight: 500, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${COLORS.borderSubtle}`, display: 'flex', gap: 8 }}>
            <TextInput
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadAccidents()}
              placeholder="사고번호·차량번호·메모 검색"
            />
            <Button variant="secondary" size="sm" onClick={loadAccidents} disabled={loading}>조회</Button>
          </div>
          <div style={{ padding: '8px 12px', fontSize: 11, color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.borderFaint}` }}>
            {loading ? '불러오는 중…' : connectionError ? `❌ ${connectionError}` : `총 ${total.toLocaleString()}건 (최근 100건 표시)`}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <Spinner label="카페24 사고 불러오는 중..." /> : accidents.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
                {connectionError ? '카페24 연결 확인' : '검색 결과 없음'}
              </div>
            ) : accidents.map(a => {
              const isActive = selected
                && selected.otptidno === a.otptidno
                && selected.otptmddt === a.otptmddt
                && selected.otptsrno === a.otptsrno
              return (
                <button
                  key={`${a.otptidno}-${a.otptmddt}-${a.otptsrno}`}
                  onClick={() => handleSelect(a)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 14px',
                    background: isActive ? COLORS.bgBlue : 'transparent',
                    borderLeft: `3px solid ${isActive ? COLORS.primary : 'transparent'}`,
                    borderTop: 'none', borderRight: 'none',
                    borderBottom: `1px solid ${COLORS.borderFaint}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? COLORS.primary : COLORS.textPrimary }}>
                      {a.cars_no || a.otptidno}
                    </span>
                    {a.otptacbn && <span style={pillStyle('warning')}>{a.otptacbn}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                    {fmtDate(a.otptmddt)} {fmtTime(a.otptactm)}
                    {a.cars_model && ` · ${a.cars_model}`}
                  </div>
                  {a.otptacad && (
                    <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      📍 {a.otptacad}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </aside>

        {/* 우측 — 선택 사고 + 추천 */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!selected ? (
            <div style={{ ...GLASS.L4, borderRadius: 12, padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🚨</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textSecondary }}>좌측에서 사고를 선택하세요</div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>선택 즉시 거리·고객사·상품·차종·정비 종류로 추천 공장을 자동 산출합니다.</div>
            </div>
          ) : (
            <>
              {/* 선택 사고 헤더 */}
              <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>
                      🚨 {selected.cars_no || selected.otptidno} {selected.cars_model && `· ${selected.cars_model}`}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                      {fmtDate(selected.otptmddt)} {fmtTime(selected.otptactm)} · 사고유형 {selected.otptacbn || '?'} · 처리상태 {selected.otptrgst || '?'}
                    </div>
                    {selected.otptacad && (
                      <div style={{ fontSize: 12, color: COLORS.textPrimary, marginTop: 4 }}>📍 {selected.otptacad}</div>
                    )}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {inferRepairKeys(selected).map(k => (
                        <span key={k} style={pillStyle('info')}>{k}</span>
                      ))}
                      {(() => {
                        const v = inferVehicleKey(selected.cars_model)
                        return v ? <span style={pillStyle('warning')}>{v}</span> : null
                      })()}
                    </div>
                    {selected.otptmscs && (
                      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.4, maxWidth: 600 }}>
                        💬 {selected.otptmscs.length > 200 ? selected.otptmscs.slice(0, 200) + '…' : selected.otptmscs}
                      </div>
                    )}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => recommend(selected)} disabled={recommending}>
                    {recommending ? '추천 중…' : '🔄 다시 추천'}
                  </Button>
                </div>
                {origin && (
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
                    좌표: {origin.lat.toFixed(5)}, {origin.lng.toFixed(5)}
                  </div>
                )}
              </div>

              {/* 추천 결과 */}
              {recommendError && (
                <div style={{ ...GLASS.L4, borderRadius: 12, padding: 16, color: COLORS.danger, fontSize: 13 }}>
                  ⚠ {recommendError}
                </div>
              )}
              {recommending ? (
                <Spinner label="추천 공장 산출 중..." />
              ) : recs.length === 0 ? (
                <div style={{ ...GLASS.L4, borderRadius: 12, padding: 32, textAlign: 'center', fontSize: 13, color: COLORS.textMuted }}>
                  추천 결과 없음 — 사고 주소가 비어있거나 좌표 변환 실패
                </div>
              ) : (
                <Section title={`🏆 추천 공장 Top ${recs.length}`} color={COLORS.borderBlue}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {recs.map((f, idx) => (
                      <div key={f.factcode} style={{
                        ...GLASS.L3, background: idx === 0 ? COLORS.bgBlue : '#fff',
                        border: `1px solid ${idx === 0 ? COLORS.borderBlue : COLORS.borderFaint}`,
                        borderRadius: 10, padding: '10px 14px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <div>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 22, height: 22, borderRadius: '50%',
                              background: idx === 0 ? COLORS.primary : COLORS.bgGray,
                              color: idx === 0 ? '#fff' : COLORS.textMuted,
                              fontSize: 11, fontWeight: 800, marginRight: 8,
                            }}>{idx + 1}</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>{f.factname}</span>
                            <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 6, fontFamily: 'monospace' }}>{f.factcode}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.primary }}>
                              {f.score.toFixed(2)}
                            </div>
                            {f.distanceKm !== null && (
                              <div style={{ fontSize: 11, color: COLORS.textSecondary }}>
                                📍 {f.distanceKm.toFixed(1)}km
                              </div>
                            )}
                          </div>
                        </div>
                        {f.factaddr && (
                          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>{f.factaddr}</div>
                        )}
                        {/* 점수 분해 */}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, fontSize: 10 }}>
                          {(['distance', 'capital', 'manageType', 'vehicle', 'accidentType', 'repair'] as const).map(k => {
                            const v = f.breakdown[k]
                            if (v === 0) return null
                            const labels: Record<string, string> = {
                              distance: '거리', capital: '고객사', manageType: '상품',
                              vehicle: '차종', accidentType: '사고유형', repair: '정비',
                            }
                            return (
                              <span key={k} style={{
                                padding: '2px 6px', borderRadius: 4,
                                background: COLORS.bgBlue, color: COLORS.primary,
                                fontWeight: 700,
                              }}>
                                {labels[k]} +{v.toFixed(2)}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <div style={{ ...GLASS.L2, borderRadius: 12, padding: 12, fontSize: 11, color: COLORS.textMuted, lineHeight: 1.6 }}>
                💡 점수 = 거리(35%) + 고객사(15%) + 상품(15%) + 차종(10%) + 사고유형(10%) + 정비종류(15%).
                고객사·상품·차종·사고유형·정비 일치는 <a href="/factory-search/mapping" style={{ color: COLORS.primary }}>매핑</a>에서 공장에 부여한 분류로 판정.
                매핑이 비어있으면 거리만 작동.
              </div>
            </>
          )}
        </main>
      </div>
    </ScreenWrap>
  )
}

'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Button, Cell, Field, FilterPill, KpiCard, KpiRow, PageHeader, ScreenWrap,
  Section, Select, Spinner, StatusBadge, TextInput,
} from '../_components/ui'
import { ensureKakao, geocode } from '../_lib/kakao'
import { fPhone } from '../_lib/format'

// ───────────────────────────────────────────────────────────────
// 사고 접수 → 추천 공장 + 카카오맵 길찾기 deeplink
// 1. 캐피탈사 + 입고방식 + 차량종류 + 사고주소 + 반경 입력
// 2. 주소 geocode → 좌표 변환
// 3. /factory-search/api/factories 에서 보험·태그 필터로 매칭
// 4. Haversine 거리 계산 → 가까운 순 정렬 → 카드 + 길찾기
// ───────────────────────────────────────────────────────────────

type Insurance = { mg: boolean | null; turnkey: boolean | null; meritz: boolean | null; autohands: boolean | null }
type Factory = {
  factcode: string
  factname: string
  factaddr?: string
  facthpno?: string | null
  facttelo?: string | null
  lat?: number
  lng?: number
  insurance?: Insurance
  tags?: string[]
  groups?: string[]
  terminated?: boolean
  rawName?: string
  // 계산 필드
  distanceKm?: number
  durationMin?: number
  durationLabel?: string
  // 카카오 모빌리티 실시간
  realDistanceKm?: number
  realDurationMin?: number
  realDurationLabel?: string
  realFetched?: boolean
}

type CapitalKey = '' | 'mg' | 'meritz' | 'autohands' | 'samsung' | 'etc'
type IntakeKey = '' | 'turnkey' | 'mg' | 'meritz'
type VehicleKey = 'general' | 'foreign' | 'tesla'

const CAPITALS: { value: CapitalKey; label: string; insuranceKey?: 'mg' | 'meritz' | 'autohands' }[] = [
  { value: '', label: '선택 안 함 (전체)' },
  { value: 'mg', label: 'MG손해보험', insuranceKey: 'mg' },
  { value: 'meritz', label: '메리츠화재', insuranceKey: 'meritz' },
  { value: 'autohands', label: '오토핸즈', insuranceKey: 'autohands' },
  { value: 'samsung', label: '삼성카드' },
  { value: 'etc', label: '기타' },
]

const INTAKE_METHODS: { value: IntakeKey; label: string; insuranceKey?: 'turnkey' | 'mg' | 'meritz' }[] = [
  { value: '', label: '자율 (모두 가능)' },
  { value: 'turnkey', label: '턴키', insuranceKey: 'turnkey' },
  { value: 'mg', label: 'MG 실비', insuranceKey: 'mg' },
  { value: 'meritz', label: '메리츠 실비', insuranceKey: 'meritz' },
]

const VEHICLE_TYPES: { value: VehicleKey; label: string }[] = [
  { value: 'general', label: '🚙 일반 차량' },
  { value: 'foreign', label: '🚗 외제차' },
  { value: 'tesla', label: '🔋 테슬라' },
]

const RADIUS_OPTIONS = [
  { value: '5', label: '5 km 이내' },
  { value: '10', label: '10 km 이내' },
  { value: '20', label: '20 km 이내 (권장)' },
  { value: '50', label: '50 km 이내' },
  { value: '100', label: '100 km 이내' },
]

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

// 추정 운전 시간 — 직선거리 × 1.3 (도로 굽이) ÷ 평균 시속(시내+외곽 가중)
// 정확한 실시간 ETA는 카카오맵 길찾기 버튼으로
function estimateDuration(distanceKm: number): { mins: number; label: string } {
  const realKm = distanceKm * 1.3
  // 평균 시속: 5km 이내(시내) 25 / 5~20km 35 / 20~50km 50 / 50km+ 70
  const avgKmh = distanceKm < 5 ? 25 : distanceKm < 20 ? 35 : distanceKm < 50 ? 50 : 70
  const mins = Math.round((realKm / avgKmh) * 60)
  if (mins < 60) return { mins, label: `약 ${mins}분` }
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return { mins, label: m === 0 ? `약 ${h}시간` : `약 ${h}시간 ${m}분` }
}

function directionsUrl(origin: { lat: number; lng: number } | null, f: Factory) {
  if (!origin || typeof f.lat !== 'number' || typeof f.lng !== 'number') return '#'
  const sName = '사고지점'
  const eName = encodeURIComponent(f.factname || '도착지')
  return `https://map.kakao.com/link/from/${sName},${origin.lat},${origin.lng}/to/${eName},${f.lat},${f.lng}`
}

function placeUrl(f: Factory) {
  // 카카오맵 장소 페이지 (placeId 가 있는 즐겨찾기 항목)
  const id = f.factcode?.startsWith('K') ? f.factcode.slice(1) : null
  if (id) return `https://place.map.kakao.com/${id}`
  return `https://map.kakao.com/?q=${encodeURIComponent(f.factname || '')}`
}

export default function IntakeMain() {
  const [capital, setCapital] = useState<CapitalKey>('')
  const [intakeMethod, setIntakeMethod] = useState<IntakeKey>('')
  const [vehicleType, setVehicleType] = useState<VehicleKey>('general')
  const [address, setAddress] = useState('')
  const [radius, setRadius] = useState('20')
  const [origin, setOrigin] = useState<{ lat: number; lng: number; matched: string } | null>(null)
  const [results, setResults] = useState<Factory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  // 미니 지도
  const miniMapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const miniMapInst = useRef<any>(null)

  const search = useCallback(async () => {
    setError(null)
    if (!address.trim()) { setError('사고 주소를 입력하세요'); return }
    setLoading(true)
    setSearched(true)
    setResults([])
    try {
      // 1) 주소 → 좌표
      const o = await geocode(address.trim())
      if (!o) {
        setError('주소에서 좌표를 찾을 수 없습니다. 도로명 주소로 입력해보세요.')
        setLoading(false); return
      }
      setOrigin({ ...o, matched: address.trim() })

      // 2) 보험사 필터 (AND)
      const requiredInsurance = new Set<string>()
      const cap = CAPITALS.find(c => c.value === capital)
      if (cap?.insuranceKey) requiredInsurance.add(cap.insuranceKey)
      const im = INTAKE_METHODS.find(m => m.value === intakeMethod)
      if (im?.insuranceKey) requiredInsurance.add(im.insuranceKey)

      const params = new URLSearchParams({ limit: '1000', onlyGeocoded: '1' })
      if (requiredInsurance.size) params.set('insurance', [...requiredInsurance].join(','))
      const res = await fetch(`/factory-search/api/factories?${params}`).then(r => r.json())
      let list: Factory[] = res?.data || []

      // ── 등록된 공장만 (즐겨찾기 = factcode 가 K로 시작) ──
      // 시드 더미(F0001 등) 제외
      list = list.filter(f => f.factcode?.startsWith('K'))

      // 3) 차량 종류 필터
      if (vehicleType === 'tesla') {
        list = list.filter(f => f.tags?.includes('tesla-only'))
      } else if (vehicleType === 'foreign') {
        list = list.filter(f => !f.tags?.includes('tesla-only'))
      } else {
        list = list.filter(f => !f.tags?.includes('tesla-only') && !f.tags?.includes('foreign-only'))
      }
      // 종료 / 배정불가 제외
      list = list.filter(f => !f.terminated && !f.tags?.includes('unassignable'))

      // 4) 거리 + 추정 시간 — 가까운 3개만 (반경 제한 X, 등록 기준이 우선)
      const ranked = list
        .filter(f => typeof f.lat === 'number' && typeof f.lng === 'number')
        .map(f => {
          const distanceKm = haversineKm(o, { lat: f.lat as number, lng: f.lng as number })
          const dur = estimateDuration(distanceKm)
          return { ...f, distanceKm, durationMin: dur.mins, durationLabel: dur.label }
        })
        .sort((a, b) => (a.distanceKm as number) - (b.distanceKm as number))
        .slice(0, 3)

      setResults(ranked)

      // 5) 카카오 모빌리티 실시간 길찾기 — Top 3 만 병렬 호출
      Promise.all(ranked.map(async f => {
        try {
          const url = `/factory-search/api/directions?origin=${o.lng},${o.lat}&destination=${f.lng},${f.lat}`
          const dr = await fetch(url).then(r => r.json())
          if (!dr?.success) return f
          const m = dr.data.distanceMeters
          const s = dr.data.durationSeconds
          const realKm = m / 1000
          const realMins = Math.round(s / 60)
          const realLabel = realMins < 60
            ? `약 ${realMins}분`
            : `약 ${Math.floor(realMins / 60)}시간 ${realMins % 60}분`
          return {
            ...f,
            realDistanceKm: realKm,
            realDurationMin: realMins,
            realDurationLabel: realLabel,
            realFetched: true,
          }
        } catch {
          return f
        }
      })).then(updated => setResults(updated))

      // 5) 미니 지도에 사고지점 + 추천 공장 표시
      ensureKakao().then(k => {
        if (!miniMapRef.current) return
        if (!miniMapInst.current) {
          miniMapInst.current = new k.maps.Map(miniMapRef.current, {
            center: new k.maps.LatLng(o.lat, o.lng),
            level: 6,
          })
        }
        const map = miniMapInst.current
        // 모든 마커 제거
        // (간단 구현: 매번 새 마커, 이전 것은 GC)
        const bounds = new k.maps.LatLngBounds()
        const accidentSvg = encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path d="M16 0C7.16 0 0 7.16 0 16c0 10.85 16 24 16 24s16-13.15 16-24C32 7.16 24.84 0 16 0z" fill="#dc2626"/><text x="16" y="21" text-anchor="middle" font-size="14" font-weight="bold" fill="white">!</text></svg>`
        )
        new k.maps.Marker({
          map,
          position: new k.maps.LatLng(o.lat, o.lng),
          image: new k.maps.MarkerImage(`data:image/svg+xml;charset=utf-8,${accidentSvg}`, new k.maps.Size(32, 40), { offset: new k.maps.Point(16, 40) }),
          zIndex: 10,
        })
        bounds.extend(new k.maps.LatLng(o.lat, o.lng))
        for (const f of ranked) {
          const pos = new k.maps.LatLng(f.lat as number, f.lng as number)
          new k.maps.Marker({ map, position: pos, title: f.factname })
          bounds.extend(pos)
        }
        if (ranked.length > 0) map.setBounds(bounds)
      }).catch(() => { /* 지도 미니맵 실패는 비치명 */ })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '검색 실패')
    } finally {
      setLoading(false)
    }
  }, [address, capital, intakeMethod, vehicleType, radius])

  const stats = useMemo(() => {
    const r0 = results[0]
    const rL = results.at(-1)
    const realKm0 = r0?.realDistanceKm ?? r0?.distanceKm
    const realKmL = rL?.realDistanceKm ?? rL?.distanceKm
    const realMin0 = r0?.realDurationLabel ?? r0?.durationLabel ?? '-'
    return {
      total: results.length,
      nearest: realKm0 ? `${realKm0.toFixed(1)}km` : '-',
      nearestMins: realMin0,
      farthest: realKmL ? `${realKmL.toFixed(1)}km` : '-',
      realFetched: results.every(r => r.realFetched),
    }
  }, [results])

  const insuranceTags = (ins?: Insurance) => {
    if (!ins) return null
    const ok: string[] = []
    if (ins.mg) ok.push('MG')
    if (ins.turnkey) ok.push('턴키')
    if (ins.meritz) ok.push('메리츠')
    if (ins.autohands) ok.push('오토핸즈')
    return ok
  }

  return (
    <ScreenWrap>
      <PageHeader
        breadcrumb={['Employee of Ride Inc.', '사고 접수 추천']}
        title="사고 접수 → 추천 공장"
        emoji="🚨"
      />

      <KpiRow>
        <KpiCard label="추천 공장" value={stats.total} tone="emerald" icon="🔧" hint="등록 즐겨찾기 중 가까운 3곳" />
        <KpiCard label="최단 거리" value={stats.nearest} tone="blue" icon="📍" hint={stats.nearestMins} />
        <KpiCard label="최장 거리" value={stats.farthest} tone="amber" icon="📏" />
        <KpiCard label="실시간 길찾기" value={stats.realFetched && stats.total > 0 ? '연결됨' : '대기'} tone={stats.realFetched && stats.total > 0 ? 'emerald' : 'slate'} icon="🚗" hint="카카오 모빌리티" />
      </KpiRow>

      {/* 입력 폼 */}
      <div className="px-6 pb-3">
        <div className="bg-white rounded-2xl ring-1 ring-slate-200 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="캐피탈사 / 보험사">
              <Select
                value={capital}
                onChange={e => setCapital(e.target.value as CapitalKey)}
                options={CAPITALS.map(c => ({ value: c.value, label: c.label }))}
              />
            </Field>
            <Field label="입고 방식">
              <Select
                value={intakeMethod}
                onChange={e => setIntakeMethod(e.target.value as IntakeKey)}
                options={INTAKE_METHODS.map(m => ({ value: m.value, label: m.label }))}
              />
            </Field>
            <Field label="차량 종류">
              <div className="flex gap-2">
                {VEHICLE_TYPES.map(v => (
                  <FilterPill key={v.value} active={vehicleType === v.value} onClick={() => setVehicleType(v.value)}>
                    {v.label}
                  </FilterPill>
                ))}
              </div>
            </Field>
            <Field label="검색 반경">
              <Select
                value={radius}
                onChange={e => setRadius(e.target.value)}
                options={RADIUS_OPTIONS}
              />
            </Field>
          </div>

          <div className="mt-4 flex gap-3 items-end">
            <div className="flex-1">
              <Field label="사고 주소" required hint="도로명 주소 권장. 예) 서울 강남구 테헤란로 123">
                <TextInput
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && search()}
                  placeholder="예: 서울 강남구 강남대로 354"
                />
              </Field>
            </div>
            <Button variant="primary" size="lg" onClick={search} disabled={loading}>
              {loading ? '검색 중…' : '🔍 추천 공장 찾기'}
            </Button>
          </div>

          {error && (
            <div className="mt-3 text-[12px] bg-red-50 text-red-700 ring-1 ring-red-200 rounded-lg px-3 py-2">
              ⚠ {error}
            </div>
          )}
          {origin && !loading && !error && (
            <div className="mt-3 text-[11px] text-slate-500">
              📍 검색된 좌표: {origin.lat.toFixed(5)}, {origin.lng.toFixed(5)} ({origin.matched})
            </div>
          )}
        </div>
      </div>

      {/* 결과: 좌측 리스트 + 우측 미니 지도 */}
      <div className="px-6 pb-8 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        <div>
          {loading ? (
            <Spinner label="추천 공장 검색 중..." />
          ) : !searched ? (
            <div className="bg-white rounded-2xl ring-1 ring-slate-200 p-10 text-center">
              <div className="text-[36px] mb-3">🚗💨</div>
              <div className="text-[14px] font-bold text-slate-700">사고 정보를 입력하면</div>
              <div className="text-[12px] text-slate-500 mt-1">반경 안의 매칭 협력 공장을 거리 순으로 추천합니다.</div>
            </div>
          ) : results.length === 0 ? (
            <div className="bg-white rounded-2xl ring-1 ring-slate-200 p-10 text-center">
              <div className="text-[36px] mb-3">😶</div>
              <div className="text-[14px] font-bold text-slate-700">조건에 맞는 등록 공장이 없습니다</div>
              <div className="text-[12px] text-slate-500 mt-2 leading-6">
                다음 중 하나를 시도해보세요:<br />
                · 보험/차량 조건을 완화합니다<br />
                · <b className="text-amber-700">즐겨찾기 공장 좌표 등록 필요</b> — REST API 키로 <code className="bg-slate-100 px-1 rounded">scripts/geocode-factories.mjs</code> 실행
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((f, idx) => {
                const tagsOK = insuranceTags(f.insurance) || []
                return (
                  <article key={f.factcode} className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 hover:shadow-sm transition">
                    <header className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-bold w-5 h-5 rounded-full bg-blue-600 text-white inline-flex items-center justify-center">{idx + 1}</span>
                          <h3 className="text-[14px] font-bold text-slate-900 truncate">{f.factname}</h3>
                        </div>
                        <p className="text-[12px] text-slate-500 truncate">{f.factaddr || '-'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {f.realFetched ? (
                          <>
                            <div className="text-[18px] font-bold text-blue-700 leading-none">
                              {f.realDistanceKm?.toFixed(1)}<span className="text-[12px] font-medium text-slate-400 ml-0.5">km</span>
                            </div>
                            <div className="text-[11px] font-semibold text-emerald-700 mt-0.5">🚗 {f.realDurationLabel}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">실시간 · {f.factcode}</div>
                          </>
                        ) : (
                          <>
                            <div className="text-[18px] font-bold text-slate-400 leading-none">
                              {f.distanceKm?.toFixed(1)}<span className="text-[12px] font-medium text-slate-400 ml-0.5">km</span>
                            </div>
                            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">⏱ {f.durationLabel} (추정)</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{f.factcode}</div>
                          </>
                        )}
                      </div>
                    </header>

                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {tagsOK.map(t => <StatusBadge key={t} tone="ok">{t}</StatusBadge>)}
                      {f.tags?.map(t => (
                        <StatusBadge key={t} tone={t === 'tesla-only' ? 'danger' : t === 'foreign-only' ? 'info' : 'cyan'}>
                          {tagDisplay(t)}
                        </StatusBadge>
                      ))}
                      {f.facthpno && <span className="text-[12px] text-blue-700 ml-auto">{fPhone(f.facthpno)}</span>}
                    </div>

                    <div className="flex gap-2 mt-3">
                      <a href={directionsUrl(origin, f)} target="_blank" rel="noopener noreferrer"
                         className="inline-flex items-center justify-center gap-1.5 flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                        🚗 카카오맵 길찾기
                      </a>
                      <a href={placeUrl(f)} target="_blank" rel="noopener noreferrer"
                         className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold rounded-lg bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 transition-colors">
                        📍 카카오맵
                      </a>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        {/* 미니 지도 */}
        <aside className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden h-[500px] sticky top-4">
          <div className="px-4 py-3 border-b border-slate-200 text-[12px] font-bold text-slate-700">
            🗺️ 위치 미리보기
          </div>
          <div ref={miniMapRef} className="w-full h-[calc(100%-44px)]" />
          {!searched && (
            <div className="absolute inset-0 flex items-center justify-center text-[12px] text-slate-400 pointer-events-none">
              검색 후 표시
            </div>
          )}
        </aside>
      </div>
    </ScreenWrap>
  )
}

function tagDisplay(t: string) {
  switch (t) {
    case 'tesla-only': return '🔋 테슬라전용'
    case 'foreign-only': return '🚗 외제차'
    case 'samsung-card': return '💳 삼성카드'
    case 'samsung-return': return '↩ 삼성반납'
    case 'samsung-pyeongtaek': return '🏭 삼성평택'
    case 'hyundai-bluehands': return '🛠 블루핸즈'
    case 'kia-autoq': return '🛠 기아오토큐'
    default: return t
  }
}

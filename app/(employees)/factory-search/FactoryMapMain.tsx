'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCodeMaster } from './_hooks/useCodeMaster'
import { ensureKakao } from './_lib/kakao'
import { Cell, FilterPill, KpiCard, KpiRow, PageHeader, ScreenWrap, Section, Spinner, StatusBadge, Toolbar } from './_components/ui'
import SubNav from './_components/SubNav'
import { fD, fT, fPhone } from './_lib/format'

// ───────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────
type Insurance = { mg: boolean | null; turnkey: boolean | null; meritz: boolean | null; autohands: boolean | null }
type Factory = {
  factcode: string
  factname: string
  facttype: string
  factregi?: string | null
  facthpno?: string | null
  facttelo?: string | null
  factfaxo?: string | null
  factusnm?: string | null
  factaddr?: string | null
  factbknm?: string | null
  factbkno?: string | null
  factbkus?: string | null
  lat?: number
  lng?: number
  orderCount?: number
  // 즐겨찾기 메타
  placeId?: string
  rawName?: string
  insurance?: Insurance
  tags?: string[]
  groups?: string[]
  terminated?: boolean
}

type InsuranceKey = 'mg' | 'turnkey' | 'meritz' | 'autohands'
const INSURANCE_LABEL: Record<InsuranceKey, string> = {
  mg: 'MG실비',
  turnkey: '턴키',
  meritz: '메리츠',
  autohands: '오토핸즈',
}
const SPECIAL_TAGS: { key: string; label: string }[] = [
  { key: 'tesla-only', label: '🔋 테슬라전용' },
  { key: 'foreign-only', label: '🚗 외제차만' },
  { key: 'hyundai-bluehands', label: '🛠 블루핸즈' },
  { key: 'kia-autoq', label: '🛠 기아오토큐' },
  { key: 'samsung-card', label: '💳 삼성카드' },
]
const GROUP_LABEL: Record<string, string> = {
  'mg-only': 'MG 즐겨찾기',
  'main-incoming': '메인 입고',
  'autohands': '오토핸즈',
  'meritz-only': '메리츠',
  'backup-list': '백업',
  'terminated': '종료공장',
}

type Accident = {
  accidentNo: string
  accidentDate: string
  accidentTime: string
  accidentType: string
  faultRate: string
  accidentLocation: string
  driverName: string
  carPlateNo: string
  status: string
  factcode?: string
  lat?: number
  lng?: number
}

// ───────────────────────────────────────────────────────────────
// Marker palette by FACTTYPE (legacy seed data 호환)
// ───────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  A: '#2563eb', B: '#1d4ed8', C: '#0891b2', D: '#0e7490',
  E: '#a16207', F: '#d97706', G: '#64748b', H: '#9333ea',
  I: '#db2777', J: '#ea580c', K: '#0d9488', L: '#16a34a',
  M: '#dc2626', N: '#0d9488', Z: '#94a3b8',
}

// 카카오 즐겨찾기 기반 마커 컬러 우선순위
function favoriteColor(f: Factory): string {
  if (f.terminated) return '#94a3b8'
  if (f.tags?.includes('tesla-only')) return '#dc2626'
  if (f.tags?.includes('foreign-only')) return '#7c3aed'
  if (f.tags?.includes('samsung-card')) return '#0ea5e9'
  if (f.insurance) {
    const ins = f.insurance
    const okCount = (ins.mg ? 1 : 0) + (ins.turnkey ? 1 : 0) + (ins.meritz ? 1 : 0) + (ins.autohands ? 1 : 0)
    if (okCount === 4) return '#10b981'   // 모두 OK
    if (ins.autohands) return '#16a34a'
    if (ins.mg) return '#2563eb'
    if (ins.turnkey) return '#a855f7'
    if (ins.meritz) return '#f97316'
  }
  if (f.tags?.includes('hyundai-bluehands')) return '#06b6d4'
  if (f.tags?.includes('kia-autoq')) return '#d97706'
  return TYPE_COLOR[f.facttype] || '#475569'
}

function svgMarker(color: string, label: string) {
  // 24x32 핀 SVG → data URL
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
       <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 14 22 14 22s14-12.5 14-22C28 6.27 21.73 0 14 0z" fill="${color}"/>
       <circle cx="14" cy="14" r="6" fill="white"/>
       <text x="14" y="17" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="${color}">${label}</text>
     </svg>`
  )
  return `data:image/svg+xml;charset=utf-8,${svg}`
}

const accidentMarker = svgMarker('#dc2626', '!')

// ───────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────
export default function FactoryMapMain() {
  const { decode } = useCodeMaster()

  const [factories, setFactories] = useState<Factory[]>([])
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [loading, setLoading] = useState(true)
  const [showAccidents, setShowAccidents] = useState(true)
  const [selectedType, setSelectedType] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // 즐겨찾기 기반 필터
  const [insuranceFilter, setInsuranceFilter] = useState<Set<InsuranceKey>>(new Set())
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set())
  const [groupFilter, setGroupFilter] = useState<Set<string>>(new Set())
  const [onlyGeocoded, setOnlyGeocoded] = useState(false)
  const [hideTerminated, setHideTerminated] = useState(true)

  const toggleInsurance = (k: InsuranceKey) => setInsuranceFilter(prev => {
    const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next
  })
  const toggleTag = (k: string) => setTagFilter(prev => {
    const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next
  })
  const toggleGroup = (k: string) => setGroupFilter(prev => {
    const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next
  })

  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factoryMarkers = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clusterer = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accidentMarkers = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindow = useRef<any>(null)

  // ── 데이터 로드 ─────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '1000' })
      if (selectedType) p.set('factType', selectedType)
      if (search) p.set('search', search)
      if (insuranceFilter.size) p.set('insurance', [...insuranceFilter].join(','))
      if (tagFilter.size) p.set('tag', [...tagFilter].join(','))
      if (groupFilter.size) p.set('groups', [...groupFilter].join(','))
      if (onlyGeocoded) p.set('onlyGeocoded', '1')
      const [fr, ar] = await Promise.all([
        fetch(`/factory-search/api/factories?${p}`).then(r => r.json()),
        fetch('/factory-search/api/accidents').then(r => r.json()),
      ])
      if (fr?.success) {
        let list: Factory[] = fr.data || []
        if (hideTerminated) list = list.filter(f => !f.terminated)
        setFactories(list)
      }
      if (ar?.success) setAccidents(ar.data || [])
    } finally {
      setLoading(false)
    }
  }, [selectedType, search, insuranceFilter, tagFilter, groupFilter, onlyGeocoded, hideTerminated])

  useEffect(() => { load() }, [load])

  // ── 지도 초기화 ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    if (!process.env.NEXT_PUBLIC_KAKAO_MAP_KEY) {
      setMapError('NEXT_PUBLIC_KAKAO_MAP_KEY가 설정되지 않았습니다 — .env.local에 키를 등록하고 dev 서버를 재시작하세요')
      return
    }
    ensureKakao()
      .then(k => {
        if (cancelled || !mapRef.current) return
        mapInstance.current = new k.maps.Map(mapRef.current, {
          center: new k.maps.LatLng(36.5, 127.8),
          level: 13,
        })
        infoWindow.current = new k.maps.InfoWindow({ removable: true })
        setMapReady(true)
      })
      .catch(e => setMapError(e?.message || '지도 로드 실패'))
    return () => { cancelled = true }
  }, [])

  // ── 공장 마커 + 클러스터링 갱신 ────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return
    const k = window.kakao
    // 클러스터러 1회 생성 (재사용)
    if (!clusterer.current) {
      clusterer.current = new k.maps.MarkerClusterer({
        map: mapInstance.current,
        averageCenter: true,
        minLevel: 4,        // 4레벨 이상에서 클러스터 (좀 더 적극적)
        gridSize: 60,
        disableClickZoom: false,
        styles: [
          { width: '36px', height: '36px', background: 'rgba(37,99,235,0.85)', color: '#fff', borderRadius: '18px', textAlign: 'center', lineHeight: '36px', fontSize: '12px', fontWeight: '700' },
          { width: '46px', height: '46px', background: 'rgba(217,119,6,0.85)', color: '#fff', borderRadius: '23px', textAlign: 'center', lineHeight: '46px', fontSize: '13px', fontWeight: '700' },
          { width: '56px', height: '56px', background: 'rgba(220,38,38,0.85)', color: '#fff', borderRadius: '28px', textAlign: 'center', lineHeight: '56px', fontSize: '14px', fontWeight: '700' },
        ],
        calculator: [10, 30],
      })
    }
    clusterer.current.clear()
    factoryMarkers.current = []

    // ── 같은 좌표(0.0001도, 약 10m) 중복 카운트 ─────────────────
    const dupCounter = new Map<string, number>()
    factories.forEach(f => {
      if (typeof f.lat !== 'number' || typeof f.lng !== 'number') return
      const key = `${f.lat.toFixed(4)},${f.lng.toFixed(4)}`
      dupCounter.set(key, (dupCounter.get(key) ?? 0))
    })

    const bounds = new k.maps.LatLngBounds()
    let added = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newMarkers: any[] = []
    const usedIdx = new Map<string, number>()
    factories.forEach(f => {
      if (typeof f.lat !== 'number' || typeof f.lng !== 'number') return
      // 같은 좌표 → 황금각(137.5°) 회전 + 반경 10~30m 분산
      const key = `${f.lat.toFixed(4)},${f.lng.toFixed(4)}`
      const idx = usedIdx.get(key) ?? 0
      usedIdx.set(key, idx + 1)
      let lat = f.lat
      let lng = f.lng
      if (idx > 0) {
        const angle = (idx * 137.5) * Math.PI / 180
        const r = 0.00012 + idx * 0.00006   // 약 13m + α
        lat += r * Math.sin(angle)
        lng += r * Math.cos(angle)
      }

      const pos = new k.maps.LatLng(lat, lng)
      const color = favoriteColor(f)
      const image = new k.maps.MarkerImage(svgMarker(color, f.facttype || '·'), new k.maps.Size(28, 36), { offset: new k.maps.Point(14, 36) })
      const marker = new k.maps.Marker({ position: pos, image, title: f.factname })
      k.maps.event.addListener(marker, 'click', () => {
        setSelectedCode(f.factcode)
        const ins = f.insurance
        const capChips = ins ? [
          ins.mg && '<span style="background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:600;margin-right:3px">MG</span>',
          ins.turnkey && '<span style="background:#f3e8ff;color:#7c3aed;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:600;margin-right:3px">턴키</span>',
          ins.meritz && '<span style="background:#ffedd5;color:#c2410c;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:600;margin-right:3px">메리츠</span>',
          ins.autohands && '<span style="background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:600;margin-right:3px">오토핸즈</span>',
        ].filter(Boolean).join('') : ''
        const tagChips = (f.tags || []).map(t => {
          const lbl = t === 'tesla-only' ? '🔋 테슬라전용' : t === 'foreign-only' ? '🚗 외제차' : t === 'samsung-card' ? '💳 삼성카드' : t === 'hyundai-bluehands' ? '🛠 블루핸즈' : t === 'kia-autoq' ? '🛠 기아오토큐' : ''
          return lbl ? `<span style="background:#fef3c7;color:#a16207;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:600;margin-right:3px">${lbl}</span>` : ''
        }).join('')
        const html = `
          <div style="padding:10px 12px;min-width:240px;max-width:300px;font-family:inherit">
            <div style="font-weight:700;font-size:13px;color:#0f172a;line-height:1.3">${escapeHtml(f.factname)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">${escapeHtml(f.factcode)}</div>
            ${capChips ? `<div style="margin-top:6px">${capChips}</div>` : ''}
            ${tagChips ? `<div style="margin-top:4px">${tagChips}</div>` : ''}
            <div style="font-size:11px;color:#334155;margin-top:8px">📍 ${escapeHtml(f.factaddr || '')}</div>
            ${f.facthpno || f.facttelo ? `<div style="font-size:11px;color:#2563eb;margin-top:3px">📞 ${escapeHtml(f.facthpno || f.facttelo || '')}</div>` : ''}
          </div>`
        infoWindow.current.setContent(html)
        infoWindow.current.open(mapInstance.current, marker)
      })
      newMarkers.push(marker)
      factoryMarkers.current.push(marker)
      bounds.extend(pos)
      added++
    })
    clusterer.current.addMarkers(newMarkers)
    if (added > 0) mapInstance.current.setBounds(bounds)
  }, [mapReady, factories, decode])

  // ── 사고 마커 갱신 ──────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return
    const k = window.kakao
    accidentMarkers.current.forEach(m => m.setMap(null))
    accidentMarkers.current = []
    if (!showAccidents) return

    const image = new k.maps.MarkerImage(accidentMarker, new k.maps.Size(28, 36), { offset: new k.maps.Point(14, 36) })
    accidents.forEach(a => {
      if (typeof a.lat !== 'number' || typeof a.lng !== 'number') return
      const pos = new k.maps.LatLng(a.lat, a.lng)
      const marker = new k.maps.Marker({ position: pos, image, title: a.accidentNo, zIndex: 5 })
      marker.setMap(mapInstance.current)
      k.maps.event.addListener(marker, 'click', () => {
        const html = `
          <div style="padding:8px 12px;min-width:220px;font-family:inherit">
            <div style="font-weight:700;font-size:13px;color:#dc2626">사고 · ${escapeHtml(a.accidentNo)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">${escapeHtml(fD(a.accidentDate))} ${escapeHtml(fT(a.accidentTime))}</div>
            <div style="font-size:11px;color:#0f172a;margin-top:6px">${escapeHtml(a.accidentLocation)}</div>
            <div style="font-size:11px;color:#334155;margin-top:4px">${escapeHtml(a.driverName)} · ${escapeHtml(a.carPlateNo)}</div>
            <div style="font-size:11px;color:#2563eb;margin-top:4px">${escapeHtml(decode('OTPTACBN', a.accidentType))} · 과실 ${escapeHtml(a.faultRate)}%</div>
          </div>`
        infoWindow.current.setContent(html)
        infoWindow.current.open(mapInstance.current, marker)
      })
      accidentMarkers.current.push(marker)
    })
  }, [mapReady, accidents, showAccidents, decode])

  // ── 파생 상태 ───────────────────────────────────────────────
  const selected = useMemo(
    () => factories.find(f => f.factcode === selectedCode) || null,
    [factories, selectedCode],
  )
  const selectedAccidents = useMemo(
    () => (selected ? accidents.filter(a => a.factcode === selected.factcode) : []),
    [selected, accidents],
  )
  const stats = useMemo(() => {
    const total = factories.length
    const withGeo = factories.filter(f => typeof f.lat === 'number').length
    const withWork = factories.filter(f => (f.orderCount || 0) > 0).length
    return { total, withGeo, withWork, accidents: accidents.length }
  }, [factories, accidents])

  const focusOnFactory = (f: Factory) => {
    setSelectedCode(f.factcode)
    if (!mapReady || typeof f.lat !== 'number' || typeof f.lng !== 'number') return
    const k = window.kakao
    mapInstance.current.setLevel(5)
    mapInstance.current.panTo(new k.maps.LatLng(f.lat, f.lng))
  }

  return (
    <ScreenWrap>
      <PageHeader
        breadcrumb={['Employee of Ride Inc.', '협력공장 추천', '지도']}
        title="지도"
        emoji="🗺️"
      />
      <SubNav />

      <KpiRow>
        <KpiCard label="전체 업체" value={stats.total} tone="emerald" icon="🔧" />
        <KpiCard label="좌표 등록" value={stats.withGeo} tone="blue" icon="📍" />
        <KpiCard label="작업중 업체" value={stats.withWork} tone="violet" icon="⚙️" />
        <KpiCard label="사고 건수" value={stats.accidents} tone="amber" icon="🚨" />
      </KpiRow>

      <Toolbar>
        <select
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
          className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/30 min-w-[180px]"
        >
          <option value="">전체 유형</option>
          {Object.entries({
            A: '공장(일반)', B: '공장(P)', C: '정비업체(일반)', D: '정비업체(정기점검)',
            E: '자동차부품', F: '타이어', G: '기타(임시)', H: '법정검사',
            I: '렌터카(대차)', J: '정비업체(미션)', K: '자동차유리', L: '정비업체(순회)',
            M: '탁송', N: '자동차유리',
          }).map(([k, v]) => (
            <option key={k} value={k}>{k} - {v}</option>
          ))}
        </select>

        <div className="relative flex-1 min-w-[280px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="공장명, 코드, 연락처, 주소 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400"
          />
        </div>

        <button onClick={load} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 shadow-sm">
          조회
        </button>

        <label className="ml-2 inline-flex items-center gap-2 text-sm text-slate-600 select-none">
          <input
            type="checkbox"
            checked={showAccidents}
            onChange={e => setShowAccidents(e.target.checked)}
            className="w-4 h-4 accent-red-600"
          />
          사고 현장 표시
        </label>
      </Toolbar>

      {/* 필터 알약 — 보험사 4축 + 즐겨찾기 그룹 + 특수 태그 */}
      <div className="px-6 pb-3 space-y-2">
        <FilterRow
          label="보험 입고"
          active={insuranceFilter.size > 0}
          onClear={() => setInsuranceFilter(new Set())}
        >
          {(['mg','turnkey','meritz','autohands'] as InsuranceKey[]).map(k => (
            <FilterPill key={k} active={insuranceFilter.has(k)} onClick={() => toggleInsurance(k)}>
              {INSURANCE_LABEL[k]}
            </FilterPill>
          ))}
        </FilterRow>

        <FilterRow
          label="즐겨찾기 그룹"
          active={groupFilter.size > 0}
          onClear={() => setGroupFilter(new Set())}
        >
          {Object.entries(GROUP_LABEL).map(([k, label]) => (
            <FilterPill key={k} active={groupFilter.has(k)} onClick={() => toggleGroup(k)}>
              {label}
            </FilterPill>
          ))}
        </FilterRow>

        <FilterRow
          label="특수"
          active={tagFilter.size > 0}
          onClear={() => setTagFilter(new Set())}
          right={
            <span className="ml-auto inline-flex items-center gap-3 text-[12px] text-slate-600">
              <label className="inline-flex items-center gap-1.5 select-none">
                <input type="checkbox" checked={onlyGeocoded} onChange={e => setOnlyGeocoded(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
                좌표 등록만
              </label>
              <label className="inline-flex items-center gap-1.5 select-none">
                <input type="checkbox" checked={hideTerminated} onChange={e => setHideTerminated(e.target.checked)} className="w-3.5 h-3.5 accent-slate-600" />
                종료 숨김
              </label>
            </span>
          }
        >
          {SPECIAL_TAGS.map(t => (
            <FilterPill key={t.key} active={tagFilter.has(t.key)} onClick={() => toggleTag(t.key)}>
              {t.label}
            </FilterPill>
          ))}
        </FilterRow>
      </div>

      <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        {/* 지도 영역 — 박스 자체에 명시 높이를 줘서 좁은 뷰포트에서도 안 무너지게 */}
        <div className="relative bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden h-[600px] lg:h-[calc(100vh-280px)] lg:min-h-[520px]">
          {mapError && (
            <div className="absolute inset-4 z-10 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-5 max-w-xl m-auto h-fit">
              <div className="font-bold text-sm mb-2">🗝️ 카카오맵 키 필요</div>
              <div className="text-xs leading-relaxed whitespace-pre-line">{mapError}</div>
              <div className="mt-3 text-[11px] text-amber-800">
                1) 카카오 디벨로퍼스 → 앱 키 → JavaScript 키 발급<br />
                2) 프로젝트 루트의 <code className="bg-white px-1 rounded">.env.local</code>에<br />
                <code className="bg-white px-1 rounded">NEXT_PUBLIC_KAKAO_MAP_KEY=발급키</code> 등록<br />
                3) <code className="bg-white px-1 rounded">npm run dev</code> 재시작
              </div>
            </div>
          )}
          <div ref={mapRef} className="absolute inset-0" />
          {!mapError && !mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100/70">
              <Spinner label="지도 로드 중..." />
            </div>
          )}
        </div>

        {/* 우측 패널 */}
        <aside className="bg-white rounded-2xl ring-1 ring-slate-200 flex flex-col overflow-hidden h-[600px] lg:h-[calc(100vh-280px)] lg:min-h-[520px]">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div className="text-[12px] text-slate-500">
              총 <b className="text-slate-800">{factories.length.toLocaleString()}</b>개 업체
              {showAccidents && <> · 사고 <b className="text-red-600">{accidents.length}</b>건</>}
            </div>
            {selected && (
              <button onClick={() => setSelectedCode(null)} className="text-[11px] text-slate-500 hover:text-slate-800">목록으로 ↑</button>
            )}
          </div>

          {selected ? (
            <div className="flex-1 overflow-y-auto p-4">
              {/* 다중 캐피탈 + 그룹 + 태그 — 한눈에 ─────── */}
              {(selected.insurance || (selected.groups?.length ?? 0) > 0 || (selected.tags?.length ?? 0) > 0) && (
                <Section title="입고 가능 / 분류" color="border-blue-500">
                  <div className="space-y-2.5">
                    {selected.insurance && (
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">캐피탈 / 입고 방식</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selected.insurance.mg && <CapBadge tone="blue">MG실비</CapBadge>}
                          {selected.insurance.turnkey && <CapBadge tone="violet">턴키</CapBadge>}
                          {selected.insurance.meritz && <CapBadge tone="orange">메리츠</CapBadge>}
                          {selected.insurance.autohands && <CapBadge tone="green">오토핸즈</CapBadge>}
                          {!selected.insurance.mg && !selected.insurance.turnkey && !selected.insurance.meritz && !selected.insurance.autohands && (
                            <span className="text-[11px] text-slate-400">정보 없음</span>
                          )}
                        </div>
                      </div>
                    )}
                    {(selected.groups?.length ?? 0) > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">즐겨찾기 그룹 ({selected.groups!.length})</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selected.groups!.map(g => (
                            <span key={g} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                              {GROUP_LABEL[g] || g}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {(selected.tags?.length ?? 0) > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">특수 태그</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selected.tags!.map(t => (
                            <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                              {tagLabel(t)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selected.terminated && (
                      <StatusBadge tone="muted">⛔ 종료된 공장</StatusBadge>
                    )}
                  </div>
                </Section>
              )}

              <Section title="공장 정보" color="border-yellow-500">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <Cell label="공장명"><span className="font-bold text-blue-700">{selected.factname}</span></Cell>
                  <Cell label="공장코드">{selected.factcode}</Cell>
                  <Cell label="유형">{decode('FACTTYPE', selected.facttype)}</Cell>
                  <Cell label="사업자번호">{selected.factregi || '-'}</Cell>
                  <Cell label="휴대전화"><span className="text-blue-700">{fPhone(selected.facthpno)}</span></Cell>
                  <Cell label="유선전화">{fPhone(selected.facttelo)}</Cell>
                  <Cell label="팩스">{fPhone(selected.factfaxo)}</Cell>
                  <Cell label="담당자">{selected.factusnm || '-'}</Cell>
                  <Cell label="주소" span={2}>{selected.factaddr || '-'}</Cell>
                  <Cell label="은행">{selected.factbknm || '-'}</Cell>
                  <Cell label="계좌">{selected.factbkno || '-'}</Cell>
                  <Cell label="예금주">{selected.factbkus || '-'}</Cell>
                  <Cell label="배정 작업">
                    <span className="font-bold text-amber-700">{(selected.orderCount || 0).toLocaleString()}건</span>
                  </Cell>
                </div>
              </Section>

              <Section title={`연계 사고 (${selectedAccidents.length})`} color="border-red-500">
                {selectedAccidents.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg">
                    이 공장에 연계된 사고 이력 없음
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedAccidents.map(a => (
                      <div key={a.accidentNo} className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-[11px] text-slate-500">{a.accidentNo}</span>
                          <StatusBadge tone={statusTone(a.status)}>
                            {decode('OTPTSTAT', a.status)}
                          </StatusBadge>
                        </div>
                        <div className="text-[12px] text-slate-700">
                          <span className="font-bold text-blue-700">{a.carPlateNo}</span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          {a.driverName}
                          <span className="mx-1.5 text-slate-300">·</span>
                          {decode('OTPTACBN', a.accidentType)}
                          <span className="mx-1.5 text-slate-300">·</span>
                          과실 {a.faultRate}%
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {fD(a.accidentDate)} {fT(a.accidentTime)} · {a.accidentLocation}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          ) : loading ? (
            <Spinner label="공장 목록 불러오는 중..." />
          ) : (
            <div className="flex-1 overflow-y-auto">
              {factories.map(f => (
                <button
                  key={f.factcode}
                  onClick={() => focusOnFactory(f)}
                  className="w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-blue-50/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 text-[13px] truncate">{f.factname}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: favoriteColor(f) }}
                      title={decode('FACTTYPE', f.facttype)}
                    />
                  </div>
                  {/* 캐피탈 뱃지 */}
                  {f.insurance && (
                    <div className="flex items-center gap-1 mt-1">
                      {f.insurance.mg && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700">MG</span>}
                      {f.insurance.turnkey && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700">턴키</span>}
                      {f.insurance.meritz && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-orange-100 text-orange-700">메리츠</span>}
                      {f.insurance.autohands && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">오토핸즈</span>}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 mt-1 truncate">{f.factaddr || '-'}</div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                    <span className="font-mono">{f.factcode}</span>
                    {f.facthpno && <span className="text-blue-700">{fPhone(f.facthpno)}</span>}
                    {(f.orderCount || 0) > 0 && (
                      <span className="ml-auto inline-flex items-center px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full">
                        {f.orderCount}건
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {factories.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-sm">검색 결과가 없습니다</div>
              )}
            </div>
          )}
        </aside>
      </div>
    </ScreenWrap>
  )
}

// ───────────────────────────────────────────────────────────────
// 보조
// ───────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────
// 다중 캐피탈 표출용 작은 뱃지
// ───────────────────────────────────────────────────────────────
function CapBadge({ tone, children }: { tone: 'blue'|'violet'|'orange'|'green'; children: React.ReactNode }) {
  const map = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    orange: 'bg-orange-50 text-orange-700 ring-orange-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  }
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ring-1 ${map[tone]}`}>
      {children}
    </span>
  )
}

function tagLabel(t: string) {
  switch (t) {
    case 'tesla-only': return '🔋 테슬라전용'
    case 'foreign-only': return '🚗 외제차전용'
    case 'samsung-card': return '💳 삼성카드'
    case 'samsung-return': return '↩ 삼성반납'
    case 'samsung-pyeongtaek': return '🏭 삼성평택'
    case 'hyundai-bluehands': return '🛠 블루핸즈'
    case 'kia-autoq': return '🛠 기아오토큐'
    case 'unassignable': return '🚫 배정불가'
    default: return t
  }
}

// 필터 한 줄 (라벨 + 알약들 + 초기화 버튼)
function FilterRow({ label, active, onClear, children, right }: {
  label: string
  active: boolean
  onClear: () => void
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">{label}</span>
      {children}
      {active && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
          title="이 줄 필터 초기화"
        >
          ↻ 초기화
        </button>
      )}
      {right}
    </div>
  )
}

function statusTone(s: string): 'ok' | 'info' | 'cyan' | 'warn' | 'danger' | 'muted' {
  switch (s) {
    case '1': return 'info'
    case '2': return 'cyan'
    case '3': return 'warn'
    case '4': return 'ok'
    case '5': return 'info'
    case '9': return 'muted'
    default: return 'muted'
  }
}

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Button, KpiCard, KpiRow, PageHeader, ScreenWrap, Section,
  StatusBadge, TextInput,
} from '../_components/ui'
import merged from '../_data/factories-merged.json'
import SubNav from '../_components/SubNav'
import { DEFAULT_AXES, type CodeAxis, type CodeItem } from './defaults'

// ───────────────────────────────────────────────────────────────
// 그룹 구성 — 13축 + 사용자 정의 축
//   메인 (공장 분류 5축): 즐겨찾기 그룹 / 보험 입고 / 공장 유형 / 특수 태그 / 차량 분류
//   부가 (운영·사고 분류 8축, 접기): 정산 / 고객사 / 관리유형 / 사고유형 / 처리상태 / 손해 / 견인 / 서비스
//   사용자 정의 축: 메인 영역에 함께 표출 (사용자가 직접 만든 것이라 우선 노출)
// localStorage('ride_op_classifications_v2') 에 저장
// ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ride_op_classifications_v2'

// 메인 영역에 노출할 기본 axis key 들 (공장 그룹화 핵심)
const PRIMARY_AXIS_KEYS = new Set(['group', 'insurance', 'facttype', 'tag', 'vehicle'])
// 부가 영역(접기)에 노출할 기본 axis key 들 (운영·사고)
const SECONDARY_AXIS_KEYS = new Set(['settlement', 'capital', 'manageType', 'accidentType', 'claimStatus', 'damage', 'towing', 'servicePlan'])

function loadAxes(): CodeAxis[] {
  if (typeof window === 'undefined') return DEFAULT_AXES
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_AXES
    const parsed = JSON.parse(raw) as CodeAxis[]

    // 1) saved 의 순서를 우선 — DEFAULT_AXES 와 saved 를 key 단위 머지
    const byKey = new Map<string, CodeAxis>()
    for (const d of DEFAULT_AXES) byKey.set(d.key, d)

    const result: CodeAxis[] = []
    const seenKeys = new Set<string>()

    for (const s of parsed) {
      const d = byKey.get(s.key)
      if (d) {
        // default axis: items 보강 + 메타 saved 우선
        const items = d.items.map(di => s.items.find(si => si.key === di.key) || di)
        const customItems = s.items.filter(si => !d.items.some(di => di.key === si.key))
        result.push({ ...d, ...s, items: [...items, ...customItems] })
      } else {
        // 사용자 정의 axis
        result.push({ ...s, axisCustom: true })
      }
      seenKeys.add(s.key)
    }
    // saved 에 없는 default axis 추가 (스키마 진화 대응)
    for (const d of DEFAULT_AXES) {
      if (!seenKeys.has(d.key)) result.push(d)
    }
    return result
  } catch { return DEFAULT_AXES }
}

function saveAxes(axes: CodeAxis[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(axes))
}

// 데이터에서 각 코드 값 카운트
function buildCounts(): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = { groups: {}, insurance: {}, facttype: {}, tags: {} }
  for (const f of (merged as { factories: {
    groups?: string[]
    insurance?: { mg?: boolean; turnkey?: boolean; meritz?: boolean; autohands?: boolean }
    tags?: string[]
    facttype?: string
  }[] }).factories) {
    for (const g of f.groups || []) counts.groups[g] = (counts.groups[g] || 0) + 1
    if (f.insurance) {
      if (f.insurance.mg) counts.insurance.mg = (counts.insurance.mg || 0) + 1
      if (f.insurance.turnkey) counts.insurance.turnkey = (counts.insurance.turnkey || 0) + 1
      if (f.insurance.meritz) counts.insurance.meritz = (counts.insurance.meritz || 0) + 1
      if (f.insurance.autohands) counts.insurance.autohands = (counts.insurance.autohands || 0) + 1
    }
    for (const t of f.tags || []) counts.tags[t] = (counts.tags[t] || 0) + 1
    if (f.facttype) counts.facttype[f.facttype] = (counts.facttype[f.facttype] || 0) + 1
  }
  const dom = (merged as { factories: { tags?: string[] }[] }).factories.filter(
    f => !f.tags?.includes('tesla-only') && !f.tags?.includes('foreign-only'),
  ).length
  counts.tags.domestic = dom
  return counts
}

export default function GroupsAdminMain() {
  const [axes, setAxes] = useState<CodeAxis[]>(DEFAULT_AXES)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [activeAxis, setActiveAxis] = useState<string>('group')
  const [showHiddenAxes, setShowHiddenAxes] = useState(false)
  const [showSecondary, setShowSecondary] = useState(false)
  const counts = useMemo(() => buildCounts(), [])
  const totalFactories = (merged as { factories: unknown[] }).factories.length

  useEffect(() => { setAxes(loadAxes()) }, [])

  // ── 항목 단위 ─────────────────────────────────────────
  const updateItem = (axisKey: string, itemKey: string, patch: Partial<CodeItem>) => {
    setAxes(prev => prev.map(a => a.key === axisKey
      ? { ...a, items: a.items.map(i => i.key === itemKey ? { ...i, ...patch } : i) }
      : a))
  }
  const addItem = (axisKey: string) => {
    // eslint-disable-next-line react-hooks/purity
    const newKey = `custom-${Date.now()}`
    setAxes(prev => prev.map(a => a.key === axisKey
      ? { ...a, items: [...a.items, { key: newKey, label: '신규 항목', color: '#64748b', emoji: '✨', hidden: false, description: '' }] }
      : a))
  }
  const removeItem = (axisKey: string, itemKey: string) => {
    setAxes(prev => prev.map(a => a.key === axisKey
      ? { ...a, items: a.items.filter(i => i.key !== itemKey) }
      : a))
  }

  // ── 축 단위 ─────────────────────────────────────────
  const updateAxis = (axisKey: string, patch: Partial<CodeAxis>) => {
    setAxes(prev => prev.map(a => a.key === axisKey ? { ...a, ...patch } : a))
  }
  const addAxis = () => {
    const newKey = `custom-axis-${Date.now()}`
    const newAxis: CodeAxis = {
      key: newKey,
      title: '새 분류 축',
      emoji: '➕',
      description: '운영 정의 분류 축. 라벨/색상/항목 모두 편집 가능.',
      editable: 'all',
      custom: true,
      match: 'custom',
      items: [],
      axisCustom: true,
      axisHidden: false,
    }
    setAxes(prev => [...prev, newAxis])
    setActiveAxis(newKey)
  }
  const removeAxis = (axisKey: string) => {
    const target = axes.find(a => a.key === axisKey)
    if (!target) return
    const isDefault = !target.axisCustom
    const warn = isDefault
      ? `⚠️ 기본 축 "${target.title}" 을 삭제합니다.\n\n그 안의 ${target.items.length}개 항목과 함께 사라지며, 다른 페이지(지도/공장 목록/추천)에서 이 축으로 매핑/필터하던 기능에 영향이 갑니다.\n\n복원: "초기 설정" 버튼.\n\n계속할까요?`
      : `사용자 정의 축 "${target.title}" 을 삭제합니다.\n\n그 안의 ${target.items.length}개 항목도 함께 사라집니다.\n\n계속할까요?`
    if (!confirm(warn)) return
    setAxes(prev => {
      const next = prev.filter(a => a.key !== axisKey)
      if (activeAxis === axisKey) setActiveAxis(next[0]?.key || '')
      return next
    })
  }
  const moveAxis = (axisKey: string, direction: 'up' | 'down') => {
    setAxes(prev => {
      const idx = prev.findIndex(a => a.key === axisKey)
      if (idx === -1) return prev
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  // ── 저장 / 초기화 ─────────────────────────────────────────
  const persist = () => {
    saveAxes(axes)
    setSavedAt(new Date().toLocaleTimeString('ko-KR'))
  }
  const reset = () => {
    if (!confirm('초기 13축 + 항목으로 복원합니다. 사용자 정의 축/항목은 모두 사라집니다. 계속할까요?')) return
    setAxes(DEFAULT_AXES)
    saveAxes(DEFAULT_AXES)
    setSavedAt(new Date().toLocaleTimeString('ko-KR'))
    setActiveAxis(DEFAULT_AXES[0]?.key || '')
  }

  const stats = useMemo(() => ({
    axes: axes.length,
    visibleAxes: axes.filter(a => !a.axisHidden).length,
    totalItems: axes.reduce((s, a) => s + a.items.length, 0),
    visibleItems: axes.reduce((s, a) => s + a.items.filter(i => !i.hidden).length, 0),
    factories: totalFactories,
  }), [axes, totalFactories])

  const getCountFor = (axis: CodeAxis, item: CodeItem): number => {
    if (axis.match === 'groups') return counts.groups[item.key] || 0
    if (axis.match === 'insurance') return counts.insurance[item.key] || 0
    if (axis.match === 'facttype') return counts.facttype[item.key] || 0
    if (axis.match === 'tags') return counts.tags[item.key] || 0
    return 0
  }

  // 표시할 축 목록 (숨김 토글에 따라)
  const visibleAxes = showHiddenAxes ? axes : axes.filter(a => !a.axisHidden)

  // 메인 (공장 분류 5축) + 사용자 정의 축 / 부가 (운영·사고 8축)
  const primaryAxes = visibleAxes.filter(a =>
    PRIMARY_AXIS_KEYS.has(a.key) || (a.axisCustom === true) || (!PRIMARY_AXIS_KEYS.has(a.key) && !SECONDARY_AXIS_KEYS.has(a.key) && !a.axisCustom),
  )
  const secondaryAxes = visibleAxes.filter(a => SECONDARY_AXIS_KEYS.has(a.key))

  // 활성 축이 숨김 처리되거나 사라진 경우 처음 축으로
  const safeActiveAxis = visibleAxes.some(a => a.key === activeAxis)
    ? activeAxis
    : visibleAxes[0]?.key || ''

  return (
    <ScreenWrap>
      <PageHeader
        breadcrumb={['Employee of Ride Inc.', '협력공장 추천', '그룹 구성']}
        title="그룹 구성"
        emoji="🏷"
        right={
          <>
            {savedAt && <span className="text-[11px] text-emerald-600">✓ {savedAt} 저장됨</span>}
            <Button variant="secondary" size="md" onClick={reset}>초기 설정</Button>
            <Button variant="primary" size="md" onClick={persist}>저장</Button>
          </>
        }
      />
      <SubNav />

      <KpiRow>
        <KpiCard label="분류 축" value={`${stats.visibleAxes}/${stats.axes}`} tone="emerald" icon="🧩" hint="표시 / 전체" />
        <KpiCard label="전체 항목" value={stats.totalItems} tone="blue" icon="🏷" />
        <KpiCard label="표시 중 항목" value={stats.visibleItems} tone="violet" icon="👁" />
        <KpiCard label="등록 공장" value={stats.factories} tone="amber" icon="🏭" />
      </KpiRow>

      {/* 축 탭 — 메인(공장 분류) 영역 + 부가(운영·사고) 접기 */}
      <div className="px-6 pb-3 space-y-3">
        {/* 메인 영역 — 공장 분류 + 사용자 정의 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              공장 분류 ({primaryAxes.length})
            </div>
            <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-600 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={showHiddenAxes}
                onChange={e => setShowHiddenAxes(e.target.checked)}
                className="w-3.5 h-3.5 accent-slate-600"
              />
              숨김 축 표시
            </label>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {primaryAxes.map(a => (
              <AxisTab key={a.key} axis={a} active={safeActiveAxis === a.key} onClick={() => setActiveAxis(a.key)} />
            ))}
            <button
              onClick={addAxis}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-[13px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              title="새 분류 축 추가"
            >
              <span>＋</span>
              <span>새 축 추가</span>
            </button>
          </div>
        </div>

        {/* 부가 영역 — 운영·사고 분류 (접기) */}
        {secondaryAxes.length > 0 && (
          <div className="border-l-2 border-slate-200 pl-3">
            <button
              onClick={() => setShowSecondary(s => !s)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-800 transition-colors"
            >
              <span>{showSecondary ? '▾' : '▸'}</span>
              <span>운영·사고 분류 ({secondaryAxes.length})</span>
            </button>
            {showSecondary && (
              <div className="flex gap-2 flex-wrap items-center mt-2">
                {secondaryAxes.map(a => (
                  <AxisTab key={a.key} axis={a} active={safeActiveAxis === a.key} onClick={() => setActiveAxis(a.key)} small />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 활성 축 패널 */}
      <div className="px-6 pb-8">
        {axes.filter(a => a.key === safeActiveAxis).map(axis => {
          const realIdx = axes.findIndex(a => a.key === axis.key)
          return (
            <AxisPanel
              key={axis.key}
              axis={axis}
              index={realIdx}
              total={axes.length}
              getCount={item => getCountFor(axis, item)}
              onUpdateItem={(itemKey, patch) => updateItem(axis.key, itemKey, patch)}
              onAddItem={() => addItem(axis.key)}
              onRemoveItem={itemKey => removeItem(axis.key, itemKey)}
              onUpdateAxis={patch => updateAxis(axis.key, patch)}
              onMoveAxis={dir => moveAxis(axis.key, dir)}
              onRemoveAxis={() => removeAxis(axis.key)}
            />
          )
        })}

        <Section title="셋팅 가이드" color="border-blue-500" defaultOpen={false}>
          <ul className="text-[12px] text-slate-600 space-y-1 list-disc list-inside leading-6">
            <li><b>13개 기본 축 + 사용자 정의 축</b> 모두 동일한 권한 (라벨/색상/이모지/표시/추가/삭제 모두 가능).</li>
            <li><b>키 (READONLY)</b> 는 데이터 매핑 때문에 변경 불가 — 새로 추가한 항목/축은 자유롭게 키 부여 (auto: <code>custom-{`{timestamp}`}</code>).</li>
            <li><b>축 메타</b> (제목/이모지/설명) 은 카드 헤더에서 인플레이스 편집. 순서는 ↑/↓ 버튼.</li>
            <li><b>숨김 축</b> 은 기본 탭에서 안 보이고, 「숨김 축 표시」 체크 시 흐리게 노출.</li>
            <li><b>삭제</b> 는 사용자 정의 축만 가능 (기본 13축은 데이터 매핑 보호).</li>
            <li><b>저장</b> 은 브라우저 localStorage 보관 — 메인 ERP 코드 마스터 동기화는 별도 단계.</li>
          </ul>
        </Section>
      </div>
    </ScreenWrap>
  )
}

// ───────────────────────────────────────────────────────────────
// AxisTab — 축 탭 칩 (메인/부가 공통)
// ───────────────────────────────────────────────────────────────
function AxisTab({ axis, active, onClick, small }: {
  axis: CodeAxis
  active: boolean
  onClick: () => void
  small?: boolean
}) {
  const padX = small ? 'px-3 py-1.5' : 'px-4 py-2'
  const fontSize = small ? 'text-[12px]' : 'text-[13px]'
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 ${padX} rounded-full ${fontSize} font-semibold transition-colors
        ${active
          ? 'bg-slate-900 text-white'
          : 'bg-white text-slate-600 hover:bg-slate-50 ring-1 ring-slate-200'}
        ${axis.axisHidden ? 'opacity-50' : ''}`}
    >
      <span>{axis.emoji}</span>
      <span>{axis.title}</span>
      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md
        ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
        {axis.items.length}
      </span>
      {axis.axisHidden && <span className="text-[10px]">🚫</span>}
    </button>
  )
}

// ───────────────────────────────────────────────────────────────
// AxisPanel — 한 축의 메타 + 항목들 편집
// ───────────────────────────────────────────────────────────────
function AxisPanel({ axis, index, total, getCount, onUpdateItem, onAddItem, onRemoveItem, onUpdateAxis, onMoveAxis, onRemoveAxis }: {
  axis: CodeAxis
  index: number
  total: number
  getCount: (item: CodeItem) => number
  onUpdateItem: (key: string, patch: Partial<CodeItem>) => void
  onAddItem: () => void
  onRemoveItem: (key: string) => void
  onUpdateAxis: (patch: Partial<CodeAxis>) => void
  onMoveAxis: (dir: 'up' | 'down') => void
  onRemoveAxis: () => void
}) {
  const labelEditable = axis.editable === 'all' || axis.editable === 'label-only'
  const colorEditable = axis.editable === 'all'
  const emojiEditable = axis.editable === 'all'
  const hiddenEditable = axis.editable === 'all' || axis.editable === 'label-only'
  const canDeleteItem = axis.custom
  // 모든 축 삭제 가능 — 기본 축은 confirm 에서 강한 경고로 안내
  const canDeleteAxis = true

  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden">
      {/* 축 헤더 — 인플레이스 편집 */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          {/* 이모지 */}
          <TextInput
            value={axis.emoji}
            onChange={e => onUpdateAxis({ emoji: e.target.value })}
            className="w-12 text-center text-[18px]"
            maxLength={2}
          />
          {/* 제목 */}
          <TextInput
            value={axis.title}
            onChange={e => onUpdateAxis({ title: e.target.value })}
            className="flex-1 min-w-[200px] font-bold text-[15px]"
          />
          {/* 사용자 정의 axis 표식 */}
          {axis.axisCustom && (
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">사용자 정의</span>
          )}
          {/* 순서 ↑ ↓ */}
          <button
            onClick={() => onMoveAxis('up')}
            disabled={index === 0}
            className="w-8 h-8 flex items-center justify-center rounded-md ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title="위로"
          >↑</button>
          <button
            onClick={() => onMoveAxis('down')}
            disabled={index === total - 1}
            className="w-8 h-8 flex items-center justify-center rounded-md ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title="아래로"
          >↓</button>
          {/* 표시/숨김 */}
          <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-600 select-none cursor-pointer ml-1">
            <input
              type="checkbox"
              checked={!axis.axisHidden}
              onChange={e => onUpdateAxis({ axisHidden: !e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
            표시
          </label>
          {/* 삭제 (사용자 정의 axis 만) */}
          {canDeleteAxis && (
            <Button variant="danger" size="sm" onClick={onRemoveAxis}>🗑 축 삭제</Button>
          )}
          {/* 항목 추가 */}
          {axis.custom && (
            <Button variant="secondary" size="sm" onClick={onAddItem}>＋ 항목 추가</Button>
          )}
        </div>
        {/* 설명 — 인플레이스 */}
        <textarea
          value={axis.description}
          onChange={e => onUpdateAxis({ description: e.target.value })}
          rows={1}
          className="mt-2 w-full px-3 py-2 text-[12px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 placeholder:text-slate-400 transition-colors resize-y"
          placeholder="축에 대한 설명 (운영자 안내용)"
        />
      </div>

      {/* 항목 그리드 헤더 */}
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-2 grid grid-cols-12 gap-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
        <span className="col-span-1 text-center">표시</span>
        <span className="col-span-1">색</span>
        <span className="col-span-2">키 (readonly)</span>
        <span className="col-span-3">라벨</span>
        <span className="col-span-1 text-center">이모지</span>
        <span className="col-span-3">설명</span>
        <span className="col-span-1 text-center">매칭</span>
      </div>

      {/* 항목들 */}
      {axis.items.length === 0 ? (
        <div className="px-5 py-10 text-center text-[12px] text-slate-400">
          항목이 없습니다. 위 ＋ 항목 추가 버튼으로 새 항목을 만드세요.
        </div>
      ) : axis.items.map(item => (
        <div key={item.key} className="px-5 py-2.5 grid grid-cols-12 gap-3 items-center border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40">
          <div className="col-span-1 text-center">
            <input
              type="checkbox"
              checked={!item.hidden}
              disabled={!hiddenEditable}
              onChange={e => onUpdateItem(item.key, { hidden: !e.target.checked })}
              className="w-4 h-4 accent-blue-600 disabled:opacity-50"
            />
          </div>
          <div className="col-span-1">
            <input
              type="color"
              value={item.color}
              disabled={!colorEditable}
              onChange={e => onUpdateItem(item.key, { color: e.target.value })}
              className="w-8 h-8 rounded-md border border-slate-200 cursor-pointer disabled:opacity-50"
            />
          </div>
          <div className="col-span-2 flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-slate-500 bg-slate-50 ring-1 ring-slate-200 rounded-md px-2 py-1">{item.key}</span>
            {canDeleteItem && (
              <button
                onClick={() => {
                  if (confirm(`"${item.label}" 항목을 삭제할까요?`)) onRemoveItem(item.key)
                }}
                className="text-[10px] text-red-500 hover:text-red-700"
                title="삭제"
              >
                🗑
              </button>
            )}
          </div>
          <div className="col-span-3">
            <TextInput
              value={item.label}
              disabled={!labelEditable}
              onChange={e => onUpdateItem(item.key, { label: e.target.value })}
            />
          </div>
          <div className="col-span-1 text-center">
            <TextInput
              value={item.emoji}
              disabled={!emojiEditable}
              onChange={e => onUpdateItem(item.key, { emoji: e.target.value })}
              className="text-center text-[16px]"
              maxLength={2}
            />
          </div>
          <div className="col-span-3">
            <TextInput
              value={item.description}
              disabled={!labelEditable}
              onChange={e => onUpdateItem(item.key, { description: e.target.value })}
              className="text-[12px]"
            />
          </div>
          <div className="col-span-1 text-center">
            <StatusBadge tone={getCount(item) > 0 ? 'info' : axis.match === 'custom' ? 'muted' : 'warn'}>
              {getCount(item)}
            </StatusBadge>
          </div>
        </div>
      ))}
    </div>
  )
}

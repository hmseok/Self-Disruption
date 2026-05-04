'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Button, KpiCard, KpiRow, PageHeader, ScreenWrap, Section, Spinner,
  StatusBadge, TextInput,
} from '../_components/ui'
import merged from '../_data/factories-merged.json'
import SubNav from '../_components/SubNav'
import { DEFAULT_AXES, type CodeAxis, type CodeItem } from './defaults'

// ───────────────────────────────────────────────────────────────
// 분류 셋팅 — 13축 종합 관리 (모든 축 전체 편집 + 사용자 정의 추가 가능)
// localStorage('ride_op_classifications_v2') 에 저장
// ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ride_op_classifications_v2'

function loadAxes(): CodeAxis[] {
  if (typeof window === 'undefined') return DEFAULT_AXES
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_AXES
    const parsed = JSON.parse(raw) as CodeAxis[]
    // 누락 축 보강 (스키마 진화 대응)
    return DEFAULT_AXES.map(d => {
      const saved = parsed.find(p => p.key === d.key)
      if (!saved) return d
      // items 도 누락 보강
      const items = d.items.map(di => saved.items.find(si => si.key === di.key) || di)
      // 사용자가 추가한 custom 항목도 보존
      const customItems = d.custom
        ? saved.items.filter(si => !d.items.some(di => di.key === si.key))
        : []
      return { ...d, items: [...items, ...customItems] }
    })
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
  // 차량 분류 — tags 의 일부 + 'domestic' (테슬라/수입차 둘 다 아니면 국산으로 가정)
  const dom = (merged as { factories: { tags?: string[] }[] }).factories.filter(
    f => !f.tags?.includes('tesla-only') && !f.tags?.includes('foreign-only')
  ).length
  counts.tags.domestic = dom
  return counts
}

export default function GroupsAdminMain() {
  const [axes, setAxes] = useState<CodeAxis[]>(DEFAULT_AXES)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [activeAxis, setActiveAxis] = useState<string>('group')
  const counts = useMemo(() => buildCounts(), [])
  const totalFactories = (merged as { factories: unknown[] }).factories.length

  useEffect(() => { setAxes(loadAxes()) }, [])

  const updateItem = (axisKey: string, itemKey: string, patch: Partial<CodeItem>) => {
    setAxes(prev => prev.map(a => a.key === axisKey
      ? { ...a, items: a.items.map(i => i.key === itemKey ? { ...i, ...patch } : i) }
      : a))
  }
  const addItem = (axisKey: string) => {
    // 이벤트 핸들러 내부에서만 호출되므로 render 중 호출 아님
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
  const persist = () => {
    saveAxes(axes)
    setSavedAt(new Date().toLocaleTimeString('ko-KR'))
  }
  const reset = () => {
    setAxes(DEFAULT_AXES)
    saveAxes(DEFAULT_AXES)
    setSavedAt(new Date().toLocaleTimeString('ko-KR'))
  }

  const stats = useMemo(() => ({
    axes: axes.length,
    totalItems: axes.reduce((s, a) => s + a.items.length, 0),
    visibleItems: axes.reduce((s, a) => s + a.items.filter(i => !i.hidden).length, 0),
    factories: totalFactories,
  }), [axes, totalFactories])

  const getCountFor = (axis: CodeAxis, item: CodeItem): number => {
    if (axis.match === 'groups') return counts.groups[item.key] || 0
    if (axis.match === 'insurance') return counts.insurance[item.key] || 0
    if (axis.match === 'facttype') return counts.facttype[item.key] || 0
    if (axis.match === 'tags') return counts.tags[item.key] || 0
    return 0   // custom 축 (정산 구분 등) — 데이터에 매핑 전
  }

  return (
    <ScreenWrap>
      <PageHeader
        breadcrumb={['Employee of Ride Inc.', '분류 셋팅']}
        title="분류/태그 셋팅"
        emoji="🧩"
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
        <KpiCard label="분류 축" value={stats.axes} tone="emerald" icon="🧩" hint="13축 종합 관리" />
        <KpiCard label="전체 항목" value={stats.totalItems} tone="blue" icon="🏷" />
        <KpiCard label="표시 중" value={stats.visibleItems} tone="violet" icon="👁" />
        <KpiCard label="등록 공장" value={stats.factories} tone="amber" icon="🏭" />
      </KpiRow>

      {/* 축 탭 */}
      <div className="px-6 pb-3">
        <div className="flex gap-2 flex-wrap">
          {axes.map(a => (
            <button
              key={a.key}
              onClick={() => setActiveAxis(a.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold transition-colors
                ${activeAxis === a.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50 ring-1 ring-slate-200'}`}
            >
              <span>{a.emoji}</span>
              <span>{a.title}</span>
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md
                ${activeAxis === a.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {a.items.length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 활성 축 패널 */}
      <div className="px-6 pb-8">
        {axes.filter(a => a.key === activeAxis).map(axis => (
          <AxisPanel
            key={axis.key}
            axis={axis}
            getCount={item => getCountFor(axis, item)}
            onUpdateItem={(itemKey, patch) => updateItem(axis.key, itemKey, patch)}
            onAddItem={() => addItem(axis.key)}
            onRemoveItem={itemKey => removeItem(axis.key, itemKey)}
          />
        ))}

        <Section title="셋팅 가이드" color="border-blue-500" defaultOpen={false}>
          <ul className="text-[12px] text-slate-600 space-y-1 list-disc list-inside leading-6">
            <li><b>편집 가능 범위</b>는 축마다 다름:
              <ul className="list-disc list-inside ml-4 mt-1">
                <li><b>전체 편집</b>: 즐겨찾기 그룹, 차량 분류, 정산 구분 (라벨/색상/이모지/표시/추가 모두 가능)</li>
                <li><b>라벨만 편집</b>: 보험 입고, 공장 유형, 특수 태그 (키는 데이터 매핑 때문에 고정)</li>
              </ul>
            </li>
            <li><b>표시</b> 끄면 카카오 지도/필터/리스트에서 해당 코드 값이 기본 숨겨짐.</li>
            <li><b>색상</b>은 마커/뱃지 표시색에 반영 (즐겨찾기 메타 우선순위가 더 높을 때는 그쪽이 우선).</li>
            <li><b>저장</b>은 브라우저 localStorage 에만 보관 — 서버 동기화는 hmseok.com 이식 시 카페24 코드 마스터에 반영.</li>
            <li><b>정산 구분</b>은 현재 데이터에 매핑 안됨. 등록 후 차후 단계에서 공장별 정산 방식 부여 — 사고 접수 페이지에서 활용.</li>
          </ul>
        </Section>
      </div>
    </ScreenWrap>
  )
}

// ───────────────────────────────────────────────────────────────
// AxisPanel — 한 축의 항목들을 편집
// ───────────────────────────────────────────────────────────────
function AxisPanel({ axis, getCount, onUpdateItem, onAddItem, onRemoveItem }: {
  axis: CodeAxis
  getCount: (item: CodeItem) => number
  onUpdateItem: (key: string, patch: Partial<CodeItem>) => void
  onAddItem: () => void
  onRemoveItem: (key: string) => void
}) {
  const labelEditable = axis.editable === 'all' || axis.editable === 'label-only'
  const colorEditable = axis.editable === 'all'
  const emojiEditable = axis.editable === 'all'
  const hiddenEditable = axis.editable === 'all' || axis.editable === 'label-only'
  const canDelete = axis.custom

  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden">
      {/* 축 헤더 */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[18px]">{axis.emoji}</span>
            <h2 className="text-[15px] font-bold text-slate-900">{axis.title}</h2>
            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
              {axis.editable === 'all' ? '전체 편집' : axis.editable === 'label-only' ? '라벨만 편집' : '읽기 전용'}
            </span>
          </div>
          <p className="text-[12px] text-slate-500 mt-1">{axis.description}</p>
        </div>
        {axis.custom && (
          <Button variant="secondary" size="sm" onClick={onAddItem}>+ 항목 추가</Button>
        )}
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
      {axis.items.map(item => (
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
            {canDelete && (
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
          <div className="col-span-3 text-[12px] text-slate-500">{item.description}</div>
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

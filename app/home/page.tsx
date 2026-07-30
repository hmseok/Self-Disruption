'use client'

// ═══════════════════════════════════════════════════════════════════
// 홈 — "출근해서 처음 보는 화면" (2026-07 개편 REDESIGN 3장)
//   · 이번 달 요약 카드 4개 (매출/지출/순이익/수납률)
//   · 오늘 할 일 (미분류/검수/만기임박/정비사고) — 클릭 시 해당 화면으로
//   · 차량 현황 / 이번 달 정산 미니 패널
//   디자인: _mockups/fmi-erp-redesign.html 홈 화면 기준 (플랫)
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'
import { usePermission } from '../hooks/usePermission'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

type HomeSummary = {
  month: string
  summary: {
    revenue: number
    expense: number
    netProfit: number
    revenueChange: number | null
    expenseChange: number | null
    profitRate: number | null
    collectionRate: number | null
    overdueCount: number
    overdueAmount: number
  }
  todo: {
    unclassified: number
    reviewPending: number
    expiringContracts: number
    repairCars: number
    repairCarList: string[]
  }
  cars: { total: number; rented: number; available: number; repair: number; utilization: number }
  settlement: { jiip: number; investors: number }
}

const C = {
  line: '#e6e8ec', line2: '#f0f1f4',
  ink: '#1a1d23', ink2: '#5b626e', ink3: '#9aa1ad',
  blue: '#2563eb', blueBg: '#eff4ff',
  green: '#16a34a', greenBg: '#effaf3',
  red: '#dc2626', redBg: '#fdf0f0',
  amber: '#d97706', amberBg: '#fdf6ec',
}

const won = (n: number) => n.toLocaleString('ko-KR')

function Dot({ color }: { color: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', marginRight: 6 }} />
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: '0 1px 2px rgba(16,24,40,.05)', overflow: 'hidden' }}>{children}</div>
}

export default function HomePage() {
  const router = useRouter()
  const { profile, user, role } = useApp()
  const { hasPageAccess } = usePermission()
  const [data, setData] = useState<HomeSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/home/summary', { headers })
      const json = await res.json()
      if (json.data) setData(json.data)
    } catch { /* 네트워크 오류 — 화면은 빈 상태 유지 */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? '좋은 아침입니다' : hour < 18 ? '좋은 오후입니다' : '좋은 저녁입니다'
  const name = profile?.employee_name || user?.email?.split('@')[0] || ''
  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  const s = data?.summary
  const t = data?.todo
  const todoCount = t ? [t.unclassified, t.reviewPending, t.expiringContracts, t.repairCars].filter(n => n > 0).length : 0

  const changeText = (v: number | null) =>
    v === null ? '' : `지난달 대비 ${v > 0 ? '+' : ''}${v}%`

  const todos = t ? [
    {
      show: true, count: t.unclassified, icon: '₩', bg: C.redBg, color: C.red,
      title: `미분류 거래 ${t.unclassified}건`,
      sub: t.unclassified > 0 ? '수집된 거래의 분류가 필요합니다' : '모든 거래가 분류되어 있습니다',
      path: '/finance/classify',
    },
    {
      show: true, count: t.reviewPending, icon: '✓', bg: C.amberBg, color: C.amber,
      title: `자동분류 검수 대기 ${t.reviewPending}건`,
      sub: t.reviewPending > 0 ? '자동 분류된 항목을 확인해 주세요' : '검수 대기 항목이 없습니다',
      path: '/finance/classify',
    },
    {
      show: true, count: t.expiringContracts, icon: '📄', bg: C.blueBg, color: C.blue,
      title: `만기 임박 계약 ${t.expiringContracts}건`,
      sub: t.expiringContracts > 0 ? '30일 이내 만기 — 연장 여부 확인 필요' : '30일 이내 만기 계약이 없습니다',
      path: '/long-term-rentals',
    },
    {
      show: true, count: t.repairCars, icon: '🔧', bg: C.line2, color: C.ink2,
      title: `정비·사고 차량 ${t.repairCars}대`,
      sub: t.repairCarList.length > 0 ? t.repairCarList.join(', ') : '정비·사고 차량이 없습니다',
      path: '/cars',
    },
  ] : []

  // 직장인필수 바로가기 (사이드바 섹션 제거 — 홈 하단으로 이동)
  const shortcuts = [
    { label: '내 정보', path: '/work-essentials/my-info' },
    { label: '영수증 제출', path: '/work-essentials/receipts' },
    { label: '회의록', path: '/meetings' },
    { label: '내 TODO', path: '/meetings/me' },
  ].filter(sc => role === 'admin' || hasPageAccess(sc.path))

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, color: C.ink, fontSize: 14 }}>
      {/* 페이지 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 21, letterSpacing: '-0.02em', fontWeight: 700 }}>
            {greeting}{name ? `, ${name}님` : ''}
          </h1>
          <p style={{ color: C.ink2, fontSize: 13, marginTop: 3 }}>
            {dateStr}{todoCount > 0 ? ` · 처리할 일 ${todoCount}건이 있습니다` : ''}
          </p>
        </div>
        <button
          onClick={load}
          style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: C.ink2, cursor: 'pointer' }}
        >
          새로고침
        </button>
      </div>

      {/* 이번 달 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Panel>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 12.5, color: C.ink2 }}><Dot color={C.green} />이번 달 매출</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 6 }}>
              {loading ? '—' : won(s?.revenue || 0)}<span style={{ fontSize: 13, color: C.ink3 }}> 원</span>
            </div>
            <div style={{ fontSize: 12, color: C.ink3, marginTop: 3 }}>{loading ? '' : changeText(s?.revenueChange ?? null)}</div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 12.5, color: C.ink2 }}><Dot color={C.red} />이번 달 지출</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 6 }}>
              {loading ? '—' : won(s?.expense || 0)}<span style={{ fontSize: 13, color: C.ink3 }}> 원</span>
            </div>
            <div style={{ fontSize: 12, color: C.ink3, marginTop: 3 }}>{loading ? '' : changeText(s?.expenseChange ?? null)}</div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 12.5, color: C.ink2 }}><Dot color={C.blue} />순이익</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 6 }}>
              {loading ? '—' : won(s?.netProfit || 0)}<span style={{ fontSize: 13, color: C.ink3 }}> 원</span>
            </div>
            <div style={{ fontSize: 12, color: C.ink3, marginTop: 3 }}>
              {!loading && s?.profitRate !== null && s?.profitRate !== undefined ? `이익률 ${s.profitRate}%` : ''}
            </div>
          </div>
        </Panel>
        <Panel>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 12.5, color: C.ink2 }}><Dot color={C.amber} />수납률</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 6 }}>
              {loading ? '—' : s?.collectionRate !== null && s?.collectionRate !== undefined ? `${s.collectionRate}%` : '집계 없음'}
              {!loading && (s?.overdueCount || 0) > 0 && (
                <span style={{ fontSize: 13, color: C.ink3 }}> · 미수 {s?.overdueCount}건</span>
              )}
            </div>
            {!loading && s?.collectionRate !== null && s?.collectionRate !== undefined && (
              <div style={{ height: 7, background: C.line2, borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ height: '100%', borderRadius: 4, width: `${s.collectionRate}%`, background: C.amber }} />
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* 오늘 할 일 + 미니 패널 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: 14 }}>
        <Panel>
          <div style={{ fontSize: 14, fontWeight: 700, padding: '13px 16px', borderBottom: `1px solid ${C.line2}` }}>오늘 할 일</div>
          {loading && <div style={{ padding: '24px 16px', color: C.ink3, fontSize: 13 }}>불러오는 중...</div>}
          {!loading && todos.map((td, i) => (
            <div
              key={i}
              onClick={() => router.push(td.path)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < todos.length - 1 ? `1px solid ${C.line2}` : 'none', cursor: 'pointer', opacity: td.count > 0 ? 1 : 0.55 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafbfc' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: td.bg, color: td.color, fontWeight: 700 }}>
                {td.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13.5, display: 'block' }}>{td.title}</b>
                <span style={{ fontSize: 12, color: C.ink3 }}>{td.sub}</span>
              </div>
              <div style={{ marginLeft: 'auto', color: C.ink3, fontSize: 16 }}>›</div>
            </div>
          ))}
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel>
            <div style={{ fontSize: 14, fontWeight: 700, padding: '13px 16px', borderBottom: `1px solid ${C.line2}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              차량 현황
              <a onClick={() => router.push('/cars')} style={{ fontSize: 12, color: C.blue, fontWeight: 500, cursor: 'pointer' }}>전체 보기</a>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: `1px solid ${C.line2}` }}>
              <span>전체</span><b>{data?.cars.total ?? '—'}대</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: `1px solid ${C.line2}` }}>
              <span style={{ color: C.green }}>대여중</span>
              <b>{data ? `${data.cars.rented}대 (${data.cars.utilization}%)` : '—'}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: `1px solid ${C.line2}` }}>
              <span style={{ color: C.blue }}>대기</span><b>{data?.cars.available ?? '—'}대</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13 }}>
              <span style={{ color: C.red }}>정비·사고</span><b>{data?.cars.repair ?? '—'}대</b>
            </div>
          </Panel>

          <Panel>
            <div style={{ fontSize: 14, fontWeight: 700, padding: '13px 16px', borderBottom: `1px solid ${C.line2}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              이번 달 정산
              <a onClick={() => router.push('/finance/settlement')} style={{ fontSize: 12, color: C.blue, fontWeight: 500, cursor: 'pointer' }}>바로가기</a>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: `1px solid ${C.line2}` }}>
              <span>지입 차주</span><b>{data?.settlement.jiip ?? '—'}명</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13 }}>
              <span>투자자</span><b>{data?.settlement.investors ?? '—'}명</b>
            </div>
          </Panel>
        </div>
      </div>

      {/* 개인 업무 바로가기 (구 직장인필수 — 사이드바에서 이동) */}
      {shortcuts.length > 0 && (
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.ink3 }}>바로가기</span>
          {shortcuts.map(sc => (
            <button
              key={sc.path}
              onClick={() => router.push(sc.path)}
              style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 99, padding: '6px 13px', fontSize: 12.5, fontWeight: 500, color: C.ink2, cursor: 'pointer' }}
            >
              {sc.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

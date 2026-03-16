'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ═══════════════════════════════════════════════════════════════
// 계약 현황 탭 — 위수탁(지입) + 일반투자 통합 뷰
// 계약 정보 중심 (지급 상태는 지급관리 탭에서 관리)
// ═══════════════════════════════════════════════════════════════

const f = (n: number) => n ? n.toLocaleString() : '0'
const fm = (num: number) => {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '억'
  if (num >= 10000) return (num / 10000).toFixed(0) + '만'
  return num.toLocaleString()
}

function calcAfterTax(gross: number, taxType: string): number {
  if (taxType === '사업소득(3.3%)') return Math.round(gross * (1 - 0.033))
  if (taxType === '세금계산서') return gross
  return Math.round(gross * (1 - 0.275))
}
function taxLabel(t: string): string {
  if (t === '사업소득(3.3%)') return '3.3%'
  if (t === '세금계산서') return 'VAT'
  return '27.5%'
}

type SubTab = 'jiip' | 'invest'
type ShareHistoryItem = { id: string; recipient_name: string; settlement_month: string; total_amount: number; paid_at: string | null; items?: any[] }
type Props = { jiipList: any[]; investList: any[]; settleTxs: any[]; shareHistory: ShareHistoryItem[]; loading: boolean }

export default function ContractsTab({ jiipList, investList, settleTxs, shareHistory, loading }: Props) {
  const router = useRouter()
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('jiip')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['운영 중', '운용중']))

  const today = new Date()

  // 누적 지급 집계 (transactions + shareHistory 기반)
  const settlementMap = useMemo(() => {
    const map: Record<string, { totalExpense: number; monthsPaid: Set<string> }> = {}

    // 1) transactions 기반
    for (const tx of settleTxs) {
      const key = `${tx.related_type}:${tx.related_id}`
      if (!map[key]) map[key] = { totalExpense: 0, monthsPaid: new Set() }
      const amt = Math.abs(Number(tx.amount) || 0)
      const isIncome = tx.type === 'income'
      if (!isIncome) {
        map[key].totalExpense += amt
        map[key].monthsPaid.add((tx.transaction_date || '').slice(0, 7))
      }
    }

    // 2) shareHistory 기반 (paid_at이 있는 건) — transactions에 아직 없는 지급완료 건 보완
    // memo 패턴으로 이미 transactions에 있는 share는 중복 제외
    const txShareIds = new Set<string>()
    for (const tx of settleTxs) {
      const memo = tx.memo || ''
      if (memo.startsWith('settlement_share:')) {
        txShareIds.add(memo.replace('settlement_share:', ''))
      }
    }

    // 이름 → 계약 ID 매핑 (relatedId 없는 기존 레코드용 fallback)
    const nameToJiipId: Record<string, string> = {}
    const nameToInvestId: Record<string, string> = {}
    for (const j of jiipList) { nameToJiipId[j.investor_name] = j.id }
    for (const i of investList) { nameToInvestId[i.investor_name] = i.id }

    for (const sh of shareHistory) {
      if (!sh.paid_at) continue
      if (txShareIds.has(sh.id)) continue // 이미 transactions에 반영됨

      const items = sh.items as any[]
      if (items && Array.isArray(items)) {
        let hasRelatedId = false
        for (const item of items) {
          const relatedType = item.type === 'jiip' ? 'jiip_share' : item.type === 'invest' ? 'invest' : null
          const relatedId = item.relatedId
          if (!relatedType || !relatedId) continue
          hasRelatedId = true
          const key = `${relatedType}:${relatedId}`
          if (!map[key]) map[key] = { totalExpense: 0, monthsPaid: new Set() }
          const amt = Math.abs(Number(item.amount) || 0)
          if (amt > 0) {
            map[key].totalExpense += amt
            map[key].monthsPaid.add(sh.settlement_month || (sh.paid_at || '').slice(0, 7))
          }
        }
        // relatedId가 없는 기존 레코드: 수신자 이름으로 계약 매칭
        if (!hasRelatedId) {
          const name = sh.recipient_name
          const jiipId = nameToJiipId[name]
          const investId = nameToInvestId[name]
          if (jiipId) {
            const key = `jiip_share:${jiipId}`
            if (!map[key]) map[key] = { totalExpense: 0, monthsPaid: new Set() }
            // items에서 jiip 타입 금액 합산, 없으면 total_amount 사용
            const jiipAmt = items.filter((it: any) => it.type === 'jiip').reduce((s: number, it: any) => s + Math.abs(Number(it.amount) || 0), 0)
            const amt = jiipAmt > 0 ? jiipAmt : Math.abs(Number(sh.total_amount) || 0)
            if (amt > 0) {
              map[key].totalExpense += amt
              map[key].monthsPaid.add(sh.settlement_month || (sh.paid_at || '').slice(0, 7))
            }
          }
          if (investId) {
            const key = `invest:${investId}`
            if (!map[key]) map[key] = { totalExpense: 0, monthsPaid: new Set() }
            const investAmt = items.filter((it: any) => it.type === 'invest').reduce((s: number, it: any) => s + Math.abs(Number(it.amount) || 0), 0)
            if (investAmt > 0) {
              map[key].totalExpense += investAmt
              map[key].monthsPaid.add(sh.settlement_month || (sh.paid_at || '').slice(0, 7))
            }
          }
          // items가 없거나 빈 배열인 경우에도 이름 매칭 (total_amount만 있는 케이스)
          if (!items.length && sh.total_amount) {
            const jiipKey = jiipId ? `jiip_share:${jiipId}` : null
            const investKey = investId ? `invest:${investId}` : null
            const targetKey = jiipKey || investKey
            if (targetKey) {
              if (!map[targetKey]) map[targetKey] = { totalExpense: 0, monthsPaid: new Set() }
              map[targetKey].totalExpense += Math.abs(Number(sh.total_amount))
              map[targetKey].monthsPaid.add(sh.settlement_month || (sh.paid_at || '').slice(0, 7))
            }
          }
        }
      } else {
        // items 자체가 없는 레코드: 수신자 이름 + total_amount로 매칭
        const name = sh.recipient_name
        const jiipId = nameToJiipId[name]
        const investId = nameToInvestId[name]
        const targetKey = jiipId ? `jiip_share:${jiipId}` : investId ? `invest:${investId}` : null
        if (targetKey && sh.total_amount) {
          if (!map[targetKey]) map[targetKey] = { totalExpense: 0, monthsPaid: new Set() }
          map[targetKey].totalExpense += Math.abs(Number(sh.total_amount))
          map[targetKey].monthsPaid.add(sh.settlement_month || (sh.paid_at || '').slice(0, 7))
        }
      }
    }

    return map
  }, [settleTxs, shareHistory])

  const monthsSince = (d: string | null): number => {
    if (!d) return 0
    const s = new Date(d)
    return (today.getFullYear() - s.getFullYear()) * 12 + (today.getMonth() - s.getMonth()) + 1
  }

  // ── 통계 ──
  const jiipActive = jiipList.filter((c: any) => c.status === 'active')
  const investActive = investList.filter((c: any) => c.status === 'active')
  const totalContracts = jiipList.length + investList.length
  const activeCount = jiipActive.length + investActive.length
  const monthlyJiip = jiipActive.reduce((s: number, c: any) => s + (c.admin_fee || 0), 0)
  const monthlyInvest = investActive.reduce((s: number, c: any) => s + Math.round((c.invest_amount || 0) * (c.interest_rate || 0) / 100 / 12), 0)
  const monthlyTotal = monthlyJiip + monthlyInvest
  const totalInvestAmount = jiipList.reduce((s: number, c: any) => s + (c.invest_amount || 0), 0)
    + investList.reduce((s: number, c: any) => s + (c.invest_amount || 0), 0)

  const currentList = activeSubTab === 'jiip' ? jiipList : investList
  const ninetyDays = new Date(today.getTime() + 90 * 86400000)

  const filterCounts = useMemo(() => {
    const list = currentList
    const active = list.filter((c: any) => c.status === 'active')
    const ended = list.filter((c: any) => c.status !== 'active')
    const expiring = activeSubTab === 'invest' ? list.filter((i: any) => {
      if (!i.contract_end_date) return false
      const end = new Date(i.contract_end_date)
      return end >= today && end <= ninetyDays && i.status === 'active'
    }) : []
    return { all: list.length, active: active.length, ended: ended.length, expiring: expiring.length }
  }, [currentList, activeSubTab])

  const filteredList = useMemo(() => {
    let list = currentList
    if (sourceFilter === 'active') list = list.filter((c: any) => c.status === 'active')
    if (sourceFilter === 'ended') list = list.filter((c: any) => c.status !== 'active')
    if (sourceFilter === 'expiring') list = list.filter((i: any) => {
      if (!i.contract_end_date) return false
      const end = new Date(i.contract_end_date)
      return end >= today && end <= ninetyDays && i.status === 'active'
    })
    if (searchText) {
      const t = searchText.toLowerCase()
      list = list.filter((item: any) => {
        if (activeSubTab === 'jiip') return (item.car?.number || '').toLowerCase().includes(t) || (item.investor_name || '').toLowerCase().includes(t)
        return (item.investor_name || '').toLowerCase().includes(t) || (item.investor_phone || '').includes(t)
      })
    }
    return list
  }, [currentList, sourceFilter, searchText, activeSubTab])

  const groupedItems = useMemo(() => {
    const groups: Record<string, { items: any[]; totalAmount: number }> = {}
    for (const item of filteredList) {
      const k = item.status === 'active' ? (activeSubTab === 'jiip' ? '운영 중' : '운용중') :
        item.status === 'expired' ? '만기' : item.status === 'terminated' ? '해지' : '종료'
      if (!groups[k]) groups[k] = { items: [], totalAmount: 0 }
      groups[k].items.push(item)
      groups[k].totalAmount += (item.invest_amount || 0)
    }
    const order = activeSubTab === 'jiip' ? ['운영 중', '만기', '해지', '종료'] : ['운용중', '만기', '해지', '종료']
    return order.filter(k => groups[k]).map(k => [k, groups[k]] as [string, typeof groups[string]])
  }, [filteredList, activeSubTab])

  const summaryStats = useMemo(() => {
    if (activeSubTab === 'jiip') {
      const totalPaid = jiipList.reduce((s: number, c: any) => s + (settlementMap[`jiip_share:${c.id}`]?.totalExpense || 0), 0)
      return { income: jiipList.reduce((s: number, c: any) => s + (c.invest_amount || 0), 0), expense: monthlyJiip, totalPaid, totalCount: jiipActive.length, avgRate: jiipList.length > 0 ? (jiipList.reduce((s: number, c: any) => s + (c.share_ratio || 0), 0) / jiipList.length).toFixed(1) : '0' }
    } else {
      const totalPaid = investList.reduce((s: number, c: any) => s + (settlementMap[`invest:${c.id}`]?.totalExpense || 0), 0)
      return { income: investList.reduce((s: number, c: any) => s + (c.invest_amount || 0), 0), expense: monthlyInvest, totalPaid, totalCount: investActive.length, avgRate: investList.length > 0 ? (investList.reduce((s: number, c: any) => s + (c.interest_rate || 0), 0) / investList.length).toFixed(1) : '0' }
    }
  }, [jiipList, investList, jiipActive, investActive, settlementMap, activeSubTab, monthlyJiip, monthlyInvest])

  const toggleGroup = useCallback((k: string) => {
    setExpandedGroups(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }, [])

  const handleSubTabChange = (tab: SubTab) => {
    setActiveSubTab(tab); setSourceFilter('all'); setSearchText('')
    setExpandedGroups(new Set([tab === 'jiip' ? '운영 중' : '운용중']))
  }

  const filterChips = activeSubTab === 'jiip' ? [
    { key: 'all', label: '전체', count: filterCounts.all },
    { key: 'active', label: '운영중', count: filterCounts.active },
    { key: 'ended', label: '종료', count: filterCounts.ended },
  ] : [
    { key: 'all', label: '전체', count: filterCounts.all },
    { key: 'active', label: '운용중', count: filterCounts.active },
    { key: 'expiring', label: '만기임박', count: filterCounts.expiring, color: '#ca8a04' },
    { key: 'ended', label: '종료', count: filterCounts.ended },
  ]

  if (loading) return <div style={{ padding: 80, textAlign: 'center', color: '#9ca3af', fontWeight: 700 }}>데이터를 불러오는 중...</div>

  // 컬럼 정의
  const jiipCols = [
    { label: '차량', w: 140, align: 'left' as const },
    { label: '차주', w: 110, align: 'left' as const },
    { label: '투자금', w: 120, align: 'right' as const },
    { label: '월 관리비', w: 110, align: 'right' as const },
    { label: '누적 지급', w: 110, align: 'right' as const },
    { label: '지급률', w: 65, align: 'center' as const },
  ]
  const investCols = [
    { label: '투자자', w: 120, align: 'left' as const },
    { label: '투자원금', w: 130, align: 'right' as const },
    { label: '월 이자(세후)', w: 120, align: 'right' as const },
    { label: '지급일', w: 60, align: 'center' as const },
    { label: '누적 지급', w: 110, align: 'right' as const },
    { label: '지급률', w: 65, align: 'center' as const },
    { label: '만기', w: 80, align: 'center' as const },
  ]
  const cols = activeSubTab === 'jiip' ? jiipCols : investCols

  const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
    '운영 중': { color: '#16a34a', bg: '#dcfce7' },
    '운용중': { color: '#16a34a', bg: '#dcfce7' },
    '만기': { color: '#ca8a04', bg: '#fef9c3' },
    '해지': { color: '#9ca3af', bg: '#f3f4f6' },
    '종료': { color: '#9ca3af', bg: '#f3f4f6' },
  }

  return (
    <div>
      {/* ═══ 헤더: 서브탭 + 통계 + 신규등록 ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
        {([
          { key: 'jiip' as SubTab, label: '위수탁(지입)', count: jiipList.length },
          { key: 'invest' as SubTab, label: '투자/펀딩', count: investList.length },
        ]).map(tab => (
          <button key={tab.key} onClick={() => handleSubTabChange(tab.key)}
            style={{
              padding: '12px 16px', fontSize: 13, fontWeight: activeSubTab === tab.key ? 800 : 600,
              color: activeSubTab === tab.key ? '#0f172a' : '#94a3b8',
              cursor: 'pointer', background: 'none', border: 'none',
              borderBottom: `2px solid ${activeSubTab === tab.key ? '#2d5fa8' : 'transparent'}`,
              marginBottom: -1, display: 'flex', alignItems: 'center', gap: 5,
            }}>
            {tab.label}
            <span style={{
              padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
              background: activeSubTab === tab.key ? '#2d5fa8' : '#e2e8f0',
              color: activeSubTab === tab.key ? '#fff' : '#64748b',
            }}>{tab.count}</span>
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          {[
            { label: '계약', value: `${totalContracts}`, sub: `운용 ${activeCount}` },
            { label: '총 투자금', value: fm(totalInvestAmount), color: '#111827' },
            { label: '월 지급', value: fm(monthlyTotal), color: '#2d5fa8' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '6px 0' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, lineHeight: 1 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.color || '#111827', lineHeight: 1.4 }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 9, color: '#b0b0b0', lineHeight: 1 }}>{s.sub}</div>}
            </div>
          ))}
          <button onClick={() => router.push(activeSubTab === 'jiip' ? '/jiip/new' : '/invest/general/new')}
            style={{ background: '#2d5fa8', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginLeft: 4 }}>
            + 신규 등록
          </button>
        </div>
      </div>

      {/* ═══ 필터 + 검색 ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', gap: 6, borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
        {filterChips.map(chip => {
          const on = sourceFilter === chip.key
          const cc = (chip as any).color
          return (
            <button key={chip.key} onClick={() => setSourceFilter(chip.key)}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3,
                background: on ? (cc ? `${cc}15` : '#eef2ff') : 'transparent',
                color: on ? (cc || '#2d5fa8') : '#94a3b8',
                border: on ? `1px solid ${cc ? `${cc}40` : '#c7d2fe'}` : '1px solid transparent',
              }}>
              {chip.label} <b>{chip.count}</b>
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <input type="text" placeholder="검색..."
          value={searchText} onChange={e => setSearchText(e.target.value)}
          style={{ padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, width: 160, outline: 'none', background: '#fff', color: '#0f172a' }} />
      </div>

      {/* ═══ 테이블 헤더 ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '7px 20px', gap: 8,
        background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
      }}>
        {cols.map(col => (
          <div key={col.label} style={{ width: col.w, flexShrink: 0, textAlign: col.align, fontSize: 11, fontWeight: 700, color: '#64748b' }}>
            {col.label}
          </div>
        ))}
      </div>

      {/* ═══ 데이터 ═══ */}
      {filteredList.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.4 }}>{activeSubTab === 'jiip' ? '🚛' : '💼'}</div>
          <p style={{ color: '#94a3b8', fontWeight: 600, fontSize: 13 }}>
            {currentList.length === 0 ? '등록된 계약이 없습니다' : '조건에 맞는 계약이 없습니다'}
          </p>
        </div>
      ) : (
        <div>
          {groupedItems.map(([groupKey, group], gIdx) => {
            const isExpanded = expandedGroups.has(groupKey)
            const badge = STATUS_BADGE[groupKey] || STATUS_BADGE['종료']

            return (
              <div key={groupKey}>
                {/* ── 그룹 헤더 ── */}
                <div onClick={() => toggleGroup(groupKey)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '6px 20px', cursor: 'pointer', gap: 8,
                    background: '#f8fafc', borderTop: gIdx > 0 ? '1px solid #e5e7eb' : 'none',
                    userSelect: 'none',
                  }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : '', display: 'inline-block', width: 14 }}>▶</span>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color }}>{groupKey}</span>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{group.items.length}건</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>·</span>
                  <span style={{ fontSize: 12, color: '#2d5fa8', fontWeight: 700 }}>{fm(group.totalAmount)}원</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>·</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>월 {fm(
                    activeSubTab === 'jiip'
                      ? group.items.reduce((s: number, c: any) => s + (c.status === 'active' ? (c.admin_fee || 0) : 0), 0)
                      : group.items.reduce((s: number, c: any) => s + (c.status === 'active' ? Math.round((c.invest_amount || 0) * (c.interest_rate || 0) / 100 / 12) : 0), 0)
                  )} 지급</span>
                </div>

                {/* ── 행 ── */}
                {isExpanded && group.items.map((item: any) => {
                  const stKey = activeSubTab === 'jiip' ? `jiip_share:${item.id}` : `invest:${item.id}`
                  const info = settlementMap[stKey]
                  const totalPaid = info?.totalExpense || 0
                  const months = monthsSince(item.contract_start_date)

                  const rowBase: React.CSSProperties = {
                    display: 'flex', alignItems: 'center', padding: '10px 20px', gap: 8,
                    cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                    background: '#fff', transition: 'background 0.1s',
                  }

                  if (activeSubTab === 'jiip') {
                    const exp = months * (item.admin_fee || 0)
                    const rate = exp > 0 ? Math.min(100, Math.round((totalPaid / exp) * 100)) : 0
                    return (
                      <div key={item.id} style={rowBase}
                        onClick={() => router.push(`/jiip/${item.id}`)}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8faff'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        {/* 차량 */}
                        <div style={{ width: 140, flexShrink: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: '#111827' }}>{item.car?.number || '미지정'}</div>
                          <div style={{ fontSize: 10, color: '#b0b0b0', marginTop: 1 }}>{item.car?.model || ''}</div>
                        </div>
                        {/* 차주 */}
                        <div style={{ width: 110, flexShrink: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>{item.investor_name}</div>
                          <div style={{ fontSize: 10, color: '#b0b0b0', marginTop: 1 }}>{item.investor_phone}</div>
                        </div>
                        {/* 투자금 */}
                        <div style={{ width: 120, flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: '#111827' }}>{f(item.invest_amount)}</div>
                          <span style={{ fontSize: 10, background: '#eff6ff', color: '#2d5fa8', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>배분 {item.share_ratio}%</span>
                        </div>
                        {/* 월 관리비 */}
                        <div style={{ width: 110, flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>{f(item.admin_fee)}</div>
                          <div style={{ fontSize: 10, color: '#b0b0b0' }}>매월 {item.payout_day}일</div>
                        </div>
                        {/* 누적 지급 */}
                        <div style={{ width: 110, flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: totalPaid > 0 ? '#111827' : '#d0d0d0' }}>{totalPaid > 0 ? f(totalPaid) : '—'}</div>
                          {totalPaid > 0 && <div style={{ fontSize: 10, color: '#b0b0b0' }}>{info?.monthsPaid.size || 0}개월</div>}
                        </div>
                        {/* 지급률 */}
                        <div style={{ width: 65, flexShrink: 0, textAlign: 'center' }}>
                          {exp > 0 ? (
                            <span style={{
                              fontSize: 11, fontWeight: 800, padding: '3px 7px', borderRadius: 4,
                              background: rate >= 90 ? '#dcfce7' : rate >= 50 ? '#fef9c3' : '#fee2e2',
                              color: rate >= 90 ? '#16a34a' : rate >= 50 ? '#ca8a04' : '#dc2626',
                            }}>{rate}%</span>
                          ) : <span style={{ fontSize: 11, color: '#d0d0d0' }}>—</span>}
                        </div>
                      </div>
                    )
                  } else {
                    // 투자
                    const gross = Math.round((item.invest_amount || 0) * (item.interest_rate || 0) / 100 / 12)
                    const net = calcAfterTax(gross, item.tax_type || '이자소득(27.5%)')
                    const exp = months * gross
                    const rate = exp > 0 ? Math.min(100, Math.round((totalPaid / exp) * 100)) : 0
                    const endDate = item.contract_end_date ? new Date(item.contract_end_date) : null
                    const dLeft = endDate ? Math.ceil((endDate.getTime() - today.getTime()) / 86400000) : null
                    return (
                      <div key={item.id} style={rowBase}
                        onClick={() => router.push(`/invest/general/${item.id}`)}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8faff'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        {/* 투자자 */}
                        <div style={{ width: 120, flexShrink: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: '#111827' }}>{item.investor_name}</div>
                          <div style={{ fontSize: 10, color: '#b0b0b0', marginTop: 1 }}>{item.investor_phone}</div>
                        </div>
                        {/* 투자원금 */}
                        <div style={{ width: 130, flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: '#111827' }}>{f(item.invest_amount)}</div>
                          <span style={{ fontSize: 10, background: '#eff6ff', color: '#2d5fa8', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>연 {Number(item.interest_rate).toFixed(1)}%</span>
                        </div>
                        {/* 월 이자(세후) */}
                        <div style={{ width: 120, flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>{f(net)}</div>
                          <div style={{ fontSize: 10, color: '#b0b0b0' }}>세전 {f(gross)} · {taxLabel(item.tax_type || '이자소득(27.5%)')}</div>
                        </div>
                        {/* 지급일 */}
                        <div style={{ width: 60, flexShrink: 0, textAlign: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#374151' }}>{item.payment_day}<span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>일</span></span>
                        </div>
                        {/* 누적 지급 */}
                        <div style={{ width: 110, flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: totalPaid > 0 ? '#111827' : '#d0d0d0' }}>{totalPaid > 0 ? f(totalPaid) : '—'}</div>
                          {totalPaid > 0 && <div style={{ fontSize: 10, color: '#b0b0b0' }}>{info?.monthsPaid.size || 0}개월</div>}
                        </div>
                        {/* 지급률 */}
                        <div style={{ width: 65, flexShrink: 0, textAlign: 'center' }}>
                          {exp > 0 ? (
                            <span style={{
                              fontSize: 11, fontWeight: 800, padding: '3px 7px', borderRadius: 4,
                              background: rate >= 90 ? '#dcfce7' : rate >= 50 ? '#fef9c3' : '#fee2e2',
                              color: rate >= 90 ? '#16a34a' : rate >= 50 ? '#ca8a04' : '#dc2626',
                            }}>{rate}%</span>
                          ) : <span style={{ fontSize: 11, color: '#d0d0d0' }}>—</span>}
                        </div>
                        {/* 만기 */}
                        <div style={{ width: 80, flexShrink: 0, textAlign: 'center' }}>
                          {endDate ? (
                            <div>
                              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{item.contract_end_date?.slice(5)}</div>
                              {dLeft !== null && dLeft >= 0 && dLeft <= 90 && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                                  background: dLeft <= 7 ? '#fee2e2' : dLeft <= 30 ? '#fff7ed' : '#fefce8',
                                  color: dLeft <= 7 ? '#dc2626' : dLeft <= 30 ? '#ea580c' : '#ca8a04',
                                }}>D-{dLeft}</span>
                              )}
                              {dLeft !== null && dLeft < 0 && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#fee2e2', color: '#dc2626' }}>초과</span>
                              )}
                            </div>
                          ) : <span style={{ fontSize: 11, color: '#d0d0d0' }}>—</span>}
                        </div>
                      </div>
                    )
                  }
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* ── 하단 요약 ── */}
      {filteredList.length > 0 && (
        <div style={{ padding: '10px 20px', borderTop: '1px solid #e5e7eb', background: '#f8fafc', display: 'flex', gap: 16, fontSize: 11, color: '#64748b', fontWeight: 600, flexWrap: 'wrap' }}>
          <span>조회 <b style={{ color: '#111827' }}>{filteredList.length}건</b></span>
          <span>총 투자금 <b style={{ color: '#111827' }}>{fm(summaryStats.income)}</b></span>
          <span>월 지급 <b style={{ color: '#111827' }}>{fm(summaryStats.expense)}</b></span>
          <span>누적 지급 <b style={{ color: '#2d5fa8' }}>{fm(summaryStats.totalPaid)}</b></span>
          <span>{activeSubTab === 'jiip' ? '평균 배분율' : '평균 이자율'} <b>{summaryStats.avgRate}%</b></span>
        </div>
      )}
    </div>
  )
}

'use client'

import React, { useState, useMemo } from 'react'

// ═══════════════════════════════════════════════════════════════
// 정산실행 탭 — 정산 발송 · 이체 확인 · 지급 완료 통합 뷰
// 다른 탭과 동일한 서브탭 + 필터 + 테이블 레이아웃
// ═══════════════════════════════════════════════════════════════

const nf = (num: number) => num ? num.toLocaleString() : '0'

type SettlementItem = {
  id: string; type: 'jiip' | 'invest' | 'loan'; name: string; amount: number
  dueDay: number; dueDate: string; status: 'pending' | 'approved' | 'paid'
  relatedId: string; detail: string; paidTxIds?: string[]
  carNumber?: string; carModel?: string; carId?: string
  monthLabel?: string; isOverdue?: boolean
  breakdown?: any
}

type ShareHistoryItem = {
  id: string; recipient_name: string; recipient_phone: string
  settlement_month: string; total_amount: number; created_at: string; paid_at: string | null
}

type TransferRow = {
  bank: string; account: string; holder: string; amount: number
  senderLabel: string; memo: string; type: string; name: string
}

type SettlementSettings = {
  settlementMonth: string; paymentDate: string; memo: string
}

type SubTab = 'send' | 'transfer' | 'history'

type Props = {
  items: SettlementItem[]
  selectedIds: Set<string>
  toggleSelect: (id: string) => void
  toggleSelectAll: () => void
  onSendNotify: (overrideItems?: SettlementItem[]) => void
  sendingNotify: boolean
  notifyChannel: 'sms' | 'email'
  setNotifyChannel: (ch: 'sms' | 'email') => void
  shareHistory: ShareHistoryItem[]
  onTogglePaid: (shareId: string, currentlyPaid: boolean) => void
  onBulkPaid: (shareIds: string[]) => void
  onCancelSettlement: (item: SettlementItem) => void
  onDownloadBulkTransfer: () => void
  transferPreview: TransferRow[]
  showTransferPreview: boolean
  onBuildTransferPreview: () => void
  onDownloadFromPreview: () => void
  onCloseTransferPreview: () => void
  settlementSettings: SettlementSettings
  setSettlementSettings: (s: SettlementSettings | ((prev: SettlementSettings) => SettlementSettings)) => void
  onSendIndividual: (item: SettlementItem) => void
  companyName: string
}

export default function ExecuteTab({
  items, selectedIds, toggleSelect, toggleSelectAll,
  onSendNotify, sendingNotify, notifyChannel, setNotifyChannel,
  shareHistory, onTogglePaid, onBulkPaid,
  onDownloadBulkTransfer, transferPreview,
  onBuildTransferPreview, onDownloadFromPreview, onCloseTransferPreview,
  settlementSettings, setSettlementSettings,
  onSendIndividual, companyName,
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('send')
  const [typeFilter, setTypeFilter] = useState<'all' | 'jiip' | 'invest' | 'loan'>('all')
  const [searchText, setSearchText] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  // ── 데이터 분류 ──
  const sentNames = new Set(shareHistory.map(s => s.recipient_name))
  const unpaidShares = shareHistory.filter(s => !s.paid_at)
  const paidShares = shareHistory.filter(s => s.paid_at)

  const pendingItems = useMemo(() => {
    let list = items.filter(i => i.status === 'pending' && !sentNames.has(i.name))
    if (typeFilter !== 'all') list = list.filter(i => i.type === typeFilter)
    if (searchText) {
      const t = searchText.toLowerCase()
      list = list.filter(i => i.name.toLowerCase().includes(t) || (i.carNumber || '').toLowerCase().includes(t))
    }
    return list
  }, [items, sentNames, typeFilter, searchText])

  const sentButUnpaidItems = useMemo(() => {
    return items.filter(i => i.status === 'pending' && sentNames.has(i.name) && !paidShares.some(s => s.recipient_name === i.name))
  }, [items, sentNames, paidShares])

  const selectedTotal = items.filter(i => selectedIds.has(i.id)).reduce((s, i) => s + i.amount, 0)

  // 이체 미리보기 (미지급분만)
  const unpaidTransfers = useMemo(() => {
    const unpaidNames = new Set(unpaidShares.map(s => s.recipient_name))
    return transferPreview.filter(r => unpaidNames.has(r.name))
  }, [transferPreview, unpaidShares])

  const compShort = companyName.replace('주식회사', '').replace('(주)', '').trim()
  const sMonth = parseInt(settlementSettings.settlementMonth.slice(5), 10) || 0
  const liveSenderLabel = `${sMonth}월정산 ${compShort}`.slice(0, 14)

  // ── 서브탭 카운트 ──
  const sendCount = pendingItems.length + sentButUnpaidItems.length
  const transferCount = unpaidShares.length
  const historyCount = paidShares.length

  const typeChips = [
    { key: 'all' as const, label: '전체' },
    { key: 'jiip' as const, label: '지입' },
    { key: 'invest' as const, label: '투자' },
    { key: 'loan' as const, label: '대출' },
  ]

  const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    jiip: { label: '지입', color: '#7c3aed', bg: '#f3e8ff' },
    invest: { label: '투자', color: '#2563eb', bg: '#dbeafe' },
    loan: { label: '대출', color: '#ea580c', bg: '#ffedd5' },
  }

  const handleSubTabChange = (tab: SubTab) => {
    setActiveSubTab(tab)
    setSearchText('')
    if (tab === 'transfer' && unpaidShares.length > 0 && transferPreview.length === 0) {
      onBuildTransferPreview()
    }
  }

  return (
    <div>
      {/* ═══ 헤더: 서브탭 + 통계 + 설정 ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
        {([
          { key: 'send' as SubTab, label: '정산 발송', count: sendCount },
          { key: 'transfer' as SubTab, label: '이체 확인', count: transferCount },
          { key: 'history' as SubTab, label: '지급 완료', count: historyCount },
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
              background: activeSubTab === tab.key
                ? (tab.key === 'history' ? '#16a34a' : '#2d5fa8')
                : '#e2e8f0',
              color: activeSubTab === tab.key ? '#fff' : '#64748b',
            }}>{tab.count}</span>
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 통계 */}
          {[
            { label: '미발송', value: `${pendingItems.length}건`, color: '#ea580c' },
            { label: '이체대기', value: `${unpaidShares.length}건`, color: '#2563eb' },
            { label: '지급완료', value: `${paidShares.length}건`, color: '#16a34a' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '6px 0' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, lineHeight: 1 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.color, lineHeight: 1.4 }}>{s.value}</div>
            </div>
          ))}
          <button onClick={() => setShowSettings(!showSettings)}
            style={{ background: showSettings ? '#2d5fa8' : '#f1f5f9', color: showSettings ? '#fff' : '#64748b', border: 'none', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            설정
          </button>
        </div>
      </div>

      {/* ═══ 정산 설정 (토글) ═══ */}
      {showSettings && (
        <div style={{ padding: '12px 20px', background: '#fafbfc', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>정산월</label>
              <input type="month" value={settlementSettings.settlementMonth}
                onChange={e => setSettlementSettings((prev: SettlementSettings) => ({ ...prev, settlementMonth: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, fontWeight: 700, color: '#111827', background: '#fff' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>지급예정일</label>
              <input type="date" value={settlementSettings.paymentDate}
                onChange={e => setSettlementSettings((prev: SettlementSettings) => ({ ...prev, paymentDate: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, fontWeight: 700, color: '#111827', background: '#fff' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>메모</label>
              <input type="text" placeholder="안내사항" value={settlementSettings.memo}
                onChange={e => setSettlementSettings((prev: SettlementSettings) => ({ ...prev, memo: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, color: '#111827', background: '#fff' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* SUB-TAB 1: 정산 발송 */}
      {/* ═══════════════════════════════════════ */}
      {activeSubTab === 'send' && (
        <div>
          {/* 컨트롤 바 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', gap: 8, borderBottom: '1px solid #f1f5f9', background: '#fafbfc', flexWrap: 'wrap' }}>
            {typeChips.map(chip => {
              const on = typeFilter === chip.key
              return (
                <button key={chip.key} onClick={() => setTypeFilter(chip.key)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    background: on ? '#eef2ff' : 'transparent',
                    color: on ? '#2d5fa8' : '#94a3b8',
                    border: on ? '1px solid #c7d2fe' : '1px solid transparent',
                  }}>
                  {chip.label}
                </button>
              )
            })}
            <span style={{ width: 1, height: 16, background: '#e2e8f0' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox"
                checked={selectedIds.size === pendingItems.length && pendingItems.length > 0}
                onChange={toggleSelectAll}
                style={{ width: 14, height: 14 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>
                전체 선택 ({selectedIds.size}건 · {nf(selectedTotal)}원)
              </span>
            </label>
            <div style={{ flex: 1 }} />
            <select value={notifyChannel} onChange={e => setNotifyChannel(e.target.value as 'sms' | 'email')}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, background: '#fff' }}>
              <option value="sms">SMS</option>
              <option value="email">이메일</option>
            </select>
            <button onClick={() => onSendNotify()} disabled={sendingNotify || selectedIds.size === 0}
              style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 800,
                cursor: selectedIds.size > 0 ? 'pointer' : 'default',
                background: selectedIds.size > 0 ? '#2d5fa8' : '#e5e7eb',
                color: selectedIds.size > 0 ? '#fff' : '#9ca3af',
                border: 'none', opacity: sendingNotify ? 0.5 : 1,
              }}>
              {sendingNotify ? '발송중...' : '일괄 발송'}
            </button>
            <input type="text" placeholder="검색..." value={searchText} onChange={e => setSearchText(e.target.value)}
              style={{ padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, width: 140, outline: 'none', background: '#fff', color: '#0f172a' }} />
          </div>

          {/* 테이블 헤더 */}
          <div style={{
            display: 'flex', alignItems: 'center', padding: '7px 20px', gap: 8,
            background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
          }}>
            <div style={{ width: 30, flexShrink: 0 }} />
            <div style={{ width: 50, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b' }}>구분</div>
            <div style={{ width: 40, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>월</div>
            <div style={{ width: 100, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b' }}>대상</div>
            <div style={{ width: 100, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b' }}>차량</div>
            <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: '#64748b' }}>상세</div>
            <div style={{ width: 110, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'right' }}>금액</div>
            <div style={{ width: 60, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>발송</div>
          </div>

          {/* 데이터 행 */}
          {pendingItems.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>미발송 항목이 없습니다</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>모든 항목이 발송되었거나 조건에 맞는 항목이 없습니다.</p>
            </div>
          ) : (
            pendingItems.map((item) => {
              const badge = TYPE_BADGE[item.type]
              const isSelected = selectedIds.has(item.id)
              return (
                <div key={item.id}
                  onClick={() => toggleSelect(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '9px 20px', gap: 8,
                    cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                    background: isSelected ? '#f0f5ff' : item.isOverdue ? '#fef2f2' : '#fff',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8faff' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = item.isOverdue ? '#fef2f2' : '#fff' }}
                >
                  <div style={{ width: 30, flexShrink: 0 }}>
                    <input type="checkbox" checked={isSelected}
                      onChange={e => { e.stopPropagation(); toggleSelect(item.id) }}
                      onClick={e => e.stopPropagation()}
                      style={{ width: 14, height: 14 }} />
                  </div>
                  <div style={{ width: 50, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: badge.bg, color: badge.color }}>{badge.label}</span>
                    {item.isOverdue && <span style={{ fontSize: 8, background: '#ef4444', color: '#fff', padding: '1px 4px', borderRadius: 3, fontWeight: 700, marginLeft: 2 }}>이월</span>}
                  </div>
                  <div style={{ width: 40, flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#6b7280', textAlign: 'center' }}>{item.monthLabel?.slice(5)}월</div>
                  <div style={{ width: 100, flexShrink: 0, fontWeight: 800, fontSize: 13, color: '#111827' }}>{item.name}</div>
                  <div style={{ width: 100, flexShrink: 0, fontSize: 11, color: '#9ca3af' }}>{item.carNumber || '—'}</div>
                  <div style={{ flex: 1, fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.detail}</div>
                  <div style={{ width: 110, flexShrink: 0, textAlign: 'right', fontWeight: 900, fontSize: 13, color: '#dc2626' }}>{nf(item.amount)}원</div>
                  <div style={{ width: 60, flexShrink: 0, textAlign: 'center' }}>
                    <button onClick={e => { e.stopPropagation(); onSendIndividual(item) }}
                      style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: 'transparent', color: '#2563eb', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>
                      발송
                    </button>
                  </div>
                </div>
              )
            })
          )}

          {/* 하단 요약 */}
          {(pendingItems.length > 0 || sentButUnpaidItems.length > 0) && (
            <div style={{ padding: '10px 20px', borderTop: '1px solid #e5e7eb', background: '#f8fafc', display: 'flex', gap: 16, fontSize: 11, color: '#64748b', fontWeight: 600, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>미발송 <b style={{ color: '#ea580c' }}>{pendingItems.length}건</b> · {nf(pendingItems.reduce((s, i) => s + i.amount, 0))}원</span>
              {sentButUnpaidItems.length > 0 && (
                <span>발송완료(이체대기) <b style={{ color: '#2563eb' }}>{sentButUnpaidItems.length}건</b></span>
              )}
              {paidShares.length > 0 && (
                <span>지급완료 <b style={{ color: '#16a34a' }}>{paidShares.length}건</b></span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* SUB-TAB 2: 이체 확인 */}
      {/* ═══════════════════════════════════════ */}
      {activeSubTab === 'transfer' && (
        <div>
          {/* 컨트롤 바 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', gap: 8, borderBottom: '1px solid #f1f5f9', background: '#fafbfc', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>
              {unpaidTransfers.length}건 · {nf(unpaidTransfers.reduce((s, r) => s + r.amount, 0))}원
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={onDownloadFromPreview}
              style={{ padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer', background: '#0284c7', color: '#fff', border: 'none' }}>
              다계좌이체 (.xls)
            </button>
            {unpaidShares.length > 0 && (
              <button onClick={() => onBulkPaid(unpaidShares.map(s => s.id))}
                style={{ padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer', background: '#16a34a', color: '#fff', border: 'none' }}>
                전체 지급완료 ({unpaidTransfers.length}건)
              </button>
            )}
          </div>

          {/* 은행정보 누락 경고 */}
          {unpaidTransfers.some(r => !r.bank || !r.account) && (
            <div style={{ padding: '8px 20px', background: '#fffbeb', borderBottom: '1px solid #fde68a', fontSize: 12, color: '#92400e', fontWeight: 600 }}>
              은행정보 누락: {unpaidTransfers.filter(r => !r.bank || !r.account).map(r => r.name).join(', ')}
            </div>
          )}

          {/* 테이블 헤더 */}
          <div style={{
            display: 'flex', alignItems: 'center', padding: '7px 20px', gap: 8,
            background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
          }}>
            <div style={{ width: 30, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>No</div>
            <div style={{ width: 100, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b' }}>대상</div>
            <div style={{ width: 80, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b' }}>입금은행</div>
            <div style={{ width: 150, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b' }}>계좌번호</div>
            <div style={{ width: 120, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'right' }}>이체금액</div>
            <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: '#64748b' }}>보내는분</div>
            <div style={{ width: 70, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>처리</div>
          </div>

          {/* 이체 행 */}
          {unpaidTransfers.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>이체 대기 항목이 없습니다</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>정산서를 먼저 발송하면 이체 목록이 생성됩니다.</p>
            </div>
          ) : (
            unpaidTransfers.map((row, idx) => {
              const matchShare = unpaidShares.find(s => s.recipient_name === row.name)
              return (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', padding: '9px 20px', gap: 8,
                  borderBottom: '1px solid #f5f5f5', background: '#fff', transition: 'background 0.1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8faff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <div style={{ width: 30, flexShrink: 0, textAlign: 'center', fontSize: 12, color: '#9ca3af', fontWeight: 700 }}>{idx + 1}</div>
                  <div style={{ width: 100, flexShrink: 0, fontWeight: 800, fontSize: 13, color: '#111827' }}>{row.name}</div>
                  <div style={{ width: 80, flexShrink: 0, fontSize: 12, color: row.bank ? '#374151' : '#ef4444', fontWeight: 600 }}>{row.bank || '미등록'}</div>
                  <div style={{ width: 150, flexShrink: 0, fontFamily: 'monospace', fontSize: 12, color: row.account ? '#374151' : '#ef4444' }}>{row.account || '미등록'}</div>
                  <div style={{ width: 120, flexShrink: 0, textAlign: 'right', fontWeight: 900, fontSize: 13, color: '#2563eb' }}>{nf(row.amount)}원</div>
                  <div style={{ flex: 1, fontSize: 12, color: '#6b7280' }}>{liveSenderLabel}</div>
                  <div style={{ width: 70, flexShrink: 0, textAlign: 'center' }}>
                    {matchShare && (
                      <button onClick={() => onTogglePaid(matchShare.id, false)}
                        style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: '#16a34a', color: '#fff', border: 'none' }}>
                        지급완료
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}

          {/* 합계 */}
          {unpaidTransfers.length > 0 && (
            <div style={{ padding: '10px 20px', borderTop: '1px solid #e5e7eb', background: '#f0f9ff', display: 'flex', gap: 16, fontSize: 11, color: '#64748b', fontWeight: 600, alignItems: 'center' }}>
              <span>합계 <b style={{ color: '#0369a1', fontSize: 13 }}>{nf(unpaidTransfers.reduce((s, r) => s + r.amount, 0))}원</b></span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* SUB-TAB 3: 지급 완료 이력 */}
      {/* ═══════════════════════════════════════ */}
      {activeSubTab === 'history' && (
        <div>
          {/* 컨트롤 바 */}
          {paidShares.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', gap: 8, borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>
                {paidShares.length}건 · {nf(paidShares.reduce((s, r) => s + r.total_amount, 0))}원 지급완료
              </span>
            </div>
          )}

          {/* 테이블 헤더 */}
          <div style={{
            display: 'flex', alignItems: 'center', padding: '7px 20px', gap: 8,
            background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
          }}>
            <div style={{ width: 30, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>No</div>
            <div style={{ width: 120, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b' }}>수신자</div>
            <div style={{ width: 120, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b' }}>연락처</div>
            <div style={{ width: 120, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'right' }}>금액</div>
            <div style={{ width: 90, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>발송일</div>
            <div style={{ width: 90, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>지급일</div>
            <div style={{ flex: 1 }} />
            <div style={{ width: 60, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center' }}>처리</div>
          </div>

          {/* 지급완료 행 */}
          {paidShares.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>지급완료 항목이 없습니다</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>이체 확인에서 지급완료 처리하면 여기에 표시됩니다.</p>
            </div>
          ) : (
            paidShares.map((sh, idx) => (
              <div key={sh.id} style={{
                display: 'flex', alignItems: 'center', padding: '9px 20px', gap: 8,
                borderBottom: '1px solid #f5f5f5', background: '#f0fdf4', transition: 'background 0.1s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#dcfce7'}
                onMouseLeave={e => e.currentTarget.style.background = '#f0fdf4'}
              >
                <div style={{ width: 30, flexShrink: 0, textAlign: 'center', fontSize: 12, color: '#9ca3af', fontWeight: 700 }}>{idx + 1}</div>
                <div style={{ width: 120, flexShrink: 0, fontWeight: 800, fontSize: 13, color: '#111827' }}>{sh.recipient_name}</div>
                <div style={{ width: 120, flexShrink: 0, fontSize: 12, color: '#9ca3af' }}>
                  {sh.recipient_phone ? sh.recipient_phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : '—'}
                </div>
                <div style={{ width: 120, flexShrink: 0, textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#16a34a' }}>{nf(sh.total_amount)}원</div>
                <div style={{ width: 90, flexShrink: 0, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
                  {new Date(sh.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                </div>
                <div style={{ width: 90, flexShrink: 0, textAlign: 'center', fontSize: 12, color: '#16a34a', fontWeight: 700 }}>
                  {sh.paid_at ? new Date(sh.paid_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '—'}
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ width: 60, flexShrink: 0, textAlign: 'center' }}>
                  <button onClick={() => onTogglePaid(sh.id, true)}
                    style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: '#fff', color: '#dc2626', border: '1px solid #fecaca' }}>
                    취소
                  </button>
                </div>
              </div>
            ))
          )}

          {/* 합계 + 완료 배너 */}
          {paidShares.length > 0 && (
            <div style={{ padding: '10px 20px', borderTop: '1px solid #e5e7eb', background: '#f0fdf4', display: 'flex', gap: 16, fontSize: 11, color: '#64748b', fontWeight: 600, alignItems: 'center' }}>
              <span>합계 <b style={{ color: '#166534', fontSize: 13 }}>{nf(paidShares.reduce((s, r) => s + r.total_amount, 0))}원</b></span>
              {unpaidShares.length === 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: '#16a34a' }}>모든 정산 완료</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

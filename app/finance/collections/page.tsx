'use client'
import { auth } from '@/lib/auth-client'

import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import ConfirmPaymentModal from './ConfirmPaymentModal'
import DarkHeader from '../../components/DarkHeader'
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

// ============================================
// 수금 관리 페이지
// 3탭: 미수금 현황 / 수금 완료 / 연체 관리
// ============================================

type Schedule = {
  id: string
  contract_type: string
  contract_id: string
  payment_date: string
  expected_amount: number
  actual_amount?: number
  status: string
  matched_transaction_id?: string
  customer_name?: string
  phone?: string
  email?: string
  company_id?: string
}

type Tab = 'pending' | 'completed' | 'overdue'

export default function CollectionsPage() {
  const { company, role } = useApp()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmTarget, setConfirmTarget] = useState<Schedule | null>(null)
  const [sending, setSending] = useState(false)
  const [sendChannel, setSendChannel] = useState<'sms' | 'email'>('sms')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const effectiveCompanyId = company?.id

  useEffect(() => {
    fetchSchedules()
    setSelectedIds(new Set())
  }, [filterMonth, company])

  // ── 데이터 조회 ──
  const fetchSchedules = async () => {
    if (!effectiveCompanyId && role !== 'admin') return
    setLoading(true)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await getAuthHeader()) }

      const [year, month] = filterMonth.split('-').map(Number)
      const lastDay = new Date(year, month, 0).getDate()
      const from = `${filterMonth}-01`
      const to = `${filterMonth}-${String(lastDay).padStart(2, '0')}`

      // Note: expected_payment_schedules table doesn't have an API route yet
      // For now, we'll use a placeholder fetch that would need to be implemented
      const res = await fetch(`/api/expected-payment-schedules?from=${from}&to=${to}`, { headers })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch schedules')

      // 고객명 조인
      const enriched = await enrichWithCustomerInfo(json.data || [])
      setSchedules(enriched)
    } catch (err) {
      console.error('[collections] 조회 오류:', err)
    } finally {
      setLoading(false)
    }
  }

  const enrichWithCustomerInfo = async (scheds: any[]): Promise<Schedule[]> => {
    if (scheds.length === 0) return []

    const jiipIds = scheds.filter(s => s.contract_type === 'jiip').map(s => s.contract_id)
    const investIds = scheds.filter(s => s.contract_type !== 'jiip').map(s => s.contract_id)

    let jiipMap: Record<string, any> = {}
    let investMap: Record<string, any> = {}

    const headers = { 'Content-Type': 'application/json', ...(await getAuthHeader()) }

    if (jiipIds.length > 0) {
      try {
        const res = await fetch(`/api/jiip?ids=${jiipIds.join(',')}`, { headers })
        const json = await res.json()
        json.data?.forEach((c: any) => { jiipMap[c.id] = c })
      } catch (e) { console.error('Failed to fetch jiip_contracts:', e) }
    }
    if (investIds.length > 0) {
      try {
        const res = await fetch(`/api/investments?ids=${investIds.join(',')}`, { headers })
        const json = await res.json()
        json.data?.forEach((c: any) => { investMap[c.id] = c })
      } catch (e) { console.error('Failed to fetch general_investments:', e) }
    }

    return scheds.map(s => {
      if (s.contract_type === 'jiip') {
        const c = jiipMap[s.contract_id]
        return { ...s, customer_name: c?.investor_name, phone: c?.phone, email: c?.investor_email }
      } else {
        const c = investMap[s.contract_id]
        return { ...s, customer_name: c?.investor_name, phone: c?.investor_phone, email: c?.investor_email }
      }
    })
  }

  // ── 필터 ──
  const today = new Date().toISOString().split('T')[0]

  const pendingSchedules = schedules.filter(s => s.status === 'pending' && s.payment_date >= today)
  const overdueSchedules = schedules.filter(s => s.status === 'pending' && s.payment_date < today)
  const completedSchedules = schedules.filter(s => s.status === 'completed' || s.status === 'partial')

  const displayList = activeTab === 'pending' ? pendingSchedules
    : activeTab === 'overdue' ? overdueSchedules
    : completedSchedules

  // ── KPI 계산 ──
  const totalExpected = schedules.reduce((a, s) => a + Number(s.expected_amount || 0), 0)
  const totalCollected = completedSchedules.reduce((a, s) => a + Number(s.actual_amount || s.expected_amount || 0), 0)
  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0
  const overdueTotal = overdueSchedules.reduce((a, s) => a + Number(s.expected_amount || 0), 0)

  // ── 체크박스 ──
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    if (selectedIds.size === displayList.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(displayList.map(s => s.id)))
    }
  }

  // ── 납부 안내 발송 ──
  const handleSendReminder = async () => {
    if (selectedIds.size === 0) return
    setSending(true)
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : ''
      const res = await fetch('/api/collections/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          schedule_ids: Array.from(selectedIds),
          channel: sendChannel,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`발송 완료: ${data.sent}건 성공, ${data.failed}건 실패`, data.failed > 0 ? 'error' : 'success')
      setSelectedIds(new Set())
    } catch (err: any) {
      showToast(`발송 실패: ${err.message}`, 'error')
    } finally {
      setSending(false)
    }
  }

  // ── 수금 확인 완료 콜백 ──
  const handleConfirmDone = () => {
    setConfirmTarget(null)
    fetchSchedules()
    showToast('수금 확인 완료', 'success')
  }

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const nf = (n: number) => n.toLocaleString('ko-KR')

  const overdueDays = (dateStr: string) => {
    const diff = new Date().getTime() - new Date(dateStr).getTime()
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
  }

  const getToken = async () => auth.currentUser ? await auth.currentUser.getIdToken() : ''

  // ── 월 이동 ──
  const changeMonth = (delta: number) => {
    const [y, m] = filterMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setFilterMonth(d.toISOString().slice(0, 7))
  }

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: 'pending', label: '미수금', count: pendingSchedules.length, color: 'text-amber-400' },
    { key: 'overdue', label: '연체', count: overdueSchedules.length, color: 'text-red-400' },
    { key: 'completed', label: '수금완료', count: completedSchedules.length, color: 'text-emerald-400' },
  ]

  if (!effectiveCompanyId && !loading) {
    return (
      <div className="page-bg">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'left' }}>
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">📋 수금 관리</h1>
            <p className="text-slate-400 text-sm mt-1">납부 현황 확인 및 수금 관리 · 안내 발송</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm text-center py-20">
          <p className="text-4xl mb-3">🏢</p>
          <p className="font-semibold text-sm text-slate-400">좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p className="text-xs text-slate-500 mt-1">회사 선택 후 수금 관리를 이용할 수 있습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-bg">
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-8 md:px-6 space-y-6">
        {/* DarkHeader */}
        <DarkHeader
          icon="💰"
          title="수금 관리"
          subtitle="납부 현황 확인 및 수금 관리 · 안내 발송"
          stats={[
            { label: '이번달 예상 수금', value: `${nf(totalExpected)}원`, color: '#2563eb', bgColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.3)', labelColor: 'rgba(59, 130, 246, 0.4)' },
            { label: '수금 완료', value: `${nf(totalCollected)}원`, color: '#34d399', bgColor: 'rgba(52, 211, 153, 0.1)', borderColor: 'rgba(52, 211, 153, 0.3)', labelColor: 'rgba(52, 211, 153, 0.4)' },
            { label: '수금율', value: `${collectionRate}%`, color: collectionRate >= 80 ? '#34d399' : collectionRate >= 50 ? '#fbbf24' : '#f87171', bgColor: collectionRate >= 80 ? 'rgba(52, 211, 153, 0.1)' : collectionRate >= 50 ? 'rgba(251, 191, 36, 0.1)' : 'rgba(248, 113, 113, 0.1)', borderColor: collectionRate >= 80 ? 'rgba(52, 211, 153, 0.3)' : collectionRate >= 50 ? 'rgba(251, 191, 36, 0.3)' : 'rgba(248, 113, 113, 0.3)', labelColor: collectionRate >= 80 ? 'rgba(52, 211, 153, 0.4)' : collectionRate >= 50 ? 'rgba(251, 191, 36, 0.4)' : 'rgba(248, 113, 113, 0.4)' },
            { label: '연체', value: `${nf(overdueTotal)}원`, color: overdueSchedules.length > 0 ? '#f87171' : '#cbd5e1', bgColor: overdueSchedules.length > 0 ? 'rgba(248, 113, 113, 0.1)' : 'rgba(203, 213, 225, 0.1)', borderColor: overdueSchedules.length > 0 ? 'rgba(248, 113, 113, 0.3)' : 'rgba(203, 213, 225, 0.3)', labelColor: overdueSchedules.length > 0 ? 'rgba(248, 113, 113, 0.4)' : 'rgba(203, 213, 225, 0.4)' },
          ]}
        >
          {/* Month navigation in children */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
            <button onClick={() => changeMonth(-1)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(255, 255, 255, 0.05)', cursor: 'pointer', color: '#334155' }}>‹</button>
            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
              style={{ border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: 600, background: 'rgba(255, 255, 255, 0.05)', color: '#1e293b' }} />
            <button onClick={() => changeMonth(1)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(255, 255, 255, 0.05)', cursor: 'pointer', color: '#334155' }}>›</button>
          </div>
        </DarkHeader>

        {/* 탭 + 액션 바 */}
        <div className="bg-white rounded-2xl shadow-sm border border-black/[0.06]">
          <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2 border-b border-black/5 flex-wrap gap-3">
            <div className="flex gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()) }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab.key
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 text-xs font-black ${activeTab === tab.key ? 'text-white/70' : tab.color}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* 액션 버튼 */}
            {(activeTab === 'pending' || activeTab === 'overdue') && (
              <div className="flex items-center gap-2">
                <select
                  value={sendChannel}
                  onChange={(e) => setSendChannel(e.target.value as 'sms' | 'email')}
                  className="px-3 py-1.5 rounded-lg border border-black/[0.06] text-xs font-bold focus:outline-none bg-gray-50 text-slate-700"
                >
                  <option value="sms">SMS</option>
                  <option value="email">이메일</option>
                </select>
                <button
                  onClick={handleSendReminder}
                  disabled={selectedIds.size === 0 || sending}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm"
                >
                  {sending ? '발송중...' : `납부 안내 발송 (${selectedIds.size})`}
                </button>
              </div>
            )}
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-7 h-7 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
                  <span className="text-sm font-medium text-slate-400">불러오는 중...</span>
                </div>
              </div>
            ) : displayList.length === 0 ? (
              <div className="text-center py-20 text-slate-400 text-sm">
                {activeTab === 'pending' ? '미수금 내역이 없습니다.' : activeTab === 'overdue' ? '연체 건이 없습니다.' : '수금 완료 내역이 없습니다.'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-slate-500 text-[11px] uppercase font-black">
                    {(activeTab === 'pending' || activeTab === 'overdue') && (
                      <th className="py-3 px-4 text-center w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === displayList.length && displayList.length > 0}
                          onChange={toggleAll}
                          className="rounded"
                        />
                      </th>
                    )}
                    <th className="py-3 px-4 text-left">고객명</th>
                    <th className="py-3 px-4 text-left">계약유형</th>
                    <th className="py-3 px-4 text-center">납부기한</th>
                    {activeTab === 'overdue' && <th className="py-3 px-4 text-center">연체일</th>}
                    <th className="py-3 px-4 text-right">청구금액</th>
                    {activeTab === 'completed' && <th className="py-3 px-4 text-right">입금액</th>}
                    <th className="py-3 px-4 text-center">상태</th>
                    <th className="py-3 px-4 text-center">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {displayList.map(s => (
                    <tr
                      key={s.id}
                      className={`border-b border-black/5 hover:bg-white/[0.03] transition-colors ${
                        activeTab === 'overdue' ? 'bg-red-500/10' : ''
                      }`}
                    >
                      {(activeTab === 'pending' || activeTab === 'overdue') && (
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleSelect(s.id)}
                            className="rounded"
                          />
                        </td>
                      )}
                      <td className="py-3 px-4 font-bold text-slate-800">{s.customer_name || '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          s.contract_type === 'jiip'
                            ? 'bg-violet-900/40 text-violet-400'
                            : 'bg-emerald-900/40 text-emerald-400'
                        }`}>
                          {s.contract_type === 'jiip' ? '지입' : '투자'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-slate-400">{s.payment_date}</td>
                      {activeTab === 'overdue' && (
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded bg-red-900/40 text-red-400 text-xs font-black">
                            D+{overdueDays(s.payment_date)}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-4 text-right font-bold text-slate-800">{nf(Number(s.expected_amount))}원</td>
                      {activeTab === 'completed' && (
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">{nf(Number(s.actual_amount || s.expected_amount))}원</td>
                      )}
                      <td className="py-3 px-4 text-center">
                        <StatusBadge status={s.status} paymentDate={s.payment_date} />
                      </td>
                      <td className="py-3 px-4 text-center">
                        {(s.status === 'pending') && (
                          <button
                            onClick={() => setConfirmTarget(s)}
                            className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-all shadow-sm"
                          >
                            수금 확인
                          </button>
                        )}
                        {s.status === 'completed' && (
                          <span className="text-emerald-400 text-xs font-bold">✓ 완료</span>
                        )}
                        {s.status === 'partial' && (
                          <button
                            onClick={() => setConfirmTarget(s)}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-all shadow-sm"
                          >
                            추가 입금
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 하단 합계 */}
          {displayList.length > 0 && (
            <div className="px-6 py-3 border-t border-black/5 flex justify-between items-center text-sm">
              <span className="text-slate-400">총 {displayList.length}건</span>
              <span className="font-black text-slate-800">
                합계: {nf(displayList.reduce((a, s) => a + Number(s.expected_amount || 0), 0))}원
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 수금 확인 모달 */}
      {confirmTarget && (
        <ConfirmPaymentModalWrapper
          schedule={confirmTarget}
          onClose={() => setConfirmTarget(null)}
          onConfirm={handleConfirmDone}
          getToken={getToken}
        />
      )}

      {/* 토스트 */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-sm font-bold text-white z-50 transition-all ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── KPI 카드 컴포넌트 ──
function KPICard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colors: Record<string, string> = {
    slate: 'border-black/[0.06]',
    green: 'border-emerald-500/40 bg-emerald-500/5',
    amber: 'border-amber-500/40 bg-amber-500/5',
    red: 'border-red-500/40 bg-red-500/5',
  }
  const valueColors: Record<string, string> = {
    slate: 'text-slate-800',
    green: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
  }
  return (
    <div className={`bg-gray-50 rounded-2xl border p-4 shadow-sm ${colors[color] || colors.slate}`}>
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-1 ${valueColors[color] || valueColors.slate}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}

// ── 상태 뱃지 ──
function StatusBadge({ status, paymentDate }: { status: string; paymentDate: string }) {
  const isOverdue = status === 'pending' && paymentDate < new Date().toISOString().split('T')[0]
  if (isOverdue) return <span className="px-2 py-0.5 rounded bg-red-900/40 text-red-400 text-[11px] font-bold">연체</span>
  if (status === 'completed') return <span className="px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-400 text-[11px] font-bold">완료</span>
  if (status === 'partial') return <span className="px-2 py-0.5 rounded bg-amber-900/40 text-amber-400 text-[11px] font-bold">부분입금</span>
  return <span className="px-2 py-0.5 rounded bg-gray-50 text-slate-400 text-[11px] font-bold">대기</span>
}

// ── 모달 래퍼 (토큰 비동기 처리) ──
function ConfirmPaymentModalWrapper({ schedule, onClose, onConfirm, getToken }: {
  schedule: Schedule
  onClose: () => void
  onConfirm: () => void
  getToken: () => Promise<string>
}) {
  const [token, setToken] = useState('')
  useEffect(() => { getToken().then(setToken) }, [])
  if (!token) return null
  return <ConfirmPaymentModal schedule={schedule} token={token} onClose={onClose} onConfirm={onConfirm} />
}

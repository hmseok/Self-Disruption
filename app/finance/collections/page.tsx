'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import ConfirmPaymentModal from './ConfirmPaymentModal'
import DarkHeader from '../../components/DarkHeader'

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
  const { company, role, adminSelectedCompanyId } = useApp()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmTarget, setConfirmTarget] = useState<Schedule | null>(null)
  const [sending, setSending] = useState(false)
  const [sendChannel, setSendChannel] = useState<'sms' | 'email'>('sms')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  useEffect(() => {
    fetchSchedules()
    setSelectedIds(new Set())
  }, [filterMonth, company, adminSelectedCompanyId])

  // ── 데이터 조회 ──
  const fetchSchedules = async () => {
    if (!effectiveCompanyId && role !== 'god_admin') return
    setLoading(true)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return

      const [year, month] = filterMonth.split('-').map(Number)
      const lastDay = new Date(year, month, 0).getDate()
      const from = `${filterMonth}-01`
      const to = `${filterMonth}-${String(lastDay).padStart(2, '0')}`

      let query = supabase
        .from('expected_payment_schedules')
        .select('*')
        .gte('payment_date', from)
        .lte('payment_date', to)
        .order('payment_date', { ascending: true })

      if (effectiveCompanyId) {
        query = query.eq('company_id', effectiveCompanyId)
      }

      const { data, error } = await query
      if (error) throw error

      // 고객명 조인
      const enriched = await enrichWithCustomerInfo(data || [])
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

    if (jiipIds.length > 0) {
      const { data } = await supabase.from('jiip_contracts').select('id, investor_name, phone, investor_email').in('id', jiipIds)
      data?.forEach(c => { jiipMap[c.id] = c })
    }
    if (investIds.length > 0) {
      const { data } = await supabase.from('general_investments').select('id, investor_name, investor_phone, investor_email').in('id', investIds)
      data?.forEach(c => { investMap[c.id] = c })
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
      const token = (await supabase.auth.getSession()).data.session?.access_token
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

  const getToken = async () => (await supabase.auth.getSession()).data.session?.access_token || ''

  // ── 월 이동 ──
  const changeMonth = (delta: number) => {
    const [y, m] = filterMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setFilterMonth(d.toISOString().slice(0, 7))
  }

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: 'pending', label: '미수금', count: pendingSchedules.length, color: 'text-amber-600' },
    { key: 'overdue', label: '연체', count: overdueSchedules.length, color: 'text-red-600' },
    { key: 'completed', label: '수금완료', count: completedSchedules.length, color: 'text-green-600' },
  ]

  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="p-12 md:p-20 text-center text-gray-400 text-sm bg-white rounded-2xl">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  if (!effectiveCompanyId && !loading) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'left' }}>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">📋 수금 관리</h1>
            <p className="text-gray-500 text-sm mt-1">납부 현황 확인 및 수금 관리 · 안내 발송</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm text-center py-20">
          <p className="text-4xl mb-3">🏢</p>
          <p className="font-semibold text-sm text-slate-500">좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p className="text-xs text-slate-400 mt-1">회사 선택 후 수금 관리를 이용할 수 있습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">
      <div className="space-y-6">
        {/* DarkHeader */}
        <DarkHeader
          icon="💰"
          title="수금 관리"
          subtitle="납부 현황 확인 및 수금 관리 · 안내 발송"
          stats={[
            { label: '이번달 예상 수금', value: `${nf(totalExpected)}원`, color: '#2563eb', bgColor: '#eff6ff', borderColor: '#bfdbfe', labelColor: '#93c5fd' },
            { label: '수금 완료', value: `${nf(totalCollected)}원`, color: '#059669', bgColor: '#ecfdf5', borderColor: '#bbf7d0', labelColor: '#6ee7b7' },
            { label: '수금율', value: `${collectionRate}%`, color: collectionRate >= 80 ? '#059669' : collectionRate >= 50 ? '#d97706' : '#dc2626', bgColor: collectionRate >= 80 ? '#ecfdf5' : collectionRate >= 50 ? '#fffbeb' : '#fef2f2', borderColor: collectionRate >= 80 ? '#bbf7d0' : collectionRate >= 50 ? '#fde68a' : '#fecaca', labelColor: collectionRate >= 80 ? '#6ee7b7' : collectionRate >= 50 ? '#fcd34d' : '#fca5a5' },
            { label: '연체', value: `${nf(overdueTotal)}원`, color: overdueSchedules.length > 0 ? '#dc2626' : '#94a3b8', bgColor: overdueSchedules.length > 0 ? '#fef2f2' : '#fff', borderColor: overdueSchedules.length > 0 ? '#fecaca' : '#e2e8f0', labelColor: overdueSchedules.length > 0 ? '#fca5a5' : '#94a3b8' },
          ]}
        >
          {/* Month navigation in children */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
            <button onClick={() => changeMonth(-1)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>‹</button>
            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
              style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: 600 }} />
            <button onClick={() => changeMonth(1)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>›</button>
          </div>
        </DarkHeader>

        {/* 탭 + 액션 바 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2 border-b border-slate-100 flex-wrap gap-3">
            <div className="flex gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()) }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab.key
                      ? 'bg-steel-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100'
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
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:outline-none"
                >
                  <option value="sms">SMS</option>
                  <option value="email">이메일</option>
                </select>
                <button
                  onClick={handleSendReminder}
                  disabled={selectedIds.size === 0 || sending}
                  className="px-4 py-2.5 rounded-xl bg-steel-600 text-white text-xs font-bold hover:bg-steel-700 disabled:opacity-40 transition-all shadow-sm"
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
                  <tr className="border-b border-slate-100 text-slate-400 text-[11px] uppercase font-black">
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
                      className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${
                        activeTab === 'overdue' ? 'bg-red-50/30' : ''
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
                      <td className="py-3 px-4 font-bold text-gray-900">{s.customer_name || '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          s.contract_type === 'jiip'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {s.contract_type === 'jiip' ? '지입' : '투자'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-slate-600">{s.payment_date}</td>
                      {activeTab === 'overdue' && (
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-black">
                            D+{overdueDays(s.payment_date)}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-4 text-right font-bold text-gray-900">{nf(Number(s.expected_amount))}원</td>
                      {activeTab === 'completed' && (
                        <td className="py-3 px-4 text-right font-bold text-green-700">{nf(Number(s.actual_amount || s.expected_amount))}원</td>
                      )}
                      <td className="py-3 px-4 text-center">
                        <StatusBadge status={s.status} paymentDate={s.payment_date} />
                      </td>
                      <td className="py-3 px-4 text-center">
                        {(s.status === 'pending') && (
                          <button
                            onClick={() => setConfirmTarget(s)}
                            className="px-3 py-1.5 rounded-xl bg-steel-600 text-white text-xs font-bold hover:bg-steel-700 transition-all shadow-sm"
                          >
                            수금 확인
                          </button>
                        )}
                        {s.status === 'completed' && (
                          <span className="text-green-600 text-xs font-bold">✓ 완료</span>
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
            <div className="px-6 py-3 border-t border-slate-100 flex justify-between items-center text-sm">
              <span className="text-slate-500">총 {displayList.length}건</span>
              <span className="font-black text-gray-900">
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
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
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
    slate: 'border-slate-200',
    green: 'border-green-200 bg-green-50/30',
    amber: 'border-amber-200 bg-amber-50/30',
    red: 'border-red-200 bg-red-50/30',
  }
  const valueColors: Record<string, string> = {
    slate: 'text-gray-900',
    green: 'text-green-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  }
  return (
    <div className={`bg-white rounded-2xl border p-4 shadow-sm ${colors[color] || colors.slate}`}>
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-1 ${valueColors[color] || valueColors.slate}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}

// ── 상태 뱃지 ──
function StatusBadge({ status, paymentDate }: { status: string; paymentDate: string }) {
  const isOverdue = status === 'pending' && paymentDate < new Date().toISOString().split('T')[0]
  if (isOverdue) return <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[11px] font-bold">연체</span>
  if (status === 'completed') return <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[11px] font-bold">완료</span>
  if (status === 'partial') return <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[11px] font-bold">부분입금</span>
  return <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-bold">대기</span>
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

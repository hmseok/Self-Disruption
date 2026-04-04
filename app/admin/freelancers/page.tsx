'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
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

const KOREAN_BANKS = [
  'KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행',
  'IBK기업은행', 'SC제일은행', '씨티은행', 'KDB산업은행',
  '카카오뱅크', '케이뱅크', '토스뱅크',
  '우체국', '새마을금고', '신협', '수협', '산림조합',
]

const TAX_TYPES = ['사업소득(3.3%)', '기타소득(8.8%)', '세금계산서', '원천징수 없음']
const SERVICE_TYPES = ['탁송', '대리운전', '정비', '세차', '디자인', '개발', '법무/세무', '기타']

export default function FreelancersPage() {
  const { company, role } = useApp()
  const companyId = company?.id

  const [loading, setLoading] = useState(true)
  const [freelancers, setFreelancers] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'list' | 'payments'>('list')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [paymentMonth, setPaymentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const emptyForm = {
    name: '', phone: '', email: '', bank_name: 'KB국민은행',
    account_number: '', account_holder: '', reg_number: '',
    tax_type: '사업소득(3.3%)', service_type: '기타', is_active: true, memo: ''
  }
  const [form, setForm] = useState<any>(emptyForm)

  const emptyPaymentForm = {
    freelancer_id: '', payment_date: new Date().toISOString().split('T')[0],
    gross_amount: '', tax_rate: 3.3, description: '', status: 'pending'
  }
  const [payForm, setPayForm] = useState<any>(emptyPaymentForm)

  useEffect(() => { if (companyId) { fetchFreelancers(); fetchPayments() } }, [companyId, paymentMonth])

  const fetchFreelancers = async () => {
    setLoading(true)
    try {
      const url = new URL('/api/freelancers', window.location.origin)
      if (filter === 'active') url.searchParams.set('is_active', 'true')
      else if (filter === 'inactive') url.searchParams.set('is_active', 'false')

      const res = await fetch(url.toString(), { headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch')
      setFreelancers(json.data || [])
    } catch (err) {
      console.error('fetchFreelancers error:', err)
      setFreelancers([])
    }
    setLoading(false)
  }

  const fetchPayments = async () => {
    const [y, m] = paymentMonth.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    try {
      const res = await fetch(`/api/freelancer-payments?from=${paymentMonth}-01&to=${paymentMonth}-${lastDay}`, {
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch')
      setPayments(json.data || [])
    } catch (err) {
      console.error('fetchPayments error:', err)
      setPayments([])
    }
  }

  useEffect(() => { if (companyId) fetchFreelancers() }, [filter])

  const handleSave = async () => {
    if (!form.name) return alert('이름은 필수입니다.')
    const payload = { ...form }

    try {
      if (editingId) {
        const res = await fetch(`/api/freelancers/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
          body: JSON.stringify(payload)
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Update failed')
      } else {
        const res = await fetch('/api/freelancers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
          body: JSON.stringify(payload)
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Create failed')
      }
      alert('저장되었습니다.')
      setShowForm(false); setEditingId(null); setForm(emptyForm)
      fetchFreelancers()
    } catch (err: any) {
      alert('저장 실패: ' + err.message)
    }
  }

  const handleEdit = (f: any) => {
    setForm({ name: f.name, phone: f.phone || '', email: f.email || '', bank_name: f.bank_name || 'KB국민은행', account_number: f.account_number || '', account_holder: f.account_holder || '', reg_number: f.reg_number || '', tax_type: f.tax_type || '사업소득(3.3%)', service_type: f.service_type || '기타', is_active: f.is_active, memo: f.memo || '' })
    setEditingId(f.id); setShowForm(true)
  }

  const handleToggleActive = async (f: any) => {
    try {
      const res = await fetch(`/api/freelancers/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ is_active: !f.is_active })
      })
      if (!res.ok) throw new Error('Update failed')
      fetchFreelancers()
    } catch (err) {
      console.error('handleToggleActive error:', err)
    }
  }

  const handlePaymentSave = async () => {
    if (!payForm.freelancer_id || !payForm.gross_amount) return alert('프리랜서와 금액은 필수입니다.')
    const gross = Number(payForm.gross_amount)
    const taxRate = Number(payForm.tax_rate)
    const taxAmount = Math.round(gross * taxRate / 100)
    const netAmount = gross - taxAmount

    const payload = {
      freelancer_id: payForm.freelancer_id,
      payment_date: payForm.payment_date,
      gross_amount: gross,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      net_amount: netAmount,
      description: payForm.description,
      status: payForm.status,
    }

    try {
      const res = await fetch('/api/freelancer-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Create failed')
      alert('지급 등록 완료')
      setShowPaymentForm(false); setPayForm(emptyPaymentForm)
      fetchPayments()
    } catch (err: any) {
      alert('등록 실패: ' + err.message)
    }
  }

  const handlePaymentConfirm = async (p: any) => {
    if (!confirm(`${p.freelancers?.name}에게 ${Number(p.net_amount).toLocaleString()}원 지급 확정하시겠습니까?`)) return

    try {
      // 1. 지급 상태 업데이트
      await fetch(`/api/freelancer-payments/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ status: 'paid', paid_date: new Date().toISOString().split('T')[0] })
      })

      // 2. transactions에 자동 기록
      await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({
          transaction_date: p.payment_date,
          type: 'expense',
          category: '용역비(3.3%)',
          client_name: p.freelancers?.name || '프리랜서',
          amount: p.net_amount,
          description: `프리랜서 용역비 - ${p.freelancers?.name} (${p.description || ''})`,
          payment_method: '이체',
          status: 'completed',
          related_type: 'freelancer',
          related_id: p.freelancer_id,
          classification_source: 'auto_sync',
          confidence: 100,
        })
      })

      // 3. 원천세도 별도 기록
      if (p.tax_amount > 0) {
        await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
          body: JSON.stringify({
            transaction_date: p.payment_date,
            type: 'expense',
            category: '세금/공과금',
            client_name: `원천세(${p.freelancers?.name})`,
            amount: p.tax_amount,
            description: `프리랜서 원천징수세 - ${p.freelancers?.name}`,
            payment_method: '이체',
            status: 'completed',
            related_type: 'freelancer',
            related_id: p.freelancer_id,
            classification_source: 'auto_sync',
            confidence: 100,
          })
        })
      }

      alert('지급 확정 및 장부 반영 완료')
      fetchPayments()
    } catch (err) {
      console.error('handlePaymentConfirm error:', err)
      alert('처리 중 오류가 발생했습니다.')
    }
  }

  const formatMoney = (n: number) => n ? Number(n).toLocaleString() : '0'
  const formatPhone = (v: string) => v.replace(/[^0-9]/g, "").replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, `$1-$2-$3`)

  const totalGross = payments.reduce((s, p) => s + Number(p.gross_amount || 0), 0)
  const totalTax = payments.reduce((s, p) => s + Number(p.tax_amount || 0), 0)
  const totalNet = payments.reduce((s, p) => s + Number(p.net_amount || 0), 0)
  const paidCount = payments.filter(p => p.status === 'paid').length

  const TABS = [
    { key: 'list' as const, label: '프리랜서 목록', icon: '👥' },
    { key: 'payments' as const, label: '지급 내역', icon: '💸' },
  ]

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 md:py-8 md:px-6 bg-slate-50 min-h-screen pb-32">

      {/* DarkHeader */}
      <DarkHeader
        icon="👷"
        title="프리랜서/용역 관리"
        subtitle="외부 인력 관리 및 용역비 지급 · 원천징수 자동 계산 · 장부 자동 연동"
        stats={activeTab === 'payments' ? [
          { label: '총 지급건수', value: payments.length, color: '#2563eb', bgColor: '#eff6ff', borderColor: '#bfdbfe', labelColor: '#93c5fd' },
          { label: '총 지급액(세전)', value: `${formatMoney(totalGross)}원`, color: '#059669', bgColor: '#ecfdf5', borderColor: '#bbf7d0', labelColor: '#6ee7b7' },
          { label: '원천징수세', value: `${formatMoney(totalTax)}원`, color: '#dc2626', bgColor: '#fef2f2', borderColor: '#fecaca', labelColor: '#fca5a5' },
          { label: '실지급액', value: `${formatMoney(totalNet)}원`, color: '#d97706', bgColor: '#fffbeb', borderColor: '#fde68a', labelColor: '#fcd34d' },
        ] : []}
        actions={[
          { label: activeTab === 'list' ? '프리랜서 등록' : '지급 등록', icon: '➕', onClick: () => { if (activeTab === 'list') { setForm(emptyForm); setEditingId(null); setShowForm(true) } else { setShowPaymentForm(true) } }, variant: 'primary' }
        ]}
      >
        {/* 탭 */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 16px' }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13,
                background: activeTab === tab.key ? '#0f172a' : 'transparent', color: activeTab === tab.key ? '#fff' : '#94a3b8',
                border: 'none', cursor: 'pointer', transition: 'all 0.15s'
              }}>
              <span style={{ fontSize: 11 }}>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
      </DarkHeader>

      {/* Tab 1: 프리랜서 목록 */}
      {activeTab === 'list' && (
        <div className="space-y-5">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              {(['active', 'all', 'inactive'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                  {f === 'active' ? '활성' : f === 'all' ? '전체' : '비활성'}
                </button>
              ))}
            </div>
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true) }}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              프리랜서 등록
            </button>
          </div>

          {/* 목록 */}
          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {freelancers.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {freelancers.map(f => (
                  <div key={f.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${f.is_active ? 'bg-slate-700' : 'bg-slate-300'}`}>
                        {f.name?.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{f.name}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${f.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            {f.is_active ? '활성' : '비활성'}
                          </span>
                          {f.service_type && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600">{f.service_type}</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {f.phone || '연락처 없음'} · {f.tax_type} · {f.bank_name} {f.account_number}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(f)} className="text-xs font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">수정</button>
                      <button onClick={() => handleToggleActive(f)} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${f.is_active ? 'text-red-400 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}>
                        {f.is_active ? '비활성화' : '활성화'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                <p className="font-semibold text-sm text-slate-500">등록된 프리랜서가 없습니다</p>
                <p className="text-xs text-slate-400 mt-1">위 버튼으로 프리랜서를 등록하세요</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Tab 2: 지급 내역 */}
      {activeTab === 'payments' && (
        <div className="space-y-5">
          {/* 월 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">총 지급 건수</p>
              <p className="text-xl font-bold text-slate-900">{payments.length}<span className="text-xs font-normal text-slate-400 ml-0.5">건</span></p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">총 지급액 (세전)</p>
              <p className="text-lg font-bold text-slate-900">{formatMoney(totalGross)}<span className="text-xs font-normal text-slate-400 ml-0.5">원</span></p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">원천징수세</p>
              <p className="text-lg font-bold text-red-500">{formatMoney(totalTax)}<span className="text-xs font-normal text-slate-400 ml-0.5">원</span></p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">실지급 총액</p>
              <p className="text-lg font-bold text-emerald-600">{formatMoney(totalNet)}<span className="text-xs font-normal text-slate-400 ml-0.5">원</span></p>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <input type="month" value={paymentMonth} onChange={e => setPaymentMonth(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => setShowPaymentForm(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors">
              지급 등록
            </button>
          </div>

          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {payments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="p-3.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">프리랜서</th>
                      <th className="p-3.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">지급일</th>
                      <th className="p-3.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider">세전 금액</th>
                      <th className="p-3.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider">원천세</th>
                      <th className="p-3.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider">실지급액</th>
                      <th className="p-3.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">상태</th>
                      <th className="p-3.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {payments.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3.5">
                          <p className="font-semibold text-slate-700">{p.freelancers?.name || '-'}</p>
                          {p.description && <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>}
                        </td>
                        <td className="p-3.5 text-slate-500">{p.payment_date}</td>
                        <td className="p-3.5 text-right font-semibold text-slate-700">{formatMoney(p.gross_amount)}원</td>
                        <td className="p-3.5 text-right text-red-500">{formatMoney(p.tax_amount)}원</td>
                        <td className="p-3.5 text-right font-bold text-emerald-600">{formatMoney(p.net_amount)}원</td>
                        <td className="p-3.5 text-center">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            p.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                            p.status === 'cancelled' ? 'bg-red-50 text-red-500' :
                            'bg-amber-50 text-amber-600'
                          }`}>
                            {p.status === 'paid' ? '지급완료' : p.status === 'cancelled' ? '취소' : '대기'}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          {p.status === 'pending' && (
                            <button onClick={() => handlePaymentConfirm(p)}
                              className="text-xs font-semibold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                              지급 확정
                            </button>
                          )}
                          {p.status === 'paid' && (
                            <span className="text-xs text-slate-400">장부 반영됨</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="font-semibold text-sm text-slate-500">해당 월 지급 내역이 없습니다</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ──── 프리랜서 등록/수정 모달 ──── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-900">{editingId ? '프리랜서 수정' : '프리랜서 등록'}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">이름 <span className="text-red-400">*</span></label>
                  <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">연락처</label>
                  <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={form.phone} onChange={e => setForm({ ...form, phone: formatPhone(e.target.value) })} maxLength={13} placeholder="010-0000-0000" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">이메일</label>
                <input type="email" className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">원천징수 유형</label>
                  <select className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white" value={form.tax_type} onChange={e => setForm({ ...form, tax_type: e.target.value })}>
                    {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">서비스 유형</label>
                  <select className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white" value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}>
                    {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">사업자/주민등록번호</label>
                <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={form.reg_number} onChange={e => setForm({ ...form, reg_number: e.target.value })} placeholder="000-00-00000" />
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-3">계좌 정보</p>
                <div className="grid grid-cols-3 gap-3">
                  <select className="border border-slate-200 p-2.5 rounded-lg text-sm bg-white" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })}>
                    {KOREAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <input className="border border-slate-200 p-2.5 rounded-lg text-sm" value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} placeholder="계좌번호" />
                  <input className="border border-slate-200 p-2.5 rounded-lg text-sm" value={form.account_holder} onChange={e => setForm({ ...form, account_holder: e.target.value })} placeholder="예금주" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">메모</label>
                <textarea className="w-full border border-slate-200 p-2.5 rounded-lg text-sm resize-none" rows={2} value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="flex-1 py-3 bg-slate-100 rounded-xl font-semibold text-sm text-slate-600 hover:bg-slate-200 transition-colors">취소</button>
              <button onClick={handleSave} className="flex-[2] py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors">{editingId ? '수정 완료' : '등록 완료'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ──── 지급 등록 모달 ──── */}
      {showPaymentForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-900">용역비 지급 등록</h3>
              <p className="text-xs text-slate-400 mt-0.5">지급 확정 시 장부에 자동 반영됩니다</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">프리랜서 <span className="text-red-400">*</span></label>
                <select className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white" value={payForm.freelancer_id} onChange={e => {
                  const selected = freelancers.find(f => f.id === e.target.value)
                  setPayForm({
                    ...payForm,
                    freelancer_id: e.target.value,
                    tax_rate: selected?.tax_type === '기타소득(8.8%)' ? 8.8 : selected?.tax_type === '사업소득(3.3%)' ? 3.3 : 0
                  })
                }}>
                  <option value="">선택하세요</option>
                  {freelancers.filter(f => f.is_active).map(f => <option key={f.id} value={f.id}>{f.name} ({f.service_type})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">지급일</label>
                  <input type="date" className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">세율(%)</label>
                  <input type="number" step="0.1" className="w-full border border-slate-200 p-2.5 rounded-lg text-sm text-right" value={payForm.tax_rate} onChange={e => setPayForm({ ...payForm, tax_rate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">세전 금액 <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input type="text" className="w-full border-2 border-slate-200 p-3 pr-10 rounded-xl text-right font-bold text-lg"
                    value={payForm.gross_amount ? Number(payForm.gross_amount).toLocaleString() : ''}
                    onChange={e => setPayForm({ ...payForm, gross_amount: e.target.value.replace(/,/g, '') })}
                    placeholder="0" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">원</span>
                </div>
                {payForm.gross_amount && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">원천징수세 ({payForm.tax_rate}%)</span><span className="font-semibold text-red-500">-{Math.round(Number(payForm.gross_amount) * Number(payForm.tax_rate) / 100).toLocaleString()}원</span></div>
                    <div className="flex justify-between border-t border-slate-200 pt-1"><span className="text-slate-700 font-semibold">실지급액</span><span className="font-bold text-emerald-600">{Math.round(Number(payForm.gross_amount) * (1 - Number(payForm.tax_rate) / 100)).toLocaleString()}원</span></div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">설명</label>
                <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={payForm.description} onChange={e => setPayForm({ ...payForm, description: e.target.value })} placeholder="작업 내용" />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowPaymentForm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-semibold text-sm text-slate-600">취소</button>
              <button onClick={handlePaymentSave} className="flex-[2] py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors">등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'

const KOREAN_BANKS = [
  'KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행',
  'IBK기업은행', 'SC제일은행', '씨티은행', 'KDB산업은행',
  '카카오뱅크', '케이뱅크', '토스뱅크',
  '우체국', '새마을금고', '신협', '수협', '산림조합',
]

const TAX_TYPES = ['사업소득(3.3%)', '기타소득(8.8%)', '세금계산서', '원천징수 없음']
const SERVICE_TYPES = ['탁송', '대리운전', '정비', '세차', '디자인', '개발', '법무/세무', '기타']

export default function FreelancersPage() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const companyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

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

  useEffect(() => { if (companyId) { fetchFreelancers(); fetchPayments() } else { setLoading(false) } }, [companyId, paymentMonth])

  const fetchFreelancers = async () => {
    setLoading(true)
    let query = supabase.from('freelancers').select('*').eq('company_id', companyId).order('name')
    if (filter === 'active') query = query.eq('is_active', true)
    if (filter === 'inactive') query = query.eq('is_active', false)
    const { data } = await query
    setFreelancers(data || [])
    setLoading(false)
  }

  const fetchPayments = async () => {
    const [y, m] = paymentMonth.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const { data } = await supabase
      .from('freelancer_payments')
      .select('*, freelancers(name, service_type)')
      .eq('company_id', companyId)
      .gte('payment_date', `${paymentMonth}-01`)
      .lte('payment_date', `${paymentMonth}-${lastDay}`)
      .order('payment_date', { ascending: false })
    setPayments(data || [])
  }

  useEffect(() => { if (companyId) fetchFreelancers() }, [filter])

  const handleSave = async () => {
    if (!form.name) return alert('이름은 필수입니다.')
    const payload = { ...form, company_id: companyId }

    if (editingId) {
      const { error } = await supabase.from('freelancers').update(payload).eq('id', editingId)
      if (error) return alert('수정 실패: ' + error.message)
    } else {
      const { error } = await supabase.from('freelancers').insert(payload)
      if (error) return alert('등록 실패: ' + error.message)
    }
    alert('저장되었습니다.')
    setShowForm(false); setEditingId(null); setForm(emptyForm)
    fetchFreelancers()
  }

  const handleEdit = (f: any) => {
    setForm({ name: f.name, phone: f.phone || '', email: f.email || '', bank_name: f.bank_name || 'KB국민은행', account_number: f.account_number || '', account_holder: f.account_holder || '', reg_number: f.reg_number || '', tax_type: f.tax_type || '사업소득(3.3%)', service_type: f.service_type || '기타', is_active: f.is_active, memo: f.memo || '' })
    setEditingId(f.id); setShowForm(true)
  }

  const handleToggleActive = async (f: any) => {
    await supabase.from('freelancers').update({ is_active: !f.is_active }).eq('id', f.id)
    fetchFreelancers()
  }

  const handlePaymentSave = async () => {
    if (!payForm.freelancer_id || !payForm.gross_amount) return alert('프리랜서와 금액은 필수입니다.')
    const gross = Number(payForm.gross_amount)
    const taxRate = Number(payForm.tax_rate)
    const taxAmount = Math.round(gross * taxRate / 100)
    const netAmount = gross - taxAmount

    const payload = {
      company_id: companyId,
      freelancer_id: payForm.freelancer_id,
      payment_date: payForm.payment_date,
      gross_amount: gross,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      net_amount: netAmount,
      description: payForm.description,
      status: payForm.status,
    }

    const { error } = await supabase.from('freelancer_payments').insert(payload)
    if (error) return alert('등록 실패: ' + error.message)
    alert('지급 등록 완료')
    setShowPaymentForm(false); setPayForm(emptyPaymentForm)
    fetchPayments()
  }

  const handlePaymentConfirm = async (p: any) => {
    if (!confirm(`${p.freelancers?.name}에게 ${Number(p.net_amount).toLocaleString()}원 지급 확정하시겠습니까?`)) return

    await supabase.from('freelancer_payments').update({ status: 'paid', paid_date: new Date().toISOString().split('T')[0] }).eq('id', p.id)

    await supabase.from('transactions').insert({
      company_id: companyId,
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

    if (p.tax_amount > 0) {
      await supabase.from('transactions').insert({
        company_id: companyId,
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
    }

    alert('지급 확정 및 장부 반영 완료')
    fetchPayments()
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

  if (loading && freelancers.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-slate-200 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-400">불러오는 중...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 md:py-8 md:px-6 bg-slate-50 min-h-screen pb-32">

      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">👥 프리랜서 관리</h1>
          <p className="text-gray-500 text-sm mt-1">외부 인력 관리 및 용역비 지급 · 원천징수 자동 계산 · 장부 자동 연동</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-white p-1 rounded-xl border border-slate-200/80 shadow-sm">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              activeTab === tab.key ? 'bg-steel-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}>
            <span className="text-xs">{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* ──── 탭1: 프리랜서 목록 ──── */}
      {activeTab === 'list' && (
        <div className="space-y-5">
          <div className="flex justify-between items-center">
            <div className="flex gap-1.5">
              {(['active', 'all', 'inactive'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-steel-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}`}>
                  {f === 'active' ? '활성' : f === 'all' ? '전체' : '비활성'}
                </button>
              ))}
            </div>
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true) }}
              className="px-4 py-2 bg-steel-600 text-white rounded-lg font-semibold text-sm hover:bg-steel-700 transition-all active:scale-[0.98] flex items-center gap-1.5 shadow-lg shadow-steel-600/10">
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
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${f.is_active ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-400'}`}>
                            {f.is_active ? '활성' : '비활성'}
                          </span>
                          {f.service_type && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-200">{f.service_type}</span>}
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
                <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                <p className="font-semibold text-sm text-slate-500">등록된 프리랜서가 없습니다</p>
                <p className="text-xs text-slate-400 mt-1">위 버튼으로 프리랜서를 등록하세요</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ──── 탭2: 지급 내역 ──── */}
      {activeTab === 'payments' && (
        <div className="space-y-5">
          {/* 월 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '총 지급 건수', value: payments.length, unit: '건', color: 'text-slate-900' },
              { label: '총 지급액 (세전)', value: formatMoney(totalGross), unit: '원', color: 'text-slate-900' },
              { label: '원천징수세', value: formatMoney(totalTax), unit: '원', color: 'text-red-500' },
              { label: '실지급 총액', value: formatMoney(totalNet), unit: '원', color: 'text-emerald-600' },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}<span className="text-xs font-normal text-slate-400 ml-0.5">{stat.unit}</span></p>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center">
            <input type="month" value={paymentMonth} onChange={e => setPaymentMonth(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" />
            <button onClick={() => setShowPaymentForm(true)}
              className="px-4 py-2 bg-steel-600 text-white rounded-lg font-semibold text-sm hover:bg-steel-700 transition-all active:scale-[0.98] shadow-lg shadow-steel-600/10">
              지급 등록
            </button>
          </div>

          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {payments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
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
                            p.status === 'paid' ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' :
                            p.status === 'cancelled' ? 'bg-red-50 text-red-500 ring-1 ring-red-200' :
                            'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
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
                <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                <p className="font-semibold text-sm text-slate-500">해당 월 지급 내역이 없습니다</p>
                <p className="text-xs text-slate-400 mt-1">지급 등록 후 확정하면 장부에 자동 반영됩니다</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ──── 프리랜서 등록/수정 모달 ──── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-base text-slate-900">{editingId ? '프리랜서 수정' : '프리랜서 등록'}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">이름 <span className="text-red-400">*</span></label>
                  <input className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">연락처</label>
                  <input className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.phone} onChange={e => setForm({ ...form, phone: formatPhone(e.target.value) })} maxLength={13} placeholder="010-0000-0000" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">이메일</label>
                <input type="email" className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">원천징수 유형</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.tax_type} onChange={e => setForm({ ...form, tax_type: e.target.value })}>
                    {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">서비스 유형</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}>
                    {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">사업자/주민등록번호</label>
                <input className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.reg_number} onChange={e => setForm({ ...form, reg_number: e.target.value })} placeholder="000-00-00000" />
              </div>
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-3">계좌 정보</p>
                <div className="grid grid-cols-3 gap-3">
                  <select className="border border-slate-200 p-3 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })}>
                    {KOREAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <input className="border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} placeholder="계좌번호" />
                  <input className="border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={form.account_holder} onChange={e => setForm({ ...form, account_holder: e.target.value })} placeholder="예금주" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">메모</label>
                <textarea className="w-full border border-slate-200 p-3 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" rows={2} value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="flex-1 py-3 bg-slate-100 rounded-xl font-semibold text-sm text-slate-600 hover:bg-slate-200 transition-colors">취소</button>
              <button onClick={handleSave} className="flex-[2] py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-all active:scale-[0.99] shadow-lg shadow-steel-600/10">{editingId ? '수정 완료' : '등록 완료'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ──── 지급 등록 모달 ──── */}
      {showPaymentForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-base text-slate-900">용역비 지급 등록</h3>
              <p className="text-xs text-slate-400 mt-0.5">지급 확정 시 장부에 자동 반영됩니다</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">프리랜서 <span className="text-red-400">*</span></label>
                <select className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={payForm.freelancer_id} onChange={e => {
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
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">지급일</label>
                  <input type="date" className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">세율(%)</label>
                  <input type="number" step="0.1" className="w-full border border-slate-200 p-3 rounded-xl text-sm text-right focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={payForm.tax_rate} onChange={e => setPayForm({ ...payForm, tax_rate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">세전 금액 <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input type="text" className="w-full border-2 border-slate-200 p-3.5 pr-10 rounded-xl text-right font-bold text-lg focus:border-slate-400 focus:ring-0 outline-none transition-all"
                    value={payForm.gross_amount ? Number(payForm.gross_amount).toLocaleString() : ''}
                    onChange={e => setPayForm({ ...payForm, gross_amount: e.target.value.replace(/,/g, '') })}
                    placeholder="0" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">원</span>
                </div>
                {payForm.gross_amount && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">원천징수세 ({payForm.tax_rate}%)</span><span className="font-semibold text-red-500">-{Math.round(Number(payForm.gross_amount) * Number(payForm.tax_rate) / 100).toLocaleString()}원</span></div>
                    <div className="flex justify-between border-t border-slate-200 pt-1"><span className="text-slate-700 font-semibold">실지급액</span><span className="font-bold text-emerald-600">{Math.round(Number(payForm.gross_amount) * (1 - Number(payForm.tax_rate) / 100)).toLocaleString()}원</span></div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">설명</label>
                <input className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={payForm.description} onChange={e => setPayForm({ ...payForm, description: e.target.value })} placeholder="작업 내용" />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowPaymentForm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-semibold text-sm text-slate-600 hover:bg-slate-200 transition-colors">취소</button>
              <button onClick={handlePaymentSave} className="flex-[2] py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-all active:scale-[0.99] shadow-lg shadow-steel-600/10">등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

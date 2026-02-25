'use client'

import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'

const CARD_COMPANIES = ['신한카드', '삼성카드', '현대카드', 'KB국민카드', '하나카드', '롯데카드', 'BC카드', 'NH농협카드', '우리카드', 'IBK기업은행']

export default function CorporateCardsPage() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const companyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // 카드별 이번달 사용내역 요약
  const [cardUsage, setCardUsage] = useState<Record<string, { count: number; total: number }>>({})

  const emptyForm = {
    card_company: '신한카드', card_number: '', card_alias: '',
    holder_name: '', assigned_employee_id: '', monthly_limit: '',
    is_active: true, memo: ''
  }
  const [form, setForm] = useState<any>(emptyForm)

  useEffect(() => { if (companyId) { fetchCards(); fetchEmployees(); fetchCardUsage() } }, [companyId])

  const fetchCards = async () => {
    setLoading(true)
    const { data } = await supabase.from('corporate_cards')
      .select('*, assigned_employee:profiles!corporate_cards_assigned_employee_id_fkey(employee_name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    setCards(data || [])
    setLoading(false)
  }

  const fetchEmployees = async () => {
    const { data } = await supabase.from('profiles')
      .select('id, employee_name')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('employee_name')
    setEmployees(data || [])
  }

  const fetchCardUsage = async () => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

    const { data } = await supabase.from('transactions')
      .select('card_id, amount')
      .eq('company_id', companyId)
      .eq('payment_method', '카드')
      .gte('transaction_date', `${ym}-01`)
      .lte('transaction_date', `${ym}-${lastDay}`)

    const usage: Record<string, { count: number; total: number }> = {}
    ;(data || []).forEach((t: any) => {
      if (!t.card_id) return
      if (!usage[t.card_id]) usage[t.card_id] = { count: 0, total: 0 }
      usage[t.card_id].count++
      usage[t.card_id].total += Number(t.amount || 0)
    })
    setCardUsage(usage)
  }

  const handleSave = async () => {
    if (!form.card_company) return alert('카드사를 선택해주세요.')
    const payload = {
      ...form,
      company_id: companyId,
      monthly_limit: form.monthly_limit ? Number(form.monthly_limit) : null,
      assigned_employee_id: form.assigned_employee_id || null,
    }

    if (editingId) {
      const { error } = await supabase.from('corporate_cards').update(payload).eq('id', editingId)
      if (error) return alert('수정 실패: ' + error.message)
    } else {
      const { error } = await supabase.from('corporate_cards').insert(payload)
      if (error) return alert('등록 실패: ' + error.message)
    }
    alert('저장되었습니다.')
    setShowForm(false); setEditingId(null); setForm(emptyForm)
    fetchCards()
  }

  const handleEdit = (c: any) => {
    setForm({
      card_company: c.card_company, card_number: c.card_number || '',
      card_alias: c.card_alias || '', holder_name: c.holder_name || '',
      assigned_employee_id: c.assigned_employee_id || '',
      monthly_limit: c.monthly_limit || '', is_active: c.is_active, memo: c.memo || ''
    })
    setEditingId(c.id); setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 카드를 삭제하시겠습니까?')) return
    await supabase.from('corporate_cards').delete().eq('id', id)
    fetchCards()
  }

  const maskCardNumber = (n: string) => {
    if (!n) return '-'
    const clean = n.replace(/[^0-9*]/g, '')
    if (clean.length >= 16) return `${clean.slice(0,4)}-****-****-${clean.slice(-4)}`
    return n
  }

  const formatMoney = (n: number) => n ? Number(n).toLocaleString() : '0'

  const totalMonthlyUsage = Object.values(cardUsage).reduce((s, u) => s + u.total, 0)
  const totalMonthlyCount = Object.values(cardUsage).reduce((s, u) => s + u.count, 0)
  const activeCards = cards.filter(c => c.is_active).length

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 md:py-8 md:px-6 bg-slate-50 min-h-screen pb-32">

      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">법인카드 관리</h1>
        <p className="text-sm text-slate-400 mt-1">법인카드 등록 및 사용내역 자동 분류 · 직원 배정 · 한도 관리</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">등록 카드</p>
          <p className="text-xl font-bold text-slate-900">{cards.length}<span className="text-xs font-normal text-slate-400 ml-0.5">장</span></p>
          <p className="text-[10px] text-emerald-500 font-medium mt-1">활성 {activeCards}장</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">이번달 사용 건수</p>
          <p className="text-xl font-bold text-slate-900">{totalMonthlyCount}<span className="text-xs font-normal text-slate-400 ml-0.5">건</span></p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm col-span-2">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">이번달 총 사용액</p>
          <p className="text-xl font-bold text-slate-900">{formatMoney(totalMonthlyUsage)}<span className="text-xs font-normal text-slate-400 ml-0.5">원</span></p>
        </div>
      </div>

      {/* 카드 추가 버튼 */}
      <div className="flex justify-end mb-5">
        <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true) }}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          카드 등록
        </button>
      </div>

      {/* 카드 목록 - 카드형 UI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(c => {
          const usage = cardUsage[c.id] || { count: 0, total: 0 }
          const limitRate = c.monthly_limit ? Math.min(100, Math.round((usage.total / c.monthly_limit) * 100)) : 0

          return (
            <div key={c.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${c.is_active ? 'border-slate-200/80' : 'border-slate-100 opacity-60'}`}>
              {/* 카드 헤더 - 카드사 색상 */}
              <div className={`px-5 py-4 ${
                c.card_company?.includes('신한') ? 'bg-blue-600' :
                c.card_company?.includes('삼성') ? 'bg-slate-800' :
                c.card_company?.includes('현대') ? 'bg-zinc-900' :
                c.card_company?.includes('KB') || c.card_company?.includes('국민') ? 'bg-amber-600' :
                c.card_company?.includes('하나') ? 'bg-teal-600' :
                c.card_company?.includes('롯데') ? 'bg-red-600' :
                'bg-slate-700'
              } text-white`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-white/70">{c.card_company}</p>
                    <p className="font-mono text-lg font-bold tracking-wider mt-1">{maskCardNumber(c.card_number)}</p>
                  </div>
                  {!c.is_active && <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">비활성</span>}
                </div>
                {c.card_alias && <p className="text-sm text-white/80 mt-2">{c.card_alias}</p>}
              </div>

              {/* 카드 바디 */}
              <div className="p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">명의자</span>
                  <span className="font-semibold text-slate-700">{c.holder_name || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">사용 직원</span>
                  <span className="font-semibold text-slate-700">{c.assigned_employee?.employee_name || '미배정'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">이번달 사용</span>
                  <span className="font-bold text-slate-900">{formatMoney(usage.total)}원 <span className="text-slate-400 font-normal">({usage.count}건)</span></span>
                </div>

                {/* 한도 진행률 */}
                {c.monthly_limit && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">월 한도</span>
                      <span className={`font-semibold ${limitRate >= 80 ? 'text-red-500' : 'text-slate-500'}`}>{limitRate}% ({formatMoney(c.monthly_limit)}원)</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${limitRate >= 80 ? 'bg-red-500' : limitRate >= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${limitRate}%` }} />
                    </div>
                  </div>
                )}

                {/* 액션 버튼 */}
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button onClick={() => handleEdit(c)} className="flex-1 text-xs font-semibold text-slate-500 py-2 rounded-lg hover:bg-slate-50 transition-colors">수정</button>
                  <button onClick={() => handleDelete(c.id)} className="text-xs font-medium text-red-400 py-2 px-3 rounded-lg hover:bg-red-50 transition-colors">삭제</button>
                </div>
              </div>
            </div>
          )
        })}

        {cards.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl border border-slate-200/80 shadow-sm text-center py-16">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            <p className="font-semibold text-sm text-slate-500">등록된 법인카드가 없습니다</p>
            <p className="text-xs text-slate-400 mt-1">카드를 등록하면 카드 내역 업로드 시 자동 매칭됩니다</p>
          </div>
        )}
      </div>

      {/* ──── 카드 등록/수정 모달 ──── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-900">{editingId ? '카드 수정' : '법인카드 등록'}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">카드사 <span className="text-red-400">*</span></label>
                  <select className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white" value={form.card_company} onChange={e => setForm({ ...form, card_company: e.target.value })}>
                    {CARD_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">카드번호</label>
                  <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm font-mono" value={form.card_number} onChange={e => setForm({ ...form, card_number: e.target.value })} placeholder="0000-0000-0000-0000" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">카드 별칭</label>
                <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={form.card_alias} onChange={e => setForm({ ...form, card_alias: e.target.value })} placeholder="예: 대표님 카드, 영업팀 법인카드" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">명의자</label>
                  <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={form.holder_name} onChange={e => setForm({ ...form, holder_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">사용 직원</label>
                  <select className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white" value={form.assigned_employee_id} onChange={e => setForm({ ...form, assigned_employee_id: e.target.value })}>
                    <option value="">미배정</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.employee_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">월 한도</label>
                <div className="relative">
                  <input type="text" className="w-full border border-slate-200 p-2.5 pr-10 rounded-lg text-sm text-right"
                    value={form.monthly_limit ? Number(form.monthly_limit).toLocaleString() : ''}
                    onChange={e => setForm({ ...form, monthly_limit: e.target.value.replace(/,/g, '') })} placeholder="0" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">원</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">메모</label>
                <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="flex-1 py-3 bg-slate-100 rounded-xl font-semibold text-sm text-slate-600">취소</button>
              <button onClick={handleSave} className="flex-[2] py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors">{editingId ? '수정 완료' : '등록 완료'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

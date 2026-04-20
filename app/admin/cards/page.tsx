'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import DcStatStrip from '../../components/DcStatStrip'

// 카드사 추론 — card_alias 또는 card_number 로 표시 색상만 결정
function inferCardCompany(c: any): string {
  const hay = ((c.card_alias || '') + ' ' + (c.holder_name || '')).toLowerCase()
  if (hay.includes('신한') || hay.includes('shinhan')) return '신한카드'
  if (hay.includes('삼성') || hay.includes('samsung')) return '삼성카드'
  if (hay.includes('현대') || hay.includes('hyundai')) return '현대카드'
  if (hay.includes('kb') || hay.includes('국민')) return 'KB국민카드'
  if (hay.includes('하나') || hay.includes('hana')) return '하나카드'
  if (hay.includes('롯데') || hay.includes('lotte')) return '롯데카드'
  if (hay.includes('bc')) return 'BC카드'
  if (hay.includes('nh') || hay.includes('농협')) return 'NH농협카드'
  if (hay.includes('우리') || hay.includes('woori')) return '우리카드'
  if (hay.includes('ibk') || hay.includes('기업')) return 'IBK기업은행'
  return '법인카드'
}

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

export default function CorporateCardsPage() {
  const { company } = useApp()
  const companyId = company?.id

  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [carsList, setCarsList] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // 카드별 이번달 사용내역 요약
  const [cardUsage, setCardUsage] = useState<Record<string, { count: number; total: number }>>({})

  const emptyForm = {
    card_number: '', card_alias: '',
    holder_name: '', assigned_employee_id: '',
    assigned_car_id: '',
    status: 'active',
  }
  const [form, setForm] = useState<any>(emptyForm)

  useEffect(() => {
    fetchCards()
    fetchEmployees()
    fetchCars()
    fetchCardUsage()
  }, [companyId])

  const fetchCards = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/corporate_cards', { headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch cards')
      setCards(json.data || [])
    } catch (err) {
      console.error('fetchCards error:', err)
      setCards([])
    }
    setLoading(false)
  }

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/profiles?is_active=true', { headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch employees')
      setEmployees(json.data || [])
    } catch (err) {
      console.error('fetchEmployees error:', err)
      setEmployees([])
    }
  }

  const fetchCars = async () => {
    try {
      const res = await fetch('/api/cars', { headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch cars')
      setCarsList(json.data || [])
    } catch (err) {
      console.error('fetchCars error:', err)
      setCarsList([])
    }
  }

  const fetchCardUsage = async () => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

    try {
      const res = await fetch(`/api/transactions?payment_method=card&from=${ym}-01&to=${ym}-${lastDay}`, { headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch usage')
      const data = json.data || []

      const usage: Record<string, { count: number; total: number }> = {}
      data.forEach((t: any) => {
        const cid = t.related_type === 'card' ? t.related_id : null
        if (!cid) return
        if (!usage[cid]) usage[cid] = { count: 0, total: 0 }
        usage[cid].count++
        usage[cid].total += Number(t.amount || 0)
      })
      setCardUsage(usage)
    } catch (err) {
      console.error('fetchCardUsage error:', err)
    }
  }

  const handleSave = async () => {
    const payload = {
      card_number: form.card_number || null,
      card_alias: form.card_alias || null,
      holder_name: form.holder_name || null,
      assigned_employee_id: form.assigned_employee_id || null,
      assigned_car_id: form.assigned_car_id || null,
      status: form.status || 'active',
    }

    try {
      if (editingId) {
        const res = await fetch(`/api/corporate_cards/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
          body: JSON.stringify(payload)
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to update')
      } else {
        const res = await fetch('/api/corporate_cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
          body: JSON.stringify(payload)
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to create')
      }
      alert('저장되었습니다.')
      setShowForm(false); setEditingId(null); setForm(emptyForm)
      fetchCards()
    } catch (err: any) {
      alert('저장 실패: ' + err.message)
    }
  }

  const handleEdit = (c: any) => {
    setForm({
      card_number: c.card_number || '',
      card_alias: c.card_alias || '',
      holder_name: c.holder_name || '',
      assigned_employee_id: c.assigned_employee_id || '',
      assigned_car_id: c.assigned_car_id || '',
      status: c.status || 'active',
    })
    setEditingId(c.id); setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 카드를 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/corporate_cards/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
      })
      if (!res.ok) throw new Error('Delete failed')
      fetchCards()
    } catch (err) {
      alert('삭제 실패')
    }
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
  const activeCards = cards.filter(c => (c.status || 'active') === 'active').length

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">

      <DcStatStrip
        stats={[
          { label: '등록 카드', value: cards.length },
          { label: '활성 카드', value: activeCards },
          { label: '이번달 사용건수', value: totalMonthlyCount },
          { label: '총 사용액', value: totalMonthlyUsage, unit: '원' },
        ]}
        actions={[
          { label: '카드 등록', onClick: () => { setForm(emptyForm); setEditingId(null); setShowForm(true) }, variant: 'primary', icon: '➕' },
        ]}
      />

      {/* 카드 목록 - 카드형 UI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(c => {
          const usage = cardUsage[c.id] || { count: 0, total: 0 }
          const cardCompany = inferCardCompany(c)
          const isActive = (c.status || 'active') === 'active'

          return (
            <div key={c.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isActive ? 'border-slate-200/80' : 'border-slate-100 opacity-60'}`}>
              {/* 카드 헤더 - 카드사 색상 */}
              <div className={`px-5 py-4 ${
                cardCompany.includes('신한') ? 'bg-blue-600' :
                cardCompany.includes('삼성') ? 'bg-slate-800' :
                cardCompany.includes('현대') ? 'bg-zinc-900' :
                cardCompany.includes('KB') || cardCompany.includes('국민') ? 'bg-amber-600' :
                cardCompany.includes('하나') ? 'bg-teal-600' :
                cardCompany.includes('롯데') ? 'bg-red-600' :
                'bg-slate-700'
              } text-white`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-white/70">{cardCompany}</p>
                    <p className="font-mono text-lg font-bold tracking-wider mt-1">{maskCardNumber(c.card_number)}</p>
                  </div>
                  {!isActive && <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">비활성</span>}
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
                  <span className="font-semibold text-slate-700">{c.assigned_employee_name || '미배정'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">배정 차량</span>
                  <span className="font-semibold text-slate-700">
                    {c.assigned_car_number ? (
                      <>
                        {c.assigned_car_number}
                        {c.assigned_car_model && <span className="text-slate-400 font-normal ml-1">· {c.assigned_car_model}</span>}
                      </>
                    ) : '미배정'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">이번달 사용</span>
                  <span className="font-bold text-slate-900">{formatMoney(usage.total)}원 <span className="text-slate-400 font-normal">({usage.count}건)</span></span>
                </div>

                {/* 액션 버튼 */}
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button onClick={() => handleEdit(c)} className="flex-1 text-xs font-semibold text-slate-500 py-2 rounded-lg hover:bg-slate-50 transition-colors">수정</button>
                  <button onClick={() => handleDelete(c.id)} className="text-xs font-medium text-red-400 py-2 px-3 rounded-lg hover:bg-red-50 transition-colors">삭제</button>
                </div>
              </div>
            </div>
          )
        })}

        {cards.length === 0 && !loading && (
          <div className="col-span-full bg-white rounded-2xl border border-slate-200/80 shadow-sm text-center py-16">
            <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
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
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">카드번호</label>
                <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm font-mono" value={form.card_number} onChange={e => setForm({ ...form, card_number: e.target.value })} placeholder="0000-0000-0000-0000" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">카드 별칭 <span className="text-red-400">*</span></label>
                <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={form.card_alias} onChange={e => setForm({ ...form, card_alias: e.target.value })} placeholder="예: 신한-영업팀, KB-대표님" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">명의자</label>
                <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={form.holder_name} onChange={e => setForm({ ...form, holder_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">사용 직원</label>
                <select className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white" value={form.assigned_employee_id} onChange={e => setForm({ ...form, assigned_employee_id: e.target.value })}>
                  <option value="">미배정</option>
                  {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name || e.employee_name || e.email}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  🚗 배정 차량 <span className="text-slate-400 font-normal">(카드 거래가 자동으로 차량에 매칭됩니다)</span>
                </label>
                <select className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white" value={form.assigned_car_id} onChange={e => setForm({ ...form, assigned_car_id: e.target.value })}>
                  <option value="">미배정</option>
                  {carsList.map((car: any) => (
                    <option key={car.id} value={car.id}>
                      {car.number} · {[car.brand, car.model].filter(Boolean).join(' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">상태</label>
                <select className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="active">활성</option>
                  <option value="inactive">비활성</option>
                </select>
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
    </div>
  )
}

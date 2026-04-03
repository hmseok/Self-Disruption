'use client'
import { useApp } from '../context/AppContext'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/firebase')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}
import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import DarkHeader from '../components/DarkHeader'
export default function FinancePage() {
  const { company, role } = useApp()

// ✅ [수정 2] supabase 클라이언트 생성 (이 줄이 없어서 에러가 난 겁니다!)
const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'ledger' | 'schedule'>('ledger')

  const [list, setList] = useState<any[]>([])
  const [summary, setSummary] = useState({ income: 0, expense: 0, profit: 0, pendingExpense: 0 })
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM

  const formRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    type: 'expense',
    status: 'completed',
    category: '기타운영비',
    client_name: '',
    description: '',
    amount: '',
    payment_method: '통장'
  })

  const pathname = usePathname()

  useEffect(() => { fetchTransactions() }, [filterDate, activeTab, company, pathname])

  // 탭 포커스 시 자동 새로고침
  useEffect(() => {
    const onFocus = () => fetchTransactions()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [filterDate, company])

  const fetchTransactions = async () => {
    if (!company && role !== 'admin') return
    setLoading(true)
    try {
      const [year, month] = filterDate.split('-').map(Number)
      const lastDay = new Date(year, month, 0).getDate()
      const headers = await getAuthHeader()
      const params = new URLSearchParams({
        from: `${filterDate}-01`,
        to: `${filterDate}-${String(lastDay).padStart(2, '0')}`,
      })
      const res = await fetch(`/api/transactions?${params}`, { headers })
      if (!res.ok) {
        const text = await res.text()
        console.error(`[transactions] HTTP ${res.status}:`, text.slice(0, 300))
        setLoading(false)
        return
      }
      const json = await res.json()
      if (json.error) console.error('[transactions] API error:', json.error)
      else {
        setList(json.data || [])
        calculateSummary(json.data || [])
      }
    } catch (e: any) {
      console.error('[transactions] exception:', e?.message || String(e))
    }
    setLoading(false)
  }

  const calculateSummary = (data: any[]) => {
      let inc = 0, exp = 0, pending = 0;
      data.forEach(item => {
          const amt = Number(item.amount)
          if (item.status === 'completed') {
              if(item.type === 'income') inc += amt
              else exp += amt
          } else {
              if(item.type === 'expense') pending += amt
          }
      })
      setSummary({ income: inc, expense: exp, profit: inc - exp, pendingExpense: pending })
  }

  const handleSave = async () => {
      if (role === 'admin' && !company) return alert('⚠️ 회사를 먼저 선택해주세요.')
      if (!form.amount || !form.client_name) return alert('필수 항목을 입력해주세요.')
      try {
        const headers = await getAuthHeader()
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, amount: Number(form.amount.replace(/,/g, '')), company_id: company?.id }),
        })
        const json = await res.json()
        if (json.error) alert('저장 실패: ' + json.error)
        else {
          alert('✅ 저장되었습니다.')
          fetchTransactions()
          setForm({ ...form, client_name: '', description: '', amount: '' })
        }
      } catch (e: any) { alert('저장 실패: ' + e.message) }
  }

  const handleConfirm = async (id: string) => {
      if(!confirm('지급/수금 완료 처리하시겠습니까?')) return
      const headers = await getAuthHeader()
      await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      fetchTransactions()
  }

  const handleDelete = async (id: string) => {
      if(confirm('삭제하시겠습니까?')) {
          const headers = await getAuthHeader()
          await fetch(`/api/transactions/${id}`, { method: 'DELETE', headers })
          fetchTransactions()
      }
  }

  const generateMonthlySchedule = async () => {
      if (role === 'admin' && !company) return alert('⚠️ 회사를 먼저 선택해주세요.')
      if(!confirm(`${filterDate}월 정기 지출을 일괄 생성하시겠습니까?`)) return
      setLoading(true)
      try {
          const headers = await getAuthHeader()
          const res = await fetch('/api/transactions/generate-schedule', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ month: filterDate, company_id: company?.id }),
          })
          const json = await res.json()
          if (json.error) throw new Error(json.error)
          alert(`✅ ${json.message}`)
          if (json.created > 0) setActiveTab('schedule')
          fetchTransactions()
      } catch (e: any) { alert('오류: ' + e.message); setLoading(false) }
  }

  const scrollToForm = () => {
      formRef.current?.scrollIntoView({ behavior: 'smooth' })
      setActiveTab('ledger')
      setForm(prev => ({ ...prev, status: 'completed' }))
  }

  const nf = (num: number) => num ? num.toLocaleString() : '0'
  const filteredList = list.filter(item => activeTab === 'ledger' ? item.status === 'completed' : item.status === 'pending')

  if (!company && !loading) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg style={{ width: 28, height: 28, color: '#2d5fa8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              자금 장부 (입출금)
            </h1>
            <p className="text-gray-500 text-sm mt-1">회사의 모든 자금 흐름을 기록하고 예측합니다.</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm text-center py-20">
          <p className="text-4xl mb-3">🏢</p>
          <p className="font-semibold text-sm text-slate-500">좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p className="text-xs text-slate-400 mt-1">회사 선택 후 자금 장부를 이용할 수 있습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">

      {/* DarkHeader with month picker in children */}
      <DarkHeader
        icon="📊"
        title="장부/결산"
        subtitle="회사의 모든 자금 흐름을 기록하고 예측합니다."
        stats={[
          { label: '총 수입', value: `${nf(summary.income)}원`, color: '#2563eb', bgColor: '#eff6ff', borderColor: '#bfdbfe', labelColor: '#93c5fd' },
          { label: '총 지출', value: `${nf(summary.expense)}원`, color: '#dc2626', bgColor: '#fef2f2', borderColor: '#fecaca', labelColor: '#fca5a5' },
          { label: '손익', value: `${summary.profit > 0 ? '+' : ''}${nf(summary.profit)}원`, color: summary.profit >= 0 ? '#059669' : '#dc2626', bgColor: summary.profit >= 0 ? '#ecfdf5' : '#fef2f2', borderColor: summary.profit >= 0 ? '#bbf7d0' : '#fecaca', labelColor: summary.profit >= 0 ? '#6ee7b7' : '#fca5a5' },
        ]}
        actions={[
          { label: '엑셀 등록', icon: '📂', onClick: () => router.push('/finance/upload'), variant: 'secondary' },
          { label: '직접 입력', icon: '✏️', onClick: scrollToForm, variant: 'primary' }
        ]}
      >
        {/* Month picker in DarkHeader children */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 8 }}>
          <input type="month" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: 600 }} />
        </div>
      </DarkHeader>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setActiveTab('ledger')} style={{
          padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14,
          background: activeTab === 'ledger' ? '#3b82f6' : '#fff', color: activeTab === 'ledger' ? '#fff' : '#6b7280',
          border: activeTab === 'ledger' ? 'none' : '1px solid #e5e7eb', cursor: 'pointer'
        }}>
          📊 확정된 장부
        </button>
        <button onClick={() => setActiveTab('schedule')} style={{
          padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14,
          background: activeTab === 'schedule' ? '#3b82f6' : '#fff', color: activeTab === 'schedule' ? '#fff' : '#6b7280',
          border: activeTab === 'schedule' ? 'none' : '1px solid #e5e7eb', cursor: 'pointer'
        }}>
          🗓️ 예정 스케줄
        </button>
        {activeTab === 'schedule' && (
          <button onClick={generateMonthlySchedule} style={{
            marginLeft: 'auto', padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14,
            background: '#f59e11', color: '#000', border: 'none', cursor: 'pointer'
          }}>
            ⚡ 정기 지출 생성
          </button>
        )}
      </div>

      {/* 4. 입력 폼 (Ref) */}
      <div ref={formRef} className="bg-white p-4 md:p-6 rounded-3xl shadow-lg border border-gray-100 mb-8 scroll-mt-32 ring-1 ring-black/5">
          <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  {activeTab === 'schedule' ? '🗓️ 예정 내역 등록' : '✏️ 입출금 내역 등록'}
              </h3>
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">
                  {activeTab === 'schedule' ? '아직 돈이 나가지 않은 예정 건' : '실제 통장 거래 내역'}
              </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1">날짜</label>
                  <input type="date" className="w-full border border-gray-200 p-2.5 rounded-xl bg-gray-50 text-sm font-bold" value={form.transaction_date} onChange={e=>setForm({...form, transaction_date: e.target.value})} />
              </div>
              <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1">구분</label>
                  <select className="w-full border border-gray-200 p-2.5 rounded-xl bg-white text-sm font-bold" value={form.type} onChange={e=>setForm({...form, type: e.target.value})}>
                      <option value="expense">🔴 지출 (출금)</option>
                      <option value="income">🔵 수입 (입금)</option>
                  </select>
              </div>
              <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1">계정과목</label>
                  <input placeholder="검색 또는 입력" className="w-full border border-gray-200 p-2.5 rounded-xl text-sm" value={form.category} onChange={e=>setForm({...form, category: e.target.value})} list="category-list" />
                  <datalist id="category-list">
                      <option value="투자이자" /><option value="지입정산금" /><option value="보험료" />
                      <option value="대출원리금" /><option value="차량할부금" /><option value="관리비수입" />
                  </datalist>
              </div>
              <div className="md:col-span-3">
                  <label className="block text-xs font-bold text-gray-500 mb-1">거래처/내용</label>
                  <input placeholder="내용 입력" className="w-full border border-gray-200 p-2.5 rounded-xl text-sm" value={form.client_name} onChange={e=>setForm({...form, client_name: e.target.value})} />
              </div>
              <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1">금액</label>
                  <input type="text" placeholder="0" className="w-full border border-gray-200 p-2.5 rounded-xl text-right font-black text-gray-900" value={form.amount ? Number(form.amount).toLocaleString() : ''} onChange={e=>setForm({...form, amount: e.target.value.replace(/,/g, '')})} />
              </div>
              <div className="md:col-span-1">
                  <button onClick={handleSave} className={`w-full py-2.5 rounded-xl font-bold text-white shadow-md transition-transform active:scale-95 ${activeTab === 'schedule' ? 'bg-green-600 hover:bg-green-700' : 'bg-steel-600 hover:bg-steel-700'}`}>
                      등록
                  </button>
              </div>
          </div>
          <input type="hidden" value={form.status = activeTab === 'ledger' ? 'completed' : 'pending'} />
      </div>

      {/* 5. 리스트 뷰 */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-bold text-gray-600 text-sm">
                  {activeTab === 'ledger' ? '📚 거래 내역 장부' : '🗓️ 자금 집행 스케줄'}
              </h3>
              <span className="text-xs bg-white border border-gray-200 px-3 py-1 rounded-full font-bold text-gray-500">총 {filteredList.length}건</span>
          </div>

          {/* Empty State */}
          {loading ? (
              <div className="p-10 text-center text-gray-400">데이터를 불러오는 중입니다...</div>
          ) : filteredList.length === 0 ? (
              <div className="p-20 text-center text-gray-400 bg-gray-50/30">
                  {activeTab === 'ledger' ? '등록된 내역이 없습니다.' : '예정된 스케줄이 없습니다.'}
              </div>
          ) : (
              <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block" style={{ overflowX: 'auto' }}>
                      <table className="w-full text-left min-w-[600px]">
                          <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider border-b border-gray-100">
                              <tr>
                                  <th className="p-3 md:p-4 pl-4 md:pl-6 font-bold">거래일</th>
                                  <th className="p-3 md:p-4 font-bold">구분</th>
                                  <th className="p-3 md:p-4 font-bold">계정과목</th>
                                  <th className="p-3 md:p-4 font-bold">거래처/내용</th>
                                  <th className="p-3 md:p-4 font-bold text-right">금액</th>
                                  <th className="p-3 md:p-4 pr-4 md:pr-6 font-bold text-center">관리</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 text-sm">
                              {filteredList.map((item) => (
                                  <tr key={item.id} className="hover:bg-steel-50/30 transition-colors group">
                                      <td className="p-3 md:p-4 pl-4 md:pl-6 font-bold text-gray-600">{item.transaction_date.slice(5)}</td>
                                      <td className="p-3 md:p-4">
                                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${item.type === 'income' ? 'bg-steel-50 text-steel-600' : 'bg-red-50 text-red-600'}`}>
                                              {item.type === 'income' ? '수입' : '지출'}
                                          </span>
                                      </td>
                                      <td className="p-3 md:p-4 font-bold text-gray-700">{item.category}</td>
                                      <td className="p-3 md:p-4">
                                          <div className="font-bold text-gray-900">{item.client_name}</div>
                                          <div className="text-xs text-gray-400 mt-0.5">{item.description}</div>
                                      </td>
                                      <td className={`p-3 md:p-4 text-right font-bold text-base ${item.type === 'income' ? 'text-steel-600' : 'text-red-600'}`}>
                                          {item.type === 'income' ? '+' : '-'}{nf(item.amount)}
                                      </td>
                                      <td className="p-3 md:p-4 pr-4 md:pr-6 text-center">
                                          {item.status === 'pending' ? (
                                              <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                  <button onClick={() => handleConfirm(item.id)} className="bg-steel-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-steel-700 shadow-sm">
                                                      승인
                                                  </button>
                                                  <button onClick={() => handleDelete(item.id)} className="text-gray-400 hover:text-red-500 p-1.5">🗑️</button>
                                              </div>
                                          ) : (
                                              <button onClick={() => handleDelete(item.id)} className="text-gray-300 hover:text-red-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity px-2">
                                                  삭제
                                              </button>
                                          )}
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden" style={{ padding: '8px 12px' }}>
                      {filteredList.map((item) => (
                          <div key={item.id}
                            style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${item.type === 'income' ? 'bg-steel-50 text-steel-600' : 'bg-red-50 text-red-600'}`}>
                                  {item.type === 'income' ? '수입' : '지출'}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{item.category}</span>
                              </div>
                              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{item.transaction_date.slice(5)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>{item.client_name}</div>
                                {item.description && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{item.description}</div>}
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                                <span className={`font-black text-base ${item.type === 'income' ? 'text-steel-600' : 'text-red-600'}`}>
                                  {item.type === 'income' ? '+' : '-'}{nf(item.amount)}
                                </span>
                              </div>
                            </div>
                          </div>
                      ))}
                  </div>
              </>
          )}
      </div>
    </div>
  )
}
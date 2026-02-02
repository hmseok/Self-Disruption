'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../utils/supabase'

export default function FinancePage() {
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

  useEffect(() => { fetchTransactions() }, [filterDate, activeTab])

  const fetchTransactions = async () => {
    setLoading(true)
    const [year, month] = filterDate.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()

    const { data: txs, error } = await supabase
      .from('transactions')
      .select('*')
      .gte('transaction_date', `${filterDate}-01`)
      .lte('transaction_date', `${filterDate}-${lastDay}`)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) console.error(error)
    else {
        setList(txs || [])
        calculateSummary(txs || [])
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
      if (!form.amount || !form.client_name) return alert('필수 항목을 입력해주세요.')
      const { error } = await supabase.from('transactions').insert({
          ...form, amount: Number(form.amount.replace(/,/g, ''))
      })
      if (error) alert('저장 실패: ' + error.message)
      else {
          alert('✅ 저장되었습니다.')
          fetchTransactions()
          setForm({ ...form, client_name: '', description: '', amount: '' })
      }
  }

  const handleConfirm = async (id: string) => {
      if(!confirm('지급/수금 완료 처리하시겠습니까?')) return
      await supabase.from('transactions').update({ status: 'completed' }).eq('id', id)
      fetchTransactions()
  }

  const handleDelete = async (id: string) => {
      if(confirm('삭제하시겠습니까?')) {
          await supabase.from('transactions').delete().eq('id', id)
          fetchTransactions()
      }
  }

  const generateMonthlySchedule = async () => {
      if(!confirm(`${filterDate}월 정기 지출을 일괄 생성하시겠습니까?`)) return;
      setLoading(true)
      try {
          const { data: investors } = await supabase.from('general_investments').select('*').eq('status', 'active')
          const { data: jiips } = await supabase.from('jiip_contracts').select('*').eq('status', 'active')
          const { data: loans } = await supabase.from('loans').select('*, cars(number)')

          const [year, month] = filterDate.split('-').map(Number)
          const lastDay = new Date(year, month, 0).getDate()
          const { data: existingTxs } = await supabase.from('transactions').select('related_id, category')
              .gte('transaction_date', `${filterDate}-01`).lte('transaction_date', `${filterDate}-${lastDay}`)

          const existingSet = new Set(existingTxs?.map(t => `${t.related_id}-${t.category}`))
          const newTxs = []
          let skippedCount = 0;

          // 1. 투자자 이자
          if(investors) {
              for (const inv of investors) {
                  if (existingSet.has(`${inv.id}-투자이자`)) { skippedCount++; continue; }
                  newTxs.push({
                      transaction_date: `${filterDate}-${inv.payment_day?.toString().padStart(2,'0') || '10'}`,
                      type: 'expense', status: 'pending', category: '투자이자',
                      client_name: `${inv.investor_name} (이자)`, description: `${filterDate}월 정기 이자`,
                      amount: Math.floor((inv.invest_amount * (inv.interest_rate / 100)) / 12),
                      payment_method: '통장', related_type: 'invest', related_id: String(inv.id)
                  })
              }
          }
          // 2. 지입료
          if(jiips) {
              for (const jiip of jiips) {
                  if (existingSet.has(`${jiip.id}-지입정산금`)) { skippedCount++; continue; }
                  newTxs.push({
                      transaction_date: `${filterDate}-${jiip.payout_day?.toString().padStart(2,'0') || '10'}`,
                      type: 'expense', status: 'pending', category: '지입정산금',
                      client_name: `${jiip.contractor_name} (정산)`, description: `${filterDate}월 운송료 정산`,
                      amount: 0, payment_method: '통장', related_type: 'jiip', related_id: String(jiip.id)
                  })
              }
          }
          // 3. 대출금
          if(loans) {
              const startDt = new Date(`${filterDate}-01`); const endDt = new Date(`${filterDate}-${lastDay}`)
              for (const loan of loans) {
                  const ls = loan.start_date ? new Date(loan.start_date) : null
                  const le = loan.end_date ? new Date(loan.end_date) : null
                  if ((ls && ls > endDt) || (le && le < startDt)) continue;
                  if (existingSet.has(`${loan.id}-대출상환`)) { skippedCount++; continue; }
                  newTxs.push({
                      transaction_date: `${filterDate}-${loan.payment_date?.toString().padStart(2,'0') || '25'}`,
                      type: 'expense', status: 'pending', category: loan.type === '리스' ? '리스료' : '대출원리금',
                      client_name: `${loan.finance_name} (${loan.cars?.number})`, description: `${filterDate}월 ${loan.type} 납입`,
                      amount: loan.monthly_payment || 0, payment_method: '통장', related_type: 'loan', related_id: String(loan.id)
                  })
              }
          }

          if(newTxs.length > 0) {
              const { error } = await supabase.from('transactions').insert(newTxs)
              if(error) throw error
              alert(`✅ 신규 ${newTxs.length}건 생성 완료!`)
              setActiveTab('schedule')
              fetchTransactions()
          } else {
              alert(skippedCount > 0 ? '✅ 이미 모든 내역이 생성되어 있습니다.' : '생성할 대상이 없습니다.')
              setLoading(false)
          }
      } catch (e: any) { alert('오류: ' + e.message); setLoading(false); }
  }

  const scrollToForm = () => {
      formRef.current?.scrollIntoView({ behavior: 'smooth' })
      setActiveTab('ledger')
      setForm(prev => ({ ...prev, status: 'completed' }))
  }

  const nf = (num: number) => num ? num.toLocaleString() : '0'
  const filteredList = list.filter(item => activeTab === 'ledger' ? item.status === 'completed' : item.status === 'pending')

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 pb-40 animate-fade-in-up">

      {/* 1. 상단 헤더 (제목 + 날짜) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b pb-6 gap-4">
          <div>
              <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-black text-gray-900">💰 자금 관리</h1>
                  <input type="month" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
                         className="border-2 border-gray-200 rounded-lg px-3 py-1 font-bold text-lg bg-gray-50 hover:bg-white focus:border-indigo-500 transition-colors cursor-pointer text-gray-700" />
              </div>
              <p className="text-gray-500 text-sm">회사의 모든 자금 흐름을 기록하고 예측합니다.</p>
          </div>

          {/* 우측 상단 요약 (간단 버전) */}
          <div className="flex gap-4 text-right">
              <div>
                  <p className="text-xs text-gray-400 font-bold uppercase">Cash Flow</p>
                  <p className={`text-xl font-black ${summary.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {summary.profit > 0 ? '+' : ''}{nf(summary.profit)}원
                  </p>
              </div>
          </div>
      </div>

      {/* 2. 대시보드 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center">
              <div><p className="text-gray-500 text-xs font-bold mb-1">총 수입 (+)</p><h3 className="text-2xl font-black text-blue-600">{nf(summary.income)}</h3></div>
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-xl">🔵</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center">
              <div><p className="text-gray-500 text-xs font-bold mb-1">총 지출 (-)</p><h3 className="text-2xl font-black text-red-600">{nf(summary.expense)}</h3></div>
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-xl">🔴</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-white p-6 rounded-2xl border border-green-100 shadow-sm flex justify-between items-center">
              <div>
                  <p className="text-green-800 text-xs font-bold mb-1">지출 예정 (Pending)</p>
                  <h3 className="text-2xl font-black text-green-700">-{nf(summary.pendingExpense)}</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-xl shadow-sm">🔮</div>
          </div>
      </div>

      {/* 3. ⭐ 컨트롤 바 (탭 & 액션 버튼) - 디자인 개선됨 */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-gray-100 p-1.5 rounded-2xl mb-6 gap-2">
          {/* 좌측: 탭 스위처 */}
          <div className="flex bg-white rounded-xl shadow-sm p-1 w-full md:w-auto">
              <button onClick={() => setActiveTab('ledger')} className={`flex-1 md:flex-none px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'ledger' ? 'bg-indigo-900 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}>
                  📊 확정된 장부
              </button>
              <button onClick={() => setActiveTab('schedule')} className={`flex-1 md:flex-none px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'schedule' ? 'bg-indigo-900 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}>
                  🗓️ 예정 스케줄
              </button>
          </div>

          {/* 우측: 액션 버튼 그룹 */}
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
              {activeTab === 'schedule' && (
                  <button onClick={generateMonthlySchedule} className="whitespace-nowrap px-4 py-2 bg-yellow-400 text-black rounded-xl font-bold text-sm shadow-sm hover:bg-yellow-500 flex items-center gap-2">
                      ⚡️ 정기 지출 생성
                  </button>
              )}
              <button onClick={() => router.push('/finance/upload')} className="whitespace-nowrap px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl font-bold text-sm hover:bg-gray-50 hover:border-gray-300 flex items-center gap-2 shadow-sm">
                  📂 엑셀 등록
              </button>
              <button onClick={scrollToForm} className="whitespace-nowrap px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-indigo-700 flex items-center gap-2">
                  ✏️ 직접 입력
              </button>
          </div>
      </div>

      {/* 4. 입력 폼 (Ref) */}
      <div ref={formRef} className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 mb-8 scroll-mt-32 ring-1 ring-black/5">
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
                  <button onClick={handleSave} className={`w-full py-2.5 rounded-xl font-bold text-white shadow-md transition-transform active:scale-95 ${activeTab === 'schedule' ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-900 hover:bg-black'}`}>
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
              <span className="text-xs bg-white border border-gray-200 px-3 py-1 rounded-full font-bold text-gray-500">Total: {filteredList.length}</span>
          </div>
          <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider border-b border-gray-100">
                  <tr>
                      <th className="p-4 pl-6 font-bold">Date</th>
                      <th className="p-4 font-bold">Type</th>
                      <th className="p-4 font-bold">Category</th>
                      <th className="p-4 font-bold">Description</th>
                      <th className="p-4 font-bold text-right">Amount</th>
                      <th className="p-4 pr-6 font-bold text-center">Action</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                  {loading ? (
                      <tr><td colSpan={6} className="p-10 text-center text-gray-400">데이터를 불러오는 중입니다...</td></tr>
                  ) : filteredList.length === 0 ? (
                      <tr><td colSpan={6} className="p-20 text-center text-gray-400 bg-gray-50/30">
                          {activeTab === 'ledger' ? '등록된 내역이 없습니다.' : '예정된 스케줄이 없습니다.'}
                      </td></tr>
                  ) : (
                      filteredList.map((item) => (
                          <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group">
                              <td className="p-4 pl-6 font-bold text-gray-600">{item.transaction_date.slice(5)}</td>
                              <td className="p-4">
                                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${item.type === 'income' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                                      {item.type === 'income' ? '수입' : '지출'}
                                  </span>
                              </td>
                              <td className="p-4 font-bold text-gray-700">{item.category}</td>
                              <td className="p-4">
                                  <div className="font-bold text-gray-900">{item.client_name}</div>
                                  <div className="text-xs text-gray-400 mt-0.5">{item.description}</div>
                              </td>
                              <td className={`p-4 text-right font-bold text-base ${item.type === 'income' ? 'text-blue-600' : 'text-red-600'}`}>
                                  {item.type === 'income' ? '+' : '-'}{nf(item.amount)}
                              </td>
                              <td className="p-4 pr-6 text-center">
                                  {item.status === 'pending' ? (
                                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={() => handleConfirm(item.id)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm">
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
                      ))
                  )}
              </tbody>
          </table>
      </div>
    </div>
  )
}
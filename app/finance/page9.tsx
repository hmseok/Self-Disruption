'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function FinancePage() {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'ledger' | 'schedule'>('ledger')

  const [list, setList] = useState<any[]>([])
  const [summary, setSummary] = useState({ income: 0, expense: 0, profit: 0, pendingExpense: 0 })
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM

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

  // 🔄 탭이나 날짜가 바뀌면 자동 새로고침
  useEffect(() => {
    fetchTransactions()
  }, [filterDate, activeTab])

  const fetchTransactions = async () => {
    setLoading(true)

    // 해당 월의 마지막 날짜 계산
    const [year, month] = filterDate.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()

    const startDate = `${filterDate}-01`
    const endDate = `${filterDate}-${lastDay}`

    const { data: txs, error } = await supabase
      .from('transactions')
      .select('*')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
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
          ...form,
          amount: Number(form.amount.replace(/,/g, ''))
      })

      if (error) alert('저장 실패: ' + error.message)
      else {
          alert('✅ 저장되었습니다.')
          fetchTransactions()
          setForm({ ...form, client_name: '', description: '', amount: '' })
      }
  }

  const handleConfirm = async (id: string) => {
      if(!confirm('해당 건을 [지급/수금 완료] 처리하시겠습니까?')) return
      await supabase.from('transactions').update({ status: 'completed' }).eq('id', id)
      fetchTransactions()
  }

  const handleDelete = async (id: string) => {
      if(confirm('정말 삭제하시겠습니까?')) {
          await supabase.from('transactions').delete().eq('id', id)
          fetchTransactions()
      }
  }

  // ⚡️ 정기 지출 생성 (중복 방지 로직 추가됨 🛡️)
  const generateMonthlySchedule = async () => {
      if(!confirm(`${filterDate}월의 정기 지출(이자/지입) 내역을 생성하시겠습니까?`)) return;

      setLoading(true)
      try {
          // 1. 기초 데이터 조회 (투자자, 지입차주)
          const { data: investors } = await supabase.from('general_investments').select('*').eq('status', 'active')
          const { data: jiips } = await supabase.from('jiip_contracts').select('*').eq('status', 'active')

          // 2. 🛡️ [중복 방지] 이미 생성된 내역 조회
          const [year, month] = filterDate.split('-').map(Number)
          const lastDay = new Date(year, month, 0).getDate()
          const { data: existingTxs } = await supabase
              .from('transactions')
              .select('related_id, category') // ID와 카테고리로 중복 확인
              .gte('transaction_date', `${filterDate}-01`)
              .lte('transaction_date', `${filterDate}-${lastDay}`)

          // 이미 존재하는 내역을 Set으로 만들어 빠른 검색 준비 (예: "123-투자이자")
          const existingSet = new Set(existingTxs?.map(t => `${t.related_id}-${t.category}`))

          const newTxs = []
          let skippedCount = 0; // 중복이라 건너뛴 개수

          // 3. 투자자 이자 생성 (중복 체크)
          if(investors) {
              for (const inv of investors) {
                  // 이미 존재하는지 확인
                  if (existingSet.has(`${inv.id}-투자이자`)) {
                      skippedCount++;
                      continue; // 존재하면 건너뜀
                  }

                  const monthlyInterest = Math.floor((inv.invest_amount * (inv.interest_rate / 100)) / 12)
                  newTxs.push({
                      transaction_date: `${filterDate}-${inv.payment_day?.toString().padStart(2,'0') || '10'}`,
                      type: 'expense',
                      status: 'pending',
                      category: '투자이자',
                      client_name: `${inv.investor_name} (이자)`,
                      description: `${filterDate}월 정기 이자 지급`,
                      amount: monthlyInterest,
                      payment_method: '통장',
                      related_type: 'invest',
                      related_id: String(inv.id)
                  })
              }
          }

          // 4. 지입료 정산 생성 (중복 체크)
          if(jiips) {
              for (const jiip of jiips) {
                  // 이미 존재하는지 확인
                  if (existingSet.has(`${jiip.id}-지입정산금`)) {
                      skippedCount++;
                      continue;
                  }

                  newTxs.push({
                      transaction_date: `${filterDate}-${jiip.payout_day?.toString().padStart(2,'0') || '10'}`,
                      type: 'expense',
                      status: 'pending',
                      category: '지입정산금',
                      client_name: `${jiip.investor_name || '지입차주'} (정산)`,
                      description: `${filterDate}월 운송료 정산 지급(예정)`,
                      amount: 0,
                      payment_method: '통장',
                      related_type: 'jiip',
                      related_id: String(jiip.id)
                  })
              }
          }

          // 5. 결과 처리
          if(newTxs.length > 0) {
              const { error } = await supabase.from('transactions').insert(newTxs)
              if(error) throw error

              alert(`✅ 신규 ${newTxs.length}건 생성 완료!\n(이미 존재하는 ${skippedCount}건은 건너뛰었습니다)`)
              setActiveTab('schedule')
              fetchTransactions()
          } else {
              if (skippedCount > 0) {
                  alert(`✅ 모든 대상(${skippedCount}건)이 이미 생성되어 있습니다.\n중복 생성을 방지했습니다.`)
              } else {
                  alert('생성할 대상(활성 계약)이 없습니다.')
              }
              setLoading(false)
          }

      } catch (e: any) {
          alert('오류 발생: ' + e.message)
          setLoading(false)
      }
  }

  const nf = (num: number) => num ? num.toLocaleString() : '0'

  // 필터링된 리스트
  const filteredList = list.filter(item => activeTab === 'ledger' ? item.status === 'completed' : item.status === 'pending')

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 pb-40 animate-fade-in-up">

      {/* 헤더 */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
          <div>
              <h1 className="text-3xl font-black text-gray-900 mb-2">💰 회계/자금 관리</h1>
              <div className="flex items-center gap-2">
                  <input type="month" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="border-2 border-gray-300 rounded-xl px-4 py-2 font-bold text-lg bg-white cursor-pointer hover:border-indigo-500 transition-colors" />
                  <span className="text-gray-500 text-sm font-bold">자금 흐름 현황표</span>
              </div>
          </div>
          <div className="bg-white border p-1 rounded-xl flex shadow-sm">
              <button onClick={() => setActiveTab('ledger')} className={`px-6 py-2 rounded-lg font-bold transition-all ${activeTab === 'ledger' ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}>📊 확정된 장부</button>
              <button onClick={() => setActiveTab('schedule')} className={`px-6 py-2 rounded-lg font-bold transition-all ${activeTab === 'schedule' ? 'bg-green-600 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}>🗓️ 예정 스케줄</button>
          </div>
      </div>

      {/* 📊 자금 현황 대시보드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
              <p className="text-gray-500 text-xs font-bold mb-1">실제 총 수입</p>
              <h3 className="text-2xl font-black text-blue-600">+{nf(summary.income)}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
              <p className="text-gray-500 text-xs font-bold mb-1">실제 총 지출</p>
              <h3 className="text-2xl font-black text-red-600">-{nf(summary.expense)}</h3>
          </div>
          <div className="bg-gray-800 p-5 rounded-2xl shadow-lg text-white ring-2 ring-gray-900 ring-offset-2">
              <p className="text-gray-400 text-xs font-bold mb-1">현재 순수익 (Cash)</p>
              <h3 className="text-2xl font-black">{nf(summary.profit)}원</h3>
          </div>
          <div className="bg-green-50 p-5 rounded-2xl border border-green-200 shadow-sm relative overflow-hidden">
              <div className="absolute right-0 top-0 p-4 opacity-10 text-6xl">🔮</div>
              <p className="text-green-700 text-xs font-bold mb-1">지출 예정액 (Pending)</p>
              <h3 className="text-2xl font-black text-green-700">-{nf(summary.pendingExpense)}</h3>
              <p className="text-xs text-green-600 mt-1 font-bold">예상 잔고: {nf(summary.profit - summary.pendingExpense)}</p>
          </div>
      </div>

      {/* ⚡️ 스케줄 관리 툴바 */}
      {activeTab === 'schedule' && (
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl mb-6 flex justify-between items-center animate-fade-in">
              <div className="flex items-center gap-2 text-yellow-800 text-sm font-bold">
                  <span>💡 매달 1일, 정기적으로 나갈 돈을 미리 생성하세요.</span>
              </div>
              <button onClick={generateMonthlySchedule} className="bg-yellow-400 hover:bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold shadow-sm text-sm transition-transform active:scale-95">
                  ⚡️ 이번 달 정기 지출(이자/지입) 생성하기
              </button>
          </div>
      )}

      {/* 📝 입력 폼 */}
      <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 mb-8">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              {activeTab === 'schedule' ? '✏️ 지출/수입 예정 등록 (보험, 대출 등)' : '✏️ 즉시 거래 등록'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1">날짜</label>
                  <input type="date" className="w-full border p-2.5 rounded-xl bg-gray-50" value={form.transaction_date} onChange={e=>setForm({...form, transaction_date: e.target.value})} />
              </div>
              <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1">구분</label>
                  <select className="w-full border p-2.5 rounded-xl bg-white" value={form.type} onChange={e=>setForm({...form, type: e.target.value})}>
                      <option value="expense">🔴 지출 (출금)</option>
                      <option value="income">🔵 수입 (입금)</option>
                  </select>
              </div>
              <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1">계정과목</label>
                  <input placeholder="예: 보험료, 대출이자" className="w-full border p-2.5 rounded-xl" value={form.category} onChange={e=>setForm({...form, category: e.target.value})} list="category-list" />
                  <datalist id="category-list">
                      <option value="투자이자" /><option value="지입정산금" /><option value="보험분납금" />
                      <option value="대출원리금" /><option value="차량할부금" /><option value="관리비수입" />
                  </datalist>
              </div>
              <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1">거래처/내용</label>
                  <input placeholder="거래처 입력" className="w-full border p-2.5 rounded-xl" value={form.client_name} onChange={e=>setForm({...form, client_name: e.target.value})} />
              </div>
              <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1">금액</label>
                  <input type="text" placeholder="0" className="w-full border p-2.5 rounded-xl text-right font-black" value={form.amount ? Number(form.amount).toLocaleString() : ''} onChange={e=>setForm({...form, amount: e.target.value.replace(/,/g, '')})} />
              </div>
              <div className="md:col-span-2">
                  <button onClick={handleSave} className={`w-full py-3 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 ${activeTab === 'schedule' ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-900 hover:bg-black'}`}>
                      {activeTab === 'schedule' ? '🗓️ 예정 등록' : '💾 거래 저장'}
                  </button>
              </div>
          </div>
          {/* 탭 상태에 따라 status 자동 결정 */}
          <input type="hidden" value={form.status = activeTab === 'ledger' ? 'completed' : 'pending'} />
      </div>

      {/* 📜 리스트 뷰 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">
          <div className="p-4 bg-gray-50 border-b font-bold text-gray-500 flex justify-between">
              <span>{activeTab === 'ledger' ? '📚 거래 내역 장부 (확정)' : '🗓️ 자금 집행 스케줄 (예정)'}</span>
              <span className="text-xs bg-white px-2 py-1 rounded border">총 {filteredList.length}건</span>
          </div>
          <table className="w-full text-left border-collapse">
              <thead>
                  <tr className="text-gray-400 text-xs border-b">
                      <th className="p-4">날짜</th>
                      <th className="p-4">구분</th>
                      <th className="p-4">계정과목</th>
                      <th className="p-4">거래처/적요</th>
                      <th className="p-4 text-right">금액</th>
                      <th className="p-4 text-center">상태/관리</th>
                  </tr>
              </thead>
              <tbody className="text-sm">
                  {loading ? (
                      <tr><td colSpan={6} className="p-10 text-center text-gray-400">로딩 중...</td></tr>
                  ) : filteredList.length === 0 ? (
                      <tr><td colSpan={6} className="p-10 text-center text-gray-400 py-20">
                          {activeTab === 'ledger' ? '등록된 거래 내역이 없습니다.' : '예정된 스케줄이 없습니다.\n상단 버튼을 눌러 정기 지출을 생성해보세요.'}
                      </td></tr>
                  ) : (
                      filteredList.map((item) => (
                          <tr key={item.id} className="border-b hover:bg-gray-50 group">
                              <td className="p-4 font-bold text-gray-700">{item.transaction_date}</td>
                              <td className="p-4">
                                  <span className={`px-2 py-1 rounded text-xs font-bold ${item.type === 'income' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                      {item.type === 'income' ? '수입' : '지출'}
                                  </span>
                              </td>
                              <td className="p-4 text-gray-600">{item.category}</td>
                              <td className="p-4">
                                  <div className="font-bold text-gray-800">{item.client_name}</div>
                                  <div className="text-xs text-gray-400">{item.description}</div>
                              </td>
                              <td className={`p-4 text-right font-black text-lg ${item.type === 'income' ? 'text-blue-600' : 'text-red-600'}`}>
                                  {item.type === 'income' ? '+' : '-'}{nf(item.amount)}
                              </td>
                              <td className="p-4 text-center">
                                  {item.status === 'pending' ? (
                                      <div className="flex justify-center gap-2">
                                          <button onClick={() => handleConfirm(item.id)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow transition-colors">
                                              승인(지급)
                                          </button>
                                          <button onClick={() => handleDelete(item.id)} className="text-gray-400 hover:text-red-500 font-bold px-2 text-xs">삭제</button>
                                      </div>
                                  ) : (
                                      <div className="flex justify-center gap-2 items-center">
                                          <span className="text-green-600 text-xs font-bold">✅ 완료됨</span>
                                          <button onClick={() => handleDelete(item.id)} className="text-gray-300 hover:text-red-500 font-bold px-2">×</button>
                                      </div>
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
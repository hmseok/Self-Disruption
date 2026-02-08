'use client'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { useEffect, useState } from 'react'
export default function CustomerPage() {
  const { company, role, adminSelectedCompanyId } = useApp()
const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 입력 폼
  const [form, setForm] = useState({
    name: '', phone: '', type: '개인', memo: ''
  })

  // 목록 불러오기
  const fetchCustomers = async () => {
    if (!company && role !== 'god_admin') {
      setLoading(false)
      return
    }

    let query = supabase.from('customers').select('*')

    if (role === 'god_admin') {
      if (adminSelectedCompanyId) query = query.eq('company_id', adminSelectedCompanyId)
    } else if (company) {
      query = query.eq('company_id', company.id)
    }

    const { data } = await query.order('id', { ascending: false })
    setCustomers(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchCustomers() }, [company, role, adminSelectedCompanyId])

  // 현재 사용할 company_id 결정
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // 고객 저장
  const handleSave = async () => {
    if (role === 'god_admin' && !adminSelectedCompanyId) return alert('⚠️ 회사를 먼저 선택해주세요.')
    if (!form.name) return alert('고객 이름은 필수입니다.')

    const { error } = await supabase.from('customers').insert([{ ...form, company_id: effectiveCompanyId }])

    if (error) alert('저장 실패: ' + error.message)
    else {
      alert('✅ 고객이 등록되었습니다.')
      setForm({ name: '', phone: '', type: '개인', memo: '' }) // 폼 초기화
      fetchCustomers() // 목록 새로고침
    }
  }

  // 고객 삭제
  const handleDelete = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await supabase.from('customers').delete().eq('id', id)
    fetchCustomers()
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 md:py-10 md:px-6 animate-fade-in">
      <h1 className="text-2xl md:text-3xl font-black text-gray-900 mb-6 md:mb-8">👥 고객 관리 (CRM)</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* 왼쪽: 신규 등록 폼 */}
        <div className="md:col-span-1">
          <div className="bg-white p-6 rounded-2xl border shadow-sm sticky top-10">
            <h3 className="font-bold text-lg mb-4 border-b pb-2">신규 고객 등록</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500">고객 구분</label>
                <div className="flex gap-2 mt-1">
                  {['개인', '법인', '외국인'].map(t => (
                    <button key={t} onClick={()=>setForm({...form, type:t})}
                      className={`flex-1 py-2 text-sm rounded-lg font-bold border ${form.type === t ? 'bg-gray-900 text-white border-black' : 'bg-white text-gray-500'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">이름/상호명</label>
                <input className="w-full p-3 border rounded-xl" placeholder="홍길동" value={form.name} onChange={e=>setForm({...form, name:e.target.value})}/>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">연락처</label>
                <input className="w-full p-3 border rounded-xl" placeholder="010-0000-0000" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})}/>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">메모</label>
                <textarea className="w-full p-3 border rounded-xl h-20" placeholder="특이사항 입력" value={form.memo} onChange={e=>setForm({...form, memo:e.target.value})}/>
              </div>
              <button onClick={handleSave} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg transition-all">
                + 고객 등록 완료
              </button>
            </div>
          </div>
        </div>

        {/* 오른쪽: 고객 리스트 */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-gray-50 font-bold text-gray-500 text-sm flex justify-between">
                <span>등록된 고객: {customers.length}명</span>
            </div>
            {loading ? <div className="p-10 text-center">로딩 중...</div> : customers.length === 0 ? (
                <div className="p-20 text-center text-gray-400">등록된 고객이 없습니다.</div>
            ) : (
                <ul className="divide-y divide-gray-100">
                    {customers.map(cust => (
                        <li key={cust.id} className="p-5 hover:bg-gray-50 flex justify-between items-center group">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${cust.type === '법인' ? 'bg-steel-500' : 'bg-green-500'}`}>
                                    {cust.name.substring(0,1)}
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                        {cust.name}
                                        <span className="text-xs font-normal px-2 py-0.5 bg-gray-100 text-gray-500 rounded">{cust.type}</span>
                                    </h4>
                                    <p className="text-gray-500 text-sm">{cust.phone || '연락처 없음'}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-gray-400 max-w-[150px] truncate">{cust.memo}</p>
                                <button onClick={()=>handleDelete(cust.id)} className="text-red-400 text-xs font-bold hover:underline opacity-0 group-hover:opacity-100 transition-opacity mt-1">삭제</button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
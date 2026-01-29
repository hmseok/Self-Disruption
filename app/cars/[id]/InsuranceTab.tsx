'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/app/utils/supabase'

export default function InsuranceTab({ carId }: { carId: number }) {
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 입력 폼 상태
  const [form, setForm] = useState({
    company: '삼성화재',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0], // 1년 뒤 자동설정
    total_premium: 0,
    age_limit: '만 26세 이상',
    driver_range: '누구나',
  })

  // 1. 보험 내역 불러오기
  const fetchInsurance = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('insurance_contracts')
      .select('*')
      .eq('car_id', carId)
      .order('end_date', { ascending: false }) // 최신 만기일 순

    if (error) console.error(error)
    else setContracts(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchInsurance() }, [carId])

  // 2. 보험 저장하기
  const handleSave = async () => {
    if (!form.company) return alert('보험사를 입력해주세요.')

    const { error } = await supabase.from('insurance_contracts').insert([{
      car_id: carId,
      ...form
    }])

    if (error) alert('저장 실패: ' + error.message)
    else {
      alert('✅ 보험 이력이 등록되었습니다.')
      fetchInsurance() // 목록 새로고침
    }
  }

  // 3. 삭제하기
  const handleDelete = async (id: number) => {
    if(!confirm('삭제하시겠습니까?')) return;
    await supabase.from('insurance_contracts').delete().eq('id', id)
    fetchInsurance()
  }

  const f = (n: number) => n.toLocaleString()

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">

      {/* 왼쪽: 신규 등록 폼 */}
      <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">➕ 신규 보험 등록</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500">보험사</label>
              <select className="w-full p-2 border rounded" value={form.company} onChange={e=>setForm({...form, company:e.target.value})}>
                <option>삼성화재</option><option>KB손해보험</option><option>DB손해보험</option><option>현대해상</option><option>메리츠화재</option><option>캐롯퍼마일</option><option>롯데손해보험</option><option>AXA손해보험</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500">보험료(원)</label>
              <input type="text" className="w-full p-2 border rounded text-right font-bold"
                value={f(form.total_premium)}
                onChange={e=>setForm({...form, total_premium: Number(e.target.value.replace(/,/g,''))})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500">시작일</label>
              <input type="date" className="w-full p-2 border rounded" value={form.start_date} onChange={e=>setForm({...form, start_date:e.target.value})}/>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500">만기일</label>
              <input type="date" className="w-full p-2 border rounded" value={form.end_date} onChange={e=>setForm({...form, end_date:e.target.value})}/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500">연령한정</label>
              <select className="w-full p-2 border rounded" value={form.age_limit} onChange={e=>setForm({...form, age_limit:e.target.value})}>
                <option>만 21세 이상</option><option>만 26세 이상</option><option>만 30세 이상</option><option>임직원 한정</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500">운전범위</label>
              <select className="w-full p-2 border rounded" value={form.driver_range} onChange={e=>setForm({...form, driver_range:e.target.value})}>
                <option>누구나</option><option>부부한정</option><option>1인 지정</option><option>임직원</option>
              </select>
            </div>
          </div>

          <button onClick={handleSave} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-md">
            보험 정보 저장하기
          </button>
        </div>
      </div>

      {/* 오른쪽: 등록된 보험 목록 */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">📋 가입 이력 ({contracts.length}건)</h3>
        {loading ? <p>로딩 중...</p> : contracts.length === 0 ? (
          <div className="p-10 text-center text-gray-400 border border-dashed rounded-xl">
            등록된 보험이 없습니다.
          </div>
        ) : (
          contracts.map(contract => (
            <div key={contract.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:border-indigo-300 transition-colors relative group">
              <button onClick={() => handleDelete(contract.id)} className="absolute top-4 right-4 text-gray-300 hover:text-red-500 font-bold text-xs border px-2 py-1 rounded">삭제</button>

              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-lg text-indigo-900">{contract.company}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${new Date(contract.end_date) < new Date() ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600 font-bold'}`}>
                  {new Date(contract.end_date) < new Date() ? '만료됨' : '진행중'}
                </span>
              </div>

              <div className="text-sm text-gray-600 space-y-1">
                <p>📅 기간: {contract.start_date} ~ <span className="font-bold text-black">{contract.end_date}</span></p>
                <p>💰 보험료: <span className="font-bold text-black">{f(contract.total_premium)}원</span></p>
                <p>🛡️ 조건: {contract.age_limit} / {contract.driver_range}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
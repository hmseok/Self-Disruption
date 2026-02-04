'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function JiipPage() {
  const [items, setItems] = useState<any[]>([])
  const [cars, setCars] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  // 신규 등록 데이터
  const [newItem, setNewItem] = useState({
    car_id: '', owner_name: '', owner_phone: '',
    deposit: 0, monthly_fee: 0,
    contract_period_start: '', contract_period_end: ''
  })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data: mainData } = await supabase.from('jiip_contracts').select('*, cars(number, model, brand)').order('created_at', { ascending: false })
    const { data: carData } = await supabase.from('cars').select('id, number, model').order('number', { ascending: true })
    setItems(mainData || [])
    setCars(carData || [])
    setLoading(false)
  }

  const handleSave = async () => {
    if (!newItem.car_id || !newItem.owner_name) return alert('차량과 차주명은 필수입니다.')
    const { error } = await supabase.from('jiip_contracts').insert(newItem)
    if (error) alert('등록 실패: ' + error.message)
    else { alert('지입 계약이 등록되었습니다.'); setShowModal(false); fetchData(); setNewItem({ car_id: '', owner_name: '', owner_phone: '', deposit: 0, monthly_fee: 0, contract_period_start: '', contract_period_end: '' }) }
  }

  const handleDelete = async (id: number) => {
    if(!confirm('삭제하시겠습니까?')) return
    await supabase.from('jiip_contracts').delete().eq('id', id)
    fetchData()
  }

  // 합계 계산
  const totalDeposit = items.reduce((acc, cur) => acc + (cur.deposit || 0), 0)
  const totalMonthly = items.reduce((acc, cur) => acc + (cur.monthly_fee || 0), 0)

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in-up">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900">🤝 지입/위수탁 관리</h1>
          <p className="text-gray-500 mt-2">지입 차주 계약 현황과 월 관리비 수납을 관리합니다.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg">+ 지입 계약 등록</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">총 보증금 합계</p>
          <p className="text-3xl font-black text-green-700">{totalDeposit.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">월 관리비 매출</p>
          <p className="text-3xl font-black text-blue-600">+{totalMonthly.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">운영 중인 지입차</p>
          <p className="text-3xl font-black text-gray-800">{items.length}대</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="p-4 text-xs font-bold text-gray-500">지입 차량</th>
              <th className="p-4 text-xs font-bold text-gray-500">차주 정보</th>
              <th className="p-4 text-xs font-bold text-gray-500">보증금</th>
              <th className="p-4 text-xs font-bold text-gray-500">월 관리비</th>
              <th className="p-4 text-xs font-bold text-gray-500 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="p-10 text-center">로딩 중...</td></tr> :
             items.map((item) => (
              <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="p-4">
                  <div className="font-bold text-gray-900">{item.cars?.number}</div>
                  <div className="text-xs text-gray-500">{item.cars?.brand} {item.cars?.model}</div>
                </td>
                <td className="p-4">
                  <div className="font-bold">{item.owner_name}</div>
                  <div className="text-xs text-gray-400">{item.owner_phone}</div>
                </td>
                <td className="p-4 text-gray-500">{item.deposit?.toLocaleString()}원</td>
                <td className="p-4 font-bold text-blue-600">+{item.monthly_fee?.toLocaleString()}원</td>
                <td className="p-4 text-right">
                  <button onClick={() => handleDelete(item.id)} className="text-gray-400 hover:text-red-500 text-sm underline">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg p-8 rounded-3xl shadow-2xl animate-fade-in-up">
            <h3 className="text-xl font-bold text-gray-900 mb-6">🤝 지입 계약 등록</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">지입 차량 선택</label>
                <select className="w-full border p-3 rounded-xl font-bold" value={newItem.car_id} onChange={e => setNewItem({...newItem, car_id: e.target.value})}>
                  <option value="">차량을 선택하세요</option>
                  {cars.map(c => <option key={c.id} value={c.id}>{c.number} ({c.model})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input className="w-full border p-3 rounded-xl" placeholder="차주 성명" value={newItem.owner_name} onChange={e => setNewItem({...newItem, owner_name: e.target.value})} />
                <input className="w-full border p-3 rounded-xl" placeholder="연락처" value={newItem.owner_phone} onChange={e => setNewItem({...newItem, owner_phone: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-bold text-gray-500 mb-1">보증금</label>
                   <input type="number" className="w-full border p-3 rounded-xl" value={newItem.deposit} onChange={e => setNewItem({...newItem, deposit: Number(e.target.value)})} />
                </div>
                <div>
                   <label className="block text-xs font-bold text-gray-500 mb-1">월 관리비</label>
                   <input type="number" className="w-full border p-3 rounded-xl" value={newItem.monthly_fee} onChange={e => setNewItem({...newItem, monthly_fee: Number(e.target.value)})} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={handleSave} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700">등록 완료</button>
              <button onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-200">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
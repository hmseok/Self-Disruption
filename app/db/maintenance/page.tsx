'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
export default function MaintenanceDbPage() {

// ✅ [수정 2] supabase 클라이언트 생성 (이 줄이 없어서 에러가 난 겁니다!)
const [list, setList] = useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newItem, setNewItem] = useState({
    item_name: '', unit_price: 0, labor_cost: 0, cycle_km: 10000, cycle_month: 12
  })

  useEffect(() => { fetchList() }, [])

  const fetchList = async () => {
    const { data } = await supabase.from('maintenance_db').select('*').order('item_name')
    setList(data || [])
  }

  const handleSave = async () => {
    if (!newItem.item_name) return alert('항목명을 입력하세요.')
    await supabase.from('maintenance_db').insert([newItem])
    setIsModalOpen(false)
    setNewItem({ item_name: '', unit_price: 0, labor_cost: 0, cycle_km: 10000, cycle_month: 12 })
    fetchList()
  }

  const handleDelete = async (id: number) => {
    if (confirm('삭제하시겠습니까?')) {
        await supabase.from('maintenance_db').delete().eq('id', id)
        fetchList()
    }
  }

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in">
      <div className="flex justify-between items-end mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-black">🔧 정비/소모품 DB</h1>
          <p className="text-gray-500 mt-2">표준 정비 단가와 교체 주기를 관리합니다. 유지비 산출의 기준이 됩니다.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 shadow-lg">+ 소모품 등록</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 font-bold border-b">
            <tr>
              <th className="p-4">항목명</th>
              <th className="p-4 text-right">부품단가</th>
              <th className="p-4 text-right">공임비</th>
              <th className="p-4 text-right">합계금액</th>
              <th className="p-4 text-center">교체주기</th>
              <th className="p-4 text-center">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="p-4 font-bold text-lg">{item.item_name}</td>
                <td className="p-4 text-right">{f(item.unit_price)}원</td>
                <td className="p-4 text-right">{f(item.labor_cost)}원</td>
                <td className="p-4 text-right font-black text-blue-600">{f(item.unit_price + item.labor_cost)}원</td>
                <td className="p-4 text-center">
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs font-bold text-gray-600">
                        {f(item.cycle_km)}km / {item.cycle_month}개월
                    </span>
                </td>
                <td className="p-4 text-center"><button onClick={() => handleDelete(item.id)} className="text-red-400 font-bold text-xs hover:underline">삭제</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsModalOpen(false)}>
            <div className="bg-white p-8 rounded-2xl w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-black mb-4">🔧 소모품 등록</h2>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">항목명</label>
                    <input className="w-full p-3 border rounded-xl font-bold" placeholder="예: 엔진오일 세트 (합성유)" value={newItem.item_name} onChange={e => setNewItem({...newItem, item_name: e.target.value})} autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">부품 단가</label>
                        <input className="w-full p-3 border rounded-xl text-right font-bold" type="number" value={newItem.unit_price} onChange={e => setNewItem({...newItem, unit_price: Number(e.target.value)})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">공임비</label>
                        <input className="w-full p-3 border rounded-xl text-right font-bold" type="number" value={newItem.labor_cost} onChange={e => setNewItem({...newItem, labor_cost: Number(e.target.value)})} />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">교체주기 (km)</label>
                        <input className="w-full p-2 border rounded text-center font-bold" type="number" value={newItem.cycle_km} onChange={e => setNewItem({...newItem, cycle_km: Number(e.target.value)})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">교체주기 (개월)</label>
                        <input className="w-full p-2 border rounded text-center font-bold" type="number" value={newItem.cycle_month} onChange={e => setNewItem({...newItem, cycle_month: Number(e.target.value)})} />
                    </div>
                </div>
                <button onClick={handleSave} className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-800 mt-2">저장하기</button>
            </div>
        </div>
      )}
    </div>
  )
}
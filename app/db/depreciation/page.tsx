'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
export default function DepreciationPage() {
  const [list, setList] = useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)

  // 1~5년 잔가율 입력 상태
  const [newItem, setNewItem] = useState({
    category: '',
    rate_1yr: 75,
    rate_2yr: 65,
    rate_3yr: 55,
    rate_4yr: 45,
    rate_5yr: 35
  })

  useEffect(() => { fetchList() }, [])

  const fetchList = async () => {
    const { data } = await supabase.from('depreciation_db').select('*').order('category')
    setList(data || [])
  }

  const handleSave = async () => {
    if (!newItem.category) return alert('분류명을 입력하세요.')

    const { error } = await supabase.from('depreciation_db').insert([newItem])

    if (error) alert('저장 실패: ' + error.message)
    else {
        setIsModalOpen(false)
        fetchList()
    }
  }

  const handleDelete = async (id: number) => {
    if (confirm('삭제하시겠습니까?')) {
        await supabase.from('depreciation_db').delete().eq('id', id)
        fetchList()
    }
  }

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in">
      <div className="flex justify-between items-end mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-black">📉 잔가율(감가) 기준표</h1>
          <p className="text-gray-500 mt-2">차종별 연식에 따른 잔존가치율(%)을 정의합니다. 렌트료 산출의 핵심 기준입니다.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 shadow-lg">+ 신규 분류 등록</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-center text-sm">
          <thead className="bg-gray-50 text-gray-500 font-bold border-b">
            <tr>
              <th className="p-4 text-left">차종 분류</th>
              <th className="p-4 text-blue-600">1년후 잔가</th>
              <th className="p-4 text-blue-600">2년후 잔가</th>
              <th className="p-4 text-blue-600">3년후 잔가</th>
              <th className="p-4">4년후 잔가</th>
              <th className="p-4">5년후 잔가</th>
              <th className="p-4">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="p-4 text-left font-bold text-lg">{item.category}</td>
                <td className="p-4 font-bold bg-blue-50/30">{item.rate_1yr}%</td>
                <td className="p-4 font-bold bg-blue-50/30">{item.rate_2yr}%</td>
                <td className="p-4 font-bold bg-blue-50/30 text-blue-600">{item.rate_3yr}%</td>
                <td className="p-4 text-gray-500">{item.rate_4yr}%</td>
                <td className="p-4 text-gray-500">{item.rate_5yr}%</td>
                <td className="p-4"><button onClick={() => handleDelete(item.id)} className="text-red-400 font-bold text-xs hover:underline">삭제</button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="p-10 text-gray-400">등록된 잔가 기준이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsModalOpen(false)}>
            <div className="bg-white p-8 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-black mb-6">📝 감가 기준 등록</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">분류명 (예: 국산 SUV)</label>
                        <input className="w-full p-3 border rounded-xl font-bold" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} autoFocus />
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-center">
                        {[1,2,3,4,5].map(y => (
                            <div key={y}>
                                <label className="block text-xs font-bold text-gray-400 mb-1">{y}년</label>
                                <input type="number" className="w-full p-2 border rounded-lg text-center font-bold"
                                    value={newItem[`rate_${y}yr` as keyof typeof newItem] as number}
                                    onChange={e => setNewItem({...newItem, [`rate_${y}yr`]: Number(e.target.value)})} />
                            </div>
                        ))}
                    </div>
                    <button onClick={handleSave} className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-800 mt-2">저장하기</button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}
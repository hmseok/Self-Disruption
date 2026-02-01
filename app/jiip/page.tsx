'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import { useRouter } from 'next/navigation'

export default function JiipListPage() {
  const router = useRouter()
  const [list, setList] = useState<any[]>([])

  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [allCars, setAllCars] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => { fetchList() }, [])

  const fetchList = async () => {
    const { data } = await supabase.from('cars').select(`id, number, model, brand, jiip_contracts (owner_name, monthly_management_fee)`).order('created_at', { ascending: false })
    const formatted = data?.map((car: any) => ({ ...car, jiip: car.jiip_contracts?.[0] || null }))
    setList(formatted || [])
  }

  const openCarSelector = async () => {
    const { data } = await supabase.from('cars').select('id, number, model, brand').order('created_at', { ascending: false })
    setAllCars(data || [])
    setIsModalOpen(true)
  }

  const filteredCars = allCars.filter(car => car.number.includes(searchTerm))
  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black">🤝 지입(위수탁) 관리</h1>
        <button onClick={openCarSelector} className="bg-orange-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-orange-700 shadow-lg">
            + 신규 지입 계약
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 font-bold border-b">
             <tr><th className="p-4">차량번호</th><th className="p-4">모델</th><th className="p-4">지입 차주</th><th className="p-4 text-right">수익(관리비)</th><th className="p-4 text-center">상태</th></tr>
          </thead>
          <tbody className="divide-y">
            {list.map((item) => (
              <tr key={item.id} onClick={() => router.push(`/jiip/${item.id}`)} className="hover:bg-orange-50 cursor-pointer transition-colors">
                <td className="p-4 font-bold">{item.number}</td>
                <td className="p-4 text-gray-500">{item.brand} {item.model}</td>
                <td className="p-4">{item.jiip ? item.jiip.owner_name : '-'}</td>
                <td className="p-4 text-right font-bold text-blue-600">{item.jiip ? `+${f(item.jiip.monthly_management_fee)}원` : '-'}</td>
                <td className="p-4 text-center">{item.jiip ? '계약중' : <span className="text-gray-400">미등록</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 🚙 차량 선택 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white p-6 rounded-2xl w-full max-w-lg h-[600px] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-orange-900">지입 계약 차량 선택</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-2xl font-bold text-gray-400 hover:text-black">×</button>
            </div>
            <input autoFocus className="w-full p-4 border rounded-xl bg-gray-50 font-bold mb-4 focus:border-orange-500 outline-none" placeholder="차량번호 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <div className="flex-1 overflow-y-auto space-y-2 border-t pt-2">
              {filteredCars.map(car => (
                <div key={car.id} onClick={() => router.push(`/jiip/${car.id}`)} className="p-4 border rounded-xl hover:bg-orange-50 cursor-pointer flex justify-between items-center group">
                  <div><div className="font-bold text-lg group-hover:text-orange-700">{car.number}</div><div className="text-sm text-gray-500">{car.brand} {car.model}</div></div>
                  <div className="text-orange-600 font-bold text-sm">선택 →</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
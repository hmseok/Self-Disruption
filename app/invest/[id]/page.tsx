'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase' // 점 2개 확인

export default function InvestDetailPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()

  const [car, setCar] = useState<any>(null)
  const [investors, setInvestors] = useState<any[]>([])

  // 신규 투자자 추가용 상태
  const [newInv, setNewInv] = useState({ name: '', phone: '', amount: 0, rate: 10 })

  useEffect(() => {
    if (!carId) return
    fetchData()
  }, [carId])

  const fetchData = async () => {
    // 차량 정보
    const { data: carData } = await supabase.from('cars').select('*').eq('id', carId).single()
    setCar(carData)
    // 투자자 목록
    const { data: invData } = await supabase.from('investments').select('*').eq('car_id', carId).order('created_at')
    setInvestors(invData || [])
  }

  // 투자자 추가
  const handleAddInvestor = async () => {
    if (!newInv.name || newInv.amount <= 0) return alert('투자자명과 금액을 입력하세요.')
    const { error } = await supabase.from('investments').insert([{
        car_id: carId,
        investor_name: newInv.name,
        phone: newInv.phone,
        invest_amount: newInv.amount,
        dividend_rate: newInv.rate
    }])
    if (error) alert('추가 실패: ' + error.message)
    else {
        alert('투자자가 추가되었습니다.')
        setNewInv({ name: '', phone: '', amount: 0, rate: 10 })
        fetchData() // 목록 새로고침
    }
  }

  // 투자자 삭제
  const handleDelete = async (invId: number) => {
    if (!confirm('이 투자자를 삭제하시겠습니까?')) return
    await supabase.from('investments').delete().eq('id', invId)
    fetchData()
  }

  const f = (n: number) => n?.toLocaleString() || '0'
  const totalInvested = investors.reduce((sum, inv) => sum + inv.invest_amount, 0)

  if (!car) return <div className="p-10">로딩 중...</div>

  return (
    <div className="max-w-5xl mx-auto py-10 px-6 animate-fade-in">
        <div className="flex justify-between items-center mb-8 pb-4 border-b">
            <div>
                <span className="text-purple-600 text-sm font-bold">투자/펀딩 관리</span>
                <h1 className="text-3xl font-black">{car.number} <span className="text-lg text-gray-500 font-normal">{car.model}</span></h1>
            </div>
            <button onClick={() => router.push(`/invest`)} className="bg-gray-100 px-4 py-2 rounded-lg font-bold">← 목록으로</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* 왼쪽: 현황 요약 */}
            <div className="lg:col-span-1 space-y-4">
                <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100">
                    <h3 className="font-bold text-purple-900 mb-4">💰 펀딩 현황</h3>
                    <div className="flex justify-between mb-2"><span className="text-gray-500">차량가액</span><span className="font-bold">{f(car.purchase_price)}원</span></div>
                    <div className="flex justify-between mb-2"><span className="text-purple-600 font-bold">현재 투자금</span><span className="font-bold text-xl text-purple-700">{f(totalInvested)}원</span></div>
                    <div className="w-full bg-white rounded-full h-3 mt-4 overflow-hidden border">
                        <div className="bg-purple-600 h-full" style={{ width: `${Math.min(100, (totalInvested/car.purchase_price)*100)}%` }}></div>
                    </div>
                    <p className="text-center text-xs text-gray-400 mt-2">
                        목표 달성률 {Math.round((totalInvested/car.purchase_price)*100)}%
                    </p>
                </div>

                <div className="bg-white p-6 rounded-2xl border shadow-sm">
                    <h3 className="font-bold mb-4">➕ 투자자 추가</h3>
                    <div className="space-y-3">
                        <input className="w-full p-2 border rounded bg-gray-50" placeholder="투자자 성명" value={newInv.name} onChange={e=>setNewInv({...newInv, name: e.target.value})} />
                        <input className="w-full p-2 border rounded bg-gray-50" placeholder="연락처" value={newInv.phone} onChange={e=>setNewInv({...newInv, phone: e.target.value})} />
                        <input className="w-full p-2 border rounded bg-gray-50 text-right" placeholder="투자금액" type="number" value={newInv.amount || ''} onChange={e=>setNewInv({...newInv, amount: Number(e.target.value)})} />
                        <div className="flex items-center gap-2">
                             <input className="w-20 p-2 border rounded bg-gray-50 text-right" placeholder="수익률" type="number" value={newInv.rate} onChange={e=>setNewInv({...newInv, rate: Number(e.target.value)})} />
                             <span className="text-sm text-gray-500">% 배당</span>
                        </div>
                        <button onClick={handleAddInvestor} className="w-full bg-black text-white py-3 rounded-lg font-bold hover:bg-gray-800">추가하기</button>
                    </div>
                </div>
            </div>

            {/* 오른쪽: 투자자 리스트 */}
            <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 font-bold text-gray-500 border-b">
                            <tr>
                                <th className="p-4">투자자명</th>
                                <th className="p-4">연락처</th>
                                <th className="p-4 text-right">투자금</th>
                                <th className="p-4 text-right">약정수익률</th>
                                <th className="p-4 text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {investors.map(inv => (
                                <tr key={inv.id}>
                                    <td className="p-4 font-bold">{inv.investor_name}</td>
                                    <td className="p-4 text-gray-500">{inv.phone}</td>
                                    <td className="p-4 text-right">{f(inv.invest_amount)}원</td>
                                    <td className="p-4 text-right text-blue-600 font-bold">{inv.dividend_rate}%</td>
                                    <td className="p-4 text-center">
                                        <button onClick={()=>handleDelete(inv.id)} className="text-red-400 hover:text-red-600 font-bold text-xs">삭제</button>
                                    </td>
                                </tr>
                            ))}
                            {investors.length === 0 && (
                                <tr><td colSpan={5} className="p-10 text-center text-gray-400">등록된 투자자가 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    </div>
  )
}
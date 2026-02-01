'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase' // 경로 확인

export default function JiipPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [carInfo, setCarInfo] = useState<any>(null)

  // 데이터 상태
  const [jiip, setJiip] = useState<any>(null)
  const [investors, setInvestors] = useState<any[]>([])

  // 데이터 불러오기
  const fetchData = async () => {
    if (!carId) return

    // 1. 헤더용 차량 정보
    const { data: car } = await supabase.from('cars').select('number, model').eq('id', carId).single()
    setCarInfo(car)

    // 2. 지입 정보
    const { data: jiipData } = await supabase.from('jiip_contracts').select('*').eq('car_id', carId).single()
    setJiip(jiipData || null)

    // 3. 투자자 목록
    const { data: investData } = await supabase.from('investments').select('*').eq('car_id', carId).order('invest_date', { ascending: false })
    setInvestors(investData || [])

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [carId])

  // 지입 폼 상태
  const [jiipForm, setJiipForm] = useState({
    owner_name: '', owner_phone: '', monthly_management_fee: 0, profit_share_ratio: 90, bank_name: '', account_number: ''
  })

  // 기존 지입 정보가 있으면 폼에 채우기
  useEffect(() => { if (jiip) setJiipForm(jiip) }, [jiip])

  // 지입 저장
  const handleSaveJiip = async () => {
    if (!jiipForm.owner_name) return alert('차주 이름은 필수입니다.')
    const payload = { car_id: carId, ...jiipForm }

    let error
    if (jiip?.id) { // 수정
        const res = await supabase.from('jiip_contracts').update(payload).eq('id', jiip.id)
        error = res.error
    } else { // 신규
        const res = await supabase.from('jiip_contracts').insert([payload])
        error = res.error
    }

    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 지입 계약이 저장되었습니다.'); fetchData(); }
  }

  // 투자자 등록
  const [investForm, setInvestForm] = useState({
    investor_name: '', invest_amount: 0, monthly_payout: 0, invest_date: new Date().toISOString().split('T')[0]
  })

  const handleAddInvestor = async () => {
    if (!investForm.investor_name) return alert('투자자 이름은 필수입니다.')
    const { error } = await supabase.from('investments').insert([{ car_id: carId, ...investForm }])
    if (error) alert('실패: ' + error.message)
    else {
        alert('✅ 투자자가 등록되었습니다.');
        setInvestForm({ investor_name: '', invest_amount: 0, monthly_payout: 0, invest_date: new Date().toISOString().split('T')[0] });
        fetchData();
    }
  }

  const handleDeleteInvestor = async (pid: number) => {
    if(confirm('삭제하시겠습니까?')) {
        await supabase.from('investments').delete().eq('id', pid)
        fetchData()
    }
  }

  const f = (n: number) => n?.toLocaleString() || '0'
  const p = (v: string) => Number(v.replace(/,/g, ''))

  if (loading) return <div className="p-10 text-center">로딩 중...</div>

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 animate-fade-in">
       {/* 헤더 */}
       <div className="flex justify-between items-center mb-8 pb-4 border-b">
        <div>
          <span className="text-orange-600 text-sm font-bold">🤝 지입/투자 정산</span>
          <h1 className="text-3xl font-black">{carInfo?.number} <span className="text-lg text-gray-500 font-normal">{carInfo?.model}</span></h1>
        </div>
        <button onClick={() => router.push(`/cars/${carId}`)} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-200">
          ← 차량 상세로 복귀
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

        {/* 1. 지입 차주 관리 (왼쪽) */}
        <div className="bg-orange-50/50 p-8 rounded-3xl border border-orange-100 h-fit">
            <h3 className="text-xl font-bold text-orange-900 mb-6 border-b border-orange-200 pb-2">🚙 지입 차주 관리</h3>
            <div className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">차주 이름 (실소유주)</label>
                    <input className="w-full p-3 border rounded-xl" value={jiipForm.owner_name} onChange={e=>setJiipForm({...jiipForm, owner_name:e.target.value})} placeholder="홍길동"/>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">연락처</label>
                    <input className="w-full p-3 border rounded-xl" value={jiipForm.owner_phone} onChange={e=>setJiipForm({...jiipForm, owner_phone:e.target.value})} placeholder="010-0000-0000"/>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-blue-600 mb-1 block">월 관리비(회사수익)</label>
                        <input className="w-full p-3 border-2 border-blue-100 rounded-xl text-right font-bold text-lg" value={f(jiipForm.monthly_management_fee)} onChange={e=>setJiipForm({...jiipForm, monthly_management_fee:p(e.target.value)})}/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">차주 배분율(%)</label>
                        <input className="w-full p-3 border rounded-xl text-center" value={jiipForm.profit_share_ratio} onChange={e=>setJiipForm({...jiipForm, profit_share_ratio:Number(e.target.value)})}/>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">정산 은행</label>
                        <input className="w-full p-3 border rounded-xl" value={jiipForm.bank_name} onChange={e=>setJiipForm({...jiipForm, bank_name:e.target.value})}/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">계좌번호</label>
                        <input className="w-full p-3 border rounded-xl" value={jiipForm.account_number} onChange={e=>setJiipForm({...jiipForm, account_number:e.target.value})}/>
                    </div>
                </div>
                <button onClick={handleSaveJiip} className="w-full py-4 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 shadow-lg transition-colors mt-2">
                    {jiip ? '지입 계약 수정' : '지입 계약 등록'}
                </button>
            </div>
        </div>

        {/* 2. 투자자 관리 (오른쪽) */}
        <div className="space-y-8">
            <div className="bg-gray-50 p-8 rounded-3xl border border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">💰 투자자 펀딩 등록</h3>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <input className="p-3 border rounded-xl text-sm" placeholder="투자자명" value={investForm.investor_name} onChange={e=>setInvestForm({...investForm, investor_name:e.target.value})}/>
                        <input className="p-3 border rounded-xl text-sm text-right" placeholder="투자금액" value={f(investForm.invest_amount)} onChange={e=>setInvestForm({...investForm, invest_amount:p(e.target.value)})}/>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <input className="p-3 border rounded-xl text-sm text-right" placeholder="월 배당금(이자)" value={f(investForm.monthly_payout)} onChange={e=>setInvestForm({...investForm, monthly_payout:p(e.target.value)})}/>
                        <input type="date" className="p-3 border rounded-xl text-sm" value={investForm.invest_date} onChange={e=>setInvestForm({...investForm, invest_date:e.target.value})}/>
                    </div>
                    <button onClick={handleAddInvestor} className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black text-sm shadow-md">
                        + 투자자 추가
                    </button>
                </div>
            </div>

            {/* 투자자 리스트 */}
            <div className="space-y-4">
                <h4 className="font-bold text-gray-500 ml-1">등록된 투자자 ({investors.length}명)</h4>
                {investors.map(inv => (
                    <div key={inv.id} className="bg-white p-5 rounded-2xl border shadow-sm flex justify-between items-center hover:shadow-md transition-shadow">
                        <div>
                            <p className="font-bold text-lg text-gray-900 mb-1">{inv.investor_name}</p>
                            <p className="text-xs text-gray-400">투자일: {inv.invest_date}</p>
                            <p className="text-sm text-gray-600 mt-1">원금: <b>{f(inv.invest_amount)}원</b></p>
                        </div>
                        <div className="text-right">
                            <p className="text-blue-600 font-black text-xl mb-1">{f(inv.monthly_payout)}원</p>
                            <p className="text-xs text-gray-400 mb-2">/ 월 배당</p>
                            <button onClick={()=>handleDeleteInvestor(inv.id)} className="text-xs text-red-400 font-bold hover:underline">삭제</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  )
}
'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
export default function JiipTab({ carId }: { carId: string }) {
  const [loading, setLoading] = useState(false)

  // 1. 지입(차주) 계약 데이터
  const [jiip, setJiip] = useState<any>(null) // 지입은 차 1대당 1명이라 배열 아님

  // 2. 투자자 목록 데이터
  const [investors, setInvestors] = useState<any[]>([])

  // --- 데이터 불러오기 ---
  const fetchData = async () => {
    setLoading(true)

    // 지입 정보 가져오기
    const { data: jiipData } = await supabase
      .from('jiip_contracts')
      .select('*')
      .eq('car_id', carId)
      .single() // 한 명만 가져옴

    if (jiipData) setJiip(jiipData)
    else setJiip(null) // 없으면 null

    // 투자자 목록 가져오기
    const { data: investData } = await supabase
      .from('investments')
      .select('*')
      .eq('car_id', carId)
      .order('invest_date', { ascending: false })

    if (investData) setInvestors(investData)

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [carId])

  // --- 지입 계약 저장/수정 ---
  const [jiipForm, setJiipForm] = useState({
    owner_name: '', owner_phone: '',
    monthly_management_fee: 0, // 월 관리비(회사수익)
    profit_share_ratio: 90, // 차주 수익률
    bank_name: '', account_number: ''
  })

  // 기존 데이터가 있으면 폼에 채워넣기
  useEffect(() => {
    if (jiip) setJiipForm(jiip)
  }, [jiip])

  const handleSaveJiip = async () => {
    if (!jiipForm.owner_name) return alert('차주 이름은 필수입니다.')

    const payload = { car_id: carId, ...jiipForm }

    let error
    if (jiip?.id) {
        // 수정 (Update)
        const res = await supabase.from('jiip_contracts').update(payload).eq('id', jiip.id)
        error = res.error
    } else {
        // 신규 등록 (Insert)
        const res = await supabase.from('jiip_contracts').insert([payload])
        error = res.error
    }

    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 지입 계약이 저장되었습니다.'); fetchData(); }
  }

  // --- 투자자 등록 ---
  const [investForm, setInvestForm] = useState({
    investor_name: '', invest_amount: 0, monthly_payout: 0, invest_date: new Date().toISOString().split('T')[0]
  })

  const handleAddInvestor = async () => {
    if (!investForm.investor_name) return alert('투자자 이름은 필수입니다.')

    const { error } = await supabase.from('investments').insert([{
        car_id: carId, ...investForm
    }])

    if (error) alert('실패: ' + error.message)
    else {
        alert('✅ 투자자가 등록되었습니다.');
        setInvestForm({ investor_name: '', invest_amount: 0, monthly_payout: 0, invest_date: new Date().toISOString().split('T')[0] }); // 초기화
        fetchData();
    }
  }

  const handleDeleteInvestor = async (id: number) => {
    if(confirm('삭제하시겠습니까?')) {
        await supabase.from('investments').delete().eq('id', id)
        fetchData()
    }
  }

  const f = (n: number) => n?.toLocaleString() || '0'
  const p = (v: string) => Number(v.replace(/,/g, ''))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">

      {/* 1. 지입 차주 관리 (왼쪽) */}
      <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
        <h3 className="text-lg font-bold text-orange-900 mb-4 border-b border-orange-200 pb-2">🤝 지입(위수탁) 관리</h3>
        <div className="space-y-4">
            <div>
                <label className="text-xs font-bold text-gray-500">차주 이름 (실소유주)</label>
                <input className="w-full p-2 border rounded" value={jiipForm.owner_name} onChange={e=>setJiipForm({...jiipForm, owner_name:e.target.value})} placeholder="홍길동"/>
            </div>
            <div>
                <label className="text-xs font-bold text-gray-500">연락처</label>
                <input className="w-full p-2 border rounded" value={jiipForm.owner_phone} onChange={e=>setJiipForm({...jiipForm, owner_phone:e.target.value})} placeholder="010-0000-0000"/>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-blue-600">월 관리비(회사수익)</label>
                    <input className="w-full p-2 border-2 border-blue-100 rounded text-right font-bold" value={f(jiipForm.monthly_management_fee)} onChange={e=>setJiipForm({...jiipForm, monthly_management_fee:p(e.target.value)})}/>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500">차주 배분율(%)</label>
                    <input className="w-full p-2 border rounded text-center" value={jiipForm.profit_share_ratio} onChange={e=>setJiipForm({...jiipForm, profit_share_ratio:Number(e.target.value)})}/>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-gray-500">정산 은행</label>
                    <input className="w-full p-2 border rounded" value={jiipForm.bank_name} onChange={e=>setJiipForm({...jiipForm, bank_name:e.target.value})}/>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500">계좌번호</label>
                    <input className="w-full p-2 border rounded" value={jiipForm.account_number} onChange={e=>setJiipForm({...jiipForm, account_number:e.target.value})}/>
                </div>
            </div>
            <button onClick={handleSaveJiip} className="w-full py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 shadow-md transition-colors">
                {jiip ? '지입 계약 수정' : '지입 계약 등록'}
            </button>
        </div>
      </div>

      {/* 2. 투자자 관리 (오른쪽) */}
      <div className="space-y-6">
        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">💰 투자자 등록 (펀딩)</h3>
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <input className="p-2 border rounded text-sm" placeholder="투자자명" value={investForm.investor_name} onChange={e=>setInvestForm({...investForm, investor_name:e.target.value})}/>
                    <input className="p-2 border rounded text-sm text-right" placeholder="투자금액" value={f(investForm.invest_amount)} onChange={e=>setInvestForm({...investForm, invest_amount:p(e.target.value)})}/>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <input className="p-2 border rounded text-sm text-right" placeholder="월 배당금(이자)" value={f(investForm.monthly_payout)} onChange={e=>setInvestForm({...investForm, monthly_payout:p(e.target.value)})}/>
                    <input type="date" className="p-2 border rounded text-sm" value={investForm.invest_date} onChange={e=>setInvestForm({...investForm, invest_date:e.target.value})}/>
                </div>
                <button onClick={handleAddInvestor} className="w-full py-2 bg-steel-600 text-white font-bold rounded-lg hover:bg-steel-700 text-sm">
                    + 투자자 추가
                </button>
            </div>
        </div>

        {/* 투자자 리스트 */}
        <div className="space-y-3">
            <h4 className="font-bold text-gray-500 text-sm">등록된 투자자 ({investors.length}명)</h4>
            {investors.map(inv => (
                <div key={inv.id} className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center">
                    <div>
                        <p className="font-bold text-gray-900">{inv.investor_name} <span className="text-xs text-gray-400 font-normal">({inv.invest_date})</span></p>
                        <p className="text-xs text-gray-500">투자원금: {f(inv.invest_amount)}원</p>
                    </div>
                    <div className="text-right">
                        <p className="text-blue-600 font-bold text-sm">매월 {f(inv.monthly_payout)}원</p>
                        <button onClick={()=>handleDeleteInvestor(inv.id)} className="text-xs text-red-400 underline mt-1">삭제</button>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  )
}
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase'

// 유틸리티
const f = (n: any) => Number(n || 0).toLocaleString()
const cleanNumber = (n: any) => Number(String(n).replace(/[^0-9]/g, ''))

export default function InsuranceDetailPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [carInfo, setCarInfo] = useState<any>(null)

  // 보험 상태
  const [ins, setIns] = useState<any>({
    company: '전국렌터카공제조합',
    product_name: '자동차공제(영업용)',
    start_date: '',
    end_date: '',
    contractor: '',
    premium: 0,
    initial_premium: 0,
    car_value: 0,
    accessory_value: 0,
    coverage_bi1: '자배법 시행령 한도',
    coverage_bi2: '무한',
    coverage_pd: '2억원',
    coverage_self_injury: '1.5억원',
    coverage_uninsured: '2억원',
    coverage_own_damage: '가입안함',
    coverage_emergency: '기본(40km)',
    age_limit: '만 26세 이상',
    driver_range: '임직원 및 지정 1인',
    application_form_url: '',
    certificate_url: ''
  })

  useEffect(() => {
    if (!carId) return
    const fetchData = async () => {
        const { data: car } = await supabase.from('cars').select('*').eq('id', carId).single()
        setCarInfo(car)

        const { data: insurance } = await supabase
            .from('insurance_contracts')
            .select('*')
            .eq('car_id', carId)
            .order('end_date', { ascending: false })
            .limit(1)
            .single()

        if (insurance) setIns(insurance)
        else if (car) setIns(prev => ({ ...prev, car_value: car.purchase_price }))
        setLoading(false)
    }
    fetchData()
  }, [carId])

  const handleChange = (field: string, value: any) => {
    setIns(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    const payload = {
        ...ins,
        car_id: carId,
        premium: cleanNumber(ins.premium),
        initial_premium: cleanNumber(ins.initial_premium),
        car_value: cleanNumber(ins.car_value),
        accessory_value: cleanNumber(ins.accessory_value)
    }
    const query = ins.id
        ? supabase.from('insurance_contracts').update(payload).eq('id', ins.id)
        : supabase.from('insurance_contracts').insert([payload])

    const { error } = await query
    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 저장되었습니다!'); window.location.reload(); }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'application' | 'certificate') => {
    if (!e.target.files?.length) return
    const file = e.target.files[0]
    const fileExt = file.name.split('.').pop()
    const fileName = `insurance/${carId}_${type}_${Date.now()}.${fileExt}`

    const { error } = await supabase.storage.from('car_docs').upload(fileName, file)
    if (error) return alert('업로드 실패: ' + error.message)

    const { data } = supabase.storage.from('car_docs').getPublicUrl(fileName)
    const fieldName = type === 'application' ? 'application_form_url' : 'certificate_url'

    handleChange(fieldName, data.publicUrl)
    if (ins.id) await supabase.from('insurance_contracts').update({ [fieldName]: data.publicUrl }).eq('id', ins.id)
    alert('업로드 완료')
  }

  if (loading) return <div className="p-20 text-center font-bold">데이터 로딩 중...</div>

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-3xl font-black">{carInfo?.number}</h1>
            <p className="text-gray-500 font-medium">{carInfo?.brand} {carInfo?.model}</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => router.push('/insurance')} className="bg-white border px-4 py-2 rounded-lg font-bold">목록으로</button>
            <button onClick={handleSave} className="bg-blue-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-black">저장하기</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 좌측 폼 */}
        <div className="lg:col-span-8 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-2xl font-black text-blue-900 border-b-2 border-blue-900 pb-4 mb-6">자동차공제 청약서</h2>

            <table className="w-full text-sm border-collapse border border-gray-300 mb-6">
                <tbody>
                    <tr>
                        <td className="bg-blue-50 font-bold p-2 border border-gray-300 w-24 text-blue-800">상품명</td>
                        <td className="p-2 border border-gray-300"><input className="w-full font-bold bg-transparent outline-none" value={ins.product_name || ''} onChange={e=>handleChange('product_name', e.target.value)}/></td>
                        <td className="bg-blue-50 font-bold p-2 border border-gray-300 w-24 text-blue-800">기간</td>
                        <td className="p-2 border border-gray-300 flex gap-2"><input type="date" className="bg-transparent" value={ins.start_date || ''} onChange={e=>handleChange('start_date', e.target.value)}/> ~ <input type="date" className="bg-transparent" value={ins.end_date || ''} onChange={e=>handleChange('end_date', e.target.value)}/></td>
                    </tr>
                    <tr>
                        <td className="bg-blue-50 font-bold p-2 border border-gray-300 text-blue-800">계약자</td>
                        <td className="p-2 border border-gray-300" colSpan={3}><input className="w-full font-bold bg-transparent outline-none" value={ins.contractor || ''} onChange={e=>handleChange('contractor', e.target.value)}/></td>
                    </tr>
                    <tr>
                        <td className="bg-blue-100 font-bold p-2 border border-gray-300 text-blue-900">총 분담금</td>
                        <td className="p-2 border border-gray-300 text-right"><input className="text-right w-full font-black text-lg bg-transparent outline-none text-blue-900" value={f(ins.premium)} onChange={e=>handleChange('premium', e.target.value)}/></td>
                        <td className="bg-blue-50 font-bold p-2 border border-gray-300 text-blue-800">초회분담금</td>
                        <td className="p-2 border border-gray-300 text-right"><input className="text-right w-full font-bold bg-transparent outline-none" value={f(ins.initial_premium)} onChange={e=>handleChange('initial_premium', e.target.value)}/></td>
                    </tr>
                </tbody>
            </table>

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <h3 className="font-bold bg-gray-100 p-2 text-sm mb-2 border-l-4 border-black">⬛ 차량사항</h3>
                    <table className="w-full text-xs border border-gray-300">
                        <tbody>
                            <tr><td className="bg-gray-50 p-2 border">차명</td><td className="p-2 border font-bold">{carInfo?.model}</td></tr>
                            <tr><td className="bg-gray-50 p-2 border">차량가액</td><td className="p-2 border text-right"><input className="text-right w-20 outline-none font-bold" value={f(ins.car_value)} onChange={e=>handleChange('car_value', e.target.value)}/>원</td></tr>
                            <tr><td className="bg-gray-50 p-2 border">부속품</td><td className="p-2 border text-right"><input className="text-right w-20 outline-none" value={f(ins.accessory_value)} onChange={e=>handleChange('accessory_value', e.target.value)}/>원</td></tr>
                        </tbody>
                    </table>
                </div>
                <div>
                    <h3 className="font-bold bg-gray-100 p-2 text-sm mb-2 border-l-4 border-black">⬛ 담보사항</h3>
                    <table className="w-full text-xs border border-gray-300">
                        <thead className="bg-green-50 text-center"><tr><th className="p-1 border">구분</th><th className="p-1 border">가입금액</th></tr></thead>
                        <tbody>
                            <tr><td className="p-1 border text-center">대인I</td><td className="p-1 border"><input className="w-full text-center outline-none" value={ins.coverage_bi1 || ''} onChange={e=>handleChange('coverage_bi1', e.target.value)}/></td></tr>
                            <tr><td className="p-1 border text-center">대인II</td><td className="p-1 border"><input className="w-full text-center outline-none" value={ins.coverage_bi2 || ''} onChange={e=>handleChange('coverage_bi2', e.target.value)}/></td></tr>
                            <tr><td className="p-1 border text-center font-bold">대물</td><td className="p-1 border"><input className="w-full text-center font-bold outline-none" value={ins.coverage_pd || ''} onChange={e=>handleChange('coverage_pd', e.target.value)}/></td></tr>
                            <tr><td className="p-1 border text-center text-blue-600 font-bold">자차</td><td className="p-1 border"><input className="w-full text-center font-bold text-blue-600 outline-none" value={ins.coverage_own_damage || ''} onChange={e=>handleChange('coverage_own_damage', e.target.value)}/></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* 우측 파일 뷰어 */}
        <div className="lg:col-span-4 space-y-6">
            {['application', 'certificate'].map(type => (
                <div key={type} className="bg-white p-6 rounded-xl border shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-2">{type === 'application' ? '📄 청약서' : '🎖️ 가입증명서'}</h3>
                    <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center relative hover:bg-gray-100 transition-colors">
                        {ins[`${type}_form_url`] || ins[`${type}_url`] ? (
                            <div className="space-y-2">
                                <p className="text-green-600 text-xs font-bold">✅ 파일 등록됨</p>
                                <a href={ins[`${type}_form_url`] || ins[`${type}_url`]} target="_blank" className="block w-full py-2 bg-white border rounded text-sm font-bold text-blue-600">보기</a>
                            </div>
                        ) : (
                            <div className="py-4 text-gray-400"><p className="text-2xl">📂</p><p className="text-xs">파일 업로드</p></div>
                        )}
                        <input type="file" className="absolute inset-0 cursor-pointer opacity-0" accept=".pdf,image/*" onChange={(e)=>handleFileUpload(e, type as any)}/>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  )
}
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const Icons = {
  Back: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  Save: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>,
  File: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
}

const f = (n: any) => Number(n || 0).toLocaleString()
const cleanNumber = (n: any) => Number(String(n).replace(/[^0-9]/g, ''))

export default function InsuranceDetailPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [carInfo, setCarInfo] = useState<any>(null)

  const [ins, setIns] = useState<any>({
    company: '전국렌터카공제조합',
    product_name: '자동차공제(영업용)',
    contractor: '',
    start_date: '',
    end_date: '',
    premium: 0,
    initial_premium: 0,
    car_value: 0,
    accessory_value: 0,
    coverage_bi1: '',
    coverage_bi2: '',
    coverage_pd: '',
    coverage_self_injury: '',
    coverage_uninsured: '',
    coverage_own_damage: '',
    coverage_emergency: '',
    driver_range: '',
    age_limit: '',
    payment_account: '', // 입금계좌
    installments: [],    // 분납내역 (배열)
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

  // 분납 내역 수정 핸들러
  const handleInstallmentChange = (index: number, field: string, value: any) => {
      const newInstallments = [...(ins.installments || [])];
      newInstallments[index] = { ...newInstallments[index], [field]: value };
      setIns(prev => ({ ...prev, installments: newInstallments }));
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
    if (error) return alert('업로드 실패')

    const { data } = supabase.storage.from('car_docs').getPublicUrl(fileName)
    const fieldName = type === 'application' ? 'application_form_url' : 'certificate_url'

    handleChange(fieldName, data.publicUrl)
    if (ins.id) await supabase.from('insurance_contracts').update({ [fieldName]: data.publicUrl }).eq('id', ins.id)
    alert('업로드 완료')
  }

  if (loading) return <div className="p-20 text-center font-bold">로딩 중...</div>

  return (
    <div className="min-h-screen bg-gray-50/50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
                <button onClick={() => router.push('/insurance')} className="bg-white p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-black transition-all">
                    <Icons.Back />
                </button>
                <div>
                    <h1 className="text-3xl font-black text-gray-900">{carInfo?.number}</h1>
                    <p className="text-gray-500 font-medium">{carInfo?.brand} {carInfo?.model}</p>
                </div>
            </div>
            <button onClick={handleSave} className="flex items-center gap-2 bg-blue-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black shadow-lg transition-all">
                <Icons.Save /> <span>저장하기</span>
            </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* 좌측: 청약서 폼 */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex justify-between items-end border-b-2 border-blue-900 pb-4 mb-6">
                        <div className="flex items-center gap-2">
                            <span className="bg-blue-900 text-white font-black px-2 py-1 text-sm rounded">KRMA</span>
                            <h2 className="text-2xl font-black text-gray-800">청 약 서</h2>
                        </div>
                        <span className="text-xs text-gray-400 font-mono">설계번호: {ins.id}</span>
                    </div>

                    {/* 1. 기본 정보 */}
                    <table className="w-full text-sm border-collapse border border-gray-300 mb-6">
                        <tbody>
                            <tr>
                                <td className="bg-blue-50 font-bold p-2 border w-24 text-center">상품명</td>
                                <td className="p-2 border"><input className="w-full bg-transparent font-bold outline-none" value={ins.product_name || ''} onChange={e=>handleChange('product_name', e.target.value)}/></td>
                                <td className="bg-blue-50 font-bold p-2 border w-24 text-center">기간</td>
                                <td className="p-2 border flex gap-1"><input type="date" className="bg-transparent" value={ins.start_date || ''} onChange={e=>handleChange('start_date', e.target.value)}/> ~ <input type="date" className="bg-transparent" value={ins.end_date || ''} onChange={e=>handleChange('end_date', e.target.value)}/></td>
                            </tr>
                            <tr>
                                <td className="bg-blue-50 font-bold p-2 border text-center">계약자</td>
                                <td className="p-2 border" colSpan={3}><input className="w-full font-bold bg-transparent outline-none" value={ins.contractor || ''} onChange={e=>handleChange('contractor', e.target.value)}/></td>
                            </tr>
                            <tr>
                                <td className="bg-blue-100 font-bold p-2 border text-blue-900 text-center">총분담금</td>
                                <td className="p-2 border text-right"><input className="w-full text-right font-black text-lg text-blue-900 outline-none bg-transparent" value={f(ins.premium)} onChange={e=>handleChange('premium', e.target.value)}/></td>
                                <td className="bg-blue-50 font-bold p-2 border text-center">초회분담금</td>
                                <td className="p-2 border text-right"><input className="w-full text-right font-bold outline-none bg-transparent" value={f(ins.initial_premium)} onChange={e=>handleChange('initial_premium', e.target.value)}/></td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* 2. 차량/담보 */}
                        <div>
                            <h3 className="font-bold text-sm mb-2 border-l-4 border-black pl-2 bg-gray-100 p-1">차량 및 담보 사항</h3>
                            <table className="w-full text-xs border border-gray-300">
                                <tbody>
                                    <tr><td className="bg-gray-50 p-1 border w-16 text-center">차명</td><td className="p-1 border font-bold">{carInfo?.model}</td></tr>
                                    <tr><td className="bg-gray-50 p-1 border text-center">가액</td><td className="p-1 border text-right">{f(ins.car_value)}원</td></tr>
                                    <tr><td className="p-1 border text-center bg-blue-50">대인I</td><td className="p-1 border"><input className="w-full outline-none" value={ins.coverage_bi1||''} onChange={e=>handleChange('coverage_bi1',e.target.value)}/></td></tr>
                                    <tr><td className="p-1 border text-center bg-blue-50">대인II</td><td className="p-1 border"><input className="w-full outline-none" value={ins.coverage_bi2||''} onChange={e=>handleChange('coverage_bi2',e.target.value)}/></td></tr>
                                    <tr><td className="p-1 border text-center bg-blue-50 font-bold">대물</td><td className="p-1 border"><input className="w-full outline-none font-bold" value={ins.coverage_pd||''} onChange={e=>handleChange('coverage_pd',e.target.value)}/></td></tr>
                                    <tr><td className="p-1 border text-center bg-blue-50">자손</td><td className="p-1 border"><input className="w-full outline-none" value={ins.coverage_self_injury||''} onChange={e=>handleChange('coverage_self_injury',e.target.value)}/></td></tr>
                                    <tr><td className="p-1 border text-center bg-blue-50 text-blue-600 font-bold">자차</td><td className="p-1 border"><input className="w-full outline-none font-bold text-blue-600" value={ins.coverage_own_damage||''} onChange={e=>handleChange('coverage_own_damage',e.target.value)}/></td></tr>
                                    <tr><td className="p-1 border text-center bg-blue-50">무보험</td><td className="p-1 border"><input className="w-full outline-none" value={ins.coverage_uninsured||''} onChange={e=>handleChange('coverage_uninsured',e.target.value)}/></td></tr>
                                    <tr><td className="p-1 border text-center bg-blue-50">긴급</td><td className="p-1 border"><input className="w-full outline-none" value={ins.coverage_emergency||''} onChange={e=>handleChange('coverage_emergency',e.target.value)}/></td></tr>
                                </tbody>
                            </table>
                        </div>

                        {/* 3. 특약 및 분납 */}
                        <div className="flex flex-col h-full">
                            <div className="mb-4">
                                <h3 className="font-bold text-sm mb-2 border-l-4 border-black pl-2 bg-gray-100 p-1">특약 사항</h3>
                                <div className="text-xs border p-2 bg-gray-50 rounded">
                                    <div className="flex justify-between mb-1"><span>연령:</span> <input className="font-bold bg-transparent text-right w-24" value={ins.age_limit||''} onChange={e=>handleChange('age_limit',e.target.value)}/></div>
                                    <div className="flex justify-between"><span>범위:</span> <input className="font-bold bg-transparent text-right w-24" value={ins.driver_range||''} onChange={e=>handleChange('driver_range',e.target.value)}/></div>
                                </div>
                            </div>

                            <div className="flex-1">
                                <h3 className="font-bold text-sm mb-2 border-l-4 border-black pl-2 bg-gray-100 p-1">분납 분담금 (스케줄)</h3>
                                <div className="border border-gray-300 rounded overflow-hidden">
                                    <table className="w-full text-xs text-center">
                                        <thead className="bg-gray-100 border-b">
                                            <tr>
                                                <th className="p-1 border-r">회차</th>
                                                <th className="p-1 border-r">납입일자</th>
                                                <th className="p-1">금액</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(ins.installments || []).map((row: any, idx: number) => (
                                                <tr key={idx} className="border-b last:border-0 hover:bg-blue-50">
                                                    <td className="p-1 border-r">{row.seq}회</td>
                                                    <td className="p-1 border-r"><input className="bg-transparent text-center w-full" value={row.date} onChange={e=>handleInstallmentChange(idx, 'date', e.target.value)}/></td>
                                                    <td className="p-1 text-right font-bold"><input className="bg-transparent text-right w-full" value={f(row.amount)} onChange={e=>handleInstallmentChange(idx, 'amount', e.target.value.replace(/,/g,''))}/></td>
                                                </tr>
                                            ))}
                                            {(!ins.installments || ins.installments.length === 0) && (
                                                <tr><td colSpan={3} className="p-4 text-gray-400">분납 정보가 없습니다.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 4. 입금 계좌 */}
                    <div className="mt-6 bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex justify-between items-center">
                        <span className="font-bold text-yellow-800 text-sm">💰 분담금 입금계좌</span>
                        <input className="font-bold text-lg text-gray-800 bg-transparent text-right outline-none w-2/3" value={ins.payment_account || ''} onChange={e=>handleChange('payment_account', e.target.value)} placeholder="은행 계좌번호 입력"/>
                    </div>
                </div>
            </div>

            {/* 우측: 파일 뷰어 */}
            <div className="space-y-6">
                {['application', 'certificate'].map(type => (
                    <div key={type} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                        <h3 className="font-bold text-gray-800 mb-2">{type === 'application' ? '📄 청약서' : '🎖️ 가입증명서'}</h3>
                        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center relative hover:border-blue-400 transition-colors h-48 flex flex-col items-center justify-center">
                            {ins[`${type}_form_url`] || ins[`${type}_url`] ? (
                                <div className="space-y-2 w-full h-full">
                                    <iframe src={ins[`${type}_form_url`] || ins[`${type}_url`]} className="w-full h-full rounded border" />
                                </div>
                            ) : (
                                <div className="text-gray-400"><p className="text-2xl">📂</p><p className="text-xs">파일 업로드</p></div>
                            )}
                            <input type="file" className="absolute inset-0 cursor-pointer opacity-0" accept=".pdf,image/*" onChange={(e)=>handleFileUpload(e, type as any)}/>
                        </div>
                        {(ins[`${type}_form_url`] || ins[`${type}_url`]) && (
                            <a href={ins[`${type}_form_url`] || ins[`${type}_url`]} target="_blank" className="block text-center text-xs text-blue-500 font-bold mt-2 hover:underline">크게 보기 ↗</a>
                        )}
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  )
}
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// --- [아이콘 정의 수정] ---
const Icons = {
  Back: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  Save: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>,
  File: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Check: () => <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  Money: () => <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  // 🔥 [추가됨] 이 아이콘이 없어서 에러가 났었습니다!
  Upload: () => <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
}

// 유틸리티
const f = (n: any) => Number(n || 0).toLocaleString()
const cleanNumber = (n: any) => Number(String(n).replace(/[^0-9]/g, ''))

export default function InsuranceDetailPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [carInfo, setCarInfo] = useState<any>(null)

  const [ins, setIns] = useState<any>({
    company: '', product_name: '', contractor: '',
    start_date: '', end_date: '',
    premium: 0, initial_premium: 0, car_value: 0, accessory_value: 0,
    coverage_bi1: '', coverage_bi2: '', coverage_pd: '', coverage_self_injury: '',
    coverage_uninsured: '', coverage_own_damage: '', coverage_emergency: '',
    driver_range: '', age_limit: '', payment_account: '',
    installments: [], application_form_url: '', certificate_url: ''
  })

  useEffect(() => {
    if (!carId) return
    fetchData()
  }, [carId])

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

  const handleChange = (field: string, value: any) => {
    setIns(prev => ({ ...prev, [field]: value }))
  }

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

  // 상태 뱃지 계산
  const isActive = ins.end_date && new Date(ins.end_date) > new Date();

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-400">데이터 로딩 중...</div>

  return (
    <div className="min-h-screen bg-gray-50/50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* 1. 상단 헤더 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-5">
                <button onClick={() => router.push('/insurance')} className="bg-gray-100 p-3 rounded-xl text-gray-500 hover:text-black hover:bg-gray-200 transition-all">
                    <Icons.Back />
                </button>
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{carInfo?.number}</h1>
                        {isActive ? (
                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 border border-green-200">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> 가입중
                            </span>
                        ) : (
                            <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">미가입/만료</span>
                        )}
                    </div>
                    <p className="text-gray-500 font-medium mt-1">{carInfo?.brand} {carInfo?.model} <span className="text-gray-300 mx-2">|</span> {carInfo?.year}년식</p>
                </div>
            </div>
            <button onClick={handleSave} className="flex items-center gap-2 bg-blue-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-black shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5">
                <Icons.Save /> <span>저장하기</span>
            </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* 2. 좌측: 입력 폼 섹션 */}
            <div className="lg:col-span-7 space-y-6">

                {/* A. 계약 요약 카드 */}
                <div className="bg-gradient-to-br from-blue-900 to-indigo-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Icons.Money /></div>
                    <div className="grid grid-cols-2 gap-8 relative z-10">
                        <div>
                            <p className="text-blue-200 text-xs font-bold uppercase mb-1">총 분담금 (Total Premium)</p>
                            <div className="flex items-end gap-1">
                                <input className="text-3xl font-black bg-transparent outline-none w-full border-b border-blue-700 focus:border-white transition-colors"
                                       value={f(ins.premium)} onChange={e=>handleChange('premium', e.target.value)}/>
                                <span className="text-sm font-bold mb-1">원</span>
                            </div>
                        </div>
                        <div>
                            <p className="text-blue-200 text-xs font-bold uppercase mb-1">초회 분담금 (Initial)</p>
                            <div className="flex items-end gap-1">
                                <input className="text-3xl font-black bg-transparent outline-none w-full border-b border-blue-700 focus:border-white transition-colors text-yellow-300"
                                       value={f(ins.initial_premium)} onChange={e=>handleChange('initial_premium', e.target.value)}/>
                                <span className="text-sm font-bold mb-1 text-yellow-300">원</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* B. 기본 정보 카드 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2"><span className="w-1 h-5 bg-blue-600 rounded-full"></span>계약 기본 정보</h3>
                    <div className="grid grid-cols-2 gap-5">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-400 mb-1">보험/공제 상품명</label>
                            <input className="w-full font-bold text-gray-800 text-lg border-b border-gray-200 focus:border-blue-500 outline-none pb-1 transition-colors"
                                   value={ins.product_name || ''} onChange={e=>handleChange('product_name', e.target.value)}/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">계약자</label>
                            <input className="w-full font-bold text-gray-800 border-b border-gray-200 focus:border-blue-500 outline-none pb-1"
                                   value={ins.contractor || ''} onChange={e=>handleChange('contractor', e.target.value)}/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">보험사</label>
                            <input className="w-full font-bold text-gray-800 border-b border-gray-200 focus:border-blue-500 outline-none pb-1"
                                   value={ins.company || ''} onChange={e=>handleChange('company', e.target.value)}/>
                        </div>
                        <div className="col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                            <label className="text-xs font-bold text-gray-500">보험 기간</label>
                            <div className="flex items-center gap-3">
                                <input type="date" className="bg-transparent font-bold text-gray-700 outline-none font-mono" value={ins.start_date || ''} onChange={e=>handleChange('start_date', e.target.value)}/>
                                <span className="text-gray-400">~</span>
                                <input type="date" className="bg-transparent font-bold text-gray-700 outline-none font-mono" value={ins.end_date || ''} onChange={e=>handleChange('end_date', e.target.value)}/>
                            </div>
                        </div>
                    </div>
                </div>

                {/* C. 담보 및 차량 상세 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2"><span className="w-1 h-5 bg-blue-600 rounded-full"></span>담보 및 차량 상세</h3>

                    <div className="flex gap-4 mb-6">
                        <div className="flex-1 bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <label className="block text-xs text-gray-400">차량가액</label>
                            <input className="w-full bg-transparent font-bold text-right outline-none" value={f(ins.car_value)} onChange={e=>handleChange('car_value', e.target.value)}/>
                        </div>
                        <div className="flex-1 bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <label className="block text-xs text-gray-400">부속품가액</label>
                            <input className="w-full bg-transparent font-bold text-right outline-none" value={f(ins.accessory_value)} onChange={e=>handleChange('accessory_value', e.target.value)}/>
                        </div>
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-100 text-gray-500 text-xs uppercase font-bold">
                                <tr><th className="p-3 text-left w-24">구분</th><th className="p-3 text-left">가입금액 / 한도</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {[
                                    { label: '대인배상 I', key: 'coverage_bi1' },
                                    { label: '대인배상 II', key: 'coverage_bi2' },
                                    { label: '대물배상', key: 'coverage_pd' },
                                    { label: '자기신체', key: 'coverage_self_injury' },
                                    { label: '무보험차', key: 'coverage_uninsured' },
                                    { label: '자기차량', key: 'coverage_own_damage', highlight: true },
                                    { label: '긴급출동', key: 'coverage_emergency' },
                                ].map((row) => (
                                    <tr key={row.key} className="hover:bg-blue-50/50 transition-colors group">
                                        <td className={`p-3 font-bold ${row.highlight ? 'text-blue-600' : 'text-gray-600'}`}>{row.label}</td>
                                        <td className="p-2">
                                            <input className={`w-full p-1 bg-transparent outline-none border-b border-transparent group-hover:border-blue-200 ${row.highlight ? 'font-bold text-blue-700' : ''}`}
                                                   value={ins[row.key] || ''} onChange={e=>handleChange(row.key, e.target.value)}/>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* D. 특약 및 분납 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-full">
                        <h3 className="font-bold text-gray-800 mb-4">📝 특약 사항</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">운전자 범위</label>
                                <input className="w-full p-2 bg-gray-50 rounded-lg font-bold border border-gray-100 outline-none focus:border-blue-500 transition-colors" value={ins.driver_range || ''} onChange={e=>handleChange('driver_range', e.target.value)}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">연령 한정</label>
                                <input className="w-full p-2 bg-gray-50 rounded-lg font-bold border border-gray-100 outline-none focus:border-blue-500 transition-colors" value={ins.age_limit || ''} onChange={e=>handleChange('age_limit', e.target.value)}/>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-full">
                        <h3 className="font-bold text-gray-800 mb-4">📅 분납 계획</h3>
                        <div className="overflow-y-auto max-h-48 scrollbar-hide border border-gray-100 rounded-lg">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr><th className="p-2">회차</th><th className="p-2">일자</th><th className="p-2 text-right">금액</th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(ins.installments || []).map((row: any, idx: number) => (
                                        <tr key={idx}>
                                            <td className="p-2 text-center text-gray-500 font-bold">{row.seq}</td>
                                            <td className="p-2 text-center"><input className="bg-transparent text-center w-full outline-none" value={row.date} onChange={e=>handleInstallmentChange(idx, 'date', e.target.value)}/></td>
                                            <td className="p-2 text-right font-bold"><input className="bg-transparent text-right w-full outline-none" value={f(row.amount)} onChange={e=>handleInstallmentChange(idx, 'amount', e.target.value.replace(/,/g,''))}/></td>
                                        </tr>
                                    ))}
                                    {(!ins.installments || ins.installments.length === 0) && <tr><td colSpan={3} className="p-4 text-center text-gray-300">분납 정보 없음</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* E. 입금 계좌 */}
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-2 shadow-sm">
                    <div className="flex items-center gap-2 text-yellow-800 font-bold">
                        <span>💰 분담금 입금계좌</span>
                    </div>
                    <input className="font-bold text-lg text-gray-900 bg-transparent text-center sm:text-right outline-none w-full"
                           value={ins.payment_account || ''} onChange={e=>handleChange('payment_account', e.target.value)}
                           placeholder="은행 계좌번호가 여기에 표시됩니다."/>
                </div>

            </div>

            {/* 3. 우측: Sticky 파일 뷰어 섹션 */}
            <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-6 h-fit">

                {['application', 'certificate'].map(type => (
                    <div key={type} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${type==='application'?'bg-blue-500':'bg-green-500'}`}></span>
                                {type === 'application' ? '📄 청약서' : '🎖️ 가입증명서'}
                            </h3>
                            {ins[`${type}_form_url`] || ins[`${type}_url`] ? <Icons.Check /> : null}
                        </div>

                        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl relative hover:border-blue-400 transition-colors h-64 flex flex-col items-center justify-center overflow-hidden group">
                            {ins[`${type}_form_url`] || ins[`${type}_url`] ? (
                                <>
                                    <iframe src={ins[`${type}_form_url`] || ins[`${type}_url`]} className="w-full h-full object-contain" />
                                    <a href={ins[`${type}_form_url`] || ins[`${type}_url`]} target="_blank"
                                       className="absolute bottom-3 right-3 bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-blue-600 hover:text-white transition-all flex items-center gap-1">
                                        🔍 크게보기
                                    </a>
                                </>
                            ) : (
                                <div className="text-gray-400 flex flex-col items-center">
                                    <Icons.Upload />
                                    <p className="text-xs mt-2 font-medium">클릭하여 파일 업로드</p>
                                </div>
                            )}
                            <input type="file" className="absolute inset-0 cursor-pointer opacity-0" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" onChange={(e)=>handleFileUpload(e, type as any)}/>
                        </div>
                    </div>
                ))}

            </div>
        </div>
      </div>
    </div>
  )
}
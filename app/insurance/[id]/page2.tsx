'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// --- [아이콘] ---
const Icons = {
  Back: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  Save: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>,
  File: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Download: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
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

  // 보험 데이터 상태 (기본값 세팅)
  const [ins, setIns] = useState<any>({
    company: '전국렌터카공제조합',
    product_name: '자동차공제(영업용)',
    contractor: '',
    start_date: '',
    end_date: '',
    premium: 0,          // 총 분담금
    initial_premium: 0,  // 초회 분담금
    car_value: 0,        // 차량가액
    accessory_value: 0,  // 부속품
    coverage_bi1: '자배법 시행령에서 정한 금액',
    coverage_bi2: '무한',
    coverage_pd: '1사고당 20,000 만원 / 일부부담금 없음',
    coverage_self_injury: '부상 1,500만원 / 후유 1.5억원',
    coverage_uninsured: '1인당 최고 2억원',
    coverage_own_damage: '차대차 : 50만원 / 기타 : 100만원',
    coverage_emergency: '기본(40KM)+타이어펑크',
    driver_range: '임직원 및 지정 1인',
    age_limit: '만 26세 이상',
    application_form_url: '',
    certificate_url: ''
  })

  useEffect(() => {
    if (!carId) return
    fetchData()
  }, [carId])

  const fetchData = async () => {
    // 1. 차량 정보
    const { data: car } = await supabase.from('cars').select('*').eq('id', carId).single()
    setCarInfo(car)

    // 2. 보험 정보 (가장 최신 계약 1건)
    const { data: insurance } = await supabase
        .from('insurance_contracts')
        .select('*')
        .eq('car_id', carId)
        .order('end_date', { ascending: false })
        .limit(1)
        .single()

    if (insurance) {
        setIns(insurance)
    } else if (car) {
        // 신규 등록일 경우 차량 정보 일부 가져오기
        setIns(prev => ({ ...prev, car_value: car.purchase_price }))
    }
    setLoading(false)
  }

  const handleChange = (field: string, value: any) => {
    setIns(prev => ({ ...prev, [field]: value }))
  }

  // 저장 로직
  const handleSave = async () => {
    const payload = {
        ...ins,
        car_id: carId,
        // 숫자 필드 안전 변환
        premium: cleanNumber(ins.premium),
        initial_premium: cleanNumber(ins.initial_premium),
        car_value: cleanNumber(ins.car_value),
        accessory_value: cleanNumber(ins.accessory_value)
    }

    let error
    if (ins.id) {
        const { error: err } = await supabase.from('insurance_contracts').update(payload).eq('id', ins.id)
        error = err
    } else {
        const { error: err } = await supabase.from('insurance_contracts').insert([payload])
        error = err
    }

    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 저장되었습니다.'); window.location.reload(); }
  }

  // 파일 업로드
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'application' | 'certificate') => {
    if (!e.target.files?.length) return
    const file = e.target.files[0]
    const fileExt = file.name.split('.').pop()
    const fileName = `insurance/${carId}_${type}_${Date.now()}.${fileExt}`

    // 1. Storage 업로드
    const { error } = await supabase.storage.from('car_docs').upload(fileName, file)
    if (error) return alert('업로드 실패: ' + error.message)

    // 2. URL 획득
    const { data } = supabase.storage.from('car_docs').getPublicUrl(fileName)
    const fieldName = type === 'application' ? 'application_form_url' : 'certificate_url'

    // 3. State 및 DB 업데이트
    handleChange(fieldName, data.publicUrl)
    if (ins.id) {
        await supabase.from('insurance_contracts').update({ [fieldName]: data.publicUrl }).eq('id', ins.id)
    }
    alert('파일이 등록되었습니다.')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">데이터 로딩 중...</div>

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
                <Icons.Save /> <span>계약 내용 저장</span>
            </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* 좌측: 상세 입력 폼 (청약서 스타일) */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex justify-between items-end border-b-2 border-blue-900 pb-4 mb-6">
                        <h2 className="text-2xl font-black text-blue-900 tracking-wider">자동차공제 청약서</h2>
                        <span className="text-xs text-gray-400 font-mono">Document No. {ins.id || 'NEW'}</span>
                    </div>

                    {/* 기본 정보 */}
                    <table className="w-full text-sm border-collapse border border-gray-300 mb-8">
                        <tbody>
                            <tr>
                                <td className="bg-blue-50/50 font-bold p-3 border border-gray-200 w-24 text-blue-800">상품명</td>
                                <td className="p-2 border border-gray-200"><input className="w-full font-bold bg-transparent outline-none" value={ins.product_name || ''} onChange={e=>handleChange('product_name', e.target.value)}/></td>
                                <td className="bg-blue-50/50 font-bold p-3 border border-gray-200 w-24 text-blue-800">공제기간</td>
                                <td className="p-2 border border-gray-200 flex items-center gap-2">
                                    <input type="date" className="bg-transparent font-mono" value={ins.start_date || ''} onChange={e=>handleChange('start_date', e.target.value)}/>
                                    <span className="text-gray-400">~</span>
                                    <input type="date" className="bg-transparent font-mono" value={ins.end_date || ''} onChange={e=>handleChange('end_date', e.target.value)}/>
                                </td>
                            </tr>
                            <tr>
                                <td className="bg-blue-50/50 font-bold p-3 border border-gray-200 text-blue-800">계약자</td>
                                <td className="p-2 border border-gray-200" colSpan={3}>
                                    <input className="w-full font-bold bg-transparent outline-none" placeholder="법인명 또는 성함" value={ins.contractor || ''} onChange={e=>handleChange('contractor', e.target.value)}/>
                                </td>
                            </tr>
                            <tr>
                                <td className="bg-blue-100 font-bold p-3 border border-gray-200 text-blue-900">총 분담금</td>
                                <td className="p-2 border border-gray-200 text-right">
                                    <input className="w-full text-right font-black text-lg bg-transparent outline-none text-blue-900" value={f(ins.premium)} onChange={e=>handleChange('premium', e.target.value)}/>
                                </td>
                                <td className="bg-blue-50/50 font-bold p-3 border border-gray-200 text-blue-800">초회분담금</td>
                                <td className="p-2 border border-gray-200 text-right">
                                    <input className="w-full text-right font-bold bg-transparent outline-none" value={f(ins.initial_premium)} onChange={e=>handleChange('initial_premium', e.target.value)}/>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* 차량 사항 */}
                        <div>
                            <h3 className="font-bold text-gray-800 mb-3 border-l-4 border-blue-900 pl-2">⬛ 차량 정보</h3>
                            <table className="w-full text-xs border border-gray-200">
                                <tbody>
                                    <tr><td className="bg-gray-50 p-2 border">차명</td><td className="p-2 border font-bold">{carInfo?.model}</td></tr>
                                    <tr><td className="bg-gray-50 p-2 border">등록년도</td><td className="p-2 border">{carInfo?.year}년식</td></tr>
                                    <tr>
                                        <td className="bg-gray-50 p-2 border">차량가액</td>
                                        <td className="p-2 border text-right">
                                            <div className="flex justify-end gap-1"><input className="text-right w-20 font-bold outline-none" value={f(ins.car_value)} onChange={e=>handleChange('car_value', e.target.value)}/><span>원</span></div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="bg-gray-50 p-2 border">부속품</td>
                                        <td className="p-2 border text-right">
                                            <div className="flex justify-end gap-1"><input className="text-right w-20 outline-none" value={f(ins.accessory_value)} onChange={e=>handleChange('accessory_value', e.target.value)}/><span>원</span></div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* 담보 사항 */}
                        <div>
                            <h3 className="font-bold text-gray-800 mb-3 border-l-4 border-blue-900 pl-2">⬛ 담보 내용</h3>
                            <table className="w-full text-xs border border-gray-200">
                                <thead className="bg-gray-100 text-center"><tr><th className="p-1 border">구분</th><th className="p-1 border">가입금액/한도</th></tr></thead>
                                <tbody>
                                    <tr><td className="p-1 border text-center">대인I</td><td className="p-1 border"><input className="w-full text-center outline-none" value={ins.coverage_bi1 || ''} onChange={e=>handleChange('coverage_bi1', e.target.value)}/></td></tr>
                                    <tr><td className="p-1 border text-center">대인II</td><td className="p-1 border"><input className="w-full text-center outline-none" value={ins.coverage_bi2 || ''} onChange={e=>handleChange('coverage_bi2', e.target.value)}/></td></tr>
                                    <tr><td className="p-1 border text-center font-bold">대물</td><td className="p-1 border"><input className="w-full text-center font-bold outline-none" value={ins.coverage_pd || ''} onChange={e=>handleChange('coverage_pd', e.target.value)}/></td></tr>
                                    <tr><td className="p-1 border text-center">자손/자상</td><td className="p-1 border"><input className="w-full text-center outline-none" value={ins.coverage_self_injury || ''} onChange={e=>handleChange('coverage_self_injury', e.target.value)}/></td></tr>
                                    <tr><td className="p-1 border text-center text-blue-600 font-bold">자차</td><td className="p-1 border"><input className="w-full text-center font-bold text-blue-600 outline-none" value={ins.coverage_own_damage || ''} onChange={e=>handleChange('coverage_own_damage', e.target.value)}/></td></tr>
                                    <tr><td className="p-1 border text-center">무보험</td><td className="p-1 border"><input className="w-full text-center outline-none" value={ins.coverage_uninsured || ''} onChange={e=>handleChange('coverage_uninsured', e.target.value)}/></td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 특약 사항 */}
                    <div className="mt-8 pt-6 border-t border-gray-200">
                        <h3 className="font-bold text-gray-800 mb-3 border-l-4 border-blue-900 pl-2">⬛ 특약 및 가입 조건</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-50 p-3 rounded border border-gray-200">
                                <span className="block text-xs text-gray-500 mb-1">운전 가능 범위</span>
                                <input className="w-full font-bold bg-transparent outline-none" value={ins.driver_range || ''} onChange={e=>handleChange('driver_range', e.target.value)}/>
                            </div>
                            <div className="bg-gray-50 p-3 rounded border border-gray-200">
                                <span className="block text-xs text-gray-500 mb-1">최저 연령 한정</span>
                                <input className="w-full font-bold bg-transparent outline-none" value={ins.age_limit || ''} onChange={e=>handleChange('age_limit', e.target.value)}/>
                            </div>
                            <div className="col-span-2 bg-gray-50 p-3 rounded border border-gray-200">
                                <span className="block text-xs text-gray-500 mb-1">긴급출동 서비스</span>
                                <input className="w-full font-bold bg-transparent outline-none" value={ins.coverage_emergency || ''} onChange={e=>handleChange('coverage_emergency', e.target.value)}/>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 우측: 파일 뷰어 */}
            <div className="space-y-6">

                {/* 청약서 카드 */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Icons.File /> 청약서 (Application)</h3>
                    <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-4 text-center relative hover:border-blue-400 transition-colors">
                        {ins.application_form_url ? (
                            <div className="space-y-3">
                                <p className="text-green-600 text-xs font-bold bg-green-100 px-2 py-1 rounded inline-block">✅ 파일 등록됨</p>
                                <a href={ins.application_form_url} target="_blank" className="block w-full py-3 bg-white border border-gray-300 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 transition-all text-blue-600">
                                    📄 문서 보기 (Click)
                                </a>
                            </div>
                        ) : (
                            <div className="py-8 text-gray-400">
                                <p className="text-3xl mb-2">📂</p>
                                <p className="text-xs">등록된 파일이 없습니다.</p>
                            </div>
                        )}
                        <label className="absolute inset-0 cursor-pointer opacity-0">
                            <input type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" onChange={(e)=>handleFileUpload(e, 'application')}/>
                        </label>
                    </div>
                </div>

                {/* 가입증명서 카드 */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Icons.File /> 가입증명서 (Certificate)</h3>
                    <div className="bg-blue-50 border-2 border-dashed border-blue-200 rounded-xl p-4 text-center relative hover:border-blue-400 transition-colors">
                        {ins.certificate_url ? (
                            <div className="space-y-3">
                                <p className="text-blue-600 text-xs font-bold bg-blue-100 px-2 py-1 rounded inline-block">✅ 증명서 등록됨</p>
                                <a href={ins.certificate_url} target="_blank" className="block w-full py-3 bg-white border border-blue-200 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 transition-all text-blue-800">
                                    🎖️ 증명서 보기
                                </a>
                            </div>
                        ) : (
                            <div className="py-8 text-blue-300">
                                <p className="text-3xl mb-2">🛡️</p>
                                <p className="text-xs">증명서 파일을 업로드하세요.</p>
                            </div>
                        )}
                        <label className="absolute inset-0 cursor-pointer opacity-0">
                            <input type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" onChange={(e)=>handleFileUpload(e, 'certificate')}/>
                        </label>
                    </div>
                </div>

            </div>
        </div>
      </div>
    </div>
  )
}
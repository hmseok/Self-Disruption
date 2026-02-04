'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs' // 점 2개 확인!

export default function InsurancePage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [carInfo, setCarInfo] = useState<any>(null)

  // 보험 계약 정보 상태
  const [ins, setIns] = useState<any>({
    company: '전국렌터카공제조합',
    product_name: '자동차공제(영업용)',
    start_date: '',
    end_date: '',
    contractor_name: '',
    contractor_info: '',
    total_premium: 0,
    initial_premium: 0,
    car_value: 0,
    accessory_value: 0,
    coverage_bi1: '자배법 시행령 한도',
    coverage_bi2: '무한',
    coverage_pd: '2억원 / 일부부담금 없음',
    coverage_self_injury: '1.5억원 / 1.5천만원',
    coverage_uninsured: '1인당 2억원',
    coverage_own_damage: '가입안함',
    coverage_emergency: '기본(40km) + 타이어펑크',
    age_limit: '만 26세 이상',
    driver_range: '임직원 및 지정 1인',
    application_form_url: '',
    certificate_url: ''
  })

  useEffect(() => {
    if (!carId) return
    const fetchData = async () => {
      // 1. 차량 정보
      const { data: car } = await supabase.from('cars').select('*').eq('id', carId).single()
      setCarInfo(car)

      // 2. 보험 정보
      const { data: insurance } = await supabase
        .from('insurance_contracts')
        .select('*')
        .eq('car_id', carId)
        .order('end_date', { ascending: false })
        .limit(1)
        .single()

      if (insurance) setIns(insurance)
      else if (car) {
        setIns(prev => ({
            ...prev,
            contractor_name: '주식회사 에프엠아이',
            contractor_info: '123-45-67890', // 기본값 예시
            car_value: car.purchase_price
        }))
      }
      setLoading(false)
    }
    fetchData()
  }, [carId])

  const handleChange = (field: string, value: any) => {
    setIns(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    const payload = { ...ins, car_id: carId }
    let error
    if (ins.id) {
        const { error: err } = await supabase.from('insurance_contracts').update(payload).eq('id', ins.id)
        error = err
    } else {
        const { error: err } = await supabase.from('insurance_contracts').insert([payload])
        error = err
    }
    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 저장되었습니다!'); window.location.reload(); }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'application' | 'certificate') => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    const fileExt = file.name.split('.').pop()
    const fileName = `insurance/${carId}_${type}_${Date.now()}.${fileExt}`

    const { error } = await supabase.storage.from('car_docs').upload(fileName, file)
    if (error) return alert('업로드 실패: ' + error.message)

    const { data } = supabase.storage.from('car_docs').getPublicUrl(fileName)
    const fieldName = type === 'application' ? 'application_form_url' : 'certificate_url'

    // DB 업데이트 (ID가 있을 때만)
    if (ins.id) {
        await supabase.from('insurance_contracts').update({ [fieldName]: data.publicUrl }).eq('id', ins.id)
    }

    setIns(prev => ({ ...prev, [fieldName]: data.publicUrl }))
    alert('업로드 완료')
  }

  const f = (n: any) => Number(n || 0).toLocaleString()

  if (loading) return <div className="p-10 text-center">로딩 중...</div>

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 animate-fade-in">
      <div className="flex justify-between items-center mb-8 pb-4 border-b">
        <div>
          <span className="text-blue-600 text-sm font-bold">보험/공제 관리</span>
          <h1 className="text-3xl font-black">{carInfo?.number} <span className="text-lg text-gray-500 font-normal">{carInfo?.model}</span></h1>
        </div>
        <button onClick={() => router.push(`/insurance`)} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-200">
          ← 목록으로
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 bg-white border border-gray-300 shadow-sm p-8 rounded-sm">
            <div className="flex justify-between items-center border-b-2 border-blue-600 pb-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 text-white font-black px-3 py-1 text-lg">KRMA</div>
                    <h2 className="text-3xl font-black tracking-widest text-gray-800">청 약 서</h2>
                </div>
                <div className="text-right text-xs text-gray-500">
                    <p>설계번호: {ins.id ? String(ins.id).split('-')[0] : '신규작성'}</p>
                </div>
            </div>

            <table className="w-full text-sm border-collapse border border-gray-300 mb-6">
                <tbody>
                    <tr>
                        <td className="bg-blue-50 font-bold p-2 border border-gray-300 w-24">상 품 명</td>
                        <td className="p-2 border border-gray-300">
                            {/* 👇 value={... || ''} 추가 */}
                            <input className="w-full bg-transparent font-bold" value={ins.product_name || ''} onChange={e=>handleChange('product_name', e.target.value)}/>
                        </td>
                        <td className="bg-blue-50 font-bold p-2 border border-gray-300 w-24">공제 기간</td>
                        <td className="p-2 border border-gray-300 flex gap-2 items-center">
                            <input type="date" className="bg-transparent" value={ins.start_date || ''} onChange={e=>handleChange('start_date', e.target.value)}/>
                            ~
                            <input type="date" className="bg-transparent" value={ins.end_date || ''} onChange={e=>handleChange('end_date', e.target.value)}/>
                        </td>
                    </tr>
                    <tr>
                        <td className="bg-blue-50 font-bold p-2 border border-gray-300">계 약 자</td>
                        <td className="p-2 border border-gray-300" colSpan={3}>
                            <input className="w-full font-bold mb-1" placeholder="업체명" value={ins.contractor_name || ''} onChange={e=>handleChange('contractor_name', e.target.value)}/>
                            <input className="w-full text-xs text-gray-500" placeholder="사업자번호 / 주소" value={ins.contractor_info || ''} onChange={e=>handleChange('contractor_info', e.target.value)}/>
                        </td>
                    </tr>
                    <tr>
                        <td className="bg-blue-50 font-bold p-2 border border-gray-300 text-blue-800">총 분담금</td>
                        <td className="p-2 border border-gray-300 font-black text-lg text-right">
                            <input className="text-right w-full outline-none" value={f(ins.total_premium)} onChange={e=>handleChange('total_premium', Number(e.target.value.replace(/,/g,'')))}/>
                        </td>
                        <td className="bg-blue-50 font-bold p-2 border border-gray-300">초회분담금</td>
                        <td className="p-2 border border-gray-300 font-bold text-right">
                             <input className="text-right w-full outline-none" value={f(ins.initial_premium)} onChange={e=>handleChange('initial_premium', Number(e.target.value.replace(/,/g,'')))}/>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <h3 className="font-bold border-l-4 border-black pl-2 mb-2 bg-gray-100 p-1 text-sm">⬛ 차량사항</h3>
                    <table className="w-full text-xs border border-gray-300">
                        <tbody>
                            <tr>
                                <td className="bg-gray-50 p-2 border border-gray-300">차명</td>
                                <td className="p-2 border border-gray-300 font-bold">{carInfo?.model}</td>
                            </tr>
                            <tr>
                                <td className="bg-gray-50 p-2 border border-gray-300">등록년도</td>
                                <td className="p-2 border border-gray-300">{carInfo?.year}년식</td>
                            </tr>
                             <tr>
                                <td className="bg-gray-50 p-2 border border-gray-300">차량가액</td>
                                <td className="p-2 border border-gray-300 text-right">
                                    <input className="text-right w-20 bg-gray-50 font-bold" value={f(ins.car_value)} onChange={e=>handleChange('car_value', Number(e.target.value.replace(/,/g,'')))}/> 만원
                                </td>
                            </tr>
                            <tr>
                                <td className="bg-gray-50 p-2 border border-gray-300">부속품</td>
                                <td className="p-2 border border-gray-300 text-right">
                                     <input className="text-right w-20 bg-gray-50" value={f(ins.accessory_value)} onChange={e=>handleChange('accessory_value', Number(e.target.value.replace(/,/g,'')))}/> 만원
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div>
                    <h3 className="font-bold border-l-4 border-black pl-2 mb-2 bg-gray-100 p-1 text-sm">⬛ 담보사항</h3>
                    <table className="w-full text-xs border border-gray-300">
                        <thead className="bg-green-50 text-center">
                            <tr><th className="p-1 border border-gray-300">구분</th><th className="p-1 border border-gray-300">가입금액/한도</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="p-1 border border-gray-300 text-center">대인I</td>
                                <td className="p-1 border border-gray-300"><input className="w-full text-center" value={ins.coverage_bi1 || ''} onChange={e=>handleChange('coverage_bi1', e.target.value)}/></td>
                            </tr>
                            <tr>
                                <td className="p-1 border border-gray-300 text-center">대인II</td>
                                <td className="p-1 border border-gray-300"><input className="w-full text-center" value={ins.coverage_bi2 || ''} onChange={e=>handleChange('coverage_bi2', e.target.value)}/></td>
                            </tr>
                             <tr>
                                <td className="p-1 border border-gray-300 text-center">대물</td>
                                <td className="p-1 border border-gray-300"><input className="w-full text-center font-bold" value={ins.coverage_pd || ''} onChange={e=>handleChange('coverage_pd', e.target.value)}/></td>
                            </tr>
                             <tr>
                                <td className="p-1 border border-gray-300 text-center">자손/자상</td>
                                <td className="p-1 border border-gray-300"><input className="w-full text-center" value={ins.coverage_self_injury || ''} onChange={e=>handleChange('coverage_self_injury', e.target.value)}/></td>
                            </tr>
                            <tr>
                                <td className="p-1 border border-gray-300 text-center text-blue-600 font-bold">자차</td>
                                <td className="p-1 border border-gray-300"><input className="w-full text-center font-bold text-blue-600" value={ins.coverage_own_damage || ''} onChange={e=>handleChange('coverage_own_damage', e.target.value)}/></td>
                            </tr>
                            <tr>
                                <td className="p-1 border border-gray-300 text-center">긴급출동</td>
                                <td className="p-1 border border-gray-300"><input className="w-full text-center" value={ins.coverage_emergency || ''} onChange={e=>handleChange('coverage_emergency', e.target.value)}/></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-6 border-t pt-4">
                 <h3 className="font-bold border-l-4 border-black pl-2 mb-2 bg-gray-100 p-1 text-sm">⬛ 특약 및 요율사항</h3>
                 <div className="flex gap-4 text-sm">
                    <div className="flex-1 bg-gray-50 p-2 border">
                        <span className="font-bold block text-gray-500 mb-1">운전가능범위</span>
                        <input className="w-full font-bold bg-transparent" value={ins.driver_range || ''} onChange={e=>handleChange('driver_range', e.target.value)}/>
                    </div>
                    <div className="flex-1 bg-gray-50 p-2 border">
                        <span className="font-bold block text-gray-500 mb-1">최저연령한정</span>
                        <input className="w-full font-bold bg-transparent" value={ins.age_limit || ''} onChange={e=>handleChange('age_limit', e.target.value)}/>
                    </div>
                 </div>
            </div>

            <button onClick={handleSave} className="w-full bg-blue-900 text-white font-bold py-4 mt-8 text-lg rounded shadow-lg hover:bg-black">
                청약서 내용 저장하기
            </button>
        </div>

        <div className="lg:col-span-4 space-y-6">

            <div className="bg-white p-6 rounded-xl border shadow-sm">
                <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">📄 청약서 (스캔본)</h3>
                <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    {ins.application_form_url ? (
                        <div className="space-y-3">
                            <p className="text-green-600 font-bold text-sm">✅ 파일 등록됨</p>
                            <a href={ins.application_form_url} target="_blank" className="block w-full py-2 bg-white border border-gray-300 rounded shadow-sm text-sm font-bold hover:bg-gray-50">미리보기</a>
                            <label className="block text-xs text-gray-400 underline cursor-pointer mt-2">
                                파일 교체 <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e)=>handleFileUpload(e, 'application')}/>
                            </label>
                        </div>
                    ) : (
                        <label className="cursor-pointer">
                            <p className="text-2xl mb-1">📤</p>
                            <p className="text-sm text-gray-500">클릭하여 청약서 업로드</p>
                            <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e)=>handleFileUpload(e, 'application')}/>
                        </label>
                    )}
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border shadow-sm">
                <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2">🎖️ 가입증명서</h3>
                <div className="bg-blue-50 border-2 border-dashed border-blue-200 rounded-lg p-6 text-center">
                    {ins.certificate_url ? (
                        <div className="space-y-3">
                            <p className="text-blue-600 font-bold text-sm">✅ 파일 등록됨</p>
                            <a href={ins.certificate_url} target="_blank" className="block w-full py-2 bg-white border border-blue-200 rounded shadow-sm text-sm font-bold text-blue-800 hover:bg-blue-50">증명서 보기</a>
                            <label className="block text-xs text-blue-400 underline cursor-pointer mt-2">
                                파일 교체 <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e)=>handleFileUpload(e, 'certificate')}/>
                            </label>
                        </div>
                    ) : (
                        <label className="cursor-pointer">
                            <p className="text-2xl mb-1">📤</p>
                            <p className="text-sm text-blue-500">클릭하여 증명서 업로드</p>
                            <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e)=>handleFileUpload(e, 'certificate')}/>
                        </label>
                    )}
                </div>
            </div>

        </div>

      </div>
    </div>
  )
}
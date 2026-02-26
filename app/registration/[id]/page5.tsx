'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useDaumPostcodePopup } from 'react-daum-postcode'

export default function RegistrationPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()
  const open = useDaumPostcodePopup('https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js')

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // 🛡️ 초기값 세팅 (모두 빈 문자열로 초기화하여 에러 방지)
  const [car, setCar] = useState({
    number: '', model: '', brand: '', vin: '', owner_name: '',
    registration_date: '', acq_date: '',
    location: '',
    capacity: '', displacement: '', fuel_type: '',
    inspection_end_date: '', vehicle_age_expiry: '',
    purchase_price: 0,
    registration_image_url: '',
    notes: ''
  })

  useEffect(() => {
    if (!carId) return
    const fetchData = async () => {
      const { data, error } = await supabase.from('cars').select('*').eq('id', carId).single()
      if (error || !data) {
        alert("차량 정보를 불러오지 못했습니다.")
        router.push('/registration')
        return
      }
      setCar({
        ...data,
        fuel_type: data.fuel_type || '미확인',
        location: data.location || '',
        capacity: data.capacity || '',
        displacement: data.displacement || '',
        vehicle_age_expiry: data.vehicle_age_expiry || '',
        notes: data.notes || '',
        // 숫자가 NaN이 되는 것 방지
        purchase_price: data.purchase_price || 0
      })
      setLoading(false)
    }
    fetchData()
  }, [carId, router])

  const handleChange = (field: string, value: any) => {
    setCar(prev => ({ ...prev, [field]: value }))
  }

  const handleComplete = (data: any) => {
    let fullAddress = data.address
    let extraAddress = ''
    if (data.addressType === 'R') {
      if (data.bname !== '') extraAddress += data.bname
      if (data.buildingName !== '') extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName)
      fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '')
    }
    setCar(prev => ({ ...prev, location: fullAddress }))
  }

  const handleAddressSearch = () => { open({ onComplete: handleComplete }) }

  const handleSave = async () => {
    const { error } = await supabase.from('cars').update({
        ...car,
        purchase_price: Number(car.purchase_price) || 0
    }).eq('id', carId)

    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 저장되었습니다!'); window.location.reload(); }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    const file = e.target.files[0]
    setUploading(true)
    setIsAnalyzing(true)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${carId}_registration_${Date.now()}.${fileExt}`
      const filePath = `registration/${fileName}`

      const uploadPromise = supabase.storage.from('car_docs').upload(filePath, file, { upsert: true })

      const reader = new FileReader()
      reader.readAsDataURL(file)

      reader.onload = async () => {
        const base64 = reader.result
        const ocrResponse = await fetch('/api/ocr-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64 })
        })
        const ocrData = await ocrResponse.json()

        if (!ocrData.error) {
            // 🔄 [데이터 매핑] AI가 준 키와 내 state 키가 이제 100% 일치합니다.
            setCar(prev => ({
                ...prev,
                number: ocrData.number || prev.number,
                model: ocrData.model || prev.model,
                vin: ocrData.vin || prev.vin,
                owner_name: ocrData.owner_name || prev.owner_name,
                registration_date: ocrData.registration_date || prev.registration_date,
                location: ocrData.location || prev.location,
                capacity: ocrData.capacity || prev.capacity,
                displacement: ocrData.displacement || prev.displacement,
                fuel_type: ocrData.fuel_type || prev.fuel_type,
                inspection_end_date: ocrData.inspection_end_date || prev.inspection_end_date,
                vehicle_age_expiry: ocrData.vehicle_age_expiry || prev.vehicle_age_expiry,
                purchase_price: ocrData.purchase_price || prev.purchase_price,
                notes: ocrData.notes || prev.notes
            }))
            alert(`🤖 분석 완료! \n[${ocrData.model}] 정보를 찾았습니다.`)
        }

        const { error: uploadError } = await uploadPromise
        if (!uploadError) {
            const { data } = supabase.storage.from('car_docs').getPublicUrl(filePath)
            await supabase.from('cars').update({ registration_image_url: data.publicUrl }).eq('id', carId)
            setCar(prev => ({ ...prev, registration_image_url: data.publicUrl }))
        }
      }
    } catch (error) {
      alert('오류 발생: 다시 시도해주세요.')
    } finally {
      setUploading(false)
      setIsAnalyzing(false)
    }
  }

  const f = (n: any) => Number(n || 0).toLocaleString()

  if (loading) return <div className="p-10 text-center font-bold">로딩 중...</div>

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900">{car.number || '차량번호 미입력'}</h1>
          <p className="text-gray-500 font-medium">{car.model || '모델명 미입력'}</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => router.push(`/registration`)} className="bg-white border border-gray-300 text-gray-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-50">
            목록
            </button>
            <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-md">
            저장하기
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* 📝 좌측: 입력 폼 (등록증 순서대로 배치) */}
        <div className="lg:col-span-7 space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 relative">
                {isAnalyzing && (
                    <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center rounded-2xl backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                        <p className="text-xl font-bold text-blue-600">등록증 읽는 중...</p>
                    </div>
                )}

                {/* ① 기본 정보 섹션 */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                        <span className="w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center text-xs mr-2">1</span>
                        기본 정보
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                            <label className="text-xs font-bold text-gray-500 mb-1 block">차량번호</label>
                            <input className="w-full p-3 bg-gray-50 border rounded-lg font-bold text-lg" value={car.number || ''} onChange={e => handleChange('number', e.target.value)} />
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs font-bold text-gray-500 mb-1 block">차종/모델명</label>
                            <input className="w-full p-3 bg-gray-50 border rounded-lg font-bold text-lg" value={car.model || ''} onChange={e => handleChange('model', e.target.value)} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-gray-500 mb-1 block">소유자 (성명/법인명)</label>
                            <input className="w-full p-3 bg-gray-50 border rounded-lg font-bold" value={car.owner_name || ''} onChange={e => handleChange('owner_name', e.target.value)} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-gray-500 mb-1 block">사용본거지 (주소)</label>
                            <div className="flex gap-2">
                                <input className="flex-1 p-3 bg-gray-50 border rounded-lg" value={car.location || ''} readOnly />
                                <button onClick={handleAddressSearch} className="bg-gray-800 text-white px-4 rounded-lg text-sm font-bold">검색</button>
                            </div>
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs font-bold text-gray-500 mb-1 block">최초등록일</label>
                            <input type="date" className="w-full p-3 bg-gray-50 border rounded-lg font-bold" value={car.registration_date || ''} onChange={e => handleChange('registration_date', e.target.value)} />
                        </div>
                        <div className="col-span-1">
                             <label className="text-xs font-bold text-gray-500 mb-1 block">차대번호 (VIN)</label>
                             <input className="w-full p-3 bg-gray-50 border rounded-lg font-mono text-sm" value={car.vin || ''} onChange={e => handleChange('vin', e.target.value)} />
                        </div>
                    </div>
                </div>

                <hr className="border-gray-100 my-8" />

                {/* ② 제원 정보 섹션 */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                        <span className="w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center text-xs mr-2">2</span>
                        제원 정보
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                         <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">연료</label>
                            <select className="w-full p-3 bg-gray-50 border rounded-lg font-bold" value={car.fuel_type || ''} onChange={e => handleChange('fuel_type', e.target.value)}>
                                <option value="미확인">선택</option><option value="휘발유">휘발유</option><option value="경유">경유</option><option value="LPG">LPG</option><option value="전기">전기</option><option value="하이브리드">하이브리드</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">배기량/용량</label>
                            <div className="relative">
                                <input className="w-full p-3 bg-gray-50 border rounded-lg font-bold text-right pr-8" value={car.displacement || ''} onChange={e => handleChange('displacement', e.target.value)} />
                                <span className="absolute right-3 top-3 text-gray-400 text-sm">cc</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">승차정원</label>
                            <div className="relative">
                                <input className="w-full p-3 bg-gray-50 border rounded-lg font-bold text-right pr-8" value={car.capacity || ''} onChange={e => handleChange('capacity', e.target.value)} />
                                <span className="absolute right-3 top-3 text-gray-400 text-sm">명</span>
                            </div>
                        </div>
                    </div>
                </div>

                <hr className="border-gray-100 my-8" />

                {/* ③ 검사 및 가격 (하단) */}
                <div>
                    <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center">
                        <span className="w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-xs mr-2">3</span>
                        중요 관리 정보
                    </h3>
                    <div className="bg-red-50 p-6 rounded-xl border border-red-100 grid grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs font-bold text-red-800 mb-1 block">검사유효기간 만료일</label>
                            <input type="date" className="w-full p-3 bg-white border border-red-200 rounded-lg font-bold text-red-900" value={car.inspection_end_date || ''} onChange={e => handleChange('inspection_end_date', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-600 mb-1 block">취득가액 (부가세 제외)</label>
                            <input className="w-full p-3 bg-white border border-red-200 rounded-lg font-bold text-right" value={f(car.purchase_price)} onChange={e => handleChange('purchase_price', e.target.value.replace(/,/g, ''))} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-gray-600 mb-1 block">비고 / 특이사항</label>
                            <textarea className="w-full p-3 bg-white border rounded-lg resize-none h-24 text-sm" value={car.notes || ''} onChange={e => handleChange('notes', e.target.value)} placeholder="차령만료일 등 특이사항이 자동 입력됩니다." />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* 📷 우측: 등록증 뷰어 & 업로드 버튼 */}
        <div className="lg:col-span-5">
            <div className="sticky top-6 space-y-4">
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-800 mb-4">등록증 원본 이미지</h3>
                    <div className="aspect-[1/1.4] bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden relative group">
                        {car.registration_image_url ? (
                            <>
                                <img src={car.registration_image_url} className="w-full h-full object-contain" alt="등록증" />
                                <a href={car.registration_image_url} target="_blank" rel="noreferrer" className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold opacity-0 group-hover:opacity-100 transition-all cursor-zoom-in">
                                    🔍 크게 보기
                                </a>
                            </>
                        ) : (
                            <div className="text-center text-gray-400">
                                <p className="text-4xl mb-2">📷</p>
                                <p>등록증 이미지가 없습니다</p>
                            </div>
                        )}
                    </div>
                 </div>

                 <label className={`block w-full py-4 rounded-xl font-bold text-center text-lg shadow-lg cursor-pointer transition-all ${uploading ? 'bg-gray-400 text-gray-100' : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-[1.02]'}`}>
                    {uploading ? 'AI가 문서를 읽고 있습니다...' : '📸 이미지 업로드 & AI 자동분석'}
                    <input type="file" className="hidden" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" onChange={handleFileUpload} disabled={uploading} />
                 </label>
                 <p className="text-center text-xs text-gray-500">
                    Gemini 2.5 Pro 엔진이 차량번호, 차종, 제원, 검사일을 자동으로 입력합니다.
                 </p>
            </div>
        </div>

      </div>
    </div>
  )
}
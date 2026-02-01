'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase'
import { useDaumPostcodePopup } from 'react-daum-postcode'

export default function RegistrationPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()
  const open = useDaumPostcodePopup('https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js')

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  // 🤖 AI 분석 상태 추가
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // 상태 관리
  const [car, setCar] = useState({
    number: '', model: '', brand: '',
    vin: '', owner_name: '', registration_date: '',
    location: '', address_detail: '',
    capacity: '', displacement: '', fuel: '',
    inspection_end_date: '', vehicle_age_expiry: '',
    purchase_price: 0,
    registration_image_url: ''
  })

  useEffect(() => {
    if (!carId) return
    const fetchData = async () => {
      const { data } = await supabase.from('cars').select('*').eq('id', carId).single()
      if (data) setCar(data)
      setLoading(false)
    }
    fetchData()
  }, [carId])

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
    const { error } = await supabase.from('cars').update(car).eq('id', carId)
    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 차량 정보가 저장되었습니다!'); window.location.reload(); }
  }

  // 🔥 [핵심] 파일 업로드 및 AI 자동 분석 함수
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    const file = e.target.files[0]
    setUploading(true)     // 업로드 중 표시
    setIsAnalyzing(true)   // AI 분석 중 표시

    try {
      // 1. [병렬 처리 A] Supabase 스토리지에 파일 업로드
      const fileExt = file.name.split('.').pop()
      const fileName = `${carId}_registration.${fileExt}`
      const filePath = `registration/${fileName}`

      const uploadPromise = supabase.storage.from('car_docs').upload(filePath, file, { upsert: true })

      // 2. [병렬 처리 B] 이미지를 Base64로 변환 후 AI에게 전송 (OCR)
      const reader = new FileReader()
      reader.readAsDataURL(file)

      reader.onload = async () => {
        const base64 = reader.result

        // AI API 호출
        const ocrResponse = await fetch('/api/ocr-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64 })
        })
        const ocrData = await ocrResponse.json()

        // 3. AI 결과를 폼에 자동 입력 ⚡️
        if (!ocrData.error) {
            setCar(prev => ({
                ...prev,
                number: ocrData.car_number || prev.number,
                model: ocrData.model_name || prev.model,
                vin: ocrData.vin || prev.vin,
                owner_name: ocrData.owner_name || prev.owner_name,
                registration_date: ocrData.registration_date || prev.registration_date,
                location: ocrData.location || prev.location, // 주소
                capacity: ocrData.capacity || prev.capacity, // 승차정원
                displacement: ocrData.displacement || prev.displacement, // 배기량
                fuel: ocrData.fuel_type || prev.fuel, // 연료
                inspection_end_date: ocrData.inspection_end_date || prev.inspection_end_date // 검사만료일
            }))
            alert('🤖 AI가 등록증 내용을 자동으로 읽어왔습니다!')
        }

        // 4. 업로드 완료 처리 (이미지 URL 업데이트)
        const { error: uploadError } = await uploadPromise
        if (!uploadError) {
            const { data } = supabase.storage.from('car_docs').getPublicUrl(filePath)
            await supabase.from('cars').update({ registration_image_url: data.publicUrl }).eq('id', carId)
            setCar(prev => ({ ...prev, registration_image_url: data.publicUrl }))
        }
      }

    } catch (error) {
      alert('처리 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
      setIsAnalyzing(false)
    }
  }

  const f = (n: any) => Number(n || 0).toLocaleString()

  if (loading) return <div className="p-10 text-center">로딩 중...</div>

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 animate-fade-in">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-8 pb-4 border-b">
        <div>
          <span className="text-gray-500 text-sm font-bold">자동차등록증 관리</span>
          <h1 className="text-3xl font-black">{car.number || '차량번호 미입력'} <span className="text-lg text-gray-500 font-normal">{car.model}</span></h1>
        </div>
        <button onClick={() => router.push(`/cars/${carId}`)} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-200">
          ← 상세화면 복귀
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

        {/* 📝 왼쪽: 등록증 입력 폼 */}
        <div className="lg:col-span-8 space-y-6">
            <div className="bg-white p-10 rounded-xl border-2 border-gray-300 shadow-sm relative">
                {/* AI 분석 중일 때 오버레이 */}
                {isAnalyzing && (
                    <div className="absolute inset-0 bg-white/80 z-10 flex flex-col items-center justify-center backdrop-blur-sm rounded-xl">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
                        <p className="text-xl font-black text-blue-600 animate-pulse">🤖 AI가 등록증을 읽고 있습니다...</p>
                        <p className="text-sm text-gray-500">빈칸이 자동으로 채워집니다!</p>
                    </div>
                )}

                <div className="absolute top-5 right-5 opacity-10 font-black text-6xl text-gray-300 select-none pointer-events-none">등록증</div>
                <h3 className="text-center text-3xl font-black mb-10 border-b-2 border-black pb-4">자 동 차 등 록 증</h3>

                <div className="grid grid-cols-2 gap-x-8 gap-y-6 text-sm">
                    {/* ... (입력 필드들은 기존과 동일, value는 car state와 연결됨) ... */}
                    <div className="col-span-1">
                        <label className="block font-bold text-gray-500 mb-1">① 자동차등록번호</label>
                        <input className="w-full p-2 border-b-2 border-gray-200 bg-gray-50 font-bold text-xl focus:border-black outline-none"
                            value={car.number} onChange={e => handleChange('number', e.target.value)} />
                    </div>
                    <div className="col-span-1">
                        <label className="block font-bold text-gray-500 mb-1">② 차종 / 모델</label>
                        <input className="w-full p-2 border-b-2 border-gray-200 bg-gray-50 font-bold text-lg focus:border-black outline-none"
                            value={car.model} onChange={e => handleChange('model', e.target.value)} />
                    </div>

                    <div className="col-span-2">
                        <label className="block font-bold text-blue-600 mb-1">⑥ 차대번호 (VIN)</label>
                        <input className="w-full p-2 border-b-2 border-blue-100 bg-blue-50/30 font-mono font-bold text-xl tracking-widest uppercase focus:border-blue-500 outline-none"
                            placeholder="KMH..." value={car.vin || ''} onChange={e => handleChange('vin', e.target.value)} />
                    </div>

                    <div className="col-span-1">
                        <label className="block font-bold text-gray-500 mb-1">⑨ 소유자 (명칭)</label>
                        <input className="w-full p-2 border-b-2 border-gray-200 focus:border-black outline-none font-bold"
                            value={car.owner_name || ''} onChange={e => handleChange('owner_name', e.target.value)} />
                    </div>
                     <div className="col-span-1">
                        <label className="block font-bold text-gray-500 mb-1">최초등록일</label>
                        <input type="date" className="w-full p-2 border-b-2 border-gray-200 focus:border-black outline-none"
                            value={car.registration_date || ''} onChange={e => handleChange('registration_date', e.target.value)} />
                    </div>

                    <div className="col-span-2 space-y-2 mt-2">
                        <label className="block font-bold text-gray-800">⑧ 사용본거지 (주소)</label>
                        <div className="flex gap-2">
                            <input className="flex-1 p-2 border-b-2 border-gray-200 bg-gray-50 cursor-pointer text-gray-700"
                                readOnly value={car.location || ''} placeholder="주소 검색 버튼을 눌러주세요" onClick={handleAddressSearch} />
                            <button onClick={handleAddressSearch} className="bg-black text-white px-4 py-2 rounded text-xs font-bold hover:bg-gray-800">
                                🔍 주소검색
                            </button>
                        </div>
                        <input className="w-full p-2 border-b-2 border-gray-200 focus:border-black outline-none"
                            placeholder="상세주소 입력 (예: 101동 102호)" value={car.address_detail || ''} onChange={e => handleChange('address_detail', e.target.value)} />
                    </div>

                    {/* 제원 정보 */}
                    <div className="col-span-2 grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 mt-2">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">승차정원</label>
                            <input className="w-full p-1 border-b border-gray-300 bg-transparent font-bold text-center"
                                placeholder="예: 5명" value={car.capacity || ''} onChange={e => handleChange('capacity', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">배기량</label>
                            <input className="w-full p-1 border-b border-gray-300 bg-transparent font-bold text-center"
                                placeholder="예: 1998cc" value={car.displacement || ''} onChange={e => handleChange('displacement', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">연료(유종)</label>
                            <select className="w-full p-1 border-b border-gray-300 bg-transparent font-bold text-center"
                                value={car.fuel} onChange={e => handleChange('fuel', e.target.value)}>
                                <option value="휘발유">휘발유</option><option value="경유">경유</option><option value="LPG">LPG</option><option value="전기">전기</option><option value="하이브리드">하이브리드</option><option value="수소">수소</option>
                            </select>
                        </div>
                    </div>

                    <div className="col-span-2 mt-2 bg-yellow-50 p-4 rounded border border-yellow-200 space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="font-bold text-yellow-900">④ 검사 유효기간 만료일</label>
                            <div className="flex items-center gap-2">
                                <input type="date" className="p-2 border rounded font-bold"
                                    value={car.inspection_end_date || ''} onChange={e => handleChange('inspection_end_date', e.target.value)} />
                                {car.inspection_end_date && (
                                    <span className={`text-xs px-2 py-1 rounded font-bold text-white ${new Date(car.inspection_end_date) < new Date() ? 'bg-red-500' : 'bg-green-500'}`}>
                                        {new Date(car.inspection_end_date) < new Date() ? '만료됨' : '유효함'}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-yellow-200/50">
                            <label className="font-bold text-yellow-900">⏳ 차령 만료일 (영업용)</label>
                            <input type="date" className="p-2 border rounded font-bold bg-white"
                                value={car.vehicle_age_expiry || ''} onChange={e => handleChange('vehicle_age_expiry', e.target.value)} />
                        </div>
                    </div>

                    <div className="col-span-2 mt-2">
                         <label className="block font-bold text-gray-500 mb-1">취득가격 (부가세 제외)</label>
                         <input className="w-full p-2 border-b-2 border-gray-200 font-bold text-right"
                            value={f(car.purchase_price)} onChange={e => handleChange('purchase_price', Number(e.target.value.replace(/,/g, '')))} />
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-dashed text-center">
                    <button onClick={handleSave} className="bg-black text-white px-12 py-4 rounded-xl font-bold text-lg hover:bg-gray-800 shadow-lg transition-transform hover:-translate-y-1">
                        💾 저장하기
                    </button>
                </div>
            </div>
        </div>

        {/* 📷 오른쪽: 파일 업로더 */}
        <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-2xl border shadow-sm sticky top-10">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    📂 등록증 원본 파일
                    {isAnalyzing && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded animate-pulse">분석 중...</span>}
                </h3>

                <div className={`aspect-[1/1.4] bg-gray-100 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden relative group mb-4 transition-colors ${isAnalyzing ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}>
                    {car.registration_image_url ? (
                        <>
                            <img src={car.registration_image_url} className="w-full h-full object-contain" />
                            <a href={car.registration_image_url} target="_blank" className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                <span className="text-4xl mb-2">🔍</span>
                                <span>크게 보기</span>
                            </a>
                        </>
                    ) : (
                        <div className="text-center text-gray-400 p-4">
                            <p className="text-4xl mb-2">📷</p>
                            <p className="text-sm">등록된 파일이 없습니다.</p>
                        </div>
                    )}
                </div>

                <label className="block w-full cursor-pointer">
                    <div className={`w-full py-4 rounded-xl font-bold text-center border transition-all ${
                        uploading ? 'bg-gray-100 text-gray-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg transform hover:-translate-y-1'
                    }`}>
                        {uploading ? '파일 처리 중...' : '✨ AI 자동 분석 및 업로드'}
                    </div>
                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileUpload} disabled={uploading} />
                </label>

                <p className="text-xs text-gray-400 text-center mt-2">
                    * 이미지를 업로드하면 AI가 내용을 자동으로 입력합니다.
                </p>
            </div>
        </div>

      </div>
    </div>
  )
}
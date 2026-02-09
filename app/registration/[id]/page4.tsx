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

  // ✅ 모든 필드 포함 (비고, 차령만료일 등 추가됨)
  const [car, setCar] = useState({
    number: '', model: '', brand: '', vin: '', owner_name: '',
    registration_date: '', acq_date: '',
    location: '', address_detail: '',
    capacity: '', displacement: '', fuel_type: '',
    inspection_end_date: '', vehicle_age_expiry: '', // 🆕 차령만료일
    purchase_price: 0,
    registration_image_url: '',
    notes: '' // 🆕 비고/특이사항
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
      // 데이터 바인딩 (없으면 빈값 처리)
      setCar({
        ...data,
        fuel_type: data.fuel_type || '미확인',
        location: data.location || '',
        capacity: data.capacity || '',
        displacement: data.displacement || '',
        vehicle_age_expiry: data.vehicle_age_expiry || '',
        notes: data.notes || ''
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
            // ✅ AI가 찾아온 모든 데이터 업데이트
            setCar(prev => ({
                ...prev,
                number: ocrData.car_number || prev.number,
                model: ocrData.model_name || prev.model,
                vin: ocrData.vin || prev.vin,
                owner_name: ocrData.owner_name || prev.owner_name,
                registration_date: ocrData.registration_date || prev.registration_date,
                location: ocrData.location || prev.location,
                capacity: ocrData.capacity || prev.capacity,
                displacement: ocrData.displacement || prev.displacement,
                fuel_type: ocrData.fuel_type || prev.fuel_type,
                inspection_end_date: ocrData.inspection_end_date || prev.inspection_end_date,
                vehicle_age_expiry: ocrData.vehicle_age_expiry || prev.vehicle_age_expiry,
                purchase_price: ocrData.purchase_price || prev.purchase_price
            }))
            alert('🤖 상세 정보까지 분석 완료!')
        }

        const { error: uploadError } = await uploadPromise
        if (!uploadError) {
            const { data } = supabase.storage.from('car_docs').getPublicUrl(filePath)
            await supabase.from('cars').update({ registration_image_url: data.publicUrl }).eq('id', carId)
            setCar(prev => ({ ...prev, registration_image_url: data.publicUrl }))
        }
      }
    } catch (error) {
      alert('오류 발생')
    } finally {
      setUploading(false)
      setIsAnalyzing(false)
    }
  }

  const f = (n: any) => Number(n || 0).toLocaleString()

  if (loading) return <div className="p-10 text-center font-bold">로딩 중...</div>

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 animate-fade-in">
      <div className="flex justify-between items-center mb-8 pb-4 border-b">
        <div>
          <span className="text-gray-500 text-sm font-bold">차량 상세 정보</span>
          <h1 className="text-3xl font-black">{car.number} <span className="text-lg text-gray-500 font-normal">{car.model}</span></h1>
        </div>
        <button onClick={() => router.push(`/registration`)} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-200">
          ← 목록으로
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* 📝 입력 폼 */}
        <div className="lg:col-span-8 space-y-6">
            <div className="bg-white p-8 rounded-xl border-2 border-gray-300 shadow-sm relative">
                {isAnalyzing && (
                    <div className="absolute inset-0 bg-white/90 z-10 flex flex-col items-center justify-center rounded-xl">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600 mb-4"></div>
                        <p className="text-lg font-bold text-blue-600">AI 정밀 분석 중...</p>
                    </div>
                )}

                <h3 className="text-xl font-bold mb-6 border-b pb-2">기본 정보</h3>
                <div className="grid grid-cols-2 gap-6 mb-8">
                    <div><label className="text-xs font-bold text-gray-500">차량번호</label><input className="w-full p-2 border-b font-bold text-lg" value={car.number || ''} onChange={e => handleChange('number', e.target.value)} /></div>
                    <div><label className="text-xs font-bold text-gray-500">차종/모델</label><input className="w-full p-2 border-b font-bold text-lg" value={car.model || ''} onChange={e => handleChange('model', e.target.value)} /></div>
                    <div className="col-span-2"><label className="text-xs font-bold text-blue-600">차대번호 (VIN)</label><input className="w-full p-2 border-b font-mono font-bold text-lg tracking-wider" value={car.vin || ''} onChange={e => handleChange('vin', e.target.value)} /></div>
                    <div><label className="text-xs font-bold text-gray-500">소유자</label><input className="w-full p-2 border-b font-bold" value={car.owner_name || ''} onChange={e => handleChange('owner_name', e.target.value)} /></div>
                    <div><label className="text-xs font-bold text-gray-500">최초등록일</label><input type="date" className="w-full p-2 border-b font-bold" value={car.registration_date || ''} onChange={e => handleChange('registration_date', e.target.value)} /></div>
                </div>

                <h3 className="text-xl font-bold mb-6 border-b pb-2 mt-10">제원 및 주소</h3>
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div><label className="text-xs font-bold text-gray-500">배기량 (cc)</label><input className="w-full p-2 border rounded bg-gray-50 text-center font-bold" value={car.displacement || ''} onChange={e => handleChange('displacement', e.target.value)} /></div>
                    <div><label className="text-xs font-bold text-gray-500">승차정원 (명)</label><input className="w-full p-2 border rounded bg-gray-50 text-center font-bold" value={car.capacity || ''} onChange={e => handleChange('capacity', e.target.value)} /></div>
                    <div>
                        <label className="text-xs font-bold text-gray-500">연료</label>
                        <select className="w-full p-2 border rounded bg-gray-50 font-bold text-center" value={car.fuel_type || ''} onChange={e => handleChange('fuel_type', e.target.value || '')}>
                            <option value="미확인">선택</option><option value="휘발유">휘발유</option><option value="경유">경유</option><option value="LPG">LPG</option><option value="전기">전기</option><option value="하이브리드">하이브리드</option>
                        </select>
                    </div>
                </div>
                <div className="mb-6">
                    <label className="text-xs font-bold text-gray-500">사용본거지</label>
                    <div className="flex gap-2 mt-1">
                        <input className="flex-1 p-2 border rounded bg-gray-50" value={car.location || ''} readOnly onClick={handleAddressSearch} placeholder="주소 검색" />
                        <button onClick={handleAddressSearch} className="bg-black text-white px-3 rounded text-sm">검색</button>
                    </div>
                </div>

                <h3 className="text-xl font-bold mb-6 border-b pb-2 mt-10 text-red-600">관리 정보 (중요)</h3>
                <div className="bg-red-50 p-6 rounded-xl border border-red-100 space-y-4">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-red-800 mb-1">검사 유효기간 만료일</label>
                            <input
                                type="date"
                                className="w-full p-2 border rounded font-bold"
                                // 👇 [수정] 뒤에 || '' 를 붙여서 null 에러 방지
                                value={car.inspection_end_date || ''}
                                onChange={e => handleChange('inspection_end_date', e.target.value || '')}
                                />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-red-800 mb-1">차령 만료일 (영업용)</label>
                            <input type="date" className="w-full p-2 border rounded font-bold" value={car.vehicle_age_expiry || ''} onChange={e => handleChange('vehicle_age_expiry', e.target.value)} />
                        </div>
                    </div>
                    <div className="border-t border-red-200 my-4 pt-4 grid grid-cols-2 gap-6">
                         <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">실제 취득일자</label>
                            <input type="date" className="w-full p-2 border rounded font-bold" value={car.acq_date || ''} onChange={e => handleChange('acq_date', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">취득가액 (원)</label>
                            <input className="w-full p-2 border rounded font-bold text-right" value={f(car.purchase_price || '')} onChange={e => handleChange('purchase_price', e.target.value.replace(/,/g, ''))} />
                        </div>
                    </div>
                </div>

                {/* 🆕 비고/특이사항 섹션 */}
                <h3 className="text-xl font-bold mb-4 border-b pb-2 mt-10">비고 / 특이사항</h3>
                <textarea
                    className="w-full h-32 p-4 border-2 border-gray-200 rounded-xl resize-none focus:border-black outline-none transition-colors"
                    placeholder="차량 관련 특이사항, 정비 내역, 메모 등을 자유롭게 입력하세요."
                    value={car.notes}
                    onChange={e => handleChange('notes', e.target.value || '')}
                />

                <div className="mt-8 pt-6 border-t text-center">
                    <button onClick={handleSave} className="bg-black text-white px-16 py-4 rounded-xl font-bold text-xl hover:bg-gray-800 shadow-lg transform transition hover:-translate-y-1">
                        저장하기
                    </button>
                </div>
            </div>
        </div>

        {/* 📷 파일 뷰어 */}
        <div className="lg:col-span-4">
            <div className="bg-white p-6 rounded-2xl border shadow-sm sticky top-10">
                <h3 className="font-bold text-lg mb-4">등록증 이미지</h3>
                <div className="aspect-[1/1.4] bg-gray-100 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden relative group mb-4">
                    {car.registration_image_url ? (
                        <>
                            <img src={car.registration_image_url} className="w-full h-full object-contain" alt="등록증" />
                            <a href={car.registration_image_url} target="_blank" rel="noreferrer" className="absolute inset-0 bg-black/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">크게 보기</a>
                        </>
                    ) : <span className="text-gray-400">이미지 없음</span>}
                </div>
                <label className="block w-full cursor-pointer bg-blue-600 text-white py-3 rounded-xl font-bold text-center hover:bg-blue-700">
                    {uploading ? '분석 중...' : '이미지 재업로드 (AI 분석)'}
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={uploading} />
                </label>
            </div>
        </div>
      </div>
    </div>
  )
}
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
// 👇 [중요] 경로를 두 단계 위로 수정했습니다. (폴더 구조에 따라 ../../ 가 맞습니다)
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useDaumPostcodePopup } from 'react-daum-postcode'

// 🛠️ [유틸리티] 데이터 정제
const normalizeModelName = (name: string) => {
  if (!name) return '';
  return name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9가-힣]/g, '').toUpperCase();
}

const cleanDate = (dateStr: any) => {
  if (!dateStr) return null;
  const nums = String(dateStr).replace(/[^0-9]/g, '');
  if (nums.length === 8) return `${nums.slice(0, 4)}-${nums.slice(4, 6)}-${nums.slice(6, 8)}`;
  return null;
}

const cleanNumber = (numStr: any) => {
  if (!numStr) return 0;
  return Number(String(numStr).replace(/[^0-9]/g, '')) || 0;
}

export default function RegistrationDetailPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()
  // 다음 우편번호 서비스 URL (안전하게 https 사용)
  const open = useDaumPostcodePopup('https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js')

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  // 🖼️ 이미지 확대 모달 상태
  const [isImageModalOpen, setIsImageModalOpen] = useState(false)

  // 🚙 차량 데이터
  const [car, setCar] = useState<any>({
    number: '', model: '', brand: '', vin: '', owner_name: '',
    registration_date: '', location: '', capacity: '', displacement: '', 
    fuel_type: '', inspection_end_date: '', vehicle_age_expiry: '',
    purchase_price: 0, registration_image_url: '', notes: '',
    model_code: ''
  })

  // 🎛️ 트림 선택 데이터
  const [trims, setTrims] = useState<any[]>([])
  const [selectedTrimId, setSelectedTrimId] = useState<string>('')

  // 1. 초기 데이터 로드
  useEffect(() => {
    if (!carId) return
    fetchCarData()
  }, [carId])

  // 2. 모델명이 바뀌면 트림 목록을 다시 불러옴
  useEffect(() => {
    if (car.model) {
        fetchTrimsForModel(car.model)
    }
  }, [car.model])

  const fetchCarData = async () => {
    try {
        const { data, error } = await supabase.from('cars').select('*').eq('id', carId).single()
        
        if (error) {
            console.error("🔥 데이터 로딩 에러:", error)
            throw error
        }
        
        if (!data) {
            alert("해당 차량 데이터를 찾을 수 없습니다.")
            router.push('/registration')
            return
        }

        setCar({
          ...data,
          purchase_price: data.purchase_price || 0,
          registration_date: cleanDate(data.registration_date),
          inspection_end_date: cleanDate(data.inspection_end_date),
          vehicle_age_expiry: cleanDate(data.vehicle_age_expiry),
        })
    } catch (err: any) {
        alert("데이터를 불러오는 중 오류가 발생했습니다: " + err.message)
    } finally {
        setLoading(false) // 성공하든 실패하든 로딩 끄기
    }
  }

  const fetchTrimsForModel = async (modelName: string) => {
    const cleanName = normalizeModelName(modelName)
    if (!cleanName) return;

    const { data: modelData } = await supabase
        .from('car_code_models')
        .select('id')
        .or(`model_name.ilike.%${cleanName}%, code.eq.${cleanName}`)
        .limit(1)
        .single()

    if (modelData) {
        const { data: trimData } = await supabase
            .from('car_code_trims')
            .select('*')
            .eq('model_id', modelData.id)
            .order('price', { ascending: true })
        
        setTrims(trimData || [])
    } else {
        setTrims([])
    }
  }

  const handleChange = (field: string, value: any) => {
    setCar((prev: any) => ({ ...prev, [field]: value }))
  }

  const handleComplete = (data: any) => {
    let fullAddress = data.address
    let extraAddress = ''
    if (data.addressType === 'R') {
      if (data.bname !== '') extraAddress += data.bname
      if (data.buildingName !== '') extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName)
      fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '')
    }
    setCar((prev: any) => ({ ...prev, location: fullAddress }))
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

      // 1. 업로드
      await supabase.storage.from('car_docs').upload(filePath, file, { upsert: true })
      const { data: urlData } = supabase.storage.from('car_docs').getPublicUrl(filePath)
      const finalPublicUrl = urlData.publicUrl

      // 2. AI 분석
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = async () => {
        const base64 = reader.result
        const response = await fetch('/api/ocr-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64 })
        })
        const result = await response.json()

        if (!result.error) {
            console.log("🔍 AI 원본:", result);

            const detectedModel = result.model_name || result.model || '미확인 모델';
            const detectedYear = result.year || new Date().getFullYear();

            // 🆕 3. AI 트림 정보 DB 자동 등록
            if (detectedModel !== '미확인 모델') {
                const { data: modelData } = await supabase
                    .from('car_code_models')
                    .upsert(
                        { brand: '기타', model_name: detectedModel, year: detectedYear },
                        { onConflict: 'model_name, year' }
                    )
                    .select().single();

                if (modelData && result.trims && result.trims.length > 0) {
                    const trimsToInsert = result.trims.map((t: any) => ({
                        model_id: modelData.id,
                        trim_name: t.name,
                        price: t.price || 0,
                        fuel_type: result.fuel_type || '기타'
                    }));
                    await supabase.from('car_code_trims').insert(trimsToInsert);
                }
            }

            setCar((prev: any) => ({
                ...prev,
                number: result.car_number || prev.number,
                model: detectedModel,
                vin: result.vin || prev.vin,
                owner_name: result.owner_name || prev.owner_name,
                location: result.location || prev.location,
                
                registration_date: cleanDate(result.registration_date) || prev.registration_date,
                inspection_end_date: cleanDate(result.inspection_end_date) || prev.inspection_end_date,
                vehicle_age_expiry: cleanDate(result.vehicle_age_expiry) || prev.vehicle_age_expiry,
                
                capacity: cleanNumber(result.capacity) || prev.capacity,
                displacement: cleanNumber(result.displacement) || prev.displacement,
                fuel_type: result.fuel_type || prev.fuel_type,
                purchase_price: cleanNumber(result.purchase_price) || prev.purchase_price,
                
                registration_image_url: finalPublicUrl
            }))
            
            alert(`✅ 분석 완료! [${detectedModel}] 트림 정보를 불러왔습니다.`);
        }
      }
    } catch (error: any) {
      alert('오류 발생: ' + error.message)
    } finally {
      setUploading(false)
      setIsAnalyzing(false)
    }
  }

  const handleSave = async () => {
    let finalModelName = car.model;
    if (selectedTrimId) {
        const trim = trims.find(t => t.id === Number(selectedTrimId));
        if (trim && !car.model.includes(trim.trim_name)) {
            finalModelName = `${car.model} ${trim.trim_name}`;
        }
    }

    const { error } = await supabase.from('cars').update({
        ...car,
        model: finalModelName,
        purchase_price: cleanNumber(car.purchase_price),
        registration_date: cleanDate(car.registration_date),
        inspection_end_date: cleanDate(car.inspection_end_date),
        vehicle_age_expiry: cleanDate(car.vehicle_age_expiry)
    }).eq('id', carId)

    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 저장되었습니다!'); window.location.reload(); }
  }

  const f = (n: any) => Number(n || 0).toLocaleString()
  if (loading) return <div className="p-10 text-center font-bold">로딩 중...</div>

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 bg-gray-50 min-h-screen flex gap-8">
      {/* 왼쪽 정보 영역 */}
      <div className="flex-1 space-y-6">
        <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-black">{car.number}</h1>
              <p className="text-gray-500">{car.model}</p>
            </div>
            <div className="flex gap-2">
                <button onClick={() => router.push('/registration')} className="bg-white border px-4 py-2 rounded-lg font-bold">목록</button>
                <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">저장하기</button>
            </div>
        </div>

        {/* AI 분석 로딩 오버레이 */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border relative">
            {isAnalyzing && (
                <div className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center rounded-2xl">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                    <p className="text-xl font-bold text-blue-600">AI가 정보를 분석 중입니다...</p>
                </div>
            )}

            <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 mb-8">
                <h3 className="font-bold text-blue-800 mb-4">🅰️ 차종 및 트림 선택 (자동인식)</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-blue-600 mb-1 block">차종 (AI)</label>
                        <input className="w-full p-3 bg-white border border-blue-200 rounded-lg font-bold text-lg" value={car.model} readOnly />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">상세 트림 (AI 추천)</label>
                        <select 
                            className="w-full p-3 bg-white border rounded-lg font-bold"
                            value={selectedTrimId}
                            onChange={(e) => setSelectedTrimId(e.target.value)}
                            disabled={trims.length === 0}
                        >
                            <option value="">{trims.length > 0 ? '트림을 선택하세요' : 'AI 분석 후 선택 가능'}</option>
                            {trims.map((t: any) => (
                                <option key={t.id} value={t.id}>{t.trim_name} (+{f(t.price)}원)</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="mb-8">
                <h3 className="font-bold text-gray-800 mb-4">기본 정보</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="label">차량번호</label><input className="input" value={car.number} onChange={e=>handleChange('number', e.target.value)} /></div>
                    <div><label className="label">소유자</label><input className="input" value={car.owner_name} onChange={e=>handleChange('owner_name', e.target.value)} /></div>
                    <div className="col-span-2">
                         <label className="label">사용본거지</label>
                         <div className="flex gap-2">
                            <input className="input flex-1" value={car.location} readOnly />
                            <button onClick={()=>open({onComplete: handleComplete})} className="bg-gray-800 text-white px-4 rounded-lg text-sm font-bold">검색</button>
                         </div>
                    </div>
                    <div><label className="label">최초등록일</label><input type="date" className="input" value={car.registration_date || ''} onChange={e=>handleChange('registration_date', e.target.value)} /></div>
                    <div><label className="label">차대번호</label><input className="input font-mono" value={car.vin} onChange={e=>handleChange('vin', e.target.value)} /></div>
                </div>
            </div>

            <div className="bg-red-50 p-6 rounded-xl border border-red-100">
                <h3 className="font-bold text-red-800 mb-4">주요 날짜 및 제원</h3>
                <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="text-xs font-bold text-red-800 mb-1 block">검사유효기간 만료일</label>
                        <input type="date" className="w-full p-3 bg-white border border-red-200 rounded-lg font-bold text-red-600" value={car.inspection_end_date || ''} onChange={e=>handleChange('inspection_end_date', e.target.value)} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-red-800 mb-1 block">차령 만료일 (영업용)</label>
                        <input type="date" className="w-full p-3 bg-white border border-red-200 rounded-lg font-bold text-red-600" value={car.vehicle_age_expiry || ''} onChange={e=>handleChange('vehicle_age_expiry', e.target.value)} />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                     <div><label className="label">연료</label><input className="input" value={car.fuel_type} onChange={e=>handleChange('fuel_type', e.target.value)}/></div>
                     <div><label className="label">배기량</label><input className="input text-right" value={car.displacement} onChange={e=>handleChange('displacement', e.target.value)}/></div>
                     <div><label className="label">승차정원</label><input className="input text-right" value={car.capacity} onChange={e=>handleChange('capacity', e.target.value)}/></div>
                </div>
                <div className="mt-4">
                    <label className="label">취득가액</label>
                    <input className="input text-right text-lg text-blue-600" value={f(car.purchase_price)} onChange={e=>handleChange('purchase_price', e.target.value.replace(/,/g, ''))}/>
                </div>
            </div>
            
            <div className="mt-8">
                <label className="label">비고</label>
                <textarea className="w-full h-24 p-4 border rounded-xl resize-none" value={car.notes} onChange={e=>handleChange('notes', e.target.value)} placeholder="특이사항 입력"></textarea>
            </div>
        </div>
      </div>

      <div className="w-[400px]">
        <div className="sticky top-6">
            <div className="bg-white p-4 rounded-2xl shadow-sm border mb-4">
                <h3 className="font-bold text-gray-800 mb-4">등록증 이미지</h3>
                <div 
                    className="aspect-[1/1.4] bg-gray-100 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative group"
                    onClick={() => car.registration_image_url && setIsImageModalOpen(true)}
                >
                    {car.registration_image_url ? (
                        <>
                            <img src={car.registration_image_url} className="w-full h-full object-contain" />
                            <div className="absolute inset-0 bg-black/30 hidden group-hover:flex items-center justify-center text-white font-bold">🔍 클릭하여 확대</div>
                        </>
                    ) : <span className="text-gray-400">이미지 없음</span>}
                </div>
            </div>
            <label className={`block w-full py-4 rounded-xl font-bold text-center text-lg shadow-lg cursor-pointer transition-all ${uploading ? 'bg-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                {uploading ? '분석 중...' : '📸 이미지 재업로드 (AI 분석)'}
                <input type="file" className="hidden" accept="image/*,.pdf,application/pdf" onChange={handleFileUpload} disabled={uploading} />
            </label>
        </div>
      </div>

      {isImageModalOpen && car.registration_image_url && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setIsImageModalOpen(false)}>
            <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center">
                <img src={car.registration_image_url} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                <button className="absolute top-4 right-4 text-white text-4xl font-bold hover:text-gray-300">&times;</button>
            </div>
        </div>
      )}
      
      <style jsx>{`
        .label { display: block; font-size: 0.75rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
        .input { width: 100%; padding: 0.75rem; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0.5rem; font-weight: 700; }
        .input:focus { outline: none; border-color: #2563eb; background-color: white; }
      `}</style>
    </div>
  )
}
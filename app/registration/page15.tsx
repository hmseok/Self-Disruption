'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../utils/supabase'
import { useRouter } from 'next/navigation'

// 유틸리티
const normalizeModelName = (name: string) => name ? name.replace(/\s+/g, '').toUpperCase() : '';
const cleanDate = (dateStr: any) => {
  if (!dateStr) return null;
  const nums = String(dateStr).replace(/[^0-9]/g, '');
  return nums.length === 8 ? `${nums.slice(0, 4)}-${nums.slice(4, 6)}-${nums.slice(6, 8)}` : null;
}
const cleanNumber = (numStr: any) => Number(String(numStr).replace(/[^0-9]/g, '')) || 0;

const compressImage = async (file: File): Promise<File> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h && w > 1280) { h *= 1280/w; w = 1280; }
        else if (h > 1280) { w *= 1280/h; h = 1280; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(new File([blob!], file.name, {type:'image/jpeg'})), 'image/jpeg', 0.7);
      };
    };
  });
};

export default function RegistrationListPage() {
  const router = useRouter()
  const bulkInputRef = useRef<HTMLInputElement>(null)
  const [cars, setCars] = useState<any[]>([])
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, fail: 0 })
  const [logs, setLogs] = useState<string[]>([])

  // 수동 등록용 (vehicle_ 테이블 사용)
  const [codeModels, setCodeModels] = useState<any[]>([])
  const [codeTrims, setCodeTrims] = useState<any[]>([])

  // 모달
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [carNum, setCarNum] = useState('')
  const [selectedModel, setSelectedModel] = useState<any>(null)
  const [selectedTrim, setSelectedTrim] = useState<any>(null)
  const [finalPrice, setFinalPrice] = useState(0)

  useEffect(() => {
    fetchList()
    fetchCodeModels()
  }, [])

  useEffect(() => {
    if (selectedTrim) setFinalPrice(selectedTrim.price)
  }, [selectedTrim])

  const fetchList = async () => {
    const { data } = await supabase.from('cars').select('*').order('created_at', { ascending: false })
    setCars(data || [])
  }

  // 🔥 [수정됨] 표준 테이블 조회
  const fetchCodeModels = async () => {
    const { data } = await supabase.from('vehicle_model_codes').select('*').order('created_at', { ascending: false })
    setCodeModels(data || [])
  }

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      if (!confirm(`총 ${files.length}장을 분석합니다.\nAI가 표준 DB(vehicle_)에 트림 정보를 구축합니다.`)) return

      setBulkProcessing(true)
      setProgress({ current: 0, total: files.length, success: 0, fail: 0 })
      setLogs([])

      for (let i = 0; i < files.length; i++) {
          const file = files[i]
          setProgress(prev => ({ ...prev, current: i + 1 }))

          try {
              // 1. 업로드
              const compressed = await compressImage(file);
              const fileName = `reg_${Date.now()}_${i}.jpg`
              await supabase.storage.from('car_docs').upload(`registration/${fileName}`, compressed, { upsert: true })
              const { data: urlData } = supabase.storage.from('car_docs').getPublicUrl(`registration/${fileName}`)

              // 2. AI 분석
              const base64 = await new Promise<string>((r) => { const reader = new FileReader(); reader.readAsDataURL(compressed); reader.onload = () => r(reader.result as string); })
              const response = await fetch('/api/ocr-registration', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ imageBase64: base64 })
              })
              const result = await response.json()
              if (result.error) throw new Error(result.error)

              const detectedModel = result.model_name || '미확인 모델';
              const detectedYear = result.year || new Date().getFullYear();
              let finalPrice = cleanNumber(result.purchase_price);

              // 🔥 3. [트림 DB 저장] vehicle_... 테이블 사용 (이게 핵심!)
              if (detectedModel !== '미확인 모델') {
                  const normalized = normalizeModelName(detectedModel);

                  // A. 모델 코드 (Upsert) - vehicle_model_codes
                  const { data: modelData } = await supabase.from('vehicle_model_codes')
                      .upsert({
                          brand: '기타', model_name: detectedModel, year: detectedYear, normalized_name: normalized
                      }, { onConflict: 'model_name, year' })
                      .select().single();

                  // B. 트림 정보 저장 - vehicle_trims
                  if (modelData && result.trims?.length > 0) {
                      await supabase.from('vehicle_trims').delete().eq('model_id', modelData.id);

                      const trimsToInsert = result.trims.map((t: any) => ({
                          model_id: modelData.id,
                          trim_name: t.name,
                          price: t.price || 0,
                          fuel_type: result.fuel_type || '기타'
                      }));
                      await supabase.from('vehicle_trims').insert(trimsToInsert);

                      console.log(`✨ [DB저장] ${detectedModel} 트림 ${result.trims.length}개 vehicle_trims에 저장됨`);

                      if (finalPrice === 0) {
                          const minPrice = Math.min(...result.trims.map((t:any) => t.price || 999999999));
                          if (minPrice < 999999999) finalPrice = minPrice;
                      }
                  }
              }

              // 4. 차량 등록
              const { error: dbError } = await supabase.from('cars').upsert([{
                  number: result.car_number || '임시번호',
                  brand: '기타',
                  model: detectedModel,
                  vin: result.vin || `NO-VIN-${Date.now()}`,
                  owner_name: result.owner_name || '',
                  location: result.location || '',
                  purchase_price: finalPrice,
                  displacement: cleanNumber(result.displacement),
                  capacity: cleanNumber(result.capacity),
                  registration_date: cleanDate(result.registration_date),
                  inspection_end_date: cleanDate(result.inspection_end_date),
                  vehicle_age_expiry: cleanDate(result.vehicle_age_expiry),
                  fuel_type: result.fuel_type || '기타',
                  year: detectedYear,
                  registration_image_url: urlData.publicUrl,
                  status: 'available'
              }], { onConflict: 'vin' })

              if (dbError) throw dbError;

              setProgress(prev => ({ ...prev, success: prev.success + 1 }))
              setLogs(prev => [`[✅ 성공] ${detectedModel} (트림 ${result.trims?.length || 0}개)`, ...prev])

          } catch (error: any) {
              console.error(error);
              setProgress(prev => ({ ...prev, fail: prev.fail + 1 }))
              setLogs(prev => [`[❌ 실패] ${file.name}: ${error.message}`, ...prev])
          }
      }
      setBulkProcessing(false)
      fetchList()
      fetchCodeModels()
  }

  // 수동 등록 (vehicle_ 테이블 사용)
  const handleModelSelect = async (modelId: string) => {
    const model = codeModels.find(m => m.id === Number(modelId))
    setSelectedModel(model)
    setSelectedTrim(null)
    if (model) {
        const { data: tData } = await supabase.from('vehicle_trims').select('*').eq('model_id', model.id).order('price')
        setCodeTrims(tData || [])
    }
  }

  const handleRegister = async () => {
    if (!carNum) return alert('번호 입력')
    const fullModelName = `${selectedModel.model_name} ${selectedTrim.trim_name}`
    const { error } = await supabase.from('cars').insert([{
        number: carNum, brand: selectedModel.brand, model: fullModelName, year: selectedModel.year,
        purchase_price: finalPrice, fuel_type: selectedTrim.fuel_type, status: 'available'
    }])
    if (error) alert(error.message)
    else { setIsModalOpen(false); fetchList(); }
  }

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-10 px-6">
       <div className="flex justify-between mb-6">
         <h1 className="text-3xl font-black">📄 차량 등록증 관리</h1>
         <div className="flex gap-2">
            <label className={`cursor-pointer bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 ${bulkProcessing ? 'opacity-50' : ''}`}>
                {bulkProcessing ? 'AI 분석 중...' : '📂 대량 등록 (OCR)'}
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleBulkUpload} disabled={bulkProcessing} />
            </label>
            <button onClick={() => setIsModalOpen(true)} className="bg-black text-white px-5 py-3 rounded-xl font-bold">+ 수동 등록</button>
         </div>
       </div>
       {bulkProcessing && (
         <div className="bg-gray-900 text-green-400 p-4 rounded-xl mb-6 font-mono text-xs h-32 overflow-y-auto">
            {logs.map((log, i) => <div key={i}>{log}</div>)}
         </div>
       )}
       {/* 리스트 테이블 */}
       <div className="bg-white rounded-xl shadow border overflow-hidden">
         <table className="w-full text-left">
            <thead className="bg-gray-50 border-b font-bold text-gray-500">
                <tr><th className="p-4">차량번호</th><th className="p-4">모델명</th><th className="p-4">등록일</th><th className="p-4">관리</th></tr>
            </thead>
            <tbody>
                {cars.map(car => (
                    <tr key={car.id} onClick={() => router.push(`/registration/${car.id}`)} className="hover:bg-gray-50 cursor-pointer">
                        <td className="p-4 font-bold">{car.number}</td>
                        <td className="p-4">{car.model}</td>
                        <td className="p-4 text-gray-400 text-sm">{new Date(car.created_at).toLocaleDateString()}</td>
                        <td className="p-4"><button className="text-gray-400">상세</button></td>
                    </tr>
                ))}
            </tbody>
         </table>
       </div>
       {/* 모달은 생략 (위 코드 참고) */}
    </div>
  )
}
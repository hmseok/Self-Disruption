'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../utils/supabase'
import { useRouter } from 'next/navigation'

// --- [아이콘 컴포넌트] ---
const Icons = {
  Upload: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
  Plus: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>,
  Trash: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Check: () => <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>,
  File: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Search: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
}

// --- [유틸리티 함수] ---
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

  // 수동 등록용 데이터
  const [standardCodes, setStandardCodes] = useState<any[]>([])
  const [uniqueModels, setUniqueModels] = useState<string[]>([])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [carNum, setCarNum] = useState('')
  const [selectedModelName, setSelectedModelName] = useState('')
  const [selectedTrim, setSelectedTrim] = useState<any>(null)
  const [finalPrice, setFinalPrice] = useState(0)

  useEffect(() => {
    fetchList()
    fetchStandardCodes()
  }, [])

  useEffect(() => {
    if (selectedTrim) setFinalPrice(selectedTrim.price)
  }, [selectedTrim])

  const fetchList = async () => {
    const { data } = await supabase.from('cars').select('*').order('created_at', { ascending: false })
    setCars(data || [])
  }

  const fetchStandardCodes = async () => {
    const { data } = await supabase.from('vehicle_standard_codes').select('*').order('model_name, price')
    if (data) {
        setStandardCodes(data)
        const models = Array.from(new Set(data.map(d => d.model_name)))
        setUniqueModels(models as string[])
    }
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('정말 삭제하시겠습니까?')) return
    await supabase.from('cars').delete().eq('id', id)
    fetchList()
  }

  // 🚀 [대량 등록 로직 - 기존과 동일]
  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      if (!confirm(`총 ${files.length}장을 분석합니다.\nAI가 통합 테이블에 데이터를 구축합니다.`)) return

      setBulkProcessing(true)
      setProgress({ current: 0, total: files.length, success: 0, fail: 0 })
      setLogs([])

      for (let i = 0; i < files.length; i++) {
          const file = files[i]
          setProgress(prev => ({ ...prev, current: i + 1 }))

          try {
              const compressed = await compressImage(file);
              const fileName = `reg_${Date.now()}_${i}.jpg`
              await supabase.storage.from('car_docs').upload(`registration/${fileName}`, compressed, { upsert: true })
              const { data: urlData } = supabase.storage.from('car_docs').getPublicUrl(`registration/${fileName}`)

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

              if (detectedModel !== '미확인 모델' && result.trims?.length > 0) {
                  await supabase.from('vehicle_standard_codes')
                      .delete()
                      .eq('model_name', detectedModel)
                      .eq('year', detectedYear);

                  const rowsToInsert = result.trims.map((t: any) => ({
                      brand: '기타',
                      model_name: detectedModel,
                      year: detectedYear,
                      trim_name: t.name,
                      price: t.price || 0,
                      fuel_type: result.fuel_type || '기타',
                      normalized_name: normalizeModelName(detectedModel)
                  }));

                  await supabase.from('vehicle_standard_codes').insert(rowsToInsert);
                  console.log(`✅ ${detectedModel} 트림 ${rowsToInsert.length}개 구축 완료`);

                  if (finalPrice === 0) {
                      const minPrice = Math.min(...result.trims.map((t:any) => t.price || 999999999));
                      if (minPrice < 999999999) finalPrice = minPrice;
                  }
              }

              await supabase.from('cars').upsert([{
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
                  status: 'available',
                  notes: result.notes || ''
              }], { onConflict: 'vin' })

              setProgress(prev => ({ ...prev, success: prev.success + 1 }))
              setLogs(prev => [`✅ [완료] ${detectedModel} (${result.car_number}) - 트림 ${result.trims?.length || 0}개 확보`, ...prev])

          } catch (error: any) {
              setProgress(prev => ({ ...prev, fail: prev.fail + 1 }))
              setLogs(prev => [`❌ [실패] ${file.name}: ${error.message}`, ...prev])
          }
      }
      setBulkProcessing(false)
      fetchList()
      fetchStandardCodes()
  }

  const handleRegister = async () => {
    if (!carNum) return alert('번호 입력')
    setCreating(true)
    const fullModelName = `${selectedModelName} ${selectedTrim?.trim_name || ''}`
    const { error } = await supabase.from('cars').insert([{
        number: carNum, brand: selectedTrim?.brand || '기타', model: fullModelName, year: selectedTrim?.year,
        purchase_price: finalPrice, fuel_type: selectedTrim?.fuel_type, status: 'available'
    }])
    if (error) alert(error.message)
    else { setIsModalOpen(false); fetchList(); }
    setCreating(false)
  }

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-12 px-6 bg-gray-50/50 min-h-screen">

       {/* 1. 헤더 영역 */}
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
         <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">차량 등록증 관리</h1>
            <p className="text-gray-500 mt-2 text-sm">AI OCR 기술을 활용하여 차량 정보를 자동으로 추출하고 DB를 구축합니다.</p>
         </div>
         <div className="flex gap-3">
            <label className={`cursor-pointer group flex items-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 hover:shadow-lg transition-all transform hover:-translate-y-0.5 ${bulkProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                <Icons.Upload />
                <span>{bulkProcessing ? '분석 진행 중...' : '등록증 일괄 업로드'}</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleBulkUpload} disabled={bulkProcessing} />
            </label>
            <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-5 py-3 rounded-xl font-bold hover:bg-gray-50 hover:border-gray-300 hover:shadow-md transition-all">
                <Icons.Plus /> <span>수동 등록</span>
            </button>
         </div>
       </div>

       {/* 2. AI 처리 현황판 (터미널 스타일) */}
       {bulkProcessing && (
         <div className="mb-10 bg-gray-900 rounded-2xl p-6 shadow-2xl ring-4 ring-blue-500/10 overflow-hidden relative">
            <div className="flex justify-between items-end mb-4 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse delay-75"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse delay-150"></div>
                    <span className="text-green-400 font-mono font-bold text-sm ml-2">AI Engine Processing...</span>
                </div>
                <span className="text-white font-bold font-mono">{progress.current} / {progress.total}</span>
            </div>

            {/* 진행률 바 */}
            <div className="w-full bg-gray-700 rounded-full h-2 mb-6 overflow-hidden relative z-10">
                <div
                    className="bg-gradient-to-r from-blue-500 to-cyan-400 h-2 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
            </div>

            {/* 로그 창 */}
            <div className="bg-black/50 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs text-gray-300 space-y-1 border border-white/10 scrollbar-hide">
                {logs.map((log, i) => (
                    <div key={i} className={`flex items-start gap-2 ${log.includes('실패') ? 'text-red-400' : 'text-green-400'}`}>
                        <span className="opacity-50">[{new Date().toLocaleTimeString()}]</span>
                        <span>{log}</span>
                    </div>
                ))}
            </div>
         </div>
       )}

       {/* 3. 차량 리스트 테이블 */}
       <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 uppercase text-xs font-bold tracking-wider">
                    <tr>
                        <th className="p-5 pl-8">등록 이미지</th>
                        <th className="p-5">차량 정보</th>
                        <th className="p-5">취득가액</th>
                        <th className="p-5">연식 / 연료</th>
                        <th className="p-5">등록일자</th>
                        <th className="p-5 text-center">관리</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {cars.map((car) => (
                        <tr key={car.id} onClick={() => router.push(`/registration/${car.id}`)} className="group hover:bg-blue-50/30 transition-colors cursor-pointer">
                            {/* 이미지 썸네일 */}
                            <td className="p-5 pl-8">
                                <div className="w-16 h-12 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden relative">
                                    {car.registration_image_url ? (
                                        <img src={car.registration_image_url} alt="등록증" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-300"><Icons.File /></div>
                                    )}
                                </div>
                            </td>
                            {/* 차량 정보 */}
                            <td className="p-5">
                                <div className="font-black text-gray-900 text-lg">{car.number}</div>
                                <div className="text-gray-500 text-sm font-medium mt-0.5">{car.model}</div>
                            </td>
                            {/* 가격 */}
                            <td className="p-5 font-bold text-gray-700">
                                {f(car.purchase_price)}원
                            </td>
                            {/* 연식/연료 */}
                            <td className="p-5">
                                <div className="flex gap-2">
                                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">{car.year}년</span>
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${car.fuel_type === '전기' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                                        {car.fuel_type || '기타'}
                                    </span>
                                </div>
                            </td>
                            {/* 등록일 */}
                            <td className="p-5 text-gray-400 text-sm font-medium">
                                {new Date(car.created_at).toLocaleDateString()}
                            </td>
                            {/* 관리 버튼 */}
                            <td className="p-5 text-center">
                                <button
                                    onClick={(e) => handleDelete(car.id, e)}
                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    title="삭제"
                                >
                                    <Icons.Trash />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {cars.length === 0 && (
                        <tr>
                            <td colSpan={6} className="p-20 text-center text-gray-400">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-300"><Icons.Search /></div>
                                    <p>등록된 차량이 없습니다. 우측 상단 버튼을 눌러 등록해주세요.</p>
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
         </div>
       </div>

       {/* 4. 수동 등록 모달 (모던 디자인 적용) */}
       {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden transform transition-all scale-100" onClick={e => e.stopPropagation()}>
            <div className="px-8 py-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-black text-gray-900">🚙 수동 등록</h2>
                    <p className="text-xs text-gray-500 mt-1">AI 인식이 불가능할 때 사용하세요.</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-light">&times;</button>
            </div>

            <div className="p-8 space-y-5">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">차량 번호</label>
                    <input className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold text-lg focus:bg-white focus:border-blue-500 outline-none transition-colors"
                           placeholder="예: 123가 4567"
                           value={carNum}
                           onChange={e=>setCarNum(e.target.value)} autoFocus />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">모델 선택</label>
                        <select className="w-full p-3 bg-white border border-gray-200 rounded-xl font-medium focus:border-blue-500 outline-none"
                                onChange={e=>setSelectedModelName(e.target.value)} defaultValue="">
                            <option value="" disabled>모델을 선택하세요</option>
                            {uniqueModels.map((m, i) => <option key={i} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">세부 등급</label>
                        <select className="w-full p-3 bg-white border border-gray-200 rounded-xl font-medium focus:border-blue-500 outline-none disabled:bg-gray-100"
                                onChange={e=>setSelectedTrim(standardCodes.find(s => s.id === Number(e.target.value)))}
                                disabled={!selectedModelName} defaultValue="">
                            <option value="" disabled>등급을 선택하세요</option>
                            {standardCodes.filter(s => s.model_name === selectedModelName).map(t => (
                                <option key={t.id} value={t.id}>{t.trim_name} ({t.year}년)</option>
                            ))}
                        </select>
                    </div>
                </div>

                {selectedTrim && (
                    <div className="bg-blue-50 p-4 rounded-xl flex justify-between items-center border border-blue-100">
                        <span className="text-sm font-bold text-blue-800">기준 가격</span>
                        <span className="text-xl font-black text-blue-600">{f(selectedTrim.price)}원</span>
                    </div>
                )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <button onClick={()=>setIsModalOpen(false)} className="px-5 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition-colors">취소</button>
                <button onClick={handleRegister} className="px-6 py-3 rounded-xl font-bold bg-black text-white hover:bg-gray-800 transition-colors shadow-lg">등록 완료</button>
            </div>
          </div>
        </div>
       )}
    </div>
  )
}
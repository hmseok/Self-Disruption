'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../utils/supabase'
import { useRouter } from 'next/navigation'

// --- [아이콘] ---
const Icons = {
  Upload: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
  Plus: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>,
  Trash: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  File: () => <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Search: () => <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
  Check: () => <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Exclamation: () => <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
}

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
  // 🔥 [업그레이드] skipped (중복) 카운트 추가
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, fail: 0, skipped: 0 })
  const [logs, setLogs] = useState<string[]>([])
  const [showResultModal, setShowResultModal] = useState(false)

  // 수동 등록용
  const [standardCodes, setStandardCodes] = useState<any[]>([])
  const [uniqueModels, setUniqueModels] = useState<string[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [carNum, setCarNum] = useState('')
  const [vin, setVin] = useState('')
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

  // 🚀 [대량 등록] 중복 체크 및 카운팅 로직 강화
  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      if (!confirm(`총 ${files.length}장을 분석합니다.\nAI가 등록증을 분석하고 중복 차량은 건너뜁니다.`)) return

      setBulkProcessing(true)
      setShowResultModal(false)
      // 초기화 (skipped 추가)
      setProgress({ current: 0, total: files.length, success: 0, fail: 0, skipped: 0 })
      setLogs([])

      for (let i = 0; i < files.length; i++) {
          const file = files[i]
          setProgress(prev => ({ ...prev, current: i + 1 }))

          try {
              // 1. AI 분석 전에 이미지 압축
              const compressed = await compressImage(file);
              const base64 = await new Promise<string>((r) => { const reader = new FileReader(); reader.readAsDataURL(compressed); reader.onload = () => r(reader.result as string); })

              // 2. AI 호출
              const response = await fetch('/api/ocr-registration', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ imageBase64: base64 })
              })
              const result = await response.json()
              if (result.error) throw new Error(result.error)

              const detectedModel = result.model_name || '미확인 모델';
              const detectedYear = result.year || new Date().getFullYear();
              const detectedVin = result.vin || `NO-VIN-${Date.now()}`;
              let finalPrice = cleanNumber(result.purchase_price);

              // 🕵️‍♀️ [중복 체크] 차대번호가 이미 있는지 확인
              const { data: existingCar } = await supabase.from('cars').select('id').eq('vin', detectedVin).maybeSingle();

              if (existingCar) {
                  // 중복이면 건너뜀
                  setProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }))
                  setLogs(prev => [`⚠️ [중복] ${result.car_number} (이미 등록됨) - 건너뜀`, ...prev])
                  continue; // 다음 파일로 넘어감
              }

              // 3. 이미지 업로드 (중복 아닐 때만 업로드)
              const fileName = `reg_${Date.now()}_${i}.jpg`
              await supabase.storage.from('car_docs').upload(`registration/${fileName}`, compressed, { upsert: true })
              const { data: urlData } = supabase.storage.from('car_docs').getPublicUrl(`registration/${fileName}`)

              // 4. 통합 테이블 갱신 (트림 정보)
              if (detectedModel !== '미확인 모델' && result.trims?.length > 0) {
                  await supabase.from('vehicle_standard_codes')
                      .delete().eq('model_name', detectedModel).eq('year', detectedYear);

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

                  if (finalPrice === 0) {
                      const minPrice = Math.min(...result.trims.map((t:any) => t.price || 999999999));
                      if (minPrice < 999999999) finalPrice = minPrice;
                  }
              }

              // 5. 신규 등록 (insert)
              await supabase.from('cars').insert([{
                  number: result.car_number || '임시번호',
                  brand: '기타',
                  model: detectedModel,
                  vin: detectedVin,
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
              }])

              setProgress(prev => ({ ...prev, success: prev.success + 1 }))
              setLogs(prev => [`✅ [신규] ${detectedModel} (${result.car_number}) 등록 완료`, ...prev])

          } catch (error: any) {
              setProgress(prev => ({ ...prev, fail: prev.fail + 1 }))
              setLogs(prev => [`❌ [에러] ${file.name}: ${error.message}`, ...prev])
          }
      }

      // 완료 후 결과 모달 표시
      setBulkProcessing(false)
      setShowResultModal(true)
      fetchList()
      fetchStandardCodes()
  }

  const handleRegister = async () => {
    if (!carNum) return alert('차량번호 입력')
    if (!vin) return alert('차대번호 입력')

    const { data: existing } = await supabase.from('cars').select('id').eq('vin', vin).maybeSingle()
    if (existing) return alert('❌ 이미 등록된 차대번호입니다.')

    setCreating(true)
    const fullModelName = `${selectedModelName} ${selectedTrim?.trim_name || ''}`

    const { error } = await supabase.from('cars').insert([{
        number: carNum, brand: selectedTrim?.brand || '기타', model: fullModelName, year: selectedTrim?.year,
        purchase_price: finalPrice, fuel_type: selectedTrim?.fuel_type, vin: vin, status: 'available'
    }])

    if (error) alert('실패: ' + error.message)
    else { alert('등록 완료'); setIsModalOpen(false); fetchList(); setCarNum(''); setVin(''); setSelectedModelName(''); setSelectedTrim(null); }
    setCreating(false)
  }

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-12 px-6 bg-gray-50/50 min-h-screen">

       <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
         <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">차량 등록증 관리</h1>
            <p className="text-gray-500 mt-2 text-sm">AI OCR로 등록증을 분석하여 차량을 자동 등록합니다.</p>
         </div>
         <div className="flex gap-3">
            <label className={`cursor-pointer group flex items-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 hover:shadow-lg transition-all transform hover:-translate-y-0.5 ${bulkProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                <Icons.Upload />
                <span>{bulkProcessing ? '분석 중...' : '등록증 일괄 업로드'}</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleBulkUpload} disabled={bulkProcessing} />
            </label>
            <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-5 py-3 rounded-xl font-bold hover:bg-gray-50 hover:border-gray-300 hover:shadow-md transition-all">
                <Icons.Plus /> <span>수동 등록</span>
            </button>
         </div>
       </div>

       {/* 진행 상태창 */}
       {bulkProcessing && (
         <div className="mb-10 bg-gray-900 rounded-2xl p-6 shadow-2xl ring-4 ring-blue-500/10 overflow-hidden relative">
            <div className="flex justify-between items-end mb-4 relative z-10 text-white">
                <div className="flex items-center gap-3"><span className="animate-spin text-xl">⚙️</span><span className="font-bold">AI 분석 진행 중...</span></div>
                <span className="font-mono font-bold">{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 mb-4"><div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-2 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div></div>
            <div className="flex gap-6 text-xs font-bold mb-4 font-mono">
                <span className="text-green-400">✅ 성공: {progress.success}</span>
                <span className="text-yellow-400">⚠️ 중복(스킵): {progress.skipped}</span>
                <span className="text-red-400">❌ 실패: {progress.fail}</span>
            </div>
            <div className="h-32 overflow-y-auto font-mono text-xs text-gray-300 border-t border-gray-700 pt-2 scrollbar-hide">{logs.map((log, i) => <div key={i}>{log}</div>)}</div>
         </div>
       )}

       {/* 리스트 테이블 */}
       <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 uppercase text-xs font-bold tracking-wider">
                    <tr>
                        <th className="p-5 pl-8 w-20">이미지</th>
                        <th className="p-5">차량 정보 (번호/모델)</th>
                        <th className="p-5">소유자 / 차대번호</th>
                        <th className="p-5">연식 / 연료</th>
                        <th className="p-5 text-right">취득가액</th>
                        <th className="p-5 text-center">관리</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {cars.map((car) => (
                        <tr key={car.id} onClick={() => router.push(`/registration/${car.id}`)} className="group hover:bg-blue-50/30 transition-colors cursor-pointer">
                            <td className="p-5 pl-8">
                                <div className="w-14 h-10 bg-gray-100 rounded border overflow-hidden">
                                    {car.registration_image_url ? <img src={car.registration_image_url} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-gray-300"><Icons.File /></div>}
                                </div>
                            </td>
                            <td className="p-5">
                                <div className="font-black text-gray-900 text-lg">{car.number}</div>
                                <div className="text-gray-500 text-sm font-medium">{car.model}</div>
                            </td>
                            <td className="p-5">
                                <div className="text-gray-900 font-bold">{car.owner_name || '-'}</div>
                                {/* 차대번호 전체 표시 (폰트 가독성 높임) */}
                                <div className="text-xs text-gray-500 font-mono mt-1 tracking-tight bg-gray-50 inline-block px-1.5 py-0.5 rounded border border-gray-100 select-all">
                                    {car.vin || '-'}
                                </div>
                            </td>
                            <td className="p-5">
                                <div className="flex flex-wrap gap-1">
                                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">{car.year}년식</span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${car.fuel_type === '전기' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>{car.fuel_type || '기타'}</span>
                                </div>
                            </td>
                            <td className="p-5 text-right font-bold text-gray-700">{f(car.purchase_price)}원</td>
                            <td className="p-5 text-center">
                                <button onClick={(e) => handleDelete(car.id, e)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Icons.Trash /></button>
                            </td>
                        </tr>
                    ))}
                    {cars.length === 0 && <tr><td colSpan={6} className="p-20 text-center text-gray-400"><div className="flex flex-col items-center gap-3"><Icons.Search /><p>등록된 차량이 없습니다.</p></div></td></tr>}
                </tbody>
            </table>
         </div>
       </div>

       {/* ✅ 결과 리포트 모달 (완료 시 뜸) */}
       {showResultModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowResultModal(false)}>
            <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center" onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🎉</div>
                <h2 className="text-xl font-black text-gray-900 mb-2">분석 완료</h2>
                <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
                    <div className="flex justify-between py-1 border-b border-gray-200"><span className="text-gray-500">총 파일</span><span className="font-bold">{progress.total}건</span></div>
                    <div className="flex justify-between py-1 border-b border-gray-200 mt-2"><span className="text-blue-600 font-bold">신규 등록</span><span className="font-bold text-blue-600">{progress.success}건</span></div>
                    <div className="flex justify-between py-1 border-b border-gray-200 mt-2"><span className="text-yellow-600 font-bold">중복 제외</span><span className="font-bold text-yellow-600">{progress.skipped}건</span></div>
                    <div className="flex justify-between py-1 mt-2"><span className="text-red-500">실패</span><span className="font-bold text-red-500">{progress.fail}건</span></div>
                </div>
                <button onClick={() => setShowResultModal(false)} className="w-full bg-black text-white py-3 rounded-xl font-bold hover:bg-gray-800">확인</button>
            </div>
        </div>
       )}

       {/* 수동 등록 모달 */}
       {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-8 py-6 border-b bg-gray-50 flex justify-between items-center">
                <h2 className="text-xl font-black text-gray-900">🚙 수동 등록</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-8 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">차량 번호</label><input className="w-full p-3 border rounded-xl font-bold" placeholder="12가 3456" value={carNum} onChange={e=>setCarNum(e.target.value)} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">차대 번호 (필수)</label><input className="w-full p-3 border rounded-xl font-mono uppercase" placeholder="VIN 입력" value={vin} onChange={e=>setVin(e.target.value)} /></div>
                </div>
                {/* ... (이전 코드와 동일한 수동등록 폼) ... */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">모델</label>
                        <select className="w-full p-3 border rounded-xl" onChange={e=>setSelectedModelName(e.target.value)} defaultValue=""><option value="" disabled>선택</option>{uniqueModels.map((m, i) => <option key={i} value={m}>{m}</option>)}</select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">등급</label>
                        <select className="w-full p-3 border rounded-xl" onChange={e=>setSelectedTrim(standardCodes.find(s => s.id === Number(e.target.value)))} disabled={!selectedModelName} defaultValue=""><option value="" disabled>선택</option>{standardCodes.filter(s => s.model_name === selectedModelName).map(t => (<option key={t.id} value={t.id}>{t.trim_name} ({t.year}년)</option>))}</select>
                    </div>
                </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                <button onClick={()=>setIsModalOpen(false)} className="px-5 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200">취소</button>
                <button onClick={handleRegister} className="px-6 py-3 rounded-xl font-bold bg-black text-white hover:bg-gray-800 shadow-lg">등록 완료</button>
            </div>
          </div>
        </div>
       )}
    </div>
  )
}
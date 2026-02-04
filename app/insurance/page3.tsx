'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

// --- [아이콘] ---
const Icons = {
  Upload: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Shield: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Plus: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
}

// 유틸리티
const cleanDate = (dateStr: any) => {
  if (!dateStr) return null;
  const nums = String(dateStr).replace(/[^0-9]/g, '');
  return nums.length >= 8 ? `${nums.slice(0, 4)}-${nums.slice(4, 6)}-${nums.slice(6, 8)}` : null;
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

export default function InsuranceListPage() {
  const router = useRouter()
  const [list, setList] = useState<any[]>([])
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, fail: 0 })
  const [logs, setLogs] = useState<string[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [allCars, setAllCars] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => { fetchList() }, [])

  const fetchList = async () => {
    const { data, error } = await supabase
      .from('cars')
      .select(`id, number, model, brand, vin, insurance_contracts (id, company, end_date, premium, status)`)
      .order('created_at', { ascending: false })

    if (error) { console.error("리스트 로딩 실패:", error.message); return; }
    const formatted = data?.map((car: any) => ({ ...car, insurance: car.insurance_contracts?.[0] || null }))
    setList(formatted || [])
  }

  // 🚀 [AI 업로드] 스마트 VIN 매칭 로직
  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      if (!confirm(`총 ${files.length}건을 분석합니다.\n차대번호(VIN)를 기준으로 매칭합니다.`)) return

      setBulkProcessing(true)
      setProgress({ current: 0, total: files.length, success: 0, fail: 0 })
      setLogs([])

      for (let i = 0; i < files.length; i++) {
          const originalFile = files[i]
          const isPdf = originalFile.type === 'application/pdf';
          setProgress(prev => ({ ...prev, current: i + 1 }))

          try {
              let fileToUpload = originalFile;
              if (!isPdf) {
                  try { fileToUpload = await compressImage(originalFile); } catch (e) { console.warn("압축 실패"); }
              }

              const ext = isPdf ? 'pdf' : 'jpg';
              const fileName = `ins_${Date.now()}_${i}.${ext}`
              await supabase.storage.from('car_docs').upload(`insurance/${fileName}`, fileToUpload, { upsert: true })
              const { data: urlData } = supabase.storage.from('car_docs').getPublicUrl(`insurance/${fileName}`)

              const base64 = await new Promise<string>((r) => {
                  const reader = new FileReader(); reader.readAsDataURL(fileToUpload); reader.onload = () => r(reader.result as string);
              })

              const response = await fetch('/api/ocr-insurance', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ imageBase64: base64, mimeType: isPdf ? 'application/pdf' : 'image/jpeg' })
              })
              const result = await response.json()
              if (result.error) throw new Error(result.error)

              // 🔥 [핵심 로직] VIN 찾기 대작전
              let detectedVin = result.vin;

              // 만약 vin 필드가 비었는데 car_number가 10자리 이상 영문+숫자라면? -> 이걸 VIN으로 간주!
              if ((!detectedVin || detectedVin.length < 5) && result.car_number) {
                  const candidate = result.car_number.replace(/[^a-zA-Z0-9]/g, '');
                  if (candidate.length > 10) {
                      console.log(`💡 차량번호 란에서 VIN 발견: ${candidate}`);
                      detectedVin = candidate;
                  }
              }

              // 정제 (대괄호, 공백 제거 및 대문자화)
              detectedVin = detectedVin?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

              if (!detectedVin || detectedVin.length < 10) {
                  throw new Error(`문서에서 차대번호(VIN)를 찾을 수 없습니다.`);
              }

              // DB 매칭 (VIN 뒷 6자리 포함 검색)
              const { data: carData } = await supabase.from('cars').select('id, number, brand').ilike('vin', `%${detectedVin.slice(-6)}`).maybeSingle();

              if (!carData) {
                  throw new Error(`등록되지 않은 차대번호입니다: ${detectedVin}`);
              }

              // 브랜드 업데이트 (필요시)
              if (result.brand && result.brand !== '기타' && (!carData.brand || carData.brand === '기타')) {
                  await supabase.from('cars').update({ brand: result.brand }).eq('id', carData.id);
                  setLogs(prev => [`✨ 브랜드 업데이트: ${result.brand}`, ...prev]);
              }

              // 보험 등록
              const { error: insertError } = await supabase.from('insurance_contracts').insert([{
                  car_id: carData.id,
                  company: result.company || '기타',
                  start_date: cleanDate(result.start_date),
                  end_date: cleanDate(result.end_date),
                  premium: cleanNumber(result.premium),
                  contractor: result.contractor,
                  policy_number: result.policy_number,
                  driver_range: result.driver_range,
                  insurance_image_url: urlData.publicUrl,
                  status: 'active'
              }])

              if (insertError) throw insertError;

              setProgress(prev => ({ ...prev, success: prev.success + 1 }))
              setLogs(prev => [`✅ [매칭성공] ${carData.number} (VIN: ${detectedVin})`, ...prev])

          } catch (error: any) {
              setProgress(prev => ({ ...prev, fail: prev.fail + 1 }))
              setLogs(prev => [`❌ [실패] ${originalFile.name}: ${error.message}`, ...prev])
          }
      }
      setBulkProcessing(false)
      fetchList()
  }

  const openCarSelector = async () => {
    const { data } = await supabase.from('cars').select('id, number, model, brand').order('created_at', { ascending: false })
    setAllCars(data || [])
    setIsModalOpen(true)
  }

  const filteredCars = allCars.filter(car => car.number.includes(searchTerm))
  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-12 px-6 bg-gray-50/50 min-h-screen">

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">🛡️ 보험/공제 관리</h1>
            <p className="text-gray-500 mt-2 text-sm">청약서/증권(PDF/이미지) 업로드 시 <b>차대번호(VIN)</b>로 자동 매칭합니다.</p>
        </div>
        <div className="flex gap-3">
            <label className={`cursor-pointer group flex items-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 hover:shadow-lg transition-all transform hover:-translate-y-0.5 ${bulkProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                <Icons.Upload />
                <span>{bulkProcessing ? 'VIN 분석 중...' : '증권 AI 등록 (PDF가능)'}</span>
                <input type="file" multiple accept="image/*, .pdf" className="hidden" onChange={handleBulkUpload} disabled={bulkProcessing} />
            </label>
            <button onClick={openCarSelector} className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-5 py-3 rounded-xl font-bold hover:bg-gray-50 hover:border-gray-300 hover:shadow-md transition-all">
                <Icons.Plus /> <span>차량 선택 등록</span>
            </button>
        </div>
      </div>

      {bulkProcessing && (
         <div className="mb-10 bg-gray-900 rounded-2xl p-6 shadow-2xl ring-4 ring-blue-500/10 overflow-hidden relative">
            <div className="flex justify-between items-end mb-4 relative z-10 text-white">
                <div className="flex items-center gap-3"><span className="animate-spin text-xl">⚙️</span><span className="font-bold">AI 차대번호 분석 중...</span></div>
                <span className="font-mono font-bold">{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 mb-4"><div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-2 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div></div>
            <div className="h-32 overflow-y-auto font-mono text-xs text-gray-300 border-t border-gray-700 pt-2 scrollbar-hide">{logs.map((log, i) => <div key={i}>{log}</div>)}</div>
         </div>
       )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50/50 text-gray-500 font-bold border-b border-gray-100 uppercase text-xs tracking-wider">
            <tr>
                <th className="p-5 pl-8">차량번호</th>
                <th className="p-5">차대번호 (VIN)</th>
                <th className="p-5">브랜드/모델</th>
                <th className="p-5">보험사</th>
                <th className="p-5">만기일</th>
                <th className="p-5 text-right">보험료</th>
                <th className="p-5 text-center">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((item) => (
              <tr key={item.id} onClick={() => router.push(`/insurance/${item.id}`)} className="hover:bg-blue-50/30 cursor-pointer transition-colors group">
                <td className="p-5 pl-8 font-black text-lg text-gray-900">{item.number}</td>
                <td className="p-5">
                     <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono text-xs font-bold border border-gray-200 select-all">
                        {item.vin || '-'}
                     </span>
                </td>
                <td className="p-5 text-gray-700 font-medium">
                    <span className="text-blue-600 font-bold mr-1">{item.brand}</span>
                    {item.model}
                </td>
                <td className="p-5 font-bold text-gray-700">{item.insurance?.company || '-'}</td>
                <td className="p-5 font-mono text-gray-600">{item.insurance?.end_date || '-'}</td>
                <td className="p-5 text-right font-medium text-blue-600">{item.insurance?.premium ? `${f(item.insurance.premium)}원` : '-'}</td>
                <td className="p-5 text-center">
                  {item.insurance ? (
                      new Date(item.insurance.end_date) < new Date() ?
                      <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold">만료됨</span> :
                      <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-xs font-bold flex items-center justify-center gap-1 mx-auto w-fit"><Icons.Shield /> 가입중</span>
                  ) : (
                      <span className="bg-gray-100 text-gray-400 px-3 py-1 rounded-full text-xs font-bold">미가입</span>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="p-20 text-center text-gray-400">등록된 차량이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white p-0 rounded-2xl w-full max-w-lg h-[600px] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 기존 차량 선택 모달 내용 유지 */}
            <div className="px-6 py-5 border-b flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-black">🚙 차량 선택</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-2xl font-light text-gray-400 hover:text-black">&times;</button>
            </div>
            <div className="p-4 bg-white">
                <input autoFocus className="w-full p-4 border-2 border-gray-100 rounded-xl bg-gray-50 font-bold focus:bg-white focus:border-blue-500 outline-none transition-colors" placeholder="차량번호 검색" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/50">
              {filteredCars.map(car => (
                <div key={car.id} onClick={() => router.push(`/insurance/${car.id}`)} className="p-4 bg-white border border-gray-100 rounded-xl hover:border-blue-500 hover:shadow-md cursor-pointer flex justify-between items-center group transition-all">
                  <div><div className="font-bold text-lg text-gray-800 group-hover:text-blue-700">{car.number}</div><div className="text-xs text-gray-400 font-medium">{car.brand} {car.model}</div></div>
                  <div className="text-gray-300 font-bold text-xl group-hover:text-blue-600 transition-colors">→</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
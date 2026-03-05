'use client'
import { supabase } from '../utils/supabase'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'

// --- [아이콘] ---
const Icons = {
  Upload: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
  Plus: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>,
  Trash: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  File: () => <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Search: () => <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
}

// 유틸리티
const normalizeModelName = (name: string) => name ? name.replace(/\s+/g, '').toUpperCase() : '';
const cleanDate = (dateStr: any) => {
  if (!dateStr) return null;
  const nums = String(dateStr).replace(/[^0-9]/g, '');
  return nums.length === 8 ? `${nums.slice(0, 4)}-${nums.slice(4, 6)}-${nums.slice(6, 8)}` : null;
}
const cleanNumber = (numStr: any) => Number(String(numStr).replace(/[^0-9]/g, '')) || 0;

// 코드 생성기
const generateModelCode = (brand: string, model: string, year: number) => {
    const b = brand ? normalizeModelName(brand) : 'UNKNOWN';
    const m = normalizeModelName(model);
    return `${b}_${m}_${year}`;
}

// 조건부 압축: 5MB 이하 원본 유지, 초과 시 고품질 압축 (OCR 정확도 보호)
const compressImage = async (file: File): Promise<File> => {
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size <= MAX_SIZE) return file; // 작은 파일은 원본 그대로

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const MAX_DIM = 2048; // OCR용 해상도 유지
        if (w > h && w > MAX_DIM) { h *= MAX_DIM/w; w = MAX_DIM; }
        else if (h > MAX_DIM) { w *= MAX_DIM/h; h = MAX_DIM; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(new File([blob!], file.name, {type:'image/jpeg'})), 'image/jpeg', 0.85);
      };
    };
  });
};

export default function RegistrationListPage() {

// ✅ [수정 2] supabase 클라이언트 생성 (이 줄이 없어서 에러가 난 겁니다!)
const router = useRouter()
const { company, role, adminSelectedCompanyId } = useApp()
  const [cars, setCars] = useState<any[]>([])

  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, fail: 0, skipped: 0 })
  const [logs, setLogs] = useState<string[]>([])
  const [showResultModal, setShowResultModal] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)  // 중단 플래그
  const [failedFiles, setFailedFiles] = useState<File[]>([])  // 실패 파일 재시도용

  // 수동 등록용
  const [standardCodes, setStandardCodes] = useState<any[]>([])
  const [uniqueModels, setUniqueModels] = useState<string[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [carNum, setCarNum] = useState('')
  const [vin, setVin] = useState('')
  const [selectedModelName, setSelectedModelName] = useState('')
  const [selectedTrim, setSelectedTrim] = useState<any>(null)
  const [finalPrice, setFinalPrice] = useState(0)

  useEffect(() => {
    fetchList()
    fetchStandardCodes()
  }, [company, role, adminSelectedCompanyId])

  useEffect(() => {
    if (selectedTrim) setFinalPrice(selectedTrim.price)
  }, [selectedTrim])

  const fetchList = async () => {
    let query = supabase.from('cars').select('*')

    if (role === 'god_admin') {
      if (adminSelectedCompanyId) query = query.eq('company_id', adminSelectedCompanyId)
    } else if (company) {
      query = query.eq('company_id', company.id)
    }

    const { data } = await query.order('created_at', { ascending: false })
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

  // 🚀 [업그레이드] PDF 지원 + 브랜드 분석 로직
  // 현재 사용할 company_id 결정
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    const files = e.dataTransfer.files
    if (files?.length) processFiles(files)
  }

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) processFiles(files)
    e.target.value = '' // 같은 파일 재선택 가능하도록 초기화
  }

  // 중단 핸들러
  const handleCancel = () => {
    cancelRef.current = true
    setLogs(prev => ['🛑 사용자가 중단을 요청했습니다. 현재 건 완료 후 중단됩니다...', ...prev])
  }

  // 실패 건 재시도
  const handleRetryFailed = () => {
    if (failedFiles.length === 0) return
    const dt = new DataTransfer()
    failedFiles.forEach(f => dt.items.add(f))
    setFailedFiles([])
    processFiles(dt.files)
  }

  const processFiles = async (files: FileList) => {
      if (!files?.length) return
      if (role === 'god_admin' && !adminSelectedCompanyId) {
        alert('⚠️ 회사를 먼저 선택해주세요.\n사이드바에서 회사를 선택한 후 등록해주세요.')
        return
      }
      if (!confirm(`총 ${files.length}건을 분석합니다.\n(PDF, JPG, PNG 지원)`)) return

      cancelRef.current = false  // 중단 플래그 리셋
      setBulkProcessing(true)
      setShowResultModal(false)
      setProgress({ current: 0, total: files.length, success: 0, fail: 0, skipped: 0 })
      setLogs([])
      const newFailedFiles: File[] = []

      for (let i = 0; i < files.length; i++) {
          // 🛑 중단 체크
          if (cancelRef.current) {
              const remaining = files.length - i
              setLogs(prev => [`🛑 중단됨 — 나머지 ${remaining}건 건너뜀`, ...prev])
              // 나머지 파일을 실패 목록에 추가 (재시도 가능)
              for (let j = i; j < files.length; j++) {
                newFailedFiles.push(files[j])
              }
              break
          }

          const originalFile = files[i]
          const isPdf = originalFile.type === 'application/pdf';
          setProgress(prev => ({ ...prev, current: i + 1 }))

          try {
              let fileToUpload = originalFile;
              if (!isPdf) {
                  try { fileToUpload = await compressImage(originalFile); } catch (e) { console.warn("압축 실패"); }
              }

              // Storage 업로드
              const ext = isPdf ? 'pdf' : 'jpg';
              const fileName = `reg_${Date.now()}_${i}.${ext}`
              await supabase.storage.from('car_docs').upload(`registration/${fileName}`, fileToUpload, { upsert: true })
              const { data: urlData } = supabase.storage.from('car_docs').getPublicUrl(`registration/${fileName}`)

              // Base64 변환
              const base64 = await new Promise<string>((r) => {
                  const reader = new FileReader(); reader.readAsDataURL(fileToUpload); reader.onload = () => r(reader.result as string);
              })

              // AI 분석 (MIME Type 전달) + 타임아웃 30초
              const controller = new AbortController()
              const timeout = setTimeout(() => controller.abort(), 30000)

              const response = await fetch('/api/ocr-registration', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ imageBase64: base64, mimeType: isPdf ? 'application/pdf' : 'image/jpeg' }),
                  signal: controller.signal
              })
              clearTimeout(timeout)

              const result = await response.json()
              if (result.error) throw new Error(result.error)

              const detectedBrand = result.brand || '기타';
              const detectedModel = result.model_name || '미확인 모델';
              const detectedYear = result.year || new Date().getFullYear();
              const detectedVin = result.vin || `NO-VIN-${Date.now()}`;
              let finalPrice = cleanNumber(result.purchase_price);

              // 중복 체크
              const { data: existingCar } = await supabase.from('cars').select('id').eq('vin', detectedVin).maybeSingle();
              if (existingCar) {
                  setProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }))
                  setLogs(prev => [`⚠️ [중복] ${result.car_number} - 건너뜀`, ...prev])
                  continue;
              }

              // 1. 통합 테이블 갱신 (트림)
              if (detectedModel !== '미확인 모델' && result.trims?.length > 0) {
                  await supabase.from('vehicle_standard_codes')
                      .delete().eq('model_name', detectedModel).eq('year', detectedYear);

                  const modelCode = generateModelCode(detectedBrand, detectedModel, detectedYear);
                  const rowsToInsert = result.trims.map((t: any) => ({
                      brand: detectedBrand, model_name: detectedModel, model_code: modelCode,
                      year: detectedYear, trim_name: t.name, price: t.price || 0,
                      fuel_type: result.fuel_type || '기타', normalized_name: normalizeModelName(detectedModel)
                  }));
                  await supabase.from('vehicle_standard_codes').insert(rowsToInsert);

                  if (finalPrice === 0) {
                      const minPrice = Math.min(...result.trims.map((t:any) => t.price || 999999999));
                      if (minPrice < 999999999) finalPrice = minPrice;
                  }
              }

              // 2. 차량 등록
              await supabase.from('cars').insert([{
                  number: result.car_number || '임시번호', brand: detectedBrand, model: detectedModel,
                  vin: detectedVin, owner_name: result.owner_name || '', location: result.location || '',
                  purchase_price: finalPrice, displacement: cleanNumber(result.displacement),
                  capacity: cleanNumber(result.capacity), registration_date: cleanDate(result.registration_date),
                  inspection_end_date: cleanDate(result.inspection_end_date),
                  vehicle_age_expiry: cleanDate(result.vehicle_age_expiry),
                  fuel_type: result.fuel_type || '기타', year: detectedYear,
                  registration_image_url: urlData.publicUrl, status: 'available',
                  notes: result.notes || '', company_id: effectiveCompanyId || null
              }])

              setProgress(prev => ({ ...prev, success: prev.success + 1 }))
              setLogs(prev => [`✅ [${detectedBrand}] ${detectedModel} 등록 완료 (${isPdf ? 'PDF' : 'IMG'})`, ...prev])

          } catch (error: any) {
              const msg = error.name === 'AbortError' ? '타임아웃 (30초 초과)' : error.message
              setProgress(prev => ({ ...prev, fail: prev.fail + 1 }))
              setLogs(prev => [`❌ ${files[i].name} 실패: ${msg}`, ...prev])
              newFailedFiles.push(originalFile)  // 실패 파일 저장
          }
      }

      setFailedFiles(prev => [...prev, ...newFailedFiles])
      setBulkProcessing(false)
      setShowResultModal(true)
      fetchList()
      fetchStandardCodes()
  }

  const handleRegister = async () => {
    if (role === 'god_admin' && !adminSelectedCompanyId) return alert('⚠️ 회사를 먼저 선택해주세요.\n사이드바에서 회사를 선택한 후 등록해주세요.')
    if (!carNum) return alert('차량번호 입력')
    if (!vin) return alert('차대번호 입력')

    const { data: existing } = await supabase.from('cars').select('id').eq('vin', vin).maybeSingle()
    if (existing) return alert('❌ 이미 등록된 차대번호입니다.')

    setCreating(true)
    const fullModelName = `${selectedModelName} ${selectedTrim?.trim_name || ''}`

    const { error } = await supabase.from('cars').insert([{
        number: carNum,
        brand: selectedTrim?.brand || '기타',
        model: fullModelName,
        year: selectedTrim?.year,
        purchase_price: finalPrice,
        fuel_type: selectedTrim?.fuel_type,
        vin: vin,
        status: 'available',
        company_id: effectiveCompanyId || null
    }])

    if (error) alert('실패: ' + error.message)
    else { alert('등록 완료'); setIsModalOpen(false); fetchList(); setCarNum(''); setVin(''); setSelectedModelName(''); setSelectedTrim(null); }
    setCreating(false)
  }

  const f = (n: number) => n?.toLocaleString() || '0'

  // 📊 KPI 통계
  const stats = {
    total: cars.length,
    totalValue: cars.reduce((s, c) => s + (c.purchase_price || 0), 0),
    totalCost: cars.reduce((s, c) => s + (c.total_cost || c.purchase_price || 0), 0),
    avgValue: cars.length > 0 ? Math.round(cars.reduce((s, c) => s + (c.purchase_price || 0), 0) / cars.length) : 0,
    electric: cars.filter(c => c.fuel_type === '전기').length,
    hybrid: cars.filter(c => (c.fuel_type || '').includes('하이브리드')).length,
    consignment: cars.filter(c => c.ownership_type === 'consignment').length,
    leasedIn: cars.filter(c => c.ownership_type === 'leased_in').length,
  }

  // 최근 7일 등록 차량
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentCars = cars.filter(c => new Date(c.created_at) >= sevenDaysAgo)

  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="p-12 md:p-20 text-center text-gray-400 text-sm bg-white rounded-2xl">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">

       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
         <div style={{ textAlign: 'left' }}>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">📋 등록/제원 상세</h1>
            <p className="text-gray-500 text-sm mt-1">차량 등록·이전 서류 및 제원 관리</p>
         </div>
         <div className="flex gap-3">
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={bulkProcessing}
                className={`cursor-pointer group flex items-center gap-2 bg-steel-600 text-white px-3 py-2 text-sm md:px-5 md:py-3 md:text-base rounded-xl font-bold hover:bg-steel-700 transition-colors ${bulkProcessing ? 'opacity-50 pointer-events-none' : ''}`}
            >
                <Icons.Upload />
                <span>{bulkProcessing ? '분석 중...' : '등록증 업로드'}</span>
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" className="hidden" onChange={handleBulkUpload} disabled={bulkProcessing} />
            <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-3 py-2 text-sm md:px-5 md:py-3 md:text-base rounded-xl font-bold hover:bg-gray-50 transition-colors">
                <Icons.Plus /> <span>신규차량등록</span>
            </button>
         </div>
       </div>

       {/* 드래그 앤 드롭 업로드 영역 (최상단) */}
       {!bulkProcessing && (
         <div
           onDragOver={handleDragOver}
           onDragLeave={handleDragLeave}
           onDrop={handleDrop}
           onClick={() => fileInputRef.current?.click()}
           className={`mb-6 border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
             isDragging
               ? 'border-steel-500 bg-steel-50 scale-[1.01]'
               : 'border-gray-300 bg-white hover:border-steel-400 hover:bg-steel-50/30'
           }`}
         >
           <div className="text-3xl mb-2">{isDragging ? '📥' : '🚗'}</div>
           <p className="text-sm font-bold text-gray-700">
             {isDragging ? '여기에 파일을 놓으세요' : '등록증 파일을 드래그하여 업로드'}
           </p>
           <p className="text-xs text-gray-400 mt-1">이미지 또는 PDF 파일 지원 · 클릭하여 파일 선택</p>
         </div>
       )}

       {/* 📊 KPI 대시보드 */}
       {cars.length > 0 && !bulkProcessing && (
         <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
           <div style={{ flex: 1, background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', minWidth: 0 }}>
             <p style={{ fontSize: 12, color: '#9ca3af', fontWeight: 700, whiteSpace: 'nowrap' as const }}>등록 차량</p>
             <p style={{ fontSize: 24, fontWeight: 900, color: '#111827', marginTop: 4, whiteSpace: 'nowrap' as const }}>{stats.total}<span style={{ fontSize: 14, color: '#9ca3af', marginLeft: 2 }}>대</span></p>
           </div>
           <div style={{ flex: 1, background: '#f0fdf4', padding: 16, borderRadius: 12, border: '1px solid #dcfce7', minWidth: 0 }}>
             <p style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, whiteSpace: 'nowrap' as const }}>친환경 차량</p>
             <p style={{ fontSize: 24, fontWeight: 900, color: '#15803d', marginTop: 4, whiteSpace: 'nowrap' as const }}>{stats.electric + stats.hybrid}<span style={{ fontSize: 14, color: '#22c55e', marginLeft: 2 }}>대</span></p>
             <p style={{ fontSize: 10, color: '#22c55e', marginTop: 2, whiteSpace: 'nowrap' as const }}>전기 {stats.electric} · 하이브리드 {stats.hybrid}</p>
           </div>
           {(stats.consignment + stats.leasedIn) > 0 && (
             <div style={{ flex: 1, background: '#fffbeb', padding: 16, borderRadius: 12, border: '1px solid #fde68a', minWidth: 0 }}>
               <p style={{ fontSize: 12, color: '#d97706', fontWeight: 700, whiteSpace: 'nowrap' as const }}>지입/임차</p>
               <p style={{ fontSize: 24, fontWeight: 900, color: '#b45309', marginTop: 4, whiteSpace: 'nowrap' as const }}>{stats.consignment + stats.leasedIn}<span style={{ fontSize: 14, color: '#f59e0b', marginLeft: 2 }}>대</span></p>
               <p style={{ fontSize: 10, color: '#f59e0b', marginTop: 2, whiteSpace: 'nowrap' as const }}>지입 {stats.consignment} · 임차 {stats.leasedIn}</p>
             </div>
           )}
           <div style={{ flex: 1, background: '#fffbeb', padding: 16, borderRadius: 12, border: recentCars.length > 0 ? '1px solid #fde68a' : '1px solid #fef3c7', minWidth: 0 }}>
             <p style={{ fontSize: 12, color: '#d97706', fontWeight: 700, whiteSpace: 'nowrap' as const }}>최근 7일 등록</p>
             <p style={{ fontSize: 24, fontWeight: 900, color: '#b45309', marginTop: 4, whiteSpace: 'nowrap' as const }}>{recentCars.length}<span style={{ fontSize: 14, color: '#f59e0b', marginLeft: 2 }}>대</span></p>
           </div>
           <div style={{ flex: 1, background: '#eff6ff', padding: 16, borderRadius: 12, border: '1px solid #bfdbfe', minWidth: 0 }}>
             <p style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, whiteSpace: 'nowrap' as const }}>총 취득가액</p>
             <p style={{ fontSize: 20, fontWeight: 900, color: '#1d4ed8', marginTop: 4, whiteSpace: 'nowrap' as const }}>{f(stats.totalValue)}<span style={{ fontSize: 14, color: '#93c5fd', marginLeft: 2 }}>원</span></p>
             {stats.totalCost > stats.totalValue && (
               <p style={{ fontSize: 10, color: '#059669', fontWeight: 700, marginTop: 2, whiteSpace: 'nowrap' as const }}>실투자 {f(stats.totalCost)}원</p>
             )}
           </div>
           <div style={{ flex: 1, background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', minWidth: 0 }}>
             <p style={{ fontSize: 12, color: '#64748b', fontWeight: 700, whiteSpace: 'nowrap' as const }}>차량 평균가</p>
             <p style={{ fontSize: 20, fontWeight: 900, color: '#475569', marginTop: 4, whiteSpace: 'nowrap' as const }}>{f(stats.avgValue)}<span style={{ fontSize: 14, color: '#94a3b8', marginLeft: 2 }}>원</span></p>
           </div>
         </div>
       )}

       {/* 🆕 최근 등록 차량 배너 */}
       {cars.length > 0 && !bulkProcessing && recentCars.length > 0 && (
         <div className="mb-6 bg-gradient-to-r from-steel-50 to-blue-50 border border-steel-200 rounded-2xl p-4 md:p-5">
           <div className="flex items-center gap-2 mb-3">
             <span className="text-lg">🆕</span>
             <h3 className="font-bold text-steel-800 text-sm">최근 7일 신규 등록 ({recentCars.length}대)</h3>
           </div>
           <div className="flex gap-2 overflow-x-auto pb-1">
             {recentCars.slice(0, 8).map(car => (
               <div
                 key={car.id}
                 onClick={() => router.push(`/registration/${car.id}`)}
                 className="bg-white border border-steel-200 rounded-xl px-3 py-2 flex-shrink-0 cursor-pointer hover:shadow-md transition-all hover:border-steel-400"
               >
                 <div className="font-bold text-gray-800 text-sm">{car.number}</div>
                 <div className="flex items-center gap-2 mt-0.5">
                   <span className="text-xs text-gray-500">{car.brand}</span>
                   <span className="text-[10px] text-steel-500 font-bold">{car.created_at?.split('T')[0]}</span>
                 </div>
               </div>
             ))}
             {recentCars.length > 8 && (
               <div className="bg-steel-100 rounded-xl px-3 py-2 flex-shrink-0 flex items-center text-steel-700 text-xs font-bold">
                 +{recentCars.length - 8}대 더
               </div>
             )}
           </div>
         </div>
       )}

       {/* 진행 상태창 */}
       {bulkProcessing && (
         <div className="mb-10 bg-gray-900 rounded-2xl p-6 shadow-2xl ring-4 ring-steel-500/10 overflow-hidden relative">
            <div className="flex justify-between items-end mb-4 relative z-10 text-white">
                <div className="flex items-center gap-3"><span className="animate-spin text-xl">⚙️</span><span className="font-bold">AI 분석 진행 중...</span></div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold">{progress.current} / {progress.total}</span>
                  <button
                    onClick={handleCancel}
                    disabled={cancelRef.current}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      cancelRef.current
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-red-500 text-white hover:bg-red-600 shadow-lg'
                    }`}
                  >
                    {cancelRef.current ? '중단 중...' : '🛑 중단'}
                  </button>
                </div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 mb-4"><div className="bg-gradient-to-r from-steel-500 to-steel-600 h-2 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div></div>
            <div className="flex gap-6 text-xs font-bold mb-4 font-mono">
                <span className="text-green-400">✅ 성공: {progress.success}</span>
                <span className="text-yellow-400">⚠️ 중복: {progress.skipped}</span>
                <span className="text-red-400">❌ 실패: {progress.fail}</span>
            </div>
            <div className="h-32 overflow-y-auto font-mono text-xs text-gray-300 border-t border-gray-700 pt-2 scrollbar-hide">{logs.map((log, i) => <div key={i}>{log}</div>)}</div>
         </div>
       )}

       {/* 실패 건 재시도 배너 */}
       {!bulkProcessing && failedFiles.length > 0 && (
         <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
           <div>
             <p className="font-bold text-red-700">❌ 실패 {failedFiles.length}건이 있습니다</p>
             <p className="text-xs text-red-500 mt-1">네트워크 오류나 타임아웃으로 실패한 파일을 다시 시도할 수 있습니다.</p>
           </div>
           <div className="flex gap-2">
             <button
               onClick={handleRetryFailed}
               className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 shadow-lg transition-all"
             >
               🔄 {failedFiles.length}건 재시도
             </button>
             <button
               onClick={() => setFailedFiles([])}
               className="px-4 py-2.5 bg-white text-gray-500 border border-gray-300 rounded-xl font-bold text-sm hover:bg-gray-50"
             >
               무시
             </button>
           </div>
         </div>
       )}

       {/* 리스트 테이블 */}
       <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
         {cars.length === 0 ? (
           <div className="p-12 md:p-20 text-center text-gray-400">등록된 차량이 없습니다.</div>
         ) : (
           <>
             {/* Desktop Table View */}
             <div className="hidden md:block" style={{ overflowX: 'auto' }}>
                 <table className="w-full text-left border-collapse min-w-[650px]">
                     <thead className="bg-steel-50 border-b border-gray-100 text-steel-900 uppercase text-xs font-bold tracking-wider">
                         <tr>
                             <th className="p-3 md:p-5 pl-4 md:pl-8 w-20">이미지</th>
                             <th className="p-3 md:p-5">차량 정보 (번호/모델)</th>
                             <th className="p-3 md:p-5">소유자 / 차대번호</th>
                             <th className="p-3 md:p-5">연식 / 연료</th>
                             <th className="p-3 md:p-5 text-right">취득가액 / 총비용</th>
                             <th className="p-3 md:p-5 text-center">관리</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                         {cars.map((car) => (
                             <tr key={car.id} onClick={() => router.push(`/registration/${car.id}`)} className="group hover:bg-steel-50/30 transition-colors cursor-pointer">
                                 <td className="p-3 md:p-5 pl-4 md:pl-8">
                                     <div className="w-14 h-10 bg-gray-100 rounded border overflow-hidden">
                                         {car.registration_image_url ?
                                             (car.registration_image_url.endsWith('.pdf') ?
                                                 <div className="w-full h-full flex items-center justify-center bg-red-50 text-red-500 font-bold text-xs">PDF</div> :
                                                 <img src={car.registration_image_url} className="w-full h-full object-cover" />
                                             ) :
                                             <div className="flex items-center justify-center h-full text-gray-300"><Icons.File /></div>
                                         }
                                     </div>
                                 </td>
                                 <td className="p-3 md:p-5">
                                     <div className="font-black text-gray-900 text-lg">{car.number}</div>
                                     <div className="text-gray-500 text-sm font-medium">
                                         <span className="text-steel-600 font-bold mr-1">{car.brand}</span>
                                         {car.model}
                                     </div>
                                 </td>
                                 <td className="p-3 md:p-5">
                                     <div className="text-gray-900 font-bold">{car.owner_name || '-'}</div>
                                     <div className="text-xs text-gray-500 font-mono mt-1 tracking-tight bg-gray-50 inline-block px-1.5 py-0.5 rounded border border-gray-100 select-all">
                                         {car.vin || '-'}
                                     </div>
                                 </td>
                                 <td className="p-3 md:p-5">
                                     <div className="flex flex-wrap gap-1">
                                         <span className={`px-2 py-0.5 rounded text-xs font-bold ${car.is_used ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{car.is_used ? '중고' : '신차'}</span>
                                         <span className={`px-2 py-0.5 rounded text-xs font-bold ${car.is_commercial === false ? 'bg-teal-100 text-teal-700' : 'bg-steel-100 text-steel-600'}`}>{car.is_commercial === false ? '비영업' : '영업'}</span>
                                         {car.ownership_type && car.ownership_type !== 'company' && (
                                           <span className={`px-2 py-0.5 rounded text-xs font-bold ${car.ownership_type === 'consignment' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>{car.ownership_type === 'consignment' ? '지입' : '임차'}</span>
                                         )}
                                         <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">{car.year}년식</span>
                                         <span className={`px-2 py-0.5 rounded text-xs font-bold ${car.fuel_type === '전기' ? 'bg-steel-100 text-steel-600' : 'bg-green-100 text-green-600'}`}>{car.fuel_type || '기타'}</span>
                                     </div>
                                     {car.is_used && car.purchase_mileage > 0 && (
                                       <div className="text-[10px] text-gray-400 mt-1">구입시 {(car.purchase_mileage / 10000).toFixed(1)}만km</div>
                                     )}
                                 </td>
                                 <td className="p-3 md:p-5 text-right">
                                     <div className="font-bold text-gray-700">{f(car.purchase_price)}원</div>
                                     {car.total_cost > 0 && car.total_cost !== car.purchase_price && (
                                       <div className="text-xs font-bold text-emerald-600 mt-0.5">총 {f(car.total_cost)}원</div>
                                     )}
                                 </td>
                                 <td className="p-3 md:p-5 text-center">
                                     <button onClick={(e) => handleDelete(car.id, e)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Icons.Trash /></button>
                                 </td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
             </div>

             {/* Mobile Card View */}
             <div className="md:hidden">
               {cars.map((car) => (
                 <div key={car.id} className="p-4 flex items-center gap-3">
                   <div className="w-12 h-10 bg-gray-100 rounded border overflow-hidden flex-shrink-0" onClick={() => router.push(`/registration/${car.id}`)}>
                     {car.registration_image_url ?
                       (car.registration_image_url.endsWith('.pdf') ?
                         <div className="w-full h-full flex items-center justify-center bg-red-50 text-red-500 font-bold text-[10px]">PDF</div> :
                         <img src={car.registration_image_url} className="w-full h-full object-cover" />
                       ) :
                       <div className="flex items-center justify-center h-full text-gray-300"><Icons.File /></div>
                     }
                   </div>
                   <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/registration/${car.id}`)}>
                     <div className="font-black text-gray-900">{car.number}</div>
                     <div className="text-xs text-gray-500 truncate">
                       <span className="text-steel-600 font-bold">{car.brand}</span> {car.model}
                     </div>
                     <div className="flex gap-1 mt-1">
                       <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${car.is_used ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{car.is_used ? '중고' : '신차'}</span>
                       <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${car.is_commercial === false ? 'bg-teal-100 text-teal-700' : 'bg-steel-100 text-steel-600'}`}>{car.is_commercial === false ? '비영업' : '영업'}</span>
                       {car.ownership_type && car.ownership_type !== 'company' && (
                         <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${car.ownership_type === 'consignment' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>{car.ownership_type === 'consignment' ? '지입' : '임차'}</span>
                       )}
                       {car.year && <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{car.year}년</span>}
                       {car.fuel_type && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${car.fuel_type === '전기' ? 'bg-steel-100 text-steel-600' : 'bg-green-100 text-green-600'}`}>{car.fuel_type}</span>}
                     </div>
                   </div>
                   <div className="flex flex-col items-end gap-1 flex-shrink-0">
                     <span className="font-bold text-gray-700 text-sm">{f(car.purchase_price)}원</span>
                     {car.total_cost > 0 && car.total_cost !== car.purchase_price && (
                       <span className="text-[10px] font-bold text-emerald-600">총 {f(car.total_cost)}원</span>
                     )}
                     <button onClick={(e) => handleDelete(car.id, e)} className="p-1.5 text-gray-300 hover:text-red-500 rounded"><Icons.Trash /></button>
                   </div>
                 </div>
               ))}
             </div>
           </>
         )}
       </div>

       {/* 결과 모달 */}
       {showResultModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowResultModal(false)}>
            <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center" onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 bg-steel-100 text-steel-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🎉</div>
                <h2 className="text-xl font-black text-gray-900 mb-2">분석 완료</h2>
                <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
                    <div className="flex justify-between py-1 border-b border-gray-200"><span className="text-gray-500">총 파일</span><span className="font-bold">{progress.total}건</span></div>
                    <div className="flex justify-between py-1 border-b border-gray-200 mt-2"><span className="text-steel-600 font-bold">신규 등록</span><span className="font-bold text-steel-600">{progress.success}건</span></div>
                    <div className="flex justify-between py-1 border-b border-gray-200 mt-2"><span className="text-yellow-600 font-bold">중복 제외</span><span className="font-bold text-yellow-600">{progress.skipped}건</span></div>
                    <div className="flex justify-between py-1 mt-2"><span className="text-red-500">실패</span><span className="font-bold text-red-500">{progress.fail}건</span></div>
                </div>
                <div className="flex gap-2">
                  {failedFiles.length > 0 && (
                    <button onClick={() => { setShowResultModal(false); handleRetryFailed(); }}
                      className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600">
                      🔄 {failedFiles.length}건 재시도
                    </button>
                  )}
                  <button onClick={() => setShowResultModal(false)}
                    className={`${failedFiles.length > 0 ? 'flex-1' : 'w-full'} bg-steel-600 text-white py-3 rounded-xl font-bold hover:bg-steel-700`}>
                    확인
                  </button>
                </div>
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
                <button onClick={handleRegister} className="px-6 py-3 rounded-xl font-bold bg-steel-600 text-white hover:bg-steel-700 shadow-lg">등록 완료</button>
            </div>
          </div>
        </div>
       )}
    </div>
  )
}
'use client'
import { supabase } from '../utils/supabase'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'

// --- [아이콘] ---
const Icons = {
  Upload: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Shield: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Plus: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>,
  Trash: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
}

// 유틸리티
const cleanNumber = (numStr: any) => {
    if (!numStr) return 0;
    const str = String(numStr).replace(/,/g, '').replace(/[^0-9]/g, '');
    return Number(str) || 0;
}
const cleanDate = (dateStr: any) => {
  if (!dateStr) return null;
  const nums = String(dateStr).replace(/[^0-9]/g, '');
  return nums.length >= 8 ? `${nums.slice(0, 4)}-${nums.slice(4, 6)}-${nums.slice(6, 8)}` : null;
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

export default function InsuranceListPage() {
const router = useRouter()
const { company, role, adminSelectedCompanyId } = useApp()
const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id
  const [list, setList] = useState<any[]>([])
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, fail: 0, skipped: 0 })
  const [logs, setLogs] = useState<string[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [allCars, setAllCars] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  // 🔥 필터/검색 상태
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'none' | 'expiring'>('all')
  const [listSearchTerm, setListSearchTerm] = useState('')

  // VIN 매칭 실패 재시도 관련
  const [failedItems, setFailedItems] = useState<any[]>([])
  const [retryModalOpen, setRetryModalOpen] = useState(false)
  const [currentRetryIdx, setCurrentRetryIdx] = useState(0)
  const [retryVin, setRetryVin] = useState('')
  const [retryProcessing, setRetryProcessing] = useState(false)
  const [retryCarSearch, setRetryCarSearch] = useState('')
  const [retryCars, setRetryCars] = useState<any[]>([])  // DB 전체 차량 (VIN 포함)

  useEffect(() => { fetchList() }, [company, role, adminSelectedCompanyId])

  const fetchList = async () => {
    let query = supabase
      .from('cars')
      .select(`id, number, model, brand, vin, insurance_contracts (id, company, end_date, premium, status)`)

    if (role === 'god_admin') {
      if (adminSelectedCompanyId) query = query.eq('company_id', adminSelectedCompanyId)
    } else if (company) {
      query = query.eq('company_id', company.id)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) { console.error("리스트 로딩 실패:", error.message); return; }
    const formatted = data?.map((car: any) => ({ ...car, insurance: car.insurance_contracts?.[0] || null }))
    setList(formatted || [])
  }

  const handleDeleteInsurance = async (e: React.MouseEvent, insuranceId: number) => {
      e.stopPropagation();
      if (!confirm("해당 보험 내역을 삭제하시겠습니까?")) return;
      const { error } = await supabase.from('insurance_contracts').delete().eq('id', insuranceId);
      if (error) alert("삭제 실패: " + error.message);
      else { alert("삭제되었습니다."); fetchList(); }
  }

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    const files = e.dataTransfer.files
    if (files?.length) processFiles(files)
  }

  // 파일 선택 핸들러
  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) processFiles(files)
    e.target.value = ''
  }

  // 🚀 [AI 업로드] 스마트 병합(Update) 로직 적용
  const processFiles = async (files: FileList) => {
      if (!files?.length) return
      if (!confirm(`총 ${files.length}건을 분석합니다.\n기존 계약이 있으면 자동으로 파일을 병합(업데이트)합니다.`)) return

      setBulkProcessing(true)
      setProgress({ current: 0, total: files.length, success: 0, fail: 0, skipped: 0 })
      setLogs([])
      const newFailedItems: any[] = []

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

              // VIN 추출
              let detectedVin = result.vin;
              if ((!detectedVin || detectedVin.length < 5) && result.car_number) {
                  const candidate = result.car_number.replace(/[^a-zA-Z0-9]/g, '');
                  if (candidate.length > 10) detectedVin = candidate;
              }
              detectedVin = detectedVin?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

              // VIN 식별 실패 또는 DB 매칭 실패 → failedItems에 수집
              if (!detectedVin || detectedVin.length < 10) {
                  newFailedItems.push({
                    fileName: originalFile.name, detectedVin: detectedVin || '',
                    ocrResult: result, uploadedUrl: urlData.publicUrl,
                    isCertificate: result.doc_type === 'certificate',
                    errorMsg: '차대번호(VIN) 식별 실패'
                  })
                  setProgress(prev => ({ ...prev, fail: prev.fail + 1 }))
                  setLogs(prev => [`⚠️ [VIN 미식별] ${originalFile.name} → 후처리 대기`, ...prev])
                  continue
              }

              // DB 차량 매칭
              const { data: carData } = await supabase.from('cars').select('id, number, brand').ilike('vin', `%${detectedVin.slice(-6)}`).maybeSingle();
              if (!carData) {
                  newFailedItems.push({
                    fileName: originalFile.name, detectedVin,
                    ocrResult: result, uploadedUrl: urlData.publicUrl,
                    isCertificate: result.doc_type === 'certificate',
                    errorMsg: `미등록 차대번호: ${detectedVin}`
                  })
                  setProgress(prev => ({ ...prev, fail: prev.fail + 1 }))
                  setLogs(prev => [`⚠️ [매칭실패] ${originalFile.name}: ${detectedVin} → 후처리 대기`, ...prev])
                  continue
              }

              await saveInsuranceContract(result, carData, urlData.publicUrl)
              setProgress(prev => ({ ...prev, success: prev.success + 1 }))

          } catch (error: any) {
              setProgress(prev => ({ ...prev, fail: prev.fail + 1 }))
              setLogs(prev => [`❌ [실패] ${originalFile.name}: ${error.message}`, ...prev])
          }
      }
      setBulkProcessing(false)
      fetchList()

      // 실패 항목이 있으면 재시도 모달 오픈
      if (newFailedItems.length > 0) {
          setFailedItems(newFailedItems)
          setCurrentRetryIdx(0)
          setRetryVin(newFailedItems[0].detectedVin)
          setRetryCarSearch('')
          // DB 차량 목록 (VIN 포함) 로드
          const { data: cars } = await supabase.from('cars').select('id, number, model, brand, vin').order('number')
          setRetryCars(cars || [])
          setRetryModalOpen(true)
      }
  }

  // 보험 계약 저장 (공통 로직 — processFiles, retryMatch에서 공유)
  const saveInsuranceContract = async (ocrResult: any, carData: any, uploadedUrl: string) => {
      // 브랜드 업데이트
      if (ocrResult.brand && ocrResult.brand !== '기타' && (!carData.brand || carData.brand === '기타')) {
          await supabase.from('cars').update({ brand: ocrResult.brand }).eq('id', carData.id);
      }

      const isCertificate = ocrResult.doc_type === 'certificate';

      const payload: any = {
          car_id: carData.id,
          company: ocrResult.company || '기타',
          product_name: ocrResult.product_name || '',
          start_date: cleanDate(ocrResult.start_date),
          end_date: cleanDate(ocrResult.end_date),
          premium: cleanNumber(ocrResult.premium),
          initial_premium: cleanNumber(ocrResult.initial_premium),
          car_value: cleanNumber(ocrResult.car_value),
          accessory_value: cleanNumber(ocrResult.accessory_value),
          contractor: ocrResult.contractor,
          policy_number: ocrResult.policy_number,
          coverage_bi1: ocrResult.coverage_bi1,
          coverage_bi2: ocrResult.coverage_bi2,
          coverage_pd: ocrResult.coverage_pd,
          coverage_self_injury: ocrResult.coverage_self_injury,
          coverage_uninsured: ocrResult.coverage_uninsured,
          coverage_own_damage: ocrResult.coverage_own_damage,
          coverage_emergency: ocrResult.coverage_emergency,
          driver_range: ocrResult.driver_range,
          age_limit: ocrResult.age_limit,
          installments: ocrResult.installments || [],
          payment_account: ocrResult.payment_account,
          status: 'active'
      }

      if (isCertificate) {
          payload.certificate_url = uploadedUrl;
      } else {
          payload.application_form_url = uploadedUrl;
      }

      const { data: existingContract } = await supabase
          .from('insurance_contracts')
          .select('id')
          .eq('car_id', carData.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

      if (existingContract) {
          await supabase.from('insurance_contracts').update(payload).eq('id', existingContract.id);
          setLogs(prev => [`✨ [업데이트] ${carData.number} 기존 내역에 파일 추가됨`, ...prev])
      } else {
          const { error: insertError } = await supabase.from('insurance_contracts').insert([payload]);
          if (insertError) throw insertError;
          setLogs(prev => [`✅ [신규등록] ${carData.number} (${isCertificate?'증명서':'청약서'})`, ...prev])
      }
  }

  // 재시도: 수정된 VIN으로 재매칭
  const retryWithEditedVin = async () => {
      const item = failedItems[currentRetryIdx]
      if (!retryVin || retryVin.length < 6) { alert('차대번호를 6자 이상 입력해주세요.'); return }
      setRetryProcessing(true)
      try {
          const cleanVin = retryVin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
          const { data: carData } = await supabase.from('cars').select('id, number, brand').ilike('vin', `%${cleanVin.slice(-6)}`).maybeSingle()
          if (!carData) { alert(`매칭 실패: "${cleanVin}" 끝 6자리와 일치하는 차량이 없습니다.`); setRetryProcessing(false); return }
          await saveInsuranceContract(item.ocrResult, carData, item.uploadedUrl)
          alert(`${carData.number} 차량에 등록 완료!`)
          goToNextRetry()
      } catch (err: any) {
          alert('저장 실패: ' + err.message)
      }
      setRetryProcessing(false)
  }

  // 재시도: 차량 직접 선택
  const retryWithCarSelect = async (car: any) => {
      const item = failedItems[currentRetryIdx]
      setRetryProcessing(true)
      try {
          await saveInsuranceContract(item.ocrResult, car, item.uploadedUrl)
          alert(`${car.number} 차량에 등록 완료!`)
          goToNextRetry()
      } catch (err: any) {
          alert('저장 실패: ' + err.message)
      }
      setRetryProcessing(false)
  }

  // 다음 실패 항목으로 이동
  const goToNextRetry = () => {
      const nextIdx = currentRetryIdx + 1
      if (nextIdx < failedItems.length) {
          setCurrentRetryIdx(nextIdx)
          setRetryVin(failedItems[nextIdx].detectedVin)
          setRetryCarSearch('')
      } else {
          setRetryModalOpen(false)
          setFailedItems([])
          fetchList()
      }
  }

  // 재시도 모달 닫기 (남은 건 모두 건너뛰기)
  const closeRetryModal = () => {
      setRetryModalOpen(false)
      setFailedItems([])
      fetchList()
  }

  const openCarSelector = async () => {
    const { data } = await supabase.from('cars').select('id, number, model, brand').order('created_at', { ascending: false })
    setAllCars(data || [])
    setIsModalOpen(true)
  }
  const filteredCars = allCars.filter(car => car.number.includes(searchTerm))
  const f = (n: number) => n?.toLocaleString() || '0'

  // 📊 KPI 통계 계산
  const today = new Date()
  const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  const stats = {
    total: list.length,
    active: list.filter(i => i.insurance && new Date(i.insurance.end_date) >= today).length,
    expired: list.filter(i => i.insurance && new Date(i.insurance.end_date) < today).length,
    none: list.filter(i => !i.insurance).length,
    expiring: list.filter(i => {
      if (!i.insurance) return false
      const end = new Date(i.insurance.end_date)
      return end >= today && end <= thirtyDaysLater
    }).length,
    totalPremium: list.reduce((s, i) => s + (i.insurance?.premium || 0), 0),
  }

  // 🔍 필터 + 검색 적용
  const filteredList = list.filter(item => {
    // 상태 필터
    if (statusFilter === 'active') {
      if (!item.insurance || new Date(item.insurance.end_date) < today) return false
    } else if (statusFilter === 'expired') {
      if (!item.insurance || new Date(item.insurance.end_date) >= today) return false
    } else if (statusFilter === 'none') {
      if (item.insurance) return false
    } else if (statusFilter === 'expiring') {
      if (!item.insurance) return false
      const end = new Date(item.insurance.end_date)
      if (end < today || end > thirtyDaysLater) return false
    }

    // 검색어 필터
    if (listSearchTerm) {
      const term = listSearchTerm.toLowerCase()
      return (
        (item.number || '').toLowerCase().includes(term) ||
        (item.brand || '').toLowerCase().includes(term) ||
        (item.model || '').toLowerCase().includes(term) ||
        (item.vin || '').toLowerCase().includes(term) ||
        (item.insurance?.company || '').toLowerCase().includes(term)
      )
    }
    return true
  })

  // 만기 임박 차량 (30일 이내)
  const expiringCars = list.filter(i => {
    if (!i.insurance) return false
    const end = new Date(i.insurance.end_date)
    return end >= today && end <= thirtyDaysLater
  }).sort((a, b) => new Date(a.insurance.end_date).getTime() - new Date(b.insurance.end_date).getTime())

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
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ textAlign: 'left' }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0 }}>🛡️ 보험/사고/정비</h1>
            <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>보험 가입·갱신 및 사고/정비 이력 관리</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={bulkProcessing}
                className={`cursor-pointer group flex items-center gap-2 bg-steel-600 text-white px-3 py-2 text-sm md:px-5 md:py-3 md:text-base rounded-xl font-bold hover:bg-steel-700 transition-colors ${bulkProcessing ? 'opacity-50 pointer-events-none' : ''}`}
            >
                <Icons.Upload />
                <span>{bulkProcessing ? '분석 및 병합 중...' : '증권 업로드'}</span>
            </button>
            <button onClick={openCarSelector} className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-3 py-2 text-sm md:px-5 md:py-3 md:text-base rounded-xl font-bold hover:bg-gray-50 transition-colors">
                <Icons.Plus /> <span>신규보험등록</span>
            </button>
        </div>
      </div>

      {bulkProcessing && (
         <div className="mb-10 bg-gray-900 rounded-2xl p-6 shadow-2xl ring-4 ring-steel-500/10 overflow-hidden relative">
            <div className="flex justify-between items-end mb-4 relative z-10 text-white">
                <div className="flex items-center gap-3"><span className="animate-spin text-xl">⚙️</span><span className="font-bold">AI 문서 분석 중...</span></div>
                <span className="font-mono font-bold">{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 mb-4"><div className="bg-gradient-to-r from-steel-500 to-steel-400 h-2 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div></div>
            <div className="h-32 overflow-y-auto font-mono text-xs text-gray-300 border-t border-gray-700 pt-2 scrollbar-hide">{logs.map((log, i) => <div key={i}>{log}</div>)}</div>
         </div>
       )}

      {/* 드래그 앤 드롭 영역 */}
      {!bulkProcessing && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            marginBottom: 24,
            border: isDragging ? '2px solid #3b82f6' : '2px dashed #d1d5db',
            borderRadius: 16,
            padding: '32px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            cursor: 'pointer',
            background: isDragging ? '#eff6ff' : '#fafbfc',
            transition: 'all 0.2s ease',
            minHeight: 120,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf"
            style={{ display: 'none' }}
            onChange={handleBulkUpload}
          />

          {/* 좌측: 아이콘 */}
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: isDragging ? '#dbeafe' : '#f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.2s',
          }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke={isDragging ? '#2563eb' : '#94a3b8'} strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" />
            </svg>
          </div>

          {/* 중앙: 텍스트 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: isDragging ? '#1d4ed8' : '#374151', margin: 0, transition: 'color 0.2s' }}>
              {isDragging ? '여기에 파일을 놓으세요' : '청약서/증권 파일을 드래그하여 업로드'}
            </p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0', lineHeight: 1.4 }}>
              이미지 또는 PDF 파일 지원 · 여러 파일 동시 업로드 가능
            </p>
          </div>

          {/* 우측: 파일 선택 버튼 */}
          <div
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
            style={{
              padding: '8px 18px', borderRadius: 8,
              background: '#2563eb', color: '#fff',
              fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            파일 선택
          </div>
        </div>
      )}

      {/* 📊 KPI 대시보드 */}
      {list.length > 0 && !bulkProcessing && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white p-3 md:p-4 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('all')}>
            <p className="text-xs text-gray-400 font-bold">전체 차량</p>
            <p className="text-xl md:text-2xl font-black text-gray-900 mt-1">{stats.total}<span className="text-sm text-gray-400 ml-0.5">대</span></p>
          </div>
          <div className="bg-green-50 p-3 md:p-4 rounded-xl border border-green-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('active')}>
            <p className="text-xs text-green-600 font-bold">가입중</p>
            <p className="text-xl md:text-2xl font-black text-green-700 mt-1">{stats.active}<span className="text-sm text-green-500 ml-0.5">대</span></p>
          </div>
          <div className={`p-3 md:p-4 rounded-xl border cursor-pointer hover:shadow-md transition-shadow ${stats.expiring > 0 ? 'bg-amber-50 border-amber-200 animate-pulse' : 'bg-amber-50 border-amber-100'}`} onClick={() => setStatusFilter('expiring')}>
            <p className="text-xs text-amber-600 font-bold">만기 임박 (30일)</p>
            <p className="text-xl md:text-2xl font-black text-amber-700 mt-1">{stats.expiring}<span className="text-sm text-amber-500 ml-0.5">대</span></p>
          </div>
          <div className="bg-red-50 p-3 md:p-4 rounded-xl border border-red-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('expired')}>
            <p className="text-xs text-red-500 font-bold">만료됨</p>
            <p className="text-xl md:text-2xl font-black text-red-600 mt-1">{stats.expired}<span className="text-sm text-red-400 ml-0.5">대</span></p>
          </div>
          <div className="bg-blue-50 p-3 md:p-4 rounded-xl border border-blue-100">
            <p className="text-xs text-blue-500 font-bold">총 보험료</p>
            <p className="text-lg md:text-xl font-black text-blue-700 mt-1">{f(stats.totalPremium)}<span className="text-sm text-blue-400 ml-0.5">원</span></p>
          </div>
        </div>
      )}

      {/* ⚠️ 만기 임박 경고 배너 */}
      {expiringCars.length > 0 && !bulkProcessing && (
        <div className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <h3 className="font-bold text-amber-800 text-sm">만기 임박 차량 ({expiringCars.length}대) — 30일 이내 갱신 필요</h3>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {expiringCars.slice(0, 8).map(item => {
              const daysLeft = Math.ceil((new Date(item.insurance.end_date).getTime() - today.getTime()) / (1000*60*60*24))
              return (
                <div
                  key={item.id}
                  onClick={() => router.push(`/insurance/${item.id}`)}
                  className="bg-white border border-amber-200 rounded-xl px-3 py-2 flex-shrink-0 cursor-pointer hover:shadow-md transition-all hover:border-amber-400"
                >
                  <div className="font-bold text-gray-800 text-sm">{item.number}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">{item.insurance.company}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${daysLeft <= 7 ? 'bg-red-100 text-red-600' : daysLeft <= 14 ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700'}`}>
                      D-{daysLeft}
                    </span>
                  </div>
                </div>
              )
            })}
            {expiringCars.length > 8 && (
              <div className="bg-amber-100 rounded-xl px-3 py-2 flex-shrink-0 flex items-center text-amber-700 text-xs font-bold">
                +{expiringCars.length - 8}대 더
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🔍 필터 + 검색 바 */}
      {list.length > 0 && !bulkProcessing && (
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {[
              { key: 'all' as const, label: '전체', count: stats.total },
              { key: 'active' as const, label: '가입중', count: stats.active },
              { key: 'expiring' as const, label: '만기임박', count: stats.expiring },
              { key: 'expired' as const, label: '만료', count: stats.expired },
              { key: 'none' as const, label: '미가입', count: stats.none },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 md:px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  statusFilter === tab.key
                    ? 'bg-steel-600 text-white shadow'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="차량번호, 브랜드, VIN, 보험사 검색..."
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm flex-1 focus:outline-none focus:border-steel-500 shadow-sm"
            value={listSearchTerm}
            onChange={e => setListSearchTerm(e.target.value)}
          />
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        {filteredList.length === 0 ? (
            <div className="p-12 md:p-20 text-center text-gray-400">
              {list.length === 0 ? '등록된 차량이 없습니다.' : '해당 조건의 차량이 없습니다.'}
            </div>
        ) : (
            <>
              {/* Desktop Table View */}
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-left text-sm min-w-[700px]">
                  <thead className="bg-gray-50/50 text-gray-500 font-bold border-b border-gray-100 uppercase text-xs tracking-wider">
                    <tr>
                        <th className="p-3 md:p-5 pl-4 md:pl-8">차량번호</th>
                        <th className="p-3 md:p-5">차대번호 (VIN)</th>
                        <th className="p-3 md:p-5">브랜드/모델</th>
                        <th className="p-3 md:p-5">보험사</th>
                        <th className="p-3 md:p-5">만기일</th>
                        <th className="p-3 md:p-5 text-right">보험료</th>
                        <th className="p-3 md:p-5 text-center">상태</th>
                        <th className="p-3 md:p-5 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredList.map((item) => (
                      <tr key={item.id} onClick={() => router.push(`/insurance/${item.id}`)} className="hover:bg-steel-50/30 cursor-pointer transition-colors group">
                        <td className="p-3 md:p-5 pl-4 md:pl-8 font-black text-lg text-gray-900">{item.number}</td>
                        <td className="p-3 md:p-5">
                             <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono text-xs font-bold border border-gray-200 select-all">
                                {item.vin || '-'}
                             </span>
                        </td>
                        <td className="p-3 md:p-5 text-gray-700 font-medium">
                            <span className="text-steel-600 font-bold mr-1">{item.brand}</span>
                            {item.model}
                        </td>
                        <td className="p-3 md:p-5 font-bold text-gray-700">{item.insurance?.company || '-'}</td>
                        <td className="p-3 md:p-5 font-mono text-gray-600">
                          {item.insurance?.end_date ? (
                            <>
                              {item.insurance.end_date}
                              {(() => {
                                const end = new Date(item.insurance.end_date)
                                const diff = Math.ceil((end.getTime() - today.getTime()) / (1000*60*60*24))
                                if (diff < 0) return null
                                if (diff <= 30) return <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${diff<=7?'bg-red-100 text-red-600':diff<=14?'bg-orange-100 text-orange-600':'bg-yellow-100 text-yellow-700'}`}>D-{diff}</span>
                                return null
                              })()}
                            </>
                          ) : '-'}
                        </td>
                        <td className="p-3 md:p-5 text-right font-medium text-steel-600">{item.insurance?.premium ? `${f(item.insurance.premium)}원` : '-'}</td>
                        <td className="p-3 md:p-5 text-center">
                          {item.insurance ? (
                              new Date(item.insurance.end_date) < new Date() ?
                              <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold">만료됨</span> :
                              <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-xs font-bold flex items-center justify-center gap-1 mx-auto w-fit"><Icons.Shield /> 가입중</span>
                          ) : (
                              <span className="bg-gray-100 text-gray-400 px-3 py-1 rounded-full text-xs font-bold">미가입</span>
                          )}
                        </td>
                        <td className="p-3 md:p-5 text-center">
                            {item.insurance && (
                                <button
                                    onClick={(e) => handleDeleteInsurance(e, item.insurance.id)}
                                    className="text-gray-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-all"
                                    title="보험 내역 삭제"
                                >
                                    <Icons.Trash />
                                </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div style={{ display: 'none' }}>
                {filteredList.map((item) => (
                  <div key={item.id} onClick={() => router.push(`/insurance/${item.id}`)} className="p-4 hover:bg-steel-50/30 transition-colors cursor-pointer">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-black text-lg text-gray-900">{item.number}</div>
                        <div className="text-xs text-gray-500 mt-1"><span className="text-steel-600 font-bold">{item.brand}</span> {item.model}</div>
                      </div>
                      {item.insurance && (
                          <button
                              onClick={(e) => handleDeleteInsurance(e, item.insurance.id)}
                              className="text-gray-300 hover:text-red-500 p-1 rounded transition-all"
                              title="보험 내역 삭제"
                          >
                              <Icons.Trash />
                          </button>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono text-xs font-bold border border-gray-200">
                        {item.vin || '-'}
                      </span>
                    </div>
                    <div className="mb-3 pb-3 border-b border-gray-200">
                      <div className="text-xs text-gray-600 font-bold mb-1">보험사</div>
                      <div className="font-bold text-gray-900">{item.insurance?.company || '-'}</div>
                    </div>
                    <div className="mb-3">
                      <div className="text-xs text-gray-600 font-bold mb-1">보험료</div>
                      <div className="text-lg font-black text-steel-600">{item.insurance?.premium ? `${f(item.insurance.premium)}원` : '-'}</div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-xs text-gray-600 font-bold mb-1">만기일</div>
                        <div className="font-mono text-gray-600 text-sm">{item.insurance?.end_date || '-'}</div>
                      </div>
                      <div>
                        {item.insurance ? (
                            new Date(item.insurance.end_date) < new Date() ?
                            <span className="bg-red-100 text-red-600 px-2 py-1 rounded text-xs font-bold">만료됨</span> :
                            <span className="bg-green-100 text-green-600 px-2 py-1 rounded text-xs font-bold flex items-center gap-1"><Icons.Shield /> 가입중</span>
                        ) : (
                            <span className="bg-gray-100 text-gray-400 px-2 py-1 rounded text-xs font-bold">미가입</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white p-0 rounded-2xl w-full max-w-lg h-[600px] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-black">🚙 차량 선택</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-2xl font-light text-gray-400 hover:text-black">&times;</button>
            </div>
            <div className="p-4 bg-white">
                <input autoFocus className="w-full p-4 border-2 border-gray-100 rounded-xl bg-gray-50 font-bold focus:bg-white focus:border-steel-500 outline-none transition-colors" placeholder="차량번호 검색" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/50">
              {filteredCars.map(car => (
                <div key={car.id} onClick={() => router.push(`/insurance/${car.id}`)} className="p-4 bg-white border border-gray-100 rounded-xl hover:border-steel-500 hover:shadow-md cursor-pointer flex justify-between items-center group transition-all">
                  <div><div className="font-bold text-lg text-gray-800 group-hover:text-steel-700">{car.number}</div><div className="text-xs text-gray-400 font-medium">{car.brand} {car.model}</div></div>
                  <div className="text-gray-300 font-bold text-xl group-hover:text-steel-600 transition-colors">→</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIN 매칭 실패 재시도 모달 */}
      {retryModalOpen && failedItems.length > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeRetryModal}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="px-5 py-4 border-b bg-amber-50 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-lg font-black text-amber-800">⚠️ VIN 매칭 실패 — 수동 보정</h2>
                <p className="text-xs text-amber-600 mt-0.5">{currentRetryIdx + 1} / {failedItems.length}건</p>
              </div>
              <button onClick={closeRetryModal} className="text-2xl font-light text-gray-400 hover:text-black">&times;</button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto">
              {(() => {
                const item = failedItems[currentRetryIdx]
                const filteredRetryCars = retryCars.filter(c =>
                  c.number.includes(retryCarSearch) ||
                  (c.vin && c.vin.toUpperCase().includes(retryCarSearch.toUpperCase())) ||
                  (c.brand && c.brand.includes(retryCarSearch))
                )
                return (
                  <div>
                    {/* 실패 파일 정보 */}
                    <div className="p-5 bg-white border-b">
                      <div className="text-xs text-gray-500 font-bold mb-1">파일명</div>
                      <div className="font-bold text-gray-900 text-sm mb-4">{item.fileName}</div>

                      <div className="text-xs text-gray-500 font-bold mb-1">OCR 인식 차대번호</div>
                      <div className="flex gap-2 items-center">
                        <input
                          value={retryVin}
                          onChange={e => setRetryVin(e.target.value.toUpperCase())}
                          className="flex-1 p-3 border rounded-xl font-mono text-sm font-bold tracking-wider focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none bg-amber-50"
                          placeholder="차대번호 입력/수정"
                        />
                        <button
                          onClick={retryWithEditedVin}
                          disabled={retryProcessing}
                          className="px-4 py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {retryProcessing ? '...' : '재매칭'}
                        </button>
                      </div>
                      {item.detectedVin && (
                        <p className="text-xs text-gray-400 mt-2">원본 인식: <span className="font-mono">{item.detectedVin}</span></p>
                      )}
                    </div>

                    {/* 구분선 */}
                    <div className="px-5 py-3 bg-gray-50 border-b">
                      <p className="text-xs text-gray-500 font-bold">또는 아래 등록 차량에서 직접 선택</p>
                      <input
                        value={retryCarSearch}
                        onChange={e => setRetryCarSearch(e.target.value)}
                        className="w-full mt-2 p-2.5 border rounded-lg text-sm focus:border-steel-500 outline-none"
                        placeholder="차량번호, VIN, 브랜드로 검색"
                      />
                    </div>

                    {/* DB 차량 목록 (기준 데이터) */}
                    <div className="max-h-[280px] overflow-y-auto divide-y divide-gray-100">
                      {filteredRetryCars.map(car => (
                        <div
                          key={car.id}
                          onClick={() => !retryProcessing && retryWithCarSelect(car)}
                          className="px-5 py-3 hover:bg-steel-50 cursor-pointer transition-colors group"
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-bold text-gray-900 group-hover:text-steel-700">{car.number}</span>
                              <span className="text-xs text-gray-400 ml-2">{car.brand} {car.model}</span>
                            </div>
                            <span className="text-xs text-steel-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">선택</span>
                          </div>
                          <div className="text-xs text-gray-500 font-mono mt-1">
                            VIN: {car.vin || '미등록'}
                          </div>
                        </div>
                      ))}
                      {filteredRetryCars.length === 0 && (
                        <div className="p-8 text-center text-gray-400 text-sm">검색 결과 없음</div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* 푸터 */}
            <div className="px-5 py-3 border-t bg-gray-50 flex justify-between items-center shrink-0">
              <button onClick={closeRetryModal} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                나머지 모두 건너뛰기
              </button>
              <button
                onClick={goToNextRetry}
                className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg font-bold hover:bg-gray-50 transition-colors"
              >
                이 건 건너뛰기 →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
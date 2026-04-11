'use client'
import { auth } from '@/lib/auth-client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'
import DcStatStrip, { StatItem, ActionButton } from '../components/DcStatStrip'
import DcToolbar, { FilterItem } from '../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../components/NeuDataTable'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

// --- [아이콘] ---
const Icons = {
  Upload: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
  Plus: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>,
  Trash: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  File: () => <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Search: () => <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
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

type RegistrationCar = {
  id: number
  number: string
  brand: string
  model: string
  year: number
  vin: string
  owner_name?: string
  purchase_price: number
  total_cost?: number
  fuel_type?: string
  is_used?: boolean
  is_commercial?: boolean
  ownership_type?: string
  purchase_mileage?: number
  registration_image_url?: string
  created_at: string
}

export default function RegistrationListPage() {

// MySQL API 전환 완료
const router = useRouter()
const { company, role, adminSelectedCompanyId } = useApp()
  const [cars, setCars] = useState<RegistrationCar[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all') // 필터 탭: all, electric, hybrid, gas, consignment

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
    const res = await fetch('/api/cars', { headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } })
    const json = await res.json()
    const { data } = json
    setCars(data || [])
  }

  const fetchStandardCodes = async () => {
    const response = await fetch('/api/vehicle-standard-codes', { headers: await getAuthHeader() })
    const { data, error } = await response.json()
    if (data && !error) {
        setStandardCodes(data)
        const models = Array.from(new Set(data.map((d: any) => d.model_name)))
        setUniqueModels(models as string[])
    }
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('정말 삭제하시겠습니까?')) return
    await fetch(`/api/cars/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } })
    fetchList()
  }

  // 🚀 [업그레이드] PDF 지원 + 브랜드 분석 로직

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
      if (role === 'admin' && !adminSelectedCompanyId) {
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

              // Storage 업로드 — GCS
              const ext = isPdf ? 'pdf' : 'jpg';
              const fileName = `reg_${Date.now()}_${i}.${ext}`
              const uploadFormData = new FormData()
              uploadFormData.append('file', fileToUpload)
              uploadFormData.append('folder', 'car_docs')
              const { Authorization } = await getAuthHeader()
              const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                headers: Authorization ? { Authorization } : {},
                body: uploadFormData,
              })
              const uploadJson = await uploadRes.json()
              const urlData = { publicUrl: uploadJson.url || '' }

              // Base64 변환
              const base64 = await new Promise<string>((r) => {
                  const reader = new FileReader(); reader.readAsDataURL(fileToUpload); reader.onload = () => r(reader.result as string);
              })

              // AI 분석 (MIME Type 전달) + 타임아웃 60초
              const controller = new AbortController()
              const timeout = setTimeout(() => controller.abort(), 60000)

              // 인증 헤더 추가
              const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
              const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
              console.log('[Registration] auth session:', token ? `token=${token.slice(0,20)}...` : 'NO SESSION')
              if (token) {
                authHeaders['Authorization'] = `Bearer ${token}`
              } else {
                console.error('[Registration] ⚠️ 인증 세션 없음 - 401 에러 발생 가능')
              }

              const response = await fetch('/api/ocr-registration', {
                  method: 'POST',
                  headers: authHeaders,
                  body: JSON.stringify({ imageBase64: base64, mimeType: isPdf ? 'application/pdf' : 'image/jpeg' }),
                  signal: controller.signal
              })
              clearTimeout(timeout)

              if (!response.ok) {
                const errText = await response.text()
                console.error('[Registration] API 응답 에러:', response.status, errText)
                throw new Error(`서버 에러 ${response.status}: ${errText}`)
              }

              const result = await response.json()
              if (result.error) throw new Error(result.error)

              const detectedBrand = result.brand || '기타';
              const detectedModel = result.model_name || '미확인 모델';
              const detectedYear = result.year || new Date().getFullYear();
              const detectedVin = result.vin || `NO-VIN-${Date.now()}`;
              let finalPrice = cleanNumber(result.purchase_price);

              // 중복 체크
              const existingRes = await fetch(`/api/cars?vin=${encodeURIComponent(detectedVin)}`, { headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } }); const existingCar = (await existingRes.json()).data?.[0] || null;
              if (existingCar) {
                  setProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }))
                  setLogs(prev => [`⚠️ [중복] ${result.car_number} - 건너뜀`, ...prev])
                  continue;
              }

              // 1. 통합 테이블 갱신 (트림)
              if (detectedModel !== '미확인 모델' && result.trims?.length > 0) {
                  const modelCode = generateModelCode(detectedBrand, detectedModel, detectedYear);
                  const rowsToInsert = result.trims.map((t: any) => ({
                      brand: detectedBrand, model_name: detectedModel, model_code: modelCode,
                      year: detectedYear, trim_name: t.name, price: t.price || 0,
                      fuel_type: result.fuel_type || '기타', normalized_name: normalizeModelName(detectedModel)
                  }));
                  await fetch('/api/vehicle-standard-codes', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(rowsToInsert) });

                  if (finalPrice === 0) {
                      const minPrice = Math.min(...result.trims.map((t:any) => t.price || 999999999));
                      if (minPrice < 999999999) finalPrice = minPrice;
                  }
              }

              // 2. 차량 등록
              const carPayload = {
                number: result.car_number || 'UNKNOWN',
                brand: detectedBrand,
                model: detectedModel,
                year: detectedYear,
                vin: detectedVin,
                purchase_price: finalPrice,
                fuel: result.fuel_type || null
              };
              await fetch('/api/cars', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(carPayload) })

              setProgress(prev => ({ ...prev, success: prev.success + 1 }))
              setLogs(prev => [`✅ [${detectedBrand}] ${detectedModel} 등록 완료 (${isPdf ? 'PDF' : 'IMG'})`, ...prev])

          } catch (error: any) {
              const msg = error.name === 'AbortError' ? '타임아웃 (60초 초과)' : error.message
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
    if (role === 'admin' && !adminSelectedCompanyId) return alert('⚠️ 회사를 먼저 선택해주세요.\n사이드바에서 회사를 선택한 후 등록해주세요.')
    if (!carNum) return alert('차량번호 입력')
    if (!vin) return alert('차대번호 입력')

    const existingRes = await fetch(`/api/cars?vin=${encodeURIComponent(vin)}`, { headers: await getAuthHeader() })
    const { data: existingData } = await existingRes.json()
    if (existingData && existingData.length > 0) return alert('❌ 이미 등록된 차대번호입니다.')

    setCreating(true)
    const fullModelName = `${selectedModelName} ${selectedTrim?.trim_name || ''}`

    try {
      const carPayload = {
        number: carNum,
        brand: selectedModelName,
        model: selectedModelName,
        trim: fullModelName,
        vin: vin,
        purchase_price: finalPrice
      };
      const res = await fetch('/api/cars', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(carPayload) })
      const { error } = await res.json()
      if (error) alert('실패: ' + error)
      else { alert('등록 완료'); setIsModalOpen(false); fetchList(); setCarNum(''); setVin(''); setSelectedModelName(''); setSelectedTrim(null); }
    } catch (err: any) {
      alert('실패: ' + err.message)
    }
    setCreating(false)
  }

  const f = (n: number) => Number(n)?.toLocaleString() || '0'

  // 📊 KPI 통계
  const stats = {
    total: cars.length,
    totalValue: cars.reduce((s, c) => s + (Number(c.purchase_price) || 0), 0),
    totalCost: cars.reduce((s, c) => s + (Number(c.total_cost) || Number(c.purchase_price) || 0), 0),
    avgValue: cars.length > 0 ? Math.round(cars.reduce((s, c) => s + (Number(c.purchase_price) || 0), 0) / cars.length) : 0,
    electric: cars.filter(c => c.fuel_type === '전기').length,
    hybrid: cars.filter(c => (c.fuel_type || '').includes('하이브리드')).length,
    consignment: cars.filter(c => c.ownership_type === 'consignment').length,
    leasedIn: cars.filter(c => c.ownership_type === 'leased_in').length,
  }

  // 최근 7일 등록 차량
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentCars = cars.filter(c => new Date(c.created_at) >= sevenDaysAgo)

  // 필터링된 차량 (검색 + 필터 탭 조합)
  const searchLower = searchTerm.toLowerCase()
  const filteredCars = cars.filter(car => {
    // 검색어 필터링
    const matchesSearch = (car.number || '').toLowerCase().includes(searchLower) ||
      (car.brand || '').toLowerCase().includes(searchLower) ||
      (car.model || '').toLowerCase().includes(searchLower) ||
      (car.vin || '').toLowerCase().includes(searchLower)

    if (!matchesSearch) return false

    // 필터 탭 필터링
    switch (filterType) {
      case 'electric':
        return car.fuel_type === '전기'
      case 'hybrid':
        return (car.fuel_type || '').includes('하이브리드')
      case 'gas':
        return car.fuel_type && !['전기', '하이브리드'].some(f => (car.fuel_type || '').includes(f))
      case 'consignment':
        return car.ownership_type === 'consignment' || car.ownership_type === 'leased_in'
      case 'all':
      default:
        return true
    }
  })

  // 필터 탭 생성
  const filterItems: FilterItem[] = [
    { key: 'all', label: '전체', count: cars.length },
    { key: 'electric', label: '전기', count: stats.electric },
    { key: 'hybrid', label: '하이브리드', count: stats.hybrid },
    { key: 'gas', label: '휘발유/경유', count: cars.filter(c => c.fuel_type && !['전기', '하이브리드'].some(f => (c.fuel_type || '').includes(f))).length },
    { key: 'consignment', label: '지입/임차', count: stats.consignment + stats.leasedIn },
  ].filter(tab => tab.count > 0 || tab.key === 'all') // 0개 카테고리는 제외 (전체 제외)

  // DcStatStrip 데이터
  const statItems: StatItem[] = [
    { label: '등록 차량', value: stats.total, unit: '대' },
    { label: '친환경 차량', value: stats.electric + stats.hybrid, unit: '대' },
    ...(stats.consignment + stats.leasedIn > 0 ? [{ label: '지입/임차', value: stats.consignment + stats.leasedIn, unit: '대' }] : []),
    { label: '최근 7일 등록', value: recentCars.length, unit: '대' },
    { label: '총 취득가액', value: f(stats.totalValue), unit: '원' },
  ]

  const statActions: ActionButton[] = [
    { label: '등록증 업로드', onClick: () => fileInputRef.current?.click(), variant: 'secondary', icon: '📤' },
    { label: '신규차량등록', onClick: () => setIsModalOpen(true), variant: 'primary', icon: '+' },
  ]

  // NeuDataTable 컬럼
  const columns: TableColumn<RegistrationCar>[] = [
    {
      key: 'image',
      label: '이미지',
      width: '80px',
      render: (car) => (
        <div style={{ width: 56, height: 40, background: '#f3f4f6', borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {car.registration_image_url ? (
            car.registration_image_url.endsWith('.pdf') ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fee2e2', color: '#dc2626', fontWeight: 'bold', fontSize: 10 }}>PDF</div>
            ) : (
              <img src={car.registration_image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )
          ) : (
            <span style={{ color: '#64748b' }}><Icons.File /></span>
          )}
        </div>
      ),
    },
    {
      key: 'carInfo',
      label: '차량 정보 (번호/모델)',
      render: (car) => (
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: '#0f2440' }}>{car.number}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            <span style={{ fontWeight: 700, color: '#1e293b', marginRight: 4 }}>{car.brand}</span>
            {car.model}
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      label: '소유자 / 차대번호',
      render: (car) => (
        <div>
          <div style={{ fontWeight: 700, color: '#1e293b' }}>{car.owner_name || '-'}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontFamily: 'monospace', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, display: 'inline-block', border: '1px solid rgba(0,0,0,0.05)' }}>
            {car.vin || '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'specs',
      label: '연식 / 연료 / 구분',
      render: (car) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 11 }}>
          <span style={{ background: '#f3f4f6', color: '#64748b', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>{car.year}년</span>
          <span style={{ background: car.fuel_type === '전기' ? '#e0f2fe' : '#dcfce7', color: car.fuel_type === '전기' ? '#0369a1' : '#166534', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{car.fuel_type || '기타'}</span>
          {car.is_used !== undefined && (
            <span style={{ background: car.is_used ? '#fed7aa' : '#dbeafe', color: car.is_used ? '#b45309' : '#1d4ed8', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{car.is_used ? '중고' : '신차'}</span>
          )}
          {car.is_commercial !== undefined && (
            <span style={{ background: car.is_commercial === false ? '#99f6e4' : '#e0e7ff', color: car.is_commercial === false ? '#0d7377' : '#4338ca', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{car.is_commercial === false ? '비영업' : '영업'}</span>
          )}
          {car.ownership_type && car.ownership_type !== 'company' && (
            <span style={{ background: car.ownership_type === 'consignment' ? '#fed7aa' : '#e9d5ff', color: car.ownership_type === 'consignment' ? '#b45309' : '#6b21a8', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{car.ownership_type === 'consignment' ? '지입' : '임차'}</span>
          )}
        </div>
      ),
    },
    {
      key: 'price',
      label: '취득가액 / 총비용',
      align: 'right',
      render: (car) => (
        <div>
          <div style={{ fontWeight: 700, color: '#1e293b' }}>{f(Number(car.purchase_price))}원</div>
          {car.total_cost && car.total_cost > 0 && car.total_cost !== car.purchase_price && (
            <div style={{ fontSize: 11, color: '#059669', fontWeight: 700, marginTop: 4 }}>총 {f(Number(car.total_cost))}원</div>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      label: '관리',
      align: 'center',
      render: (car) => (
        <button
          onClick={(e) => handleDelete(car.id, e)}
          style={{
            padding: 8,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#64748b',
            transition: 'all 0.2s',
            borderRadius: 6,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent'; }}
        >
          <Icons.Trash />
        </button>
      ),
    },
  ]

  // 모바일 카드 설정
  const mobileCard: MobileCardConfig<RegistrationCar> = {
    title: (car) => car.number,
    subtitle: (car) => `${car.brand} ${car.model} · ${car.year}년 · ${car.fuel_type || '기타'}`,
    trailing: (car) => (
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 900, fontSize: 13, color: '#3b6eb5' }}>{f(Number(car.purchase_price))}원</div>
        <div style={{ fontSize: 10, color: '#8aabc7', marginTop: 2 }}>{car.created_at?.split('T')[0]}</div>
      </div>
    ),
    badges: (car) => (
      <>
        {car.is_used !== undefined && (
          <span style={{ background: car.is_used ? '#fed7aa' : '#dbeafe', color: car.is_used ? '#b45309' : '#1d4ed8', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
            {car.is_used ? '중고' : '신차'}
          </span>
        )}
        {car.is_commercial !== undefined && (
          <span style={{ background: car.is_commercial === false ? '#99f6e4' : '#e0e7ff', color: car.is_commercial === false ? '#0d7377' : '#4338ca', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
            {car.is_commercial === false ? '비영업' : '영업'}
          </span>
        )}
        {car.ownership_type && car.ownership_type !== 'company' && (
          <span style={{ background: car.ownership_type === 'consignment' ? '#fed7aa' : '#e9d5ff', color: car.ownership_type === 'consignment' ? '#b45309' : '#6b21a8', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
            {car.ownership_type === 'consignment' ? '지입' : '임차'}
          </span>
        )}
        {car.fuel_type && (
          <span style={{ background: car.fuel_type === '전기' ? '#e0f2fe' : '#dcfce7', color: car.fuel_type === '전기' ? '#0369a1' : '#166534', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
            {car.fuel_type}
          </span>
        )}
      </>
    ),
  }

  if (role === 'admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div style={{
          background: 'rgba(255,255,255,0.72)',
          borderRadius: 16,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '6px 6px 18px rgba(140,170,210,0.14), -6px -6px 18px rgba(255,255,255,0.47)',
          padding: '48px 20px',
          textAlign: 'center',
        }}>
          <span style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>🏢</span>
          <p style={{ color: '#8aabc7', fontWeight: 600, fontSize: 14 }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50 min-h-screen">

       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
         <div style={{ textAlign: 'left' }}>
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">📋 등록/제원 상세</h1>
            <p className="text-slate-500 text-sm mt-1">차량 등록·이전 서류 및 제원 관리</p>
         </div>
       </div>

       <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" className="hidden" onChange={handleBulkUpload} disabled={bulkProcessing} />

       {/* DcStatStrip + Actions */}
       {cars.length > 0 && !bulkProcessing && (
         <DcStatStrip
           stats={statItems}
           actions={statActions}
         />
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
                 <div className="font-bold text-slate-700 text-sm">{car.number}</div>
                 <div className="flex items-center gap-2 mt-0.5">
                   <span className="text-xs text-slate-500">{car.brand}</span>
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
         <div className="mb-10 bg-slate-900 rounded-2xl p-6 shadow-2xl ring-4 ring-steel-500/10 overflow-hidden relative">
            <div className="flex justify-between items-end mb-4 relative z-10 text-white">
                <div className="flex items-center gap-3"><span className="animate-spin text-xl">⚙️</span><span className="font-bold">AI 분석 진행 중...</span></div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold">{progress.current} / {progress.total}</span>
                  <button
                    onClick={handleCancel}
                    disabled={cancelRef.current}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      cancelRef.current
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-red-500 text-white hover:bg-red-600 shadow-lg'
                    }`}
                  >
                    {cancelRef.current ? '중단 중...' : '🛑 중단'}
                  </button>
                </div>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 mb-4"><div className="bg-gradient-to-r from-steel-500 to-steel-600 h-2 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div></div>
            <div className="flex gap-6 text-xs font-bold mb-4 font-mono">
                <span className="text-green-400">✅ 성공: {progress.success}</span>
                <span className="text-yellow-400">⚠️ 중복: {progress.skipped}</span>
                <span className="text-red-400">❌ 실패: {progress.fail}</span>
            </div>
            <div className="h-32 overflow-y-auto font-mono text-xs text-slate-600 border-t border-slate-700 pt-2 scrollbar-hide">{logs.map((log, i) => <div key={i}>{log}</div>)}</div>
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
               className="px-4 py-2.5 bg-white text-slate-500 border border-black/10 rounded-xl font-bold text-sm hover:bg-gray-50"
             >
               무시
             </button>
           </div>
         </div>
       )}

       {/* DcToolbar (Search + Filter in one bar) */}
       <DcToolbar
         search={searchTerm}
         onSearchChange={setSearchTerm}
         placeholder="차량번호, 브랜드, 모델, 차대번호 검색..."
         filters={filterItems}
         activeFilter={filterType}
         onFilterChange={setFilterType}
       />

       {/* 데이터 테이블 */}
       <NeuDataTable
         columns={columns}
         data={filteredCars}
         rowKey={(car) => car.id}
         onRowClick={(car) => router.push(`/registration/${car.id}`)}
         emptyIcon="📋"
         emptyMessage={searchTerm ? '검색 결과가 없습니다.' : '등록된 차량이 없습니다.'}
         mobileCard={mobileCard}
       />

       {/* 결과 모달 */}
       {showResultModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowResultModal(false)}>
            <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center" onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 bg-steel-100 text-steel-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🎉</div>
                <h2 className="text-xl font-black text-slate-800 mb-2">분석 완료</h2>
                <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-black/5">
                    <div className="flex justify-between py-1 border-b border-black/[0.06]"><span className="text-slate-500">총 파일</span><span className="font-bold">{progress.total}건</span></div>
                    <div className="flex justify-between py-1 border-b border-black/[0.06] mt-2"><span className="text-steel-600 font-bold">신규 등록</span><span className="font-bold text-steel-600">{progress.success}건</span></div>
                    <div className="flex justify-between py-1 border-b border-black/[0.06] mt-2"><span className="text-yellow-600 font-bold">중복 제외</span><span className="font-bold text-yellow-600">{progress.skipped}건</span></div>
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
                <h2 className="text-xl font-black text-slate-800">🚙 수동 등록</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-slate-400 text-2xl">&times;</button>
            </div>
            <div className="p-8 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-slate-500 mb-1">차량 번호</label><input className="w-full p-3 border rounded-xl font-bold" placeholder="12가 3456" value={carNum} onChange={e=>setCarNum(e.target.value)} /></div>
                    <div><label className="block text-xs font-bold text-slate-500 mb-1">차대 번호 (필수)</label><input className="w-full p-3 border rounded-xl font-mono uppercase" placeholder="VIN 입력" value={vin} onChange={e=>setVin(e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">모델</label>
                        <select className="w-full p-3 border rounded-xl" onChange={e=>setSelectedModelName(e.target.value)} defaultValue=""><option value="" disabled>선택</option>{uniqueModels.map((m, i) => <option key={i} value={m}>{m}</option>)}</select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">등급</label>
                        <select className="w-full p-3 border rounded-xl" onChange={e=>setSelectedTrim(standardCodes.find(s => s.id === Number(e.target.value)))} disabled={!selectedModelName} defaultValue=""><option value="" disabled>선택</option>{standardCodes.filter(s => s.model_name === selectedModelName).map(t => (<option key={t.id} value={t.id}>{t.trim_name} ({t.year}년)</option>))}</select>
                    </div>
                </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                <button onClick={()=>setIsModalOpen(false)} className="px-5 py-3 rounded-xl font-bold text-slate-500 hover:bg-gray-100">취소</button>
                <button onClick={handleRegister} className="px-6 py-3 rounded-xl font-bold bg-steel-600 text-white hover:bg-steel-700 shadow-lg">등록 완료</button>
            </div>
          </div>
        </div>
       )}
    </div>
  )
}
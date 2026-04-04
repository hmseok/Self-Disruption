'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

// ─────────────────────────────────────────────
// Auth helper (fetch-based API calls)
// ─────────────────────────────────────────────
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

const Icons = {
  Back: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  Save: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>,
  File: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Check: () => <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  Money: () => <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Upload: () => <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>,
  Close: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  External: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
}

// 유틸리티
const f = (n: any) => Number(n || 0).toLocaleString()
const cleanNumber = (n: any) => Number(String(n).replace(/[^0-9]/g, ''))

export default function InsuranceDetailPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [carInfo, setCarInfo] = useState<any>(null)

  // 확대 보기 모달 상태
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState('')
  const appFileRef = useRef<HTMLInputElement>(null)
  const certFileRef = useRef<HTMLInputElement>(null)

  // PDF 여부 판별
  const isPdfUrl = (url: string) => url?.toLowerCase().includes('.pdf')

  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!previewUrl) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewUrl(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewUrl])

  const [ins, setIns] = useState<any>({
    company: '', product_name: '', contractor: '',
    start_date: '', end_date: '',
    premium: 0, initial_premium: 0, car_value: 0, accessory_value: 0,
    coverage_bi1: '', coverage_bi2: '', coverage_pd: '', coverage_self_injury: '',
    coverage_uninsured: '', coverage_own_damage: '', coverage_emergency: '',
    driver_range: '', age_limit: '', payment_account: '',
    installments: [], application_form_url: '', certificate_url: ''
  })

  useEffect(() => {
    if (!carId) return
    fetchData()
  }, [carId])

  const fetchData = async () => {
    try {
      const headers = await getAuthHeader()

      // Fetch car info
      const carRes = await fetch(`/api/cars/${carId}`, { headers })
      const carJson = await carRes.json()
      const car = carJson.data
      setCarInfo(car)

      // Fetch insurance contracts for this car
      const insRes = await fetch(`/api/insurance?car_id=${carId}`, { headers })
      const insJson = await insRes.json()
      const insurance = insJson.data?.[0]

      if (insurance) setIns(insurance)
      else if (car) setIns((prev: any) => ({ ...prev, car_value: car.purchase_price }))
    } catch (err) {
      console.error('fetchData error:', err)
    }
    setLoading(false)
  }

  const handleChange = (field: string, value: any) => {
    setIns((prev: any) => ({ ...prev, [field]: value }))
  }

  const handleInstallmentChange = (index: number, field: string, value: any) => {
      const newInstallments = [...(ins.installments || [])];
      newInstallments[index] = { ...newInstallments[index], [field]: value };
      setIns((prev: any) => ({ ...prev, installments: newInstallments }));
  }

  const handleSave = async () => {
    const payload = {
        ...ins,
        car_id: carId,
        premium: cleanNumber(ins.premium),
        initial_premium: cleanNumber(ins.initial_premium),
        car_value: cleanNumber(ins.car_value),
        accessory_value: cleanNumber(ins.accessory_value)
    }

    try {
      const headers = await getAuthHeader()
      const method = ins.id ? 'PATCH' : 'POST'
      const url = ins.id ? `/api/insurance/${ins.id}` : '/api/insurance'

      const res = await fetch(url, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (json.error) alert('저장 실패: ' + json.error)
      else { alert('✅ 저장되었습니다!'); window.location.reload(); }
    } catch (err) {
      alert('저장 실패: ' + err)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'application' | 'certificate') => {
    if (!e.target.files?.length) return
    const file = e.target.files[0]
    const fileExt = file.name.split('.').pop()

    // GCS upload
    const uploadFormData = new FormData()
    uploadFormData.append('file', file)
    uploadFormData.append('folder', 'car_docs')
    const { Authorization } = await getAuthHeader()
    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      headers: Authorization ? { Authorization } : {},
      body: uploadFormData,
    })
    const uploadJson = await uploadRes.json()
    if (!uploadRes.ok) return alert('업로드 실패: ' + uploadJson.error)

    const publicUrl = uploadJson.url || ''
    const fieldName = type === 'application' ? 'application_form_url' : 'certificate_url'

    handleChange(fieldName, publicUrl)
    if (ins.id) {
      try {
        const headers = await getAuthHeader()
        await fetch(`/api/insurance/${ins.id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ [fieldName]: publicUrl })
        })
      } catch (err) {
        console.error('Failed to update insurance:', err)
      }
    }
    alert('업로드 완료')
  }

  const openPreview = (url: string, title: string) => {
      if(!url) return;
      setPreviewUrl(url);
      setPreviewTitle(title);
  }

  // 상태 뱃지 계산
  const isActive = ins.end_date && new Date(ins.end_date) > new Date();

  // 🔥 [추가] 분납 합계 계산
  const installmentSum = (ins.installments || []).reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
  const isSumMismatch = ins.premium > 0 && installmentSum > 0 && ins.premium !== installmentSum;

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-400">데이터 로딩 중...</div>

  return (
    <div className="min-h-screen bg-gray-50/50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* 1. 상단 헤더 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-5">
                <button onClick={() => router.push('/insurance')} className="bg-gray-100 p-3 rounded-xl text-gray-500 hover:text-black hover:bg-gray-200 transition-all">
                    <Icons.Back />
                </button>
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{carInfo?.number}</h1>
                        {isActive ? (
                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 border border-green-200">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> 가입중
                            </span>
                        ) : (
                            <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">미가입/만료</span>
                        )}
                    </div>
                    <p className="text-gray-500 font-medium mt-1">{carInfo?.brand} {carInfo?.model} <span className="text-gray-300 mx-2">|</span> {carInfo?.year}년식</p>
                </div>
            </div>
            <button onClick={handleSave} className="flex items-center gap-2 bg-steel-700 text-white px-8 py-4 rounded-xl font-bold hover:bg-steel-800 shadow-lg hover:shadow-xl transition-all">
                <Icons.Save /> <span>저장하기</span>
            </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* 2. 좌측: 입력 폼 섹션 */}
            <div className="lg:col-span-7 space-y-6">

                {/* A. 계약 요약 카드 */}
                <div className="bg-gradient-to-br from-steel-800 to-steel-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Icons.Money /></div>
                    <div className="grid grid-cols-2 gap-8 relative z-10">
                        <div>
                            <p className="text-steel-200 text-xs font-bold uppercase mb-1">총 분담금 (Total Premium)</p>
                            <div className="flex items-end gap-1">
                                <input className="text-3xl font-black bg-transparent outline-none w-full border-b border-steel-700 focus:border-white transition-colors"
                                       value={f(ins.premium)} onChange={e=>handleChange('premium', e.target.value)}/>
                                <span className="text-sm font-bold mb-1">원</span>
                            </div>
                        </div>
                        <div>
                            <p className="text-steel-200 text-xs font-bold uppercase mb-1">초회 분담금 (Initial)</p>
                            <div className="flex items-end gap-1">
                                <input className="text-3xl font-black bg-transparent outline-none w-full border-b border-steel-700 focus:border-white transition-colors text-yellow-300"
                                       value={f(ins.initial_premium)} onChange={e=>handleChange('initial_premium', e.target.value)}/>
                                <span className="text-sm font-bold mb-1 text-yellow-300">원</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* B. 기본 정보 카드 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2"><span className="w-1 h-5 bg-steel-600 rounded-full"></span>계약 기본 정보</h3>
                    <div className="grid grid-cols-2 gap-5">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-400 mb-1">보험/공제 상품명</label>
                            <input className="w-full font-bold text-gray-800 text-lg border border-gray-200 rounded-xl bg-gray-50 p-3 focus:border-steel-500 outline-none transition-colors"
                                   value={ins.product_name || ''} onChange={e=>handleChange('product_name', e.target.value)}/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">계약자</label>
                            <input className="w-full font-bold text-gray-800 border border-gray-200 rounded-xl bg-gray-50 p-3 focus:border-steel-500 outline-none transition-colors"
                                   value={ins.contractor || ''} onChange={e=>handleChange('contractor', e.target.value)}/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">보험사</label>
                            <input className="w-full font-bold text-gray-800 border border-gray-200 rounded-xl bg-gray-50 p-3 focus:border-steel-500 outline-none transition-colors"
                                   value={ins.company || ''} onChange={e=>handleChange('company', e.target.value)}/>
                        </div>
                        <div className="col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                            <label className="text-xs font-bold text-gray-500">보험 기간</label>
                            <div className="flex items-center gap-3">
                                <input type="date" className="bg-transparent font-bold text-gray-700 outline-none font-mono" value={ins.start_date || ''} onChange={e=>handleChange('start_date', e.target.value)}/>
                                <span className="text-gray-400">~</span>
                                <input type="date" className="bg-transparent font-bold text-gray-700 outline-none font-mono" value={ins.end_date || ''} onChange={e=>handleChange('end_date', e.target.value)}/>
                            </div>
                        </div>
                    </div>
                </div>

                {/* C. 담보 및 차량 상세 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2"><span className="w-1 h-5 bg-steel-600 rounded-full"></span>담보 및 차량 상세</h3>

                    <div className="flex gap-4 mb-6">
                        <div className="flex-1 bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <label className="block text-xs text-gray-400">차량가액</label>
                            <input className="w-full bg-transparent font-bold text-right outline-none" value={f(ins.car_value)} onChange={e=>handleChange('car_value', e.target.value)}/>
                        </div>
                        <div className="flex-1 bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <label className="block text-xs text-gray-400">부속품가액</label>
                            <input className="w-full bg-transparent font-bold text-right outline-none" value={f(ins.accessory_value)} onChange={e=>handleChange('accessory_value', e.target.value)}/>
                        </div>
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-100 text-gray-500 text-xs uppercase font-bold">
                                <tr><th className="p-3 text-left w-24">구분</th><th className="p-3 text-left">가입금액 / 한도</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {[
                                    { label: '대인배상 I', key: 'coverage_bi1' },
                                    { label: '대인배상 II', key: 'coverage_bi2' },
                                    { label: '대물배상', key: 'coverage_pd' },
                                    { label: '자기신체', key: 'coverage_self_injury' },
                                    { label: '무보험차', key: 'coverage_uninsured' },
                                    { label: '자기차량', key: 'coverage_own_damage', highlight: true },
                                    { label: '긴급출동', key: 'coverage_emergency' },
                                ].map((row) => (
                                    <tr key={row.key} className="hover:bg-steel-50/50 transition-colors group">
                                        <td className={`p-3 font-bold ${row.highlight ? 'text-steel-600' : 'text-gray-600'}`}>{row.label}</td>
                                        <td className="p-2">
                                            <input className={`w-full p-2 bg-gray-50 rounded-lg outline-none border border-transparent group-hover:border-steel-300 focus:border-steel-500 transition-colors ${row.highlight ? 'font-bold text-steel-700' : ''}`}
                                                   value={ins[row.key] || ''} onChange={e=>handleChange(row.key, e.target.value)}/>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* D. 특약 및 분납 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-full">
                        <h3 className="font-bold text-gray-800 mb-4">📝 특약 사항</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">운전자 범위</label>
                                <input className="w-full p-2 bg-gray-50 rounded-lg font-bold border border-gray-100 outline-none focus:border-steel-500 transition-colors" value={ins.driver_range || ''} onChange={e=>handleChange('driver_range', e.target.value)}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">연령 한정</label>
                                <input className="w-full p-2 bg-gray-50 rounded-lg font-bold border border-gray-100 outline-none focus:border-steel-500 transition-colors" value={ins.age_limit || ''} onChange={e=>handleChange('age_limit', e.target.value)}/>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                             <h3 className="font-bold text-gray-800">📅 분납 계획</h3>
                             {isSumMismatch && <span className="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded">⚠️ 합계 불일치</span>}
                        </div>

                        <div className="overflow-y-auto max-h-48 scrollbar-hide border border-gray-100 rounded-lg mb-2 flex-1">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr><th className="p-2">회차</th><th className="p-2">일자</th><th className="p-2 text-right">금액</th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(ins.installments || []).map((row: any, idx: number) => (
                                        <tr key={idx}>
                                            <td className="p-2 text-center text-gray-500 font-bold">{row.seq}</td>
                                            <td className="p-2 text-center"><input className="bg-transparent text-center w-full outline-none" value={row.date} onChange={e=>handleInstallmentChange(idx, 'date', e.target.value)}/></td>
                                            <td className="p-2 text-right font-bold"><input className="bg-transparent text-right w-full outline-none" value={f(row.amount)} onChange={e=>handleInstallmentChange(idx, 'amount', e.target.value.replace(/,/g,''))}/></td>
                                        </tr>
                                    ))}
                                    {(!ins.installments || ins.installments.length === 0) && <tr><td colSpan={3} className="p-4 text-center text-gray-300">분납 정보 없음</td></tr>}
                                </tbody>
                            </table>
                        </div>

                        {/* 🔥 [추가] 분납 합계 Footer */}
                        <div className={`p-3 rounded-xl flex justify-between items-center font-bold text-sm ${isSumMismatch ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-steel-50 text-steel-800 border border-steel-100'}`}>
                            <span>납입 총액 (합계)</span>
                            <span className="text-lg">{f(installmentSum)}원</span>
                        </div>
                    </div>
                </div>

                {/* E. 입금 계좌 */}
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-2 shadow-sm">
                    <div className="flex items-center gap-2 text-yellow-800 font-bold">
                        <span>💰 분담금 입금계좌</span>
                    </div>
                    <input className="font-bold text-lg text-gray-900 bg-transparent text-center sm:text-right outline-none w-full"
                           value={ins.payment_account || ''} onChange={e=>handleChange('payment_account', e.target.value)}
                           placeholder="은행 계좌번호가 여기에 표시됩니다."/>
                </div>

            </div>

            {/* 3. 우측: Sticky 파일 뷰어 섹션 */}
            <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-6 h-fit">

                {/* 청약서 */}
                {(() => {
                  const url = ins.application_form_url
                  const isPdf = url && isPdfUrl(url)
                  return (
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-steel-500"></span>
                                📄 청약서
                            </h3>
                            <div className="flex items-center gap-2">
                                {url && <Icons.Check />}
                                <button onClick={() => appFileRef.current?.click()} className="text-xs text-steel-600 bg-steel-50 px-2.5 py-1 rounded-lg font-bold hover:bg-steel-100 transition-colors">
                                    {url ? '재업로드' : '업로드'}
                                </button>
                                <input ref={appFileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" onChange={e => handleFileUpload(e, 'application')} />
                            </div>
                        </div>
                        <div
                            onClick={() => url && openPreview(url, '청약서 상세')}
                            className={`aspect-[1/1.4] bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden ${url ? 'cursor-pointer group hover:border-steel-400' : ''} transition-colors relative`}
                        >
                            {url ? (
                                isPdf ? (
                                    <>
                                        <div className="flex flex-col items-center text-gray-500">
                                            <Icons.File />
                                            <p className="text-xs font-bold mt-2">PDF 문서</p>
                                            <p className="text-xs text-gray-400 mt-1">클릭하여 보기</p>
                                        </div>
                                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="bg-white text-gray-800 px-4 py-2 rounded-full font-bold shadow-lg text-sm">🔍 크게 보기</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <img src={url} className="w-full h-full object-contain" alt="청약서" />
                                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="bg-white text-gray-800 px-4 py-2 rounded-full font-bold shadow-lg text-sm">🔍 크게 보기</span>
                                        </div>
                                    </>
                                )
                            ) : (
                                <div className="text-gray-400 flex flex-col items-center cursor-pointer" onClick={() => appFileRef.current?.click()}>
                                    <Icons.Upload />
                                    <p className="text-xs mt-2 font-medium">클릭하여 파일 업로드</p>
                                </div>
                            )}
                        </div>
                    </div>
                  )
                })()}

                {/* 가입증명서 */}
                {(() => {
                  const url = ins.certificate_url
                  const isPdf = url && isPdfUrl(url)
                  return (
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                🎖️ 가입증명서
                            </h3>
                            <div className="flex items-center gap-2">
                                {url && <Icons.Check />}
                                <button onClick={() => certFileRef.current?.click()} className="text-xs text-steel-600 bg-steel-50 px-2.5 py-1 rounded-lg font-bold hover:bg-steel-100 transition-colors">
                                    {url ? '재업로드' : '업로드'}
                                </button>
                                <input ref={certFileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" onChange={e => handleFileUpload(e, 'certificate')} />
                            </div>
                        </div>
                        <div
                            onClick={() => url && openPreview(url, '가입증명서 상세')}
                            className={`aspect-[1/1.4] bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden ${url ? 'cursor-pointer group hover:border-steel-400' : ''} transition-colors relative`}
                        >
                            {url ? (
                                isPdf ? (
                                    <>
                                        <div className="flex flex-col items-center text-gray-500">
                                            <Icons.File />
                                            <p className="text-xs font-bold mt-2">PDF 문서</p>
                                            <p className="text-xs text-gray-400 mt-1">클릭하여 보기</p>
                                        </div>
                                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="bg-white text-gray-800 px-4 py-2 rounded-full font-bold shadow-lg text-sm">🔍 크게 보기</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <img src={url} className="w-full h-full object-contain" alt="가입증명서" />
                                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="bg-white text-gray-800 px-4 py-2 rounded-full font-bold shadow-lg text-sm">🔍 크게 보기</span>
                                        </div>
                                    </>
                                )
                            ) : (
                                <div className="text-gray-400 flex flex-col items-center cursor-pointer" onClick={() => certFileRef.current?.click()}>
                                    <Icons.Upload />
                                    <p className="text-xs mt-2 font-medium">클릭하여 파일 업로드</p>
                                </div>
                            )}
                        </div>
                    </div>
                  )
                })()}

            </div>
        </div>
      </div>

      {/* 확대 보기 모달 — 이미지: 풀스크린 검은 배경 / PDF: 흰색 프레임 */}
      {previewUrl && (
          isPdfUrl(previewUrl) ? (
              /* PDF 모달 — 흰색 프레임 + iframe */
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={() => setPreviewUrl(null)}>
                  <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl overflow-hidden relative shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-between items-center px-6 py-4 border-b bg-white shrink-0">
                          <h3 className="font-bold text-xl text-gray-900 flex items-center gap-2">📄 {previewTitle}</h3>
                          <div className="flex items-center gap-3">
                              <a href={previewUrl} target="_blank" className="flex items-center gap-1 text-sm font-bold text-steel-600 bg-steel-50 px-3 py-2 rounded-lg hover:bg-steel-100 transition-colors">
                                  <Icons.External /> 새 창으로 열기
                              </a>
                              <button onClick={() => setPreviewUrl(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                                  <Icons.Close />
                              </button>
                          </div>
                      </div>
                      <div className="flex-1 bg-gray-100 relative overflow-hidden">
                          <iframe src={previewUrl} className="w-full h-full border-none" />
                      </div>
                  </div>
              </div>
          ) : (
              /* 이미지 모달 — 등록증과 동일한 풀스크린 검은 배경 */
              <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
                  <div className="absolute top-4 right-4 flex items-center gap-3 z-10" onClick={e => e.stopPropagation()}>
                      <a href={previewUrl} target="_blank" className="flex items-center gap-1 text-sm font-bold text-white/80 bg-white/10 px-3 py-2 rounded-lg hover:bg-white/20 transition-colors backdrop-blur-sm">
                          <Icons.External /> 새 창
                      </a>
                      <button onClick={() => setPreviewUrl(null)} className="p-2 text-white/80 hover:text-white bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-sm">
                          <Icons.Close />
                      </button>
                  </div>
                  <p className="text-white/60 text-sm font-bold mb-3">{previewTitle}</p>
                  <img src={previewUrl} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" alt={previewTitle} />
                  <p className="text-white/40 text-xs mt-3">ESC 또는 바깥 영역 클릭으로 닫기</p>
              </div>
          )
      )}
    </div>
  )
}
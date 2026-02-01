'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '../../utils/supabase'
import ContractPaper from '../../components/ContractPaper'
import { useDaumPostcodePopup } from 'react-daum-postcode'
import SignatureCanvas from 'react-signature-canvas'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'

const KOREAN_BANKS = [
  'KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행',
  'IBK기업은행', 'SC제일은행', '씨티은행', 'KDB산업은행',
  '카카오뱅크', '케이뱅크', '토스뱅크',
  '우체국', '새마을금고', '신협', '수협', '산림조합',
  '대구은행', '부산은행', '경남은행', '광주은행', '전북은행', '제주은행'
]

export default function JiipDetailPage() {
  const router = useRouter()
  const params = useParams()
  const isNew = params.id === 'new'
  const jiipId = isNew ? null : params.id

  const [loading, setLoading] = useState(!isNew)
  const [activeTab, setActiveTab] = useState<'input' | 'sign'>('input') // 👈 탭 상태 추가
  const [cars, setCars] = useState<any[]>([])

  // 데이터 상태
  const [item, setItem] = useState<any>({
    car_id: '', tax_type: '세금계산서',
    investor_name: '', investor_phone: '', investor_reg_number: '', investor_email: '',
    investor_address_main: '', investor_address_detail: '',
    bank_name: 'KB국민은행', account_number: '', account_holder: '',
    contract_start_date: '', contract_end_date: '',
    invest_amount: 0, admin_fee: 200000, share_ratio: 70, payout_day: 10,
    mortgage_setup: false, memo: '', signed_file_url: ''
  })

  // UI 상태
  const [showPreview, setShowPreview] = useState(false)
  const [showSignPad, setShowSignPad] = useState(false)
  const [uploading, setUploading] = useState(false)

  const sigCanvas = useRef<any>({})
  const hiddenContractRef = useRef<HTMLDivElement>(null)
  const [tempSignature, setTempSignature] = useState<string>('')
  const open = useDaumPostcodePopup()

  // --- 기존 로직들 (주소, 조회, 저장 등) ---
  const handleAddressComplete = (data: any) => {
    let fullAddress = data.address
    let extraAddress = ''
    if (data.addressType === 'R') {
        if (data.bname !== '') extraAddress += data.bname
        if (data.buildingName !== '') extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName)
        fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '')
    }
    setItem((prev: any) => ({ ...prev, investor_address_main: fullAddress }))
  }
  const handleSearchAddress = () => { open({ onComplete: handleAddressComplete }) }

  useEffect(() => {
    fetchCars()
    if (!isNew && jiipId) {
        fetchDetail()
        setActiveTab('sign') // 수정 모드면 서명 탭을 먼저 보여줄 수도 있음 (선택사항)
    }
  }, [])

  useEffect(() => {
    if (item.contract_start_date) {
      const start = new Date(item.contract_start_date)
      start.setFullYear(start.getFullYear() + 3)
      start.setDate(start.getDate() - 1)
      const endDateStr = start.toISOString().split('T')[0]
      setItem((prev: any) => ({ ...prev, contract_end_date: endDateStr }))
    }
  }, [item.contract_start_date])

  const fetchCars = async () => {
    const { data } = await supabase.from('cars').select('id, number, brand, model').order('number', { ascending: true })
    setCars(data || [])
  }

  const fetchDetail = async () => {
    const { data, error } = await supabase.from('jiip_contracts').select('*').eq('id', jiipId).single()
    if (error) { alert('데이터 로드 실패'); router.push('/jiip'); }
    else {
      setItem({
        ...data,
        investor_address_main: data.investor_address || '',
        investor_address_detail: '',
        investor_email: data.investor_email || '',
        account_holder: data.account_holder || '',
        invest_amount: data.invest_amount || 0,
        admin_fee: data.admin_fee || 200000,
        share_ratio: data.share_ratio || 70,
        payout_day: data.payout_day || 10,
        tax_type: data.tax_type || '세금계산서',
        signed_file_url: data.signed_file_url || ''
      })
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!item.car_id || !item.investor_name) return alert('차량과 투자자 정보는 필수입니다.')
    const fullAddress = `${item.investor_address_main} ${item.investor_address_detail}`.trim()
    const payload = {
      car_id: item.car_id, investor_name: item.investor_name, investor_phone: item.investor_phone,
      investor_reg_number: item.investor_reg_number, investor_email: item.investor_email,
      investor_address: fullAddress, bank_name: item.bank_name, account_number: item.account_number,
      account_holder: item.account_holder, contract_start_date: item.contract_start_date || null,
      contract_end_date: item.contract_end_date || null, invest_amount: item.invest_amount,
      admin_fee: item.admin_fee, share_ratio: item.share_ratio, payout_day: item.payout_day,
      tax_type: item.tax_type, mortgage_setup: item.mortgage_setup, memo: item.memo,
      signed_file_url: item.signed_file_url
    }
    let error
    if (isNew) {
      const { error: insertError } = await supabase.from('jiip_contracts').insert(payload)
      error = insertError
    } else {
      const { error: updateError } = await supabase.from('jiip_contracts').update(payload).eq('id', jiipId)
      error = updateError
    }
    if (error) alert('저장 실패: ' + error.message)
    else { alert('저장되었습니다!'); router.push('/jiip'); }
  }

  const handleDelete = async () => {
    if(!confirm('삭제하시겠습니까?')) return
    await supabase.from('jiip_contracts').delete().eq('id', jiipId)
    router.push('/jiip')
  }

  const shareContractLink = () => {
    if (!item.signed_file_url) return alert('저장된 계약서가 없습니다.')
    navigator.clipboard.writeText(item.signed_file_url)
    alert('✅ 계약서 주소가 복사되었습니다!')
  }

  const saveSignature = async () => {
    if (sigCanvas.current.isEmpty()) return alert("서명을 해주세요!")
    setUploading(true)
    try {
        const signatureDataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png')
        setTempSignature(signatureDataUrl)
        await new Promise(resolve => setTimeout(resolve, 500))

        if (!hiddenContractRef.current) throw new Error("계약서 로드 실패")

        const imgData = await toPng(hiddenContractRef.current, { cacheBust: true, backgroundColor: '#ffffff' })

        const pdf = new jsPDF('p', 'mm', 'a4')
        const pdfWidth = 210
        const imgProps = pdf.getImageProperties(imgData)
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)

        const pdfBlob = pdf.output('blob')
        const fileName = `contract_${jiipId}_admin_${Date.now()}.pdf`

        const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, pdfBlob, { contentType: 'application/pdf' })
        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)
        await supabase.from('jiip_contracts').update({ signed_file_url: publicUrl }).eq('id', jiipId)

        alert("✅ 서명 완료! PDF 저장됨.")
        setItem((prev: any) => ({ ...prev, signed_file_url: publicUrl }))
        setShowSignPad(false)
    } catch (e: any) {
        alert('저장 실패: ' + e.message)
    } finally {
        setUploading(false)
    }
  }

  // 포맷팅 함수들
  const formatPhone = (v: string) => v.replace(/[^0-9]/g, "").replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, `$1-$2-$3`);
  const formatRegNum = (v: string) => {
    const n = v.replace(/[^0-9]/g, "")
    return item.tax_type === '세금계산서' ? (n.length > 5 ? `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5, 10)}` : n) : (n.length > 6 ? `${n.slice(0, 6)}-${n.slice(6, 13)}` : n)
  }
  const formatBankAccount = (b: string, v: string) => b === 'KB국민은행' && v ? (v.replace(/[^0-9]/g, "").length > 8 ? `${v.slice(0, 6)}-${v.slice(6, 8)}-${v.slice(8, 14)}` : v) : v.replace(/[^0-9]/g, "")
  const handleMoneyChange = (f: string, v: string) => { const n = Number(v.replace(/,/g, '')); if (!isNaN(n)) setItem((p: any) => ({ ...p, [f]: n })) }

  if (loading) return <div className="p-20 text-center font-bold text-gray-500">데이터 불러오는 중... ⏳</div>

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 pb-32">
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
          <div ref={hiddenContractRef}>
              {item && cars.length > 0 && <ContractPaper data={item} car={cars.find((c:any) => c.id === item.car_id)} signatureUrl={tempSignature} />}
          </div>
      </div>

      {/* 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <button onClick={() => router.back()} className="text-gray-500 font-bold mb-2 hover:text-black">← 목록으로 돌아가기</button>
          <h1 className="text-3xl font-black text-gray-900">{isNew ? '📄 투자 계약 등록' : '🤝 계약 상세 정보'}</h1>
        </div>
        {!isNew && <button onClick={handleDelete} className="bg-white border border-red-200 text-red-500 px-4 py-2 rounded-xl font-bold hover:bg-red-50">삭제</button>}
      </div>

      {/* 🌟 탭 메뉴 (화면 분리) */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('input')}
            className={`px-6 py-3 font-bold text-lg rounded-t-xl transition-all ${activeTab === 'input' ? 'bg-white border-x border-t border-gray-200 text-indigo-600' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
          >
            📝 정보 입력
          </button>
          {!isNew && (
            <button
                onClick={() => setActiveTab('sign')}
                className={`px-6 py-3 font-bold text-lg rounded-t-xl transition-all ${activeTab === 'sign' ? 'bg-white border-x border-t border-gray-200 text-indigo-600' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
            >
                🔏 서명 및 파일 관리
            </button>
          )}
      </div>

      {/* 1️⃣ 정보 입력 탭 */}
      {activeTab === 'input' && (
        <div className="space-y-8 bg-white p-8 rounded-b-3xl rounded-tr-3xl shadow-sm border border-gray-200 animate-fade-in">
             <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                <h3 className="font-bold text-lg text-blue-900 mb-4">1. 지급 및 세금 유형</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {['세금계산서', '사업소득(3.3%)', '이자소득(27.5%)'].map(type => (
                        <label key={type} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer ${item.tax_type === type ? 'bg-white border-blue-500 shadow-md ring-2 ring-blue-200' : 'bg-blue-50/50 border-blue-200'}`}>
                            <input type="radio" name="tax" value={type} checked={item.tax_type === type} onChange={e => setItem({...item, tax_type: e.target.value})} className="w-5 h-5" />
                            <span className="font-bold text-gray-900">{type}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="font-bold text-lg text-gray-900">2. 투자자(을) 상세 정보</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">대상 차량</label>
                        <select className="w-full border p-3 rounded-xl font-bold bg-gray-50" value={item.car_id} onChange={e => setItem({...item, car_id: e.target.value})}>
                            <option value="">선택하세요</option>
                            {cars.map(c => <option key={c.id} value={c.id}>{c.number} ({c.model})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">연락처</label>
                        <input className="w-full border p-3 rounded-xl" value={item.investor_phone} onChange={e => setItem({...item, investor_phone: formatPhone(e.target.value)})} />
                    </div>
                </div>
                {/* ... (나머지 입력 폼들은 너무 기니까 위와 동일하게 유지) ... */}
                {/* (지면 관계상 상세 입력 필드는 기존 코드 그대로 두시면 됩니다. 여기는 구조만 보여드림) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">성명/상호</label><input className="w-full border p-2 rounded-lg font-bold" value={item.investor_name} onChange={e => setItem({...item, investor_name: e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">등록번호</label><input className="w-full border p-2 rounded-lg" value={item.investor_reg_number} onChange={e => setItem({...item, investor_reg_number: formatRegNum(e.target.value)})} /></div>
                    <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">주소</label><div className="flex gap-2 mb-2"><input className="w-full border p-2 rounded-lg" value={item.investor_address_main} readOnly /><button onClick={handleSearchAddress} className="bg-gray-700 text-white px-3 rounded-lg text-xs font-bold">검색</button></div><input className="w-full border p-2 rounded-lg" value={item.investor_address_detail} onChange={e => setItem({...item, investor_address_detail: e.target.value})} /></div>
                </div>
                {/* 계좌 정보 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="col-span-1"><label className="block text-xs font-bold text-gray-500 mb-1">은행</label><select className="w-full border p-3 rounded-xl bg-white" value={item.bank_name} onChange={e => setItem({...item, bank_name: e.target.value})}>{KOREAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                    <div className="col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">계좌번호</label><input className="w-full border p-3 rounded-xl font-bold text-blue-600" value={item.account_number} onChange={e => setItem({...item, account_number: formatBankAccount(item.bank_name, e.target.value)})} /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-gray-500 mb-1">예금주</label><input className="w-full border p-3 rounded-xl" value={item.account_holder} onChange={e => setItem({...item, account_holder: e.target.value})} /></div>
                </div>
            </div>

            <hr className="border-gray-100" />
            <div className="space-y-4">
                <h3 className="font-bold text-lg text-gray-900">3. 계약 조건</h3>
                <div className="grid grid-cols-3 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">시작일</label><input type="date" className="w-full border p-3 rounded-xl" value={item.contract_start_date} onChange={e => setItem({...item, contract_start_date: e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">종료일</label><input type="date" className="w-full border p-3 rounded-xl" value={item.contract_end_date} onChange={e => setItem({...item, contract_end_date: e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">투자금</label><input type="text" className="w-full border p-3 rounded-xl text-right font-bold" value={item.invest_amount.toLocaleString()} onChange={e => handleMoneyChange('invest_amount', e.target.value)} /></div>
                </div>
                <div className="bg-green-50 p-6 rounded-2xl border border-green-100 grid grid-cols-3 gap-6">
                    <div><label className="block text-xs font-bold text-green-800 mb-1">관리비</label><input type="text" className="w-full border border-green-200 p-2 rounded-lg text-right font-bold bg-white text-green-800" value={item.admin_fee.toLocaleString()} onChange={e => handleMoneyChange('admin_fee', e.target.value)} /></div>
                    <div><label className="block text-xs font-bold text-blue-800 mb-1">배분율(%)</label><input type="number" className="w-full border border-blue-200 p-2 rounded-lg text-right font-bold bg-white text-blue-800" value={item.share_ratio} onChange={e => setItem({...item, share_ratio: Number(e.target.value)})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">지급일</label><input type="number" className="w-full border p-2 rounded-lg text-right bg-white" value={item.payout_day} onChange={e => setItem({...item, payout_day: Number(e.target.value)})} /></div>
                </div>
            </div>

             <div className="mt-8 flex gap-4">
                <button onClick={handleSave} className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-black text-xl hover:bg-green-700 shadow-xl">
                    {isNew ? '✨ 등록 완료' : '💾 내용 저장'}
                </button>
            </div>
        </div>
      )}

      {/* 2️⃣ 서명 및 파일 관리 탭 */}
      {activeTab === 'sign' && !isNew && (
          <div className="bg-white p-8 rounded-b-3xl rounded-tl-3xl shadow-sm border border-gray-200 animate-fade-in min-h-[400px]">

             {/* 상단 액션 버튼 */}
             <div className="flex gap-4 mb-8">
                 <button onClick={() => setShowSignPad(true)} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-indigo-700 flex items-center justify-center gap-2">
                    ✍️ 화면에 서명하기 (현장용)
                 </button>
                 <button onClick={() => setShowPreview(true)} className="flex-1 bg-white border-2 border-indigo-100 text-indigo-900 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-50 flex items-center justify-center gap-2">
                    🖨️ 인쇄 / 미리보기
                 </button>
             </div>

             <h3 className="font-bold text-lg text-gray-900 mb-4 border-t pt-8">📂 보관된 계약서 파일</h3>

             {item.signed_file_url ? (
                <div className="flex flex-col md:flex-row gap-6 items-start bg-gray-50 p-6 rounded-2xl border border-gray-200">
                    {/* 썸네일 */}
                    <div className="w-full md:w-1/3 h-64 bg-white rounded-xl overflow-hidden border border-gray-300 shadow-sm relative group">
                        <iframe src={`${item.signed_file_url}#toolbar=0&navpanes=0&scrollbar=0`} className="w-full h-full pointer-events-none" />
                        <a href={item.signed_file_url} target="_blank" className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                            <span className="bg-white px-3 py-1 rounded-full text-xs font-bold shadow">크게 보기</span>
                        </a>
                    </div>

                    {/* 파일 컨트롤 */}
                    <div className="flex-1 flex flex-col justify-center">
                        <div className="mb-4">
                            <p className="font-bold text-lg text-gray-900">전자 계약서 (PDF)</p>
                            <p className="text-sm text-green-600 font-bold">● 서명 완료됨</p>
                        </div>
                        <div className="space-y-3 w-full md:w-2/3">
                            <button onClick={shareContractLink} className="w-full bg-yellow-400 text-black py-3 rounded-xl font-bold shadow-sm hover:bg-yellow-500">
                                📩 문자/카톡 보내기 (주소복사)
                            </button>
                            <a href={item.signed_file_url} target="_blank" className="block w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-xl font-bold text-center hover:bg-gray-50">
                                ⬇️ 다운로드
                            </a>
                            <button onClick={() => { if(confirm('파일을 삭제합니까?')) setItem({...item, signed_file_url: ''}) }} className="w-full text-red-400 text-sm underline pt-2">
                                파일 삭제
                            </button>
                        </div>
                    </div>
                </div>
             ) : (
                <div className="text-center text-gray-400 p-10 border-2 border-dashed border-gray-200 rounded-xl">
                    <p className="font-bold">아직 서명된 파일이 없습니다.</p>
                    <p className="text-sm mt-1">위 버튼을 눌러 서명을 받거나 파일을 생성하세요.</p>
                </div>
             )}
          </div>
      )}

      {/* 모달들 (미리보기, 서명패드) - 기존과 동일하게 유지 */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex flex-col items-center justify-center p-4">
            <div className="bg-gray-100 w-full max-w-5xl rounded-xl overflow-hidden flex flex-col h-[90vh] shadow-2xl">
                <div className="p-4 bg-white border-b flex justify-between">
                    <h3 className="font-bold">미리보기</h3>
                    <div className="flex gap-2"><button onClick={() => window.print()} className="bg-black text-white px-3 rounded font-bold">인쇄</button><button onClick={() => setShowPreview(false)} className="bg-gray-200 px-3 rounded font-bold">닫기</button></div>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-gray-500 flex justify-center">
                    <ContractPaper data={item} car={cars.find((c:any) => c.id === item.car_id)} />
                </div>
            </div>
        </div>
      )}

      {showSignPad && (
        <div className="fixed inset-0 bg-black/95 z-[9999] flex flex-col items-center justify-center p-2 md:p-6">
            <div className="bg-gray-700 w-full max-w-6xl h-full md:h-[95vh] rounded-xl overflow-hidden flex flex-col shadow-2xl relative">
                <div className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center shadow-md z-20 flex-none">
                    <h3 className="font-bold text-lg">전자 서명</h3>
                    <button onClick={() => setShowSignPad(false)} className="bg-gray-600 text-white px-4 py-2 rounded-lg font-bold">닫기</button>
                </div>
                <div className="flex-1 overflow-y-auto bg-gray-600 p-8 flex justify-center relative scroll-smooth">
                    <div className="shadow-2xl origin-top"><ContractPaper data={item} car={cars.find((c:any) => c.id === item.car_id)} /></div>
                </div>
                <div className="bg-white border-t p-4 z-30 flex-none">
                    <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-6">
                        <div className="hidden md:block w-48 text-right"><p className="font-bold">서명란 👉</p></div>
                        <div className="flex-1 w-full border-2 border-gray-300 rounded-xl bg-gray-50 h-28 relative">
                            <SignatureCanvas ref={sigCanvas} penColor="black" canvasProps={{className: 'w-full h-full cursor-crosshair absolute inset-0'}} />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => sigCanvas.current.clear()} className="px-4 py-3 border rounded-xl font-bold">지우기</button>
                            <button onClick={saveSignature} disabled={uploading} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg">{uploading ? '저장 중...' : '서명 완료'}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
       )}
    </div>
  )
}
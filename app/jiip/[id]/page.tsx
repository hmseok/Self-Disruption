'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApp } from '../../context/AppContext'
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
  const { company, role } = useApp()
  const isNew = params.id === 'new'
  const jiipId = isNew ? null : params.id

  const [loading, setLoading] = useState(!isNew)
  const [cars, setCars] = useState<any[]>([])

  // 💰 [NEW] 실제 통장에서 입금된 총액 (지입 관련)
  const [realDepositTotal, setRealDepositTotal] = useState(0)

  // 데이터 상태
  const [item, setItem] = useState<any>({
    car_id: '', tax_type: '세금계산서',
    investor_name: '', investor_phone: '', investor_reg_number: '', investor_email: '',
    investor_address: '',
    investor_address_detail: '',
    bank_name: 'KB국민은행', account_number: '', account_holder: '',
    contract_start_date: '', contract_end_date: '',
    invest_amount: 0, admin_fee: 200000, share_ratio: 70, payout_day: 10,
    mortgage_setup: false, memo: '', signed_file_url: ''
  })

  // UI 상태
  const [showPreview, setShowPreview] = useState(false)
  const [showSignPad, setShowSignPad] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [canvasWidth, setCanvasWidth] = useState(300)

  const sigCanvas = useRef<any>({})
  const hiddenContractRef = useRef<HTMLDivElement>(null)
  const [tempSignature, setTempSignature] = useState<string>('')
  const open = useDaumPostcodePopup()

  // 서명판 너비 반응형
  useEffect(() => {
    const handleResize = () => {
        setCanvasWidth(window.innerWidth > 600 ? 500 : window.innerWidth - 40)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 주소 검색
  const handleAddressComplete = (data: any) => {
    let fullAddress = data.address
    let extraAddress = ''
    if (data.addressType === 'R') {
        if (data.bname !== '') extraAddress += data.bname
        if (data.buildingName !== '') extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName)
        fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '')
    }
    setItem((prev: any) => ({ ...prev, investor_address: fullAddress }))
  }
  const handleSearchAddress = () => { open({ onComplete: handleAddressComplete }) }

  useEffect(() => {
    fetchCars()
    if (!isNew && jiipId) {
        fetchDetail()
        fetchRealDeposit() // 👈 [NEW] 실제 입금액 조회 함수 호출
    }
  }, [])

  // 1년 자동 연장
  useEffect(() => {
    if (item.contract_start_date) {
      const start = new Date(item.contract_start_date)
      start.setFullYear(start.getFullYear() + 3)
      start.setDate(start.getDate() - 1)
      const endDateStr = start.toISOString().split('T')[0]

      if(!item.contract_end_date) {
          setItem((prev: any) => ({ ...prev, contract_end_date: endDateStr }))
      }
    }
  }, [item.contract_start_date])

  const fetchCars = async () => {
      let query = supabase
            .from('cars')
            .select('id, number, brand, model, company_id')

      // god_admin은 전체, 일반 사용자는 본인 회사 차량만
      if (role !== 'god_admin' && company?.id) {
        query = query.eq('company_id', company.id)
      }

      const { data, error } = await query.order('number', { ascending: true })

      if (error) {
        console.error('차량 불러오기 에러:', error.message)
      } else {
        setCars(data || [])
      }
  }

  // 🏦 [NEW] 실제 통장 입금액 합산 함수
  const fetchRealDeposit = async () => {
      // transactions 테이블에서 이 지입 계약(jiip)과 연결된 '입금(income)' 내역만 가져옴
      const { data, error } = await supabase
          .from('transactions')
          .select('amount')
          .eq('related_type', 'jiip') // 지입 계약 관련
          .eq('related_id', jiipId)   // 현재 계약 ID
          .eq('type', 'income')       // 입금(Income)만 합산

      if (data) {
          const total = data.reduce((acc, cur) => acc + (cur.amount || 0), 0)
          setRealDepositTotal(total)
      }
  }

  const fetchDetail = async () => {
    const { data, error } = await supabase.from('jiip_contracts').select('*').eq('id', jiipId).single()
    if (error) { alert('데이터 로드 실패'); router.push('/jiip'); }
    else {
      setItem({
        ...data,
        investor_address: data.investor_address || '',
        investor_address_detail: data.investor_address_detail || '',
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
    // 🚨 [수정] 투자금(invest_amount)은 필수값 아님. 차량과 투자자 이름만 있으면 저장 가능.
    if (!item.car_id || !item.investor_name) return alert('차량과 투자자 정보는 필수입니다.')

    // 🌟 [추가] 선택된 차량 정보에서 company_id 찾기
        // (item.car_id와 타입이 다를 수 있으니 == 로 비교하거나 Number() 변환 권장)
        const selectedCar = cars.find(c => c.id == item.car_id)
        const companyIdToSave = selectedCar?.company_id

        // 회사 ID가 없으면 경고 (데이터 무결성 위해)
        if (!companyIdToSave) {
            return alert('오류: 선택된 차량의 회사 정보(company_id)를 찾을 수 없습니다.')
        }

    const payload = {
      // 👇 [추가] 여기에 company_id를 꼭 넣어주세요!
      company_id: companyIdToSave,
      car_id: item.car_id, investor_name: item.investor_name, investor_phone: item.investor_phone,
      investor_reg_number: item.investor_reg_number, investor_email: item.investor_email,
      investor_address: item.investor_address,
      investor_address_detail: item.investor_address_detail,
      investor_phone: item.investor_phone,
      investor_reg_number: item.investor_reg_number,
      bank_name: item.bank_name, account_number: item.account_number,
      account_holder: item.account_holder, contract_start_date: item.contract_start_date || null,
      contract_end_date: item.contract_end_date || null,
      invest_amount: item.invest_amount, // 약정금액으로 저장
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
    else { alert('저장되었습니다!'); if(isNew) router.push('/jiip'); }
  }

  const handleDelete = async () => {
    if(!confirm('삭제하시겠습니까?')) return
    await supabase.from('jiip_contracts').delete().eq('id', jiipId)
    router.push('/jiip')
  }

  // 🔗 스마트 링크 발송
  const handleSmartLink = () => {
    const url = `${window.location.origin}/jiip/${jiipId}/sign`
    navigator.clipboard.writeText(url)

    if (item.signed_file_url) {
        alert('✅ 다운로드 페이지 링크가 복사되었습니다!\n고객에게 전송하여 계약서를 확인하게 하세요.')
    } else {
        alert('✅ 서명 요청 링크가 복사되었습니다!\n고객에게 전송해주세요.')
    }
  }

  // ✍️ 서명 저장
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

  const formatPhone = (v: string) => v.replace(/[^0-9]/g, "").replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, `$1-$2-$3`);
  const formatRegNum = (v: string) => {
    const n = v.replace(/[^0-9]/g, "")
    return item.tax_type === '세금계산서' ? (n.length > 5 ? `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5, 10)}` : n) : (n.length > 6 ? `${n.slice(0, 6)}-${n.slice(6, 13)}` : n)
  }
  const formatBankAccount = (b: string, v: string) => b === 'KB국민은행' && v ? (v.replace(/[^0-9]/g, "").length > 8 ? `${v.slice(0, 6)}-${v.slice(6, 8)}-${v.slice(8, 14)}` : v) : v.replace(/[^0-9]/g, "")
  const handleMoneyChange = (f: string, v: string) => { const n = Number(v.replace(/,/g, '')); if (!isNaN(n)) setItem((p: any) => ({ ...p, [f]: n })) }

  const previewData = {
      ...item,
      contractor_address: `${item.investor_address} ${item.investor_address_detail}`.trim()
  }

  if (loading) return <div className="p-20 text-center font-bold text-gray-500">데이터 불러오는 중... ⏳</div>

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-12 md:px-6 bg-gray-50/50 min-h-screen pb-32">

      {/* PDF 생성용 숨겨진 영역 */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
          <div ref={hiddenContractRef}>
              {item && cars.length > 0 && <ContractPaper data={previewData} car={cars.find((c:any) => c.id === item.car_id)} signatureUrl={tempSignature} />}
          </div>
      </div>

      {/* 헤더 */}
      <div className="flex justify-between items-center mb-6 border-b pb-6">
        <div>
          <button onClick={() => router.back()} className="text-gray-500 font-bold mb-2 hover:text-black">← 목록으로 돌아가기</button>
          <h1 className="text-3xl font-black text-gray-900">{isNew ? '📄 투자 계약 등록' : '🤝 계약 상세 정보'}</h1>
        </div>
        {!isNew && (
            <div className="flex gap-2">
                {/* 🌟 상단 스마트 버튼 (텍스트 통일) */}
                <button
                    onClick={handleSmartLink}
                    className={`px-4 py-2 rounded-xl font-bold shadow-sm flex items-center gap-2 text-white ${
                        item.signed_file_url
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-yellow-500 hover:bg-yellow-600'
                    }`}
                >
                    {item.signed_file_url ? '📩 다운로드 링크 발송' : '🔗 계약서 발송'}
                </button>
                <button onClick={handleDelete} className="bg-white border border-red-200 text-red-500 px-4 py-2 rounded-xl font-bold hover:bg-red-50">🗑️ 삭제</button>
            </div>
        )}
      </div>

      {/* 정보 입력 섹션 */}
      <div className="space-y-8 bg-white p-8 rounded-3xl shadow-sm border border-gray-200 mb-8">
            <div className="bg-steel-50 p-6 rounded-2xl border border-steel-100">
                <h3 className="font-bold text-lg text-steel-900 mb-4">1. 지급 및 세금 유형</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {['세금계산서', '사업소득(3.3%)', '이자소득(27.5%)'].map(type => (
                        <label key={type} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer ${item.tax_type === type ? 'bg-white border-steel-500 shadow-md ring-2 ring-steel-200' : 'bg-steel-50/50 border-steel-200'}`}>
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
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">연락처</label><input className="w-full border p-3 rounded-xl" value={item.investor_phone} onChange={e => setItem({...item, investor_phone: formatPhone(e.target.value)})} maxLength={13} /></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">성명/상호</label><input className="w-full border p-2 rounded-lg font-bold" value={item.investor_name} onChange={e => setItem({...item, investor_name: e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">등록번호</label><input className="w-full border p-2 rounded-lg" value={item.investor_reg_number} onChange={e => setItem({...item, investor_reg_number: formatRegNum(e.target.value)})} /></div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-gray-500 mb-1">주소</label>
                        <div className="flex gap-2 mb-2">
                            <input className="w-full border p-2 rounded-lg bg-white" value={item.investor_address} readOnly placeholder="주소 검색 버튼을 눌러주세요" />
                            <button onClick={handleSearchAddress} className="bg-gray-700 text-white px-3 rounded-lg text-xs font-bold whitespace-nowrap">검색</button>
                        </div>
                        <input className="w-full border p-2 rounded-lg" placeholder="상세 주소 입력" value={item.investor_address_detail} onChange={e => setItem({...item, investor_address_detail: e.target.value})} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="col-span-1"><label className="block text-xs font-bold text-gray-500 mb-1">은행</label><select className="w-full border p-3 rounded-xl bg-white" value={item.bank_name} onChange={e => setItem({...item, bank_name: e.target.value})}>{KOREAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                    <div className="col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">계좌번호</label><input className="w-full border p-3 rounded-xl font-bold text-steel-600" value={item.account_number} onChange={e => setItem({...item, account_number: formatBankAccount(item.bank_name, e.target.value)})} /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-gray-500 mb-1">예금주</label><input className="w-full border p-3 rounded-xl" value={item.account_holder} onChange={e => setItem({...item, account_holder: e.target.value})} /></div>
                </div>
            </div>

            <hr className="border-gray-100" />

            {/* 💰 [핵심 수정] 3. 계약 및 자금 현황 (원 위치 수정됨) */}
            <div className="space-y-4">
                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                    3. 계약 조건 및 자금 현황
                    {!isNew && <span className="text-xs bg-steel-100 text-steel-700 px-2 py-1 rounded-md">통장 연동됨</span>}
                </h3>

                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">시작일</label><input type="date" className="w-full border p-3 rounded-xl" value={item.contract_start_date} onChange={e => setItem({...item, contract_start_date: e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">종료일</label><input type="date" className="w-full border p-3 rounded-xl" value={item.contract_end_date} onChange={e => setItem({...item, contract_end_date: e.target.value})} /></div>
                </div>

                {/* 📊 자금 비교 카드 UI */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-2xl border border-gray-200">

                    {/* 왼쪽: 계약서상 금액 (목표) - [UI FIX] "원" 위치 조정 */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">📝 계약서상 약정금액 (목표)</label>
                        <div className="relative">
                            {/* pr-10 추가하여 숫자와 글자 겹침 방지 */}
                            <input
                                type="text"
                                className="w-full border-2 border-gray-300 p-3 pr-10 rounded-xl text-right font-black text-lg focus:border-steel-500 outline-none text-gray-700"
                                value={item.invest_amount.toLocaleString()}
                                onChange={e => handleMoneyChange('invest_amount', e.target.value)}
                                placeholder="0"
                            />
                            {/* right-4 와 수직 중앙 정렬 적용 */}
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">원</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 pl-1">* 계약서에 명시된 금액입니다.</p>
                    </div>

                    {/* 오른쪽: 실제 통장 입금액 (현황) */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">🏦 실제 통장 입금 총액 (현황)</label>
                        <div className={`w-full border-2 p-3 rounded-xl text-right font-black text-lg flex justify-end items-center gap-1 ${
                            realDepositTotal >= item.invest_amount && item.invest_amount > 0
                                ? 'border-green-400 bg-green-50 text-green-700' // 완납 시 초록색
                                : 'border-red-200 bg-white text-red-600'        // 미납 시 빨간색
                        }`}>
                            {realDepositTotal.toLocaleString()} <span className="text-sm">원</span>
                        </div>

                        {/* 차액 계산 표시 */}
                        <div className="flex justify-end mt-1 px-1">
                            {realDepositTotal >= item.invest_amount && item.invest_amount > 0 ? (
                                <span className="text-xs font-bold text-green-600">✅ 완납 확인</span>
                            ) : (
                                <span className="text-xs font-bold text-red-500">
                                    🚨 미수금: {(item.invest_amount - realDepositTotal).toLocaleString()}원
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-green-50 p-6 rounded-2xl border border-green-100 grid grid-cols-3 gap-6">
                    <div><label className="block text-xs font-bold text-green-800 mb-1">관리비</label><input type="text" className="w-full border border-green-200 p-2 rounded-lg text-right font-bold bg-white text-green-800" value={item.admin_fee.toLocaleString()} onChange={e => handleMoneyChange('admin_fee', e.target.value)} /></div>
                    <div><label className="block text-xs font-bold text-steel-800 mb-1">배분율(%)</label><input type="number" className="w-full border border-steel-200 p-2 rounded-lg text-right font-bold bg-white text-steel-800" value={item.share_ratio} onChange={e => setItem({...item, share_ratio: Number(e.target.value)})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">지급일</label><input type="number" className="w-full border p-2 rounded-lg text-right bg-white" value={item.payout_day} onChange={e => setItem({...item, payout_day: Number(e.target.value)})} /></div>
                </div>
            </div>

            <div className="mt-8 flex gap-4">
                <button onClick={handleSave} className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-black text-xl hover:bg-green-700 shadow-xl">
                    {isNew ? '✨ 계약 등록 완료' : '💾 정보 수정사항 저장'}
                </button>
            </div>
      </div>

      {/* 2️⃣ 서명 및 파일 관리 섹션 */}
      {!isNew && (
          <div className="mt-12 pt-10 border-t-2 border-dashed border-gray-300">
             <h3 className="font-black text-2xl text-gray-900 mb-6 flex items-center gap-2">
                📂 서명 및 계약서 파일 관리
             </h3>

             <div className="bg-gray-100 p-8 rounded-3xl shadow-inner border border-gray-200">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                     {/* 🌟 스마트 버튼 적용 (텍스트 통일) */}
                     <button
                        onClick={handleSmartLink}
                        className={`py-4 rounded-2xl font-bold text-lg shadow-sm hover:shadow-md border flex items-center justify-center gap-2 transition-all ${
                            item.signed_file_url
                            ? 'bg-green-500 text-white border-green-600 hover:bg-green-600'
                            : 'bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-500'
                        }`}
                     >
                        {item.signed_file_url ? '📩 다운로드 링크 발송' : '🔗 계약서 발송'}
                     </button>

                     <button onClick={() => setShowSignPad(true)} className="bg-white text-steel-900 py-4 rounded-2xl font-bold text-lg shadow-sm hover:shadow-md hover:text-steel-700 border border-gray-200 flex items-center justify-center gap-2 transition-all">
                        ✍️ 직접 서명
                     </button>
                     <button onClick={() => setShowPreview(true)} className="bg-white text-gray-700 py-4 rounded-2xl font-bold text-lg shadow-sm hover:shadow-md border border-gray-200 flex items-center justify-center gap-2 transition-all">
                        🖨️ 인쇄/미리보기
                     </button>
                 </div>

                 {item.signed_file_url ? (
                    <div className="flex flex-col md:flex-row gap-6 items-start bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                        <div className="w-full md:w-1/3 h-64 bg-gray-50 rounded-xl overflow-hidden border border-gray-200 relative group">
                            <iframe src={`${item.signed_file_url}#toolbar=0&navpanes=0&scrollbar=0`} className="w-full h-full pointer-events-none" />
                            <a href={item.signed_file_url} target="_blank" className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                <span className="bg-white px-4 py-2 rounded-full font-bold shadow-lg">🔍 크게 보기</span>
                            </a>
                        </div>
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="mb-4">
                                <p className="font-bold text-lg text-gray-900">✅ 서명 완료된 계약서 (PDF)</p>
                                <p className="text-sm text-gray-500">차주 서명과 회사 직인이 포함된 법적 효력이 있는 파일입니다.</p>
                            </div>
                            <div className="space-y-3 w-full md:w-2/3">
                                <a href={item.signed_file_url} target="_blank" className="block w-full bg-steel-600 text-white py-3 rounded-xl font-bold text-center hover:bg-steel-700 shadow-md">
                                    ⬇️ 파일 다운로드
                                </a>
                                <button onClick={() => { if(confirm('파일을 삭제합니까?')) setItem({...item, signed_file_url: ''}) }} className="w-full px-4 border border-red-200 text-red-500 rounded-xl font-bold hover:bg-red-50 py-3">
                                    파일 삭제
                                </button>
                            </div>
                        </div>
                    </div>
                 ) : (
                    <div className="text-center text-gray-400 p-10 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
                        <p className="font-bold text-lg text-gray-500">아직 서명된 파일이 없습니다.</p>
                        <p className="text-sm mt-2">위 버튼을 눌러 링크를 보내거나 현장에서 서명을 받아주세요.</p>
                    </div>
                 )}
             </div>
          </div>
      )}

      {/* 🌟 직접 서명 화면 (하단 잘림 방지 적용) */}
      {showSignPad && (
        <div className="fixed inset-0 z-[9999] bg-gray-100 flex flex-col">
            <div className="bg-steel-900 text-white p-4 flex justify-between items-center shadow-md z-10">
                <div>
                    <h3 className="font-bold text-lg">관리자 직접 서명</h3>
                    <p className="text-xs text-steel-200">내용을 확인하고 서명해주세요.</p>
                </div>
                <button onClick={() => setShowSignPad(false)} className="text-white bg-steel-800 hover:bg-steel-700 px-4 py-2 rounded-lg font-bold">닫기 ✕</button>
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-500 p-4">
                <div className="flex justify-center items-start">
                    {/* 👇 shrink-0와 mb-40으로 하단 여백 확보하여 잘림 방지 */}
                    <div className="bg-white shadow-xl rounded-sm overflow-hidden min-h-[500px] mb-40 shrink-0" style={{ width: '100%', maxWidth: '210mm' }}>
                         {item && cars.length > 0 && <ContractPaper data={previewData} car={cars.find((c:any) => c.id === item.car_id)} />}
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 shadow-[0_-4px_15px_rgba(0,0,0,0.1)] z-20 pb-8 rounded-t-2xl fixed bottom-0 left-0 right-0">
                <p className="text-center text-xs text-gray-500 mb-2 font-bold">👇 아래 박스에 서명해 주세요</p>
                <div className="border-2 border-gray-300 rounded-xl bg-gray-50 mb-3 overflow-hidden flex justify-center relative h-40">
                    <SignatureCanvas
                        ref={sigCanvas}
                        penColor="black"
                        canvasProps={{width: canvasWidth, height: 160, className: 'cursor-crosshair'}}
                    />
                    <div className="absolute top-2 right-2 text-xs text-gray-300 pointer-events-none">서명란</div>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => sigCanvas.current.clear()} className="flex-1 bg-gray-200 py-4 rounded-xl font-bold text-gray-700">지우기</button>
                    <button onClick={saveSignature} disabled={uploading} className="flex-[2] bg-steel-600 py-4 rounded-xl font-bold text-white shadow-lg">
                        {uploading ? '처리 중...' : '서명 완료'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* 🌟 미리보기 모달 (하단 잘림 방지 적용) */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex flex-col items-center justify-center p-4">
            <div className="bg-gray-100 w-full max-w-5xl rounded-xl overflow-hidden flex flex-col h-[90vh] shadow-2xl">
                <div className="p-4 bg-white border-b flex justify-between flex-none">
                    <h3 className="font-bold">미리보기</h3>
                    <div className="flex gap-2"><button onClick={() => window.print()} className="bg-black text-white px-3 rounded font-bold">인쇄</button><button onClick={() => setShowPreview(false)} className="bg-gray-200 px-3 rounded font-bold">닫기</button></div>
                </div>
                {/* 👇 items-start 추가 */}
                <div className="flex-1 overflow-y-auto p-8 bg-gray-500 flex justify-center items-start">
                    {/* 👇 mb-20과 shrink-0 추가 */}
                    <div className="bg-white shadow-lg mb-20 shrink-0">
                        {item && cars.length > 0 && <ContractPaper data={previewData} car={cars.find((c:any) => c.id === item.car_id)} />}
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}
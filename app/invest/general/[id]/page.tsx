'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
// 👇 [경로 유지] 기존 파일과 동일하게 설정
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import GeneralContract from '../../../components/GeneralContract'
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

export default function GeneralInvestDetail() {
  const router = useRouter()
  const params = useParams()
  const isNew = params.id === 'new'
  const id = isNew ? null : params.id

  const [loading, setLoading] = useState(!isNew)

  // 💰 [NEW] 실제 통장에서 입금된 총액 (투자 관련)
  const [realDepositTotal, setRealDepositTotal] = useState(0)

  // 📝 데이터 상태
  const [item, setItem] = useState<any>({
    investor_name: '', investor_phone: '',
    investor_address: '',
    investor_address_detail: '',
    bank_name: 'KB국민은행', account_number: '', account_holder: '',
    invest_amount: 0, interest_rate: 12, payment_day: 10,
    contract_start_date: new Date().toISOString().split('T')[0],
    contract_end_date: '',
    memo: '', signed_file_url: '', status: 'active'
  })

  // UI 상태
  const [showPreview, setShowPreview] = useState(false)
  const [showSignPad, setShowSignPad] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Refs
  const hiddenContractRef = useRef<HTMLDivElement>(null)
  const sigCanvas = useRef<any>({})
  const [tempSignature, setTempSignature] = useState('')
  const [canvasWidth, setCanvasWidth] = useState(300)

  const open = useDaumPostcodePopup()

  // 1. 데이터 로드
  useEffect(() => {
    if (!isNew && id) {
        fetchDetail()
        fetchRealDeposit() // 👈 [NEW] 실제 입금액 조회
    }
  }, [id])

  // 직접 서명용 캔버스 크기 조절
  useEffect(() => {
    const handleResize = () => {
        setCanvasWidth(window.innerWidth > 600 ? 500 : window.innerWidth - 40)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 🗓️ 1년 단위 날짜 자동 계산
  useEffect(() => {
    if (item.contract_start_date) {
        const start = new Date(item.contract_start_date)
        const end = new Date(start)
        end.setFullYear(start.getFullYear() + 1)
        end.setDate(start.getDate() - 1)

        if (!item.contract_end_date || isNew) {
            setItem((prev:any) => ({...prev, contract_end_date: end.toISOString().split('T')[0]}))
        }
    }
  }, [item.contract_start_date])

  const fetchDetail = async () => {
    const { data, error } = await supabase.from('general_investments').select('*').eq('id', id).single()
    if (error) { alert('데이터 로드 실패'); router.back(); }
    else {
        setItem({
            ...data,
            investor_address: data.investor_address || '',
            investor_address_detail: data.investor_address_detail || ''
        });
        setLoading(false);
    }
  }

  // 🏦 [NEW] 실제 통장 입금액 합산 함수 (투자 관련)
  const fetchRealDeposit = async () => {
      // transactions 테이블에서 이 투자 건(invest)과 연결된 '입금(income)' 내역만 합산
      const { data } = await supabase
          .from('transactions')
          .select('amount')
          .eq('related_type', 'invest') // 투자 관련
          .eq('related_id', id)         // 현재 투자 ID
          .eq('type', 'income')         // 입금만 합산

      if (data) {
          const total = data.reduce((acc, cur) => acc + (cur.amount || 0), 0)
          setRealDepositTotal(total)
      }
  }

  const handleAddress = (data: any) => {
    let full = data.address
    if(data.buildingName) full += ` (${data.buildingName})`
    setItem({...item, investor_address: full})
  }

  const handleSave = async () => {
    // 🚨 [수정] 투자금(invest_amount) 필수 해제 -> 투자자 이름만 있으면 저장 가능
    if (!item.investor_name) return alert('투자자 성명은 필수입니다.')

    const payload = {
        ...item,
        investor_address: item.investor_address,
        investor_address_detail: item.investor_address_detail
    }

    // 숫자로 변환
    payload.invest_amount = Number(payload.invest_amount)
    payload.interest_rate = Number(payload.interest_rate)
    payload.payment_day = Number(payload.payment_day)

    const query = isNew
        ? supabase.from('general_investments').insert(payload)
        : supabase.from('general_investments').update(payload).eq('id', id)

    const { error } = await query
    if (error) alert('저장 실패: ' + error.message)
    else {
        alert('저장되었습니다!')
        if(isNew) router.push('/invest')
    }
  }

  const handleDelete = async () => {
      if(confirm('정말 삭제하시겠습니까?')) {
          await supabase.from('general_investments').delete().eq('id', id)
          router.push('/invest')
      }
  }

  // 🔗 스마트 링크 발송
  const handleSmartLink = () => {
    const url = `${window.location.origin}/invest/general/${id}/sign`
    navigator.clipboard.writeText(url)

    if (item.signed_file_url) {
        alert('✅ 다운로드 페이지 링크가 복사되었습니다!\n고객에게 전송하여 계약서를 확인하게 하세요.')
    } else {
        alert('✅ 서명 요청 링크가 복사되었습니다!\n고객에게 전송해주세요.')
    }
  }

  // ✍️ 서명 저장
  const saveSignature = async () => {
    if (sigCanvas.current.isEmpty()) return alert("서명을 해주세요")
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
        const fileName = `general_invest_${id}_${Date.now()}.pdf`

        const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, pdfBlob, { contentType: 'application/pdf' })
        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)
        await supabase.from('general_investments').update({ signed_file_url: publicUrl }).eq('id', id)

        alert("✅ 서명 완료! PDF가 저장되었습니다.")
        setItem((prev: any) => ({ ...prev, signed_file_url: publicUrl }))
        setShowSignPad(false)
    } catch (e: any) {
        alert('오류: ' + e.message)
    } finally {
        setUploading(false)
    }
  }

  const formatPhone = (v: string) => v.replace(/[^0-9]/g, "").replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, `$1-$2-$3`)
  const formatAccount = (v: string) => v.replace(/[^0-9-]/g, "")
  // 금액 입력 핸들러
  const handleMoneyChange = (val: string) => {
      const n = Number(val.replace(/,/g, ''))
      if (!isNaN(n)) setItem((prev: any) => ({ ...prev, invest_amount: n }))
  }

  if (loading) return <div className="p-20 text-center font-bold text-gray-500">데이터 불러오는 중... ⏳</div>

  const previewData = {
      ...item,
      investor_address: `${item.investor_address} ${item.investor_address_detail}`.trim()
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 pb-32">

        {/* PDF 생성용 숨겨진 영역 */}
        <div style={{position:'absolute', top:'-10000px', left:'-10000px'}}>
            <div ref={hiddenContractRef}>
                <GeneralContract data={previewData} signatureUrl={tempSignature} />
            </div>
        </div>

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6 border-b pb-6">
            <div>
                <button onClick={() => router.back()} className="text-gray-500 font-bold mb-2 hover:text-black">← 목록으로 돌아가기</button>
                <h1 className="text-3xl font-black text-gray-900">{isNew ? '💰 일반 투자 등록' : '💰 투자 상세 정보'}</h1>
            </div>
            {!isNew && (
                 <div className="flex gap-2">
                    <button onClick={handleSmartLink} className={`px-4 py-2 rounded-xl font-bold shadow-sm flex items-center gap-2 text-white ${item.signed_file_url ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-500 hover:bg-yellow-600'}`}>
                        {item.signed_file_url ? '📩 다운로드 링크' : '🔗 서명 링크'}
                    </button>
                    <button onClick={handleDelete} className="bg-white border border-red-200 text-red-500 px-4 py-2 rounded-xl font-bold hover:bg-red-50">🗑️ 삭제</button>
                </div>
            )}
        </div>

        {/* 1️⃣ 정보 입력 섹션 */}
        <div className="space-y-8 bg-white p-8 rounded-3xl shadow-sm border border-gray-200 mb-8">
            <div className="space-y-4">
                <h3 className="font-bold text-lg text-gray-900 border-b pb-2">1. 투자자 정보</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">성명/법인명</label><input className="w-full border p-3 rounded-xl font-bold" value={item.investor_name} onChange={e=>setItem({...item, investor_name:e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">연락처</label><input className="w-full border p-3 rounded-xl" placeholder="010-0000-0000" value={item.investor_phone} onChange={e=>setItem({...item, investor_phone:formatPhone(e.target.value)})} maxLength={13} /></div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-gray-500 mb-1">주소</label>
                        <div className="flex gap-2 mb-2">
                            <input className="w-full border p-3 rounded-xl bg-gray-50" value={item.investor_address} readOnly placeholder="주소 검색 버튼을 눌러주세요" />
                            <button onClick={() => open({onComplete: handleAddress})} className="bg-gray-800 text-white px-4 rounded-xl font-bold whitespace-nowrap">주소검색</button>
                        </div>
                        <input className="w-full border p-3 rounded-xl" placeholder="상세 주소 입력" value={item.investor_address_detail} onChange={e=>setItem({...item, investor_address_detail:e.target.value})} />
                    </div>
                </div>
            </div>

            {/* 💰 [UI 수정] 2. 투자 조건 및 자금 현황 */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg text-gray-900 border-b pb-2 pt-2 flex items-center gap-2">
                                2. 투자 조건 및 자금 현황
                                {!isNew && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md">통장 연동됨</span>}
                            </h3>

                            {/* 📊 자금 비교 카드 UI */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-2xl border border-gray-200">
                                {/* 왼쪽: 약정금 (목표) - [수정됨] "원" 위치 조정 */}
                                <div>
                                    <label className="block text-xs font-bold text-blue-600 mb-1">📝 투자 약정금 (Target)</label>
                                    <div className="relative">
                                        <input
                                            className="w-full border-2 border-blue-100 p-3 pr-10 rounded-xl text-right font-black text-xl text-gray-900 focus:border-blue-500 outline-none"
                                            value={item.invest_amount ? Number(item.invest_amount).toLocaleString() : ''}
                                            onChange={e => handleMoneyChange(e.target.value)}
                                            placeholder="0"
                                        />
                                        {/* 👇 위치를 right-4로 끝에 붙이고, 수직 중앙 정렬 */}
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">원</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1 pl-1">* 계약서에 명시된 금액입니다.</p>
                                </div>

                                {/* 오른쪽: 실제 입금액 (현황) */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">🏦 실제 통장 입금 총액 (Current)</label>
                                    <div className={`w-full border-2 p-3 rounded-xl text-right font-black text-xl flex justify-end items-center gap-1 ${
                                        realDepositTotal >= item.invest_amount && item.invest_amount > 0
                                            ? 'border-green-400 bg-green-50 text-green-700'
                                            : 'border-red-200 bg-white text-red-600'
                                    }`}>
                                        {realDepositTotal.toLocaleString()} <span className="text-sm">원</span>
                                    </div>

                                    {/* 차액 표시 */}
                                    <div className="flex justify-end mt-1 px-1">
                                        {realDepositTotal >= item.invest_amount && item.invest_amount > 0 ? (
                                            <span className="text-xs font-bold text-green-600">✅ 완납 (입금 완료)</span>
                                        ) : (
                                            <span className="text-xs font-bold text-red-500">
                                                🚨 미수금: {(item.invest_amount - realDepositTotal).toLocaleString()}원
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                                <div><label className="block text-xs font-bold text-green-600 mb-1">연 수익률(%)</label><input type="number" className="w-full border p-3 rounded-xl text-right font-bold" value={item.interest_rate} onChange={e=>setItem({...item, interest_rate:e.target.value})} /></div>
                                <div><label className="block text-xs font-bold text-gray-500 mb-1">이자 지급일</label><input type="number" className="w-full border p-3 rounded-xl text-right" placeholder="10" value={item.payment_day} onChange={e=>setItem({...item, payment_day:e.target.value})} /></div>
                                <div><label className="block text-xs font-bold text-gray-500 mb-1">계약 시작일</label><input type="date" className="w-full border p-3 rounded-xl" value={item.contract_start_date} onChange={e=>setItem({...item, contract_start_date:e.target.value})} /></div>
                                <div><label className="block text-xs font-bold text-gray-500 mb-1">종료일 (자동)</label><input type="date" className="w-full border p-3 rounded-xl" value={item.contract_end_date} onChange={e=>setItem({...item, contract_end_date:e.target.value})} /></div>
                            </div>
                        </div>


            <div className="space-y-4">
                <h3 className="font-bold text-lg text-gray-900 border-b pb-2 pt-2">3. 입금 계좌 정보</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">은행명</label><select className="w-full border p-3 rounded-xl bg-white" value={item.bank_name} onChange={e => setItem({...item, bank_name: e.target.value})}>{KOREAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                    <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">계좌번호</label><input className="w-full border p-3 rounded-xl" value={item.account_number} onChange={e=>setItem({...item, account_number:formatAccount(e.target.value)})} /></div>
                </div>
            </div>

            <div className="pt-4">
                <button onClick={handleSave} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all">
                    {isNew ? '✨ 투자 등록 완료' : '💾 정보 수정 저장'}
                </button>
            </div>
        </div>

        {/* 2️⃣ 하단: 서명 및 파일 관리 */}
        {!isNew && (
            <div className="mt-12 pt-10 border-t-2 border-dashed border-gray-300">
                <h3 className="font-black text-2xl text-gray-900 mb-6 flex items-center gap-2">
                    📂 서명 및 계약서 파일 관리
                </h3>

                <div className="bg-gray-100 p-8 rounded-3xl shadow-inner border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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

                        <button onClick={() => setShowSignPad(true)} className="bg-white text-indigo-900 py-4 rounded-2xl font-bold text-lg shadow-sm hover:shadow-md hover:text-indigo-700 border border-gray-200 flex items-center justify-center gap-2 transition-all">
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
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">서명 완료</span>
                                        <span className="text-xs text-gray-400">{new Date().toISOString().split('T')[0]}</span>
                                    </div>
                                    <p className="font-bold text-lg text-gray-900">✅ 서명 완료된 계약서 (PDF)</p>
                                    <p className="text-sm text-gray-500">법적 효력이 있는 전자 계약서입니다.</p>
                                </div>
                                <div className="space-y-3 w-full md:w-2/3">
                                    <a href={item.signed_file_url} target="_blank" className="block w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-center hover:bg-indigo-700 shadow-md transition-all">
                                        ⬇️ 파일 다운로드
                                    </a>
                                    <button onClick={() => { if(confirm('파일을 삭제합니까?')) setItem({...item, signed_file_url: ''}) }} className="w-full px-4 border border-red-200 text-red-500 rounded-xl font-bold hover:bg-red-50 py-3 transition-all">
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

        {/* 직접 서명 화면 (전체화면) */}
        {showSignPad && (
            <div className="fixed inset-0 z-[9999] bg-gray-100 flex flex-col">
                <div className="bg-indigo-900 text-white p-4 flex justify-between items-center shadow-md z-10">
                    <div>
                        <h3 className="font-bold text-lg">관리자 직접 서명</h3>
                        <p className="text-xs text-indigo-200">내용을 확인하고 서명해주세요.</p>
                    </div>
                    <button onClick={() => setShowSignPad(false)} className="text-white bg-indigo-800 hover:bg-indigo-700 px-4 py-2 rounded-lg font-bold">닫기 ✕</button>
                </div>

                <div className="flex-1 overflow-y-auto bg-gray-500 p-4">
                    <div className="flex justify-center">
                        <div className="bg-white shadow-xl rounded-sm overflow-hidden min-h-[500px]" style={{ width: '100%', maxWidth: '210mm' }}>
                             <GeneralContract data={previewData} mode="mobile" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 shadow-[0_-4px_15px_rgba(0,0,0,0.1)] z-20 pb-8 rounded-t-2xl">
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
                        <button onClick={saveSignature} disabled={uploading} className="flex-[2] bg-indigo-600 py-4 rounded-xl font-bold text-white shadow-lg">
                            {uploading ? '처리 중...' : '서명 완료'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* 미리보기 모달 */}
        {showPreview && (
            <div className="fixed inset-0 bg-black/80 z-[9999] flex flex-col items-center justify-center p-4">
                <div className="bg-gray-100 w-full max-w-5xl rounded-xl overflow-hidden flex flex-col h-[90vh] shadow-2xl">
                    <div className="p-4 bg-white border-b flex justify-between">
                        <h3 className="font-bold">미리보기</h3>
                        <div className="flex gap-2"><button onClick={() => window.print()} className="bg-black text-white px-3 rounded font-bold">인쇄</button><button onClick={() => setShowPreview(false)} className="bg-gray-200 px-3 rounded font-bold">닫기</button></div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8 bg-gray-500 flex justify-center">
                        <GeneralContract data={previewData} />
                    </div>
                </div>
            </div>
        )}
    </div>
  )
}
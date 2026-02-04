'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
// 👇 [경로 확인] app/invest/general/[id] 위치이므로 3단계 상위(../)가 맞습니다.
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

  // 📝 데이터 상태
  const [item, setItem] = useState<any>({
    investor_name: '', investor_phone: '',
    investor_address: '',         // 🏠 기본 주소
    investor_address_detail: '',  // 🏢 상세 주소
    bank_name: 'KB국민은행', account_number: '', account_holder: '',
    invest_amount: 0, interest_rate: 12, payment_day: 10, // 기본값 설정
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

  const open = useDaumPostcodePopup()

  // 1. 데이터 로드
  useEffect(() => {
    if (!isNew && id) fetchDetail()
  }, [id])

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
        // DB에서 불러온 주소 매핑
        setItem({
            ...data,
            investor_address: data.investor_address || '',
            investor_address_detail: data.investor_address_detail || ''
        });
        setLoading(false);
    }
  }

  // 주소 검색
  const handleAddress = (data: any) => {
    let full = data.address
    if(data.buildingName) full += ` (${data.buildingName})`
    setItem({...item, investor_address: full})
  }

  // 2. 저장 (분리 저장)
  const handleSave = async () => {
    if (!item.investor_name || !item.invest_amount) return alert('투자자명과 투자금은 필수입니다.')

    const payload = {
        ...item,
        // DB 컬럼에 맞춰 분리 저장
        investor_address: item.investor_address,
        investor_address_detail: item.investor_address_detail
    }

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

  // 🔗 링크 복사
  const copySignLink = () => {
    const url = `${window.location.origin}/invest/general/${id}/sign`
    navigator.clipboard.writeText(url)
    alert('✅ 서명 페이지 주소가 복사되었습니다!\n\n' + url)
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

        alert("✅ 서명 완료! PDF 저장됨.")
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

  if (loading) return <div className="p-20 text-center font-bold text-gray-500">데이터 불러오는 중... ⏳</div>

  // 미리보기용 데이터 (주소 합침)
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
                    <button onClick={copySignLink} className="bg-yellow-400 text-black border border-yellow-500 px-4 py-2 rounded-xl font-bold hover:bg-yellow-500 shadow-sm flex items-center gap-2">
                        🔗 서명 링크 복사
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

                    {/* 주소 입력 (분리) */}
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

            <div className="space-y-4">
                <h3 className="font-bold text-lg text-gray-900 border-b pb-2 pt-2">2. 투자 조건</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><label className="block text-xs font-bold text-blue-600 mb-1">투자 원금 (KRW)</label><input className="w-full border-2 border-blue-100 p-3 rounded-xl text-right font-black text-xl text-gray-900" value={item.invest_amount ? Number(item.invest_amount).toLocaleString() : ''} onChange={e=>setItem({...item, invest_amount: Number(e.target.value.replace(/,/g,''))})} placeholder="0" /></div>
                    <div><label className="block text-xs font-bold text-green-600 mb-1">연 수익률(%)</label><input type="number" className="w-full border p-3 rounded-xl text-right font-bold" value={item.interest_rate} onChange={e=>setItem({...item, interest_rate:e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">이자 지급일</label><input type="number" className="w-full border p-3 rounded-xl text-right" placeholder="10" value={item.payment_day} onChange={e=>setItem({...item, payment_day:e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">계약 시작일</label><input type="date" className="w-full border p-3 rounded-xl" value={item.contract_start_date} onChange={e=>setItem({...item, contract_start_date:e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">계약 종료일 (자동)</label><input type="date" className="w-full border p-3 rounded-xl" value={item.contract_end_date} onChange={e=>setItem({...item, contract_end_date:e.target.value})} /></div>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="font-bold text-lg text-gray-900 border-b pb-2 pt-2">3. 입금 계좌</h3>
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

        {/* 2️⃣ 하단: 서명 및 파일 관리 (수정 모드일 때만 표시) */}
        {!isNew && (
            <div className="mt-12 pt-10 border-t-2 border-dashed border-gray-300">
                <h3 className="font-black text-2xl text-gray-900 mb-6 flex items-center gap-2">
                    📂 서명 및 계약서 파일 관리
                </h3>

                <div className="bg-gray-100 p-8 rounded-3xl shadow-inner border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <button onClick={copySignLink} className="bg-yellow-400 text-black py-4 rounded-2xl font-bold text-lg shadow-sm hover:shadow-md hover:bg-yellow-500 border border-yellow-500 flex items-center justify-center gap-2 transition-all">
                            🔗 링크 발송
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
                                    <p className="font-bold text-lg text-gray-900">✅ 서명 완료된 계약서 (PDF)</p>
                                    <p className="text-sm text-gray-500">법적 효력이 있는 전자 계약서입니다.</p>
                                </div>
                                <div className="space-y-3 w-full md:w-2/3">
                                    <a href={item.signed_file_url} target="_blank" className="block w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-center hover:bg-indigo-700 shadow-md">
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

        {/* 서명 모달 */}
        {showSignPad && (
            <div className="fixed inset-0 bg-black/90 z-[9999] flex flex-col items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
                    <h3 className="font-bold text-lg mb-4">관리자 직접 서명</h3>
                    <div className="border border-gray-300 h-40 bg-gray-50 mb-4 rounded-xl overflow-hidden relative">
                         <SignatureCanvas ref={sigCanvas} penColor="black" canvasProps={{className: 'w-full h-full cursor-crosshair'}} />
                         <div className="absolute top-2 right-2 text-xs text-gray-300 pointer-events-none">서명란</div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={()=>sigCanvas.current.clear()} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold">지우기</button>
                        <button onClick={saveSignature} disabled={uploading} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold">
                            {uploading ? '저장 중...' : '서명 완료'}
                        </button>
                    </div>
                    <button onClick={()=>setShowSignPad(false)} className="mt-4 text-sm text-gray-400 underline w-full text-center">닫기</button>
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
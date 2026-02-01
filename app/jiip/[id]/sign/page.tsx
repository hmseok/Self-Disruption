'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../utils/supabase'
import SignatureCanvas from 'react-signature-canvas'

const nf = (num: number) => num ? num.toLocaleString() : '0'

export default function GuestSignPage() {
  const params = useParams()
  const id = params.id
  const [loading, setLoading] = useState(true)
  const [item, setItem] = useState<any>(null)
  const [car, setCar] = useState<any>(null)
  const [completed, setCompleted] = useState(false)

  const sigCanvas = useRef<any>({})
  const [canvasWidth, setCanvasWidth] = useState(300)
  const [isSigning, setIsSigning] = useState(false)

  useEffect(() => {
    // 👇 [핵심] 사이드바 강제 숨김 처리 (DOM 조작)
    const sidebar = document.querySelector('aside') // 만약 사이드바가 aside 태그라면
    const nav = document.querySelector('nav')       // 만약 nav 태그라면
    if (sidebar) sidebar.style.display = 'none'
    if (nav) nav.style.display = 'none'

    // 메인 컨텐츠 영역의 패딩 제거 (전체화면 사용을 위해)
    const main = document.querySelector('main')
    if (main) {
        main.style.padding = '0'
        main.style.margin = '0'
        main.style.width = '100vw'
        main.style.maxWidth = '100vw'
    }

    // 언마운트 시(페이지 나갈 때) 다시 복구
    return () => {
        if (sidebar) sidebar.style.display = ''
        if (nav) nav.style.display = ''
        if (main) {
             main.style.padding = ''
             main.style.margin = ''
             main.style.width = ''
             main.style.maxWidth = ''
        }
    }
  }, [])

  useEffect(() => {
    const updateWidth = () => {
        const w = window.innerWidth > 500 ? 500 : window.innerWidth - 48
        setCanvasWidth(w)
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)

    const fetchData = async () => {
      const { data: contract } = await supabase.from('jiip_contracts').select('*').eq('id', id).single()
      if (contract) {
        setItem(contract)
        const { data: carData } = await supabase.from('cars').select('*').eq('id', contract.car_id).single()
        setCar(carData)
      }
      setLoading(false)
    }
    fetchData()
    return () => window.removeEventListener('resize', updateWidth)
  }, [id])

  const handleSaveSignature = async () => {
    if (sigCanvas.current.isEmpty()) return alert("서명을 해주세요!")
    const btn = document.getElementById('saveBtn') as HTMLButtonElement
    if(btn) { btn.disabled = true; btn.innerText = '전송 중...'; }

    try {
        const dataURL = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png')
        const res = await fetch(dataURL)
        const blob = await res.blob()
        const fileName = `signature_${id}_guest_${Date.now()}.png`

        const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, blob)
        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)
        await supabase.from('jiip_contracts').update({ signed_file_url: publicUrl }).eq('id', id)

        setCompleted(true)
    } catch (e: any) {
        alert('오류 발생: ' + e.message)
        if(btn) { btn.disabled = false; btn.innerText = '서명 제출하기'; }
    }
  }

  if (loading) return <div className="fixed inset-0 z-[99999] bg-white flex items-center justify-center text-gray-500">계약서 로딩 중...</div>

  if (completed) return (
    <div className="fixed inset-0 z-[99999] bg-green-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-green-800 mb-2">서명 완료!</h1>
        <p className="text-gray-600">안전하게 전송되었습니다.<br/>창을 닫으셔도 됩니다.</p>
    </div>
  )

  return (
    // 👇 [핵심] 화면 최상단 고정 (z-index 99999) + 배경색 흰색으로 뒤쪽 가리기
    <div className="fixed inset-0 z-[99999] bg-gray-100 overflow-y-auto overflow-x-hidden w-screen h-[100dvh]">

      {/* 모바일 헤더 */}
      <div className="bg-white px-5 py-4 sticky top-0 z-30 border-b border-gray-200 flex justify-between items-center shadow-sm w-full">
          <h1 className="font-bold text-lg text-gray-900">지입 투자 계약서</h1>
          <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded">전자서명</span>
      </div>

      <div className="pb-32 w-full max-w-2xl mx-auto">
          {/* 👋 인사말 */}
          <div className="bg-indigo-900 text-white p-6 m-5 rounded-2xl shadow-lg">
              <p className="text-indigo-200 text-sm mb-1">{item?.investor_name}님 안녕하세요</p>
              <h2 className="text-xl font-bold leading-tight">차량 운영 투자 및<br/>수익 배분 계약서입니다.</h2>
          </div>

          {/* 🚗 차량 정보 */}
          <section className="bg-white p-5 m-5 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg mb-4">🚗 대상 차량 정보</h3>
              <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">모델명</span>
                      <span className="font-bold text-gray-900">{car?.brand} {car?.model}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">차량번호</span>
                      <span className="font-bold text-indigo-600 text-lg">{car?.number}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">투자금</span>
                      <span className="font-bold text-gray-900">{nf(item?.invest_amount)}원</span>
                  </div>
              </div>
          </section>

          {/* 💰 수익 정산 */}
          <section className="bg-white p-5 m-5 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg mb-4">💰 수익 정산 및 지급</h3>
              <div className="bg-gray-50 p-4 rounded-xl mb-4">
                   <div className="flex justify-between mb-2">
                       <span className="text-gray-500 text-xs">투자자 배분율</span>
                       <span className="font-black text-blue-600 text-lg">{item?.share_ratio}%</span>
                   </div>
                   <div className="flex justify-between">
                       <span className="text-gray-500 text-xs">매월 선공제(관리비)</span>
                       <span className="font-bold text-red-500 text-sm">-{nf(item?.admin_fee)}원</span>
                   </div>
              </div>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li>지급일: 매월 말일 정산 후 <b>익월 {item?.payout_day}일</b></li>
                  <li>계좌: {item?.bank_name} ({item?.account_holder})</li>
                  <li>세금: {item?.tax_type} 처리</li>
              </ul>
          </section>

          {/* 📜 주요 조항 */}
          <section className="bg-white p-5 m-5 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg mb-4">주요 계약 내용</h3>
              <div className="space-y-4 text-sm text-gray-600">
                  <p><b>제3조 (소유권)</b><br/>차량 명의는 운용사(갑)에게 있으며, 운영 책임 또한 운용사가 집니다.</p>
                  <p><b>제6조 (계약 종료)</b><br/>{item?.contract_end_date} 종료 시 차량을 매각하여 대금을 반환합니다. (투자자 인수 가능)</p>
                  <p><b>제7조 (중도 해지)</b><br/>중도 해지 시 귀책 사유자가 관리비 3개월분을 위약금으로 배상합니다.</p>
              </div>
          </section>

          <p className="text-center text-xs text-gray-400 mt-8 mb-4">
              위 내용을 모두 확인하였으며, 이에 동의합니다.<br/>
              (주)에프엠아이 대표이사 박진숙
          </p>
      </div>

      {/* 하단 고정 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-[99999]">
          <button
            onClick={() => setIsSigning(true)}
            className="w-full bg-indigo-600 text-white font-bold text-lg py-4 rounded-xl shadow-lg active:scale-[0.98]"
          >
             서명하고 완료하기
          </button>
      </div>

      {/* 서명 모달 */}
      {isSigning && (
        <div className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl animate-slide-up pb-10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-xl text-gray-900">서명해 주세요</h3>
                    <button onClick={() => setIsSigning(false)} className="text-gray-400 font-bold p-2 text-xl">✕</button>
                </div>

                <div className="border-2 border-gray-200 rounded-2xl bg-gray-50 mb-4 overflow-hidden relative h-48">
                    <SignatureCanvas
                        ref={sigCanvas}
                        penColor="black"
                        canvasProps={{className: 'w-full h-full cursor-crosshair'}}
                    />
                    <div className="absolute top-2 right-2 text-xs text-gray-300 pointer-events-none">서명란</div>
                </div>

                <div className="flex gap-3">
                    <button onClick={() => sigCanvas.current.clear()} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold">지우기</button>
                    <button id="saveBtn" onClick={handleSaveSignature} className="flex-[2] bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-md">
                        제출하기
                    </button>
                </div>
            </div>
        </div>
       )}
    </div>
  )
}
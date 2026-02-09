'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import SignatureCanvas from 'react-signature-canvas'

// 숫자 포맷팅 함수
const nf = (num: number) => num ? num.toLocaleString() : '0'

export default function GuestSignPage() {
  const params = useParams()
  const id = params.id
  const [loading, setLoading] = useState(true)
  const [item, setItem] = useState<any>(null)
  const [car, setCar] = useState<any>(null)
  const [completed, setCompleted] = useState(false)

  // 서명 관련
  const sigCanvas = useRef<any>({})
  const [canvasWidth, setCanvasWidth] = useState(300)
  const [isSigning, setIsSigning] = useState(false) // 서명 모달 상태

  useEffect(() => {
    // 캔버스 크기 반응형 설정
    const updateWidth = () => {
        const w = window.innerWidth > 500 ? 500 : window.innerWidth - 48 // 패딩 고려
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

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-medium">계약서 불러오는 중...</div>

  if (completed) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-green-50 p-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 text-4xl shadow-sm">✅</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">서명이 완료되었습니다</h1>
        <p className="text-gray-600 leading-relaxed">계약서가 안전하게 전송되었습니다.<br/>이제 창을 닫으셔도 됩니다.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 pb-24"> {/* 하단 버튼 공간 확보 */}

      {/* 1. 모바일 헤더 */}
      <div className="bg-white px-5 py-4 sticky top-0 z-30 border-b border-gray-200 flex justify-between items-center shadow-sm">
          <h1 className="font-bold text-lg text-gray-900">지입 투자 계약서</h1>
          <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded">전자서명용</span>
      </div>

      {/* 2. 계약 내용 (모바일 최적화 뷰) */}
      <div className="p-5 max-w-2xl mx-auto space-y-6">

          {/* 👋 인사말 카드 */}
          <div className="bg-indigo-900 text-white p-6 rounded-2xl shadow-lg">
              <p className="text-indigo-200 text-sm mb-1">안녕하세요, {item.investor_name}님</p>
              <h2 className="text-xl font-bold leading-tight">차량 운영 투자 및<br/>수익 배분 계약을 진행합니다.</h2>
              <p className="text-xs text-indigo-300 mt-4 border-t border-indigo-800 pt-3">
                  아래 내용을 꼼꼼히 확인하신 후, 맨 하단의 서명 버튼을 눌러주세요.
              </p>
          </div>

          {/* 🚗 차량 & 투자 정보 카드 */}
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg mb-4 flex items-center gap-2">
                  <span className="text-xl">🚗</span> 대상 차량 및 투자금
              </h3>
              <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">차량 정보</span>
                      <span className="font-bold text-gray-900 text-right">{car.brand} {car.model}<br/><span className="text-indigo-600">{car.number}</span></span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">투자 원금</span>
                      <span className="font-bold text-gray-900">{nf(item.invest_amount)}원</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">계약 기간</span>
                      <span className="font-bold text-gray-900 text-right">{item.contract_start_date}<br/>~ {item.contract_end_date}</span>
                  </div>
              </div>
          </section>

          {/* 💰 수익 배분 조건 카드 */}
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg mb-4 flex items-center gap-2">
                  <span className="text-xl">💰</span> 수익 정산 및 지급
              </h3>
              <div className="bg-gray-50 p-4 rounded-xl space-y-3 mb-4">
                   <div className="flex justify-between items-center">
                       <span className="text-xs font-bold text-gray-500">선공제 (관리비)</span>
                       <span className="font-bold text-red-500">-{nf(item.admin_fee)}원</span>
                   </div>
                   <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                       <span className="text-xs font-bold text-gray-500">투자자 배분율</span>
                       <span className="font-black text-blue-600 text-lg">{item.share_ratio}%</span>
                   </div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                  • <b>지급일:</b> 매월 말일 정산 후, <b>익월 {item.payout_day}일</b> 지급<br/>
                  • <b>입금계좌:</b> {item.bank_name} ({item.account_holder})<br/>
                  • <b>세금처리:</b> {item.tax_type} 발행 원칙
              </p>
          </section>

          {/* 📜 주요 약관 (아코디언 스타일 또는 깔끔한 텍스트) */}
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg mb-4">주요 계약 조항</h3>
              <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
                  <div>
                      <h4 className="font-bold text-gray-800 mb-1">제3조 (소유권 및 관리)</h4>
                      <p className="text-xs">차량 명의와 운영 권한은 운용사(갑)에게 있으며, 투자자(을)는 운영에 직접 관여하지 않습니다. 단, 과태료 등은 실 운전자 부담을 원칙으로 합니다.</p>
                  </div>
                  <div>
                      <h4 className="font-bold text-gray-800 mb-1">제6조 (종료 및 매각)</h4>
                      <p className="text-xs">계약 종료 시 차량을 매각하여 대금을 반환하며, 투자자가 원할 경우 차량 인수가 가능합니다. (이전비용 투자자 부담)</p>
                  </div>
                  <div>
                      <h4 className="font-bold text-gray-800 mb-1">제7조 (중도 해지)</h4>
                      <p className="text-xs">중도 해지 시 귀책 사유가 있는 쪽에서 위탁 관리비 3개월분을 위약금으로 배상합니다.</p>
                  </div>
                  {item.mortgage_setup && (
                      <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-yellow-800">
                          <span className="font-bold block mb-1">⚠️ 특약 사항</span>
                          <p className="text-xs">본 차량에 대해 근저당권 설정을 진행합니다.</p>
                      </div>
                  )}
              </div>
          </section>

          <p className="text-center text-xs text-gray-400 pt-4">
              위 내용을 모두 확인하였으며, 이에 동의합니다.<br/>
              (주)에프엠아이 대표이사 박진숙
          </p>
      </div>

      {/* 3. 하단 고정 서명 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-40">
          <button
            onClick={() => setIsSigning(true)}
            className="w-full bg-indigo-600 text-white font-bold text-lg py-4 rounded-xl shadow-lg active:scale-[0.98] transition-transform"
          >
             서명하고 계약 완료하기
          </button>
      </div>

      {/* ✍️ 서명 모달 (BottomSheet 스타일) */}
      {isSigning && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl animate-slide-up">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-xl text-gray-900">여기에 서명해 주세요</h3>
                    <button onClick={() => setIsSigning(false)} className="text-gray-400 hover:text-gray-600 font-bold p-2">✕</button>
                </div>

                <p className="text-gray-500 text-xs mb-4">정자로 서명 후 제출 버튼을 눌러주세요.</p>

                <div className="border-2 border-gray-200 rounded-2xl bg-gray-50 mb-4 overflow-hidden relative">
                    <SignatureCanvas
                        ref={sigCanvas}
                        penColor="black"
                        canvasProps={{width: canvasWidth, height: 200, className: 'cursor-crosshair'}}
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
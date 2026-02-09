'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import SignatureCanvas from 'react-signature-canvas'
import ContractPaper from '../../../components/ContractPaper' // A4 양식 불러오기
import html2canvas from 'html2canvas' // 📸 화면 캡처 도구
import jsPDF from 'jspdf' // 📄 PDF 생성 도구

const nf = (num: number) => num ? num.toLocaleString() : '0'

export default function GuestSignPage() {
  const params = useParams()
  const id = params.id
  const [loading, setLoading] = useState(true)
  const [item, setItem] = useState<any>(null)
  const [car, setCar] = useState<any>(null)
  const [completed, setCompleted] = useState(false)

  const sigCanvas = useRef<any>({})
  const hiddenContractRef = useRef<HTMLDivElement>(null) // 📸 캡처할 대상(숨겨진 A4)

  const [canvasWidth, setCanvasWidth] = useState(300)
  const [isSigning, setIsSigning] = useState(false)

  // PDF 생성용 임시 서명 이미지 상태
  const [tempSignature, setTempSignature] = useState<string>('')

  useEffect(() => {
    // 사이드바/헤더 숨김 (기존 로직 유지)
    const sidebar = document.querySelector('aside'); if (sidebar) sidebar.style.display = 'none'
    const nav = document.querySelector('nav'); if (nav) nav.style.display = 'none'
    const main = document.querySelector('main')
    if (main) { main.style.padding = '0'; main.style.margin = '0'; main.style.width = '100vw'; main.style.maxWidth = '100vw' }
    return () => {
        if (sidebar) sidebar.style.display = ''; if (nav) nav.style.display = ''
        if (main) { main.style.padding = ''; main.style.margin = ''; main.style.width = ''; main.style.maxWidth = '' }
    }
  }, [])

  useEffect(() => {
    const updateWidth = () => { setCanvasWidth(window.innerWidth > 500 ? 500 : window.innerWidth - 48) }
    updateWidth(); window.addEventListener('resize', updateWidth)

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
    if(btn) { btn.disabled = true; btn.innerText = '계약서 생성 중...'; }

    try {
        // 1. 서명 이미지를 먼저 추출 (DataURL)
        const signatureDataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png')
        setTempSignature(signatureDataUrl) // 숨겨진 계약서에 서명 반영

        // 2. React가 상태를 업데이트하고 렌더링할 시간을 아주 조금 줌
        await new Promise(resolve => setTimeout(resolve, 500))

        if (!hiddenContractRef.current) throw new Error("계약서 양식을 찾을 수 없습니다.")

        // 3. A4 계약서 영역(hiddenContractRef)을 캡처해서 이미지로 변환
        const canvas = await html2canvas(hiddenContractRef.current, { scale: 2, useCORS: true })
        const imgData = canvas.toDataURL('image/png')

        // 4. PDF 생성 (A4 사이즈)
        const pdf = new jsPDF('p', 'mm', 'a4')
        const pdfWidth = 210
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)

        // 5. PDF를 Blob(파일) 형태로 변환
        const pdfBlob = pdf.output('blob')
        const fileName = `contract_${item.investor_name}_${id}_${Date.now()}.pdf`

        // 6. Supabase에 PDF 업로드
        const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, pdfBlob, {
            contentType: 'application/pdf'
        })
        if (uploadError) throw uploadError

        // 7. DB에 PDF 파일 주소 저장
        const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)
        await supabase.from('jiip_contracts').update({ signed_file_url: publicUrl }).eq('id', id)

        setCompleted(true)

    } catch (e: any) {
        console.error(e)
        alert('처리 실패: ' + e.message)
        if(btn) { btn.disabled = false; btn.innerText = '서명 제출하기'; }
    }
  }

  if (loading) return <div className="fixed inset-0 z-[99999] bg-white flex items-center justify-center text-gray-500">로딩 중...</div>

  if (completed) return (
    <div className="fixed inset-0 z-[99999] bg-green-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-green-800 mb-2">계약 완료!</h1>
        <p className="text-gray-600">서명이 포함된 계약서(PDF)가<br/>안전하게 저장되었습니다.</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[99999] bg-gray-100 overflow-y-auto overflow-x-hidden w-screen h-[100dvh]">

      {/* 👇 [핵심 비밀 공간] 사용자 눈에는 안 보이지만, 캡처를 위해 존재하는 A4 계약서 */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
          <div ref={hiddenContractRef}>
              {/* 여기에 서명 이미지를 주입해서 렌더링 */}
              {item && car && <ContractPaper data={item} car={car} signatureUrl={tempSignature} />}
          </div>
      </div>

      {/* === 모바일 UI (기존과 동일) === */}
      <div className="bg-white px-5 py-4 sticky top-0 z-30 border-b border-gray-200 flex justify-between items-center shadow-sm w-full">
          <h1 className="font-bold text-lg text-gray-900">지입 투자 계약서</h1>
          <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded">전자서명</span>
      </div>

      <div className="pb-32 w-full max-w-2xl mx-auto">
          {/* ... (모바일 카드 뷰 내용들 - 기존 코드 유지) ... */}
          <div className="bg-indigo-900 text-white p-6 m-5 rounded-2xl shadow-lg">
              <p className="text-indigo-200 text-sm mb-1">{item?.investor_name}님 안녕하세요</p>
              <h2 className="text-xl font-bold leading-tight">차량 운영 투자 및<br/>수익 배분 계약서입니다.</h2>
          </div>

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
          </section>

          <p className="text-center text-xs text-gray-400 mt-8 mb-4">
              위 내용을 모두 확인하였으며, 이에 동의합니다.<br/>
              (주)에프엠아이 대표이사 박진숙
          </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-[99999]">
          <button
            onClick={() => setIsSigning(true)}
            className="w-full bg-indigo-600 text-white font-bold text-lg py-4 rounded-xl shadow-lg active:scale-[0.98]"
          >
             서명하고 계약 완료하기
          </button>
      </div>

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
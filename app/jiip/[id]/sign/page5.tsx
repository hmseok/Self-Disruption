'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import SignatureCanvas from 'react-signature-canvas'
import ContractPaper from '../../../components/ContractPaper'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'

const nf = (num: number) => num ? num.toLocaleString() : '0'

export default function GuestSignPage() {
  const params = useParams()
  const id = params.id
  const [loading, setLoading] = useState(true)
  const [item, setItem] = useState<any>(null)
  const [car, setCar] = useState<any>(null)
  const [completed, setCompleted] = useState(false)

  // 서명 및 PDF 생성 도구
  const sigCanvas = useRef<any>({})
  const hiddenContractRef = useRef<HTMLDivElement>(null)
  const [tempSignature, setTempSignature] = useState<string>('')

  const [isSigning, setIsSigning] = useState(false)
  const [showZoomModal, setShowZoomModal] = useState(false) // 🔍 확대 모달 상태

  // 1. 화면 강제 설정 (메뉴 숨김)
  useEffect(() => {
    const sidebar = document.querySelector('aside'); if (sidebar) sidebar.style.display = 'none'
    const nav = document.querySelector('nav'); if (nav) nav.style.display = 'none'
    const main = document.querySelector('main')
    if (main) {
        main.style.padding = '0'
        main.style.margin = '0'
        main.style.width = '100vw'
        main.style.maxWidth = '100vw'
    }
    return () => {
        if (sidebar) sidebar.style.display = ''
        if (nav) nav.style.display = ''
        if (main) { main.style.padding = ''; main.style.margin = ''; main.style.width = ''; main.style.maxWidth = '' }
    }
  }, [])

  // 2. 데이터 로딩
  useEffect(() => {
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
  }, [id])

  // 3. 서명 저장 및 PDF 생성 로직
  const handleSaveSignature = async () => {
    if (sigCanvas.current.isEmpty()) return alert("서명을 해주세요!")

    const btn = document.getElementById('saveBtn') as HTMLButtonElement
    if(btn) { btn.disabled = true; btn.innerText = '처리 중...'; }

    try {
        // (1) 서명 이미지 추출
        const signatureDataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png')
        setTempSignature(signatureDataUrl)

        // (2) 렌더링 대기
        await new Promise(resolve => setTimeout(resolve, 500))

        if (!hiddenContractRef.current) throw new Error("계약서 양식을 찾을 수 없습니다.")

        // (3) A4 계약서 캡처
        const imgData = await toPng(hiddenContractRef.current, { cacheBust: true, backgroundColor: '#ffffff' })

        // (4) PDF 변환 (비율 유지)
        const pdf = new jsPDF('p', 'mm', 'a4')
        const pdfWidth = 210
        const imgProps = pdf.getImageProperties(imgData)
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)

        // (5) 업로드
        const pdfBlob = pdf.output('blob')
        const fileName = `contract_${id}_signed_${Date.now()}.pdf`

        const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, pdfBlob, {
            contentType: 'application/pdf'
        })
        if (uploadError) throw uploadError

        // (6) DB 업데이트
        const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)
        await supabase.from('jiip_contracts').update({ signed_file_url: publicUrl }).eq('id', id)

        setCompleted(true)

    } catch (e: any) {
        alert('오류 발생: ' + e.message)
        if(btn) { btn.disabled = false; btn.innerText = '서명 제출하기'; }
    }
  }

  if (loading) return <div className="fixed inset-0 z-[99999] bg-white flex items-center justify-center text-gray-500 font-bold">로딩 중...</div>

  if (completed) return (
    <div className="fixed inset-0 z-[99999] bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm">
            <div className="text-6xl mb-6">✅</div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">계약 체결 완료!</h1>
            <p className="text-gray-500 mb-6">
                서명이 포함된 계약서가<br/>안전하게 전송되었습니다.
            </p>
            <button onClick={() => window.close()} className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold">
                창 닫기
            </button>
        </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[99999] bg-gray-100 overflow-y-auto overflow-x-hidden w-screen h-[100dvh]">

      {/* 👇 PDF 생성용 숨겨진 원본 (화면 밖) */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
          <div ref={hiddenContractRef}>
              {item && car && <ContractPaper data={item} car={car} signatureUrl={tempSignature} />}
          </div>
      </div>

      {/* 상단 헤더 */}
      <div className="bg-white px-5 py-4 sticky top-0 z-30 border-b border-gray-200 flex justify-between items-center shadow-sm w-full">
          <h1 className="font-bold text-lg text-gray-900">전자 계약 체결</h1>
          <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">본인확인</span>
      </div>

      <div className="pb-32 w-full max-w-2xl mx-auto">

          {/* 1. 인사말 */}
          <div className="bg-gray-800 text-white p-6 m-4 rounded-2xl shadow-lg">
              <p className="text-gray-300 text-sm mb-1">{item?.investor_name}님 안녕하세요</p>
              <h2 className="text-xl font-bold leading-tight">
                계약 내용을 꼼꼼히 확인 후<br/>서명해 주세요.
              </h2>
          </div>

          {/* 2. 계약서 뷰어 (전체 보기 & 확대 기능) */}
          <div className="m-4">
              <div className="flex justify-between items-end mb-2 ml-1">
                  <p className="text-xs font-bold text-gray-500">📄 계약서 내용</p>
                  <button onClick={() => setShowZoomModal(true)} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100">
                      🔍 크게 보기
                  </button>
              </div>

              {/* 👇 [수정] 잘림 없이 전체 높이 표시 */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200 relative">
                  {/* 모바일 폭에 맞춰 축소(0.45배)하되, 높이는 넉넉하게 잡아서 전체 표시 */}
                  <div className="w-full overflow-x-auto bg-gray-50" style={{ height: '140mm' }}>
                      <div className="origin-top-left transform scale-[0.45] sm:scale-50 w-[210mm] min-h-[297mm] bg-white shadow-lg mx-auto">
                          {item && car && <ContractPaper data={item} car={car} />}
                      </div>
                  </div>
              </div>
              <p className="text-center text-xs text-gray-400 mt-2">위 화면을 터치하거나 '크게 보기'를 눌러 내용을 확인하세요.</p>
          </div>

          {/* 3. 주요 정보 요약 */}
          <section className="bg-white p-5 m-4 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg mb-4">✨ 주요 요약 정보</h3>
              <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">차량</span>
                      <span className="font-bold text-gray-900">{car?.number} ({car?.model})</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">투자금</span>
                      <span className="font-bold text-blue-600">{nf(item?.invest_amount)}원</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">배분율</span>
                      <span className="font-bold text-gray-900">투자자 {item?.share_ratio}%</span>
                  </div>
              </div>
              <div className="mt-4 bg-yellow-50 p-3 rounded-lg text-xs text-yellow-800 leading-relaxed">
                  📢 위 내용을 모두 확인하였으며, 본인은 (주)에프엠아이와의 계약 체결에 동의합니다.
              </div>
          </section>
      </div>

      {/* 하단 고정 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-[99999] shadow-[0_-5px_20px_rgba(0,0,0,0.1)]">
          <button
            onClick={() => setIsSigning(true)}
            className="w-full bg-indigo-600 text-white font-bold text-lg py-4 rounded-xl shadow-lg active:scale-[0.98] transition-transform"
          >
             동의하고 서명하기
          </button>
      </div>

      {/* 🔍 확대 보기 모달 (팝업) */}
      {showZoomModal && (
        <div className="fixed inset-0 z-[100000] bg-black/90 flex flex-col animate-fade-in">
            <div className="flex justify-between items-center p-4 bg-black text-white">
                <h3 className="font-bold text-lg">계약서 원본 확인</h3>
                <button onClick={() => setShowZoomModal(false)} className="bg-gray-800 px-4 py-2 rounded-lg text-sm font-bold">닫기 ✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-900 flex justify-center">
                {/* 원본 크기(scale-100)로 보여줌 */}
                <div className="bg-white shadow-2xl min-w-[210mm] min-h-[297mm]">
                    {item && car && <ContractPaper data={item} car={car} />}
                </div>
            </div>
        </div>
      )}

      {/* 서명 모달 */}
      {isSigning && (
        <div className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 shadow-2xl animate-slide-up pb-10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-xl text-gray-900">서명해 주세요</h3>
                    <button onClick={() => setIsSigning(false)} className="text-gray-400 font-bold p-2 text-xl">✕</button>
                </div>

                <p className="text-xs text-gray-500 mb-2">손가락으로 정자 서명을 해주세요.</p>
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
                        서명 완료
                    </button>
                </div>
            </div>
        </div>
       )}
    </div>
  )
}
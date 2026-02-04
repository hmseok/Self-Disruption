'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
// 👇 [경로 유지] 안전한 상대 경로
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import SignatureCanvas from 'react-signature-canvas'
import GeneralContract from '../../../../components/GeneralContract'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'

const nf = (num: number) => num ? num.toLocaleString() : '0'

export default function GeneralGuestSignPage() {
  const params = useParams()
  const id = params.id
  const [loading, setLoading] = useState(true)
  const [item, setItem] = useState<any>(null)

  // 상태 관리
  const [completed, setCompleted] = useState(false)
  const [alreadySignedUrl, setAlreadySignedUrl] = useState<string | null>(null)

  // 캔버스 & PDF 참조
  const sigCanvas = useRef<any>({})
  const hiddenContractRef = useRef<HTMLDivElement>(null)
  const [tempSignature, setTempSignature] = useState<string>('')

  // 서명판 너비 반응형 처리
  const [canvasWidth, setCanvasWidth] = useState(300)

  // 1. 화면 강제 설정 (전체화면 & 서명판 너비 조절)
  useEffect(() => {
    // 사이드바 등 숨김
    const sidebar = document.querySelector('aside'); if (sidebar) sidebar.style.display = 'none'
    const nav = document.querySelector('nav'); if (nav) nav.style.display = 'none'
    const header = document.querySelector('header'); if (header) header.style.display = 'none'
    const main = document.querySelector('main'); if (main) { main.style.padding = '0'; main.style.margin = '0'; main.style.width = '100vw'; main.style.maxWidth = '100vw' }

    // 서명판 너비 계산 (화면 꽉 차게)
    const updateCanvasWidth = () => {
        const width = window.innerWidth > 600 ? 500 : window.innerWidth - 48 // 좌우 패딩 고려
        setCanvasWidth(width)
    }
    updateCanvasWidth()
    window.addEventListener('resize', updateCanvasWidth)

    return () => {
        if (sidebar) sidebar.style.display = ''
        if (nav) nav.style.display = ''
        if (header) header.style.display = ''
        if (main) { main.style.padding = ''; main.style.margin = ''; main.style.width = ''; main.style.maxWidth = '' }
        window.removeEventListener('resize', updateCanvasWidth)
    }
  }, [])

  // 2. 데이터 로딩
  useEffect(() => {
    const fetchData = async () => {
      if(!id) return;
      const { data } = await supabase.from('general_investments').select('*').eq('id', id).single()
      if (data) {
          setItem(data)
          if (data.signed_file_url) {
              setAlreadySignedUrl(data.signed_file_url)
          }
      }
      setLoading(false)
    }
    fetchData()
  }, [id])

  const handleCloseWindow = () => {
    window.close()
    try { window.open('','_self')?.close() } catch (e) {}
    try { if(document.referrer && document.referrer.indexOf('kakao') !== -1) location.href = 'kakaotalk://inappbrowser/close' } catch(e) {}
  }

  // 3. 서명 저장 및 PDF 생성 (핵심 로직)
  const handleSaveSignature = async () => {
    if (sigCanvas.current.isEmpty()) return alert("서명을 해주세요!")

    const btn = document.getElementById('saveBtn') as HTMLButtonElement
    if(btn) { btn.disabled = true; btn.innerText = '전송 중...'; }

    try {
        // 1. 서명 이미지 추출
        const signatureDataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png')
        setTempSignature(signatureDataUrl)

        // 2. 렌더링 대기
        await new Promise(resolve => setTimeout(resolve, 500))

        if (!hiddenContractRef.current) throw new Error("계약서 로드 실패")

        // 3. PDF 변환
        const imgData = await toPng(hiddenContractRef.current, { cacheBust: true, backgroundColor: '#ffffff' })
        const pdf = new jsPDF('p', 'mm', 'a4')
        const pdfWidth = 210
        const imgProps = pdf.getImageProperties(imgData)
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)

        const pdfBlob = pdf.output('blob')
        const fileName = `general_invest_${id}_${Date.now()}.pdf`

        // 4. 업로드 및 DB 저장
        const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, pdfBlob, { contentType: 'application/pdf' })
        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)
        await supabase.from('general_investments').update({ signed_file_url: publicUrl }).eq('id', id)

        setCompleted(true)
        setAlreadySignedUrl(publicUrl)

    } catch (e: any) {
        alert('오류: ' + e.message)
        if(btn) { btn.disabled = false; btn.innerText = '서명 제출하기'; }
    }
  }

  if (loading) return <div className="fixed inset-0 z-[99999] bg-white flex items-center justify-center text-gray-500 font-bold">로딩 중...</div>

  // 🏁 [완료 화면]
  if (alreadySignedUrl || completed) {
      return (
        <div className="fixed inset-0 z-[99999] bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-sm border border-gray-100">
                <div className="text-6xl mb-6">✅</div>
                <h1 className="text-2xl font-black text-gray-900 mb-2">
                    {completed ? '계약 체결 완료!' : '이미 완료된 계약입니다'}
                </h1>
                <p className="text-gray-500 mb-8 leading-relaxed text-sm">
                    서명이 포함된 계약서를<br/>확인하고 다운로드하세요.
                </p>
                <div className="space-y-3">
                    <a href={alreadySignedUrl!} target="_blank" rel="noopener noreferrer" className="block w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-indigo-700">
                        📄 계약서 다운로드
                    </a>
                    <button onClick={handleCloseWindow} className="w-full bg-gray-100 text-gray-600 py-4 rounded-xl font-bold hover:bg-gray-200">
                        닫기
                    </button>
                </div>
            </div>
        </div>
      )
  }

  // 📝 [서명 화면] - 지입 스타일 (하단 고정형 서명판)
  return (
    <div className="fixed inset-0 z-[99999] bg-gray-100 flex flex-col overflow-hidden">

      {/* 🔐 PDF 생성용 (화면 밖) */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
          <div ref={hiddenContractRef}>
              {item && <GeneralContract data={item} signatureUrl={tempSignature} mode="print" />}
          </div>
      </div>

      {/* 헤더 */}
      <div className="bg-indigo-900 text-white p-4 text-center flex-none shadow-md z-10">
          <h1 className="font-bold text-lg">투자 계약 서명</h1>
          <p className="text-xs text-indigo-200 mt-1">내용 확인 후 하단에 서명해 주세요.</p>
      </div>

      {/* 계약서 미리보기 (스크롤 영역) */}
      <div className="flex-1 overflow-y-auto bg-gray-500 p-4 pb-10">
          <div className="bg-white rounded-xl shadow-lg overflow-hidden min-h-[300px] flex justify-center items-start pt-4 mb-4">
              {/* 모바일 보기 모드 */}
              {item && <GeneralContract data={item} mode="mobile" />}
          </div>

          <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 mb-4">
              <h3 className="font-bold text-gray-900 text-lg mb-4">💰 핵심 투자 조건</h3>
              <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">투자 원금</span>
                      <span className="font-bold text-gray-900">{nf(item?.invest_amount)}원</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">연 수익률</span>
                      <span className="font-bold text-green-600">{item?.interest_rate}%</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">이자 지급일</span>
                      <span className="font-bold text-blue-600">매월 {item?.payment_day}일</span>
                  </div>
              </div>
          </section>
      </div>

      {/* 👇 [핵심] 하단 고정 서명 패드 (지입 스타일) */}
      <div className="bg-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] rounded-t-2xl z-20 flex-none pb-8">
          <p className="font-bold text-gray-900 mb-2 text-center text-sm">👇 아래 박스에 정자로 서명해 주세요</p>

          <div className="border-2 border-gray-300 rounded-xl bg-gray-50 mb-4 overflow-hidden flex justify-center h-40 relative">
              <SignatureCanvas
                  ref={sigCanvas}
                  penColor="black"
                  canvasProps={{width: canvasWidth, height: 160, className: 'cursor-crosshair'}}
              />
              <div className="absolute top-2 right-2 text-xs text-gray-300 pointer-events-none">서명란</div>
          </div>

          <div className="flex gap-3">
              <button onClick={() => sigCanvas.current.clear()} className="flex-1 bg-gray-200 py-4 rounded-xl font-bold text-gray-700">지우기</button>
              <button id="saveBtn" onClick={handleSaveSignature} className="flex-[2] bg-indigo-600 py-4 rounded-xl font-bold text-white shadow-lg">
                  서명 제출하기
              </button>
          </div>
      </div>
    </div>
  )
}
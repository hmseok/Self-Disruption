'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../utils/supabase'
import ContractPaper from '../../../components/ContractPaper'
import SignatureCanvas from 'react-signature-canvas'

export default function GuestSignPage() {
  const params = useParams()
  const id = params.id
  const [loading, setLoading] = useState(true)
  const [item, setItem] = useState<any>(null)
  const [car, setCar] = useState<any>(null)
  const [completed, setCompleted] = useState(false)

  // 서명 캔버스
  const sigCanvas = useRef<any>({})
  // 화면 크기에 맞춰 캔버스 사이즈 조절용 상태
  const [canvasWidth, setCanvasWidth] = useState(300)

  useEffect(() => {
    // 모바일 화면 폭에 맞춰 서명판 너비 자동 조절
    if (window.innerWidth < 500) {
        setCanvasWidth(window.innerWidth - 60) // 좌우 여백 제외
    } else {
        setCanvasWidth(500)
    }

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

  const handleSaveSignature = async () => {
    if (sigCanvas.current.isEmpty()) return alert("서명을 해주세요!")

    // 버튼 비활성화 (중복 클릭 방지)
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
        alert('전송 실패: ' + e.message)
        if(btn) { btn.disabled = false; btn.innerText = '서명 제출하기'; }
    }
  }

  if (loading) return <div className="fixed inset-0 z-[9999] bg-white flex items-center justify-center font-bold text-gray-500">계약서 불러오는 중... ⏳</div>

  if (completed) return (
    <div className="fixed inset-0 z-[9999] bg-green-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="text-6xl mb-4 animate-bounce">✅</div>
        <h1 className="text-2xl font-bold text-green-800 mb-2">서명이 완료되었습니다.</h1>
        <p className="text-gray-600">계약서가 안전하게 전송되었습니다.<br/>이제 창을 닫으셔도 됩니다.</p>
    </div>
  )

  return (
    // 👇 [핵심] fixed inset-0 z-[9999] : 관리자 메뉴를 덮어버리는 전체 화면 모드
    <div className="fixed inset-0 z-[9999] bg-gray-100 flex flex-col overflow-hidden">

      {/* 상단 헤더 */}
      <div className="bg-indigo-900 text-white p-4 text-center flex-none shadow-md z-10">
          <h1 className="font-bold text-lg">전자 서명 요청</h1>
          <p className="text-xs text-indigo-200">내용 확인 후 하단에 서명해 주세요.</p>
      </div>

      {/* 계약서 미리보기 (스크롤 영역) */}
      <div className="flex-1 overflow-y-auto bg-gray-500 p-4 pb-40">
          {/* 모바일에서는 A4 용지가 작게 보이도록 scale 조정 (선택 사항) */}
          <div className="flex justify-center origin-top transform scale-100 md:scale-100">
             {item && car && <ContractPaper data={item} car={car} />}
          </div>
      </div>

      {/* 하단 서명 패드 (화면 하단 고정) */}
      <div className="bg-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] rounded-t-2xl z-20 flex-none pb-8">
          <p className="font-bold text-gray-900 mb-2 text-center text-sm">👇 아래 박스에 정자로 서명해 주세요</p>

          <div className="border-2 border-gray-300 rounded-xl bg-gray-50 mb-4 overflow-hidden flex justify-center">
              <SignatureCanvas
                  ref={sigCanvas}
                  penColor="black"
                  // 모바일 너비에 맞게 캔버스 크기 조정
                  canvasProps={{width: canvasWidth, height: 150, className: 'sigCanvas'}}
              />
          </div>

          <div className="flex gap-3">
              <button onClick={() => sigCanvas.current.clear()} className="flex-1 bg-gray-200 py-3 rounded-xl font-bold text-gray-700">지우기</button>
              <button id="saveBtn" onClick={handleSaveSignature} className="flex-[2] bg-indigo-600 py-3 rounded-xl font-bold text-white shadow-lg">서명 제출하기</button>
          </div>
      </div>
    </div>
  )
}
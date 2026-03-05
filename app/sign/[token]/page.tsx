'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'

// ── 인라인 서명패드 (외부 의존성 없이) ──
function MobileSignaturePad({ onSignatureChange, disabled }: { onSignatureChange: (d: string | null) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.parentElement?.clientWidth || 320
    const h = 160
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = '#1a1a1a'
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
  }, [])

  const getPos = (e: any) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    if (e.touches) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: any) => {
    if (disabled) return; e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return
    const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); setIsDrawing(true)
  }
  const move = (e: any) => {
    if (!isDrawing || disabled) return; e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return
    const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke()
  }
  const end = () => {
    if (!isDrawing) return; setIsDrawing(false); setHasSignature(true)
    const canvas = canvasRef.current
    if (canvas) onSignatureChange(canvas.toDataURL('image/png'))
  }
  const clear = () => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = '#1a1a1a'
    setHasSignature(false); onSignatureChange(null)
  }

  return (
    <div className="relative">
      <canvas ref={canvasRef}
        className={`w-full border-2 rounded-xl touch-none ${disabled ? 'opacity-50' : hasSignature ? 'border-blue-400' : 'border-gray-300'}`}
        style={{ height: 160 }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      {!hasSignature && !disabled && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-gray-300 text-sm font-bold">여기에 서명해주세요</p>
        </div>
      )}
      {hasSignature && !disabled && (
        <button onClick={clear} className="absolute top-2 right-2 px-2 py-1 bg-white/90 border rounded text-xs font-bold text-gray-500">
          지우기
        </button>
      )}
    </div>
  )
}

// ── 메인 서명 페이지 ──
export default function SignPage() {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [tokenId, setTokenId] = useState('')
  const [alreadySigned, setAlreadySigned] = useState(false)
  const [signedInfo, setSignedInfo] = useState<any>(null)

  // 서명 폼
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)

  // 섹션 접기
  const [showInsurance, setShowInsurance] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  // 데이터 로드
  useEffect(() => {
    if (!token) return
    fetch(`/api/sign?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        setQuote(data.quote)
        setCompany(data.company)
        setTokenId(data.token_id)
        setAlreadySigned(data.already_signed)
        setSignedInfo(data.signed_info)
        setLoading(false)
      })
      .catch(() => { setError('서버에 연결할 수 없습니다.'); setLoading(false) })
  }, [token])

  // 서명 제출
  const handleSubmit = async () => {
    if (!signatureData) return alert('서명을 입력해주세요.')
    if (!agreedTerms) return alert('약관에 동의해주세요.')
    setSubmitting(true)
    try {
      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          customer_name: quote?.customer_name || '',
          customer_phone: quote?.customer_phone || '',
          signature_data: signatureData,
          agreed_terms: true,
        }),
      })
      const data = await res.json()
      if (data.error) { alert(data.error); setSubmitting(false); return }
      setCompleted(true)
    } catch {
      alert('서명 저장에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── 로딩/에러/완료 ──
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">계약서를 불러오는 중...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">접근할 수 없습니다</h2>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    </div>
  )

  if (completed) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">서명이 완료되었습니다</h2>
        <p className="text-sm text-gray-500 mb-4">계약서 서명이 정상적으로 접수되었습니다.<br/>감사합니다.</p>
        <div className="bg-gray-50 rounded-xl p-4 text-left text-xs text-gray-500">
          <p>고객명: {quote?.customer_name}</p>
          <p>서명일시: {new Date().toLocaleString('ko-KR')}</p>
        </div>
      </div>
    </div>
  )

  if (alreadySigned) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
        <div className="text-5xl mb-4">📝</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">이미 서명이 완료되었습니다</h2>
        <p className="text-sm text-gray-500">
          {signedInfo?.name && <span>{signedInfo.name}님이 </span>}
          {signedInfo?.signed_at && <span>{new Date(signedInfo.signed_at).toLocaleString('ko-KR')}에 </span>}
          서명하셨습니다.
        </p>
      </div>
    </div>
  )

  const car = quote?.cars
  const fmt = (n: any) => n ? Number(n).toLocaleString() : '-'

  // ── 메인 UI (모바일 최적화) ──
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3">
          <h1 className="text-base font-bold text-gray-900 text-center">차량 임대 계약서</h1>
          <p className="text-xs text-gray-400 text-center mt-0.5">{company?.name || '주식회사에프엠아이'}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* ── 임차인 정보 ── */}
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-blue-600 px-4 py-2.5">
            <h2 className="text-sm font-bold text-white">임차인 정보</h2>
          </div>
          <div className="px-4 py-3 space-y-2">
            <Row label="임차인" value={quote?.customer_name || '-'} />
            <Row label="연락처" value={quote?.customer_phone || '-'} />
            <Row label="생년월일" value={quote?.customer_birth || '-'} />
            {quote?.customer_address && <Row label="주소" value={quote.customer_address} />}
          </div>
        </section>

        {/* ── 대차 정보 ── */}
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gray-700 px-4 py-2.5">
            <h2 className="text-sm font-bold text-white">대차 정보</h2>
          </div>
          <div className="px-4 py-3 space-y-2">
            <Row label="차종" value={car ? `${car.brand || ''} ${car.model || ''} ${car.trim || ''}`.trim() : '-'} />
            <Row label="차량번호" value={car?.number || quote?.car_number || '-'} />
            <Row label="유종" value={car?.fuel || '-'} />
            <Row label="대여일시" value={quote?.start_date ? new Date(quote.start_date).toLocaleString('ko-KR') : '-'} />
            <Row label="반납예정일" value={quote?.end_date ? new Date(quote.end_date).toLocaleString('ko-KR') : '-'} />
          </div>
        </section>

        {/* ── 요금 ── */}
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-emerald-600 px-4 py-2.5">
            <h2 className="text-sm font-bold text-white">요금</h2>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">총 요금</span>
              <span className="text-lg font-bold text-gray-900">{fmt(quote?.total_amount || quote?.monthly_cost)}원</span>
            </div>
            {quote?.daily_rate && (
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>일 대여료</span>
                <span>{fmt(quote.daily_rate)}원</span>
              </div>
            )}
          </div>
        </section>

        {/* ── 보험 (접기) ── */}
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button onClick={() => setShowInsurance(!showInsurance)} className="w-full flex items-center justify-between px-4 py-3">
            <span className="text-sm font-bold text-gray-700">보험가입 및 차량손해 면책 제도</span>
            <span className="text-gray-400 text-xs">{showInsurance ? '접기 ▲' : '보기 ▼'}</span>
          </button>
          {showInsurance && (
            <div className="px-4 pb-3 space-y-1.5 border-t pt-3">
              <Row label="보험 가입 연령" value="만 26세 이상" />
              <Row label="자차 한도" value="3,000만원" />
              <Row label="자차 면책금" value="50만원" />
              <Row label="대인 한도" value="무한" />
              <Row label="대물 한도" value="1억 원" />
              <Row label="자손 한도(부상)" value="1,500만원" />
              <Row label="자손 한도(사망)" value="1,500만원" />
              <div className="mt-2 p-3 bg-amber-50 rounded-xl text-xs text-amber-700 leading-relaxed">
                *자기차량 손해의 경우, 고객귀책사유로 인한 사고는 면책금 (50)만원, 대인 (-)만원 / 대물 (-)만원 휴차손해료(1일 대여요금의 50%)는 각각 별도 지불하여야 합니다.
              </div>
            </div>
          )}
        </section>

        {/* ── 약관 (접기) ── */}
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button onClick={() => setShowTerms(!showTerms)} className="w-full flex items-center justify-between px-4 py-3">
            <span className="text-sm font-bold text-gray-700">대여약관 및 주요 고지사항</span>
            <span className="text-gray-400 text-xs">{showTerms ? '접기 ▲' : '보기 ▼'}</span>
          </button>
          {showTerms && (
            <div className="px-4 pb-3 border-t pt-3 space-y-3 text-xs text-gray-600 leading-relaxed">
              <p>1. 차량 임차기간 동안 발생한 유류비 및 주정차 위반과 교통법규 위반 등으로 인한 과태료와 범칙금 등은 임차인 부담입니다.</p>
              <p>2. 차량 임차 중 사고 발생 시, 약관에 따라 자동차보험 및 자차손해면책제도의 범위 내 손해를 보상받을 수 있습니다.</p>
              <p>3. 차량 임차 중 자차 사고 발생 시 해당 면책금과 휴차 보상료(대여요금의 50%)는 임차인 부담입니다.</p>
              <p>4. 전자계약서 이용 시 서비스 운영과 관련한 각종 정보와 광고를 게재할 수 있습니다.</p>
              <p>5. 그 외 계약조건은 자동차대여 표준약관에 따릅니다.</p>
              <div className="mt-2 p-3 bg-gray-50 rounded-xl text-[11px] text-gray-400">
                <p className="font-bold text-gray-500 mb-1">개인위치정보 조회 및 이용 동의</p>
                <p>당사의 차량에는 위치정보를 수집할 수 있는 장치가 부착되어 있으며 도난, 분실, 반납지연의 상황 발생 시 차량 회수를 목적으로 위치정보를 수집, 이용, 제공할 수 있습니다.</p>
              </div>
              <div className="mt-1 p-3 bg-gray-50 rounded-xl text-[11px] text-gray-400">
                <p className="font-bold text-gray-500 mb-1">개인정보 수집 및 이용 동의</p>
                <p>렌터카 예약/사용/반납 서비스 제공이 종료된 이후에도 수집된 개인정보를 원칙적으로 파기합니다. 단, 법령의 규정에 의하여 보존할 필요가 있는 경우에는 해당 법령에 따라 보존합니다.</p>
              </div>
            </div>
          )}
        </section>

        {/* ── 서명 영역 ── */}
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-red-600 px-4 py-2.5">
            <h2 className="text-sm font-bold text-white">계약서 서명</h2>
          </div>
          <div className="px-4 py-4 space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              상기 내용을 확인하고 동의하는 바, 아래와 같이 서명합니다.
            </p>

            {/* 동의 체크박스 */}
            <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={e => setAgreedTerms(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded accent-blue-600"
              />
              <span className="text-xs text-gray-700 leading-relaxed">
                대여약관 및 주요 고지사항, 개인위치정보 조회 및 이용, 개인정보 수집 및 이용, 제3자 정보제공 및 조회에 대한 내용을 모두 확인하였으며 이에 동의합니다.
              </span>
            </label>

            {/* 서명 패드 */}
            <div>
              <p className="text-xs font-bold text-gray-700 mb-2">서명</p>
              <MobileSignaturePad onSignatureChange={setSignatureData} disabled={submitting} />
            </div>

            {/* 제출 버튼 */}
            <button
              onClick={handleSubmit}
              disabled={!signatureData || !agreedTerms || submitting}
              className="w-full py-3.5 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 active:bg-blue-800 transition-colors"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  서명 처리 중...
                </span>
              ) : '서명 완료'}
            </button>

            <p className="text-[10px] text-gray-300 text-center">
              본 전자서명은 법적 효력을 가지며, 서명 일시와 IP가 기록됩니다.
            </p>
          </div>
        </section>

        {/* 하단 여백 */}
        <div className="h-8" />
      </div>
    </div>
  )
}

// 공통 행 컴포넌트
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="flex-shrink-0 w-20 text-gray-400 text-xs pt-0.5">{label}</span>
      <span className="text-gray-900 flex-1">{value}</span>
    </div>
  )
}

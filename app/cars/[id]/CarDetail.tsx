'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PnlTab from './PnlTab'
import CarSettlementTab from './CarSettlementTab'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'

// ─── 위치 입력 필드 (코드 + 상세) ─────────────────────────────────
function CarLocationField({ locationCode, location, onChange }: {
  locationCode: string; location: string;
  onChange: (code: string, detail: string) => void;
}) {
  const [locations, setLocations] = useState<Array<{ id: string; code: string; label: string; address: string | null }>>([])

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeader()
        const res = await fetch('/api/locations', { headers })
        if (!res.ok) return
        const json = await res.json()
        if (json?.data) setLocations(json.data)
      } catch {}
    })()
  }, [])

  const matched = locations.find(l => l.code === locationCode)

  return (
    <div style={{
      ...GLASS.L3, border: `1px solid ${COLORS.borderSubtle}`,
      borderRadius: 12, padding: 16,
    }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, display: 'block', marginBottom: 8 }}>
        📍 현재 차고지
      </label>

      {/* 표준 코드 드롭다운 */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4 }}>위치 코드 (표준)</div>
        <select
          value={locationCode || ''}
          onChange={e => onChange(e.target.value, location)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            fontSize: 13, fontWeight: 600,
            color: COLORS.textPrimary,
            background: 'rgba(255,255,255,0.7)',
            border: `1px solid ${COLORS.borderSubtle}`,
          }}>
          <option value="">— 선택 안 함 —</option>
          {locations.map(l => (
            <option key={l.id} value={l.code}>{l.label}{l.address ? ` (${l.address})` : ''}</option>
          ))}
        </select>
        {locations.length === 0 && (
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
            ※ 위치 코드가 없습니다. <a href="/admin/locations" style={{ color: COLORS.primary, textDecoration: 'underline' }}>관리자 페이지</a>에서 추가하세요.
          </div>
        )}
      </div>

      {/* 상세 위치 텍스트 */}
      <div>
        <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4 }}>상세 위치 (예: 본사 2층 25번 자리)</div>
        <input
          value={location || ''}
          onChange={e => onChange(locationCode, e.target.value)}
          placeholder="상세 위치를 입력"
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            fontSize: 13, fontWeight: 600,
            color: COLORS.textPrimary,
            background: 'rgba(255,255,255,0.7)',
            border: `1px solid ${COLORS.borderSubtle}`,
          }}
        />
      </div>

      {matched && (
        <div style={{ marginTop: 8, fontSize: 11, color: COLORS.textMuted }}>
          ▸ 표준 위치: <strong style={{ color: COLORS.textSecondary }}>{matched.label}</strong>
          {matched.address && <span> · {matched.address}</span>}
        </div>
      )}
    </div>
  )
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

// ── 보험 인라인 탭 (v2 — 신규 /api/insurance 응답 구조 적용) ──
function InsuranceInlineTab({ carId, onNavigate }: { carId: string; onNavigate: () => void }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const headers = await getAuthHeader()
        const res = await fetch(`/api/insurance?car_id=${carId}`, { headers })
        const json = await res.json()
        setData(json.data || [])
      } catch (e) { console.error('[InsuranceInlineTab]', e) }
      setLoading(false)
    }
    load()
  }, [carId])

  if (loading) return <div className="text-center py-4 text-gray-400">로딩 중...</div>

  const fmtDate = (d: any) => d ? String(d).slice(0, 10) : '-'
  const totalAnnual = data.reduce((s, ins) => s + Number(ins.total_premium || 0), 0)

  return (
    <div className="animate-fade-in space-y-4">
      {/* 요약 통계 */}
      {data.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
            <p className="text-xs text-emerald-700 mb-1">보유 보험</p>
            <p className="text-2xl font-bold text-emerald-900">{data.length}건</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl">
            <p className="text-xs text-blue-700 mb-1">총 보험료</p>
            <p className="text-xl font-bold text-blue-900">{totalAnnual.toLocaleString()}원</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl">
            <p className="text-xs text-amber-700 mb-1">만료 임박 (30일)</p>
            <p className="text-2xl font-bold text-amber-900">
              {data.filter((ins: any) => {
                if (!ins.end_date) return false
                const days = Math.ceil((new Date(ins.end_date).getTime() - Date.now()) / 86400000)
                return days >= 0 && days <= 30
              }).length}건
            </p>
          </div>
        </div>
      )}

      {data.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">🛡️</div>
          <p className="font-bold text-lg text-gray-500">등록된 보험이 없습니다</p>
          <p className="text-sm mt-2">아래 버튼으로 보험 관리 페이지에서 등록하세요</p>
        </div>
      ) : (
        data.map((ins: any) => {
          const isExpired = ins.end_date && new Date(ins.end_date) < new Date()
          const daysLeft = ins.end_date ? Math.ceil((new Date(ins.end_date).getTime() - Date.now()) / 86400000) : null
          return (
            <div key={ins.id} className={`bg-white p-5 rounded-2xl border shadow-sm ${isExpired ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛡️</span>
                  <span className="font-bold text-gray-800">{ins.insurance_company || '-'}</span>
                  {ins.policy_number && (
                    <span className="text-xs text-gray-400 font-mono">{ins.policy_number}</span>
                  )}
                  {ins.design_number && !ins.policy_number && (
                    <span className="text-xs text-gray-400 font-mono">{ins.design_number}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                    isExpired ? 'bg-red-100 text-red-600' : (daysLeft !== null && daysLeft < 30) ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-600'
                  }`}>
                    {isExpired ? '만기' : (daysLeft !== null && daysLeft < 30) ? `D-${daysLeft}` : '유효'}
                  </span>
                </div>
                <span className="text-sm font-bold text-gray-800">
                  {Number(ins.total_premium || 0).toLocaleString()}원
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">차종</p>
                  <p className="font-medium text-gray-700">{ins.vehicle_class || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">기간</p>
                  <p className="font-medium text-gray-700">{fmtDate(ins.start_date)} ~ {fmtDate(ins.end_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">납입방식</p>
                  <p className="font-medium text-gray-700">
                    {ins.payment_type === 'installment' ? `분할 ${ins.installment_count}회` : '일시납'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">다음 납입</p>
                  <p className="font-medium text-gray-700">
                    {ins.next_due_date
                      ? <>{fmtDate(ins.next_due_date)} <span className="text-xs text-gray-400">({Number(ins.next_due_amount || 0).toLocaleString()}원)</span></>
                      : '완료'}
                  </p>
                </div>
              </div>
            </div>
          )
        })
      )}
      <button onClick={onNavigate}
        className="w-full bg-white text-green-600 border-2 border-green-200 py-3 rounded-xl font-bold hover:bg-green-50 transition-all">
        🛡 보험 관리 페이지로 이동 →
      </button>
    </div>
  )
}

// ── 등록증 인라인 탭 (2026-04-29 — /registration 통합, 다중 등록 지원) ──
function RegistrationInlineTab({ carId, car, onUpdate }: { carId: string; car: any; onUpdate: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [ocrResult, setOcrResult] = useState<any>(null)
  // 다중 업로드 진행 상태
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; results: Array<{ name: string; status: 'ok' | 'fail'; msg?: string }> } | null>(null)

  const upload = async (file: File) => {
    setUploading(true)
    setOcrResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const headers = await getAuthHeader()
      const ocrRes = await fetch('/api/ocr-registration', { method: 'POST', headers: headers as any, body: formData })
      const ocrJson = await ocrRes.json()
      if (!ocrRes.ok) {
        alert(`OCR 실패: ${ocrJson?.error || ocrRes.status}`)
        return
      }
      setOcrResult(ocrJson)
    } catch (e: any) {
      alert(`OCR 오류: ${e?.message || String(e)}`)
    } finally {
      setUploading(false)
    }
  }

  // 다중 등록증 일괄 OCR — 새 차량 등록 (cars POST) 또는 같은 차량 갱신
  const bulkUpload = async (files: FileList) => {
    const arr = Array.from(files)
    if (arr.length === 0) return
    if (arr.length > 30) { alert(`최대 30장 (선택: ${arr.length})`); return }
    if (!confirm(`${arr.length}장의 등록증을 일괄 OCR 처리합니다.\n\n· 차량번호가 일치하는 기존 차량이 있으면 정보 업데이트\n· 없으면 새 차량 자동 등록\n\n계속할까요?`)) return

    setBulkProgress({ done: 0, total: arr.length, results: [] })
    const results: Array<{ name: string; status: 'ok' | 'fail'; msg?: string }> = []
    const headers = await getAuthHeader()

    for (let i = 0; i < arr.length; i++) {
      const file = arr[i]
      try {
        // 1) OCR
        const fd = new FormData()
        fd.append('file', file)
        const ocrRes = await fetch('/api/ocr-registration', { method: 'POST', headers: headers as any, body: fd })
        const ocr = await ocrRes.json()
        if (!ocrRes.ok || !ocr?.brand) {
          results.push({ name: file.name, status: 'fail', msg: ocr?.error || 'OCR 실패' })
          setBulkProgress({ done: i + 1, total: arr.length, results: [...results] })
          continue
        }
        // 2) 차량 매칭 (number 또는 vin) — 기존 차량 있으면 PATCH, 없으면 POST
        const candidatesRes = await fetch('/api/cars', { headers })
        const candidatesJson = await candidatesRes.json()
        const allCars = (candidatesJson?.data || []) as any[]
        const matched = allCars.find((c: any) =>
          (ocr.number && c.number === ocr.number) ||
          (ocr.vin && c.vin === ocr.vin)
        )
        const body: any = {
          brand: ocr.brand,
          model: ocr.model_name || ocr.model,
          year: ocr.year || null,
          number: ocr.number || null,
          vin: ocr.vin || null,
        }
        if (matched) {
          await fetch(`/api/cars/${matched.id}`, {
            method: 'PATCH',
            headers: { ...(headers as any), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          results.push({ name: file.name, status: 'ok', msg: `갱신: ${matched.number || matched.id.slice(0, 6)}` })
        } else {
          const r = await fetch('/api/cars', {
            method: 'POST',
            headers: { ...(headers as any), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, status: 'active' }),
          })
          results.push({ name: file.name, status: r.ok ? 'ok' : 'fail', msg: r.ok ? '신규 등록' : `등록 실패 ${r.status}` })
        }
      } catch (e: any) {
        results.push({ name: file.name, status: 'fail', msg: e?.message || String(e) })
      }
      setBulkProgress({ done: i + 1, total: arr.length, results: [...results] })
    }
  }

  const applyOcr = async () => {
    if (!ocrResult) return
    if (!confirm('OCR 추출 결과를 차량 정보에 적용할까요?')) return
    try {
      const headers = await getAuthHeader()
      const body: any = {}
      if (ocrResult.brand) body.brand = ocrResult.brand
      if (ocrResult.model_name || ocrResult.model) body.model = ocrResult.model_name || ocrResult.model
      if (ocrResult.year) body.year = ocrResult.year
      if (ocrResult.vin) body.vin = ocrResult.vin
      if (ocrResult.number) body.number = ocrResult.number
      const res = await fetch(`/api/cars/${carId}`, {
        method: 'PATCH',
        headers: { ...(headers as any), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        alert('차량 정보 업데이트 완료')
        setOcrResult(null)
        onUpdate()
      } else {
        const j = await res.json().catch(() => ({}))
        alert(`업데이트 실패: ${j?.error || res.status}`)
      }
    } catch (e: any) {
      alert(`업데이트 오류: ${e?.message || String(e)}`)
    }
  }

  return (
    <div className="animate-fade-in space-y-4">
      {/* 등록증 이미지 표시 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">📄 차량 등록증</h3>
          <div className="flex gap-2">
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading || !!bulkProgress}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 disabled:opacity-50">
              {uploading ? '🤖 OCR 분석 중...' : '📤 단일 업로드'}
            </button>
            <label className="px-4 py-2 bg-pink-500 text-white rounded-lg font-bold hover:bg-pink-600 cursor-pointer disabled:opacity-50"
                   style={{ opacity: bulkProgress ? 0.5 : 1, cursor: bulkProgress ? 'wait' : 'pointer' }}>
              📂 일괄 등록 (~30장)
              <input type="file" accept="image/*,application/pdf" multiple disabled={!!bulkProgress}
                className="hidden"
                onChange={(e) => { if (e.target.files && e.target.files.length > 0) bulkUpload(e.target.files); e.target.value = '' }}
              />
            </label>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" disabled={uploading}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
          />
        </div>

        {/* 일괄 OCR 진행 패널 */}
        {bulkProgress && (
          <div className="mb-4 p-4 bg-pink-50 border border-pink-200 rounded-xl">
            <div className="flex justify-between mb-2">
              <span className="font-bold text-pink-800">
                {bulkProgress.done < bulkProgress.total ? '🤖 일괄 OCR 진행 중...' : '✓ 일괄 OCR 완료'}
                {' '} ({bulkProgress.done}/{bulkProgress.total})
              </span>
              {bulkProgress.done >= bulkProgress.total && (
                <button onClick={() => { setBulkProgress(null); onUpdate() }}
                  className="text-xs text-gray-500 hover:text-gray-800">닫기</button>
              )}
            </div>
            <div className="h-2 bg-pink-100 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-pink-500 transition-all"
                style={{ width: `${(bulkProgress.done / Math.max(1, bulkProgress.total)) * 100}%` }} />
            </div>
            {bulkProgress.results.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-pink-700 font-bold">
                  결과 보기 (성공 {bulkProgress.results.filter(r => r.status === 'ok').length} / 실패 {bulkProgress.results.filter(r => r.status === 'fail').length})
                </summary>
                <div className="mt-2 max-h-48 overflow-auto bg-white rounded p-2">
                  {bulkProgress.results.map((r, i) => (
                    <div key={i} className={`mb-1 ${r.status === 'fail' ? 'text-red-600' : 'text-gray-700'}`}>
                      {r.status === 'ok' ? '✓' : '❌'} {r.name} — {r.msg}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        {car?.registration_image_url ? (
          car.registration_image_url.endsWith('.pdf') ? (
            <iframe src={car.registration_image_url} style={{ width: '100%', height: 480, border: 0 }} />
          ) : (
            <img src={car.registration_image_url} alt="등록증" style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain' }} />
          )
        ) : (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-3">📄</div>
            <p>등록된 차량 등록증이 없습니다</p>
            <p className="text-sm mt-1">상단 [등록증 업로드] 버튼으로 추가하세요</p>
          </div>
        )}
      </div>

      {/* OCR 결과 미리보기 + 적용 */}
      {ocrResult && (
        <div className="bg-blue-50 p-5 rounded-2xl border border-blue-200">
          <h4 className="font-bold text-blue-900 mb-3">🤖 OCR 추출 결과</h4>
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            {[
              ['브랜드', ocrResult.brand],
              ['모델', ocrResult.model_name || ocrResult.model],
              ['연식', ocrResult.year],
              ['차량번호', ocrResult.number],
              ['차대번호 (VIN)', ocrResult.vin],
            ].filter(([_, v]) => v).map(([k, v]) => (
              <div key={k as string}>
                <p className="text-xs text-gray-500">{k}</p>
                <p className="font-bold text-gray-800">{v as string}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={applyOcr}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600">
              차량 정보에 적용
            </button>
            <button onClick={() => setOcrResult(null)}
              className="px-4 py-2 bg-white text-gray-600 border border-gray-300 rounded-lg font-bold hover:bg-gray-50">
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 투자 인라인 탭 ──────────────────────────
function InvestInlineTab({ carId }: { carId: string }) {
  const [investments, setInvestments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const headers = await getAuthHeader()
        const res = await fetch(`/api/investments?car_id=${carId}`, { headers })
        const json = await res.json()
        setInvestments(json.data || [])
      } catch (e) { console.error('[InvestInlineTab]', e) }
      setLoading(false)
    }
    load()
  }, [carId])

  if (loading) return <div className="text-center py-4 text-gray-400">로딩 중...</div>

  return (
    <div className="animate-fade-in space-y-4">
      {investments.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">📈</div>
          <p className="font-bold text-lg text-gray-500">연결된 투자 계약이 없습니다</p>
          <p className="text-sm mt-2">투자 정산 관리에서 이 차량에 투자 계약을 연결해주세요.</p>
        </div>
      ) : (
        investments.map((inv: any) => {
          const monthlyInterest = inv.invest_amount && inv.interest_rate
            ? Math.round(Number(inv.invest_amount) * Number(inv.interest_rate) / 100 / 12)
            : 0
          const isActive = inv.status === 'active'
          return (
            <div key={inv.id} className={`bg-white p-5 rounded-2xl border shadow-sm ${isActive ? 'border-blue-200' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📈</span>
                  <span className="font-bold text-gray-800">{inv.investor_name || '투자자'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                    isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {isActive ? '진행중' : inv.status || '종료'}
                  </span>
                </div>
                <span className="text-sm font-bold text-blue-600">{Number(inv.invest_amount || 0).toLocaleString()}원</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">이율</p>
                  <p className="font-medium text-gray-700">{inv.interest_rate}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">월 이자</p>
                  <p className="font-medium text-gray-700">{monthlyInterest.toLocaleString()}원</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">시작일</p>
                  <p className="font-medium text-gray-700">{inv.contract_start_date || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">종료일</p>
                  <p className="font-medium text-gray-700">{inv.contract_end_date || '-'}</p>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
export default function CarDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const carId = Array.isArray(id) ? id[0] : id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const [car, setCar] = useState<any>(null)

  // 📊 좌측 요약용 상태
  const [summary, setSummary] = useState<{ insuranceCount: number; activeInsurance: any; loanCount: number; totalLoanAmount: number; investCount: number; totalInvestAmount: number }>({
    insuranceCount: 0, activeInsurance: null, loanCount: 0, totalLoanAmount: 0, investCount: 0, totalInvestAmount: 0
  })

  // 💰 금융(대출) 관련 상태
  const [loans, setLoans] = useState<any[]>([])
  const [loadingLoans, setLoadingLoans] = useState(false)
  const [newLoan, setNewLoan] = useState({
    finance_name: '', type: '할부', total_amount: 0, monthly_payment: 0, payment_date: 25, start_date: '', end_date: ''
  })

  // 1. 차량 기본 데이터 불러오기 (재사용 가능하도록 useCallback)
  const fetchCar = useCallback(async () => {
    if (!carId) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/cars/${carId}`, { headers })
      if (!res.ok) { alert('차량 정보를 불러오지 못했습니다.'); router.push('/cars'); return }
      const json = await res.json()
      setCar(json.data)
    } catch (e) { alert('차량 정보를 불러오지 못했습니다.'); router.push('/cars') }
    setLoading(false)
  }, [carId, router])

  useEffect(() => { fetchCar() }, [fetchCar])

  // 1-b. 좌측 요약 데이터 로드
  useEffect(() => {
    if (!carId) return
    const loadSummary = async () => {
      try {
        const headers = await getAuthHeader()
        const [insRes, loanRes, invRes] = await Promise.all([
          fetch(`/api/insurance?car_id=${carId}`, { headers }).then(r => r.json()),
          fetch(`/api/loans?car_id=${carId}`, { headers }).then(r => r.json()),
          fetch(`/api/investments?car_id=${carId}`, { headers }).then(r => r.json()),
        ])
        const ins = insRes.data || []
        const activeIns = ins.find((i: any) => i.end_date && new Date(i.end_date) >= new Date())
        const loanList = loanRes.data || []
        const invList = invRes.data || []
        setSummary({
          insuranceCount: ins.length,
          activeInsurance: activeIns || null,
          loanCount: loanList.length,
          totalLoanAmount: loanList.reduce((s: number, l: any) => s + (Number(l.total_amount) || 0), 0),
          investCount: invList.length,
          totalInvestAmount: invList.reduce((s: number, i: any) => s + (Number(i.invest_amount) || 0), 0),
        })
      } catch (e) { console.error('[CarDetail summary]', e) }
    }
    loadSummary()
  }, [carId])

  // 2. 탭이 바뀔 때 해당 데이터 불러오기
  useEffect(() => {
    if (activeTab === 'finance') fetchLoans()
  }, [activeTab])

  // 🏦 대출 목록 불러오기
  const fetchLoans = async () => {
    setLoadingLoans(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/loans?car_id=${carId}`, { headers })
      const json = await res.json()
      setLoans(json.data || [])
    } catch (e) { console.error('[fetchLoans]', e) }
    setLoadingLoans(false)
  }

  // 🏦 대출 추가하기
  const handleAddLoan = async () => {
    if (!newLoan.finance_name || !newLoan.total_amount) return alert('금융사명과 원금은 필수입니다.')

    const headers = await getAuthHeader()
    const res = await fetch('/api/loans', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ car_id: carId, ...newLoan }),
    })
    const json = await res.json()
    const error = json.error ? { message: json.error } : null

    if (error) alert('추가 실패: ' + error.message)
    else {
      alert('금융 정보가 등록되었습니다.')
      setNewLoan({ finance_name: '', type: '할부', total_amount: 0, monthly_payment: 0, payment_date: 25, start_date: '', end_date: '' }) // 초기화
      fetchLoans() // 목록 새로고침
    }
  }

  // 🏦 대출 삭제하기
  const handleDeleteLoan = async (loanId: number) => {
    if (!confirm('이 금융 이력을 삭제하시겠습니까?')) return
    const headers = await getAuthHeader()
    const res = await fetch(`/api/loans/${loanId}`, { method: 'DELETE', headers })
    const json = await res.json()
    if (json.error) alert('삭제 실패')
    else fetchLoans()
  }

  const handleChange = (field: string, value: any) => {
    setCar((prev: any) => ({ ...prev, [field]: value }))
  }

  const handleUpdate = async () => {
    setSaving(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/cars/${carId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: car.number, brand: car.brand, model: car.model, trim: car.trim,
          year: car.year, fuel: car.fuel, status: car.status, location: car.location,
          mileage: car.mileage, purchase_price: car.purchase_price, acq_date: car.acq_date,
          is_used: car.is_used, purchase_mileage: car.purchase_mileage,
          registration_tax: car.registration_tax || 0, bond_amount: car.bond_amount || 0,
          delivery_fee: car.delivery_fee || 0, plate_fee: car.plate_fee || 0,
          agency_fee: car.agency_fee || 0, other_initial_cost: car.other_initial_cost || 0,
          initial_cost_memo: car.initial_cost_memo || '',
          ownership_type: car.ownership_type, owner_name: car.owner_name, owner_phone: car.owner_phone,
          owner_bank: car.owner_bank, owner_account: car.owner_account, owner_account_holder: car.owner_account_holder,
          consignment_fee: car.consignment_fee, consignment_start: car.consignment_start || null,
          consignment_end: car.consignment_end || null, insurance_by: car.insurance_by,
          consignment_contract_url: car.consignment_contract_url, owner_memo: car.owner_memo,
        }),
      })
      const json = await res.json()
      if (json.error) alert('저장 실패: ' + json.error)
      else alert('✅ 저장되었습니다!')
    } catch (e: any) { alert('저장 실패: ' + e.message) }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const headers = await getAuthHeader()
    const res = await fetch(`/api/cars/${carId}`, { method: 'DELETE', headers })
    const json = await res.json()
    if (json.error) alert('삭제 실패')
    else { alert('삭제되었습니다.'); router.push('/cars') }
  }

  if (loading) return <div className="p-20 text-center">로딩 중... ⏳</div>
  if (!car) return null

  return (
    <div className="max-w-[1400px] mx-auto py-4 px-6 animate-fade-in-up pb-20">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/cars')} className="bg-white px-4 py-2 border rounded-xl font-bold text-gray-500 hover:bg-gray-50">← 목록</button>
          <div>
            <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              차량 상세 정보
              {(() => {
                const map: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
                  available:   { label: '대기',     tone: 'neutral' },
                  rented:      { label: '대여중',   tone: 'success' },
                  maintenance: { label: '정비/사고', tone: 'warning' },
                  returned:    { label: '반납',     tone: 'neutral' },
                  sold:        { label: '매각',     tone: 'danger' },
                  retired:     { label: '폐기',     tone: 'danger' },
                }
                const meta = map[car.status] || { label: car.status || '미설정', tone: 'neutral' as const }
                return (
                  <span style={{ ...pillStyle(meta.tone), fontSize: 11, padding: '3px 10px' }}>
                    {meta.label}
                  </span>
                )
              })()}
            </h2>
            <p className="text-gray-500 font-medium text-sm mt-0.5">관리번호: {car.id?.slice(0, 8)} / {car.brand} {car.model}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDelete} className="px-4 py-2 border border-red-100 text-red-500 font-bold rounded-xl hover:bg-red-50">삭제</button>
          <button onClick={handleUpdate} disabled={saving} className="px-6 py-2 bg-steel-600 text-white font-bold rounded-xl shadow-lg hover:bg-steel-700 transition-all">
            {saving ? '저장 중...' : '💾 저장'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 좌측: 요약 정보 카드 — Soft Ice Glass v4 */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* === Hero — 차량번호판 클래식 톤 === */}
          <div style={{
            ...GLASS.L3, border: `1px solid ${COLORS.borderBlue}`,
            borderRadius: 16, padding: 20,
          }}>
            {/* 차량번호 강조 박스 */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 8, letterSpacing: 1 }}>
                차량번호
              </p>
              <div style={{
                display: 'inline-block', padding: '10px 24px', borderRadius: 10,
                background: '#fff', border: `2.5px solid ${COLORS.textPrimary}`,
                fontSize: 26, fontWeight: 900, letterSpacing: 3,
                color: COLORS.textPrimary, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}>
                {car.number || '미등록'}
              </div>
              {car.vin && (
                <p style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 6, fontFamily: 'monospace' }}>
                  VIN {car.vin}
                </p>
              )}
            </div>

            {/* 차종 / 주행거리 2열 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ ...GLASS.L4, padding: 12, borderRadius: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4 }}>차종</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, lineHeight: 1.3 }}>
                  {car.brand || '-'} {car.model || ''}
                </p>
                {car.trim && (
                  <p style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{car.trim}</p>
                )}
              </div>
              <div style={{ ...GLASS.L4, padding: 12, borderRadius: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4 }}>주행거리</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
                  {Number(car.mileage || 0).toLocaleString()} <span style={{ fontSize: 11, color: COLORS.textSecondary }}>km</span>
                </p>
              </div>
            </div>

            {/* 신차/중고 + 구입시 주행 (중고일 때만) */}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ ...pillStyle(car.is_used ? 'warning' : 'info'), fontSize: 11, padding: '2px 10px' }}>
                {car.is_used ? '🔄 중고차' : '🆕 신차'}
              </span>
              {car.is_used && Number(car.purchase_mileage) > 0 && (
                <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
                  구입 시 <b style={{ color: COLORS.textPrimary }}>{Number(car.purchase_mileage).toLocaleString()}km</b>
                </span>
              )}
            </div>
          </div>

          {/* === 현재 차고지 (위치 코드 + 상세 자유 입력) === */}
          <CarLocationField
            locationCode={car.location_code || ''}
            location={car.location || ''}
            onChange={(code, detail) => {
              handleChange('location_code', code)
              handleChange('location', detail)
            }}
          />

           {/* 취득 요약 — Number 캐스팅 의무 (Prisma Decimal → string 반환 이슈) */}
           {(Number(car.purchase_price || 0) > 0) && (() => {
             const pp = Number(car.purchase_price || 0)
             const rt = Number(car.registration_tax || 0)
             const ba = Number(car.bond_amount || 0)
             const df = Number(car.delivery_fee || 0)
             const pf = Number(car.plate_fee || 0)
             const af = Number(car.agency_fee || 0)
             const oc = Number(car.other_initial_cost || 0)
             const initial = rt + ba + df + pf + af + oc
             const total = pp + initial
             return (
               <div style={{
                 ...GLASS.L3, border: `1px solid ${COLORS.borderAmber}`,
                 borderRadius: 12, padding: 16,
               }}>
                 <p style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 10 }}>
                   💰 취득 요약
                 </p>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <span style={{ fontSize: 12, color: COLORS.textSecondary }}>구매가</span>
                     <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{pp.toLocaleString()}원</span>
                   </div>
                   {initial > 0 && (
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <span style={{ fontSize: 12, color: COLORS.textSecondary }}>초기비용</span>
                       <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{initial.toLocaleString()}원</span>
                     </div>
                   )}
                   <div style={{
                     borderTop: `1px solid ${COLORS.borderSubtle}`, paddingTop: 8, marginTop: 4,
                     display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                   }}>
                     <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary }}>총 취득원가</span>
                     <span style={{ fontSize: 14, fontWeight: 900, color: COLORS.primary }}>{total.toLocaleString()}원</span>
                   </div>
                 </div>
               </div>
             )
           })()}

           {/* 관리 현황 — Glass L3 + 색상 톤 통일 */}
           <div style={{
             ...GLASS.L3, border: `1px solid ${COLORS.borderGreen}`,
             borderRadius: 12, padding: 16,
           }}>
             <p style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 10 }}>
               📋 관리 현황
             </p>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
               {/* 보험 */}
               <button
                 onClick={() => setActiveTab('insurance')}
                 style={{
                   display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                   padding: '8px 10px', borderRadius: 8, border: 'none',
                   background: 'transparent', cursor: 'pointer', transition: 'background 0.15s',
                 }}
                 onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                 onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                   <span style={{ fontSize: 14 }}>🛡️</span>
                   <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>보험</span>
                 </div>
                 {summary.activeInsurance ? (
                   <div style={{ textAlign: 'right' }}>
                     <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.success }}>
                       {summary.activeInsurance.insurance_company || summary.activeInsurance.company}
                     </span>
                     {summary.activeInsurance.end_date && (
                       <p style={{ fontSize: 10, color: COLORS.textMuted, margin: 0 }}>
                         ~{String(summary.activeInsurance.end_date).slice(0, 10)}
                       </p>
                     )}
                   </div>
                 ) : (
                   <span style={{ fontSize: 12, color: COLORS.textMuted }}>
                     {summary.insuranceCount > 0 ? '만료됨' : '미등록'}
                   </span>
                 )}
               </button>

               {/* 대출 */}
               <button
                 onClick={() => setActiveTab('finance')}
                 style={{
                   display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                   padding: '8px 10px', borderRadius: 8, border: 'none',
                   background: 'transparent', cursor: 'pointer', transition: 'background 0.15s',
                 }}
                 onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                 onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                   <span style={{ fontSize: 14 }}>💰</span>
                   <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>대출/금융</span>
                 </div>
                 {summary.loanCount > 0 ? (
                   <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary }}>
                     {summary.loanCount}건 · {summary.totalLoanAmount.toLocaleString()}원
                   </span>
                 ) : (
                   <span style={{ fontSize: 12, color: COLORS.textMuted }}>없음</span>
                 )}
               </button>

               {/* 투자 */}
               <button
                 onClick={() => setActiveTab('invest')}
                 style={{
                   display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                   padding: '8px 10px', borderRadius: 8, border: 'none',
                   background: 'transparent', cursor: 'pointer', transition: 'background 0.15s',
                 }}
                 onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                 onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                   <span style={{ fontSize: 14 }}>📈</span>
                   <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>투자</span>
                 </div>
                 {summary.investCount > 0 ? (
                   <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary }}>
                     {summary.investCount}건 · {summary.totalInvestAmount.toLocaleString()}원
                   </span>
                 ) : (
                   <span style={{ fontSize: 12, color: COLORS.textMuted }}>없음</span>
                 )}
               </button>

               {/* 소유 구분 */}
               <button
                 onClick={() => setActiveTab('jiip')}
                 style={{
                   display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                   padding: '8px 10px', borderRadius: 8, border: 'none',
                   background: 'transparent', cursor: 'pointer', transition: 'background 0.15s',
                 }}
                 onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                 onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                   <span style={{ fontSize: 14 }}>🤝</span>
                   <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>소유구분</span>
                 </div>
                 <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary }}>
                   {car.ownership_type === 'company' ? '자사 보유' :
                    car.ownership_type === 'consignment' ? '지입' :
                    car.ownership_type === 'leased_in' ? '임차' : '미설정'}
                 </span>
               </button>
             </div>
           </div>
        </div>

        {/* 우측: 탭 메뉴 및 상세 내용 */}
        <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-gray-200 min-h-[600px] flex flex-col">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {['basic', 'registration', 'pnl', 'settlement', 'insurance', 'finance', 'jiip', 'invest'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-5 font-bold capitalize transition-all border-b-2 whitespace-nowrap px-4 ${
                  activeTab === tab ? 'text-steel-600 border-steel-600 bg-steel-50/30' : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                {tab === 'basic' && '📋 기본 정보'}
                {tab === 'registration' && '📄 등록증'}
                {tab === 'pnl' && '📊 손익'}
                {tab === 'settlement' && '💳 수익/정산'}
                {tab === 'insurance' && '🛡️ 보험 이력'}
                {tab === 'finance' && '💰 대출/금융'}
                {tab === 'jiip' && '🤝 지입 관리'}
                {tab === 'invest' && '📈 투자 관리'}
              </button>
            ))}
          </div>

          <div className="p-8 flex-1 bg-gray-50/50">
             {/* 📊 손익 탭 */}
             {activeTab === 'pnl' && (
               <PnlTab carId={carId!} car={car} />
             )}

             {/* 💳 수익/정산 탭 */}
             {activeTab === 'settlement' && (
               <CarSettlementTab carId={carId!} car={car} />
             )}

             {/* 📋 기본 정보 탭 */}
             {activeTab === 'basic' && (
               <div className="animate-fade-in space-y-6">
                 {/* 차량 기본 제원 */}
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">🚗 차량 정보</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">차량번호</label>
                       <input className="w-full border rounded-lg p-2.5 text-sm font-bold" value={car.number || ''} onChange={e => handleChange('number', e.target.value)} placeholder="예: 12가3456" />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">차대번호 (VIN)</label>
                       <input className="w-full border rounded-lg p-2.5 text-sm font-mono uppercase" value={car.vin || ''}
                         onChange={e => handleChange('vin', e.target.value.toUpperCase())}
                         maxLength={17}
                         placeholder="17자리 (예: KMHKN81AFTU378615)" />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">브랜드</label>
                       <input className="w-full border rounded-lg p-2.5 text-sm" value={car.brand || ''} onChange={e => handleChange('brand', e.target.value)} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">모델</label>
                       <input className="w-full border rounded-lg p-2.5 text-sm" value={car.model || ''} onChange={e => handleChange('model', e.target.value)} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">트림</label>
                       <input className="w-full border rounded-lg p-2.5 text-sm" value={car.trim || ''} onChange={e => handleChange('trim', e.target.value)} placeholder="예: 프레스티지" />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">연식</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" value={car.year || ''} onChange={e => handleChange('year', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">연료</label>
                       <select className="w-full border rounded-lg p-2.5 text-sm" value={car.fuel || ''} onChange={e => handleChange('fuel', e.target.value)}>
                         <option value="">선택</option>
                         <option value="gasoline">휘발유</option>
                         <option value="diesel">디젤</option>
                         <option value="lpg">LPG</option>
                         <option value="electric">전기</option>
                         <option value="hybrid">하이브리드</option>
                       </select>
                     </div>
                   </div>
                 </div>

                 {/* 상태/운행 */}
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">📊 상태 및 운행</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">차량 상태</label>
                       <select className="w-full border rounded-lg p-2.5 text-sm" value={car.status || ''} onChange={e => handleChange('status', e.target.value)}>
                         <option value="available">가용</option>
                         <option value="rented">렌트중</option>
                         <option value="maintenance">정비중</option>
                         <option value="sold">매각</option>
                       </select>
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">현재 주행거리 (km)</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" value={car.mileage || ''} onChange={e => handleChange('mileage', Number(e.target.value))} />
                     </div>
                   </div>
                 </div>

                 {/* 취득 정보 */}
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">💰 취득 정보</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">구매가 (원)</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" value={car.purchase_price || ''} onChange={e => handleChange('purchase_price', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">취득일</label>
                       <input type="date" className="w-full border rounded-lg p-2.5 text-sm" value={car.acq_date || ''} onChange={e => handleChange('acq_date', e.target.value)} />
                     </div>
                     <div className="flex items-center gap-3 col-span-2">
                       <label className="flex items-center gap-2 cursor-pointer">
                         <input type="checkbox" checked={car.is_used || false} onChange={e => handleChange('is_used', e.target.checked)}
                           className="w-4 h-4 rounded border-gray-300" />
                         <span className="text-sm font-medium text-gray-700">중고차 구입</span>
                       </label>
                       {car.is_used && (
                         <div className="flex-1">
                           <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="구입시 주행거리 (km)"
                             value={car.purchase_mileage || ''} onChange={e => handleChange('purchase_mileage', Number(e.target.value))} />
                         </div>
                       )}
                     </div>
                   </div>
                 </div>

                 {/* 초기비용 */}
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">🧾 초기비용 (취득원가)</h3>
                   <p className="text-xs text-gray-400 mb-4">차량 구매 시 발생한 부대비용. 손익 분석 시 총 취득원가에 포함됩니다.</p>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">취등록세</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.registration_tax || ''} onChange={e => handleChange('registration_tax', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">공채 (할인액)</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.bond_amount || ''} onChange={e => handleChange('bond_amount', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">탁송비</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.delivery_fee || ''} onChange={e => handleChange('delivery_fee', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">번호판/인지대</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.plate_fee || ''} onChange={e => handleChange('plate_fee', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">대행수수료</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.agency_fee || ''} onChange={e => handleChange('agency_fee', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">기타 비용</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.other_initial_cost || ''} onChange={e => handleChange('other_initial_cost', Number(e.target.value))} />
                     </div>
                   </div>
                   {/* 초기비용 합계 + 총 취득원가 — Number 캐스팅 */}
                   {(() => {
                     const pp = Number(car.purchase_price || 0)
                     const initial = Number(car.registration_tax || 0) + Number(car.bond_amount || 0)
                       + Number(car.delivery_fee || 0) + Number(car.plate_fee || 0)
                       + Number(car.agency_fee || 0) + Number(car.other_initial_cost || 0)
                     return (
                       <>
                         <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                           <span className="text-sm font-bold text-gray-500">초기비용 합계</span>
                           <span className="text-lg font-black text-gray-800">{initial.toLocaleString()}원</span>
                         </div>
                         <div className="mt-2 flex items-center justify-between">
                           <span className="text-sm font-bold text-gray-500">총 취득원가 (구매가 + 초기비용)</span>
                           <span className="text-lg font-black text-blue-600">{(pp + initial).toLocaleString()}원</span>
                         </div>
                       </>
                     )
                   })()}
                   <div className="mt-3">
                     <label className="text-xs font-bold text-gray-500 block mb-1">초기비용 메모</label>
                     <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="예: 공채 5% 할인 적용, 직접 이전"
                       value={car.initial_cost_memo || ''} onChange={e => handleChange('initial_cost_memo', e.target.value)} />
                   </div>
                 </div>

                 {/* 등록증 바로가기 + 저장 */}
                 <div className="flex items-center gap-3">
                   <button onClick={() => router.push(`/registration/${carId}`)}
                     className="flex-1 bg-white text-steel-600 border-2 border-steel-200 px-6 py-3.5 rounded-xl font-bold hover:bg-steel-50 transition-all text-center">
                     📄 등록증 상세 보기
                   </button>
                   <button onClick={handleUpdate} disabled={saving}
                     className="flex-1 bg-steel-600 text-white px-6 py-3.5 rounded-xl font-bold hover:bg-steel-700 transition-colors disabled:opacity-50">
                     {saving ? '저장 중...' : '💾 기본 정보 저장'}
                   </button>
                 </div>
               </div>
             )}

             {/* 📄 등록증 탭 */}
             {activeTab === 'registration' && (
               <RegistrationInlineTab carId={carId!} car={car} onUpdate={() => fetchCar()} />
             )}

             {/* 🛡️ 보험 이력 탭 */}
             {activeTab === 'insurance' && (
              <InsuranceInlineTab carId={carId!} onNavigate={() => router.push(`/insurance`)} />
            )}

            {/* 🤝 지입 관리 탭 */}
            {activeTab === 'jiip' && (
              <div className="animate-fade-in space-y-6">
                {/* 소유 구분 선택 */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">📌 소유 구분</h3>
                  <div className="flex gap-3">
                    {[
                      { value: 'company', label: '자사 보유', desc: '사업자 명의 차량', color: 'blue' },
                      { value: 'consignment', label: '지입 차량', desc: '타인 명의, 우리가 운영', color: 'amber' },
                      { value: 'leased_in', label: '임차 차량', desc: '외부에서 빌려온 차량', color: 'purple' },
                    ].map(opt => (
                      <button key={opt.value} onClick={() => handleChange('ownership_type', opt.value)}
                        className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${
                          car.ownership_type === opt.value
                            ? opt.color === 'blue' ? 'border-blue-500 bg-blue-50'
                              : opt.color === 'amber' ? 'border-amber-500 bg-amber-50'
                              : 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        <div className="font-bold text-sm">{opt.label}</div>
                        <div className="text-xs text-gray-500 mt-1">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 지입/임차인 경우 상세 정보 */}
                {(car.ownership_type === 'consignment' || car.ownership_type === 'leased_in') && (
                  <>
                    {/* 지입주 정보 */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">👤 {car.ownership_type === 'consignment' ? '지입주' : '임대인'} 정보</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">이름</label>
                          <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="홍길동"
                            value={car.owner_name || ''} onChange={e => handleChange('owner_name', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">연락처</label>
                          <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="010-0000-0000"
                            value={car.owner_phone || ''} onChange={e => handleChange('owner_phone', e.target.value)} />
                        </div>
                      </div>
                    </div>

                    {/* 정산 계좌 */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">🏦 정산 계좌</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">은행명</label>
                          <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="신한은행"
                            value={car.owner_bank || ''} onChange={e => handleChange('owner_bank', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">계좌번호</label>
                          <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="110-123-456789"
                            value={car.owner_account || ''} onChange={e => handleChange('owner_account', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">예금주</label>
                          <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="홍길동"
                            value={car.owner_account_holder || ''} onChange={e => handleChange('owner_account_holder', e.target.value)} />
                        </div>
                      </div>
                    </div>

                    {/* 계약 조건 */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">📝 계약 조건</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">월 {car.ownership_type === 'consignment' ? '지입료' : '임차료'}</label>
                          <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                            value={car.consignment_fee || ''} onChange={e => handleChange('consignment_fee', Number(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">보험 주체</label>
                          <select className="w-full border rounded-lg p-2.5 text-sm"
                            value={car.insurance_by || 'company'} onChange={e => handleChange('insurance_by', e.target.value)}>
                            <option value="company">우리 회사</option>
                            <option value="owner">{car.ownership_type === 'consignment' ? '지입주' : '임대인'} 본인</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">계약 시작일</label>
                          <input type="date" className="w-full border rounded-lg p-2.5 text-sm"
                            value={car.consignment_start || ''} onChange={e => handleChange('consignment_start', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">계약 종료일</label>
                          <input type="date" className="w-full border rounded-lg p-2.5 text-sm"
                            value={car.consignment_end || ''} onChange={e => handleChange('consignment_end', e.target.value)} />
                          {car.consignment_end && new Date(car.consignment_end) < new Date() && (
                            <p className="text-xs text-red-500 mt-1 font-bold">⚠️ 계약이 만료되었습니다</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 계약서 첨부 + 메모 */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">📎 계약서 및 메모</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">계약서 파일 URL</label>
                          <div className="flex gap-2">
                            <input className="flex-1 border rounded-lg p-2.5 text-sm" placeholder="이미지 URL 입력"
                              value={car.consignment_contract_url || ''} onChange={e => handleChange('consignment_contract_url', e.target.value)} />
                            {car.consignment_contract_url && (
                              <a href={car.consignment_contract_url} target="_blank" rel="noopener noreferrer"
                                className="bg-steel-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-steel-700 whitespace-nowrap">열기</a>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">메모 / 특약사항</label>
                          <textarea className="w-full border rounded-lg p-2.5 text-sm" rows={3}
                            placeholder="특약사항, 정산 조건 등 참고 내용"
                            value={car.owner_memo || ''} onChange={e => handleChange('owner_memo', e.target.value)} />
                        </div>
                      </div>
                    </div>

                    {/* 저장 버튼 */}
                    <button onClick={handleUpdate} disabled={saving}
                      className="w-full bg-steel-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-steel-700 transition-colors disabled:opacity-50">
                      {saving ? '저장 중...' : '💾 지입 정보 저장'}
                    </button>
                  </>
                )}

                {(car.ownership_type === 'company' || !car.ownership_type) && (
                  <div className="text-center py-16 text-gray-400">
                    <div className="text-5xl mb-4">{car.ownership_type === 'company' ? '🏢' : '👆'}</div>
                    <p className="font-bold text-lg text-gray-500">
                      {car.ownership_type === 'company' ? '자사 보유 차량' : '소유 구분을 선택해주세요'}
                    </p>
                    <p className="text-sm mt-2">
                      {car.ownership_type === 'company'
                        ? '자사 명의로 등록된 차량은 별도 지입 정보가 필요하지 않습니다.'
                        : '위에서 자사 보유 / 지입 / 임차 중 하나를 선택하면 해당 정보를 입력할 수 있습니다.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 📈 투자 관리 탭 */}
            {activeTab === 'invest' && (
              <InvestInlineTab carId={carId!} />
            )}

            {/* 💰 [신규] 대출/금융 탭 */}
            {activeTab === 'finance' && (
              <div className="animate-fade-in space-y-8">
                {/* 1. 입력 폼 */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">➕ 금융/대출 정보 등록</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">금융사 (캐피탈)</label>
                      <input className="w-full border rounded-lg p-2 text-sm" placeholder="예: 현대캐피탈" value={newLoan.finance_name} onChange={e => setNewLoan({...newLoan, finance_name: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">구분</label>
                      <select className="w-full border rounded-lg p-2 text-sm" value={newLoan.type} onChange={e => setNewLoan({...newLoan, type: e.target.value})}>
                        <option>할부</option><option>리스</option><option>담보대출</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">대출 원금 (원)</label>
                      <input type="number" className="w-full border rounded-lg p-2 text-sm" placeholder="0" value={newLoan.total_amount} onChange={e => setNewLoan({...newLoan, total_amount: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">월 납입금 (원)</label>
                      <input type="number" className="w-full border rounded-lg p-2 text-sm" placeholder="0" value={newLoan.monthly_payment} onChange={e => setNewLoan({...newLoan, monthly_payment: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">매월 납입일 (일)</label>
                      <input type="number" className="w-full border rounded-lg p-2 text-sm" placeholder="예: 25" value={newLoan.payment_date} onChange={e => setNewLoan({...newLoan, payment_date: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">만기일</label>
                      <input type="date" className="w-full border rounded-lg p-2 text-sm" value={newLoan.end_date} onChange={e => setNewLoan({...newLoan, end_date: e.target.value})} />
                    </div>
                  </div>
                  <button onClick={handleAddLoan} className="w-full bg-steel-600 text-white py-3 rounded-xl font-bold hover:bg-steel-700 transition-colors">등록하기</button>
                </div>

                {/* 2. 목록 리스트 */}
                <div className="space-y-4">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">📋 등록된 금융 리스트 ({loans.length})</h3>
                  {loadingLoans ? <p className="text-center py-4 text-gray-400">로딩 중...</p> : (
                    loans.length === 0 ? (
                      <div className="text-center py-4 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-400">등록된 금융 정보가 없습니다.</div>
                    ) : (
                      loans.map((loan) => (
                        <div key={loan.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 hover:border-steel-200 transition-all group">
                          <div className="flex items-center gap-4 w-full">
                            <div className="w-12 h-12 rounded-full bg-steel-50 text-steel-600 flex items-center justify-center font-bold text-lg">￦</div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-800 text-lg">{loan.finance_name}</span>
                                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">{loan.type}</span>
                              </div>
                              <p className="text-sm text-gray-500 mt-1">
                                월 <span className="font-bold text-gray-900">{Number(loan.monthly_payment || 0).toLocaleString()}원</span> (매월 {loan.payment_date}일)
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6 w-full md:w-auto justify-end">
                             <div className="text-right">
                                <p className="text-xs text-gray-400">총 대출금</p>
                                <p className="font-bold text-gray-800">{Number(loan.total_amount || 0).toLocaleString()}원</p>
                             </div>
                             <button onClick={() => handleDeleteLoan(loan.id)} className="text-gray-300 hover:text-red-500 p-2">🗑️</button>
                          </div>
                        </div>
                      ))
                    )
                  )}
                </div>

                {/* 대출 관리 페이지로 이동 (허브 패턴) */}
                <button onClick={() => router.push('/loans')}
                  className="w-full bg-white text-amber-600 border-2 border-amber-200 py-3 rounded-xl font-bold hover:bg-amber-50 transition-all">
                  💰 대출 관리 페이지로 이동 →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
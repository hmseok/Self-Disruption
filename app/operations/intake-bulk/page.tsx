'use client'

/**
 * 배차·대차 엑셀 일괄 인테이크
 *  - 4개 fleet 시트(마춤카 / 빌려타 / 부가세(캐피탈) / 따봉) 통합 업로드
 *  - 클라이언트에서 XLSX 파싱 → 컬럼 자동 매핑 → 미리보기 → POST /api/operations/intake-bulk
 *  - Soft Ice Level 4 컨테이너 + Level 3 블루/그린 틴트
 */

import { useState, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'

type FleetGroup = '마춤카' | '빌려타' | '부가세(캐피탈)' | '따봉'

// fleet별 컬럼 매핑 (엑셀 헤더 → normalizedKey)
const HEADER_ALIASES: Record<string, string> = {
  // 우리 차량
  '차량번호': 'vehicle_car_number',
  '차종': 'vehicle_car_type',
  // 일정
  '출고일': 'dispatch_date',
  '반납일': 'return_date',
  '일자': 'dispatch_date',
  '입금일': 'deposit_date',
  // 사고 차량
  '사고차량번호': 'accident_car_number',
  '사고차종': 'accident_car_type',
  '고객차량번호': 'accident_car_number',
  '고객차종': 'accident_car_type',
  // 보험
  '보험사': 'insurance_company',
  '접수번호': 'receipt_no',
  // 담당자/고객
  '담당자 이름 / 연락처': 'handler_contact',
  '담당자 이름/ 연락처': 'handler_contact',
  '담당자 이름/연락처': 'handler_contact',
  '담당자이름/연락처': 'handler_contact',
  '담당': 'handler_contact',
  '고객명 / 연락처': 'customer_contact',
  '고객명/연락처': 'customer_contact',
  '고객 생년월일': 'customer_birth',
  // 지리/공장
  '배차주소': 'address',
  '입고공장': 'workshop',
  '차량위치': 'vehicle_location',
  // 과실/상태
  '과실율': 'fault_rate',
  '계약진행': 'contract_status',
  '청구완료': 'billing_status',
  '입금여부': 'payment_status',
  '지급율': 'payment_status',
  '입금액': 'deposit_amount',
  '오더': 'note',
  '요청': 'note',
  '비고': 'note',
}

// 시트명 → fleet_group 기본값 추론
function guessFleet(sheetName: string): FleetGroup | '' {
  const s = sheetName.trim()
  if (s.includes('마춤')) return '마춤카'
  if (s.includes('빌려')) return '빌려타'
  if (s.includes('부가세') || s.includes('캐피탈')) return '부가세(캐피탈)'
  if (s.includes('따봉')) return '따봉'
  return ''
}

// 헤더 행 자동탐지 (필드 매칭 수가 가장 많은 행)
function detectHeaderRow(rows: any[][]): number {
  let best = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] || []
    const score = row.reduce((acc, cell) => {
      if (!cell) return acc
      const key = String(cell).trim()
      return acc + (HEADER_ALIASES[key] ? 1 : 0)
    }, 0)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

function mapRow(headers: string[], row: any[]): Record<string, any> {
  const out: Record<string, any> = { raw: {} }
  headers.forEach((h, idx) => {
    if (!h) return
    const key = HEADER_ALIASES[String(h).trim()]
    const val = row[idx]
    if (val !== undefined && val !== null && val !== '') {
      out.raw[String(h).trim()] = val
      if (key) {
        // Date serial 감지: XLSX의 날짜 컬럼은 cellDates:true로 이미 Date 객체로 전달됨.
        if (val instanceof Date) {
          out[key] = val.toISOString()
        } else {
          out[key] = val
        }
      }
    }
  })
  return out
}

export default function IntakeBulkPage() {
  const [file, setFile] = useState<File | null>(null)
  const [sheets, setSheets] = useState<{ name: string; rows: number; headers: string[]; dataRowCount: number }[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [fleet, setFleet] = useState<FleetGroup | ''>('')
  const [preview, setPreview] = useState<any[]>([])
  const [dryResult, setDryResult] = useState<any>(null)
  const [runResult, setRunResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')
  const wbRef = useRef<XLSX.WorkBook | null>(null)
  const sheetRowsRef = useRef<Record<string, any[]>>({})

  async function onFileChange(f: File | null) {
    setFile(f)
    setSheets([])
    setSelectedSheet('')
    setFleet('')
    setPreview([])
    setDryResult(null)
    setRunResult(null)
    setError('')
    if (!f) return
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: true })
      wbRef.current = wb
      const meta: { name: string; rows: number; headers: string[]; dataRowCount: number }[] = []
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name]
        const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, defval: null })
        const headerIdx = detectHeaderRow(aoa)
        const headers = (aoa[headerIdx] || []).map((h) => (h ?? '').toString())
        const dataRows = aoa.slice(headerIdx + 1).filter((r) => r && r.some((c) => c !== null && c !== ''))
        const mapped = dataRows.map((r) => mapRow(headers, r))
        sheetRowsRef.current[name] = mapped
        meta.push({ name, rows: aoa.length, headers, dataRowCount: mapped.length })
      }
      setSheets(meta)
      // 자동 선택: 가장 많은 헤더를 인식한 시트
      const best = meta.slice().sort((a, b) => {
        const aScore = a.headers.filter((h) => HEADER_ALIASES[h.trim()]).length
        const bScore = b.headers.filter((h) => HEADER_ALIASES[h.trim()]).length
        return bScore - aScore
      })[0]
      if (best) {
        setSelectedSheet(best.name)
        setFleet(guessFleet(best.name) || '마춤카')
      }
    } catch (e: any) {
      setError(e.message || '엑셀 읽기 실패')
    }
  }

  const previewRows = useMemo(() => {
    if (!selectedSheet) return []
    return (sheetRowsRef.current[selectedSheet] || []).slice(0, 12)
  }, [selectedSheet])

  const totalRows = useMemo(() => {
    if (!selectedSheet) return 0
    return (sheetRowsRef.current[selectedSheet] || []).length
  }, [selectedSheet])

  async function callIntake(dry_run: boolean) {
    if (!selectedSheet || !fleet) {
      setError('시트와 fleet을 선택하세요')
      return
    }
    setBusy(true)
    setError('')
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
      const rows = sheetRowsRef.current[selectedSheet] || []
      const res = await fetch('/api/operations/intake-bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ fleet_group: fleet, dry_run, rows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      if (dry_run) setDryResult(json)
      else setRunResult(json)
    } catch (e: any) {
      setError(e.message || '요청 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/40 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">배차·대차 엑셀 일괄 인테이크</h1>
            <p className="text-sm text-slate-600 mt-1">
              마춤카 / 빌려타 / 부가세(캐피탈) / 따봉 시트를 업로드하면 <span className="font-semibold">fmi_vehicles + fmi_accidents + fmi_rentals</span>로 자동 인테이크됩니다.
            </p>
          </div>
          <a href="/operations" className="text-sm text-blue-600 hover:underline">← 운영 대시보드</a>
        </div>

        {/* 1. 파일 선택 */}
        <div className="rounded-2xl border border-black/[0.06] bg-white/72 backdrop-blur-xl p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => onFileChange(e.target.files?.[0] || null)}
              className="text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer"
            />
            {file && <span className="text-sm text-slate-600">{file.name} ({(file.size / 1024).toFixed(0)} KB)</span>}
          </div>
        </div>

        {/* 2. 시트/fleet 선택 */}
        {sheets.length > 0 && (
          <div className="rounded-2xl border border-blue-100/80 bg-white/60 backdrop-blur-xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-blue-700 mb-3">STEP 2 · 시트 선택 + Fleet 매핑</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-600">시트</label>
                <select
                  value={selectedSheet}
                  onChange={(e) => {
                    setSelectedSheet(e.target.value)
                    setFleet(guessFleet(e.target.value) || fleet || '마춤카')
                    setDryResult(null)
                    setRunResult(null)
                  }}
                  className="mt-1 w-full rounded-lg border border-black/[0.06] bg-white/40 px-3 py-2 text-sm"
                >
                  <option value="">-- 선택 --</option>
                  {sheets.map((s) => {
                    const matched = s.headers.filter((h) => HEADER_ALIASES[h.trim()]).length
                    return (
                      <option key={s.name} value={s.name}>
                        {s.name} · {s.dataRowCount}행 · 매핑 {matched}/{s.headers.length}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600">Fleet (fmi_vehicles.rental_company)</label>
                <select
                  value={fleet}
                  onChange={(e) => setFleet(e.target.value as FleetGroup)}
                  className="mt-1 w-full rounded-lg border border-black/[0.06] bg-white/40 px-3 py-2 text-sm"
                >
                  <option value="">-- 선택 --</option>
                  <option value="마춤카">마춤카</option>
                  <option value="빌려타">빌려타</option>
                  <option value="부가세(캐피탈)">부가세(캐피탈)</option>
                  <option value="따봉">따봉</option>
                </select>
              </div>
            </div>
            {selectedSheet && (
              <div className="mt-3 text-xs text-slate-500">
                시트 <span className="font-semibold text-slate-700">{selectedSheet}</span> · {totalRows}행 · 헤더 인식:{' '}
                {sheets.find((s) => s.name === selectedSheet)?.headers.filter((h) => HEADER_ALIASES[h.trim()]).join(', ') || '(없음)'}
              </div>
            )}
          </div>
        )}

        {/* 3. 프리뷰 */}
        {previewRows.length > 0 && (
          <div className="rounded-2xl border border-green-100/80 bg-white/60 backdrop-blur-xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-emerald-700 mb-3">STEP 3 · 프리뷰 (상위 12행)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-black/[0.06] text-left text-slate-500">
                    <th className="py-2 px-2">#</th>
                    <th className="py-2 px-2">대차차량</th>
                    <th className="py-2 px-2">사고차량</th>
                    <th className="py-2 px-2">출고일</th>
                    <th className="py-2 px-2">반납일</th>
                    <th className="py-2 px-2">보험사</th>
                    <th className="py-2 px-2">담당자</th>
                    <th className="py-2 px-2">고객</th>
                    <th className="py-2 px-2">공장</th>
                    <th className="py-2 px-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-b border-black/[0.04]">
                      <td className="py-1.5 px-2 text-slate-400">{i + 1}</td>
                      <td className="py-1.5 px-2 font-mono text-[11px]">{r.vehicle_car_number || '-'}</td>
                      <td className="py-1.5 px-2 font-mono text-[11px]">{r.accident_car_number || '-'}</td>
                      <td className="py-1.5 px-2">{r.dispatch_date ? String(r.dispatch_date).slice(0, 10) : '-'}</td>
                      <td className="py-1.5 px-2">{r.return_date ? String(r.return_date).slice(0, 10) : '-'}</td>
                      <td className="py-1.5 px-2">{r.insurance_company || '-'}</td>
                      <td className="py-1.5 px-2 truncate max-w-[120px]">{r.handler_contact || '-'}</td>
                      <td className="py-1.5 px-2 truncate max-w-[120px]">{r.customer_contact || '-'}</td>
                      <td className="py-1.5 px-2 truncate max-w-[100px]">{r.workshop || '-'}</td>
                      <td className="py-1.5 px-2">
                        <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded">
                          {r.billing_status || '-'}/{r.payment_status || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. 실행 */}
        {selectedSheet && fleet && (
          <div className="rounded-2xl border border-black/[0.06] bg-white/72 backdrop-blur-xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-slate-700 mb-3">STEP 4 · 실행</div>
            <div className="flex gap-3 items-center flex-wrap">
              <button
                onClick={() => callIntake(true)}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm disabled:opacity-50"
              >
                {busy ? '처리중…' : '🧪 Dry Run (검증만)'}
              </button>
              <button
                onClick={() => callIntake(false)}
                disabled={busy || !dryResult}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50"
              >
                {busy ? '저장중…' : '💾 실제 저장'}
              </button>
              {error && <span className="text-sm text-red-600">⚠ {error}</span>}
            </div>

            {(dryResult || runResult) && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {dryResult && (
                  <div className="rounded-xl bg-slate-50 p-4 text-xs">
                    <div className="font-semibold text-slate-700 mb-2">Dry Run</div>
                    <div>총 입력: {dryResult.input_count}</div>
                    <div>정규화 OK: {dryResult.normalized?.length || 0}</div>
                    <div>에러: {dryResult.errors?.length || 0}</div>
                  </div>
                )}
                {runResult && (
                  <div className="rounded-xl bg-emerald-50 p-4 text-xs">
                    <div className="font-semibold text-emerald-700 mb-2">실제 저장 결과</div>
                    <div>생성 차량: {runResult.created?.vehicles || 0}</div>
                    <div>생성 사고: {runResult.created?.accidents || 0}</div>
                    <div>생성 대차: {runResult.created?.rentals || 0}</div>
                    <div>업데이트 차량: {runResult.updated?.vehicles || 0}</div>
                    <div>업데이트 사고: {runResult.updated?.accidents || 0}</div>
                    <div>스킵: {runResult.skipped?.length || 0}</div>
                    <div>에러: {runResult.errors?.length || 0}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

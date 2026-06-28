'use client'

import { useState, useRef } from 'react'
import { getAuthHeader } from '@/app/utils/auth-client'

// ═══════════════════════════════════════════════════════════════════
// DispatchImportModal — 배차 엑셀(대차 현황) 정규화 import (PR-V2)
//   업로드 → 미리보기(파싱·정제 결과) → 적용(fill-only upsert)
//   안전: 기존 값 절대 덮어쓰기 X — 빈 값/'(미상)' 만 채움
// ═══════════════════════════════════════════════════════════════════

interface Props { open: boolean; onClose: () => void; onApplied?: () => void }

export default function DispatchImportModal({ open, onClose, onApplied }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<any | null>(null)
  const [result, setResult] = useState<any | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!open) return null

  const run = async (apply: boolean) => {
    if (!file) { setErr('엑셀 파일을 선택하세요'); return }
    setBusy(true); setErr(null); if (apply) setResult(null)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('apply', apply ? '1' : '0')
      const headers = await getAuthHeader()
      const res = await fetch('/api/operations/dispatch-import', {
        method: 'POST', headers, body: fd,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '실패')
      if (apply) { setResult(json); onApplied?.() } else { setPreview(json); setResult(null) }
    } catch (e: any) { setErr(e?.message || '오류') } finally { setBusy(false) }
  }

  const label = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 } as const

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(680px, 96vw)', maxHeight: '88vh', overflowY: 'auto', padding: 20, boxShadow: '0 24px 60px rgba(15,23,42,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f2440' }}>📥 배차 엑셀 가져오기 (대차 현황)</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 14, background: 'rgba(59,110,181,0.06)', padding: 11, borderRadius: 9 }}>
          「빌려타」 시트를 자동 정제(차량번호·차종·고객명·연락처·담당자·생년·자차 분리)하고, 보험사는 부가세·마춤카 시트에서 사고차량번호로 채웁니다.
          <b style={{ color: '#1d4ed8' }}> 기존 데이터는 덮어쓰지 않고, 비었거나 '(미상)' 인 값만 채웁니다.</b>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>엑셀 파일 (.xlsx)</label>
          <input ref={fileRef} type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setResult(null); setErr(null) }} style={{ fontSize: 13 }} />
        </div>

        {err && <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 12 }}>⚠️ {err}</div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => run(false)} disabled={busy || !file} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: busy || !file ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, color: '#475569', opacity: busy || !file ? 0.5 : 1 }}>
            {busy ? '처리 중…' : '🔍 미리보기'}
          </button>
          {preview && (
            <button onClick={() => run(true)} disabled={busy} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800, opacity: busy ? 0.5 : 1 }}>
              ✅ 적용 (채우기)
            </button>
          )}
        </div>

        {preview && (
          <div style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0f2440', marginBottom: 8 }}>미리보기 — 정상 {preview.total}건 / 제외 {preview.skipped}건 / 보험사 매칭 {preview.insurerHits}건</div>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead><tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: 4 }}>우리차</th><th style={{ padding: 4 }}>사고차</th><th style={{ padding: 4 }}>고객</th><th style={{ padding: 4 }}>담당</th><th style={{ padding: 4 }}>보험사</th>
                </tr></thead>
                <tbody>
                  {(preview.sample || []).map((r: any, i: number) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                      <td style={{ padding: 4 }}>{r.vehicle_car_number} {r.vehicle_car_type}</td>
                      <td style={{ padding: 4 }}>{r.customer_car_number}{r.self_vehicle_yn ? '(자차)' : ''}</td>
                      <td style={{ padding: 4 }}>{r.customer_name} {r.customer_phone}</td>
                      <td style={{ padding: 4 }}>{r.adjuster_name} {r.adjuster_phone}</td>
                      <td style={{ padding: 4, color: r.insurance_company ? '#1d4ed8' : '#cbd5e1' }}>{r.insurance_company || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div style={{ border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(236,253,245,0.6)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46', marginBottom: 4 }}>✅ 적용 완료</div>
            <div style={{ fontSize: 12, color: '#047857' }}>
              신규 {result.inserted}건 · 보정(채움) {result.updated}건 · 변경없음 {result.unchanged}건{result.errors ? ` · 오류 ${result.errors}건` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

// ═══════════════════════════════════════════════════════════════
// 실데이터 대조 패널 — 기준표 값 ↔ 우리 실측값 비교
// 2026-07-30 사용자 문제 제기: "기준표가 실데이터가 아니라 거리감이 있다"
// 데이터: /api/lt-quotes/calibration (실계약·실보험·실할부·실정비 읽기 전용 집계)
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { COLORS } from '@/app/utils/ui-tokens'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type Stat = { n: number; median: number | null; mean: number | null; p25: number | null; p75: number | null }
type Calibration = {
  measured: {
    activeRentals: number
    rentalsWithAcqCost: number
    rentToPriceRatioPct: Stat
    monthlyRent: Stat
    insuranceMonthly: Stat
    financeMonthly: Stat
    maintenanceMonthly: Stat
  }
  reference: Record<string, unknown> | null
}

const won = (n: number | null) => n != null ? Math.round(n).toLocaleString('ko-KR') : '—'

export default function CalibrationPanel() {
  const [data, setData] = useState<Calibration | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const headers = await getAuthHeader()
        const res = await fetch('/api/lt-quotes/calibration', { headers })
        const json = await res.json().catch(() => ({}))
        if (!cancelled) {
          if (json?.data) setData(json.data)
          else setErr(json?.error || '실측 데이터를 불러오지 못했습니다')
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || '오류')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const m = data?.measured

  const rows: Array<{ label: string; value: string; range: string; sample: number; hint: string }> = m ? [
    {
      label: '월렌트료 / 취득원가 비율',
      value: m.rentToPriceRatioPct.median != null ? `${m.rentToPriceRatioPct.median}%` : '표본 없음',
      range: m.rentToPriceRatioPct.p25 != null ? `${m.rentToPriceRatioPct.p25}% ~ ${m.rentToPriceRatioPct.p75}%` : '—',
      sample: m.rentToPriceRatioPct.n,
      hint: '원가기준 탭의 시장 비율과 비교',
    },
    {
      label: '실계약 월렌트료',
      value: m.monthlyRent.median != null ? `${won(m.monthlyRent.median)}원` : '표본 없음',
      range: m.monthlyRent.p25 != null ? `${won(m.monthlyRent.p25)} ~ ${won(m.monthlyRent.p75)}원` : '—',
      sample: m.monthlyRent.n,
      hint: '운영중 장기계약 기준',
    },
    {
      label: '보험 월액 (차량 1대당)',
      value: m.insuranceMonthly.median != null ? `${won(m.insuranceMonthly.median)}원` : '표본 없음',
      range: m.insuranceMonthly.p25 != null ? `${won(m.insuranceMonthly.p25)} ~ ${won(m.insuranceMonthly.p75)}원` : '—',
      sample: m.insuranceMonthly.n,
      hint: '보험료 탭 기준값과 대조',
    },
    {
      label: '할부 월 납입액',
      value: m.financeMonthly.median != null ? `${won(m.financeMonthly.median)}원` : '표본 없음',
      range: m.financeMonthly.p25 != null ? `${won(m.financeMonthly.p25)} ~ ${won(m.financeMonthly.p75)}원` : '—',
      sample: m.financeMonthly.n,
      hint: '금융금리 탭 요율과 대조',
    },
    {
      label: '정비비 월평균 (차량별, 최근 12개월)',
      value: m.maintenanceMonthly.median != null ? `${won(m.maintenanceMonthly.median)}원` : '표본 없음',
      range: m.maintenanceMonthly.p25 != null ? `${won(m.maintenanceMonthly.p25)} ~ ${won(m.maintenanceMonthly.p75)}원` : '—',
      sample: m.maintenanceMonthly.n,
      hint: '정비비 탭 기준값과 대조',
    },
  ] : []

  return (
    <div style={{
      background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12,
      boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden', marginBottom: 16,
    }}>
      <div style={{ padding: '13px 16px', borderBottom: `1px solid ${COLORS.borderFaint}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 14 }}>실데이터 대조</b>
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>
          — 우리 실계약·실지출에서 뽑은 값입니다. 기준표가 이 범위에서 벗어나 있으면 해당 탭에서 수정하세요.
        </span>
      </div>

      {loading && <div style={{ padding: '20px 16px', fontSize: 13, color: COLORS.textMuted }}>실측 데이터 집계 중...</div>}
      {err && !loading && <div style={{ padding: '14px 16px', fontSize: 12.5, color: COLORS.danger }}>{err}</div>}

      {!loading && m && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['항목', '실측 중앙값', '실측 범위 (25~75%)', '표본', '대조할 곳'].map((h, i) => (
                  <th key={h} style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600, textAlign: i === 1 || i === 2 ? 'right' : 'left', padding: '9px 14px', borderBottom: `1px solid ${COLORS.borderFaint}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${COLORS.borderFaint}` : 'none' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{r.label}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13.5, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r.value}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12.5, color: COLORS.textSecondary, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r.range}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {r.sample > 0
                      ? <span style={{ color: r.sample < 5 ? COLORS.warning : COLORS.textSecondary }}>{r.sample}건{r.sample < 5 ? ' · 표본 적음' : ''}</span>
                      : <span style={{ color: COLORS.danger }}>없음</span>}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{r.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && m && m.activeRentals > 0 && m.rentalsWithAcqCost === 0 && (
        <div style={{ padding: '10px 16px', fontSize: 12.5, color: COLORS.warning, background: COLORS.bgAmber, borderTop: `1px solid ${COLORS.borderAmber}` }}>
          운영중 계약 {m.activeRentals}건 중 차량 취득원가가 연결된 건이 없어 비율을 계산하지 못했습니다 — 차량 등록의 취득원가를 채우면 정확해집니다.
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

// ═══════════════════════════════════════════════════════════════════
// /public/lt-quote/[token]
//   장기렌트 견적 V3 공개 페이지 (PR-Q2-4)
//
// - share_token 으로 진입, 인증 없음
// - views++ + last_viewed_at=NOW (서버 자동)
// - PDF: window.print() + @media print CSS
// - 민감 필드 노출 X (owner_id, customer_phone, 매입가/원가 등)
// ═══════════════════════════════════════════════════════════════════

type QuoteData = {
  id: string
  quote_no: string | null
  status: string
  contract_type: string
  rent_type: string
  customer_name: string
  customer_company: string | null
  vehicle_car_number: string | null
  vehicle_brand: string | null
  vehicle_model: string | null
  vehicle_trim: string | null
  vehicle_year: number | null
  vehicle_fuel: string | null
  vehicle_engine_cc: number | null
  vehicle_color_ext: string | null
  vehicle_color_int: string | null
  vehicle_options_text: string | null
  start_date: string | null
  months: number | null
  end_date: string | null
  annual_km: number | null
  residual_rate: number | null
  monthly_fee: number | null
  deposit: number | null
  upfront_months: number | null
  delivery_fee: number | null
  insurance_option: string | null
  sent_at: string | null
  valid_until: string | null
  owner_name: string | null
  memo: string | null
  created_at: string
}

function fmtWon(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${Number(n).toLocaleString('ko-KR')}원`
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return '-'
  return String(s).slice(0, 10)
}
function fmtFuel(f: string | null): string {
  if (!f) return '-'
  const m: Record<string, string> = { gasoline: '가솔린', diesel: '디젤', hybrid: '하이브리드', ev: '전기' }
  return m[f] || f
}
function fmtRentType(t: string | null): string {
  if (!t) return '-'
  return t === 'buyout' ? '인수형' : '반납형'
}

export default function PublicLtQuotePage() {
  const params = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const token = params?.token
  const printMode = searchParams?.get('print') === '1'

  const [data, setData] = useState<QuoteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/public/lt-quote/${token}`)
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok || json?.error) {
          setErr(json?.error || '견적을 찾을 수 없습니다')
        } else {
          setData(json.data as QuoteData)
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error)?.message || 'fetch 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (printMode && data && !loading) {
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [printMode, data, loading])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>견적을 불러오는 중…</div>
  }
  if (err || !data) {
    return (
      <div style={{ padding: 40, maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#0f2440', marginBottom: 6 }}>견적을 찾을 수 없습니다</h1>
        <div style={{ fontSize: 13, color: '#64748b' }}>{err || '링크가 만료됐거나 잘못된 주소입니다.'}</div>
      </div>
    )
  }

  const isExpired = data.valid_until && new Date(data.valid_until) < new Date()
  const isConverted = data.status === 'converted'
  const isRejected = data.status === 'rejected'

  const totalMonthsFee = (data.monthly_fee || 0) * (data.months || 0)
  const upfront = (data.monthly_fee || 0) * (data.upfront_months || 0)
  const initialPayment = upfront + (data.deposit || 0) + (data.delivery_fee || 0)

  const vehicleDesc = [data.vehicle_brand, data.vehicle_model, data.vehicle_trim].filter(Boolean).join(' ')
  const colorDesc = [data.vehicle_color_ext, data.vehicle_color_int && `내장 ${data.vehicle_color_int}`].filter(Boolean).join(' / ')

  return (
    <>
      <style>{`
        :root { color-scheme: light; }
        body { background: linear-gradient(135deg, #f1f5fb 0%, #e2eaf5 100%); }
        @media print {
          body { background: #fff !important; }
          .ltq-no-print { display: none !important; }
          .ltq-sheet { box-shadow: none !important; border: none !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
      <div style={{ minHeight: '100vh', padding: '40px 20px' }}>
        {/* 상단 액션 */}
        <div className="ltq-no-print" style={{
          maxWidth: 760, margin: '0 auto 16px', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center',
        }}>
          <button onClick={() => window.print()}
            style={{ padding: '10px 18px', background: '#3b6eb5', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
            🖨 PDF 저장 / 인쇄
          </button>
        </div>

        {/* A4 시트 */}
        <div className="ltq-sheet" style={{
          maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 14,
          boxShadow: '0 14px 44px rgba(15,23,42,0.12)', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)',
        }}>
          {/* 헤더 */}
          <div style={{ padding: '28px 32px 18px', borderBottom: '2px solid #3b6eb5', background: 'linear-gradient(135deg, #ebf1f9 0%, #f4f8fd 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#3b6eb5', letterSpacing: 1.2 }}>LONG-TERM RENTAL QUOTE</div>
                <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f2440', margin: '4px 0 6px' }}>장기렌트 견적서</h1>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  견적번호: <span style={{ fontWeight: 700, color: '#1e293b' }}>{data.quote_no || `LTQ-${data.id.slice(0, 8)}`}</span>
                  {' · '} 발행일: <span style={{ fontWeight: 700, color: '#1e293b' }}>{fmtDate(data.sent_at || data.created_at)}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#0f2440' }}>주식회사 에프엠아이</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>FMI Corporation</div>
              </div>
            </div>
          </div>

          {/* 상태 배너 */}
          {(isExpired || isConverted || isRejected) && (
            <div style={{
              padding: '12px 32px', fontSize: 12, fontWeight: 700,
              background: isConverted ? '#ede9fe' : isExpired ? '#fef3c7' : '#fee2e2',
              color: isConverted ? '#5b21b6' : isExpired ? '#b45309' : '#991b1b',
              borderBottom: '1px solid rgba(0,0,0,0.06)',
            }}>
              {isConverted ? '🔗 본 견적은 계약 전환됐습니다.' : isExpired ? '⏰ 본 견적의 유효기간이 지났습니다. 갱신을 요청해주세요.' : '✗ 본 견적은 거부 처리됐습니다.'}
            </div>
          )}

          {/* 본문 */}
          <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 고객 */}
            <section>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#3b6eb5', marginBottom: 8, letterSpacing: 0.6 }}>고객 정보</div>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={cellLabel}>고객명</td>
                    <td style={cellValue}><strong>{data.customer_name}</strong></td>
                    <td style={cellLabel}>소속</td>
                    <td style={cellValue}>{data.customer_company || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* 차량 */}
            <section>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#3b6eb5', marginBottom: 8, letterSpacing: 0.6 }}>
                차량 정보 · {data.contract_type === '신차구입' ? '🆕 신차 구입 계약' : '🚗 기존 차량 계약'} · {fmtRentType(data.rent_type)}
              </div>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <tbody>
                  {data.vehicle_car_number ? (
                    <tr>
                      <td style={cellLabel}>차량번호</td>
                      <td style={cellValue}><strong>{data.vehicle_car_number}</strong></td>
                      <td style={cellLabel}>차종</td>
                      <td style={cellValue}>{vehicleDesc || '-'}</td>
                    </tr>
                  ) : (
                    <tr>
                      <td style={cellLabel}>예정 차종</td>
                      <td style={{ ...cellValue }} colSpan={3}><strong>{vehicleDesc || '-'}</strong></td>
                    </tr>
                  )}
                  <tr>
                    <td style={cellLabel}>연식 / 연료</td>
                    <td style={cellValue}>{data.vehicle_year ? `${data.vehicle_year}년` : '-'} / {fmtFuel(data.vehicle_fuel)}{data.vehicle_engine_cc ? ` ${data.vehicle_engine_cc}cc` : ''}</td>
                    <td style={cellLabel}>색상</td>
                    <td style={cellValue}>{colorDesc || '-'}</td>
                  </tr>
                  {data.vehicle_options_text && (
                    <tr>
                      <td style={cellLabel}>옵션</td>
                      <td style={{ ...cellValue }} colSpan={3}>{data.vehicle_options_text}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            {/* 계약 조건 */}
            <section>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#3b6eb5', marginBottom: 8, letterSpacing: 0.6 }}>계약 조건</div>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={cellLabel}>계약 시작일</td>
                    <td style={cellValue}>{fmtDate(data.start_date)}</td>
                    <td style={cellLabel}>계약 기간</td>
                    <td style={cellValue}>{data.months ? `${data.months}개월` : '-'}</td>
                  </tr>
                  <tr>
                    <td style={cellLabel}>만기일</td>
                    <td style={cellValue}>{fmtDate(data.end_date)}</td>
                    <td style={cellLabel}>연 주행거리</td>
                    <td style={cellValue}>{data.annual_km ? `${data.annual_km.toLocaleString('ko-KR')} km` : '-'}</td>
                  </tr>
                  {data.insurance_option && (
                    <tr>
                      <td style={cellLabel}>보험 옵션</td>
                      <td style={{ ...cellValue }} colSpan={3}>{data.insurance_option}</td>
                    </tr>
                  )}
                  {data.residual_rate != null && data.rent_type === 'buyout' && (
                    <tr>
                      <td style={cellLabel}>인수 잔존가율</td>
                      <td style={cellValue}>{data.residual_rate}%</td>
                      <td style={cellLabel}></td>
                      <td style={cellValue}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            {/* 금액 (강조) */}
            <section style={{ border: '2px solid #3b6eb5', borderRadius: 10, padding: 18, background: 'linear-gradient(135deg, #f4f8fd 0%, #ebf1f9 100%)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#3b6eb5', marginBottom: 10, letterSpacing: 0.6 }}>💰 금액 (VAT 포함)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>월 렌트료</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#0f2440', marginTop: 2 }}>{fmtWon(data.monthly_fee)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>총 렌트료 ({data.months || 0}개월)</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#3b6eb5', marginTop: 2 }}>{fmtWon(totalMonthsFee || null)}</div>
                </div>
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed rgba(0,0,0,0.1)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
                <div>
                  <div style={{ color: '#64748b', fontWeight: 600, fontSize: 11 }}>보증금</div>
                  <div style={{ fontWeight: 700, color: '#0f2440', marginTop: 2 }}>{fmtWon(data.deposit)}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontWeight: 600, fontSize: 11 }}>선납 {data.upfront_months || 0}개월</div>
                  <div style={{ fontWeight: 700, color: '#0f2440', marginTop: 2 }}>{fmtWon(upfront || null)}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontWeight: 600, fontSize: 11 }}>인도비</div>
                  <div style={{ fontWeight: 700, color: '#0f2440', marginTop: 2 }}>{fmtWon(data.delivery_fee)}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontWeight: 600, fontSize: 11 }}>초도 납입 합계</div>
                  <div style={{ fontWeight: 800, color: '#991b1b', marginTop: 2 }}>{fmtWon(initialPayment || null)}</div>
                </div>
              </div>
            </section>

            {data.memo && (
              <section>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#3b6eb5', marginBottom: 8, letterSpacing: 0.6 }}>특이사항</div>
                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, padding: 10, background: '#f8fafc', borderRadius: 8, whiteSpace: 'pre-wrap' }}>{data.memo}</div>
              </section>
            )}

            {/* 푸터 */}
            <section style={{ marginTop: 4, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
                <div>· 본 견적의 유효기간은 <strong style={{ color: '#0f2440' }}>{fmtDate(data.valid_until) || '별도 협의'}</strong> 까지입니다.</div>
                <div>· 표시 금액은 VAT 가 포함된 단일가 입니다.</div>
                <div>· 차량 출고 일정·옵션·금융 조건에 따라 최종 금액이 변동될 수 있습니다.</div>
              </div>
              {data.owner_name && (
                <div style={{ textAlign: 'right', fontSize: 12 }}>
                  <div style={{ color: '#64748b' }}>담당</div>
                  <div style={{ fontWeight: 800, color: '#0f2440', fontSize: 14, marginTop: 2 }}>{data.owner_name}</div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  )
}

const cellLabel: React.CSSProperties = {
  width: '15%', padding: '8px 10px', background: '#f8fafc', fontSize: 11, fontWeight: 700,
  color: '#64748b', border: '1px solid #e2e8f0', verticalAlign: 'middle',
}
const cellValue: React.CSSProperties = {
  width: '35%', padding: '8px 12px', fontSize: 13, color: '#0f2440',
  border: '1px solid #e2e8f0', verticalAlign: 'middle',
}

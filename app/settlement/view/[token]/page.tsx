'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const BRAND_COLOR = '#2d5fa8'

type SettlementItem = {
  type: 'jiip' | 'invest'
  monthLabel: string
  amount: number
  detail: string
  carNumber?: string
  breakdown?: {
    revenue?: number
    expense?: number
    adminFee?: number
    netProfit?: number
    distributable?: number
    shareRatio?: number
    investorPayout?: number
  }
}

type SettlementShare = {
  id: string
  token: string
  recipient_name: string
  settlement_month: string
  payment_date?: string
  total_amount: number
  items: SettlementItem[]
  breakdown?: Record<string, any>
  message?: string
  created_at: string
  expires_at: string
  viewed_at?: string
  view_count: number
  is_first_view: boolean
  company?: {
    id: string
    name: string
    business_number?: string
    address?: string
    phone?: string
    email?: string
    logo_url?: string
  }
}

type PageState = 'loading' | 'valid' | 'expired' | 'error'

export default function SettlementViewPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [data, setData] = useState<SettlementShare | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // 데이터 로드
  useEffect(() => {
    if (!token) return

    fetch(`/api/settlement/share/${token}`)
      .then(async (res) => {
        const responseData = await res.json()
        if (responseData.code === 'EXPIRED' || responseData.expires_at) {
          if (new Date(responseData.expires_at) < new Date()) {
            setState('expired')
            setErrorMsg(responseData.error || '만료된 링크입니다.')
            return
          }
        }
        if (responseData.error) {
          if (res.status === 410) {
            setState('expired')
          } else {
            setState('error')
          }
          setErrorMsg(responseData.error)
        } else {
          setData(responseData)
          setState('valid')
        }
      })
      .catch(() => {
        setState('error')
        setErrorMsg('서버에 연결할 수 없습니다.')
      })
  }, [token])

  if (state === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', color: BRAND_COLOR, marginBottom: '10px' }}>로드 중...</div>
        </div>
      </div>
    )
  }

  if (state === 'expired' || state === 'error') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <h1 style={{ color: '#333', marginBottom: '10px' }}>
            {state === 'expired' ? '링크가 만료되었습니다.' : '오류가 발생했습니다.'}
          </h1>
          <p style={{ color: '#666', marginBottom: '20px' }}>{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              backgroundColor: BRAND_COLOR,
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  if (state !== 'valid' || !data) {
    return null
  }

  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return '0'
    return Math.round(amount).toLocaleString('ko-KR')
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return dateStr
    }
  }

  // 월별로 항목 그룹화
  const itemsByMonth = data.items.reduce((acc: Record<string, SettlementItem[]>, item) => {
    const month = item.monthLabel
    if (!acc[month]) acc[month] = []
    acc[month].push(item)
    return acc
  }, {})

  const months = Object.keys(itemsByMonth).sort()

  return (
    <div style={{ fontFamily: '"Noto Sans KR", sans-serif', backgroundColor: '#f5f6f8', minHeight: '100vh', paddingBottom: '40px' }}>
      {/* 헤더 */}
      <div style={{ backgroundColor: BRAND_COLOR, color: 'white', padding: '30px 20px', textAlign: 'center' }}>
        {data.company?.logo_url && (
          <img src={data.company.logo_url} alt="로고" style={{ maxHeight: '50px', marginBottom: '15px' }} />
        )}
        <h1 style={{ margin: '0 0 5px 0', fontSize: '28px', fontWeight: 'bold' }}>
          {data.company?.name || 'Self-Disruption'}
        </h1>
        <p style={{ margin: '0', fontSize: '14px', opacity: 0.9 }}>정산 명세서</p>
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
        {/* 수신자 정보 */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '5px' }}>수신인</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>{data.recipient_name}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '5px' }}>정산 기준월</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>{data.settlement_month}</div>
            </div>
          </div>
        </div>

        {/* 정산 항목 (월별) */}
        {months.map((month) => (
          <div key={month} style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: BRAND_COLOR, marginBottom: '15px', paddingBottom: '10px', borderBottom: `2px solid ${BRAND_COLOR}` }}>
              {month}
            </h2>

            {itemsByMonth[month].map((item, idx) => {
              const typeLabel = item.type === 'jiip' ? '지입 수익배분' : '투자이자'
              const hasBreakdown = item.breakdown && Object.keys(item.breakdown).length > 0

              return (
                <div key={idx} style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  {/* 항목 헤더 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div>
                      <span
                        style={{
                          display: 'inline-block',
                          backgroundColor: item.type === 'jiip' ? '#e8f0fe' : '#f0e8fe',
                          color: item.type === 'jiip' ? '#1a73e8' : '#7c3aed',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          marginRight: '10px',
                        }}
                      >
                        {typeLabel}
                      </span>
                      {item.carNumber && (
                        <span style={{ fontSize: '13px', color: '#666' }}>
                          {item.carNumber}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: BRAND_COLOR }}>
                      {formatCurrency(item.amount)}원
                    </div>
                  </div>

                  {/* 상세 정보 */}
                  <div style={{ fontSize: '13px', color: '#666', marginBottom: hasBreakdown ? '15px' : '0' }}>
                    {item.detail}
                  </div>

                  {/* 지입 상세 브레이크다운 */}
                  {hasBreakdown && (
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '6px', padding: '15px', marginTop: '15px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <tbody>
                          {item.breakdown.revenue !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>수입 합계</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#333' }}>
                                {formatCurrency(item.breakdown.revenue)}원
                              </td>
                            </tr>
                          )}
                          {item.breakdown.expense !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>비용 합계</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#333' }}>
                                {formatCurrency(item.breakdown.expense)}원
                              </td>
                            </tr>
                          )}
                          {item.breakdown.netProfit !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>순수익</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#333' }}>
                                {formatCurrency(item.breakdown.netProfit)}원
                              </td>
                            </tr>
                          )}
                          {item.breakdown.adminFee !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>지입비</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#333' }}>
                                {formatCurrency(item.breakdown.adminFee)}원
                              </td>
                            </tr>
                          )}
                          {item.breakdown.distributable !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>배분대상</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#333' }}>
                                {formatCurrency(item.breakdown.distributable)}원
                              </td>
                            </tr>
                          )}
                          {item.breakdown.shareRatio !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>배분율</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#333' }}>
                                {item.breakdown.shareRatio.toFixed(2)}%
                              </td>
                            </tr>
                          )}
                          {item.breakdown.investorPayout !== undefined && (
                            <tr>
                              <td style={{ padding: '8px 0', color: '#666' }}>배분금</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: BRAND_COLOR, fontSize: '14px' }}>
                                {formatCurrency(item.breakdown.investorPayout)}원
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {/* 총액 요약 */}
        <div style={{ backgroundColor: BRAND_COLOR, color: 'white', borderRadius: '8px', padding: '25px', textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', marginBottom: '10px', opacity: 0.9 }}>정산 총액</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold' }}>
            {formatCurrency(data.total_amount)}원
          </div>
        </div>

        {/* 지급 예정일 */}
        {data.payment_date && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>지급예정일</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>{data.payment_date}</div>
          </div>
        )}

        {/* 메시지 */}
        {data.message && (
          <div style={{ backgroundColor: '#fffbeb', borderRadius: '8px', padding: '20px', marginBottom: '20px', borderLeft: `4px solid #f59e0b` }}>
            <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '8px', fontWeight: 'bold' }}>발송자 메시지</div>
            <div style={{ fontSize: '14px', color: '#333', whiteSpace: 'pre-wrap' }}>{data.message}</div>
          </div>
        )}

        {/* 회사 정보 */}
        <div style={{ backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '20px', marginTop: '30px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>회사 정보</h3>
          <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.8' }}>
            {data.company?.name && (
              <div>
                <strong style={{ color: '#333' }}>{data.company.name}</strong>
              </div>
            )}
            {data.company?.business_number && (
              <div>사업자번호: {data.company.business_number}</div>
            )}
            {data.company?.address && (
              <div>주소: {data.company.address}</div>
            )}
            {data.company?.phone && (
              <div>연락처: {data.company.phone}</div>
            )}
            {data.company?.email && (
              <div>이메일: {data.company.email}</div>
            )}
          </div>
        </div>

        {/* 푸터 - 조회 정보 */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '15px', marginTop: '20px', textAlign: 'center', fontSize: '12px', color: '#999', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div>이 정산 내역은 발송 후 90일간 유효합니다.</div>
          {data.viewed_at && (
            <div style={{ marginTop: '8px' }}>
              첫 조회: {formatDateTime(data.viewed_at)} · 조회 횟수: {data.view_count}회
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

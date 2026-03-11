'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const BRAND_COLOR = '#2d5fa8'

type TransactionDetail = {
  date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  category?: string
}

type SettlementItem = {
  type: 'jiip' | 'invest'
  monthLabel: string
  amount: number
  detail: string
  carNumber?: string
  carId?: string
  breakdown?: {
    revenue?: number
    expense?: number
    adminFee?: number
    netProfit?: number
    distributable?: number
    effectiveDistributable?: number
    carryOver?: number
    shareRatio?: number
    investorPayout?: number
    companyProfit?: number
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
  transaction_details?: Record<string, TransactionDetail[]>
  message?: string
  created_at: string
  expires_at: string
  viewed_at?: string
  view_count: number
  is_first_view: boolean
  phone_verified?: boolean
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

type PageState = 'loading' | 'phone_gate' | 'valid' | 'expired' | 'error'

export default function SettlementViewPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [data, setData] = useState<SettlementShare | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [recipientName, setRecipientName] = useState('')

  const fetchData = (phone?: string) => {
    if (!token) return
    const url = phone
      ? `/api/settlement/share/${token}?phone=${encodeURIComponent(phone)}`
      : `/api/settlement/share/${token}`

    fetch(url)
      .then(async (res) => {
        const responseData = await res.json()
        if (responseData.requires_phone) {
          setRecipientName(responseData.recipient_name || '')
          setState('phone_gate')
          return
        }
        if (responseData.code === 'PHONE_MISMATCH') {
          setPhoneError('전화번호가 일치하지 않습니다.')
          setPhoneLoading(false)
          return
        }
        if (responseData.code === 'EXPIRED') {
          setState('expired')
          setErrorMsg(responseData.error || '만료된 링크입니다.')
          return
        }
        if (responseData.error) {
          setState(res.status === 410 ? 'expired' : 'error')
          setErrorMsg(responseData.error)
        } else {
          setData(responseData)
          setState('valid')
        }
        setPhoneLoading(false)
      })
      .catch(() => {
        setState('error')
        setErrorMsg('서버에 연결할 수 없습니다.')
        setPhoneLoading(false)
      })
  }

  useEffect(() => { fetchData() }, [token])

  const handlePhoneSubmit = () => {
    const cleaned = phoneInput.replace(/[^0-9]/g, '')
    if (cleaned.length < 4) { setPhoneError('전화번호 뒷 4자리를 입력해주세요.'); return }
    setPhoneError('')
    setPhoneLoading(true)
    fetchData(cleaned)
  }

  // ── 전화번호 인증 화면 ──
  if (state === 'phone_gate') {
    return (
      <div style={{ fontFamily: '"Noto Sans KR", sans-serif', backgroundColor: '#f5f6f8', minHeight: '100vh' }}>
        <div style={{ backgroundColor: BRAND_COLOR, color: 'white', padding: '30px 20px', textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 5px 0', fontSize: '24px', fontWeight: 'bold' }}>정산 명세서</h1>
          <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>본인 확인이 필요합니다</p>
        </div>
        <div style={{ maxWidth: '400px', margin: '40px auto', padding: '0 20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ textAlign: 'center', marginBottom: '25px' }}>
              <div style={{ fontSize: '40px', marginBottom: '15px' }}>🔒</div>
              <p style={{ fontSize: '15px', color: '#333', margin: '0 0 5px 0', fontWeight: 'bold' }}>
                {recipientName}님의 정산 내역
              </p>
              <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
                등록된 전화번호 뒷 4자리를 입력해주세요.
              </p>
            </div>
            <input
              type="tel" inputMode="numeric" maxLength={4} placeholder="뒷 4자리" value={phoneInput}
              onChange={(e) => { setPhoneInput(e.target.value.replace(/[^0-9]/g, '')); setPhoneError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handlePhoneSubmit()}
              style={{
                width: '100%', padding: '14px', fontSize: '24px', textAlign: 'center',
                border: `2px solid ${phoneError ? '#ef4444' : '#e5e7eb'}`, borderRadius: '8px',
                outline: 'none', letterSpacing: '8px', fontWeight: 'bold', boxSizing: 'border-box', marginBottom: '12px',
              }}
            />
            {phoneError && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '0', marginBottom: '12px', textAlign: 'center' }}>{phoneError}</p>}
            <button onClick={handlePhoneSubmit} disabled={phoneLoading || phoneInput.length < 4}
              style={{
                width: '100%', padding: '14px', backgroundColor: phoneInput.length >= 4 ? BRAND_COLOR : '#d1d5db',
                color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold',
                cursor: phoneInput.length >= 4 ? 'pointer' : 'default',
              }}
            >
              {phoneLoading ? '확인 중...' : '확인'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: '24px', color: BRAND_COLOR }}>로드 중...</div>
      </div>
    )
  }

  if (state === 'expired' || state === 'error') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <h1 style={{ color: '#333', marginBottom: '10px' }}>{state === 'expired' ? '링크가 만료되었습니다.' : '오류가 발생했습니다.'}</h1>
          <p style={{ color: '#666', marginBottom: '20px' }}>{errorMsg}</p>
        </div>
      </div>
    )
  }

  if (state !== 'valid' || !data) return null

  const nf = (n: number | undefined) => {
    if (n === undefined || n === null) return '0'
    return Math.round(n).toLocaleString('ko-KR')
  }

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      return new Date(dateStr).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return dateStr }
  }

  const itemsByMonth = data.items.reduce((acc: Record<string, SettlementItem[]>, item) => {
    const month = item.monthLabel
    if (!acc[month]) acc[month] = []
    acc[month].push(item)
    return acc
  }, {})
  const months = Object.keys(itemsByMonth).sort()

  const getTxDetails = (carId?: string, monthLabel?: string): TransactionDetail[] => {
    if (!data.transaction_details || !carId || !monthLabel) return []
    return data.transaction_details[`${carId}_${monthLabel}`] || []
  }

  return (
    <div style={{ fontFamily: '"Noto Sans KR", sans-serif', backgroundColor: '#f5f6f8', minHeight: '100vh', paddingBottom: '40px' }}>
      <div style={{ backgroundColor: BRAND_COLOR, color: 'white', padding: '30px 20px', textAlign: 'center' }}>
        {data.company?.logo_url && <img src={data.company.logo_url} alt="" style={{ maxHeight: '50px', marginBottom: '15px' }} />}
        <h1 style={{ margin: '0 0 5px 0', fontSize: '28px', fontWeight: 'bold' }}>{data.company?.name || 'Self-Disruption'}</h1>
        <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>정산 명세서</p>
      </div>

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
              const bd = item.breakdown
              const hasBd = bd && Object.keys(bd).length > 0
              const txs = getTxDetails(item.carId, item.monthLabel)
              const incomeTxs = txs.filter(t => t.type === 'income')
              const expenseTxs = txs.filter(t => t.type === 'expense')

              return (
                <div key={idx} style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div>
                      <span style={{
                        display: 'inline-block', backgroundColor: item.type === 'jiip' ? '#e8f0fe' : '#f0e8fe',
                        color: item.type === 'jiip' ? '#1a73e8' : '#7c3aed',
                        padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', marginRight: '10px',
                      }}>{typeLabel}</span>
                      {item.carNumber && <span style={{ fontSize: '13px', color: '#666' }}>{item.carNumber}</span>}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: BRAND_COLOR }}>{nf(item.amount)}원</div>
                  </div>

                  <div style={{ fontSize: '13px', color: '#666', marginBottom: hasBd ? '15px' : '0' }}>{item.detail}</div>

                  {hasBd && (
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '6px', padding: '15px', marginTop: '15px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <tbody>
                          {/* 차량 수입 */}
                          {bd!.revenue !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>차량 수입</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>+{nf(bd!.revenue)}원</td>
                            </tr>
                          )}
                          {incomeTxs.length > 0 && (
                            <tr><td colSpan={2} style={{ padding: '0 0 8px 0' }}>
                              <div style={{ backgroundColor: '#f0fdf4', borderRadius: '4px', padding: '8px 12px', marginTop: '4px' }}>
                                {incomeTxs.map((tx, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px', color: '#4b5563' }}>
                                    <span>{tx.date.slice(5)} {tx.description}{tx.category ? ` (${tx.category})` : ''}</span>
                                    <span style={{ color: '#16a34a', fontWeight: '500' }}>+{nf(tx.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </td></tr>
                          )}
                          {/* 차량 비용 */}
                          {bd!.expense !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>차량 비용 (유지비 등)</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>-{nf(bd!.expense)}원</td>
                            </tr>
                          )}
                          {expenseTxs.length > 0 && (
                            <tr><td colSpan={2} style={{ padding: '0 0 8px 0' }}>
                              <div style={{ backgroundColor: '#fef2f2', borderRadius: '4px', padding: '8px 12px', marginTop: '4px' }}>
                                {expenseTxs.map((tx, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px', color: '#4b5563' }}>
                                    <span>{tx.date.slice(5)} {tx.description}{tx.category ? ` (${tx.category})` : ''}</span>
                                    <span style={{ color: '#dc2626', fontWeight: '500' }}>-{nf(tx.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </td></tr>
                          )}
                          {/* 순수익 */}
                          {bd!.netProfit !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#333' }}>순수익</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#333' }}>{nf(bd!.netProfit)}원</td>
                            </tr>
                          )}
                          {bd!.adminFee !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>지입비 (회사 수입)</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#f59e0b' }}>-{nf(bd!.adminFee)}원</td>
                            </tr>
                          )}
                          {bd!.distributable !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>당월 배분대상</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold' }}>{nf(bd!.distributable)}원</td>
                            </tr>
                          )}
                          {bd!.carryOver !== undefined && bd!.carryOver !== 0 && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>전월 이월</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{nf(bd!.carryOver)}원</td>
                            </tr>
                          )}
                          {bd!.shareRatio !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#7c3aed', fontWeight: 'bold' }}>배분율</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#7c3aed' }}>
                                {bd!.shareRatio > 1 ? bd!.shareRatio.toFixed(0) : (bd!.shareRatio * 100).toFixed(0)}%
                              </td>
                            </tr>
                          )}
                          {bd!.investorPayout !== undefined && (
                            <tr style={{ backgroundColor: '#eef2ff', borderRadius: '4px' }}>
                              <td style={{ padding: '10px 8px', color: BRAND_COLOR, fontWeight: 'bold', fontSize: '14px' }}>차주 배분금</td>
                              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 'bold', color: BRAND_COLOR, fontSize: '16px' }}>{nf(bd!.investorPayout)}원</td>
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

        {/* 총액 */}
        <div style={{ backgroundColor: BRAND_COLOR, color: 'white', borderRadius: '8px', padding: '25px', textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', marginBottom: '10px', opacity: 0.9 }}>정산 총액</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold' }}>{nf(data.total_amount)}원</div>
        </div>

        {data.payment_date && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>지급예정일</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>{data.payment_date}</div>
          </div>
        )}

        {data.message && (
          <div style={{ backgroundColor: '#fffbeb', borderRadius: '8px', padding: '20px', marginBottom: '20px', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '8px', fontWeight: 'bold' }}>발송자 메시지</div>
            <div style={{ fontSize: '14px', color: '#333', whiteSpace: 'pre-wrap' }}>{data.message}</div>
          </div>
        )}

        <div style={{ backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '20px', marginTop: '30px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>회사 정보</h3>
          <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.8' }}>
            {data.company?.name && <div><strong style={{ color: '#333' }}>{data.company.name}</strong></div>}
            {data.company?.business_number && <div>사업자번호: {data.company.business_number}</div>}
            {data.company?.address && <div>주소: {data.company.address}</div>}
            {data.company?.phone && <div>연락처: {data.company.phone}</div>}
            {data.company?.email && <div>이메일: {data.company.email}</div>}
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '15px', marginTop: '20px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
          <div>이 정산 내역은 발송 후 90일간 유효합니다.</div>
          {data.viewed_at && <div style={{ marginTop: '8px' }}>첫 조회: {formatDateTime(data.viewed_at)} · 조회 횟수: {data.view_count}회</div>}
        </div>
      </div>
    </div>
  )
}

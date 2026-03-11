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
  carModel?: string
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
    taxType?: string       // 세금계산서, 사업소득(3.3%), 이자소득(27.5%)
    taxRate?: number       // 세율 (%)
    taxAmount?: number     // 세금/공제액 또는 VAT
    supplyAmount?: number  // 공급가 (세금계산서: 배분금/1.1)
    netPayout?: number     // 실수령액
  }
}

type PastSettlement = {
  settlement_month: string
  total_amount: number
  created_at: string
  paid_at: string | null
}

type BankInfo = {
  bank_name: string
  account_holder: string
  account_number: string
}

type SettlementShare = {
  id: string
  token: string
  recipient_name: string
  settlement_month: string
  payment_date?: string
  paid_at?: string
  total_amount: number
  items: SettlementItem[]
  breakdown?: Record<string, any>
  transaction_details?: Record<string, TransactionDetail[]>
  bank_info?: BankInfo
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
  past_settlements?: PastSettlement[]
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

  const getTxDetails = (carId?: string, monthLabel?: string): TransactionDetail[] => {
    if (!data.transaction_details || !carId || !monthLabel) return []
    return data.transaction_details[`${carId}_${monthLabel}`] || []
  }

  // 정산 기준월: 여러 월이면 기간으로 표시
  const allMonths = Array.from(new Set(data.items.map(it => it.monthLabel))).sort()
  const settlementPeriod = allMonths.length > 1
    ? `${allMonths[0]}~${allMonths[allMonths.length - 1]}`
    : data.settlement_month

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
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '5px' }}>정산 기준{allMonths.length > 1 ? '기간' : '월'}</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>{settlementPeriod}</div>
            </div>
          </div>
        </div>

        {/* 정산 항목 (차량별 통합 뷰) */}
        {(() => {
          // 차량별 그룹핑 (같은 차량 여러 월 → 합산)
          const carGroups: { carNumber: string; carModel: string; items: SettlementItem[] }[] = []
          const noCarItems: SettlementItem[] = []
          const carMap = new Map<string, { carModel: string; items: SettlementItem[] }>()

          data.items.forEach(item => {
            if (!item.carNumber) { noCarItems.push(item); return }
            const key = item.carNumber
            if (!carMap.has(key)) carMap.set(key, { carModel: item.carModel || '', items: [] })
            carMap.get(key)!.items.push(item)
          })
          carMap.forEach((v, k) => carGroups.push({ carNumber: k, carModel: v.carModel, items: v.items }))

          return (
            <>
              {carGroups.map((group, gIdx) => {
                // 월별 항목들의 breakdown 합산
                const totalRevenue = group.items.reduce((s, it) => s + (it.breakdown?.revenue || 0), 0)
                const totalExpense = group.items.reduce((s, it) => s + (it.breakdown?.expense || 0), 0)
                const totalNetProfit = group.items.reduce((s, it) => s + (it.breakdown?.netProfit || 0), 0)
                const totalAdminFee = group.items.reduce((s, it) => s + (it.breakdown?.adminFee || 0), 0)
                const totalDistributable = group.items.reduce((s, it) => s + (it.breakdown?.distributable || 0), 0)
                const totalCarryOver = group.items.reduce((s, it) => s + (it.breakdown?.carryOver || 0), 0)
                const totalPayout = group.items.reduce((s, it) => s + (it.breakdown?.investorPayout || 0), 0)
                const totalTaxAmount = group.items.reduce((s, it) => s + (it.breakdown?.taxAmount || 0), 0)
                const totalSupplyAmount = group.items.reduce((s, it) => s + (it.breakdown?.supplyAmount || 0), 0)
                const totalNetPayout = group.items.reduce((s, it) => s + (it.breakdown?.netPayout ?? it.breakdown?.investorPayout ?? 0), 0)
                const taxType = group.items[0]?.breakdown?.taxType
                const taxRate = group.items[0]?.breakdown?.taxRate
                const shareRatio = group.items[0]?.breakdown?.shareRatio
                const isMultiMonth = group.items.length > 1

                // 전체 거래내역 합산
                const allIncomeTxs: TransactionDetail[] = []
                const allExpenseTxs: TransactionDetail[] = []
                group.items.forEach(item => {
                  const txs = getTxDetails(item.carId, item.monthLabel)
                  allIncomeTxs.push(...txs.filter(t => t.type === 'income'))
                  allExpenseTxs.push(...txs.filter(t => t.type === 'expense' && !(t.category || '').includes('차량구입')))
                })

                return (
                  <div key={gIdx} style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    {/* 차량 헤더 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>{group.carNumber}</span>
                      {group.carModel && <span style={{ fontSize: '13px', color: '#888' }}>{group.carModel}</span>}
                      {isMultiMonth && (
                        <span style={{ fontSize: '11px', color: '#999', background: '#f3f4f6', padding: '2px 8px', borderRadius: '10px' }}>
                          {group.items.map(it => it.monthLabel.slice(5) + '월').join(' + ')}
                        </span>
                      )}
                    </div>

                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '6px', padding: '15px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <tbody>
                          {totalRevenue > 0 && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>차량 수입{isMultiMonth ? ' (합계)' : ''}</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>+{nf(totalRevenue)}원</td>
                            </tr>
                          )}
                          {allIncomeTxs.length > 0 && (
                            <tr><td colSpan={2} style={{ padding: '0 0 8px 0' }}>
                              <div style={{ backgroundColor: '#f0fdf4', borderRadius: '4px', padding: '8px 12px', marginTop: '4px' }}>
                                {allIncomeTxs.sort((a, b) => a.date.localeCompare(b.date)).map((tx, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px', color: '#4b5563' }}>
                                    <span>{tx.date.slice(5)} {tx.description}{tx.category ? ` (${tx.category})` : ''}</span>
                                    <span style={{ color: '#16a34a', fontWeight: '500' }}>+{nf(tx.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </td></tr>
                          )}
                          {totalExpense > 0 && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>차량 비용 (유지비 등){isMultiMonth ? ' (합계)' : ''}</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>-{nf(totalExpense)}원</td>
                            </tr>
                          )}
                          {allExpenseTxs.length > 0 && (
                            <tr><td colSpan={2} style={{ padding: '0 0 8px 0' }}>
                              <div style={{ backgroundColor: '#fef2f2', borderRadius: '4px', padding: '8px 12px', marginTop: '4px' }}>
                                {allExpenseTxs.sort((a, b) => a.date.localeCompare(b.date)).map((tx, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px', color: '#4b5563' }}>
                                    <span>{tx.date.slice(5)} {tx.description}{tx.category ? ` (${tx.category})` : ''}</span>
                                    <span style={{ color: '#dc2626', fontWeight: '500' }}>-{nf(tx.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </td></tr>
                          )}
                          {totalNetProfit !== 0 && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#333' }}>순수익</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#333' }}>{nf(totalNetProfit)}원</td>
                            </tr>
                          )}
                          {totalAdminFee > 0 && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>지입비 (회사 수입)</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#f59e0b' }}>-{nf(totalAdminFee)}원</td>
                            </tr>
                          )}
                          {totalDistributable !== 0 && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>배분대상{isMultiMonth ? ' (합계)' : ''}</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold' }}>{nf(totalDistributable)}원</td>
                            </tr>
                          )}
                          {totalCarryOver !== 0 && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#666' }}>전월 이월</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{nf(totalCarryOver)}원</td>
                            </tr>
                          )}
                          {shareRatio !== undefined && (
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '8px 0', color: '#7c3aed', fontWeight: 'bold' }}>배분율</td>
                              <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold', color: '#7c3aed' }}>
                                {shareRatio > 1 ? shareRatio.toFixed(0) : (shareRatio * 100).toFixed(0)}%
                              </td>
                            </tr>
                          )}
                          {totalPayout > 0 && (
                            <tr style={{
                              borderBottom: (taxType && taxType !== '세금계산서') ? '1px solid #e5e7eb' : 'none',
                              backgroundColor: (taxType && taxType !== '세금계산서') ? 'transparent' : '#eef2ff',
                            }}>
                              <td style={{ padding: '10px 8px', color: BRAND_COLOR, fontWeight: 'bold', fontSize: '14px' }}>
                                차주 배분금{isMultiMonth ? ' (합계)' : ''}{taxType === '세금계산서' ? ' (세금계산서)' : ''}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 'bold', color: BRAND_COLOR, fontSize: '16px' }}>{nf(totalPayout)}원</td>
                            </tr>
                          )}
                          {/* 세금 처리 */}
                          {taxType && taxType === '세금계산서' && totalTaxAmount > 0 && (
                            <>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '8px', color: '#666', fontSize: '12px' }}>ㄴ 공급가</td>
                                <td style={{ padding: '8px', textAlign: 'right', color: '#4b5563', fontSize: '12px' }}>{nf(totalSupplyAmount)}원</td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '8px', color: '#666', fontSize: '12px' }}>ㄴ 부가세 (VAT 10%)</td>
                                <td style={{ padding: '8px', textAlign: 'right', color: '#4b5563', fontSize: '12px' }}>{nf(totalTaxAmount)}원</td>
                              </tr>
                            </>
                          )}
                          {taxType && taxType === '사업소득(3.3%)' && totalTaxAmount > 0 && (
                            <>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '8px', color: '#666', fontSize: '13px' }}>원천징수 (사업소득 3.3%)</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>-{nf(totalTaxAmount)}원</td>
                              </tr>
                              <tr style={{ backgroundColor: '#eef2ff', borderRadius: '4px' }}>
                                <td style={{ padding: '10px 8px', color: BRAND_COLOR, fontWeight: 'bold', fontSize: '14px' }}>실수령액</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 'bold', color: BRAND_COLOR, fontSize: '16px' }}>{nf(totalNetPayout)}원</td>
                              </tr>
                            </>
                          )}
                          {taxType && taxType === '이자소득(27.5%)' && totalTaxAmount > 0 && (
                            <>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '8px', color: '#666', fontSize: '13px' }}>원천징수 (이자소득 27.5%)</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>-{nf(totalTaxAmount)}원</td>
                              </tr>
                              <tr style={{ backgroundColor: '#eef2ff', borderRadius: '4px' }}>
                                <td style={{ padding: '10px 8px', color: BRAND_COLOR, fontWeight: 'bold', fontSize: '14px' }}>실수령액</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 'bold', color: BRAND_COLOR, fontSize: '16px' }}>{nf(totalNetPayout)}원</td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}

              {/* 차량 미연결 항목 (투자이자 등) */}
              {noCarItems.length > 0 && (
                <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  {noCarItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: idx < noCarItems.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                      <span style={{ fontSize: '13px', color: '#666' }}>{item.detail || (item.type === 'invest' ? '투자이자' : '기타')}</span>
                      <span style={{ fontSize: '16px', fontWeight: 'bold', color: BRAND_COLOR }}>{nf(item.amount)}원</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        })()}

        {/* 총액 */}
        <div style={{ backgroundColor: BRAND_COLOR, color: 'white', borderRadius: '8px', padding: '25px', textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', marginBottom: '10px', opacity: 0.9 }}>정산 총액</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold' }}>{nf(data.total_amount)}원</div>
        </div>

        {/* 지급 정보 (계좌 + 지급일) */}
        {(data.payment_date || data.bank_info) && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: data.bank_info && data.payment_date ? '1fr 1fr' : '1fr', gap: '20px' }}>
              {data.bank_info && (
                <div>
                  <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>지급 계좌</div>
                  <div style={{ fontSize: '14px', color: '#333' }}>
                    <span style={{ fontWeight: 'bold' }}>{data.bank_info.bank_name}</span>
                    {' '}{data.bank_info.account_number}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                    예금주: {data.bank_info.account_holder}
                  </div>
                </div>
              )}
              {data.payment_date && (
                <div>
                  <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>
                    {data.paid_at ? '지급완료일' : '지급예정일'}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: data.paid_at ? '#16a34a' : '#333' }}>
                    {data.paid_at ? new Date(data.paid_at).toLocaleDateString('ko-KR') : data.payment_date}
                  </div>
                  {data.paid_at && (
                    <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px', fontWeight: 'bold' }}>지급 완료</div>
                  )}
                  {!data.paid_at && (
                    <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px', fontWeight: 'bold' }}>지급 대기</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {data.message && (
          <div style={{ backgroundColor: '#fffbeb', borderRadius: '8px', padding: '20px', marginBottom: '20px', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '8px', fontWeight: 'bold' }}>발송자 메시지</div>
            <div style={{ fontSize: '14px', color: '#333', whiteSpace: 'pre-wrap' }}>{data.message}</div>
          </div>
        )}

        {/* 과거 정산 이력 */}
        {data.past_settlements && data.past_settlements.length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>이전 정산 이력</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '8px 0', textAlign: 'left', color: '#999', fontWeight: '500' }}>정산월</th>
                  <th style={{ padding: '8px 0', textAlign: 'right', color: '#999', fontWeight: '500' }}>금액</th>
                  <th style={{ padding: '8px 0', textAlign: 'right', color: '#999', fontWeight: '500' }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {data.past_settlements.map((ps, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 0', color: '#333' }}>{ps.settlement_month}</td>
                    <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 'bold', color: BRAND_COLOR }}>{nf(ps.total_amount)}원</td>
                    <td style={{ padding: '10px 0', textAlign: 'right' }}>
                      {ps.paid_at ? (
                        <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>지급완료</span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 'bold' }}>대기</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

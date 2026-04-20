'use client'

/**
 * 지입/투자 정산서 — 개별 수신자용 프린트/PDF 페이지
 *   - sessionStorage의 settlementStatementPayload 에서 데이터 로드
 *   - 상단 액션바(인쇄/PDF/닫기)는 @media print 로 숨김
 *   - A4 세로 1장 레이아웃 (210 × 297 mm)
 *   - ExecuteTab / SettlementTab 의 "📄 정산서" 버튼이 새 탭으로 열어 호출
 */

import { useEffect, useRef, useState } from 'react'

type Breakdown = {
  revenue?: number
  expense?: number
  adminFee?: number
  netProfit?: number
  distributable?: number
  carryOver?: number
  effectiveDistributable?: number
  shareRatio?: number
  investorPayout?: number
  companyProfit?: number
  taxType?: string
  taxRate?: number
  taxAmount?: number
  supplyAmount?: number
  netPayout?: number
}

type Item = {
  type: 'jiip' | 'invest' | 'loan'
  monthLabel: string
  amount: number
  detail: string
  carNumber?: string
  carModel?: string
  breakdown?: Breakdown
  dueDate?: string
}

type StatementPayload = {
  recipientName: string
  recipientPhone?: string
  settlementMonth: string      // 'YYYY-MM'
  paymentDate?: string         // 'YYYY-MM-DD'
  totalAmount: number
  items: Item[]
  bank?: { bank_name?: string; account_number?: string; account_holder?: string }
  company?: {
    name?: string
    business_number?: string
    address?: string
    phone?: string
    ceo_name?: string
    logo_url?: string
  }
  memo?: string
  type: 'jiip' | 'invest' | 'mixed'
}

const nf = (v: number | undefined | null): string => {
  const n = typeof v === 'number' ? v : Number(v || 0)
  return Number.isFinite(n) ? n.toLocaleString() : '0'
}

export default function StatementPage() {
  const printRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<StatementPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pdfGen, setPdfGen] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('settlementStatementPayload')
      if (!raw) {
        setErr('정산서 데이터가 없습니다. 정산 발송 탭에서 "📄 정산서" 버튼으로 열어주세요.')
        return
      }
      const parsed = JSON.parse(raw) as StatementPayload
      setData(parsed)
    } catch (e: any) {
      setErr(e?.message || '데이터 파싱 실패')
    }
  }, [])

  const handlePrint = () => { window.print() }

  const handleDownloadPdf = async () => {
    if (!printRef.current || !data) return
    setPdfGen(true)
    try {
      const [html2canvasMod, jsPdfMod] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const html2canvas = (html2canvasMod as any).default
      const JsPDF = (jsPdfMod as any).jsPDF || (jsPdfMod as any).default

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()   // 210
      const pageH = pdf.internal.pageSize.getHeight()  // 297
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width

      if (imgH <= pageH) {
        pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH)
      } else {
        // 멀티페이지 지원
        let remaining = imgH
        let offsetY = 0
        while (remaining > 0) {
          pdf.addImage(imgData, 'PNG', 0, offsetY, imgW, imgH)
          remaining -= pageH
          offsetY -= pageH
          if (remaining > 0) pdf.addPage()
        }
      }
      const fname = `정산서_${data.recipientName}_${data.settlementMonth}.pdf`
      pdf.save(fname)
    } catch (e: any) {
      alert('PDF 생성 실패: ' + (e?.message || '오류'))
    }
    setPdfGen(false)
  }

  if (err) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ background: '#fff', padding: 40, borderRadius: 16, border: '1px solid #e2e8f0', maxWidth: 520, textAlign: 'center' }}>
          <p style={{ fontSize: 28, marginBottom: 12 }}>📄</p>
          <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>정산서 데이터 없음</p>
          <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>{err}</p>
          <button onClick={() => window.close()} style={{ marginTop: 20, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#3b6eb5', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            창 닫기
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
  }

  const periodLabel = `${data.settlementMonth.slice(0, 4)}년 ${parseInt(data.settlementMonth.slice(5, 7), 10)}월`
  const paymentLabel = data.paymentDate || ''
  const isJiip = data.type === 'jiip' || data.items.every(i => i.type === 'jiip')
  const isInvest = data.type === 'invest' || data.items.every(i => i.type === 'invest')
  const docTitle = isJiip ? '지입 수익배분 정산서'
    : isInvest ? '투자자 이자 정산서'
    : '정산서'

  return (
    <>
      {/* 인쇄 시 숨길 액션바 */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(255,255,255,0.95)', borderBottom: '1px solid #e2e8f0',
        backdropFilter: 'blur(6px)',
        padding: '12px 20px', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center',
      }}>
        <button onClick={handlePrint} style={btnPrimary}>🖨️ 인쇄</button>
        <button onClick={handleDownloadPdf} disabled={pdfGen} style={btnSecondary}>
          {pdfGen ? '생성 중...' : '📄 PDF 다운로드'}
        </button>
        <button onClick={() => window.close()} style={btnGhost}>닫기</button>
      </div>

      {/* A4 1페이지 컨테이너 */}
      <div style={{ background: '#eef2f7', minHeight: '100vh', padding: '24px 16px' }}>
        <div ref={printRef} className="a4-page" style={{
          maxWidth: 794,        // 210mm at 96 dpi
          margin: '0 auto',
          background: '#fff',
          padding: '36px 40px',
          boxShadow: '0 4px 18px rgba(15,23,42,0.08)',
          borderRadius: 10,
          color: '#0f172a',
          fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif",
          fontSize: 13,
        }}>
          {/* 상단 회사 라인 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', letterSpacing: -0.5 }}>
                {data.company?.name || '주식회사 에프엠아이'}
              </p>
              {data.company?.business_number && (
                <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>사업자등록번호: {data.company.business_number}</p>
              )}
              {data.company?.address && (
                <p style={{ fontSize: 11, color: '#64748b' }}>{data.company.address}</p>
              )}
              {data.company?.phone && (
                <p style={{ fontSize: 11, color: '#64748b' }}>TEL: {data.company.phone}</p>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 11, color: '#64748b' }}>발행일: {new Date().toLocaleDateString('ko-KR')}</p>
              <p style={{ fontSize: 11, color: '#64748b' }}>정산월: {periodLabel}</p>
              {paymentLabel && <p style={{ fontSize: 11, color: '#64748b' }}>지급예정: {paymentLabel}</p>}
            </div>
          </div>

          {/* 문서 타이틀 */}
          <h1 style={{
            textAlign: 'center', fontSize: 28, fontWeight: 900,
            letterSpacing: 8, padding: '14px 0', margin: '8px 0 22px',
            borderTop: '2px solid #0f172a', borderBottom: '2px solid #0f172a',
            color: '#0f172a',
          }}>
            {docTitle}
          </h1>

          {/* 수신자 박스 */}
          <div style={{
            border: '1px solid #cbd5e1', borderRadius: 8, padding: '14px 16px', marginBottom: 18,
            display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 16px', fontSize: 12,
          }}>
            <div style={labelCell}>수신자</div>
            <div style={valueCell}>
              <strong style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{data.recipientName}</strong> 귀하
              {data.recipientPhone && <span style={{ color: '#64748b', marginLeft: 8 }}>({data.recipientPhone})</span>}
            </div>

            {isJiip && data.items[0]?.carNumber && (
              <>
                <div style={labelCell}>지입 차량</div>
                <div style={valueCell}>
                  {data.items[0].carNumber}
                  {data.items[0].carModel && <span style={{ color: '#64748b', marginLeft: 8 }}>· {data.items[0].carModel}</span>}
                </div>
              </>
            )}

            <div style={labelCell}>입금계좌</div>
            <div style={valueCell}>
              {data.bank?.bank_name || '—'}
              {data.bank?.account_number && <span style={{ marginLeft: 10 }}>{data.bank.account_number}</span>}
              {data.bank?.account_holder && <span style={{ color: '#64748b', marginLeft: 10 }}>(예금주: {data.bank.account_holder})</span>}
            </div>
          </div>

          {/* 상세 내역 테이블 */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>■ 정산 상세 내역</p>

            {isJiip && data.items.length > 0 && (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>구분</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>금액</th>
                    <th style={thStyle}>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, idx) => {
                    const b = item.breakdown || {}
                    return (
                      <>
                        <tr key={`${idx}-rev`}>
                          <td style={tdStyle}>① 매출 (운송수입)</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{nf(b.revenue)}원</td>
                          <td style={{ ...tdStyle, color: '#64748b', fontSize: 11 }}>{item.monthLabel} 운송매출</td>
                        </tr>
                        <tr key={`${idx}-exp`}>
                          <td style={tdStyle}>② 차량 경비 (유류·정비·보험 등)</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#dc2626' }}>-{nf(b.expense)}원</td>
                          <td style={{ ...tdStyle, color: '#64748b', fontSize: 11 }}>차량 귀속 지출</td>
                        </tr>
                        <tr key={`${idx}-adm`}>
                          <td style={tdStyle}>③ 관리비</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#dc2626' }}>-{nf(b.adminFee)}원</td>
                          <td style={{ ...tdStyle, color: '#64748b', fontSize: 11 }}>계약 정액</td>
                        </tr>
                        <tr key={`${idx}-np`} style={{ background: '#f1f5f9' }}>
                          <td style={{ ...tdStyle, fontWeight: 800 }}>④ 순이익 (①-②-③)</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{nf(b.netProfit)}원</td>
                          <td style={tdStyle}>—</td>
                        </tr>
                        {typeof b.carryOver === 'number' && b.carryOver !== 0 && (
                          <tr key={`${idx}-co`}>
                            <td style={tdStyle}>⑤ 전월 이월분</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{nf(b.carryOver)}원</td>
                            <td style={{ ...tdStyle, color: '#64748b', fontSize: 11 }}>순차 차감</td>
                          </tr>
                        )}
                        <tr key={`${idx}-dist`}>
                          <td style={tdStyle}>⑥ 분배 대상액</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{nf(b.effectiveDistributable ?? b.distributable)}원</td>
                          <td style={{ ...tdStyle, color: '#64748b', fontSize: 11 }}>④+⑤</td>
                        </tr>
                        <tr key={`${idx}-ratio`}>
                          <td style={tdStyle}>⑦ 차주 배분율</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{b.shareRatio ?? 0}%</td>
                          <td style={{ ...tdStyle, color: '#64748b', fontSize: 11 }}>계약 기준</td>
                        </tr>
                        {b.taxType && (
                          <tr key={`${idx}-tax`}>
                            <td style={tdStyle}>⑧ {b.taxType} {b.taxRate ? `(${b.taxRate}%)` : ''}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', color: '#dc2626' }}>-{nf(b.taxAmount)}원</td>
                            <td style={{ ...tdStyle, color: '#64748b', fontSize: 11 }}>세금/공제</td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            )}

            {isInvest && data.items.length > 0 && (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>항목</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>금액</th>
                    <th style={thStyle}>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, idx) => {
                    const b = item.breakdown || {}
                    return (
                      <tr key={idx}>
                        <td style={tdStyle}>{item.monthLabel || periodLabel} 투자 이자</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{nf(item.amount)}원</td>
                        <td style={{ ...tdStyle, color: '#64748b', fontSize: 11 }}>
                          {item.detail}
                          {b.taxType && ` · ${b.taxType}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* 혼합형 (mixed) — 아이템별 간단 표시 */}
            {!isJiip && !isInvest && (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>구분</th>
                    <th style={thStyle}>항목</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={tdStyle}>{item.type === 'jiip' ? '지입' : item.type === 'invest' ? '투자' : '대출'}</td>
                      <td style={tdStyle}>{item.monthLabel} — {item.detail}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{nf(item.amount)}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 총액 박스 */}
          <div style={{
            border: '2px solid #0f172a', borderRadius: 10, padding: '14px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#f8fafc', marginBottom: 18,
          }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>⭐ 최종 지급액 (실수령)</span>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#1e40af', letterSpacing: -0.5 }}>
              {nf(data.totalAmount)}원
            </span>
          </div>

          {/* 메모 */}
          {data.memo && (
            <div style={{ fontSize: 11, color: '#475569', border: '1px dashed #cbd5e1', borderRadius: 8, padding: 12, marginBottom: 18, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
              <strong>※ 메모:</strong> {data.memo}
            </div>
          )}

          {/* 서명 영역 */}
          <div style={{ marginTop: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#0f172a', marginBottom: 6 }}>위와 같이 정산서를 발행합니다.</p>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 22 }}>{new Date().toLocaleDateString('ko-KR')}</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{data.company?.name || '주식회사 에프엠아이'}</span>
              {data.company?.ceo_name && <span style={{ fontSize: 12, color: '#475569' }}>대표 {data.company.ceo_name}</span>}
              <span style={{
                display: 'inline-block', marginLeft: 6,
                width: 52, height: 52, borderRadius: '50%',
                border: '2px dashed #dc2626', color: '#dc2626',
                fontSize: 11, fontWeight: 800, lineHeight: '48px',
                textAlign: 'center',
              }}>印</span>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; margin: 0 !important; }
          .a4-page {
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 18mm 16mm !important;
            max-width: 100% !important;
          }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
    </>
  )
}

// ── 스타일 ─────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 8, border: 'none',
  background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)',
  color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(59,110,181,0.25)',
}
const btnSecondary: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 8, border: '1px solid #3b6eb5',
  background: '#fff', color: '#3b6eb5', fontWeight: 800, fontSize: 13, cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1',
  background: '#fff', color: '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer',
}
const labelCell: React.CSSProperties = {
  fontWeight: 800, color: '#475569', background: '#f1f5f9', padding: '8px 12px',
  borderRadius: 4, alignSelf: 'center',
}
const valueCell: React.CSSProperties = {
  padding: '6px 4px', alignSelf: 'center', color: '#0f172a',
}
const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 12, border: '1px solid #cbd5e1',
}
const thStyle: React.CSSProperties = {
  padding: '10px 12px', background: '#e2e8f0', fontWeight: 800, color: '#0f172a',
  textAlign: 'left', borderBottom: '1px solid #cbd5e1',
}
const tdStyle: React.CSSProperties = {
  padding: '9px 12px', borderBottom: '1px solid #e2e8f0', color: '#1e293b',
}

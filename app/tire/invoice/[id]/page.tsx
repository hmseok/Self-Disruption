'use client'

// ═══════════════════════════════════════════════════════════════
// 타이어 청구서 인쇄 뷰 (2026-08-07)
// A4 세로 기준 — 공급자 정보는 tire_settings (사업자등록증 등록 후 자동 반영)
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { fetchWithAuth } from '@/app/utils/finance-upload'

const nf = (n: number) => (Number(n) || 0).toLocaleString()

export default function TireInvoicePrint() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetchWithAuth(`/api/tire/invoices?id=${id}`).then(({ ok, json }) => {
      if (ok) setData(json)
      else setError(json.error || '불러오기 실패')
    })
  }, [id])

  if (error) return <div style={{ padding: 40, color: '#dc2626' }}>{error}</div>
  if (!data) return <div style={{ padding: 40, color: '#94a3b8' }}>불러오는 중...</div>

  const { invoice, lines, supplier } = data
  const vat = Math.round(invoice.total / 11)  // 부가세 포함가 기준 안내용
  const supplied = invoice.total - vat

  const cell: React.CSSProperties = { border: '1px solid #cbd5e1', padding: '7px 10px', fontSize: 12 }
  const label: React.CSSProperties = { ...cell, background: '#f1f5f9', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', padding: '24px 0' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>

      <div className="no-print" style={{ maxWidth: 760, margin: '0 auto 14px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => window.print()} style={{
          padding: '9px 22px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff',
          fontWeight: 800, fontSize: 13, cursor: 'pointer',
        }}>인쇄 / PDF 저장</button>
      </div>

      <div className="sheet" style={{
        maxWidth: 760, margin: '0 auto', background: '#fff', padding: '46px 50px',
        boxShadow: '0 4px 24px rgba(16,24,40,0.12)', color: '#1a1d23',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
      }}>
        <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 900, letterSpacing: '0.35em', marginBottom: 6 }}>청 구 서</div>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#5b626e', marginBottom: 26 }}>{invoice.invoice_no}</div>

        {/* 공급자 / 청구 정보 */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18 }}>
          <tbody>
            <tr>
              <td style={label}>공급자</td>
              <td style={cell}>{supplier.supplier_name || '(사업자 정보 미등록)'}</td>
              <td style={label}>사업자등록번호</td>
              <td style={cell}>{supplier.supplier_biz_no || '—'}</td>
            </tr>
            <tr>
              <td style={label}>대표자</td>
              <td style={cell}>{supplier.supplier_ceo || '—'}</td>
              <td style={label}>연락처</td>
              <td style={cell}>{supplier.supplier_phone || '—'}</td>
            </tr>
            <tr>
              <td style={label}>주소</td>
              <td style={cell} colSpan={3}>{supplier.supplier_address || '—'}</td>
            </tr>
            <tr>
              <td style={label}>청구 대상</td>
              <td style={cell}>{invoice.customer_name || '—'}</td>
              <td style={label}>청구 기간</td>
              <td style={cell}>
                {invoice.period_from ? `${String(invoice.period_from).slice(0, 10)} ~ ${String(invoice.period_to).slice(0, 10)}` : '—'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 명세 */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
          <thead>
            <tr>
              <td style={{ ...label, textAlign: 'center' }}>판매일</td>
              <td style={{ ...label, textAlign: 'center' }}>차량번호</td>
              <td style={{ ...label, textAlign: 'center' }}>품목</td>
              <td style={{ ...label, textAlign: 'center' }}>규격</td>
              <td style={{ ...label, textAlign: 'center' }}>수량</td>
              <td style={{ ...label, textAlign: 'center' }}>단가</td>
              <td style={{ ...label, textAlign: 'center' }}>금액</td>
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any) => (
              <tr key={l.id}>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>{String(l.sale_date).slice(0, 10)}</td>
                <td style={cell}>{l.car_number || '—'}</td>
                <td style={cell}>{l.item_name || '—'}</td>
                <td style={cell}>{l.spec || '—'}</td>
                <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{nf(l.qty)}</td>
                <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{nf(l.unit_price)}</td>
                <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{nf(l.amount)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...label, textAlign: 'center' }} colSpan={6}>합계 (부가세 포함)</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 900, fontSize: 14 }}>{nf(invoice.total)}원</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: '#5b626e', textAlign: 'right', marginBottom: 22 }}>
          공급가액 {nf(supplied)}원 · 부가세 {nf(vat)}원
        </div>

        {/* 입금 안내 */}
        <div style={{ border: '1.5px solid #2563eb', borderRadius: 8, padding: '13px 18px', marginBottom: 26 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', marginRight: 12 }}>입금계좌</span>
          <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {supplier.bank_account || '국민은행 441501-01-516551'}
          </span>
          {supplier.supplier_name && <span style={{ fontSize: 12, color: '#5b626e', marginLeft: 10 }}>(예금주: {supplier.supplier_name})</span>}
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: '#5b626e' }}>
          위와 같이 청구합니다.
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: '#1a1d23', position: 'relative', display: 'inline-block' }}>
            {invoice.issued_at ? String(invoice.issued_at).slice(0, 10) : ''} · {supplier.supplier_name || ''}
            {supplier.stamp_url && (
              <img src={supplier.stamp_url} alt="인" style={{ width: 44, height: 44, position: 'absolute', right: -50, top: -12, opacity: 0.9 }} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

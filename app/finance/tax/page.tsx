'use client'

import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useEffect, useState, useMemo } from 'react'

// ============================================
// 타입 정의
// ============================================

// 세금 항목 (각 소스에서 집계된 개별 건)
type TaxItem = {
  id: string
  source: string           // 'payroll' | 'freelancer' | 'settlement' | 'invoice'
  sourceLabel: string      // '급여' | '프리랜서' | '지입정산' | '투자이자' | '세금계산서'
  recipientName: string
  incomeType: string       // '근로소득' | '사업소득(3.3%)' | '기타소득(8.8%)' | '이자소득(27.5%)' | '세금계산서' | '일용근로'
  grossAmount: number      // 지급총액
  taxRate: number
  taxAmount: number        // 원천징수/VAT
  localTax: number         // 지방소득세
  netAmount: number        // 실지급액
  supplyAmount: number     // 공급가 (세금계산서)
  vatAmount: number        // 부가세 (세금계산서)
  date: string             // 지급일/발행일
  sourceId?: string
  transactionId?: string
}

// 신고 상태
type FilingRecord = {
  id: string
  tax_period: string
  tax_type: 'withholding' | 'vat'
  total_taxable_amount: number
  total_tax_amount: number
  total_local_tax: number
  breakdown: Record<string, { count: number; amount: number; tax: number }>
  status: 'pending' | 'filed' | 'paid'
  filed_at: string | null
  paid_at: string | null
  memo: string | null
}

const nf = (n: number) => Math.round(n).toLocaleString('ko-KR')

const INCOME_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  '근로소득': { bg: '#dbeafe', text: '#1d4ed8', label: '근로' },
  '사업소득(3.3%)': { bg: '#fef3c7', text: '#92400e', label: '3.3%' },
  '기타소득(8.8%)': { bg: '#fde68a', text: '#78350f', label: '8.8%' },
  '이자소득(27.5%)': { bg: '#fce7f3', text: '#9d174d', label: '27.5%' },
  '세금계산서': { bg: '#d1fae5', text: '#065f46', label: '계산서' },
  '일용근로': { bg: '#e0e7ff', text: '#3730a3', label: '일용' },
}

export default function TaxManagementPage() {
  const { company } = useApp()
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [taxItems, setTaxItems] = useState<TaxItem[]>([])
  const [filingRecords, setFilingRecords] = useState<FilingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'withholding' | 'vat' | 'history'>('overview')

  const effectiveCompanyId = company?.id

  // ============================================
  // 데이터 집계
  // ============================================
  const fetchTaxData = async () => {
    if (!effectiveCompanyId) return
    setLoading(true)

    try {
      const [y, m] = filterMonth.split('-').map(Number)
      const startDate = `${filterMonth}-01`
      const lastDay = new Date(y, m, 0).getDate()
      const endDate = `${filterMonth}-${lastDay}`

      // 병렬로 모든 소스 조회
      const [payslipRes, freelancerRes, settleTxRes, invoiceRes, filingRes] = await Promise.all([
        // 1. 급여 (payslips)
        supabase.from('payslips')
          .select('id, employee_id, pay_period, gross_salary, income_tax, local_income_tax, national_pension, health_insurance, long_care_insurance, employment_insurance, total_deductions, net_salary, tax_type, status, profiles!payslips_employee_id_fkey(full_name)')
          .eq('company_id', effectiveCompanyId)
          .eq('pay_period', filterMonth),

        // 2. 프리랜서 지급 (freelancer_payments)
        supabase.from('freelancer_payments')
          .select('id, freelancer_id, payment_date, gross_amount, tax_rate, tax_amount, net_amount, description, status, freelancers(name, tax_type)')
          .eq('company_id', effectiveCompanyId)
          .gte('payment_date', startDate)
          .lte('payment_date', endDate),

        // 3. 정산 거래 (지입배분/투자이자)
        supabase.from('transactions')
          .select('id, transaction_date, category, client_name, description, amount, related_type, related_id')
          .eq('company_id', effectiveCompanyId)
          .eq('type', 'expense')
          .eq('status', 'completed')
          .in('related_type', ['jiip_share', 'invest'])
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate),

        // 4. 세금계산서 발행 (customer_tax_invoices)
        supabase.from('customer_tax_invoices')
          .select('id, customer_id, invoice_number, issue_date, supply_amount, tax_amount, total_amount, description, status, customers(name)')
          .eq('company_id', effectiveCompanyId)
          .gte('issue_date', startDate)
          .lte('issue_date', endDate),

        // 5. 기존 신고 기록
        supabase.from('tax_filing_records')
          .select('*')
          .eq('company_id', effectiveCompanyId)
          .eq('tax_period', filterMonth),
      ])

      const items: TaxItem[] = []

      // ── 1. 급여 → 근로소득세 ──
      ;(payslipRes.data || []).forEach((ps: any) => {
        const empName = ps.profiles?.full_name || '직원'
        const taxType = ps.tax_type || '근로소득'

        if (taxType === '사업소득(3.3%)' || taxType === '프리랜서') {
          // 프리랜서형 급여
          const taxAmt = Math.round(ps.gross_salary * 0.033)
          items.push({
            id: `payroll-${ps.id}`,
            source: 'payroll',
            sourceLabel: '급여(3.3%)',
            recipientName: empName,
            incomeType: '사업소득(3.3%)',
            grossAmount: ps.gross_salary,
            taxRate: 3.3,
            taxAmount: taxAmt,
            localTax: Math.round(taxAmt * 0.1),
            netAmount: ps.gross_salary - taxAmt - Math.round(taxAmt * 0.1),
            supplyAmount: 0, vatAmount: 0,
            date: `${filterMonth}-25`,
            sourceId: ps.id,
          })
        } else {
          // 정규직/계약직 → 근로소득세 + 4대보험
          items.push({
            id: `payroll-${ps.id}`,
            source: 'payroll',
            sourceLabel: '급여',
            recipientName: empName,
            incomeType: '근로소득',
            grossAmount: ps.gross_salary,
            taxRate: 0, // 간이세액표 기반
            taxAmount: ps.income_tax || 0,
            localTax: ps.local_income_tax || 0,
            netAmount: ps.net_salary || 0,
            supplyAmount: 0, vatAmount: 0,
            date: `${filterMonth}-25`,
            sourceId: ps.id,
          })
        }
      })

      // ── 2. 프리랜서 지급 ──
      ;(freelancerRes.data || []).forEach((fp: any) => {
        const flName = fp.freelancers?.name || '프리랜서'
        const flTaxType = fp.freelancers?.tax_type || '사업소득(3.3%)'
        const rate = fp.tax_rate || 3.3
        const incomeType = flTaxType === '기타소득(8.8%)' ? '기타소득(8.8%)'
          : flTaxType === '세금계산서' ? '세금계산서'
          : flTaxType === '원천징수 없음' ? '원천징수 없음'
          : '사업소득(3.3%)'

        if (incomeType === '세금계산서') {
          const supply = Math.round(fp.gross_amount / 1.1)
          const vat = fp.gross_amount - supply
          items.push({
            id: `freelancer-${fp.id}`,
            source: 'freelancer',
            sourceLabel: '프리랜서(계산서)',
            recipientName: flName,
            incomeType: '세금계산서',
            grossAmount: fp.gross_amount,
            taxRate: 10,
            taxAmount: 0,
            localTax: 0,
            netAmount: fp.gross_amount,
            supplyAmount: supply,
            vatAmount: vat,
            date: fp.payment_date,
            sourceId: fp.id,
          })
        } else if (incomeType !== '원천징수 없음') {
          const taxAmt = fp.tax_amount || Math.round(fp.gross_amount * rate / 100)
          items.push({
            id: `freelancer-${fp.id}`,
            source: 'freelancer',
            sourceLabel: '프리랜서',
            recipientName: flName,
            incomeType,
            grossAmount: fp.gross_amount,
            taxRate: rate,
            taxAmount: taxAmt,
            localTax: Math.round(taxAmt * 0.1),
            netAmount: fp.net_amount || (fp.gross_amount - taxAmt - Math.round(taxAmt * 0.1)),
            supplyAmount: 0, vatAmount: 0,
            date: fp.payment_date,
            sourceId: fp.id,
          })
        }
      })

      // ── 3. 정산 거래 (지입/투자) ──
      // 지입계약의 tax_type을 가져와야 함
      const jiipTxs = (settleTxRes.data || []).filter((t: any) => t.related_type === 'jiip_share')
      const investTxs = (settleTxRes.data || []).filter((t: any) => t.related_type === 'invest')

      if (jiipTxs.length > 0) {
        // 지입 계약별 세금 유형 조회
        const jiipIds = [...new Set(jiipTxs.map((t: any) => t.related_id))]
        const { data: jiipContracts } = await supabase
          .from('jiip_contracts')
          .select('id, tax_type, investor_name')
          .in('id', jiipIds)
        const jiipMap = new Map((jiipContracts || []).map((j: any) => [j.id, j]))

        jiipTxs.forEach((tx: any) => {
          const contract = jiipMap.get(tx.related_id) as any
          const taxType = contract?.tax_type || '세금계산서'
          const investorName = contract?.investor_name || tx.client_name

          if (taxType === '세금계산서') {
            const supply = Math.round(tx.amount / 1.1)
            const vat = tx.amount - supply
            items.push({
              id: `settle-${tx.id}`,
              source: 'settlement',
              sourceLabel: '지입정산(계산서)',
              recipientName: investorName,
              incomeType: '세금계산서',
              grossAmount: tx.amount,
              taxRate: 10,
              taxAmount: 0,
              localTax: 0,
              netAmount: tx.amount,
              supplyAmount: supply,
              vatAmount: vat,
              date: tx.transaction_date,
              sourceId: tx.related_id,
              transactionId: tx.id,
            })
          } else if (taxType === '사업소득(3.3%)') {
            // 정산 실행 시 이미 공제 후 금액으로 저장됨 → 역산
            const netAmt = tx.amount
            const grossAmt = Math.round(netAmt / (1 - 0.033))
            const taxAmt = grossAmt - netAmt
            items.push({
              id: `settle-${tx.id}`,
              source: 'settlement',
              sourceLabel: '지입정산',
              recipientName: investorName,
              incomeType: '사업소득(3.3%)',
              grossAmount: grossAmt,
              taxRate: 3.3,
              taxAmount: taxAmt,
              localTax: Math.round(taxAmt * 0.1),
              netAmount: netAmt,
              supplyAmount: 0, vatAmount: 0,
              date: tx.transaction_date,
              sourceId: tx.related_id,
              transactionId: tx.id,
            })
          } else if (taxType === '이자소득(27.5%)') {
            const netAmt = tx.amount
            const grossAmt = Math.round(netAmt / (1 - 0.275))
            const taxAmt = grossAmt - netAmt
            items.push({
              id: `settle-${tx.id}`,
              source: 'settlement',
              sourceLabel: '지입정산',
              recipientName: investorName,
              incomeType: '이자소득(27.5%)',
              grossAmount: grossAmt,
              taxRate: 27.5,
              taxAmount: taxAmt,
              localTax: Math.round(taxAmt * 0.1),
              netAmount: netAmt,
              supplyAmount: 0, vatAmount: 0,
              date: tx.transaction_date,
              sourceId: tx.related_id,
              transactionId: tx.id,
            })
          }
        })
      }

      // 투자이자 → 이자소득 27.5%
      investTxs.forEach((tx: any) => {
        const netAmt = tx.amount
        const grossAmt = Math.round(netAmt / (1 - 0.275))
        const taxAmt = grossAmt - netAmt
        items.push({
          id: `invest-${tx.id}`,
          source: 'settlement',
          sourceLabel: '투자이자',
          recipientName: tx.client_name || '투자자',
          incomeType: '이자소득(27.5%)',
          grossAmount: grossAmt,
          taxRate: 27.5,
          taxAmount: taxAmt,
          localTax: Math.round(taxAmt * 0.1),
          netAmount: netAmt,
          supplyAmount: 0, vatAmount: 0,
          date: tx.transaction_date,
          sourceId: tx.related_id,
          transactionId: tx.id,
        })
      })

      // ── 4. 세금계산서 발행 (매출) ──
      ;(invoiceRes.data || []).forEach((inv: any) => {
        items.push({
          id: `invoice-${inv.id}`,
          source: 'invoice',
          sourceLabel: '매출(계산서)',
          recipientName: inv.customers?.name || '거래처',
          incomeType: '세금계산서',
          grossAmount: inv.total_amount,
          taxRate: 10,
          taxAmount: 0,
          localTax: 0,
          netAmount: inv.total_amount,
          supplyAmount: inv.supply_amount,
          vatAmount: inv.tax_amount,
          date: inv.issue_date,
          sourceId: inv.id,
        })
      })

      setTaxItems(items)
      setFilingRecords((filingRes.data || []) as FilingRecord[])
    } catch (err) {
      console.error('Tax data fetch error:', err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchTaxData() }, [effectiveCompanyId, filterMonth])

  // ============================================
  // 집계 계산
  // ============================================
  const summary = useMemo(() => {
    // 원천세 대상 (세금계산서 제외)
    const withholdingItems = taxItems.filter(i => i.incomeType !== '세금계산서')
    const vatItems = taxItems.filter(i => i.incomeType === '세금계산서')

    // 소득유형별 그룹핑
    const byType: Record<string, { count: number; gross: number; tax: number; localTax: number; net: number }> = {}
    withholdingItems.forEach(item => {
      const key = item.incomeType
      if (!byType[key]) byType[key] = { count: 0, gross: 0, tax: 0, localTax: 0, net: 0 }
      byType[key].count++
      byType[key].gross += item.grossAmount
      byType[key].tax += item.taxAmount
      byType[key].localTax += item.localTax
      byType[key].net += item.netAmount
    })

    // 소스별 그룹핑
    const bySource: Record<string, { count: number; gross: number; tax: number }> = {}
    taxItems.forEach(item => {
      const key = item.sourceLabel
      if (!bySource[key]) bySource[key] = { count: 0, gross: 0, tax: 0 }
      bySource[key].count++
      bySource[key].gross += item.grossAmount
      bySource[key].tax += item.taxAmount + item.localTax
    })

    const totalWithholdingTax = withholdingItems.reduce((s, i) => s + i.taxAmount, 0)
    const totalLocalTax = withholdingItems.reduce((s, i) => s + i.localTax, 0)
    const totalVatSupply = vatItems.reduce((s, i) => s + i.supplyAmount, 0)
    const totalVatAmount = vatItems.reduce((s, i) => s + i.vatAmount, 0)

    return {
      withholdingItems,
      vatItems,
      byType,
      bySource,
      totalWithholdingTax,
      totalLocalTax,
      totalVatSupply,
      totalVatAmount,
      totalTaxPayable: totalWithholdingTax + totalLocalTax,  // 원천세 납부액
    }
  }, [taxItems])

  // 기존 신고 기록
  const withholdingFiling = filingRecords.find(f => f.tax_type === 'withholding')
  const vatFiling = filingRecords.find(f => f.tax_type === 'vat')

  // ============================================
  // 신고 상태 저장
  // ============================================
  const handleMarkFiled = async (taxType: 'withholding' | 'vat') => {
    if (!effectiveCompanyId) return
    const isWithholding = taxType === 'withholding'
    const totalTax = isWithholding ? summary.totalWithholdingTax : summary.totalVatAmount
    const label = isWithholding ? '원천세' : '부가세'

    if (!confirm(`${filterMonth} ${label} 신고완료로 표시하시겠습니까?\n\n납부세액: ${nf(totalTax)}원${isWithholding ? `\n지방소득세: ${nf(summary.totalLocalTax)}원` : ''}`)) return

    try {
      const existing = filingRecords.find(f => f.tax_type === taxType)
      const payload = {
        company_id: effectiveCompanyId,
        tax_period: filterMonth,
        tax_type: taxType,
        total_taxable_amount: isWithholding
          ? summary.withholdingItems.reduce((s, i) => s + i.grossAmount, 0)
          : summary.totalVatSupply,
        total_tax_amount: totalTax,
        total_local_tax: isWithholding ? summary.totalLocalTax : 0,
        breakdown: isWithholding ? summary.byType : { '세금계산서': { count: summary.vatItems.length, supply: summary.totalVatSupply, vat: summary.totalVatAmount } },
        status: 'filed' as const,
        filed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (existing) {
        await supabase.from('tax_filing_records').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('tax_filing_records').insert(payload)
      }
      fetchTaxData()
    } catch (err) {
      alert('신고 상태 저장 실패')
    }
  }

  const handleUnmarkFiled = async (taxType: 'withholding' | 'vat') => {
    const existing = filingRecords.find(f => f.tax_type === taxType)
    if (!existing) return
    if (!confirm('신고 상태를 취소하시겠습니까?')) return
    await supabase.from('tax_filing_records').update({ status: 'pending', filed_at: null, paid_at: null }).eq('id', existing.id)
    fetchTaxData()
  }

  // ============================================
  // 월 네비게이션
  // ============================================
  const changeMonth = (delta: number) => {
    const [y, m] = filterMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setFilterMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  if (!company) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>회사를 선택해주세요.</div>
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>세금 관리</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0' }}>원천세 · 부가세 통합 관리</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => changeMonth(-1)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: '#fff', fontWeight: 700, fontSize: 14 }}>◀</button>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#111827', minWidth: 100, textAlign: 'center' }}>
            {filterMonth.replace('-', '년 ')}월
          </span>
          <button onClick={() => changeMonth(1)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: '#fff', fontWeight: 700, fontSize: 14 }}>▶</button>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
        {[
          { key: 'overview' as const, label: '전체 현황' },
          { key: 'withholding' as const, label: '원천세' },
          { key: 'vat' as const, label: '부가세' },
          { key: 'history' as const, label: '신고 이력' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: 'none', borderBottom: activeTab === t.key ? '3px solid #2d5fa8' : '3px solid transparent',
              color: activeTab === t.key ? '#2d5fa8' : '#9ca3af',
              background: 'transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9ca3af' }}>데이터 집계 중...</div>
      ) : (
        <>
          {activeTab === 'overview' && <OverviewTab summary={summary} withholdingFiling={withholdingFiling} vatFiling={vatFiling} filterMonth={filterMonth} onMarkFiled={handleMarkFiled} onUnmarkFiled={handleUnmarkFiled} />}
          {activeTab === 'withholding' && <WithholdingTab items={summary.withholdingItems} byType={summary.byType} filing={withholdingFiling} />}
          {activeTab === 'vat' && <VatTab items={summary.vatItems} totalSupply={summary.totalVatSupply} totalVat={summary.totalVatAmount} filing={vatFiling} />}
          {activeTab === 'history' && <HistoryTab companyId={effectiveCompanyId} />}
        </>
      )}
    </div>
  )
}

// ============================================
// 탭 1: 전체 현황
// ============================================
function OverviewTab({ summary, withholdingFiling, vatFiling, filterMonth, onMarkFiled, onUnmarkFiled }: {
  summary: any
  withholdingFiling?: FilingRecord
  vatFiling?: FilingRecord
  filterMonth: string
  onMarkFiled: (type: 'withholding' | 'vat') => void
  onUnmarkFiled: (type: 'withholding' | 'vat') => void
}) {
  const [y, m] = filterMonth.split('-').map(Number)
  const withholdingDeadline = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-10`

  return (
    <div>
      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* 원천세 카드 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>원천세</div>
            {withholdingFiling?.status === 'filed' ? (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700, background: '#d1fae5', color: '#065f46', cursor: 'pointer' }}
                onClick={() => onUnmarkFiled('withholding')}
              >
                신고완료 ✓
              </span>
            ) : (
              <button onClick={() => onMarkFiled('withholding')}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700, background: '#fef3c7', color: '#92400e', border: 'none', cursor: 'pointer' }}
              >
                미신고
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>납부 기한: {withholdingDeadline}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626', marginBottom: 4 }}>{nf(summary.totalWithholdingTax)}원</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            소득세 {nf(summary.totalWithholdingTax)}원 + 지방소득세 {nf(summary.totalLocalTax)}원
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
            = 총 납부액 <b style={{ color: '#dc2626' }}>{nf(summary.totalTaxPayable)}원</b>
          </div>
        </div>

        {/* 부가세 카드 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>부가세 (세금계산서)</div>
            {vatFiling?.status === 'filed' ? (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700, background: '#d1fae5', color: '#065f46', cursor: 'pointer' }}
                onClick={() => onUnmarkFiled('vat')}
              >
                신고완료 ✓
              </span>
            ) : (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700, background: '#e0e7ff', color: '#3730a3' }}>
                분기 신고
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>당월 발행분</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb', marginBottom: 4 }}>{nf(summary.totalVatAmount)}원</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            공급가 {nf(summary.totalVatSupply)}원 / 발행 {summary.vatItems.length}건
          </div>
        </div>

        {/* 소스별 현황 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 16 }}>소스별 현황</div>
          {Object.entries(summary.bySource).map(([label, data]: [string, any]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>{label} ({data.count}건)</span>
              <span style={{ fontWeight: 700, color: '#111827' }}>{nf(data.gross)}원</span>
            </div>
          ))}
          {Object.keys(summary.bySource).length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 20 }}>해당월 세금 데이터 없음</div>
          )}
        </div>
      </div>

      {/* 소득유형별 요약 */}
      {Object.keys(summary.byType).length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, fontSize: 14, color: '#111827' }}>
            소득유형별 원천징수 현황
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['소득유형', '건수', '과세표준', '소득세', '지방소득세', '납부세액합계'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textAlign: h === '소득유형' || h === '건수' ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.byType).map(([type, data]: [string, any]) => {
                  const c = INCOME_TYPE_COLORS[type] || { bg: '#f3f4f6', text: '#374151', label: type }
                  return (
                    <tr key={type} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text }}>{type}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 700, color: '#374151' }}>{data.count}건</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700 }}>{nf(data.gross)}원</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{nf(data.tax)}원</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#6b7280' }}>{nf(data.localTax)}원</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 800, color: '#111827' }}>{nf(data.tax + data.localTax)}원</td>
                    </tr>
                  )
                })}
                {/* 합계 */}
                <tr style={{ background: '#f0f9ff', fontWeight: 800 }}>
                  <td style={{ padding: '12px 16px' }}>합계</td>
                  <td style={{ padding: '12px 16px' }}>{summary.withholdingItems.length}건</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>{nf(summary.withholdingItems.reduce((s: number, i: TaxItem) => s + i.grossAmount, 0))}원</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#dc2626' }}>{nf(summary.totalWithholdingTax)}원</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280' }}>{nf(summary.totalLocalTax)}원</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 15, color: '#dc2626' }}>{nf(summary.totalTaxPayable)}원</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// 탭 2: 원천세 상세
// ============================================
function WithholdingTab({ items, byType, filing }: {
  items: TaxItem[]
  byType: Record<string, any>
  filing?: FilingRecord
}) {
  const [filterType, setFilterType] = useState<string>('all')
  const filtered = filterType === 'all' ? items : items.filter(i => i.incomeType === filterType)

  return (
    <div>
      {/* 필터 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setFilterType('all')}
          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: filterType === 'all' ? 'rgba(45,95,168,0.08)' : '#f8fafc',
            color: filterType === 'all' ? '#2d5fa8' : '#64748b',
            border: filterType === 'all' ? '1px solid rgba(45,95,168,0.3)' : '1px solid #e2e8f0',
          }}>전체 ({items.length})</button>
        {Object.entries(byType).map(([type, data]: [string, any]) => {
          const c = INCOME_TYPE_COLORS[type] || { bg: '#f3f4f6', text: '#374151', label: type }
          return (
            <button key={type} onClick={() => setFilterType(type)}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: filterType === type ? c.bg : '#f8fafc',
                color: filterType === type ? c.text : '#64748b',
                border: filterType === type ? `1px solid ${c.text}40` : '1px solid #e2e8f0',
              }}>{c.label} ({data.count})</button>
          )
        })}
      </div>

      {/* 상세 목록 */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 800 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['소스', '소득유형', '대상자', '지급총액', '세율', '소득세', '지방세', '실지급액', '지급일'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#9ca3af',
                    textAlign: ['지급총액', '소득세', '지방세', '실지급액'].includes(h) ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const c = INCOME_TYPE_COLORS[item.incomeType] || { bg: '#f3f4f6', text: '#374151', label: item.incomeType }
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280' }}>{item.sourceLabel}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: c.bg, color: c.text }}>{c.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#111827' }}>{item.recipientName}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{nf(item.grossAmount)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280' }}>{item.taxRate > 0 ? `${item.taxRate}%` : '세액표'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{nf(item.taxAmount)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280' }}>{nf(item.localTax)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{nf(item.netAmount)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>{item.date?.slice(5)}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>해당월 원천세 대상 항목이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 탭 3: 부가세 (세금계산서)
// ============================================
function VatTab({ items, totalSupply, totalVat, filing }: {
  items: TaxItem[]
  totalSupply: number
  totalVat: number
  filing?: FilingRecord
}) {
  // 매입/매출 분리
  const salesItems = items.filter(i => i.source === 'invoice')  // 매출 세금계산서
  const purchaseItems = items.filter(i => i.source !== 'invoice')  // 매입 세금계산서 (프리랜서, 정산 등)

  const salesSupply = salesItems.reduce((s, i) => s + i.supplyAmount, 0)
  const salesVat = salesItems.reduce((s, i) => s + i.vatAmount, 0)
  const purchaseSupply = purchaseItems.reduce((s, i) => s + i.supplyAmount, 0)
  const purchaseVat = purchaseItems.reduce((s, i) => s + i.vatAmount, 0)

  return (
    <div>
      {/* 매출/매입 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#eff6ff', borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, marginBottom: 8 }}>매출 세금계산서</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1d4ed8' }}>{nf(salesVat)}원</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>공급가 {nf(salesSupply)} / {salesItems.length}건</div>
        </div>
        <div style={{ background: '#fef2f2', borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, marginBottom: 8 }}>매입 세금계산서</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{nf(purchaseVat)}원</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>공급가 {nf(purchaseSupply)} / {purchaseItems.length}건</div>
        </div>
        <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, marginBottom: 8 }}>납부/환급 예상</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: salesVat - purchaseVat >= 0 ? '#dc2626' : '#16a34a' }}>
            {salesVat - purchaseVat >= 0 ? '' : '-'}{nf(Math.abs(salesVat - purchaseVat))}원
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            {salesVat - purchaseVat >= 0 ? '납부' : '환급'} 예상 (당월 기준)
          </div>
        </div>
      </div>

      {/* 세금계산서 목록 */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, fontSize: 14, color: '#111827' }}>
          세금계산서 내역
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['구분', '소스', '거래처', '공급가액', '부가세', '합계금액', '발행일'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#9ca3af',
                    textAlign: ['공급가액', '부가세', '합계금액'].includes(h) ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...salesItems.map(i => ({ ...i, category: '매출' })), ...purchaseItems.map(i => ({ ...i, category: '매입' }))].map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: item.category === '매출' ? '#dbeafe' : '#fef2f2',
                      color: item.category === '매출' ? '#1d4ed8' : '#dc2626',
                    }}>{item.category}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280' }}>{item.sourceLabel}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#111827' }}>{item.recipientName}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{nf(item.supplyAmount)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>{nf(item.vatAmount)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800 }}>{nf(item.grossAmount)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>{item.date?.slice(5)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>해당월 세금계산서 발행 내역이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 탭 4: 신고 이력
// ============================================
function HistoryTab({ companyId }: { companyId: string }) {
  const [records, setRecords] = useState<FilingRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('tax_filing_records')
        .select('*')
        .eq('company_id', companyId)
        .order('tax_period', { ascending: false })
        .limit(24)
      setRecords((data || []) as FilingRecord[])
      setLoading(false)
    }
    fetch()
  }, [companyId])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, fontSize: 14, color: '#111827' }}>
        세금 신고 이력
      </div>
      {records.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p>아직 신고 이력이 없습니다.</p>
          <p style={{ fontSize: 12 }}>전체 현황 탭에서 신고완료를 클릭하면 이력이 기록됩니다.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['기간', '구분', '과세표준', '세액', '지방세', '상태', '신고일'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#9ca3af',
                    textAlign: ['과세표준', '세액', '지방세'].includes(h) ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700 }}>{r.tax_period}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: r.tax_type === 'withholding' ? '#fef3c7' : '#dbeafe',
                      color: r.tax_type === 'withholding' ? '#92400e' : '#1d4ed8',
                    }}>{r.tax_type === 'withholding' ? '원천세' : '부가세'}</span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{nf(r.total_taxable_amount)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{nf(r.total_tax_amount)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280' }}>{nf(r.total_local_tax)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700,
                      color: r.status === 'filed' ? '#16a34a' : r.status === 'paid' ? '#2563eb' : '#f59e0b',
                    }}>
                      {r.status === 'filed' ? '신고완료' : r.status === 'paid' ? '납부완료' : '미신고'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>
                    {r.filed_at ? new Date(r.filed_at).toLocaleDateString('ko-KR') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

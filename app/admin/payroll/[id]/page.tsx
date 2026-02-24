'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../utils/supabase'
import { useApp } from '../../../context/AppContext'
import { useRouter, useParams } from 'next/navigation'
import { calculatePayroll } from '../../../utils/payroll-calc'

// ============================================
// 급여명세서 상세 페이지
// - 급여 상세 폼 (수당/공제 수정)
// - 급여명세서 미리보기 + PDF 다운로드
// - 상태 변경 (draft → confirmed → paid)
// ============================================

export default function PayslipDetailPage() {
  const router = useRouter()
  const params = useParams()
  const payslipId = params.id as string
  const { company } = useApp()

  const [payslip, setPayslip] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  // 편집 폼 상태
  const [editBaseSalary, setEditBaseSalary] = useState('')
  const [editAllowances, setEditAllowances] = useState<Record<string, string>>({})
  const [editTaxType, setEditTaxType] = useState('근로소득')
  const [editMemo, setEditMemo] = useState('')

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }, [])

  const loadPayslip = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/payroll/${payslipId}`, { headers })
      if (res.ok) {
        const { data } = await res.json()
        setPayslip(data)
        setEditBaseSalary(String(data.base_salary || 0))
        setEditTaxType(data.tax_type || '근로소득')
        setEditMemo(data.memo || '')
        const ad = data.allowance_details || {}
        setEditAllowances(Object.fromEntries(
          Object.entries({ '식대': 0, '교통비': 0, '직책수당': 0, ...ad }).map(([k, v]) => [k, String(v)])
        ))
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [payslipId, getAuthHeaders])

  useEffect(() => { loadPayslip() }, [loadPayslip])

  // 저장
  const handleSave = async () => {
    setSaving(true)
    try {
      const allowanceDetails: Record<string, number> = {}
      for (const [k, v] of Object.entries(editAllowances)) {
        const n = Number(v.replace(/,/g, ''))
        if (n > 0) allowanceDetails[k] = n
      }

      const headers = await getAuthHeaders()
      const res = await fetch(`/api/payroll/${payslipId}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          base_salary: Number(editBaseSalary.replace(/,/g, '')) || 0,
          allowance_details: allowanceDetails,
          tax_type: editTaxType,
          memo: editMemo,
        }),
      })
      if (res.ok) {
        loadPayslip()
      } else {
        const err = await res.json()
        alert(err.error)
      }
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  // 상태 변경
  const handleAction = async (action: 'confirm' | 'pay') => {
    const label = action === 'confirm' ? '확정' : '지급 처리'
    if (!confirm(`이 급여를 ${label}하시겠습니까?`)) return
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/payroll/${payslipId}`, {
        method: 'POST', headers,
        body: JSON.stringify({ action }),
      })
      if (res.ok) loadPayslip()
      else {
        const err = await res.json()
        alert(err.error)
      }
    } catch (e: any) { alert(e.message) }
  }

  // PDF 생성
  const handleGeneratePDF = async () => {
    if (!previewRef.current) return
    setGenerating(true)
    try {
      const htmlToImage = await import('html-to-image')
      const { jsPDF } = await import('jspdf')

      const canvas = await htmlToImage.toCanvas(previewRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)

      const empName = payslip?.employee?.employee_name || '직원'
      pdf.save(`${payslip.pay_period}_${empName}_급여명세서.pdf`)
    } catch (e: any) {
      alert('PDF 생성 실패: ' + e.message)
    }
    setGenerating(false)
  }

  const fmt = (n: number) => Number(n || 0).toLocaleString()

  if (loading) {
    return (
      <div className="p-6 md:p-10">
        <div className="animate-pulse text-gray-400 font-bold text-center py-20">불러오는 중...</div>
      </div>
    )
  }

  if (!payslip) {
    return (
      <div className="p-6 md:p-10 text-center text-gray-500">
        <p className="text-xl font-bold">급여명세서를 찾을 수 없습니다.</p>
        <button onClick={() => router.back()} className="mt-4 text-blue-600 underline">돌아가기</button>
      </div>
    )
  }

  const empName = payslip.employee?.employee_name || '-'
  const empDept = payslip.employee?.department?.name || '-'
  const empPos = payslip.employee?.position?.name || '-'
  const bankInfo = payslip.salary_info
  const isEditable = payslip.status === 'draft'

  // 실시간 계산
  const calcAllowances: Record<string, number> = {}
  for (const [k, v] of Object.entries(editAllowances)) {
    const n = Number((v as string).replace(/,/g, ''))
    if (n > 0) calcAllowances[k] = n
  }
  const liveCalc = calculatePayroll({
    baseSalary: Number(editBaseSalary.replace(/,/g, '')) || 0,
    allowances: calcAllowances,
    taxType: editTaxType as '근로소득' | '사업소득3.3%',
  })

  return (
    <div className="p-4 md:p-8 max-w-[1200px] mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div>
          <button onClick={() => router.push('/admin/payroll')} className="text-sm text-gray-400 hover:text-gray-600 mb-1">&larr; 급여 관리로 돌아가기</button>
          <h1 className="text-2xl font-black text-gray-900">
            {empName} - {payslip.pay_period} 급여명세서
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {empDept} / {empPos}
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
              payslip.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
              payslip.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {payslip.status === 'paid' ? '지급완료' : payslip.status === 'confirmed' ? '확정' : '초안'}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGeneratePDF}
            disabled={generating}
            className="py-2.5 px-4 bg-gray-800 text-white text-sm rounded-xl font-bold hover:bg-gray-900 disabled:opacity-50"
          >
            {generating ? '생성 중...' : '📄 PDF 다운로드'}
          </button>
          {payslip.status === 'draft' && (
            <button onClick={() => handleAction('confirm')} className="py-2.5 px-4 bg-blue-600 text-white text-sm rounded-xl font-bold hover:bg-blue-700">
              ✅ 확정
            </button>
          )}
          {payslip.status === 'confirmed' && (
            <button onClick={() => handleAction('pay')} className="py-2.5 px-4 bg-emerald-600 text-white text-sm rounded-xl font-bold hover:bg-emerald-700">
              💳 지급 처리
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── 좌: 편집 폼 ── */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
            <h3 className="text-sm font-black text-gray-700 mb-3">지급 내역</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">기본급</label>
                <input
                  type="text"
                  value={editBaseSalary}
                  onChange={e => setEditBaseSalary(e.target.value.replace(/[^0-9]/g, ''))}
                  disabled={!isEditable}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold disabled:bg-gray-50"
                />
              </div>
              {Object.entries(editAllowances).map(([key, val]) => (
                <div key={key}>
                  <label className="text-xs font-bold text-gray-400 block mb-1">{key}</label>
                  <input
                    type="text"
                    value={val}
                    onChange={e => setEditAllowances(prev => ({ ...prev, [key]: e.target.value.replace(/[^0-9]/g, '') }))}
                    disabled={!isEditable}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-gray-50"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">과세 유형</label>
                <select
                  value={editTaxType}
                  onChange={e => setEditTaxType(e.target.value)}
                  disabled={!isEditable}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-gray-50"
                >
                  <option value="근로소득">근로소득</option>
                  <option value="사업소득3.3%">사업소득 3.3%</option>
                </select>
              </div>
            </div>
          </div>

          {/* 공제 내역 */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
            <h3 className="text-sm font-black text-gray-700 mb-3">공제 내역 (자동 계산)</h3>
            <div className="space-y-2 text-sm">
              {editTaxType === '근로소득' ? (
                <>
                  <div className="flex justify-between"><span className="text-gray-500">국민연금</span><span className="font-bold text-red-500">-{fmt(liveCalc.nationalPension)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">건강보험</span><span className="font-bold text-red-500">-{fmt(liveCalc.healthInsurance)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">장기요양보험</span><span className="font-bold text-red-500">-{fmt(liveCalc.longCareInsurance)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">고용보험</span><span className="font-bold text-red-500">-{fmt(liveCalc.employmentInsurance)}원</span></div>
                  <hr className="border-gray-100" />
                  <div className="flex justify-between"><span className="text-gray-500">근로소득세</span><span className="font-bold text-red-500">-{fmt(liveCalc.incomeTax)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">지방소득세</span><span className="font-bold text-red-500">-{fmt(liveCalc.localIncomeTax)}원</span></div>
                </>
              ) : (
                <>
                  <div className="flex justify-between"><span className="text-gray-500">사업소득세 (3%)</span><span className="font-bold text-red-500">-{fmt(liveCalc.incomeTax)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">지방소득세 (0.3%)</span><span className="font-bold text-red-500">-{fmt(liveCalc.localIncomeTax)}원</span></div>
                </>
              )}
              <hr className="border-gray-200" />
              <div className="flex justify-between font-bold"><span>총 공제액</span><span className="text-red-600">-{fmt(liveCalc.totalDeductions)}원</span></div>
            </div>
          </div>

          {/* 메모 + 저장 */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
            <label className="text-xs font-bold text-gray-400 block mb-1">메모</label>
            <textarea
              value={editMemo}
              onChange={e => setEditMemo(e.target.value)}
              disabled={!isEditable}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-gray-50"
            />
            {isEditable && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full mt-3 py-2.5 bg-steel-600 text-white rounded-xl text-sm font-bold hover:bg-steel-700 disabled:opacity-50"
              >
                {saving ? '저장 중...' : '💾 저장 (재계산)'}
              </button>
            )}
          </div>

          {/* 계좌 정보 */}
          {bankInfo && (
            <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-600">
              <span className="font-bold text-gray-700">입금 계좌:</span> {bankInfo.bank_name} {bankInfo.account_number} ({bankInfo.account_holder})
            </div>
          )}
        </div>

        {/* ── 우: 급여명세서 미리보기 ── */}
        <div>
          <div ref={previewRef} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6" style={{ fontFamily: "'Apple SD Gothic Neo', -apple-system, sans-serif" }}>
            {/* 헤더 */}
            <div className="text-center mb-6">
              <div className="inline-block bg-[#1B3A5C] text-white text-[10px] font-black px-3 py-1 rounded-md tracking-widest mb-3">SELF-DISRUPTION</div>
              <h2 className="text-xl font-black text-gray-900">급여명세서</h2>
              <p className="text-sm text-gray-500 mt-1">{payslip.pay_period}</p>
            </div>

            {/* 직원 정보 */}
            <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2 bg-gray-50 font-bold text-gray-500 w-24">성명</td>
                    <td className="px-3 py-2 font-bold">{empName}</td>
                    <td className="px-3 py-2 bg-gray-50 font-bold text-gray-500 w-24">부서</td>
                    <td className="px-3 py-2">{empDept}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 bg-gray-50 font-bold text-gray-500">직급</td>
                    <td className="px-3 py-2">{empPos}</td>
                    <td className="px-3 py-2 bg-gray-50 font-bold text-gray-500">과세유형</td>
                    <td className="px-3 py-2">{payslip.tax_type}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 지급 / 공제 테이블 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* 지급 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-blue-50 px-3 py-2 text-sm font-black text-blue-700">지급 내역</div>
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-3 py-1.5 text-gray-500">기본급</td>
                      <td className="px-3 py-1.5 text-right font-bold">{fmt(liveCalc.baseSalary)}</td>
                    </tr>
                    {Object.entries(calcAllowances).map(([k, v]) => (
                      <tr key={k} className="border-b border-gray-100">
                        <td className="px-3 py-1.5 text-gray-500">{k}</td>
                        <td className="px-3 py-1.5 text-right font-bold">{fmt(v)}</td>
                      </tr>
                    ))}
                    <tr className="bg-blue-50">
                      <td className="px-3 py-2 font-black text-blue-700">총 지급액</td>
                      <td className="px-3 py-2 text-right font-black text-blue-700">{fmt(liveCalc.grossSalary)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 공제 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-red-50 px-3 py-2 text-sm font-black text-red-600">공제 내역</div>
                <table className="w-full text-xs">
                  <tbody>
                    {editTaxType === '근로소득' ? (
                      <>
                        <tr className="border-b border-gray-100"><td className="px-3 py-1.5 text-gray-500">국민연금</td><td className="px-3 py-1.5 text-right font-bold">{fmt(liveCalc.nationalPension)}</td></tr>
                        <tr className="border-b border-gray-100"><td className="px-3 py-1.5 text-gray-500">건강보험</td><td className="px-3 py-1.5 text-right font-bold">{fmt(liveCalc.healthInsurance)}</td></tr>
                        <tr className="border-b border-gray-100"><td className="px-3 py-1.5 text-gray-500">장기요양</td><td className="px-3 py-1.5 text-right font-bold">{fmt(liveCalc.longCareInsurance)}</td></tr>
                        <tr className="border-b border-gray-100"><td className="px-3 py-1.5 text-gray-500">고용보험</td><td className="px-3 py-1.5 text-right font-bold">{fmt(liveCalc.employmentInsurance)}</td></tr>
                        <tr className="border-b border-gray-100"><td className="px-3 py-1.5 text-gray-500">소득세</td><td className="px-3 py-1.5 text-right font-bold">{fmt(liveCalc.incomeTax)}</td></tr>
                        <tr className="border-b border-gray-100"><td className="px-3 py-1.5 text-gray-500">지방소득세</td><td className="px-3 py-1.5 text-right font-bold">{fmt(liveCalc.localIncomeTax)}</td></tr>
                      </>
                    ) : (
                      <>
                        <tr className="border-b border-gray-100"><td className="px-3 py-1.5 text-gray-500">사업소득세</td><td className="px-3 py-1.5 text-right font-bold">{fmt(liveCalc.incomeTax)}</td></tr>
                        <tr className="border-b border-gray-100"><td className="px-3 py-1.5 text-gray-500">지방소득세</td><td className="px-3 py-1.5 text-right font-bold">{fmt(liveCalc.localIncomeTax)}</td></tr>
                      </>
                    )}
                    <tr className="bg-red-50">
                      <td className="px-3 py-2 font-black text-red-600">총 공제액</td>
                      <td className="px-3 py-2 text-right font-black text-red-600">{fmt(liveCalc.totalDeductions)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 실수령액 */}
            <div className="bg-gradient-to-r from-[#1B3A5C] to-[#2C5282] rounded-xl p-4 text-center">
              <p className="text-xs text-white/70 font-bold mb-1">실수령액</p>
              <p className="text-2xl font-black text-white">{fmt(liveCalc.netSalary)}원</p>
            </div>

            {/* 하단 안내 */}
            <p className="text-[10px] text-gray-400 text-center mt-4">
              본 급여명세서는 {payslip.pay_period} 기준으로 작성되었습니다. 4대보험료는 2025년 요율 기준으로 자동 계산됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

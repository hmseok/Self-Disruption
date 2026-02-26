'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useRouter } from 'next/navigation'
import { calculatePayroll } from '../../utils/payroll-calc'

// ============================================
// 급여 관리 메인 페이지 (3탭)
// 탭1: 급여 대장 (월별 전직원 급여 리스트)
// 탭2: 급여 설정 (직원별 기본급/수당/계좌)
// 탭3: 실비 정산 (법인카드/영수증 정산 내역)
// ============================================

type Tab = 'ledger' | 'settings' | 'expenses'

interface EmployeeSalary {
  id: string
  employee_id: string
  base_salary: number
  allowances: Record<string, number>
  payment_day: number
  tax_type: string
  bank_name: string | null
  account_number: string | null
  account_holder: string | null
  is_active: boolean
  employee: {
    id: string
    employee_name: string
    email: string
    phone: string
    position?: { name: string }
    department?: { name: string }
  }
}

interface Payslip {
  id: string
  employee_id: string
  pay_period: string
  base_salary: number
  total_allowances: number
  gross_salary: number
  national_pension: number
  health_insurance: number
  long_care_insurance: number
  employment_insurance: number
  income_tax: number
  local_income_tax: number
  total_deductions: number
  net_salary: number
  status: string
  tax_type: string
  paid_date: string | null
  employee?: {
    id: string
    employee_name: string
    position?: { name: string }
    department?: { name: string }
  }
}

export default function PayrollPage() {
  const router = useRouter()
  const { company, role, adminSelectedCompanyId } = useApp()
  const activeCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  const [activeTab, setActiveTab] = useState<Tab>('ledger')
  const [loading, setLoading] = useState(false)

  // ── 탭1: 급여 대장 ──
  const [payPeriod, setPayPeriod] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [generating, setGenerating] = useState(false)

  // ── 탭2: 급여 설정 ──
  const [salarySettings, setSalarySettings] = useState<EmployeeSalary[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [showSettingModal, setShowSettingModal] = useState(false)
  const [editingSetting, setEditingSetting] = useState<any>(null)

  // ── 탭2 모달 폼 ──
  const [formEmployeeId, setFormEmployeeId] = useState('')
  const [formBaseSalary, setFormBaseSalary] = useState('')
  const [formTaxType, setFormTaxType] = useState('근로소득')
  const [formPaymentDay, setFormPaymentDay] = useState('25')
  const [formBankName, setFormBankName] = useState('')
  const [formAccountNumber, setFormAccountNumber] = useState('')
  const [formAccountHolder, setFormAccountHolder] = useState('')
  const [formAllowances, setFormAllowances] = useState<Record<string, string>>({
    '식대': '200000', '교통비': '0', '직책수당': '0',
  })

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }, [])

  // ── 데이터 로드 ──
  const loadPayslips = useCallback(async () => {
    if (!activeCompanyId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('payslips')
        .select(`*, employee:employee_id(id, employee_name, position:position_id(name), department:department_id(name))`)
        .eq('company_id', activeCompanyId)
        .eq('pay_period', payPeriod)
        .order('created_at', { ascending: false })
      if (!error && data) setPayslips(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [activeCompanyId, payPeriod])

  const loadSalarySettings = useCallback(async () => {
    if (!activeCompanyId) return
    setLoading(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/payroll?company_id=${activeCompanyId}`, { headers })
      if (res.ok) {
        const { data } = await res.json()
        setSalarySettings(data || [])
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [activeCompanyId, getAuthHeaders])

  const loadEmployees = useCallback(async () => {
    if (!activeCompanyId) return
    const { data } = await supabase
      .from('profiles')
      .select('id, employee_name, email, position:position_id(name), department:department_id(name)')
      .eq('company_id', activeCompanyId)
    if (data) setEmployees(data)
  }, [activeCompanyId])

  useEffect(() => {
    if (!activeCompanyId) return
    if (activeTab === 'ledger') loadPayslips()
    if (activeTab === 'settings') { loadSalarySettings(); loadEmployees() }
  }, [activeTab, activeCompanyId, payPeriod, loadPayslips, loadSalarySettings, loadEmployees])

  // ── 급여 일괄 생성 ──
  const handleGenerate = async () => {
    if (!activeCompanyId || generating) return
    if (!confirm(`${payPeriod} 급여를 일괄 생성하시겠습니까?`)) return

    setGenerating(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/payroll/generate', {
        method: 'POST', headers,
        body: JSON.stringify({ company_id: activeCompanyId, pay_period: payPeriod }),
      })
      const result = await res.json()
      if (res.ok) {
        alert(`${result.created}명 급여 생성 완료${result.skipped > 0 ? ` (${result.skipped}명 이미 존재)` : ''}`)
        loadPayslips()
      } else {
        alert(result.error || '오류 발생')
      }
    } catch (e: any) { alert(e.message) }
    setGenerating(false)
  }

  // ── 급여 설정 저장 ──
  const handleSaveSetting = async () => {
    if (!activeCompanyId || !formEmployeeId) return

    const allowancesNum: Record<string, number> = {}
    for (const [k, v] of Object.entries(formAllowances)) {
      const n = Number(v.replace(/,/g, ''))
      if (n > 0) allowancesNum[k] = n
    }

    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/payroll', {
        method: 'POST', headers,
        body: JSON.stringify({
          company_id: activeCompanyId,
          employee_id: formEmployeeId,
          base_salary: Number(formBaseSalary.replace(/,/g, '')) || 0,
          allowances: allowancesNum,
          tax_type: formTaxType,
          payment_day: Number(formPaymentDay) || 25,
          bank_name: formBankName || null,
          account_number: formAccountNumber || null,
          account_holder: formAccountHolder || null,
        }),
      })
      if (res.ok) {
        setShowSettingModal(false)
        loadSalarySettings()
      } else {
        const err = await res.json()
        alert(err.error)
      }
    } catch (e: any) { alert(e.message) }
  }

  const openEditSetting = (s: EmployeeSalary) => {
    setEditingSetting(s)
    setFormEmployeeId(s.employee_id)
    setFormBaseSalary(String(s.base_salary))
    setFormTaxType(s.tax_type)
    setFormPaymentDay(String(s.payment_day))
    setFormBankName(s.bank_name || '')
    setFormAccountNumber(s.account_number || '')
    setFormAccountHolder(s.account_holder || '')
    const a = s.allowances || {}
    setFormAllowances({
      '식대': String(a['식대'] || 0),
      '교통비': String(a['교통비'] || 0),
      '직책수당': String(a['직책수당'] || 0),
      ...Object.fromEntries(Object.entries(a).filter(([k]) => !['식대', '교통비', '직책수당'].includes(k)).map(([k, v]) => [k, String(v)])),
    })
    setShowSettingModal(true)
  }

  const openNewSetting = () => {
    setEditingSetting(null)
    setFormEmployeeId('')
    setFormBaseSalary('')
    setFormTaxType('근로소득')
    setFormPaymentDay('25')
    setFormBankName('')
    setFormAccountNumber('')
    setFormAccountHolder('')
    setFormAllowances({ '식대': '200000', '교통비': '0', '직책수당': '0' })
    setShowSettingModal(true)
  }

  // ── 상태 변경 (확정/지급) ──
  const handleStatusChange = async (payslipId: string, action: 'confirm' | 'pay') => {
    const label = action === 'confirm' ? '확정' : '지급 처리'
    if (!confirm(`선택한 급여를 ${label}하시겠습니까?`)) return

    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/payroll/${payslipId}`, {
        method: 'POST', headers,
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        loadPayslips()
      } else {
        const err = await res.json()
        alert(err.error)
      }
    } catch (e: any) { alert(e.message) }
  }

  // 일괄 확정
  const handleBulkConfirm = async () => {
    const drafts = payslips.filter(p => p.status === 'draft')
    if (drafts.length === 0) return alert('확정할 급여가 없습니다.')
    if (!confirm(`${drafts.length}건을 일괄 확정하시겠습니까?`)) return

    const headers = await getAuthHeaders()
    for (const p of drafts) {
      await fetch(`/api/payroll/${p.id}`, {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'confirm' }),
      })
    }
    loadPayslips()
  }

  // ── 금액 포맷 ──
  const fmt = (n: number) => Number(n || 0).toLocaleString()

  // ── 탭 메뉴 ──
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'ledger', label: '급여 대장', icon: '📋' },
    { key: 'settings', label: '급여 설정', icon: '⚙️' },
    { key: 'expenses', label: '실비 정산', icon: '🧾' },
  ]

  // 통계
  const totalGross = payslips.reduce((s, p) => s + Number(p.gross_salary), 0)
  const totalNet = payslips.reduce((s, p) => s + Number(p.net_salary), 0)
  const totalDeductions = payslips.reduce((s, p) => s + Number(p.total_deductions), 0)
  const draftCount = payslips.filter(p => p.status === 'draft').length
  const confirmedCount = payslips.filter(p => p.status === 'confirmed').length
  const paidCount = payslips.filter(p => p.status === 'paid').length

  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="p-12 md:p-20 text-center text-gray-400 text-sm bg-white rounded-2xl">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  if (!activeCompanyId) {
    return (
      <div className="p-6 md:p-10">
        <h1 className="text-2xl md:text-3xl font-black text-gray-900 mb-4">💰 급여 관리</h1>
        <p className="text-gray-500">회사를 선택해주세요.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">💰 급여 관리</h1>
          <p className="text-gray-500 text-sm mt-1">직원 급여 산정 및 지급 관리</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════ 탭1: 급여 대장 ════════════ */}
      {activeTab === 'ledger' && (
        <div>
          {/* 월 선택 + 생성 버튼 */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="month"
              value={payPeriod}
              onChange={e => setPayPeriod(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold"
            />
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="py-2.5 px-5 bg-steel-600 text-white text-sm rounded-xl font-bold hover:bg-steel-700 transition-colors disabled:opacity-50"
            >
              {generating ? '생성 중...' : '📊 급여 일괄 생성'}
            </button>
            {draftCount > 0 && (
              <button
                onClick={handleBulkConfirm}
                className="py-2.5 px-5 bg-emerald-600 text-white text-sm rounded-xl font-bold hover:bg-emerald-700 transition-colors"
              >
                ✅ 일괄 확정 ({draftCount}건)
              </button>
            )}
          </div>

          {/* 통계 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-white p-3 md:p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-400 font-bold">총 인원</p>
              <p className="text-lg md:text-xl font-black text-gray-800 mt-1">{payslips.length}<span className="text-xs text-gray-400 ml-0.5">명</span></p>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-400 font-bold">총 지급액</p>
              <p className="text-lg md:text-xl font-black text-blue-600 mt-1">{fmt(totalGross)}<span className="text-xs text-gray-400 ml-0.5">원</span></p>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-400 font-bold">총 공제액</p>
              <p className="text-lg md:text-xl font-black text-red-500 mt-1">{fmt(totalDeductions)}<span className="text-xs text-gray-400 ml-0.5">원</span></p>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-400 font-bold">총 실수령</p>
              <p className="text-lg md:text-xl font-black text-emerald-600 mt-1">{fmt(totalNet)}<span className="text-xs text-gray-400 ml-0.5">원</span></p>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-400 font-bold">상태</p>
              <p className="text-sm font-bold mt-1">
                <span className="text-yellow-600">초안 {draftCount}</span> · <span className="text-blue-600">확정 {confirmedCount}</span> · <span className="text-emerald-600">지급 {paidCount}</span>
              </p>
            </div>
          </div>

          {/* 급여 테이블 */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="p-20 text-center text-gray-400 font-bold animate-pulse">불러오는 중...</div>
            ) : payslips.length === 0 ? (
              <div className="p-20 text-center text-gray-400">
                <p className="text-4xl mb-2">📋</p>
                <p className="font-bold">{payPeriod} 급여 데이터가 없습니다</p>
                <p className="text-sm mt-1">위 &quot;급여 일괄 생성&quot; 버튼을 눌러주세요</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left font-bold text-gray-500">직원</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-500">부서/직급</th>
                      <th className="px-4 py-3 text-right font-bold text-gray-500">기본급</th>
                      <th className="px-4 py-3 text-right font-bold text-gray-500">수당</th>
                      <th className="px-4 py-3 text-right font-bold text-gray-500">총 지급</th>
                      <th className="px-4 py-3 text-right font-bold text-gray-500">공제</th>
                      <th className="px-4 py-3 text-right font-bold text-gray-500">실수령</th>
                      <th className="px-4 py-3 text-center font-bold text-gray-500">상태</th>
                      <th className="px-4 py-3 text-center font-bold text-gray-500">액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payslips.map(p => (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-800">
                          {p.employee?.employee_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {p.employee?.department?.name || '-'} / {p.employee?.position?.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(p.base_salary)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(p.total_allowances)}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600">{fmt(p.gross_salary)}</td>
                        <td className="px-4 py-3 text-right text-red-500">-{fmt(p.total_deductions)}</td>
                        <td className="px-4 py-3 text-right font-black text-emerald-600">{fmt(p.net_salary)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                            p.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {p.status === 'paid' ? '지급완료' : p.status === 'confirmed' ? '확정' : '초안'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => router.push(`/admin/payroll/${p.id}`)}
                              className="px-2 py-1 text-xs bg-gray-100 rounded-lg hover:bg-gray-200 font-bold"
                            >상세</button>
                            {p.status === 'draft' && (
                              <button
                                onClick={() => handleStatusChange(p.id, 'confirm')}
                                className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-bold"
                              >확정</button>
                            )}
                            {p.status === 'confirmed' && (
                              <button
                                onClick={() => handleStatusChange(p.id, 'pay')}
                                className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-bold"
                              >지급</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ 탭2: 급여 설정 ════════════ */}
      {activeTab === 'settings' && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={openNewSetting}
              className="py-2.5 px-5 bg-steel-600 text-white text-sm rounded-xl font-bold hover:bg-steel-700 transition-colors"
            >
              + 급여 설정 추가
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="p-20 text-center text-gray-400 font-bold animate-pulse">불러오는 중...</div>
            ) : salarySettings.length === 0 ? (
              <div className="p-20 text-center text-gray-400">
                <p className="text-4xl mb-2">⚙️</p>
                <p className="font-bold">급여 설정이 없습니다</p>
                <p className="text-sm mt-1">직원별 급여를 설정해주세요</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left font-bold text-gray-500">직원</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-500">부서/직급</th>
                      <th className="px-4 py-3 text-right font-bold text-gray-500">기본급</th>
                      <th className="px-4 py-3 text-right font-bold text-gray-500">수당 합계</th>
                      <th className="px-4 py-3 text-center font-bold text-gray-500">과세유형</th>
                      <th className="px-4 py-3 text-center font-bold text-gray-500">급여일</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-500">계좌</th>
                      <th className="px-4 py-3 text-center font-bold text-gray-500">상태</th>
                      <th className="px-4 py-3 text-center font-bold text-gray-500">수정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salarySettings.map(s => {
                      const totalAllow = Object.values(s.allowances || {}).reduce((a, b) => a + b, 0)
                      return (
                        <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-bold text-gray-800">{s.employee?.employee_name || '-'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {s.employee?.department?.name || '-'} / {s.employee?.position?.name || '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-bold">{fmt(s.base_salary)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{fmt(totalAllow)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              s.tax_type === '사업소득3.3%' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                            }`}>{s.tax_type}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">{s.payment_day}일</td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {s.bank_name ? `${s.bank_name} ${s.account_number || ''}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                              {s.is_active ? '활성' : '비활성'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => openEditSetting(s)}
                              className="px-3 py-1 text-xs bg-gray-100 rounded-lg hover:bg-gray-200 font-bold"
                            >수정</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 설정 모달 */}
          {showSettingModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
                <h3 className="text-lg font-black mb-4">{editingSetting ? '급여 설정 수정' : '급여 설정 추가'}</h3>

                <div className="space-y-4">
                  {/* 직원 선택 */}
                  {!editingSetting && (
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">직원</label>
                      <select
                        value={formEmployeeId}
                        onChange={e => setFormEmployeeId(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                      >
                        <option value="">선택해주세요</option>
                        {employees
                          .filter(e => !salarySettings.find(s => s.employee_id === e.id))
                          .map(e => (
                            <option key={e.id} value={e.id}>{e.employee_name} ({e.email})</option>
                          ))}
                      </select>
                    </div>
                  )}

                  {/* 기본급 */}
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">기본급 (원)</label>
                    <input
                      type="text"
                      value={formBaseSalary}
                      onChange={e => setFormBaseSalary(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                      placeholder="2500000"
                    />
                  </div>

                  {/* 수당 */}
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">수당</label>
                    {Object.entries(formAllowances).map(([key, val]) => (
                      <div key={key} className="flex gap-2 mb-2">
                        <input
                          value={key}
                          readOnly
                          className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-gray-50"
                        />
                        <input
                          type="text"
                          value={val}
                          onChange={e => setFormAllowances(prev => ({ ...prev, [key]: e.target.value.replace(/[^0-9]/g, '') }))}
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>

                  {/* 과세 유형 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">과세 유형</label>
                      <select
                        value={formTaxType}
                        onChange={e => setFormTaxType(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                      >
                        <option value="근로소득">근로소득</option>
                        <option value="사업소득3.3%">사업소득 3.3%</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">급여일</label>
                      <input
                        type="number"
                        min="1" max="31"
                        value={formPaymentDay}
                        onChange={e => setFormPaymentDay(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                      />
                    </div>
                  </div>

                  {/* 계좌 정보 */}
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">계좌 정보</label>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        value={formBankName}
                        onChange={e => setFormBankName(e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                        placeholder="은행명"
                      />
                      <input
                        value={formAccountNumber}
                        onChange={e => setFormAccountNumber(e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                        placeholder="계좌번호"
                      />
                      <input
                        value={formAccountHolder}
                        onChange={e => setFormAccountHolder(e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                        placeholder="예금주"
                      />
                    </div>
                  </div>

                  {/* 미리보기 */}
                  {formBaseSalary && (
                    <div className="bg-gray-50 rounded-xl p-3 text-xs">
                      <p className="font-bold text-gray-700 mb-2">예상 급여 계산</p>
                      {(() => {
                        const allow: Record<string, number> = {}
                        for (const [k, v] of Object.entries(formAllowances)) {
                          const n = Number(v.replace(/,/g, ''))
                          if (n > 0) allow[k] = n
                        }
                        const calc = calculatePayroll({
                          baseSalary: Number(formBaseSalary.replace(/,/g, '')) || 0,
                          allowances: allow,
                          taxType: formTaxType as '근로소득' | '사업소득3.3%',
                        })
                        return (
                          <div className="grid grid-cols-2 gap-1 text-gray-600">
                            <span>총 지급액</span><span className="text-right font-bold text-blue-600">{fmt(calc.grossSalary)}원</span>
                            <span>4대보험</span><span className="text-right text-red-500">-{fmt(calc.nationalPension + calc.healthInsurance + calc.longCareInsurance + calc.employmentInsurance)}원</span>
                            <span>소득세+지방세</span><span className="text-right text-red-500">-{fmt(calc.incomeTax + calc.localIncomeTax)}원</span>
                            <span className="font-bold text-gray-800">실수령액</span><span className="text-right font-black text-emerald-600">{fmt(calc.netSalary)}원</span>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-6">
                  <button onClick={() => setShowSettingModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold hover:bg-gray-50">취소</button>
                  <button onClick={handleSaveSetting} className="flex-1 py-2.5 bg-steel-600 text-white rounded-xl text-sm font-bold hover:bg-steel-700">저장</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════ 탭3: 실비 정산 ════════════ */}
      {activeTab === 'expenses' && (
        <div>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center text-gray-400">
            <p className="text-4xl mb-3">🧾</p>
            <p className="font-bold text-lg">실비 정산</p>
            <p className="text-sm mt-2">
              재무 관리 &gt; 거래 업로드에서 법인카드/영수증을 등록하면<br/>
              급여 생성 시 자동으로 정산 내역이 반영됩니다.
            </p>
            <button
              onClick={() => router.push('/finance/upload')}
              className="mt-4 px-6 py-2.5 bg-steel-600 text-white rounded-xl text-sm font-bold hover:bg-steel-700 transition-colors"
            >
              거래 업로드로 이동
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import {
  calculatePayroll, reverseCalculatePayroll,
  annualToMonthly, hourlyToMonthly, dailyToMonthly,
  ALLOWANCE_TYPES, DEDUCTION_TYPES, EMPLOYMENT_TYPES, SALARY_TYPES,
} from '../../utils/payroll-calc'

// ────────────────────────────────────────────────────────────────
// Auth Helper
// ────────────────────────────────────────────────────────────────
async function getAuthHeader(): Promise<Record<string, string>> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('sb-auth-token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ════════════════════════════════════════════════════════════════
// 급여 관리 통합 (v4 — 급여+프리랜서+용역비 통합)
// ════════════════════════════════════════════════════════════════

type Tab = 'ledger' | 'settings' | 'freelancers' | 'meals' | 'analytics'

interface EmployeeSalary {
  id: string; employee_id: string; base_salary: number; allowances: Record<string, number>
  payment_day: number; tax_type: string; bank_name: string | null; account_number: string | null
  account_holder: string | null; is_active: boolean
  employment_type?: string; salary_type?: string; annual_salary?: number; hourly_rate?: number
  daily_rate?: number; working_hours_per_week?: number; dependents_count?: number
  net_salary_mode?: boolean; target_net_salary?: number
  custom_deductions?: Record<string, number>; expanded_allowances?: Record<string, number>
}

interface Payslip {
  id: string; employee_id: string; pay_period: string; base_salary: number
  total_allowances: number; gross_salary: number
  national_pension: number; health_insurance: number; long_care_insurance: number
  employment_insurance: number; income_tax: number; local_income_tax: number
  total_deductions: number; net_salary: number; status: string; tax_type: string
  paid_date: string | null; allowance_details?: Record<string, number>
  meal_expense_total?: number; meal_expense_excess?: number; card_spending_total?: number
  employment_type_snapshot?: string
}

// 숫자 포맷
const n = (v: number) => Number(v || 0).toLocaleString()

// ── 디자인 토큰 ──
const C = {
  steel: '#2d5fa8', steelDark: '#1e4d8c', steelLight: '#eff6ff', steelBorder: '#bfdbfe',
  green: '#059669', greenLight: '#f0fdf4', greenBorder: '#bbf7d0',
  red: '#dc2626', redLight: '#fef2f2', redBorder: '#fecaca',
  amber: '#d97706', amberLight: '#fffbeb', amberBorder: '#fde68a',
  gray50: '#f8fafc', gray100: '#f1f5f9', gray200: '#e2e8f0',
  gray400: '#94a3b8', gray500: '#64748b', gray700: '#374151', gray900: '#0f172a',
}

// ── 공용 스타일 ──
const kpiCard = (bg: string, border: string): React.CSSProperties => ({
  background: bg, padding: '16px 20px', borderRadius: 16, border: `1px solid ${border}`,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)', flex: '1 1 160px', minWidth: 0,
})
const kpiLabel = (color: string): React.CSSProperties => ({
  fontSize: 11, fontWeight: 700, color, margin: 0, textTransform: 'uppercase' as const,
  letterSpacing: 0.5, lineHeight: 1,
})
const kpiValue = (color: string, size = 24): React.CSSProperties => ({
  fontSize: size, fontWeight: 900, color, margin: '8px 0 0', lineHeight: 1.1,
  fontVariantNumeric: 'tabular-nums' as const,
})
const badge = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '4px 10px', borderRadius: 8, fontSize: 11,
  fontWeight: 800, background: bg, color, lineHeight: 1, whiteSpace: 'nowrap' as const,
})
const pill = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 11,
  fontWeight: 800, background: bg, color, lineHeight: 1.2,
})
const thStyle: React.CSSProperties = {
  padding: '14px 16px', fontWeight: 800, fontSize: 11, color: C.gray400,
  textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: `2px solid ${C.gray200}`,
  background: C.gray50, textAlign: 'left',
}
const tdStyle: React.CSSProperties = {
  padding: '14px 16px', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${C.gray100}`,
}
const btnPrimary = (bg = C.steel): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px',
  background: bg, color: '#fff', borderRadius: 12, fontWeight: 800, fontSize: 13,
  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
})
const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px',
  background: '#fff', color: C.gray500, borderRadius: 12, fontWeight: 700, fontSize: 13,
  border: `1px solid ${C.gray200}`, cursor: 'pointer', whiteSpace: 'nowrap',
}
const inputBase: React.CSSProperties = {
  width: '100%', border: `2px solid ${C.gray200}`, borderRadius: 10,
  padding: '10px 12px', fontSize: 13, outline: 'none', fontWeight: 600,
}
const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 16,
}
const modalBox: React.CSSProperties = {
  background: '#fff', borderRadius: 20, width: '100%', maxWidth: 600,
  maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
}
const sectionCard: React.CSSProperties = {
  background: '#fff', borderRadius: 16, border: `1px solid ${C.gray200}`,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden',
}

// ── 프리랜서 상수 ──
const KOREAN_BANKS = ['KB국민은행','신한은행','우리은행','하나은행','NH농협은행','IBK기업은행','SC제일은행','씨티은행','KDB산업은행','카카오뱅크','케이뱅크','토스뱅크','우체국','새마을금고','신협','수협','산림조합']
const TAX_TYPES = ['사업소득(3.3%)', '기타소득(8.8%)', '세금계산서', '원천징수 없음']
const SERVICE_TYPES = ['탁송', '대리운전', '정비', '세차', '디자인', '개발', '법무/세무', '기타']

export default function PayrollPage() {
  const router = useRouter()
  const { company, role } = useApp()
  const cid = company?.id

  const [tab, setTab] = useState<Tab>('ledger')
  const [loading, setLoading] = useState(false)

  // ── 탭1: 급여 대장 ──
  const [payPeriod, setPayPeriod] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [generating, setGenerating] = useState(false)
  const [lFilter, setLFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [ledgerPage, setLedgerPage] = useState(0)

  // ── 탭2: 급여 설정 ──
  const [settings, setSettings] = useState<EmployeeSalary[]>([])
  const [emps, setEmps] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [mSec, setMSec] = useState(0)

  // ── 탭2 모달 폼 ──
  const [fEmpId, setFEmpId] = useState('')
  const [fBase, setFBase] = useState('')
  const [fTax, setFTax] = useState('근로소득')
  const [fPayDay, setFPayDay] = useState('25')
  const [fBank, setFBank] = useState('')
  const [fAccNum, setFAccNum] = useState('')
  const [fAccName, setFAccName] = useState('')
  const [fAllow, setFAllow] = useState<Record<string, string>>({
    '식대': '200000', '교통비': '0', '직책수당': '0', '자가운전보조금': '0',
    '가족수당': '0', '야간수당': '0', '연장수당': '0', '연차수당': '0', '상여금': '0',
  })
  const [fEmpType, setFEmpType] = useState('정규직')
  const [fSalType, setFSalType] = useState('월급제')
  const [fAnnual, setFAnnual] = useState('')
  const [fHourly, setFHourly] = useState('')
  const [fDep, setFDep] = useState('1')
  const [fNetMode, setFNetMode] = useState(false)
  const [fNetTarget, setFNetTarget] = useState('')
  const [fDeductions, setFDeductions] = useState<Record<string, string>>({})
  const [reversedBase, setReversedBase] = useState<number | null>(null)

  // ── 탭3: 프리랜서 관리 ──
  const [freelancers, setFreelancers] = useState<any[]>([])
  const [flFilter, setFlFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [flSearch, setFlSearch] = useState('')
  const [showFlModal, setShowFlModal] = useState(false)
  const [editingFl, setEditingFl] = useState<any>(null)
  const emptyFlForm = { name: '', phone: '', email: '', bank_name: 'KB국민은행', account_number: '', account_holder: '', reg_number: '', tax_type: '사업소득(3.3%)', service_type: '기타', is_active: true, memo: '' }
  const [flForm, setFlForm] = useState<any>(emptyFlForm)
  const [bulkData, setBulkData] = useState<any[]>([])
  const [bulkLogs, setBulkLogs] = useState<string[]>([])
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [aiParsing, setAiParsing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const bulkFileRef = useRef<HTMLInputElement>(null)

  // ── 탭4: 용역비 지급 ──
  const [flPayments, setFlPayments] = useState<any[]>([])
  const [payMonth, setPayMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [showPayModal, setShowPayModal] = useState(false)
  const emptyPayForm = { freelancer_id: '', payment_date: new Date().toISOString().split('T')[0], gross_amount: '', tax_rate: 3.3, description: '', status: 'pending' }
  const [payForm, setPayForm] = useState<any>(emptyPayForm)

  // ── 탭5: 식대 ──
  const [meals, setMeals] = useState<any[]>([])
  const [mealPeriod, setMealPeriod] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // ── 부서/직위 조회 ──
  const [departments, setDepartments] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])

  // ────────────────────────────────────────
  // FETCH 함수들
  // ────────────────────────────────────────

  const fetchPayslips = useCallback(async () => {
    if (!cid) return
    const res = await fetch('/api/payslips', { headers: await getAuthHeader() })
    const json = await res.json()
    const { data, error } = json
    if (error) console.error('payslips error:', error.message)
    // employee 정보는 settings에서 매칭
    setPayslips(data || [])
  }, [cid, payPeriod])

  const fetchSettings = useCallback(async () => {
    if (!cid) return
    const res = await fetch('/api/employee_salaries', { headers: await getAuthHeader() })
    const json = await res.json()
    const { data, error } = json
    if (error) console.error('settings error:', error.message)
    setSettings(data || [])
  }, [cid])

  const fetchEmps = useCallback(async () => {
    if (!cid) return
    const res = await fetch('/api/profiles', { headers: await getAuthHeader() })
    const json = await res.json()
    const { data, error } = json
    if (error) console.error('emps error:', error.message)
    setEmps(data || [])
  }, [cid])

  const fetchFreelancers = useCallback(async () => {
    if (!cid) return
    const res = await fetch('/api/freelancers?order=name', { headers: await getAuthHeader() })
    const json = await res.json()
    let data = json.data || []
    if (flFilter === 'active') data = data.filter((item: any) => item.is_active === true)
    if (flFilter === 'inactive') data = data.filter((item: any) => item.is_active === false)
    setFreelancers(data)
  }, [cid, flFilter])

  const fetchFlPayments = useCallback(async () => {
    if (!cid) return
    const [y, m] = payMonth.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const res = await fetch('/api/freelancer_payments', { headers: await getAuthHeader() })
    const json = await res.json()
    const { data, error } = json
    if (error) {
      console.error('payments error:', error.message)
      // fallback: join 없이 재시도
      const resRetry = await fetch('/api/freelancer_payments', { headers: await getAuthHeader() })
      const jsonRetry = await resRetry.json()
      const dataRetry = jsonRetry.data || []
      setFlPayments(dataRetry)
    } else {
      setFlPayments(data || [])
    }
  }, [cid, payMonth])

  const fetchMeals = useCallback(async () => {
    if (!cid) return
    const res = await fetch('/api/meal_expense_monthly', { headers: await getAuthHeader() })
    const json = await res.json()
    const { data, error } = json
    if (error) console.error('meals error:', error.message)
    setMeals(data || [])
  }, [cid, mealPeriod])

  const fetchDepts = useCallback(async () => {
    if (!cid) return
    const res = await fetch('/api/departments', { headers: await getAuthHeader() }); const { data, error } = await res.json()
    setDepartments(data || [])
  }, [cid])

  const fetchPositions = useCallback(async () => {
    if (!cid) return
    const res = await fetch('/api/positions', { headers: await getAuthHeader() }); const { data, error } = await res.json()
    setPositions(data || [])
  }, [cid])

  useEffect(() => { if (cid) { setLoading(true); Promise.all([fetchPayslips(), fetchSettings(), fetchEmps(), fetchFreelancers(), fetchFlPayments(), fetchMeals(), fetchDepts(), fetchPositions()]).finally(() => setLoading(false)) } }, [cid])
  useEffect(() => { fetchPayslips() }, [payPeriod])
  useEffect(() => { fetchFreelancers() }, [flFilter])
  useEffect(() => { fetchFlPayments() }, [payMonth])
  useEffect(() => { fetchMeals() }, [mealPeriod])

  // ────────────────────────────────────────
  // 급여생성
  // ────────────────────────────────────────
  const handleGenerate = async () => {
    if (!cid || generating) return
    if (!confirm(`${payPeriod} 급여를 생성하시겠습니까?`)) return
    setGenerating(true)
    try {
      const token = localStorage.getItem('sb-auth-token')
      const res = await fetch('/api/payroll/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({  pay_period: payPeriod }),
      })
      const result = await res.json()
      if (res.ok) { alert(`${result.created}건 급여명세서 생성 완료`); fetchPayslips() }
      else alert('생성 실패: ' + result.error)
    } catch (e: any) { alert('오류: ' + e.message) }
    finally { setGenerating(false) }
  }

  // ────────────────────────────────────────
  // 급여설정 저장
  // ────────────────────────────────────────
  const handleSettingSave = async () => {
    if (!cid || !fEmpId) return alert('직원을 선택하세요')
    const allowances: Record<string, number> = {}
    for (const [k, v] of Object.entries(fAllow)) { const num = Number(v); if (num > 0) allowances[k] = num }
    const deductions: Record<string, number> = {}
    for (const [k, v] of Object.entries(fDeductions)) { const num = Number(v); if (num > 0) deductions[k] = num }
    const baseSalary = fSalType === '연봉제' ? annualToMonthly(Number(fAnnual)) : Number(fBase)

    const payload: any = {
       employee_id: fEmpId, base_salary: baseSalary, allowances,
      payment_day: Number(fPayDay), tax_type: fTax, bank_name: fBank || null,
      account_number: fAccNum || null, account_holder: fAccName || null, is_active: true,
      employment_type: fEmpType, salary_type: fSalType,
      annual_salary: fSalType === '연봉제' ? Number(fAnnual) : null,
      hourly_rate: fSalType === '시급제' ? Number(fHourly) : null,
      dependents_count: Number(fDep), net_salary_mode: fNetMode,
      target_net_salary: fNetMode ? Number(fNetTarget) : null,
      custom_deductions: Object.keys(deductions).length > 0 ? deductions : null,
    }

    if (editing) {
      const res = await fetch(`/api/employee_salaries/\${JSON.stringify(editing.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(payload) })
      const error = !res.ok ? { message: 'Update failed' } : null
      if (error) return alert('수정 실패: ' + error.message)
    } else {
      const res = await fetch('/api/employee_salaries', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(payload) })
      const json = await res.json()
      const { error } = json
      if (error) return alert('등록 실패: ' + error.message)
    }
    alert('저장 완료'); setShowModal(false); setEditing(null); fetchSettings()
  }

  const openSettingModal = (s?: EmployeeSalary) => {
    if (s) {
      setEditing(s); setFEmpId(s.employee_id); setFBase(String(s.base_salary))
      setFTax(s.tax_type); setFPayDay(String(s.payment_day)); setFBank(s.bank_name || '')
      setFAccNum(s.account_number || ''); setFAccName(s.account_holder || '')
      setFEmpType(s.employment_type || '정규직'); setFSalType(s.salary_type || '월급제')
      setFAnnual(String(s.annual_salary || '')); setFHourly(String(s.hourly_rate || ''))
      setFDep(String(s.dependents_count || 1)); setFNetMode(!!s.net_salary_mode)
      setFNetTarget(String(s.target_net_salary || ''))
      const a = s.allowances || {}
      setFAllow({ '식대': String(a['식대'] || 200000), '교통비': String(a['교통비'] || 0), '직책수당': String(a['직책수당'] || 0), '자가운전보조금': String(a['자가운전보조금'] || 0), '가족수당': String(a['가족수당'] || 0), '야간수당': String(a['야간수당'] || 0), '연장수당': String(a['연장수당'] || 0), '연차수당': String(a['연차수당'] || 0), '상여금': String(a['상여금'] || 0) })
      const d = s.custom_deductions || {}
      const dd: Record<string, string> = {}; for (const [k, v] of Object.entries(d)) dd[k] = String(v)
      setFDeductions(dd)
    } else {
      setEditing(null); setFEmpId(''); setFBase(''); setFTax('근로소득'); setFPayDay('25')
      setFBank(''); setFAccNum(''); setFAccName(''); setFEmpType('정규직'); setFSalType('월급제')
      setFAnnual(''); setFHourly(''); setFDep('1'); setFNetMode(false); setFNetTarget('')
      setFAllow({ '식대': '200000', '교통비': '0', '직책수당': '0', '자가운전보조금': '0', '가족수당': '0', '야간수당': '0', '연장수당': '0', '연차수당': '0', '상여금': '0' })
      setFDeductions({})
    }
    setMSec(0); setReversedBase(null); setShowModal(true)
  }

  // 역계산
  const handleReverse = () => {
    const target = Number(fNetTarget)
    if (!target || target < 1000000) return alert('목표 실수령액을 100만원 이상으로 입력하세요')
    const allow: Record<string, number> = {}
    for (const [k, v] of Object.entries(fAllow)) allow[k] = Number(v)
    const deductions: Record<string, number> = {}
    for (const [k, v] of Object.entries(fDeductions)) { const num = Number(v); if (num > 0) deductions[k] = num }
    const taxType: '근로소득' | '사업소득3.3%' = fTax === '사업소득3.3%' ? '사업소득3.3%' : '근로소득'
    const result = reverseCalculatePayroll(target, allow, taxType, Number(fDep), Object.keys(deductions).length > 0 ? deductions : undefined)
    setReversedBase(result.baseSalary)
    setFBase(String(result.baseSalary))
  }

  // ────────────────────────────────────────
  // 프리랜서 CRUD
  // ────────────────────────────────────────
  const handleFlSave = async () => {
    if (!flForm.name) return alert('이름은 필수입니다.')
    const payload = { ...flForm}
    if (editingFl) {
      const res = await fetch(`/api/freelancers/\${JSON.stringify(editingFl.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(payload) })
      const error = !res.ok ? { message: 'Update failed' } : null
      if (error) return alert('수정 실패: ' + error.message)
    } else {
      const res = await fetch('/api/freelancers', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(payload) })
      const json = await res.json()
      const { error } = json
      if (error) return alert('등록 실패: ' + error.message)
    }
    alert('저장되었습니다.'); setShowFlModal(false); setEditingFl(null); setFlForm(emptyFlForm); fetchFreelancers()
  }
  const openFlModal = (f?: any) => {
    if (f) {
      setEditingFl(f); setFlForm({ name: f.name, phone: f.phone || '', email: f.email || '', bank_name: f.bank_name || 'KB국민은행', account_number: f.account_number || '', account_holder: f.account_holder || '', reg_number: f.reg_number || '', tax_type: f.tax_type || '사업소득(3.3%)', service_type: f.service_type || '기타', is_active: f.is_active, memo: f.memo || '' })
    } else { setEditingFl(null); setFlForm(emptyFlForm) }
    setShowFlModal(true)
  }
  const handleToggleActive = async (f: any) => {
    await fetch(`/api/freelancers/\${JSON.stringify(f.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ is_active: !f.is_active }) })
    fetchFreelancers()
  }
  const formatPhone = (v: string) => v.replace(/[^0-9]/g, '').replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, '$1-$2-$3')

  // ── 프리랜서 일괄등록 ──
  const parseWithGemini = async (file: File): Promise<any[]> => {
    setAiParsing(true); setBulkLogs(prev => [...prev, 'Gemini AI가 파일을 분석하고 있습니다...'])
    try {
      let content = '', mimeType = file.type, isText = false
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        const ab = await file.arrayBuffer(); const wb = XLSX.read(ab, { type: 'array' })
        content = wb.SheetNames.map(name => `--- 시트: ${name} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`).join('\n\n')
        isText = true
      } else {
        content = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(',')[1]); r.readAsDataURL(file) })
      }
      const res = await fetch('/api/finance/parse-freelancers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, mimeType, isText }) })
      if (res.ok) { const data = await res.json(); if (data.results?.length > 0) { setBulkLogs(prev => [...prev, `AI: ${data.results.length}명 추출 완료`]); setAiParsing(false); return data.results } }
      setBulkLogs(prev => [...prev, 'AI 파싱 결과 없음, 기본 파싱으로 전환'])
    } catch { setBulkLogs(prev => [...prev, 'AI 파싱 실패, 기본 엑셀 파싱으로 전환']) }
    setAiParsing(false); return []
  }

  const parseExcelFallback = async (file: File): Promise<any[]> => {
    const ab = await file.arrayBuffer(); const wb = XLSX.read(ab, { type: 'array' }); let allRows: any[] = []
    for (const sheetName of wb.SheetNames) {
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
      allRows = [...allRows, ...rows.map((row: any, i: number) => ({
        name: String(row['이름'] || row['성명'] || row['name'] || '').trim(),
        phone: String(row['연락처'] || row['전화번호'] || '').trim(),
        email: row['이메일'] || row['email'] || '', bank_name: row['은행'] || 'KB국민은행',
        account_number: String(row['계좌번호'] || '').trim(),
        account_holder: row['예금주'] || String(row['이름'] || '').trim(),
        reg_number: String(row['주민번호'] || row['사업자번호'] || '').trim(),
        tax_type: row['세금유형'] || '사업소득(3.3%)', service_type: row['업종'] || '기타',
        is_active: true, memo: row['메모'] || '', _row: i + 2, _status: 'ready' as const, _note: '',
      })).filter(r => r.name)]
    }
    return allRows
  }

  const applyDuplicateCheck = (parsed: any[]) => {
    const existing = new Set(freelancers.map(f => `${f.name}|${f.phone || ''}`))
    const seen = new Set<string>(); let dup = 0
    for (const item of parsed) {
      const key = `${item.name}|${item.phone}`
      if (existing.has(key)) { item._status = 'duplicate'; item._note = 'DB에 이미 존재'; dup++ }
      else if (seen.has(key)) { item._status = 'duplicate'; item._note = '파일 내 중복'; dup++ }
      seen.add(key)
    }
    setBulkLogs(prev => [...prev, `${parsed.length}명 파싱 완료`, dup > 0 ? `${dup}명 중복 감지 (자동 제외됨)` : '중복 없음'])
  }

  const processMultipleFiles = async (files: File[]) => {
    setBulkLogs([`${files.length}개 파일 선택됨`]); setBulkData([])
    let allParsed: any[] = []
    for (const file of files) {
      setBulkLogs(prev => [...prev, `${file.name} (${(file.size / 1024).toFixed(1)}KB)`])
      const aiParsed = await parseWithGemini(file)
      if (aiParsed.length > 0) {
        allParsed = [...allParsed, ...aiParsed.map((item: any, i: number) => ({
          name: String(item.name || '').trim(), phone: String(item.phone || '').trim(),
          email: item.email || '', bank_name: item.bank_name || 'KB국민은행',
          account_number: String(item.account_number || '').trim(),
          account_holder: item.account_holder || String(item.name || '').trim(),
          reg_number: String(item.reg_number || '').trim(),
          tax_type: item.tax_type || '사업소득(3.3%)', service_type: item.service_type || '기타',
          is_active: true, memo: item.memo || '', _row: i + 1, _status: 'ready' as const, _note: '',
        })).filter((r: any) => r.name)]
      } else if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
        allParsed = [...allParsed, ...(await parseExcelFallback(file))]
      }
    }
    if (allParsed.length === 0) { setBulkLogs(prev => [...prev, '파싱된 데이터가 없습니다.']); return }
    applyDuplicateCheck(allParsed); setBulkData(allParsed)
    setBulkLogs(prev => [...prev, `총 ${allParsed.length}명 취합 완료`])
  }

  const handleBulkSave = async () => {
    const toSave = bulkData.filter(d => d._status === 'ready')
    if (toSave.length === 0) return alert('저장할 데이터가 없습니다.')
    if (!confirm(`${toSave.length}명을 등록하시겠습니까?`)) return
    setBulkProcessing(true); let saved = 0
    for (const item of toSave) {
      const { _row, _status, _note, ...payload } = item
      const res = await fetch('/api/freelancers', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ ...payload}) })
      const json = await res.json()
      const error = json.error
      if (error) { item._status = 'error'; item._note = error.message } else { item._status = 'saved'; item._note = '등록 완료'; saved++ }
    }
    setBulkData([...bulkData]); setBulkLogs(prev => [...prev, `${saved}명 등록 완료`])
    setBulkProcessing(false); if (saved > 0) fetchFreelancers()
  }

  const downloadTemplate = () => {
    const sample = [
      { '이름': '홍길동', '연락처': '010-1234-5678', '이메일': 'hong@email.com', '은행': 'KB국민은행', '계좌번호': '123-456-789012', '예금주': '홍길동', '주민번호': '', '세금유형': '사업소득(3.3%)', '업종': '탁송', '메모': '' },
      { '이름': '김철수', '연락처': '010-9876-5432', '이메일': '', '은행': '신한은행', '계좌번호': '110-123-456789', '예금주': '김철수', '주민번호': '', '세금유형': '사업소득(3.3%)', '업종': '대리운전', '메모': '' },
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '프리랜서')
    XLSX.writeFile(wb, '프리랜서_등록양식.xlsx')
  }

  // ────────────────────────────────────────
  // 용역비 지급
  // ────────────────────────────────────────
  const handlePaymentSave = async () => {
    if (!payForm.freelancer_id || !payForm.gross_amount) return alert('프리랜서와 금액은 필수입니다.')
    const gross = Number(payForm.gross_amount); const taxRate = Number(payForm.tax_rate)
    const taxAmount = Math.round(gross * taxRate / 100); const netAmount = gross - taxAmount
    const payload = {
       freelancer_id: payForm.freelancer_id, payment_date: payForm.payment_date,
      gross_amount: gross, tax_rate: taxRate, tax_amount: taxAmount, net_amount: netAmount,
      description: payForm.description, status: payForm.status,
    }
    const res = await fetch('/api/freelancer_payments', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(payload) })
    const json = await res.json()
    const { error } = json
    if (error) return alert('등록 실패: ' + error.message)
    alert('지급 등록 완료'); setShowPayModal(false); setPayForm(emptyPayForm); fetchFlPayments()
  }

  const handlePaymentConfirm = async (p: any) => {
    if (!confirm(`${p.freelancers?.name}에게 ${n(p.net_amount)}원 지급 확정하시겠습니까?`)) return
    await fetch(`/api/freelancer_payments/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ status: 'paid', paid_date: new Date().toISOString().split('T')[0] }) })
    await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({
       transaction_date: p.payment_date, type: 'expense', category: '용역비(3.3%)',
      client_name: p.freelancers?.name || '프리랜서', amount: p.net_amount,
      description: `프리랜서 용역비 - ${p.freelancers?.name} (${p.description || ''})`,
      payment_method: '이체', status: 'completed', related_type: 'freelancer',
      related_id: p.freelancer_id, classification_source: 'auto_sync', confidence: 100,
    }) })
    if (p.tax_amount > 0) {
      await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({
         transaction_date: p.payment_date, type: 'expense', category: '세금/공과금',
        client_name: `원천세(${p.freelancers?.name})`, amount: p.tax_amount,
        description: `프리랜서 원천징수세 - ${p.freelancers?.name}`,
        payment_method: '이체', status: 'completed', related_type: 'freelancer',
        related_id: p.freelancer_id, classification_source: 'auto_sync', confidence: 100,
      }) })
    }
    alert('지급 확정 및 장부 반영 완료'); fetchFlPayments()
  }

  // ── 직원 정보 조회 헬퍼 ──
  const empMap = useMemo(() => {
    const m: Record<string, any> = {}
    for (const e of emps) m[e.id] = e
    return m
  }, [emps])
  const deptMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const d of departments) m[d.id] = d.name
    return m
  }, [departments])
  const posMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of positions) m[p.id] = p.name
    return m
  }, [positions])
  const getEmpName = (eid: string) => empMap[eid]?.employee_name || '-'
  const getEmpDept = (eid: string) => deptMap[empMap[eid]?.department_id] || '-'
  const getEmpPos = (eid: string) => posMap[empMap[eid]?.position_id] || '-'

  // ── 파생 데이터 ──
  const ledgerData = useMemo(() => {
    let list = payslips as any[]
    if (lFilter === 'regular') list = list.filter((p: any) => (p.employment_type_snapshot || p.tax_type) !== '사업소득3.3%')
    else if (lFilter === 'freelancer') list = list.filter((p: any) => (p.employment_type_snapshot || p.tax_type) === '사업소득3.3%' || p.employment_type_snapshot === '프리랜서')
    else if (lFilter === 'paid') list = list.filter(p => p.status === 'paid')
    else if (lFilter === 'pending') list = list.filter(p => p.status !== 'paid')
    if (search) list = list.filter(p => getEmpName(p.employee_id).includes(search))
    return list
  }, [payslips, lFilter, search])

  const totalGross = payslips.reduce((s, p) => s + Number(p.gross_salary || 0), 0)
  const totalDeductions = payslips.reduce((s, p) => s + Number(p.total_deductions || 0), 0)
  const totalNet = payslips.reduce((s, p) => s + Number(p.net_salary || 0), 0)
  const regularCount = payslips.filter(p => p.employment_type_snapshot !== '프리랜서' && p.tax_type !== '사업소득3.3%').length
  const flCount = payslips.length - regularCount

  const filteredFl = useMemo(() => {
    let list = freelancers
    if (flSearch) { const t = flSearch.toLowerCase(); list = list.filter(f => f.name?.toLowerCase().includes(t) || f.phone?.includes(t) || f.service_type?.includes(t)) }
    return list
  }, [freelancers, flSearch])

  const payTotalGross = flPayments.reduce((s, p) => s + Number(p.gross_amount || 0), 0)
  const payTotalTax = flPayments.reduce((s, p) => s + Number(p.tax_amount || 0), 0)
  const payTotalNet = flPayments.reduce((s, p) => s + Number(p.net_amount || 0), 0)
  const payPaidCount = flPayments.filter(p => p.status === 'paid').length

  // 급여설정 미리보기
  const preview = useMemo(() => {
    const base = fSalType === '연봉제' ? annualToMonthly(Number(fAnnual)) : Number(fBase)
    if (!base) return null
    const allow: Record<string, number> = {}; for (const [k, v] of Object.entries(fAllow)) allow[k] = Number(v)
    const taxType: '근로소득' | '사업소득3.3%' = (fTax === '사업소득3.3%' || fEmpType === '프리랜서') ? '사업소득3.3%' : '근로소득'
    return calculatePayroll({ baseSalary: base, allowances: allow, taxType, dependentsCount: Number(fDep), customDeductions: {} })
  }, [fBase, fAnnual, fAllow, fTax, fDep, fSalType, fEmpType])

  // ── 탭 정의 ──
  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'ledger', label: '급여대장', count: payslips.length },
    { key: 'settings', label: '급여설정', count: settings.length },
    { key: 'freelancers', label: '프리랜서/용역비', count: freelancers.length },
    { key: 'meals', label: '식대/실비' },
    { key: 'analytics', label: '급여분석' },
  ]

  // ── 회사 미선택 ──
  if (!company) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px', minHeight: '100vh', background: C.gray50 }}>
        <div style={{ ...sectionCard, padding: '80px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>🏢</p>
          <p style={{ fontWeight: 800, fontSize: 15, color: C.gray700 }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  if (loading && payslips.length === 0 && settings.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: C.gray50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${C.gray200}`, borderTopColor: C.steel, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <span style={{ fontSize: 13, color: C.gray400, fontWeight: 600 }}>불러오는 중...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }

  const PER_PAGE = 50
  const pagedLedger = ledgerData.slice(ledgerPage * PER_PAGE, (ledgerPage + 1) * PER_PAGE)
  const ledgerPages = Math.ceil(ledgerData.length / PER_PAGE)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 120px', minHeight: '100vh', background: C.gray50 }}>
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: C.gray900, margin: 0, letterSpacing: -0.5 }}>급여 관리</h1>
          <p style={{ fontSize: 13, color: C.gray400, marginTop: 4 }}>직원 급여 · 프리랜서 용역비 · 원천징수 · 식대 관리 통합</p>
        </div>
      </div>

      {/* ── 탭 바 ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 800,
            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            background: tab === t.key ? C.steel : '#fff', color: tab === t.key ? '#fff' : C.gray500,
            boxShadow: tab === t.key ? '0 2px 8px rgba(45,95,168,0.25)' : `0 1px 2px rgba(0,0,0,0.05)`,
            border: tab === t.key ? 'none' : `1px solid ${C.gray200}`,
          }}>
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* ══════════ 탭1: 급여대장 ══════════ */}
      {tab === 'ledger' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* KPI */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={kpiCard('#fff', C.gray200)}><p style={kpiLabel(C.gray400)}>총 지급액</p><p style={kpiValue(C.steel)}>{n(totalGross)}원</p></div>
            <div style={kpiCard('#fff', C.gray200)}><p style={kpiLabel(C.gray400)}>총 공제액</p><p style={kpiValue(C.red)}>{n(totalDeductions)}원</p></div>
            <div style={kpiCard(C.greenLight, C.greenBorder)}><p style={kpiLabel(C.green)}>실지급 총액</p><p style={kpiValue(C.green)}>{n(totalNet)}원</p></div>
            <div style={kpiCard('#fff', C.gray200)}><p style={kpiLabel(C.gray400)}>정규직</p><p style={kpiValue(C.steel)}>{regularCount}명</p></div>
            <div style={kpiCard(C.amberLight, C.amberBorder)}><p style={kpiLabel(C.amber)}>프리랜서</p><p style={kpiValue(C.amber)}>{flCount}명</p></div>
          </div>
          {/* 필터 + 검색 + 월선택 + 생성 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {[{ k: 'all', l: '전체' }, { k: 'regular', l: '정규직' }, { k: 'freelancer', l: '프리랜서' }, { k: 'paid', l: '지급완료' }, { k: 'pending', l: '대기' }].map(f => (
              <button key={f.k} onClick={() => { setLFilter(f.k); setLedgerPage(0) }} style={{ ...pill(lFilter === f.k ? C.steel : '#fff', lFilter === f.k ? '#fff' : C.gray500), border: lFilter === f.k ? 'none' : `1px solid ${C.gray200}`, cursor: 'pointer' }}>{f.l}</button>
            ))}
            <input placeholder="이름 검색" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputBase, flex: '1 1 140px', maxWidth: 200 }} />
            <input type="month" value={payPeriod} onChange={e => setPayPeriod(e.target.value)} style={{ ...inputBase, width: 'auto' }} />
            <button onClick={handleGenerate} disabled={generating} style={btnPrimary(generating ? C.gray400 : C.steel)}>
              {generating ? '생성중...' : '급여 생성'}
            </button>
          </div>
          {/* 테이블 */}
          <div style={{ ...sectionCard, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead><tr>
                <th style={thStyle}>이름</th><th style={thStyle}>부서/직위</th><th style={thStyle}>유형</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>기본급</th><th style={{ ...thStyle, textAlign: 'right' }}>수당</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>공제</th><th style={{ ...thStyle, textAlign: 'right' }}>실지급액</th><th style={thStyle}>상태</th>
              </tr></thead>
              <tbody>
                {pagedLedger.map((p: any) => {
                  const isFL = p.employment_type_snapshot === '프리랜서' || p.tax_type === '사업소득3.3%'
                  return (
                    <tr key={p.id} style={{ transition: 'background 0.1s' }} onMouseEnter={e => (e.currentTarget.style.background = C.gray50)} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{getEmpName(p.employee_id)}</td>
                      <td style={{ ...tdStyle, color: C.gray500, fontSize: 13 }}>{getEmpDept(p.employee_id)} / {getEmpPos(p.employee_id)}</td>
                      <td style={tdStyle}><span style={badge(isFL ? C.amberLight : C.steelLight, isFL ? C.amber : C.steel)}>{isFL ? '3.3%' : '정규직'}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{n(p.base_salary)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{n(p.total_allowances)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: C.red }}>{n(p.total_deductions)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{n(p.net_salary)}</td>
                      <td style={tdStyle}><span style={badge(p.status === 'paid' ? C.greenLight : C.amberLight, p.status === 'paid' ? C.green : C.amber)}>{p.status === 'paid' ? '지급완료' : '대기'}</span></td>
                    </tr>
                  )
                })}
                {pagedLedger.length === 0 && <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: 48, color: C.gray400 }}>해당 기간 급여 데이터가 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
          {ledgerPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setLedgerPage(p => Math.max(0, p - 1))} disabled={ledgerPage === 0} style={{ ...btnSecondary, opacity: ledgerPage === 0 ? 0.4 : 1 }}>이전</button>
              <span style={{ fontSize: 13, color: C.gray500 }}>{ledgerPage + 1} / {ledgerPages}</span>
              <button onClick={() => setLedgerPage(p => Math.min(ledgerPages - 1, p + 1))} disabled={ledgerPage >= ledgerPages - 1} style={{ ...btnSecondary, opacity: ledgerPage >= ledgerPages - 1 ? 0.4 : 1 }}>다음</button>
            </div>
          )}
        </div>
      )}

      {/* ══════════ 탭2: 급여설정 ══════════ */}
      {tab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.gray900, margin: 0 }}>직원 급여 설정 ({settings.length}명)</h3>
            <button onClick={() => openSettingModal()} style={btnPrimary()}>+ 급여설정 추가</button>
          </div>
          <div style={{ ...sectionCard, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead><tr>
                <th style={thStyle}>직원명</th><th style={thStyle}>부서</th><th style={thStyle}>고용유형</th>
                <th style={thStyle}>급여유형</th><th style={{ ...thStyle, textAlign: 'right' }}>기본급</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>총 수당</th><th style={thStyle}>지급일</th><th style={thStyle}>액션</th>
              </tr></thead>
              <tbody>
                {settings.map((s: any) => {
                  const totalAllow = Object.values(s.allowances || {}).reduce((acc: number, v: any) => acc + Number(v || 0), 0)
                  return (
                    <tr key={s.id} onMouseEnter={e => (e.currentTarget.style.background = C.gray50)} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{getEmpName(s.employee_id)}</td>
                      <td style={{ ...tdStyle, color: C.gray500, fontSize: 13 }}>{getEmpDept(s.employee_id)}</td>
                      <td style={tdStyle}><span style={badge(s.employment_type === '프리랜서' ? C.amberLight : C.steelLight, s.employment_type === '프리랜서' ? C.amber : C.steel)}>{s.employment_type || '정규직'}</span></td>
                      <td style={{ ...tdStyle, fontSize: 13 }}>{s.salary_type || '월급제'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{n(s.base_salary)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{n(totalAllow)}</td>
                      <td style={{ ...tdStyle, fontSize: 13 }}>매월 {s.payment_day}일</td>
                      <td style={tdStyle}><button onClick={() => openSettingModal(s)} style={btnSecondary}>편집</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════ 탭3: 프리랜서 관리 ══════════ */}
      {tab === 'freelancers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 필터 + 검색 + 버튼 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['active', 'all', 'inactive'] as const).map(f => (
              <button key={f} onClick={() => setFlFilter(f)} style={{ ...pill(flFilter === f ? C.steel : '#fff', flFilter === f ? '#fff' : C.gray500), border: flFilter === f ? 'none' : `1px solid ${C.gray200}`, cursor: 'pointer' }}>
                {f === 'active' ? `활성 (${freelancers.filter(x => x.is_active).length})` : f === 'all' ? '전체' : '비활성'}
              </button>
            ))}
            <input placeholder="이름/연락처 검색" value={flSearch} onChange={e => setFlSearch(e.target.value)} style={{ ...inputBase, flex: '1 1 140px', maxWidth: 200 }} />
            <button onClick={downloadTemplate} style={btnSecondary}>양식 다운로드</button>
            <button onClick={() => openFlModal()} style={btnPrimary()}>+ 프리랜서 등록</button>
          </div>
          {/* 드래그앤드롭 업로드 */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)}
            onDrop={async e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.length) await processMultipleFiles(Array.from(e.dataTransfer.files)) }}
            style={{
              border: isDragging ? `2px dashed ${C.steel}` : `2px dashed ${C.gray200}`,
              borderRadius: 16, padding: aiParsing ? '32px 20px' : '24px 20px', textAlign: 'center',
              background: isDragging ? C.steelLight : aiParsing ? C.greenLight : '#fff',
              transition: 'all 0.3s', cursor: 'pointer', position: 'relative',
            }}
          >
            {aiParsing ? (
              <>
                <div style={{ width: 32, height: 32, border: `3px solid ${C.greenBorder}`, borderTopColor: C.green, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
                <p style={{ fontWeight: 800, fontSize: 14, color: C.green, margin: 0 }}>Gemini AI가 파일을 분석 중...</p>
              </>
            ) : (
              <>
                <p style={{ fontWeight: 800, fontSize: 14, color: isDragging ? C.steel : C.gray900, margin: 0 }}>
                  {isDragging ? '여기에 놓으세요!' : '프리랜서 엑셀/이미지 파일을 드래그하여 일괄 등록'}
                </p>
                <p style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>엑셀 · CSV · 이미지 · PDF 지원 · Gemini AI 자동 분석</p>
                <input ref={bulkFileRef} type="file" accept=".xlsx,.xls,.csv,.png,.jpg,.jpeg,.pdf" multiple
                  onChange={async e => { if (e.target.files?.length) await processMultipleFiles(Array.from(e.target.files)); if (bulkFileRef.current) bulkFileRef.current.value = '' }}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
              </>
            )}
          </div>
          {/* 일괄등록 미리보기 */}
          {(bulkLogs.length > 0 || bulkData.length > 0) && (
            <div style={sectionCard}>
              {bulkLogs.length > 0 && (
                <div style={{ padding: '12px 20px', borderBottom: bulkData.length > 0 ? `1px solid ${C.gray100}` : 'none' }}>
                  {bulkLogs.map((log, i) => <p key={i} style={{ fontSize: 12, color: C.gray500, margin: '2px 0', fontWeight: 500 }}>{log}</p>)}
                </div>
              )}
              {bulkData.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                    <thead><tr><th style={thStyle}>이름</th><th style={thStyle}>연락처</th><th style={thStyle}>세금유형</th><th style={thStyle}>업종</th><th style={thStyle}>상태</th></tr></thead>
                    <tbody>
                      {bulkData.map((d, i) => (
                        <tr key={i} style={{ opacity: d._status === 'duplicate' ? 0.4 : 1 }}>
                          <td style={tdStyle}>{d.name}</td><td style={tdStyle}>{d.phone}</td>
                          <td style={tdStyle}>{d.tax_type}</td><td style={tdStyle}>{d.service_type}</td>
                          <td style={tdStyle}><span style={badge(d._status === 'saved' ? C.greenLight : d._status === 'duplicate' ? C.gray100 : d._status === 'error' ? C.redLight : C.amberLight, d._status === 'saved' ? C.green : d._status === 'duplicate' ? C.gray400 : d._status === 'error' ? C.red : C.amber)}>{d._status === 'saved' ? '등록완료' : d._status === 'duplicate' ? d._note : d._status === 'error' ? d._note : '대기'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setBulkData([]); setBulkLogs([]) }} style={btnSecondary}>초기화</button>
                    <button onClick={handleBulkSave} disabled={bulkProcessing} style={btnPrimary(bulkProcessing ? C.gray400 : C.green)}>
                      {bulkProcessing ? '저장 중...' : `${bulkData.filter(d => d._status === 'ready').length}명 일괄 등록`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* 프리랜서 목록 */}
          <div style={{ ...sectionCard, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead><tr>
                <th style={thStyle}>이름</th><th style={thStyle}>연락처</th><th style={thStyle}>세금유형</th>
                <th style={thStyle}>업종</th><th style={thStyle}>은행/계좌</th><th style={thStyle}>상태</th><th style={thStyle}>액션</th>
              </tr></thead>
              <tbody>
                {filteredFl.map(f => (
                  <tr key={f.id} onMouseEnter={e => (e.currentTarget.style.background = C.gray50)} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{f.name}</td>
                    <td style={{ ...tdStyle, fontSize: 13 }}>{f.phone || '-'}</td>
                    <td style={tdStyle}><span style={badge(C.amberLight, C.amber)}>{f.tax_type}</span></td>
                    <td style={{ ...tdStyle, fontSize: 13 }}>{f.service_type}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: C.gray500 }}>{f.bank_name} {f.account_number}</td>
                    <td style={tdStyle}><span style={badge(f.is_active ? C.greenLight : C.gray100, f.is_active ? C.green : C.gray400)}>{f.is_active ? '활성' : '비활성'}</span></td>
                    <td style={{ ...tdStyle, display: 'flex', gap: 4 }}>
                      <button onClick={() => openFlModal(f)} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}>수정</button>
                      <button onClick={() => handleToggleActive(f)} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12, color: f.is_active ? C.red : C.green }}>{f.is_active ? '비활성화' : '활성화'}</button>
                    </td>
                  </tr>
                ))}
                {filteredFl.length === 0 && <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: 48, color: C.gray400 }}>등록된 프리랜서가 없습니다</td></tr>}
              </tbody>
            </table>
          </div>

          {/* ── 용역비 지급 (합쳐진 영역) ── */}
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.gray900, margin: '0 0 16px' }}>용역비 지급 내역</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={kpiCard('#fff', C.gray200)}><p style={kpiLabel(C.gray400)}>총 지급 건수</p><p style={kpiValue(C.steel, 18)}>{flPayments.length}건</p></div>
              <div style={kpiCard('#fff', C.gray200)}><p style={kpiLabel(C.gray400)}>총 지급액 (세전)</p><p style={kpiValue(C.steel, 18)}>{n(payTotalGross)}원</p></div>
              <div style={kpiCard(C.redLight, C.redBorder)}><p style={kpiLabel(C.red)}>원천징수세</p><p style={kpiValue(C.red, 18)}>{n(payTotalTax)}원</p></div>
              <div style={kpiCard(C.greenLight, C.greenBorder)}><p style={kpiLabel(C.green)}>실지급 총액</p><p style={kpiValue(C.green, 18)}>{n(payTotalNet)}원</p></div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input type="month" value={payMonth} onChange={e => setPayMonth(e.target.value)} style={{ ...inputBase, width: 'auto' }} />
              <span style={{ fontSize: 13, color: C.gray400 }}>지급완료 {payPaidCount}/{flPayments.length}건</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => { setPayForm(emptyPayForm); setShowPayModal(true) }} style={btnPrimary()}>+ 지급 등록</button>
            </div>
            <div style={{ ...sectionCard, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>
                  <th style={thStyle}>프리랜서</th><th style={thStyle}>지급일</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>세전 금액</th><th style={{ ...thStyle, textAlign: 'right' }}>원천세</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>실지급액</th><th style={thStyle}>상태</th><th style={thStyle}>액션</th>
                </tr></thead>
                <tbody>
                  {flPayments.map(p => (
                    <tr key={p.id} onMouseEnter={e => (e.currentTarget.style.background = C.gray50)} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{p.freelancers?.name || '-'}{p.description && <span style={{ display: 'block', fontSize: 11, color: C.gray400 }}>{p.description}</span>}</td>
                      <td style={{ ...tdStyle, fontSize: 13, color: C.gray500 }}>{p.payment_date}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{n(p.gross_amount)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: C.red }}>{n(p.tax_amount)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: C.green }}>{n(p.net_amount)}</td>
                      <td style={tdStyle}><span style={badge(p.status === 'paid' ? C.greenLight : p.status === 'cancelled' ? C.redLight : C.amberLight, p.status === 'paid' ? C.green : p.status === 'cancelled' ? C.red : C.amber)}>{p.status === 'paid' ? '지급완료' : p.status === 'cancelled' ? '취소' : '대기'}</span></td>
                      <td style={tdStyle}>
                        {p.status === 'pending' && <button onClick={() => handlePaymentConfirm(p)} style={{ ...btnPrimary(C.green), padding: '6px 12px', fontSize: 12 }}>지급 확정</button>}
                        {p.status === 'paid' && <span style={{ fontSize: 11, color: C.gray400 }}>장부 반영됨</span>}
                      </td>
                    </tr>
                  ))}
                  {flPayments.length === 0 && <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: 48, color: C.gray400 }}>해당 월 지급 내역이 없습니다</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ 탭5: 식대/실비 ══════════ */}
      {tab === 'meals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="month" value={mealPeriod} onChange={e => setMealPeriod(e.target.value)} style={{ ...inputBase, width: 'auto' }} />
            <span style={{ fontSize: 13, color: C.gray400 }}>{meals.length}명 집계</span>
          </div>
          {meals.filter(m => m.excess_amount > 0).length > 0 && (
            <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>
                식대 초과 {meals.filter(m => m.excess_amount > 0).length}명 — 총 초과분 {n(meals.reduce((s, m) => s + Number(m.excess_amount || 0), 0))}원
              </span>
            </div>
          )}
          <div style={{ ...sectionCard, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead><tr>
                <th style={thStyle}>직원</th><th style={thStyle}>부서</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>식대 사용</th><th style={{ ...thStyle, textAlign: 'right' }}>수당 한도</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>초과분</th><th style={thStyle}>사용률</th><th style={thStyle}>상태</th>
              </tr></thead>
              <tbody>
                {meals.map(m => {
                  const rate = m.base_allowance > 0 ? Math.min(100, Math.round(m.total_meal_spending / m.base_allowance * 100)) : 0
                  return (
                    <tr key={m.id} onMouseEnter={e => (e.currentTarget.style.background = C.gray50)} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{getEmpName(m.employee_id)}</td>
                      <td style={{ ...tdStyle, fontSize: 13, color: C.gray500 }}>{getEmpDept(m.employee_id)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{n(m.total_meal_spending)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{n(m.base_allowance)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: m.excess_amount > 0 ? C.red : C.gray400 }}>{m.excess_amount > 0 ? n(m.excess_amount) : '-'}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: C.gray200, borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, rate)}%`, height: '100%', background: rate > 100 ? C.red : rate > 80 ? C.amber : C.green, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: rate > 100 ? C.red : C.gray500, minWidth: 36, textAlign: 'right' }}>{rate}%</span>
                        </div>
                      </td>
                      <td style={tdStyle}><span style={badge(m.status === 'applied' ? C.greenLight : m.status === 'approved' ? C.steelLight : C.amberLight, m.status === 'applied' ? C.green : m.status === 'approved' ? C.steel : C.amber)}>{m.status === 'applied' ? '반영됨' : m.status === 'approved' ? '승인' : '대기'}</span></td>
                    </tr>
                  )
                })}
                {meals.length === 0 && <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: 48, color: C.gray400 }}>식대 데이터가 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════ 탭6: 급여분석 ══════════ */}
      {tab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {/* 고용유형별 분석 */}
            <div style={{ ...sectionCard, flex: '1 1 300px', padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: C.gray900, marginBottom: 16 }}>고용유형별 급여 현황</h3>
              {(() => {
                const groups: Record<string, { count: number; total: number }> = {}
                for (const s of settings) {
                  const t = s.employment_type || '정규직'
                  if (!groups[t]) groups[t] = { count: 0, total: 0 }
                  groups[t].count++; groups[t].total += Number(s.base_salary || 0)
                }
                const maxTotal = Math.max(...Object.values(groups).map(g => g.total), 1)
                return Object.entries(groups).map(([type, data]) => (
                  <div key={type} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.gray700 }}>{type} ({data.count}명)</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.steel }}>{n(data.total)}원</span>
                    </div>
                    <div style={{ height: 8, background: C.gray200, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(data.total / maxTotal) * 100}%`, height: '100%', background: type === '프리랜서' ? C.amber : C.steel, borderRadius: 4, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                ))
              })()}
            </div>
            {/* 프리랜서 지급 현황 */}
            <div style={{ ...sectionCard, flex: '1 1 300px', padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: C.gray900, marginBottom: 16 }}>프리랜서 현황</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 120px', background: C.gray50, borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.gray400, textTransform: 'uppercase', marginBottom: 4 }}>총 등록</p>
                  <p style={{ fontSize: 24, fontWeight: 900, color: C.steel }}>{freelancers.length}</p>
                </div>
                <div style={{ flex: '1 1 120px', background: C.greenLight, borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: 'uppercase', marginBottom: 4 }}>활성</p>
                  <p style={{ fontSize: 24, fontWeight: 900, color: C.green }}>{freelancers.filter(f => f.is_active).length}</p>
                </div>
                <div style={{ flex: '1 1 120px', background: C.amberLight, borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.amber, textTransform: 'uppercase', marginBottom: 4 }}>이번 달 지급</p>
                  <p style={{ fontSize: 24, fontWeight: 900, color: C.amber }}>{flPayments.length}건</p>
                </div>
              </div>
              <div style={{ marginTop: 16, padding: 12, background: C.gray50, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: C.gray500 }}>이번 달 세전 총액</span><span style={{ fontWeight: 800, color: C.gray900 }}>{n(payTotalGross)}원</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
                  <span style={{ color: C.gray500 }}>원천징수세 합계</span><span style={{ fontWeight: 800, color: C.red }}>{n(payTotalTax)}원</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ 모달: 급여설정 위저드 ══════════ */}
      {showModal && (
        <div style={modalOverlay} onClick={() => setShowModal(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.gray200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: C.gray900, margin: 0 }}>{editing ? '급여설정 수정' : '급여설정 추가'}</h3>
                <p style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>단계 {mSec + 1} / 5</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.gray400 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              {/* 단계 인디케이터 */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                {['기본정보', '수당설정', '공제설정', '계좌정보', '확인'].map((label, i) => (
                  <div key={i} onClick={() => setMSec(i)} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>
                    <div style={{ height: 4, borderRadius: 2, background: i <= mSec ? C.steel : C.gray200, transition: 'background 0.2s', marginBottom: 4 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: i <= mSec ? C.steel : C.gray400 }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Sec 0: 기본정보 */}
              {mSec === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>고용유형</label>
                      <select value={fEmpType} onChange={e => { setFEmpType(e.target.value); setFTax(e.target.value === '프리랜서' ? '사업소득3.3%' : '근로소득'); setFEmpId('') }} style={inputBase}>{EMPLOYMENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
                    <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>급여유형</label>
                      <select value={fSalType} onChange={e => setFSalType(e.target.value)} style={inputBase}>{SALARY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
                  </div>
                  <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>{fEmpType === '프리랜서' ? '프리랜서 선택' : '직원 선택'}</label>
                    <select value={fEmpId} onChange={e => setFEmpId(e.target.value)} style={inputBase}>
                      <option value="">선택하세요</option>
                      {fEmpType === '프리랜서' ? (
                        <>
                          {freelancers.filter(f => f.is_active).map(f => <option key={`fl-${f.id}`} value={f.id}>{f.name} ({f.service_type || '프리랜서'})</option>)}
                          {emps.filter(e => e.employee_name).map(e => <option key={`emp-${e.id}`} value={e.id}>{e.employee_name} (직원-프리랜서전환)</option>)}
                        </>
                      ) : (
                        emps.filter(e => e.employee_name).map(e => <option key={e.id} value={e.id}>{e.employee_name} ({deptMap[e.department_id] || '-'})</option>)
                      )}
                    </select></div>
                  {fEmpType === '프리랜서' && <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 10, padding: 12, fontSize: 12, color: C.amber, fontWeight: 600 }}>프리랜서는 4대보험 대신 3.3% 원천징수(소득세 3% + 지방소득세 0.3%)가 적용됩니다.</div>}
                  {fSalType === '연봉제' ? (
                    <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>연봉</label>
                      <input type="number" value={fAnnual} onChange={e => setFAnnual(e.target.value)} placeholder="30000000" style={inputBase} />
                      {fAnnual && <p style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>월 환산: {n(annualToMonthly(Number(fAnnual)))}원</p>}
                    </div>
                  ) : fSalType === '시급제' ? (
                    <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>시급</label>
                      <input type="number" value={fHourly} onChange={e => setFHourly(e.target.value)} style={inputBase} />
                      {fHourly && <p style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>월 환산 (209h): {n(hourlyToMonthly(Number(fHourly)))}원</p>}
                    </div>
                  ) : (
                    <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>기본급 (월)</label>
                      <input type="number" value={fBase} onChange={e => setFBase(e.target.value)} placeholder="3000000" style={inputBase} /></div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>지급일</label>
                      <select value={fPayDay} onChange={e => setFPayDay(e.target.value)} style={inputBase}>{[1, 5, 10, 15, 20, 25].map(d => <option key={d} value={d}>매월 {d}일</option>)}</select></div>
                    <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>부양가족 수</label>
                      <input type="number" min={1} value={fDep} onChange={e => setFDep(e.target.value)} style={inputBase} /></div>
                  </div>
                  {/* 실수령액 역계산 */}
                  <div style={{ background: C.steelLight, borderRadius: 10, padding: 12, border: `1px solid ${C.steelBorder}` }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: C.steel, cursor: 'pointer' }}>
                      <input type="checkbox" checked={fNetMode} onChange={e => setFNetMode(e.target.checked)} /> 실수령액 기준 역계산
                    </label>
                    {fNetMode && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                        <input type="number" value={fNetTarget} onChange={e => setFNetTarget(e.target.value)} placeholder="목표 실수령액" style={{ ...inputBase, flex: 1 }} />
                        <button onClick={handleReverse} style={btnPrimary()}>계산</button>
                      </div>
                    )}
                    {reversedBase && <p style={{ fontSize: 12, fontWeight: 800, color: C.green, marginTop: 8 }}>산출 기본급: {n(reversedBase)}원</p>}
                  </div>
                </div>
              )}

              {/* Sec 1: 수당설정 */}
              {mSec === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {ALLOWANCE_TYPES.map(a => (
                    <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.gray700, minWidth: 100 }}>{a.label}</span>
                      <input type="number" value={fAllow[a.key] || '0'} onChange={e => setFAllow({ ...fAllow, [a.key]: e.target.value })} style={{ ...inputBase, flex: 1, textAlign: 'right' }} />
                      <span style={{ fontSize: 11, color: C.gray400, minWidth: 24 }}>원</span>
                      {a.nonTaxableLimit > 0 && <span style={badge(C.greenLight, C.green)}>비과세 {n(a.nonTaxableLimit)}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Sec 2: 공제설정 */}
              {mSec === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {fTax === '사업소득3.3%' ? (
                    <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 10, padding: 16 }}>
                      <p style={{ fontWeight: 800, fontSize: 14, color: C.amber, marginBottom: 8 }}>사업소득 3.3% 원천징수</p>
                      {preview && (
                        <div style={{ fontSize: 13, color: C.amber }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>사업소득세 (3%)</span><span style={{ fontWeight: 800 }}>-{n(preview.incomeTax)}원</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>지방소득세 (0.3%)</span><span style={{ fontWeight: 800 }}>-{n(preview.localIncomeTax)}원</span></div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{ background: C.steelLight, border: `1px solid ${C.steelBorder}`, borderRadius: 10, padding: 16, fontSize: 12, color: C.steel, fontWeight: 600 }}>4대보험은 기본급 + 과세 수당 기준으로 자동 계산됩니다</div>
                      {preview && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {[{ l: '국민연금', v: preview.nationalPension }, { l: '건강보험', v: preview.healthInsurance }, { l: '장기요양', v: preview.longCareInsurance }, { l: '고용보험', v: preview.employmentInsurance }, { l: '소득세', v: preview.incomeTax }, { l: '지방소득세', v: preview.localIncomeTax }].map(item => (
                            <div key={item.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: C.gray50, borderRadius: 8, fontSize: 13 }}>
                              <span style={{ color: C.gray500 }}>{item.l}</span><span style={{ fontWeight: 800, color: C.red }}>-{n(item.v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <h4 style={{ fontSize: 13, fontWeight: 800, color: C.gray700, marginTop: 8 }}>수동 공제 항목</h4>
                  {DEDUCTION_TYPES.map(d => (
                    <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.gray700, minWidth: 80 }}>{d.label}</span>
                      <input type="number" value={fDeductions[d.key] || '0'} onChange={e => setFDeductions({ ...fDeductions, [d.key]: e.target.value })} style={{ ...inputBase, flex: 1, textAlign: 'right' }} />
                      <span style={{ fontSize: 11, color: C.gray400 }}>원</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Sec 3: 계좌정보 */}
              {mSec === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>은행</label>
                    <select value={fBank} onChange={e => setFBank(e.target.value)} style={inputBase}><option value="">선택하세요</option>{KOREAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                  <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>계좌번호</label>
                    <input value={fAccNum} onChange={e => setFAccNum(e.target.value)} style={inputBase} placeholder="123-456-789012" /></div>
                  <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>예금주</label>
                    <input value={fAccName} onChange={e => setFAccName(e.target.value)} style={inputBase} /></div>
                </div>
              )}

              {/* Sec 4: 확인 */}
              {mSec === 4 && preview && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: C.gray50, borderRadius: 12, padding: 16 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 800, color: C.gray900, marginBottom: 12 }}>급여 요약</h4>
                    {[{ l: '기본급', v: n(preview.baseSalary) + '원' }, { l: '총 수당', v: n(preview.totalAllowances) + '원' }, { l: '총 지급액', v: n(preview.grossSalary) + '원', bold: true }, { l: '총 공제', v: '-' + n(preview.totalDeductions) + '원', color: C.red }, { l: '실수령액', v: n(preview.netSalary) + '원', bold: true, color: C.green }].map(item => (
                      <div key={item.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: `1px solid ${C.gray200}` }}>
                        <span style={{ color: C.gray500 }}>{item.l}</span>
                        <span style={{ fontWeight: (item as any).bold ? 900 : 600, color: (item as any).color || C.gray900 }}>{item.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* 네비게이션 */}
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.gray200}`, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button onClick={() => setShowModal(false)} style={btnSecondary}>취소</button>
              <div style={{ display: 'flex', gap: 8 }}>
                {mSec > 0 && <button onClick={() => setMSec(mSec - 1)} style={btnSecondary}>이전</button>}
                {mSec < 4 ? <button onClick={() => setMSec(mSec + 1)} style={btnPrimary()}>다음</button>
                  : <button onClick={handleSettingSave} style={btnPrimary(C.green)}>저장</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ 모달: 프리랜서 등록/수정 ══════════ */}
      {showFlModal && (
        <div style={modalOverlay} onClick={() => setShowFlModal(false)}>
          <div style={{ ...modalBox, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.gray200}` }}>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: C.gray900, margin: 0 }}>{editingFl ? '프리랜서 수정' : '프리랜서 등록'}</h3>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>이름 *</label>
                  <input value={flForm.name} onChange={e => setFlForm({ ...flForm, name: e.target.value })} style={inputBase} /></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>연락처</label>
                  <input value={flForm.phone} onChange={e => setFlForm({ ...flForm, phone: formatPhone(e.target.value) })} maxLength={13} style={inputBase} placeholder="010-0000-0000" /></div>
              </div>
              <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>이메일</label>
                <input type="email" value={flForm.email} onChange={e => setFlForm({ ...flForm, email: e.target.value })} style={inputBase} /></div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>원천징수 유형</label>
                  <select value={flForm.tax_type} onChange={e => setFlForm({ ...flForm, tax_type: e.target.value })} style={inputBase}>{TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>서비스 유형</label>
                  <select value={flForm.service_type} onChange={e => setFlForm({ ...flForm, service_type: e.target.value })} style={inputBase}>{SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              </div>
              <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>사업자/주민등록번호</label>
                <input value={flForm.reg_number} onChange={e => setFlForm({ ...flForm, reg_number: e.target.value })} style={inputBase} placeholder="000-00-00000" /></div>
              <div style={{ background: C.gray50, padding: 16, borderRadius: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.gray500, marginBottom: 8 }}>계좌 정보</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={flForm.bank_name} onChange={e => setFlForm({ ...flForm, bank_name: e.target.value })} style={{ ...inputBase, flex: '1 1 100px' }}>{KOREAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}</select>
                  <input value={flForm.account_number} onChange={e => setFlForm({ ...flForm, account_number: e.target.value })} placeholder="계좌번호" style={{ ...inputBase, flex: '1 1 140px' }} />
                  <input value={flForm.account_holder} onChange={e => setFlForm({ ...flForm, account_holder: e.target.value })} placeholder="예금주" style={{ ...inputBase, flex: '1 1 80px' }} />
                </div>
              </div>
              <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>메모</label>
                <textarea value={flForm.memo} onChange={e => setFlForm({ ...flForm, memo: e.target.value })} rows={2} style={{ ...inputBase, resize: 'none' }} /></div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.gray200}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowFlModal(false)} style={btnSecondary}>취소</button>
              <button onClick={handleFlSave} style={btnPrimary()}>{editingFl ? '수정 완료' : '등록 완료'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ 모달: 용역비 지급 등록 ══════════ */}
      {showPayModal && (
        <div style={modalOverlay} onClick={() => setShowPayModal(false)}>
          <div style={{ ...modalBox, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.gray200}` }}>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: C.gray900, margin: 0 }}>용역비 지급 등록</h3>
              <p style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>지급 확정 시 장부에 자동 반영됩니다</p>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>프리랜서 *</label>
                <select value={payForm.freelancer_id} onChange={e => {
                  const sel = freelancers.find(f => f.id === e.target.value)
                  setPayForm({ ...payForm, freelancer_id: e.target.value, tax_rate: sel?.tax_type === '기타소득(8.8%)' ? 8.8 : sel?.tax_type === '사업소득(3.3%)' ? 3.3 : 0 })
                }} style={inputBase}>
                  <option value="">선택하세요</option>
                  {freelancers.filter(f => f.is_active).map(f => <option key={f.id} value={f.id}>{f.name} ({f.service_type})</option>)}
                </select></div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>지급일</label>
                  <input type="date" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} style={inputBase} /></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>세율(%)</label>
                  <input type="number" step="0.1" value={payForm.tax_rate} onChange={e => setPayForm({ ...payForm, tax_rate: e.target.value })} style={{ ...inputBase, textAlign: 'right' }} /></div>
              </div>
              <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>세전 금액 *</label>
                <input type="text" value={payForm.gross_amount ? Number(payForm.gross_amount).toLocaleString() : ''}
                  onChange={e => setPayForm({ ...payForm, gross_amount: e.target.value.replace(/,/g, '') })} placeholder="0" style={{ ...inputBase, textAlign: 'right', fontSize: 18, fontWeight: 800 }} />
              </div>
              {payForm.gross_amount && Number(payForm.gross_amount) > 0 && (
                <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 10, padding: 12, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: C.amber }}>원천징수세 ({payForm.tax_rate}%)</span>
                    <span style={{ fontWeight: 800, color: C.red }}>-{n(Math.round(Number(payForm.gross_amount) * Number(payForm.tax_rate) / 100))}원</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.amberBorder}`, paddingTop: 4 }}>
                    <span style={{ fontWeight: 700, color: C.gray700 }}>실지급액</span>
                    <span style={{ fontWeight: 900, color: C.green }}>{n(Math.round(Number(payForm.gross_amount) * (1 - Number(payForm.tax_rate) / 100)))}원</span>
                  </div>
                </div>
              )}
              <div><label style={{ fontSize: 12, fontWeight: 700, color: C.gray500, display: 'block', marginBottom: 4 }}>설명</label>
                <input value={payForm.description} onChange={e => setPayForm({ ...payForm, description: e.target.value })} placeholder="작업 내용" style={inputBase} /></div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.gray200}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPayModal(false)} style={btnSecondary}>취소</button>
              <button onClick={handlePaymentSave} style={btnPrimary()}>등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

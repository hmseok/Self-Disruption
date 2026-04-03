'use client'

import { auth } from '@/lib/firebase'
import { useEffect, useState, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import * as XLSX from 'xlsx'
async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/firebase')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

const CARD_COMPANIES = ['신한카드', '삼성카드', '현대카드', 'KB국민카드', '하나카드', '롯데카드', 'BC카드', 'NH농협카드', '우리카드', 'IBK기업은행']

// 카드사명 자동 매칭 (부분 매칭)
const matchCardCompany = (raw: string): string => {
  if (!raw) return ''
  const lower = raw.toLowerCase().replace(/\s/g, '')
  if (lower.includes('신한')) return '신한카드'
  if (lower.includes('삼성')) return '삼성카드'
  if (lower.includes('현대')) return '현대카드'
  if (lower.includes('kb') || lower.includes('국민')) return 'KB국민카드'
  if (lower.includes('하나')) return '하나카드'
  if (lower.includes('롯데')) return '롯데카드'
  if (lower.includes('bc') || lower.includes('비씨')) return 'BC카드'
  if (lower.includes('농협') || lower.includes('nh')) return 'NH농협카드'
  if (lower.includes('우리')) return '우리카드'
  if (lower.includes('ibk') || lower.includes('기업')) return 'IBK기업은행'
  return raw
}

export default function CorporateCardsPage() {
  const { company, role } = useApp()
  const companyId = company?.id

  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [carsList, setCarsList] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [cardUsage, setCardUsage] = useState<Record<string, { count: number; total: number }>>({})

  // 배정 이력
  const [assignmentHistory, setAssignmentHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [assignReasonInput, setAssignReasonInput] = useState('')

  // 검색
  const [searchTerm, setSearchTerm] = useState('')

  // 그룹 모드: 부서별 / 카드사별 / 종류별 / 차량배치 / 전체
  const [groupMode, setGroupMode] = useState<'dept' | 'company' | 'type' | 'car' | 'all'>('dept')

  // 선택된 카드 (지갑형 펼침)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  // 한도 설정: { 'card_company::KB국민카드': 13000000, 'dept::탁송팀': 3000000 }
  const [limitSettings, setLimitSettings] = useState<Record<string, number>>({})
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [limitForm, setLimitForm] = useState<{ type: string; key: string; amount: string }>({ type: 'card_company', key: '', amount: '' })
  const [editingLimitKey, setEditingLimitKey] = useState<string | null>(null)

  // 부서 설정
  const [showDeptModal, setShowDeptModal] = useState(false)
  const [departments, setDepartments] = useState<string[]>([])
  const [newDeptName, setNewDeptName] = useState('')
  const [renameDept, setRenameDept] = useState<{ from: string; to: string } | null>(null)

  // 종류 설정 (카드 용도)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [cardTypes, setCardTypes] = useState<string[]>(['법인카드', '하이패스', '주유카드', '개인카드', '기타'])
  const [newTypeName, setNewTypeName] = useState('')

  // 설정 탭 (한도관리 확장)
  const [limitTab, setLimitTab] = useState<'company' | 'dept' | 'card'>('company')

  // 지출 카테고리 (계정과목)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [expenseCategories] = useState([
    { name: '식비', icon: '🍽️', color: '#f59e0b', vatDeductible: true, limit: 0 },
    { name: '유류비', icon: '⛽', color: '#3b82f6', vatDeductible: true, limit: 0 },
    { name: '접대비', icon: '🤝', color: '#8b5cf6', vatDeductible: false, limit: 36000000 },
    { name: '교통비', icon: '🚌', color: '#06b6d4', vatDeductible: true, limit: 0 },
    { name: '소모품비', icon: '📦', color: '#10b981', vatDeductible: true, limit: 0 },
    { name: '통신비', icon: '📱', color: '#6366f1', vatDeductible: true, limit: 0 },
    { name: '회의비', icon: '💬', color: '#ec4899', vatDeductible: true, limit: 0 },
    { name: '복리후생비', icon: '🎁', color: '#14b8a6', vatDeductible: true, limit: 0 },
    { name: '기타', icon: '📋', color: '#64748b', vatDeductible: true, limit: 0 },
  ])

  // 사적사용 감지 설정
  const suspiciousRules = {
    nightHours: { start: 22, end: 5 },
    holidays: true,
    blockedMCC: ['유흥주점', '골프장', '성형외과', '피부과', '카지노', '노래방', '안마', '사우나'],
  }

  // ── 메인 탭 (카드관리 / 특이건 검토 / 급여 반영) ──
  const [mainTab, setMainTab] = useState<'cards' | 'flags' | 'salary'>('cards')
  const [flagItems, setFlagItems] = useState<any[]>([])
  const [flagSummary, setFlagSummary] = useState<any>({})
  const [flagFilter, setFlagFilter] = useState<string>('unresolved')
  const [flagLoading, setFlagLoading] = useState(false)
  const [salaryAdjustments, setSalaryAdjustments] = useState<any[]>([])
  const [salaryMonth, setSalaryMonth] = useState(() => {
    const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [salarySummary, setSalarySummary] = useState<Record<string, any>>({})

  // 특이건 데이터 로드
  const fetchFlags = async () => {
    if (!companyId) return
    setFlagLoading(true)
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/finance/flags?company_id=${companyId}&status=${flagFilter}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setFlagItems(data.items || [])
        setFlagSummary(data.summary || {})
      }
    } catch (e) { console.error('fetchFlags error:', e) }
    setFlagLoading(false)
  }

  // 급여 조정 데이터 로드
  const fetchSalaryAdjustments = async () => {
    if (!companyId) return
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/finance/salary-adjustments?company_id=${companyId}&year_month=${salaryMonth}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setSalaryAdjustments(data.items || [])
        setSalarySummary(data.summaryByEmployee || {})
      }
    } catch (e) { console.error('fetchSalaryAdj error:', e) }
  }

  // 특이건 상태 업데이트
  const updateFlagStatus = async (flagIds: string[], newStatus: string) => {
    if (!companyId) return
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch('/api/finance/flags', {
        method: 'PATCH', headers,
        body: JSON.stringify({ flag_ids: flagIds, status: newStatus, create_salary_adjustment: newStatus === 'personal_confirmed' }),
      })
      if (res.ok) fetchFlags()
    } catch (e) { console.error('updateFlag error:', e) }
  }

  useEffect(() => {
    if (mainTab === 'flags') fetchFlags()
    if (mainTab === 'salary') fetchSalaryAdjustments()
  }, [mainTab, companyId, flagFilter, salaryMonth])

  // 일괄 등록 상태
  const [isDragging, setIsDragging] = useState(false)
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [bulkCards, setBulkCards] = useState<any[]>([])
  const [bulkLogs, setBulkLogs] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const emptyForm = {
    card_company: '', card_number: '', card_alias: '',
    holder_name: '', assigned_employee_id: '', assigned_car_id: '',
    monthly_limit: '', is_active: true, memo: '', card_type: '',
    expiry_date: '', // YYYY-MM
    previous_card_numbers: [] as string[],
  }
  const [form, setForm] = useState<any>(emptyForm)

  // 카드 데이터에서 부서/종류 목록 추출
  useEffect(() => {
    if (cards.length > 0) {
      const depts = [...new Set(cards.map(c => c.card_alias).filter(Boolean))]
      setDepartments(prev => {
        const merged = [...new Set([...prev, ...depts])]
        return merged.length > prev.length ? merged : prev
      })
      const types = [...new Set(cards.map(c => c.card_type).filter(Boolean))]
      if (types.length > 0) {
        setCardTypes(prev => {
          const merged = [...new Set([...prev, ...types])]
          return merged.length > prev.length ? merged : prev
        })
      }
    }
  }, [cards])

  useEffect(() => { if (companyId) { fetchCards(); fetchEmployees(); fetchCars(); fetchCardUsage(); fetchLimitSettings() } else { setLoading(false) } }, [companyId])

  const fetchCards = async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/corporate-cards', { headers })
      if (!res.ok) throw new Error('카드 조회 실패')
      const json = await res.json()
      setCards(json.data || [])
    } catch (e) {
      console.error('corporate_cards exception:', e)
      setCards([])
    } finally {
      setLoading(false)
    }
  }

  const fetchEmployees = async () => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/profiles?is_active=true', { headers })
      if (!res.ok) throw new Error('직원 조회 실패')
      const json = await res.json()
      setEmployees(json.data || [])
    } catch (e) {
      console.error('profiles exception:', e)
      setEmployees([])
    }
  }

  const fetchCars = async () => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/cars', { headers })
      if (!res.ok) throw new Error('차량 조회 실패')
      const json = await res.json()
      setCarsList(json.data || [])
    } catch (e) {
      console.error('cars exception:', e)
      setCarsList([])
    }
  }

  const fetchCardUsage = async () => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/transactions?payment_method=카드&from=${ym}-01&to=${ym}-${lastDay}`, { headers })
      if (!res.ok) throw new Error('거래 조회 실패')
      const json = await res.json()
      const data = json.data || []

      const usage: Record<string, { count: number; total: number }> = {}
      ;(data || []).forEach((t: any) => {
        if (!t.card_id) return
        if (!usage[t.card_id]) usage[t.card_id] = { count: 0, total: 0 }
        usage[t.card_id].count++
        usage[t.card_id].total += Number(t.amount || 0)
      })
      setCardUsage(usage)
    } catch (e) {
      console.error('Card usage fetch error:', e)
    }
  }

  // ──── 배정 이력 조회 ────
  const fetchAssignmentHistory = async (cardId: string) => {
    setHistoryLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/card-assignment-history?card_id=${cardId}`, { headers })
      if (!res.ok) throw new Error('배정 이력 조회 실패')
      const json = await res.json()
      setAssignmentHistory(json.data || [])
    } catch (e) {
      console.error('assignment history exception:', e)
      setAssignmentHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  // ──── 한도 설정 CRUD ────
  const fetchLimitSettings = async () => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/card-limit-settings', { headers })
      if (!res.ok) throw new Error('한도 설정 조회 실패')
      const json = await res.json()
      const map: Record<string, number> = {}
      ;(json.data || []).forEach((d: any) => {
        map[`${d.limit_type}::${d.limit_key}`] = d.monthly_limit
      })
      setLimitSettings(map)
    } catch (e) {
      console.error('limit settings exception:', e)
      setLimitSettings({})
    }
  }

  const getGroupLimit = (type: string, key: string) => limitSettings[`${type}::${key}`] || 0

  const saveLimitSetting = async () => {
    if (!limitForm.key || !limitForm.amount) return alert('항목과 금액을 입력해주세요.')
    const amount = Number(limitForm.amount)

    try {
      const headers = await getAuthHeader()
      // First try to find existing
      const checkRes = await fetch(`/api/card-limit-settings?type=${limitForm.type}&key=${limitForm.key}`, { headers })
      const checkJson = await checkRes.json()
      const existing = checkJson.data?.[0]

      if (existing) {
        await fetch(`/api/card-limit-settings/${existing.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ monthly_limit: amount })
        })
      } else {
        await fetch('/api/card-limit-settings', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            limit_type: limitForm.type,
            limit_key: limitForm.key,
            monthly_limit: amount,
          })
        })
      }
      fetchLimitSettings()
      setLimitForm({ type: 'card_company', key: '', amount: '' })
      setEditingLimitKey(null)
    } catch (e: any) {
      alert('저장 실패: ' + e.message)
    }
  }

  const deleteLimitSetting = async (type: string, key: string) => {
    if (!confirm(`"${key}" 한도 설정을 삭제하시겠습니까?`)) return
    try {
      const headers = await getAuthHeader()
      const checkRes = await fetch(`/api/card-limit-settings?type=${type}&key=${key}`, { headers })
      const checkJson = await checkRes.json()
      const existing = checkJson.data?.[0]
      if (existing) {
        await fetch(`/api/card-limit-settings/${existing.id}`, { method: 'DELETE', headers })
      }
      fetchLimitSettings()
    } catch (e: any) {
      alert('삭제 실패: ' + e.message)
    }
  }

  // ──── 부서 관리 ────
  const addDepartment = () => {
    if (!newDeptName.trim()) return
    if (departments.includes(newDeptName.trim())) return alert('이미 존재하는 부서입니다.')
    setDepartments([...departments, newDeptName.trim()])
    setNewDeptName('')
  }
  const removeDepartment = async (dept: string) => {
    const cardsInDept = cards.filter(c => c.card_alias === dept)
    if (cardsInDept.length > 0 && !confirm(`"${dept}" 부서에 ${cardsInDept.length}장의 카드가 있습니다. 해당 카드의 부서를 초기화하고 삭제하시겠습니까?`)) return
    try {
      const headers = await getAuthHeader()
      // 해당 부서 카드의 card_alias 초기화
      if (cardsInDept.length > 0) {
        for (const c of cardsInDept) {
          await fetch(`/api/corporate-cards/${c.id}`, { method: 'PATCH', headers, body: JSON.stringify({ card_alias: '' }) })
        }
      }
      setDepartments(departments.filter(d => d !== dept))
      fetchCards()
    } catch (e: any) {
      alert('삭제 실패: ' + e.message)
    }
  }
  const renameDepartment = async () => {
    if (!renameDept || !renameDept.to.trim()) return
    try {
      const headers = await getAuthHeader()
      const cardsInDept = cards.filter(c => c.card_alias === renameDept.from)
      for (const c of cardsInDept) {
        await fetch(`/api/corporate-cards/${c.id}`, { method: 'PATCH', headers, body: JSON.stringify({ card_alias: renameDept.to.trim() }) })
      }
      setDepartments(departments.map(d => d === renameDept.from ? renameDept.to.trim() : d))
      // 한도 설정도 변경
      const limitKey = `dept::${renameDept.from}`
      if (limitSettings[limitKey]) {
        const checkRes = await fetch(`/api/card-limit-settings?type=dept&key=${renameDept.from}`, { headers })
        const checkJson = await checkRes.json()
        const existing = checkJson.data?.[0]
        if (existing) {
          await fetch(`/api/card-limit-settings/${existing.id}`, { method: 'PATCH', headers, body: JSON.stringify({ limit_key: renameDept.to.trim() }) })
        }
        fetchLimitSettings()
      }
      setRenameDept(null)
    } catch (e: any) {
      alert('변경 실패: ' + e.message)
    }
    fetchCards()
  }

  // ──── 종류 관리 ────
  const addCardType = () => {
    if (!newTypeName.trim()) return
    if (cardTypes.includes(newTypeName.trim())) return alert('이미 존재하는 종류입니다.')
    setCardTypes([...cardTypes, newTypeName.trim()])
    setNewTypeName('')
  }
  const removeCardType = (type: string) => {
    setCardTypes(cardTypes.filter(t => t !== type))
  }

  const handleSave = async () => {
    if (!form.card_company) return alert('카드사를 선택해주세요.')

    // 카드번호 중복 체크
    if (form.card_number) {
      const cleanNum = form.card_number.replace(/[^0-9]/g, '')
      const duplicate = cards.find(c => {
        if (editingId && c.id === editingId) return false  // 자기 자신은 제외
        const existingClean = (c.card_number || '').replace(/[^0-9]/g, '')
        return existingClean === cleanNum && cleanNum.length >= 4
      })
      if (duplicate) {
        const proceed = confirm(
          `동일한 카드번호가 이미 등록되어 있습니다.\n\n` +
          `기존 카드: ${duplicate.card_company} ${duplicate.card_number} (${duplicate.holder_name || '명의자 없음'})\n\n` +
          `그래도 등록하시겠습니까?`
        )
        if (!proceed) return
      }
    }

    const payload = {
      ...form,
      
      monthly_limit: form.monthly_limit ? Number(form.monthly_limit) : null,
      assigned_employee_id: form.assigned_employee_id || null,
      assigned_car_id: form.assigned_car_id || null,
      card_type: form.card_type || null,
      expiry_date: form.expiry_date || null,
      previous_card_numbers: form.previous_card_numbers.filter((n: string) => n.trim()),
    }

    try {
      const headers = await getAuthHeader()
      if (editingId) {
        // 배정자 변경 감지 → 히스토리 기록
        const oldCard = cards.find(c => c.id === editingId)
        const oldEmpId = oldCard?.assigned_employee_id || null
        const newEmpId = payload.assigned_employee_id || null

        const res = await fetch(`/api/corporate-cards/${editingId}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
        if (!res.ok) {
          const json = await res.json()
          return alert('수정 실패: ' + (json.error || '오류 발생'))
        }

        // 배정자가 변경된 경우 히스토리 기록
        if (oldEmpId !== newEmpId) {
          // 이전 배정자의 현재 이력 종료
          if (oldEmpId) {
            const histRes = await fetch(`/api/card-assignment-history?card_id=${editingId}&employee_id=${oldEmpId}`, { headers })
            const histJson = await histRes.json()
            const hist = histJson.data?.[0]
            if (hist) {
              await fetch(`/api/card-assignment-history/${hist.id}`, { method: 'PATCH', headers, body: JSON.stringify({ unassigned_at: new Date().toISOString() }) })
            }
          }
          // 새 배정자 이력 추가
          if (newEmpId) {
            const empName = employees.find(e => e.id === newEmpId)?.employee_name || '(알 수 없음)'
            await fetch('/api/card-assignment-history', { method: 'POST', headers, body: JSON.stringify({
              card_id: editingId,
              employee_id: newEmpId,
              employee_name: empName,
              assigned_at: new Date().toISOString(),
              reason: assignReasonInput.trim() || null,
            })})
          }
        }
      } else {
        const res = await fetch('/api/corporate-cards', { method: 'POST', headers, body: JSON.stringify(payload) })
        if (!res.ok) {
          const json = await res.json()
          return alert('등록 실패: ' + (json.error || '오류 발생'))
        }
        const json = await res.json()
        const inserted = json.data

        // 신규 등록 시 배정자가 있으면 첫 히스토리 생성
        if (inserted && payload.assigned_employee_id) {
          const empName = employees.find(e => e.id === payload.assigned_employee_id)?.employee_name || '(알 수 없음)'
          await fetch('/api/card-assignment-history', { method: 'POST', headers, body: JSON.stringify({
            card_id: inserted.id,
            employee_id: payload.assigned_employee_id,
            employee_name: empName,
            assigned_at: new Date().toISOString(),
            reason: '신규 등록',
          })})
        }
      }
    } catch (e: any) {
      return alert('저장 실패: ' + e.message)
    }
    alert('저장되었습니다.')
    setShowForm(false); setEditingId(null); setForm(emptyForm); setAssignReasonInput('')
    fetchCards()
  }

  const handleEdit = (c: any) => {
    setForm({
      card_company: c.card_company, card_number: c.card_number || '',
      card_alias: c.card_alias || '', holder_name: c.holder_name || '',
      assigned_employee_id: c.assigned_employee_id || '',
      assigned_car_id: c.assigned_car_id || '',
      monthly_limit: c.monthly_limit || '', is_active: c.is_active, memo: c.memo || '',
      card_type: c.card_type || '', expiry_date: c.expiry_date || '',
      previous_card_numbers: c.previous_card_numbers || [],
    })
    setEditingId(c.id); setShowForm(true); setShowLimitModal(false); setAssignReasonInput('')
    fetchAssignmentHistory(c.id)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 카드를 삭제하시겠습니까?')) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/corporate-cards/${id}`, { method: 'DELETE', headers })
      if (!res.ok) {
        const json = await res.json()
        return alert('삭제 실패: ' + (json.error || '오류 발생'))
      }
      fetchCards()
    } catch (e: any) {
      alert('삭제 실패: ' + e.message)
    }
  }

  // ──── 일괄 등록: 파일 처리 ────
  const handleFiles = async (files: FileList) => {
    setBulkProcessing(true)
    setBulkLogs([])

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.split('.').pop()?.toLowerCase()

      if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
        await processExcel(file)
      } else if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext || '') || file.type.startsWith('image/')) {
        await processImage(file)
      } else if (ext === 'pdf' || file.type === 'application/pdf') {
        await processImage(file) // PDF도 OCR 처리
      } else {
        setBulkLogs(prev => [...prev, `⚠️ ${file.name}: 지원하지 않는 파일 형식`])
      }
    }

    setBulkProcessing(false)
  }

  const processExcel = async (file: File) => {
    try {
      setBulkLogs(prev => [...prev, `📊 ${file.name} 엑셀 파싱 중...`])
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 })

      if (rows.length < 2) {
        setBulkLogs(prev => [...prev, `⚠️ ${file.name}: 데이터가 없습니다`])
        return
      }

      // 첫 행을 헤더로 사용
      const headers = (rows[0] as string[]).map((h: any) => String(h || '').trim().toLowerCase())

      // 컬럼 매핑 (유연하게)
      const findCol = (keywords: string[]) => headers.findIndex(h =>
        keywords.some(k => h.includes(k))
      )
      const colCompany = findCol(['카드사', '카드회사', '발급사', '구분', 'card_company', 'company'])
      const colNumber = findCol(['카드번호', '카드 번호', 'card_number', 'number'])
      const colHolder = findCol(['명의자', '소유자', '소지자명', '소지자', 'holder', 'name', '성명', '이름'])
      const colAlias = findCol(['별칭', '별명', 'alias', '카드이름'])
      const colLimit = findCol(['한도', 'limit', '월한도', '사용한도', '카드한도'])
      const colMemo = findCol(['메모', 'memo', '비고', '참고'])
      const colExpiry = findCol(['유효기간', '만료일', '만료', 'expiry', '유효일'])
      const colCardType = findCol(['제휴카드종류', '카드종류', 'card_type'])
      const colCardName = findCol(['카드명', '카드이름', 'card_name'])
      const colPrevCard = findCol(['직전카드번호', '이전카드번호', '구카드번호', '이전번호'])
      const colDeptName = findCol(['부서명', '부서', 'department'])
      const colStatus = findCol(['상태코드', '상태', 'status', '유효'])
      const colBrand = findCol(['브랜드', 'brand', 'visa', 'master'])

      const parsed: any[] = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as any[]
        if (!row || row.length === 0) continue

        const cardCompanyRaw = colCompany >= 0 ? String(row[colCompany] || '') : ''
        const cardNumber = colNumber >= 0 ? String(row[colNumber] || '') : ''
        const holderName = colHolder >= 0 ? String(row[colHolder] || '') : ''
        const cardAlias = colAlias >= 0 ? String(row[colAlias] || '') : ''
        const monthlyLimit = colLimit >= 0 ? String(row[colLimit] || '').replace(/[^0-9]/g, '') : ''
        const memo = colMemo >= 0 ? String(row[colMemo] || '') : ''
        const expiryRaw = colExpiry >= 0 ? String(row[colExpiry] || '') : ''
        const cardTypeRaw = colCardType >= 0 ? String(row[colCardType] || '') : ''
        const cardNameRaw = colCardName >= 0 ? String(row[colCardName] || '') : ''
        const prevCardRaw = colPrevCard >= 0 ? String(row[colPrevCard] || '') : ''
        const deptName = colDeptName >= 0 ? String(row[colDeptName] || '') : ''
        const statusRaw = colStatus >= 0 ? String(row[colStatus] || '') : ''
        const brandRaw = colBrand >= 0 ? String(row[colBrand] || '') : ''

        // 유효기간 정규화: 20320731 → 2032-07, 2030-08 → 2030-08, 202508 → 2025-08
        let expiryDate = ''
        if (expiryRaw) {
          const cleaned = String(expiryRaw).replace(/[^0-9\-]/g, '')
          if (/^\d{4}-\d{2}$/.test(cleaned)) {
            expiryDate = cleaned  // 2030-08 형식 그대로
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
            expiryDate = cleaned.slice(0, 7)  // 2030-08-01 → 2030-08
          } else if (/^\d{8}$/.test(cleaned)) {
            expiryDate = cleaned.slice(0, 4) + '-' + cleaned.slice(4, 6)  // 20320731 → 2032-07
          } else if (/^\d{6}$/.test(cleaned)) {
            expiryDate = cleaned.slice(0, 4) + '-' + cleaned.slice(4, 6)  // 203207 → 2032-07
          }
        }

        // 카드종류 (제휴카드종류 > 카드명 우선)
        const cardType = cardTypeRaw || cardNameRaw || ''

        // 카드사 추출: 직접 컬럼 > 카드종류에서 추출 > 카드명에서 추출 > 브랜드에서 추출
        let cardCompany = matchCardCompany(cardCompanyRaw) || ''
        if (!cardCompany && cardTypeRaw) {
          cardCompany = matchCardCompany(cardTypeRaw) || ''
        }
        if (!cardCompany && cardNameRaw) {
          cardCompany = matchCardCompany(cardNameRaw) || ''
        }
        if (!cardCompany && brandRaw) {
          cardCompany = matchCardCompany(brandRaw) || ''
        }
        if (!cardCompany) cardCompany = cardCompanyRaw || ''

        // 카드명/카드종류에서 카드사 이름 제거하여 순수 카드명만 별칭으로 사용
        // 예: "우리카드 CORPORATE Classic" → "CORPORATE Classic"
        const stripCompanyName = (name: string): string => {
          if (!name) return ''
          let stripped = name
          const companyKeywords = ['신한카드', '신한', '삼성카드', '삼성', '현대카드', '현대', 'KB국민카드', 'KB국민', '국민카드', '국민', '하나카드', '하나', '롯데카드', '롯데', 'BC카드', 'BC', 'NH농협카드', 'NH농협', '농협카드', '농협', '우리카드', '우리', 'IBK기업은행', 'IBK기업', 'IBK']
          for (const kw of companyKeywords) {
            if (stripped.includes(kw)) {
              stripped = stripped.replace(kw, '').trim()
              break
            }
          }
          return stripped
        }
        const cleanCardName = cardType ? stripCompanyName(cardType) : ''

        // 별칭: 직접 별칭 > 부서명 > 카드사 제거한 카드명
        const alias = cardAlias || deptName || cleanCardName || ''

        // 상태 판단: 정상/유효/사용/active → true, 해지/폐기/정지/분실 → false
        let isActive = true
        if (statusRaw) {
          const sl = statusRaw.toLowerCase()
          if (sl.includes('해지') || sl.includes('폐기') || sl.includes('정지') || sl.includes('분실') || sl.includes('만료') || sl === 'n' || sl === 'inactive') {
            isActive = false
          }
        }

        // 직전카드번호 배열 처리
        const previousCardNumbers: string[] = []
        if (prevCardRaw.trim()) {
          previousCardNumbers.push(prevCardRaw.trim().replace(/\s/g, ''))
        }

        // 메모 보강: 브랜드 정보 추가
        let memoText = memo
        if (brandRaw && !memoText.includes(brandRaw)) {
          memoText = memoText ? `${memoText} / ${brandRaw}` : brandRaw
        }

        // 카드번호 또는 카드사가 있어야 유효한 행
        if (!cardNumber && !cardCompanyRaw && !cardType) continue

        parsed.push({
          card_company: cardCompany,
          card_number: cardNumber.replace(/\s/g, ''),
          holder_name: holderName,
          card_alias: alias,
          monthly_limit: monthlyLimit,
          memo: memoText,
          expiry_date: expiryDate || null,
          card_type: cardType || null,
          previous_card_numbers: previousCardNumbers.length > 0 ? previousCardNumbers : [],
          is_active: isActive,
          _selected: true,
        })
      }

      // 기존 등록 카드와 중복 체크
      const existingNums = new Set(cards.map(c => (c.card_number || '').replace(/[^0-9]/g, '')).filter(n => n.length >= 4))
      let dupCount = 0
      for (const p of parsed) {
        const cleanNum = (p.card_number || '').replace(/[^0-9]/g, '')
        if (cleanNum.length >= 4 && existingNums.has(cleanNum)) {
          p._duplicate = true
          dupCount++
        }
      }

      if (parsed.length === 0) {
        setBulkLogs(prev => [...prev, `⚠️ ${file.name}: 카드 정보를 찾을 수 없습니다`])
      } else {
        setBulkCards(prev => [...prev, ...parsed])
        const dupMsg = dupCount > 0 ? ` (⚠️ ${dupCount}장 중복)` : ''
        setBulkLogs(prev => [...prev, `✅ ${file.name}: ${parsed.length}장 카드 인식${dupMsg}`])
      }
    } catch (e: any) {
      setBulkLogs(prev => [...prev, `❌ ${file.name}: ${e.message}`])
    }
  }

  const processImage = async (file: File) => {
    try {
      setBulkLogs(prev => [...prev, `🔍 ${file.name} AI 분석 중...`])

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) authHeaders['Authorization'] = `Bearer ${token}`

      const res = await fetch('/api/ocr-card', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' })
      })

      if (!res.ok) throw new Error(`API 오류 (${res.status})`)
      const result = await res.json()

      if (result.cards && result.cards.length > 0) {
        const parsed = result.cards.map((c: any) => ({
          card_company: matchCardCompany(c.card_company) || c.card_company || '',
          card_number: c.card_number || '',
          holder_name: c.holder_name || '',
          card_alias: c.card_alias || '',
          monthly_limit: '',
          memo: '',
          is_active: true,
          _selected: true,
        }))
        setBulkCards(prev => [...prev, ...parsed])
        setBulkLogs(prev => [...prev, `✅ ${file.name}: ${parsed.length}장 카드 인식`])
      } else {
        setBulkLogs(prev => [...prev, `⚠️ ${file.name}: 카드 정보를 인식하지 못했습니다`])
      }
    } catch (e: any) {
      setBulkLogs(prev => [...prev, `❌ ${file.name}: ${e.message}`])
    }
  }

  // 일괄 등록 실행
  const handleBulkSave = async () => {
    const selected = bulkCards.filter(c => c._selected)
    if (selected.length === 0) return alert('등록할 카드를 선택해주세요.')

    // 중복 카드 체크
    const dupCards = selected.filter(c => c._duplicate)
    let confirmMsg = `${selected.length}장의 카드를 일괄 등록하시겠습니까?`
    if (dupCards.length > 0) {
      confirmMsg = `${selected.length}장 중 ${dupCards.length}장이 기존 등록 카드와 중복됩니다.\n\n중복 카드도 포함하여 등록하시겠습니까?`
    }
    if (!confirm(confirmMsg)) return

    setBulkProcessing(true)
    let success = 0, fail = 0

    try {
      const headers = await getAuthHeader()
      for (const card of selected) {
        const { _selected, _duplicate, card_type, ...payload } = card
        try {
          const res = await fetch('/api/corporate-cards', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...payload,
              monthly_limit: payload.monthly_limit ? Number(payload.monthly_limit) : null,
              assigned_car_id: payload.assigned_car_id || null,
              expiry_date: payload.expiry_date || null,
              previous_card_numbers: (payload.previous_card_numbers && payload.previous_card_numbers.length > 0) ? payload.previous_card_numbers : [],
            })
          })
          if (res.ok) success++
          else { fail++; console.error('bulk insert error') }
        } catch (e: any) {
          fail++; console.error('bulk insert error:', e.message)
        }
      }
    } catch (e: any) {
      alert('일괄 등록 중 오류: ' + e.message)
      return
    }

    setBulkProcessing(false)
    alert(`✅ ${success}장 등록 완료${fail > 0 ? `, ❌ ${fail}장 실패` : ''}`)
    setBulkCards([])
    setBulkLogs([])
    fetchCards()
  }

  // 드래그앤드롭 핸들러
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  const maskCardNumber = (n: string) => {
    if (!n) return '-'
    const clean = n.replace(/[^0-9*]/g, '')
    if (clean.length >= 16) return `${clean.slice(0,4)}-****-****-${clean.slice(-4)}`
    return n
  }

  const formatMoney = (n: number) => n ? Number(n).toLocaleString() : '0'

  const totalMonthlyUsage = Object.values(cardUsage).reduce((s, u) => s + u.total, 0)
  const totalMonthlyCount = Object.values(cardUsage).reduce((s, u) => s + u.count, 0)
  const activeCards = cards.filter(c => c.is_active).length

  if (loading && cards.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#475569', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8' }}>불러오는 중...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }

  if (!companyId && !loading) {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px', minHeight: '100vh', background: '#f9fafb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg style={{ width: 28, height: 28, color: '#2d5fa8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
            법인카드 관리
          </h1>
            <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4, margin: '4px 0 0' }}>법인카드 등록 및 사용내역 자동 분류 · 직원 배정 · 한도 관리</p>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', textAlign: 'center', padding: '80px 20px' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>🏢</p>
          <p style={{ fontWeight: 600, fontSize: 14, color: '#64748b', margin: 0 }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>회사 선택 후 법인카드 관리를 진행할 수 있습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px', background: '#f9fafb', minHeight: '100vh' }}>

      {/* ══════ 헤더 — 보험 페이지 스타일 ══════ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg style={{ width: 28, height: 28, color: '#2d5fa8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
            법인카드 관리
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4, margin: '4px 0 0' }}>법인카드 등록 및 사용내역 자동 분류 · 직원 배정 · 한도 관리</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {mainTab === 'cards' && <>
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2d5fa8', color: '#fff', padding: '10px 20px', fontSize: 14, borderRadius: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              카드 등록
            </button>
            <button onClick={() => {
              const rows = [['카드사', '카드번호', '명의자', '부서', '종류', '한도', '이번달사용', '사용률%', '배치차량', '유효기간', '상태']]
              cards.forEach((c: any) => {
                const u = cardUsage[c.id] || { count: 0, total: 0 }
                const rate = c.monthly_limit ? Math.round((u.total / c.monthly_limit) * 100) : 0
                const car = c.assigned_car_id ? carsList.find((v: any) => v.id === c.assigned_car_id) : null
                rows.push([c.card_company, c.card_number, c.holder_name || '공용', c.card_alias || '', c.card_type || '', c.monthly_limit || 0, u.total, rate, car?.number || '', c.expiry_date || '', c.is_active ? '활성' : '비활성'])
              })
              const wb = XLSX.utils.book_new()
              const ws = XLSX.utils.aoa_to_sheet(rows)
              ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 6 }]
              XLSX.utils.book_append_sheet(wb, ws, '법인카드현황')
              const now = new Date()
              XLSX.writeFile(wb, `법인카드현황_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}.xlsx`)
            }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', color: '#374151', border: '1px solid #e5e7eb', padding: '10px 20px', fontSize: 14, borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
              📤 엑셀 내보내기
            </button>
          </>}
        </div>
      </div>

      {/* ══════ 메인 탭 (카드관리 / 특이건 검토 / 급여 반영) ══════ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #e5e7eb', paddingBottom: 0 }}>
        {[
          { key: 'cards' as const, label: '💳 카드 관리', badge: null },
          { key: 'flags' as const, label: '⚠️ 특이건 검토', badge: flagSummary.pending ? flagSummary.pending : null },
          { key: 'salary' as const, label: '💰 급여 반영', badge: null },
        ].map(tab => (
          <button key={tab.key} onClick={() => setMainTab(tab.key)}
            style={{
              padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              background: 'transparent', border: 'none', borderBottom: mainTab === tab.key ? '3px solid #2d5fa8' : '3px solid transparent',
              color: mainTab === tab.key ? '#2d5fa8' : '#6b7280', position: 'relative',
            }}>
            {tab.label}
            {tab.badge && tab.badge > 0 && (
              <span style={{ position: 'absolute', top: 4, right: 4, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════ 카드 관리 탭 콘텐츠 ══════ */}
      {mainTab === 'cards' && <>

      {/* ══════ 드래그앤드롭 업로드 영역 ══════ */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: isDragging ? '2px dashed #6366f1' : '2px dashed #d1d5db',
          borderRadius: 16, padding: bulkProcessing ? '32px 20px' : '24px 20px', marginBottom: 24, textAlign: 'center' as const,
          background: isDragging ? 'linear-gradient(135deg, #eef2ff, #e0e7ff)' : bulkProcessing ? 'linear-gradient(135deg, #f0fdf4, #ecfdf5)' : '#fff',
          transition: 'all 0.3s', cursor: 'pointer',
        }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={e => e.target.files?.length && handleFiles(e.target.files)}
        />
        {bulkProcessing ? (
          <>
            <div style={{ width: 32, height: 32, border: '3px solid #bbf7d0', borderTopColor: '#16a34a', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
            <p style={{ fontWeight: 800, fontSize: 14, color: '#166534', margin: 0 }}>🤖 AI가 카드 정보를 분석 중...</p>
            <p style={{ fontSize: 12, color: '#15803d', marginTop: 4 }}>카드 이미지, 엑셀, PDF 자동 인식</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </>
        ) : (
          <>
            <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>{isDragging ? '📥' : '💳'}</span>
            <p style={{ fontWeight: 800, fontSize: 14, color: isDragging ? '#4338ca' : '#0f172a', margin: 0 }}>
              {isDragging ? '여기에 놓으세요!' : '카드 이미지/엑셀 파일을 드래그하여 일괄 등록'}
            </p>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              카드 이미지(JPG, PNG) · 엑셀(XLSX, CSV) · PDF 지원 · AI OCR 자동 인식
            </p>
          </>
        )}
      </div>

      {/* ══════ 처리 로그 & 미리보기 ══════ */}
      {(bulkLogs.length > 0 || bulkCards.length > 0) && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', marginBottom: 24 }}>
          {bulkLogs.length > 0 && (
            <div style={{ padding: '12px 20px', borderBottom: bulkCards.length > 0 ? '1px solid #f1f5f9' : 'none' }}>
              {bulkLogs.map((log, i) => (
                <p key={i} style={{ fontSize: 12, color: '#475569', margin: '2px 0', fontWeight: 500, fontFamily: 'monospace' }}>{log}</p>
              ))}
            </div>
          )}

          {bulkCards.length > 0 && (
            <div style={{ borderTop: '1px solid #f1f5f9' }}>
              <div style={{ padding: '12px 20px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#475569', margin: 0 }}>인식된 카드: {bulkCards.length}장 (선택: {bulkCards.filter(c => c._selected).length}장)</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setBulkCards([]); setBulkLogs([]) }}
                    style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>초기화</button>
                  <button onClick={handleBulkSave} disabled={bulkProcessing}
                    className="bg-steel-600 hover:bg-steel-700"
                    style={{ padding: '6px 16px', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer', opacity: bulkProcessing ? 0.5 : 1 }}>
                    ✅ 선택 카드 일괄 등록
                  </button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' as const }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' as const }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                      <th style={{ padding: 12, textAlign: 'center' as const, width: 40 }}>
                        <input type="checkbox"
                          checked={bulkCards.every(c => c._selected)}
                          onChange={e => setBulkCards(bulkCards.map(c => ({ ...c, _selected: e.target.checked })))} />
                      </th>
                      <th style={{ padding: 12, textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>카드사</th>
                      <th style={{ padding: 12, textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>카드번호</th>
                      <th style={{ padding: 12, textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>명의자</th>
                      <th style={{ padding: 12, textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>별칭/카드종류</th>
                      <th style={{ padding: 12, textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>유효기간</th>
                      <th style={{ padding: 12, textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>배치 차량</th>
                      <th style={{ padding: 12, textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>월한도</th>
                      <th style={{ padding: 12, textAlign: 'center' as const, width: 40, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkCards.map((card, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f8fafc', opacity: card._selected ? 1 : 0.4, background: !card.is_active ? '#fef2f2' : 'transparent' }}>
                        <td style={{ padding: 12, textAlign: 'center' as const }}>
                          <input type="checkbox" checked={card._selected}
                            onChange={e => setBulkCards(bulkCards.map((c, i) => i === idx ? { ...c, _selected: e.target.checked } : c))} />
                        </td>
                        <td style={{ padding: 12 }}>
                          <select style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', fontSize: 12, fontWeight: 500, background: '#fff', width: '100%' }}
                            value={card.card_company}
                            onChange={e => setBulkCards(bulkCards.map((c, i) => i === idx ? { ...c, card_company: e.target.value } : c))}>
                            <option value="">카드사 선택</option>
                            {CARD_COMPANIES.map(cc => <option key={cc} value={cc}>{cc}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: 12 }}>
                          <input style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', fontSize: 12, fontFamily: 'monospace', width: '100%' }}
                            value={card.card_number}
                            onChange={e => setBulkCards(bulkCards.map((c, i) => i === idx ? { ...c, card_number: e.target.value } : c))}
                            placeholder="0000-0000-0000-0000" />
                          {card.previous_card_numbers?.length > 0 && (
                            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                              이전: {card.previous_card_numbers.join(', ')}
                            </p>
                          )}
                          {card._duplicate && (
                            <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>중복</span>
                          )}
                          {!card.is_active && (
                            <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700, marginLeft: card._duplicate ? 4 : 0 }}>비활성</span>
                          )}
                        </td>
                        <td style={{ padding: 12 }}>
                          <input style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', fontSize: 12, width: '100%' }}
                            value={card.holder_name}
                            onChange={e => setBulkCards(bulkCards.map((c, i) => i === idx ? { ...c, holder_name: e.target.value } : c))} />
                        </td>
                        <td style={{ padding: 12 }}>
                          <input style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', fontSize: 12, width: '100%' }}
                            value={card.card_alias}
                            onChange={e => setBulkCards(bulkCards.map((c, i) => i === idx ? { ...c, card_alias: e.target.value } : c))} />
                        </td>
                        <td style={{ padding: 12 }}>
                          <input style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', fontSize: 12, width: 88, fontFamily: 'monospace' }}
                            value={card.expiry_date || ''}
                            onChange={e => setBulkCards(bulkCards.map((c, i) => i === idx ? { ...c, expiry_date: e.target.value } : c))}
                            placeholder="YYYY-MM" />
                        </td>
                        <td style={{ padding: 12 }}>
                          <select style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', fontSize: 12, fontWeight: 500, background: '#fff', width: '100%' }}
                            value={card.assigned_car_id || ''}
                            onChange={e => setBulkCards(bulkCards.map((c, i) => i === idx ? { ...c, assigned_car_id: e.target.value } : c))}>
                            <option value="">없음</option>
                            {carsList.map(car => <option key={car.id} value={car.id}>{car.number}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: 12 }}>
                          <input style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', fontSize: 12, textAlign: 'right' as const, fontWeight: 700, width: 112 }}
                            value={card.monthly_limit ? Number(card.monthly_limit).toLocaleString() : ''}
                            onChange={e => setBulkCards(bulkCards.map((c, i) => i === idx ? { ...c, monthly_limit: e.target.value.replace(/[^0-9]/g, '') } : c))}
                            placeholder="0" />
                        </td>
                        <td style={{ padding: 12, textAlign: 'center' as const }}>
                          <button onClick={() => setBulkCards(bulkCards.filter((_, i) => i !== idx))}
                            style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════ 통계 카드 — 한 줄 고정 ══════ */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e5e7eb', minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', margin: 0, whiteSpace: 'nowrap' as const }}>등록 카드</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#111827', margin: '4px 0 0', whiteSpace: 'nowrap' as const }}>{cards.length}<span style={{ fontSize: 14, fontWeight: 500, color: '#9ca3af', marginLeft: 2 }}>장</span></p>
          <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginTop: 4, whiteSpace: 'nowrap' as const }}>활성 {activeCards}장</p>
        </div>
        <div style={{ flex: 1, background: '#eff6ff', borderRadius: 12, padding: '16px 20px', border: '1px solid #bfdbfe', minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', margin: 0, whiteSpace: 'nowrap' as const }}>이번달 사용 건수</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#2563eb', margin: '4px 0 0', whiteSpace: 'nowrap' as const }}>{totalMonthlyCount}<span style={{ fontSize: 14, fontWeight: 500, color: '#9ca3af', marginLeft: 2 }}>건</span></p>
        </div>
        <div style={{ flex: 1, background: '#fffbeb', borderRadius: 12, padding: '16px 20px', border: '1px solid #fde68a', minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#d97706', margin: 0, whiteSpace: 'nowrap' as const }}>이번달 총 사용액</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#d97706', margin: '4px 0 0', whiteSpace: 'nowrap' as const }}>{formatMoney(totalMonthlyUsage)}<span style={{ fontSize: 14, fontWeight: 500, color: '#9ca3af', marginLeft: 2 }}>원</span></p>
        </div>
        <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e5e7eb', minWidth: 0, display: 'flex', flexDirection: 'column' as const }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', margin: '0 0 8px', whiteSpace: 'nowrap' as const }}>설정 메뉴</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {[
              { label: '🏷️ 부서', fn: () => setShowDeptModal(true) },
              { label: '📂 종류', fn: () => setShowTypeModal(true) },
              { label: '💰 한도', fn: () => setShowLimitModal(true) },
              { label: '📊 분류', fn: () => setShowCategoryModal(true) },
            ].map(btn => (
              <button key={btn.label} onClick={btn.fn}
                style={{ fontSize: 10, fontWeight: 700, padding: '4px 6px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f8fafc', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════ 그룹 모드 탭 — pill 스타일 ══════ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' as const }}>
        {[
          { key: 'dept' as const, label: '부서별', icon: '🏷️' },
          { key: 'company' as const, label: '카드사별', icon: '🏦' },
          { key: 'type' as const, label: '종류별', icon: '📂' },
          { key: 'car' as const, label: '차량배치', icon: '🚙' },
          { key: 'all' as const, label: '전체', icon: '📋' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setGroupMode(tab.key)}
            style={{
              padding: '7px 16px', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              background: groupMode === tab.key ? '#0f172a' : '#fff',
              color: groupMode === tab.key ? '#fff' : '#6b7280',
              border: groupMode === tab.key ? 'none' : '1px solid #e5e7eb',
            }}>
            {tab.icon} {tab.label}
          </button>
        ))}
        {/* 검색창 */}
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#9ca3af' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="카드번호 · 이름 · 차량번호"
            style={{ padding: '7px 12px 7px 32px', borderRadius: 20, border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500, width: 220, background: '#fff', outline: 'none' }}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, fontWeight: 700, padding: 2 }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 카드 목록 - 그룹별 분류 */}
      {(() => {
        // 그룹 테마 팔레트 (순환)
        const themePool = [
          { icon: '🚚', accent: 'bg-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', text: 'text-orange-700', bar: 'bg-orange-500' },
          { icon: '📊', accent: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', text: 'text-blue-700', bar: 'bg-blue-500' },
          { icon: '🏢', accent: 'bg-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-700', text: 'text-slate-700', bar: 'bg-slate-600' },
          { icon: '🔧', accent: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700', bar: 'bg-emerald-500' },
          { icon: '💜', accent: 'bg-violet-500', bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700', text: 'text-violet-700', bar: 'bg-violet-500' },
          { icon: '🌊', accent: 'bg-cyan-500', bg: 'bg-cyan-50', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700', text: 'text-cyan-700', bar: 'bg-cyan-500' },
          { icon: '🌸', accent: 'bg-pink-500', bg: 'bg-pink-50', border: 'border-pink-200', badge: 'bg-pink-100 text-pink-700', text: 'text-pink-700', bar: 'bg-pink-500' },
          { icon: '🍋', accent: 'bg-yellow-500', bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700', text: 'text-yellow-700', bar: 'bg-yellow-500' },
        ]

        // 특정 키워드 → 테마 매핑
        const keywordIcons: Record<string, string> = {
          '탁송': '🚚', '영업': '📊', '관리': '🏢', '정비': '🔧', '대표': '👑', '공용': '🔑',
          '신한': '💙', '삼성': '🖤', '현대': '⚫', 'KB': '💛', '국민': '💛', '하나': '💚', '롯데': '❤️', '우리': '💎', 'BC': '🩷', '농협': '🌿',
          '기명': '👤', '무기명': '👥', '차량배치': '🚙', '미배치': '📦',
        }
        const getIconForGroup = (name: string) => {
          for (const [kw, icon] of Object.entries(keywordIcons)) {
            if (name.includes(kw)) return icon
          }
          return '💳'
        }

        // 카드사 그라데이션
        const getCardBg = (company: string) => {
          if (company?.includes('신한')) return 'bg-blue-700'
          if (company?.includes('삼성')) return 'bg-slate-800'
          if (company?.includes('현대')) return 'bg-zinc-900'
          if (company?.includes('KB') || company?.includes('국민')) return 'bg-amber-600'
          if (company?.includes('하나')) return 'bg-teal-600'
          if (company?.includes('롯데')) return 'bg-red-600'
          if (company?.includes('우리')) return 'bg-sky-600'
          if (company?.includes('BC') || company?.includes('비씨')) return 'bg-rose-600'
          if (company?.includes('농협') || company?.includes('NH')) return 'bg-green-700'
          return 'bg-slate-700'
        }

        // 검색 필터링
        const filteredCards = searchTerm.trim() ? cards.filter(c => {
          const term = searchTerm.trim().toLowerCase()
          const cardNum = (c.card_number || '').toLowerCase()
          const cardAlias = (c.card_alias || '').toLowerCase()
          const cardCompany = (c.card_company || '').toLowerCase()
          const holderName = (c.holder_name || '').toLowerCase()
          const cardType = (c.card_type || '').toLowerCase()
          const carNumber = c.assigned_car_id ? (carsList.find((v: any) => v.id === c.assigned_car_id)?.number || '').toLowerCase() : ''
          const empName = c.assigned_employee_id ? (employees.find((e: any) => e.id === c.assigned_employee_id)?.employee_name || '').toLowerCase() : ''
          return cardNum.includes(term) || cardAlias.includes(term) || cardCompany.includes(term) ||
            holderName.includes(term) || cardType.includes(term) || carNumber.includes(term) || empName.includes(term)
        }) : cards

        // 그룹핑 로직
        const grouped: Record<string, any[]> = {}
        filteredCards.forEach(c => {
          let key = ''
          if (groupMode === 'dept') key = c.card_alias || '기타 (미분류)'
          else if (groupMode === 'company') key = c.card_company || '기타'
          else if (groupMode === 'type') key = c.card_type || '미분류'
          else if (groupMode === 'car') key = c.assigned_car_id ? `🚙 ${carsList.find((car: any) => car.id === c.assigned_car_id)?.number || '차량'}` : '미배치 카드'
          else key = '전체 카드'
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(c)
        })

        const groupKeys = Object.keys(grouped).sort((a, b) => {
          if (a.includes('기타') || a.includes('미분류') || a.includes('미배치')) return 1
          if (b.includes('기타') || b.includes('미분류') || b.includes('미배치')) return -1
          return grouped[b].length - grouped[a].length
        })

        if (cards.length === 0) {
          return (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
              <p style={{ fontWeight: 700, fontSize: 15, color: '#64748b' }}>등록된 법인카드가 없습니다</p>
              <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>위 영역에 카드 이미지나 엑셀 파일을 드래그하여 등록하세요</p>
            </div>
          )
        }

        if (filteredCards.length === 0 && searchTerm.trim()) {
          return (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#64748b' }}>"{searchTerm}" 검색 결과가 없습니다</p>
              <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>카드번호, 카드이름, 차량번호, 명의자 등으로 검색해보세요</p>
            </div>
          )
        }

        return groupKeys.map((group, gi) => {
          const theme = themePool[gi % themePool.length]
          const icon = getIconForGroup(group)
          const groupCards = grouped[group]
          const groupUsage = groupCards.reduce((s, c) => s + (cardUsage[c.id]?.total || 0), 0)
          const cardSumLimit = groupCards.reduce((s, c) => s + (c.monthly_limit || 0), 0)
          // 계층별 한도: 설정된 그룹 한도 우선, 없으면 개별 카드 한도 합산
          const settingType = groupMode === 'company' ? 'card_company' : 'dept'
          const settingLimit = getGroupLimit(settingType, group)
          const groupLimit = settingLimit || cardSumLimit
          const groupLimitRate = groupLimit > 0 ? Math.min(100, Math.round((groupUsage / groupLimit) * 100)) : 0

          return (
            <div key={group} className="mb-8">
              {/* 그룹 헤더 */}
              <div className={`${theme.bg} rounded-2xl p-4 mb-3 ${theme.border} border`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${theme.accent} flex items-center justify-center text-xl shadow-sm`}>
                      {icon}
                    </div>
                    <div>
                      <h3 className="font-black text-lg text-gray-900">{group}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] ${theme.badge} px-2 py-0.5 rounded-full font-bold`}>{groupCards.length}장</span>
                        <span className="text-xs text-slate-400">이번달 <span className="font-bold text-slate-700">{formatMoney(groupUsage)}원</span></span>
                      </div>
                    </div>
                  </div>
                  {groupLimit > 0 && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-medium">{settingLimit ? '⚙️ 설정 한도' : '카드 합산'}</p>
                      <p className={`text-lg font-black ${groupLimitRate >= 80 ? 'text-red-500' : groupLimitRate >= 50 ? 'text-amber-600' : 'text-emerald-600'}`}>{groupLimitRate}%</p>
                      <p className="text-[10px] text-slate-400">{formatMoney(groupLimit)}원</p>
                    </div>
                  )}
                </div>
                {/* 그룹 한도 바 */}
                {groupLimit > 0 && (
                  <div className="mt-3 h-1.5 bg-white/60 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${theme.bar}`} style={{ width: `${groupLimitRate}%` }} />
                  </div>
                )}
              </div>

              {/* 프리미엄 글래스 카드 그리드 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                {groupCards.map((c: any) => {
                  const usage = cardUsage[c.id] || { count: 0, total: 0 }
                  const limitRate = c.monthly_limit ? Math.min(100, Math.round((usage.total / c.monthly_limit) * 100)) : 0
                  const assignedCar = c.assigned_car_id ? carsList.find((car: any) => car.id === c.assigned_car_id) : null
                  const isSelected = selectedCardId === c.id
                  const colorHex = c.card_company?.includes('신한') ? '#1d4ed8' : c.card_company?.includes('삼성') ? '#1e293b' : c.card_company?.includes('현대') ? '#18181b' : (c.card_company?.includes('KB') || c.card_company?.includes('국민')) ? '#d97706' : c.card_company?.includes('하나') ? '#0d9488' : c.card_company?.includes('롯데') ? '#dc2626' : c.card_company?.includes('우리') ? '#0284c7' : (c.card_company?.includes('BC') || c.card_company?.includes('비씨')) ? '#e11d48' : (c.card_company?.includes('농협') || c.card_company?.includes('NH')) ? '#15803d' : '#475569'
                  const brandName = c.card_company?.replace('카드', '').replace('은행', '') || '카드'

                  return (
                    <div key={c.id} onClick={() => setSelectedCardId(isSelected ? null : c.id)}
                      style={{ cursor: 'pointer', opacity: c.is_active ? 1 : 0.55, transition: 'all 0.3s ease' }}>

                      {/* 글래스 카드 */}
                      <div style={{
                        width: '100%', aspectRatio: '85.6 / 54', borderRadius: 14, padding: '16px 18px',
                        background: `linear-gradient(135deg, ${colorHex}dd 0%, ${colorHex}aa 100%)`,
                        color: 'white', position: 'relative' as const, overflow: 'hidden',
                        boxShadow: isSelected
                          ? `0 12px 40px ${colorHex}50, 0 0 0 3px ${colorHex}30`
                          : `0 4px 16px ${colorHex}30, 0 1px 4px rgba(0,0,0,0.1)`,
                        transform: isSelected ? 'translateY(-2px) scale(1.02)' : 'none',
                        transition: 'all 0.3s ease',
                        display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-between',
                      }}>
                        {/* 빛 반사 효과 */}
                        <div style={{
                          position: 'absolute' as const, top: -80, right: -40, width: 200, height: 200,
                          background: `linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%)`,
                          transform: 'rotate(25deg)',
                        }} />
                        <div style={{
                          position: 'absolute' as const, top: 0, left: 0, right: 0, height: '50%',
                          background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)',
                        }} />
                        {/* 원형 장식 */}
                        <div style={{
                          position: 'absolute' as const, bottom: -30, right: -20, width: 120, height: 120,
                          borderRadius: '50%', background: `rgba(255,255,255,0.06)`,
                        }} />

                        {/* 상단: 브랜드 + 종류 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' as const, zIndex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                            {brandName}
                          </div>
                          {c.card_type && (
                            <span style={{
                              fontSize: 9, background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
                              padding: '2px 8px', borderRadius: 10, fontWeight: 700, border: '1px solid rgba(255,255,255,0.1)',
                            }}>
                              {c.card_type === '하이패스' ? '🛣️' : c.card_type === '주유카드' ? '⛽' : c.card_type === '법인카드' ? '💳' : c.card_type === '개인카드' ? '👤' : '🏷️'} {c.card_type}
                            </span>
                          )}
                        </div>

                        {/* 중단: IC칩 */}
                        <div style={{ position: 'relative' as const, zIndex: 1, margin: '6px 0' }}>
                          <div style={{
                            width: 34, height: 26, borderRadius: 5,
                            background: 'linear-gradient(145deg, #fde68a 0%, #f59e0b 50%, #d97706 100%)',
                            border: '1px solid rgba(180,89,6,0.12)',
                            position: 'relative' as const,
                          }}>
                            <div style={{ position: 'absolute' as const, top: '35%', left: '20%', right: '20%', height: 1, background: 'rgba(180,89,6,0.25)' }} />
                            <div style={{ position: 'absolute' as const, top: '65%', left: '20%', right: '20%', height: 1, background: 'rgba(180,89,6,0.25)' }} />
                            <div style={{ position: 'absolute' as const, left: '35%', top: '20%', bottom: '20%', width: 1, background: 'rgba(180,89,6,0.25)' }} />
                            <div style={{ position: 'absolute' as const, left: '65%', top: '20%', bottom: '20%', width: 1, background: 'rgba(180,89,6,0.25)' }} />
                          </div>
                        </div>

                        {/* 카드번호 */}
                        <div style={{
                          fontFamily: "'Courier New', monospace", fontSize: 14, fontWeight: 600,
                          letterSpacing: 2, position: 'relative' as const, zIndex: 1,
                          textShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }}>
                          ••••  ••••  ••••  {(c.card_number || '').replace(/[^0-9*]/g, '').slice(-4) || '····'}
                        </div>

                        {/* 하단: 이름 + 배치차량 + VISA */}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                          position: 'relative' as const, zIndex: 1, marginTop: 4,
                        }}>
                          <div>
                            <div style={{ fontSize: 7, opacity: 0.5, letterSpacing: 1, textTransform: 'uppercase' as const }}>CARD HOLDER</div>
                            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5 }}>{c.holder_name || '공용'}</div>
                            {assignedCar && (
                              <div style={{ fontSize: 9, marginTop: 2, background: 'rgba(255,255,255,0.15)', padding: '1px 6px', borderRadius: 6, display: 'inline-block', fontWeight: 700 }}>
                                🚙 {assignedCar.number}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 900, opacity: 0.3, fontStyle: 'italic' as const, letterSpacing: -1 }}>VISA</div>
                        </div>
                      </div>

                      {/* 상태 배지 (만료일/경고) */}
                      {(() => {
                        const badges: { text: string; bg: string; color: string }[] = []
                        // 만료일 체크
                        if (c.expiry_date) {
                          const now = new Date()
                          const [ey, em] = c.expiry_date.split('-').map(Number)
                          const expDate = new Date(ey, em, 0) // 해당 월 말일
                          const diffMs = expDate.getTime() - now.getTime()
                          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
                          if (diffDays < 0) badges.push({ text: '⚠️ 만료됨', bg: '#fef2f2', color: '#dc2626' })
                          else if (diffDays <= 90) badges.push({ text: `⏰ ${diffDays}일 후 만료`, bg: '#fffbeb', color: '#d97706' })
                        }
                        // 한도 80% 초과
                        if (limitRate >= 80) badges.push({ text: '🔴 한도임박', bg: '#fef2f2', color: '#dc2626' })
                        // 비활성
                        if (!c.is_active) badges.push({ text: '⛔ 비활성', bg: '#f1f5f9', color: '#64748b' })
                        if (badges.length === 0) return null
                        return (
                          <div style={{ display: 'flex', gap: 4, padding: '6px 4px 0', flexWrap: 'wrap' as const }}>
                            {badges.map((b, i) => (
                              <span key={i} style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: b.bg, color: b.color, whiteSpace: 'nowrap' as const }}>{b.text}</span>
                            ))}
                          </div>
                        )
                      })()}

                      {/* 카드 하단: 사용 / 한도 / % */}
                      <div style={{
                        padding: '10px 4px 6px', display: 'flex', flexDirection: 'column' as const, gap: 6,
                      }}>
                        {/* 금액 행 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <div>
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>사용 </span>
                            <span style={{ fontSize: 14, fontWeight: 900, color: usage.total > 0 ? '#0f172a' : '#cbd5e1' }}>{formatMoney(usage.total)}</span>
                            {usage.count > 0 && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 3 }}>{usage.count}건</span>}
                          </div>
                          <div>
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>한도 </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{c.monthly_limit ? formatMoney(c.monthly_limit) : '-'}</span>
                          </div>
                        </div>
                        {/* 한도 바 */}
                        {c.monthly_limit ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', width: `${limitRate}%`, borderRadius: 3, transition: 'width 0.5s',
                                background: limitRate >= 80 ? '#ef4444' : limitRate >= 50 ? '#f59e0b' : '#10b981',
                              }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 900, minWidth: 32, textAlign: 'right' as const, color: limitRate >= 80 ? '#ef4444' : limitRate >= 50 ? '#f59e0b' : '#10b981' }}>
                              {limitRate}%
                            </span>
                          </div>
                        ) : (
                          <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3 }} />
                        )}
                      </div>

                      {/* 펼쳐진 상세 패널 */}
                      {isSelected && (
                        <div style={{
                          background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, marginTop: 4,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                        }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', fontSize: 12, marginBottom: 12 }}>
                            <div>
                              <span style={{ color: '#94a3b8', fontSize: 10 }}>카드사</span>
                              <p style={{ fontWeight: 800, color: '#1e293b', marginTop: 2 }}>{c.card_company}</p>
                            </div>
                            <div>
                              <span style={{ color: '#94a3b8', fontSize: 10 }}>카드번호</span>
                              <p style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1e293b', marginTop: 2 }}>{c.card_number || '-'}</p>
                            </div>
                            {c.card_alias && (
                              <div>
                                <span style={{ color: '#94a3b8', fontSize: 10 }}>부서</span>
                                <p style={{ fontWeight: 700, color: '#1e293b', marginTop: 2 }}>{c.card_alias}</p>
                              </div>
                            )}
                            {c.card_type && (
                              <div>
                                <span style={{ color: '#94a3b8', fontSize: 10 }}>종류</span>
                                <p style={{ fontWeight: 700, color: '#1e293b', marginTop: 2 }}>{c.card_type}</p>
                              </div>
                            )}
                            {assignedCar && (
                              <div style={{ gridColumn: '1 / -1' }}>
                                <span style={{ color: '#94a3b8', fontSize: 10 }}>배치차량</span>
                                <p style={{ fontWeight: 800, color: colorHex, marginTop: 2 }}>🚙 {assignedCar.number} <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{assignedCar.brand} {assignedCar.model}</span></p>
                              </div>
                            )}
                          </div>
                          {c.memo && <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>📝 {c.memo}</p>}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={(e: any) => { e.stopPropagation(); handleEdit(c) }}
                              style={{ flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                              수정
                            </button>
                            <button onClick={(e: any) => { e.stopPropagation(); handleDelete(c.id) }}
                              style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                              삭제
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      })()}

      {/* ──── 카드 등록/수정 모달 ──── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 448, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column' as const }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '16px 16px 0 0', flexShrink: 0 }}>
              <h3 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', margin: 0 }}>{editingId ? '카드 수정' : '법인카드 등록'}</h3>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column' as const, gap: 16, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>카드사 <span style={{ color: '#f87171' }}>*</span></label>
                  <select style={{ width: '100%', border: '1px solid #e2e8f0', padding: 12, borderRadius: 12, fontSize: 14, background: '#fff', fontWeight: 500, outline: 'none' }} value={form.card_company} onChange={e => setForm({ ...form, card_company: e.target.value })}>
                    <option value="">카드사 선택</option>
                    {CARD_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>카드번호</label>
                  <input style={{ width: '100%', border: '1px solid #e2e8f0', padding: 12, borderRadius: 12, fontSize: 14, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const }} value={form.card_number} onChange={e => setForm({ ...form, card_number: e.target.value })} placeholder="0000-0000-0000-0000" />
                </div>
              </div>

              {/* 이전 카드번호 (분실/재발급 이력) */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>이전 카드번호</span>
                    <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>분실/재발급 시 기존 번호 등록</span>
                  </div>
                  <button type="button" onClick={() => setForm({ ...form, previous_card_numbers: [...form.previous_card_numbers, ''] })}
                    style={{ fontSize: 11, fontWeight: 700, color: '#2d5fa8', background: '#eef3fb', border: '1px solid #d4e0f0', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                    + 추가
                  </button>
                </div>
                {form.previous_card_numbers.length === 0 ? (
                  <p style={{ fontSize: 11, color: '#cbd5e1', textAlign: 'center', padding: 4 }}>등록된 이전 번호 없음</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {form.previous_card_numbers.map((num: string, idx: number) => (
                      <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          style={{ flex: 1, border: '1px solid #e2e8f0', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' as const, background: '#fff' }}
                          value={num}
                          onChange={e => {
                            const updated = [...form.previous_card_numbers]
                            updated[idx] = e.target.value
                            setForm({ ...form, previous_card_numbers: updated })
                          }}
                          placeholder="이전 카드번호"
                        />
                        <button type="button" onClick={() => {
                          const updated = form.previous_card_numbers.filter((_: string, i: number) => i !== idx)
                          setForm({ ...form, previous_card_numbers: updated })
                        }}
                          style={{ fontSize: 14, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>과거 거래 매칭 시 현재 번호 + 이전 번호 모두 사용됩니다</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>부서</label>
                  <select style={{ width: '100%', border: '1px solid #e2e8f0', padding: 12, borderRadius: 12, fontSize: 14, background: '#fff', fontWeight: 500, outline: 'none' }} value={form.card_alias} onChange={e => setForm({ ...form, card_alias: e.target.value })}>
                    <option value="">미분류</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>카드 종류</label>
                  <select style={{ width: '100%', border: '1px solid #e2e8f0', padding: 12, borderRadius: 12, fontSize: 14, background: '#fff', fontWeight: 500, outline: 'none' }} value={form.card_type || ''} onChange={e => setForm({ ...form, card_type: e.target.value })}>
                    <option value="">미분류</option>
                    {cardTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>명의자</label>
                  <input style={{ width: '100%', border: '1px solid #e2e8f0', padding: 12, borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} value={form.holder_name} onChange={e => setForm({ ...form, holder_name: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>사용 직원</label>
                  <select style={{ width: '100%', border: '1px solid #e2e8f0', padding: 12, borderRadius: 12, fontSize: 14, background: '#fff', fontWeight: 500, outline: 'none' }} value={form.assigned_employee_id} onChange={e => setForm({ ...form, assigned_employee_id: e.target.value })}>
                    <option value="">미배정</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.employee_name}</option>)}
                  </select>
                </div>
              </div>

              {/* 배정 변경 사유 (수정 모드 + 배정자 변경 시) */}
              {editingId && (() => {
                const oldCard = cards.find(c => c.id === editingId)
                const changed = (oldCard?.assigned_employee_id || '') !== (form.assigned_employee_id || '')
                if (!changed) return null
                return (
                  <div style={{ background: '#eff6ff', borderRadius: 12, padding: 12, border: '1px solid #bfdbfe' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2563eb', marginBottom: 6 }}>배정 변경 사유 (선택)</label>
                    <input style={{ width: '100%', border: '1px solid #93c5fd', padding: 10, borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, background: '#fff' }}
                      value={assignReasonInput} onChange={e => setAssignReasonInput(e.target.value)}
                      placeholder="예: 부서이동, 퇴사, 업무인수인계 등" />
                  </div>
                )
              })()}

              {/* 배정 이력 타임라인 (수정 모드에서만 표시) */}
              {editingId && (
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>배정 이력</span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{assignmentHistory.length}건</span>
                  </div>
                  {historyLoading ? (
                    <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 8 }}>로딩 중...</p>
                  ) : assignmentHistory.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#cbd5e1', textAlign: 'center', padding: 8 }}>이력이 없습니다</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {assignmentHistory.map((h, idx) => (
                        <div key={h.id} style={{ display: 'flex', gap: 10, padding: '6px 0', borderLeft: '2px solid #e2e8f0', marginLeft: 6, paddingLeft: 12, position: 'relative' }}>
                          <div style={{ position: 'absolute', left: -5, top: 10, width: 8, height: 8, borderRadius: '50%', background: idx === 0 && !h.unassigned_at ? '#2d5fa8' : '#cbd5e1' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: idx === 0 && !h.unassigned_at ? '#1e3a5f' : '#64748b' }}>
                                {h.employee_name || '(알 수 없음)'}
                              </span>
                              {idx === 0 && !h.unassigned_at && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#dcfce7', color: '#15803d' }}>현재</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                              {new Date(h.assigned_at).toLocaleDateString('ko-KR')}
                              {' ~ '}
                              {h.unassigned_at ? new Date(h.unassigned_at).toLocaleDateString('ko-KR') : '현재'}
                            </div>
                            {h.reason && (
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontStyle: 'italic' }}>사유: {h.reason}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>🚙 배치 차량</label>
                <select style={{ width: '100%', border: '1px solid #e2e8f0', padding: 12, borderRadius: 12, fontSize: 14, background: '#fff', fontWeight: 500, outline: 'none' }} value={form.assigned_car_id} onChange={e => setForm({ ...form, assigned_car_id: e.target.value })}>
                  <option value="">미배치 (차량 없음)</option>
                  {carsList.map(car => <option key={car.id} value={car.id}>{car.number} ({car.brand} {car.model})</option>)}
                </select>
                <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>탁송 차량에 비치된 카드인 경우 차량을 선택하세요</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>카드 유효기간</label>
                <input type="month" style={{ width: '100%', border: '1px solid #e2e8f0', padding: 12, borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
                  value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>월 한도</label>
                <div style={{ position: 'relative' }}>
                  <input type="text" style={{ width: '100%', border: '2px solid #e2e8f0', padding: '12px 40px 12px 12px', borderRadius: 12, fontSize: 14, textAlign: 'right' as const, fontWeight: 700, outline: 'none', boxSizing: 'border-box' as const }}
                    value={form.monthly_limit ? Number(form.monthly_limit).toLocaleString() : ''}
                    onChange={e => setForm({ ...form, monthly_limit: e.target.value.replace(/,/g, '') })} placeholder="0" />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 12 }}>원</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>메모</label>
                <input style={{ width: '100%', border: '1px solid #e2e8f0', padding: 12, borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} />
              </div>
            </div>
            <div style={{ padding: 24, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 12, flexShrink: 0 }}>
              <button onClick={() => { setShowForm(false); setEditingId(null) }} style={{ flex: 1, padding: 12, background: '#f1f5f9', borderRadius: 12, fontWeight: 600, fontSize: 14, color: '#475569', border: 'none', cursor: 'pointer' }}>취소</button>
              <button onClick={handleSave} style={{ flex: 2, padding: 12, background: '#2d5fa8', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>{editingId ? '수정 완료' : '등록 완료'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ──── 부서설정 모달 ──── */}
      {showDeptModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 448, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' as const }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderRadius: '16px 16px 0 0' }}>
              <div>
                <h3 style={{ fontWeight: 900, fontSize: 16, color: '#0f172a' }}>🏷️ 부서 설정</h3>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>카드를 분류할 부서를 관리합니다</p>
              </div>
              <button onClick={() => setShowDeptModal(false)} style={{ color: '#94a3b8', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 24, overflowY: 'auto' as const, flex: 1 }}>
              {/* 부서 추가 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <input
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDepartment()}
                  placeholder="새 부서명 입력"
                  style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none' }}
                />
                <button onClick={addDepartment}
                  style={{ padding: '10px 16px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                  추가
                </button>
              </div>
              {/* 부서 목록 */}
              {departments.length === 0 ? (
                <div style={{ textAlign: 'center' as const, padding: '30px 0', color: '#94a3b8' }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>🏷️</div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>등록된 부서가 없습니다</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>위에서 부서를 추가해주세요</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  {departments.map(dept => {
                    const count = cards.filter(c => c.card_alias === dept).length
                    const isRenaming = renameDept?.from === dept
                    return (
                      <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0f172a', flexShrink: 0 }} />
                        {isRenaming ? (
                          <input
                            autoFocus
                            value={renameDept.to}
                            onChange={e => setRenameDept({ ...renameDept, to: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && renameDepartment()}
                            onBlur={() => setRenameDept(null)}
                            style={{ flex: 1, border: '1px solid #3b82f6', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontWeight: 700, outline: 'none' }}
                          />
                        ) : (
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{dept}</span>
                        )}
                        <span style={{ fontSize: 10, background: '#e2e8f0', color: '#64748b', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{count}장</span>
                        {!isRenaming && (
                          <>
                            <button onClick={() => setRenameDept({ from: dept, to: dept })}
                              style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>이름변경</button>
                            <button onClick={() => removeDepartment(dept)}
                              style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>삭제</button>
                          </>
                        )}
                        {isRenaming && (
                          <button onClick={renameDepartment}
                            style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>확인</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──── 종류설정 모달 ──── */}
      {showTypeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 448, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' as const }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderRadius: '16px 16px 0 0' }}>
              <div>
                <h3 style={{ fontWeight: 900, fontSize: 16, color: '#0f172a' }}>📂 카드 종류 설정</h3>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>카드 용도/종류를 관리합니다</p>
              </div>
              <button onClick={() => setShowTypeModal(false)} style={{ color: '#94a3b8', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 24, overflowY: 'auto' as const, flex: 1 }}>
              {/* 종류 추가 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <input
                  value={newTypeName}
                  onChange={e => setNewTypeName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCardType()}
                  placeholder="새 카드 종류 입력 (예: 주유카드)"
                  style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none' }}
                />
                <button onClick={addCardType}
                  style={{ padding: '10px 16px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                  추가
                </button>
              </div>
              {/* 종류 목록 */}
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                {cardTypes.map(type => {
                  const count = cards.filter(c => c.card_type === type).length
                  const typeIcons: Record<string, string> = { '법인카드': '💳', '하이패스': '🛣️', '주유카드': '⛽', '개인카드': '👤', '기타': '📦' }
                  return (
                    <div key={type} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                      background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
                    }}>
                      <span style={{ fontSize: 16 }}>{typeIcons[type] || '🏷️'}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{type}</span>
                      <span style={{ fontSize: 10, background: '#e2e8f0', color: '#64748b', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>{count}</span>
                      <button onClick={() => removeCardType(type)}
                        style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}>✕</button>
                    </div>
                  )
                })}
              </div>
              {cardTypes.length === 0 && (
                <div style={{ textAlign: 'center' as const, padding: '30px 0', color: '#94a3b8' }}>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>등록된 종류가 없습니다</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──── 카테고리 & 회계 설정 모달 ──── */}
      {showCategoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 672, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' as const }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderRadius: '16px 16px 0 0' }}>
              <div>
                <h3 style={{ fontWeight: 900, fontSize: 16, color: '#0f172a' }}>📊 지출 카테고리 & 회계 설정</h3>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>계정과목별 분류, 부가세 공제, 사적사용 감지, 증빙 관리</p>
              </div>
              <button onClick={() => setShowCategoryModal(false)} style={{ color: '#94a3b8', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 24, overflowY: 'auto' as const, flex: 1 }}>

              {/* 1. 지출 카테고리 (계정과목) */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', marginBottom: 12 }}>📋 지출 카테고리 (계정과목)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {expenseCategories.map(cat => (
                    <div key={cat.name} style={{
                      padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc',
                      display: 'flex', flexDirection: 'column' as const, gap: 6,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{cat.icon} {cat.name}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {cat.vatDeductible ? (
                            <span style={{ fontSize: 8, fontWeight: 800, background: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: 6 }}>부가세 공제</span>
                          ) : (
                            <span style={{ fontSize: 8, fontWeight: 800, background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: 6 }}>공제불가</span>
                          )}
                        </div>
                      </div>
                      {cat.limit > 0 && (
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          연간 한도: <strong style={{ color: '#0f172a' }}>{formatMoney(cat.limit)}원</strong>
                          <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 4 }}>(법인세법)</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. 사적사용 감지 규칙 */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', marginBottom: 12 }}>🚨 사적사용 감지 규칙</h4>
                <div style={{ background: '#fef2f2', borderRadius: 12, padding: 16, border: '1px solid #fecaca' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                    <div>
                      <span style={{ color: '#991b1b', fontWeight: 800 }}>🕐 심야 사용 감지</span>
                      <p style={{ color: '#b91c1c', fontSize: 11, marginTop: 4 }}>
                        오후 {suspiciousRules.nightHours.start}시 ~ 오전 {suspiciousRules.nightHours.end}시 사용 시 자동 플래그
                      </p>
                    </div>
                    <div>
                      <span style={{ color: '#991b1b', fontWeight: 800 }}>📅 휴일 사용 감지</span>
                      <p style={{ color: '#b91c1c', fontSize: 11, marginTop: 4 }}>
                        주말 및 공휴일 사용 시 자동 플래그
                      </p>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ color: '#991b1b', fontWeight: 800 }}>🚫 차단 업종 (비용처리 불가)</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginTop: 6 }}>
                        {suspiciousRules.blockedMCC.map(mcc => (
                          <span key={mcc} style={{ fontSize: 10, fontWeight: 700, background: '#fee2e2', color: '#dc2626', padding: '3px 8px', borderRadius: 6 }}>
                            {mcc}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. 적격증빙 관리 */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', marginBottom: 12 }}>🧾 적격증빙 관리</h4>
                <div style={{ background: '#eff6ff', borderRadius: 12, padding: 16, border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 2 }}>
                    <p><strong>법인카드 사용 시:</strong> 카드 매출전표가 자동으로 적격증빙 역할</p>
                    <p><strong>건당 3만원 초과:</strong> 적격증빙 미수취 시 <span style={{ fontWeight: 900, color: '#dc2626' }}>2% 가산세</span> 부과</p>
                    <p><strong>세금계산서:</strong> 일반과세자 거래 시 세금계산서 수취로 매입세액 공제 가능</p>
                    <p><strong>현금영수증:</strong> 반드시 <strong>"지출증빙용(사업자번호)"</strong>으로 발급</p>
                  </div>
                  <div style={{ marginTop: 12, padding: '10px 12px', background: '#dbeafe', borderRadius: 8 }}>
                    <p style={{ fontSize: 11, fontWeight: 800, color: '#1e40af' }}>💡 증빙 상태 자동 추적</p>
                    <p style={{ fontSize: 10, color: '#3b82f6', marginTop: 4 }}>거래 내역에서 증빙 미첨부 건을 자동으로 표시하고, 3만원 초과 미증빙 건에 경고를 띄웁니다.</p>
                  </div>
                </div>
              </div>

              {/* 4. 부가세 공제 안내 */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', marginBottom: 12 }}>💰 부가세 매입세액 공제</h4>
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, border: '1px solid #bbf7d0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
                    <div>
                      <p style={{ fontWeight: 800, color: '#16a34a', marginBottom: 6 }}>✅ 공제 가능</p>
                      <div style={{ color: '#15803d', lineHeight: 1.8 }}>
                        <p>• 업무용 물품 구매</p>
                        <p>• 업무용 차량 유류비</p>
                        <p>• 사무용품, 소모품</p>
                        <p>• 통신비, 교통비</p>
                        <p>• 업무 관련 식비/회의비</p>
                      </div>
                    </div>
                    <div>
                      <p style={{ fontWeight: 800, color: '#dc2626', marginBottom: 6 }}>❌ 공제 불가</p>
                      <div style={{ color: '#b91c1c', lineHeight: 1.8 }}>
                        <p>• 접대비 (전액 불공제)</p>
                        <p>• 비영업용 소형승용차 관련</p>
                        <p>• 면세 사업자 매입</p>
                        <p>• 사적 사용분</p>
                        <p>• 간이과세자 매입 (일부)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. 카드 만료 현황 */}
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', marginBottom: 12 }}>⏰ 카드 만료 현황</h4>
                {(() => {
                  const now = new Date()
                  const expiringCards = cards.filter((c: any) => {
                    if (!c.expiry_date) return false
                    const [ey, em] = c.expiry_date.split('-').map(Number)
                    const exp = new Date(ey, em, 0)
                    const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    return diff <= 90
                  }).sort((a: any, b: any) => (a.expiry_date || '').localeCompare(b.expiry_date || ''))
                  const noExpiry = cards.filter((c: any) => !c.expiry_date)

                  return (
                    <div>
                      {expiringCards.length > 0 ? (
                        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #fecaca', marginBottom: 12 }}>
                          {expiringCards.map((c: any, i: number) => {
                            const [ey, em] = c.expiry_date.split('-').map(Number)
                            const exp = new Date(ey, em, 0)
                            const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                            const expired = diff < 0
                            return (
                              <div key={c.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '10px 14px', background: expired ? '#fef2f2' : '#fffbeb',
                                borderTop: i > 0 ? '1px solid #fde8e8' : 'none',
                              }}>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>{c.card_company} ····{(c.card_number || '').replace(/[^0-9*]/g, '').slice(-4)}</span>
                                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>{c.holder_name || '공용'}</span>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 800, color: expired ? '#dc2626' : '#d97706' }}>
                                  {expired ? `⚠️ 만료됨 (${c.expiry_date})` : `⏰ ${diff}일 후 만료 (${c.expiry_date})`}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ padding: 16, textAlign: 'center' as const, color: '#10b981', background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', marginBottom: 12 }}>
                          <p style={{ fontSize: 12, fontWeight: 700 }}>✅ 90일 이내 만료 예정 카드 없음</p>
                        </div>
                      )}
                      {noExpiry.length > 0 && (
                        <div style={{ padding: '10px 14px', background: '#f1f5f9', borderRadius: 10, fontSize: 11, color: '#64748b' }}>
                          💡 유효기간 미입력 카드 <strong>{noExpiry.length}장</strong> — 카드 수정에서 유효기간을 입력하세요
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ──── 한도관리 모달 (3단계: 회사→부서→카드) ──── */}
      {showLimitModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 672, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' as const }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderRadius: '16px 16px 0 0' }}>
              <div>
                <h3 style={{ fontWeight: 900, fontSize: 16, color: '#0f172a' }}>💰 한도 관리</h3>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>회사 전체 → 부서별 → 카드별 3단계 한도를 설정합니다</p>
              </div>
              <button onClick={() => setShowLimitModal(false)} style={{ color: '#94a3b8', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>

            {/* 탭 */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, margin: '16px 24px 0', borderRadius: 12, gap: 4 }}>
              {([
                { key: 'company' as const, label: '🏢 회사 한도', desc: '카드사별 전체' },
                { key: 'dept' as const, label: '🏷️ 부서 한도', desc: '부서별 배분' },
                { key: 'card' as const, label: '💳 카드별 한도', desc: '개별 카드' },
              ]).map(tab => (
                <button key={tab.key} onClick={() => setLimitTab(tab.key)}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: limitTab === tab.key ? '#0f172a' : 'transparent',
                    color: limitTab === tab.key ? 'white' : '#64748b',
                    fontSize: 12, fontWeight: 800, transition: 'all 0.15s',
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto' as const, flex: 1 }}>
              {/* ── 회사(카드사별) 한도 탭 ── */}
              {limitTab === 'company' && (
                <div>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>카드사별 전체 한도를 설정합니다. 해당 카드사의 모든 카드 사용 합계가 이 한도에 포함됩니다.</p>
                  {[...new Set(cards.map(c => c.card_company).filter(Boolean))].map(company => {
                    const companyCards = cards.filter(c => c.card_company === company)
                    const companyUsage = companyCards.reduce((s, c) => s + (cardUsage[c.id]?.total || 0), 0)
                    const settingKey = `card_company::${company}`
                    const currentLimit = limitSettings[settingKey] || 0
                    const rate = currentLimit > 0 ? Math.min(100, Math.round((companyUsage / currentLimit) * 100)) : 0
                    const isEditing = editingLimitKey === settingKey

                    return (
                      <div key={company} style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>{company}</span>
                            <span style={{ fontSize: 10, background: '#e2e8f0', color: '#64748b', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>{companyCards.length}장</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>사용: {formatMoney(companyUsage)}원</span>
                        </div>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ position: 'relative' as const, flex: 1 }}>
                              <input type="text"
                                autoFocus
                                value={limitForm.amount ? Number(limitForm.amount).toLocaleString() : ''}
                                onChange={e => setLimitForm({ ...limitForm, amount: e.target.value.replace(/[^0-9]/g, '') })}
                                style={{ width: '100%', border: '2px solid #3b82f6', borderRadius: 8, padding: '8px 30px 8px 12px', fontSize: 13, fontWeight: 800, textAlign: 'right' as const, outline: 'none' }}
                                placeholder="0" />
                              <span style={{ position: 'absolute' as const, right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>원</span>
                            </div>
                            <button onClick={saveLimitSetting}
                              style={{ padding: '8px 14px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>저장</button>
                            <button onClick={() => { setEditingLimitKey(null); setLimitForm({ type: 'card_company', key: '', amount: '' }) }}
                              style={{ padding: '8px 10px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>취소</button>
                          </div>
                        ) : (
                          <div>
                            {currentLimit > 0 ? (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{formatMoney(currentLimit)}원</span>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <span style={{ fontSize: 14, fontWeight: 900, color: rate >= 80 ? '#ef4444' : rate >= 50 ? '#f59e0b' : '#10b981' }}>{rate}%</span>
                                    <button onClick={() => { setLimitForm({ type: 'card_company', key: company, amount: String(currentLimit) }); setEditingLimitKey(settingKey) }}
                                      style={{ fontSize: 11, color: '#64748b', background: '#e2e8f0', border: 'none', padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>수정</button>
                                    <button onClick={() => deleteLimitSetting('card_company', company)}
                                      style={{ fontSize: 11, color: '#ef4444', background: '#fef2f2', border: 'none', padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>삭제</button>
                                  </div>
                                </div>
                                <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${rate}%`, borderRadius: 3, background: rate >= 80 ? '#ef4444' : rate >= 50 ? '#f59e0b' : '#10b981', transition: 'width 0.5s' }} />
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => { setLimitForm({ type: 'card_company', key: company, amount: '' }); setEditingLimitKey(settingKey) }}
                                style={{ width: '100%', padding: '10px', background: 'white', border: '2px dashed #e2e8f0', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#94a3b8', cursor: 'pointer' }}>
                                + 한도 설정하기
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── 부서별 한도 탭 ── */}
              {limitTab === 'dept' && (
                <div>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>부서별 카드 사용 한도를 설정합니다. 해당 부서에 배정된 모든 카드의 사용 합계입니다.</p>
                  {departments.length === 0 ? (
                    <div style={{ textAlign: 'center' as const, padding: '30px 0', color: '#94a3b8' }}>
                      <p style={{ fontSize: 13, fontWeight: 600 }}>등록된 부서가 없습니다</p>
                      <p style={{ fontSize: 11, marginTop: 4 }}>🏷️ 부서설정에서 먼저 부서를 추가해주세요</p>
                    </div>
                  ) : departments.map(dept => {
                    const deptCards = cards.filter(c => c.card_alias === dept)
                    const deptUsage = deptCards.reduce((s, c) => s + (cardUsage[c.id]?.total || 0), 0)
                    const settingKey = `dept::${dept}`
                    const currentLimit = limitSettings[settingKey] || 0
                    const rate = currentLimit > 0 ? Math.min(100, Math.round((deptUsage / currentLimit) * 100)) : 0
                    const isEditing = editingLimitKey === settingKey

                    return (
                      <div key={dept} style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>{dept}</span>
                            <span style={{ fontSize: 10, background: '#e2e8f0', color: '#64748b', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>{deptCards.length}장</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>사용: {formatMoney(deptUsage)}원</span>
                        </div>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ position: 'relative' as const, flex: 1 }}>
                              <input type="text"
                                autoFocus
                                value={limitForm.amount ? Number(limitForm.amount).toLocaleString() : ''}
                                onChange={e => setLimitForm({ ...limitForm, amount: e.target.value.replace(/[^0-9]/g, '') })}
                                style={{ width: '100%', border: '2px solid #3b82f6', borderRadius: 8, padding: '8px 30px 8px 12px', fontSize: 13, fontWeight: 800, textAlign: 'right' as const, outline: 'none' }}
                                placeholder="0" />
                              <span style={{ position: 'absolute' as const, right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>원</span>
                            </div>
                            <button onClick={saveLimitSetting}
                              style={{ padding: '8px 14px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>저장</button>
                            <button onClick={() => { setEditingLimitKey(null); setLimitForm({ type: 'dept', key: '', amount: '' }) }}
                              style={{ padding: '8px 10px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>취소</button>
                          </div>
                        ) : (
                          <div>
                            {currentLimit > 0 ? (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{formatMoney(currentLimit)}원</span>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <span style={{ fontSize: 14, fontWeight: 900, color: rate >= 80 ? '#ef4444' : rate >= 50 ? '#f59e0b' : '#10b981' }}>{rate}%</span>
                                    <button onClick={() => { setLimitForm({ type: 'dept', key: dept, amount: String(currentLimit) }); setEditingLimitKey(settingKey) }}
                                      style={{ fontSize: 11, color: '#64748b', background: '#e2e8f0', border: 'none', padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>수정</button>
                                    <button onClick={() => deleteLimitSetting('dept', dept)}
                                      style={{ fontSize: 11, color: '#ef4444', background: '#fef2f2', border: 'none', padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>삭제</button>
                                  </div>
                                </div>
                                <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${rate}%`, borderRadius: 3, background: rate >= 80 ? '#ef4444' : rate >= 50 ? '#f59e0b' : '#10b981', transition: 'width 0.5s' }} />
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => { setLimitForm({ type: 'dept', key: dept, amount: '' }); setEditingLimitKey(settingKey) }}
                                style={{ width: '100%', padding: '10px', background: 'white', border: '2px dashed #e2e8f0', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#94a3b8', cursor: 'pointer' }}>
                                + 한도 설정하기
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── 카드별 한도 탭 ── */}
              {limitTab === 'card' && (
                <div>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>개별 카드의 월 한도입니다. 카드 등록/수정 시 설정한 한도가 여기에 표시됩니다.</p>
                  <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '6px 1fr 100px 100px 60px', padding: '8px 12px 8px 0', background: '#f8fafc', fontSize: 10, fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
                      <div />
                      <div style={{ paddingLeft: 12 }}>카드</div>
                      <div style={{ textAlign: 'right' as const }}>사용</div>
                      <div style={{ textAlign: 'right' as const }}>한도</div>
                      <div style={{ textAlign: 'center' as const }}>%</div>
                    </div>
                    {cards.map((c, idx) => {
                      const usage = cardUsage[c.id] || { count: 0, total: 0 }
                      const limitRate = c.monthly_limit ? Math.min(100, Math.round((usage.total / c.monthly_limit) * 100)) : 0
                      const colorHex = c.card_company?.includes('신한') ? '#1d4ed8' : c.card_company?.includes('삼성') ? '#1e293b' : (c.card_company?.includes('KB') || c.card_company?.includes('국민')) ? '#d97706' : c.card_company?.includes('우리') ? '#0284c7' : '#475569'
                      return (
                        <div key={c.id} style={{
                          display: 'grid', gridTemplateColumns: '6px 1fr 100px 100px 60px',
                          alignItems: 'center', padding: '10px 12px 10px 0',
                          background: 'white', borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none',
                        }}>
                          <div style={{ width: 6, height: '100%', background: colorHex }} />
                          <div style={{ paddingLeft: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>{c.card_company} ····{(c.card_number || '').replace(/[^0-9*]/g, '').slice(-4)}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.card_alias || '미분류'} · {c.holder_name || '공용'}</div>
                          </div>
                          <div style={{ textAlign: 'right' as const, fontSize: 12, fontWeight: 800, color: usage.total > 0 ? '#0f172a' : '#cbd5e1' }}>
                            {formatMoney(usage.total)}
                          </div>
                          <div style={{ textAlign: 'right' as const }}>
                            {c.monthly_limit ? (
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{formatMoney(c.monthly_limit)}</span>
                            ) : (
                              <button onClick={() => handleEdit(c)}
                                style={{ fontSize: 10, color: '#3b82f6', background: '#eff6ff', border: 'none', padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>설정</button>
                            )}
                          </div>
                          <div style={{ textAlign: 'center' as const }}>
                            {c.monthly_limit ? (
                              <span style={{ fontSize: 12, fontWeight: 900, color: limitRate >= 80 ? '#ef4444' : limitRate >= 50 ? '#f59e0b' : '#10b981' }}>{limitRate}%</span>
                            ) : (
                              <span style={{ fontSize: 10, color: '#cbd5e1' }}>-</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 구조 설명 */}
              <div style={{ background: '#fffbeb', borderRadius: 12, padding: 14, border: '1px solid #fde68a', marginTop: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#92400e', marginBottom: 4 }}>💡 한도 계층 구조</p>
                <div style={{ fontSize: 11, color: '#a16207', lineHeight: 1.8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ background: '#fde68a', padding: '2px 8px', borderRadius: 6, fontWeight: 800 }}>1단계</span>
                    <span>🏢 회사(카드사) 한도 — 카드사별 전체 사용 상한</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ background: '#fde68a', padding: '2px 8px', borderRadius: 6, fontWeight: 800 }}>2단계</span>
                    <span>🏷️ 부서 한도 — 부서별 사용 배분</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ background: '#fde68a', padding: '2px 8px', borderRadius: 6, fontWeight: 800 }}>3단계</span>
                    <span>💳 카드별 한도 — 개별 카드 월 한도</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      </>}

      {/* ══════ 특이건 검토 탭 ══════ */}
      {mainTab === 'flags' && (
        <div>
          {/* 필터 바 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { key: 'unresolved', label: '미처리', count: (flagSummary.pending || 0) + (flagSummary.reviewing || 0) },
              { key: 'approved', label: '정상 확인', count: flagSummary.approved || 0 },
              { key: 'personal_confirmed', label: '개인사용 확정', count: flagSummary.personal_confirmed || 0 },
              { key: 'dismissed', label: '무시', count: flagSummary.dismissed || 0 },
            ].map(f => (
              <button key={f.key} onClick={() => setFlagFilter(f.key)}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  background: flagFilter === f.key ? '#1e293b' : '#fff',
                  color: flagFilter === f.key ? '#fff' : '#6b7280',
                  border: flagFilter === f.key ? 'none' : '1px solid #e5e7eb',
                }}>
                {f.label} ({f.count})
              </button>
            ))}
          </div>

          {/* 특이건 목록 */}
          {flagLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>로딩 중...</div>
          ) : flagItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <p style={{ fontSize: 16, fontWeight: 700 }}>특이건이 없습니다</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>카드/통장 업로드 후 저장 시 자동으로 감지됩니다</p>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#6b7280' }}>유형</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#6b7280' }}>날짜</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#6b7280' }}>거래처</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#6b7280' }}>금액</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#6b7280' }}>사용자</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#6b7280' }}>사유</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#6b7280' }}>처리</th>
                  </tr>
                </thead>
                <tbody>
                  {flagItems.map((flag: any) => {
                    const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
                      low_confidence: { icon: '🤖', label: 'AI 불확실', color: '#f59e0b' },
                      personal_use: { icon: '🏠', label: '개인사용 의심', color: '#ef4444' },
                      unusual_amount: { icon: '💰', label: '고액 거래', color: '#8b5cf6' },
                      unusual_time: { icon: '🌙', label: '비정상 시간', color: '#6366f1' },
                      foreign_currency: { icon: '💱', label: '외화 결제', color: '#0ea5e9' },
                      no_receipt: { icon: '🧾', label: '영수증 없음', color: '#64748b' },
                      card_user_mismatch: { icon: '👤', label: '사용자 불일치', color: '#dc2626' },
                      duplicate_suspect: { icon: '📋', label: '중복 의심', color: '#f97316' },
                      manual_review: { icon: '✋', label: '수동 검토', color: '#374151' },
                      other: { icon: '❓', label: '기타', color: '#9ca3af' },
                    }
                    const tc = typeConfig[flag.flag_type] || typeConfig.other
                    return (
                      <tr key={flag.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${tc.color}15`, color: tc.color }}>
                            {tc.icon} {tc.label}
                          </span>
                          {flag.severity === 'high' && <span style={{ marginLeft: 4, fontSize: 10, color: '#ef4444', fontWeight: 800 }}>!</span>}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: 11 }}>{flag.transaction_date || '-'}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1f2937' }}>{flag.client_name || '-'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>{(flag.amount || 0).toLocaleString()}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {flag.employee_name ? (
                            <span style={{ padding: '2px 6px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontSize: 10, fontWeight: 600 }}>
                              {flag.employee_name}
                            </span>
                          ) : <span style={{ fontSize: 10, color: '#d1d5db' }}>-</span>}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {flag.flag_reason || '-'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {flag.status === 'pending' || flag.status === 'reviewing' ? (
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              <button onClick={() => updateFlagStatus([flag.id], 'approved')}
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                ✓ 정상
                              </button>
                              <button onClick={() => updateFlagStatus([flag.id], 'personal_confirmed')}
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #dc2626', background: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                ✕ 개인사용
                              </button>
                              <button onClick={() => updateFlagStatus([flag.id], 'dismissed')}
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #9ca3af', background: '#f9fafb', color: '#9ca3af', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                무시
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 10, fontWeight: 600, color: flag.status === 'approved' ? '#16a34a' : flag.status === 'personal_confirmed' ? '#dc2626' : '#9ca3af' }}>
                              {flag.status === 'approved' ? '✅ 정상' : flag.status === 'personal_confirmed' ? '🔴 개인사용' : '⏭️ 무시'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════ 급여 반영 탭 ══════ */}
      {mainTab === 'salary' && (
        <div>
          {/* 월 선택 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <input type="month" value={salaryMonth} onChange={e => setSalaryMonth(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 700 }} />
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              총 {salaryAdjustments.length}건의 조정 내역
            </span>
          </div>

          {/* 직원별 요약 카드 */}
          {Object.keys(salarySummary).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 20 }}>
              {Object.entries(salarySummary).map(([empId, summary]: [string, any]) => {
                const emp = employees.find(e => e.id === empId)
                return (
                  <div key={empId} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: '#1e40af' }}>
                        {(emp?.employee_name || summary.name || '?')[0]}
                      </div>
                      <div>
                        <p style={{ fontWeight: 800, fontSize: 13, color: '#1f2937', margin: 0 }}>{emp?.employee_name || summary.name || empId.slice(0, 8)}</p>
                        <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>{emp?.position?.name || ''} · {emp?.department?.name || ''}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <div>
                        <p style={{ color: '#dc2626', fontWeight: 700, margin: 0 }}>차감: -{summary.deduct.toLocaleString()}원</p>
                        <p style={{ color: '#16a34a', fontWeight: 700, margin: 0 }}>가산: +{summary.add.toLocaleString()}원</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>순 조정액</p>
                        <p style={{ fontWeight: 900, fontSize: 16, color: summary.net >= 0 ? '#16a34a' : '#dc2626', margin: 0 }}>
                          {summary.net >= 0 ? '+' : ''}{summary.net.toLocaleString()}원
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 조정 내역 목록 */}
          {salaryAdjustments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
              <p style={{ fontSize: 16, fontWeight: 700 }}>이번 달 급여 조정 내역이 없습니다</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>특이건 검토에서 "개인사용 확정" 시 자동으로 생성됩니다</p>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#6b7280' }}>직원</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#6b7280' }}>유형</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#6b7280' }}>금액</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#6b7280' }}>사유</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#6b7280' }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryAdjustments.map((adj: any) => {
                    const emp = employees.find(e => e.id === adj.employee_id)
                    return (
                      <tr key={adj.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{emp?.employee_name || adj.employee_id?.slice(0, 8) || '-'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                            background: adj.adjustment_type === 'deduct' ? '#fef2f2' : '#f0fdf4',
                            color: adj.adjustment_type === 'deduct' ? '#dc2626' : '#16a34a',
                          }}>
                            {adj.adjustment_type === 'deduct' ? '➖ 차감' : '➕ 가산'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: adj.adjustment_type === 'deduct' ? '#dc2626' : '#16a34a' }}>
                          {adj.adjustment_type === 'deduct' ? '-' : '+'}{(adj.amount || 0).toLocaleString()}원
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: '#6b7280', maxWidth: 300 }}>{adj.reason}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                            background: adj.status === 'applied' ? '#f0fdf4' : adj.status === 'approved' ? '#dbeafe' : adj.status === 'cancelled' ? '#f9fafb' : '#fef3c7',
                            color: adj.status === 'applied' ? '#16a34a' : adj.status === 'approved' ? '#1e40af' : adj.status === 'cancelled' ? '#9ca3af' : '#92400e',
                          }}>
                            {adj.status === 'pending' ? '⏳ 대기' : adj.status === 'approved' ? '✅ 승인' : adj.status === 'applied' ? '💰 반영완료' : '❌ 취소'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { supabase } from '../../utils/supabase'
import { useEffect, useState, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import * as XLSX from 'xlsx'

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
  const { company, role, adminSelectedCompanyId } = useApp()
  const companyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

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
      const { data, error } = await supabase.from('corporate_cards')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) console.error('corporate_cards fetch error:', error.message)
      setCards(data || [])
    } catch (e) {
      console.error('corporate_cards exception:', e)
      setCards([])
    } finally {
      setLoading(false)
    }
  }

  const fetchEmployees = async () => {
    const { data } = await supabase.from('profiles')
      .select('id, employee_name')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('employee_name')
    setEmployees(data || [])
  }

  const fetchCars = async () => {
    const { data } = await supabase.from('cars')
      .select('id, number, brand, model, status')
      .eq('company_id', companyId)
      .order('number')
    setCarsList(data || [])
  }

  const fetchCardUsage = async () => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

    const { data } = await supabase.from('transactions')
      .select('card_id, amount')
      .eq('company_id', companyId)
      .eq('payment_method', '카드')
      .gte('transaction_date', `${ym}-01`)
      .lte('transaction_date', `${ym}-${lastDay}`)

    const usage: Record<string, { count: number; total: number }> = {}
    ;(data || []).forEach((t: any) => {
      if (!t.card_id) return
      if (!usage[t.card_id]) usage[t.card_id] = { count: 0, total: 0 }
      usage[t.card_id].count++
      usage[t.card_id].total += Number(t.amount || 0)
    })
    setCardUsage(usage)
  }

  // ──── 배정 이력 조회 ────
  const fetchAssignmentHistory = async (cardId: string) => {
    setHistoryLoading(true)
    try {
      const { data, error } = await supabase.from('card_assignment_history')
        .select('*')
        .eq('card_id', cardId)
        .order('assigned_at', { ascending: false })
      if (error) console.error('assignment history fetch error:', error.message)
      setAssignmentHistory(data || [])
    } catch (e) {
      console.error('assignment history exception:', e)
      setAssignmentHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  // ──── 한도 설정 CRUD ────
  const fetchLimitSettings = async () => {
    const { data } = await supabase.from('card_limit_settings')
      .select('*')
      .eq('company_id', companyId)
    const map: Record<string, number> = {}
    ;(data || []).forEach((d: any) => {
      map[`${d.limit_type}::${d.limit_key}`] = d.monthly_limit
    })
    setLimitSettings(map)
  }

  const getGroupLimit = (type: string, key: string) => limitSettings[`${type}::${key}`] || 0

  const saveLimitSetting = async () => {
    if (!limitForm.key || !limitForm.amount) return alert('항목과 금액을 입력해주세요.')
    const amount = Number(limitForm.amount)

    // upsert
    const { data: existing } = await supabase.from('card_limit_settings')
      .select('id')
      .eq('company_id', companyId)
      .eq('limit_type', limitForm.type)
      .eq('limit_key', limitForm.key)
      .maybeSingle()

    if (existing) {
      await supabase.from('card_limit_settings').update({ monthly_limit: amount }).eq('id', existing.id)
    } else {
      await supabase.from('card_limit_settings').insert({
        company_id: companyId,
        limit_type: limitForm.type,
        limit_key: limitForm.key,
        monthly_limit: amount,
      })
    }
    fetchLimitSettings()
    setLimitForm({ type: 'card_company', key: '', amount: '' })
    setEditingLimitKey(null)
  }

  const deleteLimitSetting = async (type: string, key: string) => {
    if (!confirm(`"${key}" 한도 설정을 삭제하시겠습니까?`)) return
    await supabase.from('card_limit_settings')
      .delete()
      .eq('company_id', companyId)
      .eq('limit_type', type)
      .eq('limit_key', key)
    fetchLimitSettings()
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
    // 해당 부서 카드의 card_alias 초기화
    if (cardsInDept.length > 0) {
      for (const c of cardsInDept) {
        await supabase.from('corporate_cards').update({ card_alias: '' }).eq('id', c.id)
      }
    }
    setDepartments(departments.filter(d => d !== dept))
    fetchCards()
  }
  const renameDepartment = async () => {
    if (!renameDept || !renameDept.to.trim()) return
    const cardsInDept = cards.filter(c => c.card_alias === renameDept.from)
    for (const c of cardsInDept) {
      await supabase.from('corporate_cards').update({ card_alias: renameDept.to.trim() }).eq('id', c.id)
    }
    setDepartments(departments.map(d => d === renameDept.from ? renameDept.to.trim() : d))
    // 한도 설정도 변경
    const limitKey = `dept::${renameDept.from}`
    if (limitSettings[limitKey]) {
      await supabase.from('card_limit_settings')
        .update({ limit_key: renameDept.to.trim() })
        .eq('company_id', companyId)
        .eq('limit_type', 'dept')
        .eq('limit_key', renameDept.from)
      fetchLimitSettings()
    }
    setRenameDept(null)
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
    const payload = {
      ...form,
      company_id: companyId,
      monthly_limit: form.monthly_limit ? Number(form.monthly_limit) : null,
      assigned_employee_id: form.assigned_employee_id || null,
      assigned_car_id: form.assigned_car_id || null,
      card_type: form.card_type || null,
      expiry_date: form.expiry_date || null,
      previous_card_numbers: form.previous_card_numbers.filter((n: string) => n.trim()),
    }

    if (editingId) {
      // 배정자 변경 감지 → 히스토리 기록
      const oldCard = cards.find(c => c.id === editingId)
      const oldEmpId = oldCard?.assigned_employee_id || null
      const newEmpId = payload.assigned_employee_id || null

      const { error } = await supabase.from('corporate_cards').update(payload).eq('id', editingId)
      if (error) return alert('수정 실패: ' + error.message)

      // 배정자가 변경된 경우 히스토리 기록
      if (oldEmpId !== newEmpId) {
        // 이전 배정자의 현재 이력 종료
        if (oldEmpId) {
          await supabase.from('card_assignment_history')
            .update({ unassigned_at: new Date().toISOString() })
            .eq('card_id', editingId)
            .eq('employee_id', oldEmpId)
            .is('unassigned_at', null)
        }
        // 새 배정자 이력 추가
        if (newEmpId) {
          const empName = employees.find(e => e.id === newEmpId)?.employee_name || '(알 수 없음)'
          await supabase.from('card_assignment_history').insert({
            card_id: editingId,
            employee_id: newEmpId,
            employee_name: empName,
            assigned_at: new Date().toISOString(),
            reason: assignReasonInput.trim() || null,
          })
        }
      }
    } else {
      const { data: inserted, error } = await supabase.from('corporate_cards').insert(payload).select('id').single()
      if (error) return alert('등록 실패: ' + error.message)

      // 신규 등록 시 배정자가 있으면 첫 히스토리 생성
      if (inserted && payload.assigned_employee_id) {
        const empName = employees.find(e => e.id === payload.assigned_employee_id)?.employee_name || '(알 수 없음)'
        await supabase.from('card_assignment_history').insert({
          card_id: inserted.id,
          employee_id: payload.assigned_employee_id,
          employee_name: empName,
          assigned_at: new Date().toISOString(),
          reason: '신규 등록',
        })
      }
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
    await supabase.from('corporate_cards').delete().eq('id', id)
    fetchCards()
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
      const colCompany = findCol(['카드사', '카드회사', '발급사', '제휴카드종류', '제휴카드', '카드종류', 'card_company', 'company'])
      const colNumber = findCol(['카드번호', '카드 번호', 'card_number', 'number'])
      const colHolder = findCol(['명의자', '소유자', '이름', 'holder', 'name', '성명'])
      const colAlias = findCol(['별칭', '별명', 'alias', '카드명', '카드이름', '부서명'])
      const colLimit = findCol(['한도', 'limit', '월한도', '사용한도', '카드한도'])
      const colMemo = findCol(['메모', 'memo', '비고', '참고'])

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

        // 카드번호 또는 카드사가 있어야 유효한 행
        if (!cardNumber && !cardCompanyRaw) continue

        parsed.push({
          card_company: matchCardCompany(cardCompanyRaw) || cardCompanyRaw || '',
          card_number: cardNumber.replace(/\s/g, ''),
          holder_name: holderName,
          card_alias: cardAlias,
          monthly_limit: monthlyLimit,
          memo,
          is_active: true,
          _selected: true,
        })
      }

      if (parsed.length === 0) {
        setBulkLogs(prev => [...prev, `⚠️ ${file.name}: 카드 정보를 찾을 수 없습니다`])
      } else {
        setBulkCards(prev => [...prev, ...parsed])
        setBulkLogs(prev => [...prev, `✅ ${file.name}: ${parsed.length}장 카드 인식`])
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

      const res = await fetch('/api/ocr-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    if (!confirm(`${selected.length}장의 카드를 일괄 등록하시겠습니까?`)) return

    setBulkProcessing(true)
    let success = 0, fail = 0

    for (const card of selected) {
      const { _selected, ...payload } = card
      const { error } = await supabase.from('corporate_cards').insert({
        ...payload,
        company_id: companyId,
        monthly_limit: payload.monthly_limit ? Number(payload.monthly_limit) : null,
        assigned_car_id: payload.assigned_car_id || null,
      })
      if (error) { fail++; console.error('bulk insert error:', error.message) }
      else success++
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

  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px', minHeight: '100vh', background: '#f9fafb' }}>
        <div style={{ padding: '80px 48px', textAlign: 'center', color: '#9ca3af', fontSize: 14, background: '#fff', borderRadius: 16 }}>
          <span style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>🏢</span>
          <p style={{ fontWeight: 700, color: '#4b5563', margin: 0 }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

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
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0 }}>💳 법인카드 관리</h1>
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
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0 }}>💳 법인카드 관리</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4, margin: '4px 0 0' }}>법인카드 등록 및 사용내역 자동 분류 · 직원 배정 · 한도 관리</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
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
        </div>
      </div>

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
                      <th style={{ padding: 12, textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>별칭</th>
                      <th style={{ padding: 12, textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>배치 차량</th>
                      <th style={{ padding: 12, textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>월한도</th>
                      <th style={{ padding: 12, textAlign: 'center' as const, width: 40, fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkCards.map((card, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f8fafc', opacity: card._selected ? 1 : 0.4 }}>
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

        // 그룹핑 로직
        const grouped: Record<string, any[]> = {}
        cards.forEach(c => {
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
    </div>
  )
}

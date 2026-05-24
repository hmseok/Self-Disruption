'use client'

// ═══════════════════════════════════════════════════════════════════
// RideOrgPanel — 라이드케어 (외주) 인력 부서 관리 패널
// PR-HR-2 (2026-05-16) + PR-HR-3 보강 (부서 CRUD + 직원 활성 필터)
//
// /hr 통합 페이지 「외부 인력」 탭 → 「라이드 인력」 서브탭에서 렌더.
//   · DcStatStrip 5칸 (활성/부서수/이번달입사/퇴사예정/승진대상)
//   · 좌측 부서 트리 (Glass 5색, CRUD) + 우측 NeuDataTable
//   · 부서 추가/이름변경/상위이동/삭제 / 부서장 지정 / 일괄 부서 변경
//   · 직원 테이블 기본 활성만 + 「비활성 포함」 토글 (중복 정리 잔재 숨김)
//   · focus=<id> highlight
//
// 데이터: /api/ride-departments(/tree) + /api/ride-employees
// 회의록(meetings) 연동 — ride_departments.leader_employee_id 공유.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import * as XLSX from 'xlsx'
import DcStatStrip, { StatItem } from '../../components/DcStatStrip'
import NeuDataTable, { TableColumn } from '../../components/NeuDataTable'
import { auth } from '@/lib/auth-client'
import { GLASS } from '@/app/utils/ui-tokens'

// ─── 엑셀 일괄 등록 (PR-HR-5) ──────────────────────────────────────
type UploadRow = { name: string; phone: string; email: string; department: string; position: string }
type UploadPlan = {
  summary: { total: number; ok: number; empty: number; duplicate: number; error: number }
  plan: { index: number; status: string; errors: string[]; raw: any; parsed?: any }[]
}
// 엑셀 헤더 → 필드 매핑
function mapHeader(h: string): keyof UploadRow | null {
  const s = h.trim().toLowerCase()
  if (/이름|성명|직원명|^name$/.test(s)) return 'name'
  if (/연락처|전화|휴대폰|핸드폰|폰번호|phone|mobile|tel/.test(s)) return 'phone'
  if (/이메일|메일|mail/.test(s)) return 'email'
  if (/부서|소속|department/.test(s)) return 'department'
  if (/직급|직책|position|직위/.test(s)) return 'position'
  return null
}

// ─── 타입 ───────────────────────────────────────────────────────────
type RideDept = {
  id: string
  name: string
  parent_id: string | null
  leader_employee_id: string | null
  leader_name: string | null
  color_tone: string
  sort_order: number
  description: string | null
  is_active: boolean
  employee_count: number
  total_count: number
  children: RideDept[]
}

type RideEmp = {
  id: string
  name: string
  department: string | null
  department_id: string | null
  position: string | null
  promotion_target: string | null
  employment_type: string | null
  hire_date: string | null
  resign_date: string | null
  phone: string | null
  email: string | null
  color_tone: string
  is_active: boolean
}

// ─── Glass 5색 톤 (CLAUDE.md §10) ──────────────────────────────────
const TONE: Record<string, { dot: string; bg: string; bd: string; tx: string }> = {
  blue:   { dot: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  bd: 'rgba(59,130,246,0.30)',  tx: '#2563eb' },
  green:  { dot: '#22c55e', bg: 'rgba(34,197,94,0.10)',   bd: 'rgba(34,197,94,0.30)',   tx: '#16a34a' },
  red:    { dot: '#ef4444', bg: 'rgba(239,68,68,0.10)',   bd: 'rgba(239,68,68,0.30)',   tx: '#dc2626' },
  amber:  { dot: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  bd: 'rgba(245,158,11,0.30)',  tx: '#d97706' },
  violet: { dot: '#8b5cf6', bg: 'rgba(139,92,246,0.10)',  bd: 'rgba(139,92,246,0.30)',  tx: '#7c3aed' },
  slate:  { dot: '#94a3b8', bg: 'rgba(148,163,184,0.10)', bd: 'rgba(148,163,184,0.30)', tx: '#64748b' },
}
const tone = (t: string | null | undefined) => TONE[t || 'slate'] || TONE.slate
const TONE_KEYS = ['blue', 'green', 'red', 'amber', 'violet', 'slate'] as const

// ride_employees.color_tone 옵션 (API COLOR_TONES 와 일치)
const EMP_TONE_KEYS = ['none', 'blue', 'gray', 'green', 'amber', 'violet', 'red'] as const
const EMPLOYMENT_TYPES = ['정규', '계약', '파트', '용역', '프리'] as const

// ─── 직원 편집/등록 폼 (PR-HR-4) ───────────────────────────────────
type EmpForm = {
  name: string; position: string; promotion_target: string; employment_type: string
  hire_date: string; resign_date: string; phone: string; email: string
  department_id: string; color_tone: string; memo: string; is_active: boolean
}
const EMP_FORM_EMPTY: EmpForm = {
  name: '', position: '', promotion_target: '', employment_type: '',
  hire_date: '', resign_date: '', phone: '', email: '',
  department_id: '', color_tone: 'none', memo: '', is_active: true,
}

async function authHeader(): Promise<Record<string, string>> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const glassCard: React.CSSProperties = {
  ...GLASS.L4,           // Soft Ice Glass L4 (테이블/모달 — white/0.72)
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

// ─── 트리 평탄화 (DFS) ──────────────────────────────────────────────
function flatten(nodes: RideDept[], depth = 0, out: { node: RideDept; depth: number }[] = []) {
  for (const n of nodes) {
    out.push({ node: n, depth })
    if (n.children?.length) flatten(n.children, depth + 1, out)
  }
  return out
}
function descendantIds(node: RideDept): string[] {
  const ids = [node.id]
  for (const c of node.children || []) ids.push(...descendantIds(c))
  return ids
}
function findNode(nodes: RideDept[], id: string): RideDept | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const f = findNode(n.children || [], id)
    if (f) return f
  }
  return null
}

export default function RideOrgPanel() {
  const searchParams = useSearchParams()
  const focusId = searchParams?.get('focus') || null

  const [tree, setTree] = useState<RideDept[]>([])
  const [employees, setEmployees] = useState<RideEmp[]>([])
  const [loading, setLoading] = useState(true)
  const [migrationPending, setMigrationPending] = useState(false)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [includeSub, setIncludeSub] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<{ ok: boolean; title: string; lines: string[] } | null>(null)

  const [assigningLeader, setAssigningLeader] = useState(false)
  const [bulkTargetDept, setBulkTargetDept] = useState<string>('')

  // ─── 부서 CRUD 상태 ──────────────────────────────────────────────
  const [showNewDept, setShowNewDept] = useState(false)
  const [newDept, setNewDept] = useState<{ name: string; parent_id: string; color_tone: string }>(
    { name: '', parent_id: '', color_tone: 'slate' }
  )
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null)
  const [editDept, setEditDept] = useState<{ name: string; parent_id: string; color_tone: string }>(
    { name: '', parent_id: '', color_tone: 'slate' }
  )
  const [savingDept, setSavingDept] = useState(false)

  // ─── 직원 편집/등록 모달 상태 (PR-HR-4) ──────────────────────────
  const [empModal, setEmpModal] = useState<RideEmp | 'new' | null>(null)
  const [empForm, setEmpForm] = useState<EmpForm>(EMP_FORM_EMPTY)
  const [savingEmp, setSavingEmp] = useState(false)

  // ─── 엑셀 일괄 등록 상태 (PR-HR-5) ───────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadRows, setUploadRows] = useState<UploadRow[] | null>(null)
  const [uploadPlan, setUploadPlan] = useState<UploadPlan | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadFileName, setUploadFileName] = useState('')

  // ─── 데이터 로드 ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const h = await authHeader()
      // cache: 'no-store' — mutation(퇴사/수정/부서변경) 후 refetch 가 브라우저 캐시된
      // 옛 데이터를 받지 않도록 강제 (PR-HR-4b — "리스트 적용 안 됨" 수정)
      const [treeRes, empRes] = await Promise.all([
        fetch('/api/ride-departments/tree', { headers: h, cache: 'no-store' }),
        fetch('/api/ride-employees?include_inactive=1', { headers: h, cache: 'no-store' }),
      ])
      const treeJson = await treeRes.json().catch(() => ({}))
      const empJson = await empRes.json().catch(() => ({}))
      setTree(treeJson.data || [])
      setEmployees(empJson.data || [])
      setMigrationPending(Boolean(treeJson._migration_pending || empJson._migration_pending))
    } catch {
      setTree([]); setEmployees([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!focusId || employees.length === 0) return
    const emp = employees.find(e => e.id === focusId)
    if (emp?.department_id) setSelectedDeptId(emp.department_id)
  }, [focusId, employees])

  const flatTree = useMemo(() => flatten(tree), [tree])
  const deptById = useMemo(() => {
    const m = new Map<string, RideDept>()
    flatTree.forEach(({ node }) => m.set(node.id, node))
    return m
  }, [flatTree])

  const visibleDeptIds = useMemo(() => {
    if (!selectedDeptId) return null
    const node = findNode(tree, selectedDeptId)
    if (!node) return new Set<string>([selectedDeptId])
    return new Set<string>(includeSub ? descendantIds(node) : [selectedDeptId])
  }, [selectedDeptId, includeSub, tree])

  // ─── 직원 필터 (활성 기본 + 비활성 토글 — 중복 정리 잔재 숨김) ──────
  const filteredEmps = useMemo(() => {
    let list = employees
    if (!showInactive) list = list.filter(e => e.is_active)
    if (visibleDeptIds) {
      list = list.filter(e => e.department_id && visibleDeptIds.has(e.department_id))
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.position || '').toLowerCase().includes(q) ||
        (e.phone || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [employees, visibleDeptIds, search, showInactive])

  const inactiveCount = useMemo(() => employees.filter(e => !e.is_active).length, [employees])

  // ─── DcStatStrip 5칸 ──────────────────────────────────────────────
  const stats: StatItem[] = useMemo(() => {
    const active = employees.filter(e => e.is_active)
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const newThisMonth = active.filter(e => (e.hire_date || '').startsWith(thisMonth)).length
    const todayStr = now.toISOString().slice(0, 10)
    const resignSoon = employees.filter(e => e.resign_date && e.resign_date >= todayStr && e.is_active).length
    const promoTargets = active.filter(e => e.promotion_target).length
    return [
      { label: '활성 직원', value: active.length, unit: '명', tint: 'green', icon: '👥' },
      { label: '부서 수', value: flatTree.length, unit: '개', tint: 'blue', icon: '🏢' },
      { label: '이번 달 입사', value: newThisMonth, unit: '명', tint: 'blue', icon: '✨' },
      { label: '퇴사 예정', value: resignSoon, unit: '명', tint: 'amber', icon: '📤' },
      { label: '승진 대상', value: promoTargets, unit: '명', tint: 'purple', icon: '⭐' },
    ]
  }, [employees, flatTree])

  // ─── 체크박스 ─────────────────────────────────────────────────────
  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const allChecked = filteredEmps.length > 0 && filteredEmps.every(e => checkedIds.has(e.id))
  const toggleCheckAll = () => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (allChecked) filteredEmps.forEach(e => next.delete(e.id))
      else filteredEmps.forEach(e => next.add(e.id))
      return next
    })
  }

  // ─── 일괄 부서 변경 ───────────────────────────────────────────────
  const runBulkAssign = async () => {
    const ids = Array.from(checkedIds)
    if (ids.length === 0) { setResult({ ok: false, title: '선택된 직원 없음', lines: ['직원을 먼저 체크해주세요.'] }); return }
    if (!bulkTargetDept) { setResult({ ok: false, title: '대상 부서 미선택', lines: ['이동할 부서를 선택해주세요.'] }); return }
    try {
      const h = await authHeader()
      const res = await fetch('/api/ride-employees/bulk-assign', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: ids, department_id: bulkTargetDept }),
      })
      const json = await res.json()
      if (json.error) { setResult({ ok: false, title: '일괄 변경 실패', lines: [json.error] }); return }
      const d = json.data || {}
      const deptName = deptById.get(bulkTargetDept)?.name || '(부서)'
      setResult({
        ok: (d.failed?.length || 0) === 0,
        title: `✅ 일괄 부서 변경 — ${deptName}`,
        lines: [
          `적용: ${d.applied}명 / 요청: ${d.total}명`,
          ...(d.failed?.length ? [`⚠ 실패 ${d.failed.length}명: ${d.failed.map((f: any) => f.name).join(', ')}`] : ['검증: 전건 PASS']),
        ],
      })
      setCheckedIds(new Set())
      setBulkTargetDept('')
      await load()
    } catch (e: any) {
      setResult({ ok: false, title: '일괄 변경 오류', lines: [e?.message || '네트워크 오류'] })
    }
  }

  // ─── 부서장 지정 ──────────────────────────────────────────────────
  const selectedDept = selectedDeptId ? deptById.get(selectedDeptId) : null
  const assignLeader = async (employeeId: string | null) => {
    if (!selectedDept) return
    try {
      const h = await authHeader()
      const res = await fetch(`/api/ride-departments/${selectedDept.id}`, {
        method: 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leader_employee_id: employeeId }),
      })
      const json = await res.json()
      if (json.error) { setResult({ ok: false, title: '부서장 지정 실패', lines: [json.error] }); return }
      const empName = employeeId ? (employees.find(e => e.id === employeeId)?.name || '(직원)') : '(미지정)'
      setResult({ ok: true, title: `✅ 부서장 지정 — ${selectedDept.name}`, lines: [`부서장: ${empName}`] })
      setAssigningLeader(false)
      await load()
    } catch (e: any) {
      setResult({ ok: false, title: '부서장 지정 오류', lines: [e?.message || '네트워크 오류'] })
    }
  }

  // ─── 부서 CRUD ────────────────────────────────────────────────────
  const createDept = async () => {
    if (!newDept.name.trim()) { setResult({ ok: false, title: '부서명 필수', lines: ['부서 이름을 입력해주세요.'] }); return }
    setSavingDept(true)
    try {
      const h = await authHeader()
      const res = await fetch('/api/ride-departments', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDept.name.trim(),
          parent_id: newDept.parent_id || null,
          color_tone: newDept.color_tone,
        }),
      })
      const json = await res.json()
      if (json.error) { setResult({ ok: false, title: '부서 추가 실패', lines: [json.error] }); return }
      setResult({ ok: true, title: '✅ 부서 추가', lines: [`「${newDept.name.trim()}」 부서가 추가됐습니다.`] })
      setShowNewDept(false)
      setNewDept({ name: '', parent_id: '', color_tone: 'slate' })
      await load()
    } catch (e: any) {
      setResult({ ok: false, title: '부서 추가 오류', lines: [e?.message || '네트워크 오류'] })
    } finally {
      setSavingDept(false)
    }
  }

  const startEditDept = (d: RideDept) => {
    setEditingDeptId(d.id)
    setEditDept({ name: d.name, parent_id: d.parent_id || '', color_tone: d.color_tone })
  }
  const saveEditDept = async () => {
    if (!editingDeptId || !editDept.name.trim()) return
    setSavingDept(true)
    try {
      const h = await authHeader()
      const res = await fetch(`/api/ride-departments/${editingDeptId}`, {
        method: 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editDept.name.trim(),
          parent_id: editDept.parent_id || null,
          color_tone: editDept.color_tone,
        }),
      })
      const json = await res.json()
      if (json.error) { setResult({ ok: false, title: '부서 수정 실패', lines: [json.error] }); return }
      setResult({ ok: true, title: '✅ 부서 수정', lines: [`「${editDept.name.trim()}」 으로 갱신됐습니다.`] })
      setEditingDeptId(null)
      await load()
    } catch (e: any) {
      setResult({ ok: false, title: '부서 수정 오류', lines: [e?.message || '네트워크 오류'] })
    } finally {
      setSavingDept(false)
    }
  }
  const deleteDept = async (d: RideDept) => {
    if (!confirm(`「${d.name}」 부서를 삭제하시겠습니까?\n(직원·하위부서가 남아있으면 차단됩니다)`)) return
    try {
      const h = await authHeader()
      const res = await fetch(`/api/ride-departments/${d.id}`, { method: 'DELETE', headers: h })
      const json = await res.json()
      if (json.error) { setResult({ ok: false, title: '부서 삭제 불가', lines: [json.error] }); return }
      setResult({ ok: true, title: '✅ 부서 삭제', lines: [`「${d.name}」 부서가 삭제(비활성)됐습니다.`] })
      if (selectedDeptId === d.id) setSelectedDeptId(null)
      await load()
    } catch (e: any) {
      setResult({ ok: false, title: '부서 삭제 오류', lines: [e?.message || '네트워크 오류'] })
    }
  }

  // ─── 직원 편집/등록 (PR-HR-4) ────────────────────────────────────
  const openEmpModal = (target: RideEmp | 'new') => {
    if (target === 'new') {
      setEmpForm({ ...EMP_FORM_EMPTY, department_id: selectedDeptId || '' })
    } else {
      setEmpForm({
        name: target.name || '', position: target.position || '',
        promotion_target: target.promotion_target || '',
        employment_type: target.employment_type || '',
        hire_date: target.hire_date || '', resign_date: target.resign_date || '',
        phone: target.phone || '', email: target.email || '',
        department_id: target.department_id || '', color_tone: target.color_tone || 'none',
        memo: '', is_active: target.is_active,
      })
    }
    setEmpModal(target)
  }
  const saveEmp = async () => {
    if (!empForm.name.trim()) { setResult({ ok: false, title: '이름 필수', lines: ['직원 이름을 입력해주세요.'] }); return }
    setSavingEmp(true)
    try {
      const h = await authHeader()
      const isNew = empModal === 'new'
      const body: Record<string, any> = {
        name: empForm.name.trim(),
        position: empForm.position || null,
        promotion_target: empForm.promotion_target || null,
        employment_type: empForm.employment_type || null,
        hire_date: empForm.hire_date || null,
        resign_date: empForm.resign_date || null,
        phone: empForm.phone || null,
        email: empForm.email || null,
        department_id: empForm.department_id || null,
        color_tone: empForm.color_tone,
      }
      if (!isNew) body.is_active = empForm.is_active
      const url = isNew ? '/api/ride-employees' : `/api/ride-employees/${(empModal as RideEmp).id}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) {
        setResult({ ok: false, title: isNew ? '직원 등록 실패' : '직원 수정 실패', lines: [json.error] })
        return
      }
      setResult({ ok: true, title: isNew ? '✅ 직원 등록' : '✅ 직원 수정',
        lines: [`「${empForm.name.trim()}」 ${isNew ? '등록' : '수정'} 완료`] })
      setEmpModal(null)
      await load()
    } catch (e: any) {
      setResult({ ok: false, title: '저장 오류', lines: [e?.message || '네트워크 오류'] })
    } finally {
      setSavingEmp(false)
    }
  }
  const deleteEmp = async () => {
    if (empModal === 'new' || !empModal) return
    const emp = empModal as RideEmp
    if (!confirm(`「${emp.name}」 직원을 퇴사 처리(비활성)하시겠습니까?`)) return
    try {
      const h = await authHeader()
      const res = await fetch(`/api/ride-employees/${emp.id}`, { method: 'DELETE', headers: h })
      const json = await res.json()
      if (json.error) { setResult({ ok: false, title: '퇴사 처리 실패', lines: [json.error] }); return }
      setResult({ ok: true, title: '✅ 퇴사 처리', lines: [`「${emp.name}」 비활성 처리됨 (resign_date 기록)`] })
      setEmpModal(null)
      await load()
    } catch (e: any) {
      setResult({ ok: false, title: '퇴사 처리 오류', lines: [e?.message || '네트워크 오류'] })
    }
  }

  // ─── 엑셀 일괄 등록 (PR-HR-5) ────────────────────────────────────
  const handleFile = async (file: File) => {
    setUploading(true)
    setUploadFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })
      if (matrix.length < 2) {
        setResult({ ok: false, title: '엑셀 비어있음', lines: ['헤더 + 1행 이상 필요합니다.'] })
        return
      }
      // 헤더 행 — 매핑되는 컬럼이 1개 이상인 첫 행
      let headerIdx = 0
      let colMap: Partial<Record<keyof UploadRow, number>> = {}
      for (let h = 0; h < Math.min(matrix.length, 5); h++) {
        const cand: Partial<Record<keyof UploadRow, number>> = {}
        ;(matrix[h] || []).forEach((cell, idx) => {
          const f = mapHeader(String(cell ?? ''))
          if (f && cand[f] == null) cand[f] = idx
        })
        if (cand.name != null) { headerIdx = h; colMap = cand; break }
      }
      if (colMap.name == null) {
        setResult({ ok: false, title: '이름 컬럼 없음', lines: ['엑셀에 「이름/성명」 헤더가 필요합니다.'] })
        return
      }
      const rows: UploadRow[] = matrix.slice(headerIdx + 1).map(r => ({
        name: String(r[colMap.name!] ?? '').trim(),
        phone: colMap.phone != null ? String(r[colMap.phone] ?? '').trim() : '',
        email: colMap.email != null ? String(r[colMap.email] ?? '').trim() : '',
        department: colMap.department != null ? String(r[colMap.department] ?? '').trim() : '',
        position: colMap.position != null ? String(r[colMap.position] ?? '').trim() : '',
      })).filter(r => r.name)
      if (rows.length === 0) {
        setResult({ ok: false, title: '등록할 행 없음', lines: ['이름이 있는 행이 없습니다.'] })
        return
      }
      setUploadRows(rows)
      // preview API
      const h = await authHeader()
      const res = await fetch('/api/ride-employees/bulk-upload', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', rows }),
      })
      const json = await res.json()
      if (json.error) { setResult({ ok: false, title: '미리보기 실패', lines: [json.error] }); return }
      setUploadPlan(json.data as UploadPlan)
    } catch (e: any) {
      setResult({ ok: false, title: '엑셀 분석 오류', lines: [e?.message || '파일을 읽을 수 없습니다.'] })
    } finally {
      setUploading(false)
    }
  }
  const applyUpload = async () => {
    if (!uploadRows) return
    setUploading(true)
    try {
      const h = await authHeader()
      const res = await fetch('/api/ride-employees/bulk-upload', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'apply', rows: uploadRows }),
      })
      const json = await res.json()
      if (json.error) { setResult({ ok: false, title: '일괄 등록 실패', lines: [json.error] }); return }
      const d = json.data
      setResult({
        ok: true, title: `✅ 엑셀 일괄 등록 — ${uploadFileName}`,
        lines: [
          `신규 등록: ${d.inserted}명`,
          `중복 skip: ${d.summary.duplicate}명 / 빈 행: ${d.summary.empty} / 오류: ${d.summary.error}`,
        ],
      })
      setUploadRows(null)
      setUploadPlan(null)
      await load()
    } catch (e: any) {
      setResult({ ok: false, title: '일괄 등록 오류', lines: [e?.message || '네트워크 오류'] })
    } finally {
      setUploading(false)
    }
  }
  const cancelUpload = () => { setUploadRows(null); setUploadPlan(null); setUploadFileName('') }

  // ─── NeuDataTable 컬럼 (Rule 18 — 모든 컬럼 sortBy) ────────────────
  const columns: TableColumn<RideEmp>[] = [
    {
      key: 'check', label: '', width: 52, align: 'center',
      render: (r) => (
        <label onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', padding: '8px 6px', margin: '-8px -6px' }}>
          <input type="checkbox" checked={checkedIds.has(r.id)}
            onChange={() => toggleCheck(r.id)}
            style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#0f2440' }} />
        </label>
      ),
    },
    {
      key: 'name', label: '이름', width: 130,
      sortBy: (r) => r.name,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
          {focusId === r.id && <span title="이동된 직원" style={{ marginRight: 4 }}>🔗</span>}
          {r.name}
          {!r.is_active && <span style={{ marginLeft: 4, fontSize: 10, color: '#94a3b8' }}>(비활성)</span>}
        </span>
      ),
    },
    {
      key: 'department', label: '부서', width: 140,
      sortBy: (r) => (r.department_id ? deptById.get(r.department_id)?.name : '') || r.department || '',
      render: (r) => {
        const d = r.department_id ? deptById.get(r.department_id) : null
        if (!d) return <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#cbd5e1' }}>미배정</span>
        const t = tone(d.color_tone)
        return (
          <span style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12,
            background: t.bg, color: t.tx, border: `1px solid ${t.bd}`, borderRadius: 6, padding: '2px 8px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.dot }} />
            {d.name}
          </span>
        )
      },
    },
    {
      key: 'position', label: '직급', width: 110,
      sortBy: (r) => r.position || '',
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#475569' }}>
          {r.position || '-'}
          {r.promotion_target && (
            <span title={`승진 대상: ${r.promotion_target}`}
              style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, background: 'rgba(245,158,11,0.18)',
                color: '#d97706', borderRadius: 4, padding: '1px 5px' }}>
              ⭐{r.promotion_target}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'employment_type', label: '고용', width: 70, align: 'center',
      sortBy: (r) => r.employment_type || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: '#64748b' }}>{r.employment_type || '-'}</span>,
    },
    {
      key: 'hire_date', label: '입사일', width: 100, align: 'center',
      sortBy: (r) => r.hire_date || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: '#64748b' }}>{r.hire_date || '-'}</span>,
    },
    {
      key: 'phone', label: '연락처', width: 120,
      sortBy: (r) => r.phone || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: '#94a3b8' }}>{r.phone || '-'}</span>,
    },
    {
      key: 'status', label: '상태', width: 60, align: 'center',
      sortBy: (r) => (r.is_active ? 1 : 0),
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
          background: r.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.04)',
          color: r.is_active ? '#16a34a' : '#94a3b8' }}>
          {r.is_active ? '활성' : '비활성'}
        </span>
      ),
    },
  ]

  // ─── 색상 select (재사용) ──────────────────────────────────────────
  const colorSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)' }}>
      {TONE_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
    </select>
  )
  // 상위부서 select (재사용) — 자기 자신 제외
  const parentSelect = (value: string, onChange: (v: string) => void, excludeId?: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)' }}>
      <option value="">— 최상위 (본부) —</option>
      {flatTree.filter(({ node }) => node.id !== excludeId).map(({ node, depth }) => (
        <option key={node.id} value={node.id}>{' '.repeat(depth * 2)}{node.name}</option>
      ))}
    </select>
  )

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3,
  }
  const fieldInput: React.CSSProperties = {
    width: '100%', fontSize: 12, padding: '6px 9px', borderRadius: 7,
    border: '1px solid rgba(0,0,0,0.12)', boxSizing: 'border-box',
  }

  // ─── 렌더 ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ ...glassCard, padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        라이드 인력 부서 정보 불러오는 중...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 마이그 미적용 배너 */}
      {migrationPending && (
        <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)',
          borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#d97706' }}>
          ⚠ 마이그레이션 미적용 — <code>ride_departments</code> 테이블이 아직 없습니다.
          Cloud SQL Studio 에서 <code>migrations/2026-05-16_ride_departments_init.sql</code> 실행 후 새로고침해주세요.
        </div>
      )}

      {/* 결과 글래스 패널 (Rule 20) */}
      {result && (
        <div style={{
          ...glassCard,
          border: `1px solid ${result.ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
          background: result.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
          padding: '12px 16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: result.ok ? '#16a34a' : '#dc2626', marginBottom: 4 }}>
                {result.title}
              </div>
              {result.lines.map((l, i) => <div key={i} style={{ fontSize: 12, color: '#475569' }}>{l}</div>)}
            </div>
            <button onClick={() => setResult(null)}
              style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>
              × 닫기
            </button>
          </div>
        </div>
      )}

      {/* 헤더 + DcStatStrip */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
          🚗 라이드케어 인력 부서 관리
        </h3>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
          라이드케어(외주) 직원 — 본 ERP 계정 X. 부서/조직 마스터는 여기서 관리, 회의록·근무스케줄과 연동.
        </div>
        <DcStatStrip stats={stats}
          actions={[
            { label: '신규 직원', icon: '+', onClick: () => openEmpModal('new') },
            { label: '엑셀 일괄 등록', icon: '📥', onClick: () => fileInputRef.current?.click() },
          ]} />
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
          style={{ display: 'none' }} />
      </div>

      {/* 본문 — 좌측 트리 + 우측 테이블 */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 좌측 — 부서 트리 (CRUD) */}
        <div style={{ ...glassCard, padding: 14, width: 300, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>부서 트리 ({flatTree.length})</span>
            <button onClick={() => { setShowNewDept(v => !v); setNewDept({ name: '', parent_id: selectedDeptId || '', color_tone: 'slate' }) }}
              style={{ fontSize: 11, fontWeight: 600, color: showNewDept ? '#94a3b8' : '#2563eb',
                background: showNewDept ? 'transparent' : 'rgba(59,130,246,0.10)',
                border: showNewDept ? 'none' : '1px solid rgba(59,130,246,0.25)',
                borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>
              {showNewDept ? '취소' : '+ 부서'}
            </button>
          </div>

          {/* 새 부서 폼 */}
          {showNewDept && (
            <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 8, padding: 10, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input value={newDept.name} onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                placeholder="부서명" autoFocus
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)' }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {parentSelect(newDept.parent_id, (v) => setNewDept({ ...newDept, parent_id: v }))}
                {colorSelect(newDept.color_tone, (v) => setNewDept({ ...newDept, color_tone: v }))}
              </div>
              <button onClick={createDept} disabled={savingDept}
                style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: savingDept ? '#94a3b8' : '#0f2440',
                  border: 'none', borderRadius: 6, padding: '5px 0', cursor: savingDept ? 'not-allowed' : 'pointer' }}>
                {savingDept ? '추가 중...' : '부서 추가'}
              </button>
            </div>
          )}

          {/* 전체 */}
          <button onClick={() => setSelectedDeptId(null)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: '6px 8px', borderRadius: 6, marginBottom: 2, fontSize: 12, fontWeight: 600,
              border: 'none', background: selectedDeptId === null ? 'rgba(15,36,64,0.92)' : 'transparent',
              color: selectedDeptId === null ? '#fff' : '#475569',
            }}>
            전체 직원 ({employees.filter(e => e.is_active).length})
          </button>

          {/* 부서 행 */}
          {flatTree.map(({ node, depth }) => {
            const t = tone(node.color_tone)
            const sel = selectedDeptId === node.id
            const editing = editingDeptId === node.id
            if (editing) {
              return (
                <div key={node.id} style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)',
                  borderRadius: 8, padding: 8, marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input value={editDept.name} onChange={(e) => setEditDept({ ...editDept, name: e.target.value })}
                    style={{ fontSize: 12, padding: '4px 7px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)' }} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    {parentSelect(editDept.parent_id, (v) => setEditDept({ ...editDept, parent_id: v }), node.id)}
                    {colorSelect(editDept.color_tone, (v) => setEditDept({ ...editDept, color_tone: v }))}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={saveEditDept} disabled={savingDept}
                      style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#fff', background: '#0f2440',
                        border: 'none', borderRadius: 6, padding: '4px 0', cursor: 'pointer' }}>저장</button>
                    <button onClick={() => setEditingDeptId(null)}
                      style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
                  </div>
                </div>
              )
            }
            return (
              <div key={node.id} className="ride-dept-row"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, borderRadius: 6, marginBottom: 2,
                  paddingLeft: depth * 14,
                  background: sel ? t.bg : 'transparent',
                  borderLeft: sel ? `3px solid ${t.dot}` : '3px solid transparent',
                }}>
                <button onClick={() => setSelectedDeptId(node.id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left',
                    cursor: 'pointer', padding: '6px 4px', fontSize: 12, border: 'none', background: 'transparent',
                    color: sel ? t.tx : '#475569', fontWeight: sel ? 700 : 500,
                  }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.dot, flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                    {node.name}
                  </span>
                  <span style={{ fontSize: 10, color: sel ? t.tx : '#94a3b8', fontWeight: 600 }}>{node.total_count}</span>
                </button>
                {/* hover 액션 */}
                <span className="ride-dept-actions" style={{ display: 'flex', gap: 2, paddingRight: 4 }}>
                  <button onClick={() => startEditDept(node)} title="이름·상위·색상 변경"
                    style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>✏️</button>
                  <button onClick={() => deleteDept(node)} title="부서 삭제"
                    style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>🗑</button>
                </span>
              </div>
            )
          })}
          <style>{`
            .ride-dept-actions { transition: opacity 0.15s; }
            .ride-dept-row .ride-dept-actions button { opacity: 0.25; }
            .ride-dept-row:hover .ride-dept-actions button { opacity: 0.7; }
          `}</style>
        </div>

        {/* 우측 — 직원 테이블 */}
        <div style={{ flex: 1, minWidth: 480, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 선택 부서 헤더 + 부서장 */}
          {selectedDept && (
            <div style={{ ...glassCard, padding: '10px 14px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: tone(selectedDept.color_tone).dot }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{selectedDept.name}</span>
                {selectedDept.description && (
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{selectedDept.description}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!assigningLeader ? (
                  <>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      부서장: <b style={{ color: '#1e293b' }}>{selectedDept.leader_name || '미지정'}</b>
                    </span>
                    <button onClick={() => setAssigningLeader(true)}
                      style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', background: 'rgba(59,130,246,0.10)',
                        border: '1px solid rgba(59,130,246,0.25)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>
                      변경
                    </button>
                  </>
                ) : (
                  <>
                    <select defaultValue={selectedDept.leader_employee_id || ''}
                      onChange={(e) => assignLeader(e.target.value || null)}
                      style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)' }}>
                      <option value="">— 미지정 —</option>
                      {employees.filter(e => e.is_active).map(e => (
                        <option key={e.id} value={e.id}>{e.name} {e.position ? `(${e.position})` : ''}</option>
                      ))}
                    </select>
                    <button onClick={() => setAssigningLeader(false)}
                      style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>
                      취소
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 툴바 */}
          <div style={{ ...glassCard, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 이름·직급·연락처 검색"
              style={{ fontSize: 12, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.10)',
                background: GLASS.L1.background, minWidth: 160, flex: 1 }} />
            {selectedDept && (
              <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={includeSub} onChange={() => setIncludeSub(v => !v)} />
                하위 포함
              </label>
            )}
            <label style={{ fontSize: 11, color: inactiveCount > 0 ? '#64748b' : '#cbd5e1',
              display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={showInactive} onChange={() => setShowInactive(v => !v)} />
              비활성 포함 ({inactiveCount})
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: checkedIds.size > 0 ? '#2563eb' : '#cbd5e1', fontWeight: 600 }}>
                {checkedIds.size}명 선택
              </span>
              <select value={bulkTargetDept} onChange={(e) => setBulkTargetDept(e.target.value)}
                disabled={checkedIds.size === 0}
                style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.10)',
                  background: checkedIds.size === 0 ? 'rgba(0,0,0,0.03)' : '#fff' }}>
                <option value="">→ 이동할 부서</option>
                {flatTree.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>{' '.repeat(depth * 2)}{node.name}</option>
                ))}
              </select>
              <button onClick={runBulkAssign} disabled={checkedIds.size === 0 || !bulkTargetDept}
                style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: 'none',
                  cursor: (checkedIds.size === 0 || !bulkTargetDept) ? 'not-allowed' : 'pointer',
                  background: (checkedIds.size === 0 || !bulkTargetDept) ? 'rgba(0,0,0,0.06)' : '#0f2440',
                  color: (checkedIds.size === 0 || !bulkTargetDept) ? '#94a3b8' : '#fff' }}>
                일괄 이동
              </button>
            </div>
          </div>

          {filteredEmps.length > 0 && (
            <label style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center',
              gap: 7, cursor: 'pointer', paddingLeft: 4 }}>
              <input type="checkbox" checked={allChecked} onChange={toggleCheckAll}
                style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#0f2440' }} />
              현재 목록 전체 선택 ({filteredEmps.length}명)
            </label>
          )}

          <NeuDataTable<RideEmp>
            columns={columns}
            data={filteredEmps}
            rowKey={(r) => r.id}
            onRowClick={(r) => openEmpModal(r)}
            emptyIcon="🚗"
            emptyMessage={selectedDept ? `${selectedDept.name} 부서에 직원이 없습니다` : '등록된 라이드 인력이 없습니다'}
            defaultSort={{ key: 'name', dir: 'asc' }}
            maxHeight={520}
          />
        </div>
      </div>

      {/* 직원 편집/등록 모달 (PR-HR-4) */}
      {empModal && (
        <div onClick={() => setEmpModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, padding: 22, width: 520, maxWidth: '100%',
              maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                {empModal === 'new' ? '🚗 라이드 인력 등록' : `✏️ ${(empModal as RideEmp).name} 정보 수정`}
              </h3>
              <button onClick={() => setEmpModal(null)}
                style={{ fontSize: 16, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>이름 *</label>
                <input value={empForm.name} autoFocus
                  onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} style={fieldInput} />
              </div>
              <div>
                <label style={labelStyle}>부서</label>
                <select value={empForm.department_id} style={fieldInput}
                  onChange={(e) => setEmpForm({ ...empForm, department_id: e.target.value })}>
                  <option value="">— 미배정 —</option>
                  {flatTree.map(({ node, depth }) => (
                    <option key={node.id} value={node.id}>{' '.repeat(depth * 2)}{node.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>직급</label>
                <input value={empForm.position} placeholder="과장 / 대리 / 사원 등"
                  onChange={(e) => setEmpForm({ ...empForm, position: e.target.value })} style={fieldInput} />
              </div>
              <div>
                <label style={labelStyle}>승진 대상 (선택)</label>
                <input value={empForm.promotion_target} placeholder="예: 주임 / 과장"
                  onChange={(e) => setEmpForm({ ...empForm, promotion_target: e.target.value })} style={fieldInput} />
              </div>
              <div>
                <label style={labelStyle}>고용형태</label>
                <select value={empForm.employment_type} style={fieldInput}
                  onChange={(e) => setEmpForm({ ...empForm, employment_type: e.target.value })}>
                  <option value="">— 선택 —</option>
                  {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>입사일</label>
                <input type="date" value={empForm.hire_date}
                  onChange={(e) => setEmpForm({ ...empForm, hire_date: e.target.value })} style={fieldInput} />
              </div>
              <div>
                <label style={labelStyle}>퇴사일</label>
                <input type="date" value={empForm.resign_date}
                  onChange={(e) => setEmpForm({ ...empForm, resign_date: e.target.value })} style={fieldInput} />
              </div>
              <div>
                <label style={labelStyle}>연락처</label>
                <input value={empForm.phone}
                  onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} style={fieldInput} />
              </div>
              <div>
                <label style={labelStyle}>이메일</label>
                <input value={empForm.email}
                  onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} style={fieldInput} />
              </div>
              <div>
                <label style={labelStyle}>색상 태그</label>
                <select value={empForm.color_tone} style={fieldInput}
                  onChange={(e) => setEmpForm({ ...empForm, color_tone: e.target.value })}>
                  {EMP_TONE_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              {empModal !== 'new' && (
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                  <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={empForm.is_active}
                      onChange={(e) => setEmpForm({ ...empForm, is_active: e.target.checked })} />
                    재직 중 (활성)
                  </label>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
              {empModal !== 'new' && (
                <button onClick={deleteEmp}
                  style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
                  퇴사 처리
                </button>
              )}
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button onClick={() => setEmpModal(null)}
                  style={{ fontSize: 12, fontWeight: 600, color: '#64748b', background: '#fff',
                    border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, padding: '7px 16px', cursor: 'pointer' }}>
                  취소
                </button>
                <button onClick={saveEmp} disabled={savingEmp}
                  style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: savingEmp ? '#94a3b8' : '#0f2440',
                    border: 'none', borderRadius: 8, padding: '7px 18px', cursor: savingEmp ? 'not-allowed' : 'pointer' }}>
                  {savingEmp ? '저장 중...' : (empModal === 'new' ? '등록' : '저장')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 일괄 등록 미리보기 모달 (PR-HR-5) */}
      {uploadPlan && (
        <div onClick={cancelUpload}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, padding: 22, width: 540, maxWidth: '100%',
              maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>📥 엑셀 일괄 등록 미리보기</h3>
              <button onClick={cancelUpload}
                style={{ fontSize: 16, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>{uploadFileName}</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
              {([['신규', uploadPlan.summary.ok, '#16a34a'],
                 ['중복', uploadPlan.summary.duplicate, '#94a3b8'],
                 ['빈 행', uploadPlan.summary.empty, '#cbd5e1'],
                 ['오류', uploadPlan.summary.error, '#dc2626']] as const).map(([label, val, color]) => (
                <div key={label} style={{ ...glassCard, padding: '8px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, maxHeight: 300, overflowY: 'auto' }}>
              {uploadPlan.plan.filter(p => p.status !== 'skip-empty').map(p => (
                <div key={p.index} style={{ padding: '6px 10px', borderBottom: '1px solid rgba(0,0,0,0.04)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#334155', whiteSpace: 'nowrap' }}>
                    {p.raw?.name || `(행 ${p.index})`}
                    {p.raw?.phone && <span style={{ color: '#94a3b8', marginLeft: 6 }}>{p.raw.phone}</span>}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                    color: p.status === 'ok' ? '#16a34a' : p.status === 'skip-duplicate' ? '#94a3b8' : '#dc2626' }}>
                    {p.status === 'ok' ? '✨ 신규' : p.status === 'skip-duplicate' ? '중복 skip' : (p.errors.join(', ') || '오류')}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={cancelUpload}
                style={{ fontSize: 12, fontWeight: 600, color: '#64748b', background: '#fff',
                  border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, padding: '7px 16px', cursor: 'pointer' }}>
                취소
              </button>
              <button onClick={applyUpload} disabled={uploading || uploadPlan.summary.ok === 0}
                style={{ fontSize: 12, fontWeight: 600, color: '#fff',
                  background: (uploading || uploadPlan.summary.ok === 0) ? '#94a3b8' : '#0f2440',
                  border: 'none', borderRadius: 8, padding: '7px 18px',
                  cursor: (uploading || uploadPlan.summary.ok === 0) ? 'not-allowed' : 'pointer' }}>
                {uploading ? '등록 중...' : `${uploadPlan.summary.ok}명 등록`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

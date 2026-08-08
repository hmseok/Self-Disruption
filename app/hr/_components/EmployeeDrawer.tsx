'use client'

// ═══════════════════════════════════════════════════════════════
// 인사 마스터 — 직원 상세 드로어 (2026-08-08 재작성)
// 3탭: 기본정보(+임시 비밀번호 발급·퇴사 처리) / 급여 설정 / 페이지 권한
// 데이터: PATCH /api/profiles/[id] · /api/employee_salaries ·
//         /api/user_page_permissions · /api/employees/reset-password · /withdraw
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { getAuthHeader } from '@/app/utils/auth-client'
import { COLORS } from '@/app/utils/ui-tokens'
import { GROUPS as REGISTRY_GROUPS, MENUS as REGISTRY_MENUS } from '@/lib/menu-registry'
import {
  Employee, Department, Position, Badge, ROLE_META,
  ALLOWANCE_OPTIONS, ALLOWANCE_LABELS, LEGACY_ALLOWANCE_MAP, DATA_SCOPES,
  empName, d10, inputS, lblS, btnPrimaryS, btnGhostS, cardS,
} from './hr-shared'

type DrawerTab = 'base' | 'pay' | 'perm'

type PermEntry = {
  can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean
  data_scope: string
}

type Props = {
  emp: Employee
  meId: string | null
  companyId: string | null
  departments: Department[]
  positions: Position[]
  onClose: () => void
  onSaved: () => void
  showToast: (text: string, tone?: 'success' | 'error') => void
}

// 권한 부여 대상 페이지의 폴백 목록 — /api/menus 실패 시에만 사용 (registry 직접)
function registryFallbackModules() {
  const sortedGroups = [...REGISTRY_GROUPS].sort((a, b) => a.sortOrder - b.sortOrder)
  const out: { path: string; name: string; group: string }[] = []
  for (const g of sortedGroups) {
    for (const m of REGISTRY_MENUS.filter(m => !m.hidden && m.group === g.id).sort((a, b) => a.sortOrder - b.sortOrder)) {
      out.push({ path: m.path, name: m.displayName || m.name, group: g.label })
    }
  }
  return out
}

export default function EmployeeDrawer({ emp, meId, companyId, departments, positions, onClose, onSaved, showToast }: Props) {
  const isSelf = meId === emp.id
  const showPayTab = emp.role !== 'admin'
  const showPermTab = emp.role === 'user'

  const [tab, setTab] = useState<DrawerTab>('base')
  const [open, setOpen] = useState(false)
  useEffect(() => { requestAnimationFrame(() => setOpen(true)) }, [])
  const close = () => { setOpen(false); window.setTimeout(onClose, 220) }

  // ── 기본정보 ──
  const [form, setForm] = useState({
    employee_name: emp.employee_name || emp.name || '',
    phone: emp.phone || '',
    role: emp.role || 'user',
    is_active: !!emp.is_active,
    position_id: emp.position_id || '',
    department_id: emp.department_id || '',
    hire_date: d10(emp.hire_date),
    emp_status: emp.emp_status || 'active',
    resign_date: d10(emp.resign_date),
    resign_reason: emp.resign_reason || '',
  })
  const set = (k: keyof typeof form, v: any) => setForm(prev => ({ ...prev, [k]: v }))
  const [savingBase, setSavingBase] = useState(false)

  const saveBase = async () => {
    setSavingBase(true)
    try {
      const isResigned = form.emp_status === 'resigned'
      const payload = {
        employee_name: form.employee_name || null,
        phone: form.phone || null,
        role: form.role,
        position_id: form.position_id || null,
        department_id: form.department_id || null,
        hire_date: form.hire_date || null,
        emp_status: form.emp_status,
        resign_date: form.resign_date || null,
        resign_reason: form.resign_reason || null,
        is_active: isResigned ? false : form.is_active,
      }
      const res = await fetch(`/api/profiles/${emp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) { showToast('저장 실패: ' + (json.error || res.statusText), 'error'); return }
      showToast('기본정보가 저장되었습니다')
      onSaved()
      close()
    } catch (e: any) {
      showToast('저장 실패: ' + e.message, 'error')
    } finally { setSavingBase(false) }
  }

  // ── 임시 비밀번호 ──
  const [resettingPw, setResettingPw] = useState(false)
  const [tempPw, setTempPw] = useState<string | null>(null)
  const [pwCopied, setPwCopied] = useState(false)

  const resetPassword = async () => {
    const name = empName(emp)
    if (!confirm(`${name}의 비밀번호를 초기화할까요?\n\n임시 비밀번호가 발급되며 기존 비밀번호는 즉시 사용할 수 없게 됩니다.`)) return
    setResettingPw(true)
    setTempPw(null)
    try {
      const res = await fetch('/api/employees/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ employee_id: emp.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(json.error || '비밀번호 초기화에 실패했습니다', 'error'); return }
      setTempPw(json.temp_password)
      setPwCopied(false)
    } catch {
      showToast('네트워크 오류가 발생했습니다', 'error')
    } finally { setResettingPw(false) }
  }

  const copyTempPw = async () => {
    if (!tempPw) return
    try { await navigator.clipboard.writeText(tempPw); setPwCopied(true) } catch {}
  }

  // ── 퇴사 처리 ──
  const [withdrawing, setWithdrawing] = useState(false)
  const withdraw = async () => {
    const name = empName(emp)
    if (!confirm(`${name} 직원을 퇴사 처리하시겠습니까?\n\n계정이 차단되고 부서·직급 배정이 해제됩니다.\n거래·계약 등 기존 기록은 보존되며 「퇴사」 필터에서 조회할 수 있습니다.`)) return
    setWithdrawing(true)
    try {
      const res = await fetch('/api/employees/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ employee_id: emp.id, delete_auth: false }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { showToast('퇴사 처리 실패: ' + (json.error || res.statusText), 'error'); return }
      showToast('퇴사 처리가 완료되었습니다')
      onSaved()
      close()
    } catch {
      showToast('퇴사 처리 중 오류가 발생했습니다', 'error')
    } finally { setWithdrawing(false) }
  }

  // ── 급여 설정 ──
  const [salary, setSalary] = useState({
    base_salary: '', meal_allowance: '', extra_allowances: {} as Record<string, string>,
    bank_name: '', account_number: '', account_holder: '', payment_day: '25', is_active: true,
  })
  const [salaryLoaded, setSalaryLoaded] = useState(false)
  const [savingSalary, setSavingSalary] = useState(false)
  const [showAddAllowance, setShowAddAllowance] = useState(false)

  useEffect(() => {
    if (!showPayTab || tab !== 'pay' || salaryLoaded) return
    ;(async () => {
      try {
        const res = await fetch(`/api/employee_salaries?employee_id=${encodeURIComponent(emp.id)}`, { headers: await getAuthHeader() })
        const json = await res.json().catch(() => ({}))
        const row = (json.data || [])[0]
        if (row) {
          let meal = ''
          const extras: Record<string, string> = {}
          try {
            const allowances = typeof row.allowances === 'string' ? JSON.parse(row.allowances) : (row.allowances || {})
            if (allowances && typeof allowances === 'object') {
              meal = String(allowances.meal_allowance ?? allowances['식대'] ?? allowances.meal ?? '')
              for (const [k, v] of Object.entries(allowances)) {
                if (k === 'meal_allowance' || k === '식대' || k === 'meal') continue
                const amt = Number(v || 0)
                if (amt > 0) extras[LEGACY_ALLOWANCE_MAP[k] || k] = String(amt)
              }
            }
          } catch {}
          setSalary({
            base_salary: row.base_salary != null ? String(row.base_salary) : '',
            meal_allowance: meal,
            extra_allowances: extras,
            bank_name: row.bank_name || '',
            account_number: row.account_number || '',
            account_holder: row.account_holder || empName(emp),
            payment_day: row.payment_day != null ? String(row.payment_day) : '25',
            is_active: !!row.is_active,
          })
        } else {
          setSalary(prev => ({ ...prev, account_holder: empName(emp) }))
        }
      } catch {}
      setSalaryLoaded(true)
    })()
  }, [tab, showPayTab, salaryLoaded, emp])

  const saveSalary = async () => {
    setSavingSalary(true)
    try {
      const allowances: Record<string, number> = {}
      const meal = Number(salary.meal_allowance || 0)
      if (meal > 0) allowances.meal_allowance = meal
      for (const [k, v] of Object.entries(salary.extra_allowances)) {
        const amt = Number(v || 0)
        if (amt > 0) allowances[k] = amt
      }
      const res = await fetch('/api/employee_salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({
          employee_id: emp.id,
          company_id: companyId,
          base_salary: Number(salary.base_salary || 0),
          allowances,
          payment_day: Number(salary.payment_day || 25),
          bank_name: salary.bank_name || null,
          account_number: salary.account_number || null,
          account_holder: salary.account_holder || null,
          is_active: salary.is_active,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) { showToast('급여 설정 저장 실패: ' + (json.error || res.statusText), 'error'); return }
      showToast('급여 설정이 저장되었습니다')
    } catch (e: any) {
      showToast('급여 설정 저장 실패: ' + e.message, 'error')
    } finally { setSavingSalary(false) }
  }

  // ── 페이지 권한 ──
  const [perms, setPerms] = useState<Record<string, PermEntry>>({})
  const [permsLoaded, setPermsLoaded] = useState(false)
  const [savingPerms, setSavingPerms] = useState(false)
  const [modules, setModules] = useState<{ path: string; name: string; group: string }[]>([])

  useEffect(() => {
    if (!showPermTab || tab !== 'perm' || permsLoaded) return
    ;(async () => {
      const headers = await getAuthHeader()
      // 권한 대상 페이지 목록 — /api/menus?for=permission (menu-registry 단일 소스,
      // 역할 템플릿·초대 모달과 동일). 구 system_modules 테이블은 낡은 스냅숏이라 사용 금지.
      try {
        const res = await fetch('/api/menus?for=permission', { headers })
        const json = await res.json().catch(() => ({}))
        const groups: any[] = json.data?.groups || []
        const menus: any[] = json.data?.menus || []
        if (menus.length === 0) throw new Error('empty')
        const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder)
        const out: { path: string; name: string; group: string }[] = []
        for (const g of sortedGroups) {
          for (const m of menus.filter(m => m.group === g.id).sort((a, b) => a.sortOrder - b.sortOrder)) {
            out.push({ path: m.path, name: m.displayName || m.name, group: g.label || '기타' })
          }
        }
        for (const m of menus.filter(m => !sortedGroups.some(g => g.id === m.group))) {
          out.push({ path: m.path, name: m.displayName || m.name, group: '기타' })
        }
        setModules(out)
      } catch {
        setModules(registryFallbackModules())
      }
      // 이 직원의 현재 권한
      try {
        const res = await fetch('/api/user_page_permissions', { headers })
        const json = await res.json().catch(() => ({}))
        const mine: Record<string, PermEntry> = {}
        for (const p of (json.data || [])) {
          if (p.user_id !== emp.id) continue
          mine[p.page_path] = {
            can_view: !!p.can_view, can_create: !!p.can_create,
            can_edit: !!p.can_edit, can_delete: !!p.can_delete,
            data_scope: p.data_scope || 'all',
          }
        }
        setPerms(mine)
      } catch {}
      setPermsLoaded(true)
    })()
  }, [tab, showPermTab, permsLoaded, emp.id])

  const groupedModules = useMemo(() => {
    const groups: Record<string, { path: string; name: string }[]> = {}
    for (const m of modules) {
      if (!groups[m.group]) groups[m.group] = []
      groups[m.group].push(m)
    }
    return groups
  }, [modules])

  const togglePage = (path: string) => {
    setPerms(prev => {
      const next = { ...prev }
      if (next[path]?.can_view) delete next[path]
      else next[path] = { can_view: true, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
      return next
    })
  }
  const togglePerm = (path: string, field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete') => {
    setPerms(prev => {
      const cur = prev[path] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
      return { ...prev, [path]: { ...cur, [field]: !cur[field] } }
    })
  }
  const changeScope = (path: string, scope: string) => {
    setPerms(prev => {
      const cur = prev[path] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
      return { ...prev, [path]: { ...cur, data_scope: scope } }
    })
  }

  const savePerms = async () => {
    setSavingPerms(true)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
      await fetch(`/api/user_page_permissions?user_id=${emp.id}`, { method: 'DELETE', headers })
      const toInsert = Object.entries(perms)
        .filter(([, p]) => p.can_view || p.can_create || p.can_edit || p.can_delete)
        .map(([page_path, p]) => ({ user_id: emp.id, page_path, ...p }))
      if (toInsert.length > 0) {
        const res = await fetch('/api/user_page_permissions', { method: 'POST', headers, body: JSON.stringify(toInsert) })
        const json = await res.json().catch(() => ({}))
        if (json.error) throw new Error(json.error)
      }
      showToast('페이지 권한이 저장되었습니다')
    } catch (e: any) {
      showToast('권한 저장 실패: ' + e.message, 'error')
    } finally { setSavingPerms(false) }
  }

  // ── 렌더 ──
  const roleMeta = ROLE_META[emp.role] || ROLE_META.user
  const dTabs: { key: DrawerTab; label: string }[] = [
    { key: 'base', label: '기본정보' },
    ...(showPayTab ? [{ key: 'pay' as DrawerTab, label: '급여 설정' }] : []),
    ...(showPermTab ? [{ key: 'perm' as DrawerTab, label: '페이지 권한' }] : []),
  ]

  const field = (label: string, node: React.ReactNode, full = false) => (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <label style={lblS}>{label}</label>
      {node}
    </div>
  )

  const ckS: React.CSSProperties = { width: 15, height: 15, cursor: 'pointer', accentColor: COLORS.primary }

  return (
    <>
      <div onClick={close}
        style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.24)', zIndex: 200, opacity: open ? 1 : 0, transition: 'opacity .22s ease' }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, maxWidth: '96vw', background: '#fff', zIndex: 201,
        boxShadow: '-8px 0 32px rgba(16,24,40,0.12)', display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .22s ease',
      }}>
        {/* 헤더 */}
        <div style={{ padding: '18px 22px 0', borderBottom: `1.5px solid ${COLORS.borderSubtle}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                {empName(emp)}
                <Badge label={roleMeta.label} bg={roleMeta.bg} fg={roleMeta.fg} />
              </div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                {emp.email}{emp.hire_date ? ` · ${d10(emp.hire_date)} 입사` : ''}
              </div>
            </div>
            <button onClick={close}
              style={{ border: 'none', background: COLORS.borderFaint, borderRadius: 8, width: 30, height: 30, fontSize: 15, color: COLORS.textSecondary, cursor: 'pointer' }}>
              ×
            </button>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {dTabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  padding: '9px 14px', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: '2.5px solid', marginBottom: -1.5,
                  borderBottomColor: tab === t.key ? COLORS.primary : 'transparent',
                  color: tab === t.key ? COLORS.textPrimary : COLORS.textMuted,
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {tab === 'base' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {field('이름', <input style={inputS} value={form.employee_name} onChange={e => set('employee_name', e.target.value)} />)}
                {field('연락처', <input style={inputS} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="010-0000-0000" />)}
                {field('권한',
                  <select style={inputS} value={form.role} onChange={e => set('role', e.target.value)} disabled={emp.role === 'admin'}>
                    <option value="user">직원</option>
                    <option value="master">관리자</option>
                    {emp.role === 'admin' && <option value="admin">최고 관리자</option>}
                  </select>)}
                {field('계정',
                  <select style={inputS} value={form.is_active ? '1' : '0'} onChange={e => set('is_active', e.target.value === '1')}>
                    <option value="1">로그인 가능</option>
                    <option value="0">로그인 차단</option>
                  </select>)}
                {field('직급',
                  <select style={inputS} value={form.position_id} onChange={e => set('position_id', e.target.value)}>
                    <option value="">미지정</option>
                    {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>)}
                {field('부서',
                  <select style={inputS} value={form.department_id} onChange={e => set('department_id', e.target.value)}>
                    <option value="">미지정</option>
                    {departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                  </select>)}
                {field('입사일', <input type="date" style={inputS} value={form.hire_date} onChange={e => set('hire_date', e.target.value)} />)}
                {field('재직 상태',
                  <select style={inputS} value={form.emp_status}
                    onChange={e => {
                      const v = e.target.value
                      setForm(prev => ({
                        ...prev, emp_status: v,
                        resign_date: v === 'resigned' ? (prev.resign_date || new Date().toISOString().slice(0, 10)) : '',
                        resign_reason: v === 'resigned' ? prev.resign_reason : '',
                      }))
                    }}>
                    <option value="active">재직</option>
                    <option value="on_leave">휴직</option>
                    <option value="resigned">퇴사</option>
                  </select>)}
                {form.emp_status === 'resigned' && field('퇴사일', <input type="date" style={inputS} value={form.resign_date} onChange={e => set('resign_date', e.target.value)} />)}
                {form.emp_status === 'resigned' && field('퇴사 사유', <input style={inputS} value={form.resign_reason} onChange={e => set('resign_reason', e.target.value)} />)}
                {field('이메일 · 가입일 (읽기 전용)',
                  <div style={{ ...inputS, background: '#fafbfc', color: COLORS.textMuted }}>
                    {emp.email}{emp.created_at ? ` · ${d10(emp.created_at)} 가입` : ''}
                  </div>, true)}
              </div>

              {!isSelf && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, margin: '20px 0 8px', letterSpacing: '0.02em' }}>비밀번호</div>
                  <button onClick={resetPassword} disabled={resettingPw} style={btnGhostS}>
                    {resettingPw ? '발급 중…' : '임시 비밀번호 발급'}
                  </button>
                  {tempPw && (
                    <div style={{ background: '#fafbfc', border: `1px dashed ${COLORS.borderBlue}`, borderRadius: 10, padding: '12px 14px', marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>
                        임시 비밀번호가 발급되었습니다 — 이 화면을 닫으면 다시 볼 수 없습니다
                      </div>
                      <code style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', color: COLORS.primaryDark, background: COLORS.bgBlue, padding: '3px 10px', borderRadius: 6 }}>
                        {tempPw}
                      </code>
                      <button onClick={copyTempPw} style={{ ...btnGhostS, padding: '5px 10px', fontSize: 12, marginLeft: 8 }}>
                        {pwCopied ? '복사됨' : '복사'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {!isSelf && emp.role !== 'admin' && (
                <div style={{ border: `1px solid ${COLORS.borderRed}`, background: COLORS.bgRed, borderRadius: 10, padding: '12px 14px', marginTop: 20 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.danger, marginBottom: 6 }}>퇴사 처리</div>
                  <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>
                    계정을 차단하고 부서·직급 배정을 해제합니다. 기록은 보존됩니다.
                  </p>
                  <button onClick={withdraw} disabled={withdrawing}
                    style={{ background: '#fff', color: COLORS.danger, border: `1px solid ${COLORS.borderRed}`, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    {withdrawing ? '처리 중…' : '퇴사 처리'}
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'pay' && (
            <>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, background: COLORS.bgBlue, border: `1px solid ${COLORS.borderBlue}`, borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                4대보험·소득세 정밀 계산은 세무사 영역입니다 — 여기서는 지급 기준만 관리합니다
              </div>
              {!salaryLoaded ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: COLORS.textMuted, fontSize: 13 }}>불러오는 중…</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {field('기본급 (월)',
                    <input type="number" style={inputS} value={salary.base_salary}
                      onChange={e => setSalary(p => ({ ...p, base_salary: e.target.value }))} placeholder="0" />)}
                  {field('식대 수당 (월 · 비과세 한도 20만원)',
                    <input type="number" style={inputS} value={salary.meal_allowance}
                      onChange={e => setSalary(p => ({ ...p, meal_allowance: e.target.value }))} placeholder="200000" />)}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={lblS}>추가 수당</label>
                    {Object.entries(salary.extra_allowances).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, flex: '0 0 110px' }}>{ALLOWANCE_LABELS[k] || k}</span>
                        <input type="number" style={{ ...inputS, flex: 1 }} value={v}
                          onChange={e => setSalary(p => ({ ...p, extra_allowances: { ...p.extra_allowances, [k]: e.target.value } }))} />
                        <button onClick={() => setSalary(p => {
                          const next = { ...p.extra_allowances }; delete next[k]
                          return { ...p, extra_allowances: next }
                        })}
                          style={{ border: 'none', background: COLORS.borderFaint, borderRadius: 7, width: 26, height: 26, color: COLORS.textSecondary, cursor: 'pointer' }}>
                          ×
                        </button>
                      </div>
                    ))}
                    {showAddAllowance ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {ALLOWANCE_OPTIONS
                          .filter(o => o.key !== 'meal_allowance' && !(o.key in salary.extra_allowances))
                          .map(o => (
                            <button key={o.key} title={o.hint}
                              onClick={() => {
                                setSalary(p => ({ ...p, extra_allowances: { ...p.extra_allowances, [o.key]: o.defaultAmount ? String(o.defaultAmount) : '' } }))
                                setShowAddAllowance(false)
                              }}
                              style={{ padding: '5px 11px', borderRadius: 14, fontSize: 12, fontWeight: 600, border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', color: COLORS.textSecondary, cursor: 'pointer' }}>
                              + {o.label}
                            </button>
                          ))}
                      </div>
                    ) : (
                      <button onClick={() => setShowAddAllowance(true)} style={{ ...btnGhostS, padding: '6px 10px', fontSize: 12 }}>
                        + 수당 추가
                      </button>
                    )}
                  </div>
                  {field('지급일',
                    <select style={inputS} value={salary.payment_day} onChange={e => setSalary(p => ({ ...p, payment_day: e.target.value }))}>
                      {[5, 10, 15, 20, 25, 28, 30].map(day => <option key={day} value={String(day)}>{day}일</option>)}
                    </select>)}
                  {field('은행', <input style={inputS} value={salary.bank_name} onChange={e => setSalary(p => ({ ...p, bank_name: e.target.value }))} />)}
                  {field('예금주', <input style={inputS} value={salary.account_holder} onChange={e => setSalary(p => ({ ...p, account_holder: e.target.value }))} />)}
                  {field('계좌번호', <input style={inputS} value={salary.account_number} onChange={e => setSalary(p => ({ ...p, account_number: e.target.value }))} />)}
                </div>
              )}
            </>
          )}

          {tab === 'perm' && (
            <>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, background: COLORS.bgBlue, border: `1px solid ${COLORS.borderBlue}`, borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                권한을 켠 페이지만 사이드바에 나타납니다 · 역할 템플릿 탭에서 일괄 적용할 수도 있습니다
              </div>
              {!permsLoaded ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: COLORS.textMuted, fontSize: 13 }}>불러오는 중…</div>
              ) : (
                <div style={{ ...cardS, boxShadow: 'none' }}>
                  {Object.entries(groupedModules).map(([group, pages]) => (
                    <div key={group}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted, background: '#fafbfc', padding: '8px 12px', borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                        {group}
                      </div>
                      {pages.map(pg => {
                        const p = perms[pg.path]
                        const on = !!p?.can_view || !!p?.can_create || !!p?.can_edit || !!p?.can_delete
                        return (
                          <div key={pg.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${COLORS.borderFaint}`, fontSize: 12.5 }}>
                            <span style={{ flex: 1, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pg.name}</span>
                            <button onClick={() => togglePage(pg.path)} aria-label={on ? '권한 끄기' : '권한 켜기'}
                              style={{ width: 34, height: 19, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative', background: on ? COLORS.primary : COLORS.borderSubtle, flex: 'none' }}>
                              <span style={{ position: 'absolute', top: 2, left: on ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left .15s ease' }} />
                            </button>
                            {on ? (
                              <>
                                {([['can_view', '조회'], ['can_create', '생성'], ['can_edit', '수정'], ['can_delete', '삭제']] as const).map(([f, lb]) => (
                                  <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: COLORS.textSecondary, cursor: 'pointer' }}>
                                    <input type="checkbox" style={ckS} checked={!!p?.[f]} onChange={() => togglePerm(pg.path, f)} />
                                    {lb}
                                  </label>
                                ))}
                                <select value={p?.data_scope || 'all'} onChange={e => changeScope(pg.path, e.target.value)}
                                  style={{ fontSize: 11.5, padding: '4px 6px', borderRadius: 7, border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', color: COLORS.textSecondary }}>
                                  {DATA_SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                              </>
                            ) : (
                              <span style={{ fontSize: 11.5, color: COLORS.textDim }}>꺼짐</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        <div style={{ borderTop: `1px solid ${COLORS.borderSubtle}`, padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: '#fafbfc' }}>
          <span style={{ fontSize: 12, color: COLORS.textMuted }}>변경 사항은 탭별로 저장됩니다</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={close} style={btnGhostS}>닫기</button>
            {tab === 'base' && (
              <button onClick={saveBase} disabled={savingBase} style={btnPrimaryS}>
                {savingBase ? '저장 중…' : '기본정보 저장'}
              </button>
            )}
            {tab === 'pay' && (
              <button onClick={saveSalary} disabled={savingSalary || !salaryLoaded} style={btnPrimaryS}>
                {savingSalary ? '저장 중…' : '급여 설정 저장'}
              </button>
            )}
            {tab === 'perm' && (
              <button onClick={savePerms} disabled={savingPerms || !permsLoaded} style={btnPrimaryS}>
                {savingPerms ? '저장 중…' : '권한 저장'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

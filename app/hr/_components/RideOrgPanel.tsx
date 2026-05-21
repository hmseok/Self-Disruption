'use client'

// ═══════════════════════════════════════════════════════════════════
// RideOrgPanel — 라이드케어 (외주) 인력 부서 관리 패널
// PR-HR-2 (2026-05-16, hr 세션)
//
// /hr 통합 페이지 「외부 인력」 탭 안에서 라이드 인력 영역을 렌더.
// 「조회 only」 → 본격 부서 마스터 관리:
//   · DcStatStrip 5칸 (활성/부서수/이번달입사/퇴사예정/승진대상)
//   · 좌측 부서 트리 (Glass 5색) + 우측 NeuDataTable
//   · 부서장 지정 / 일괄 부서 변경 / focus=<id> highlight
//
// 데이터: /api/ride-departments/tree + /api/ride-employees
// 회의록(meetings) 연동 전제 — ride_departments.leader_employee_id 공유.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import DcStatStrip, { StatItem } from '../../components/DcStatStrip'
import NeuDataTable, { TableColumn } from '../../components/NeuDataTable'
import { auth } from '@/lib/auth-client'

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

async function authHeader(): Promise<Record<string, string>> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  border: '1px solid rgba(0,0,0,0.06)',
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

// 선택 부서 + 모든 자손 id 수집
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
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<{ ok: boolean; title: string; lines: string[] } | null>(null)

  // 부서장 지정 인라인 상태
  const [assigningLeader, setAssigningLeader] = useState(false)
  // 일괄 변경 대상 부서
  const [bulkTargetDept, setBulkTargetDept] = useState<string>('')

  // ─── 데이터 로드 ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const h = await authHeader()
      const [treeRes, empRes] = await Promise.all([
        fetch('/api/ride-departments/tree', { headers: h }),
        fetch('/api/ride-employees?include_inactive=1', { headers: h }),
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

  // ─── focus=<id> — 해당 직원의 부서 자동 선택 ──────────────────────
  useEffect(() => {
    if (!focusId || employees.length === 0) return
    const emp = employees.find(e => e.id === focusId)
    if (emp?.department_id) setSelectedDeptId(emp.department_id)
  }, [focusId, employees])

  // ─── 평탄 트리 + 부서 맵 ──────────────────────────────────────────
  const flatTree = useMemo(() => flatten(tree), [tree])
  const deptById = useMemo(() => {
    const m = new Map<string, RideDept>()
    flatTree.forEach(({ node }) => m.set(node.id, node))
    return m
  }, [flatTree])

  // 선택 부서 — 표시 대상 department_id 집합
  const visibleDeptIds = useMemo(() => {
    if (!selectedDeptId) return null // null = 전체
    const node = findNode(tree, selectedDeptId)
    if (!node) return new Set<string>([selectedDeptId])
    return new Set<string>(includeSub ? descendantIds(node) : [selectedDeptId])
  }, [selectedDeptId, includeSub, tree])

  // ─── 직원 필터 ────────────────────────────────────────────────────
  const filteredEmps = useMemo(() => {
    let list = employees
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
  }, [employees, visibleDeptIds, search])

  // ─── DcStatStrip 5칸 ──────────────────────────────────────────────
  const stats: StatItem[] = useMemo(() => {
    const active = employees.filter(e => e.is_active)
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const newThisMonth = active.filter(e => (e.hire_date || '').startsWith(thisMonth)).length
    // 퇴사 예정 — resign_date 가 미래
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
      if (allChecked) {
        const next = new Set(prev)
        filteredEmps.forEach(e => next.delete(e.id))
        return next
      }
      const next = new Set(prev)
      filteredEmps.forEach(e => next.add(e.id))
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
      if (json.error) {
        setResult({ ok: false, title: '일괄 변경 실패', lines: [json.error] })
        return
      }
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
      if (json.error) {
        setResult({ ok: false, title: '부서장 지정 실패', lines: [json.error] })
        return
      }
      const empName = employeeId ? (employees.find(e => e.id === employeeId)?.name || '(직원)') : '(미지정)'
      setResult({ ok: true, title: `✅ 부서장 지정 — ${selectedDept.name}`, lines: [`부서장: ${empName}`] })
      setAssigningLeader(false)
      await load()
    } catch (e: any) {
      setResult({ ok: false, title: '부서장 지정 오류', lines: [e?.message || '네트워크 오류'] })
    }
  }

  // ─── NeuDataTable 컬럼 (Rule 18 — 모든 컬럼 sortBy) ────────────────
  const columns: TableColumn<RideEmp>[] = [
    {
      key: 'check', label: '', width: 40, align: 'center',
      render: (r) => (
        <input type="checkbox" checked={checkedIds.has(r.id)}
          onChange={() => toggleCheck(r.id)} onClick={(e) => e.stopPropagation()}
          style={{ cursor: 'pointer' }} />
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
              {result.lines.map((l, i) => (
                <div key={i} style={{ fontSize: 12, color: '#475569' }}>{l}</div>
              ))}
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
        <DcStatStrip stats={stats} />
      </div>

      {/* 본문 — 좌측 트리 + 우측 테이블 */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 좌측 — 부서 트리 */}
        <div style={{ ...glassCard, padding: 14, width: 280, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
            부서 트리 ({flatTree.length})
          </div>
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
          {flatTree.map(({ node, depth }) => {
            const t = tone(node.color_tone)
            const sel = selectedDeptId === node.id
            return (
              <button key={node.id} onClick={() => setSelectedDeptId(node.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                  cursor: 'pointer', padding: '6px 8px', paddingLeft: 8 + depth * 14, borderRadius: 6,
                  marginBottom: 2, fontSize: 12, border: 'none',
                  background: sel ? t.bg : 'transparent',
                  borderLeft: sel ? `3px solid ${t.dot}` : '3px solid transparent',
                  color: sel ? t.tx : '#475569', fontWeight: sel ? 700 : 500,
                }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.dot, flexShrink: 0 }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                  {node.name}
                </span>
                <span style={{ fontSize: 10, color: sel ? t.tx : '#94a3b8', fontWeight: 600 }}>
                  {node.total_count}
                </span>
              </button>
            )
          })}
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

          {/* 툴바 — 검색 + 하위포함 + 일괄변경 */}
          <div style={{ ...glassCard, padding: '8px 12px', display: 'flex', alignItems: 'center',
            gap: 10, flexWrap: 'wrap' }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 이름·직급·연락처 검색"
              style={{ fontSize: 12, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.10)',
                background: 'rgba(255,255,255,0.6)', minWidth: 180, flex: 1 }} />
            {selectedDept && (
              <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={includeSub} onChange={() => setIncludeSub(v => !v)} />
                하위 부서 포함
              </label>
            )}
            {/* 일괄 부서 변경 */}
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

          {/* 전체 선택 */}
          {filteredEmps.length > 0 && (
            <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center',
              gap: 5, cursor: 'pointer', paddingLeft: 4 }}>
              <input type="checkbox" checked={allChecked} onChange={toggleCheckAll} />
              현재 목록 전체 선택 ({filteredEmps.length}명)
            </label>
          )}

          {/* 직원 테이블 */}
          <NeuDataTable<RideEmp>
            columns={columns}
            data={filteredEmps}
            rowKey={(r) => r.id}
            emptyIcon="🚗"
            emptyMessage={selectedDept ? `${selectedDept.name} 부서에 직원이 없습니다` : '등록된 라이드 인력이 없습니다'}
            defaultSort={{ key: 'name', dir: 'asc' }}
            maxHeight={520}
          />
        </div>
      </div>
    </div>
  )
}

'use client'

// ═══════════════════════════════════════════════════════════════
// 인사 마스터 — 부서·직급 탭 (2026-08-08 재작성)
// 데이터: /api/departments · /api/positions (CRUD)
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import { getAuthHeader } from '@/app/utils/auth-client'
import { COLORS } from '@/app/utils/ui-tokens'
import { Employee, Department, Position, cardS, inputS, btnPrimaryS, deptColor } from './hr-shared'

type Props = {
  departments: Department[]
  positions: Position[]
  employees: Employee[]
  onChanged: () => void
  showToast: (text: string, tone?: 'success' | 'error') => void
}

export default function OrgTab({ departments, positions, employees, onChanged, showToast }: Props) {
  const [newDept, setNewDept] = useState('')
  const [newPos, setNewPos] = useState('')
  const [editDeptId, setEditDeptId] = useState<string | null>(null)
  const [editDeptName, setEditDeptName] = useState('')
  const [editPosId, setEditPosId] = useState<string | null>(null)
  const [editPosName, setEditPosName] = useState('')
  const [editPosLevel, setEditPosLevel] = useState(1)
  const [busy, setBusy] = useState(false)

  const deptCount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of employees) {
      if (e.department_id && e.is_active) m[e.department_id] = (m[e.department_id] || 0) + 1
    }
    return m
  }, [employees])

  const posCount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of employees) {
      if (e.position_id && e.is_active) m[e.position_id] = (m[e.position_id] || 0) + 1
    }
    return m
  }, [employees])

  const call = async (input: string, init: RequestInit, okMsg: string) => {
    setBusy(true)
    try {
      const res = await fetch(input, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      })
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => ({}))
        showToast(j.error || '요청이 실패했습니다', 'error')
        return false
      }
      showToast(okMsg)
      onChanged()
      return true
    } catch {
      showToast('네트워크 오류가 발생했습니다', 'error')
      return false
    } finally { setBusy(false) }
  }

  const addDept = async () => {
    if (!newDept.trim()) return
    if (await call('/api/departments', { method: 'POST', body: JSON.stringify({ name: newDept.trim() }) }, '부서가 추가되었습니다')) setNewDept('')
  }
  const saveDept = async (id: string) => {
    if (!editDeptName.trim()) return
    if (await call(`/api/departments/${id}`, { method: 'PATCH', body: JSON.stringify({ name: editDeptName.trim() }) }, '부서 이름이 변경되었습니다')) setEditDeptId(null)
  }
  const removeDept = async (dep: Department) => {
    const n = deptCount[dep.id] || 0
    const warn = n > 0 ? `\n\n이 부서에 재직 직원 ${n}명이 배정되어 있습니다 — 삭제하면 소속이 「미지정」이 됩니다.` : ''
    if (!confirm(`「${dep.name}」 부서를 삭제하시겠습니까?${warn}`)) return
    await call(`/api/departments/${dep.id}`, { method: 'DELETE' }, '부서가 삭제되었습니다')
  }

  const addPos = async () => {
    if (!newPos.trim()) return
    const nextLevel = positions.reduce((mx, p) => Math.max(mx, p.level || 0), 0) + 1
    if (await call('/api/positions', { method: 'POST', body: JSON.stringify({ name: newPos.trim(), level: nextLevel }) }, '직급이 추가되었습니다')) setNewPos('')
  }
  const savePos = async (id: string) => {
    if (!editPosName.trim()) return
    if (await call(`/api/positions/${id}`, { method: 'PATCH', body: JSON.stringify({ name: editPosName.trim(), level: editPosLevel }) }, '직급이 수정되었습니다')) setEditPosId(null)
  }
  const removePos = async (pos: Position) => {
    const n = posCount[pos.id] || 0
    const warn = n > 0 ? `\n\n이 직급의 재직 직원 ${n}명이 있습니다 — 삭제하면 직급이 「미지정」이 됩니다.` : ''
    if (!confirm(`「${pos.name}」 직급을 삭제하시겠습니까?${warn}`)) return
    await call(`/api/positions/${pos.id}`, { method: 'DELETE' }, '직급이 삭제되었습니다')
  }

  const rowS: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '9px 16px', borderBottom: `1px solid ${COLORS.borderFaint}`, fontSize: 13,
  }
  const miniBtn = (label: string, onClick: () => void, danger = false) => (
    <button onClick={onClick} disabled={busy}
      style={{ fontSize: 11.5, color: danger ? COLORS.danger : COLORS.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px' }}>
      {label}
    </button>
  )

  const sortedPositions = [...positions].sort((a, b) => (a.level || 0) - (b.level || 0))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
      {/* 부서 */}
      <div style={cardS}>
        <h3 style={{ fontSize: 14, fontWeight: 700, padding: '14px 16px 0' }}>부서</h3>
        <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '2px 16px 12px' }}>부서를 추가하고 직원 탭에서 배정합니다</div>
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px' }}>
          <input style={{ ...inputS, flex: 1 }} placeholder="새 부서 이름" value={newDept}
            onChange={e => setNewDept(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDept()} />
          <button onClick={addDept} disabled={busy || !newDept.trim()} style={{ ...btnPrimaryS, padding: '8px 14px' }}>추가</button>
        </div>
        {departments.length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 0', color: COLORS.textMuted, fontSize: 13 }}>등록된 부서가 없습니다</div>
        )}
        {departments.map(dep => (
          <div key={dep.id} style={rowS}>
            {editDeptId === dep.id ? (
              <span style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center' }}>
                <input style={{ ...inputS, flex: 1 }} value={editDeptName} autoFocus
                  onChange={e => setEditDeptName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveDept(dep.id)} />
                <button onClick={() => saveDept(dep.id)} disabled={busy} style={{ ...btnPrimaryS, padding: '6px 12px', fontSize: 12 }}>저장</button>
                {miniBtn('취소', () => setEditDeptId(null))}
              </span>
            ) : (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: deptColor(departments, dep.id), marginRight: 8 }} />
                  {dep.name}
                  <span style={{ fontSize: 11.5, color: COLORS.textMuted, marginLeft: 7 }}>· 직원 {deptCount[dep.id] || 0}명</span>
                </span>
                <span style={{ display: 'flex', gap: 4 }}>
                  {miniBtn('수정', () => { setEditDeptId(dep.id); setEditDeptName(dep.name) })}
                  {miniBtn('삭제', () => removeDept(dep), true)}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* 직급 */}
      <div style={cardS}>
        <h3 style={{ fontSize: 14, fontWeight: 700, padding: '14px 16px 0' }}>직급</h3>
        <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '2px 16px 12px' }}>순위가 낮을수록 상위 직급입니다</div>
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px' }}>
          <input style={{ ...inputS, flex: 1 }} placeholder="새 직급 이름" value={newPos}
            onChange={e => setNewPos(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPos()} />
          <button onClick={addPos} disabled={busy || !newPos.trim()} style={{ ...btnPrimaryS, padding: '8px 14px' }}>추가</button>
        </div>
        {sortedPositions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 0', color: COLORS.textMuted, fontSize: 13 }}>등록된 직급이 없습니다</div>
        )}
        {sortedPositions.map(pos => (
          <div key={pos.id} style={rowS}>
            {editPosId === pos.id ? (
              <span style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center' }}>
                <input type="number" min={1} max={99} style={{ ...inputS, width: 64 }} value={editPosLevel}
                  onChange={e => setEditPosLevel(Number(e.target.value) || 1)} />
                <input style={{ ...inputS, flex: 1 }} value={editPosName} autoFocus
                  onChange={e => setEditPosName(e.target.value)} onKeyDown={e => e.key === 'Enter' && savePos(pos.id)} />
                <button onClick={() => savePos(pos.id)} disabled={busy} style={{ ...btnPrimaryS, padding: '6px 12px', fontSize: 12 }}>저장</button>
                {miniBtn('취소', () => setEditPosId(null))}
              </span>
            ) : (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.primary, background: COLORS.bgBlue, borderRadius: 5, padding: '2px 7px' }}>
                    {pos.level ?? '—'}
                  </span>
                  {pos.name}
                  {(posCount[pos.id] || 0) > 0 && (
                    <span style={{ fontSize: 11.5, color: COLORS.textMuted }}>· {posCount[pos.id]}명</span>
                  )}
                </span>
                <span style={{ display: 'flex', gap: 4 }}>
                  {miniBtn('수정', () => { setEditPosId(pos.id); setEditPosName(pos.name); setEditPosLevel(pos.level || 1) })}
                  {miniBtn('삭제', () => removePos(pos), true)}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

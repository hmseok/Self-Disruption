'use client'
// ═══════════════════════════════════════════════════════════════
// CompanyOrgPanel — 회사별 조직도 표준 패널 (직급 + 부서 카드 2개)
//
// PR-HR-21 (2026-05-28, hr 세션) — FMI 조직도 인라인 → 컴포넌트 추출.
//   설계: app/hr/_components/CompanyOrgPanel.tsx
//
// 사용처:
//   · page.tsx 의 FMI 조직도 탭 (기존 인라인 → 본 컴포넌트)
//   · RIDE 는 RideOrgPanel (부서 트리 — 다른 데이터 구조) 사용 — 향후 PR-HR-21b
//
// 책임 분리:
//   · 본 패널: 직급/부서 카드 UI 표현
//   · 외부: state / CRUD 핸들러 (props 로 주입)
// ═══════════════════════════════════════════════════════════════
import React from 'react'
import { GLASS } from '@/app/utils/ui-tokens'

// 인풋 배경 (Soft Ice L1 — 오목 인풋, 배경보다 어두움)
const INPUT_BG = GLASS.L1.background

interface Position {
  id: string
  name: string
  level: number
}

interface Department {
  id: string
  name: string
}

interface CompanyOrgPanelProps {
  positions: Position[]
  departments: Department[]
  // 직급 핸들러
  newPositionName: string
  setNewPositionName: (v: string) => void
  newPositionLevel: number
  setNewPositionLevel: (v: number) => void
  addPosition: () => void
  editingPosId: string | null
  setEditingPosId: (id: string | null) => void
  editPosName: string
  setEditPosName: (v: string) => void
  editPosLevel: number
  setEditPosLevel: (v: number) => void
  savePosition: (id: string) => void
  deletePosition: (id: string) => void
  // 부서 핸들러
  newDeptName: string
  setNewDeptName: (v: string) => void
  addDepartment: () => void
  editingDeptId: string | null
  setEditingDeptId: (id: string | null) => void
  editDeptName: string
  setEditDeptName: (v: string) => void
  saveDepartment: (id: string) => void
  deleteDepartment: (id: string) => void
  // 공용 스타일
  glassCard: React.CSSProperties
}

export default function CompanyOrgPanel({
  positions, departments,
  newPositionName, setNewPositionName, newPositionLevel, setNewPositionLevel, addPosition,
  editingPosId, setEditingPosId, editPosName, setEditPosName, editPosLevel, setEditPosLevel, savePosition, deletePosition,
  newDeptName, setNewDeptName, addDepartment,
  editingDeptId, setEditingDeptId, editDeptName, setEditDeptName, saveDepartment, deleteDepartment,
  glassCard,
}: CompanyOrgPanelProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* 직급 */}
      <div style={{ ...glassCard, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>📊 직급 ({positions.length})</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>직급명</label>
            <input value={newPositionName} onChange={e => setNewPositionName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPosition()}
              style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: INPUT_BG, boxSizing: 'border-box' }} placeholder="예: 과장" />
          </div>
          <div style={{ width: 80 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>레벨</label>
            <input type="number" min={1} max={10} value={newPositionLevel}
              onChange={e => setNewPositionLevel(Number(e.target.value))}
              style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: INPUT_BG, boxSizing: 'border-box' }} />
          </div>
          <button onClick={addPosition} style={{ padding: '8px 14px', background: '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', flexShrink: 0 }}>+ 추가</button>
        </div>
        <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, overflow: 'hidden' }}>
          {positions.map(pos => (
            <div key={pos.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              {editingPosId === pos.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  <input value={editPosName} onChange={e => setEditPosName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && savePosition(pos.id)}
                    style={{ flex: 1, border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6, padding: '4px 8px', fontSize: 13, outline: 'none' }} autoFocus />
                  <input type="number" min={1} max={10} value={editPosLevel}
                    onChange={e => setEditPosLevel(Number(e.target.value))}
                    style={{ width: 48, border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6, padding: '4px 8px', fontSize: 13, outline: 'none' }} />
                  <button onClick={() => savePosition(pos.id)} style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>저장</button>
                  <button onClick={() => setEditingPosId(null)} style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                    onClick={() => { setEditingPosId(pos.id); setEditPosName(pos.name); setEditPosLevel(pos.level || 0) }}>
                    <span style={{ background: 'rgba(59,130,246,0.1)', color: '#2563eb', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, width: 48, textAlign: 'center', display: 'inline-block' }}>Lv.{pos.level}</span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>{pos.name}</span>
                  </div>
                  <button onClick={() => deletePosition(pos.id)} style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>삭제</button>
                </>
              )}
            </div>
          ))}
          {positions.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>직급이 없습니다.</div>}
        </div>
      </div>

      {/* 부서 */}
      <div style={{ ...glassCard, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>🏢 부서 ({departments.length})</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>부서명</label>
            <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDepartment()}
              style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: INPUT_BG, boxSizing: 'border-box' }} placeholder="예: 영업팀" />
          </div>
          <button onClick={addDepartment} style={{ padding: '8px 14px', background: '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', flexShrink: 0 }}>+ 추가</button>
        </div>
        <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, overflow: 'hidden' }}>
          {departments.map(dept => (
            <div key={dept.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              {editingDeptId === dept.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  <input value={editDeptName} onChange={e => setEditDeptName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveDepartment(dept.id)}
                    style={{ flex: 1, border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6, padding: '4px 8px', fontSize: 13, outline: 'none' }} autoFocus />
                  <button onClick={() => saveDepartment(dept.id)} style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>저장</button>
                  <button onClick={() => setEditingDeptId(null)} style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
                </div>
              ) : (
                <>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#334155', cursor: 'pointer' }}
                    onClick={() => { setEditingDeptId(dept.id); setEditDeptName(dept.name) }}>
                    {dept.name}
                  </span>
                  <button onClick={() => deleteDepartment(dept.id)} style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>삭제</button>
                </>
              )}
            </div>
          ))}
          {departments.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>부서가 없습니다.</div>}
        </div>
      </div>
    </div>
  )
}

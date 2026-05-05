'use client'

import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import type { Position, Department } from '../../types/rbac'
import DcStatStrip from '../../components/DcStatStrip'
import DcToolbar, { FilterItem } from '../../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../../components/NeuDataTable'
import { auth } from '@/lib/auth-client'

// ────────────────────────────────────────────────────────────────
// /hr/org — 조직 마스터 (PR-A2, 2026-05-05)
// 부서 / 직급 / 초대 관리
// (직원 인사정보 / 급여 / 권한 → /hr/people)
// ────────────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<Record<string, string>> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const ROLE_LABELS: Record<string, { label: string }> = {
  admin: { label: 'GOD ADMIN' },
  master: { label: '관리자' },
  user: { label: '직원' },
}
const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin: { bg: '#e0f2fe', color: '#0284c7' },
  master: { bg: 'rgba(59,130,246,0.12)', color: '#2563eb' },
  user: { bg: 'rgba(0,0,0,0.04)', color: '#64748b' },
}

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: '대기중', bg: 'rgba(251,191,36,0.15)', color: '#a16207' },
  accepted: { label: '수락', bg: 'rgba(34,197,94,0.15)', color: '#16a34a' },
  expired: { label: '만료', bg: 'rgba(239,68,68,0.15)', color: '#dc2626' },
  canceled: { label: '취소', bg: 'rgba(0,0,0,0.04)', color: '#94a3b8' },
}

type Tab = 'positions' | 'departments' | 'invitations'

export default function HROrgPage() {
  const { company, role } = useApp()

  const [activeTab, setActiveTab] = useState<Tab>('positions')
  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [invitations, setInvitations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingInvitations, setLoadingInvitations] = useState(false)
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  // 직급 폼
  const [newPositionName, setNewPositionName] = useState('')
  const [newPositionLevel, setNewPositionLevel] = useState(4)
  const [editingPosId, setEditingPosId] = useState<string | null>(null)
  const [editPosName, setEditPosName] = useState('')
  const [editPosLevel, setEditPosLevel] = useState(0)

  // 부서 폼
  const [newDeptName, setNewDeptName] = useState('')
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null)
  const [editDeptName, setEditDeptName] = useState('')

  useEffect(() => { loadAll() }, [company])
  useEffect(() => {
    if (activeTab === 'invitations' && ['admin', 'master'].includes(role || '')) loadInvitations()
  }, [activeTab, role])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadPositions(), loadDepartments()])
    setLoading(false)
  }

  const loadPositions = async () => {
    try {
      const res = await fetch('/api/positions', { headers: await getAuthHeader() })
      if (!res.ok) { setPositions([]); return }
      const json = await res.json()
      setPositions(json.data || [])
    } catch { setPositions([]) }
  }

  const loadDepartments = async () => {
    try {
      const res = await fetch('/api/departments', { headers: await getAuthHeader() })
      if (!res.ok) { setDepartments([]); return }
      const json = await res.json()
      setDepartments(json.data || [])
    } catch { setDepartments([]) }
  }

  const loadInvitations = async () => {
    if (!['admin', 'master'].includes(role || '')) return
    setLoadingInvitations(true)
    try {
      const res = await fetch('/api/member-invite', { headers: await getAuthHeader() })
      if (!res.ok) { setInvitations([]); return }
      const json = await res.json()
      setInvitations(json.data || [])
    } catch { setInvitations([]) }
    finally { setLoadingInvitations(false) }
  }

  const cancelInvitation = async (id: string) => {
    if (!confirm('이 초대를 취소하시겠습니까?')) return
    setCancelingId(id)
    try {
      const res = await fetch(`/api/member-invite?id=${id}`, {
        method: 'DELETE', headers: await getAuthHeader(),
      })
      if (res.ok) loadInvitations()
      else alert('초대 취소 실패')
    } catch { alert('초대 취소 중 오류') }
    finally { setCancelingId(null) }
  }

  // 직급 CRUD
  const addPosition = async () => {
    if (!newPositionName.trim()) return
    try {
      const res = await fetch('/api/positions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ name: newPositionName.trim(), level: newPositionLevel }),
      })
      const json = await res.json()
      if (json.error) alert('직급 추가 실패: ' + json.error)
      else { setNewPositionName(''); setNewPositionLevel(4); loadPositions() }
    } catch { alert('직급 추가 실패') }
  }
  const deletePosition = async (id: string) => {
    if (!confirm('이 직급을 삭제하시겠습니까?')) return
    await fetch(`/api/positions/${id}`, { method: 'DELETE', headers: await getAuthHeader() })
    loadPositions()
  }
  const savePosition = async (id: string) => {
    try {
      await fetch(`/api/positions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ name: editPosName, level: editPosLevel }),
      })
      setEditingPosId(null); loadPositions()
    } catch { alert('직급 수정 실패') }
  }

  // 부서 CRUD
  const addDepartment = async () => {
    if (!newDeptName.trim()) return
    try {
      const res = await fetch('/api/departments', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ name: newDeptName.trim() }),
      })
      const json = await res.json()
      if (json.error) alert('부서 추가 실패: ' + json.error)
      else { setNewDeptName(''); loadDepartments() }
    } catch { alert('부서 추가 실패') }
  }
  const deleteDepartment = async (id: string) => {
    if (!confirm('이 부서를 삭제하시겠습니까?')) return
    await fetch(`/api/departments/${id}`, { method: 'DELETE', headers: await getAuthHeader() })
    loadDepartments()
  }
  const saveDepartment = async (id: string) => {
    try {
      await fetch(`/api/departments/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ name: editDeptName }),
      })
      setEditingDeptId(null); loadDepartments()
    } catch { alert('부서 수정 실패') }
  }

  const formatDate = (d: string) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="page-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(0,0,0,0.06)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const pendingInvitationCount = invitations.filter((inv: any) => inv.status === 'pending').length

  const TAB_FILTERS: FilterItem[] = [
    { key: 'positions', label: '직급', count: positions.length },
    { key: 'departments', label: '부서', count: departments.length },
    { key: 'invitations', label: '초대', count: invitations.length },
  ]

  const inviteColumns: TableColumn<any>[] = [
    { key: 'email', label: '이메일', width: '30%', render: (inv) => <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{inv.email}</span>, sortBy: (r) => r.email },
    { key: 'department', label: '부서', width: 100, render: (inv) => <span style={{ fontSize: 12, color: '#64748b' }}>{inv.department?.name || '-'}</span>, sortBy: (r) => r.department?.name || '' },
    { key: 'position', label: '직급', width: 80, render: (inv) => <span style={{ fontSize: 12, color: '#64748b' }}>{inv.position?.name || '-'}</span>, sortBy: (r) => r.position?.name || '' },
    {
      key: 'role', label: '역할', width: 80, align: 'center', sortBy: (r) => r.role || '',
      render: (inv) => {
        const rc = ROLE_COLORS[inv.role] || ROLE_COLORS.user
        return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: rc.bg, color: rc.color }}>{ROLE_LABELS[inv.role]?.label || inv.role}</span>
      },
    },
    {
      key: 'status', label: '상태', width: 80, align: 'center', sortBy: (r) => r.status || '',
      render: (inv) => {
        const s = STATUS_STYLE[inv.status] || { label: inv.status, bg: 'rgba(0,0,0,0.04)', color: '#94a3b8' }
        return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: s.bg, color: s.color }}>{s.label}</span>
      },
    },
    { key: 'created', label: '생성일', width: 110, align: 'right', hideOnMobile: true, sortBy: (r) => new Date(r.created_at || 0).getTime(), render: (inv) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(inv.created_at)}</span> },
    { key: 'expires', label: '만료일', width: 110, align: 'right', hideOnMobile: true, sortBy: (r) => new Date(r.expires_at || 0).getTime(), render: (inv) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(inv.expires_at)}</span> },
    {
      key: 'action', label: '', width: 60, align: 'center',
      render: (inv) => inv.status === 'pending' ? (
        <button onClick={(e) => { e.stopPropagation(); cancelInvitation(inv.id) }}
          disabled={cancelingId === inv.id}
          style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>
          {cancelingId === inv.id ? '...' : '취소'}
        </button>
      ) : null,
    },
  ]
  const inviteMobileCard: MobileCardConfig<any> = {
    title: (inv) => <span style={{ fontWeight: 600 }}>{inv.email}</span>,
    subtitle: (inv) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(inv.created_at)} ~ {formatDate(inv.expires_at)}</span>,
    trailing: (inv) => {
      const s = STATUS_STYLE[inv.status] || { label: inv.status, bg: 'rgba(0,0,0,0.04)', color: '#94a3b8' }
      return <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: s.bg, color: s.color }}>{s.label}</span>
    },
  }

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">

        {/* Stats */}
        <DcStatStrip
          stats={[
            { label: '직급', value: positions.length, tint: 'blue' },
            { label: '부서', value: departments.length, tint: 'green' },
            { label: '대기중 초대', value: pendingInvitationCount, tint: 'amber' },
          ]}
        />

        {/* 탭 */}
        <DcToolbar
          search=""
          onSearchChange={() => {}}
          noSearch
          filters={TAB_FILTERS}
          activeFilter={activeTab}
          onFilterChange={(key) => setActiveTab(key as Tab)}
        />

        {/* 직급 */}
        {activeTab === 'positions' && (
          <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)', padding: 20 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>직급명</label>
                <input value={newPositionName} onChange={e => setNewPositionName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addPosition()}
                  style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} placeholder="예: 과장" />
              </div>
              <div style={{ width: 96 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>레벨</label>
                <input type="number" min={1} max={10} value={newPositionLevel}
                  onChange={e => setNewPositionLevel(Number(e.target.value))}
                  style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
              </div>
              <button onClick={addPosition} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', flexShrink: 0 }}>+ 추가</button>
            </div>
            <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, overflow: 'hidden' }}>
              {positions.map(pos => (
                <div key={pos.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  {editingPosId === pos.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
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
              {positions.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>직급이 없습니다.</div>}
            </div>
          </div>
        )}

        {/* 부서 */}
        {activeTab === 'departments' && (
          <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)', padding: 20 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>부서명</label>
                <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDepartment()}
                  style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} placeholder="예: 영업팀" />
              </div>
              <button onClick={addDepartment} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', flexShrink: 0 }}>+ 추가</button>
            </div>
            <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, overflow: 'hidden' }}>
              {departments.map(dept => (
                <div key={dept.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  {editingDeptId === dept.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
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
              {departments.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>부서가 없습니다.</div>}
            </div>
          </div>
        )}

        {/* 초대 */}
        {activeTab === 'invitations' && (
          <NeuDataTable
            columns={inviteColumns}
            data={invitations}
            rowKey={(inv) => inv.id}
            emptyMessage="초대 내역이 없습니다 — 「인력 마스터」 페이지에서 직원 초대"
            mobileCard={inviteMobileCard}
            loading={loadingInvitations}
            defaultSort={{ key: 'created', dir: 'desc' }}
          />
        )}

      </div>
    </div>
  )
}

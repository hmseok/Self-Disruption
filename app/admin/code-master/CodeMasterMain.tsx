'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../../context/AppContext'

type CodeRow = {
  id: string; group_code: string; group_name: string; code: string; label: string;
  sort_order: number; is_active: boolean; description: string; source: string; cafe24_group: string;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export default function CodeMasterMain() {
  const { user } = useApp()
  const [groups, setGroups] = useState<{ group_code: string; group_name: string; count: number }[]>([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [codes, setCodes] = useState<CodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<CodeRow>>({})
  const [isAdding, setIsAdding] = useState(false)

  // 그룹 목록 로드
  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/codes', { headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const data = json.data || []

      if (data) {
        const map: Record<string, { name: string; count: number }> = {}
        data.forEach((r: any) => {
          if (!map[r.group_code]) map[r.group_code] = { name: r.group_name || '', count: 0 }
          map[r.group_code].count++
        })
        setGroups(Object.entries(map).map(([k, v]) => ({ group_code: k, group_name: v.name, count: v.count })))
      }
    } catch (err) {
      console.error('loadGroups error:', err)
    }
    setLoading(false)
  }, [])

  // 특정 그룹의 코드 로드
  const loadCodes = useCallback(async (grp: string) => {
    setSelectedGroup(grp)
    try {
      const res = await fetch(`/api/codes?category=${grp}`, { headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const data = json.data || []
      if (data) setCodes(data as CodeRow[])
    } catch (err) {
      console.error('loadCodes error:', err)
    }
  }, [])

  useEffect(() => { loadGroups() }, [loadGroups])

  // 저장
  const handleSave = async (row: CodeRow) => {
    const updates = {
      label: editForm.label || row.label,
      description: editForm.description ?? row.description,
      sort_order: editForm.sort_order ?? row.sort_order,
      is_active: editForm.is_active ?? row.is_active,
    }
    try {
      const res = await fetch(`/api/codes/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(updates)
      })
      if (!res.ok) throw new Error('Update failed')
      setEditing(null)
      setEditForm({})
      loadCodes(selectedGroup)
    } catch (err) {
      console.error('handleSave error:', err)
    }
  }

  // 신규 추가
  const handleAdd = async () => {
    if (!editForm.code || !editForm.label) return
    try {
      const res = await fetch('/api/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({
          group_code: selectedGroup,
          group_name: groups.find(g => g.group_code === selectedGroup)?.group_name || '',
          code: editForm.code,
          label: editForm.label,
          sort_order: editForm.sort_order || 0,
          description: editForm.description || '',
          source: 'manual',
          is_active: true,
        })
      })
      if (!res.ok) throw new Error('Create failed')
      setIsAdding(false)
      setEditForm({})
      loadCodes(selectedGroup)
      loadGroups()
    } catch (err) {
      console.error('handleAdd error:', err)
    }
  }

  // 삭제
  const handleDelete = async (id: string) => {
    if (!confirm('이 코드를 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/codes/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
      })
      if (!res.ok) throw new Error('Delete failed')
      loadCodes(selectedGroup)
      loadGroups()
    } catch (err) {
      console.error('handleDelete error:', err)
    }
  }

  // 새 그룹 추가
  const handleAddGroup = async () => {
    const groupCode = prompt('새 그룹 코드를 입력하세요 (예: NEWCODE)')
    if (!groupCode) return
    const groupName = prompt('그룹 설명을 입력하세요')
    if (!groupName) return
    try {
      const res = await fetch('/api/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({
          group_code: groupCode.toUpperCase(),
          group_name: groupName,
          code: '*',
          label: groupName,
          sort_order: 0,
          source: 'manual',
          is_active: true,
        })
      })
      if (!res.ok) throw new Error('Create failed')
      loadGroups()
    } catch (err) {
      console.error('handleAddGroup error:', err)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 px-6 py-4 flex-shrink-0 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">기초코드 관리</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">Code Master Management — 코드 마스터 관리</p>
          </div>
          <div className="flex gap-3 text-[13px]">
            <div className="bg-white/10 rounded-lg px-4 py-2 text-white">
              <span className="text-slate-400">그룹</span> <b>{groups.length}</b>
            </div>
            <div className="bg-white/10 rounded-lg px-4 py-2 text-white">
              <span className="text-slate-400">전체 코드</span> <b>{groups.reduce((s, g) => s + g.count, 0)}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Body — 2단 레이아웃 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 좌측: 그룹 목록 */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[13px] font-bold text-slate-700">코드 그룹</span>
            <button onClick={handleAddGroup} className="text-[11px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">+ 그룹</button>
          </div>
          {loading ? (
            <div className="p-4 text-center text-slate-400 text-sm">로딩중...</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {groups.map(g => (
                <button key={g.group_code} onClick={() => loadCodes(g.group_code)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${selectedGroup === g.group_code ? 'bg-blue-50 border-l-[3px] border-l-blue-600' : 'border-l-[3px] border-l-transparent'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-slate-800">{g.group_code}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{g.count}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{g.group_name}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 우측: 코드 상세 */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedGroup ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
              <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
              <span className="text-sm">좌측에서 코드 그룹을 선택하세요</span>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* 헤더 */}
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                <div>
                  <h2 className="text-[15px] font-bold text-slate-800">{selectedGroup}</h2>
                  <p className="text-[11px] text-slate-500">{groups.find(g => g.group_code === selectedGroup)?.group_name}</p>
                </div>
                <button onClick={() => { setIsAdding(true); setEditForm({ sort_order: codes.length + 1 }) }}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  코드 추가
                </button>
              </div>

              {/* 테이블 */}
              <div className="px-5 py-2">
                <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-slate-500 uppercase py-2 border-b border-slate-200">
                  <span className="col-span-2">코드</span>
                  <span className="col-span-3">라벨</span>
                  <span className="col-span-3">설명</span>
                  <span className="col-span-1 text-center">순서</span>
                  <span className="col-span-1 text-center">출처</span>
                  <span className="col-span-1 text-center">상태</span>
                  <span className="col-span-1 text-center">작업</span>
                </div>

                {/* 추가 행 */}
                {isAdding && (
                  <div className="grid grid-cols-12 gap-2 py-2 border-b border-blue-100 bg-blue-50 items-center">
                    <input className="col-span-2 px-2 py-1 border rounded text-sm" placeholder="코드"
                      value={editForm.code || ''} onChange={e => setEditForm({ ...editForm, code: e.target.value })} />
                    <input className="col-span-3 px-2 py-1 border rounded text-sm" placeholder="라벨"
                      value={editForm.label || ''} onChange={e => setEditForm({ ...editForm, label: e.target.value })} />
                    <input className="col-span-3 px-2 py-1 border rounded text-sm" placeholder="설명"
                      value={editForm.description || ''} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                    <input className="col-span-1 px-2 py-1 border rounded text-sm text-center" type="number"
                      value={editForm.sort_order || 0} onChange={e => setEditForm({ ...editForm, sort_order: parseInt(e.target.value) })} />
                    <span className="col-span-1 text-center text-[10px] text-blue-600">수동</span>
                    <span className="col-span-1 text-center">-</span>
                    <div className="col-span-1 flex gap-1 justify-center">
                      <button onClick={handleAdd} className="px-2 py-1 bg-emerald-600 text-white text-[10px] rounded">저장</button>
                      <button onClick={() => { setIsAdding(false); setEditForm({}) }} className="px-2 py-1 bg-slate-300 text-[10px] rounded">취소</button>
                    </div>
                  </div>
                )}

                {/* 데이터 행 */}
                {codes.filter(c => c.code !== '*').map((row, idx) => (
                  <div key={row.id} className={`grid grid-cols-12 gap-2 py-2 border-b border-slate-100 items-center text-[13px] ${idx % 2 ? 'bg-slate-50/50' : ''}`}>
                    {editing === row.id ? (
                      <>
                        <span className="col-span-2 font-mono font-bold text-slate-800">{row.code}</span>
                        <input className="col-span-3 px-2 py-1 border rounded text-sm"
                          value={editForm.label ?? row.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })} />
                        <input className="col-span-3 px-2 py-1 border rounded text-sm"
                          value={editForm.description ?? (row.description || '')} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                        <input className="col-span-1 px-2 py-1 border rounded text-sm text-center" type="number"
                          value={editForm.sort_order ?? row.sort_order} onChange={e => setEditForm({ ...editForm, sort_order: parseInt(e.target.value) })} />
                        <span className="col-span-1 text-center text-[10px] text-slate-400">{row.source}</span>
                        <span className="col-span-1 text-center">
                          <button onClick={() => setEditForm({ ...editForm, is_active: !(editForm.is_active ?? row.is_active) })}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${(editForm.is_active ?? row.is_active) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {(editForm.is_active ?? row.is_active) ? '활성' : '비활성'}
                          </button>
                        </span>
                        <div className="col-span-1 flex gap-1 justify-center">
                          <button onClick={() => handleSave(row)} className="px-2 py-1 bg-emerald-600 text-white text-[10px] rounded">저장</button>
                          <button onClick={() => { setEditing(null); setEditForm({}) }} className="px-2 py-1 bg-slate-300 text-[10px] rounded">취소</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="col-span-2 font-mono font-bold text-slate-800">{row.code}</span>
                        <span className="col-span-3 text-slate-700">{row.label}</span>
                        <span className="col-span-3 text-slate-500 text-[12px]">{row.description || '-'}</span>
                        <span className="col-span-1 text-center text-slate-400">{row.sort_order}</span>
                        <span className="col-span-1 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${row.source === 'cafe24' ? 'bg-blue-100 text-blue-700' : row.source === 'manual' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {row.source === 'cafe24' ? 'C24' : row.source === 'manual' ? '수동' : row.source}
                          </span>
                        </span>
                        <span className="col-span-1 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${row.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {row.is_active ? '활성' : '비활성'}
                          </span>
                        </span>
                        <div className="col-span-1 flex gap-1 justify-center">
                          <button onClick={() => { setEditing(row.id); setEditForm({}) }} className="px-2 py-1 bg-slate-200 text-slate-700 text-[10px] rounded hover:bg-slate-300">수정</button>
                          <button onClick={() => handleDelete(row.id)} className="px-2 py-1 bg-red-100 text-red-600 text-[10px] rounded hover:bg-red-200">삭제</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

// ═══════════════════════════════════════════════════════════════════
// 메뉴 구성 설정 — 사이드바 트리 편집 (2026-08-08 사용자 요청)
// 그룹 추가/이름변경/순서/삭제 + 메뉴를 그룹 사이로 이동·정렬.
// 저장 → 전 직원 사이드바에 즉시 반영 (/api/menu-layout)
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

interface Group { id: string; label: string }
type Items = Record<string, string>
interface MenuMeta { path: string; name: string; iconKey: string }

export default function MenuLayoutPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [items, setItems] = useState<Items>({})
  const [meta, setMeta] = useState<MenuMeta[]>([])
  const [order, setOrder] = useState<string[]>([])   // 메뉴 path 표시 순서 (그룹 내 정렬)
  const [customized, setCustomized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/menu-layout', { headers: await getAuthHeader() })
      if (!res.ok) return
      const j = await res.json()
      setGroups(j.layout.groups)
      setItems(j.layout.items)
      setMeta(j.menuMeta)
      setOrder(Object.keys(j.layout.items))
      setCustomized(j.isCustomized)
      setDirty(false)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const touch = () => { setDirty(true); setMsg(null) }

  const moveGroup = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= groups.length) return
    const next = [...groups]
    ;[next[i], next[j]] = [next[j], next[i]]
    setGroups(next); touch()
  }

  const renameGroup = (i: number, label: string) => {
    const next = [...groups]
    next[i] = { ...next[i], label }
    setGroups(next); touch()
  }

  const addGroup = () => {
    const label = prompt('새 그룹 이름을 입력하세요')?.trim()
    if (!label) return
    const id = `g-custom-${Date.now().toString(36)}`
    setGroups([...groups, { id, label }]); touch()
  }

  const removeGroup = (i: number) => {
    const g = groups[i]
    const has = Object.values(items).includes(g.id)
    if (has) { alert('메뉴가 남아 있는 그룹은 삭제할 수 없습니다. 메뉴를 먼저 다른 그룹으로 옮겨주세요.'); return }
    if (!confirm(`「${g.label}」 그룹을 삭제할까요?`)) return
    setGroups(groups.filter((_, k) => k !== i)); touch()
  }

  const moveMenu = (path: string, gid: string) => {
    setItems({ ...items, [path]: gid }); touch()
  }

  const moveMenuOrder = (path: string, dir: -1 | 1) => {
    const gid = items[path]
    const inGroup = order.filter(p => items[p] === gid)
    const idx = inGroup.indexOf(path)
    const jdx = idx + dir
    if (jdx < 0 || jdx >= inGroup.length) return
    const swapWith = inGroup[jdx]
    const next = [...order]
    const a = next.indexOf(path), b = next.indexOf(swapWith)
    ;[next[a], next[b]] = [next[b], next[a]]
    setOrder(next); touch()
  }

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      // order 순서대로 items 재구성 (그룹 순회 시 삽입 순서 = 표시 순서)
      const ordered: Items = {}
      for (const g of groups) for (const p of order) if (items[p] === g.id) ordered[p] = g.id
      const res = await fetch('/api/menu-layout', {
        method: 'PUT',
        headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups, items: ordered }),
      })
      const j = await res.json()
      if (!res.ok) { setMsg({ ok: false, text: j.error || '저장 실패' }); return }
      setMsg({ ok: true, text: '저장되었습니다 — 사이드바는 새로고침 시 반영됩니다' })
      setDirty(false); setCustomized(true)
    } finally { setSaving(false) }
  }

  const reset = async () => {
    if (!confirm('기본 구성(차량관리/렌터카/타이어/경리부 업무)으로 되돌릴까요?')) return
    await fetch('/api/menu-layout', { method: 'DELETE', headers: await getAuthHeader() })
    load()
  }

  const nameOf = (path: string) => meta.find(m => m.path === path)?.name || path

  return (
    <div style={{ padding: 20, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a1d23' }}>메뉴 구성</h1>
        <span style={{ fontSize: 12, color: '#9aa1ad' }}>사이드바 그룹·순서를 트리로 편집합니다 (전 직원 공통)</span>
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '10px 0 16px', alignItems: 'center' }}>
        <button onClick={addGroup} style={{ ...BTN.sm, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>＋ 그룹 추가</button>
        {customized && (
          <button onClick={reset} style={{ ...BTN.sm, background: '#fff', color: '#5b626e', border: '1px solid #e6e8ec', padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>기본값으로</button>
        )}
        <span style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 12, fontWeight: 700, color: msg.ok ? '#059669' : '#dc2626' }}>{msg.text}</span>}
        <button onClick={save} disabled={saving || !dirty}
          style={{ ...BTN.sm, background: dirty ? COLORS.primary : '#e6e8ec', color: '#fff', border: 'none', padding: '9px 20px', fontWeight: 800, cursor: dirty ? 'pointer' : 'default' }}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {loading && <div style={{ color: '#94a3b8', fontSize: 13, padding: 30 }}>불러오는 중...</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map((g, gi) => {
          const children = order.filter(p => items[p] === g.id)
          return (
            <div key={g.id} style={{ ...GLASS.L4, borderRadius: 14, overflow: 'hidden' }}>
              {/* 그룹 헤더 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(241,245,249,0.7)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>📁</span>
                <input value={g.label} onChange={e => renameGroup(gi, e.target.value)}
                  style={{ fontSize: 13.5, fontWeight: 800, color: '#1a1d23', border: '1px solid transparent', borderRadius: 7, padding: '4px 8px', background: 'transparent', outline: 'none', width: 160 }}
                  onFocus={e => (e.target.style.borderColor = '#c9dbfa', e.target.style.background = '#fff')}
                  onBlur={e => (e.target.style.borderColor = 'transparent', e.target.style.background = 'transparent')} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{children.length}개</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => moveGroup(gi, -1)} disabled={gi === 0} style={{ ...BTN.sm, padding: '3px 9px', fontSize: 12, background: '#fff', border: '1px solid #e6e8ec', cursor: 'pointer', opacity: gi === 0 ? 0.3 : 1 }}>↑</button>
                <button onClick={() => moveGroup(gi, 1)} disabled={gi === groups.length - 1} style={{ ...BTN.sm, padding: '3px 9px', fontSize: 12, background: '#fff', border: '1px solid #e6e8ec', cursor: 'pointer', opacity: gi === groups.length - 1 ? 0.3 : 1 }}>↓</button>
                <button onClick={() => removeGroup(gi)} style={{ ...BTN.sm, padding: '3px 9px', fontSize: 12, background: '#fff', color: COLORS.danger, border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer' }}>삭제</button>
              </div>
              {/* 메뉴들 */}
              <div>
                {children.length === 0 && (
                  <div style={{ padding: '12px 16px', fontSize: 12, color: '#cbd5e1' }}>비어 있음 — 아래 메뉴의 그룹 셀렉트로 옮겨오세요</div>
                )}
                {children.map((path, ci) => (
                  <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px 9px 34px', borderTop: ci > 0 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                    <span style={{ fontSize: 13, color: '#5b626e' }}>└</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1d23', flex: 1 }}>{nameOf(path)}</span>
                    <code style={{ fontSize: 10.5, color: '#94a3b8' }}>{path}</code>
                    <select value={items[path]} onChange={e => moveMenu(path, e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #e6e8ec', fontSize: 11.5, background: '#fff', color: '#1e293b' }}>
                      {groups.map(gg => <option key={gg.id} value={gg.id}>{gg.label}</option>)}
                    </select>
                    <button onClick={() => moveMenuOrder(path, -1)} disabled={ci === 0} style={{ ...BTN.sm, padding: '2px 8px', fontSize: 11, background: '#fff', border: '1px solid #e6e8ec', cursor: 'pointer', opacity: ci === 0 ? 0.3 : 1 }}>↑</button>
                    <button onClick={() => moveMenuOrder(path, 1)} disabled={ci === children.length - 1} style={{ ...BTN.sm, padding: '2px 8px', fontSize: 11, background: '#fff', border: '1px solid #e6e8ec', cursor: 'pointer', opacity: ci === children.length - 1 ? 0.3 : 1 }}>↓</button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 11.5, color: '#9aa1ad', marginTop: 14, lineHeight: 1.7 }}>
        · 그룹 이름은 클릭해서 바로 수정, 순서는 ↑↓ 버튼<br />
        · 메뉴 이동은 각 행의 그룹 셀렉트 — 저장 전까지 반영되지 않습니다<br />
        · 메뉴 자체(페이지·권한)는 그대로이고 <b>배치만</b> 바뀝니다. 직원 권한은 인사 마스터에서 관리
      </div>
    </div>
  )
}

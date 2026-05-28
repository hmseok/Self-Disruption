'use client'
// ═══════════════════════════════════════════════════════════════
// RoleTemplatePanel — /hr 「역할 템플릿」 탭 (admin 전용)
//
// PR-HR-16 (2026-05-28, hr 세션) — 사용자 「실수할까봐 두려움」 직접 해결.
//   설계: CLAUDE.md § PR-HR-15+16 통합 설계서 v2
//
// 기능:
//   · 회사 × 역할 템플릿 목록 (sort_order ASC)
//   · 템플릿 편집 — 페이지 권한 트리 (menu-registry MENUS 기반)
//   · 「적용」 모달 — 직원 목록 선택 → 일괄 적용
//
// 의존: /api/role-templates (GET/POST), /api/role-templates/[id] (GET/PATCH/PUT/DELETE),
//       /api/role-templates/[id]/apply (POST), /api/menus, /api/employees
// ═══════════════════════════════════════════════════════════════
import React, { useEffect, useState, useMemo } from 'react'
import { auth } from '@/lib/auth-client'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

interface Template {
  id: string
  company_id: string
  company_key: string | null
  company_label: string | null
  role_key: string
  label: string
  description: string | null
  sort_order: number
  is_active: boolean
  page_count: number
}

interface Company {
  id: string
  company_key: string | null
  label: string | null
  name: string
}

interface PagePerm {
  page_path: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  data_scope: string
}

interface MenuEntry {
  id: string
  name: string
  displayName?: string
  path: string
  group: string
}

interface MenuGroup {
  id: string
  label: string
}

// GLASS / COLORS 는 @/app/utils/ui-tokens 의 표준 토큰 사용 (Soft Ice 시스템)
const GLASS_L4 = { ...GLASS.L4, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.04)' } as const
// primary tint — hex + alpha (8자리) 표기로 COLORS.primary 기반
//   #3b6eb5 (primary) + 1A (10% alpha) / 0D (5% alpha)
const TINT_PRIMARY_10 = `${COLORS.primary}1A`
const TINT_PRIMARY_05 = `${COLORS.primary}0D`

async function authedFetch(input: string, init?: RequestInit) {
  const user = auth.currentUser
  if (!user) throw new Error('미인증')
  const token = await user.getIdToken()
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}

export default function RoleTemplatePanel() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyFilter, setCompanyFilter] = useState<string>('') // company_key, '' = 전체
  const [templates, setTemplates] = useState<Template[]>([])
  const [expanded, setExpanded] = useState<string | null>(null) // 펼친 템플릿 id
  const [showAdd, setShowAdd] = useState(false)
  const [applyTarget, setApplyTarget] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [migrationPending, setMigrationPending] = useState(false)

  async function loadCompanies() {
    try {
      const res = await authedFetch('/api/companies?include_inactive=0')
      const json = await res.json()
      setCompanies(json.data || [])
    } catch {}
  }

  async function loadTemplates() {
    setLoading(true)
    try {
      const url = companyFilter
        ? `/api/role-templates?company_key=${encodeURIComponent(companyFilter)}&include_inactive=1`
        : '/api/role-templates?include_inactive=1'
      const res = await authedFetch(url)
      const json = await res.json()
      if (json._migration_pending) setMigrationPending(true)
      setTemplates(json.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCompanies() }, [])
  useEffect(() => { loadTemplates() }, [companyFilter])

  return (
    <div style={{ padding: 24 }}>
      {/* 상단 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.50)', marginBottom: 4 }}>
            회사 × 역할 페이지 권한 묶음 · admin 전용
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>
            역할 템플릿 — {templates.length}개
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            padding: '10px 16px', background: '#3b6eb5', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + 템플릿 추가
        </button>
      </div>

      {/* 회사 필터 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setCompanyFilter('')}
          style={chipStyle(companyFilter === '')}
        >전체</button>
        {companies.map(c => (
          <button
            key={c.id}
            onClick={() => setCompanyFilter(c.company_key || '')}
            style={chipStyle(companyFilter === c.company_key)}
          >
            {c.label || c.name}
          </button>
        ))}
      </div>

      {migrationPending && (
        <div style={{
          padding: 12, marginBottom: 12, borderRadius: 8,
          background: 'rgba(245,158,11,0.10)', color: '#92400e', fontSize: 13,
        }}>
          ⚠ 마이그레이션 미적용 — <code>migrations/2026-05-28_pr_hr_16_role_templates.sql</code> 실행 필요
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(0,0,0,0.50)' }}>로딩…</div>
      ) : templates.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(0,0,0,0.50)' }}>템플릿 없음</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              expanded={expanded === t.id}
              onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
              onApply={() => setApplyTarget(t)}
              onReload={loadTemplates}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddTemplateModal
          companies={companies}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadTemplates() }}
        />
      )}

      {applyTarget && (
        <ApplyTemplateModal
          template={applyTarget}
          onClose={() => setApplyTarget(null)}
        />
      )}
    </div>
  )
}

// ─── 템플릿 카드 (펼쳐서 페이지 권한 편집) ────────────────────────────
function TemplateCard({ template, expanded, onToggle, onApply, onReload }: {
  template: Template
  expanded: boolean
  onToggle: () => void
  onApply: () => void
  onReload: () => void
}) {
  const [pages, setPages] = useState<PagePerm[]>([])
  const [menus, setMenus] = useState<MenuEntry[]>([])
  const [groups, setGroups] = useState<MenuGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!expanded) return
    setLoading(true)
    Promise.all([
      authedFetch(`/api/role-templates/${template.id}`).then(r => r.json()),
      authedFetch('/api/menus?for=permission').then(r => r.json()),
    ]).then(([tplJson, menuJson]) => {
      const tplPages: PagePerm[] = tplJson.data?.pages || []
      const allMenus: MenuEntry[] = menuJson.data?.menus || []
      const grps: MenuGroup[] = menuJson.data?.groups || []
      // 메뉴 path 누락 시 디폴트 전체 false (사용자가 트리에서 체크)
      const merged: PagePerm[] = allMenus.map(m => {
        const found = tplPages.find(p => p.page_path === m.path)
        return found || {
          page_path: m.path,
          can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all',
        }
      })
      setPages(merged)
      setMenus(allMenus)
      setGroups(grps)
      setLoading(false)
    })
  }, [expanded, template.id])

  const grouped = useMemo(() => {
    const map = new Map<string, MenuEntry[]>()
    menus.forEach(m => {
      if (!map.has(m.group)) map.set(m.group, [])
      map.get(m.group)!.push(m)
    })
    return map
  }, [menus])

  function togglePerm(path: string, key: keyof PagePerm) {
    setPages(prev => prev.map(p => p.page_path === path ? { ...p, [key]: !p[key] } : p))
  }

  async function save() {
    setSaving(true)
    try {
      // 적어도 하나의 권한 있는 페이지만 저장
      const filtered = pages.filter(p => p.can_view || p.can_create || p.can_edit || p.can_delete)
      const res = await authedFetch(`/api/role-templates/${template.id}`, {
        method: 'PUT',
        body: JSON.stringify({ pages: filtered }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(`저장 실패: ${json.error || res.status}`)
        return
      }
      onReload()
    } finally { setSaving(false) }
  }

  async function del() {
    if (!confirm(`템플릿 "${template.label}" 삭제? (페이지 권한도 모두 삭제됨)`)) return
    const res = await authedFetch(`/api/role-templates/${template.id}`, { method: 'DELETE' })
    if (res.ok) onReload()
  }

  return (
    <div style={{ ...GLASS_L4, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onToggle} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 16, color: 'rgba(0,0,0,0.50)',
        }}>{expanded ? '▼' : '▶'}</button>
        <code style={{
          padding: '2px 8px', background: 'rgba(99,102,241,0.10)',
          color: '#4f46e5', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap',
        }}>{template.company_key}</code>
        <code style={{
          padding: '2px 8px', background: TINT_PRIMARY_10,
          color: '#3b6eb5', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap',
        }}>{template.role_key}</code>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{template.label}</div>
          {template.description && (
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.50)', marginTop: 2 }}>{template.description}</div>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.50)', whiteSpace: 'nowrap' }}>
          {template.page_count} 페이지
        </span>
        <button onClick={onApply} style={{
          padding: '6px 12px', background: 'rgba(34,197,94,0.10)', color: '#15803d',
          border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>적용 →</button>
        <button onClick={del} style={{
          padding: '6px 10px', background: 'rgba(239,68,68,0.08)', color: '#dc2626',
          border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer',
        }}>삭제</button>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'rgba(0,0,0,0.50)' }}>로딩…</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.50)' }}>
                  각 페이지의 권한 체크 → 저장 → 「적용」 버튼으로 직원에 일괄 부여
                </div>
                <button onClick={save} disabled={saving} style={{
                  padding: '6px 14px', background: '#3b6eb5', color: '#fff',
                  border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                  {saving ? '저장 중…' : '권한 묶음 저장'}
                </button>
              </div>
              {groups.map(g => {
                const items = grouped.get(g.id) || []
                if (items.length === 0) return null
                return (
                  <div key={g.id} style={{ marginBottom: 12 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.60)',
                      padding: '6px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: 4,
                    }}>{g.label}</div>
                    <table style={{ width: '100%', fontSize: 12, marginTop: 4 }}>
                      <thead>
                        <tr style={{ color: 'rgba(0,0,0,0.50)' }}>
                          <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500 }}>페이지</th>
                          <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 500, width: 60 }}>view</th>
                          <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 500, width: 60 }}>create</th>
                          <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 500, width: 60 }}>edit</th>
                          <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 500, width: 60 }}>delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(m => {
                          const p = pages.find(pp => pp.page_path === m.path)
                          if (!p) return null
                          return (
                            <tr key={m.path} style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                              <td style={{ padding: '4px 8px', color: '#1a1a1a' }}>
                                {m.displayName || m.name}
                                <code style={{ marginLeft: 8, fontSize: 10, color: 'rgba(0,0,0,0.40)' }}>{m.path}</code>
                              </td>
                              <td style={{ textAlign: 'center' }}><input type="checkbox" checked={p.can_view} onChange={() => togglePerm(m.path, 'can_view')} /></td>
                              <td style={{ textAlign: 'center' }}><input type="checkbox" checked={p.can_create} onChange={() => togglePerm(m.path, 'can_create')} /></td>
                              <td style={{ textAlign: 'center' }}><input type="checkbox" checked={p.can_edit} onChange={() => togglePerm(m.path, 'can_edit')} /></td>
                              <td style={{ textAlign: 'center' }}><input type="checkbox" checked={p.can_delete} onChange={() => togglePerm(m.path, 'can_delete')} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 템플릿 추가 모달 ────────────────────────────────────────────
function AddTemplateModal({ companies, onClose, onSaved }: {
  companies: Company[]
  onClose: () => void
  onSaved: () => void
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [roleKey, setRoleKey] = useState('staff')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState(100)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (!companyId || !roleKey || !label) {
      setError('회사 + role_key + 라벨 필수')
      return
    }
    setSaving(true)
    try {
      const res = await authedFetch('/api/role-templates', {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId, role_key: roleKey, label, description, sort_order: sortOrder }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || `에러 ${res.status}`)
        return
      }
      onSaved()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={modalBg}>
      <div style={{ ...GLASS_L4, padding: 24, width: 440 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>+ 역할 템플릿 추가</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.60)', marginBottom: 4 }}>회사 *</div>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={inputStyle}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.label || c.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.60)', marginBottom: 4 }}>role_key * (예: admin/manager/staff)</div>
            <input value={roleKey} onChange={(e) => setRoleKey(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.60)', marginBottom: 4 }}>라벨 *</div>
            <input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.60)', marginBottom: 4 }}>설명</div>
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.60)', marginBottom: 4 }}>정렬 순서</div>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} style={inputStyle} />
          </div>
        </div>
        {error && <div style={{ marginTop: 12, padding: 8, background: 'rgba(239,68,68,0.10)', color: '#dc2626', borderRadius: 4, fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={btnSecondary}>취소</button>
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── 적용 모달 (직원 선택 → 일괄 적용) ─────────────────────────────
function ApplyTemplateModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const [employees, setEmployees] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'replace' | 'merge'>('replace')
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    authedFetch(`/api/employees?company_key=${template.company_key || ''}`)
      .then(r => r.json())
      .then(json => {
        setEmployees(json.data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [template])

  const filtered = useMemo(() => {
    if (!filter) return employees
    const f = filter.toLowerCase()
    return employees.filter(e =>
      String(e.name || '').toLowerCase().includes(f) ||
      String(e.email || '').toLowerCase().includes(f) ||
      String(e.department || '').toLowerCase().includes(f)
    )
  }, [employees, filter])

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(e => e.id)))
  }

  async function apply() {
    if (selected.size === 0) return alert('직원을 선택하세요')
    setApplying(true)
    setResult(null)
    try {
      const res = await authedFetch(`/api/role-templates/${template.id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: Array.from(selected), mode }),
      })
      const json = await res.json()
      setResult(json)
    } catch (e: any) {
      setResult({ error: String(e?.message || e) })
    } finally { setApplying(false) }
  }

  return (
    <div style={modalBg}>
      <div style={{ ...GLASS_L4, padding: 24, width: 600, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.50)' }}>적용 — {template.company_key} · {template.role_key}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{template.label}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{
          padding: 10, background: TINT_PRIMARY_05, color: COLORS.primary,
          borderRadius: 6, fontSize: 12, marginBottom: 12,
        }}>
          ⓘ 선택한 직원의 페이지 권한 — <b>{mode === 'replace' ? '템플릿 권한으로 교체' : '템플릿 권한 추가 (OR 합치기)'}</b>.
          기존 다른 페이지 권한은 보존됨.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> 교체 (replace)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> 합치기 (merge)
          </label>
        </div>

        <input
          placeholder="이름 / 이메일 / 부서 검색"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ ...inputStyle, marginBottom: 8 }}
        />

        <div style={{
          maxHeight: 320, overflow: 'auto',
          border: '1px solid rgba(0,0,0,0.06)', borderRadius: 6,
        }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'rgba(0,0,0,0.50)' }}>로딩…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'rgba(0,0,0,0.50)' }}>직원 없음</div>
          ) : (
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.03)' }}>
                  <th style={{ padding: 8, textAlign: 'center', width: 40 }}>
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                  </th>
                  <th style={{ padding: 8, textAlign: 'left' }}>이름</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>이메일</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>부서</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={() => {
                          const ns = new Set(selected)
                          if (ns.has(e.id)) ns.delete(e.id); else ns.add(e.id)
                          setSelected(ns)
                        }}
                      />
                    </td>
                    <td style={{ padding: 8, fontWeight: 600 }}>{e.name || '-'}</td>
                    <td style={{ padding: 8, color: 'rgba(0,0,0,0.50)' }}>{e.email || '-'}</td>
                    <td style={{ padding: 8, color: 'rgba(0,0,0,0.50)' }}>{e.department || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {result && (
          <div style={{
            marginTop: 12, padding: 12,
            background: result.error ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
            color: result.error ? '#dc2626' : '#15803d',
            borderRadius: 6, fontSize: 13,
          }}>
            {result.error ? `❌ ${result.error}` : (
              <>
                ✅ 적용 완료 — 성공 {result.data?.applied || 0} 건 / 건너뜀 {result.data?.skipped || 0} 건
                {result.data?.errors?.length > 0 && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer' }}>에러 {result.data.errors.length} 건</summary>
                    <ul style={{ marginTop: 4, paddingLeft: 20, fontSize: 12 }}>
                      {result.data.errors.slice(0, 5).map((e: string, i: number) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.50)' }}>선택 {selected.size}명</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnSecondary}>닫기</button>
            <button onClick={apply} disabled={applying || selected.size === 0} style={btnPrimary}>
              {applying ? '적용 중…' : `${selected.size}명에 적용`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 스타일 ────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  border: '1px solid rgba(0,0,0,0.10)', borderRadius: 6, background: '#fff',
}
const btnPrimary: React.CSSProperties = {
  padding: '8px 16px', background: '#3b6eb5', color: '#fff', border: 'none',
  borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  padding: '8px 16px', background: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.70)',
  border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
}
const modalBg: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  background: active ? '#3b6eb5' : 'rgba(0,0,0,0.05)',
  color: active ? '#fff' : 'rgba(0,0,0,0.70)',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: active ? 600 : 400,
  cursor: 'pointer',
})

'use client'
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, pillStyle } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'

// ═══════════════════════════════════════════════════════════════
// 위치 코드 관리 페이지 (admin only)
// /admin/locations
// ═══════════════════════════════════════════════════════════════

const CATEGORY_META: Record<string, { label: string; emoji: string; tone: 'info' | 'success' | 'warning' | 'neutral' | 'primary' }> = {
  garage:   { label: '차고지',   emoji: '🅿️', tone: 'info' },
  branch:   { label: '지점',     emoji: '🏢', tone: 'success' },
  repair:   { label: '정비/수리', emoji: '🔧', tone: 'warning' },
  partner:  { label: '협력사',   emoji: '🤝', tone: 'primary' },
  customer: { label: '고객',     emoji: '👤', tone: 'neutral' },
  other:    { label: '기타',     emoji: '📍', tone: 'neutral' },
}

type Location = {
  id: string
  code: string
  label: string
  address: string | null
  phone: string | null
  category: string
  sort_order: number
  active: number | boolean
  notes: string | null
}

export default function LocationsAdminPage() {
  const [list, setList] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { json } = await fetchWithAuth(`/api/locations?includeInactive=${showInactive}`)
    if (json?.data) setList(json.data)
    setLoading(false)
  }, [showInactive])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditing({
      id: '', code: '', label: '', address: '', phone: '',
      category: 'garage', sort_order: 100, active: 1, notes: '',
    } as any)
    setShowForm(true)
  }

  const openEdit = (loc: Location) => {
    setEditing({ ...loc })
    setShowForm(true)
  }

  const remove = async (loc: Location) => {
    if (!confirm(`「${loc.label}」 위치를 비활성화할까요?\n(실제 삭제 X — 다시 활성화 가능)`)) return
    const { ok, json } = await fetchWithAuth(`/api/locations?id=${loc.id}`, { method: 'DELETE' })
    if (ok) await load()
    else alert(`실패: ${json?.error}`)
  }

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>
          📍 위치 코드 관리
        </h1>
        <p style={{ fontSize: 12, color: COLORS.textSecondary }}>
          차고지, 지점, 정비소, 협력사 등 차량 위치를 표준 코드로 관리합니다. 탁송 요청과 차량관리에서 드롭다운으로 사용됩니다.
        </p>
      </div>

      {/* 액션 바 */}
      <div style={{
        ...GLASS.L3, borderRadius: 12, padding: 12, marginBottom: 12,
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: COLORS.textSecondary, cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          비활성 포함
        </label>
        <span style={{ flex: 1 }} />
        <button onClick={openNew} style={{
          padding: '8px 16px', fontSize: 13, fontWeight: 700,
          background: COLORS.primary, color: '#fff', border: 'none',
          borderRadius: 8, cursor: 'pointer',
        }}>
          + 위치 추가
        </button>
      </div>

      {/* 리스트 */}
      {loading && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 40, textAlign: 'center', color: COLORS.textMuted }}>
          불러오는 중...
        </div>
      )}
      {!loading && list.length === 0 && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📍</div>
          <div>등록된 위치 코드가 없습니다</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>+ 위치 추가 버튼으로 시작하세요</div>
        </div>
      )}
      {!loading && list.length > 0 && (
        <div style={{ ...GLASS.L4, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(241,245,249,0.6)', color: '#475569', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>코드</th>
                <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>라벨</th>
                <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>분류</th>
                <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>주소</th>
                <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>연락처</th>
                <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>정렬</th>
                <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>상태</th>
                <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {list.map(loc => {
                const cm = CATEGORY_META[loc.category] || CATEGORY_META.other
                const isActive = !!Number(loc.active)
                return (
                  <tr key={loc.id} style={{ borderTop: '1px solid rgba(0,0,0,0.05)', opacity: isActive ? 1 : 0.5 }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: COLORS.textPrimary }}>{loc.code}</td>
                    <td style={{ padding: '10px 12px', color: COLORS.textPrimary, fontWeight: 600 }}>{loc.label}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...pillStyle(cm.tone), fontSize: 11 }}>
                        {cm.emoji} {cm.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: COLORS.textSecondary, fontSize: 12 }}>{loc.address || '—'}</td>
                    <td style={{ padding: '10px 12px', color: COLORS.textSecondary, fontSize: 12 }}>{loc.phone || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: COLORS.textMuted, fontVariantNumeric: 'tabular-nums' }}>{loc.sort_order}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {isActive
                        ? <span style={{ ...pillStyle('success'), fontSize: 11 }}>활성</span>
                        : <span style={{ ...pillStyle('neutral'), fontSize: 11 }}>비활성</span>
                      }
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button onClick={() => openEdit(loc)} style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                        background: 'rgba(59,130,246,0.1)', color: '#1d4ed8',
                        border: '1px solid rgba(59,130,246,0.35)', cursor: 'pointer', marginRight: 4,
                      }}>편집</button>
                      {isActive && (
                        <button onClick={() => remove(loc)} style={{
                          padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                          background: 'rgba(239,68,68,0.1)', color: '#b91c1c',
                          border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer',
                        }}>비활성</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 폼 모달 */}
      {showForm && editing && (
        <LocationForm
          loc={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { setShowForm(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ─── 위치 폼 모달 ────────────────────────────────────────────
function LocationForm({ loc, onClose, onSaved }: { loc: Location; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ...loc })
  const [saving, setSaving] = useState(false)
  const isNew = !loc.id

  const setF = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  const save = async () => {
    if (!form.code || !form.label) { alert('코드, 라벨 필수'); return }
    setSaving(true)
    try {
      const url = isNew ? '/api/locations' : `/api/locations?id=${form.id}`
      const method = isNew ? 'POST' : 'PATCH'
      const body = {
        code: form.code, label: form.label,
        address: form.address || null,
        phone: form.phone || null,
        category: form.category,
        sort_order: Number(form.sort_order) || 100,
        active: !!Number(form.active),
        notes: form.notes || null,
      }
      const { ok, json } = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (ok) onSaved()
      else alert(`저장 실패: ${json?.error}`)
    } finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, borderRadius: 16, padding: 20,
        maxWidth: 500, width: '90%', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: COLORS.textPrimary }}>
          {isNew ? '➕ 위치 추가' : '✏️ 위치 편집'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="코드 *" hint="영대문자/숫자/_ (예: HQ)">
            <input value={form.code} onChange={(e) => setF('code', e.target.value.toUpperCase())} disabled={!isNew}
              style={inputStyle} placeholder="HQ" />
          </Field>
          <Field label="라벨 *">
            <input value={form.label} onChange={(e) => setF('label', e.target.value)}
              style={inputStyle} placeholder="본사 차고" />
          </Field>
          <Field label="분류">
            <select value={form.category} onChange={(e) => setF('category', e.target.value)} style={inputStyle}>
              {Object.entries(CATEGORY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.emoji} {v.label}</option>
              ))}
            </select>
          </Field>
          <Field label="정렬 순서">
            <input type="number" value={form.sort_order} onChange={(e) => setF('sort_order', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="주소" full>
            <input value={form.address || ''} onChange={(e) => setF('address', e.target.value)}
              style={inputStyle} placeholder="서울 송파구 ..." />
          </Field>
          <Field label="대표 연락처">
            <input value={form.phone || ''} onChange={(e) => setF('phone', e.target.value)}
              style={inputStyle} placeholder="010-XXXX-XXXX" />
          </Field>
          <Field label="활성">
            <select value={Number(form.active)} onChange={(e) => setF('active', Number(e.target.value))} style={inputStyle}>
              <option value={1}>활성</option>
              <option value={0}>비활성</option>
            </select>
          </Field>
          <Field label="메모" full>
            <input value={form.notes || ''} onChange={(e) => setF('notes', e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            background: 'rgba(0,0,0,0.05)', color: COLORS.textSecondary,
            border: 'none', borderRadius: 8, cursor: 'pointer',
          }}>취소</button>
          <button onClick={save} disabled={saving} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 700,
            background: COLORS.primary, color: '#fff',
            border: 'none', borderRadius: 8, cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}>{saving ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13,
  borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`,
  background: 'rgba(255,255,255,0.7)', color: COLORS.textPrimary,
}

function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? 'span 2' : 'auto' }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

'use client'

/**
 * AssetRegisterModal — 자산 등록/편집 모달
 *
 * 등록(create): asset 없이 진입 → POST /api/ride-assets
 * 편집(edit):   asset 받아서 진입 → PATCH /api/ride-assets/[id]
 *
 * 자산코드는 등록 시 서버가 자동 생성 (트랜잭션 — 카테고리 next_seq 증가).
 */
import { useEffect, useState } from 'react'
import { getStoredToken } from '@/lib/auth-client'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

export interface AssetForModal {
  id: string
  asset_code: string
  category_id: string
  name: string
  acquired_at: string | null
  acquired_cost: string | null
  status: string
  assigned_user_id: string | null
  location: string | null
  notes: string | null
  disposed_reason?: string | null
}

interface Category {
  id: string
  code: string
  name: string
  emoji: string | null
}

interface UserOption { id: string; name: string }

interface Props {
  open: boolean
  asset?: AssetForModal | null
  categories: Category[]
  users: UserOption[]
  onClose: () => void
  onSaved: () => void
}

export default function AssetRegisterModal({ open, asset, categories, users, onClose, onSaved }: Props) {
  const isEdit = !!asset
  const [categoryId, setCategoryId] = useState('')
  const [name, setName] = useState('')
  const [acquiredAt, setAcquiredAt] = useState('')
  const [acquiredCost, setAcquiredCost] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('active')
  const [disposedReason, setDisposedReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (asset) {
      setCategoryId(asset.category_id)
      setName(asset.name)
      setAcquiredAt(asset.acquired_at ? String(asset.acquired_at).slice(0, 10) : '')
      setAcquiredCost(asset.acquired_cost || '')
      setAssignedUserId(asset.assigned_user_id || '')
      setLocation(asset.location || '')
      setNotes(asset.notes || '')
      setStatus(asset.status || 'active')
      setDisposedReason(asset.disposed_reason || '')
    } else {
      setCategoryId(categories[0]?.id || '')
      setName('')
      setAcquiredAt('')
      setAcquiredCost('')
      setAssignedUserId('')
      setLocation('')
      setNotes('')
      setStatus('active')
      setDisposedReason('')
    }
    setErr(null)
  }, [open, asset, categories])

  if (!open) return null

  async function handleSave() {
    setErr(null)
    setSaving(true)
    try {
      const token = getStoredToken()
      const url = isEdit ? `/api/ride-assets/${asset!.id}` : '/api/ride-assets'
      const method = isEdit ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = {
        category_id: categoryId || null,
        name: name.trim(),
        acquired_at: acquiredAt || null,
        acquired_cost: acquiredCost ? acquiredCost.replace(/,/g, '') : null,
        location: location.trim() || null,
        notes: notes || null,
      }
      if (isEdit) {
        body.status = status
        if (status === 'disposed') body.disposed_reason = disposedReason.trim() || null
        // assigned_user_id 는 /assign 엔드포인트로 처리 — 등록 모달에서는 신규 등록만
      } else {
        if (assignedUserId) body.assigned_user_id = assignedUserId
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErr(json.error || `HTTP ${res.status}`)
        return
      }

      // 편집 모드 — 매칭 사용자 변경됐다면 별도 호출
      if (isEdit && asset && (asset.assigned_user_id || '') !== assignedUserId) {
        await fetch(`/api/ride-assets/${asset.id}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ user_id: assignedUserId || null }),
        })
      }

      onSaved()
      onClose()
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 36, 64, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...GLASS.L4, borderRadius: 16,
          width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>
            {isEdit ? `📝 자산 편집 — ${asset?.asset_code}` : '➕ 자산 등록'}
          </h3>
          <button onClick={onClose} style={{ ...BTN.sm, background: 'transparent', color: COLORS.textSecondary, border: 'none', cursor: 'pointer' }}>× 닫기</button>
        </div>

        {err && (
          <div style={{
            padding: 10, borderRadius: 8, marginBottom: 12,
            background: 'rgba(239,68,68,0.08)', color: COLORS.danger, fontSize: 12,
          }}>
            ❗ {err}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="카테고리 *">
            <select
              value={categoryId} onChange={e => setCategoryId(e.target.value)}
              style={inputStyle}
            >
              <option value="">선택...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name} ({c.code})</option>
              ))}
            </select>
          </Field>

          <Field label="자산명 *">
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="예: ThinkPad X1 Carbon Gen11"
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="취득일">
              <input type="date" value={acquiredAt} onChange={e => setAcquiredAt(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="취득가 (원)">
              <input
                type="text" value={acquiredCost} onChange={e => setAcquiredCost(e.target.value)}
                placeholder="예: 2,500,000"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="매칭 사용자">
            <select
              value={assignedUserId}
              onChange={e => setAssignedUserId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— 공통 자산 (미할당) —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>

          <Field label="위치">
            <input
              type="text" value={location} onChange={e => setLocation(e.target.value)}
              placeholder="예: 3F 개발팀 / 본사 차고지"
              style={inputStyle}
            />
          </Field>

          <Field label="메모">
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} placeholder="자유 메모"
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </Field>

          {isEdit && (
            <>
              <Field label="상태">
                <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
                  <option value="active">🟢 운영 중</option>
                  <option value="repair">🟡 정비/수리</option>
                  <option value="disposed">⚫ 처분</option>
                  <option value="lost">🔴 분실</option>
                </select>
              </Field>
              {status === 'disposed' && (
                <Field label="처분 사유">
                  <input
                    type="text" value={disposedReason} onChange={e => setDisposedReason(e.target.value)}
                    placeholder="예: 매각 / 폐기 / 분실"
                    style={inputStyle}
                  />
                </Field>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose}
            style={{ ...BTN.md, background: 'transparent', color: COLORS.textSecondary, border: `1px solid ${COLORS.borderSubtle}`, cursor: 'pointer' }}
            disabled={saving}
          >취소</button>
          <button onClick={handleSave}
            style={{ ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer', opacity: (saving || !name.trim() || !categoryId) ? 0.5 : 1 }}
            disabled={saving || !name.trim() || !categoryId}
          >
            {saving ? '저장 중...' : (isEdit ? '저장' : '등록')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  ...GLASS.L1,
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
  color: COLORS.textPrimary,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

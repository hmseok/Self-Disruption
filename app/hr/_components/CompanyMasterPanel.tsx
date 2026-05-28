'use client'
// ═══════════════════════════════════════════════════════════════
// CompanyMasterPanel — /hr 「회사 마스터」 탭 (admin 전용)
//
// PR-HR-15 (2026-05-28, hr 세션) — multi-tenancy 회사 메타 편집.
//   설계: CLAUDE.md § PR-HR-15+16 통합 설계서 v2
//
// 기능:
//   · 회사 목록 (label / short_name / 색상 / is_active / is_internal_host / sort_order)
//   · 「+ 회사 추가」 모달 — 새 회사 row 추가 (마이그 없이)
//   · 인라인 PATCH — 라벨 / 색상 / 비활성화 토글
//
// 의존: /api/companies (GET / POST), /api/companies/[id] (PATCH)
// ═══════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react'
import { auth } from '@/lib/auth-client'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

interface Company {
  id: string
  name: string
  company_key: string | null
  subdomain: string
  label: string | null
  primary_color: string | null
  accent_color: string | null
  short_name: string | null
  is_active: boolean
  is_internal_host: boolean
  sort_order: number
}

// GLASS / COLORS 는 @/app/utils/ui-tokens 의 표준 토큰 사용 (Soft Ice 시스템)
const GLASS_L4 = { ...GLASS.L4, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.04)' } as const
const GLASS_L3 = { ...GLASS.L3, borderRadius: 12 } as const
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

export default function CompanyMasterPanel() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null) // 인라인 편집 중 회사 id
  const [migrationPending, setMigrationPending] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await authedFetch('/api/companies?include_inactive=1')
      const json = await res.json()
      if (json._migration_pending) setMigrationPending(true)
      setCompanies(json.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function patchCompany(id: string, patch: Partial<Company>) {
    try {
      const res = await authedFetch(`/api/companies/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const json = await res.json()
        alert(`수정 실패: ${json.error || res.status}`)
        return
      }
      await load()
    } catch (e: any) {
      alert(`수정 오류: ${e?.message || e}`)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      {/* 상단 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.50)', marginBottom: 4 }}>
            multi-tenancy · admin 전용
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>
            회사 마스터 — {companies.length}개
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            padding: '10px 16px', background: '#3b6eb5', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + 회사 추가
        </button>
      </div>

      {migrationPending && (
        <div style={{
          ...GLASS_L3, padding: 12, marginBottom: 12,
          borderColor: 'rgba(245,158,11,0.30)', color: '#92400e', fontSize: 13,
        }}>
          ⚠ 마이그레이션 미적용 — <code>migrations/2026-05-28_pr_hr_15_companies_meta.sql</code> 실행 필요
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(0,0,0,0.50)' }}>로딩…</div>
      ) : companies.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(0,0,0,0.50)' }}>회사 데이터 없음</div>
      ) : (
        <div style={{ ...GLASS_L4, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>키</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>이름 / 라벨</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: 600 }}>색상</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: 600 }}>호스트</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: 600 }}>활성</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: 600 }}>순서</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: 600 }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const isEditing = editing === c.id
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                      <code style={{
                        padding: '2px 8px', background: TINT_PRIMARY_10,
                        color: '#3b6eb5', borderRadius: 4, fontSize: 12,
                      }}>
                        {c.company_key || '-'}
                      </code>
                    </td>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{c.label || c.name}</div>
                      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.50)', marginTop: 2 }}>
                        {c.name}{c.short_name ? ` · ${c.short_name}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: 12, textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <span
                          title={`primary: ${c.primary_color || '미설정'}`}
                          style={{
                            display: 'inline-block', width: 20, height: 20, borderRadius: 4,
                            background: c.primary_color || '#e5e7eb',
                            border: '1px solid rgba(0,0,0,0.1)',
                          }}
                        />
                        <span
                          title={`accent: ${c.accent_color || '미설정'}`}
                          style={{
                            display: 'inline-block', width: 20, height: 20, borderRadius: 4,
                            background: c.accent_color || '#e5e7eb',
                            border: '1px solid rgba(0,0,0,0.1)',
                          }}
                        />
                      </div>
                    </td>
                    <td style={{ padding: 12, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {c.is_internal_host ? (
                        <span style={{
                          padding: '2px 8px', background: 'rgba(99,102,241,0.10)',
                          color: '#4f46e5', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        }}>호스트</span>
                      ) : (
                        <span style={{ color: 'rgba(0,0,0,0.30)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: 12, textAlign: 'center' }}>
                      <button
                        onClick={() => patchCompany(c.id, { is_active: !c.is_active } as any)}
                        style={{
                          padding: '4px 10px',
                          background: c.is_active ? 'rgba(34,197,94,0.10)' : 'rgba(0,0,0,0.05)',
                          color: c.is_active ? '#15803d' : 'rgba(0,0,0,0.40)',
                          border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {c.is_active ? '활성' : '비활성'}
                      </button>
                    </td>
                    <td style={{ padding: 12, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {c.sort_order}
                    </td>
                    <td style={{ padding: 12, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => setEditing(isEditing ? null : c.id)}
                        style={{
                          padding: '4px 10px', background: TINT_PRIMARY_10,
                          color: '#3b6eb5', border: 'none', borderRadius: 4,
                          fontSize: 12, cursor: 'pointer',
                        }}
                      >
                        {isEditing ? '닫기' : '편집'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 인라인 편집 패널 */}
      {editing && (() => {
        const c = companies.find(x => x.id === editing)
        if (!c) return null
        return <EditCompanyForm company={c} onClose={() => setEditing(null)} onSave={async (patch) => {
          await patchCompany(c.id, patch)
          setEditing(null)
        }} />
      })()}

      {showAdd && <AddCompanyModal onClose={() => setShowAdd(false)} onSaved={async () => { setShowAdd(false); await load() }} />}
    </div>
  )
}

// ─── 인라인 편집 폼 ────────────────────────────────────────────────
function EditCompanyForm({ company, onClose, onSave }: {
  company: Company
  onClose: () => void
  onSave: (patch: Partial<Company>) => Promise<void>
}) {
  const [label, setLabel] = useState(company.label || '')
  const [short, setShort] = useState(company.short_name || '')
  const [primary, setPrimary] = useState(company.primary_color || '#3b6eb5')
  const [accent, setAccent] = useState(company.accent_color || '#5b8def')
  const [sortOrder, setSortOrder] = useState(company.sort_order)
  const [saving, setSaving] = useState(false)

  return (
    <div style={{ ...GLASS_L4, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>편집 — {company.label || company.name}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="라벨"><input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} /></Field>
        <Field label="짧은 이름"><input value={short} onChange={(e) => setShort(e.target.value)} style={inputStyle} /></Field>
        <Field label="primary 색상">
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer' }} />
            <input value={primary} onChange={(e) => setPrimary(e.target.value)} style={inputStyle} />
          </div>
        </Field>
        <Field label="accent 색상">
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer' }} />
            <input value={accent} onChange={(e) => setAccent(e.target.value)} style={inputStyle} />
          </div>
        </Field>
        <Field label="정렬 순서"><input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} style={inputStyle} /></Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={btnSecondary}>취소</button>
        <button
          onClick={async () => {
            setSaving(true)
            try {
              await onSave({ label, short_name: short, primary_color: primary, accent_color: accent, sort_order: sortOrder } as any)
            } finally { setSaving(false) }
          }}
          disabled={saving}
          style={btnPrimary}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  )
}

// ─── 회사 추가 모달 ────────────────────────────────────────────────
function AddCompanyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '', company_key: '', label: '', primary_color: '#6366f1', accent_color: '#8b5cf6',
    short_name: '', sort_order: 100, is_internal_host: false, subdomain: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (!form.name || !form.company_key) {
      setError('이름 + company_key 필수')
      return
    }
    setSaving(true)
    try {
      const res = await authedFetch('/api/companies', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || `에러 ${res.status}`)
        return
      }
      // 새 컬럼 (label/primary_color 등) 은 메인 세션 POST 미지원 → 즉시 PATCH 로 보강
      if (json.data?.id) {
        await authedFetch(`/api/companies/${json.data.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            label: form.label || form.name,
            primary_color: form.primary_color,
            accent_color: form.accent_color,
            short_name: form.short_name || form.company_key,
            sort_order: form.sort_order,
            is_internal_host: form.is_internal_host,
            company_key: form.company_key,
            subdomain: form.subdomain,
          }),
        })
      }
      onSaved()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ ...GLASS_L4, padding: 24, width: 500, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>+ 회사 추가</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="company_key * (예: NEW1)"><input value={form.company_key} onChange={(e) => setForm({ ...form, company_key: e.target.value.toUpperCase() })} style={inputStyle} /></Field>
          <Field label="짧은 이름"><input value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} style={inputStyle} /></Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="회사 이름 *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} /></Field>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="라벨 (UI 표시)"><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} style={inputStyle} placeholder={form.name} /></Field>
          </div>
          <Field label="primary 색상">
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} style={{ width: 40, height: 36, border: 'none' }} />
              <input value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} style={inputStyle} />
            </div>
          </Field>
          <Field label="accent 색상">
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} style={{ width: 40, height: 36, border: 'none' }} />
              <input value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} style={inputStyle} />
            </div>
          </Field>
          <Field label="subdomain"><input value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value })} style={inputStyle} /></Field>
          <Field label="정렬 순서"><input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} style={inputStyle} /></Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={form.is_internal_host} onChange={(e) => setForm({ ...form, is_internal_host: e.target.checked })} />
              운영 위탁 호스트 (FMI 같은 자체 호스트인 경우만)
            </label>
          </div>
        </div>
        {error && <div style={{ marginTop: 12, padding: 8, background: 'rgba(239,68,68,0.10)', color: '#dc2626', borderRadius: 4, fontSize: 13 }}>{error}</div>}
        <div style={{ marginTop: 12, padding: 10, background: TINT_PRIMARY_05, color: COLORS.primary, borderRadius: 6, fontSize: 12 }}>
          ⓘ 새 company_key 추가 후 <code>lib/company-brand.ts</code> 의 <code>CompanyKey</code> union + COMPANY_BRANDS 도
          코드 동기화 후 deploy 필요. (현재 type 안전성 유지 방침)
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={btnSecondary}>취소</button>
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.60)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

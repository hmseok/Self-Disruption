'use client'
// ═══════════════════════════════════════════════════════════════════
// /RideEmployees/[id] — 직원 상세/편집/토큰 발급
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/CallScheduler/utils/palette'
import { getAuthHeader } from '@/app/utils/auth-client'
import EmployeeForm from '../components/EmployeeForm'
import type { RideEmployee } from '../utils/types'

export const dynamic = 'force-dynamic'

export default function RideEmployeeDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [emp, setEmp] = useState<RideEmployee | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/ride-employees/${id}`, { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      setEmp(json.data as RideEmployee)
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  const handleSave = async (payload: any) => {
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/ride-employees/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      setEmp(json.data)
      setEditing(false)
      setActionMsg({ ok: true, text: '저장되었습니다.' })
    } catch (e: any) { throw e }
    finally { setSaving(false) }
  }

  const issueToken = async () => {
    setSaving(true); setActionMsg(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/ride-employees/${id}/token`, {
        method: 'POST', headers: auth,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '토큰 발급 실패')
      setActionMsg({ ok: true, text: `영구 링크 ${emp?.public_token ? '재' : ''}발급 완료` })
      load()
    } catch (e: any) {
      setActionMsg({ ok: false, text: e?.message || '오류' })
    } finally { setSaving(false) }
  }

  const revokeToken = async () => {
    if (!confirm('영구 링크를 폐기합니다. 직원이 가진 기존 URL이 즉시 만료됩니다. 계속할까요?')) return
    setSaving(true); setActionMsg(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/ride-employees/${id}/token`, {
        method: 'DELETE', headers: auth,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '폐기 실패')
      setActionMsg({ ok: true, text: '영구 링크 폐기됨' })
      load()
    } catch (e: any) {
      setActionMsg({ ok: false, text: e?.message || '오류' })
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!confirm('퇴사 처리합니다 (soft delete — 데이터는 보존). 계속할까요?')) return
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/ride-employees/${id}`, { method: 'DELETE', headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      router.push('/RideEmployees')
    } catch (e: any) {
      setActionMsg({ ok: false, text: e?.message || '오류' })
      setSaving(false)
    }
  }

  const copyTokenUrl = async () => {
    if (!emp?.public_token) return
    const url = `${window.location.origin}/CallScheduler/e/${emp.public_token}`
    try {
      await navigator.clipboard.writeText(url)
      setActionMsg({ ok: true, text: '클립보드에 복사됨' })
    } catch {
      setActionMsg({ ok: false, text: '복사 실패 — 수동 복사하세요' })
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
  }
  if (error || !emp) {
    return (
      <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
        <div style={{ padding: 16, borderRadius: 12, background: COLORS.bgRed,
          border: `1px solid ${COLORS.borderRed}`, color: COLORS.danger }}>
          ❌ {error || '직원을 찾을 수 없습니다.'}
        </div>
        <Link href="/RideEmployees" style={{
          display: 'inline-block', marginTop: 12,
          ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
          border: `1px solid ${COLORS.borderFaint}`, textDecoration: 'none',
        }}>← 목록</Link>
      </div>
    )
  }

  const tokenUrl = emp.public_token ? `/CallScheduler/e/${emp.public_token}` : null

  return (
    <div style={{ padding: '16px 24px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/RideEmployees" style={{ fontSize: 12, color: COLORS.info, textDecoration: 'none' }}>
          ← 직원 목록
        </Link>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 8, flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{
              fontSize: 24, fontWeight: 800, margin: 0,
              color: TONE_TEXT[emp.color_tone] || COLORS.textPrimary,
              background: TONE_BG[emp.color_tone] || 'transparent',
              padding: '4px 12px', borderRadius: 8,
            }}>
              {emp.name}
            </h1>
            {emp.department && (
              <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{emp.department}</span>
            )}
            {emp.position && (
              <span style={{ fontSize: 13, color: COLORS.textMuted }}>{emp.position}</span>
            )}
            {emp.is_active ? (
              <span style={pillStyle('info')}>재직</span>
            ) : (
              <span style={pillStyle('neutral')}>퇴사</span>
            )}
          </div>
          {!editing && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setEditing(true)}
                      style={{
                        ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer',
                      }}>
                ✎ 편집
              </button>
              {emp.is_active && (
                <button type="button" onClick={remove} disabled={saving}
                        style={{
                          ...BTN.sm, background: 'transparent', color: COLORS.danger,
                          border: `1px solid ${COLORS.borderRed}`,
                          cursor: saving ? 'not-allowed' : 'pointer',
                        }}>
                  퇴사 처리
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {actionMsg && (
        <div style={{
          ...GLASS.L3,
          background: actionMsg.ok ? COLORS.bgGreen : COLORS.bgRed,
          border: `1px solid ${actionMsg.ok ? COLORS.borderGreen : COLORS.borderRed}`,
          borderRadius: 8, padding: '8px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: actionMsg.ok ? COLORS.success : COLORS.danger,
          }}>
            {actionMsg.ok ? '✅ ' : '❌ '}{actionMsg.text}
          </div>
          <button onClick={() => setActionMsg(null)} style={{
            background: 'transparent', border: 'none',
            color: COLORS.textMuted, cursor: 'pointer', fontSize: 14,
          }}>×</button>
        </div>
      )}

      {editing ? (
        <EmployeeForm
          initial={emp}
          onSubmit={handleSave}
          onCancel={() => setEditing(false)}
          saving={saving}
          submitLabel="저장"
        />
      ) : (
        <>
          {/* 기본 정보 카드 */}
          <div style={{ ...GLASS.L4, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 10 }}>
              기본 정보
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <Info label="고용 형태" value={emp.employment_type} />
              <Info label="입사일" value={emp.hire_date} />
              <Info label="전화번호" value={emp.phone} />
              <Info label="이메일" value={emp.email} />
              <Info label="그룹 (콜센터 분류)" value={emp.group_label} />
              <Info label="색상 토큰" value={emp.color_tone === 'none' ? '없음' : emp.color_tone} />
            </div>
            {emp.memo && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.borderFaint}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, marginBottom: 4 }}>메모</div>
                <div style={{ fontSize: 13, color: COLORS.textPrimary, whiteSpace: 'pre-wrap' }}>{emp.memo}</div>
              </div>
            )}
          </div>

          {/* 영구 링크 발급 카드 */}
          <div style={{
            ...GLASS.L4, borderRadius: 12, padding: 16, marginBottom: 12,
            border: `1px solid ${emp.public_token ? COLORS.borderGreen : COLORS.borderFaint}`,
            background: emp.public_token ? COLORS.bgGreen : undefined,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
              flexWrap: 'wrap', gap: 8,
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
                🔗 직원 영구 링크
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                직원이 본인 시간표를 비로그인으로 열람할 수 있는 영구 URL
              </div>
            </div>
            {tokenUrl ? (
              <>
                <div style={{
                  ...GLASS.L1, borderRadius: 8, padding: '8px 12px',
                  fontSize: 12, color: COLORS.textPrimary, fontFamily: 'monospace',
                  marginBottom: 10, wordBreak: 'break-all',
                }}>
                  {typeof window !== 'undefined' ? window.location.origin : ''}{tokenUrl}
                </div>
                <div style={{
                  display: 'flex', gap: 8, flexWrap: 'wrap',
                  alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                    발급일: {emp.public_token_issued_at ? new Date(emp.public_token_issued_at).toLocaleString('ko-KR') : '-'}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={copyTokenUrl}
                            style={{
                              ...BTN.sm, background: COLORS.primary, color: '#fff',
                              border: 'none', cursor: 'pointer',
                            }}>
                      📋 URL 복사
                    </button>
                    <a href={tokenUrl} target="_blank" rel="noopener noreferrer"
                       style={{
                         ...BTN.sm, background: 'transparent', color: COLORS.info,
                         border: `1px solid ${COLORS.borderBlue}`, textDecoration: 'none',
                       }}>
                      🔍 미리보기
                    </a>
                    <button type="button" onClick={issueToken} disabled={saving}
                            style={{
                              ...BTN.sm, background: 'transparent', color: COLORS.warning,
                              border: `1px solid ${COLORS.borderAmber}`,
                              cursor: saving ? 'not-allowed' : 'pointer',
                            }}>
                      ⟳ 재발급
                    </button>
                    <button type="button" onClick={revokeToken} disabled={saving}
                            style={{
                              ...BTN.sm, background: 'transparent', color: COLORS.danger,
                              border: `1px solid ${COLORS.borderRed}`,
                              cursor: saving ? 'not-allowed' : 'pointer',
                            }}>
                      폐기
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                  아직 발급되지 않음 — 발급 후 직원에게 한 번만 공유하면 영구 사용 가능
                </div>
                <button type="button" onClick={issueToken} disabled={saving}
                        style={{
                          ...BTN.md, background: COLORS.success, color: '#fff', border: 'none',
                          cursor: saving ? 'not-allowed' : 'pointer',
                        }}>
                  + 영구 링크 발급
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? COLORS.textPrimary : COLORS.textMuted, fontWeight: value ? 600 : 400 }}>
        {value || '·'}
      </div>
    </div>
  )
}

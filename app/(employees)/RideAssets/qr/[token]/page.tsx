'use client'

/**
 * /RideAssets/qr/[token] — 모바일 QR 스캔 페이지
 *
 * 스티커 QR 스캔 → 본 페이지 진입.
 * 로그인 필수 (로그인 안 됐으면 /login 으로 redirect).
 *
 * 표시 내용:
 *   - 본인 매칭 자산 OR 권한자 → 전체 정보 + 위치/메모 편집 가능
 *   - 타인 매칭 자산 (일반 사용자) → 사용자명 마스킹, notes 숨김
 *   - 미할당 (공통) 자산 → 전체 정보 (공개 OK)
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

interface QrAsset {
  id: string
  asset_code: string
  category_code: string | null
  category_name: string | null
  category_emoji: string | null
  name: string
  status: string
  assigned_user_id: string | null
  assigned_user_name: string | null
  location: string | null
  notes: string | null
  acquired_at: string | null
}

interface QrMeta {
  is_admin: boolean
  is_owner: boolean
  full_view: boolean
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active: { label: '🟢 운영 중', color: COLORS.success },
  repair: { label: '🟡 정비/수리', color: COLORS.warning },
  disposed: { label: '⚫ 처분', color: COLORS.textMuted },
  lost: { label: '🔴 분실', color: COLORS.danger },
}

export default function RideAssetQrPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params?.token

  const [authChecked, setAuthChecked] = useState(false)
  const [asset, setAsset] = useState<QrAsset | null>(null)
  const [meta, setMeta] = useState<QrMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // 편집 상태
  const [editingLocation, setEditingLocation] = useState(false)
  const [locationInput, setLocationInput] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesInput, setNotesInput] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchAsset = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const jwt = getStoredToken()
    if (!jwt) {
      router.push(`/login?redirect=${encodeURIComponent(`/RideAssets/qr/${token}`)}`)
      return
    }
    try {
      const res = await fetch(`/api/ride-assets/qr/${token}`, {
        headers: { Authorization: `Bearer ${jwt}` },
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErr(json.error || `HTTP ${res.status}`)
        return
      }
      setAsset(json.data)
      setMeta(json.meta)
      setLocationInput(json.data?.location || '')
      setNotesInput(json.data?.notes || '')
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }, [token, router])

  useEffect(() => {
    const user = getStoredUser()
    setAuthChecked(true)
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/RideAssets/qr/${token}`)}`)
      return
    }
    fetchAsset()
  }, [token, fetchAsset, router])

  async function saveLocation() {
    if (!asset) return
    setSaving(true)
    try {
      const jwt = getStoredToken()
      const res = await fetch(`/api/ride-assets/qr/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ location: locationInput }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErr(json.error || `HTTP ${res.status}`)
      } else {
        setAsset({ ...asset, location: locationInput || null })
        setEditingLocation(false)
      }
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function saveNotes() {
    if (!asset) return
    setSaving(true)
    try {
      const jwt = getStoredToken()
      const res = await fetch(`/api/ride-assets/qr/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ notes: notesInput }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErr(json.error || `HTTP ${res.status}`)
      } else {
        setAsset({ ...asset, notes: notesInput || null })
        setEditingNotes(false)
      }
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!authChecked || loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted }}>
        로딩 중...
      </div>
    )
  }

  if (err) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: '40px auto' }}>
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 24,
          border: `1px solid ${COLORS.borderRed}`,
        }}>
          <h2 style={{ marginTop: 0, color: COLORS.danger, fontSize: 16 }}>❗ 오류</h2>
          <p style={{ color: COLORS.textSecondary, fontSize: 13 }}>{err}</p>
          <button onClick={() => router.push('/RideAssets')}
            style={{ ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer', marginTop: 12 }}
          >
            ← 자산 관리로
          </button>
        </div>
      </div>
    )
  }

  if (!asset) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: '40px auto', textAlign: 'center', color: COLORS.textMuted }}>
        자산을 찾을 수 없습니다.
      </div>
    )
  }

  const canEdit = meta?.full_view && (meta.is_owner || meta.is_admin)
  const statusInfo = STATUS_LABEL[asset.status] || { label: asset.status, color: COLORS.textMuted }

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ ...GLASS.L4, borderRadius: 16, padding: 24 }}>
        {/* 헤더 */}
        <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${COLORS.borderSubtle}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.primary }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, letterSpacing: 0.5 }}>
              라이드 자산 · QR
            </span>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, color: COLORS.primary, fontWeight: 700 }}>
            {asset.asset_code}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginTop: 4 }}>
            {asset.category_emoji} {asset.name}
          </div>
        </div>

        {/* 정보 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Info label="카테고리" value={`${asset.category_emoji || ''} ${asset.category_name || ''}`} />
          <Info label="상태" value={<span style={{ color: statusInfo.color, fontWeight: 700 }}>{statusInfo.label}</span>} />
          <Info
            label="사용자"
            value={
              asset.assigned_user_name
                ? <span>👤 {asset.assigned_user_name} {meta?.is_owner && <span style={{ color: COLORS.success, fontWeight: 700 }}>(본인)</span>}</span>
                : <span style={{ color: COLORS.textMuted }}>— 공통 자산 (미할당) —</span>
            }
          />

          {/* 위치 — 본인이면 편집 가능 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>위치</span>
              {canEdit && !editingLocation && (
                <button onClick={() => setEditingLocation(true)}
                  style={{ ...BTN.sm, background: 'transparent', color: COLORS.primary, border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                >
                  ✏️ 편집
                </button>
              )}
            </div>
            {editingLocation ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text" value={locationInput} onChange={e => setLocationInput(e.target.value)}
                  placeholder="위치 입력 (예: 3F 회의실)"
                  style={{ ...GLASS.L1, borderRadius: 6, padding: '6px 8px', fontSize: 13, flex: 1, outline: 'none' }}
                />
                <button onClick={saveLocation} disabled={saving}
                  style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  저장
                </button>
                <button onClick={() => { setEditingLocation(false); setLocationInput(asset.location || '') }}
                  style={{ ...BTN.sm, background: 'transparent', color: COLORS.textMuted, border: `1px solid ${COLORS.borderSubtle}`, cursor: 'pointer' }}
                >
                  취소
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: COLORS.textPrimary }}>
                📍 {asset.location || <span style={{ color: COLORS.textMuted }}>— 미지정 —</span>}
              </div>
            )}
          </div>

          {/* 메모 — 본인이면 편집 가능 + 전체 권한자 */}
          {meta?.full_view && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>메모</span>
                {canEdit && !editingNotes && (
                  <button onClick={() => setEditingNotes(true)}
                    style={{ ...BTN.sm, background: 'transparent', color: COLORS.primary, border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                  >
                    ✏️ 편집
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    value={notesInput} onChange={e => setNotesInput(e.target.value)}
                    rows={3}
                    style={{ ...GLASS.L1, borderRadius: 6, padding: '6px 8px', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setEditingNotes(false); setNotesInput(asset.notes || '') }}
                      style={{ ...BTN.sm, background: 'transparent', color: COLORS.textMuted, border: `1px solid ${COLORS.borderSubtle}`, cursor: 'pointer' }}
                    >
                      취소
                    </button>
                    <button onClick={saveNotes} disabled={saving}
                      style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer' }}
                    >
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: COLORS.textPrimary, whiteSpace: 'pre-wrap' }}>
                  {asset.notes || <span style={{ color: COLORS.textMuted }}>— 메모 없음 —</span>}
                </div>
              )}
            </div>
          )}

          {asset.acquired_at && (
            <Info label="취득일" value={String(asset.acquired_at).slice(0, 10)} />
          )}
        </div>

        {/* 안내 메시지 */}
        {!meta?.full_view && (
          <div style={{
            marginTop: 16, padding: 10, borderRadius: 8,
            background: 'rgba(245, 158, 11, 0.08)',
            border: `1px solid ${COLORS.borderAmber}`,
            fontSize: 12, color: COLORS.warning,
          }}>
            ℹ️ 본인 매칭 자산이 아니므로 일부 정보가 마스킹됩니다.
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: COLORS.textMuted }}>
          <button onClick={() => router.push('/RideAssets')}
            style={{ ...BTN.sm, background: 'transparent', color: COLORS.primary, border: 'none', cursor: 'pointer' }}
          >
            ← 자산 목록
          </button>
          <span>QR: {String(token).slice(0, 8)}...</span>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: COLORS.textPrimary }}>{value}</div>
    </div>
  )
}

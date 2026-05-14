'use client'
import { useEffect, useState } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════
// AddressSearchModal — Daum 우편번호 popup (PR-MTG-V2-Address)
//   · react-daum-postcode dynamic import — SSR 안전
//   · 무료 + API 키 X
//   · 결과 → onSelect(주소 문자열)
// ═══════════════════════════════════════════════════════════════

interface DaumAddressData {
  address: string
  roadAddress?: string
  jibunAddress?: string
  buildingName?: string
  zonecode?: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (formatted: string) => void
}

export default function AddressSearchModal({ open, onClose, onSelect }: Props) {
  const [Postcode, setPostcode] = useState<any>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // dynamic import — SSR 회피
  useEffect(() => {
    if (!open) return
    if (Postcode) return
    import('react-daum-postcode')
      .then(mod => setPostcode(() => mod.default))
      .catch((e) => {
        console.warn('[AddressSearchModal] react-daum-postcode 로드 실패:', e)
        setLoadError('주소 검색 모듈 로드 실패')
      })
  }, [open, Postcode])

  if (!open) return null

  const handleComplete = (data: DaumAddressData) => {
    // 도로명 우선, 없으면 지번. 건물명 있으면 (건물명) 부착
    const base = data.roadAddress || data.address || data.jibunAddress || ''
    const building = data.buildingName ? ` (${data.buildingName})` : ''
    const zone = data.zonecode ? `[${data.zonecode}] ` : ''
    onSelect(`${zone}${base}${building}`.trim())
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, borderRadius: 14, padding: 14,
        width: '100%', maxWidth: 520,
        boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
            🔍 주소 검색 (Daum 우편번호)
          </h2>
          <button onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: COLORS.textMuted, padding: '0 6px',
            }}>×</button>
        </div>
        {loadError && (
          <div style={{
            padding: 12, borderRadius: 8, marginBottom: 8,
            background: 'rgba(239,68,68,0.10)', color: '#b91c1c',
            fontSize: 12, fontWeight: 600, textAlign: 'center',
          }}>⚠ {loadError}</div>
        )}
        {!Postcode && !loadError && (
          <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
            로드 중...
          </div>
        )}
        {Postcode && (
          <div style={{ borderRadius: 8, overflow: 'hidden' }}>
            <Postcode
              onComplete={handleComplete}
              autoClose={false}
              style={{ width: '100%', height: 460 }}
            />
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: COLORS.textMuted, textAlign: 'center' }}>
          💡 우편번호 / 도로명 / 건물명 / 동/리 등 검색. 회의실 / Zoom URL 같은 자유 입력은 직접 입력 사용.
        </div>
      </div>
    </div>
  )
}

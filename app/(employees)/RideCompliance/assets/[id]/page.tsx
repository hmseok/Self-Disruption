'use client'

/**
 * /RideCompliance/assets/[id] — 정보자산 상세 (deep-link)
 *
 * Phase 1.1 — read-only 상세 + 매뉴얼 조항 안내.
 * Phase 1.2+ 예정: 변경 이력 (ride_compliance_asset_logs), 접근권한 매트릭스 편집.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getStoredToken } from '@/lib/auth-client'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

interface Asset {
  id: string
  asset_code: string
  name: string
  asset_type: string
  classification: string
  owner_user_id: string | null
  owner_user_name: string | null
  responsible_user_id: string | null
  responsible_user_name: string | null
  location: string | null
  os_or_spec: string | null
  contains_pii: number
  access_control: string | null
  encryption_status: string
  acquired_at: string | null
  decommissioned_at: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [asset, setAsset] = useState<Asset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const token = getStoredToken()
    fetch(`/api/ride-compliance/assets`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        const list: Asset[] = json.data || []
        const found = list.find(a => a.id === id)
        if (!found) setError(`자산을 찾을 수 없습니다 (id=${id})`)
        setAsset(found || null)
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ padding: 40 }}>로딩 중…</div>
  if (error) return (
    <div style={{ padding: 40, maxWidth: 720 }}>
      <div style={{ ...GLASS.L3, padding: 24, borderRadius: 12, borderLeft: `4px solid ${COLORS.danger}` }}>
        <h2 style={{ margin: 0, color: COLORS.danger }}>❌ {error}</h2>
        <Link href="/RideCompliance" style={{ color: COLORS.primary, marginTop: 12, display: 'inline-block' }}>← 자산 목록으로</Link>
      </div>
    </div>
  )
  if (!asset) return null

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <Link href="/RideCompliance" style={{ color: COLORS.primary, fontSize: 13, marginBottom: 8, display: 'inline-block' }}>← 자산 목록</Link>
      <h1 style={{ margin: '4px 0 16px', fontSize: 20 }}>📦 {asset.asset_code} · {asset.name}</h1>

      <div style={{ ...GLASS.L3, padding: 24, borderRadius: 12 }}>
        <Row label="자산코드" value={asset.asset_code} />
        <Row label="자산명" value={asset.name} />
        <Row label="유형" value={asset.asset_type} />
        <Row label="등급" value={asset.classification} />
        <Row label="개인정보 포함" value={asset.contains_pii === 1 ? '🔐 예' : '아니오'} />
        <Row label="암호화 상태 (제13조)" value={asset.encryption_status} />
        <Row label="접근통제 (제12·14조)" value={asset.access_control || '—'} />
        <Row label="보유자" value={asset.owner_user_name || '—'} />
        <Row label="관리책임자" value={asset.responsible_user_name || '—'} />
        <Row label="위치" value={asset.location || '—'} />
        <Row label="사양/OS" value={asset.os_or_spec || '—'} />
        <Row label="취득일" value={asset.acquired_at || '—'} />
        <Row label="폐기일" value={asset.decommissioned_at || '—'} />
        <Row label="상태" value={asset.status} />
        <Row label="비고" value={asset.notes || '—'} />
        <Row label="등록일시" value={asset.created_at} />
      </div>

      <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12, marginTop: 16, borderLeft: `4px solid ${COLORS.info}` }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>📜 매뉴얼 조항 참조</h3>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8, color: COLORS.textSecondary }}>
          <li>물리적 접근제한 — 제10조 (보호구역 지정, 출입통제, 잠금장치)</li>
          <li>접근권한 관리·인증 — 제12조 (2FA 권고)</li>
          <li>암호화·마스킹 — 제13조</li>
          <li>접근통제 — 제14조 (외부 접속 차단)</li>
          <li>접속기록 위변조 방지 — 제15조 (3년 보관)</li>
          <li>스마트기기 통제 — 제18조 (PC/모바일 자산은 「취급단말기 반출관리 매뉴얼」 참조)</li>
        </ul>
        <p style={{ marginTop: 12, marginBottom: 0, fontSize: 11, color: COLORS.textMuted }}>
          Phase 1.2 예정: 변경 이력 추적 (ride_compliance_asset_logs) + 접근권한 매트릭스 편집.
        </p>
      </div>
    </div>
  )
}

function Row(props: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, padding: '10px 0', borderBottom: `1px solid ${COLORS.borderFaint}`, fontSize: 13 }}>
      <span style={{ color: COLORS.textSecondary, fontWeight: 600 }}>{props.label}</span>
      <span style={{ color: COLORS.textPrimary }}>{props.value}</span>
    </div>
  )
}

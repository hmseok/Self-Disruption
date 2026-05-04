'use client'
// ═══════════════════════════════════════════════════════════════════
// /RideEmployees/new — 신규 직원 등록
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { COLORS } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import EmployeeForm from '../components/EmployeeForm'

export const dynamic = 'force-dynamic'

export default function RideEmployeeNewPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (payload: any) => {
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/ride-employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '등록 실패')
      router.push(`/RideEmployees/${json.data.id}`)
    } catch (e: any) {
      setSaving(false)
      throw e
    }
  }

  return (
    <div style={{ padding: '16px 24px', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/RideEmployees" style={{ fontSize: 12, color: COLORS.info, textDecoration: 'none' }}>
          ← 직원 목록
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: '8px 0 4px' }}>
          신규 직원 등록
        </h1>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>
          라이드 직원 마스터에 추가합니다. 콜센터 부서면 CallScheduler 워커로도 자동 노출됩니다.
        </div>
      </div>
      <EmployeeForm
        onSubmit={handleSubmit}
        onCancel={() => router.push('/RideEmployees')}
        saving={saving}
        submitLabel="등록"
      />
    </div>
  )
}

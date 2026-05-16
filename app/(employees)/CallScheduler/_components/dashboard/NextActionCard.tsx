'use client'
// ═══════════════════════════════════════════════════════════════════
// N-17 — 다음 액션 (월말 다음 달 생성 안내 등)
// ═══════════════════════════════════════════════════════════════════
import { useRouter } from 'next/navigation'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

export default function NextActionCard({
  action,
}: {
  action: {
    type: 'create_next_month' | 'finalize_draft' | 'none'
    msg: string
    next_year: number
    next_month: number
  }
}) {
  const router = useRouter()
  if (action.type === 'none') return null
  const cta = action.type === 'create_next_month' ? '➜ 다음 달 만들기' : '➜ 초안 검토'
  const onClick = () => {
    if (action.type === 'create_next_month') {
      router.push(`/CallScheduler/new?year=${action.next_year}&month=${action.next_month}`)
    } else {
      router.push('/CallScheduler')
    }
  }
  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: '14px 16px', marginBottom: 12,
      border: `1px solid ${COLORS.borderAmber}`,
      background: COLORS.bgAmber,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 18 }}>🎯</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.warning }}>
          다음 액션
        </div>
        <div style={{ fontSize: 12, color: COLORS.textPrimary, marginTop: 2 }}>
          {action.msg}
        </div>
      </div>
      <button onClick={onClick} style={{
        fontSize: 12, fontWeight: 700, padding: '8px 14px',
        background: COLORS.warning, color: '#fff',
        border: 'none', borderRadius: 8, cursor: 'pointer',
      }}>
        {cta}
      </button>
    </div>
  )
}

'use client'
// ═══════════════════════════════════════════════════════════════════
// N-17 — 검토 대기 카드 (직원 요청 / 회피일 / 휴가 / 교체)
// ═══════════════════════════════════════════════════════════════════
import { useRouter } from 'next/navigation'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

export default function PendingReviewsCard({
  pending,
}: {
  pending: { skip: number; leave: number; swap: number; total: number }
}) {
  const router = useRouter()
  const empty = pending.total === 0
  return (
    <div onClick={() => !empty && router.push('/CallScheduler/requests')}
         style={{
           ...GLASS.L4, borderRadius: 12, padding: '14px 16px', marginBottom: 12,
           border: `1px solid ${empty ? COLORS.borderFaint : COLORS.borderViolet}`,
           cursor: empty ? 'default' : 'pointer',
           transition: 'transform 0.12s, box-shadow 0.12s',
         }}
         onMouseEnter={(e) => {
           if (empty) return
           e.currentTarget.style.transform = 'translateY(-1px)'
           e.currentTarget.style.boxShadow = '0 4px 12px rgba(124,58,237,0.15)'
         }}
         onMouseLeave={(e) => {
           e.currentTarget.style.transform = 'none'
           e.currentTarget.style.boxShadow = 'none'
         }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>📥</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
          검토 대기
        </span>
        <span style={{
          fontSize: 16, fontWeight: 900,
          color: empty ? COLORS.textMuted : '#7c3aed',
        }}>
          {pending.total}건
        </span>
        <div style={{ flex: 1 }} />
        {!empty && (
          <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
            검토 →
          </span>
        )}
      </div>
      {!empty && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 10, fontSize: 11,
          color: COLORS.textSecondary,
        }}>
          {pending.swap > 0 && <Pill label={`교체 ${pending.swap}`} />}
          {pending.skip > 0 && <Pill label={`회피일 ${pending.skip}`} />}
          {pending.leave > 0 && <Pill label={`휴가 ${pending.leave}`} />}
        </div>
      )}
      {empty && (
        <div style={{ marginTop: 6, fontSize: 11, color: COLORS.textMuted }}>
          현재 대기 중인 요청 없음
        </div>
      )}
    </div>
  )
}

function Pill({ label }: { label: string }) {
  return (
    <span style={{
      background: COLORS.bgViolet, color: '#7c3aed',
      padding: '3px 10px', borderRadius: 99, fontWeight: 700,
      border: `1px solid ${COLORS.borderViolet}`,
    }}>{label}</span>
  )
}

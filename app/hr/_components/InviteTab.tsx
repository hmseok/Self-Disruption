'use client'

// ═══════════════════════════════════════════════════════════════
// 인사 마스터 — 초대 탭 (2026-08-08 재작성)
// 데이터: /api/member-invite (목록 · 취소). 새 초대는 상단 「+ 직원 초대」 버튼
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react'
import NeuDataTable, { TableColumn } from '@/app/components/NeuDataTable'
import { getAuthHeader } from '@/app/utils/auth-client'
import { COLORS } from '@/app/utils/ui-tokens'
import { Badge, ROLE_META, d10 } from './hr-shared'

const INVITE_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  pending:  { label: '대기', bg: COLORS.bgAmber,     fg: COLORS.warning },
  accepted: { label: '가입 완료', bg: COLORS.bgGreen, fg: COLORS.success },
  canceled: { label: '취소됨', bg: COLORS.borderFaint, fg: COLORS.textDim },
  expired:  { label: '만료', bg: COLORS.borderFaint,  fg: COLORS.textDim },
}

type Props = {
  invitations: any[]
  loading: boolean
  onChanged: () => void
  showToast: (text: string, tone?: 'success' | 'error') => void
}

export default function InviteTab({ invitations, loading, onChanged, showToast }: Props) {
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  const cancelInvite = async (id: string) => {
    if (!confirm('이 초대를 취소하시겠습니까?')) return
    setCancelingId(id)
    try {
      const res = await fetch(`/api/member-invite?id=${id}`, { method: 'DELETE', headers: await getAuthHeader() })
      if (!res.ok) { showToast('초대 취소에 실패했습니다', 'error'); return }
      showToast('초대가 취소되었습니다')
      onChanged()
    } catch {
      showToast('초대 취소 중 오류가 발생했습니다', 'error')
    } finally { setCancelingId(null) }
  }

  const columns: TableColumn<any>[] = [
    {
      key: 'email', label: '이메일', width: '30%',
      sortBy: (inv) => inv.email || '',
      render: (inv) => <span style={{ fontSize: 13, fontWeight: 600 }}>{inv.email}</span>,
    },
    {
      key: 'org', label: '부서 · 직급', width: 160,
      sortBy: (inv) => inv.department?.name || '',
      render: (inv) => (
        <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>
          {[inv.department?.name, inv.position?.name].filter(Boolean).join(' · ') || '—'}
        </span>
      ),
    },
    {
      key: 'role', label: '권한', width: 90, align: 'center',
      sortBy: (inv) => inv.role || '',
      render: (inv) => {
        const m = ROLE_META[inv.role] || ROLE_META.user
        return <Badge label={m.label} bg={m.bg} fg={m.fg} />
      },
    },
    {
      key: 'status', label: '상태', width: 90, align: 'center',
      sortBy: (inv) => inv.status || '',
      render: (inv) => {
        const m = INVITE_STATUS[inv.status] || { label: inv.status, bg: COLORS.borderFaint, fg: COLORS.textSecondary }
        return <Badge label={m.label} bg={m.bg} fg={m.fg} />
      },
    },
    {
      key: 'created', label: '보낸 날짜', width: 110, align: 'right', hideOnMobile: true,
      sortBy: (inv) => inv.created_at || '',
      render: (inv) => <span style={{ fontSize: 12, color: COLORS.textMuted, fontVariantNumeric: 'tabular-nums' }}>{d10(inv.created_at) || '—'}</span>,
    },
    {
      key: 'expires', label: '만료일', width: 110, align: 'right', hideOnMobile: true,
      sortBy: (inv) => inv.expires_at || '',
      render: (inv) => <span style={{ fontSize: 12, color: COLORS.textMuted, fontVariantNumeric: 'tabular-nums' }}>{d10(inv.expires_at) || '—'}</span>,
    },
    {
      key: 'action', label: '', width: 64, align: 'center',
      render: (inv) => inv.status === 'pending' ? (
        <button
          onClick={(e) => { e.stopPropagation(); cancelInvite(inv.id) }}
          disabled={cancelingId === inv.id}
          style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.danger, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
          {cancelingId === inv.id ? '취소 중…' : '취소'}
        </button>
      ) : null,
    },
  ]

  return (
    <NeuDataTable
      columns={columns}
      data={invitations}
      rowKey={(inv) => inv.id}
      loading={loading}
      emptyMessage="대기 중인 초대가 없습니다 — 우측 상단 「+ 직원 초대」로 새 직원을 초대하세요"
      mobileCard={{
        title: (inv) => inv.email,
        subtitle: (inv) => [inv.department?.name, inv.position?.name].filter(Boolean).join(' · '),
        trailing: (inv) => {
          const m = INVITE_STATUS[inv.status] || { label: inv.status, bg: COLORS.borderFaint, fg: COLORS.textSecondary }
          return <Badge label={m.label} bg={m.bg} fg={m.fg} />
        },
      }}
    />
  )
}

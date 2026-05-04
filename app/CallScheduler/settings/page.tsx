'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler/settings — 설정 (시프트 / 워커 / 그룹)
// PR-2I: 그룹 탭 우선, 시프트/워커는 추후
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react'
import Link from 'next/link'
import { COLORS } from '@/app/utils/ui-tokens'
import GroupsTab from './GroupsTab'
import ShiftsTab from './ShiftsTab'

export const dynamic = 'force-dynamic'

type Tab = 'groups' | 'shifts' | 'workers'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('groups')

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/CallScheduler" style={{ fontSize: 12, color: COLORS.info, textDecoration: 'none' }}>
          ← CallScheduler
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: '8px 0 4px' }}>
          ⚙️ CallScheduler 설정
        </h1>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>
          시프트 그룹 · 시프트 마스터 · 워커 활성화
        </div>
      </div>

      {/* 탭 */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${COLORS.borderFaint}`,
        marginBottom: 16, gap: 4,
      }}>
        <TabButton active={tab === 'groups'} onClick={() => setTab('groups')}>
          🧑‍🤝‍🧑 그룹
        </TabButton>
        <TabButton active={tab === 'shifts'} onClick={() => setTab('shifts')}>
          ⏰ 시프트
        </TabButton>
        <TabButton active={tab === 'workers'} onClick={() => setTab('workers')}>
          👥 워커
        </TabButton>
      </div>

      {tab === 'groups' && <GroupsTab />}
      {tab === 'shifts' && <ShiftsTab />}
      {tab === 'workers' && <ComingSoon label="워커 활성화 — RideEmployees 와 연동, 추후 PR" />}
    </div>
  )
}

function TabButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px', fontSize: 13, fontWeight: 700,
        background: 'transparent', border: 'none',
        color: active ? COLORS.primary : COLORS.textSecondary,
        borderBottom: `2px solid ${active ? COLORS.primary : 'transparent'}`,
        cursor: 'pointer', marginBottom: -1,
      }}
    >
      {children}
    </button>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{
      padding: 60, textAlign: 'center', color: COLORS.textMuted, fontSize: 13,
    }}>
      🚧 {label}
    </div>
  )
}

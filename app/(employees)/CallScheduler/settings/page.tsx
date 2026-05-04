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
import WorkersTab from './WorkersTab'
import HolidaysTab from './HolidaysTab'
import LeavesTab from './LeavesTab'

export const dynamic = 'force-dynamic'

type Tab = 'shifts' | 'groups' | 'workers' | 'holidays' | 'leaves'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('shifts')

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
          시간 · 그룹 · 직원 · 회사 휴일(공통) · 직원 휴가(개인)
        </div>
      </div>

      {/* 탭 — 운영 흐름 순서 (시간 → 그룹 → 직원 → 휴일 → 연차) */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${COLORS.borderFaint}`,
        marginBottom: 16, gap: 4, flexWrap: 'wrap',
      }}>
        <TabButton active={tab === 'shifts'} onClick={() => setTab('shifts')}>
          ⏰ 시간 (시프트)
        </TabButton>
        <TabButton active={tab === 'groups'} onClick={() => setTab('groups')}>
          🧑‍🤝‍🧑 그룹
        </TabButton>
        <TabButton active={tab === 'workers'} onClick={() => setTab('workers')}>
          👥 직원 (콜센터)
        </TabButton>
        <TabButton active={tab === 'holidays'} onClick={() => setTab('holidays')}>
          🏖 공휴일 (참고)
        </TabButton>
        <TabButton active={tab === 'leaves'} onClick={() => setTab('leaves')}>
          📋 직원 휴가
        </TabButton>
      </div>

      {tab === 'shifts'   && <ShiftsTab />}
      {tab === 'groups'   && <GroupsTab />}
      {tab === 'workers'  && <WorkersTab />}
      {tab === 'holidays' && <HolidaysTab />}
      {tab === 'leaves'   && <LeavesTab />}
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

// (ComingSoon 컴포넌트 제거 — 모든 탭 구현됨)

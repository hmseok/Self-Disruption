'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler/settings — 설정 (시프트 / 그룹 / 직원 / 휴일 / 휴가)
// URL ?tab=... 으로 직접 진입 가능 (PR-2LL)
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { COLORS } from '@/app/utils/ui-tokens'
import GroupsTab from './GroupsTab'
import ShiftsTab from './ShiftsTab'
import WorkersTab from './WorkersTab'
import HolidaysTab from './HolidaysTab'
import LeavesTab from './LeavesTab'

export const dynamic = 'force-dynamic'

type Tab = 'shifts' | 'groups' | 'workers' | 'holidays' | 'leaves'
const VALID_TABS: Tab[] = ['shifts', 'groups', 'workers', 'holidays', 'leaves']

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>}>
      <SettingsInner />
    </Suspense>
  )
}

function SettingsInner() {
  const sp = useSearchParams()
  const initialTab = (sp?.get('tab') as Tab) || 'shifts'
  const [tab, setTab] = useState<Tab>(VALID_TABS.includes(initialTab) ? initialTab : 'shifts')

  // URL ?tab=... 변경 시 동기화 (헤더 더보기 메뉴에서 직접 진입 시)
  useEffect(() => {
    const t = sp?.get('tab') as Tab
    if (t && VALID_TABS.includes(t) && t !== tab) setTab(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp])

  return (
    <div style={{ padding: '16px 24px'}}>
      {/* N-12 — 자체 헤더 제거 (PageTitle 자동) */}

      {/* N-14 — 운영/설정 분류 (사용자 의도: 워커/그룹도 설정 안)
            상위 SubNav: 대시보드 / 직원 요청 / ⚙ 설정
            본 설정 페이지: 시간 / 그룹 / 워커 / 공휴일 / 휴가 (모든 셋팅) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <SettingsTab active={tab === 'shifts'} onClick={() => setTab('shifts')}>
          🕐 시간 (시프트)
        </SettingsTab>
        <SettingsTab active={tab === 'groups'} onClick={() => setTab('groups')}>
          🚧 그룹
        </SettingsTab>
        <SettingsTab active={tab === 'workers'} onClick={() => setTab('workers')}>
          👥 워커 (직원)
        </SettingsTab>
        <SettingsTab active={tab === 'holidays'} onClick={() => setTab('holidays')}>
          🎌 공휴일 (참고)
        </SettingsTab>
        <SettingsTab active={tab === 'leaves'} onClick={() => setTab('leaves')}>
          💼 직원 휴가
        </SettingsTab>
      </div>

      {tab === 'shifts'   && <ShiftsTab />}
      {tab === 'groups'   && <GroupsTab />}
      {tab === 'workers'  && <WorkersTab />}
      {tab === 'holidays' && <HolidaysTab />}
      {tab === 'leaves'   && <LeavesTab />}
    </div>
  )
}

// N-14 — 검정 pill 패턴 (정산 관리 §4 일관)
function SettingsTab({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 16px', borderRadius: 8,
        fontSize: 13, fontWeight: 700,
        background: active ? '#0f2440' : 'transparent',
        color: active ? '#fff' : '#64748b',
        border: 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

// (ComingSoon 컴포넌트 제거 — 모든 탭 구현됨)

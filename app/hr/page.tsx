'use client'

// ═══════════════════════════════════════════════════════════════
// 인사 마스터 — 2026-08-08 재작성 (rebuild-fresh, 목업 _mockups/hr-redesign.html 확정)
// 단일 회사(FMI) 기준 탭 1단 구조: 직원 / 부서·직급 / 초대 / 프리랜서 / 역할 템플릿
// 직원 클릭 → 우측 드로어 (기본정보 · 급여 설정 · 페이지 권한)
// 데이터: /api/profiles · /api/departments · /api/positions ·
//         /api/member-invite · /api/freelancers (기존 API 그대로 소비)
// ═══════════════════════════════════════════════════════════════

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useApp } from '@/app/context/AppContext'
import { useEmployees } from '@/lib/hooks/useEmployees'
import { getAuthHeader } from '@/app/utils/auth-client'
import { COLORS } from '@/app/utils/ui-tokens'
import InviteModal from '@/app/components/InviteModal'
import EmployeeTab from './_components/EmployeeTab'
import EmployeeDrawer from './_components/EmployeeDrawer'
import OrgTab from './_components/OrgTab'
import InviteTab from './_components/InviteTab'
import FreelancerTab from './_components/FreelancerTab'
import RoleTemplatePanel from './_components/RoleTemplatePanel'
import { Employee, Department, Position, Toast, useToast, btnPrimaryS, btnGhostS, getEmpStatus } from './_components/hr-shared'

const TAB_KEYS = ['employees', 'org', 'invites', 'freelancers', 'roles'] as const
type TabKey = typeof TAB_KEYS[number]

function HrPageInner() {
  const { user, company, role } = useApp()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast, show } = useToast()

  const isManager = role === 'admin' || role === 'master'

  // ── 탭 (URL ?tab= 동기화, 화이트리스트 검증) ──
  const urlTab = searchParams.get('tab')
  const initialTab: TabKey = TAB_KEYS.includes(urlTab as TabKey) ? (urlTab as TabKey) : 'employees'
  const [tab, setTab] = useState<TabKey>(initialTab)
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && TAB_KEYS.includes(t as TabKey) && t !== tab) setTab(t as TabKey)
  }, [searchParams])  // eslint-disable-line react-hooks/exhaustive-deps
  const selectTab = (k: TabKey) => {
    setTab(k)
    router.replace(k === 'employees' ? '/hr' : `/hr?tab=${k}`, { scroll: false })
  }

  // ── 데이터 ──
  const { employees, isLoading: loadingEmployees, mutate: mutateEmployees } = useEmployees()
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [invitations, setInvitations] = useState<any[]>([])
  const [loadingInvites, setLoadingInvites] = useState(false)
  const [freelancers, setFreelancers] = useState<any[]>([])
  const [loadingFreelancers, setLoadingFreelancers] = useState(true)

  const loadOrg = useCallback(async () => {
    const headers = await getAuthHeader()
    const [depRes, posRes] = await Promise.all([
      fetch('/api/departments', { headers }).then(r => r.json()).catch(() => ({})),
      fetch('/api/positions', { headers }).then(r => r.json()).catch(() => ({})),
    ])
    setDepartments(depRes.data || [])
    setPositions(((posRes.data || []) as Position[]).sort((a, b) => (a.level || 0) - (b.level || 0)))
  }, [])

  const loadInvites = useCallback(async () => {
    if (!isManager) return
    setLoadingInvites(true)
    try {
      const res = await fetch('/api/member-invite', { headers: await getAuthHeader() })
      const json = await res.json().catch(() => ({}))
      setInvitations(res.ok ? (json.data || []) : [])
    } catch { setInvitations([]) }
    finally { setLoadingInvites(false) }
  }, [isManager])

  const loadFreelancers = useCallback(async () => {
    setLoadingFreelancers(true)
    try {
      const res = await fetch('/api/freelancers?order=name', { headers: await getAuthHeader() })
      const json = await res.json().catch(() => ({}))
      setFreelancers(json.data || [])
    } catch { setFreelancers([]) }
    finally { setLoadingFreelancers(false) }
  }, [])

  useEffect(() => { loadOrg() }, [loadOrg])
  useEffect(() => { loadInvites() }, [loadInvites])
  useEffect(() => { loadFreelancers() }, [loadFreelancers])

  // ── 드로어 / 초대 모달 ──
  const [selected, setSelected] = useState<Employee | null>(null)
  const [showInvite, setShowInvite] = useState(false)

  const workingCount = useMemo(
    () => employees.filter((e: Employee) => getEmpStatus(e) === 'active').length,
    [employees]
  )
  const pendingInvites = useMemo(() => invitations.filter(i => i.status === 'pending').length, [invitations])
  const activeFreelancers = useMemo(() => freelancers.filter(f => !!f.is_active).length, [freelancers])

  const tabs: { key: TabKey; label: string; count?: number; adminOnly?: boolean; managerOnly?: boolean }[] = [
    { key: 'employees', label: '직원', count: workingCount },
    { key: 'org', label: '부서·직급', count: departments.length + positions.length },
    { key: 'invites', label: '초대', count: pendingInvites, managerOnly: true },
    { key: 'freelancers', label: '프리랜서', count: activeFreelancers },
    { key: 'roles', label: '역할 템플릿', adminOnly: true },
  ]
  const visibleTabs = tabs.filter(t => (!t.adminOnly || role === 'admin') && (!t.managerOnly || isManager))

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, color: COLORS.textPrimary, fontSize: 14 }}>
      {/* 제목줄 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 21, letterSpacing: '-0.02em', fontWeight: 700 }}>인사 마스터</h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 3 }}>
            직원 계정과 부서·직급, 초대, 페이지 권한을 한곳에서 관리합니다
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.push('/hr/payroll')} style={btnGhostS}>급여 운영 열기</button>
          {isManager && (
            <button onClick={() => setShowInvite(true)} style={btnPrimaryS}>+ 직원 초대</button>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${COLORS.borderSubtle}`, marginBottom: 16 }}>
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => selectTab(t.key)}
            style={{
              padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none',
              borderBottom: '2.5px solid', marginBottom: -2,
              borderBottomColor: tab === t.key ? COLORS.primary : 'transparent',
              color: tab === t.key ? COLORS.textPrimary : COLORS.textMuted,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {t.label}
            {t.count !== undefined && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                background: tab === t.key ? '#dbeafe' : '#eef1f5',
                color: tab === t.key ? COLORS.primary : COLORS.textMuted,
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      {tab === 'employees' && (
        <EmployeeTab
          employees={employees}
          departments={departments}
          loading={loadingEmployees}
          onSelect={setSelected}
        />
      )}
      {tab === 'org' && (
        <OrgTab
          departments={departments}
          positions={positions}
          employees={employees}
          onChanged={() => { loadOrg(); mutateEmployees() }}
          showToast={show}
        />
      )}
      {tab === 'invites' && isManager && (
        <InviteTab
          invitations={invitations}
          loading={loadingInvites}
          onChanged={loadInvites}
          showToast={show}
        />
      )}
      {tab === 'freelancers' && (
        <FreelancerTab
          freelancers={freelancers}
          loading={loadingFreelancers}
          onChanged={loadFreelancers}
          showToast={show}
        />
      )}
      {tab === 'roles' && role === 'admin' && <RoleTemplatePanel />}

      {/* 직원 상세 드로어 */}
      {selected && (
        <EmployeeDrawer
          emp={selected}
          meId={user?.uid || null}
          companyId={company?.id || null}
          departments={departments}
          positions={positions}
          onClose={() => setSelected(null)}
          onSaved={() => mutateEmployees()}
          showToast={show}
        />
      )}

      {/* 직원 초대 모달 (공용 컴포넌트) */}
      <InviteModal
        companyName={company?.label || company?.name || '주식회사 에프엠아이'}
        companyId={company?.id || ''}
        isOpen={showInvite}
        onClose={() => setShowInvite(false)}
        onSuccess={() => { setShowInvite(false); loadInvites(); show('초대를 보냈습니다') }}
      />

      <Toast toast={toast} />
    </div>
  )
}

export default function HrPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px 0', textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>불러오는 중…</div>}>
      <HrPageInner />
    </Suspense>
  )
}

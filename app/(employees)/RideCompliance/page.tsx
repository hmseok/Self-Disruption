'use client'

/**
 * /RideCompliance — 라이드 정보보안 (RideCompliance) 메인 대시보드
 *
 * Phase 1.1 — NavTabs 4탭 (대시보드/자산/사고/조직) + DcStatStrip 5 stat.
 * 자산·사고 상세는 sub-route (/RideCompliance/{assets,incidents}/[id]) 로 분리 (하이브리드 [E]).
 *
 * 단일 진실 원본: 라이드케어 「개인정보보호 내부관리계획서 (매뉴얼 통합본)」 V1.0
 *                 RIDE-PMP-2026-001 (시행 2026.05.20).
 * 페르소나: 석호민 부장 (개인정보보호 관리자, 주 사용자).
 *
 * 디자인 규칙:
 *  · Rule 14 — RideVehicleRegistry 동형 (NavTabs + DcStatStrip + NeuDataTable)
 *  · Rule 18 — NeuDataTable 모든 컬럼 sortBy 의무
 *  · Rule 19 — 줄바꿈 최소화 (prose)
 *  · Rule 20 — 결과는 글래스 패널 (alert 최소화)
 *  · Rule 23 — _migration_pending banner graceful fallback
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import { usePermission } from '@/app/hooks/usePermission'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

// ── 버튼 스타일 (BTN 은 size 만 — variant 는 인라인) ──────────────
const btnPrimary: React.CSSProperties = {
  ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`,
  background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`,
  background: 'rgba(255,255,255,0.6)', color: COLORS.textSecondary, cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`,
  background: COLORS.bgRed, color: COLORS.danger, cursor: 'pointer',
}

type TabKey = 'dashboard' | 'assets' | 'incidents' | 'officers'

interface Officer {
  id: string
  user_id: string
  role: string
  display_title: string | null
  business_unit: string | null
  appointed_at: string
  released_at: string | null
  is_active: number
  notes: string | null
  user_name: string | null
  created_at: string
  updated_at: string
}

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

interface Incident {
  id: string
  incident_code: string
  title: string
  incident_type: string
  severity: string
  occurred_at: string | null
  detected_at: string
  notified_at: string | null
  resolved_at: string | null
  reporter_user_id: string | null
  reporter_user_name: string | null
  assignee_user_id: string | null
  assignee_user_name: string | null
  affected_subjects_count: number | null
  cause_summary: string | null
  containment_actions: string | null
  related_asset_id: string | null
  related_asset_code: string | null
  related_asset_name: string | null
  status: string
  retention_until: string | null
  created_at: string
  updated_at: string
}

const ROLE_LABEL: Record<string, { label: string; emoji: string; color: string }> = {
  cpo:           { label: '책임자 (CPO)',   emoji: '👔', color: COLORS.primary },
  manager:       { label: '관리자',         emoji: '🛡️', color: COLORS.info },
  handler:       { label: '취급자',         emoji: '👥', color: COLORS.textSecondary },
  incident_team: { label: '관리팀(사고일선)', emoji: '🚨', color: COLORS.warning },
}

const ASSET_TYPE_LABEL: Record<string, { label: string; emoji: string }> = {
  server:   { label: '서버',         emoji: '🖥️' },
  pc:       { label: 'PC/노트북',    emoji: '💻' },
  document: { label: '문서',         emoji: '📄' },
  storage:  { label: '저장매체',     emoji: '💾' },
  cctv:     { label: 'CCTV',         emoji: '📹' },
  mobile:   { label: '스마트기기',   emoji: '📱' },
  software: { label: '소프트웨어',   emoji: '🧩' },
  network:  { label: '네트워크장비', emoji: '🛜' },
  other:    { label: '기타',         emoji: '📦' },
}

const CLASSIFICATION_LABEL: Record<string, { label: string; color: string }> = {
  public:       { label: '공개',   color: COLORS.success },
  internal:     { label: '내부',   color: COLORS.info },
  confidential: { label: '대외비', color: COLORS.danger },
}

const INCIDENT_TYPE_LABEL: Record<string, { label: string; emoji: string }> = {
  external_hacking:          { label: '외부해킹·악성코드',    emoji: '🦠' },
  internal_leak:             { label: '내부 유출',             emoji: '🚪' },
  unauthorized_modification: { label: '임의 변조·도난·분실',  emoji: '🔧' },
  compliance_violation:      { label: '법규 위반·클레임',      emoji: '⚖️' },
  device_loss:               { label: '단말기 분실',           emoji: '📵' },
  other:                     { label: '기타',                  emoji: '❓' },
}

const SEVERITY_LABEL: Record<string, { label: string; color: string }> = {
  low:      { label: '낮음', color: COLORS.success },
  medium:   { label: '보통', color: COLORS.info },
  high:     { label: '높음', color: COLORS.warning },
  critical: { label: '심각', color: COLORS.danger },
}

const INCIDENT_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  reported:      { label: '접수',         color: COLORS.warning },
  triaging:      { label: '1차 분류',     color: COLORS.info },
  containing:    { label: '긴급조치',     color: COLORS.info },
  notifying:     { label: '정보주체 통지', color: COLORS.warning },
  investigating: { label: '조사 중',      color: COLORS.info },
  resolved:      { label: '종결',         color: COLORS.success },
  closed:        { label: '보존 시작',    color: COLORS.textSecondary },
}

const ASSET_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:   { label: '운영중', color: COLORS.success },
  repair:   { label: '정비',   color: COLORS.warning },
  disposed: { label: '폐기',   color: COLORS.textSecondary },
  lost:     { label: '분실',   color: COLORS.danger },
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  return `${fmtDate(d)} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

/** 24h SLA 잔여 계산 — 매뉴얼 제25조 ① (정보주체 24시간 통지 의무) */
function slaRemainHours(detectedAt: string, notifiedAt: string | null): number | null {
  if (notifiedAt) return null
  const detected = new Date(detectedAt).getTime()
  if (isNaN(detected)) return null
  const elapsed = (Date.now() - detected) / (60 * 60 * 1000)
  return 24 - elapsed
}

export default function RideCompliancePage() {
  const [user, setUser] = useState<{ id?: string; role?: string; name?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const { hasPageAccess } = usePermission()
  const canAccess = user?.role === 'admin' || hasPageAccess('/RideCompliance')

  const [tab, setTab] = useState<TabKey>('dashboard')

  const [officers, setOfficers] = useState<Officer[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [migrationPending, setMigrationPending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 필터 상태
  const [assetTypeFilter, setAssetTypeFilter] = useState('')
  const [assetClassFilter, setAssetClassFilter] = useState('')
  const [assetStatusFilter, setAssetStatusFilter] = useState('')
  const [assetQuery, setAssetQuery] = useState('')

  const [incidentTypeFilter, setIncidentTypeFilter] = useState('')
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState('')
  const [incidentStatusFilter, setIncidentStatusFilter] = useState('')
  const [incidentQuery, setIncidentQuery] = useState('')

  // 모달 상태
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [incidentModalOpen, setIncidentModalOpen] = useState(false)
  const [officerModalOpen, setOfficerModalOpen] = useState(false)

  useEffect(() => {
    setUser(getStoredUser())
    setAuthChecked(true)
  }, [])

  const fetchAll = useMemo(() => async () => {
    if (!canAccess) return
    const token = getStoredToken()
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    try {
      const [ofRes, asRes, inRes] = await Promise.all([
        fetch('/api/ride-compliance/officers', { headers, cache: 'no-store' }),
        fetch('/api/ride-compliance/assets', { headers, cache: 'no-store' }),
        fetch('/api/ride-compliance/incidents', { headers, cache: 'no-store' }),
      ])
      const [ofJ, asJ, inJ] = await Promise.all([ofRes.json(), asRes.json(), inRes.json()])
      setOfficers(ofJ.data || [])
      setAssets(asJ.data || [])
      setIncidents(inJ.data || [])
      const pending = !!(ofJ.meta?._migration_pending || asJ.meta?._migration_pending || inJ.meta?._migration_pending)
      setMigrationPending(pending)
      setLoadError(null)
    } catch (e) {
      setLoadError(String(e))
    }
  }, [canAccess])

  useEffect(() => {
    if (authChecked && canAccess) fetchAll()
  }, [authChecked, canAccess, fetchAll])

  // 필터링 (클라이언트 side — 단순 모듈)
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      if (assetTypeFilter && a.asset_type !== assetTypeFilter) return false
      if (assetClassFilter && a.classification !== assetClassFilter) return false
      if (assetStatusFilter && a.status !== assetStatusFilter) return false
      if (assetQuery && !(`${a.name} ${a.asset_code} ${a.location || ''}`).toLowerCase().includes(assetQuery.toLowerCase())) return false
      return true
    })
  }, [assets, assetTypeFilter, assetClassFilter, assetStatusFilter, assetQuery])

  const filteredIncidents = useMemo(() => {
    return incidents.filter(i => {
      if (incidentTypeFilter && i.incident_type !== incidentTypeFilter) return false
      if (incidentSeverityFilter && i.severity !== incidentSeverityFilter) return false
      if (incidentStatusFilter && i.status !== incidentStatusFilter) return false
      if (incidentQuery && !(`${i.title} ${i.incident_code} ${i.cause_summary || ''}`).toLowerCase().includes(incidentQuery.toLowerCase())) return false
      return true
    })
  }, [incidents, incidentTypeFilter, incidentSeverityFilter, incidentStatusFilter, incidentQuery])

  // DcStatStrip 5 stat
  const stats: StatItem[] = useMemo(() => {
    const totalAssets = assets.length
    const piiAssets = assets.filter(a => a.contains_pii === 1).length
    const openIncidents = incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed').length
    const slaWarn = incidents.filter(i => {
      const r = slaRemainHours(i.detected_at, i.notified_at)
      return r !== null && r < 6
    }).length
    const activeCpoMgr = officers.filter(o => o.is_active === 1 && (o.role === 'cpo' || o.role === 'manager')).length

    const quarterStart = (() => {
      const now = new Date()
      const q = Math.floor(now.getMonth() / 3)
      return new Date(now.getFullYear(), q * 3, 1)
    })()
    const newThisQuarter = assets.filter(a => new Date(a.created_at) >= quarterStart).length

    return [
      { label: '정보자산', value: totalAssets, unit: '건', icon: '📦', subValue: `PII ${piiAssets}건`, tint: 'blue' },
      { label: '미해결 사고', value: openIncidents, unit: '건', icon: '🚨', subValue: slaWarn > 0 ? `⚠ SLA임박 ${slaWarn}건` : '', subTone: slaWarn > 0 ? 'down' : 'neutral', tint: openIncidents > 0 ? 'red' : 'green' },
      { label: 'CPO·관리자 현직', value: activeCpoMgr, unit: '명', icon: '🛡️', tint: 'purple' },
      { label: '본 분기 신규 자산', value: newThisQuarter, unit: '건', icon: '📈', tint: 'amber' },
      { label: '교육 이수율', value: 'Phase 1.2', icon: '🎓', tint: 'slate' },
    ]
  }, [assets, incidents, officers])

  if (!authChecked) return null

  if (!canAccess) {
    return (
      <div style={{ padding: 40, maxWidth: 720 }}>
        <div style={{ ...GLASS.L3, padding: 24, borderRadius: 12 }}>
          <h2 style={{ margin: 0, color: COLORS.danger }}>🔒 정보보안 모듈 접근 제한</h2>
          <p style={{ marginTop: 12, color: COLORS.textSecondary }}>
            본 모듈은 CPO·개인정보보호 관리자·관리팀(사고일선)·시스템 관리자에게만 접근 권한이 부여됩니다.
            취급자(일반 직원)는 별도 진입점(홈 대시보드 카드)을 통해 본인 교육 이수 + 사고 보고만 가능합니다.
            권한 부여 문의: CPO 또는 시스템 관리자.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🔒 라이드 정보보안</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
          라이드케어 「개인정보보호 내부관리계획서」 V1.0 (RIDE-PMP-2026-001, 시행 2026.05.20) 기반 운영 모듈 · Phase 1.1 코어 3 도메인
        </p>
      </div>

      {/* 마이그 미적용 배너 */}
      {migrationPending && (
        <div style={{
          ...GLASS.L3, padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          borderLeft: `4px solid ${COLORS.warning}`,
          color: COLORS.textPrimary, fontSize: 13,
        }}>
          ⚠ 마이그레이션 미적용 — <code style={{ fontSize: 12 }}>migrations/2026-05-18_ride_compliance_phase11.sql</code> 적용 후 새로고침. 빈 화면은 마이그 대기 상태입니다 (Rule 23 graceful fallback).
        </div>
      )}
      {loadError && (
        <div style={{ ...GLASS.L3, padding: '12px 16px', borderRadius: 10, marginBottom: 16, borderLeft: `4px solid ${COLORS.danger}`, color: COLORS.danger, fontSize: 13 }}>
          ❌ 로드 오류: {loadError}
        </div>
      )}

      {/* NavTabs */}
      <div style={{ ...GLASS.L5, padding: '0 24px', borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
          {([
            { key: 'dashboard', label: '대시보드', emoji: '📊' },
            { key: 'assets',    label: '정보자산',  emoji: '📦' },
            { key: 'incidents', label: '침해사고',  emoji: '🚨' },
            { key: 'officers',  label: '조직 매핑', emoji: '👔' },
          ] as { key: TabKey; label: string; emoji: string }[]).map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  background: active ? `${COLORS.primary}18` : 'transparent',
                  border: 'none',
                  borderBottom: active ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                  padding: '14px 20px',
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  color: active ? COLORS.primary : COLORS.textSecondary,
                  cursor: 'pointer',
                }}
              >
                {t.emoji} {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 대시보드 탭 */}
      {tab === 'dashboard' && (
        <>
          <DcStatStrip stats={stats} fullWidth />
          <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12, marginTop: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>📋 운영 안내 (매뉴얼 통합본 5.17 기반)</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: COLORS.textSecondary }}>
              <li>침해사고는 발견 즉시 「침해사고」 탭에서 신고 — 매뉴얼 제27조 의무 (모든 직원, 관리팀 일선 접수).</li>
              <li>정보주체 통지는 발생일 + 24시간 이내 의무 — 매뉴얼 제25조 ① (긴급조치 시 단서 조항 적용).</li>
              <li>자산 등급: <strong>대외비</strong> 는 CPO·관리자만 열람 (매뉴얼 본문 분류와 일치).</li>
              <li>연간 운영 캘린더: RIDE-PLAN-2026 (별첨 7) — 교육 연 2회, 자체감사 반기 1회, 파기 분기 1회.</li>
              <li>Phase 1.2 이후 추가 예정: 교육 이수 관리, 자체감사, 연간계획 캘린더, 파기 이력, 수탁사 점검.</li>
            </ul>
          </div>
        </>
      )}

      {/* 자산 탭 */}
      {tab === 'assets' && (
        <AssetsTabContent
          rows={filteredAssets}
          allRows={assets}
          query={assetQuery} setQuery={setAssetQuery}
          typeFilter={assetTypeFilter} setTypeFilter={setAssetTypeFilter}
          classFilter={assetClassFilter} setClassFilter={setAssetClassFilter}
          statusFilter={assetStatusFilter} setStatusFilter={setAssetStatusFilter}
          onCreate={() => setAssetModalOpen(true)}
        />
      )}

      {/* 사고 탭 */}
      {tab === 'incidents' && (
        <IncidentsTabContent
          rows={filteredIncidents}
          query={incidentQuery} setQuery={setIncidentQuery}
          typeFilter={incidentTypeFilter} setTypeFilter={setIncidentTypeFilter}
          severityFilter={incidentSeverityFilter} setSeverityFilter={setIncidentSeverityFilter}
          statusFilter={incidentStatusFilter} setStatusFilter={setIncidentStatusFilter}
          onCreate={() => setIncidentModalOpen(true)}
        />
      )}

      {/* 조직 탭 */}
      {tab === 'officers' && (
        <OfficersTabContent rows={officers} onCreate={() => setOfficerModalOpen(true)} userRole={user?.role} />
      )}

      {/* 모달들 */}
      {assetModalOpen && (
        <AssetModal onClose={() => setAssetModalOpen(false)} onSaved={() => { setAssetModalOpen(false); fetchAll() }} />
      )}
      {incidentModalOpen && (
        <IncidentModal assets={assets} onClose={() => setIncidentModalOpen(false)} onSaved={() => { setIncidentModalOpen(false); fetchAll() }} />
      )}
      {officerModalOpen && (
        <OfficerModal onClose={() => setOfficerModalOpen(false)} onSaved={() => { setOfficerModalOpen(false); fetchAll() }} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 자산 탭
// ─────────────────────────────────────────────────────────────────
function AssetsTabContent(props: {
  rows: Asset[]
  allRows: Asset[]
  query: string; setQuery: (v: string) => void
  typeFilter: string; setTypeFilter: (v: string) => void
  classFilter: string; setClassFilter: (v: string) => void
  statusFilter: string; setStatusFilter: (v: string) => void
  onCreate: () => void
}) {
  const cols: TableColumn<Asset>[] = [
    { key: 'asset_code', label: '자산코드', sortBy: r => r.asset_code, render: r => (
      <Link href={`/RideCompliance/assets/${r.id}`} style={{ color: COLORS.primary, fontWeight: 600 }}>
        {r.asset_code}
      </Link>
    ) },
    { key: 'name', label: '자산명', sortBy: r => r.name, render: r => r.name },
    { key: 'asset_type', label: '유형', sortBy: r => r.asset_type, render: r => {
      const t = ASSET_TYPE_LABEL[r.asset_type]
      return <span>{t?.emoji} {t?.label || r.asset_type}</span>
    } },
    { key: 'classification', label: '등급', sortBy: r => r.classification, render: r => {
      const c = CLASSIFICATION_LABEL[r.classification]
      return <span style={{ color: c?.color, fontWeight: 600 }}>{c?.label || r.classification}</span>
    } },
    { key: 'contains_pii', label: 'PII', sortBy: r => r.contains_pii, render: r => r.contains_pii === 1 ? '🔐' : '' },
    { key: 'encryption_status', label: '암호화', sortBy: r => r.encryption_status, render: r => r.encryption_status },
    { key: 'owner_user_name', label: '보유자', sortBy: r => r.owner_user_name || '', render: r => r.owner_user_name || '—' },
    { key: 'location', label: '위치', sortBy: r => r.location || '', render: r => r.location || '—' },
    { key: 'status', label: '상태', sortBy: r => r.status, render: r => {
      const s = ASSET_STATUS_LABEL[r.status]
      return <span style={{ color: s?.color, fontWeight: 600 }}>{s?.label || r.status}</span>
    } },
    { key: 'created_at', label: '등록일', sortBy: r => r.created_at, render: r => fmtDate(r.created_at) },
  ]

  return (
    <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          placeholder="자산명·코드·위치 검색"
          value={props.query}
          onChange={e => props.setQuery(e.target.value)}
          style={{ flex: '1 1 200px', minWidth: 200, padding: '8px 12px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13 }}
        />
        <select value={props.typeFilter} onChange={e => props.setTypeFilter(e.target.value)} style={selStyle()}>
          <option value="">유형: 전체</option>
          {Object.entries(ASSET_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
        <select value={props.classFilter} onChange={e => props.setClassFilter(e.target.value)} style={selStyle()}>
          <option value="">등급: 전체</option>
          {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={props.statusFilter} onChange={e => props.setStatusFilter(e.target.value)} style={selStyle()}>
          <option value="">상태: 전체</option>
          {Object.entries(ASSET_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={props.onCreate} style={{ ...btnPrimary, marginLeft: 'auto' }}>＋ 자산 등록</button>
      </div>
      <div style={{ marginBottom: 8, fontSize: 12, color: COLORS.textSecondary }}>
        총 {props.allRows.length} 건 중 {props.rows.length} 건 표시
      </div>
      <NeuDataTable columns={cols} data={props.rows} rowKey={r => r.id} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 사고 탭
// ─────────────────────────────────────────────────────────────────
function IncidentsTabContent(props: {
  rows: Incident[]
  query: string; setQuery: (v: string) => void
  typeFilter: string; setTypeFilter: (v: string) => void
  severityFilter: string; setSeverityFilter: (v: string) => void
  statusFilter: string; setStatusFilter: (v: string) => void
  onCreate: () => void
}) {
  const cols: TableColumn<Incident>[] = [
    { key: 'incident_code', label: '사고번호', sortBy: r => r.incident_code, render: r => (
      <Link href={`/RideCompliance/incidents/${r.id}`} style={{ color: COLORS.primary, fontWeight: 600 }}>
        {r.incident_code}
      </Link>
    ) },
    { key: 'title', label: '제목', sortBy: r => r.title, render: r => r.title },
    { key: 'incident_type', label: '유형', sortBy: r => r.incident_type, render: r => {
      const t = INCIDENT_TYPE_LABEL[r.incident_type]
      return <span>{t?.emoji} {t?.label || r.incident_type}</span>
    } },
    { key: 'severity', label: '심각도', sortBy: r => r.severity, render: r => {
      const s = SEVERITY_LABEL[r.severity]
      return <span style={{ color: s?.color, fontWeight: 600 }}>{s?.label || r.severity}</span>
    } },
    { key: 'status', label: '상태', sortBy: r => r.status, render: r => {
      const s = INCIDENT_STATUS_LABEL[r.status]
      return <span style={{ color: s?.color, fontWeight: 600 }}>{s?.label || r.status}</span>
    } },
    { key: 'sla', label: '24h SLA', sortBy: r => slaRemainHours(r.detected_at, r.notified_at) ?? 9999, render: r => {
      if (r.notified_at) return <span style={{ color: COLORS.success }}>✓ 통지완료</span>
      if (r.status === 'resolved' || r.status === 'closed') return '—'
      const h = slaRemainHours(r.detected_at, r.notified_at)
      if (h === null) return '—'
      if (h < 0) return <span style={{ color: COLORS.danger, fontWeight: 700 }}>⚠ 초과</span>
      if (h < 6) return <span style={{ color: COLORS.danger, fontWeight: 700 }}>⏰ {Math.floor(h)}h 남음</span>
      if (h < 12) return <span style={{ color: COLORS.warning }}>{Math.floor(h)}h 남음</span>
      return <span style={{ color: COLORS.textSecondary }}>{Math.floor(h)}h 남음</span>
    } },
    { key: 'reporter_user_name', label: '신고자', sortBy: r => r.reporter_user_name || '', render: r => r.reporter_user_name || '—' },
    { key: 'detected_at', label: '감지일시', sortBy: r => r.detected_at, render: r => fmtDateTime(r.detected_at) },
    { key: 'affected_subjects_count', label: '영향(명)', sortBy: r => r.affected_subjects_count ?? 0, render: r => r.affected_subjects_count ?? '—' },
  ]

  return (
    <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          placeholder="제목·번호·경위 검색"
          value={props.query}
          onChange={e => props.setQuery(e.target.value)}
          style={{ flex: '1 1 200px', minWidth: 200, padding: '8px 12px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13 }}
        />
        <select value={props.typeFilter} onChange={e => props.setTypeFilter(e.target.value)} style={selStyle()}>
          <option value="">유형: 전체</option>
          {Object.entries(INCIDENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
        <select value={props.severityFilter} onChange={e => props.setSeverityFilter(e.target.value)} style={selStyle()}>
          <option value="">심각도: 전체</option>
          {Object.entries(SEVERITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={props.statusFilter} onChange={e => props.setStatusFilter(e.target.value)} style={selStyle()}>
          <option value="">상태: 전체</option>
          {Object.entries(INCIDENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={props.onCreate} style={{ ...btnDanger, marginLeft: 'auto' }}>🚨 사고 신고</button>
      </div>
      <NeuDataTable columns={cols} data={props.rows} rowKey={r => r.id} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 조직 탭
// ─────────────────────────────────────────────────────────────────
function OfficersTabContent(props: { rows: Officer[]; onCreate: () => void; userRole?: string }) {
  const cols: TableColumn<Officer>[] = [
    { key: 'role', label: '역할', sortBy: r => r.role, render: r => {
      const t = ROLE_LABEL[r.role]
      return <span style={{ color: t?.color, fontWeight: 700 }}>{t?.emoji} {t?.label || r.role}</span>
    } },
    { key: 'user_name', label: '성명', sortBy: r => r.user_name || '', render: r => r.user_name || '(미확인)' },
    { key: 'display_title', label: '직책', sortBy: r => r.display_title || '', render: r => r.display_title || '—' },
    { key: 'business_unit', label: '사업부', sortBy: r => r.business_unit || '', render: r => r.business_unit || '—' },
    { key: 'appointed_at', label: '임명일', sortBy: r => r.appointed_at, render: r => fmtDate(r.appointed_at) },
    { key: 'released_at', label: '해임일', sortBy: r => r.released_at || '', render: r => r.released_at ? fmtDate(r.released_at) : '—' },
    { key: 'is_active', label: '상태', sortBy: r => r.is_active, render: r => r.is_active === 1 ? <span style={{ color: COLORS.success }}>현직</span> : <span style={{ color: COLORS.textSecondary }}>해임</span> },
    { key: 'notes', label: '비고', sortBy: r => r.notes || '', render: r => r.notes || '—' },
  ]

  const canEdit = props.userRole === 'admin'

  return (
    <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <div style={{ fontSize: 13, color: COLORS.textSecondary }}>
          매뉴얼 통합본 5.17 제6조·제9조 기반 3-tier 조직 매핑. 임명은 CPO·시스템관리자가 등록.
        </div>
        {canEdit && (
          <button onClick={props.onCreate} style={{ ...btnPrimary, marginLeft: 'auto' }}>＋ 임명 등록</button>
        )}
      </div>
      {props.rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: COLORS.textSecondary, fontSize: 13 }}>
          등록된 임명 기록이 없습니다. 매뉴얼 통합본 5.17 제6조 명시 인원(임성민 이사 CPO / 석호민·양재희 부장 관리자) 을 먼저 등록하시기 바랍니다.
        </div>
      ) : (
        <NeuDataTable columns={cols} data={props.rows} rowKey={r => r.id} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 모달들
// ─────────────────────────────────────────────────────────────────
function AssetModal(props: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '',
    asset_type: 'pc',
    classification: 'internal',
    location: '',
    os_or_spec: '',
    contains_pii: false,
    access_control: '',
    encryption_status: 'none',
    acquired_at: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!form.name.trim()) { setError('자산명을 입력하세요'); return }
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="📦 정보자산 등록" onClose={props.onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="자산명 *">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inpStyle()} />
        </Field>
        <Field label="유형 *">
          <select value={form.asset_type} onChange={e => setForm({ ...form, asset_type: e.target.value })} style={inpStyle()}>
            {Object.entries(ASSET_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
        <Field label="등급 *">
          <select value={form.classification} onChange={e => setForm({ ...form, classification: e.target.value })} style={inpStyle()}>
            {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="암호화 (제13조)">
          <select value={form.encryption_status} onChange={e => setForm({ ...form, encryption_status: e.target.value })} style={inpStyle()}>
            <option value="none">없음</option>
            <option value="partial">부분</option>
            <option value="full">전체</option>
          </select>
        </Field>
        <Field label="위치">
          <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="예: 본사 3F 서버실" style={inpStyle()} />
        </Field>
        <Field label="사양/OS">
          <input value={form.os_or_spec} onChange={e => setForm({ ...form, os_or_spec: e.target.value })} placeholder="예: Ubuntu 24.04 / 32GB" style={inpStyle()} />
        </Field>
        <Field label="접근통제 요약 (제12·14조)">
          <input value={form.access_control} onChange={e => setForm({ ...form, access_control: e.target.value })} placeholder="예: 2FA + IP 화이트리스트" style={inpStyle()} />
        </Field>
        <Field label="취득일">
          <input type="date" value={form.acquired_at} onChange={e => setForm({ ...form, acquired_at: e.target.value })} style={inpStyle()} />
        </Field>
        <Field label="개인정보 포함" full>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.contains_pii} onChange={e => setForm({ ...form, contains_pii: e.target.checked })} />
            <span style={{ fontSize: 13 }}>이 자산은 개인정보를 포함합니다 (제19조 주민번호 처리 제한 등 적용)</span>
          </label>
        </Field>
        <Field label="비고" full>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ ...inpStyle(), resize: 'vertical' }} />
        </Field>
      </div>
      {error && <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: `${COLORS.danger}18`, color: COLORS.danger, fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={props.onClose} style={btnSecondary}>취소</button>
        <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? '저장 중...' : '등록'}</button>
      </div>
    </Modal>
  )
}

function IncidentModal(props: { assets: Asset[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: '',
    incident_type: 'internal_leak',
    severity: 'medium',
    occurred_at: '',
    affected_pii_items: '',
    affected_subjects_count: '',
    cause_summary: '',
    containment_actions: '',
    related_asset_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!form.title.trim()) { setError('제목을 입력하세요'); return }
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const payload = {
        ...form,
        affected_subjects_count: form.affected_subjects_count ? parseInt(form.affected_subjects_count, 10) : null,
        related_asset_id: form.related_asset_id || null,
      }
      const res = await fetch('/api/ride-compliance/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="🚨 침해사고 신고 (제27조)" onClose={props.onClose}>
      <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: `${COLORS.warning}15`, fontSize: 12, color: COLORS.textSecondary }}>
        매뉴얼 제27조: 「개인정보 침해사고의 접수 또는 인지 시, 즉시 모든 직원은 관리팀에 사고를 접수」.
        제25조 ①: 정보주체 24시간 이내 통지 의무 (긴급조치 우선 시 단서 적용).
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="사고 제목 *" full>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inpStyle()} />
        </Field>
        <Field label="유형 *">
          <select value={form.incident_type} onChange={e => setForm({ ...form, incident_type: e.target.value })} style={inpStyle()}>
            {Object.entries(INCIDENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
        <Field label="심각도 *">
          <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} style={inpStyle()}>
            {Object.entries(SEVERITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="발생 시점 (추정)">
          <input type="datetime-local" value={form.occurred_at} onChange={e => setForm({ ...form, occurred_at: e.target.value })} style={inpStyle()} />
        </Field>
        <Field label="관련 자산 (선택)">
          <select value={form.related_asset_id} onChange={e => setForm({ ...form, related_asset_id: e.target.value })} style={inpStyle()}>
            <option value="">(없음)</option>
            {props.assets.map(a => <option key={a.id} value={a.id}>{a.asset_code} · {a.name}</option>)}
          </select>
        </Field>
        <Field label="유출 개인정보 항목 (제25조 ①-1)" full>
          <textarea value={form.affected_pii_items} onChange={e => setForm({ ...form, affected_pii_items: e.target.value })} rows={2} placeholder="예: 이름, 휴대폰번호, 차량번호" style={{ ...inpStyle(), resize: 'vertical' }} />
        </Field>
        <Field label="영향 정보주체 수 (추정)">
          <input type="number" min={0} value={form.affected_subjects_count} onChange={e => setForm({ ...form, affected_subjects_count: e.target.value })} style={inpStyle()} />
        </Field>
        <Field label="시점과 경위 (제25조 ①-2)" full>
          <textarea value={form.cause_summary} onChange={e => setForm({ ...form, cause_summary: e.target.value })} rows={3} style={{ ...inpStyle(), resize: 'vertical' }} />
        </Field>
        <Field label="긴급조치 내역 (제25조 ① 단서)" full>
          <textarea value={form.containment_actions} onChange={e => setForm({ ...form, containment_actions: e.target.value })} rows={3} placeholder="예: 접속경로 차단 · 취약점 점검·보완 · 유출 데이터 삭제" style={{ ...inpStyle(), resize: 'vertical' }} />
        </Field>
      </div>
      {error && <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: `${COLORS.danger}18`, color: COLORS.danger, fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={props.onClose} style={btnSecondary}>취소</button>
        <button onClick={save} disabled={saving} style={btnDanger}>{saving ? '신고 중...' : '신고'}</button>
      </div>
    </Modal>
  )
}

function OfficerModal(props: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    user_id: '',
    role: 'manager',
    display_title: '',
    business_unit: '라이드케어',
    appointed_at: new Date().toISOString().slice(0, 10),
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!form.user_id.trim()) { setError('user_id (cuid) 를 입력하세요'); return }
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/officers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="👔 임명 등록" onClose={props.onClose}>
      <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: `${COLORS.info}15`, fontSize: 12, color: COLORS.textSecondary }}>
        매뉴얼 통합본 5.17 제6조 명시 인원: <strong>임성민 이사 (CPO)</strong>, <strong>석호민 부장 (관리자)</strong>, <strong>양재희 부장 (관리자)</strong>.
        user_id 는 라이드 users 테이블의 cuid (string 36자 이내).
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="user_id (cuid) *" full>
          <input value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} placeholder="users.id" style={inpStyle()} />
        </Field>
        <Field label="역할 *">
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inpStyle()}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
        <Field label="임명일 *">
          <input type="date" value={form.appointed_at} onChange={e => setForm({ ...form, appointed_at: e.target.value })} style={inpStyle()} />
        </Field>
        <Field label="직책">
          <input value={form.display_title} onChange={e => setForm({ ...form, display_title: e.target.value })} placeholder="예: 라이드케어 개인정보보호 책임자" style={inpStyle()} />
        </Field>
        <Field label="사업부">
          <input value={form.business_unit} onChange={e => setForm({ ...form, business_unit: e.target.value })} style={inpStyle()} />
        </Field>
        <Field label="비고" full>
          <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="예: 매뉴얼 통합본 5.17 제6조 명시" style={inpStyle()} />
        </Field>
      </div>
      {error && <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: `${COLORS.danger}18`, color: COLORS.danger, fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={props.onClose} style={btnSecondary}>취소</button>
        <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? '저장 중...' : '등록'}</button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// 공용 UI 헬퍼
// ─────────────────────────────────────────────────────────────────
function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={props.onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        ...GLASS.L1, padding: 24, borderRadius: 12,
        maxWidth: 720, width: '90vw', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{props.title}</h2>
          <button onClick={props.onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: COLORS.textSecondary }}>✕</button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

function Field(props: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: props.full ? '1 / -1' : 'auto' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4 }}>{props.label}</label>
      {props.children}
    </div>
  )
}

function inpStyle(): React.CSSProperties {
  return { width: '100%', padding: '8px 12px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13, background: 'transparent' }
}

function selStyle(): React.CSSProperties {
  return { padding: '8px 12px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13, background: 'transparent' }
}

'use client'

/**
 * /RideAssets — 라이드 자산 관리
 *
 * QR 스티커 자산 대장. 권한자(총무팀)이 자산 등록 → QR 라벨 인쇄 → 부착 → 사용자 매칭.
 * 일반 사용자는 본인 매칭 자산만 조회 가능 (위치/메모 업데이트는 본인거 한정).
 *
 * 사이드바: work-essentials > admin-ops (sortOrder 83) — 메뉴는 메인 세션이 등록.
 *
 * 페이지 내부 NavTabs 8 + 권한자/카테고리 관리 2:
 *   📋 전체 / 🚗 차량 / 🪑 사무비품 / 💻 IT장비 / 💳 법인카드 / 📦 공통 / 👤 내 자산 / 🖨️ QR 인쇄
 *   ⚙ 권한자 (admin only) / 🏷️ 카테고리
 */
import { useEffect, useMemo, useState, useCallback } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import { usePermission } from '@/app/hooks/usePermission'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import DcStatStrip, { StatItem } from '@/app/components/DcStatStrip'
import DcToolbar from '@/app/components/DcToolbar'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import AssetRegisterModal, { AssetForModal } from './components/AssetRegisterModal'
import BulkRegisterPanel from './components/BulkRegisterPanel'
import { jsPDF } from 'jspdf'

interface Asset {
  id: string
  asset_code: string
  category_id: string
  category_code: string | null
  category_name: string | null
  category_emoji: string | null
  name: string
  acquired_at: string | null
  acquired_cost: string | null
  status: string
  assigned_to_kind: string | null
  assigned_to_id: string | null
  assigned_user_name: string | null
  location: string | null
  notes: string | null
  qr_token: string
  disposed_at: string | null
  disposed_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface Category {
  id: string
  code: string
  name: string
  emoji: string | null
  sort_order: number
  next_seq: number
  is_active: number
}

interface Assignee {
  kind: 'employee' | 'freelancer'
  id: string
  name: string
  sub: string | null
}

interface ProfileOption {
  id: string
  name: string
  department: string | null
  role: string | null
  is_admin_already: boolean
}

interface AssetAdmin {
  user_id: string
  user_name: string | null
  granted_by: string | null
  granted_at: string
  note: string | null
}

type TabKey = 'all' | 'common' | 'mine' | 'print' | 'admins' | 'categories' | string

const STATUS_BADGE: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  active: { label: '🟢 운영 중', tone: 'success' },
  repair: { label: '🟡 정비/수리', tone: 'warning' },
  disposed: { label: '⚫ 처분', tone: 'neutral' },
  lost: { label: '🔴 분실', tone: 'danger' },
}

function fmt(d: string | Date | null | undefined): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return ''
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function fmtMoney(s: string | null): string {
  if (!s) return ''
  const n = Number(s)
  if (isNaN(n)) return s
  return n.toLocaleString('ko-KR')
}

export default function RideAssetsPage() {
  const [me, setMe] = useState<{ id?: string; role?: string; name?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const { hasPageAccess } = usePermission()
  const canAccessPage = me?.role === 'admin' || hasPageAccess('/RideAssets')

  // 권한자 (서버 응답 meta.is_admin 활용)
  const [isAssetAdmin, setIsAssetAdmin] = useState(false)
  const isSysAdmin = me?.role === 'admin'

  // 데이터
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [migrationPending, setMigrationPending] = useState(false)

  const [categories, setCategories] = useState<Category[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [assetAdmins, setAssetAdmins] = useState<AssetAdmin[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])

  // 탭/필터
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // 모달
  const [registerOpen, setRegisterOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<AssetForModal | null>(null)

  // QR 인쇄 다중 선택
  const [selectedForPrint, setSelectedForPrint] = useState<Record<string, boolean>>({})

  // 결과 배너 (Rule 20)
  const [resultPanel, setResultPanel] = useState<{ tone: 'success' | 'danger'; msg: string } | null>(null)

  useEffect(() => {
    setMe(getStoredUser())
    setAuthChecked(true)
  }, [])

  // 데이터 fetch
  const fetchCategories = useCallback(async () => {
    const token = getStoredToken()
    try {
      const res = await fetch('/api/ride-asset-categories', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      setCategories(json.data || [])
      if (json.meta?._migration_pending) setMigrationPending(true)
    } catch { /* noop */ }
  }, [])

  const fetchAssignees = useCallback(async () => {
    const token = getStoredToken()
    try {
      const res = await fetch('/api/ride-assets/assignee-options', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      setAssignees(json.data || [])
    } catch { /* noop */ }
  }, [])

  const fetchAssetAdmins = useCallback(async () => {
    if (!isSysAdmin) return
    const token = getStoredToken()
    try {
      const res = await fetch('/api/ride-asset-admins', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      setAssetAdmins(json.data || [])
    } catch { /* noop */ }
  }, [isSysAdmin])

  const fetchProfiles = useCallback(async () => {
    if (!isSysAdmin) return
    const token = getStoredToken()
    try {
      const res = await fetch('/api/ride-assets/profile-options', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      setProfiles(json.data || [])
    } catch { /* noop */ }
  }, [isSysAdmin])

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const token = getStoredToken()
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    if (statusFilter) params.set('status', statusFilter)
    // 탭별 필터
    if (activeTab === 'common') params.set('assigned', 'common')
    else if (activeTab === 'mine') params.set('assigned', 'me')
    else if (categories.find(c => c.code === activeTab)) params.set('category', activeTab)
    try {
      const res = await fetch(`/api/ride-assets?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErr(json.error || `HTTP ${res.status}`)
        setAssets([])
        return
      }
      setAssets(json.data || [])
      if (json.meta?.is_admin !== undefined) setIsAssetAdmin(json.meta.is_admin)
      if (json.meta?._migration_pending) setMigrationPending(true)
    } catch (e) {
      setErr(String(e))
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, activeTab, categories])

  useEffect(() => {
    if (!authChecked || !canAccessPage) return
    fetchCategories()
    fetchAssignees()
  }, [authChecked, canAccessPage, fetchCategories, fetchAssignees])

  useEffect(() => {
    if (!authChecked || !canAccessPage) return
    if (activeTab === 'print' || activeTab === 'admins' || activeTab === 'categories' || activeTab === 'bulk' || activeTab === 'by-assignee') return
    fetchAssets()
  }, [authChecked, canAccessPage, activeTab, statusFilter, search, fetchAssets])

  useEffect(() => {
    if (activeTab === 'admins') { fetchAssetAdmins(); fetchProfiles() }
  }, [activeTab, fetchAssetAdmins, fetchProfiles])

  // 일반 사용자 진입 시 기본 탭을 '내 자산'으로
  useEffect(() => {
    if (authChecked && me && !isSysAdmin && !isAssetAdmin && activeTab === 'all') {
      setActiveTab('mine')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, me, isAssetAdmin])

  // 통계 (탭 무관 — 전체 기준)
  const [statsCounts, setStatsCounts] = useState({ total: 0, active: 0, common: 0, disposed: 0 })
  useEffect(() => {
    if (!isAssetAdmin) return
    const token = getStoredToken()
    fetch('/api/ride-assets?limit=1000', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    }).then(r => r.json()).then(json => {
      const all: Asset[] = json.data || []
      setStatsCounts({
        total: all.length,
        active: all.filter(a => a.status === 'active').length,
        common: all.filter(a => a.status === 'active' && !a.assigned_to_id).length,
        disposed: all.filter(a => a.status === 'disposed').length,
      })
    }).catch(() => {})
  }, [isAssetAdmin, assets.length])

  const statItems: StatItem[] = useMemo(() => [
    { label: '전체 자산', value: statsCounts.total.toLocaleString('ko-KR'), tint: 'blue' },
    { label: '운영 중', value: statsCounts.active.toLocaleString('ko-KR'), tint: 'green' },
    { label: '공통 자산', value: statsCounts.common.toLocaleString('ko-KR'), tint: 'amber' },
    { label: '처분', value: statsCounts.disposed.toLocaleString('ko-KR'), tint: 'red' },
    { label: '카테고리', value: categories.filter(c => c.is_active).length.toLocaleString('ko-KR'), tint: 'purple' },
  ], [statsCounts, categories])

  // 컬럼 — 모든 컬럼 sortBy (Rule 18)
  const columns: TableColumn<Asset>[] = useMemo(() => [
    {
      key: 'asset_code',
      label: '자산코드',
      width: 130,
      sortBy: r => r.asset_code,
      render: r => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: COLORS.primary, whiteSpace: 'nowrap' }}>
          {r.asset_code}
        </span>
      ),
    },
    {
      key: 'category',
      label: '카테고리',
      width: 100,
      sortBy: r => `${r.category_emoji || ''} ${r.category_name || ''}`,
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: COLORS.textSecondary }}>
          {r.category_emoji} {r.category_name}
        </span>
      ),
    },
    {
      key: 'name',
      label: '자산명',
      sortBy: r => r.name,
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: COLORS.textPrimary }}>{r.name}</span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      width: 100,
      sortBy: r => r.status,
      render: r => {
        const b = STATUS_BADGE[r.status] || { label: r.status, tone: 'neutral' as const }
        return <span style={pillStyle(b.tone)}>{b.label}</span>
      },
    },
    {
      key: 'assigned',
      label: '사용자',
      width: 110,
      sortBy: r => r.assigned_user_name || '',
      render: r => r.assigned_user_name ? (
        <span style={{ whiteSpace: 'nowrap', color: COLORS.textPrimary }}>👤 {r.assigned_user_name}</span>
      ) : (
        <span style={{ whiteSpace: 'nowrap', color: COLORS.textMuted, fontSize: 12 }}>— 공통 —</span>
      ),
    },
    {
      key: 'location',
      label: '위치',
      width: 120,
      sortBy: r => r.location || '',
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: COLORS.textSecondary }}>
          {r.location || '—'}
        </span>
      ),
    },
    {
      key: 'acquired',
      label: '취득',
      width: 110,
      sortBy: r => r.acquired_at ? new Date(r.acquired_at).getTime() : 0,
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: COLORS.textMuted }}>
          {r.acquired_at ? fmt(r.acquired_at) : '—'}
          {r.acquired_cost && (
            <span style={{ marginLeft: 6, color: COLORS.textSecondary }}>
              ₩{fmtMoney(r.acquired_cost)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: '등록일',
      width: 100,
      sortBy: r => new Date(r.created_at).getTime(),
      render: r => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: COLORS.textMuted }}>
          {fmt(r.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '액션',
      width: 70,
      render: r => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            openEdit(r)
          }}
          style={{
            ...BTN.sm,
            background: 'transparent', color: COLORS.primary,
            border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer',
          }}
        >
          편집
        </button>
      ),
    },
  ], [])

  function openEdit(a: Asset) {
    if (!isAssetAdmin) return  // 편집은 권한자만 (일반 사용자는 QR 스캔 페이지에서)
    setEditingAsset({
      id: a.id,
      asset_code: a.asset_code,
      category_id: a.category_id,
      name: a.name,
      acquired_at: a.acquired_at,
      acquired_cost: a.acquired_cost,
      status: a.status,
      assigned_to_kind: a.assigned_to_kind,
      assigned_to_id: a.assigned_to_id,
      location: a.location,
      notes: a.notes,
      disposed_reason: a.disposed_reason,
    })
    setRegisterOpen(true)
  }

  function openCreate() {
    setEditingAsset(null)
    setRegisterOpen(true)
  }

  function handlePrintQr() {
    const ids = Object.keys(selectedForPrint).filter(k => selectedForPrint[k])
    if (!ids.length) {
      setResultPanel({ tone: 'danger', msg: 'QR 인쇄할 자산을 선택해주세요.' })
      return
    }
    setResultPanel(null)
    try {
      const selectedAssets = assets.filter(a => selectedForPrint[a.id])
      if (selectedAssets.length === 0) {
        setResultPanel({ tone: 'danger', msg: '선택된 자산을 찾을 수 없습니다. 페이지 새로고침 후 재시도.' })
        return
      }

      // A4 (210x297mm). 라벨 그리드: 2 cols × 5 rows = 10 라벨/페이지 (100mm × 55mm)
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
      const cols = 2
      const rowsPerPage = 5
      const labelW = 100
      const labelH = 55
      const marginX = 5
      const marginY = 11
      const gapX = 0
      const gapY = 0

      selectedAssets.forEach((a, idx) => {
        const pageIdx = Math.floor(idx / (cols * rowsPerPage))
        const localIdx = idx % (cols * rowsPerPage)
        const rowIdx = Math.floor(localIdx / cols)
        const colIdx = localIdx % cols
        if (idx > 0 && localIdx === 0) doc.addPage()

        const x = marginX + colIdx * (labelW + gapX)
        const y = marginY + rowIdx * (labelH + gapY)

        // 라벨 박스
        doc.setDrawColor(180)
        doc.setLineWidth(0.3)
        doc.rect(x, y, labelW, labelH)

        // 카테고리 + 자산코드 (상단)
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(a.asset_code, x + 5, y + 9)

        // 자산명
        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        const nameText = doc.splitTextToSize(a.name, labelW - 50)
        doc.text(nameText, x + 5, y + 17)

        // 카테고리 표시
        doc.setFontSize(9)
        doc.setTextColor(100)
        doc.text(`[${a.category_code || ''}] ${a.category_name || ''}`, x + 5, y + 32)

        // QR URL 텍스트 (실제 QR 이미지는 qrcode 라이브러리 추가 후 — Phase 2)
        doc.setFontSize(7)
        const qrUrl = `${baseUrl}/RideAssets/qr/${a.qr_token}`
        const urlText = doc.splitTextToSize(qrUrl, labelW - 10)
        doc.text(urlText, x + 5, y + 42)

        // QR 자리표시 박스 (우측 상단)
        const qrSize = 22
        const qrX = x + labelW - qrSize - 5
        const qrY = y + 5
        doc.setDrawColor(120)
        doc.setLineWidth(0.5)
        doc.rect(qrX, qrY, qrSize, qrSize)
        doc.setFontSize(6)
        doc.setTextColor(120)
        doc.text('[QR]', qrX + qrSize / 2 - 3, qrY + qrSize / 2 + 1)
        doc.text('스캔', qrX + qrSize / 2 - 3, qrY + qrSize / 2 + 4)

        doc.setTextColor(0)
      })

      doc.save(`ride-assets-qr-${new Date().toISOString().slice(0, 10)}.pdf`)
      setSelectedForPrint({})
      setResultPanel({
        tone: 'success',
        msg: `✅ ${selectedAssets.length}개 자산 라벨 PDF 다운로드 완료. ※ QR 이미지는 추후 업데이트 예정 (URL 텍스트로 임시 표시).`,
      })
    } catch (e) {
      setResultPanel({ tone: 'danger', msg: String(e) })
    }
  }

  async function handleAddAdmin(userId: string) {
    if (!userId) return
    const token = getStoredToken()
    const res = await fetch('/api/ride-asset-admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ user_id: userId, note: null }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      setResultPanel({ tone: 'danger', msg: json.error || `HTTP ${res.status}` })
      return
    }
    setResultPanel({ tone: 'success', msg: '✅ 권한자 추가됨' })
    fetchAssetAdmins()
    fetchProfiles()
  }

  async function handleRemoveAdmin(userId: string) {
    if (!window.confirm(`권한자 ${userId} 제거하시겠습니까?`)) return
    const token = getStoredToken()
    const res = await fetch(`/api/ride-asset-admins/${userId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      setResultPanel({ tone: 'danger', msg: json.error || `HTTP ${res.status}` })
      return
    }
    setResultPanel({ tone: 'success', msg: '✅ 권한자 제거됨' })
    fetchAssetAdmins()
  }

  async function handleAddCategory() {
    const code = window.prompt('카테고리 prefix (A~Z, 1~8자, 예: SW):')
    if (!code) return
    const name = window.prompt('카테고리 이름 (예: 소프트웨어):')
    if (!name) return
    const emoji = window.prompt('이모지 (선택, 예: 💿):') || null
    const token = getStoredToken()
    const res = await fetch('/api/ride-asset-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ code: code.trim(), name: name.trim(), emoji }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      setResultPanel({ tone: 'danger', msg: json.error || `HTTP ${res.status}` })
      return
    }
    setResultPanel({ tone: 'success', msg: '✅ 카테고리 추가됨' })
    fetchCategories()
  }

  // ── 렌더링 분기 ──
  if (!authChecked) {
    return <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
  }
  if (!canAccessPage) {
    return (
      <div style={{ padding: 32, ...GLASS.L4, borderRadius: 12, maxWidth: 520, margin: '40px auto' }}>
        <h2 style={{ marginTop: 0, color: COLORS.danger }}>🔒 접근 권한 없음</h2>
        <p style={{ color: COLORS.textSecondary }}>본 페이지 접근 권한이 없습니다. 관리자에게 문의하세요.</p>
      </div>
    )
  }

  // 동적 탭 — 카테고리 + 시스템 탭
  const NAV_TABS = [
    ...(isAssetAdmin ? [{ key: 'all', label: '📋 전체', adminOnly: true }] : []),
    ...categories.filter(c => c.is_active).map(c => ({
      key: c.code,
      label: `${c.emoji || ''} ${c.name}`.trim(),
      adminOnly: !isAssetAdmin,  // 일반 사용자도 카테고리 탭은 본인 자산만 보여주므로 표시
    })),
    ...(isAssetAdmin ? [{ key: 'common', label: '📦 공통 자산', adminOnly: true }] : []),
    ...(isAssetAdmin ? [{ key: 'by-assignee', label: '👥 사용자별 자산', adminOnly: true }] : []),
    { key: 'mine', label: '👤 내 자산', adminOnly: false },
    ...(isAssetAdmin ? [{ key: 'bulk', label: '➕ 대량 등록', adminOnly: true }] : []),
    ...(isAssetAdmin ? [{ key: 'print', label: '🖨️ QR 인쇄', adminOnly: true }] : []),
    ...(isAssetAdmin ? [{ key: 'categories', label: '🏷️ 카테고리 관리', adminOnly: true }] : []),
    ...(isSysAdmin ? [{ key: 'admins', label: '⚙ 권한자', adminOnly: true }] : []),
  ].filter(t => isAssetAdmin || !t.adminOnly)

  const isAdminTab = activeTab === 'admins'
  const isCategoryMgmtTab = activeTab === 'categories'
  const isPrintTab = activeTab === 'print'
  const isBulkTab = activeTab === 'bulk'
  const isByAssigneeTab = activeTab === 'by-assignee'

  return (
    <div style={{ padding: '0 16px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* 마이그 미적용 경고 */}
      {migrationPending && (
        <div style={{
          margin: '12px 0', padding: '10px 14px',
          background: 'rgba(245, 158, 11, 0.08)',
          color: COLORS.warning, borderRadius: 8,
          border: `1px solid ${COLORS.borderAmber}`, fontSize: 13,
        }}>
          ⚠ 마이그레이션 미적용 — DB 관리자가 <code>migrations/2026-05-14_ride_assets.sql</code> 적용 후 사용 가능합니다.
        </div>
      )}

      {/* 통계 (권한자만) */}
      {isAssetAdmin && (
        <div style={{ margin: '16px 0' }}>
          <DcStatStrip
            stats={statItems}
            actions={[
              { label: '+ 자산 등록', onClick: openCreate, variant: 'primary' as const, icon: '➕' },
            ]}
          />
        </div>
      )}

      {/* NavTabs */}
      <div style={{
        ...GLASS.L5, borderRadius: 12, padding: '6px 8px', marginBottom: 12,
        display: 'flex', gap: 4, overflowX: 'auto', whiteSpace: 'nowrap',
      }}>
        {NAV_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setSelectedForPrint({}) }}
            style={{
              padding: '8px 14px', borderRadius: 8,
              fontSize: 13, fontWeight: activeTab === t.key ? 700 : 600,
              color: activeTab === t.key ? '#fff' : COLORS.textSecondary,
              background: activeTab === t.key ? COLORS.textPrimary : 'transparent',
              border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 결과 패널 (Rule 20 — 글래스 패널) */}
      {resultPanel && (
        <div style={{
          ...GLASS.L4, borderRadius: 12,
          border: `1px solid ${resultPanel.tone === 'success' ? COLORS.borderGreen : COLORS.borderRed}`,
          padding: 14, marginBottom: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{
            color: resultPanel.tone === 'success' ? COLORS.success : COLORS.danger,
            fontWeight: 600, fontSize: 13,
          }}>
            {resultPanel.msg}
          </span>
          <button onClick={() => setResultPanel(null)}
            style={{ ...BTN.sm, background: 'transparent', color: COLORS.textMuted, border: 'none', cursor: 'pointer' }}
          >× 닫기</button>
        </div>
      )}

      {/* 탭별 컨텐츠 */}
      {isAdminTab ? (
        <AdminsTab admins={assetAdmins} profiles={profiles} onAdd={handleAddAdmin} onRemove={handleRemoveAdmin} />
      ) : isByAssigneeTab ? (
        <ByAssigneeTab assignees={assignees} />
      ) : isCategoryMgmtTab ? (
        <CategoriesTab
          categories={categories}
          onAdd={handleAddCategory}
          onRefresh={fetchCategories}
          setResultPanel={setResultPanel}
        />
      ) : isPrintTab ? (
        <PrintTab
          allAssets={assets}
          categories={categories}
          selected={selectedForPrint}
          setSelected={setSelectedForPrint}
          onPrint={handlePrintQr}
        />
      ) : isBulkTab ? (
        <BulkRegisterPanel
          categories={categories}
          assignees={assignees}
          onDone={(result) => {
            setActiveTab('all')
            setResultPanel({
              tone: result.failed > 0 ? 'danger' : 'success',
              msg: result.failed > 0
                ? `✅ ${result.created}건 등록 / ⚠ ${result.failed}건 실패`
                : `✅ ${result.created}건 일괄 등록 완료`,
            })
          }}
        />
      ) : (
        <>
          {/* 검색/필터 툴바 */}
          <DcToolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="자산명 / 자산코드 검색..."
            filters={[
              { key: '', label: '전체 상태' },
              { key: 'active', label: '운영 중' },
              { key: 'repair', label: '정비/수리' },
              { key: 'disposed', label: '처분' },
              { key: 'lost', label: '분실' },
            ]}
            activeFilter={statusFilter}
            onFilterChange={setStatusFilter}
            trailing={
              <span style={{ fontSize: 12, color: COLORS.textMuted }}>
                {loading ? '불러오는 중...' : `${assets.length}건`}
              </span>
            }
          />

          {err && (
            <div style={{
              padding: 12, borderRadius: 8, marginBottom: 12,
              background: 'rgba(239,68,68,0.08)', color: COLORS.danger, fontSize: 13,
            }}>
              ❗ {err}
            </div>
          )}

          <NeuDataTable
            columns={columns}
            data={assets}
            rowKey={(r) => r.id}
            onRowClick={openEdit}
            loading={loading}
            emptyIcon="📦"
            emptyMessage={
              activeTab === 'mine'
                ? '매칭된 자산이 없습니다. 총무팀에 자산 매칭을 요청하세요.'
                : '자산이 없습니다. 「+ 자산 등록」 버튼으로 추가해주세요.'
            }
            defaultSort={{ key: 'created_at', dir: 'desc' }}
            mobileCard={{
              title: (r) => `${r.category_emoji || ''} ${r.name}`,
              subtitle: (r) => r.asset_code,
              trailing: (r) => {
                const b = STATUS_BADGE[r.status] || { label: r.status, tone: 'neutral' as const }
                return <span style={pillStyle(b.tone)}>{b.label}</span>
              },
              badges: (r) => (
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                  {r.assigned_user_name ? `👤 ${r.assigned_user_name}` : '— 공통 —'} · 📍 {r.location || '미지정'}
                </span>
              ),
            }}
          />
        </>
      )}

      {/* 등록/편집 모달 */}
      <AssetRegisterModal
        open={registerOpen}
        asset={editingAsset}
        categories={categories}
        assignees={assignees}
        onClose={() => { setRegisterOpen(false); setEditingAsset(null) }}
        onSaved={() => { fetchAssets(); setResultPanel({ tone: 'success', msg: '✅ 저장 완료' }) }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AdminsTab — 권한자 관리 (admin only)
// ─────────────────────────────────────────────────────────────
function AdminsTab({
  admins, profiles, onAdd, onRemove,
}: {
  admins: AssetAdmin[]
  profiles: ProfileOption[]
  onAdd: (userId: string) => void
  onRemove: (uid: string) => void
}) {
  const [pick, setPick] = useState('')
  const selectable = profiles.filter(p => !p.is_admin_already)

  return (
    <div style={{ ...GLASS.L4, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>
          ⚙ 자산 권한자 (총무팀)
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={pick} onChange={e => setPick(e.target.value)}
            style={{ ...GLASS.L1, borderRadius: 8, padding: '8px 10px', fontSize: 13,
              color: COLORS.textPrimary, outline: 'none', minWidth: 200 }}>
            <option value="">계정 선택...</option>
            {selectable.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.department ? ` · ${p.department}` : ''}{p.role === 'admin' ? ' (관리자)' : ''}
              </option>
            ))}
          </select>
          <button onClick={() => { if (pick) { onAdd(pick); setPick('') } }} disabled={!pick}
            style={{ ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
              cursor: pick ? 'pointer' : 'not-allowed', opacity: pick ? 1 : 0.5 }}>
            + 권한자 추가
          </button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 0, marginBottom: 16 }}>
        라이드 admin 은 자동으로 권한자입니다. 위 드롭다운에서 로그인 계정을 선택해 총무팀원을 권한자로 추가하세요.
      </p>
      {admins.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>
          위임된 권한자가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {admins.map(a => (
            <div key={a.user_id} style={{
              ...GLASS.L3, borderRadius: 8, padding: 12,
              border: `1px solid ${COLORS.borderSubtle}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: COLORS.textPrimary }}>{a.user_name || '(이름 없음)'}</span>
                {a.note && <span style={{ marginLeft: 8, color: COLORS.textSecondary, fontSize: 12 }}>· {a.note}</span>}
              </div>
              <button onClick={() => onRemove(a.user_id)}
                style={{ ...BTN.sm, background: 'transparent', color: COLORS.danger,
                  border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer' }}>
                제거
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ByAssigneeTab — 사용자별 자산 조회
// ─────────────────────────────────────────────────────────────
function ByAssigneeTab({ assignees }: { assignees: Assignee[] }) {
  const [picked, setPicked] = useState('')
  const [list, setList] = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)

  async function load(key: string) {
    setPicked(key)
    if (!key) { setList([]); return }
    const id = key.split(':')[1]
    setLoading(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-assets?assigned=${encodeURIComponent(id)}&limit=500`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store',
      })
      const json = await res.json()
      setList(json.success ? (json.data || []) : [])
    } catch { setList([]) } finally { setLoading(false) }
  }

  const pickedAssignee = assignees.find(a => `${a.kind}:${a.id}` === picked)

  return (
    <div style={{ ...GLASS.L4, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>
          👥 사용자별 자산
        </h3>
        <select value={picked} onChange={e => load(e.target.value)}
          style={{ ...GLASS.L1, borderRadius: 8, padding: '8px 10px', fontSize: 13,
            color: COLORS.textPrimary, outline: 'none', minWidth: 220 }}>
          <option value="">사용자 선택 (직원 / 외부인력)...</option>
          {assignees.map(a => (
            <option key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>
              {a.kind === 'employee' ? '[직원]' : '[외부]'} {a.name}{a.sub ? ` · ${a.sub}` : ''}
            </option>
          ))}
        </select>
      </div>

      {!picked ? (
        <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>
          위에서 사용자를 선택하면 해당 사용자에게 매칭된 자산이 표시됩니다.
        </div>
      ) : loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>불러오는 중...</div>
      ) : list.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>
          {pickedAssignee?.name}님에게 매칭된 자산이 없습니다.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 10 }}>
            {pickedAssignee?.name}님 — 매칭 자산 {list.length}건
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map(a => {
              const b = STATUS_BADGE[a.status] || { label: a.status, tone: 'neutral' as const }
              return (
                <div key={a.id} style={{ ...GLASS.L3, borderRadius: 8, padding: 12,
                  border: `1px solid ${COLORS.borderSubtle}`,
                  display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 18 }}>{a.category_emoji}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: COLORS.primary,
                    minWidth: 120, whiteSpace: 'nowrap' }}>{a.asset_code}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                  <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                    📍 {a.location || '미지정'}
                  </span>
                  <span style={pillStyle(b.tone)}>{b.label}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// CategoriesTab — 카테고리 관리
// ─────────────────────────────────────────────────────────────
function CategoriesTab({
  categories, onAdd, onRefresh, setResultPanel,
}: {
  categories: Category[]
  onAdd: () => void
  onRefresh: () => void
  setResultPanel: (p: { tone: 'success' | 'danger'; msg: string } | null) => void
}) {
  async function toggleActive(c: Category) {
    const token = getStoredToken()
    const res = await fetch(`/api/ride-asset-categories/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ is_active: c.is_active ? false : true }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      setResultPanel({ tone: 'danger', msg: json.error || `HTTP ${res.status}` })
      return
    }
    onRefresh()
  }

  return (
    <div style={{ ...GLASS.L4, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>
          🏷️ 자산 카테고리
        </h3>
        <button
          onClick={onAdd}
          style={{ ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          + 카테고리 추가
        </button>
      </div>
      <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 0, marginBottom: 16 }}>
        카테고리 prefix 는 자산코드의 첫 부분 (예: <code>VH-2026-0001</code>).
        한 번 등록한 자산이 있는 카테고리는 비활성화만 가능 (실제 삭제 X).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {categories.map(c => (
          <div key={c.id} style={{
            ...GLASS.L3, borderRadius: 8, padding: 12,
            border: `1px solid ${c.is_active ? COLORS.borderBlue : COLORS.borderSubtle}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            opacity: c.is_active ? 1 : 0.55,
          }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ fontSize: 18, marginRight: 8 }}>{c.emoji}</span>
              <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>{c.name}</span>
              <span style={{ marginLeft: 8, fontFamily: 'monospace', color: COLORS.primary, fontWeight: 700 }}>
                {c.code}
              </span>
              <span style={{ marginLeft: 12, color: COLORS.textMuted, fontSize: 11 }}>
                다음 시퀀스 #{c.next_seq} · 순서 {c.sort_order}
              </span>
            </div>
            <button
              onClick={() => toggleActive(c)}
              style={{
                ...BTN.sm,
                background: 'transparent',
                color: c.is_active ? COLORS.warning : COLORS.success,
                border: `1px solid ${c.is_active ? COLORS.borderAmber : COLORS.borderGreen}`,
                cursor: 'pointer',
              }}
            >
              {c.is_active ? '비활성화' : '활성화'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PrintTab — QR 라벨 PDF 인쇄 (권한자)
// ─────────────────────────────────────────────────────────────
function PrintTab({
  allAssets, categories, selected, setSelected, onPrint,
}: {
  allAssets: Asset[]
  categories: Category[]
  selected: Record<string, boolean>
  setSelected: (s: Record<string, boolean>) => void
  onPrint: () => void
}) {
  const printableAssets = allAssets.filter(a => a.status !== 'disposed')
  const selectedCount = Object.values(selected).filter(Boolean).length

  function toggle(id: string) {
    setSelected({ ...selected, [id]: !selected[id] })
  }
  function toggleAll() {
    if (selectedCount === printableAssets.length) {
      setSelected({})
    } else {
      const next: Record<string, boolean> = {}
      printableAssets.forEach(a => { next[a.id] = true })
      setSelected(next)
    }
  }

  return (
    <div style={{ ...GLASS.L4, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>
          🖨️ QR 라벨 PDF 인쇄
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={toggleAll}
            style={{ ...BTN.sm, background: 'transparent', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}
          >
            {selectedCount === printableAssets.length && printableAssets.length > 0 ? '전체 해제' : '전체 선택'}
          </button>
          <button
            onClick={onPrint}
            disabled={selectedCount === 0}
            style={{
              ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
              cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
              opacity: selectedCount === 0 ? 0.4 : 1,
            }}
          >
            🖨️ {selectedCount}건 PDF 다운로드
          </button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 0, marginBottom: 16 }}>
        다중 선택 후 A4 라벨지에 인쇄. 인쇄된 라벨을 실물 자산에 부착하면 폰으로 QR 스캔 시 자산 정보 페이지가 열립니다.
      </p>
      <div style={{ display: 'grid', gap: 8, maxHeight: 600, overflow: 'auto' }}>
        {printableAssets.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>
            인쇄 가능한 자산이 없습니다.
          </div>
        ) : printableAssets.map(a => (
          <label key={a.id} style={{
            ...GLASS.L3, borderRadius: 8, padding: 10,
            border: `1px solid ${selected[a.id] ? COLORS.borderBlue : COLORS.borderSubtle}`,
            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
          }}>
            <input
              type="checkbox" checked={!!selected[a.id]}
              onChange={() => toggle(a.id)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 16 }}>{a.category_emoji}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: COLORS.primary, minWidth: 130 }}>
              {a.asset_code}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {a.name}
            </span>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>
              {a.assigned_user_name ? `👤 ${a.assigned_user_name}` : '— 공통 —'}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

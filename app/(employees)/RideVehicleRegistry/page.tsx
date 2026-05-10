'use client'

/**
 * /RideVehicleRegistry — 라이드 차량등록현황
 *
 * 카페24 ERP 의 pmccarsm 차량 마스터 (read-only) 보면서
 * 자체 FMI DB 의 ride_vehicles 테이블에 별도 등록/관리.
 *
 * - 좌측: 자체 DB ride_vehicles (관리/편집)
 * - 우측: 카페24 차량 검색 (참조 + "→ 자체 DB 등록" 버튼)
 *
 * 사이드바: 관리자 운영 > 라이드 차량등록
 * admin 전용
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import { usePermission } from '@/app/hooks/usePermission'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import RideOpsNavTabs from '@/app/components/ride-ops/NavTabs'
import RideOpsPageHeader from '@/app/components/ride-ops/PageHeader'

interface RideVehicle {
  id: string
  car_number: string
  car_model: string | null
  owner_name: string | null
  owner_phone: string | null
  cafe24_idno: string | null
  status: string
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface Cafe24Vehicle {
  carsidno: string
  carsfrdt: string
  carstodt: string
  carsnums: string | null
  carsodnm: string | null
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active: { label: '운영중', color: COLORS.success },
  paused: { label: '일시중지', color: COLORS.warning },
  inactive: { label: '폐기', color: COLORS.danger },
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return ''
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export default function RideVehicleRegistryPage() {
  const [user, setUser] = useState<{ role?: string; id?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  // hotfix 2026-05-09: admin-only → admin OR hasPageAccess (사이드바 권한 시스템 일치)
  const { hasPageAccess } = usePermission()
  const canAccess = user?.role === 'admin' || hasPageAccess('/RideVehicleRegistry')

  // 자체 DB
  const [rows, setRows] = useState<RideVehicle[]>([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [rowsError, setRowsError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'inactive'>(
    'all'
  )
  const [searchOwn, setSearchOwn] = useState('')

  // 카페24 검색
  const [cafe24Q, setCafe24Q] = useState('')
  const [cafe24Rows, setCafe24Rows] = useState<Cafe24Vehicle[]>([])
  const [cafe24Loading, setCafe24Loading] = useState(false)

  // 신규 등록 모달
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerInit, setRegisterInit] = useState<Partial<RideVehicle> | null>(null)

  // 편집 모달
  const [editing, setEditing] = useState<RideVehicle | null>(null)

  useEffect(() => {
    setUser(getStoredUser())
    setAuthChecked(true)
  }, [])

  const fetchOwnList = useMemo(
    () =>
      async function () {
        setRowsLoading(true)
        setRowsError(null)
        try {
          const token = getStoredToken()
          const params = new URLSearchParams()
          if (statusFilter !== 'all') params.set('status', statusFilter)
          if (searchOwn.trim()) params.set('q', searchOwn.trim())
          const res = await fetch(`/api/ride-vehicles?${params}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          if (!res.ok || !json.success) {
            setRowsError(json.error || `HTTP ${res.status}`)
            setRows([])
          } else {
            setRows(json.data || [])
            if (json.meta?._migration_pending) {
              setRowsError('⚠ 마이그레이션 미적용 — DB 관리자에게 문의 (migrations/2026-05-06_ride_vehicles.sql)')
            }
          }
        } catch (e) {
          setRowsError(String(e))
        } finally {
          setRowsLoading(false)
        }
      },
    [statusFilter, searchOwn]
  )

  useEffect(() => {
    if (!authChecked || !canAccess) return
    fetchOwnList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, user?.role, statusFilter])

  const searchCafe24 = useMemo(
    () =>
      async function () {
        const q = cafe24Q.trim()
        if (q.length < 1) {
          setCafe24Rows([])
          return
        }
        setCafe24Loading(true)
        try {
          const token = getStoredToken()
          const params = new URLSearchParams({ q, limit: '50' })
          const res = await fetch(`/api/cafe24/vehicles/search?${params}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          setCafe24Rows(json.success && json.data ? json.data : [])
        } catch {
          setCafe24Rows([])
        } finally {
          setCafe24Loading(false)
        }
      },
    [cafe24Q]
  )

  function openRegisterFromCafe24(c: Cafe24Vehicle) {
    setRegisterInit({
      car_number: c.carsnums || '',
      car_model: c.carsodnm || '',
      cafe24_idno: c.carsidno || null,
    })
    setRegisterOpen(true)
  }

  function openRegisterEmpty() {
    setRegisterInit(null)
    setRegisterOpen(true)
  }

  if (!authChecked) {
    return <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
  }
  if (!canAccess) {
    return (
      <div
        style={{
          padding: 32,
          ...GLASS.L4,
          borderRadius: 12,
          maxWidth: 520,
          margin: '40px auto',
        }}
      >
        <h2 style={{ marginTop: 0, color: COLORS.danger }}>🔒 접근 권한 없음</h2>
        <p style={{ color: COLORS.textSecondary }}>본 페이지는 관리자 전용입니다.</p>
      </div>
    )
  }

  // ── 자체 DB 컬럼 ──
  const ownColumns: TableColumn<RideVehicle>[] = [
    {
      key: 'car_number',
      label: '차량번호',
      width: 120,
      sortBy: (r) => r.car_number || '',
      render: (r) => (
        <span
          style={{
            whiteSpace: 'nowrap',
            color: COLORS.textPrimary,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          🚗 {r.car_number}
        </span>
      ),
    },
    {
      key: 'car_model',
      label: '차종',
      sortBy: (r) => r.car_model || '',
      render: (r) => (
        <span
          style={{
            color: COLORS.textSecondary,
            fontSize: 12,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
            maxWidth: 220,
          }}
          title={r.car_model || ''}
        >
          {r.car_model || '-'}
        </span>
      ),
    },
    {
      key: 'owner_name',
      label: '차주',
      width: 100,
      sortBy: (r) => r.owner_name || '',
      render: (r) => (
        <span style={{ color: COLORS.textSecondary, fontSize: 12, whiteSpace: 'nowrap' }}>
          {r.owner_name || '-'}
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      width: 80,
      sortBy: (r) => r.status,
      render: (r) => {
        const meta = STATUS_LABEL[r.status]
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              color: meta?.color || COLORS.textMuted,
              background: 'rgba(0,0,0,0.04)',
              whiteSpace: 'nowrap',
            }}
          >
            {meta?.label || r.status}
          </span>
        )
      },
    },
    {
      key: 'cafe24_idno',
      label: 'C24 매칭',
      width: 90,
      sortBy: (r) => r.cafe24_idno || '',
      render: (r) =>
        r.cafe24_idno ? (
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#7c3aed',
              padding: '1px 6px',
              borderRadius: 4,
              background: 'rgba(124,58,237,0.10)',
            }}
          >
            {r.cafe24_idno}
          </span>
        ) : (
          <span style={{ color: COLORS.textMuted, fontSize: 11 }}>-</span>
        ),
    },
    {
      key: 'created_at',
      label: '등록일',
      width: 100,
      sortBy: (r) => r.created_at || '',
      render: (r) => (
        <span style={{ fontSize: 12, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
          {fmtDate(r.created_at)}
        </span>
      ),
    },
  ]

  return (
    <>
    <RideOpsNavTabs />
    <div style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}>
      {/* PR-6.13.b — 디자인 표준: breadcrumb (그룹명) + fontSize 20 + 헤더 박스 X */}
      <RideOpsPageHeader
        breadcrumb="관리자 운영"
        title="라이드 차량등록"
        emoji="🚗"
        sub="자체 DB + 카페24 read 통합"
        actions={
          <button
            onClick={openRegisterEmpty}
            style={{
              ...BTN.md,
              border: `1px solid ${COLORS.borderSubtle}`,
              background: COLORS.bgGreen,
              color: COLORS.success,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            + 신규 등록
          </button>
        }
      />

      {/* 좌우 2단 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* 좌: 자체 DB */}
        <div>
          <div
            style={{
              ...GLASS.L2,
              borderRadius: 12,
              padding: '10px 14px',
              marginBottom: 10,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
              📋 자체 DB
            </span>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>{rows.length}건</span>
            {(['all', 'active', 'paused', 'inactive'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                style={{
                  ...BTN.sm,
                  border: `1px solid ${statusFilter === v ? COLORS.primary : COLORS.borderSubtle}`,
                  background: statusFilter === v ? COLORS.bgBlue : 'rgba(255,255,255,0.6)',
                  color: statusFilter === v ? COLORS.primary : COLORS.textSecondary,
                  cursor: 'pointer',
                }}
              >
                {v === 'all' ? '전체' : STATUS_LABEL[v]?.label || v}
              </button>
            ))}
            <input
              type="text"
              placeholder="차량/차종/차주..."
              value={searchOwn}
              onChange={(e) => setSearchOwn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchOwnList()
              }}
              style={{
                ...GLASS.L1,
                flex: 1,
                minWidth: 120,
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 12,
                border: `1px solid ${COLORS.borderFaint}`,
              }}
            />
            <button
              onClick={() => fetchOwnList()}
              style={{
                ...BTN.sm,
                border: `1px solid ${COLORS.borderSubtle}`,
                background: 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
              }}
            >
              검색
            </button>
          </div>

          {rowsError && (
            <div
              style={{
                ...GLASS.L4,
                background: COLORS.bgAmber,
                border: `1px solid ${COLORS.borderAmber}`,
                borderRadius: 10,
                padding: '8px 12px',
                marginBottom: 10,
                color: COLORS.warning,
                fontSize: 12,
              }}
            >
              {rowsError}
            </div>
          )}

          <div style={{ ...GLASS.L4, borderRadius: 12, padding: 4, overflow: 'hidden' }}>
            <NeuDataTable
              columns={ownColumns}
              data={rows}
              rowKey={(r) => r.id}
              loading={rowsLoading}
              emptyIcon="🚗"
              emptyMessage="등록된 차량이 없습니다 — 우측 카페24 검색에서 추가하거나 + 신규 등록"
              defaultSort={{ key: 'created_at', dir: 'desc' }}
              onRowClick={(r) => setEditing(r)}
            />
          </div>
        </div>

        {/* 우: 카페24 검색 */}
        <div>
          <div
            style={{
              ...GLASS.L2,
              borderRadius: 12,
              padding: '10px 14px',
              marginBottom: 10,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>
              🔍 카페24 검색
            </span>
            <input
              type="text"
              placeholder="차량번호 / 차종 / 차주..."
              value={cafe24Q}
              onChange={(e) => setCafe24Q(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') searchCafe24()
              }}
              style={{
                ...GLASS.L1,
                flex: 1,
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 12,
                border: `1px solid ${COLORS.borderFaint}`,
              }}
            />
            <button
              onClick={() => searchCafe24()}
              disabled={cafe24Loading}
              style={{
                ...BTN.sm,
                border: `1px solid ${COLORS.borderSubtle}`,
                background: 'rgba(124,58,237,0.10)',
                color: '#7c3aed',
                cursor: 'pointer',
              }}
            >
              {cafe24Loading ? '검색 중...' : '검색'}
            </button>
          </div>

          <div
            style={{
              ...GLASS.L4,
              borderRadius: 12,
              padding: 8,
              maxHeight: 'calc(100vh - 240px)',
              overflow: 'auto',
            }}
          >
            {cafe24Rows.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
                {cafe24Q ? '검색 결과 없음' : '카페24 차량 검색어 입력'}
              </div>
            ) : (
              cafe24Rows.map((c) => {
                const alreadyRegistered = rows.find(
                  (r) => r.cafe24_idno === c.carsidno || r.car_number === c.carsnums
                )
                return (
                  <div
                    key={c.carsidno + c.carsfrdt}
                    style={{
                      padding: '8px 12px',
                      borderBottom: `1px solid ${COLORS.borderFaint}`,
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      background: alreadyRegistered ? 'rgba(0,0,0,0.02)' : 'transparent',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: COLORS.textPrimary,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        🚗 {c.carsnums || '-'}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: COLORS.textMuted,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={c.carsodnm || ''}
                      >
                        {c.carsodnm || '-'}
                      </div>
                    </div>
                    {alreadyRegistered ? (
                      <span
                        style={{
                          fontSize: 10,
                          color: COLORS.success,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: COLORS.bgGreen,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ✓ 등록됨
                      </span>
                    ) : (
                      <button
                        onClick={() => openRegisterFromCafe24(c)}
                        style={{
                          ...BTN.sm,
                          border: `1px solid ${COLORS.borderSubtle}`,
                          background: COLORS.bgGreen,
                          color: COLORS.success,
                          cursor: 'pointer',
                          fontSize: 11,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        + 등록
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* 신규 등록 모달 */}
      {registerOpen && (
        <RegisterModal
          init={registerInit}
          onClose={() => {
            setRegisterOpen(false)
            setRegisterInit(null)
          }}
          onCreated={() => {
            setRegisterOpen(false)
            setRegisterInit(null)
            fetchOwnList()
          }}
        />
      )}

      {/* 편집 모달 */}
      {editing && (
        <EditModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            fetchOwnList()
          }}
        />
      )}
    </div>
    </>
  )
}

// ── 신규 등록 모달 ──────────────────────────────────────────────
function RegisterModal({
  init,
  onClose,
  onCreated,
}: {
  init: Partial<RideVehicle> | null
  onClose: () => void
  onCreated: () => void
}) {
  const [carNumber, setCarNumber] = useState(init?.car_number || '')
  const [carModel, setCarModel] = useState(init?.car_model || '')
  const [ownerName, setOwnerName] = useState(init?.owner_name || '')
  const [ownerPhone, setOwnerPhone] = useState(init?.owner_phone || '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!carNumber.trim()) {
      setError('차량번호 필수')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-vehicles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          car_number: carNumber.trim(),
          car_model: carModel.trim() || null,
          owner_name: ownerName.trim() || null,
          owner_phone: ownerPhone.trim() || null,
          cafe24_idno: init?.cafe24_idno || null,
          note: note.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || `HTTP ${res.status}`)
      } else {
        onCreated()
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return <ModalShell title="🚗 신규 차량 등록" onClose={onClose}>
    <ModalForm
      carNumber={carNumber}
      setCarNumber={setCarNumber}
      carModel={carModel}
      setCarModel={setCarModel}
      ownerName={ownerName}
      setOwnerName={setOwnerName}
      ownerPhone={ownerPhone}
      setOwnerPhone={setOwnerPhone}
      note={note}
      setNote={setNote}
      cafe24Idno={init?.cafe24_idno || null}
      error={error}
      saving={saving}
      onSave={save}
      onClose={onClose}
      saveLabel="등록"
    />
  </ModalShell>
}

// ── 편집 모달 ──────────────────────────────────────────────────
function EditModal({
  row,
  onClose,
  onSaved,
}: {
  row: RideVehicle
  onClose: () => void
  onSaved: () => void
}) {
  const [carNumber, setCarNumber] = useState(row.car_number)
  const [carModel, setCarModel] = useState(row.car_model || '')
  const [ownerName, setOwnerName] = useState(row.owner_name || '')
  const [ownerPhone, setOwnerPhone] = useState(row.owner_phone || '')
  const [note, setNote] = useState(row.note || '')
  const [status, setStatus] = useState(row.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-vehicles/${row.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          car_number: carNumber.trim(),
          car_model: carModel.trim() || null,
          owner_name: ownerName.trim() || null,
          owner_phone: ownerPhone.trim() || null,
          note: note.trim() || null,
          status,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || `HTTP ${res.status}`)
      } else {
        onSaved()
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return <ModalShell title="🚗 차량 편집" onClose={onClose}>
    <ModalForm
      carNumber={carNumber}
      setCarNumber={setCarNumber}
      carModel={carModel}
      setCarModel={setCarModel}
      ownerName={ownerName}
      setOwnerName={setOwnerName}
      ownerPhone={ownerPhone}
      setOwnerPhone={setOwnerPhone}
      note={note}
      setNote={setNote}
      cafe24Idno={row.cafe24_idno}
      status={status}
      setStatus={setStatus}
      error={error}
      saving={saving}
      onSave={save}
      onClose={onClose}
      saveLabel="저장"
    />
  </ModalShell>
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15,23,42,0.32)',
        backdropFilter: 'blur(2px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.L4,
          width: 480,
          maxWidth: '94vw',
          padding: '20px 24px',
          borderRadius: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
            paddingBottom: 10,
            borderBottom: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              ...BTN.sm,
              border: `1px solid ${COLORS.borderSubtle}`,
              background: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalForm(props: {
  carNumber: string
  setCarNumber: (v: string) => void
  carModel: string
  setCarModel: (v: string) => void
  ownerName: string
  setOwnerName: (v: string) => void
  ownerPhone: string
  setOwnerPhone: (v: string) => void
  note: string
  setNote: (v: string) => void
  cafe24Idno: string | null
  status?: string
  setStatus?: (v: string) => void
  error: string | null
  saving: boolean
  onSave: () => void
  onClose: () => void
  saveLabel: string
}) {
  const inputStyle: React.CSSProperties = {
    ...GLASS.L1,
    width: '100%',
    padding: '7px 12px',
    borderRadius: 8,
    fontSize: 13,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.borderFaint}`,
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textMuted,
    marginBottom: 4,
    display: 'block',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {props.cafe24Idno && (
        <div
          style={{
            background: 'rgba(124,58,237,0.06)',
            border: `1px solid rgba(124,58,237,0.20)`,
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 11,
            color: '#7c3aed',
          }}
        >
          🔗 카페24 매칭: <code style={{ fontFamily: 'monospace' }}>{props.cafe24Idno}</code>
        </div>
      )}
      <div>
        <label style={labelStyle}>차량번호 *</label>
        <input
          type="text"
          value={props.carNumber}
          onChange={(e) => props.setCarNumber(e.target.value)}
          placeholder="예: 47하9604"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>차종/모델</label>
        <input
          type="text"
          value={props.carModel}
          onChange={(e) => props.setCarModel(e.target.value)}
          placeholder="예: 쏠라티(MQ4)-1.6 하이브리드"
          style={inputStyle}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>차주명</label>
          <input
            type="text"
            value={props.ownerName}
            onChange={(e) => props.setOwnerName(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>차주 연락처</label>
          <input
            type="text"
            value={props.ownerPhone}
            onChange={(e) => props.setOwnerPhone(e.target.value)}
            placeholder="010-..."
            style={inputStyle}
          />
        </div>
      </div>
      {props.setStatus && (
        <div>
          <label style={labelStyle}>상태</label>
          <select
            value={props.status || 'active'}
            onChange={(e) => props.setStatus?.(e.target.value)}
            style={inputStyle}
          >
            <option value="active">운영중</option>
            <option value="paused">일시중지</option>
            <option value="inactive">폐기</option>
          </select>
        </div>
      )}
      <div>
        <label style={labelStyle}>비고</label>
        <textarea
          value={props.note}
          onChange={(e) => props.setNote(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>
      {props.error && (
        <div
          style={{
            background: COLORS.bgRed,
            border: `1px solid ${COLORS.borderRed}`,
            borderRadius: 6,
            padding: '6px 10px',
            color: COLORS.danger,
            fontSize: 12,
          }}
        >
          ⚠ {props.error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
        <button
          onClick={props.onClose}
          disabled={props.saving}
          style={{
            ...BTN.md,
            border: `1px solid ${COLORS.borderSubtle}`,
            background: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
          }}
        >
          취소
        </button>
        <button
          onClick={props.onSave}
          disabled={props.saving}
          style={{
            ...BTN.md,
            border: `1px solid ${COLORS.borderSubtle}`,
            background: COLORS.bgGreen,
            color: COLORS.success,
            cursor: 'pointer',
            fontWeight: 700,
            opacity: props.saving ? 0.6 : 1,
          }}
        >
          {props.saving ? '저장 중...' : props.saveLabel}
        </button>
      </div>
    </div>
  )
}

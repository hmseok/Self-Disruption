'use client'

/**
 * /RideSettlements — 고객사 마감자료 등록 / 검수 / 매칭
 *
 * PR-6.11.a (UI 1차)
 *
 * 정산서 = 운영 진실의 source
 *   · 정산 포함 = 진행 중 / 미포함 = 종료
 *   · 정산 검수 (라이드 측 확정/이의제기)
 *   · 차량/실행번호 → 카페24 매칭 (PR-6.11.b)
 *   · 미등록 고객 후보 추출 (PR-6.11.d)
 *
 * 사이드바: 관리자 운영 > 💰 고객사 마감자료
 * admin 전용
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import { usePermission } from '@/app/hooks/usePermission'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import RideOpsNavTabs from '@/app/components/ride-ops/NavTabs'

interface Settlement {
  id: string
  customer_id: string | null
  customer_name_snap: string | null
  parent_settlement_id: string | null
  layout_type: string
  layout_signature: string | null
  category: string | null
  source_file: string | null
  sheet_name: string | null
  period_label: string | null
  item_count: number
  total_supply: string | null
  total_vat: string | null
  total_amount: string | null
  status: string
  reviewed_by_name: string | null
  reviewed_at: string | null
  dispute_reason: string | null
  note: string | null
  created_at: string
  updated_at: string
}

interface Company {
  id: string
  name: string
  type: string | null
}

interface SettlementItem {
  id: string
  car_number: string | null
  car_model: string | null
  exec_no: string | null
  cust_name: string | null
  sub_customer: string | null
  product_name: string | null
  total_amount: string | null
  exec_status: string | null
  exec_date: string | null
  closing_date: string | null
  termination_date: string | null
  match_status: string | null
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: '검수 대기', color: COLORS.warning },
  reviewing: { label: '검수 중', color: COLORS.primary },
  confirmed: { label: '확정', color: COLORS.success },
  disputed: { label: '이의제기', color: COLORS.danger },
}

function fmtAmount(v: string | null | undefined): string {
  if (!v) return '-'
  const n = Number(v)
  if (!Number.isFinite(n)) return v
  return n.toLocaleString('ko-KR')
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '-'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.substring(0, 10)
  return v
}

export default function RideSettlementsPage() {
  const [user, setUser] = useState<{ role?: string; id?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  // hotfix 2026-05-09: admin-only → admin OR hasPageAccess (사이드바 권한 시스템 일치)
  const { hasPageAccess } = usePermission()
  const canAccess = user?.role === 'admin' || hasPageAccess('/RideSettlements')

  const [companies, setCompanies] = useState<Company[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<{ customer_id: string; status: string; period: string }>({
    customer_id: '',
    status: '',
    period: '',
  })

  const [uploadOpen, setUploadOpen] = useState(false)
  const [detail, setDetail] = useState<Settlement | null>(null)

  useEffect(() => {
    setUser(getStoredUser())
    setAuthChecked(true)
  }, [])

  const fetchCompanies = useMemo(
    () =>
      async function () {
        try {
          const token = getStoredToken()
          const res = await fetch('/api/ride-customer-companies?all=1', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          if (json.success) setCompanies(json.data || [])
        } catch (e) {
          console.error(e)
        }
      },
    []
  )

  const fetchSettlements = useMemo(
    () =>
      async function () {
        setLoading(true)
        setError(null)
        try {
          const token = getStoredToken()
          const params = new URLSearchParams()
          if (filter.customer_id) params.set('customer_id', filter.customer_id)
          if (filter.status) params.set('status', filter.status)
          if (filter.period) params.set('period', filter.period)
          params.set('parent_only', '1')
          const res = await fetch(`/api/ride-settlements?${params}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          if (!res.ok || !json.success) {
            setError(json.error || `HTTP ${res.status}`)
            setSettlements([])
          } else {
            setSettlements(json.data || [])
            if (json.meta?._migration_pending) {
              setError('⚠ 마이그레이션 미적용 — migrations/2026-05-08_ride_settlements.sql')
            }
          }
        } catch (e) {
          setError(String(e))
        } finally {
          setLoading(false)
        }
      },
    [filter]
  )

  useEffect(() => {
    if (!authChecked || !canAccess) return
    fetchCompanies()
    fetchSettlements()
  }, [authChecked, user, fetchCompanies, fetchSettlements])

  if (!authChecked) return <div style={{ padding: 24, color: COLORS.textSecondary }}>인증 확인 중…</div>
  if (!canAccess)
    return <div style={{ padding: 24, color: COLORS.danger }}>⚠ 권한 필요 (관리자 또는 페이지 권한)</div>

  const cols: TableColumn<Settlement>[] = [
    {
      key: 'period',
      label: '기간',
      sortBy: r => r.period_label || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{r.period_label || '-'}</span>,
    },
    {
      key: 'customer',
      label: '위탁사',
      sortBy: r => r.customer_name_snap || '',
      render: r => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {r.customer_name_snap || (r.layout_type === 'parent' ? '🔀 통합' : '-')}
        </span>
      ),
    },
    {
      key: 'layout',
      label: '양식',
      sortBy: r => r.layout_signature || '',
      render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: COLORS.textMuted }}>{r.layout_signature || '-'}</span>,
    },
    {
      key: 'category',
      label: '카테고리',
      sortBy: r => r.category || '',
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{r.category || '-'}</span>,
    },
    {
      key: 'item_count',
      label: '건수',
      align: 'right',
      sortBy: r => r.item_count,
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{r.item_count.toLocaleString('ko-KR')}</span>,
    },
    {
      key: 'total_amount',
      label: '합계',
      align: 'right',
      sortBy: r => Number(r.total_amount || 0),
      render: r => <span style={{ whiteSpace: 'nowrap' }}>{fmtAmount(r.total_amount)}</span>,
    },
    {
      key: 'status',
      label: '상태',
      sortBy: r => r.status,
      render: r => {
        const s = STATUS_LABEL[r.status] || { label: r.status, color: COLORS.neutral }
        return (
          <span style={{ color: s.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {s.label}
          </span>
        )
      },
    },
    {
      key: 'reviewed_at',
      label: '검수',
      sortBy: r => r.reviewed_at || '',
      render: r =>
        r.reviewed_at ? (
          <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
            {fmtDate(r.reviewed_at)} · {r.reviewed_by_name || '-'}
          </span>
        ) : (
          <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: COLORS.textMuted }}>-</span>
        ),
    },
    {
      key: 'detail',
      label: '상세',
      render: r => (
        <button style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary }} onClick={() => setDetail(r)}>
          보기
        </button>
      ),
    },
  ]

  return (
    <>
    <RideOpsNavTabs />
    <div style={{ padding: 16, maxWidth: 1600, margin: '0 auto' }}>
      {/* PR-6.13.c — PageTitle 자동 mount, 자체 헤더 X */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          style={{ ...BTN.md, background: COLORS.bgGreen, color: COLORS.success, border: `1px solid ${COLORS.borderGreen}` }}
          onClick={() => setUploadOpen(true)}
        >
          📥 정산서 업로드
        </button>
      </div>

      {/* 필터 */}
      <div style={{ ...GLASS.L4, padding: 16, borderRadius: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)' }}
            value={filter.customer_id}
            onChange={e => setFilter(s => ({ ...s, customer_id: e.target.value }))}
          >
            <option value="">전체 위탁사</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)' }}
            value={filter.status}
            onChange={e => setFilter(s => ({ ...s, status: e.target.value }))}
          >
            <option value="">전체 상태</option>
            <option value="pending">검수 대기</option>
            <option value="reviewing">검수 중</option>
            <option value="confirmed">확정</option>
            <option value="disputed">이의제기</option>
          </select>
          <input
            type="text"
            placeholder="기간 (예: 2026-04)"
            style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)' }}
            value={filter.period}
            onChange={e => setFilter(s => ({ ...s, period: e.target.value }))}
          />
          <span style={{ color: COLORS.textMuted, fontSize: 12, marginLeft: 'auto' }}>
            {loading ? '로딩 중…' : `${settlements.length}건 (parent only)`}
          </span>
        </div>
        {error && (
          <div style={{ padding: 8, background: COLORS.bgRed, color: COLORS.danger, borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
            {error}
          </div>
        )}
        <NeuDataTable
          columns={cols}
          data={settlements}
          rowKey={r => r.id}
          defaultSort={{ key: 'period', dir: 'desc' }}
          emptyMessage="정산서 없음 — [📥 정산서 업로드] 버튼으로 엑셀 업로드"
        />
      </div>

      {uploadOpen && (
        <UploadModal
          companies={companies}
          onClose={() => setUploadOpen(false)}
          onApplied={() => {
            fetchSettlements()
          }}
        />
      )}

      {detail && (
        <SettlementDetailDrawer
          settlement={detail}
          companies={companies}
          onClose={() => setDetail(null)}
          onSaved={() => {
            fetchSettlements()
            // refresh detail
            setDetail(null)
          }}
        />
      )}
    </div>
    </>
  )
}

// ────────────────────────── 업로드 모달 ────────────────────────────
// PR-6.11.a-fix — 다중 파일 업로드 지원
interface FileItem {
  id: string
  file: File
  customerId: string
  periodLabel: string
  layout: 'auto' | 'meritz' | 'im' | 'mg' | 'ride-integrated'
  password: string  // PR-6.11.e — 비밀번호 보호 정산서
  passwordNeeded: boolean  // 서버에서 비밀번호 요구 시 true
  passwordInvalid: boolean  // 비밀번호 불일치 시 true
  busy: boolean
  result: { parent_settlement_id: string | null; total_inserted: number; children: { sheet: string; settlement_id: string; inserted: number }[] } | null
  detected: { layout?: string; period_label?: string; customer_name?: string; sheet_count?: number; total_items?: number } | null
  error: string | null
}

function UploadModal({
  companies,
  onClose,
  onApplied,
}: {
  companies: Company[]
  onClose: () => void
  onApplied: () => void
}) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [defaultCustomerId, setDefaultCustomerId] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)
  const [hover, setHover] = useState(false)

  const addFiles = (fl: FileList | null) => {
    if (!fl || fl.length === 0) return
    const items: FileItem[] = Array.from(fl).map(f => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      file: f,
      customerId: defaultCustomerId,
      periodLabel: '',
      layout: 'auto',
      password: '',  // PR-6.11.e
      passwordNeeded: false,
      passwordInvalid: false,
      busy: false,
      result: null,
      detected: null,
      error: null,
    }))
    setFiles(prev => [...prev, ...items])
  }

  const updateField = (id: string, patch: Partial<FileItem>) => {
    setFiles(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)))
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const submitOne = async (id: string, mode: 'preview' | 'apply') => {
    const item = files.find(f => f.id === id)
    if (!item) return
    updateField(id, { busy: true, error: null, passwordNeeded: false, passwordInvalid: false })
    try {
      const token = getStoredToken()
      const fd = new FormData()
      fd.append('file', item.file)
      if (item.customerId) fd.append('customer_id', item.customerId)
      if (item.periodLabel) fd.append('period_label', item.periodLabel)
      fd.append('layout', item.layout)
      fd.append('mode', mode)
      if (item.password) fd.append('password', item.password)  // PR-6.11.e
      const res = await fetch('/api/ride-settlements/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      const text = await res.text()
      let json: {
        success?: boolean
        error?: string
        message?: string
        _password_needed?: boolean
        _password_invalid?: boolean
        detected?: { layout?: string; period_label?: string; customer_name?: string; sheet_count?: number; total_items?: number }
        result?: { parent_settlement_id: string | null; total_inserted: number; children: { sheet: string; settlement_id: string; inserted: number }[] }
      }
      try {
        json = JSON.parse(text)
      } catch {
        updateField(id, { busy: false, error: `서버 ${res.status}: ${text.slice(0, 80)}` })
        return
      }
      if (!res.ok || !json.success) {
        // PR-6.11.e — password 보호 응답 처리
        if (json._password_needed) {
          updateField(id, {
            busy: false,
            passwordNeeded: true,
            error: json.message || '비밀번호 보호 파일 — 비밀번호 입력 필요',
          })
          return
        }
        if (json._password_invalid) {
          updateField(id, {
            busy: false,
            passwordNeeded: true,
            passwordInvalid: true,
            error: json.message || '비밀번호 불일치',
          })
          return
        }
        updateField(id, { busy: false, error: json.error || `HTTP ${res.status}` })
        return
      }
      if (mode === 'preview') {
        updateField(id, { busy: false, detected: json.detected || null })
      } else {
        updateField(id, { busy: false, result: json.result || null, detected: json.detected || null })
        onApplied()
      }
    } catch (e) {
      updateField(id, { busy: false, error: String(e) })
    }
  }

  const applyAll = async () => {
    setBulkApplying(true)
    for (const f of files) {
      if (f.result) continue
      await submitOne(f.id, 'apply')
    }
    setBulkApplying(false)
  }

  const totalInserted = files.reduce((s, f) => s + (f.result?.total_inserted || 0), 0)
  const pendingCount = files.filter(f => !f.result).length

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ ...GLASS.L4, borderRadius: 16, padding: 20, width: '100%', maxWidth: 900, maxHeight: '92vh', overflow: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>📥 마감자료 업로드 (다중 파일 + 양식 자동 감지)</span>
          <button style={{ ...BTN.sm, background: 'transparent', color: COLORS.textMuted }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {/* 기본 위탁사 (모든 파일 일괄 적용) */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>
              기본 위탁사 (모든 파일):
            </span>
            <select
              value={defaultCustomerId}
              onChange={e => {
                const v = e.target.value
                setDefaultCustomerId(v)
                setFiles(prev => prev.map(f => ({ ...f, customerId: v, result: null })))
              }}
              style={{ padding: 6, borderRadius: 6, border: '1px solid rgba(0,0,0,0.10)', minWidth: 200 }}
            >
              <option value="">파일별 자동 추정</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* 드래그 & 드롭 영역 */}
          <label
            onDragOver={e => {
              e.preventDefault()
              setHover(true)
            }}
            onDragLeave={() => setHover(false)}
            onDrop={e => {
              e.preventDefault()
              setHover(false)
              addFiles(e.dataTransfer.files)
            }}
            style={{
              ...GLASS.L1,
              display: 'block',
              border: hover ? `2px dashed ${COLORS.primary}` : '2px dashed rgba(0,0,0,0.15)',
              borderRadius: 12,
              padding: '20px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              background: hover ? COLORS.bgBlue : GLASS.L1.background,
            }}
          >
            <input
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={e => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: 22, marginBottom: 4 }}>📁</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>파일을 끌어오거나 클릭해서 선택</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
              .xlsx / .xls — 여러 파일 동시 선택 · 파일별 양식 자동 감지
            </div>
          </label>

          {/* 파일별 카드 */}
          {files.length === 0 ? (
            <div style={{ textAlign: 'center', color: COLORS.textMuted, fontSize: 12, padding: 16 }}>
              파일을 추가하면 파일별 설정이 노출됩니다
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, maxHeight: '50vh', overflow: 'auto' }}>
              {files.map(f => (
                <div
                  key={f.id}
                  style={{
                    ...GLASS.L3,
                    border: `1px solid ${
                      f.result ? COLORS.borderGreen : f.error ? COLORS.borderRed : f.detected ? COLORS.borderBlue : COLORS.borderSubtle
                    }`,
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📄 {f.file.name}
                    </span>
                    <span style={{ fontSize: 10, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                      {(f.file.size / 1024).toFixed(0)} KB
                    </span>
                    <button onClick={() => removeFile(f.id)} style={{ ...BTN.sm, background: 'transparent', color: COLORS.textMuted }}>
                      ✕
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                    <select
                      value={f.layout}
                      onChange={e => updateField(f.id, { layout: e.target.value as FileItem['layout'], result: null, detected: null })}
                      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.10)' }}
                    >
                      <option value="auto">양식: 자동</option>
                      <option value="meritz">메리츠</option>
                      <option value="im">iM캐피탈</option>
                      <option value="mg">MG (턴키/실비)</option>
                      <option value="ride-integrated">라이드 통합</option>
                    </select>
                    <select
                      value={f.customerId}
                      onChange={e => updateField(f.id, { customerId: e.target.value, result: null })}
                      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.10)' }}
                    >
                      <option value="">위탁사 자동</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="기간 (자동)"
                      value={f.periodLabel}
                      onChange={e => updateField(f.id, { periodLabel: e.target.value })}
                      style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.10)', width: 110 }}
                    />
                    <input
                      type="password"
                      placeholder="🔑 비밀번호 (선택)"
                      value={f.password}
                      onChange={e => updateField(f.id, { password: e.target.value, passwordInvalid: false })}
                      style={{
                        fontSize: 11,
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: f.passwordInvalid
                          ? `2px solid ${COLORS.danger}`
                          : f.passwordNeeded
                            ? `2px solid ${COLORS.warning}`
                            : '1px solid rgba(0,0,0,0.10)',
                        width: 140,
                      }}
                      autoFocus={f.passwordNeeded}
                    />
                    <button
                      style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary, marginLeft: 'auto' }}
                      onClick={() => submitOne(f.id, 'preview')}
                      disabled={f.busy}
                    >
                      {f.busy ? '...' : '👁 미리보기'}
                    </button>
                    <button
                      style={{ ...BTN.sm, background: COLORS.success, color: '#fff' }}
                      onClick={() => submitOne(f.id, 'apply')}
                      disabled={f.busy || !!f.result}
                    >
                      {f.busy ? '...' : '💾 저장'}
                    </button>
                  </div>

                  {f.detected && (
                    <div style={{ fontSize: 10, color: COLORS.textSecondary, padding: 6, background: GLASS.L2.background, borderRadius: 4 }}>
                      감지: <b>{f.detected.layout}</b> · {f.detected.period_label || '?'} · {f.detected.customer_name || '미지정'} · {f.detected.sheet_count} 시트 / 총 <b>{f.detected.total_items}</b>건
                    </div>
                  )}
                  {f.error && (
                    <div style={{ fontSize: 10, color: COLORS.danger, padding: 6, background: COLORS.bgRed, borderRadius: 4, marginTop: 4 }}>
                      ❌ {f.error}
                    </div>
                  )}
                  {f.result && (
                    <div style={{ fontSize: 10, color: COLORS.success, padding: 6, background: COLORS.bgGreen, borderRadius: 4, marginTop: 4 }}>
                      ✅ 적재 <b>{f.result.total_inserted}</b>건
                      {f.result.children.length > 0 && ` (시트 ${f.result.children.length}개)`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 총계 + 액션 */}
          {files.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
                파일 <b>{files.length}</b>개 · 저장 대기 <b>{pendingCount}</b>개
                {totalInserted > 0 && (
                  <span> · 누적 적재 <b style={{ color: COLORS.success }}>{totalInserted}</b>건</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...BTN.md, background: COLORS.bgGray, color: COLORS.textSecondary }} onClick={onClose}>
                  닫기
                </button>
                <button
                  style={{ ...BTN.md, background: COLORS.success, color: '#fff', opacity: pendingCount === 0 ? 0.5 : 1 }}
                  onClick={applyAll}
                  disabled={bulkApplying || pendingCount === 0}
                >
                  {bulkApplying ? '저장 중…' : `📥 ${pendingCount}개 일괄 저장`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────── 상세 drawer ──────────────────────────────
function SettlementDetailDrawer({
  settlement,
  companies,
  onClose,
  onSaved,
}: {
  settlement: Settlement
  companies: Company[]
  onClose: () => void
  onSaved: () => void
}) {
  const [items, setItems] = useState<SettlementItem[]>([])
  const [children, setChildren] = useState<Settlement[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')

  // PR-6.11.d 차량 등록
  const [extracted, setExtracted] = useState<{
    total_items: number
    unique_cars: number
    already_registered: number
    candidates_count: number
    cafe24_enriched: number
    candidates: Array<{
      item_id: string
      car_number: string
      exec_no: string | null
      car_model: string | null
      cust_name: string | null
      product_name: string | null
      cafe24_carsidno: string | null
      cafe24_owner: string | null
    }>
  } | null>(null)
  const [extractLoading, setExtractLoading] = useState(false)
  const [extractSelected, setExtractSelected] = useState<Set<string>>(new Set())
  const [promoting, setPromoting] = useState(false)
  const [promoteResult, setPromoteResult] = useState<{ requested: number; inserted: number; skipped: number; errors: number } | null>(null)

  // PR-6.11.c 검수 강화
  const [audit, setAudit] = useState<{
    total_items: number
    active: number
    closed: number
    sum_mismatch: number
    unmatched_count: number
    unmatched_large: number
    total_amount: number
    issues: Array<{
      item_id: string
      car_number: string | null
      exec_no: string | null
      cust_name: string | null
      issue_type: 'sum-mismatch' | 'unmatched-large' | 'status-conflict'
      detail: string
      amount: number
    }>
  } | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setItemsLoading(true)
      try {
        const token = getStoredToken()
        // 자녀 + items 동시 조회
        const detailRes = await fetch(`/api/ride-settlements/${settlement.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        })
        const detailJson = await detailRes.json()
        if (!cancelled && detailJson.success) {
          setChildren(detailJson.children || [])
        }
        // 자기 settlement 의 items (parent 면 빈 결과)
        const itemsRes = await fetch(`/api/ride-settlements/${settlement.id}/items?limit=200`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        })
        const itemsJson = await itemsRes.json()
        if (!cancelled && itemsJson.success) setItems(itemsJson.data || [])
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setItemsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [settlement.id])

  const runExtract = async () => {
    setExtractLoading(true)
    setPromoteResult(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-settlements/${settlement.id}/extract-vehicles`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      if (json.success) {
        setExtracted(json.data)
        setExtractSelected(new Set(json.data.candidates.map((c: { item_id: string }) => c.item_id)))
      }
    } catch (e) {
      console.error('[extract]', e)
    } finally {
      setExtractLoading(false)
    }
  }

  const runPromote = async () => {
    if (extractSelected.size === 0) return
    setPromoting(true)
    setPromoteResult(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-settlements/${settlement.id}/extract-vehicles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ item_ids: Array.from(extractSelected) }),
      })
      const json = await res.json()
      if (json.success) {
        setPromoteResult(json.result)
        setExtractSelected(new Set())
        runExtract()  // 다시 분석
      }
    } catch (e) {
      console.error('[promote]', e)
    } finally {
      setPromoting(false)
    }
  }

  const runAudit = async () => {
    setAuditLoading(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-settlements/${settlement.id}/audit`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      if (json.success) setAudit(json.data)
    } catch (e) {
      console.error('[audit]', e)
    } finally {
      setAuditLoading(false)
    }
  }

  const updateStatus = async (newStatus: string, reason?: string) => {
    setReviewing(true)
    try {
      const token = getStoredToken()
      const body: Record<string, string> = { status: newStatus }
      if (newStatus === 'disputed' && reason) body.dispute_reason = reason
      const res = await fetch(`/api/ride-settlements/${settlement.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        onSaved()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setReviewing(false)
    }
  }

  const customerName = companies.find(c => c.id === settlement.customer_id)?.name || settlement.customer_name_snap || '미지정'
  const cur = STATUS_LABEL[settlement.status] || { label: settlement.status, color: COLORS.neutral }

  const itemCols: TableColumn<SettlementItem>[] = [
    { key: 'car_number', label: '차량', sortBy: r => r.car_number || '', render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{r.car_number || '-'}</span> },
    { key: 'car_model', label: '차종', sortBy: r => r.car_model || '', render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{(r.car_model || '').substring(0, 20)}</span> },
    { key: 'cust_name', label: '고객/임차인', sortBy: r => r.cust_name || '', render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{(r.sub_customer || r.cust_name || '').substring(0, 16)}</span> },
    { key: 'product', label: '상품', sortBy: r => r.product_name || '', render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: COLORS.textMuted }}>{r.product_name || '-'}</span> },
    { key: 'amount', label: '금액', align: 'right', sortBy: r => Number(r.total_amount || 0), render: r => <span style={{ whiteSpace: 'nowrap' }}>{fmtAmount(r.total_amount)}</span> },
    { key: 'status', label: '실행', sortBy: r => r.exec_status || '', render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: r.exec_status === '마감' ? COLORS.danger : COLORS.textPrimary }}>{r.exec_status || '-'}</span> },
    { key: 'match', label: '매칭', sortBy: r => r.match_status || '', render: r => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: r.match_status === 'matched' ? COLORS.success : COLORS.textMuted }}>{r.match_status || '미매칭'}</span> },
  ]

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
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...GLASS.L4,
          width: 800,
          maxWidth: '100vw',
          height: '100vh',
          overflow: 'auto',
          padding: '20px 24px',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${COLORS.borderSubtle}`, gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>
              💰 {customerName} · {settlement.period_label || '-'}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              {settlement.layout_signature} · {settlement.category || '-'} · {settlement.item_count.toLocaleString()}건 · 합계 {fmtAmount(settlement.total_amount)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: cur.color, fontSize: 12, fontWeight: 700, padding: '4px 10px', background: GLASS.L2.background, borderRadius: 6 }}>
              {cur.label}
            </span>
            <button style={{ ...BTN.sm, background: 'transparent', color: COLORS.textMuted }} onClick={onClose}>
              × 닫기
            </button>
          </div>
        </div>

        {/* 검수 액션 */}
        {settlement.layout_type !== 'parent' && (
          <div style={{ ...GLASS.L3, padding: 12, borderRadius: 8, marginBottom: 12, border: `1px solid ${COLORS.borderBlue}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📋 검수 액션</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {settlement.status !== 'reviewing' && (
                <button style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary }} onClick={() => updateStatus('reviewing')} disabled={reviewing}>
                  검수 시작
                </button>
              )}
              {settlement.status !== 'confirmed' && (
                <button style={{ ...BTN.sm, background: COLORS.success, color: '#fff' }} onClick={() => updateStatus('confirmed')} disabled={reviewing}>
                  ✓ 확정
                </button>
              )}
              {settlement.status !== 'disputed' && (
                <>
                  <input
                    type="text"
                    placeholder="이의 사유"
                    value={disputeReason}
                    onChange={e => setDisputeReason(e.target.value)}
                    style={{ flex: 1, minWidth: 200, padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid rgba(0,0,0,0.10)' }}
                  />
                  <button style={{ ...BTN.sm, background: COLORS.danger, color: '#fff' }} onClick={() => updateStatus('disputed', disputeReason)} disabled={reviewing || !disputeReason.trim()}>
                    ⚠ 이의 제기
                  </button>
                </>
              )}
            </div>
            {settlement.dispute_reason && (
              <div style={{ marginTop: 8, fontSize: 11, color: COLORS.danger, padding: 6, background: COLORS.bgRed, borderRadius: 4 }}>
                이의: {settlement.dispute_reason}
              </div>
            )}
          </div>
        )}

        {/* PR-6.11.d — 정산서 → 카페24 enrichment → 차량 자동 등록 */}
        {settlement.layout_type !== 'parent' && (
          <div style={{ ...GLASS.L3, padding: 12, borderRadius: 8, marginBottom: 12, border: `1px solid ${COLORS.borderViolet}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>📋 정산서 → 차량 등록</span>
              <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                미등록 차량 → ride_contracts 자동 INSERT
              </span>
              <button
                style={{ ...BTN.sm, background: '#7c3aed', color: '#fff', marginLeft: 'auto' }}
                onClick={runExtract}
                disabled={extractLoading}
              >
                {extractLoading ? '분석 중…' : '📋 미등록 분석'}
              </button>
            </div>
            {extracted && (
              <div style={{ fontSize: 11, color: COLORS.textSecondary }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 6, background: GLASS.L2.background, borderRadius: 4 }}>
                  <span>차량 unique <b>{extracted.unique_cars}</b></span>
                  <span style={{ color: COLORS.success }}>이미 등록 <b>{extracted.already_registered}</b></span>
                  <span style={{ color: COLORS.warning }}>미등록 <b>{extracted.candidates_count}</b></span>
                  <span style={{ color: COLORS.primary }}>카페24 enrich <b>{extracted.cafe24_enriched}</b></span>
                </div>
                {extracted.candidates.length > 0 && (
                  <>
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700 }}>선택 {extractSelected.size}/{extracted.candidates.length}</span>
                      <button
                        style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary }}
                        onClick={() =>
                          setExtractSelected(
                            extractSelected.size === extracted.candidates.length
                              ? new Set()
                              : new Set(extracted.candidates.map(c => c.item_id))
                          )
                        }
                      >
                        {extractSelected.size === extracted.candidates.length ? '전체 해제' : '전체 선택'}
                      </button>
                      <button
                        style={{ ...BTN.sm, background: COLORS.success, color: '#fff', marginLeft: 'auto' }}
                        onClick={runPromote}
                        disabled={promoting || extractSelected.size === 0}
                      >
                        {promoting ? '등록 중…' : `✓ ${extractSelected.size}건 등록`}
                      </button>
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflow: 'auto' }}>
                      {extracted.candidates.map(c => (
                        <label
                          key={c.item_id}
                          style={{
                            fontSize: 10,
                            padding: '4px 6px',
                            background: extractSelected.has(c.item_id) ? COLORS.bgBlue : GLASS.L2.background,
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={extractSelected.has(c.item_id)}
                            onChange={() => {
                              const next = new Set(extractSelected)
                              if (next.has(c.item_id)) next.delete(c.item_id)
                              else next.add(c.item_id)
                              setExtractSelected(next)
                            }}
                          />
                          <b style={{ minWidth: 80 }}>{c.car_number}</b>
                          <span style={{ color: COLORS.textMuted, minWidth: 100 }}>{c.exec_no || '-'}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.cust_name || '-'} · {c.car_model || '-'}
                          </span>
                          {c.cafe24_carsidno && (
                            <span style={{ fontSize: 9, color: COLORS.primary }}>cafe24✓</span>
                          )}
                          {c.product_name && (
                            <span style={{ fontSize: 9, color: COLORS.textMuted }}>{c.product_name.substring(0, 12)}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </>
                )}
                {promoteResult && (
                  <div style={{ marginTop: 8, padding: 6, background: COLORS.bgGreen, borderRadius: 4, color: COLORS.success }}>
                    ✅ 등록 완료 — 신규 <b>{promoteResult.inserted}</b> / 중복 skip {promoteResult.skipped}
                    {promoteResult.errors > 0 && <span style={{ color: COLORS.danger }}> / 에러 {promoteResult.errors}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PR-6.11.c — 검수 강화 패널 (합계 검증 + 활성/종료) */}
        {settlement.layout_type !== 'parent' && (
          <div style={{ ...GLASS.L3, padding: 12, borderRadius: 8, marginBottom: 12, border: `1px solid ${COLORS.borderAmber}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>🔍 검수 진단</span>
              <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                합계 mismatch + 활성/종료 + 미매칭 큰 금액
              </span>
              <button
                style={{ ...BTN.sm, background: COLORS.warning, color: '#fff', marginLeft: 'auto' }}
                onClick={runAudit}
                disabled={auditLoading}
              >
                {auditLoading ? '진단 중…' : '🔍 진단 실행'}
              </button>
            </div>
            {audit && (
              <div style={{ fontSize: 11, color: COLORS.textSecondary }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 6, background: GLASS.L2.background, borderRadius: 4 }}>
                  <span>총 <b>{audit.total_items}</b>건</span>
                  <span style={{ color: COLORS.success }}>활성 <b>{audit.active}</b></span>
                  <span style={{ color: COLORS.danger }}>종료 <b>{audit.closed}</b></span>
                  <span style={{ color: COLORS.warning }}>합계 mismatch <b>{audit.sum_mismatch}</b></span>
                  <span style={{ color: COLORS.textMuted }}>
                    미매칭 <b>{audit.unmatched_count}</b> (큰금액 <b>{audit.unmatched_large}</b>)
                  </span>
                </div>
                {audit.issues.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ 의심 row {audit.issues.length}개</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflow: 'auto' }}>
                      {audit.issues.map(iss => (
                        <div
                          key={iss.item_id + iss.issue_type}
                          style={{
                            fontSize: 10,
                            padding: '4px 6px',
                            background:
                              iss.issue_type === 'sum-mismatch'
                                ? COLORS.bgRed
                                : iss.issue_type === 'status-conflict'
                                ? COLORS.bgAmber
                                : GLASS.L2.background,
                            borderRadius: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '1px 4px',
                              borderRadius: 3,
                              marginRight: 4,
                              background:
                                iss.issue_type === 'sum-mismatch'
                                  ? COLORS.danger
                                  : iss.issue_type === 'status-conflict'
                                  ? COLORS.warning
                                  : COLORS.neutral,
                              color: '#fff',
                            }}
                          >
                            {iss.issue_type === 'sum-mismatch'
                              ? '합계'
                              : iss.issue_type === 'status-conflict'
                              ? '상태'
                              : '미매칭'}
                          </span>
                          <b style={{ marginRight: 4 }}>{iss.car_number || iss.exec_no || '-'}</b>
                          {iss.cust_name && <span style={{ color: COLORS.textMuted, marginRight: 4 }}>{iss.cust_name}</span>}
                          <span>{iss.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 자녀 settlements (parent 인 경우) */}
        {children.length > 0 && (
          <div style={{ ...GLASS.L3, padding: 12, borderRadius: 8, marginBottom: 12, border: `1px solid ${COLORS.borderViolet}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🔀 자녀 정산서 ({children.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflow: 'auto' }}>
              {children.map(c => (
                <div key={c.id} style={{ fontSize: 11, padding: '4px 8px', background: GLASS.L2.background, borderRadius: 4, display: 'flex', gap: 8 }}>
                  <span style={{ flex: 1 }}>
                    📄 <b>{c.sheet_name}</b> · {c.customer_name_snap || '-'} · {c.category}
                  </span>
                  <span>{c.item_count.toLocaleString()}건</span>
                  <span>{fmtAmount(c.total_amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* items */}
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          📋 정산 내역 {itemsLoading ? '(로딩 중…)' : `(${items.length}건)`}
        </div>
        {items.length > 0 ? (
          <NeuDataTable columns={itemCols} data={items} rowKey={r => r.id} defaultSort={{ key: 'car_number', dir: 'asc' }} />
        ) : (
          <div style={{ fontSize: 12, color: COLORS.textMuted, padding: 20, textAlign: 'center' }}>
            {settlement.layout_type === 'parent' ? '자녀 정산서를 클릭해서 내역 확인' : '정산 내역 없음'}
          </div>
        )}
      </div>
    </div>
  )
}

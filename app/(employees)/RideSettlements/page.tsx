'use client'

/**
 * /RideSettlements — 라이드 정산서 등록 / 검수 / 매칭
 *
 * PR-6.11.a (UI 1차)
 *
 * 정산서 = 운영 진실의 source
 *   · 정산 포함 = 진행 중 / 미포함 = 종료
 *   · 정산 검수 (라이드 측 확정/이의제기)
 *   · 차량/실행번호 → 카페24 매칭 (PR-6.11.b)
 *   · 미등록 고객 후보 추출 (PR-6.11.d)
 *
 * 사이드바: Employee of Ride Inc. > 관리자 운영 > 💰 라이드 정산서
 * admin 전용
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

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
    if (!authChecked || user?.role !== 'admin') return
    fetchCompanies()
    fetchSettlements()
  }, [authChecked, user, fetchCompanies, fetchSettlements])

  if (!authChecked) return <div style={{ padding: 24, color: COLORS.textSecondary }}>인증 확인 중…</div>
  if (user?.role !== 'admin')
    return <div style={{ padding: 24, color: COLORS.danger }}>⚠ 관리자 권한 필요</div>

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
    <div style={{ padding: 16, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ ...GLASS.L5, padding: '16px 20px', borderRadius: 16, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary }}>💰 라이드 정산서</div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
            정산 포함 = 진행 중 / 미포함 = 종료 · 검수 확정 / 이의제기 · 차량 매칭 · 미등록 고객 추출
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{ ...BTN.md, background: COLORS.bgGreen, color: COLORS.success, border: `1px solid ${COLORS.borderGreen}` }}
            onClick={() => setUploadOpen(true)}
          >
            📥 정산서 업로드
          </button>
        </div>
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
  )
}

// ────────────────────────── 업로드 모달 ────────────────────────────
function UploadModal({
  companies,
  onClose,
  onApplied,
}: {
  companies: Company[]
  onClose: () => void
  onApplied: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [periodLabel, setPeriodLabel] = useState('')
  const [layout, setLayout] = useState<'auto' | 'meritz' | 'im' | 'mg' | 'ride-integrated'>('auto')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ detected?: { layout?: string; period_label?: string; customer_name?: string; sheet_count?: number; total_items?: number }; sheets?: { sheet_name: string; customer_name: string | null; category: string; item_count: number; sample: unknown[]; vehicle_status_count: number }[] } | null>(null)
  const [result, setResult] = useState<{ result?: { parent_settlement_id: string | null; total_inserted: number; children: { sheet: string; settlement_id: string; inserted: number }[] } } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (mode: 'preview' | 'apply') => {
    if (!file) {
      setErr('파일 선택 필요')
      return
    }
    setErr(null)
    setBusy(true)
    try {
      const token = getStoredToken()
      const fd = new FormData()
      fd.append('file', file)
      if (customerId) fd.append('customer_id', customerId)
      if (periodLabel) fd.append('period_label', periodLabel)
      fd.append('layout', layout)
      fd.append('mode', mode)
      const res = await fetch('/api/ride-settlements/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      const text = await res.text()
      let json: { success?: boolean; error?: string; detected?: unknown; sheets?: unknown[]; result?: unknown }
      try {
        json = JSON.parse(text)
      } catch {
        setErr(`서버 ${res.status}: ${text.slice(0, 100)}`)
        return
      }
      if (!res.ok || !json.success) {
        setErr(json.error || `HTTP ${res.status}`)
        return
      }
      if (mode === 'preview') {
        setPreview(json as { detected: { layout: string; period_label: string }; sheets: { sheet_name: string; customer_name: string | null; category: string; item_count: number; sample: unknown[]; vehicle_status_count: number }[] })
        setResult(null)
      } else {
        setResult(json as { result: { parent_settlement_id: string | null; total_inserted: number; children: { sheet: string; settlement_id: string; inserted: number }[] } })
        onApplied()
      }
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

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
        style={{ ...GLASS.L4, borderRadius: 16, padding: 20, width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>📥 정산서 업로드 (양식 자동 감지)</span>
          <button style={{ ...BTN.sm, background: 'transparent', color: COLORS.textMuted }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>엑셀 파일</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => {
                setFile(e.target.files?.[0] || null)
                setPreview(null)
                setResult(null)
              }}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', marginTop: 4 }}
            />
            {file && (
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>
          <div>
            <label style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>위탁사 (수동 지정 — 미지정 시 자동 추정)</label>
            <select
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', marginTop: 4 }}
            >
              <option value="">자동 추정</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>기간 (예: 2026-04)</label>
              <input
                type="text"
                value={periodLabel}
                onChange={e => setPeriodLabel(e.target.value)}
                placeholder="자동 추정 (파일명)"
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', marginTop: 4 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>양식</label>
              <select
                value={layout}
                onChange={e => setLayout(e.target.value as 'auto' | 'meritz' | 'im' | 'mg' | 'ride-integrated')}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', marginTop: 4 }}
              >
                <option value="auto">자동 감지</option>
                <option value="meritz">메리츠</option>
                <option value="im">iM캐피탈</option>
                <option value="mg">MG캐피탈 (턴키/실비)</option>
                <option value="ride-integrated">라이드 통합 마감 (multi-sheet)</option>
              </select>
            </div>
          </div>

          {preview && preview.detected && (
            <div style={{ ...GLASS.L3, border: `1px solid ${COLORS.borderBlue}`, padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                감지: {preview.detected.layout} · {preview.detected.period_label || '?'} · {preview.detected.customer_name || '미지정'}
              </div>
              <div style={{ fontSize: 11, color: COLORS.textSecondary }}>
                {preview.detected.sheet_count} 시트 / 총 {preview.detected.total_items}건
              </div>
              {preview.sheets && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflow: 'auto' }}>
                  {preview.sheets.map((s, i: number) => (
                    <div key={i} style={{ fontSize: 11, padding: '4px 8px', background: 'rgba(255,255,255,0.5)', borderRadius: 4 }}>
                      📄 <b>{s.sheet_name}</b> · {s.customer_name || '미지정'} · {s.category} · <b>{s.item_count}</b>건
                      {s.vehicle_status_count > 0 && ` · 운행상태 ${s.vehicle_status_count}건`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result && result.result && (
            <div style={{ ...GLASS.L3, border: `1px solid ${COLORS.borderGreen}`, padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.success }}>
                ✅ 업로드 완료 · 총 {result.result.total_inserted}건 적재
              </div>
              {result.result.children.map((c, i: number) => (
                <div key={i} style={{ fontSize: 11, marginTop: 4 }}>
                  📄 {c.sheet} → {c.inserted}건
                </div>
              ))}
            </div>
          )}

          {err && <div style={{ color: COLORS.danger, fontSize: 12 }}>❌ {err}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={{ ...BTN.md, background: COLORS.bgGray, color: COLORS.textSecondary }} onClick={onClose}>
              닫기
            </button>
            <button
              style={{ ...BTN.md, background: COLORS.bgBlue, color: COLORS.primary }}
              onClick={() => submit('preview')}
              disabled={busy || !file}
            >
              {busy ? '...' : '미리보기'}
            </button>
            <button
              style={{ ...BTN.md, background: COLORS.success, color: '#fff' }}
              onClick={() => submit('apply')}
              disabled={busy || !file}
            >
              {busy ? '저장 중…' : '저장'}
            </button>
          </div>
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
            <span style={{ color: cur.color, fontSize: 12, fontWeight: 700, padding: '4px 10px', background: 'rgba(255,255,255,0.5)', borderRadius: 6 }}>
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

        {/* 자녀 settlements (parent 인 경우) */}
        {children.length > 0 && (
          <div style={{ ...GLASS.L3, padding: 12, borderRadius: 8, marginBottom: 12, border: `1px solid ${COLORS.borderViolet}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🔀 자녀 정산서 ({children.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflow: 'auto' }}>
              {children.map(c => (
                <div key={c.id} style={{ fontSize: 11, padding: '4px 8px', background: 'rgba(255,255,255,0.5)', borderRadius: 4, display: 'flex', gap: 8 }}>
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

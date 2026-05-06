'use client'

/**
 * /RideAccidentReports — 라이드 사고접수
 *
 * 카페24 ERP 의 사고차 출동/접수 (acrotpth) read-only.
 * 4-table JOIN: acrotpth + pmccarsm + picuserm + pmccustm
 *
 * 백엔드: /api/cafe24/acrents (목록) + /api/cafe24/acrents/detail (상세)
 *
 * - 사이드바 그룹: Employee of Ride Inc. > CX팀
 * - admin 전용 (Q8=D)
 * - 캐시 30s
 * - 모든 컬럼 sortBy 의무 (CLAUDE.md 규칙 18)
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

interface AcrentRow {
  otptidno: string
  otptmddt: string
  otptsrno: number
  otptacdt: string | null
  otptactm: string | null
  otptacbn: string | null
  otptrgst: string | null
  otptrgtp: string | null
  otptgnus: string | null
  cars_no: string | null
  cars_model: string | null
  cars_user: string | null
  cust_name: string | null
  user_name: string | null
}

interface AcrentDetail extends AcrentRow {
  otptmscs: string | null
  otptacfe: string | null
  otptacnu: string | null
  // 점검
  otptacrn: string | null
  otptacdi: string | null
  otptacdm: string | null
  otptacjc: string | null
  otptacjs: string | null
  otptacmb: string | null
  otptacno: string | null
  otptacph: string | null
  otptacet: string | null
  otptacad: string | null
  otptacmo: string | null
  // 운전자
  otptdsnm: string | null
  otptdshp: string | null
  otptdsli: string | null
  otptdsus: string | null
  otptdstl: string | null
  otptdsmo: string | null
  // 차주
  otptcanm: string | null
  otptcahp: string | null
  // 견인
  otpttonm: string | null
  otpttohp: string | null
  otpttwnm: string | null
  otpttwhp: string | null
  otpttwgn: string | null
  // 주차/빌딩
  otptbdnm: string | null
  otptpknm: string | null
  // 이력
  otptgndt: string | null
  otptgntm: string | null
  otptupus: string | null
  otptupdt: string | null
  otptuptm: string | null
}

function fmtDate8(d: string | null | undefined): string {
  if (!d || d.length < 8) return ''
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}
function fmtTime4(t: string | null | undefined): string {
  if (!t || t.length < 4) return ''
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`
}
function fmtDateTime(d: string | null | undefined, t: string | null | undefined): string {
  return [fmtDate8(d), fmtTime4(t)].filter(Boolean).join(' ')
}

const RGST_LABEL: Record<string, { label: string; color: string }> = {
  R: { label: '등록', color: COLORS.success },
  C: { label: '취소', color: COLORS.danger },
  X: { label: '삭제', color: COLORS.neutral },
}
function checkBadge(v: string | null | undefined) {
  if (v === 'Y') return { label: '문제', color: COLORS.danger, bg: COLORS.bgRed }
  if (v === 'N') return { label: '정상', color: COLORS.success, bg: COLORS.bgGreen }
  return { label: '-', color: COLORS.textMuted, bg: 'rgba(0,0,0,0.04)' }
}

export default function RideAccidentReportsPage() {
  const [user, setUser] = useState<{ role?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [rows, setRows] = useState<AcrentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const [rgstFilter, setRgstFilter] = useState<'all' | 'R' | 'C' | 'X'>('all')
  const [searchQ, setSearchQ] = useState('')
  const [limit] = useState(100)

  const [selectedKey, setSelectedKey] = useState<{
    idno: string
    mddt: string
    srno: number
  } | null>(null)
  const [detail, setDetail] = useState<AcrentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    setUser(getStoredUser())
    setAuthChecked(true)
  }, [])

  const fetchData = useMemo(
    () =>
      async function () {
        setLoading(true)
        setError(null)
        try {
          const token = getStoredToken()
          const params = new URLSearchParams({ limit: String(limit) })
          if (rgstFilter !== 'all') params.set('rgst', rgstFilter)
          if (searchQ.trim()) params.set('q', searchQ.trim())
          const res = await fetch(`/api/cafe24/acrents?${params}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
          const json = await res.json()
          if (!res.ok || !json.success) {
            setError(json.error || `HTTP ${res.status}`)
            setRows([])
          } else {
            setRows(json.data || [])
            setFetchedAt(new Date())
          }
        } catch (e) {
          setError(String(e))
          setRows([])
        } finally {
          setLoading(false)
        }
      },
    [limit, rgstFilter, searchQ]
  )

  useEffect(() => {
    if (!authChecked || user?.role !== 'admin') return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, user?.role, rgstFilter])

  useEffect(() => {
    if (!selectedKey) {
      setDetail(null)
      setDetailError(null)
      return
    }
    const ac = new AbortController()
    async function load() {
      setDetailLoading(true)
      setDetailError(null)
      try {
        const token = getStoredToken()
        const params = new URLSearchParams({
          idno: selectedKey!.idno,
          mddt: selectedKey!.mddt,
          srno: String(selectedKey!.srno),
        })
        const res = await fetch(`/api/cafe24/acrents/detail?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
          signal: ac.signal,
        })
        const json = await res.json()
        if (!json.success || !json.data) {
          setDetailError(json.error || 'not-found')
          setDetail(null)
        } else {
          setDetail(json.data)
        }
      } catch (e) {
        const err = e as { name?: string }
        if (err.name !== 'AbortError') setDetailError(String(e))
      } finally {
        setDetailLoading(false)
      }
    }
    load()
    return () => ac.abort()
  }, [selectedKey])

  if (!authChecked) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted }}>
        로딩 중...
      </div>
    )
  }
  if (user?.role !== 'admin') {
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

  const columns: TableColumn<AcrentRow>[] = [
    {
      key: 'mddt',
      label: '접수일',
      width: 100,
      sortBy: (r) => r.otptmddt || '',
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', color: COLORS.textPrimary, fontSize: 13 }}>
          {fmtDate8(r.otptmddt)}
        </span>
      ),
    },
    {
      key: 'srno',
      label: '#',
      width: 60,
      align: 'right',
      sortBy: (r) => r.otptsrno || 0,
      render: (r) => <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{r.otptsrno}</span>,
    },
    {
      key: 'acbn',
      label: '사고번호',
      width: 110,
      sortBy: (r) => r.otptacbn || '',
      render: (r) => (
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 12,
            color: COLORS.textPrimary,
            fontWeight: 600,
          }}
        >
          {r.otptacbn || '-'}
        </span>
      ),
    },
    {
      key: 'cars_no',
      label: '차량번호',
      width: 110,
      sortBy: (r) => r.cars_no || '',
      render: (r) => (
        <span
          style={{
            whiteSpace: 'nowrap',
            color: r.cars_no ? COLORS.textPrimary : COLORS.textMuted,
            fontWeight: r.cars_no ? 600 : 400,
            fontSize: 13,
          }}
        >
          🚗 {r.cars_no || '-'}
        </span>
      ),
    },
    {
      key: 'cars_model',
      label: '차종',
      sortBy: (r) => r.cars_model || '',
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
          title={r.cars_model || ''}
        >
          {r.cars_model || '-'}
        </span>
      ),
    },
    {
      key: 'cust_name',
      label: '고객',
      width: 90,
      sortBy: (r) => r.cust_name || '',
      render: (r) => (
        <span style={{ color: COLORS.textSecondary, fontSize: 12, whiteSpace: 'nowrap' }}>
          {r.cust_name || '-'}
        </span>
      ),
    },
    {
      key: 'rgst',
      label: '등록',
      width: 70,
      sortBy: (r) => r.otptrgst || '',
      render: (r) => {
        const meta = r.otptrgst ? RGST_LABEL[r.otptrgst] : null
        if (!meta)
          return (
            <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{r.otptrgst || '-'}</span>
          )
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              color: meta.color,
              background: 'rgba(0,0,0,0.04)',
              whiteSpace: 'nowrap',
            }}
          >
            {meta.label}
          </span>
        )
      },
    },
    {
      key: 'acdt',
      label: '접수시각',
      width: 130,
      sortBy: (r) => `${r.otptacdt || ''}${r.otptactm || ''}`,
      render: (r) => (
        <span
          style={{
            whiteSpace: 'nowrap',
            color: COLORS.textSecondary,
            fontSize: 12,
          }}
        >
          {fmtDateTime(r.otptacdt, r.otptactm)}
        </span>
      ),
    },
    {
      key: 'user_name',
      label: '등록자',
      width: 90,
      sortBy: (r) => r.user_name || r.otptgnus || '',
      render: (r) => (
        <span style={{ color: COLORS.textMuted, fontSize: 12 }}>
          {r.user_name || r.otptgnus || '-'}
        </span>
      ),
    },
  ]

  const stalenessSec = fetchedAt
    ? Math.floor((Date.now() - fetchedAt.getTime()) / 1000)
    : 0
  const stalenessColor =
    stalenessSec > 300 ? COLORS.danger : stalenessSec > 60 ? COLORS.warning : COLORS.success

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      <div
        style={{
          ...GLASS.L5,
          borderRadius: 14,
          padding: '14px 20px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
          🚗 라이드 사고접수
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: stalenessColor }}>
            🕒 {fetchedAt ? `${stalenessSec}초 전` : '갱신 안 됨'}
          </span>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            style={{
              ...BTN.md,
              border: `1px solid ${COLORS.borderSubtle}`,
              background: COLORS.bgBlue,
              color: COLORS.primary,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '갱신 중...' : '↻ 새로고침'}
          </button>
        </div>
      </div>

      <div
        style={{
          ...GLASS.L2,
          borderRadius: 12,
          padding: '10px 16px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>
            상태
          </span>
          {(['all', 'R', 'C', 'X'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setRgstFilter(v)}
              style={{
                ...BTN.sm,
                border: `1px solid ${rgstFilter === v ? COLORS.primary : COLORS.borderSubtle}`,
                background: rgstFilter === v ? COLORS.bgBlue : 'rgba(255,255,255,0.6)',
                color: rgstFilter === v ? COLORS.primary : COLORS.textSecondary,
                cursor: 'pointer',
              }}
            >
              {v === 'all' ? '전체' : RGST_LABEL[v]?.label || v}
            </button>
          ))}
        </div>
        <div
          style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>
            검색
          </span>
          <input
            type="text"
            placeholder="사고번호 / 차량번호 / 고객명..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fetchData()
            }}
            style={{
              ...GLASS.L1,
              flex: 1,
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 13,
              color: COLORS.textPrimary,
              border: `1px solid ${COLORS.borderFaint}`,
            }}
          />
          <button
            onClick={() => fetchData()}
            style={{
              ...BTN.sm,
              border: `1px solid ${COLORS.borderSubtle}`,
              background: 'rgba(255,255,255,0.6)',
              color: COLORS.textSecondary,
              cursor: 'pointer',
            }}
          >
            검색
          </button>
        </div>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>
          {rows.length}건 표시 (최대 {limit})
        </div>
      </div>

      {error && (
        <div
          style={{
            ...GLASS.L4,
            background: COLORS.bgRed,
            border: `1px solid ${COLORS.borderRed}`,
            borderRadius: 10,
            padding: '10px 16px',
            marginBottom: 14,
            color: COLORS.danger,
            fontSize: 13,
          }}
        >
          ⚠️ 카페24 DB 연결 실패: <strong>{error}</strong>
        </div>
      )}

      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 4, overflow: 'hidden' }}>
        <NeuDataTable
          columns={columns}
          data={rows}
          rowKey={(r) => `${r.otptidno}|${r.otptmddt}|${r.otptsrno}`}
          onRowClick={(r) =>
            setSelectedKey({ idno: r.otptidno, mddt: r.otptmddt, srno: r.otptsrno })
          }
          loading={loading}
          emptyIcon="🚗"
          emptyMessage={
            error
              ? '카페24 DB 미연결'
              : searchQ || rgstFilter !== 'all'
                ? '필터에 해당하는 사고접수 건이 없습니다'
                : '접수된 사고가 없습니다'
          }
          defaultSort={{ key: 'mddt', dir: 'desc' }}
        />
      </div>

      {selectedKey && (
        <DetailModal
          loading={detailLoading}
          error={detailError}
          detail={detail}
          onClose={() => {
            setSelectedKey(null)
            setDetail(null)
          }}
        />
      )}
    </div>
  )
}

// ── 상세 모달 ───────────────────────────────────────────────
function DetailModal({
  loading,
  error,
  detail,
  onClose,
}: {
  loading: boolean
  error: string | null
  detail: AcrentDetail | null
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
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
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.L4,
          width: 600,
          maxWidth: '100vw',
          height: '100vh',
          overflow: 'auto',
          padding: '20px 24px',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>
            🚗 사고접수 상세
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
            × 닫기
          </button>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>
            로딩 중...
          </div>
        )}
        {error && (
          <div
            style={{
              padding: 14,
              background: COLORS.bgRed,
              border: `1px solid ${COLORS.borderRed}`,
              borderRadius: 8,
              color: COLORS.danger,
              fontSize: 13,
            }}
          >
            ⚠️ {error}
          </div>
        )}
        {detail && <DetailBody detail={detail} />}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        ...GLASS.L3,
        borderRadius: 10,
        padding: '12px 14px',
        marginBottom: 12,
        border: `1px solid ${COLORS.borderSubtle}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: COLORS.textMuted,
          letterSpacing: '0.04em',
          marginBottom: 8,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '4px 0', alignItems: 'baseline' }}>
      <span
        style={{
          fontSize: 11,
          color: COLORS.textMuted,
          fontWeight: 600,
          minWidth: 84,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: COLORS.textPrimary,
          wordBreak: 'break-word',
        }}
      >
        {value || <span style={{ color: COLORS.textMuted }}>-</span>}
      </span>
    </div>
  )
}

function DetailBody({ detail }: { detail: AcrentDetail }) {
  const rgst = detail.otptrgst ? RGST_LABEL[detail.otptrgst] : null
  const acrn = checkBadge(detail.otptacrn)
  const checks: Array<[string, string | null | undefined]> = [
    ['di', detail.otptacdi],
    ['dm', detail.otptacdm],
    ['jc', detail.otptacjc],
    ['js', detail.otptacjs],
    ['mb', detail.otptacmb],
    ['no', detail.otptacno],
    ['ph', detail.otptacph],
  ]
  const issues = checks.filter(([, v]) => v === 'Y')

  return (
    <>
      <Section title="기본">
        <Field label="접수일" value={fmtDate8(detail.otptmddt)} />
        <Field label="접수시각" value={fmtDateTime(detail.otptacdt, detail.otptactm)} />
        <Field label="사고번호" value={detail.otptacbn} />
        <Field label="사고번호2" value={detail.otptacnu} />
        <Field
          label="등록상태"
          value={
            rgst ? (
              <span style={{ color: rgst.color, fontWeight: 700 }}>{rgst.label}</span>
            ) : (
              detail.otptrgst
            )
          }
        />
        <Field label="등록타입" value={detail.otptrgtp} />
      </Section>

      <Section title="차량">
        <Field
          label="차량번호"
          value={
            detail.cars_no ? (
              <span style={{ fontWeight: 700 }}>🚗 {detail.cars_no}</span>
            ) : null
          }
        />
        <Field label="차종/모델" value={detail.cars_model} />
        <Field label="차량 사용자" value={detail.cars_user} />
        <Field label="고객" value={detail.cust_name} />
      </Section>

      <Section title={`차량 점검 ${issues.length > 0 ? `· 문제 ${issues.length}건` : ''}`}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: acrn.bg,
            borderRadius: 6,
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 700 }}>
            🚦 운행가능
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: acrn.color }}>
            {acrn.label}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {checks.map(([label, v]) => {
            const b = checkBadge(v)
            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 10px',
                  background: b.bg,
                  borderRadius: 6,
                }}
              >
                <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
                  {label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: b.color }}>
                  {b.label}
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      {(detail.otptacet || detail.otptacad || detail.otptacmo) && (
        <Section title="사고 정보">
          {detail.otptacet && <Field label="현장 etc" value={detail.otptacet} />}
          {detail.otptacad && <Field label="현장 주소" value={detail.otptacad} />}
          {detail.otptacmo && <Field label="현장 메모" value={detail.otptacmo} />}
          {detail.otptacfe && <Field label="비용" value={detail.otptacfe} />}
        </Section>
      )}

      {(detail.otptdsnm || detail.otptdshp || detail.otptdsli) && (
        <Section title="운전자">
          <Field label="이름" value={detail.otptdsnm} />
          <Field label="연락처" value={detail.otptdshp} />
          <Field label="면허" value={detail.otptdsli} />
          {detail.otptdsus && <Field label="사용자" value={detail.otptdsus} />}
          {detail.otptdstl && <Field label="전화" value={detail.otptdstl} />}
          {detail.otptdsmo && <Field label="메모" value={detail.otptdsmo} />}
        </Section>
      )}

      {(detail.otptcanm || detail.otptcahp) && (
        <Section title="차주">
          <Field label="이름" value={detail.otptcanm} />
          <Field label="연락처" value={detail.otptcahp} />
        </Section>
      )}

      {(detail.otpttonm || detail.otpttohp || detail.otpttwnm) && (
        <Section title="견인">
          <Field label="견인 회사" value={detail.otpttonm} />
          <Field label="회사 전화" value={detail.otpttohp} />
          <Field label="견인 차량" value={detail.otpttwgn} />
          <Field label="기사 이름" value={detail.otpttwnm} />
          <Field label="기사 전화" value={detail.otpttwhp} />
        </Section>
      )}

      {(detail.otptbdnm || detail.otptpknm) && (
        <Section title="장소">
          <Field label="빌딩" value={detail.otptbdnm} />
          <Field label="주차장" value={detail.otptpknm} />
        </Section>
      )}

      <Section title="이력">
        <Field
          label="등록"
          value={`${fmtDateTime(detail.otptgndt, detail.otptgntm)} · ${detail.user_name || detail.otptgnus || ''}`}
        />
        {detail.otptupdt && (
          <Field
            label="수정"
            value={`${fmtDateTime(detail.otptupdt, detail.otptuptm)} · ${detail.otptupus || ''}`}
          />
        )}
      </Section>
    </>
  )
}

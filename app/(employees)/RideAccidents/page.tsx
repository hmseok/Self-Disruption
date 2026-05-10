'use client'

/**
 * /RideAccidents
 *
 * 라이드 사고접수 목록 + 상세 모달 — 카페24 ERP (aceesosh + pmccarsm) read-only.
 *
 * 사용자 노출 명칭: "라이드 사고접수"
 * 백엔드 데이터 source: 카페24 ERP (skyautosvc.co.kr) aceesosh + pmccarsm 조인
 *
 * - 사이드바 그룹: CX팀 > 라이드 긴급출동
 * - admin 전용 (Q8=D)
 * - 캐시 30s (Q7=A 분당 변동 정책)
 * - 모든 컬럼 sortBy 의무 (CLAUDE.md 규칙 18)
 * - Glass 디자인 시스템 (CLAUDE.md § 10)
 * - 행 클릭 → 우측 슬라이드 상세 모달
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import { usePermission } from '@/app/hooks/usePermission'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
// PR-6.7.b — 코드 마스터 (RideAccidentReports 의 _codes.ts 재사용)
import {
  useCafe24Codes,
  getCodeLabel,
  type CodeMap,
} from '@/app/(employees)/RideAccidentReports/_codes'

// ── 타입 ────────────────────────────────────────────────────────
interface AccidentRow {
  esosidno: string
  esosmddt: string // YYYYMMDD
  esossrno: number
  esosacdt: string | null
  esosactm: string | null
  esosrgst: string | null
  esosrslt: string | null
  esosrstx: string | null
  esostypp: string | null
  esosgnus: string | null
  cars_no: string | null
  cars_model: string | null
}

interface MemoRow {
  memoidno: string
  memomddt: string
  memosrno: number
  memonums: number
  memosort: number
  memotitl: string | null
  memotext: string | null
  memognus: string | null
  memogndt: string | null
  memogntm: string | null
}

interface AccidentDetail extends AccidentRow {
  esosjsfg: string | null
  esosstat: string | null
  esosbate: string | null
  esostire: string | null
  esosoils: string | null
  esoslock: string | null
  esosmove: string | null
  esoshelp: string | null
  esosaddr: string | null
  esosadnm: string | null
  esosadtl: string | null
  esosusnm: string | null
  esosustl: string | null
  esosusvp: string | null
  esosusvd: string | null
  esosuser: string | null
  esosmemo: string | null
  esosinft: string | null
  esoskilo: string | null
  esosgndt: string | null
  esosgntm: string | null
  esosupdt: string | null
  esosuptm: string | null
  esosupus: string | null
}

// ── 헬퍼 ────────────────────────────────────────────────────────
function fmtDate8(d: string | null | undefined): string {
  if (!d || d.length < 8) return ''
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}
function fmtTime4(t: string | null | undefined): string {
  if (!t || t.length < 4) return ''
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`
}
function fmtDateTime(d: string | null | undefined, t: string | null | undefined): string {
  const dt = fmtDate8(d)
  const tm = fmtTime4(t)
  return [dt, tm].filter(Boolean).join(' ')
}

// PR-6.7.b — 코드 마스터 (comcbsdm 실 매핑)
// ESOSTYPP / ESOSRSLT 는 useCafe24Codes() 동적 fetch — 추정 라벨 잘못된 PR-6.5+6 정정
const RGST_LABEL: Record<string, { label: string; color: string }> = {
  R: { label: '등록', color: COLORS.success },
  C: { label: '취소', color: COLORS.danger },
  X: { label: '삭제', color: COLORS.neutral },
}
const RSLT_COLOR: Record<string, string> = {
  '1': COLORS.warning,  // 처리중
  '2': COLORS.danger,   // 취소
  '3': COLORS.success,  // 접수완료
}
// PR-6.7.d — Y/N 매핑 정정.
// PHP 신규 등록 시 점검 항목 'N' 디폴트 → Y=문제 발견 / N=정상.
function checkBadge(v: string | null | undefined): { label: string; color: string; bg: string } {
  if (v === 'Y') return { label: '문제', color: COLORS.danger, bg: COLORS.bgRed }
  if (v === 'N') return { label: '정상', color: COLORS.success, bg: COLORS.bgGreen }
  return { label: '-', color: COLORS.textMuted, bg: 'rgba(0,0,0,0.04)' }
}

// ── 페이지 ──────────────────────────────────────────────────────
export default function RideAccidentsPage() {
  const codes = useCafe24Codes()
  const [user, setUser] = useState<{ role?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  // hotfix 2026-05-09: admin-only → admin OR hasPageAccess (사이드바 권한 시스템 일치)
  const { hasPageAccess } = usePermission()
  const canAccess = user?.role === 'admin' || hasPageAccess('/RideAccidents')
  const [rows, setRows] = useState<AccidentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const [rgstFilter, setRgstFilter] = useState<'all' | 'R' | 'C' | 'X'>('all')
  const [searchQ, setSearchQ] = useState('')
  const [limit] = useState(100)

  // 상세 모달
  const [selectedKey, setSelectedKey] = useState<{
    idno: string
    mddt: string
    srno: number
  } | null>(null)
  const [detail, setDetail] = useState<AccidentDetail | null>(null)
  const [memos, setMemos] = useState<MemoRow[]>([])
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
          const res = await fetch(`/api/cafe24/accidents?${params}`, {
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
    if (!authChecked || !canAccess) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, user?.role, rgstFilter])

  // ── 상세 + 상담내역 병렬 fetch ──
  useEffect(() => {
    if (!selectedKey) {
      setDetail(null)
      setMemos([])
      setDetailError(null)
      return
    }
    const ac = new AbortController()
    async function load() {
      setDetailLoading(true)
      setDetailError(null)
      try {
        const token = getStoredToken()
        const auth = token ? { Authorization: `Bearer ${token}` } : {}
        const params = new URLSearchParams({
          idno: selectedKey!.idno,
          mddt: selectedKey!.mddt,
          srno: String(selectedKey!.srno),
        })
        const init: RequestInit = {
          headers: auth as HeadersInit,
          cache: 'no-store',
          signal: ac.signal,
        }
        // 병렬 — 상세 + 상담내역
        const [detailRes, memosRes] = await Promise.all([
          fetch(`/api/cafe24/accidents/detail?${params}`, init),
          fetch(`/api/cafe24/accidents/memos?${params}`, init),
        ])
        const detailJson = await detailRes.json()
        const memosJson = await memosRes.json()
        if (!detailJson.success || !detailJson.data) {
          setDetailError(detailJson.error || 'not-found')
          setDetail(null)
        } else {
          setDetail(detailJson.data)
        }
        setMemos(memosJson.success && memosJson.data ? memosJson.data : [])
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

  // ── 권한 차단 ──
  if (!authChecked) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted }}>
        로딩 중...
      </div>
    )
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

  // ── 컬럼 정의 (모든 컬럼 sortBy — 규칙 18) ──
  const columns: TableColumn<AccidentRow>[] = [
    {
      key: 'mddt',
      label: '접수일',
      width: 100,
      sortBy: (r) => r.esosmddt || '',
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', color: COLORS.textPrimary, fontSize: 13 }}>
          {fmtDate8(r.esosmddt)}
        </span>
      ),
    },
    {
      key: 'srno',
      label: '#',
      width: 60,
      align: 'right',
      sortBy: (r) => r.esossrno || 0,
      render: (r) => (
        <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{r.esossrno}</span>
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
            maxWidth: 280,
          }}
          title={r.cars_model || ''}
        >
          {r.cars_model || '-'}
        </span>
      ),
    },
    {
      key: 'rgst',
      label: '등록',
      width: 70,
      sortBy: (r) => r.esosrgst || '',
      render: (r) => {
        const meta = r.esosrgst ? RGST_LABEL[r.esosrgst] : null
        if (!meta)
          return (
            <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{r.esosrgst || '-'}</span>
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
      label: '기록시각',
      width: 130,
      sortBy: (r) => `${r.esosacdt || ''}${r.esosactm || ''}`,
      render: (r) => (
        <span
          style={{
            whiteSpace: 'nowrap',
            color: COLORS.textSecondary,
            fontSize: 12,
          }}
        >
          {fmtDateTime(r.esosacdt, r.esosactm)}
        </span>
      ),
    },
    {
      key: 'typp',
      label: '타입',
      width: 100,
      sortBy: (r) => getCodeLabel(codes, 'ESOSTYPP', r.esostypp, r.esostypp || ''),
      render: (r) => (
        <span style={{ color: COLORS.textSecondary, fontSize: 12, whiteSpace: 'nowrap' }}>
          {getCodeLabel(codes, 'ESOSTYPP', r.esostypp, r.esostypp || '-')}
        </span>
      ),
    },
    {
      key: 'rslt',
      label: '결과',
      width: 80,
      sortBy: (r) => getCodeLabel(codes, 'ESOSRSLT', r.esosrslt, r.esosrslt || ''),
      render: (r) => {
        const lbl = getCodeLabel(codes, 'ESOSRSLT', r.esosrslt, r.esosrslt || '-')
        const color = r.esosrslt ? RSLT_COLOR[r.esosrslt] || COLORS.textMuted : COLORS.textMuted
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              color,
              background: 'rgba(0,0,0,0.04)',
              whiteSpace: 'nowrap',
            }}
          >
            {lbl}
          </span>
        )
      },
    },
    {
      key: 'gnus',
      label: '등록자',
      width: 80,
      sortBy: (r) => r.esosgnus || '',
      render: (r) => (
        <span style={{ color: COLORS.textMuted, fontSize: 12, fontFamily: 'monospace' }}>
          {r.esosgnus || '-'}
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
      {/* 헤더 */}
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
          🚨 라이드 긴급출동
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

      {/* 필터 */}
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
            placeholder="결과 메모 검색..."
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

      {/* 에러 배너 */}
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

      {/* 테이블 */}
      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 4, overflow: 'hidden' }}>
        <NeuDataTable
          columns={columns}
          data={rows}
          rowKey={(r) => `${r.esosidno}|${r.esosmddt}|${r.esossrno}`}
          onRowClick={(r) =>
            setSelectedKey({ idno: r.esosidno, mddt: r.esosmddt, srno: r.esossrno })
          }
          loading={loading}
          emptyIcon="🚨"
          emptyMessage={
            error
              ? '카페24 DB 미연결'
              : searchQ || rgstFilter !== 'all'
                ? '필터에 해당하는 접수 건이 없습니다'
                : '접수된 사고가 없습니다'
          }
          defaultSort={{ key: 'mddt', dir: 'desc' }}
        />
      </div>

      {/* 상세 모달 */}
      {selectedKey && (
        <DetailModal
          loading={detailLoading}
          error={detailError}
          detail={detail}
          memos={memos}
          codes={codes}
          onClose={() => {
            setSelectedKey(null)
            setDetail(null)
            setMemos([])
          }}
        />
      )}
    </div>
  )
}

// ── 상세 모달 ──────────────────────────────────────────────────
function DetailModal({
  loading,
  error,
  detail,
  memos,
  codes,
  onClose,
}: {
  loading: boolean
  error: string | null
  detail: AccidentDetail | null
  memos: MemoRow[]
  codes: CodeMap
  onClose: () => void
}) {
  // ESC 닫기
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
          width: 560,
          maxWidth: '100vw',
          height: '100vh',
          overflow: 'auto',
          padding: '20px 24px',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
        }}
      >
        {/* 헤더 */}
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
            🚨 사고 접수 상세
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
        {detail && <DetailBody detail={detail} memos={memos} codes={codes} />}
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

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
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
          fontFamily: mono ? 'monospace' : undefined,
          wordBreak: 'break-word',
        }}
      >
        {value || <span style={{ color: COLORS.textMuted }}>-</span>}
      </span>
    </div>
  )
}

function DetailBody({
  detail,
  memos,
  codes,
}: {
  detail: AccidentDetail
  memos: MemoRow[]
  codes: CodeMap
}) {
  const rgst = detail.esosrgst ? RGST_LABEL[detail.esosrgst] : null
  const rsltLabel = getCodeLabel(codes, 'ESOSRSLT', detail.esosrslt, detail.esosrslt || '-')
  const rsltColor = detail.esosrslt ? RSLT_COLOR[detail.esosrslt] || COLORS.textMuted : COLORS.textMuted
  const typp = getCodeLabel(codes, 'ESOSTYPP', detail.esostypp, detail.esostypp || '-')

  // PR-6.7.d — 긴급출동 점검 항목 라벨 (PHP ace0101a.php SMS 메시지에서 정확 발견)
  // Y = 해당 서비스 제공됨 (긴출 항목)
  const checks: Array<[string, string | null | undefined, string]> = [
    ['배터리충전', detail.esosbate, '🔋'],
    ['타이어교체/펑크수리', detail.esostire, '🛞'],
    ['비상급유', detail.esosoils, '⛽'],
    ['잠금장치해제', detail.esoslock, '🔓'],
    ['긴급견인', detail.esosmove, '🚛'],
    ['비상구난', detail.esoshelp, '🆘'],
  ]
  const checksWithIssue = checks.filter(([, v]) => v === 'Y')

  return (
    <>
      {/* 기본 정보 */}
      <Section title="기본">
        <Field label="접수일" value={fmtDate8(detail.esosmddt)} />
        <Field
          label="기록 시각"
          value={fmtDateTime(detail.esosacdt, detail.esosactm) || '-'}
        />
        {/* PR-6.7.d — carsidno (esosidno) 식별자 — 분석용 */}
        <Field
          label="carsidno"
          value={
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: COLORS.textMuted }}>
              {detail.esosidno} · srno {detail.esossrno}
            </span>
          }
        />
        <Field
          label="등록 상태"
          value={
            rgst ? (
              <span style={{ color: rgst.color, fontWeight: 700 }}>{rgst.label}</span>
            ) : (
              detail.esosrgst
            )
          }
        />
        <Field
          label="결과"
          value={<span style={{ color: rsltColor, fontWeight: 700 }}>{rsltLabel}</span>}
        />
        <Field label="타입" value={typp} />
      </Section>

      {/* 차량 */}
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
        <Field label="주행거리" value={detail.esoskilo ? `${detail.esoskilo} km` : null} />
      </Section>

      {/* 차량 점검 */}
      <Section title={`차량 점검 ${checksWithIssue.length > 0 ? `· 문제 ${checksWithIssue.length}건` : ''}`}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
          }}
        >
          {checks.map(([label, v, emoji]) => {
            const badge = checkBadge(v)
            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 10px',
                  background: badge.bg,
                  borderRadius: 6,
                }}
              >
                <span style={{ fontSize: 12, color: COLORS.textSecondary }}>
                  {emoji} {label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: badge.color,
                  }}
                >
                  {badge.label}
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      {/* 위치 */}
      <Section title="발생 위치">
        <Field label="주소" value={detail.esosaddr} />
        <Field label="도로/동" value={detail.esosadnm} />
        <Field label="상세" value={detail.esosadtl} />
      </Section>

      {/* 요청자 */}
      <Section title="요청자">
        <Field label="이름" value={detail.esosusnm} />
        <Field label="연락처" value={detail.esosustl} />
        {detail.esosusvp && <Field label="추가1" value={detail.esosusvp} />}
        {detail.esosusvd && <Field label="추가2" value={detail.esosusvd} />}
      </Section>

      {/* 메모 */}
      {(detail.esosrstx || detail.esosmemo || detail.esosinft) && (
        <Section title="메모">
          {detail.esosrstx && <Field label="결과 메모" value={detail.esosrstx} />}
          {detail.esosmemo && <Field label="메모" value={detail.esosmemo} />}
          {detail.esosinft && <Field label="추가 정보" value={detail.esosinft} />}
        </Section>
      )}

      {/* 상담내역 timeline */}
      <Section title={`상담 내역 ${memos.length > 0 ? `· ${memos.length}건` : ''}`}>
        {memos.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '6px 0' }}>
            등록된 상담 내역이 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {memos.map((m) => (
              <div
                key={`${m.memonums}-${m.memosort}`}
                style={{
                  borderLeft: `2px solid ${COLORS.primary}`,
                  paddingLeft: 10,
                  paddingTop: 2,
                  paddingBottom: 2,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: COLORS.textMuted,
                    marginBottom: 2,
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontWeight: 700, color: COLORS.textSecondary }}>
                    {fmtDateTime(m.memogndt, m.memogntm)}
                  </span>
                  <span style={{ fontFamily: 'monospace' }}>{m.memognus || '-'}</span>
                </div>
                {m.memotitl && (
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: COLORS.textPrimary,
                      marginBottom: 2,
                    }}
                  >
                    {m.memotitl}
                  </div>
                )}
                {m.memotext && (
                  <div
                    style={{
                      fontSize: 13,
                      color: COLORS.textPrimary,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.memotext}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 등록 / 수정 이력 */}
      <Section title="이력">
        <Field
          label="등록"
          value={`${fmtDateTime(detail.esosgndt, detail.esosgntm)} · ${detail.esosgnus || ''}`}
        />
        {detail.esosupdt && (
          <Field
            label="수정"
            value={`${fmtDateTime(detail.esosupdt, detail.esosuptm)} · ${detail.esosupus || ''}`}
          />
        )}
      </Section>
    </>
  )
}

'use client'

/**
 * /RideAccidents
 *
 * 라이드 사고접수 목록 — 카페24 ERP (aceesosh) read-only.
 *
 * 사용자 노출 명칭: "라이드 사고접수"
 * 백엔드 데이터 source: 카페24 ERP (skyautosvc.co.kr) aceesosh
 *
 * - 사이드바 그룹: Employee of Ride Inc. > CX팀
 * - admin 전용 (Q8=D)
 * - 캐시 30s (Q7=A 분당 변동 정책)
 * - 모든 컬럼 sortBy 의무 (CLAUDE.md 규칙 18)
 * - Glass L4 NeuDataTable + Glass L2 필터바
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

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
}

// ── 헬퍼 ────────────────────────────────────────────────────────
function fmtDate8(d: string | null): string {
  if (!d || d.length < 8) return ''
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

function fmtTime4(t: string | null): string {
  if (!t || t.length < 4) return ''
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`
}

// 상태 코드 라벨 — bscddesc 조인은 PR-6.3.b 에서. 일단 raw 표시.
const RGST_LABEL: Record<string, { label: string; color: string }> = {
  R: { label: '등록', color: COLORS.success },
  C: { label: '취소', color: COLORS.danger },
  X: { label: '삭제', color: COLORS.neutral },
}

// ── 페이지 ──────────────────────────────────────────────────────
export default function CafeAccidentsPage() {
  const [user, setUser] = useState<{ role?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const [rows, setRows] = useState<AccidentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)

  // 필터
  const [rgstFilter, setRgstFilter] = useState<'all' | 'R' | 'C' | 'X'>('all')
  const [searchQ, setSearchQ] = useState('')
  const [limit] = useState(100)

  // ── 권한 체크 ──
  useEffect(() => {
    const u = getStoredUser()
    setUser(u)
    setAuthChecked(true)
  }, [])

  // ── fetch ──
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

  // 첫 로드 + 필터 변경 시 fetch
  useEffect(() => {
    if (!authChecked || user?.role !== 'admin') return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, user?.role, rgstFilter])

  // ── 권한 차단 ──
  if (!authChecked) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted }}>
        로딩 중...
      </div>
    )
  }
  if (user?.role !== 'admin') {
    return (
      <div style={{ padding: 32, ...GLASS.L4, borderRadius: 12, maxWidth: 520, margin: '40px auto' }}>
        <h2 style={{ marginTop: 0, color: COLORS.danger }}>🔒 접근 권한 없음</h2>
        <p style={{ color: COLORS.textSecondary }}>
          본 페이지는 관리자 전용입니다. (Cafe24 ERP 모듈 — Q8=D 정책)
        </p>
      </div>
    )
  }

  // ── 컬럼 정의 (모든 컬럼 sortBy — 규칙 18) ──
  const columns: TableColumn<AccidentRow>[] = [
    {
      key: 'mddt',
      label: '접수일',
      width: 110,
      sortBy: (r) => r.esosmddt || '',
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', color: COLORS.textPrimary }}>
          {fmtDate8(r.esosmddt)}
        </span>
      ),
    },
    {
      key: 'srno',
      label: '#',
      width: 70,
      align: 'right',
      sortBy: (r) => r.esossrno || 0,
      render: (r) => (
        <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{r.esossrno}</span>
      ),
    },
    {
      key: 'idno',
      label: 'ID',
      width: 110,
      sortBy: (r) => r.esosidno || '',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: COLORS.textSecondary }}>
          {r.esosidno}
        </span>
      ),
    },
    {
      key: 'rgst',
      label: '상태',
      width: 80,
      sortBy: (r) => r.esosrgst || '',
      render: (r) => {
        const meta = r.esosrgst ? RGST_LABEL[r.esosrgst] : null
        if (!meta) {
          return (
            <span style={{ color: COLORS.textMuted, fontSize: 12 }}>
              {r.esosrgst || '-'}
            </span>
          )
        }
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
      sortBy: (r) => `${r.esosacdt || ''}${r.esosactm || ''}`,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', color: COLORS.textSecondary, fontSize: 12 }}>
          {fmtDate8(r.esosacdt)} {fmtTime4(r.esosactm)}
        </span>
      ),
    },
    {
      key: 'typp',
      label: '타입',
      width: 60,
      sortBy: (r) => r.esostypp || '',
      render: (r) => (
        <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{r.esostypp || '-'}</span>
      ),
    },
    {
      key: 'rslt',
      label: '결과',
      width: 60,
      sortBy: (r) => r.esosrslt || '',
      render: (r) => (
        <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{r.esosrslt || '-'}</span>
      ),
    },
    {
      key: 'rstx',
      label: '결과 메모',
      sortBy: (r) => r.esosrstx || '',
      render: (r) => (
        <span
          style={{
            color: COLORS.textPrimary,
            fontSize: 13,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
            maxWidth: 360,
          }}
          title={r.esosrstx || ''}
        >
          {r.esosrstx || ''}
        </span>
      ),
    },
  ]

  // ── stale 인디케이터 (분당 변동 정책 — 규칙 26 SCENARIOS / Q7=A) ──
  const stalenessSec = fetchedAt ? Math.floor((Date.now() - fetchedAt.getTime()) / 1000) : 0
  const stalenessColor =
    stalenessSec > 300 ? COLORS.danger : stalenessSec > 60 ? COLORS.warning : COLORS.success

  // ── 렌더 ──
  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* 헤더 (Glass L5) */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
            🚨 라이드 사고접수
          </span>
        </div>

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

      {/* 필터 (Glass L2) */}
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
          <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>상태</span>
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

        <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>검색</span>
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
          ⚠️ 카페24 DB 연결 실패: <strong>{error}</strong>. 잠시 후 다시 시도하세요.
        </div>
      )}

      {/* 테이블 (Glass L4) */}
      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 4, overflow: 'hidden' }}>
        <NeuDataTable
          columns={columns}
          data={rows}
          rowKey={(r) => `${r.esosidno}|${r.esosmddt}|${r.esossrno}`}
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
    </div>
  )
}

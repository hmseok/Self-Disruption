'use client'
// ═══════════════════════════════════════════════════════════════════
// /RideEmployees — 라이드 직원 마스터 목록
// Employee of Ride Inc. 그룹 핵심 페이지
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/(employees)/CallScheduler/utils/palette'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { RideEmployee } from './utils/types'
import { DEPARTMENT_OPTIONS } from './utils/types'
import DedupeDialog from './components/DedupeDialog'
import BulkUploadDialog from './components/BulkUploadDialog'

export const dynamic = 'force-dynamic'

type SortKey = 'name' | 'department' | 'position' | 'group' | 'hire' | 'token'
type SortDir = 'asc' | 'desc'

export default function RideEmployeesListPage() {
  const [items, setItems] = useState<RideEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('department')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [dedupeOpen, setDedupeOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const sp = new URLSearchParams()
      if (q.trim()) sp.set('q', q.trim())
      if (dept) sp.set('department', dept)
      if (includeInactive) sp.set('include_inactive', '1')
      const res = await fetch(`/api/ride-employees?${sp.toString()}`, { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '목록 조회 실패')
      setItems(json.data as RideEmployee[])
    } catch (e: any) {
      setError(e?.message || '오류')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [dept, includeInactive])

  const sorted = useMemo(() => {
    const arr = [...items]
    arr.sort((a, b) => {
      let av: any, bv: any
      switch (sortKey) {
        case 'name':       av = a.name; bv = b.name; break
        case 'department': av = a.department || ''; bv = b.department || ''; break
        case 'position':   av = a.position || ''; bv = b.position || ''; break
        case 'group':      av = a.group_label || ''; bv = b.group_label || ''; break
        case 'hire':       av = a.hire_date || ''; bv = b.hire_date || ''; break
        case 'token':      av = a.public_token ? 1 : 0; bv = b.public_token ? 1 : 0; break
      }
      const cmp = typeof av === 'string'
        ? av.localeCompare(bv as string)
        : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [items, sortKey, sortDir])

  const stats = useMemo(() => {
    const active = items.filter(i => i.is_active).length
    const byDept = new Map<string, number>()
    for (const i of items.filter(i => i.is_active)) {
      const d = i.department || '미지정'
      byDept.set(d, (byDept.get(d) || 0) + 1)
    }
    const tokens = items.filter(i => i.is_active && i.public_token).length
    return { active, byDept, tokens, total: items.length }
  }, [items])

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  return (
    <div style={{ padding: '16px 24px', width: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <Link href="/CallScheduler" style={{
            fontSize: 12, color: COLORS.info, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6,
          }}>
            ← 근무시간표
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: 0 }}>
            👥 라이드 직원 관리
          </h1>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
            Employee of Ride Inc. — 직원 마스터 (모든 부서 공통)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setUploadOpen(true)}
                  style={{
                    ...BTN.md, background: COLORS.bgGreen, color: COLORS.success,
                    border: `1px solid ${COLORS.borderGreen}`, cursor: 'pointer',
                  }}
                  title="엑셀로 직원 일괄 등록">
            📤 일괄 등록
          </button>
          <button type="button" onClick={() => setDedupeOpen(true)}
                  style={{
                    ...BTN.md, background: 'transparent', color: COLORS.warning,
                    border: `1px solid ${COLORS.borderAmber}`, cursor: 'pointer',
                  }}>
            🔧 중복 정리
          </button>
          <Link href="/RideEmployees/new" style={{
            ...BTN.lg, background: COLORS.primary, color: '#fff',
            textDecoration: 'none', display: 'inline-block',
          }}>
            + 직원 추가
          </Link>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        <KpiTile label="활성 직원" value={stats.active.toString()} sub={`전체 ${stats.total}명`} tone="blue" />
        <KpiTile label="부서 수" value={stats.byDept.size.toString()} sub={Array.from(stats.byDept.keys()).slice(0, 3).join(' · ')} tone="green" />
        <KpiTile label="콜센터" value={(stats.byDept.get('콜센터') || 0).toString()} sub="CallScheduler 워커" tone="amber" />
        <KpiTile label="공유 링크 발급" value={stats.tokens.toString()} sub={`${stats.active > 0 ? Math.round(stats.tokens / stats.active * 100) : 0}%`} tone={stats.tokens > 0 ? 'green' : 'gray'} />
      </div>

      {/* 검색 바 */}
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: 12, marginBottom: 12,
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load() }}
          placeholder="이름·전화·이메일 검색"
          style={{
            ...GLASS.L1, padding: '6px 12px', borderRadius: 8,
            fontSize: 13, color: COLORS.textPrimary, outline: 'none',
            flex: '1 1 240px', minWidth: 200,
          }}
        />
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          style={{
            ...GLASS.L1, padding: '6px 12px', borderRadius: 8,
            fontSize: 13, color: COLORS.textPrimary, outline: 'none',
          }}
        >
          <option value="">전체 부서</option>
          {DEPARTMENT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 12, color: COLORS.textSecondary, cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          퇴사자 포함
        </label>
        <button
          type="button"
          onClick={load}
          style={{
            ...BTN.md, background: 'transparent', color: COLORS.info,
            border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer',
          }}
        >
          검색
        </button>
      </div>

      {/* 테이블 */}
      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, overflow: 'auto' }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
        )}
        {error && (
          <div style={{
            padding: 12, background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            borderRadius: 8, color: COLORS.danger, fontSize: 13,
          }}>❌ {error}</div>
        )}
        {!loading && !error && sorted.length === 0 && (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 12 }}>
              조건에 맞는 직원이 없습니다.
            </div>
            <Link href="/RideEmployees/new" style={{
              ...BTN.md, background: COLORS.primary, color: '#fff',
              textDecoration: 'none', display: 'inline-block',
            }}>+ 첫 직원 추가</Link>
          </div>
        )}
        {!loading && !error && sorted.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                <Th k="name" current={sortKey} dir={sortDir} onClick={toggle}>이름</Th>
                <Th k="department" current={sortKey} dir={sortDir} onClick={toggle}>부서</Th>
                <Th k="position" current={sortKey} dir={sortDir} onClick={toggle}>직급</Th>
                <Th k="group" current={sortKey} dir={sortDir} onClick={toggle}>그룹</Th>
                <Th k="hire" current={sortKey} dir={sortDir} onClick={toggle}>입사</Th>
                <th style={thStyle}>연락처</th>
                <Th k="token" current={sortKey} dir={sortDir} onClick={toggle} align="center">링크</Th>
                <th style={thStyle}>상태</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => (
                <tr key={e.id} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                  <td style={tdStyle}>
                    <Link href={`/RideEmployees/${e.id}`} style={{
                      color: TONE_TEXT[e.color_tone] || COLORS.primary,
                      fontWeight: 700, textDecoration: 'none',
                      background: TONE_BG[e.color_tone] || 'transparent',
                      padding: '2px 8px', borderRadius: 4,
                    }}>
                      {e.name}
                    </Link>
                  </td>
                  <td style={tdStyle}>{e.department || <span style={{ color: COLORS.textMuted }}>·</span>}</td>
                  <td style={tdStyle}>{e.position || <span style={{ color: COLORS.textMuted }}>·</span>}</td>
                  <td style={tdStyle}>{e.group_label || <span style={{ color: COLORS.textMuted }}>·</span>}</td>
                  <td style={{ ...tdStyle, color: COLORS.textMuted, fontSize: 11 }}>{e.hire_date || '·'}</td>
                  <td style={{ ...tdStyle, color: COLORS.textSecondary, fontSize: 11 }}>
                    {e.phone || <span style={{ color: COLORS.textMuted }}>·</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {e.public_token ? (
                      <span style={pillStyle('success')}>발급</span>
                    ) : (
                      <span style={{ color: COLORS.textMuted, fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {e.is_active ? (
                      <span style={pillStyle('info')}>재직</span>
                    ) : (
                      <span style={pillStyle('neutral')}>퇴사</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DedupeDialog
        open={dedupeOpen}
        onClose={() => setDedupeOpen(false)}
        onCompleted={load}
      />
      <BulkUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCompleted={load}
      />
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left',
  color: COLORS.textSecondary, fontWeight: 700,
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', whiteSpace: 'nowrap', color: COLORS.textPrimary,
}

function Th({ k, current, dir, onClick, children, align = 'left' }: {
  k: SortKey
  current: SortKey
  dir: SortDir
  onClick: (k: SortKey) => void
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <th
      onClick={() => onClick(k)}
      style={{ ...thStyle, textAlign: align, cursor: 'pointer', userSelect: 'none' }}
    >
      {children}{current === k ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )
}

function KpiTile({ label, value, sub, tone }: {
  label: string
  value: string
  sub: string
  tone: 'blue' | 'green' | 'amber' | 'red' | 'gray'
}) {
  const tintMap = {
    blue:  { bg: COLORS.bgBlue,  border: COLORS.borderBlue,  color: COLORS.info },
    green: { bg: COLORS.bgGreen, border: COLORS.borderGreen, color: COLORS.success },
    amber: { bg: COLORS.bgAmber, border: COLORS.borderAmber, color: COLORS.warning },
    red:   { bg: COLORS.bgRed,   border: COLORS.borderRed,   color: COLORS.danger },
    gray:  { bg: COLORS.bgGray,  border: COLORS.borderFaint, color: COLORS.textMuted },
  }[tone]
  return (
    <div style={{
      ...GLASS.L3, background: tintMap.bg, border: `1px solid ${tintMap.border}`,
      borderRadius: 12, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: tintMap.color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
    </div>
  )
}

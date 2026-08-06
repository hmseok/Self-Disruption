'use client'

// ═══════════════════════════════════════════════════════════════
// 수집함 「연결 검증」 탭 (2026-08-06 신설)
// SMS 수집 채널(카드·통장) 그룹별로 기본 연결 상태를 교차 체크:
//   등록 카드/계좌 매핑 → 차량 배정 → 원장 반영 → 분류 → 차량 귀속
// 데이터: GET /api/finance/verification (자체 로드)
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import DcStatStrip from '@/app/components/DcStatStrip'
import { GLASS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import { ISSUER_LABEL, ISSUER_COLOR, nf } from './_shared'

interface VerifyRow {
  issuer: string | null
  alias: string | null
  isBank: boolean
  cnt: number
  parsed: number
  failed: number
  linked: number
  alive: number
  classified: number
  attributed: number
  lastAt: string | null
  mapping: {
    kind: 'card' | 'account'
    id: string
    label: string | null
    holder?: string | null
    purpose?: string | null
    status: string | null
    suspended?: boolean
    car: { id: string; number: string | null; model: string | null; ownership_type: string | null } | null
  } | null
}

type Verdict = { level: 'ok' | 'warn' | 'bad' | 'off'; label: string }

// 그룹 종합 판정 — 심한 것 우선
function judge(r: VerifyRow): Verdict {
  if (r.mapping && r.mapping.suspended) return { level: 'off', label: '수집중단' }
  if (!r.mapping) return { level: 'bad', label: r.isBank ? '계좌 미등록' : '카드 미등록' }
  if (r.failed > 0) return { level: 'bad', label: `파싱실패 ${r.failed}` }
  if (r.alive < r.parsed) return { level: 'warn', label: `원장 미반영 ${r.parsed - r.alive}` }
  if (!r.isBank && !r.mapping.car) return { level: 'warn', label: '차량 미배정' }
  if (r.alive > 0 && r.classified < r.alive) return { level: 'warn', label: `미분류 ${r.alive - r.classified}` }
  return { level: 'ok', label: '정상' }
}

const VERDICT_STYLE: Record<Verdict['level'], { bg: string; color: string }> = {
  ok:   { bg: 'rgba(167,243,208,0.5)', color: '#059669' },
  warn: { bg: 'rgba(253,230,138,0.5)', color: '#b45309' },
  bad:  { bg: 'rgba(254,202,202,0.5)', color: '#dc2626' },
  off:  { bg: 'rgba(226,232,240,0.7)', color: '#64748b' },
}

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700 }
const td: React.CSSProperties = { padding: '10px 12px', color: '#1e293b' }
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

function Ratio({ n, d }: { n: number; d: number }) {
  if (d === 0) return <span style={{ color: '#cbd5e1' }}>—</span>
  const full = n >= d
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: full ? '#059669' : '#b45309' }}>
      {nf(n)}<span style={{ color: '#94a3b8', fontWeight: 500 }}>/{nf(d)}</span>
    </span>
  )
}

export default function VerifyTab() {
  const [days, setDays] = useState<'30' | '90' | 'all'>('30')
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<VerifyRow[]>([])
  const [banks, setBanks] = useState<VerifyRow[]>([])

  const load = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const { ok, json } = await fetchWithAuth(`/api/finance/verification?days=${d}`)
      if (ok) {
        setCards(json.cards || [])
        setBanks(json.banks || [])
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(days) }, [days, load])

  const all = [...banks, ...cards]
  const okCnt = all.filter(r => judge(r).level === 'ok').length
  const warnCnt = all.filter(r => judge(r).level === 'warn').length
  const badCnt = all.filter(r => judge(r).level === 'bad').length

  const renderTable = (rows: VerifyRow[], kind: 'bank' | 'card') => (
    <div style={{ ...GLASS.L4, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'rgba(241,245,249,0.6)', color: '#475569', textAlign: 'left' }}>
            <th style={th}>{kind === 'bank' ? '계좌' : '카드'}</th>
            <th style={th}>{kind === 'bank' ? '등록 계좌 · 용도' : '등록 카드 · 소지자'}</th>
            {kind === 'card' && <th style={th}>배정 차량</th>}
            <th style={{ ...th, textAlign: 'right' }}>수신</th>
            <th style={{ ...th, textAlign: 'right' }}>파싱</th>
            <th style={{ ...th, textAlign: 'right' }}>원장 반영</th>
            <th style={{ ...th, textAlign: 'right' }}>분류</th>
            {kind === 'card' && <th style={{ ...th, textAlign: 'right' }}>차량 귀속</th>}
            <th style={th}>마지막 수신</th>
            <th style={th}>판정</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={10} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
              {loading ? '불러오는 중...' : '기간 내 수신 내역이 없습니다.'}
            </td></tr>
          )}
          {rows.map((r, i) => {
            const v = judge(r)
            const vs = VERDICT_STYLE[v.level]
            const carLabel = r.mapping?.car
              ? `${r.mapping.car.number || ''} ${r.mapping.car.model || ''}`.trim()
              : null
            return (
              <tr key={i} style={{ borderTop: '1px solid rgba(0,0,0,0.05)', opacity: v.level === 'off' ? 0.55 : 1 }}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {r.issuer && (
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: `${ISSUER_COLOR[r.issuer] || '#64748b'}22`, color: ISSUER_COLOR[r.issuer] || '#64748b', fontWeight: 700, fontSize: 11, marginRight: 6 }}>
                      {ISSUER_LABEL[r.issuer] || r.issuer}
                    </span>
                  )}
                  <span style={{ fontWeight: 700 }}>{r.alias || '(식별 불가)'}</span>
                </td>
                <td style={td}>
                  {r.mapping ? (
                    <>
                      <span style={{ fontWeight: 600 }}>{r.mapping.label || '—'}</span>
                      <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>
                        {kind === 'bank' ? (r.mapping.purpose || '') : (r.mapping.holder || '')}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: '#dc2626', fontWeight: 700 }}>매핑 없음</span>
                  )}
                </td>
                {kind === 'card' && (
                  <td style={td}>
                    {carLabel ? (
                      <>
                        <span style={{ fontWeight: 600 }}>{carLabel}</span>
                        <span style={{ color: '#94a3b8', marginLeft: 5, fontSize: 11 }}>
                          {r.mapping!.car!.ownership_type === 'ride' || r.mapping!.car!.ownership_type === '빌려타' ? '지입' : r.mapping!.car!.ownership_type === 'company' ? '직영' : ''}
                        </span>
                      </>
                    ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                )}
                <td style={{ ...num, fontWeight: 700 }}>{nf(r.cnt)}</td>
                <td style={num}><Ratio n={r.parsed} d={r.cnt} /></td>
                <td style={num}><Ratio n={r.alive} d={r.parsed} /></td>
                <td style={num}><Ratio n={r.classified} d={r.alive} /></td>
                {kind === 'card' && <td style={num}><Ratio n={r.attributed} d={r.alive} /></td>}
                <td style={{ ...td, whiteSpace: 'nowrap', color: '#64748b', fontSize: 11 }}>
                  {r.lastAt ? String(r.lastAt).slice(0, 10) : '—'}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: vs.bg, color: vs.color }}>
                    {v.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <DcStatStrip stats={[
        { label: '수집 채널', value: nf(all.length), tint: 'blue' as const, icon: '🔗' },
        { label: '정상 연결', value: nf(okCnt), tint: 'green' as const, icon: '✅' },
        { label: '주의', value: nf(warnCnt), tint: 'amber' as const, icon: '⚠️' },
        { label: '미연결', value: nf(badCnt), tint: 'red' as const, icon: '⛔' },
      ]} />

      {/* 기간 필터 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, marginTop: 8, alignItems: 'center' }}>
        {(['30', '90', 'all'] as const).map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: `1px solid ${days === d ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
            background: days === d ? 'rgba(191,219,254,0.6)' : '#ffffff',
            color: '#1e293b',
          }}>
            {d === 'all' ? '전체 기간' : `최근 ${d}일`}
          </button>
        ))}
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          파싱→원장→분류→귀속 순서로 이어지는 연결 상태를 채널별로 검증합니다.
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#334155', margin: '4px 0 8px' }}>통장 ({banks.length})</div>
          {renderTable(banks, 'bank')}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#334155', margin: '4px 0 8px' }}>카드 ({cards.length})</div>
          {renderTable(cards, 'card')}
        </div>
      </div>
    </>
  )
}

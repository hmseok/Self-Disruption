'use client'

import { useEffect, useState, useMemo } from 'react'
import { getAuthHeader } from '@/app/utils/auth-client'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'

// ═══════════════════════════════════════════════════════════
// /finance/sms — 카드사 SMS 자동수집 관리
//   · 수신 로그 (최근 200건, 카드사/상태 필터)
//   · 파싱 실패 건 수동 처리
//   · 스탯: 총 수신 / 파싱 성공 / 파싱 실패 / 30일 합계
// ═══════════════════════════════════════════════════════════

type SmsRow = {
  id: string
  raw_text: string
  sender: string | null
  received_at: string
  parse_status: 'pending' | 'parsed' | 'failed'
  parse_error: string | null
  card_issuer: 'KB' | 'WOORI' | 'HYUNDAI' | null
  card_alias: string | null
  holder_name: string | null
  transaction_type: 'approved' | 'canceled'
  transaction_at: string | null
  amount: number | null
  merchant: string | null
  installment: string | null
  created_at: string
}

type StatBucket = { status: string; count: number; total: number }

const ISSUER_LABEL: Record<string, string> = {
  KB: 'KB국민',
  WOORI: '우리',
  HYUNDAI: '현대',
}

const ISSUER_COLOR: Record<string, string> = {
  KB: '#fbbf24',
  WOORI: '#3b82f6',
  HYUNDAI: '#ef4444',
}

const nf = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString()

const fmtDt = (s: string | null) =>
  !s ? '—' : String(s).slice(0, 16).replace('T', ' ')

export default function SmsAdminPage() {
  const [rows, setRows] = useState<SmsRow[]>([])
  const [stats, setStats] = useState<StatBucket[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [issuerFilter, setIssuerFilter] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const q = new URLSearchParams()
      if (statusFilter) q.set('status', statusFilter)
      if (issuerFilter) q.set('issuer', issuerFilter)
      const res = await fetch(`/api/finance/sms?${q}`, { headers })
      const data = await res.json()
      setRows(data.rows || [])
      setStats(data.stats || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [statusFilter, issuerFilter])

  const statItems: StatItem[] = useMemo(() => {
    const parsed = stats.find(s => s.status === 'parsed') || { count: 0, total: 0 }
    const failed = stats.find(s => s.status === 'failed') || { count: 0, total: 0 }
    const total30d = stats.reduce((a, s) => a + s.count, 0)
    return [
      { label: '최근 30일 수신', value: total30d, unit: '건' },
      { label: '파싱 성공', value: parsed.count, unit: '건', tint: 'green' },
      { label: '파싱 실패', value: failed.count, unit: '건', tint: 'red' },
      { label: '30일 승인합계', value: parsed.total, unit: '원', tint: 'blue' },
    ]
  }, [stats])

  async function onDelete(id: string) {
    if (!confirm('이 SMS 로그를 삭제할까요?')) return
    const headers = await getAuthHeader()
    await fetch(`/api/finance/sms?id=${id}`, { method: 'DELETE', headers })
    load()
  }

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6">
      <h1 style={{
        fontSize: 22,
        fontWeight: 800,
        color: '#1e293b',
        marginBottom: 16,
      }}>
        📱 카드 SMS 자동수집
      </h1>

      {/* ── 스탯 ── */}
      <DcStatStrip stats={statItems} />

      {/* ── 필터 ── */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12,
        flexWrap: 'wrap',
      }}>
        {['', 'parsed', 'failed'].map(s => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 14px',
              borderRadius: 10,
              border: `1px solid ${statusFilter === s ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
              background: statusFilter === s ? 'rgba(191,219,254,0.6)' : 'rgba(255,255,255,0.72)',
              color: '#1e293b',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {s === '' ? '상태 전체' : s === 'parsed' ? '✅ 성공' : '❌ 실패'}
          </button>
        ))}
        <span style={{ width: 12 }} />
        {['', 'KB', 'WOORI', 'HYUNDAI'].map(i => (
          <button
            key={i || 'all'}
            onClick={() => setIssuerFilter(i)}
            style={{
              padding: '6px 14px',
              borderRadius: 10,
              border: `1px solid ${issuerFilter === i ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
              background: issuerFilter === i ? 'rgba(191,219,254,0.6)' : 'rgba(255,255,255,0.72)',
              color: '#1e293b',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {i === '' ? '카드사 전체' : ISSUER_LABEL[i]}
          </button>
        ))}
      </div>

      {/* ── 테이블 ── */}
      <div style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(0,0,0,0.06)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -2px -2px 8px rgba(255,255,255,0.6)',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
        }}>
          <thead>
            <tr style={{
              background: 'rgba(241,245,249,0.6)',
              color: '#475569',
              textAlign: 'left',
            }}>
              <th style={th}>상태</th>
              <th style={th}>수신시각</th>
              <th style={th}>카드사</th>
              <th style={th}>승인자</th>
              <th style={th}>가맹점</th>
              <th style={{...th, textAlign: 'right'}}>금액</th>
              <th style={th}>구분</th>
              <th style={th}>원문</th>
              <th style={{...th, width: 80}}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                불러오는 중...
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                수신된 SMS가 없습니다. 공기계에 SMS Forwarder 앱을 설정하세요.
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <td style={td}>
                  {r.parse_status === 'parsed' && <span style={badgeGreen}>✅ 성공</span>}
                  {r.parse_status === 'failed' && <span style={badgeRed}>❌ 실패</span>}
                  {r.parse_status === 'pending' && <span style={badgeGray}>⏳ 대기</span>}
                </td>
                <td style={td}>{fmtDt(r.received_at)}</td>
                <td style={td}>
                  {r.card_issuer ? (
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: `${ISSUER_COLOR[r.card_issuer]}22`,
                      color: ISSUER_COLOR[r.card_issuer],
                      fontWeight: 700,
                      fontSize: 11,
                    }}>
                      {ISSUER_LABEL[r.card_issuer]}
                    </span>
                  ) : '—'}
                </td>
                <td style={td}>{r.holder_name || '—'}</td>
                <td style={td}>{r.merchant || '—'}</td>
                <td style={{...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums'}}>
                  {r.amount != null ? (
                    <span style={{ color: r.transaction_type === 'canceled' ? '#ef4444' : '#1e293b' }}>
                      {r.transaction_type === 'canceled' ? '-' : ''}{nf(r.amount)}
                    </span>
                  ) : '—'}
                </td>
                <td style={td}>
                  {r.transaction_type === 'canceled' ? '🔄 취소' : r.installment || '일시불'}
                </td>
                <td style={{...td, maxWidth: 360, color: '#64748b', fontSize: 11}}>
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }} title={r.raw_text}>
                    {r.raw_text}
                  </div>
                  {r.parse_error && (
                    <div style={{ color: '#ef4444', fontSize: 10, marginTop: 2 }}>
                      ⚠ {r.parse_error}
                    </div>
                  )}
                </td>
                <td style={td}>
                  <button
                    onClick={() => onDelete(r.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(239,68,68,0.2)',
                      background: 'rgba(254,202,202,0.3)',
                      color: '#dc2626',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: '#94a3b8' }}>
        💡 설정 가이드: <code style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: 4 }}>
          .claude/sms-setup-guide.md
        </code> 참조
      </div>
    </div>
  )
}

// ── styles ─────────────────────────────────────────
const th = {
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
}
const td = {
  padding: '10px 12px',
  color: '#1e293b',
  verticalAlign: 'top' as const,
}
const badgeBase = {
  padding: '2px 8px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: 'nowrap' as const,
}
const badgeGreen = { ...badgeBase, background: 'rgba(167,243,208,0.5)', color: '#059669' }
const badgeRed = { ...badgeBase, background: 'rgba(254,202,202,0.5)', color: '#dc2626' }
const badgeGray = { ...badgeBase, background: 'rgba(226,232,240,0.7)', color: '#64748b' }

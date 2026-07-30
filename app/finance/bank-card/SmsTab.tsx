'use client'

// ═══════════════════════════════════════════════════════════════
// SMS 수집 탭 (→ 개편 후 「수집함」)
// 2026-07-30 개편 2단계 — page.tsx 에서 분리. 데이터·액션은 부모가 소유.
// ═══════════════════════════════════════════════════════════════

import DcStatStrip from '@/app/components/DcStatStrip'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { ISSUER_LABEL, ISSUER_COLOR, SmsRow, nf } from './_shared'

interface SmsTabProps {
  rows: SmsRow[]
  stats: { status: string; count: number; total: number }[]
  loading: boolean
  statusFilter: string
  issuerFilter: string
  onStatusFilter: (s: string) => void
  onIssuerFilter: (i: string) => void
  reparsing: boolean
  onReparse: () => void
  registeringId: string | null
  onRegister: (id: string) => void
}

export default function SmsTab({
  rows, stats, loading,
  statusFilter, issuerFilter, onStatusFilter, onIssuerFilter,
  reparsing, onReparse, registeringId, onRegister,
}: SmsTabProps) {
  const parsed = stats.find(s => s.status === 'parsed') || { count: 0, total: 0 }
  const failed = stats.find(s => s.status === 'failed') || { count: 0, total: 0 }
  const total30d = stats.reduce((a, s) => a + s.count, 0)

  return (
    <>
      <DcStatStrip stats={[
        { label: '30일 수신', value: nf(total30d), tint: 'blue' as const, icon: '📱' },
        { label: '파싱 성공', value: nf(parsed.count), tint: 'green' as const, icon: '✅' },
        { label: '파싱 실패', value: nf(failed.count), tint: 'red' as const, icon: '❌' },
        { label: '승인합계', value: nf(parsed.total), unit: '원', tint: 'amber' as const, icon: '💰' },
      ]} />

      {/* SMS 필터 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {['', 'parsed', 'failed', 'ignored'].map(s => (
          <button key={s || 'all'} onClick={() => onStatusFilter(s)} style={{
            padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: `1px solid ${statusFilter === s ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
            background: statusFilter === s ? 'rgba(191,219,254,0.6)' : '#ffffff',
            color: '#1e293b',
          }}>
            {s === '' ? '상태 전체' : s === 'parsed' ? '✅ 성공' : s === 'failed' ? '❌ 실패' : '🔇 무시'}
          </button>
        ))}
        <span style={{ width: 8 }} />
        {['', 'KB', 'WOORI', 'HYUNDAI', 'MYCOMPANY', 'WOORI_BANK', 'KB_BANK'].map(i => (
          <button key={i || 'all'} onClick={() => onIssuerFilter(i)} style={{
            padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: `1px solid ${issuerFilter === i ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
            background: issuerFilter === i ? 'rgba(191,219,254,0.6)' : '#ffffff',
            color: '#1e293b',
          }}>
            {i === '' ? '카드사 전체' : ISSUER_LABEL[i]}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={onReparse} disabled={reparsing} style={{
          padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: reparsing ? 'wait' : 'pointer',
          border: '1px solid rgba(139,92,246,0.3)',
          background: 'rgba(221,214,254,0.5)',
          color: '#7c3aed',
          opacity: reparsing ? 0.6 : 1,
        }} title="실패 SMS 새 파서로 재시도 (필요 시에만)">
          {reparsing ? '재파싱 중...' : '🔄 실패 건 재파싱'}
        </button>
      </div>

      {/* SMS 테이블 */}
      <div style={{
        ...GLASS.L4, borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(241,245,249,0.6)', color: '#475569', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>상태</th>
              <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>수신시각</th>
              <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>카드사</th>
              <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>승인자</th>
              <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>가맹점</th>
              <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>금액</th>
              <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>구분</th>
              <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>원문</th>
              <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>거래</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>불러오는 중...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                수신된 SMS가 없습니다. SMS Forwarder 앱 설정 후 카드 결제 시 자동 수집됩니다.
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <td style={{ padding: '10px 12px' }}>
                  {r.parse_status === 'parsed' && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(167,243,208,0.5)', color: '#059669' }}>✅</span>}
                  {r.parse_status === 'failed' && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(254,202,202,0.5)', color: '#dc2626' }}>❌</span>}
                  {r.parse_status === 'ignored' && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(226,232,240,0.7)', color: '#94a3b8' }}>🔇</span>}
                  {r.parse_status === 'pending' && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(226,232,240,0.7)', color: '#64748b' }}>⏳</span>}
                </td>
                <td style={{ padding: '10px 12px', color: '#1e293b' }}>{r.received_at ? String(r.received_at).slice(0, 16).replace('T', ' ') : '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  {r.card_issuer ? (
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: `${ISSUER_COLOR[r.card_issuer]}22`, color: ISSUER_COLOR[r.card_issuer], fontWeight: 700, fontSize: 11 }}>
                      {ISSUER_LABEL[r.card_issuer]}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ padding: '10px 12px', color: '#1e293b' }}>{r.holder_name || '—'}</td>
                <td style={{ padding: '10px 12px', color: '#1e293b' }}>{r.merchant || '—'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.transaction_type === 'canceled' || r.transaction_type === 'withdrawal' ? '#ef4444' : r.transaction_type === 'deposit' ? '#059669' : '#1e293b' }}>
                  {/* 규칙 18 — + 부호 금지 (색상으로 의미 표현), - 는 취소만 */}
                  {r.amount != null ? `${r.transaction_type === 'canceled' ? '-' : ''}${Number(r.amount).toLocaleString()}` : '—'}
                </td>
                <td style={{ padding: '10px 12px', color: '#1e293b' }}>{r.transaction_type === 'canceled' ? '취소' : r.transaction_type === 'deposit' ? '입금' : r.transaction_type === 'withdrawal' ? '출금' : r.installment || '일시불'}</td>
                <td style={{ padding: '10px 12px', maxWidth: 300, color: '#64748b', fontSize: 11 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.raw_text}>{r.raw_text}</div>
                  {r.parse_error && <div style={{ color: '#ef4444', fontSize: 10, marginTop: 2 }}>⚠ {r.parse_error}</div>}
                </td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                  {/* 개별 원장 등록 (2026-07-08) — 전체삭제 등으로 거래가 사라진 파싱 성공 건 복구 */}
                  {r.tx_alive
                    ? <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>연결됨</span>
                    : r.parse_status === 'parsed' && r.amount != null
                      ? <button
                          onClick={() => onRegister(r.id)}
                          disabled={registeringId === r.id}
                          style={{ ...BTN.sm, padding: '3px 8px', fontSize: 11, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: registeringId === r.id ? 'wait' : 'pointer' }}
                        >{registeringId === r.id ? '등록 중...' : '거래로 등록'}</button>
                      : <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

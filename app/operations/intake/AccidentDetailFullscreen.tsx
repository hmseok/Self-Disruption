'use client'

import { useState, useEffect, useCallback } from 'react'
import { GLASS } from '../../utils/ui-tokens'
import type { Cafe24Detail, Cafe24Memo, RichAccidentRow } from './types'
import { fmtCafe24DateTime } from './types'

// ═══════════════════════════════════════════════════════════════════
// AccidentDetailFullscreen — PR-OPS-1.5b
//
// 「사고접수 탭」 행 클릭 시 풀스크린 모달.
// 카페24 어드민 그대로 — cafe24 detail (30+ 필드) + memos timeline read-only.
//
// 사용자 명시: 「카페24 연동된 페이지의 전체 내역이 확인되어야 — 풀스크린」
//
// dispatch_order 관리 X — 사고접수 단계는 read-only.
// 대차로 변환된 사고는 「대차접수 탭」 의 DispatchRequestFullscreen 에서 처리.
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

function joinAddr(...parts: Array<string | null>): string {
  return parts.filter((p) => p && p.trim()).join(' ')
}

const STAGE_LABEL_BY_RSLT: Record<string, string> = {
  '1': '🆕 접수',
  '2': '📞 진행중',
  '3': '✅ 종결',
}

const STAGE_LABEL_BY_RGST: Record<string, string> = {
  R: '활성',
  C: '취소',
}

export default function AccidentDetailFullscreen({
  row,
  onClose,
}: {
  row: RichAccidentRow
  onClose: () => void
}) {
  const [detail, setDetail] = useState<Cafe24Detail | null>(null)
  const [memos, setMemos] = useState<Cafe24Memo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      idno: row.esosidno,
      mddt: row.esosmddt,
      srno: String(row.esossrno),
    })
    try {
      const headers = await getAuthHeader()
      const [detailRes, memosRes] = await Promise.all([
        fetch(`/api/cafe24/accidents/detail?${params}`, { headers }),
        fetch(`/api/cafe24/accidents/memos?${params}`, { headers }),
      ])
      const detailJson = await detailRes.json().catch(() => ({}))
      const memosJson = await memosRes.json().catch(() => ({}))
      if (detailJson?.success && detailJson.data) {
        setDetail(detailJson.data as Cafe24Detail)
      } else {
        setDetail(null)
        setError(detailJson?.error || 'cafe24 detail 미연결')
      }
      if (memosJson?.success && Array.isArray(memosJson.data)) {
        setMemos(memosJson.data as Cafe24Memo[])
      } else {
        setMemos([])
      }
    } catch (e: any) {
      setError(e?.message || 'fetch 실패')
    } finally {
      setLoading(false)
    }
  }, [row.esosidno, row.esosmddt, row.esossrno])

  useEffect(() => { fetchAll() }, [fetchAll])

  // 차량 점검 (배터리/타이어/오일/잠금/이동/구조) — Y 만 표시
  const checkItems: Array<[string, string | null]> = detail
    ? [
      ['🔋 배터리', detail.esosbate as any],
      ['🛞 타이어', detail.esostire as any],
      ['🛢 오일', detail.esosoils as any],
      ['🔒 잠금', detail.esoslock as any],
      ['🚛 이동', detail.esosmove as any],
      ['🚑 구난', detail.esoshelp as any],
    ]
    : []
  const activeChecks = checkItems.filter(([_, v]) => v === 'Y')

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,36,64,0.5)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.L4,
          borderRadius: 18,
          padding: 24,
          maxWidth: 1200,
          width: '100%',
          minHeight: 'calc(100vh - 40px)',
          boxShadow: '0 25px 60px rgba(15,36,64,0.25)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f2440', margin: 0, whiteSpace: 'nowrap' }}>
              🚨 {row.cars_no || row.esosusnm || row.esosidno}
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, whiteSpace: 'nowrap' }}>
              사고접수 · {fmtCafe24DateTime(row.esosacdt, row.esosactm)} · 접수번호 {row.esosidno} ·
              <span style={{ marginLeft: 6, color: '#0f2440', fontWeight: 700 }}>
                {STAGE_LABEL_BY_RSLT[row.esosrslt || '1'] || row.esosrslt}
                {' / '}
                {STAGE_LABEL_BY_RGST[row.esosrgst || ''] || ''}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 22, color: '#64748b' }}
          >×</button>
        </div>

        {/* A. 사고 정보 (cafe24 detail) */}
        <SectionTitle icon="📋" title="사고 정보 (cafe24 어드민)" trailing={
          <button onClick={fetchAll} disabled={loading} style={subtleBtn}>↻ 새로고침</button>
        } />
        <SectionBody>
          {loading ? (
            <Placeholder>cafe24 조회 중…</Placeholder>
          ) : error ? (
            <Placeholder warn>⚠ {error}</Placeholder>
          ) : detail ? (
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 1fr', gap: '8px 16px', fontSize: 12 }}>
              <Lbl>📍 위치</Lbl>
              <Val style={{ gridColumn: 'span 3', whiteSpace: 'pre-wrap' }}>
                {joinAddr(detail.esosaddr, detail.esosadnm, detail.esosadtl) || '-'}
              </Val>
              <Lbl>🧍 요청자</Lbl>
              <Val>{detail.esosusnm || '-'}</Val>
              <Lbl>📱 연락처</Lbl>
              <Val>{detail.esosustl || '-'}</Val>
              <Lbl>🚗 차량번호</Lbl>
              <Val>{detail.cars_no || detail.esosusvp || '-'}</Val>
              <Lbl>🚙 차종</Lbl>
              <Val>{detail.cars_model || detail.esosusvd || '-'}</Val>
              {activeChecks.length > 0 && (
                <>
                  <Lbl>🔧 점검</Lbl>
                  <Val style={{ gridColumn: 'span 3' }}>{activeChecks.map(([k]) => k).join(' · ')}</Val>
                </>
              )}
              {detail.esosrstx && (
                <>
                  <Lbl>📝 사고 메모</Lbl>
                  <Val style={{ gridColumn: 'span 3', whiteSpace: 'pre-wrap' }}>{detail.esosrstx}</Val>
                </>
              )}
              {detail.esosmemo && (
                <>
                  <Lbl>💭 상담 메모</Lbl>
                  <Val style={{ gridColumn: 'span 3', whiteSpace: 'pre-wrap' }}>{detail.esosmemo}</Val>
                </>
              )}
              {detail.esosinft && (
                <>
                  <Lbl>ℹ️ 추가</Lbl>
                  <Val style={{ gridColumn: 'span 3', whiteSpace: 'pre-wrap' }}>{detail.esosinft}</Val>
                </>
              )}
              <Lbl>🕓 등록</Lbl>
              <Val style={{ gridColumn: 'span 3' }}>
                {fmtCafe24DateTime(detail.esosgndt, detail.esosgntm) || '-'}
                {detail.esosgnus && <span style={{ marginLeft: 6, color: '#94a3b8' }}>· {detail.esosgnus}</span>}
              </Val>
            </div>
          ) : (
            <Placeholder>사고 상세 없음</Placeholder>
          )}
        </SectionBody>

        {/* 차량 마스터 (LIST 응답에 이미 있는 정보) */}
        <SectionTitle icon="🚗" title="차량 마스터" />
        <SectionBody>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 1fr', gap: '8px 16px', fontSize: 12 }}>
            <Lbl>차량번호</Lbl><Val>{row.cars_no || '-'}</Val>
            <Lbl>차종</Lbl><Val>{row.cars_model || '-'}</Val>
            <Lbl>고객명</Lbl><Val>{row.cars_user || '-'}</Val>
            <Lbl>캐피탈사</Lbl><Val>{row.capital_co_name || row.capital_co_code || '-'}</Val>
            <Lbl>주행거리</Lbl><Val>{row.esoskilo ? `${row.esoskilo} km` : '-'}</Val>
            <Lbl>등록자</Lbl><Val>{row.gnus_name || row.esosgnus || '-'}</Val>
          </div>
        </SectionBody>

        {/* B. 콜센터 메모 timeline */}
        <SectionTitle icon="📞" title={`콜센터 메모 (${memos.length})`} />
        <SectionBody>
          {loading ? (
            <Placeholder>cafe24 메모 조회 중…</Placeholder>
          ) : memos.length === 0 ? (
            <Placeholder>콜센터 메모 없음</Placeholder>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {memos.map((m) => (
                <div
                  key={`${m.memosort}-${m.memonums}`}
                  style={{
                    ...GLASS.L3,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(0,0,0,0.04)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4, color: '#64748b', fontSize: 11, whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700 }}>#{m.memosort}-{m.memonums}</span>
                    <span>{fmtCafe24DateTime(m.memogndt, m.memogntm)}</span>
                    {m.memognus && <span>· {m.memognus}</span>}
                  </div>
                  {m.memotitl && (
                    <div style={{ fontWeight: 700, color: '#0f2440', marginBottom: 2 }}>{m.memotitl}</div>
                  )}
                  {m.memotext && (
                    <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap' }}>{m.memotext}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionBody>

        {/* Footer info — dispatch_order 관리 X 안내 */}
        <div style={{ marginTop: 16, padding: 12, background: 'rgba(241,245,249,0.6)', borderRadius: 8, fontSize: 11, color: '#64748b' }}>
          ℹ️ 사고접수 단계 — read-only. 대차로 진행 시 「🚗 대차접수」 탭에서 상담 + 일정 + 배차 확정 관리.
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────
function SectionTitle({ icon, title, trailing }: { icon: string; title: string; trailing?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 6 }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f2440', margin: 0, whiteSpace: 'nowrap' }}>{icon} {title}</h3>
      <div style={{ flex: 1 }} />
      {trailing}
    </div>
  )
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(248,250,252,0.7)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 12, padding: 14 }}>
      {children}
    </div>
  )
}

function Placeholder({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return <div style={{ fontSize: 12, color: warn ? '#b45309' : '#94a3b8', padding: 4 }}>{children}</div>
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>
}

function Val({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={{ color: '#1e293b', fontWeight: 600, ...style }}>{children}</span>
}

const subtleBtn: React.CSSProperties = {
  padding: '4px 10px',
  background: 'transparent',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#64748b',
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler/skips — 매니저 회피일 검토 통합 페이지 (Phase H)
//   모든 그룹의 status='requested' 신청 한 화면 일괄 승인/거절
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

export const dynamic = 'force-dynamic'

interface SkipRow {
  id: string
  group_id: string
  worker_id: string
  start_date: string
  end_date: string
  reason: string | null
  status: 'requested' | 'approved' | 'rejected' | 'canceled'
  created_at: string
  updated_at: string
  worker_name: string | null
  worker_tone: string | null
  group_name: string | null
}

export default function SkipsReviewPage() {
  const [rows, setRows] = useState<SkipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'requested' | 'approved' | 'all'>('requested')

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      // 미래 N일 (오늘 ~ 90일 후) 범위 — 운영 패턴
      const today = new Date()
      const monthStart = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`
      const future = new Date(today)
      future.setDate(future.getDate() + 90)
      const futureEnd = `${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}`
      const status = filterStatus === 'all' ? 'requested,approved,rejected,canceled' : filterStatus
      const res = await fetch(
        `/api/call-scheduler/skip-dates?from=${monthStart}&to=${futureEnd}&status=${status}`,
        { headers: auth },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      setRows(json.data || [])
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterStatus])

  const updateStatus = async (skip: SkipRow, status: 'approved' | 'rejected') => {
    setBusy(skip.id); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/shift-groups/${skip.group_id}/skip-dates/${skip.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ status }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      load()
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setBusy(null) }
  }

  // 그룹별 묶기
  const byGroup = rows.reduce((acc: Record<string, SkipRow[]>, r) => {
    const k = r.group_name || '(이름없음)'
    acc[k] = acc[k] || []
    acc[k].push(r)
    return acc
  }, {})

  const requestedCount = rows.filter(r => r.status === 'requested').length

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <Link href="/CallScheduler" style={{
            fontSize: 12, color: COLORS.info, textDecoration: 'none',
          }}>← 매트릭스로</Link>
          <h1 style={{
            fontSize: 20, fontWeight: 700, color: '#0f2440', margin: '6px 0',
          }}>
            회피일 검토 {requestedCount > 0 && (
              <span style={{
                ...pillStyle('warning'), fontSize: 12, marginLeft: 8,
              }}>
                대기 {requestedCount}건
              </span>
            )}
          </h1>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            직원 회피일 신청 일괄 승인/거절 — 정식 휴가 X, 단순 회피 (그룹 차원)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {(['requested', 'approved', 'all'] as const).map(s => (
            <button key={s} type="button"
                    onClick={() => setFilterStatus(s)}
                    style={{
                      padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                      background: filterStatus === s ? COLORS.primary : 'rgba(255,255,255,0.6)',
                      color: filterStatus === s ? '#fff' : COLORS.textSecondary,
                      border: `1px solid ${filterStatus === s ? COLORS.primary : COLORS.borderFaint}`,
                      cursor: 'pointer',
                    }}>
              {s === 'requested' ? '⏳ 대기' : s === 'approved' ? '✓ 승인됨' : '전체'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 13,
        }}>❌ {error}</div>
      )}

      {loading ? (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
          로딩...
        </div>
      ) : rows.length === 0 ? (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center',
          color: COLORS.textMuted,
        }}>
          {filterStatus === 'requested'
            ? '대기 중인 회피일 신청이 없습니다.'
            : '회피일 기록이 없습니다.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {Object.entries(byGroup).map(([groupName, list]) => (
            <div key={groupName} style={{ ...GLASS.L4, borderRadius: 12, padding: 14 }}>
              <div style={{
                fontSize: 14, fontWeight: 800, color: COLORS.textPrimary,
                marginBottom: 10, paddingBottom: 8,
                borderBottom: `1px solid ${COLORS.borderFaint}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                🚧 {groupName}
                <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted }}>
                  {list.length}건
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 8,
                    background: r.status === 'requested'
                      ? COLORS.bgAmber
                      : r.status === 'approved'
                      ? COLORS.bgGreen
                      : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${
                      r.status === 'requested' ? COLORS.borderAmber
                      : r.status === 'approved' ? COLORS.borderGreen
                      : COLORS.borderFaint
                    }`,
                  }}>
                    <span style={pillStyle(
                      r.status === 'requested' ? 'warning'
                      : r.status === 'approved' ? 'success'
                      : 'neutral',
                    )}>
                      {r.status === 'requested' ? '⏳ 대기'
                       : r.status === 'approved' ? '✓ 승인'
                       : r.status === 'rejected' ? '✗ 거절'
                       : '취소'}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
                      {r.worker_name || '(이름없음)'}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: COLORS.textPrimary }}>
                      {r.start_date}{r.start_date !== r.end_date && ` ~ ${r.end_date}`}
                      {r.reason && (
                        <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8, fontStyle: 'italic' }}>
                          — {r.reason}
                        </span>
                      )}
                    </span>
                    {r.status === 'requested' && (
                      <>
                        <button type="button"
                                disabled={busy === r.id}
                                onClick={() => updateStatus(r, 'approved')}
                                style={{
                                  ...BTN.md, background: COLORS.success, color: '#fff',
                                  border: 'none', cursor: busy === r.id ? 'not-allowed' : 'pointer',
                                  opacity: busy === r.id ? 0.6 : 1,
                                }}>
                          ✓ 승인
                        </button>
                        <button type="button"
                                disabled={busy === r.id}
                                onClick={() => updateStatus(r, 'rejected')}
                                style={{
                                  ...BTN.md, background: 'transparent', color: COLORS.danger,
                                  border: `1px solid ${COLORS.borderRed}`,
                                  cursor: busy === r.id ? 'not-allowed' : 'pointer',
                                  opacity: busy === r.id ? 0.6 : 1,
                                }}>
                          ✗ 거절
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

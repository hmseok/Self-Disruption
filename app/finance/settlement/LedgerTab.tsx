'use client'
import { useEffect, useMemo, useState } from 'react'
import { auth } from '@/lib/auth-client'

type LedgerRow = {
  id: string
  contract_type: 'jiip' | 'invest' | 'loan'
  contract_id: string
  recipient_name: string
  settlement_month: string
  due_amount: number | string
  paid_amount: number | string
  status: 'pending' | 'matched' | 'paid'
  matched_at: string | null
  paid_at: string | null
  matched_tx_ids: any
  breakdown: any
  share_id: string | null
  note: string | null
  generated_at: string
  generated_by: string | null
  updated_at: string
}

const nf = (n: number | string) => Number(n || 0).toLocaleString('ko-KR')

async function headers(): Promise<Record<string, string>> {
  try {
    const user = auth.currentUser
    if (!user) return { 'Content-Type': 'application/json' }
    const token = await user.getIdToken(false)
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  } catch {
    return { 'Content-Type': 'application/json' }
  }
}

export default function LedgerTab({ filterDate }: { filterDate: string }) {
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string>('')
  const [status, setStatus] = useState<'all' | 'pending' | 'matched' | 'paid'>('all')
  const [type, setType] = useState<'all' | 'jiip' | 'invest'>('all')
  const [toast, setToast] = useState<string>('')

  const load = async () => {
    setLoading(true)
    try {
      const h = await headers()
      // 최근 12개월 범위 로드
      const from = (() => {
        const d = new Date(filterDate + '-01')
        d.setMonth(d.getMonth() - 11)
        return d.toISOString().slice(0, 7)
      })()
      const params = new URLSearchParams({ from, to: filterDate })
      const res = await fetch(`/api/settlement/ledger?${params}`, { headers: h }).then(r => r.json())
      setRows(res.data || [])
    } catch (e: any) {
      setToast('원장 조회 실패: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterDate])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (status !== 'all' && r.status !== status) return false
      if (type !== 'all' && r.contract_type !== type) return false
      return true
    })
  }, [rows, status, type])

  const counts = useMemo(() => ({
    pending: rows.filter(r => r.status === 'pending').length,
    matched: rows.filter(r => r.status === 'matched').length,
    paid: rows.filter(r => r.status === 'paid').length,
    totalPendingAmt: rows.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.due_amount || 0), 0),
    totalMatchedAmt: rows.filter(r => r.status === 'matched').reduce((s, r) => s + Number(r.due_amount || 0), 0),
  }), [rows])

  const generateMonth = async () => {
    if (!confirm(`${filterDate} 운영월 정산을 생성하시겠습니까?`)) return
    setBusy('generate')
    try {
      const h = await headers()
      const res = await fetch('/api/settlement/ledger/generate', {
        method: 'POST', headers: h, body: JSON.stringify({ month: filterDate })
      }).then(r => r.json())
      if (res.error) throw new Error(res.error)
      const s = res.data?.summary
      setToast(`생성 완료 — 신규 ${s.inserted}건 · 갱신 ${s.updated}건 · 스킵 ${s.skipped}건`)
      await load()
    } catch (e: any) {
      setToast('생성 실패: ' + e.message)
    } finally {
      setBusy('')
    }
  }

  const runMatch = async () => {
    setBusy('match')
    try {
      const h = await headers()
      const res = await fetch('/api/settlement/ledger/match', {
        method: 'POST', headers: h, body: JSON.stringify({ month: filterDate })
      }).then(r => r.json())
      if (res.error) throw new Error(res.error)
      setToast(`자동매칭 ${res.data?.matched || 0}건`)
      await load()
    } catch (e: any) {
      setToast('매칭 실패: ' + e.message)
    } finally {
      setBusy('')
    }
  }

  const confirmPaid = async (id: string, revert = false) => {
    setBusy(id)
    try {
      const h = await headers()
      const res = await fetch(`/api/settlement/ledger/${id}/confirm`, {
        method: 'POST', headers: h, body: JSON.stringify({ revert })
      }).then(r => r.json())
      if (res.error) throw new Error(res.error)
      setToast(revert ? '지급 취소됨' : '지급 확정됨')
      await load()
    } catch (e: any) {
      setToast('처리 실패: ' + e.message)
    } finally {
      setBusy('')
    }
  }

  const statusBadge = (s: string) => {
    if (s === 'pending') return { label: '미결', color: '#dc2626', bg: '#fee2e2' }
    if (s === 'matched') return { label: '이체대기', color: '#2563eb', bg: '#dbeafe' }
    if (s === 'paid') return { label: '지급완료', color: '#16a34a', bg: '#dcfce7' }
    return { label: s, color: '#64748b', bg: '#f1f5f9' }
  }

  const typeBadge = (t: string) => {
    if (t === 'jiip') return { label: '지입', color: '#7c3aed', bg: '#f3e8ff' }
    if (t === 'invest') return { label: '투자', color: '#2563eb', bg: '#dbeafe' }
    return { label: t, color: '#64748b', bg: '#f1f5f9' }
  }

  return (
    <div>
      {/* ── 상단: 요약 + 액션 ── */}
      <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>미결</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626' }}>{counts.pending}건 · {nf(counts.totalPendingAmt)}원</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>이체대기</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb' }}>{counts.matched}건 · {nf(counts.totalMatchedAmt)}원</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>지급완료</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>{counts.paid}건</div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={generateMonth} disabled={busy !== ''}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff',
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy === 'generate' ? '생성 중...' : `⚡ ${filterDate} 정산 생성`}
          </button>
          <button onClick={runMatch} disabled={busy !== ''}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid #e2e8f0',
              background: '#fff', color: '#334155', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy === 'match' ? '매칭 중...' : '🔗 자동매칭'}
          </button>
        </div>
      </div>

      {/* ── 필터 ── */}
      <div style={{ padding: '10px 16px', display: 'flex', gap: 8, borderBottom: '1px solid #e2e8f0', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>상태:</span>
        {(['all', 'pending', 'matched', 'paid'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)}
            style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6,
              border: '1px solid ' + (status === s ? '#3b6eb5' : '#e2e8f0'),
              background: status === s ? '#3b6eb5' : '#fff',
              color: status === s ? '#fff' : '#334155', cursor: 'pointer' }}>
            {s === 'all' ? '전체' : s === 'pending' ? '미결' : s === 'matched' ? '이체대기' : '지급완료'}
          </button>
        ))}
        <span style={{ marginLeft: 12, fontSize: 11, color: '#64748b', fontWeight: 600 }}>유형:</span>
        {(['all', 'jiip', 'invest'] as const).map(t => (
          <button key={t} onClick={() => setType(t)}
            style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6,
              border: '1px solid ' + (type === t ? '#3b6eb5' : '#e2e8f0'),
              background: type === t ? '#3b6eb5' : '#fff',
              color: type === t ? '#fff' : '#334155', cursor: 'pointer' }}>
            {t === 'all' ? '전체' : t === 'jiip' ? '지입' : '투자'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>{loading ? '조회 중...' : `${filtered.length}건`}</span>
      </div>

      {/* ── 테이블 ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={th}>운영월</th>
              <th style={th}>유형</th>
              <th style={th}>수령인</th>
              <th style={{ ...th, textAlign: 'right' }}>지급액</th>
              <th style={th}>상태</th>
              <th style={th}>매칭일</th>
              <th style={th}>지급일</th>
              <th style={th}>작업</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                {loading ? '로딩 중...' : '항목이 없습니다. 상단의 "정산 생성" 버튼을 눌러 시작하세요.'}
              </td></tr>
            ) : filtered.map(r => {
              const sb = statusBadge(r.status)
              const tb = typeBadge(r.contract_type)
              return (
                <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={td}>{r.settlement_month}</td>
                  <td style={td}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: tb.color, background: tb.bg }}>{tb.label}</span>
                  </td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.recipient_name}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{nf(r.due_amount)}원</td>
                  <td style={td}>
                    <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: sb.color, background: sb.bg }}>{sb.label}</span>
                  </td>
                  <td style={{ ...td, color: '#64748b' }}>{r.matched_at ? new Date(r.matched_at).toLocaleDateString('ko-KR') : '—'}</td>
                  <td style={{ ...td, color: '#64748b' }}>{r.paid_at ? new Date(r.paid_at).toLocaleDateString('ko-KR') : '—'}</td>
                  <td style={td}>
                    {r.status === 'matched' && (
                      <button onClick={() => confirmPaid(r.id)} disabled={busy === r.id}
                        style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, borderRadius: 4, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer' }}>
                        지급확정
                      </button>
                    )}
                    {r.status === 'paid' && (
                      <button onClick={() => confirmPaid(r.id, true)} disabled={busy === r.id}
                        style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer' }}>
                        취소
                      </button>
                    )}
                    {r.status === 'pending' && (
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>자동매칭 대기</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {toast && (
        <div onClick={() => setToast('')}
          style={{ position: 'fixed', bottom: 24, right: 24, padding: '10px 18px', background: '#334155', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 100 }}>
          {toast}
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.02em' }
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: '#334155' }

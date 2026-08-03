'use client'

// ═══════════════════════════════════════════════════════════════
// 카드관리 — 독립 페이지 (2026-08-03 사용자 확정: 장부 매핑에서 분리)
//   ① 카드 원장  카드별 지출(이번달/지난달)·차량 귀속·마지막 사용
//   ② 카드 등록  마스터 편집(카드번호 전체 표시·소속 차량·종류·상태)
// 데이터: /api/finance/mappings (cards+cars) + /api/finance/card-stats
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from 'react'
import { COLORS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'

const nf = (n: any) => Number(n || 0).toLocaleString('ko-KR')
const d10 = (s: any) => (s ? String(s).slice(0, 10) : '—')
const last4 = (s: any) => String(s || '').replace(/\D/g, '').slice(-4)

const ISSUERS = ['KB국민', '우리', '현대', '신한', '삼성', '롯데', '하나', 'NH농협', '기타']
const CARD_TYPES = ['법인신용', '법인체크', '하이패스', '주유', '기타']
const STATUS_OPTS: Array<[string, string]> = [['active', '사용중'], ['suspended', '정지'], ['canceled', '해지']]

type CardRow = Record<string, any>

export default function CardMgmtPage() {
  const [tab, setTab] = useState<'usage' | 'master'>('usage')
  const [cards, setCards] = useState<CardRow[]>([])
  const [cars, setCars] = useState<any[]>([])
  const [stats, setStats] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<CardRow | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [m, s] = await Promise.all([
        fetchWithAuth('/api/finance/mappings'),
        fetchWithAuth('/api/finance/card-stats'),
      ])
      if (m.json) { setCards(m.json.cards || []); setCars(m.json.cars || []) }
      if (s.json?.data) setStats(s.json.data)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const sorted = useMemo(() => {
    const rank: Record<string, number> = { active: 0, suspended: 1, canceled: 2 }
    return [...cards].sort((a, b) =>
      (rank[a.status || 'active'] - rank[b.status || 'active'])
      || String(a.card_issuer || '').localeCompare(String(b.card_issuer || ''))
      || String(a.card_alias || '').localeCompare(String(b.card_alias || '')))
  }, [cards])

  const save = useCallback(async () => {
    if (!edit) return
    if (!edit.card_alias?.trim()) { alert('카드 별칭을 입력해주세요'); return }
    setBusy(true)
    try {
      const { json } = await fetchWithAuth('/api/finance/mappings', { method: 'POST', body: { type: 'card', ...edit } })
      if (json?.error) { alert(`저장 실패: ${json.error}`); return }
      setEdit(null); load()
    } finally { setBusy(false) }
  }, [edit, load])

  const remove = useCallback(async (c: CardRow) => {
    if (!confirm(`「${c.card_alias}」 카드를 삭제할까요?\n(과거 거래가 있는 카드는 삭제 대신 '해지' 상태를 권장합니다)`)) return
    const { json } = await fetchWithAuth(`/api/finance/mappings?id=${c.id}&type=card`, { method: 'DELETE' })
    if (json?.error) { alert(`삭제 실패: ${json.error}`); return }
    load()
  }, [load])

  // ── 공용 스타일 ──
  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12, boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden' }
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textMuted, padding: '10px 12px', borderBottom: `1.5px solid ${COLORS.borderSubtle}`, background: '#fafbfc', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', borderBottom: `1px solid ${COLORS.borderFaint}`, fontSize: 12.5, whiteSpace: 'nowrap', verticalAlign: 'middle' }
  const inputS: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`, fontSize: 13, outline: 'none', background: '#f6f7f9', boxSizing: 'border-box' }
  const lblS: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4, display: 'block' }

  function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
    return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 6, background: bg, color: fg, whiteSpace: 'nowrap' }}>{label}</span>
  }
  const statusBadge = (s: string) => s === 'canceled' ? <Badge label="해지" bg={COLORS.bgRed} fg={COLORS.danger} />
    : s === 'suspended' ? <Badge label="정지" bg={COLORS.bgAmber} fg={COLORS.warning} />
    : <Badge label="사용중" bg={COLORS.bgGreen} fg={COLORS.success} />

  const totalThisMonth = useMemo(() =>
    sorted.reduce((s, c) => s + (stats[last4(c.card_number)]?.this_month || 0), 0), [sorted, stats])

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, color: COLORS.textPrimary, fontSize: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 21, letterSpacing: '-0.02em', fontWeight: 700 }}>카드관리</h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 3 }}>법인카드 마스터와 카드별 지출·차량 귀속을 관리합니다</p>
        </div>
        <button onClick={() => setEdit({ status: 'active', card_type: '법인신용', card_issuer: 'KB국민' })}
          style={{ background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + 카드 등록
        </button>
      </div>

      {/* 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: '등록 카드', value: `${cards.length}장`, sub: `사용중 ${cards.filter((c) => (c.status || 'active') === 'active').length}`, dot: COLORS.primary },
          { label: '이번 달 카드 지출', value: `${nf(totalThisMonth)}원`, sub: '', dot: COLORS.danger },
          { label: '차량 배정 카드', value: `${cards.filter((c) => c.assigned_car_id).length}장`, sub: '지출 자동 귀속 대상', dot: '#6d28d9' },
        ].map((c, i) => (
          <div key={i} style={{ ...card, padding: '13px 15px', overflow: 'visible' }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, display: 'inline-block' }} />{c.label}
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>{loading ? '…' : c.value}</div>
            {c.sub && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e6e8ec', marginBottom: 14 }}>
        {([['usage', '카드 원장'], ['master', '카드 등록·매핑']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none',
              borderBottom: '2.5px solid', marginBottom: -2,
              borderBottomColor: tab === k ? COLORS.primary : 'transparent',
              color: tab === k ? COLORS.textPrimary : COLORS.textMuted,
            }}>{label}</button>
        ))}
      </div>

      {/* ── 카드 원장 (지출) ── */}
      {tab === 'usage' && (
        <div style={card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>카드</th><th style={th}>배정</th>
                <th style={{ ...th, textAlign: 'right' }}>이번 달</th>
                <th style={{ ...th, textAlign: 'right' }}>지난 달</th>
                <th style={{ ...th, textAlign: 'right' }}>6개월 누계</th>
                <th style={{ ...th, textAlign: 'center' }}>차량 귀속</th>
                <th style={{ ...th, textAlign: 'center' }}>마지막 사용</th>
                <th style={{ ...th, textAlign: 'center' }}>상태</th>
              </tr></thead>
              <tbody>
                {sorted.map((c) => {
                  const st = stats[last4(c.card_number)] || null
                  return (
                    <tr key={c.id}>
                      <td style={td}>
                        <div style={{ fontWeight: 700 }}>{c.card_alias || '—'}</div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: 'ui-monospace, monospace' }}>{c.card_number || ''}</div>
                      </td>
                      <td style={td}>
                        {c.car_number
                          ? <Badge label={`🚗 ${c.car_number}`} bg="#dbeafe" fg="#1d4ed8" />
                          : <span style={{ fontSize: 12, color: COLORS.textMuted }}>{c.holder_name || '공용'}{c.department ? ` · ${c.department}` : ''}</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{st?.this_month ? nf(st.this_month) : <span style={{ color: COLORS.textDim }}>-</span>}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: COLORS.textSecondary }}>{st?.last_month ? nf(st.last_month) : '-'}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: COLORS.textSecondary }}>{st?.six_month ? nf(st.six_month) : '-'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {st?.count
                          ? <span style={{ fontSize: 11.5, fontWeight: 600, color: st.car_assigned > 0 ? '#6d28d9' : COLORS.textMuted }}>{st.car_assigned}/{st.count}건</span>
                          : <span style={{ color: COLORS.textDim, fontSize: 11.5 }}>-</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'center', fontSize: 11.5, color: COLORS.textSecondary }}>{st?.last_used ? d10(st.last_used) : '-'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{statusBadge(c.status || 'active')}</td>
                    </tr>
                  )
                })}
                {!loading && sorted.length === 0 && <tr><td style={td} colSpan={8}>등록된 카드가 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', fontSize: 11.5, color: COLORS.textMuted, borderTop: `1px solid ${COLORS.borderFaint}` }}>
            지출 = 카드 명세서(excel) + 승인 문자(SMS), 최근 6개월 · 차량 귀속은 배정 차량 기준 자동 (주유·하이패스·정비 → 차량 원가)
          </div>
        </div>
      )}

      {/* ── 카드 등록·매핑 ── */}
      {tab === 'master' && (
        <div style={card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>카드사</th><th style={th}>카드번호</th><th style={th}>별칭</th>
                <th style={{ ...th, textAlign: 'center' }}>공용/지정</th><th style={th}>배정 (차량·부서)</th>
                <th style={{ ...th, textAlign: 'center' }}>종류</th><th style={{ ...th, textAlign: 'center' }}>상태</th>
                <th style={{ ...th, textAlign: 'center' }}>관리</th>
              </tr></thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id}>
                    <td style={td}><Badge label={c.card_issuer || '—'} bg={COLORS.borderFaint} fg={COLORS.textSecondary} /></td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                      {c.card_number || '—'}
                      {c.card_number && /[*]/.test(c.card_number) && <div style={{ fontSize: 10, color: COLORS.warning }}>원본 마스킹 — 수정에서 전체 번호 입력</div>}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{c.card_alias || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {c.assigned_car_id || c.assigned_employee_id
                        ? <Badge label="지정" bg="#dbeafe" fg="#1d4ed8" />
                        : <Badge label="공용" bg={COLORS.borderFaint} fg={COLORS.textSecondary} />}
                    </td>
                    <td style={td}>
                      {c.car_number ? <b>{c.car_number}</b> : (c.holder_name || '—')}
                      {c.department && <span style={{ fontSize: 11, color: COLORS.textMuted }}> · {c.department}</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <Badge label={c.card_type || '법인신용'}
                        bg={c.card_type === '하이패스' ? COLORS.bgAmber : c.card_type === '주유' ? COLORS.bgRed : '#dbeafe'}
                        fg={c.card_type === '하이패스' ? COLORS.warning : c.card_type === '주유' ? COLORS.danger : '#1d4ed8'} />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>{statusBadge(c.status || 'active')}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button onClick={() => setEdit({ ...c })}
                        style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, color: COLORS.primary, marginRight: 4 }}>수정</button>
                      <button onClick={() => remove(c)}
                        style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, color: COLORS.danger }}>삭제</button>
                    </td>
                  </tr>
                ))}
                {!loading && sorted.length === 0 && <tr><td style={td} colSpan={8}>등록된 카드가 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ 카드 편집 모달 ═══ */}
      {edit && (
        <div onClick={() => !busy && setEdit(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.24)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ ...card, width: 520, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>{edit.id ? '카드 수정' : '카드 등록'}</h2>
              <button onClick={() => setEdit(null)} style={{ border: 'none', background: COLORS.borderFaint, borderRadius: 8, width: 30, height: 30, fontSize: 15, color: COLORS.textSecondary, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={lblS}>카드사</label>
                  <select style={inputS} value={edit.card_issuer || ''} onChange={(e) => setEdit((d: any) => ({ ...d, card_issuer: e.target.value }))}>
                    <option value="">선택</option>{ISSUERS.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select></div>
                <div><label style={lblS}>종류</label>
                  <select style={inputS} value={edit.card_type || '법인신용'} onChange={(e) => setEdit((d: any) => ({ ...d, card_type: e.target.value }))}>
                    {CARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select></div>
              </div>
              <div><label style={lblS}>카드번호 (전체 — 내부 데이터)</label>
                <input style={inputS} value={edit.card_number || ''} placeholder="9410-4993-7262-1804"
                  onChange={(e) => setEdit((d: any) => ({ ...d, card_number: e.target.value }))} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={lblS}>별칭 *</label>
                  <input style={inputS} value={edit.card_alias || ''} placeholder="KB국민-1804"
                    onChange={(e) => setEdit((d: any) => ({ ...d, card_alias: e.target.value }))} /></div>
                <div><label style={lblS}>소지자/부서</label>
                  <input style={inputS} value={edit.holder_name || ''} placeholder="공용 (탁송팀)"
                    onChange={(e) => setEdit((d: any) => ({ ...d, holder_name: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={lblS}>배정 차량 (지출 자동 귀속)</label>
                  <select style={inputS} value={edit.assigned_car_id || ''} onChange={(e) => setEdit((d: any) => ({ ...d, assigned_car_id: e.target.value || null }))}>
                    <option value="">배정 안 함 (공용)</option>
                    {cars.map((v: any) => <option key={v.id} value={v.id}>{v.number} {[v.brand, v.model].filter(Boolean).join(' ')}</option>)}
                  </select></div>
                <div><label style={lblS}>상태</label>
                  <select style={inputS} value={edit.status || 'active'} onChange={(e) => setEdit((d: any) => ({ ...d, status: e.target.value }))}>
                    {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div><label style={lblS}>부서</label>
                  <input style={inputS} value={edit.department || ''} placeholder="탁송팀"
                    onChange={(e) => setEdit((d: any) => ({ ...d, department: e.target.value }))} /></div>
                <div><label style={lblS}>월 한도 (원)</label>
                  <input type="number" style={inputS} value={edit.monthly_limit || ''}
                    onChange={(e) => setEdit((d: any) => ({ ...d, monthly_limit: e.target.value }))} /></div>
                <div><label style={lblS}>결제일</label>
                  <input type="number" style={inputS} value={edit.payment_day || ''} placeholder="15"
                    onChange={(e) => setEdit((d: any) => ({ ...d, payment_day: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button disabled={busy} onClick={save}
                  style={{ flex: 1, background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 0', fontSize: 13.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
                  {busy ? '저장 중...' : '저장'}
                </button>
                <button disabled={busy} onClick={() => setEdit(null)}
                  style={{ padding: '10px 18px', background: '#fff', color: COLORS.textSecondary, border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>취소</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

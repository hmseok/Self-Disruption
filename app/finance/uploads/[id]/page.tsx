'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import TransactionEditModal from '../../../components/TransactionEditModal'
import { DISPLAY_CATEGORIES, TYPE_LABELS } from '../../../utils/finance-categories'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

const SOURCE_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  excel_bank: { icon: '🏦', label: '통장 엑셀', color: '#0891b2' },
  excel_card: { icon: '💳', label: '카드 엑셀', color: '#7c3aed' },
  pdf_card:   { icon: '💳', label: '카드 PDF',  color: '#7c3aed' },
  codef_bank: { icon: '🔌', label: 'Codef',     color: '#16a34a' },
  manual:     { icon: '✏️', label: '수기 입력', color: '#64748b' },
}

const nf = (n: number | null | undefined) => (n ? Number(n).toLocaleString() : '0')
const fmtDate = (s: string | null | undefined) => (s ? String(s).slice(0, 10) : '—')
const fmtDatetime = (s: string | null | undefined) =>
  s ? String(s).slice(0, 16).replace('T', ' ') : '—'

export default function BatchDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const batchId = decodeURIComponent(String(params?.id || ''))

  const [loading, setLoading] = useState(true)
  const [batch, setBatch] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [editingTxId, setEditingTxId] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [memo, setMemo] = useState('')
  const [savingMemo, setSavingMemo] = useState(false)

  async function loadDetail() {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const url = `/api/upload-batches/${encodeURIComponent(batchId)}${includeDeleted ? '?include_deleted=1' : ''}`
      const res = await fetch(url, { headers })
      const json = await res.json()
      if (json.error) {
        alert('로드 실패: ' + json.error)
        return
      }
      setBatch(json.data?.batch || null)
      setStats(json.data?.stats || null)
      setTransactions(json.data?.transactions || [])
      setMemo(json.data?.batch?.memo || '')
    } catch (e: any) {
      alert('로드 실패: ' + (e?.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (batchId) loadDetail() }, [batchId, includeDeleted])

  async function handleRollback() {
    if (batchId === '__manual__') return alert('수기 입력분은 롤백할 수 없습니다.')
    const msg = `⚠️ "${batch?.file_name || batchId}" 배치를 롤백하시겠습니까?\n\n` +
      `• 연결된 거래 ${stats?.live_count || 0}건이 소프트 삭제됩니다.\n` +
      `• 나중에 이 페이지 "롤백 복원" 버튼으로 복구 가능합니다.\n` +
      `• 파일을 다시 업로드해서 재분류할 수 있습니다.`
    if (!confirm(msg)) return
    setRollingBack(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/upload-batches/${encodeURIComponent(batchId)}/rollback`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ hard: false }),
      })
      const json = await res.json()
      if (json.error) {
        alert('롤백 실패: ' + json.error)
        return
      }
      alert(`✅ ${json.data?.affected || 0}건 소프트 삭제 완료`)
      await loadDetail()
    } catch (e: any) {
      alert('롤백 실패: ' + (e?.message || String(e)))
    } finally {
      setRollingBack(false)
    }
  }

  async function handleRestore() {
    if (!confirm('롤백을 복원하시겠습니까? (롤백 시 소프트 삭제된 거래만 복구 — 사후 수동 삭제는 보존)')) return
    setRollingBack(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/upload-batches/${encodeURIComponent(batchId)}/rollback`, {
        method: 'DELETE', headers,
      })
      const json = await res.json()
      if (json.error) {
        alert('복원 실패: ' + json.error)
        return
      }
      alert(`✅ ${json.data?.restored || 0}건 복원 완료`)
      await loadDetail()
    } catch (e: any) {
      alert('복원 실패: ' + (e?.message || String(e)))
    } finally {
      setRollingBack(false)
    }
  }

  async function handleSaveMemo() {
    if (batchId === '__manual__') return
    setSavingMemo(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/upload-batches/${encodeURIComponent(batchId)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo }),
      })
      const json = await res.json()
      if (json.error) {
        alert('메모 저장 실패: ' + json.error)
        return
      }
    } catch (e: any) {
      alert('메모 저장 실패: ' + (e?.message || String(e)))
    } finally {
      setSavingMemo(false)
    }
  }

  const sourceMeta = useMemo(() => {
    const st = batch?.source_type || 'manual'
    return SOURCE_LABELS[st] || { icon: '📄', label: st || '업로드', color: '#64748b' }
  }, [batch])

  // 표시용 필터링
  const filteredTx = useMemo(() => {
    const q = search.trim().toLowerCase()
    return transactions.filter(t => {
      if (categoryFilter === 'unclassified') {
        if (t.category && t.category !== '미분류' && t.category !== '') return false
      } else if (categoryFilter !== 'all') {
        const matches = DISPLAY_CATEGORIES.find(g => g.group === categoryFilter)
        if (matches && !matches.items.includes(t.category)) return false
      }
      if (!q) return true
      const hay = [t.client_name, t.description, t.category, t.memo, String(t.amount)]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [transactions, search, categoryFilter])

  const isRolledBack = !!batch?.rolled_back_at

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">
        {/* ── 상단 네비 + 제목 ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => router.push('/finance/transactions?tab=uploads')}
            style={btnBack}
          >← 업로드 이력</button>
          <span style={{ color: '#cbd5e1', fontSize: 14 }}>/</span>
          <span style={{ fontSize: 13, color: '#64748b' }}>배치 상세</span>
        </div>

        {/* ── 헤더 카드 ── */}
        <div className="si-card" style={{ padding: 24, marginBottom: 16 }}>
          {loading && !batch ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>불러오는 중...</div>
          ) : !batch ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>배치를 찾을 수 없습니다.</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                      background: `${sourceMeta.color}20`, color: sourceMeta.color,
                    }}>
                      {sourceMeta.icon} {sourceMeta.label}
                    </span>
                    {isRolledBack && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b' }}>
                        ⚠️ 롤백됨 · {fmtDatetime(batch.rolled_back_at)}
                      </span>
                    )}
                    {batch.deleted_at && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b' }}>
                        🗑 삭제됨
                      </span>
                    )}
                  </div>
                  <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#0f172a', wordBreak: 'break-all' }}>
                    {batch.file_name || batch.id}
                  </h1>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.7 }}>
                    <div>
                      <b>업로드:</b> {fmtDatetime(batch.uploaded_at)}
                      {batch.uploaded_by ? ` · ${batch.uploaded_by}` : ''}
                    </div>
                    {batch.institution && <div><b>기관:</b> {batch.institution}</div>}
                    {stats?.live_count !== undefined && (
                      <div>
                        <b>거래기간:</b> {fmtDate(transactions[transactions.length - 1]?.transaction_date)} ~ {fmtDate(transactions[0]?.transaction_date)}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                      <b>ID:</b> <code>{batch.id}</code>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {batch.id !== '__manual__' && !isRolledBack && (
                    <button
                      onClick={handleRollback}
                      disabled={rollingBack || (stats?.live_count || 0) === 0}
                      style={{ ...btnStyle, background: '#dc2626', color: 'white' }}
                    >🗑 일괄 롤백</button>
                  )}
                  {batch.id !== '__manual__' && isRolledBack && (
                    <button
                      onClick={handleRestore}
                      disabled={rollingBack}
                      style={{ ...btnStyle, background: '#16a34a', color: 'white' }}
                    >↩ 롤백 복원</button>
                  )}
                </div>
              </div>

              {/* KPI */}
              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 16 }}>
                  <Kpi label="총 거래" value={`${nf(stats.live_count)}건`} color="#0891b2" />
                  <Kpi label="분류 완료" value={`${nf(stats.classified_count)}건`} color="#16a34a" />
                  {stats.unclassified_count > 0 && (
                    <Kpi label="미분류" value={`${nf(stats.unclassified_count)}건`} color="#d97706" />
                  )}
                  <Kpi label="수입 합계" value={nf(stats.income_sum)} color="#16a34a" suffix="원" />
                  <Kpi label="지출 합계" value={nf(stats.expense_sum)} color="#dc2626" suffix="원" />
                  {stats.deleted_count > 0 && (
                    <Kpi label="삭제됨" value={`${nf(stats.deleted_count)}건`} color="#94a3b8" />
                  )}
                </div>
              )}

              {/* 메모 */}
              {batch.id !== '__manual__' && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>
                    📝 배치 메모
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={memo}
                      onChange={e => setMemo(e.target.value)}
                      onBlur={handleSaveMemo}
                      placeholder="이 업로드에 대한 메모 (선택)"
                      style={{ flex: 1, padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8 }}
                    />
                    <button
                      onClick={handleSaveMemo}
                      disabled={savingMemo}
                      style={btnStyle}
                    >{savingMemo ? '저장 중' : '저장'}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── 거래 내역 테이블 ── */}
        <div className="si-card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>
              📋 거래 내역 ({filteredTx.length}건
              {filteredTx.length !== transactions.length ? ` / 전체 ${transactions.length}건` : ''})
            </h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔎 적요·금액·카테고리 검색"
                style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, minWidth: 180 }}
              />
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}
              >
                <option value="all">전체 카테고리</option>
                <option value="unclassified">⚠️ 미분류만</option>
                {DISPLAY_CATEGORIES.map(g => (
                  <option key={g.group} value={g.group}>{g.group}</option>
                ))}
              </select>
              <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} />
                삭제된 거래 포함
              </label>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>불러오는 중...</div>
          ) : filteredTx.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>표시할 거래가 없습니다.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={thStyle}>거래일</th>
                    <th style={thStyle}>구분</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>금액</th>
                    <th style={thStyle}>적요 / 거래처</th>
                    <th style={thStyle}>카테고리</th>
                    <th style={thStyle}>연결</th>
                    <th style={thStyle}>결제</th>
                    <th style={{ ...thStyle, textAlign: 'center', width: 60 }}>편집</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTx.map((t: any) => {
                    const isDeleted = !!t.deleted_at
                    const cat = t.category || '미분류'
                    const isUncat = !t.category || t.category === '미분류' || t.category === ''
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setEditingTxId(t.id)}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isDeleted ? '#fee2e2' : isUncat ? '#fef9c3' : undefined,
                          opacity: isDeleted ? 0.6 : 1,
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#ecfeff' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = isDeleted ? '#fee2e2' : isUncat ? '#fef9c3' : '' }}
                      >
                        <td style={tdStyle}>{fmtDate(t.transaction_date)}</td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                            background: t.type === 'income' ? '#dcfce7' : '#fee2e2',
                            color: t.type === 'income' ? '#166534' : '#991b1b',
                          }}>
                            {t.type === 'income' ? '수입' : '지출'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: t.type === 'income' ? '#166534' : '#991b1b' }}>
                          {t.type === 'income' ? '+' : '-'}{nf(Number(t.amount))}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{t.client_name || '—'}</div>
                          {t.description && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{t.description}</div>}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                            background: isUncat ? '#fecaca' : '#dbeafe',
                            color: isUncat ? '#991b1b' : '#1e40af',
                          }}>
                            {isUncat ? '⚠️ 미분류' : cat}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {t.related_type ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                                background: '#dbeafe', color: '#1e40af', width: 'fit-content',
                              }}>
                                {TYPE_LABELS[t.related_type] || t.related_type}
                              </span>
                              {t.related_name && (
                                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>
                                  {t.related_name}
                                </span>
                              )}
                            </div>
                          ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{t.payment_method || '—'}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button
                            onClick={e => { e.stopPropagation(); setEditingTxId(t.id) }}
                            style={{
                              padding: '4px 8px', background: '#0891b2', color: 'white', border: 0,
                              borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            }}
                          >✏</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 편집 모달 */}
        <TransactionEditModal
          txId={editingTxId}
          onClose={() => setEditingTxId(null)}
          onSaved={() => loadDetail()}
        />
      </div>
    </div>
  )
}

function Kpi({ label, value, color, suffix }: { label: string; value: string; color: string; suffix?: string }) {
  return (
    <div style={{
      background: 'white', borderRadius: 12, padding: '10px 14px',
      border: `1px solid ${color}30`,
    }}>
      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 3 }}>
        {value} {suffix && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{suffix}</span>}
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', color: '#64748b', fontSize: 11,
  fontWeight: 700, borderBottom: '1px solid #e2e8f0',
}
const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: '#0f172a',
}
const btnStyle: React.CSSProperties = {
  padding: '6px 12px', background: '#0891b2', color: 'white', border: 0,
  borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}
const btnBack: React.CSSProperties = {
  padding: '5px 12px', background: 'white', color: '#0891b2',
  border: '1px solid #e0f2fe', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
}

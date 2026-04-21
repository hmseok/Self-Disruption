'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import TransactionEditModal from '../../components/TransactionEditModal'
import { COLORS, GLASS, BTN, SPACING, pillStyle } from '../../utils/ui-tokens'

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

type Batch = {
  id: string
  source_type: string
  institution: string | null
  file_name: string | null
  file_url: string | null
  uploaded_by: string | null
  uploaded_at: string | null
  memo: string | null
  deleted_at: string | null
  rolled_back_at: string | null
  live_count: number
  live_classified: number
  live_unclassified: number
  live_income: number
  live_expense: number
  min_tx_date: string | null
  max_tx_date: string | null
  total_count: number
}

const SOURCE_LABELS: Record<string, { icon: string; label: string }> = {
  excel_bank: { icon: '🏦', label: '통장 엑셀' },
  excel_card: { icon: '💳', label: '카드 엑셀' },
  pdf_card:   { icon: '💳', label: '카드 PDF'  },
  codef_bank: { icon: '🔌', label: 'Codef'     },
  manual:     { icon: '✏️', label: '수기 입력' },
}

const nf = (n: number | null | undefined) => (n ? Number(n).toLocaleString() : '0')

function batchIcon(b: Batch) {
  return SOURCE_LABELS[b.source_type]?.icon || '📄'
}
function batchLabel(b: Batch) {
  return SOURCE_LABELS[b.source_type]?.label || b.source_type || '업로드'
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return String(s).slice(0, 10)
}
function fmtDatetime(s: string | null | undefined) {
  if (!s) return '—'
  return String(s).slice(0, 16).replace('T', ' ')
}

export default function UploadsHistoryPage() {
  const router = useRouter()
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [includeRolledBack, setIncludeRolledBack] = useState(false)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [batchDetail, setBatchDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editingTxId, setEditingTxId] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState<string | null>(null)

  async function loadBatches() {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const url = `/api/upload-batches${includeRolledBack ? '?include_rolled_back=1' : ''}`
      const res = await fetch(url, { headers })
      const json = await res.json()
      if (json.error) {
        alert('로드 실패: ' + json.error)
        setLoading(false)
        return
      }
      setBatches(json.data || [])
      // 첫 배치 자동 선택
      if ((json.data || []).length > 0 && !selectedBatchId) {
        setSelectedBatchId(json.data[0].id)
      }
    } catch (e: any) {
      alert('로드 실패: ' + (e?.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  async function loadBatchDetail(id: string) {
    setDetailLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/upload-batches/${encodeURIComponent(id)}`, { headers })
      const json = await res.json()
      if (json.error) {
        alert('상세 로드 실패: ' + json.error)
        setDetailLoading(false)
        return
      }
      setBatchDetail(json.data)
    } catch (e: any) {
      alert('상세 로드 실패: ' + (e?.message || String(e)))
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleRollback(id: string) {
    const batch = batches.find(b => b.id === id)
    if (!batch) return
    const msg = `⚠️ "${batch.file_name || id}" 배치를 롤백하시겠습니까?\n\n` +
      `• 연결된 거래 ${batch.live_count}건이 소프트 삭제됩니다.\n` +
      `• 나중에 복원 가능합니다 (배치 목록에서 "복원" 버튼).\n` +
      `• 파일을 다시 업로드해서 재분류할 수 있습니다.`
    if (!confirm(msg)) return

    setRollingBack(id)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/upload-batches/${encodeURIComponent(id)}/rollback`, {
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
      await loadBatches()
      await loadBatchDetail(id)
    } catch (e: any) {
      alert('롤백 실패: ' + (e?.message || String(e)))
    } finally {
      setRollingBack(null)
    }
  }

  async function handleRestore(id: string) {
    if (!confirm('롤백을 복원하시겠습니까? (롤백 시 소프트 삭제된 거래가 복구됩니다)')) return
    setRollingBack(id)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/upload-batches/${encodeURIComponent(id)}/rollback`, {
        method: 'DELETE',
        headers,
      })
      const json = await res.json()
      if (json.error) {
        alert('복원 실패: ' + json.error)
        return
      }
      alert(`✅ ${json.data?.restored || 0}건 복원 완료`)
      await loadBatches()
      await loadBatchDetail(id)
    } catch (e: any) {
      alert('복원 실패: ' + (e?.message || String(e)))
    } finally {
      setRollingBack(null)
    }
  }

  useEffect(() => { loadBatches() }, [includeRolledBack])
  useEffect(() => {
    if (selectedBatchId) loadBatchDetail(selectedBatchId)
  }, [selectedBatchId])

  const selectedBatch = useMemo(
    () => batches.find(b => b.id === selectedBatchId),
    [batches, selectedBatchId]
  )

  return (
    <div className="page-bg">
      {/* Phase H3: hover CSS — onMouseEnter/onMouseLeave 제거 + :hover로 처리 */}
      <style>{`
        .uploads-tx-row[data-tone="uncat"]    { background: ${COLORS.bgRed}; }
        .uploads-tx-row[data-tone="etc"]      { background: ${COLORS.bgAmber}; }
        .uploads-tx-row[data-tone="deleted"]  { background: #fee2e2; }
        .uploads-tx-row[data-tone="normal"]   { background: transparent; }
        .uploads-tx-row:hover                 { background: ${COLORS.bgBlue} !important; }
        .uploads-btn-ghost:hover:not(:disabled)              { background: ${COLORS.bgGray}; border-color: ${COLORS.borderSubtle}; }
        .uploads-btn-primary-tint:hover:not(:disabled)       { background: ${COLORS.bgBlue}; border-color: ${COLORS.borderBlue}; }
        .uploads-btn-danger-tint:hover:not(:disabled)        { background: ${COLORS.bgRed};  border-color: ${COLORS.borderRed}; }
        .uploads-btn-primary:hover:not(:disabled)            { background: ${COLORS.primaryDark}; }
        .uploads-btn-ghost:disabled,
        .uploads-btn-primary:disabled                        { opacity: 0.55; cursor: not-allowed; }
      `}</style>
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">
        {/* 헤더 + 업로드 버튼 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary, margin: 0 }}>📂 업로드 이력</h1>
            <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
              파일 단위로 묶어 확인 · 각 거래는 클릭하여 수정
            </div>
          </div>
          <div style={{ display: 'flex', gap: SPACING.md, alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={includeRolledBack} onChange={e => setIncludeRolledBack(e.target.checked)} />
              롤백 배치 포함
            </label>
            <button
              onClick={() => router.push('/finance/upload')}
              className="uploads-btn-primary"
              style={{
                ...BTN.md,
                background: COLORS.primary,
                color: '#fff',
                border: 0,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(59,110,181,0.25)',
              }}
            >+ 새 업로드</button>
          </div>
        </div>

        {/* 배치 목록 카드 */}
        <div className="si-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>업로드 파일 ({batches.length}건)</h2>
          </div>

          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>불러오는 중...</div>
          ) : batches.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>업로드 이력이 없습니다.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {batches.map(b => {
                const isActive = b.id === selectedBatchId
                const isRolledBack = !!b.rolled_back_at
                // Phase B: 그래디언트 제거 → Soft Ice Glass L3 flat 톤 (롤백=red 틴트 / 정상=blue 틴트)
                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBatchId(b.id)}
                    style={{
                      border: isActive
                        ? `1px solid ${COLORS.primary}`
                        : isRolledBack
                          ? `1px solid ${COLORS.borderRed}`
                          : `1px solid ${COLORS.borderBlue}`,
                      borderRadius: 12, padding: '14px 16px',
                      background: isRolledBack ? COLORS.bgRed : COLORS.bgBlue,
                      backdropFilter: GLASS.L3.backdropFilter,
                      WebkitBackdropFilter: GLASS.L3.WebkitBackdropFilter,
                      boxShadow: isActive ? `0 0 0 3px ${COLORS.primary}33` : 'none',
                      cursor: 'pointer',
                      opacity: isRolledBack ? 0.75 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: 14 }}>
                          {batchIcon(b)} {b.file_name || b.id}
                          {isRolledBack && <span style={{ ...pillStyle('danger'), marginLeft: 8, fontSize: 10, padding: '2px 6px' }}>롤백됨</span>}
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 4 }}>
                          {batchLabel(b)} · {fmtDatetime(b.uploaded_at)}
                          {b.uploaded_by ? ` · ${b.uploaded_by}` : ''}
                          {b.min_tx_date && b.max_tx_date ? ` · 거래기간 ${fmtDate(b.min_tx_date)} ~ ${fmtDate(b.max_tx_date)}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: SPACING.sm }}>
                        <button
                          className="uploads-btn-ghost uploads-btn-primary-tint"
                          onClick={e => { e.stopPropagation(); router.push(`/finance/uploads/${encodeURIComponent(b.id)}`) }}
                          style={{ ...btnStyleGhost, color: COLORS.primary, borderColor: COLORS.borderBlue }}
                        >상세 →</button>
                        {isRolledBack ? (
                          <button
                            className="uploads-btn-ghost"
                            onClick={e => { e.stopPropagation(); handleRestore(b.id) }}
                            disabled={rollingBack === b.id}
                            style={btnStyleGhost}
                          >↩ 복원</button>
                        ) : b.id !== '__manual__' ? (
                          <button
                            className="uploads-btn-ghost uploads-btn-danger-tint"
                            onClick={e => { e.stopPropagation(); handleRollback(b.id) }}
                            disabled={rollingBack === b.id || Number(b.live_count) === 0}
                            style={{ ...btnStyleGhost, color: COLORS.danger, borderColor: COLORS.borderRed }}
                          >🗑 일괄 롤백</button>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: SPACING.xl, marginTop: SPACING.md, fontSize: 11 }}>
                      <span>✅ 분류 <b style={{ color: COLORS.success }}>{nf(Number(b.live_classified))}</b></span>
                      {Number(b.live_unclassified) > 0 && (
                        <span>⚠️ 미분류 <b style={{ color: COLORS.warning }}>{nf(Number(b.live_unclassified))}</b></span>
                      )}
                      {Number(b.live_income) > 0 && (
                        <span>수입 <b style={{ color: COLORS.success }}>{nf(Number(b.live_income))}</b></span>
                      )}
                      {Number(b.live_expense) > 0 && (
                        <span>지출 <b style={{ color: COLORS.danger }}>{nf(Number(b.live_expense))}</b></span>
                      )}
                      <span style={{ color: COLORS.textMuted }}>총 {nf(Number(b.live_count))}건</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 선택된 배치 상세 (거래 목록) */}
        {selectedBatch && (
          <div className="si-card" style={{ padding: 0 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>
                {batchIcon(selectedBatch)} {selectedBatch.file_name || selectedBatch.id} — 거래 내역
                {batchDetail?.stats && <span style={{ marginLeft: 10, fontSize: 11, color: COLORS.textSecondary, fontWeight: 500 }}>
                  ({batchDetail.stats.live_count}건)
                </span>}
              </h2>
              {batchDetail?.stats?.unclassified_count > 0 && (
                // Decision 1α: 미분류 = 빨강 (amber 아님)
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: COLORS.bgRed, color: COLORS.unclassified, fontWeight: 700, border: `1px solid ${COLORS.borderRed}` }}>
                  미분류 {batchDetail.stats.unclassified_count}건
                </span>
              )}
            </div>

            {detailLoading ? (
              <div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>불러오는 중...</div>
            ) : !batchDetail?.transactions?.length ? (
              <div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>거래가 없습니다.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: COLORS.bgGray }}>
                      <th style={thStyle}>거래일</th>
                      <th style={thStyle}>구분</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>금액</th>
                      <th style={thStyle}>적요</th>
                      <th style={thStyle}>카테고리</th>
                      <th style={thStyle}>연결</th>
                      <th style={{ ...thStyle, textAlign: 'center', width: 60 }}>편집</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchDetail.transactions.slice(0, 500).map((t: any) => {
                      const isDeleted = !!t.deleted_at
                      const cat = t.category || '미분류'
                      const isUncat = !t.category || t.category === '미분류' || t.category === ''
                      const isEtc = t.category === '기타'
                      // Decision 1α: 미분류=red / 기타=amber / 삭제=red-tint / 정상=투명
                      // Phase H3: hover CSS 전환 → data-tone + :hover로 처리
                      const tone: 'uncat' | 'etc' | 'deleted' | 'normal' =
                        isUncat ? 'uncat' : isEtc ? 'etc' : isDeleted ? 'deleted' : 'normal'
                      return (
                        <tr
                          key={t.id}
                          className="uploads-tx-row"
                          data-tone={tone}
                          onClick={() => setEditingTxId(t.id)}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            opacity: isDeleted ? 0.6 : 1,
                            cursor: 'pointer',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <td style={tdStyle}>{fmtDate(t.transaction_date)}</td>
                          <td style={tdStyle}>
                            <span style={pillStyle(t.type === 'income' ? 'success' : 'danger')}>
                              {t.type === 'income' ? '수입' : '지출'}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: t.type === 'income' ? COLORS.success : COLORS.danger }}>
                            {t.type === 'income' ? '+' : '-'}{nf(Number(t.amount))}
                          </td>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600, color: COLORS.textPrimary }}>{t.client_name || '—'}</div>
                            {t.description && <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{t.description}</div>}
                          </td>
                          <td style={tdStyle}>
                            <span style={pillStyle(isUncat ? 'danger' : 'info')}>
                              {isUncat ? '⚠️ 미분류' : cat}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            {t.related_type ? (
                              <span style={pillStyle('neutral')}>{t.related_type}</span>
                            ) : <span style={{ color: COLORS.textDim }}>—</span>}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <button
                              onClick={e => { e.stopPropagation(); setEditingTxId(t.id) }}
                              style={{
                                ...BTN.sm,
                                background: COLORS.primary,
                                color: '#fff',
                                border: 0,
                                cursor: 'pointer',
                              }}
                            >✏</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {batchDetail.transactions.length > 500 && (
                  <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: COLORS.textSecondary }}>
                    첫 500건만 표시 · 총 {batchDetail.transactions.length}건
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 편집 모달 */}
        <TransactionEditModal
          txId={editingTxId}
          onClose={() => setEditingTxId(null)}
          onSaved={async () => {
            if (selectedBatchId) await loadBatchDetail(selectedBatchId)
            await loadBatches()
          }}
        />
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', color: COLORS.textSecondary, fontSize: 11,
  fontWeight: 700, borderBottom: `1px solid ${COLORS.borderSubtle}`,
}
const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: COLORS.textPrimary,
}
const btnStyleGhost: React.CSSProperties = {
  ...BTN.sm,
  background: 'rgba(255,255,255,0.85)',
  color: COLORS.textSecondary,
  border: `1px solid ${COLORS.borderSubtle}`,
  cursor: 'pointer',
  transition: 'background 0.15s ease, border-color 0.15s ease',
}

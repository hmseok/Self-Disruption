'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  CATEGORIES,
  DISPLAY_CATEGORIES,
  ALL_CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_RELATED_MAP,
  TYPE_LABELS,
} from '../utils/finance-categories'

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

type RelatedOption = {
  group: string       // '차량', '직원', '지입 차주', '투자자', '계약', '보험', '법인카드', '프리랜서' 등
  id: string
  label: string       // 표시용
  type: string        // transactions.related_type 값 (car, jiip, invest, ...)
}

export interface TransactionEditModalProps {
  txId: string | null                   // null 이면 모달 숨김
  onClose: () => void
  onSaved?: () => void                  // 저장 완료 후 부모 새로고침 트리거
}

/**
 * 거래 상세/편집 공용 모달.
 * 사용처:
 *   - /finance (대시보드) 행 클릭
 *   - /finance/uploads (업로드 이력) 행 클릭
 *   - 기타 드릴다운 상세
 */
export default function TransactionEditModal({ txId, onClose, onSaved }: TransactionEditModalProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tx, setTx] = useState<any>(null)
  const [relatedOptions, setRelatedOptions] = useState<RelatedOption[]>([])
  const [categoryMode, setCategoryMode] = useState<'display' | 'accounting'>('display')

  // 폼 상태
  const [form, setForm] = useState({
    transaction_date: '',
    type: 'expense' as 'income' | 'expense',
    amount: '',
    category: '',
    client_name: '',
    description: '',
    memo: '',
    related_type: '',
    related_id: '',
    payment_method: '통장',
  })

  // txId 바뀔 때마다 로드
  useEffect(() => {
    if (!txId) return
    ;(async () => {
      setLoading(true)
      try {
        const headers = await getAuthHeader()
        const res = await fetch(`/api/transactions/${txId}`, { headers })
        const json = await res.json()
        if (json.error) {
          alert('거래 로드 실패: ' + json.error)
          onClose()
          return
        }
        const t = json.data
        setTx(t)
        setForm({
          transaction_date: t.transaction_date ? String(t.transaction_date).slice(0, 10) : '',
          type: (t.type === 'income' ? 'income' : 'expense'),
          amount: String(Number(t.amount || 0)),
          category: t.category || '',
          client_name: t.client_name || '',
          description: t.description || '',
          memo: t.memo || '',
          related_type: t.related_type || '',
          related_id: t.related_id || '',
          payment_method: t.payment_method || '통장',
        })
      } catch (e: any) {
        alert('거래 로드 실패: ' + (e?.message || String(e)))
        onClose()
      } finally {
        setLoading(false)
      }
    })()
  }, [txId])

  // 연결대상 후보 로드 (차량/직원/지입차주/투자자/계약/보험/법인카드/프리랜서)
  useEffect(() => {
    if (!txId) return
    ;(async () => {
      try {
        const headers = await getAuthHeader()
        const tables = [
          { table: 'cars', group: '차량', type: 'car' },
          { table: 'profiles', group: '직원', type: 'employee' },
          { table: 'jiip_contracts', group: '지입 차주', type: 'jiip' },
          { table: 'general_investments', group: '투자자', type: 'invest' },
          { table: 'contracts', group: '계약', type: 'contract' },
          { table: 'insurance_contracts', group: '보험', type: 'insurance' },
          { table: 'corporate_cards', group: '법인카드', type: 'card' },
          { table: 'freelancers', group: '프리랜서', type: 'freelancer' },
          { table: 'loans', group: '대출', type: 'loan' },
        ]
        const results = await Promise.all(
          tables.map(async ({ table, group, type }) => {
            try {
              const r = await fetch(`/api/finance-upload?table=${table}`, { headers })
              if (!r.ok) return [] as RelatedOption[]
              const j = await r.json()
              const rows = j.data || []
              return rows.map((row: any) => {
                let label = ''
                if (table === 'cars') label = `${row.plate_number || ''} ${row.model_name || ''}`.trim() || row.id
                else if (table === 'profiles') label = row.name || row.email || row.id
                else if (table === 'jiip_contracts') label = `${row.borrower_name || ''} ${row.car_plate ? `(${row.car_plate})` : ''}`.trim() || row.id
                else if (table === 'general_investments') label = row.investor_name || row.id
                else if (table === 'contracts') label = `${row.contract_number || ''} ${row.customer_name || ''}`.trim() || row.id
                else if (table === 'insurance_contracts') label = `${row.insurer || ''} ${row.policy_number || ''}`.trim() || row.id
                else if (table === 'corporate_cards') label = `${row.card_brand || ''} ${row.card_name || ''}`.trim() || row.id
                else if (table === 'freelancers') label = row.name || row.id
                else if (table === 'loans') label = `${row.lender || ''} ${row.contract_number || ''}`.trim() || row.id
                else label = row.id
                return { group, id: row.id, label, type } as RelatedOption
              })
            } catch {
              return [] as RelatedOption[]
            }
          })
        )
        setRelatedOptions(results.flat())
      } catch {}
    })()
  }, [txId])

  // 카테고리에 맞는 연결 대상만 필터
  const filteredRelatedOptions = useMemo(() => {
    const map = CATEGORY_RELATED_MAP[form.category]
    if (!map || map === 'all') return relatedOptions
    if (Array.isArray(map) && map.length === 0) return []
    const allowed = new Set(map)
    return relatedOptions.filter(o => allowed.has(o.group))
  }, [relatedOptions, form.category])

  // 카테고리 그룹 플랫 리스트
  const categoryGroups = categoryMode === 'display' ? DISPLAY_CATEGORIES : CATEGORIES

  async function handleSave() {
    if (!tx) return
    setSaving(true)
    try {
      const headers = await getAuthHeader()
      const payload: any = {
        transaction_date: form.transaction_date,
        type: form.type,
        amount: Number(String(form.amount).replace(/,/g, '')) || 0,
        category: form.category || null,
        client_name: form.client_name || null,
        description: form.description || null,
        memo: form.memo || null,
        related_type: form.related_type || null,
        related_id: form.related_id || null,
        payment_method: form.payment_method || null,
      }
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.error) {
        alert('저장 실패: ' + json.error)
        setSaving(false)
        return
      }
      onSaved?.()
      onClose()
    } catch (e: any) {
      alert('저장 실패: ' + (e?.message || String(e)))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!tx) return
    if (!confirm('이 거래를 소프트 삭제하시겠습니까?\n(deleted_at만 기록, 나중에 복구 가능)')) return
    setSaving(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE', headers })
      const json = await res.json()
      if (json.error) {
        alert('삭제 실패: ' + json.error)
        setSaving(false)
        return
      }
      onSaved?.()
      onClose()
    } catch (e: any) {
      alert('삭제 실패: ' + (e?.message || String(e)))
    } finally {
      setSaving(false)
    }
  }

  if (!txId) return null

  const badge = (text: string, bg: string, color: string) => (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, background: bg, color,
    }}>{text}</span>
  )

  const source = tx?.imported_from
    ? (tx.imported_from.startsWith('excel_card_') ? '💳 카드 엑셀' :
       tx.imported_from.startsWith('excel_bank_') ? '🏦 통장 엑셀' :
       tx.imported_from.startsWith('pdf_card_')   ? '💳 카드 PDF'  :
       tx.imported_from.startsWith('codef_')      ? '🔌 Codef'     :
       '📄 업로드')
    : '✏️ 수기 입력'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 1000, padding: '40px 20px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 18, padding: 24, width: 580, maxWidth: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.3)', fontSize: 13, color: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>거래 상세 / 편집</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 14 }}>
          {source} {tx?.imported_from ? `· ${tx.imported_from}` : ''}
        </div>

        {loading || !tx ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>불러오는 중...</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="거래일">
                <input type="date" value={form.transaction_date}
                  onChange={e => setForm({ ...form, transaction_date: e.target.value })}
                  style={inputStyle} />
              </Field>
              <Field label="구분">
                <select value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as any })}
                  style={inputStyle}>
                  <option value="expense">🔴 지출</option>
                  <option value="income">🔵 수입</option>
                </select>
              </Field>
              <Field label="금액 (원)">
                <input
                  type="text"
                  value={form.amount ? Number(String(form.amount).replace(/,/g, '')).toLocaleString() : ''}
                  onChange={e => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, '') })}
                  style={{ ...inputStyle, textAlign: 'right', fontWeight: 700 }}
                />
              </Field>
              <Field label="결제수단">
                <select value={form.payment_method}
                  onChange={e => setForm({ ...form, payment_method: e.target.value })}
                  style={inputStyle}>
                  <option value="통장">통장</option>
                  <option value="카드">카드</option>
                  <option value="현금">현금</option>
                  <option value="기타">기타</option>
                </select>
              </Field>
            </div>

            <div style={{ marginTop: 12, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={labelStyle}>카테고리</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setCategoryMode('display')}
                  style={toggleStyle(categoryMode === 'display')}
                >용도별</button>
                <button
                  onClick={() => setCategoryMode('accounting')}
                  style={toggleStyle(categoryMode === 'accounting')}
                >회계기준</button>
              </div>
            </div>
            <select
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value, related_id: '', related_type: '' })}
              style={inputStyle}
            >
              <option value="">— 선택 —</option>
              {categoryGroups.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map(it => (
                    <option key={it} value={it}>
                      {CATEGORY_ICONS[it] || ''} {it}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <Field label="적요 / 거래처">
              <input value={form.client_name}
                onChange={e => setForm({ ...form, client_name: e.target.value })}
                style={inputStyle} />
            </Field>

            {filteredRelatedOptions.length > 0 && (
              <Field label={`연결 대상 (${filteredRelatedOptions.length}건 후보)`}>
                <select
                  value={form.related_id}
                  onChange={e => {
                    const opt = filteredRelatedOptions.find(o => o.id === e.target.value)
                    setForm({
                      ...form,
                      related_id: e.target.value,
                      related_type: opt?.type || '',
                    })
                  }}
                  style={inputStyle}
                >
                  <option value="">— 연결 없음 —</option>
                  {groupedOptions(filteredRelatedOptions).map(([group, opts]) => (
                    <optgroup key={group} label={group}>
                      {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </Field>
            )}

            <Field label="메모">
              <textarea rows={2}
                value={form.memo}
                onChange={e => setForm({ ...form, memo: e.target.value })}
                placeholder="선택사항"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </Field>

            {/* 원본 정보 */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                🔒 원본 / 감사 정보
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#64748b', lineHeight: 1.7 }}>
                <div>ID: <code style={{ fontSize: 10 }}>{tx.id}</code></div>
                <div>출처: {source}{tx.imported_from ? ` (${tx.imported_from})` : ''}</div>
                <div>생성: {tx.created_at ? String(tx.created_at).slice(0, 19).replace('T', ' ') : '—'}</div>
                <div>수정: {tx.updated_at ? String(tx.updated_at).slice(0, 19).replace('T', ' ') : '—'}</div>
                {tx.deleted_at && <div style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ 삭제됨: {String(tx.deleted_at).slice(0, 19).replace('T', ' ')}</div>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={handleDelete}
                disabled={saving}
                style={{
                  padding: '8px 14px', background: '#dc2626', color: 'white', border: 0,
                  borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >🗑 소프트 삭제</button>
              <div style={{ flex: 1 }} />
              <button
                onClick={onClose}
                disabled={saving}
                style={{
                  padding: '8px 14px', background: 'white', color: '#64748b',
                  border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >취소</button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 14px', background: '#0891b2', color: 'white', border: 0,
                  borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >{saving ? '저장 중...' : '저장'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 12, boxSizing: 'border-box', background: 'white', color: '#0f172a',
}
function toggleStyle(active: boolean): React.CSSProperties {
  return {
    padding: '3px 10px', fontSize: 10, fontWeight: 700,
    borderRadius: 6, cursor: 'pointer',
    background: active ? '#0891b2' : 'white',
    color: active ? 'white' : '#64748b',
    border: active ? '1px solid #0891b2' : '1px solid #e2e8f0',
  }
}

function groupedOptions(opts: RelatedOption[]): [string, RelatedOption[]][] {
  const map = new Map<string, RelatedOption[]>()
  for (const o of opts) {
    if (!map.has(o.group)) map.set(o.group, [])
    map.get(o.group)!.push(o)
  }
  return Array.from(map.entries())
}

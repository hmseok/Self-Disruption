'use client'

// ═══════════════════════════════════════════════════════════════════
// QuickTxModal — 전역 "빠른 입력" 모달
// ───────────────────────────────────────────────────────────────────
// Phase H1 (Consolidation v1) — Decision 8β
//  ✓ 구 /finance 대시보드의 inline 입력 폼을 모달로 분리
//  ✓ Soft Ice Glass L4 + GLASS.L1 오목 인풋 + BTN.md 토큰화
//  ✓ Escape 닫기, 백드롭 클릭 닫기, body scroll lock
// 사용처:
//  - /finance/transactions?tab=dashboard (DashboardTab 헤더 버튼)
//  - 전역 네비 "⚡ 빠른 입력" (Phase I에서 배치)
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, BTN, SPACING } from '../utils/ui-tokens'

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

type InitialMode = 'completed' | 'pending'
type FormState = {
  transaction_date: string
  type: 'income' | 'expense'
  status: InitialMode
  category: string
  client_name: string
  description: string
  amount: string
  payment_method: string
}

const initForm = (mode: InitialMode): FormState => ({
  transaction_date: new Date().toISOString().split('T')[0],
  type: 'expense',
  status: mode,
  category: '기타운영비',
  client_name: '',
  description: '',
  amount: '',
  payment_method: '통장',
})

export interface QuickTxModalProps {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  /** 기본 상태 (dashboard=completed, schedule 탭=pending) */
  initialStatus?: InitialMode
  /** 회사 컨텍스트 — 있으면 body에 company_id 함께 전송 */
  companyId?: string | null
  /** admin 역할일 때 company 미선택 경고 */
  requireCompany?: boolean
}

export default function QuickTxModal({
  open,
  onClose,
  onSaved,
  initialStatus = 'completed',
  companyId = null,
  requireCompany = false,
}: QuickTxModalProps) {
  const [form, setForm] = useState<FormState>(() => initForm(initialStatus))
  const [saving, setSaving] = useState(false)

  // open 토글 시 폼 리셋 + status 동기화
  useEffect(() => {
    if (open) setForm(initForm(initialStatus))
  }, [open, initialStatus])

  // Escape 닫기
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const handleSave = useCallback(async () => {
    if (requireCompany && !companyId) {
      alert('⚠️ 회사를 먼저 선택해주세요.')
      return
    }
    if (!form.amount || !form.client_name) {
      alert('필수 항목을 입력해주세요. (거래처/내용 + 금액)')
      return
    }
    setSaving(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: Number(String(form.amount).replace(/,/g, '')),
          company_id: companyId,
        }),
      })
      const json = await res.json()
      if (json.error) {
        alert('저장 실패: ' + json.error)
      } else {
        onSaved?.()
        onClose()
      }
    } catch (e: any) {
      alert('저장 실패: ' + (e?.message || String(e)))
    } finally {
      setSaving(false)
    }
  }, [form, companyId, requireCompany, onClose, onSaved])

  if (!open) return null

  const isSchedule = form.status === 'pending'

  // ── 공용 스타일 ──
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.textMuted,
    marginBottom: 4,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.textPrimary,
    borderRadius: 8,
    outline: 'none',
    ...GLASS.L1,
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '6vh 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="빠른 입력"
        style={{
          width: '100%',
          maxWidth: 720,
          borderRadius: 16,
          padding: SPACING.xl,
          boxShadow: '0 20px 60px rgba(15,23,42,0.25)',
          ...GLASS.L4,
        }}
      >
        {/* ── 헤더 ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.lg,
          }}
        >
          <h3
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: COLORS.textPrimary,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {isSchedule ? '🗓️ 예정 내역 등록' : '✏️ 입출금 빠른 입력'}
          </h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div
              role="tablist"
              style={{
                display: 'inline-flex',
                padding: 3,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.55)',
                border: `1px solid ${COLORS.borderFaint}`,
              }}
            >
              {(['completed', 'pending'] as InitialMode[]).map((s) => {
                const active = form.status === s
                return (
                  <button
                    key={s}
                    onClick={() => setForm((p) => ({ ...p, status: s }))}
                    style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      color: active ? COLORS.textPrimary : COLORS.textMuted,
                      background: active ? 'rgba(255,255,255,0.95)' : 'transparent',
                      border: active
                        ? `1px solid ${COLORS.borderSubtle}`
                        : '1px solid transparent',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    {s === 'completed' ? '확정' : '예정'}
                  </button>
                )
              })}
            </div>
            <button
              onClick={onClose}
              aria-label="닫기"
              style={{
                width: 28,
                height: 28,
                fontSize: 18,
                color: COLORS.textMuted,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 6,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── 폼 그리드 ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gap: SPACING.lg,
          }}
        >
          <div style={{ gridColumn: 'span 3' }}>
            <label style={labelStyle}>날짜</label>
            <input
              type="date"
              value={form.transaction_date}
              onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: 'span 3' }}>
            <label style={labelStyle}>구분</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'income' | 'expense' })}
              style={inputStyle}
            >
              <option value="expense">🔴 지출 (출금)</option>
              <option value="income">🔵 수입 (입금)</option>
            </select>
          </div>

          <div style={{ gridColumn: 'span 3' }}>
            <label style={labelStyle}>결제수단</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              style={inputStyle}
            >
              <option value="통장">🏦 통장</option>
              <option value="카드">💳 카드</option>
              <option value="현금">💵 현금</option>
              <option value="기타">🔧 기타</option>
            </select>
          </div>

          <div style={{ gridColumn: 'span 3' }}>
            <label style={labelStyle}>계정과목</label>
            <input
              list="quick-tx-cat-list"
              placeholder="검색 또는 입력"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              style={inputStyle}
            />
            <datalist id="quick-tx-cat-list">
              <option value="투자이자" />
              <option value="지입정산금" />
              <option value="보험료" />
              <option value="대출원리금" />
              <option value="차량할부금" />
              <option value="관리비수입" />
              <option value="기타운영비" />
            </datalist>
          </div>

          <div style={{ gridColumn: 'span 7' }}>
            <label style={labelStyle}>거래처 / 내용</label>
            <input
              placeholder="거래처 또는 내용 입력"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: 'span 5' }}>
            <label style={labelStyle}>금액</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={form.amount ? Number(form.amount).toLocaleString() : ''}
              onChange={(e) =>
                setForm({ ...form, amount: e.target.value.replace(/,/g, '') })
              }
              style={{
                ...inputStyle,
                textAlign: 'right',
                fontWeight: 900,
                fontSize: 15,
                color: form.type === 'income' ? COLORS.income : COLORS.expense,
              }}
            />
          </div>

          <div style={{ gridColumn: 'span 12' }}>
            <label style={labelStyle}>메모 (선택)</label>
            <input
              placeholder="내용 보충"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>

        {/* ── 액션 ── */}
        <div
          style={{
            marginTop: SPACING.xl,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: SPACING.md,
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              ...BTN.md,
              color: COLORS.textSecondary,
              background: 'transparent',
              border: `1px solid ${COLORS.borderSubtle}`,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              ...BTN.md,
              color: '#fff',
              background: saving
                ? COLORS.neutral
                : isSchedule
                ? COLORS.success
                : COLORS.primary,
              border: 'none',
              cursor: saving ? 'progress' : 'pointer',
              boxShadow: '0 4px 12px rgba(59,110,181,0.25)',
            }}
          >
            {saving ? '저장 중…' : isSchedule ? '🗓️ 예정 등록' : '✅ 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

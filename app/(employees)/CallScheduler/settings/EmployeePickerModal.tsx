'use client'
// ═══════════════════════════════════════════════════════════════════
// EmployeePickerModal — 인사마스터 직원 선택 모달
//   Phase WHR-A / WHR-A-fix (2026-05-24) — 워커 ↔ 인사마스터 연동
//   용도 1: 신규 워커 생성 (mode='create')
//   용도 2: 레거시 워커에 직원 연결 (mode='link' — 대상 워커명 표시)
//   GET /api/call-scheduler/hr-employees → ride_employees(is_active=1, 콜센터 우선) 목록.
//   이미 연결된 직원(already_linked)은 회색 + "이미 등록" 표시.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { HrEmployee } from '@/app/(employees)/CallScheduler/utils/types'

interface Props {
  open: boolean
  onClose: () => void
  // 선택 완료 — 부모가 워커 생성(POST) 또는 연결(PATCH) 수행
  onSelect: (emp: HrEmployee) => Promise<void> | void
  // 'link' 모드일 때 연결 대상 워커 이름 (안내 텍스트용)
  linkTargetName?: string | null
  busy?: boolean
}

export default function EmployeePickerModal({
  open, onClose, onSelect, linkTargetName, busy,
}: Props) {
  const [employees, setEmployees] = useState<HrEmployee[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    setSearch(''); setError(null)
    let cancelled = false
    const fetchEmployees = async () => {
      setLoading(true)
      try {
        const auth = await getAuthHeader()
        const res = await fetch('/api/call-scheduler/hr-employees', { headers: auth })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '직원 조회 실패')
        if (!cancelled) setEmployees(Array.isArray(json.data) ? json.data : [])
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '오류')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchEmployees()
    return () => { cancelled = true }
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q) ||
      (e.position || '').toLowerCase().includes(q)
    )
  }, [employees, search])

  if (!open) return null

  const selectableCount = employees.filter(e => !e.already_linked).length

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, width: 520, maxWidth: '94vw', maxHeight: '86vh',
        borderRadius: 16, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.textPrimary }}>
            👤 {linkTargetName ? `직원 연결 — ${linkTargetName}` : '직원 선택 — 워커 추가'}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
            인사마스터 직원 중 선택 — 이름·전화번호는 인사마스터에서 자동 복사 ·
            선택 가능 <strong>{selectableCount}명</strong>
          </div>
        </div>

        {/* 검색 — Glass L1 (오목 인풋) */}
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 / 부서 / 직급 검색"
          autoFocus
          style={{
            ...GLASS.L1, borderRadius: 8, padding: '8px 12px', fontSize: 13,
            color: COLORS.textPrimary, outline: 'none',
          }}
        />

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            color: COLORS.danger, fontSize: 12,
          }}>❌ {error}</div>
        )}

        {/* 직원 목록 */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {loading ? (
            <div style={{ padding: 28, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>
              로딩 중...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>
              {search ? '검색 결과 없음' : '재직 중인 직원이 없습니다'}
            </div>
          ) : (
            filtered.map(emp => {
              const linked = emp.already_linked
              return (
                <button
                  key={emp.id} type="button"
                  disabled={linked || busy}
                  onClick={() => onSelect(emp)}
                  style={{
                    ...(linked ? {} : GLASS.L2),
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, padding: '8px 12px', borderRadius: 8, textAlign: 'left',
                    background: linked ? COLORS.bgGray : GLASS.L2.background,
                    border: `1px solid ${COLORS.borderFaint}`,
                    cursor: linked || busy ? 'not-allowed' : 'pointer',
                    opacity: linked ? 0.6 : 1,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: linked ? COLORS.textMuted : COLORS.textPrimary,
                      whiteSpace: 'nowrap',
                    }}>{emp.name}</span>
                    <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                      {emp.department || '·'}{emp.position ? ` · ${emp.position}` : ''}
                    </span>
                  </div>
                  {linked ? (
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
                      background: COLORS.bgGray, color: COLORS.textMuted,
                      border: `1px solid ${COLORS.borderFaint}`, whiteSpace: 'nowrap',
                    }}>이미 등록</span>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.info, whiteSpace: 'nowrap' }}>
                      선택 →
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={busy} style={{
            ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
            border: `1px solid ${COLORS.borderFaint}`,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}>닫기</button>
        </div>
      </div>
    </div>
  )
}

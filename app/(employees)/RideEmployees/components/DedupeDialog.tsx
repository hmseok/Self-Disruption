'use client'
// ═══════════════════════════════════════════════════════════════════
// DedupeDialog — 직원 마스터 중복 검출 + 정리
// 같은 이름 그룹별 미리보기 → 가장 오래된 row 만 남기고 나머지 비활성화
// cs_workers.employee_id 자동 통합
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

interface Props {
  open: boolean
  onClose: () => void
  onCompleted: () => void
}

interface DupGroup {
  name: string
  count: number
  keep_id: string
  rows: Array<{
    id: string
    name: string
    department: string | null
    position: string | null
    hire_date: string | null
    phone: string | null
    public_token: string | null
    created_at: string
  }>
}

export default function DedupeDialog({ open, onClose, onCompleted }: Props) {
  const [groups, setGroups] = useState<DupGroup[]>([])
  const [previewLoaded, setPreviewLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  if (!open) return null

  const run = async (mode: 'preview' | 'apply') => {
    setBusy(true); setResult(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/ride-employees/dedupe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ mode }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      setGroups(json.data.groups || [])
      setPreviewLoaded(true)
      if (mode === 'apply') {
        setResult({ ok: true, text: json.data.message || '정리 완료' })
        onCompleted()
      }
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || '오류' })
    } finally { setBusy(false) }
  }

  const close = () => {
    setGroups([]); setPreviewLoaded(false); setResult(null)
    onClose()
  }

  const totalDupRows = groups.reduce((s, g) => s + (g.count - 1), 0)

  return (
    <div onClick={close} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, width: 720, maxWidth: '94vw', maxHeight: '88vh',
        borderRadius: 16, padding: 22, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
            🔧 직원 마스터 중복 정리
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
            같은 이름이 여러 row 인 경우 가장 오래된 1건만 남기고 나머지는 비활성화 (퇴사 처리).
            cs_workers 의 employee_id 도 keep_id 로 자동 통합.
          </div>
        </div>

        {!previewLoaded && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <button onClick={() => run('preview')} disabled={busy}
                    style={{
                      ...BTN.lg, background: COLORS.primary, color: '#fff', border: 'none',
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}>
              {busy ? '검사 중...' : '🔍 중복 검출 시작'}
            </button>
          </div>
        )}

        {previewLoaded && groups.length === 0 && (
          <div style={{
            padding: 30, textAlign: 'center', color: COLORS.success, fontSize: 14, fontWeight: 700,
            background: COLORS.bgGreen, border: `1px solid ${COLORS.borderGreen}`, borderRadius: 8,
          }}>
            ✅ 중복 직원이 없습니다.
          </div>
        )}

        {previewLoaded && groups.length > 0 && (
          <>
            <div style={{
              ...GLASS.L3, background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
              borderRadius: 8, padding: '8px 12px',
              fontSize: 12, color: COLORS.warning,
            }}>
              ⚠ 중복 그룹 <strong>{groups.length}</strong>개 발견 — 정리 시 <strong>{totalDupRows}</strong>건 비활성화 (keep 제외)
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groups.map(g => (
                <div key={g.name} style={{
                  ...GLASS.L1, borderRadius: 8, padding: 10,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 6,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
                      {g.name}
                      <span style={{ marginLeft: 8, ...pillStyle('warning'), fontSize: 10 }}>
                        {g.count}개 중복
                      </span>
                    </div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                        <th style={th}></th>
                        <th style={th}>부서</th>
                        <th style={th}>직급</th>
                        <th style={th}>입사</th>
                        <th style={th}>전화</th>
                        <th style={th}>토큰</th>
                        <th style={th}>등록일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r, idx) => {
                        const isKeep = r.id === g.keep_id
                        return (
                          <tr key={r.id} style={{
                            background: isKeep ? COLORS.bgGreen : COLORS.bgRed,
                            borderBottom: `1px solid ${COLORS.borderFaint}`,
                          }}>
                            <td style={{ ...td, fontWeight: 700 }}>
                              {isKeep ? (
                                <span style={pillStyle('success')}>✓ KEEP</span>
                              ) : (
                                <span style={pillStyle('danger')}>✗ 제거</span>
                              )}
                            </td>
                            <td style={td}>{r.department || '·'}</td>
                            <td style={td}>{r.position || '·'}</td>
                            <td style={td}>{r.hire_date || '·'}</td>
                            <td style={td}>{r.phone || '·'}</td>
                            <td style={td}>{r.public_token ? '발급됨' : '·'}</td>
                            <td style={{ ...td, fontSize: 10, color: COLORS.textMuted }}>
                              {new Date(r.created_at).toLocaleDateString('ko-KR')}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </>
        )}

        {result && (
          <div style={{
            ...GLASS.L3,
            background: result.ok ? COLORS.bgGreen : COLORS.bgRed,
            border: `1px solid ${result.ok ? COLORS.borderGreen : COLORS.borderRed}`,
            borderRadius: 8, padding: '8px 14px',
            fontSize: 13, fontWeight: 700,
            color: result.ok ? COLORS.success : COLORS.danger,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>{result.ok ? '✅ ' : '❌ '}{result.text}</span>
            <button onClick={() => setResult(null)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer', color: COLORS.textMuted,
            }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={close} disabled={busy}
                  style={{
                    ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                    border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                  }}>
            닫기
          </button>
          {previewLoaded && groups.length > 0 && !result?.ok && (
            <button onClick={() => run('apply')} disabled={busy}
                    style={{
                      ...BTN.md, background: COLORS.danger, color: '#fff', border: 'none',
                      cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
                    }}>
              {busy ? '정리 중...' : `🗑 ${totalDupRows}건 정리 실행`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '4px 6px', textAlign: 'left',
  color: COLORS.textMuted, fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '4px 6px', whiteSpace: 'nowrap', fontSize: 11, color: COLORS.textPrimary,
}

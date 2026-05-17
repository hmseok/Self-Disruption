'use client'
// ═══════════════════════════════════════════════════════════════════
// HolidaysTab — 휴일·패밀리데이 마스터
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/(employees)/CallScheduler/utils/palette'
import { COLOR_TONE_OPTIONS } from '@/app/(employees)/CallScheduler/utils/types'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { ColorTone } from '@/app/(employees)/CallScheduler/utils/types'

type HolidayType = 'national' | 'company' | 'family' | 'custom'
const TYPE_LABEL: Record<HolidayType, string> = {
  national: '공휴일',
  company:  '회사휴무',
  family:   '패밀리데이',  // ⚠ deprecated — 직원 휴가 탭으로 이동 (호환 위해 라벨만 유지)
  custom:   '기타',
}
const TYPE_TONE: Record<HolidayType, 'danger' | 'warning' | 'success' | 'neutral'> = {
  national: 'danger',
  company:  'warning',
  family:   'success',
  custom:   'neutral',
}
// 휴일 탭에서 노출할 종류 (회사 공통만)
const HOLIDAY_TYPE_OPTIONS: HolidayType[] = ['national', 'company', 'custom']

interface Holiday {
  id: string
  holiday_date: string
  name: string
  type: HolidayType
  is_paid: boolean
  exclude_auto: boolean
  color_tone: ColorTone
  memo: string | null
  created_at: string
  updated_at: string
}

interface FormState {
  id?: string
  holiday_date: string
  name: string
  type: HolidayType
  is_paid: boolean
  exclude_auto: boolean
  color_tone: ColorTone
  memo: string
}

const EMPTY: FormState = {
  holiday_date: '',
  name: '',
  type: 'company',
  is_paid: true,
  exclude_auto: false,  // 24/365 콜센터 운영 — 공휴일도 누군가는 근무
  color_tone: 'red',
  memo: '',
}

export default function HolidaysTab() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [editing, setEditing] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  // N-22 — 공공데이터 API 자동 채우기
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/holidays?year=${year}`, { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      setHolidays(json.data)
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [year])

  const stats = useMemo(() => {
    const byType = new Map<HolidayType, number>()
    for (const h of holidays) byType.set(h.type, (byType.get(h.type) || 0) + 1)
    return { total: holidays.length, byType }
  }, [holidays])

  const submit = async () => {
    if (!editing) return
    if (!editing.holiday_date || !editing.name.trim()) {
      setError('날짜·이름 필수'); return
    }
    setSaving(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const url = editing.id
        ? `/api/call-scheduler/holidays/${editing.id}`
        : '/api/call-scheduler/holidays'
      const res = await fetch(url, {
        method: editing.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(editing),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      setEditing(null); await load()
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setSaving(false) }
  }

  // N-22 — 공공데이터 API 로 해당 연도 공휴일 + 대체공휴일 자동 채우기
  const autoFill = async () => {
    if (syncing) return
    if (!confirm(`${year}년 공휴일 + 대체공휴일을 공공데이터 API 에서 가져와 자동 추가합니다.\n같은 날짜의 기존 공휴일(national) row 은 새 데이터로 대체됩니다. 회사휴무/기타는 보존. 계속할까요?`)) return
    setSyncing(true); setSyncMessage(null); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/holidays/sync?year=${year}`, {
        method: 'POST', headers: auth,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '자동 채우기 실패')
      const { inserted, skipped, replaced, total } = json.data
      // N-38 — replaced 카운터 메시지 추가
      const replacedStr = replaced > 0 ? ` / 기존 대체 ${replaced}개` : ''
      setSyncMessage({
        ok: true,
        msg: `✅ ${year}년 — 신규 ${inserted}개 추가${replacedStr} / 중복 ${skipped}개 skip / 총 API ${total}개`,
      })
      await load()
    } catch (e: any) {
      setSyncMessage({ ok: false, msg: `❌ ${e?.message || '오류'}` })
    } finally {
      setSyncing(false)
    }
  }

  const remove = async (h: Holiday) => {
    if (!confirm(`"${h.name}" (${h.holiday_date}) 삭제할까요?`)) return
    setSaving(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/holidays/${h.id}`, { method: 'DELETE', headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      await load()
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setSaving(false) }
  }

  return (
    <div>
      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 13,
        }}>❌ {error}</div>
      )}

      {/* 24/365 운영 안내 */}
      <div style={{
        ...GLASS.L3,
        background: COLORS.bgBlue, border: `1px solid ${COLORS.borderBlue}`,
        borderRadius: 8, padding: '8px 12px', marginBottom: 10,
        fontSize: 11, color: COLORS.info,
      }}>
        💡 <strong>24/365 콜센터 운영</strong> — 공휴일에도 누군가는 근무합니다.
        본 탭은 <strong>참고용 마스터</strong>이며, "이 직원은 어린이날 쉰다"는
        <strong>[📋 직원 휴가] 탭에서 종류='공휴일'</strong>로 직원별 등록하세요.
        자동 생성 시 회사 차원 일괄 제외는 기본 OFF.
      </div>

      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                  style={{
                    ...GLASS.L1, padding: '6px 12px', borderRadius: 8,
                    fontSize: 13, color: COLORS.textPrimary, outline: 'none',
                  }}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <div style={{ fontSize: 12, color: COLORS.textMuted, display: 'flex', gap: 8 }}>
            <span>전체 {stats.total}</span>
            <span>· 공휴일 {stats.byType.get('national') || 0}</span>
            <span>· 회사휴무 {stats.byType.get('company') || 0}</span>
            <span>· 기타 {stats.byType.get('custom') || 0}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* N-22 — 공공데이터 API 자동 채우기 */}
          <button type="button"
                  onClick={autoFill} disabled={syncing}
                  style={{
                    ...BTN.md, background: '#fff', color: COLORS.info,
                    border: `1px solid ${COLORS.borderBlue}`,
                    cursor: syncing ? 'not-allowed' : 'pointer',
                    opacity: syncing ? 0.6 : 1, fontWeight: 700,
                  }}
                  title={`${year}년 공휴일 + 대체공휴일을 공공데이터 API 에서 자동 추가`}>
            {syncing ? '⏳ 가져오는 중...' : '📥 자동 채우기'}
          </button>
          <button type="button"
                  onClick={() => setEditing({ ...EMPTY, holiday_date: `${year}-01-01` })}
                  style={{
                    ...BTN.md, background: COLORS.primary, color: '#fff',
                    border: 'none', cursor: 'pointer',
                  }}>
            + 휴일 추가
          </button>
        </div>
      </div>

      {/* N-22 — 자동 채우기 결과 메시지 */}
      {syncMessage && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12,
          background: syncMessage.ok ? COLORS.bgGreen : COLORS.bgRed,
          border: `1px solid ${syncMessage.ok ? COLORS.borderGreen : COLORS.borderRed}`,
          color: syncMessage.ok ? COLORS.success : COLORS.danger,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{syncMessage.msg}</span>
          <button onClick={() => setSyncMessage(null)} style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'inherit', opacity: 0.7,
          }}>× 닫기</button>
        </div>
      )}

      {/* 편집 폼 */}
      {editing && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 12 }}>
            {editing.id ? '휴일 편집' : '신규 휴일'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10 }}>
            <Field label="날짜 *">
              <input type="date" value={editing.holiday_date}
                     onChange={(e) => setEditing({ ...editing, holiday_date: e.target.value })}
                     style={inputStyle} />
            </Field>
            <Field label="이름 *">
              <input type="text" value={editing.name}
                     onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                     style={inputStyle} placeholder="예: 패밀리데이, 창립기념일" />
            </Field>
            <Field label="종류">
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {HOLIDAY_TYPE_OPTIONS.map(t => (
                  <button key={t} type="button"
                          onClick={() => setEditing({ ...editing, type: t })}
                          style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6,
                            background: editing.type === t ? COLORS.bgBlue : 'transparent',
                            color: editing.type === t ? COLORS.info : COLORS.textSecondary,
                            border: `1px solid ${editing.type === t ? COLORS.borderBlue : COLORS.borderFaint}`,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}>
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
                💡 패밀리데이·연차·반차는 [📋 직원 휴가] 탭에서 직원별로 등록
              </div>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10, marginTop: 10 }}>
            <Field label="유급/자동제외">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px' }}>
                <label style={{ fontSize: 12, color: COLORS.textPrimary, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.is_paid}
                         onChange={(e) => setEditing({ ...editing, is_paid: e.target.checked })} /> 유급
                </label>
                <label style={{ fontSize: 12, color: COLORS.textPrimary, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.exclude_auto}
                         onChange={(e) => setEditing({ ...editing, exclude_auto: e.target.checked })} /> 자동생성 제외
                </label>
              </div>
            </Field>
            <Field label="색상">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {COLOR_TONE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                          onClick={() => setEditing({ ...editing, color_tone: opt.value })}
                          style={{
                            padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                            background: editing.color_tone === opt.value ? TONE_BG[opt.value] : 'transparent',
                            color: editing.color_tone === opt.value ? TONE_TEXT[opt.value] : COLORS.textSecondary,
                            border: `1px solid ${editing.color_tone === opt.value ? COLORS.borderBlue : COLORS.borderFaint}`,
                            cursor: 'pointer',
                          }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="메모">
              <input type="text" value={editing.memo}
                     onChange={(e) => setEditing({ ...editing, memo: e.target.value })}
                     style={inputStyle} placeholder="자유 메모" />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => setEditing(null)} style={{
              ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
              border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
            }}>취소</button>
            <button type="button" onClick={submit} disabled={saving} style={{
              ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}>
              {saving ? '저장 중...' : (editing.id ? '저장' : '추가')}
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
      ) : holidays.length === 0 ? (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
          {year}년 등록된 휴일이 없습니다.
        </div>
      ) : (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                <th style={thStyle}>날짜</th>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>종류</th>
                <th style={thStyle}>속성</th>
                <th style={thStyle}>메모</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map(h => (
                <tr key={h.id} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                    {h.holiday_date}
                    {/* N-41 — 요일 + 주말 표시 (대체공휴일 관계 시각화) */}
                    {(() => {
                      const d = new Date(h.holiday_date + 'T00:00:00')
                      const dow = d.getDay()
                      const dowLabel = ['일','월','화','수','목','금','토'][dow]
                      const isWeekend = dow === 0 || dow === 6
                      return (
                        <span style={{
                          fontSize: 10, marginLeft: 6, padding: '1px 5px', borderRadius: 99, fontWeight: 700,
                          background: isWeekend ? COLORS.bgGray : COLORS.bgBlue,
                          color: isWeekend ? COLORS.textMuted : COLORS.info,
                        }}>{dowLabel}{isWeekend ? ' (주말)' : ''}</span>
                      )
                    })()}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      color: TONE_TEXT[h.color_tone],
                      background: TONE_BG[h.color_tone] !== 'transparent' ? TONE_BG[h.color_tone] : undefined,
                      padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                    }}>{h.name}</span>
                    {/* N-41 — 대체공휴일 시각 표시 */}
                    {h.name.includes('대체공휴일') && (
                      <span style={{
                        fontSize: 10, marginLeft: 6, padding: '1px 6px', borderRadius: 99,
                        background: COLORS.bgViolet, color: '#7c3aed', fontWeight: 700,
                      }}>🔄 대체</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={pillStyle(TYPE_TONE[h.type])}>{TYPE_LABEL[h.type]}</span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11, color: COLORS.textMuted }}>
                    {h.is_paid && '유급 '}
                    {h.exclude_auto && '· 자동제외'}
                    {/* N-43 — 가드 작동 여부 시각 표시 (대체공휴일 페어 인식) */}
                    {(() => {
                      const d = new Date(h.holiday_date + 'T00:00:00')
                      const dow = d.getDay()
                      const isWeekend = dow === 0 || dow === 6
                      // 같은 연도에 「대체공휴일(X)」 row 가 있으면 X 가 페어
                      const substituteOriginals = new Set<string>()
                      for (const other of holidays) {
                        const m = String(other.name || '').match(/대체공휴일\(([^)]+)\)/)
                        if (m) substituteOriginals.add(m[1].trim())
                      }
                      const hasPair = substituteOriginals.has(String(h.name || '').trim())
                      // 실제 가드: exclude_auto=1 AND (평일 OR 페어 없는 주말)
                      const guardActive = h.exclude_auto && (!isWeekend || !hasPair)
                      if (guardActive) {
                        return (
                          <span style={{
                            display: 'inline-block', marginLeft: 4, fontSize: 9, padding: '1px 5px',
                            borderRadius: 99, background: COLORS.bgRed, color: COLORS.danger, fontWeight: 700,
                          }} title={isWeekend
                            ? "주말 공휴일이지만 대체공휴일 없음 — 가드 작동 (회사 휴무 유지)"
                            : "평일 + 자동제외 ON — 휴일 가드 작동"}>🔴 가드 ON</span>
                        )
                      }
                      if (isWeekend && hasPair) {
                        return (
                          <span style={{
                            display: 'inline-block', marginLeft: 4, fontSize: 9, padding: '1px 5px',
                            borderRadius: 99, background: COLORS.bgAmber, color: COLORS.warning, fontWeight: 700,
                          }} title="대체공휴일이 다른 평일에 있어 가드 X — 주말 근무자 정상 출근, 대체일이 진짜 가드">⚠ 주말 (대체있음) — 가드 X</span>
                        )
                      }
                      return (
                        <span style={{
                          display: 'inline-block', marginLeft: 4, fontSize: 9, padding: '1px 5px',
                          borderRadius: 99, background: COLORS.bgGray, color: COLORS.textMuted, fontWeight: 700,
                        }} title="자동제외 OFF — 가드 X. 회사 휴무면 자동제외 ON 으로 토글">⚪ 가드 X</span>
                      )
                    })()}
                  </td>
                  <td style={{ ...tdStyle, color: COLORS.textMuted, fontSize: 12 }}>{h.memo || '·'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button type="button"
                            onClick={() => setEditing({
                              id: h.id,
                              holiday_date: h.holiday_date,
                              name: h.name,
                              type: h.type,
                              is_paid: h.is_paid,
                              exclude_auto: h.exclude_auto,
                              color_tone: h.color_tone,
                              memo: h.memo || '',
                            })}
                            style={{
                              ...BTN.sm, background: 'transparent', color: COLORS.info,
                              border: `1px solid ${COLORS.borderBlue}`, marginRight: 4, cursor: 'pointer',
                            }}>편집</button>
                    <button type="button" onClick={() => remove(h)}
                            style={{
                              ...BTN.sm, background: 'transparent', color: COLORS.danger,
                              border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer',
                            }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  ...GLASS.L1, padding: '7px 10px', borderRadius: 8,
  fontSize: 13, color: COLORS.textPrimary, outline: 'none', width: '100%',
}
const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left',
  color: COLORS.textSecondary, fontWeight: 700, whiteSpace: 'nowrap', fontSize: 12,
}
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', whiteSpace: 'nowrap', color: COLORS.textPrimary,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

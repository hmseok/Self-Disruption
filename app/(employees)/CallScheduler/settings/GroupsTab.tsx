'use client'
// ═══════════════════════════════════════════════════════════════════
// GroupsTab — 시프트 그룹 목록 + 추가 + 편집 (멤버 매핑 포함)
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/(employees)/CallScheduler/utils/palette'
import { getAuthHeader } from '@/app/utils/auth-client'
import GroupEditor from './GroupEditor'
import type { ShiftSlot, Worker, ColorTone } from '@/app/(employees)/CallScheduler/utils/types'

export interface ShiftGroup {
  id: string
  name: string
  shift_slot_id: string
  pattern_type: 'all_days' | 'all_weekdays' | 'weekends_only' | 'custom'
  custom_days: string | null
  generation_strategy: 'all_members' | 'rotation'
  rotation_size: number | null
  rotation_period_days: number
  color_tone: ColorTone
  description: string | null
  sort_order: number
  is_active: boolean
  // join 컬럼
  slot_code: string
  slot_label: string
  start_time: string
  end_time: string
  is_overnight: boolean
  member_count: number
}

const PATTERN_LABEL: Record<ShiftGroup['pattern_type'], string> = {
  all_days: '매일',
  all_weekdays: '평일만',
  weekends_only: '주말만',
  custom: '요일 지정',
}

const STRATEGY_LABEL: Record<ShiftGroup['generation_strategy'], string> = {
  all_members: '전원 동시',
  rotation: '로테이션',
}

export default function GroupsTab() {
  const [groups, setGroups] = useState<ShiftGroup[]>([])
  const [slots, setSlots] = useState<ShiftSlot[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const [gRes, sRes, wRes] = await Promise.all([
        fetch('/api/call-scheduler/shift-groups', { headers: auth }),
        fetch('/api/call-scheduler/shift-slots', { headers: auth }),
        fetch('/api/call-scheduler/workers', { headers: auth }),
      ])
      const gJ = await gRes.json(); if (!gRes.ok) throw new Error(gJ?.error || '그룹 조회 실패')
      const sJ = await sRes.json(); if (!sRes.ok) throw new Error(sJ?.error || '슬롯 조회 실패')
      const wJ = await wRes.json(); if (!wRes.ok) throw new Error(wJ?.error || '워커 조회 실패')
      setGroups(gJ.data); setSlots(sJ.data); setWorkers(wJ.data)
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
  }
  if (error) {
    return (
      <div style={{
        padding: 12, background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
        borderRadius: 8, color: COLORS.danger, fontSize: 13,
      }}>❌ {error}</div>
    )
  }

  if (editingId !== null) {
    return (
      <GroupEditor
        groupId={editingId === 'new' ? null : editingId}
        slots={slots}
        workers={workers}
        onClose={() => setEditingId(null)}
        onSaved={() => { setEditingId(null); load() }}
      />
    )
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, color: COLORS.textSecondary }}>
          시프트 그룹 {groups.length}개 — 자동 생성에 사용됩니다.
        </div>
        <button type="button" onClick={() => setEditingId('new')}
                style={{
                  ...BTN.md, background: COLORS.primary, color: '#fff',
                  border: 'none', cursor: 'pointer',
                }}>
          + 그룹 추가
        </button>
      </div>

      {groups.length === 0 ? (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 12 }}>
            아직 그룹이 없습니다.
          </div>
          <button type="button" onClick={() => setEditingId('new')}
                  style={{
                    ...BTN.md, background: COLORS.primary, color: '#fff',
                    border: 'none', cursor: 'pointer',
                  }}>
            + 첫 그룹 만들기
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {groups.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => setEditingId(g.id)}
              style={{
                ...GLASS.L4,
                borderRadius: 12, padding: 14, textAlign: 'left',
                border: `1px solid ${TONE_BG[g.color_tone] !== 'transparent' ? TONE_BG[g.color_tone] : COLORS.borderFaint}`,
                background: TONE_BG[g.color_tone] !== 'transparent'
                  ? TONE_BG[g.color_tone]
                  : 'rgba(255,255,255,0.72)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: TONE_TEXT[g.color_tone] }}>
                  {g.name}
                </div>
                <span style={pillStyle('neutral')}>{g.member_count}명</span>
              </div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
                <span style={{ color: COLORS.textMuted, marginRight: 4 }}>{g.slot_code}</span>
                {g.slot_label}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={pillStyle('info')}>{PATTERN_LABEL[g.pattern_type]}</span>
                <span style={pillStyle('primary')}>
                  {STRATEGY_LABEL[g.generation_strategy]}
                  {g.generation_strategy === 'rotation' && g.rotation_size
                    ? ` ${g.rotation_size}명/${g.rotation_period_days}일`
                    : ''}
                </span>
              </div>
              {g.description && (
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
                  {g.description}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

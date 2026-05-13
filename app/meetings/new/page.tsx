'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'

// ═══════════════════════════════════════════════════════════════
// /meetings/new — V2 신규 회의 생성 (PR-V2-A)
//   · 진입 즉시 POST blank meeting → router.replace(`/meetings/${id}`)
//   · Notion 방식: 「Untitled」 회의 즉시 생성 후 편집 진입
//   · 실패 시 에러 메시지 + 「목록으로」
// ═══════════════════════════════════════════════════════════════

export default function NewMeetingPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(true)

  useEffect(() => {
    let cancelled = false
    const create = async () => {
      const body = {
        meeting: {
          title: '제목 없는 회의',
          type: 'specific',
          meeting_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
          duration_min: 60,
          status: 'draft',
        },
        attendees: [],
        minutes: [],
        action_items: [],
      }
      try {
        const { ok, json } = await fetchWithAuth('/api/meetings', { method: 'POST', body })
        if (cancelled) return
        if (ok && json?.id) {
          router.replace(`/meetings/${json.id}`)
        } else {
          setError(json?.error || '생성 실패')
          setCreating(false)
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || '네트워크 오류')
          setCreating(false)
        }
      }
    }
    void create()
    return () => { cancelled = true }
  }, [router])

  return (
    <div style={{ padding: '40px 24px', minHeight: 'calc(100vh - 56px)' }}>
      <div style={{
        ...GLASS.L4, borderRadius: 14, padding: 40, maxWidth: 480, margin: '60px auto',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🗓</div>
        {creating && !error && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>
              새 회의 생성 중...
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted }}>
              잠시 후 편집 화면으로 이동합니다.
            </div>
          </>
        )}
        {error && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>
              ⚠ 생성 실패
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
              {error}
            </div>
            <button onClick={() => router.push('/meetings')}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 8,
                background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer',
              }}>회의록 목록으로</button>
          </>
        )}
      </div>
    </div>
  )
}

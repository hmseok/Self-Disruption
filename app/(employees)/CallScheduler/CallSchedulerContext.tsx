'use client'
// ═══════════════════════════════════════════════════════════════════
// CallScheduler Context — 상세 페이지 전역 상태
// ═══════════════════════════════════════════════════════════════════
import { createContext, useContext, useState, ReactNode, useCallback } from 'react'
import type { ScheduleDetail } from './utils/types'
import { getAuthHeader } from '@/app/utils/auth-client'

interface CtxValue {
  detail: ScheduleDetail | null
  setDetail: (d: ScheduleDetail | null) => void
  loading: boolean
  setLoading: (b: boolean) => void
  error: string | null
  setError: (s: string | null) => void
  reload: (id: string) => Promise<void>
}

const Ctx = createContext<CtxValue | null>(null)

export function CallSchedulerProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<ScheduleDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/schedules/${id}`, { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '스케줄 조회 실패')
      setDetail(json.data as ScheduleDetail)
    } catch (e: any) {
      setError(e.message || '조회 실패')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <Ctx.Provider value={{ detail, setDetail, loading, setLoading, error, setError, reload }}>
      {children}
    </Ctx.Provider>
  )
}

export function useCallScheduler() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCallScheduler must be used within CallSchedulerProvider')
  return v
}

'use client'
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

/**
 * AIProgressFloater — 전역 진행률 표시 컴포넌트.
 *
 * 사용처: 시간 1초+ 걸리는 작업 (AI 호출, batch loop, DB 대량 INSERT 등)
 * 위치: 화면 우하단 고정 (z-index 9999)
 * 특징:
 *   - 여러 작업 동시 표시 가능 (queue)
 *   - 작업별: 제목 / 진행률 / 처리/총건수 / 경과시간 / 상세
 *   - 완료 후 5초 hold → 자동 사라짐
 *   - 전역 hook 으로 어느 페이지에서든 호출
 *
 * 사용 예:
 *   const { start, update, finish } = useAIProgress()
 *   const id = start({ title: '🤖 룰 자동 분류 진행 중', total: 304 })
 *   update(id, { processed: 50, applied: 30 })
 *   finish(id, '✓ 분류 완료 — 285건 적용')
 *
 * (CLAUDE.md § 0-1 규칙 16 — 플로팅 진행률 의무)
 */

export interface ProgressTask {
  id: string
  title: string
  total: number
  processed: number
  applied: number
  failed: number
  status: 'running' | 'done' | 'error'
  startedAt: number
  finishedAt: number | null
  message?: string  // 완료/실패 메시지
  detail?: string   // 부가 정보
}

interface ProgressContextType {
  tasks: ProgressTask[]
  start: (params: { title: string; total?: number }) => string
  update: (id: string, patch: Partial<Omit<ProgressTask, 'id' | 'startedAt'>>) => void
  finish: (id: string, message?: string, status?: 'done' | 'error') => void
  remove: (id: string) => void
}

const ProgressContext = createContext<ProgressContextType | null>(null)

export function useAIProgress() {
  const ctx = useContext(ProgressContext)
  if (!ctx) {
    // Provider 없는 환경 (테스트/SSR) — no-op fallback
    return {
      tasks: [],
      start: () => '',
      update: () => {},
      finish: () => {},
      remove: () => {},
    } as ProgressContextType
  }
  return ctx
}

export function AIProgressProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<ProgressTask[]>([])
  const counterRef = useRef(0)
  const autoRemoveTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const start = useCallback((params: { title: string; total?: number }): string => {
    const id = `t${Date.now()}_${counterRef.current++}`
    const task: ProgressTask = {
      id,
      title: params.title,
      total: params.total || 0,
      processed: 0,
      applied: 0,
      failed: 0,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
    }
    setTasks(prev => [...prev, task])
    return id
  }, [])

  const update = useCallback((id: string, patch: Partial<Omit<ProgressTask, 'id' | 'startedAt'>>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const finish = useCallback((id: string, message?: string, status: 'done' | 'error' = 'done') => {
    setTasks(prev => prev.map(t => (t.id === id ? {
      ...t,
      status,
      finishedAt: Date.now(),
      message: message || t.message,
    } : t)))
    // 5초 후 자동 제거
    const timer = setTimeout(() => {
      setTasks(prev => prev.filter(t => t.id !== id))
      autoRemoveTimers.current.delete(id)
    }, 5000)
    autoRemoveTimers.current.set(id, timer)
  }, [])

  const remove = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    const timer = autoRemoveTimers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      autoRemoveTimers.current.delete(id)
    }
  }, [])

  // unmount 시 타이머 정리
  useEffect(() => {
    return () => {
      const timers = autoRemoveTimers.current
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [])

  return (
    <ProgressContext.Provider value={{ tasks, start, update, finish, remove }}>
      {children}
      <AIProgressFloater />
    </ProgressContext.Provider>
  )
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}초`
  const m = Math.floor(s / 60)
  return `${m}분 ${s % 60}초`
}

function TaskRow({ task, onRemove }: { task: ProgressTask; onRemove: () => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (task.status !== 'running') return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [task.status])

  const elapsed = (task.finishedAt || now) - task.startedAt
  const pct = task.total > 0 ? Math.min(100, Math.round((task.processed / task.total) * 100)) : 0

  const colorByStatus = {
    running: { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.4)', accent: '#4338ca', bar: 'linear-gradient(90deg, #818cf8, #6366f1)' },
    done:    { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.4)',  accent: '#15803d', bar: '#22c55e' },
    error:   { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.4)',  accent: '#b91c1c', bar: '#ef4444' },
  }[task.status]

  const icon = { running: '⚙️', done: '✓', error: '⚠️' }[task.status]

  return (
    <div style={{
      background: colorByStatus.bg,
      border: `1px solid ${colorByStatus.border}`,
      borderRadius: 10,
      padding: '10px 12px',
      marginBottom: 8,
      minWidth: 280,
      maxWidth: 360,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
      fontSize: 12,
      color: '#1e293b',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{
          display: 'inline-block', width: 18, height: 18, lineHeight: '18px',
          textAlign: 'center', fontSize: 12, fontWeight: 700,
          color: colorByStatus.accent,
        }}>{icon}</span>
        <span style={{ fontWeight: 700, color: colorByStatus.accent, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.title}
        </span>
        <span style={{ color: '#64748b', fontSize: 10 }}>{fmtElapsed(elapsed)}</span>
        {task.status !== 'running' && (
          <button
            onClick={onRemove}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 0, lineHeight: 1 }}
          >×</button>
        )}
      </div>

      {task.total > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
            <span>
              {task.processed.toLocaleString()} / {task.total.toLocaleString()}건
              {' '}({pct}%)
            </span>
            {(task.applied > 0 || task.failed > 0) && (
              <span>
                {task.applied > 0 && <span style={{ color: '#15803d' }}>적용 {task.applied.toLocaleString()}</span>}
                {task.applied > 0 && task.failed > 0 && ' · '}
                {task.failed > 0 && <span style={{ color: '#b91c1c' }}>실패 {task.failed.toLocaleString()}</span>}
              </span>
            )}
          </div>
          <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: task.status === 'running' && task.total === 0 ? '100%' : `${pct}%`,
              height: '100%',
              background: colorByStatus.bar,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </>
      )}

      {task.message && (
        <div style={{ marginTop: 6, fontSize: 11, color: colorByStatus.accent, fontWeight: 500 }}>
          {task.message}
        </div>
      )}
      {task.detail && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#64748b' }}>
          {task.detail}
        </div>
      )}
    </div>
  )
}

function AIProgressFloater() {
  const { tasks, remove } = useAIProgress()
  if (tasks.length === 0) return null
  return (
    <div style={{
      position: 'fixed',
      right: 16,
      bottom: 16,
      zIndex: 9999,
      pointerEvents: 'none',  // floater 영역 외 클릭 차단 X
    }}>
      <div style={{ pointerEvents: 'auto' }}>
        {tasks.map(t => <TaskRow key={t.id} task={t} onRemove={() => remove(t.id)} />)}
      </div>
    </div>
  )
}

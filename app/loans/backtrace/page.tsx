'use client'
// #22 loans 역추적 — transactions 기반 자동 시드
// /app/loans/backtrace
//
// 흐름:
//   1. 기간 + 최소 신뢰도 선택
//   2. [미리보기] (dry-run) → 후보 테이블
//   3. [실제 적용] → INSERT + 이력 등록
//   4. 하단 이력 패널 → 특정 run 롤백

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithAuth } from '@/app/utils/finance-upload'

interface Candidate {
  finance_name: string
  monthly_payment: number
  total_amount: number
  months: number
  first_date: string
  last_date: string
  payment_day: number
  ai_confidence: number
  source_transaction_ids: string[]
  sample_descriptions: string[]
  inserted_loan_id?: string
}

interface HistoryRow {
  run_id: string
  loan_count: number
  total_amount: number | null
  min_confidence: number | null
  max_confidence: number | null
}

// ★ Decimal 안전 캐스팅
const formatMoney = (n: any) =>
  n == null ? '-' : (Number(n) || 0).toLocaleString('ko-KR') + '원'

function confidenceBadge(c: number) {
  if (c >= 0.75) return { label: '높음', bg: 'bg-green-100', fg: 'text-green-700', border: 'border-green-200' }
  if (c >= 0.5)  return { label: '중간', bg: 'bg-amber-100', fg: 'text-amber-700', border: 'border-amber-200' }
  return { label: '낮음', bg: 'bg-red-100', fg: 'text-red-700', border: 'border-red-200' }
}

export default function LoansBacktracePage() {
  const router = useRouter()
  const today = new Date()
  const defaultEnd = today.toISOString().slice(0, 10)
  const yearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000)
  const defaultStart = yearAgo.toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [minConfidence, setMinConfidence] = useState(0.5)
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [stats, setStats] = useState<{ candidates_total?: number; applied?: number; skipped_low_confidence?: number }>({})
  const [runId, setRunId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])

  async function loadHistory() {
    try {
      const { json } = await fetchWithAuth('/api/loans/backtrace/history')
      if (json.data) setHistory(json.data)
    } catch (e) {
      console.error('history load failed', e)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  async function handlePreview() {
    setLoading(true)
    setMessage(null)
    setRunId(null)
    try {
      const { ok, json } = await fetchWithAuth('/api/loans/backtrace', {
        method: 'POST',
        body: {
          start_date: startDate,
          end_date: endDate,
          min_confidence: minConfidence,
          dry_run: true,
        },
      })
      if (!ok) throw new Error(json.error || '미리보기 실패')
      setCandidates(json.data.candidates || [])
      setStats(json.data.stats || {})
      setMessage({
        type: 'info',
        text: `후보 ${json.data.stats.candidates_total}건 / 신뢰도 ${minConfidence} 이상 ${json.data.stats.candidates_above_threshold}건`,
      })
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleApply() {
    if (candidates.length === 0) {
      setMessage({ type: 'error', text: '먼저 미리보기를 실행하세요' })
      return
    }
    const qualified = candidates.filter(c => c.ai_confidence >= minConfidence)
    if (!confirm(`신뢰도 ${minConfidence} 이상 ${qualified.length}건을 loans 테이블에 자동 등록합니다. 진행하시겠습니까?`)) return

    setLoading(true)
    setMessage(null)
    try {
      const { ok, json } = await fetchWithAuth('/api/loans/backtrace', {
        method: 'POST',
        body: {
          start_date: startDate,
          end_date: endDate,
          min_confidence: minConfidence,
          dry_run: false,
        },
      })
      if (!ok) throw new Error(json.error || '적용 실패')
      setCandidates(json.data.candidates || [])
      setStats(json.data.stats || {})
      setRunId(json.data.run_id)
      setMessage({
        type: 'success',
        text: `적용 완료 — ${json.data.stats.applied}건 생성, ${json.data.stats.skipped_low_confidence}건 스킵 (run_id: ${json.data.run_id})`,
      })
      await loadHistory()
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleRollback(rid: string) {
    if (!confirm(`run_id ${rid} 의 모든 자동 생성 loan 을 삭제합니다. 진행하시겠습니까?`)) return
    setLoading(true)
    try {
      const { ok, json } = await fetchWithAuth('/api/loans/backtrace/rollback', {
        method: 'POST',
        body: { run_id: rid },
      })
      if (!ok) throw new Error(json.error || '롤백 실패')
      setMessage({
        type: 'success',
        text: `롤백 완료 — ${json.data.loans_deleted}개 loan 삭제, ${json.data.transactions_unlinked}개 transaction 연결 해제`,
      })
      await loadHistory()
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  function downloadCsv() {
    if (candidates.length === 0) return
    const header = ['finance_name', 'monthly_payment', 'months', 'total_amount', 'first_date', 'last_date', 'payment_day', 'ai_confidence', 'source_count', 'sample_descriptions']
    const rows = candidates.map(c => [
      c.finance_name, c.monthly_payment, c.months, c.total_amount,
      c.first_date, c.last_date, c.payment_day, c.ai_confidence,
      c.source_transaction_ids.length,
      c.sample_descriptions.join(' / '),
    ])
    const csv = [header, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loans_backtrace_${startDate}_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/loans')}
                className="px-3 py-1.5 rounded-lg bg-white/60 hover:bg-white/80 border border-black/5 text-sm text-slate-700 transition"
              >
                ← 대출 목록
              </button>
              <h1 className="text-2xl font-bold text-slate-800">대출 역추적</h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              출금 내역 중 리스/할부 납부 패턴을 탐지하여 loans 레코드를 자동 생성합니다.
            </p>
          </div>
        </div>

        {/* 필터 패널 (Level 4 glass) */}
        <div
          className="rounded-2xl border p-5 backdrop-blur-xl"
          style={{ background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(0,0,0,0.06)' }}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/40 border border-black/5 text-sm"
                style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">종료일</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/40 border border-black/5 text-sm"
                style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                최소 신뢰도: <span className="font-bold text-slate-800">{minConfidence.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={minConfidence}
                onChange={e => setMinConfidence(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handlePreview}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition disabled:opacity-50"
              >
                {loading ? '처리 중…' : '미리보기'}
              </button>
              <button
                onClick={handleApply}
                disabled={loading || candidates.length === 0 || runId !== null}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition disabled:opacity-50"
              >
                실제 적용
              </button>
            </div>
          </div>
        </div>

        {/* 메시지 배너 */}
        {message && (
          <div
            className={`rounded-xl border p-4 text-sm ${
              message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
              message.type === 'error'   ? 'bg-red-50 border-red-200 text-red-800' :
                                           'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 통계 (Level 3 glass 스탯 카드) */}
        {(stats.candidates_total != null) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border p-4 backdrop-blur-xl"
                 style={{ background: 'rgba(255,255,255,0.60)', borderColor: 'rgba(191,219,254,0.80)' }}>
              <div className="text-xs text-slate-500">후보 총계</div>
              <div className="text-2xl font-bold text-blue-700 mt-1">{stats.candidates_total}</div>
            </div>
            <div className="rounded-xl border p-4 backdrop-blur-xl"
                 style={{ background: 'rgba(255,255,255,0.60)', borderColor: 'rgba(187,247,208,0.80)' }}>
              <div className="text-xs text-slate-500">신뢰도 통과</div>
              <div className="text-2xl font-bold text-green-700 mt-1">
                {candidates.filter(c => c.ai_confidence >= minConfidence).length}
              </div>
            </div>
            {stats.applied != null && (
              <div className="rounded-xl border p-4 backdrop-blur-xl"
                   style={{ background: 'rgba(255,255,255,0.60)', borderColor: 'rgba(221,214,254,0.80)' }}>
                <div className="text-xs text-slate-500">실제 적용</div>
                <div className="text-2xl font-bold text-violet-700 mt-1">{stats.applied}</div>
              </div>
            )}
            {stats.skipped_low_confidence != null && (
              <div className="rounded-xl border p-4 backdrop-blur-xl"
                   style={{ background: 'rgba(255,255,255,0.60)', borderColor: 'rgba(253,230,138,0.80)' }}>
                <div className="text-xs text-slate-500">신뢰도 미달 스킵</div>
                <div className="text-2xl font-bold text-amber-700 mt-1">{stats.skipped_low_confidence}</div>
              </div>
            )}
          </div>
        )}

        {/* 후보 테이블 (Level 4 glass) */}
        {candidates.length > 0 && (
          <div
            className="rounded-2xl border backdrop-blur-xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(0,0,0,0.06)' }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
              <h2 className="font-semibold text-slate-800">역추적 후보 ({candidates.length})</h2>
              <button
                onClick={downloadCsv}
                className="px-3 py-1.5 rounded-lg bg-white/60 hover:bg-white/80 border border-black/5 text-xs text-slate-700"
              >
                CSV 다운로드
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-600 text-xs">
                    <th className="px-4 py-2 text-left font-medium">금융사</th>
                    <th className="px-4 py-2 text-right font-medium">월납입</th>
                    <th className="px-4 py-2 text-right font-medium">횟수</th>
                    <th className="px-4 py-2 text-right font-medium">총액</th>
                    <th className="px-4 py-2 text-left font-medium">기간</th>
                    <th className="px-4 py-2 text-center font-medium">결제일</th>
                    <th className="px-4 py-2 text-center font-medium">신뢰도</th>
                    <th className="px-4 py-2 text-center font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, idx) => {
                    const below = c.ai_confidence < minConfidence
                    const badge = confidenceBadge(c.ai_confidence)
                    return (
                      <React.Fragment key={idx}>
                        <tr
                          className={`border-t cursor-pointer hover:bg-blue-50/30 transition ${below ? 'opacity-50' : ''}`}
                          style={{ borderColor: 'rgba(0,0,0,0.04)' }}
                          onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                        >
                          <td className="px-4 py-2 font-medium text-slate-800">{c.finance_name}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.monthly_payment)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{c.months}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.total_amount)}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{c.first_date} ~ {c.last_date}</td>
                          <td className="px-4 py-2 text-center">{c.payment_day}일</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${badge.bg} ${badge.fg} ${badge.border}`}>
                              {badge.label} {c.ai_confidence.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center text-xs">
                            {c.inserted_loan_id
                              ? <span className="text-emerald-600">✓ 등록</span>
                              : below
                                ? <span className="text-red-500">스킵</span>
                                : <span className="text-slate-400">대기</span>
                            }
                          </td>
                        </tr>
                        {expandedIdx === idx && (
                          <tr className="bg-slate-50/40">
                            <td colSpan={8} className="px-4 py-3 text-xs text-slate-600">
                              <div className="space-y-1">
                                <div><span className="font-medium">샘플 설명:</span> {c.sample_descriptions.join(' | ')}</div>
                                <div><span className="font-medium">소스 transaction 수:</span> {c.source_transaction_ids.length}</div>
                                {c.inserted_loan_id && (
                                  <div><span className="font-medium">생성된 loan_id:</span> <code className="bg-white/80 px-1.5 py-0.5 rounded">{c.inserted_loan_id}</code></div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 이력 패널 (Level 4 glass) */}
        <div
          className="rounded-2xl border backdrop-blur-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(0,0,0,0.06)' }}
        >
          <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
            <h2 className="font-semibold text-slate-800">역추적 이력 (최근 50건)</h2>
          </div>
          {history.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">아직 역추적 실행 이력이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-600 text-xs">
                    <th className="px-4 py-2 text-left font-medium">run_id</th>
                    <th className="px-4 py-2 text-right font-medium">생성 건수</th>
                    <th className="px-4 py-2 text-right font-medium">총액</th>
                    <th className="px-4 py-2 text-center font-medium">신뢰도 범위</th>
                    <th className="px-4 py-2 text-center font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.run_id} className="border-t" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                      <td className="px-4 py-2 text-xs font-mono text-slate-600">{h.run_id}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{h.loan_count}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMoney(h.total_amount)}</td>
                      <td className="px-4 py-2 text-center text-xs">
                        {h.min_confidence?.toFixed(2)} ~ {h.max_confidence?.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => handleRollback(h.run_id)}
                          disabled={loading}
                          className="px-3 py-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-xs text-red-700 disabled:opacity-50"
                        >
                          롤백
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

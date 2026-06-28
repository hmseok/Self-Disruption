'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { getAuthHeader } from '@/app/utils/auth-client'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'

// ═══════════════════════════════════════════════════════════
// /finance/classify — PHASE 3 거래 분류 관리
//
//   · 분류 현황 대시보드 (자동분류/검토필요/수동분류 통계)
//   · AI 배치 분류 실행 버튼
//   · 분류 대기 큐 검토 (승인/수정/거부)
//   · 카테고리별 분포 차트
// ═══════════════════════════════���═══════════════════════════

type QueueItem = {
  id: string
  ai_category: string | null
  final_category: string | null
  status: string
  queue_item_type: string | null
  queue_summary: string | null
  source_data: any
  created_at: string
}

type ClassifyStats = {
  smsTransactions: { total: number; classified: number; unclassified: number }
  pendingReview: number
  distribution: Array<{ category: string; count: number; totalAmount: number }>
}

const nf = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString()

const fmtDt = (s: string | null) =>
  !s ? '—' : String(s).slice(0, 16).replace('T', ' ')

// ── 카테고리 색상 맵 ──
const CAT_COLORS: Record<string, string> = {
  '유류비': '#f59e0b',
  '정비/수리비': '#ef4444',
  '차량보험료': '#8b5cf6',
  '복리후생(식대)': '#10b981',
  '여비교통비': '#3b82f6',
  '수수료/카드수수료': '#6366f1',
  '급여(정규직)': '#ec4899',
  '렌트/운송수입': '#14b8a6',
  '미분류': '#9ca3af',
}

const ALL_CATEGORIES = [
  '렌��/운송수입', '지입 관리비/수수료', '투자원금 입금', '지입 초기비용/보증금',
  '렌터카 보증금(입금)', '대출 실행(입금)', '이자/잡이익', '보험금 수령',
  '매각/처분수입', '기타수입',
  '지입 수익배분금(출금)', '유류비', '정비/��리비', '차량보험료',
  '자동차세/공과금', '차량할부/리스료', '화물공제/적재물보험',
  '급여(정규직)', '일용직급여', '용역비(3.3%)', '4대보험(회사부담)',
  '원천세/부가세', '법인세/지방세', '세금/공과금',
  '이자비용(대출/투자)', '원금상환', '수수료/카���수수료',
  '임차료/사무실', '통신비', '소모품/사무용품', '복리���생(식대)',
  '접대비', '여비교통비', '교육/훈련비', '광고/마케팅',
  '보험료(일반)', '감가상각비', '수선/유지비', '전기/수도/가스',
  '도서/신문', '경비/보안', '쇼핑/온라인구매', '기타',
]

export default function ClassifyPage() {
  const [stats, setStats] = useState<ClassifyStats | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [classifying, setClassifying] = useState(false)
  const [classifyResult, setClassifyResult] = useState<any>(null)
  const [editItem, setEditItem] = useState<QueueItem | null>(null)
  const [editCategory, setEditCategory] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── 데이터 로드 ──
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const h = await getAuthHeader()  // ★ await 누락 수정 (미인증 fetch 방지)
      const [statsRes, queueRes] = await Promise.all([
        fetch('/api/finance/classify-sms', { headers: h }),
        fetch('/api/classification-queue?status=pending&limit=200', { headers: h }),
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (queueRes.ok) {
        const data = await queueRes.json()
        setQueue((data.data || []).filter((q: QueueItem) => q.queue_item_type === 'sms_transaction'))
      }
    } catch (e) {
      console.error('load error:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── AI 배치 분류 실행 ──
  const runClassify = async () => {
    setClassifying(true)
    setClassifyResult(null)
    try {
      const res = await fetch('/api/finance/classify-sms', {
        method: 'POST',
        headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      setClassifyResult(data)
      // 새로고침
      await loadData()
    } catch (e) {
      console.error('classify error:', e)
    }
    setClassifying(false)
  }

  // ── 개별 승인 ──
  const approveItem = async (item: QueueItem) => {
    try {
      await fetch('/api/classification-queue', {
        method: 'POST',
        headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_id: item.id, action: 'approve' }),
      })
      setQueue(prev => prev.filter(q => q.id !== item.id))
      if (stats) setStats({ ...stats, pendingReview: Math.max(0, stats.pendingReview - 1) })
    } catch (e) { console.error(e) }
  }

  // ── 수정 저장 ──
  const saveEdit = async () => {
    if (!editItem || !editCategory) return
    try {
      await fetch('/api/classification-queue', {
        method: 'POST',
        headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_id: editItem.id, action: 'edit', final_category: editCategory }),
      })
      setQueue(prev => prev.filter(q => q.id !== editItem.id))
      setEditItem(null)
      if (stats) setStats({ ...stats, pendingReview: Math.max(0, stats.pendingReview - 1) })
    } catch (e) { console.error(e) }
  }

  // ── 거부 ──
  const dismissItem = async (item: QueueItem) => {
    try {
      await fetch('/api/classification-queue', {
        method: 'POST',
        headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_id: item.id, action: 'dismiss' }),
      })
      setQueue(prev => prev.filter(q => q.id !== item.id))
      if (stats) setStats({ ...stats, pendingReview: Math.max(0, stats.pendingReview - 1) })
    } catch (e) { console.error(e) }
  }

  // ── 일괄 승인 ──
  const bulkApprove = async () => {
    if (selectedIds.size === 0) return
    try {
      await fetch('/api/classification-queue', {
        method: 'PATCH',
        headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_ids: Array.from(selectedIds) }),
      })
      setQueue(prev => prev.filter(q => !selectedIds.has(q.id)))
      setSelectedIds(new Set())
      if (stats) setStats({ ...stats, pendingReview: Math.max(0, stats.pendingReview - selectedIds.size) })
    } catch (e) { console.error(e) }
  }

  // ── 선택 토글 ──
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selectedIds.size === queue.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(queue.map(q => q.id)))
  }

  // ── source_data 파싱 ──
  const parseSourceData = (item: QueueItem) => {
    try {
      return typeof item.source_data === 'string' ? JSON.parse(item.source_data) : item.source_data || {}
    } catch { return {} }
  }

  // ── 스탯 아이템 ──
  const statItems: StatItem[] = useMemo(() => {
    if (!stats) return []
    const s = stats.smsTransactions
    const rate = s.total > 0 ? Math.round((s.classified / s.total) * 100) : 0
    return [
      { label: 'SMS 거래', value: nf(s.total), color: 'blue' as const },
      { label: '분류 완료', value: nf(s.classified), color: 'green' as const },
      { label: '미분류', value: nf(s.unclassified), color: 'red' as const },
      { label: '검토 대기', value: nf(stats.pendingReview), color: 'amber' as const },
      { label: '분류율', value: `${rate}%`, color: rate >= 80 ? 'green' as const : 'amber' as const },
    ]
  }, [stats])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">거래 분류 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">SMS 거래 자동 분류 + AI 분류 + 수동 검토</p>
        </div>
        <button
          onClick={runClassify}
          disabled={classifying}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          {classifying ? (
            <>
              <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
              분류 중...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              AI 분류 실행
            </>
          )}
        </button>
      </div>

      {/* ── 스탯 ── */}
      {statItems.length > 0 && <DcStatStrip items={statItems} />}

      {/* ── AI 분류 결과 토스트 ── */}
      {classifyResult && classifyResult.stats && (
        <div className="rounded-xl border border-green-200/80 bg-white/60 backdrop-blur-sm p-4">
          <p className="text-sm font-medium text-green-700">
            분류 완료: 규칙 {classifyResult.stats.ruleClassified}건 · AI {classifyResult.stats.aiClassified}건 · 검토필요 {classifyResult.stats.unresolved}건
          </p>
        </div>
      )}

      {/* ── 카테고리 분포 ── */}
      {stats && stats.distribution.length > 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-white/72 backdrop-blur-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">카테고리별 분포</h2>
          <div className="space-y-2">
            {stats.distribution.slice(0, 12).map(d => {
              const maxCount = Math.max(...stats.distribution.map(x => x.count))
              const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0
              const color = CAT_COLORS[d.category] || '#6b7280'
              return (
                <div key={d.category} className="flex items-center gap-3 text-sm">
                  <span className="w-36 truncate text-gray-600">{d.category}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="w-10 text-right text-gray-500 tabular-nums">{d.count}</span>
                  <span className="w-24 text-right text-gray-400 tabular-nums">{nf(d.totalAmount)}원</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 검토 대기 큐 ── */}
      <div className="rounded-xl border border-black/[0.06] bg-white/72 backdrop-blur-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-black/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            검토 대기 ({queue.length}건)
          </h2>
          {queue.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="text-xs text-blue-500 hover:text-blue-600"
              >
                {selectedIds.size === queue.length ? '전체 해제' : '전체 선택'}
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={bulkApprove}
                  className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded-md text-xs font-medium transition-colors"
                >
                  선택 일괄승인 ({selectedIds.size})
                </button>
              )}
            </div>
          )}
        </div>

        {queue.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            검토 대기 중인 건이 없습니다
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04]">
            {queue.map(item => {
              const sd = parseSourceData(item)
              const confidence = sd.confidence ?? 0
              const tier = sd.tier || 'manual'
              return (
                <div key={item.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/40 transition-colors">
                  {/* 체크박스 */}
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                  />

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{item.queue_summary || '—'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.ai_category && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${CAT_COLORS[item.ai_category] || '#6b7280'}20`,
                            color: CAT_COLORS[item.ai_category] || '#6b7280',
                          }}
                        >
                          {item.ai_category}
                        </span>
                      )}
                      <span className={`text-xs ${
                        tier === 'review' ? 'text-amber-500' : 'text-red-400'
                      }`}>
                        {tier === 'review' ? '검토' : '수동'} · {confidence}%
                      </span>
                      <span className="text-xs text-gray-400">{fmtDt(item.created_at)}</span>
                    </div>
                  </div>

                  {/* 액션 */}
                  <div className="flex items-center gap-1.5">
                    {item.ai_category && (
                      <button
                        onClick={() => approveItem(item)}
                        className="px-2.5 py-1 bg-green-50 hover:bg-green-100 text-green-600 rounded-md text-xs font-medium transition-colors"
                        title="AI 분류 승인"
                      >
                        승인
                      </button>
                    )}
                    <button
                      onClick={() => { setEditItem(item); setEditCategory(item.ai_category || '') }}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md text-xs font-medium transition-colors"
                      title="카테고리 수정"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => dismissItem(item)}
                      className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-md text-xs font-medium transition-colors"
                      title="분류 제외"
                    >
                      제외
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 수정 모달 ── */}
      {editItem && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditItem(null)}>
          <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl p-6 w-[420px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800 mb-4">카테고리 수정</h3>

            <div className="mb-4 p-3 rounded-lg bg-gray-50 text-sm text-gray-600">
              {editItem.queue_summary || '—'}
            </div>

            {editItem.ai_category && (
              <div className="mb-3 text-sm">
                <span className="text-gray-500">AI 추천: </span>
                <span className="font-medium text-gray-700">{editItem.ai_category}</span>
              </div>
            )}

            <label className="block text-xs font-medium text-gray-600 mb-1">카테고리 선택</label>
            <select
              value={editCategory}
              onChange={e => setEditCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-black/10 bg-white/60 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
            >
              <option value="">선택...</option>
              {ALL_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditItem(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">취소</button>
              <button
                onClick={saveEdit}
                disabled={!editCategory}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm rounded-lg font-medium transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

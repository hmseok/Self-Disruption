'use client'

// ═══════════════════════════════════════════════════════════════════
// /RideVision/lotto — 로또번호추출기 + 개인 당첨추적
// ───────────────────────────────────────────────────────────────────
// 탭 2개:
//  · 🎱 번호 추출 — 한국 로또 6/45 추출 + 오늘의 운세 + 「구매함」 기록
//  · 📒 내 기록   — 로그인 본인 구매·당첨 기록, 투자금/손실/손익 표출
//
// 당첨번호는 동행복권 자동 조회(서버 API). 구매 기록은 계정별 서버 DB.
//
// RideVision 세션 — PR-VISION-1 (추출기) → PR-VISION-2 (당첨추적)
// ═══════════════════════════════════════════════════════════════════

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getStoredToken } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'

// ─── 한국 로또 공식 구간별 공 색상 ─────────────────────────────────
function ballColor(n: number): string {
  if (n <= 10) return '#fbc400' // 1~10  노랑
  if (n <= 20) return '#69c8f2' // 11~20 파랑
  if (n <= 30) return '#ff7272' // 21~30 빨강
  if (n <= 40) return '#aaaaaa' // 31~40 회색
  return '#b0d840' //             41~45 초록
}

// ─── 1~45 중 6개 비복원 추출 (Fisher–Yates) → 오름차순 ─────────────
function drawGame(): number[] {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, 6).sort((a, b) => a - b)
}

const GAME_LABELS = ['A', 'B', 'C', 'D', 'E']

// ─── 오늘의 로또 운세 (클라이언트 랜덤 — 외부 연동 없음) ────────────
const FORTUNES: string[] = [
  '오늘은 흐름이 좋네요. 1등은 원래 준비된 사람에게 옵니다',
  '큰 기대보단 소소한 재미로! 그래도 혹시 모르죠',
  '숫자에 운명이 깃든 날. 가볍게 한 장 어떨까요',
  '서두르지 마세요. 좋은 기운은 천천히 모입니다',
  '오늘의 키워드는 「뜻밖의 행운」. 작은 기쁨이 찾아옵니다',
  '평소처럼 담담하게. 행운은 욕심 없는 손을 좋아합니다',
  '커피 한 잔의 여유처럼, 가볍게 운을 시험해 보세요',
  '주변 사람과 나누면 운이 두 배가 된다고 하죠',
  '오늘 뽑은 번호, 왠지 느낌이 좋지 않나요',
  '행운은 반복되는 일상 속에 숨어 있습니다',
  '무리하지 않는 선에서 — 그게 진짜 재미입니다',
  '오늘은 직감을 믿어봐도 좋은 날입니다',
  '기대는 가볍게, 마음은 즐겁게. 그거면 충분합니다',
  '작은 시도가 좋은 하루의 양념이 됩니다',
  '결과보다 과정을 즐기는 사람이 진짜 승자입니다',
  '오늘의 운세: 맑음 — 좋은 소식이 들려올지도 몰라요',
]

interface HistoryEntry {
  id: number
  time: string
  games: number[][]
}

interface ResultRow {
  draw_no: number
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
  n6: number
  bonus: number
  draw_date: string | null
}

interface EntryRow {
  id: string
  draw_no: number
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
  n6: number
  amount: number
  source: string
  created_at: string
}

// ─── 당첨 판정 ──────────────────────────────────────────────────────
// 6→1등 / 5+보너스→2등 / 5→3등 / 4→4등 / 3→5등 / 그 외→낙첨
const FIXED_PRIZE: Record<number, number> = { 4: 50000, 5: 5000 }

function rankOf(nums: number[], r: ResultRow): { rank: number; matches: number; bonusHit: boolean } {
  const win = [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6]
  const matches = nums.filter(n => win.includes(n)).length
  const bonusHit = nums.includes(r.bonus)
  let rank = 0
  if (matches === 6) rank = 1
  else if (matches === 5 && bonusHit) rank = 2
  else if (matches === 5) rank = 3
  else if (matches === 4) rank = 4
  else if (matches === 3) rank = 5
  return { rank, matches, bonusHit }
}

// ─── 번호 공 ───────────────────────────────────────────────────────
function Ball({ n, size = 42, dim = false }: { n: number; size?: number; dim?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: ballColor(n),
        color: COLORS.textPrimary,
        fontWeight: 800,
        fontSize: Math.round(size * 0.42),
        boxShadow: '0 2px 5px rgba(0,0,0,0.18)',
        flexShrink: 0,
        opacity: dim ? 0.3 : 1,
      }}
    >
      {n}
    </span>
  )
}

const won = (v: number) => `${v.toLocaleString()}원`

export default function LottoPage() {
  const [tab, setTab] = useState<'extract' | 'records'>('extract')

  // ── 추출기 상태 ──
  const [gameCount, setGameCount] = useState(5)
  const [results, setResults] = useState<number[][]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [fortune, setFortune] = useState<{ text: string; luck: number } | null>(null)
  const idRef = useRef(0)

  // ── 구매 / 회차 ──
  const [drawNo, setDrawNo] = useState<number | ''>('')
  const [buyingKey, setBuyingKey] = useState<string | null>(null)
  const [buyResult, setBuyResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // ── 내 기록 상태 ──
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [resultMap, setResultMap] = useState<Record<number, ResultRow | null>>({})
  const [recLoading, setRecLoading] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)
  const [migrationPending, setMigrationPending] = useState(false)
  const recLoadedRef = useRef(false)

  // 최신 회차 → 구매 기본 회차 (최신+1)
  useEffect(() => {
    ;(async () => {
      try {
        const token = getStoredToken()
        const res = await fetch('/api/ride-vision/lotto-result?latest=1', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        })
        const json = await res.json()
        if (json?.data?.draw_no) setDrawNo(Number(json.data.draw_no) + 1)
      } catch {
        // graceful — 사용자가 직접 입력
      }
    })()
  }, [])

  const flashCopied = useCallback((key: string) => {
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(c => (c === key ? null : c)), 1300)
  }, [])

  const handleDraw = useCallback(() => {
    const games = Array.from({ length: gameCount }, () => drawGame())
    setResults(games)
    setBuyResult(null)
    setFortune({
      text: FORTUNES[Math.floor(Math.random() * FORTUNES.length)],
      luck: 55 + Math.floor(Math.random() * 45),
    })
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false })
    setHistory(prev => [{ id: ++idRef.current, time, games }, ...prev].slice(0, 8))
  }, [gameCount])

  const copy = useCallback(
    async (text: string, key: string) => {
      try {
        await navigator.clipboard.writeText(text)
        flashCopied(key)
      } catch {
        // 클립보드 권한 불가 환경 — 무시
      }
    },
    [flashCopied]
  )

  // ── 구매 기록 (POST) ──
  const buyGames = useCallback(
    async (games: number[][], key: string) => {
      if (!drawNo || Number(drawNo) < 1) {
        setBuyResult({ ok: false, msg: '구매 회차를 먼저 입력하세요' })
        return
      }
      setBuyingKey(key)
      try {
        const token = getStoredToken()
        const res = await fetch('/api/ride-vision/lotto-entries', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ draw_no: Number(drawNo), games }),
        })
        const json = await res.json()
        if (res.ok && json.success) {
          recLoadedRef.current = false // 내 기록 갱신 유도
          setBuyResult({
            ok: true,
            msg: `${Number(drawNo)}회차에 ${json.count}게임 기록 완료 — 「내 기록」 탭에서 확인하세요`,
          })
        } else {
          setBuyResult({ ok: false, msg: json.error || `오류 (HTTP ${res.status})` })
        }
      } catch (e) {
        setBuyResult({ ok: false, msg: String(e) })
      } finally {
        setBuyingKey(null)
      }
    },
    [drawNo]
  )

  // ── 내 기록 로드 ──
  const loadRecords = useCallback(async () => {
    setRecLoading(true)
    setRecError(null)
    try {
      const token = getStoredToken()
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch('/api/ride-vision/lotto-entries', { headers, cache: 'no-store' })
      const json = await res.json()
      const list: EntryRow[] = json.data || []
      setEntries(list)
      setMigrationPending(!!json.meta?._migration_pending)
      const draws = [...new Set(list.map(e => e.draw_no))]
      const map: Record<number, ResultRow | null> = {}
      await Promise.all(
        draws.map(async d => {
          try {
            const r = await fetch(`/api/ride-vision/lotto-result?drwNo=${d}`, { headers, cache: 'no-store' })
            const rj = await r.json()
            map[d] = rj?.data || null
          } catch {
            map[d] = null
          }
        })
      )
      setResultMap(map)
      recLoadedRef.current = true
    } catch (e) {
      setRecError(String(e))
    } finally {
      setRecLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'records' && !recLoadedRef.current) loadRecords()
  }, [tab, loadRecords])

  const deleteEntry = useCallback(
    async (id: string) => {
      try {
        const token = getStoredToken()
        const res = await fetch(`/api/ride-vision/lotto-entries/${id}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (res.ok) loadRecords()
      } catch {
        // 무시 — 다음 새로고침 시 정합
      }
    },
    [loadRecords]
  )

  const gameToText = (g: number[], idx: number) => `게임 ${GAME_LABELS[idx] ?? idx + 1}: ${g.join(', ')}`
  const allText = results.map((g, i) => gameToText(g, i)).join('\n')
  const sumOf = (g: number[]) => g.reduce((a, b) => a + b, 0)

  // ── 내 기록 파생 행 ──
  interface RecordRow {
    id: string
    draw_no: number
    numbers: number[]
    amount: number
    created_at: string
    drawn: boolean
    rank: number
    matches: number
    net: number | null // null = 미추첨 또는 1~3등(금액 미확정)
  }

  const recordRows: RecordRow[] = useMemo(() => {
    return entries.map(e => {
      const numbers = [e.n1, e.n2, e.n3, e.n4, e.n5, e.n6]
      const result = resultMap[e.draw_no]
      if (!result) {
        return { id: e.id, draw_no: e.draw_no, numbers, amount: e.amount, created_at: e.created_at, drawn: false, rank: -1, matches: 0, net: null }
      }
      const { rank, matches } = rankOf(numbers, result)
      let net: number | null = null
      if (rank === 0) net = -e.amount
      else if (rank === 4 || rank === 5) net = FIXED_PRIZE[rank] - e.amount
      // rank 1~3 → net null (금액 회차별 상이)
      return { id: e.id, draw_no: e.draw_no, numbers, amount: e.amount, created_at: e.created_at, drawn: true, rank, matches, net }
    })
  }, [entries, resultMap])

  // ── 요약 통계 ──
  const summary = useMemo(() => {
    const totalGames = recordRows.length
    const totalAmount = recordRows.reduce((a, r) => a + r.amount, 0)
    const winCount = recordRows.filter(r => r.drawn && r.rank >= 1 && r.rank <= 5).length
    const lossSum = recordRows.filter(r => r.drawn && r.rank === 0).reduce((a, r) => a + r.amount, 0)
    const pendingCount = recordRows.filter(r => !r.drawn).length
    const topWins = recordRows.filter(r => r.drawn && r.rank >= 1 && r.rank <= 3).length
    const net = recordRows.reduce((a, r) => a + (r.net ?? 0), 0)
    return { totalGames, totalAmount, winCount, lossSum, pendingCount, topWins, net }
  }, [recordRows])

  const statItems: StatItem[] = useMemo(() => {
    const net = summary.net
    return [
      { label: '총 게임', value: summary.totalGames, unit: '게임', tint: 'blue' },
      { label: '총 투자금', value: summary.totalAmount, unit: '원', tint: 'purple' },
      {
        label: '당첨',
        value: summary.winCount,
        unit: '건',
        tint: 'green',
        subValue: summary.pendingCount > 0 ? `추첨대기 ${summary.pendingCount}` : undefined,
      },
      { label: '비당첨 손실', value: summary.lossSum, unit: '원', tint: 'red' },
      {
        label: '순손익',
        value: net === 0 ? '0원' : net < 0 ? `손실 ${won(-net)}` : `수익 ${won(net)}`,
        tint: net < 0 ? 'red' : net > 0 ? 'green' : 'slate',
        subValue: summary.topWins > 0 ? `1~3등 ${summary.topWins}건 별도` : undefined,
      },
    ]
  }, [summary])

  // ── 내 기록 테이블 컬럼 ──
  const rankLabel = (r: RecordRow): string => {
    if (!r.drawn) return '추첨 대기'
    if (r.rank === 0) return '낙첨'
    return `${r.rank}등`
  }
  const rankTone = (r: RecordRow): { bg: string; color: string; border: string } => {
    if (!r.drawn) return { bg: COLORS.bgGray, color: COLORS.textMuted, border: COLORS.borderFaint }
    if (r.rank === 0) return { bg: COLORS.bgRed, color: COLORS.danger, border: COLORS.borderRed }
    if (r.rank >= 1 && r.rank <= 3) return { bg: COLORS.bgViolet, color: '#7c3aed', border: COLORS.borderViolet }
    return { bg: COLORS.bgGreen, color: COLORS.success, border: COLORS.borderGreen }
  }

  const recordColumns: TableColumn<RecordRow>[] = [
    {
      key: 'draw_no',
      label: '회차',
      sortBy: r => r.draw_no,
      render: r => <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{r.draw_no}회</span>,
    },
    {
      key: 'numbers',
      label: '구매 번호',
      sortBy: r => r.numbers[0],
      render: r => {
        const result = resultMap[r.draw_no]
        const win = result ? [result.n1, result.n2, result.n3, result.n4, result.n5, result.n6] : []
        return (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {r.numbers.map(n => (
              <Ball key={n} n={n} size={28} dim={r.drawn && !win.includes(n)} />
            ))}
          </div>
        )
      },
    },
    {
      key: 'result',
      label: '결과',
      align: 'center',
      sortBy: r => (r.drawn ? r.rank || 99 : 100), // 1등 먼저, 낙첨/대기 뒤
      render: r => {
        const t = rankTone(r)
        return (
          <span
            style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: t.bg,
              color: t.color,
              border: `1px solid ${t.border}`,
              whiteSpace: 'nowrap',
            }}
          >
            {rankLabel(r)}
            {r.drawn && r.rank > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>{r.matches}개</span>}
          </span>
        )
      },
    },
    {
      key: 'net',
      label: '손익',
      align: 'right',
      sortBy: r => r.net ?? 0,
      render: r => {
        if (!r.drawn) return <span style={{ color: COLORS.textMuted, fontSize: 12 }}>—</span>
        if (r.net === null)
          return <span style={{ color: '#7c3aed', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>당첨금 별도</span>
        if (r.net < 0)
          return (
            <span style={{ color: COLORS.danger, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
              손실 {won(-r.net)}
            </span>
          )
        return (
          <span style={{ color: COLORS.success, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
            수익 {won(r.net)}
          </span>
        )
      },
    },
    {
      key: 'action',
      label: '',
      align: 'right',
      render: r => (
        <button
          onClick={() => deleteEntry(r.id)}
          style={{
            ...BTN.sm,
            background: 'transparent',
            color: COLORS.textMuted,
            border: `1px solid ${COLORS.borderFaint}`,
            cursor: 'pointer',
          }}
        >
          삭제
        </button>
      ),
    },
  ]

  // ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 16}}>
      {/* ── 탭 바 ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {([
          ['extract', '🎱 번호 추출'],
          ['records', '📒 내 기록'],
        ] as const).map(([key, label]) => {
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                ...BTN.md,
                background: active ? '#0f2440' : 'transparent',
                color: active ? '#fff' : COLORS.textSecondary,
                border: `1px solid ${active ? '#0f2440' : COLORS.borderFaint}`,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* ═══ 탭 1 — 번호 추출 ═══════════════════════════════════ */}
      {tab === 'extract' && (
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {/* 컨트롤 카드 */}
          <div style={{ ...GLASS.L4, padding: 16, borderRadius: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecondary }}>동시 추출 게임 수</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(n => {
                  const active = gameCount === n
                  return (
                    <button
                      key={n}
                      onClick={() => setGameCount(n)}
                      style={{
                        ...BTN.md,
                        minWidth: 38,
                        background: active ? '#0f2440' : 'transparent',
                        color: active ? '#fff' : COLORS.textSecondary,
                        border: `1px solid ${active ? '#0f2440' : COLORS.borderFaint}`,
                        cursor: 'pointer',
                      }}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={handleDraw}
                style={{ ...BTN.lg, marginLeft: 'auto', background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                🎱 번호 추출
              </button>
            </div>
          </div>

          {/* 오늘의 운세 */}
          {fortune && (
            <div
              style={{
                ...GLASS.L3,
                border: `1px solid ${COLORS.borderViolet}`,
                padding: '12px 16px',
                borderRadius: 14,
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', marginBottom: 4 }}>
                🔮 오늘의 로또 운세 · 행운지수 {fortune.luck}
              </div>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>{fortune.text}</div>
            </div>
          )}

          {/* 구매 결과 패널 (Rule 20 — alert 대신 글래스 패널) */}
          {buyResult && (
            <div
              style={{
                ...GLASS.L3,
                border: `1px solid ${buyResult.ok ? COLORS.borderGreen : COLORS.borderRed}`,
                padding: '10px 14px',
                borderRadius: 12,
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13, color: buyResult.ok ? COLORS.success : COLORS.danger, fontWeight: 700 }}>
                {buyResult.ok ? '✅' : '⚠️'} {buyResult.msg}
              </span>
              <button
                onClick={() => setBuyResult(null)}
                style={{ ...BTN.sm, marginLeft: 'auto', background: 'transparent', color: COLORS.textMuted, border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer' }}
              >
                ✕ 닫기
              </button>
            </div>
          )}

          {/* 결과 카드 */}
          {results.length > 0 ? (
            <div style={{ ...GLASS.L4, padding: 16, borderRadius: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>추출 결과</span>
                <span style={{ fontSize: 12, color: COLORS.textMuted }}>{results.length}게임</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>구매 회차</span>
                  <input
                    type="number"
                    value={drawNo}
                    onChange={e => setDrawNo(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="회차"
                    style={{
                      ...GLASS.L1,
                      width: 72,
                      padding: '4px 8px',
                      borderRadius: 8,
                      fontSize: 12,
                      border: `1px solid ${COLORS.borderFaint}`,
                    }}
                  />
                  <button
                    onClick={() => buyGames(results, 'all')}
                    disabled={buyingKey !== null}
                    style={{
                      ...BTN.sm,
                      background: COLORS.bgGreen,
                      color: COLORS.success,
                      border: `1px solid ${COLORS.borderGreen}`,
                      cursor: buyingKey !== null ? 'wait' : 'pointer',
                    }}
                  >
                    전체 구매함
                  </button>
                  <button
                    onClick={() => copy(allText, 'all')}
                    style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}
                  >
                    {copiedKey === 'all' ? '✓ 복사됨' : '전체 복사'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {results.map((game, i) => {
                  const key = `g${i}`
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: `1px solid ${COLORS.borderFaint}`,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted, width: 52 }}>
                        게임 {GAME_LABELS[i] ?? i + 1}
                      </span>
                      <div style={{ display: 'flex', gap: 7 }}>
                        {game.map(n => (
                          <Ball key={n} n={n} />
                        ))}
                      </div>
                      <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 4 }}>합 {sumOf(game)}</span>
                      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                        <button
                          onClick={() => buyGames([game], key)}
                          disabled={buyingKey !== null}
                          style={{
                            ...BTN.sm,
                            background: COLORS.bgGreen,
                            color: COLORS.success,
                            border: `1px solid ${COLORS.borderGreen}`,
                            cursor: buyingKey !== null ? 'wait' : 'pointer',
                          }}
                        >
                          구매함
                        </button>
                        <button
                          onClick={() => copy(gameToText(game, i), key)}
                          style={{ ...BTN.sm, background: 'transparent', color: COLORS.textSecondary, border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer' }}
                        >
                          {copiedKey === key ? '✓' : '복사'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div
              style={{
                ...GLASS.L4,
                padding: '32px 16px',
                borderRadius: 14,
                marginBottom: 14,
                textAlign: 'center',
                color: COLORS.textMuted,
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              게임 수를 고르고 <strong style={{ color: COLORS.textSecondary }}>번호 추출</strong> 을 누르세요.
              <br />
              한국 로또 6/45 — 1~45 중 6개를 무작위로 뽑습니다.
            </div>
          )}

          {/* 최근 추출 기록 */}
          {history.length > 0 && (
            <div style={{ ...GLASS.L4, padding: 16, borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>최근 추출 기록</span>
                <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8 }}>최근 {history.length}회</span>
                <button
                  onClick={() => setHistory([])}
                  style={{ ...BTN.sm, marginLeft: 'auto', background: 'transparent', color: COLORS.textMuted, border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer' }}
                >
                  기록 지우기
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map(entry => (
                  <div
                    key={entry.id}
                    style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${COLORS.borderFaint}`, background: COLORS.bgGray }}
                  >
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>
                      {entry.time} · {entry.games.length}게임
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {entry.games.map((game, gi) => (
                        <div key={gi} style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                          {game.map(n => (
                            <Ball key={n} n={n} size={26} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: COLORS.textDim }}>
            재미로 보는 무작위 추출입니다 · 추출은 브라우저에서, 구매 기록만 계정에 저장됩니다
          </div>
        </div>
      )}

      {/* ═══ 탭 2 — 내 기록 ═══════════════════════════════════ */}
      {tab === 'records' && (
        <div>
          {migrationPending && (
            <div
              style={{
                ...GLASS.L3,
                border: `1px solid ${COLORS.borderAmber}`,
                padding: '10px 14px',
                borderRadius: 12,
                marginBottom: 14,
                fontSize: 12,
                color: COLORS.warning,
                fontWeight: 700,
              }}
            >
              ⚠️ DB 마이그레이션 미적용 — 관리자가 migrations/2026-05-24_ride_vision_lotto.sql 을 적용하면 기록이 저장됩니다.
            </div>
          )}

          <DcStatStrip stats={statItems} />

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>내 구매·당첨 기록</span>
            <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8 }}>
              {recLoading ? '불러오는 중…' : `${recordRows.length}건`}
            </span>
            <button
              onClick={loadRecords}
              style={{ ...BTN.sm, marginLeft: 'auto', background: COLORS.bgBlue, color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}
            >
              ↻ 새로고침
            </button>
          </div>

          {recError && (
            <div style={{ padding: 8, background: COLORS.bgRed, color: COLORS.danger, borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
              ❌ {recError}
            </div>
          )}

          <NeuDataTable
            columns={recordColumns}
            data={recordRows}
            rowKey={r => r.id}
            loading={recLoading}
            defaultSort={{ key: 'draw_no', dir: 'desc' }}
            emptyIcon="🎟️"
            emptyMessage="구매 기록이 없습니다 — 「번호 추출」 탭에서 추출 후 「구매함」 을 눌러보세요"
          />

          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: COLORS.textDim }}>
            당첨여부는 동행복권 회차 결과로 자동 판정됩니다 · 1~3등 당첨금은 회차별로 달라 별도 표기됩니다
          </div>
        </div>
      )}
    </div>
  )
}

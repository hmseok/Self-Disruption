'use client'

// ═══════════════════════════════════════════════════════════════════
// /RideVision/lotto — 로또번호추출기 + 개인 당첨추적
// ───────────────────────────────────────────────────────────────────
// 탭 2개:
//  · 🎱 번호 추출 — 한국 로또 6/45, 5게임 고정. 운세 + 「복사」(=구매 기록).
//                  이번 회차/추첨일 자동 표시. 회차당 1회 추출 · 5게임 구매 제한.
//  · 📒 내 기록   — 로그인 본인 구매·당첨 기록, 투자금/손실/손익.
//
// 당첨번호 자동조회는 제외 (동행복권 엔드포인트 폐기 + Cloud Run egress 차단 — PR-VISION-3).
// ride_lotto_results 에 결과가 들어오면 당첨판정이 자동 동작 (forward-compatible).
//
// RideVision 세션 — PR-VISION-1 → 2 → 3
// ═══════════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getStoredToken } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'

// ─── 제한 상수 ─────────────────────────────────────────────────────
const GAMES_PER_DRAW = 5 // 1회 추출 = 5게임 (로또 1매)
const MAX_DRAWS = 1 // 회차당 추출 1회 — 5게임, 운명의 한 장 (재추출 없음)
const MAX_PURCHASE = 5 // 회차당 구매 게임 수

// ─── 회차 날짜 계산 (동행복권 없이) ────────────────────────────────
// 로또 6/45 1회차 추첨: 2002-12-07 (토). 이후 매주 토요일.
const ROUND1_UTC = Date.UTC(2002, 11, 7)
const WEEK_MS = 7 * 86400000

function currentRoundInfo(): { round: number; drawDate: string } {
  const now = new Date()
  const day = now.getDay() // 0=일 ~ 6=토
  let daysToSat = (6 - day + 7) % 7
  // 토요일 21시 이후면 이번 추첨 종료 → 다음 회차
  if (day === 6 && now.getHours() >= 21) daysToSat = 7
  const sat = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToSat)
  const satUTC = Date.UTC(sat.getFullYear(), sat.getMonth(), sat.getDate())
  const round = Math.round((satUTC - ROUND1_UTC) / WEEK_MS) + 1
  const drawDate = `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(
    sat.getDate()
  ).padStart(2, '0')}`
  return { round, drawDate }
}

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

// ─── 당첨/꽝 축하 멘트 (클라이언트 랜덤 — 「만든 사람」 드립) ─────────
const WIN_COMMON: string[] = [
  '당첨인데 만든 사람한테 입 싹 닦으면 3년 재수없습니다. 농담 아니에요.',
  '당첨금 들고 튀면 만든 사람 저주가 평생 따라다닙니다.',
  '개발자 한 턱 안 쏘면 그 돈, 손가락 사이로 다 빠져나갑니다.',
  '만든 사람 모른 척하면 다음 회차부터 번호가 등을 돌립니다.',
  '혼자 다 먹으면 체합니다 — 만든 사람 몫은 비상약이에요.',
]
const WIN_JACKPOT: string[] = [
  '1등?! 만든 사람 무시하고 퇴사하면 그 돈 3년 안에 못 만집니다.',
  '대박 — 한 턱은 우주의 법칙입니다. 거스르면 우주가 회수해 갑니다.',
]
const WIN_SMALL: string[] = [
  '푼돈이라고 입 막을 생각 마세요. 치킨은 쏴야 인지상정.',
  '딱 만든 사람 회식비만큼 버셨네요. 우연일 리가요.',
]
const MISS_MESSAGES: string[] = [
  '꽝! 운이 없었던 게 아니라 만든 사람한테 인사를 안 했죠?',
  '낙첨... 만든 사람 탓하면 다음 주도 꽝입니다. 조용히 재도전.',
  '꽝이지만 만든 사람도 매번 꽝입니다. 동지애 느끼고 가세요.',
  '1,000원으로 일주일 설렘 샀다 치죠 — 만든 사람이 서비스로 드린 겁니다.',
  '번호는 컴퓨터가 골랐으니 만든 사람 욕은... 음, 조금만 하세요.',
  '다음 회차엔 만든 사람한테 잘 보이고 오세요. 그게 진짜 전략입니다.',
]

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

function rankOf(nums: number[], r: ResultRow): { rank: number; matches: number } {
  const win = [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6]
  const matches = nums.filter(n => win.includes(n)).length
  const bonusHit = nums.includes(r.bonus)
  let rank = 0
  if (matches === 6) rank = 1
  else if (matches === 5 && bonusHit) rank = 2
  else if (matches === 5) rank = 3
  else if (matches === 4) rank = 4
  else if (matches === 3) rank = 5
  return { rank, matches }
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
  const [roundInfo] = useState(() => currentRoundInfo())

  // ── 추출기 상태 ──
  const [results, setResults] = useState<number[][]>([])
  const [boughtIdx, setBoughtIdx] = useState<number[]>([])
  const [drawCount, setDrawCount] = useState(0)
  const [fortune, setFortune] = useState<{ text: string; luck: number } | null>(null)
  const [buyResult, setBuyResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // ── 내 기록 상태 ──
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [resultMap, setResultMap] = useState<Record<number, ResultRow | null>>({})
  const [recLoading, setRecLoading] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)
  const [migrationPending, setMigrationPending] = useState(false)
  const recLoadedRef = useRef(false)

  const authHeaders = (): Record<string, string> => {
    const token = getStoredToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  // ── 내 구매 기록 로드 ──
  const fetchEntries = useCallback(async (): Promise<EntryRow[]> => {
    try {
      const res = await fetch('/api/ride-vision/lotto-entries', {
        headers: authHeaders(),
        cache: 'no-store',
      })
      const json = await res.json()
      const list: EntryRow[] = json.data || []
      setEntries(list)
      setMigrationPending(!!json.meta?._migration_pending)
      return list
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // 내 기록 탭 — 구매기록 + 회차별 당첨결과
  const loadRecords = useCallback(async () => {
    setRecLoading(true)
    setRecError(null)
    try {
      const list = await fetchEntries()
      const draws = [...new Set(list.map(e => e.draw_no))]
      const map: Record<number, ResultRow | null> = {}
      await Promise.all(
        draws.map(async d => {
          try {
            const r = await fetch(`/api/ride-vision/lotto-result?drwNo=${d}`, {
              headers: authHeaders(),
              cache: 'no-store',
            })
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
  }, [fetchEntries])

  useEffect(() => {
    if (tab === 'records' && !recLoadedRef.current) loadRecords()
  }, [tab, loadRecords])

  // ── 이번 회차 구매 수량 ──
  const purchasedTotal = useMemo(
    () => entries.filter(e => e.draw_no === roundInfo.round).length,
    [entries, roundInfo.round]
  )
  const roundClosed = purchasedTotal >= MAX_PURCHASE
  const drawsLeft = MAX_DRAWS - drawCount
  // 이번 회차에 이미 구매 기록이 있으면(재로그인·새로고침 후에도 DB 기준) 추출 잠금
  const alreadyBought = purchasedTotal > 0
  const canDraw = drawsLeft > 0 && !alreadyBought

  const gameToText = (g: number[], idx: number) => `게임 ${GAME_LABELS[idx] ?? idx + 1}: ${g.join(', ')}`
  const sumOf = (g: number[]) => g.reduce((a, b) => a + b, 0)

  // ── 번호 추출 (회차당 1회 — 재추출 없음) ──
  const handleDraw = useCallback(() => {
    if (drawCount >= MAX_DRAWS || purchasedTotal > 0) return
    const games = Array.from({ length: GAMES_PER_DRAW }, () => drawGame())
    setResults(games)
    setBoughtIdx([])
    setBuyResult(null)
    setFortune({
      text: FORTUNES[Math.floor(Math.random() * FORTUNES.length)],
      luck: 55 + Math.floor(Math.random() * 45),
    })
    setDrawCount(c => c + 1)
  }, [drawCount, purchasedTotal])

  // ── 복사 = 구매 기록 (회차당 5게임 제한) ──
  const buyGames = useCallback(
    async (idxList: number[]) => {
      if (idxList.length === 0 || busy) return
      if (purchasedTotal >= MAX_PURCHASE) {
        setBuyResult({ ok: false, msg: `이번 회차(${roundInfo.round}회) 5게임을 모두 구매했습니다` })
        return
      }
      const take = idxList.slice(0, MAX_PURCHASE - purchasedTotal)
      const games = take.map(i => results[i])
      setBusy(true)
      try {
        const res = await fetch('/api/ride-vision/lotto-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ draw_no: roundInfo.round, games }),
        })
        const json = await res.json()
        if (res.ok && json.success) {
          try {
            await navigator.clipboard.writeText(take.map(i => gameToText(results[i], i)).join('\n'))
          } catch {
            // 클립보드 권한 불가 — 구매 기록은 정상
          }
          setBoughtIdx(prev => [...new Set([...prev, ...take])])
          recLoadedRef.current = false
          await fetchEntries()
          setBuyResult({
            ok: true,
            msg: `${roundInfo.round}회차에 ${json.count}게임 복사·구매 완료 — 「내 기록」 탭에서 확인`,
          })
        } else {
          setBuyResult({ ok: false, msg: json.error || `오류 (HTTP ${res.status})` })
        }
      } catch (e) {
        setBuyResult({ ok: false, msg: String(e) })
      } finally {
        setBusy(false)
      }
    },
    [busy, purchasedTotal, results, roundInfo.round, fetchEntries]
  )

  const unboughtIdx = useMemo(
    () => results.map((_, i) => i).filter(i => !boughtIdx.includes(i)),
    [results, boughtIdx]
  )

  // ── 내 기록 파생 행 ──
  interface RecordRow {
    id: string
    draw_no: number
    numbers: number[]
    amount: number
    drawn: boolean
    rank: number
    matches: number
    net: number | null
  }

  const recordRows: RecordRow[] = useMemo(() => {
    return entries.map(e => {
      const numbers = [e.n1, e.n2, e.n3, e.n4, e.n5, e.n6]
      const result = resultMap[e.draw_no]
      if (!result) {
        return { id: e.id, draw_no: e.draw_no, numbers, amount: e.amount, drawn: false, rank: -1, matches: 0, net: null }
      }
      const { rank, matches } = rankOf(numbers, result)
      let net: number | null = null
      if (rank === 0) net = -e.amount
      else if (rank === 4 || rank === 5) net = FIXED_PRIZE[rank] - e.amount
      return { id: e.id, draw_no: e.draw_no, numbers, amount: e.amount, drawn: true, rank, matches, net }
    })
  }, [entries, resultMap])

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

  // 당첨/꽝 축하 멘트 (랜덤 — recordRows 변경 시 재선정)
  const celebration = useMemo<{ tone: 'win' | 'miss'; msg: string } | null>(() => {
    const winRows = recordRows.filter(r => r.drawn && r.rank >= 1 && r.rank <= 5)
    if (winRows.length > 0) {
      const bestRank = Math.min(...winRows.map(r => r.rank))
      const pool =
        bestRank <= 2
          ? [...WIN_JACKPOT, ...WIN_COMMON]
          : bestRank >= 4
            ? [...WIN_SMALL, ...WIN_COMMON]
            : WIN_COMMON
      return { tone: 'win', msg: pool[Math.floor(Math.random() * pool.length)] }
    }
    if (recordRows.some(r => r.drawn && r.rank === 0)) {
      return { tone: 'miss', msg: MISS_MESSAGES[Math.floor(Math.random() * MISS_MESSAGES.length)] }
    }
    return null
  }, [recordRows])

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
      sortBy: r => (r.drawn ? r.rank || 99 : 100),
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
  ]

  // ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 16 }}>
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
                background: active ? '#3b6eb5' : 'transparent',
                color: active ? '#fff' : COLORS.textSecondary,
                border: `1px solid ${active ? '#3b6eb5' : COLORS.borderFaint}`,
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
        <div>
          {/* 이번 회차 배너 */}
          <div
            style={{
              ...GLASS.L3,
              border: `1px solid ${COLORS.borderBlue}`,
              padding: '10px 16px',
              borderRadius: 12,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 800, color: COLORS.primary }}>
              🎯 이번 회차 {roundInfo.round}회
            </span>
            <span style={{ color: COLORS.textSecondary }}>· 추첨일 {roundInfo.drawDate} (토)</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 12,
                fontWeight: 700,
                color: roundClosed ? COLORS.danger : COLORS.textSecondary,
              }}
            >
              이번 회차 구매 {purchasedTotal}/{MAX_PURCHASE}
            </span>
          </div>

          {/* 컨트롤 카드 */}
          <div style={{ ...GLASS.L4, padding: 16, borderRadius: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecondary }}>
                회차당 1회 · 5게임 추출
              </span>
              <span style={{ fontSize: 12, color: canDraw ? COLORS.textMuted : COLORS.danger }}>
                {canDraw
                  ? '버튼을 눌러 5게임을 받으세요'
                  : alreadyBought
                    ? '이번 회차 구매 완료'
                    : '이번 회차 추출 완료'}
              </span>
              <button
                onClick={handleDraw}
                disabled={!canDraw}
                style={{
                  ...BTN.lg,
                  marginLeft: 'auto',
                  background: canDraw ? COLORS.primary : COLORS.neutral,
                  color: '#fff',
                  border: 'none',
                  cursor: canDraw ? 'pointer' : 'not-allowed',
                }}
              >
                {canDraw
                  ? '🎱 번호 추출'
                  : alreadyBought
                    ? '✓ 이번 회차 구매 완료'
                    : '✓ 이번 회차 추출 완료'}
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

          {/* 복사·구매 결과 패널 (Rule 20 — alert 대신 글래스 패널) */}
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
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 13, color: buyResult.ok ? COLORS.success : COLORS.danger, fontWeight: 700 }}>
                {buyResult.ok ? '✅' : '⚠️'} {buyResult.msg}
              </span>
              {buyResult.ok && (
                <button
                  onClick={() => setTab('records')}
                  style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}
                >
                  내 기록 보기
                </button>
              )}
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
                <span style={{ fontSize: 12, color: COLORS.textMuted }}>5게임</span>
                <button
                  onClick={() => buyGames(unboughtIdx)}
                  disabled={busy || roundClosed || unboughtIdx.length === 0}
                  style={{
                    ...BTN.sm,
                    marginLeft: 'auto',
                    background: COLORS.bgGreen,
                    color: COLORS.success,
                    border: `1px solid ${COLORS.borderGreen}`,
                    cursor: busy || roundClosed || unboughtIdx.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: busy || roundClosed || unboughtIdx.length === 0 ? 0.5 : 1,
                  }}
                >
                  전체 복사·구매
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {results.map((game, i) => {
                  const bought = boughtIdx.includes(i)
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
                        border: `1px solid ${bought ? COLORS.borderGreen : COLORS.borderFaint}`,
                        background: bought ? COLORS.bgGreen : 'transparent',
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
                      {bought ? (
                        <span
                          style={{
                            ...BTN.sm,
                            marginLeft: 'auto',
                            background: 'transparent',
                            color: COLORS.success,
                            border: `1px solid ${COLORS.borderGreen}`,
                          }}
                        >
                          ✓ 구매됨
                        </span>
                      ) : (
                        <button
                          onClick={() => buyGames([i])}
                          disabled={busy || roundClosed}
                          style={{
                            ...BTN.sm,
                            marginLeft: 'auto',
                            background: COLORS.bgGreen,
                            color: COLORS.success,
                            border: `1px solid ${COLORS.borderGreen}`,
                            cursor: busy || roundClosed ? 'not-allowed' : 'pointer',
                            opacity: busy || roundClosed ? 0.5 : 1,
                          }}
                        >
                          복사
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textMuted }}>
                「복사」를 누르면 클립보드 복사 + {roundInfo.round}회차 구매로 자동 기록됩니다
                {roundClosed && (
                  <span style={{ color: COLORS.danger, fontWeight: 700 }}> · 이번 회차 5게임 구매 완료</span>
                )}
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
              {alreadyBought ? (
                <>
                  이번 회차({roundInfo.round}회)에 이미{' '}
                  <strong style={{ color: COLORS.textSecondary }}>{purchasedTotal}게임</strong> 구매하셨습니다.
                  <br />
                  「📒 내 기록」 탭에서 당첨여부를 확인하세요.
                </>
              ) : (
                <>
                  <strong style={{ color: COLORS.textSecondary }}>번호 추출</strong> 을 누르면 5게임을 한 번에
                  뽑습니다.
                  <br />
                  한국 로또 6/45 — 회차당 1회 추출 · 구매 5게임까지.
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: 4, textAlign: 'center', fontSize: 11, color: COLORS.textDim }}>
            재미로 보는 무작위 추출 · 추출은 브라우저에서, 구매 기록만 계정에 저장됩니다
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
              ⚠️ DB 마이그레이션 미적용 — migrations/2026-05-24_ride_vision_lotto.sql 적용 후 기록이 저장됩니다.
            </div>
          )}

          {celebration && (
            <div
              style={{
                ...GLASS.L3,
                border: `1px solid ${
                  celebration.tone === 'win' ? COLORS.borderViolet : COLORS.borderFaint
                }`,
                padding: '12px 16px',
                borderRadius: 14,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: celebration.tone === 'win' ? '#7c3aed' : COLORS.textMuted,
                  marginBottom: 4,
                }}
              >
                {celebration.tone === 'win' ? '🎉 당첨 축하합니다!' : '😵 이번엔 꽝'}
              </div>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
                {celebration.msg}
              </div>
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
            emptyMessage="구매 기록이 없습니다 — 「번호 추출」 탭에서 추출 후 「복사」 를 눌러보세요"
          />

          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: COLORS.textDim }}>
            당첨번호가 등록되면 회차별 당첨여부·손익이 자동 계산됩니다 (현재 자동 조회 미연동 — 추첨 대기로 표시)
          </div>
        </div>
      )}
    </div>
  )
}

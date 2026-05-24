'use client'

// ═══════════════════════════════════════════════════════════════════
// /RideVision/lotto — 로또번호추출기
// ───────────────────────────────────────────────────────────────────
// 한국 로또 6/45 번호 추출기. 「비전」 그룹 한쪽 구석 가벼운 유틸.
//  · 1게임 = 1~45 중 중복 없이 6개 랜덤 (오름차순)
//  · 동시 1~5게임 추출
//  · 결과는 한국 로또 공식 구간색 공으로 표시 + 복사
//  · 최근 추출 기록 (세션 메모리 — 새로고침 시 사라짐)
// 외부 API / DB 불필요 — 클라이언트 only.
//
// RideVision 세션 신설 — PR-VISION-1
// ═══════════════════════════════════════════════════════════════════

import { useState, useCallback, useRef } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

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

interface HistoryEntry {
  id: number
  time: string
  games: number[][]
}

// ─── 번호 공 ───────────────────────────────────────────────────────
function Ball({ n, size = 42 }: { n: number; size?: number }) {
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
      }}
    >
      {n}
    </span>
  )
}

export default function LottoPage() {
  const [gameCount, setGameCount] = useState(5)
  const [results, setResults] = useState<number[][]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const idRef = useRef(0)

  const flashCopied = useCallback((key: string) => {
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(c => (c === key ? null : c)), 1300)
  }, [])

  const handleDraw = useCallback(() => {
    const games = Array.from({ length: gameCount }, () => drawGame())
    setResults(games)
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

  const gameToText = (g: number[], idx: number) => `게임 ${GAME_LABELS[idx] ?? idx + 1}: ${g.join(', ')}`
  const allText = results.map((g, i) => gameToText(g, i)).join('\n')
  const sumOf = (g: number[]) => g.reduce((a, b) => a + b, 0)

  return (
    <div style={{ padding: 16, maxWidth: 680, margin: '0 auto' }}>
      {/* ── 컨트롤 카드 ─────────────────────────────────────────── */}
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
            style={{
              ...BTN.lg,
              marginLeft: 'auto',
              background: COLORS.primary,
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            🎱 번호 추출
          </button>
        </div>
      </div>

      {/* ── 결과 카드 ───────────────────────────────────────────── */}
      {results.length > 0 ? (
        <div style={{ ...GLASS.L4, padding: 16, borderRadius: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>추출 결과</span>
            <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: 8 }}>{results.length}게임</span>
            <button
              onClick={() => copy(allText, 'all')}
              style={{
                ...BTN.sm,
                marginLeft: 'auto',
                background: COLORS.bgBlue,
                color: COLORS.primary,
                border: `1px solid ${COLORS.borderBlue}`,
                cursor: 'pointer',
              }}
            >
              {copiedKey === 'all' ? '✓ 복사됨' : '전체 복사'}
            </button>
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
                  <button
                    onClick={() => copy(gameToText(game, i), key)}
                    style={{
                      ...BTN.sm,
                      marginLeft: 'auto',
                      background: 'transparent',
                      color: COLORS.textSecondary,
                      border: `1px solid ${COLORS.borderFaint}`,
                      cursor: 'pointer',
                    }}
                  >
                    {copiedKey === key ? '✓' : '복사'}
                  </button>
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

      {/* ── 최근 추출 기록 ──────────────────────────────────────── */}
      {history.length > 0 && (
        <div style={{ ...GLASS.L4, padding: 16, borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>최근 추출 기록</span>
            <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8 }}>최근 {history.length}회</span>
            <button
              onClick={() => setHistory([])}
              style={{
                ...BTN.sm,
                marginLeft: 'auto',
                background: 'transparent',
                color: COLORS.textMuted,
                border: `1px solid ${COLORS.borderFaint}`,
                cursor: 'pointer',
              }}
            >
              기록 지우기
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(entry => (
              <div
                key={entry.id}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${COLORS.borderFaint}`,
                  background: COLORS.bgGray,
                }}
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

      {/* ── 푸터 안내 ───────────────────────────────────────────── */}
      <div style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: COLORS.textDim }}>
        재미로 보는 무작위 추출입니다 · 모든 계산은 브라우저에서만 이루어집니다
      </div>
    </div>
  )
}

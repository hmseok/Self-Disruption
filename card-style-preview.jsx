import { useState } from "react"

const sampleCards = [
  { id: '1', card_company: 'KB국민카드', card_number: '5585-2699-6792-2868', holder_name: '석호민', card_type: '법인카드', monthly_limit: 9900000, usage: 2450000 },
  { id: '2', card_company: 'KB국민카드', card_number: '9410-4999-2915-0851', holder_name: '공용', card_type: '주유카드', monthly_limit: 10000000, usage: 780000 },
  { id: '3', card_company: '우리카드', card_number: '9500-1234-5678-2756', holder_name: '공용', card_type: '하이패스', monthly_limit: 13000000, usage: 350000 },
  { id: '4', card_company: '신한카드', card_number: '4265-8694-7021-8819', holder_name: '김준수', card_type: '법인카드', monthly_limit: 5000000, usage: 4200000 },
  { id: '5', card_company: '삼성카드', card_number: '9410-4997-8599-5829', holder_name: '공용', card_type: '', monthly_limit: 3000000, usage: 0 },
]

const getCardTheme = (company) => {
  if (company?.includes('KB') || company?.includes('국민')) return { bg1: '#d97706', bg2: '#b45309', accent: '#fbbf24', text: 'white', chip: '#fde68a', brand: 'KB국민' }
  if (company?.includes('우리')) return { bg1: '#0284c7', bg2: '#0369a1', accent: '#38bdf8', text: 'white', chip: '#bae6fd', brand: '우리' }
  if (company?.includes('신한')) return { bg1: '#2563eb', bg2: '#1d4ed8', accent: '#60a5fa', text: 'white', chip: '#bfdbfe', brand: '신한' }
  if (company?.includes('삼성')) return { bg1: '#1e293b', bg2: '#0f172a', accent: '#475569', text: 'white', chip: '#94a3b8', brand: '삼성' }
  if (company?.includes('현대')) return { bg1: '#18181b', bg2: '#09090b', accent: '#3f3f46', text: 'white', chip: '#a1a1aa', brand: '현대' }
  if (company?.includes('하나')) return { bg1: '#0d9488', bg2: '#0f766e', accent: '#2dd4bf', text: 'white', chip: '#99f6e4', brand: '하나' }
  if (company?.includes('롯데')) return { bg1: '#dc2626', bg2: '#b91c1c', accent: '#f87171', text: 'white', chip: '#fecaca', brand: '롯데' }
  return { bg1: '#475569', bg2: '#334155', accent: '#94a3b8', text: 'white', chip: '#cbd5e1', brand: '카드' }
}

const typeIcon = (t) => t === '하이패스' ? '🛣️' : t === '주유카드' ? '⛽' : t === '법인카드' ? '💳' : t === '개인카드' ? '👤' : '🏷️'
const fmt = (n) => n ? Number(n).toLocaleString() : '0'

// ────────────────────────────────────────
// 1. 실물카드 미니어처
// ────────────────────────────────────────
function RealCardStyle() {
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>1️⃣ 실물카드 미니어처</h2>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>실제 카드 비율, IC칩, 엠보싱 번호, 브랜드 로고까지 재현</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {sampleCards.map(c => {
          const t = getCardTheme(c.card_company)
          const rate = c.monthly_limit ? Math.round((c.usage / c.monthly_limit) * 100) : 0
          return (
            <div key={c.id} style={{ width: 260 }}>
              {/* 카드 본체 */}
              <div style={{
                width: 260, height: 164, borderRadius: 14, padding: '18px 20px',
                background: `linear-gradient(135deg, ${t.bg1} 0%, ${t.bg2} 60%, ${t.accent}44 100%)`,
                color: t.text, position: 'relative', overflow: 'hidden',
                boxShadow: `0 8px 24px ${t.bg1}50, 0 2px 8px rgba(0,0,0,0.1)`,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}>
                {/* 배경 패턴 */}
                <div style={{
                  position: 'absolute', top: -40, right: -40, width: 180, height: 180,
                  borderRadius: '50%', background: `${t.accent}15`,
                }} />
                <div style={{
                  position: 'absolute', bottom: -60, left: -30, width: 200, height: 200,
                  borderRadius: '50%', background: `${t.accent}10`,
                }} />

                {/* 상단: 카드사 + 종류 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5 }}>{t.brand}</div>
                  {c.card_type && (
                    <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                      {typeIcon(c.card_type)} {c.card_type}
                    </span>
                  )}
                </div>

                {/* IC칩 */}
                <div style={{
                  width: 36, height: 28, borderRadius: 5, marginTop: 14,
                  background: `linear-gradient(145deg, #fde68a 0%, #f59e0b 50%, #d97706 100%)`,
                  border: '1px solid #b4590620',
                  position: 'relative', zIndex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* 칩 라인 */}
                  <div style={{ width: '60%', height: 1, background: '#b4590640', position: 'absolute', top: '35%' }} />
                  <div style={{ width: '60%', height: 1, background: '#b4590640', position: 'absolute', top: '65%' }} />
                  <div style={{ width: 1, height: '60%', background: '#b4590640', position: 'absolute', left: '35%' }} />
                  <div style={{ width: 1, height: '60%', background: '#b4590640', position: 'absolute', left: '65%' }} />
                </div>

                {/* 카드번호 */}
                <div style={{
                  fontFamily: "'Courier New', monospace", fontSize: 16, fontWeight: 700,
                  letterSpacing: 2.5, marginTop: 12, textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  position: 'relative', zIndex: 1,
                }}>
                  {c.card_number}
                </div>

                {/* 하단: 이름 + 카드사 */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                  marginTop: 10, position: 'relative', zIndex: 1,
                }}>
                  <div>
                    <div style={{ fontSize: 8, opacity: 0.6, letterSpacing: 1, textTransform: 'uppercase' }}>CARD HOLDER</div>
                    <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, marginTop: 1 }}>{c.holder_name}</div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, opacity: 0.4, fontStyle: 'italic', letterSpacing: -1 }}>VISA</div>
                </div>
              </div>
              {/* 카드 하단 정보 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', fontSize: 11 }}>
                <span style={{ color: '#64748b' }}>사용 <strong style={{ color: '#0f172a' }}>{fmt(c.usage)}</strong></span>
                <span style={{ color: '#64748b' }}>한도 <strong>{fmt(c.monthly_limit)}</strong></span>
                <span style={{ fontWeight: 900, color: rate >= 80 ? '#ef4444' : rate >= 50 ? '#f59e0b' : '#10b981' }}>{rate}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ────────────────────────────────────────
// 2. 프리미엄 글래스 카드
// ────────────────────────────────────────
function GlassCardStyle() {
  const [hover, setHover] = useState(null)
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>2️⃣ 프리미엄 글래스 카드</h2>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>반투명 유리 재질, 빛 반사 효과, 블러 배경의 고급 카드</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)', padding: 24, borderRadius: 16 }}>
        {sampleCards.map(c => {
          const t = getCardTheme(c.card_company)
          const rate = c.monthly_limit ? Math.round((c.usage / c.monthly_limit) * 100) : 0
          const isHover = hover === c.id
          return (
            <div key={c.id}
              onMouseEnter={() => setHover(c.id)}
              onMouseLeave={() => setHover(null)}
              style={{
                width: 260, height: 164, borderRadius: 14, padding: '18px 20px',
                background: `linear-gradient(135deg, ${t.bg1}88 0%, ${t.bg2}66 100%)`,
                backdropFilter: 'blur(20px)',
                border: `1px solid ${t.accent}40`,
                color: 'white', position: 'relative', overflow: 'hidden',
                boxShadow: isHover ? `0 12px 40px ${t.bg1}60, inset 0 1px 0 ${t.accent}40` : `0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 ${t.accent}20`,
                transform: isHover ? 'translateY(-4px) scale(1.02)' : 'none',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}>
              {/* 빛 반사 효과 */}
              <div style={{
                position: 'absolute', top: -80, right: -40, width: 200, height: 200,
                background: `linear-gradient(135deg, transparent 30%, ${t.accent}20 50%, transparent 70%)`,
                transform: isHover ? 'rotate(25deg) translateX(-20px)' : 'rotate(25deg)',
                transition: 'transform 0.6s ease',
              }} />
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)',
              }} />

              {/* 상단 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{t.brand}</div>
                {c.card_type && (
                  <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', padding: '3px 8px', borderRadius: 10, fontWeight: 700, border: '1px solid rgba(255,255,255,0.1)' }}>
                    {typeIcon(c.card_type)} {c.card_type}
                  </span>
                )}
              </div>

              {/* IC칩 - 글래스 */}
              <div style={{
                width: 36, height: 28, borderRadius: 6, marginTop: 12,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 100%)',
                border: '1px solid rgba(255,255,255,0.2)',
                position: 'relative', zIndex: 1,
              }} />

              {/* 카드번호 */}
              <div style={{
                fontFamily: "'Courier New', monospace", fontSize: 15, fontWeight: 600,
                letterSpacing: 2, marginTop: 10, position: 'relative', zIndex: 1,
                textShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }}>
                ••••  ••••  ••••  {(c.card_number || '').slice(-4)}
              </div>

              {/* 하단 */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                marginTop: 10, position: 'relative', zIndex: 1,
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>{c.holder_name}</div>
                  <div style={{ fontSize: 10, opacity: 0.5, marginTop: 1 }}>{fmt(c.usage)} / {fmt(c.monthly_limit)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, fontStyle: 'italic', opacity: 0.3 }}>VISA</div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: rate >= 80 ? '#fca5a5' : rate >= 50 ? '#fde68a' : '#6ee7b7' }}>{rate}%</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ────────────────────────────────────────
// 3. 다크 메탈 카드
// ────────────────────────────────────────
function DarkMetalStyle() {
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>3️⃣ 다크 메탈 카드</h2>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>어두운 메탈릭, 골드/실버 텍스트, 노이즈 텍스처의 프리미엄 블랙카드</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {sampleCards.map(c => {
          const t = getCardTheme(c.card_company)
          const rate = c.monthly_limit ? Math.round((c.usage / c.monthly_limit) * 100) : 0
          return (
            <div key={c.id} style={{ width: 260 }}>
              <div style={{
                width: 260, height: 164, borderRadius: 14, padding: '18px 20px',
                background: `linear-gradient(160deg, #1a1a2e 0%, #16213e 40%, ${t.bg2}40 100%)`,
                color: 'white', position: 'relative', overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}>
                {/* 미세 노이즈 텍스처 (CSS로 표현) */}
                <div style={{
                  position: 'absolute', inset: 0, opacity: 0.03,
                  backgroundImage: 'repeating-linear-gradient(45deg, white 0px, white 1px, transparent 1px, transparent 3px)',
                }} />
                {/* 메탈 광택 */}
                <div style={{
                  position: 'absolute', top: 0, left: '30%', width: '40%', height: '100%',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)',
                }} />
                {/* 카드사 컬러 액센트 라인 */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, width: 4, height: '100%',
                  background: `linear-gradient(180deg, ${t.bg1}, ${t.accent})`,
                }} />

                {/* 상단 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#d4af37', letterSpacing: 1 }}>{t.brand}</div>
                  {c.card_type && (
                    <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600 }}>
                      {typeIcon(c.card_type)} {c.card_type}
                    </span>
                  )}
                </div>

                {/* IC칩 - 메탈 */}
                <div style={{
                  width: 36, height: 28, borderRadius: 5, marginTop: 12,
                  background: 'linear-gradient(145deg, #c0c0c0 0%, #808080 50%, #a0a0a0 100%)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  position: 'relative', zIndex: 1,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
                }}>
                  <div style={{ position: 'absolute', top: '50%', left: '20%', right: '20%', height: 1, background: 'rgba(0,0,0,0.2)' }} />
                  <div style={{ position: 'absolute', left: '50%', top: '20%', bottom: '20%', width: 1, background: 'rgba(0,0,0,0.2)' }} />
                </div>

                {/* 카드번호 - 골드 */}
                <div style={{
                  fontFamily: "'Courier New', monospace", fontSize: 15, fontWeight: 600,
                  letterSpacing: 2.5, marginTop: 12, position: 'relative', zIndex: 1,
                  background: 'linear-gradient(135deg, #d4af37, #f5e6a3, #d4af37)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  ••••  ••••  ••••  {(c.card_number || '').slice(-4)}
                </div>

                {/* 하단 */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                  marginTop: 'auto', paddingTop: 10, position: 'relative', zIndex: 1,
                }}>
                  <div>
                    <div style={{ fontSize: 8, color: '#6b7280', letterSpacing: 1.5, textTransform: 'uppercase' }}>HOLDER</div>
                    <div style={{
                      fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#e5e7eb',
                    }}>{c.holder_name}</div>
                  </div>
                  <div style={{
                    fontSize: 16, fontWeight: 900, fontStyle: 'italic',
                    background: 'linear-gradient(135deg, #c0c0c0, #e8e8e8, #c0c0c0)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}>VISA</div>
                </div>
              </div>
              {/* 하단 사용량 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', fontSize: 11 }}>
                <span style={{ color: '#64748b' }}>사용 <strong style={{ color: '#0f172a' }}>{fmt(c.usage)}</strong></span>
                <span style={{ color: '#64748b' }}>한도 <strong>{fmt(c.monthly_limit)}</strong></span>
                <span style={{ fontWeight: 900, color: rate >= 80 ? '#ef4444' : rate >= 50 ? '#f59e0b' : '#10b981' }}>{rate}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ────────────────────────────────────────
// Main
// ────────────────────────────────────────
export default function CardStylePreview() {
  const [tab, setTab] = useState(1)
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', background: '#f8fafc', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>💳 카드 비주얼 스타일 비교</h1>
      <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>탭을 눌러 3가지 카드 디자인을 비교하세요. 실제 카드사 색상이 적용됩니다.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 24, background: '#e2e8f0', padding: 4, borderRadius: 12 }}>
        {[
          { n: 1, label: '실물카드 미니어처', icon: '🏦' },
          { n: 2, label: '프리미엄 글래스', icon: '✨' },
          { n: 3, label: '다크 메탈', icon: '🖤' },
        ].map(t => (
          <button key={t.n} onClick={() => setTab(t.n)} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            background: tab === t.n ? '#0f172a' : 'transparent',
            color: tab === t.n ? 'white' : '#64748b',
            transition: 'all 0.2s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 1 && <RealCardStyle />}
      {tab === 2 && <GlassCardStyle />}
      {tab === 3 && <DarkMetalStyle />}
    </div>
  )
}

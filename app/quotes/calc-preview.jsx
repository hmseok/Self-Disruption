'use client'
import { useState } from 'react'

const f = (n) => n?.toLocaleString('ko-KR') ?? '0'
const SAMPLE = { cat: '중형', name: '쏘나타', rate: 150000 }
const BASE = 90000 // 할인 40% 적용 후

function calcRent(days, hours) {
  const dayMul = days >= 7 ? 0.80 : days >= 5 ? 0.85 : days >= 4 ? 0.90 : 1.0
  const hourRate = hours <= 0 ? 0 : hours <= 6 ? Math.round(BASE * 0.75) : hours <= 10 ? BASE : Math.round(BASE * 1.12)
  if (days > 0 && hours > 0) return Math.round(BASE * dayMul) * days + hourRate
  if (days > 0) return Math.round(BASE * dayMul) * days
  if (hours > 0) return hourRate
  return 0
}

export default function CalcPreviewPage() {
  const [active, setActive] = useState('A')
  const designs = { A: DesignA, B: DesignB, C: DesignC, D: DesignD }
  const labels = {
    A: { title: '카드 분리형', desc: '기능별 독립 카드 + 다크 결과' },
    B: { title: '올인원 컴팩트', desc: '단일 카드 + 상단 블루 결과바' },
    C: { title: '미니멀 플랫', desc: '수평 레이블 + 그라데이션 결과' },
    D: { title: '대시보드 스타일', desc: '비율 바 + 프리셋 + 상세 테이블' },
  }
  const Panel = designs[active]
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 32 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>우측 계산 패널 디자인</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>4가지 추천 디자인 — 탭을 눌러 비교해보세요</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {Object.entries(labels).map(([key, v]) => (
            <button key={key} onClick={() => setActive(key)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: active === key ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
                cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'all 0.15s',
                background: active === key ? '#1d4ed8' : '#fff', color: active === key ? '#fff' : '#475569',
              }}>
              {key}. {v.title}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>{labels[active].desc}</p>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 12, padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14, fontWeight: 600, minHeight: 560 }}>
            ← 좌측 차량 목록 영역
          </div>
          <div style={{ width: 340, flexShrink: 0 }}>
            <Panel />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ========== A: 카드 분리형 ========== */
function DesignA() {
  const [days, setDays] = useState(2)
  const [hours, setHours] = useState(3)
  const [faultOn, setFaultOn] = useState(true)
  const [faultPct, setFaultPct] = useState(50)
  const [svcPct, setSvcPct] = useState(10)
  const [delivery, setDelivery] = useState(3)
  const rent = calcRent(days, hours)
  const faultAmt = faultOn ? Math.round(rent * faultPct / 100) : rent
  const svcAmt = faultOn && svcPct > 0 ? Math.round(rent * svcPct / 100) : 0
  const finalRent = Math.max(0, faultAmt - svcAmt)
  const total = finalRent + delivery * 10000

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 차량 정보 */}
      <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #bfdbfe' }}>
        <div style={{ width: 34, height: 34, borderRadius: 7, background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>중</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#1e40af' }}>쏘나타</div>
          <div style={{ fontSize: 11, color: '#60a5fa' }}>기본 {f(150000)}원/일 · 할인 40%</div>
        </div>
      </div>

      {/* 사용기간 */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 12, color: '#374151', marginBottom: 10 }}>사용 기간</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: '일', val: days, set: setDays, min: 0, max: 99 },
            { label: '시간', val: hours, set: setHours, min: 0, max: 23 },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 3, letterSpacing: 0.5 }}>{s.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 7, overflow: 'hidden' }}>
                <button onClick={() => s.set(Math.max(s.min, s.val - 1))} style={btnSideStyle}>−</button>
                <span style={{ flex: 1, textAlign: 'center', fontWeight: 900, fontSize: 16 }}>{s.val}</span>
                <button onClick={() => s.set(Math.min(s.max, s.val + 1))} style={btnSideStyle}>+</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 과실 */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: faultOn ? 10 : 0 }}>
          <span style={{ fontWeight: 800, fontSize: 12, color: '#374151' }}>사고 과실</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {faultOn && <span style={{ fontSize: 11, fontWeight: 800, color: '#ea580c' }}>실부담 {Math.max(0, faultPct - svcPct)}%</span>}
            <Toggle on={faultOn} onClick={() => setFaultOn(!faultOn)} />
          </div>
        </div>
        {faultOn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <PctRow label="자차과실" value={faultPct} onChange={setFaultPct} bg="#fff7ed" border="#fed7aa" color="#c2410c" btnBg="#fff7ed" />
            <PctRow label="서비스지원" value={svcPct} onChange={setSvcPct} bg="#f0fdf4" border="#bbf7d0" color="#15803d" btnBg="#f0fdf4" />
          </div>
        )}
      </div>

      {/* 탁송비 */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 12, color: '#374151', marginBottom: 8 }}>탁송비</div>
        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 7, overflow: 'hidden' }}>
          <button onClick={() => setDelivery(Math.max(0, delivery - 1))} style={btnSideStyle}>−</button>
          <span style={{ flex: 1, textAlign: 'center', fontWeight: 900, fontSize: 15 }}>{delivery}<span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 2 }}>만원</span></span>
          <button onClick={() => setDelivery(delivery + 1)} style={btnSideStyle}>+</button>
        </div>
      </div>

      {/* 결과 */}
      <ResultCard rent={rent} faultOn={faultOn} faultPct={faultPct} faultAmt={faultAmt} svcPct={svcPct} svcAmt={svcAmt} finalRent={finalRent} delivery={delivery} total={total} days={days} hours={hours} />
    </div>
  )
}

/* ========== B: 올인원 컴팩트 ========== */
function DesignB() {
  const [days, setDays] = useState(2)
  const [hours, setHours] = useState(3)
  const [faultOn, setFaultOn] = useState(true)
  const [faultPct, setFaultPct] = useState(50)
  const [svcPct, setSvcPct] = useState(10)
  const [delivery, setDelivery] = useState(3)
  const rent = calcRent(days, hours)
  const faultAmt = faultOn ? Math.round(rent * faultPct / 100) : rent
  const svcAmt = faultOn && svcPct > 0 ? Math.round(rent * svcPct / 100) : 0
  const finalRent = Math.max(0, faultAmt - svcAmt)
  const total = finalRent + delivery * 10000

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 상단 블루 결과 */}
      <div style={{ background: '#1d4ed8', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: '#93c5fd' }}>쏘나타 · {days}일 {hours}시간</div>
          <div style={{ fontSize: 11, color: '#bfdbfe', marginTop: 1 }}>할인40% · 과실 {faultOn ? `${faultPct}%` : '미적용'}</div>
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: -1 }}>{f(total)}<span style={{ fontSize: 11, color: '#93c5fd' }}>원</span></div>
      </div>

      {/* 올인원 카드 */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        {/* 기간 */}
        <div style={{ padding: 14, borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 8, letterSpacing: 0.5 }}>사용 기간</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: '일', val: days, set: setDays, max: 99 },
              { label: '시간', val: hours, set: setHours, max: 23 },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>{s.label}</div>
                <InlineStepper value={s.val} onDec={() => s.set(Math.max(0, s.val - 1))} onInc={() => s.set(Math.min(s.max, s.val + 1))} color="#1d4ed8" />
              </div>
            ))}
          </div>
        </div>

        {/* 과실 */}
        <div style={{ padding: 14, borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: faultOn ? 8 : 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5 }}>사고 과실</span>
            <button onClick={() => setFaultOn(!faultOn)}
              style={{ padding: '2px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: faultOn ? '#fff7ed' : '#f3f4f6', color: faultOn ? '#f97316' : '#9ca3af' }}>
              {faultOn ? `ON · ${Math.max(0, faultPct - svcPct)}%` : 'OFF'}
            </button>
          </div>
          {faultOn && (
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#c2410c', marginBottom: 2, fontWeight: 600 }}>자차과실</div>
                <InlineStepper value={faultPct} suffix="%" onDec={() => setFaultPct(Math.max(0, faultPct - 5))} onInc={() => setFaultPct(Math.min(100, faultPct + 5))} color="#f97316" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#15803d', marginBottom: 2, fontWeight: 600 }}>서비스지원</div>
                <InlineStepper value={svcPct} suffix="%" onDec={() => setSvcPct(Math.max(0, svcPct - 5))} onInc={() => setSvcPct(Math.min(100, svcPct + 5))} color="#16a34a" />
              </div>
            </div>
          )}
        </div>

        {/* 탁송비 */}
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5 }}>탁송비</span>
            <div style={{ width: 130 }}>
              <InlineStepper value={delivery} suffix="만" onDec={() => setDelivery(Math.max(0, delivery - 1))} onInc={() => setDelivery(delivery + 1)} color="#6b7280" />
            </div>
          </div>
        </div>
      </div>

      {/* 내역 */}
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
        <BreakdownRows rent={rent} faultOn={faultOn} faultPct={faultPct} faultAmt={faultAmt} svcPct={svcPct} svcAmt={svcAmt} finalRent={finalRent} delivery={delivery} total={total} light />
      </div>
    </div>
  )
}

/* ========== C: 미니멀 플랫 ========== */
function DesignC() {
  const [days, setDays] = useState(2)
  const [hours, setHours] = useState(3)
  const [faultOn, setFaultOn] = useState(true)
  const [faultPct, setFaultPct] = useState(50)
  const [svcPct, setSvcPct] = useState(10)
  const [delivery, setDelivery] = useState(3)
  const rent = calcRent(days, hours)
  const faultAmt = faultOn ? Math.round(rent * faultPct / 100) : rent
  const svcAmt = faultOn && svcPct > 0 ? Math.round(rent * svcPct / 100) : 0
  const finalRent = Math.max(0, faultAmt - svcAmt)
  const total = finalRent + delivery * 10000

  const Row = ({ label, children, noBorder }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: noBorder ? 'none' : '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>{label}</span>
      {children}
    </div>
  )

  const Pill = ({ value, onDec, onInc, suffix }) => (
    <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={onDec} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>−</button>
      <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{value}{suffix}</span>
      <button onClick={onInc} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '2px 16px' }}>
        <Row label="일수"><Pill value={days} onDec={() => setDays(Math.max(0, days - 1))} onInc={() => setDays(days + 1)} /></Row>
        <Row label="시간"><Pill value={hours} onDec={() => setHours(Math.max(0, hours - 1))} onInc={() => setHours(Math.min(23, hours + 1))} /></Row>
        <Row label="사고과실">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {faultOn && <span style={{ fontSize: 12, fontWeight: 800, color: '#ea580c' }}>{faultPct}%</span>}
            <button onClick={() => setFaultOn(!faultOn)}
              style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: faultOn ? '#ea580c' : '#e2e8f0', color: faultOn ? '#fff' : '#94a3b8' }}>
              {faultOn ? 'ON' : 'OFF'}
            </button>
          </div>
        </Row>
        {faultOn && (
          <>
            <Row label={<span style={{ fontSize: 12, color: '#c2410c', paddingLeft: 10 }}>↳ 자차과실</span>}><Pill value={faultPct} suffix="%" onDec={() => setFaultPct(Math.max(0, faultPct - 5))} onInc={() => setFaultPct(Math.min(100, faultPct + 5))} /></Row>
            <Row label={<span style={{ fontSize: 12, color: '#15803d', paddingLeft: 10 }}>↳ 서비스지원</span>}><Pill value={svcPct} suffix="%" onDec={() => setSvcPct(Math.max(0, svcPct - 5))} onInc={() => setSvcPct(Math.min(100, svcPct + 5))} /></Row>
          </>
        )}
        <Row label="탁송비" noBorder><Pill value={delivery} suffix="만" onDec={() => setDelivery(Math.max(0, delivery - 1))} onInc={() => setDelivery(delivery + 1)} /></Row>
      </div>

      {/* 그라데이션 결과 */}
      <div style={{ background: 'linear-gradient(135deg, #1e40af, #7c3aed)', borderRadius: 10, padding: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#c4b5fd', marginBottom: 2 }}>쏘나타 · {days}일 {hours}시간</div>
        <div style={{ fontSize: 34, fontWeight: 900, color: '#fff', letterSpacing: -1 }}>{f(total)}<span style={{ fontSize: 13, color: '#a78bfa', marginLeft: 2 }}>원</span></div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#c4b5fd' }}>렌트 {f(rent)}</span>
          {faultOn && <span style={{ fontSize: 11, color: '#fbbf24' }}>과실 {faultPct}%</span>}
          {svcAmt > 0 && <span style={{ fontSize: 11, color: '#86efac' }}>지원 -{svcPct}%</span>}
          {delivery > 0 && <span style={{ fontSize: 11, color: '#c4b5fd' }}>탁송 {delivery}만</span>}
        </div>
      </div>
    </div>
  )
}

/* ========== D: 대시보드 스타일 ========== */
function DesignD() {
  const [days, setDays] = useState(2)
  const [hours, setHours] = useState(3)
  const [faultOn, setFaultOn] = useState(true)
  const [faultPct, setFaultPct] = useState(50)
  const [svcPct, setSvcPct] = useState(10)
  const [delivery, setDelivery] = useState(3)
  const rent = calcRent(days, hours)
  const faultAmt = faultOn ? Math.round(rent * faultPct / 100) : rent
  const svcAmt = faultOn && svcPct > 0 ? Math.round(rent * svcPct / 100) : 0
  const finalRent = Math.max(0, faultAmt - svcAmt)
  const total = finalRent + delivery * 10000
  const deliveryAmt = delivery * 10000

  const presets = [
    { label: '6시간', d: 0, h: 6 }, { label: '1일', d: 1, h: 0 }, { label: '2일', d: 2, h: 0 },
    { label: '3일', d: 3, h: 0 }, { label: '7일', d: 7, h: 0 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 결과 + 비율바 */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>예상 총 비용</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', letterSpacing: -1, marginTop: 1 }}>{f(total)}<span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 2 }}>원</span></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>쏘나타</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{days}일 {hours}시간</div>
          </div>
        </div>
        {/* 비율바 */}
        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: '#f1f5f9', marginBottom: 6 }}>
          <div style={{ width: `${((faultOn ? finalRent : rent) / total) * 100}%`, background: '#3b82f6', minWidth: 3 }} />
          {deliveryAmt > 0 && <div style={{ width: `${(deliveryAmt / total) * 100}%`, background: '#a78bfa', minWidth: 3 }} />}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: '렌트', color: '#3b82f6', amt: faultOn ? finalRent : rent },
            ...(deliveryAmt > 0 ? [{ label: '탁송', color: '#a78bfa', amt: deliveryAmt }] : []),
          ].map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#64748b' }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: p.color }} /> {p.label} {f(p.amt)}
            </div>
          ))}
        </div>
      </div>

      {/* 설정 카드 */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', marginBottom: 10, letterSpacing: 0.8 }}>설정</div>

        {/* 프리셋 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>기간</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {presets.map(p => {
              const active = p.d === days && p.h === hours
              return (
                <button key={p.label} onClick={() => { setDays(p.d); setHours(p.h) }}
                  style={{ padding: '5px 10px', borderRadius: 6, border: active ? '1.5px solid #1d4ed8' : '1px solid #e2e8f0', background: active ? '#eff6ff' : '#fff', color: active ? '#1d4ed8' : '#64748b', fontWeight: active ? 800 : 600, fontSize: 11, cursor: 'pointer' }}>
                  {p.label}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: '일', val: days, set: setDays, max: 99 },
              { label: '시', val: hours, set: setHours, max: 23 },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                <button onClick={() => s.set(Math.max(0, s.val - 1))} style={{ width: 26, height: 28, border: 'none', background: '#f9fafb', cursor: 'pointer', fontWeight: 700, color: '#6b7280', fontSize: 12 }}>−</button>
                <span style={{ flex: 1, textAlign: 'center', fontWeight: 900, fontSize: 14 }}>{s.val}<span style={{ fontSize: 10, color: '#94a3b8' }}>{s.label}</span></span>
                <button onClick={() => s.set(Math.min(s.max, s.val + 1))} style={{ width: 26, height: 28, border: 'none', background: '#f9fafb', cursor: 'pointer', fontWeight: 700, color: '#6b7280', fontSize: 12 }}>+</button>
              </div>
            ))}
          </div>
        </div>

        {/* 과실 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>사고 과실</span>
            <button onClick={() => setFaultOn(!faultOn)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, background: faultOn ? '#fef3c7' : '#f1f5f9', color: faultOn ? '#d97706' : '#94a3b8' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: faultOn ? '#f59e0b' : '#cbd5e1' }} /> {faultOn ? '적용' : '미적용'}
            </button>
          </div>
          {faultOn && (
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1, background: '#fff7ed', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#c2410c', marginBottom: 3 }}>자차과실</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <button onClick={() => setFaultPct(Math.max(0, faultPct - 5))} style={miniBtn('#fdba74')}>−</button>
                  <span style={{ fontWeight: 900, fontSize: 15, color: '#c2410c', minWidth: 34 }}>{faultPct}%</span>
                  <button onClick={() => setFaultPct(Math.min(100, faultPct + 5))} style={miniBtn('#fdba74')}>+</button>
                </div>
              </div>
              <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#15803d', marginBottom: 3 }}>서비스지원</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <button onClick={() => setSvcPct(Math.max(0, svcPct - 5))} style={miniBtn('#86efac')}>−</button>
                  <span style={{ fontWeight: 900, fontSize: 15, color: '#15803d', minWidth: 34 }}>{svcPct}%</span>
                  <button onClick={() => setSvcPct(Math.min(100, svcPct + 5))} style={miniBtn('#86efac')}>+</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 탁송비 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>탁송비</span>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
            <button onClick={() => setDelivery(Math.max(0, delivery - 1))} style={{ width: 26, height: 26, border: 'none', background: '#f9fafb', cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#6b7280' }}>−</button>
            <span style={{ width: 40, textAlign: 'center', fontWeight: 900, fontSize: 13 }}>{delivery}만</span>
            <button onClick={() => setDelivery(delivery + 1)} style={{ width: 26, height: 26, border: 'none', background: '#f9fafb', cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#6b7280' }}>+</button>
          </div>
        </div>
      </div>

      {/* 상세 내역 다크 */}
      <div style={{ background: '#0f172a', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 6, letterSpacing: 0.8 }}>상세 내역</div>
        <BreakdownRows rent={rent} faultOn={faultOn} faultPct={faultPct} faultAmt={faultAmt} svcPct={svcPct} svcAmt={svcAmt} finalRent={finalRent} delivery={delivery} total={total} />
      </div>
    </div>
  )
}

/* ========== 공통 컴포넌트 ========== */
const btnSideStyle = { width: 32, height: 34, border: 'none', background: '#f9fafb', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#6b7280' }

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick}
      style={{ position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: on ? '#f97316' : '#d1d5db', transition: 'all 0.2s' }}>
      <span style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: on ? 18 : 2 }} />
    </button>
  )
}

function PctRow({ label, value, onChange, bg, border, color, btnBg }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: bg, borderRadius: 7, padding: '6px 10px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button onClick={() => onChange(Math.max(0, value - 5))}
          style={{ width: 26, height: 24, borderRadius: '5px 0 0 5px', border: `1px solid ${border}`, background: '#fff', color, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>−</button>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 24, border: `1px solid ${border}`, borderLeft: 'none', borderRight: 'none', fontWeight: 900, fontSize: 13, color, background: '#fff' }}>{value}%</span>
        <button onClick={() => onChange(Math.min(100, value + 5))}
          style={{ width: 26, height: 24, borderRadius: '0 5px 5px 0', border: `1px solid ${border}`, background: '#fff', color, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>+</button>
      </div>
    </div>
  )
}

function InlineStepper({ value, onDec, onInc, suffix = '', color = '#2563eb' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${color}18`, borderRadius: 7, overflow: 'hidden', background: '#fff' }}>
      <button onClick={onDec} style={{ width: 28, height: 30, border: 'none', background: `${color}08`, cursor: 'pointer', fontWeight: 700, fontSize: 13, color }}>−</button>
      <span style={{ flex: 1, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{value}{suffix && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 1 }}>{suffix}</span>}</span>
      <button onClick={onInc} style={{ width: 28, height: 30, border: 'none', background: `${color}08`, cursor: 'pointer', fontWeight: 700, fontSize: 13, color }}>+</button>
    </div>
  )
}

function miniBtn(bg) {
  return { width: 18, height: 18, borderRadius: 4, border: 'none', background: bg, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }
}

function ResultCard({ rent, faultOn, faultPct, faultAmt, svcPct, svcAmt, finalRent, delivery, total, days, hours }) {
  return (
    <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderRadius: 10, padding: 18 }}>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#64748b' }}>쏘나타 · {days}일 {hours}시간</div>
        <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', letterSpacing: -1, marginTop: 2 }}>{f(total)}<span style={{ fontSize: 13, color: '#64748b', marginLeft: 2 }}>원</span></div>
      </div>
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 8 }}>
        <BreakdownRows rent={rent} faultOn={faultOn} faultPct={faultPct} faultAmt={faultAmt} svcPct={svcPct} svcAmt={svcAmt} finalRent={finalRent} delivery={delivery} total={total} />
      </div>
    </div>
  )
}

function BreakdownRows({ rent, faultOn, faultPct, faultAmt, svcPct, svcAmt, finalRent, delivery, total, light }) {
  const rows = [
    { label: '렌트비', value: rent, color: light ? '#64748b' : '#94a3b8' },
    ...(faultOn ? [
      { label: `자차과실 ${faultPct}%`, value: faultAmt, color: '#fb923c' },
      ...(svcAmt > 0 ? [{ label: `서비스지원 -${svcPct}%`, value: -svcAmt, color: '#4ade80' }] : []),
      { label: '실부담금', value: finalRent, color: light ? '#0f172a' : '#fff', bold: true, sep: true },
    ] : []),
    ...(delivery > 0 ? [{ label: '탁송비', value: delivery * 10000, color: light ? '#64748b' : '#94a3b8' }] : []),
  ]
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2, ...(r.sep ? { borderTop: `1px solid ${light ? '#e2e8f0' : '#1e293b'}`, paddingTop: 4, marginTop: 2 } : {}) }}>
          <span style={{ color: r.color }}>{r.label}</span>
          <span style={{ color: r.color, fontWeight: r.bold ? 900 : 600 }}>{r.value < 0 ? '-' : ''}{f(Math.abs(r.value))}원</span>
        </div>
      ))}
    </>
  )
}

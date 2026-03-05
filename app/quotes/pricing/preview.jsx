import { useState } from "react"

// ============================================================================
// 장기렌트 견적 작성 페이지 — 리디자인 프리뷰
// 현재: 5,900줄 3단계 위자드 (원가분석 → 고객정보 → 견적서)
// 목표: 견적 관리 페이지와 통일된 디자인 시스템 적용
// ============================================================================

// 공통 스타일 상수
const COLORS = {
  primary: '#2d5fa8',
  primaryLight: '#dbeafe',
  text: '#111827',
  textSub: '#6b7280',
  border: '#e5e7eb',
  bg: '#f9fafb',
  card: '#ffffff',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#ef4444',
}

// ============================================================================
// 섹션 A: 전체 레이아웃 & 스텝 인디케이터
// ============================================================================
function PreviewLayout() {
  const [step, setStep] = useState(1)

  return (
    <div style={{ background: COLORS.bg, padding: 24, borderRadius: 16, border: `2px solid ${COLORS.primary}` }}>
      <div style={{ fontSize: 11, color: COLORS.primary, fontWeight: 700, marginBottom: 8 }}>A. 전체 레이아웃 & 스텝 인디케이터</div>

      {/* 스텝 인디케이터 — 상단 고정 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 24, background: '#fff', padding: '16px 24px', borderRadius: 12, border: `1px solid ${COLORS.border}` }}>
        {[
          { num: 1, label: '원가분석', desc: '차량 선택 · 비용 산출' },
          { num: 2, label: '고객정보', desc: '임차인 · 계약기간' },
          { num: 3, label: '견적서', desc: '미리보기 · 발송' },
        ].map((s, i) => (
          <div key={s.num} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              onClick={() => setStep(s.num)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 16px', borderRadius: 10,
                background: step === s.num ? COLORS.primary : 'transparent',
                transition: 'all 0.2s',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 13,
                background: step === s.num ? '#fff' : step > s.num ? '#dcfce7' : '#f3f4f6',
                color: step === s.num ? COLORS.primary : step > s.num ? COLORS.success : '#9ca3af',
              }}>
                {step > s.num ? '✓' : s.num}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: step === s.num ? '#fff' : COLORS.text }}>{s.label}</div>
                <div style={{ fontSize: 11, color: step === s.num ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>{s.desc}</div>
              </div>
            </div>
            {i < 2 && (
              <div style={{ width: 40, height: 2, background: step > s.num ? COLORS.success : '#e5e7eb', margin: '0 4px' }} />
            )}
          </div>
        ))}
      </div>

      {/* 2컬럼 레이아웃 미리보기 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: 20, minHeight: 200 }}>
          <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>
            좌측: 분석 섹션들 (차량선택, 취득원가, 감가, 금융, 보험...)<br />
            <span style={{ fontSize: 11 }}>접이식(Collapsible) 카드 구성</span>
          </div>
        </div>
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, minHeight: 200, position: 'sticky', top: 8 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>
            우측: 스티키 사이드바<br />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>계약설정 · 실시간 렌트료 계산</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 섹션 B: 차량 선택 패널
// ============================================================================
function PreviewVehicleSelect() {
  const [mode, setMode] = useState('registered')

  return (
    <div style={{ background: '#fff', padding: 20, borderRadius: 16, border: `2px solid ${COLORS.primary}` }}>
      <div style={{ fontSize: 11, color: COLORS.primary, fontWeight: 700, marginBottom: 12 }}>B. 차량 선택 패널</div>

      {/* 모드 토글 */}
      <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', padding: 4, borderRadius: 10, marginBottom: 16 }}>
        {[
          { id: 'registered', label: '등록 차량' },
          { id: 'newcar', label: '신차 조회' },
          { id: 'saved', label: '저장된 분석' },
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', background: mode === m.id ? '#fff' : 'transparent',
              color: mode === m.id ? COLORS.text : '#9ca3af',
              boxShadow: mode === m.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* 등록 차량 검색 */}
      {mode === 'registered' && (
        <div>
          <input
            placeholder="🔍 차량번호 또는 브랜드/모델 검색..."
            style={{ width: '100%', padding: '10px 14px', border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 14, outline: 'none', marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 10, padding: 12, background: '#f8fafc', borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
            <div style={{ width: 64, height: 64, borderRadius: 10, background: '#e5e7eb', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🚗</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.text }}>123가 4567</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>현대 그랜저 IG 2.5 프리미엄</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 11, padding: '2px 8px', background: '#dbeafe', color: '#2563eb', borderRadius: 4, fontWeight: 600 }}>2024년식</span>
                <span style={{ fontSize: 11, padding: '2px 8px', background: '#f3f4f6', color: '#6b7280', borderRadius: 4, fontWeight: 600 }}>가솔린</span>
                <span style={{ fontSize: 11, padding: '2px 8px', background: '#fef3c7', color: '#d97706', borderRadius: 4, fontWeight: 600 }}>운행중</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>출고가</div>
              <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.text }}>3,890만원</div>
            </div>
          </div>
        </div>
      )}

      {/* 신차 조회 */}
      {mode === 'newcar' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <input placeholder="브랜드 (예: 현대)" style={{ flex: 1, padding: '10px 14px', border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 14, outline: 'none' }} />
          <input placeholder="모델 (예: 그랜저)" style={{ flex: 1, padding: '10px 14px', border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 14, outline: 'none' }} />
          <button style={{ padding: '10px 20px', background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>조회</button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 섹션 C: 접이식 분석 카드 (취득원가 / 감가 / 금융 / 보험 등)
// ============================================================================
function PreviewAnalysisCards() {
  const [openSections, setOpenSections] = useState({ cost: true, dep: false, fin: false, ins: false })

  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

  const sections = [
    {
      key: 'cost', icon: '💰', title: '취득원가', summary: '출고가 3,890만 → 매입가 3,580만 → 총 취득비용 3,750만',
      color: '#2563eb',
      content: (
        <div>
          {/* 3스텝 프로세스 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {[
              { step: 'STEP 1', label: '출고가', value: '38,900,000', bg: '#dbeafe', color: '#2563eb' },
              { step: 'STEP 2', label: '매입가', value: '35,800,000', bg: '#dcfce7', color: '#16a34a' },
              { step: 'STEP 3', label: '총 취득비용', value: '37,500,000', bg: '#fef3c7', color: '#d97706' },
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, padding: 14, borderRadius: 10, background: s.bg, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: s.color, opacity: 0.7 }}>{s.step}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 2 }}>{s.label}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: s.color, marginTop: 4 }}>{s.value}원</div>
              </div>
            ))}
          </div>
          {/* 부대비용 테이블 */}
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>부대비용 상세</div>
            {[
              { label: '취득세', value: '2,506,000' },
              { label: '공채비용', value: '286,000' },
              { label: '탁송비', value: '200,000' },
              { label: '기타비용', value: '150,000' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 3 ? '1px solid #f3f4f6' : 'none', fontSize: 13 }}>
                <span style={{ color: '#6b7280' }}>{item.label}</span>
                <span style={{ fontWeight: 700, color: COLORS.text }}>{item.value}원</span>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      key: 'dep', icon: '📉', title: '감가분석', summary: '월 감가 418,000원 · 잔존가율 62.3%',
      color: '#ef4444',
      content: (
        <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>
          감가상각 곡선 프리셋 선택<br />DB기반 / 보수적 / 표준 / 낙관적 / 커스텀<br />
          <div style={{ marginTop: 12, height: 60, background: 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
            📊 감가 곡선 차트 영역
          </div>
        </div>
      )
    },
    {
      key: 'fin', icon: '🏦', title: '금융비용', summary: '월 금융비용 156,000원 · 금리 5.9%',
      color: '#2563eb',
      content: (
        <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>
          대출금액 · 금리 · 투자수익률 입력<br />캐피탈 금융상품 선택
        </div>
      )
    },
    {
      key: 'ins', icon: '🛡️', title: '보험', summary: '월 보험료 189,000원 · 26세이상 · 자기부담금 30만',
      color: '#16a34a',
      content: (
        <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>
          운전자 연령 · 자기부담금 · 자차비율 설정<br />공제조합 자동 산출
        </div>
      )
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: `2px solid ${COLORS.primary}`, borderRadius: 16, padding: 20, background: COLORS.bg }}>
      <div style={{ fontSize: 11, color: COLORS.primary, fontWeight: 700, marginBottom: 4 }}>C. 접이식 분석 카드 (좌측 영역)</div>

      {sections.map(sec => (
        <div key={sec.key} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
          {/* 헤더 (클릭으로 토글) */}
          <div
            onClick={() => toggleSection(sec.key)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px',
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{sec.icon}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>{sec.title}</span>
              {!openSections[sec.key] && (
                <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{sec.summary}</span>
              )}
            </div>
            <span style={{ color: '#9ca3af', fontSize: 12, transform: openSections[sec.key] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </div>
          {/* 콘텐츠 */}
          {openSections[sec.key] && (
            <div style={{ padding: '0 18px 18px' }}>
              {sec.content}
            </div>
          )}
        </div>
      ))}

      {/* 추가 카드들 미리보기 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { icon: '🏛️', title: '세금', summary: '월 32,000원' },
          { icon: '🔧', title: '정비', summary: '풀패키지 · 월 85,000원' },
          { icon: '💳', title: '보증금/선납금', summary: '보증금 500만 · 월 -42,000원' },
          { icon: '📊', title: '시장비교', summary: '경쟁사 2건 등록' },
        ].map((card, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>{card.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.text }}>{card.title}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{card.summary}</div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#d1d5db', fontSize: 12 }}>▼</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// 섹션 D: 스티키 사이드바 (계약설정 + 렌트료 계산)
// ============================================================================
function PreviewSidebar() {
  const [term, setTerm] = useState(36)
  const [contractType, setContractType] = useState('return')

  return (
    <div style={{ width: 360, border: `2px solid ${COLORS.primary}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ fontSize: 11, color: COLORS.primary, fontWeight: 700, padding: '12px 16px', background: COLORS.bg }}>D. 스티키 사이드바 (우측)</div>

      {/* 퀵 프리셋 */}
      <div style={{ padding: '12px 16px', background: '#fff', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 8 }}>퀵 프리셋</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
          {['최저가', '표준', '법인', '인수형'].map(p => (
            <button key={p} style={{ padding: '6px 4px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: '#6b7280', cursor: 'pointer' }}>{p}</button>
          ))}
        </div>
      </div>

      {/* 계약기간 */}
      <div style={{ padding: '12px 16px', background: '#fff', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 8 }}>계약기간</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[12, 24, 36, 48, 60].map(m => (
            <button key={m} onClick={() => setTerm(m)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                background: term === m ? COLORS.primary : '#f3f4f6',
                color: term === m ? '#fff' : '#6b7280',
              }}>
              {m}개월
            </button>
          ))}
        </div>
      </div>

      {/* 계약유형 + 마진 */}
      <div style={{ padding: '12px 16px', background: '#fff', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 8 }}>계약유형 / 마진</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {[{ id: 'return', label: '반납형' }, { id: 'buyout', label: '인수형' }].map(t => (
            <button key={t.id} onClick={() => setContractType(t.id)}
              style={{
                flex: 1, padding: '8px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                background: contractType === t.id ? COLORS.primary : '#f3f4f6',
                color: contractType === t.id ? '#fff' : '#6b7280',
              }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['10만', '15만', '20만', '30만'].map(m => (
            <button key={m} style={{ flex: 1, padding: '6px 4px', borderRadius: 6, border: `1px solid ${COLORS.border}`, background: '#fff', fontSize: 11, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>{m}</button>
          ))}
        </div>
      </div>

      {/* 선택 차량 요약 */}
      <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🚗</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>현대 그랜저 IG 2.5</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>2024년식 · 가솔린 · 출고가 3,890만</div>
          </div>
        </div>
      </div>

      {/* 렌트료 계산 결과 */}
      <div style={{ background: '#1e293b', padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>월 렌트료 계산</div>

        {/* 비용 바 차트 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {[
            { label: '감가', value: 418, color: '#ef4444', pct: 45 },
            { label: '보험', value: 189, color: '#22c55e', pct: 20 },
            { label: '금융', value: 156, color: '#3b82f6', pct: 17 },
            { label: '정비', value: 85, color: '#f59e0b', pct: 9 },
            { label: '세금', value: 32, color: '#a855f7', pct: 3 },
            { label: '마진', value: 200, color: '#fff', pct: 6 },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', width: 28, textAlign: 'right' }}>{item.label}</span>
              <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${item.pct}%`, height: '100%', background: item.color, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', width: 55, textAlign: 'right', fontWeight: 600 }}>{item.value.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* 합계 */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>월 원가합계</span>
            <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>880,000원</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>+ 마진</span>
            <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>200,000원</span>
          </div>
        </div>

        {/* 최종 렌트료 */}
        <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>월 렌트료 (VAT포함)</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fbbf24' }}>1,188,000원</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>공급가 1,080,000원 + VAT 108,000원</div>
        </div>

        {/* 수익성 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>월 수익</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#4ade80' }}>20만원</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>수익률</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#4ade80' }}>18.5%</div>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            워크시트 저장
          </button>
          <button style={{ flex: 1, padding: '10px', background: '#fbbf24', border: 'none', borderRadius: 10, color: '#1e293b', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
            견적서 작성 →
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 섹션 E: Step 2 — 고객정보 입력
// ============================================================================
function PreviewCustomerInfo() {
  const [customerMode, setCustomerMode] = useState('select')

  return (
    <div style={{ maxWidth: 640, border: `2px solid ${COLORS.primary}`, borderRadius: 16, padding: 20, background: '#fff' }}>
      <div style={{ fontSize: 11, color: COLORS.primary, fontWeight: 700, marginBottom: 12 }}>E. Step 2 — 고객정보 입력</div>

      {/* 분석 요약 상단 카드 */}
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>선택 차량</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>현대 그랜저 IG 2.5 · 36개월</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>월 렌트료</div>
          <div style={{ fontWeight: 900, fontSize: 18, color: '#fbbf24' }}>1,188,000원</div>
        </div>
      </div>

      {/* 고객 선택 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>임차인 정보</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {[{ id: 'select', label: '등록 고객' }, { id: 'manual', label: '직접 입력' }].map(m => (
            <button key={m.id} onClick={() => setCustomerMode(m.id)}
              style={{
                padding: '6px 16px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                background: customerMode === m.id ? COLORS.primary : '#f3f4f6',
                color: customerMode === m.id ? '#fff' : '#6b7280',
              }}>
              {m.label}
            </button>
          ))}
        </div>

        {customerMode === 'manual' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: '고객명 *', placeholder: '홍길동' },
              { label: '연락처', placeholder: '010-0000-0000' },
              { label: '이메일', placeholder: 'email@example.com' },
              { label: '사업자번호', placeholder: '000-00-00000' },
            ].map((field, i) => (
              <div key={i}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{field.label}</label>
                <input placeholder={field.placeholder} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13, outline: 'none' }} />
              </div>
            ))}
          </div>
        ) : (
          <select style={{ width: '100%', padding: '10px 12px', border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13 }}>
            <option>고객 선택...</option>
            <option>홍길동 (010-1234-5678)</option>
            <option>(주)ABC렌터카 (02-123-4567)</option>
          </select>
        )}
      </div>

      {/* 계약 기간 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>계약 기간</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>시작일</label>
            <input type="date" defaultValue="2025-04-01" style={{ width: '100%', padding: '8px 12px', border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>종료일 (자동)</label>
            <input type="date" defaultValue="2028-03-31" disabled style={{ width: '100%', padding: '8px 12px', border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13, background: '#f9fafb', color: '#9ca3af' }} />
          </div>
        </div>
      </div>

      {/* 특기사항 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, display: 'block', marginBottom: 8 }}>특기사항</label>
        <textarea placeholder="프로모션, 할인 조건 등..." rows={3} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical' }} />
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button style={{ padding: '10px 20px', background: '#f3f4f6', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, color: '#6b7280', cursor: 'pointer' }}>← 원가분석</button>
        <button style={{ padding: '10px 24px', background: COLORS.primary, border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer' }}>견적서 미리보기 →</button>
      </div>
    </div>
  )
}

// ============================================================================
// 섹션 F: Step 3 — 견적서 미리보기
// ============================================================================
function PreviewQuoteDoc() {
  return (
    <div style={{ maxWidth: 640, border: `2px solid ${COLORS.primary}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ fontSize: 11, color: COLORS.primary, fontWeight: 700, padding: '12px 16px', background: COLORS.bg }}>F. Step 3 — 견적서 미리보기 (인쇄용)</div>

      {/* 견적서 미리보기 */}
      <div style={{ background: '#fff', padding: 24 }}>
        {/* 헤더 */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>장기렌트 견적서</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>(주)ABC렌터카</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>견적일: 2025-03-04</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>유효기간: 30일</div>
          </div>
        </div>

        {/* 당사자 정보 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {[
            { title: '임대인 (렌터카)', items: ['(주)ABC렌터카', '대표: 김대표', '서울시 강남구'] },
            { title: '임차인 (고객)', items: ['홍길동', '010-1234-5678', 'hong@email.com'] },
          ].map((party, i) => (
            <div key={i} style={{ background: '#f9fafb', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 8 }}>{party.title}</div>
              {party.items.map((item, j) => (
                <div key={j} style={{ fontSize: 13, color: COLORS.text, marginBottom: 2, fontWeight: j === 0 ? 700 : 400 }}>{item}</div>
              ))}
            </div>
          ))}
        </div>

        {/* 월 렌트료 강조 */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 16, textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>월 렌트료 (VAT포함)</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fbbf24', marginTop: 4 }}>1,188,000원</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>공급가 1,080,000원 + VAT 108,000원</div>
        </div>

        {/* 주요 조건 테이블 */}
        <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          {[
            { label: '차량', value: '현대 그랜저 IG 2.5 프리미엄' },
            { label: '계약기간', value: '36개월 (2025.04.01 ~ 2028.03.31)' },
            { label: '계약유형', value: '반납형' },
            { label: '보증금', value: '5,000,000원' },
            { label: '약정거리', value: '연 20,000km (초과 시 km당 120원)' },
            { label: '자기부담금', value: '300,000원' },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', borderBottom: i < 5 ? `1px solid ${COLORS.border}` : 'none' }}>
              <div style={{ width: 120, padding: '10px 14px', background: '#f9fafb', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{row.label}</div>
              <div style={{ flex: 1, padding: '10px 14px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{row.value}</div>
            </div>
          ))}
        </div>

        {/* 액션 버튼 */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
          <button style={{ padding: '10px 16px', background: '#f3f4f6', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>← 고객정보</button>
          <button style={{ padding: '10px 16px', background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 10, fontWeight: 700, fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>🖨️ 인쇄</button>
          <button style={{ padding: '10px 16px', background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 10, fontWeight: 700, fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>초안 저장</button>
          <button style={{ padding: '10px 24px', background: COLORS.primary, border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 12, color: '#fff', cursor: 'pointer' }}>견적서 확정 →</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 메인 프리뷰 — 모든 섹션 조합
// ============================================================================
export default function PricingPagePreview() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: COLORS.text, marginBottom: 4 }}>장기렌트 견적 작성 — 리디자인 프리뷰</h1>
        <p style={{ fontSize: 13, color: '#9ca3af' }}>각 섹션의 디자인을 확인하시고, 수정할 부분을 알려주세요.</p>
      </div>

      <PreviewLayout />
      <PreviewVehicleSelect />
      <PreviewAnalysisCards />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PreviewSidebar />
      </div>
      <PreviewCustomerInfo />
      <PreviewQuoteDoc />
    </div>
  )
}

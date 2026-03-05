'use client'
import { useState } from 'react'

// ─────────────────────────────────────────────────
// 3가지 배치안 프리뷰
// ─────────────────────────────────────────────────

// ━━━ 옵션 A: 목록 상단 통합 ━━━
function OptionA() {
  const [tab, setTab] = useState('list')        // list | calc | quick
  const [calcOpen, setCalcOpen] = useState(false)

  return (
    <div style={{ background: '#f9fafb', minHeight: '100%', padding: 24 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: 0 }}>견적 관리</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>견적 목록, 빠른 계산, 간단 견적 작성</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ padding: '8px 16px', fontSize: 13, background: '#2d5fa8', color: '#fff', borderRadius: 10, fontWeight: 700, border: 'none' }}>
            + 장기 견적 작성
          </button>
        </div>
      </div>

      {/* 탭 전환 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        {[
          { key: 'list', label: '📋 견적 목록', desc: '전체 견적 관리' },
          { key: 'calc', label: '⚡ 빠른 계산기', desc: '단기렌트 요금 계산' },
          { key: 'quick', label: '✍️ 간단 견적', desc: '빠른 견적서 작성' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '14px 16px', border: 'none', cursor: 'pointer',
              background: tab === t.key ? '#2d5fa8' : 'transparent',
              borderRight: '1px solid #e5e7eb',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: tab === t.key ? '#fff' : '#374151' }}>{t.label}</div>
            <div style={{ fontSize: 11, color: tab === t.key ? 'rgba(255,255,255,0.7)' : '#9ca3af', marginTop: 2 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      {tab === 'list' && (
        <div>
          {/* 접이식 빠른 계산기 */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 16 }}>
            <button
              onClick={() => setCalcOpen(!calcOpen)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2d5fa8' }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>⚡ 빠른 견적 계산기</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>단기렌트 · 간단견적</span>
              </div>
              <span style={{ color: '#9ca3af', fontSize: 12, transform: calcOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>
            {calcOpen && (
              <div style={{ padding: '0 18px 18px' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button style={{ flex: 1, padding: '10px 16px', background: '#eff6ff', border: '2px solid #2d5fa8', borderRadius: 10, fontWeight: 700, fontSize: 13, color: '#2d5fa8', cursor: 'pointer' }}>
                    단기렌트 계산기
                  </button>
                  <button style={{ flex: 1, padding: '10px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, fontWeight: 700, fontSize: 13, color: '#6b7280', cursor: 'pointer' }}>
                    간단 견적 작성
                  </button>
                </div>
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                  [단기렌트 계산기 UI 영역]
                </div>
              </div>
            )}
          </div>

          {/* 필터 칩 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['전체 24', '작성중 5', '발송됨 8', '서명완료 3', '계약전환 6', '보관 2'].map((c, i) => (
              <div key={i} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: i === 0 ? '#2d5fa8' : '#fff', color: i === 0 ? '#fff' : '#6b7280',
                border: `1px solid ${i === 0 ? '#2d5fa8' : '#e5e7eb'}`, cursor: 'pointer'
              }}>
                {c}
              </div>
            ))}
          </div>

          {/* 테이블 */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['상태', '고객명', '차량', '기간', '월렌트료', '작성일'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#9ca3af' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { status: '작성중', color: '#f59e0b', name: '김철수', car: '쏘나타 DN8', period: '36개월', rent: '423,000', date: '03.04' },
                  { status: '발송됨', color: '#3b82f6', name: '이영희', car: 'G80 RG3', period: '48개월', rent: '892,000', date: '03.03' },
                  { status: '서명완료', color: '#10b981', name: '박지성', car: '카니발 KA4', period: '60개월', rent: '654,000', date: '03.01' },
                ].map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: `${r.color}20`, color: r.color }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700 }}>{r.name}</td>
                    <td style={{ padding: '12px 16px', color: '#6b7280' }}>{r.car}</td>
                    <td style={{ padding: '12px 16px', color: '#6b7280' }}>{r.period}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 700 }}>{r.rent}원</td>
                    <td style={{ padding: '12px 16px', color: '#9ca3af' }}>{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'calc' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2d5fa8' }} />
            <h2 style={{ fontWeight: 900, fontSize: 16, color: '#111827', margin: 0 }}>빠른 견적 계산기</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: '#374151', margin: '0 0 12px' }}>🚗 단기렌트 계산기</h3>
              <p style={{ fontSize: 12, color: '#9ca3af' }}>롯데 기준 할인율, 차종, 기간으로 빠른 요금 계산</p>
              <div style={{ marginTop: 16, padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
                [계산기 UI]
              </div>
            </div>
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: '#374151', margin: '0 0 12px' }}>✍️ 간단 견적 작성</h3>
              <p style={{ fontSize: 12, color: '#9ca3af' }}>고객명 · 차량 · 금액만 입력하면 바로 견적서 생성</p>
              <div style={{ marginTop: 16, padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
                [간단 견적 폼]
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'quick' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24 }}>
          <h2 style={{ fontWeight: 900, fontSize: 16, color: '#111827', margin: '0 0 16px' }}>✍️ 간단 견적 작성</h2>
          <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>필수 정보만 입력하고 바로 견적서를 발행합니다</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {['고객명 *', '연락처', '차종 *', '계약기간 *', '월 렌트료 *', '보증금'].map(f => (
              <div key={f}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>{f}</label>
                <input style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} placeholder={f.replace(' *', '')} />
              </div>
            ))}
          </div>
          <button style={{ marginTop: 20, width: '100%', padding: '12px', background: '#2d5fa8', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
            견적서 생성 →
          </button>
        </div>
      )}
    </div>
  )
}

// ━━━ 옵션 B: 사이드 패널 구조 ━━━
function OptionB() {
  const [panel, setPanel] = useState('calc') // calc | quick | null

  return (
    <div style={{ background: '#f9fafb', minHeight: '100%', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: 0 }}>견적 관리</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>견적 목록 · 빠른 도구</p>
        </div>
        <button style={{ padding: '8px 16px', fontSize: 13, background: '#2d5fa8', color: '#fff', borderRadius: 10, fontWeight: 700, border: 'none' }}>
          + 장기 견적 작성
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: panel ? '1fr 380px' : '1fr', gap: 20, transition: 'all 0.3s' }}>
        {/* 왼쪽: 목록 */}
        <div>
          {/* 필터 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['전체 24', '작성중 5', '발송됨 8', '서명완료 3'].map((c, i) => (
              <div key={i} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: i === 0 ? '#2d5fa8' : '#fff', color: i === 0 ? '#fff' : '#6b7280',
                border: `1px solid ${i === 0 ? '#2d5fa8' : '#e5e7eb'}`,
              }}>
                {c}
              </div>
            ))}
          </div>

          {/* 테이블 */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['상태', '고객명', '차량', '월렌트료', '작성일'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#9ca3af' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { status: '작성중', color: '#f59e0b', name: '김철수', car: '쏘나타', rent: '423,000', date: '03.04' },
                  { status: '발송됨', color: '#3b82f6', name: '이영희', car: 'G80', rent: '892,000', date: '03.03' },
                  { status: '서명완료', color: '#10b981', name: '박지성', car: '카니발', rent: '654,000', date: '03.01' },
                  { status: '계약전환', color: '#8b5cf6', name: '최민수', car: '그랜저', rent: '512,000', date: '02.28' },
                ].map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: `${r.color}20`, color: r.color }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13 }}>{r.name}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{r.car}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700 }}>{r.rent}원</td>
                    <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 오른쪽: 사이드 패널 */}
        {panel && (
          <div style={{ position: 'sticky', top: 16 }}>
            {/* 패널 탭 */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderRadius: '12px 12px 0 0', overflow: 'hidden', border: '1px solid #e5e7eb', borderBottom: 'none' }}>
              <button
                onClick={() => setPanel('calc')}
                style={{ flex: 1, padding: '10px 12px', border: 'none', cursor: 'pointer', background: panel === 'calc' ? '#2d5fa8' : '#fff', color: panel === 'calc' ? '#fff' : '#6b7280', fontWeight: 700, fontSize: 12 }}
              >
                ⚡ 단기 계산기
              </button>
              <button
                onClick={() => setPanel('quick')}
                style={{ flex: 1, padding: '10px 12px', border: 'none', cursor: 'pointer', background: panel === 'quick' ? '#2d5fa8' : '#fff', color: panel === 'quick' ? '#fff' : '#6b7280', fontWeight: 700, fontSize: 12 }}
              >
                ✍️ 간단 견적
              </button>
              <button
                onClick={() => setPanel(null)}
                style={{ padding: '10px 12px', border: 'none', cursor: 'pointer', background: '#fff', color: '#9ca3af', fontWeight: 700, fontSize: 14 }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0 0 12px 12px', padding: 16 }}>
              {panel === 'calc' && (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>할인율</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, position: 'relative' }}>
                        <div style={{ width: '40%', height: '100%', background: '#2d5fa8', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#2d5fa8' }}>40%</span>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>차종</label>
                    <input style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} placeholder="차종 검색..." />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>기간</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', fontSize: 14, cursor: 'pointer' }}>-</button>
                        <span style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 14 }}>1</span>
                        <button style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', fontSize: 14, cursor: 'pointer' }}>+</button>
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>일</span>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>탁송비</label>
                      <input style={{ width: '100%', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, textAlign: 'right', boxSizing: 'border-box' }} defaultValue="0" />
                    </div>
                  </div>
                  <div style={{ background: '#111827', borderRadius: 10, padding: 16, textAlign: 'center', marginTop: 12 }}>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 4px' }}>예상 요금</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0 }}>87,000<span style={{ fontSize: 13, color: '#9ca3af' }}>원</span></p>
                    <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>1일 × 쏘나타 기준</p>
                  </div>
                </div>
              )}

              {panel === 'quick' && (
                <div>
                  {['고객명', '차종', '기간', '월 렌트료'].map(f => (
                    <div key={f} style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>{f}</label>
                      <input style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} placeholder={f} />
                    </div>
                  ))}
                  <button style={{ width: '100%', padding: '10px', background: '#2d5fa8', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer', marginTop: 8 }}>
                    견적서 생성 →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ━━━ 옵션 C: 독립 페이지 + 퀵 액세스 ━━━
function OptionC() {
  return (
    <div style={{ background: '#f9fafb', minHeight: '100%', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: 0 }}>견적 관리</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>견적 목록 관리</p>
        </div>
        <button style={{ padding: '8px 16px', fontSize: 13, background: '#2d5fa8', color: '#fff', borderRadius: 10, fontWeight: 700, border: 'none' }}>
          + 장기 견적 작성
        </button>
      </div>

      {/* 퀵 액세스 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 20px', cursor: 'pointer', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⚡</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>단기렌트 계산기</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>빠른 요금 계산</div>
            </div>
            <div style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: 16 }}>→</div>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 20px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✍️</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>간단 견적 작성</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>핵심 정보만 입력</div>
            </div>
            <div style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: 16 }}>→</div>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 20px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🧮</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>장기렌트 견적</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>원가분석 · 견적서</div>
            </div>
            <div style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: 16 }}>→</div>
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['전체 24', '작성중 5', '발송됨 8', '서명완료 3', '계약전환 6', '보관 2'].map((c, i) => (
          <div key={i} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: i === 0 ? '#2d5fa8' : '#fff', color: i === 0 ? '#fff' : '#6b7280',
            border: `1px solid ${i === 0 ? '#2d5fa8' : '#e5e7eb'}`,
          }}>
            {c}
          </div>
        ))}
      </div>

      {/* 테이블 */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              {['상태', '고객명', '차량', '견적기간', '월렌트료', '작성일', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#9ca3af' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { status: '작성중', color: '#f59e0b', name: '김철수', car: '쏘나타 DN8', period: '36개월', rent: '423,000', date: '03.04' },
              { status: '발송됨', color: '#3b82f6', name: '이영희', car: 'G80 RG3', period: '48개월', rent: '892,000', date: '03.03' },
              { status: '서명완료', color: '#10b981', name: '박지성', car: '카니발 KA4', period: '60개월', rent: '654,000', date: '03.01' },
              { status: '계약전환', color: '#8b5cf6', name: '최민수', car: '그랜저 GN7', period: '36개월', rent: '512,000', date: '02.28' },
            ].map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: `${r.color}20`, color: r.color }}>{r.status}</span>
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700 }}>{r.name}</td>
                <td style={{ padding: '12px 16px', color: '#6b7280' }}>{r.car}</td>
                <td style={{ padding: '12px 16px', color: '#6b7280' }}>{r.period}</td>
                <td style={{ padding: '12px 16px', fontWeight: 700 }}>{r.rent}원</td>
                <td style={{ padding: '12px 16px', color: '#9ca3af' }}>{r.date}</td>
                <td style={{ padding: '12px 16px', color: '#9ca3af', cursor: 'pointer' }}>⋯</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ━━━ 메인: 옵션 선택기 ━━━
export default function LayoutPreview() {
  const [option, setOption] = useState('A')

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* 옵션 선택 바 */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: '#111827', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontWeight: 900, color: '#fff', fontSize: 14 }}>배치안 프리뷰</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { key: 'A', label: 'A. 목록 상단 탭 통합', desc: '탭으로 전환' },
            { key: 'B', label: 'B. 좌측 목록 + 우측 패널', desc: '사이드 패널' },
            { key: 'C', label: 'C. 퀵 액세스 카드 + 독립 페이지', desc: '바로가기' },
          ].map(o => (
            <button
              key={o.key}
              onClick={() => setOption(o.key)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: option === o.key ? '#2d5fa8' : '#374151',
                color: '#fff', fontWeight: 700, fontSize: 12, transition: 'all 0.2s',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 설명 */}
      <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        {option === 'A' && (
          <div>
            <h2 style={{ fontWeight: 900, fontSize: 16, color: '#111827', margin: '0 0 4px' }}>옵션 A: 목록 상단 탭 통합</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
              /quotes 페이지 상단에 [견적 목록 | 빠른 계산기 | 간단 견적] 탭을 배치합니다.
              목록 탭에는 접이식 빠른 계산기도 포함됩니다. 한 페이지 안에서 모든 작업 가능.
            </p>
          </div>
        )}
        {option === 'B' && (
          <div>
            <h2 style={{ fontWeight: 900, fontSize: 16, color: '#111827', margin: '0 0 4px' }}>옵션 B: 좌측 목록 + 우측 사이드 패널</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
              /quotes 페이지를 좌/우 분할합니다. 왼쪽은 견적 목록, 오른쪽에 단기 계산기/간단 견적 패널이 열립니다.
              목록을 보면서 동시에 계산/작성 가능. 패널은 닫기 가능.
            </p>
          </div>
        )}
        {option === 'C' && (
          <div>
            <h2 style={{ fontWeight: 900, fontSize: 16, color: '#111827', margin: '0 0 4px' }}>옵션 C: 퀵 액세스 카드 + 독립 페이지</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
              /quotes 목록 상단에 바로가기 카드(단기계산기 · 간단견적 · 장기견적)를 배치합니다.
              클릭하면 각각 독립 페이지로 이동합니다. 현재 구조를 유지하면서 접근성만 개선.
            </p>
          </div>
        )}
      </div>

      {/* 프리뷰 영역 */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden', minHeight: 600 }}>
          {option === 'A' && <OptionA />}
          {option === 'B' && <OptionB />}
          {option === 'C' && <OptionC />}
        </div>
      </div>
    </div>
  )
}

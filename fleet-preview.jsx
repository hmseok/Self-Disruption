import { useState } from "react"

const f = n => n?.toLocaleString() || '0'

// ── 공통 더미 데이터 ──
const CARS = [
  { id: 1, number: '125허4239', model: 'G80', brand: '제네시스', type: '자사', status: 'dispatched', customer: '김영수', insurance: '삼성화재', dispatchDate: '03.03', returnDate: '03.18', dailyRate: 95000, days: 15, billed: 1425000, paid: 1425000, rental: 0, fuel: 35000, etc: 0 },
  { id: 2, number: '142주4413', model: 'BMW 520i', brand: 'BMW', type: '빌려타', status: 'dispatched', customer: '이정민', insurance: 'DB손보', dispatchDate: '03.05', returnDate: '03.22', dailyRate: 120000, days: 17, billed: 2040000, paid: 0, rental: 1448700, fuel: 42000, etc: 15000 },
  { id: 3, number: '142주4406', model: '산타페', brand: '현대', type: '빌려타', status: 'dispatched', customer: '박성호', insurance: '현대해상', dispatchDate: '03.01', returnDate: '03.12', dailyRate: 85000, days: 11, billed: 935000, paid: 935000, rental: 950000, fuel: 28000, etc: 0 },
  { id: 4, number: '125허2050', model: '벤츠 E클래스', brand: '벤츠', type: '빌려타', status: 'available', customer: null, insurance: null, dispatchDate: null, returnDate: null, dailyRate: 150000, days: 0, billed: 0, paid: 0, rental: 1500000, fuel: 0, etc: 0 },
  { id: 5, number: '175허1237', model: 'G80', brand: '제네시스', type: '빌려타', status: 'dispatched', customer: '최원석', insurance: 'KB손보', dispatchDate: '03.08', returnDate: '03.25', dailyRate: 95000, days: 17, billed: 1615000, paid: 1200000, rental: 1502600, fuel: 38000, etc: 0 },
  { id: 6, number: '101허4216', model: '그렌저', brand: '현대', type: '자사', status: 'maintenance', customer: null, insurance: null, dispatchDate: null, returnDate: null, dailyRate: 75000, days: 0, billed: 0, paid: 0, rental: 0, fuel: 0, etc: 0 },
  { id: 7, number: '125허4228', model: '베뉴', brand: '현대', type: '자사', status: 'longterm', customer: '(주)한빛물류', contractType: '장기', monthlyRent: 850000, dispatchDate: '01.15', returnDate: '07.14', dailyRate: 0, days: 0, billed: 850000, paid: 850000, rental: 0, fuel: 0, etc: 0 },
  { id: 8, number: '125허4207', model: '투싼', brand: '현대', type: '자사', status: 'longterm', customer: '김대현', contractType: '장기', monthlyRent: 720000, dispatchDate: '02.01', returnDate: '08.01', dailyRate: 0, days: 0, billed: 720000, paid: 720000, rental: 0, fuel: 0, etc: 0 },
]

const STATUS_BADGE = {
  dispatched: { label: '운행중', bg: '#dcfce7', color: '#16a34a' },
  available: { label: '대기', bg: '#eff6ff', color: '#2563eb' },
  maintenance: { label: '정비', bg: '#fef3c7', color: '#d97706' },
  longterm: { label: '장기', bg: '#f3e8ff', color: '#7c3aed' },
}

const TYPE_BADGE = {
  '자사': { bg: '#dbeafe', color: '#1d4ed8' },
  '빌려타': { bg: '#fce7f3', color: '#be185d' },
}

// ═══════════════════════════════════════
// 안 A: 탭 기반 (배차 → 입금 → 수익)
// ═══════════════════════════════════════
function LayoutA() {
  const [tab, setTab] = useState('dispatch')
  const tabs = [
    { key: 'dispatch', label: '🚗 배차 현황', count: CARS.filter(c => c.status === 'dispatched').length },
    { key: 'billing', label: '💰 입금/청구', count: CARS.filter(c => c.billed > 0 && c.paid < c.billed).length },
    { key: 'revenue', label: '📊 월 수익' },
  ]

  return (
    <div style={{ fontFamily: '-apple-system, sans-serif' }}>
      {/* 상단 KPI */}
      <div style={{ display: 'flex', gap: 0, padding: '16px 24px', background: 'linear-gradient(135deg, #1e293b, #334155)', borderRadius: 12, marginBottom: 16 }}>
        {[
          { label: '전체', value: `${CARS.length}대`, sub: `자사 ${CARS.filter(c=>c.type==='자사').length} / 임차 ${CARS.filter(c=>c.type==='빌려타').length}`, color: '#fff' },
          { label: '운행중', value: `${CARS.filter(c=>c.status==='dispatched').length}대`, sub: '단기 4 / 장기 2', color: '#34d399' },
          { label: '당월 대차료', value: '7,585만', sub: '청구 완료', color: '#60a5fa' },
          { label: '입금 확인', value: '5,130만', sub: `${Math.round(5130/7585*100)}% 수금`, color: '#fbbf24' },
          { label: '렌탈료 지출', value: '5,401만', sub: '빌려타 4대분', color: '#f87171' },
          { label: '순수익', value: '1,834만', sub: '수익률 24%', color: '#34d399' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? '1px solid #475569' : 'none', padding: '0 8px' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 9, color: '#64748b' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            color: tab === t.key ? '#0f172a' : '#94a3b8', background: 'none',
            borderBottom: tab === t.key ? '3px solid #2d5fa8' : '3px solid transparent',
            border: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            {t.count > 0 && <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* 배차 현황 탭 */}
      {tab === 'dispatch' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 12px 12px' }}>
          {/* 필터 */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
            {['전체 8', '운행중 6', '대기 1', '정비 1'].map((f, i) => (
              <span key={i} style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: i === 0 ? '#eff6ff' : '#f8fafc', color: i === 0 ? '#2d5fa8' : '#64748b', border: i === 0 ? '1.5px solid #2d5fa8' : '1px solid #e2e8f0' }}>{f}</span>
            ))}
            <span style={{ flex: 1 }} />
            <span style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}>자사 4</span>
            <span style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, background: '#fce7f3', color: '#be185d', border: '1px solid #f9a8d4' }}>빌려타 4</span>
          </div>
          {/* 헤더 */}
          <div style={{ display: 'flex', padding: '8px 16px', fontSize: 10, fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #f0f0f0', background: '#fafbfc' }}>
            <div style={{ width: 55 }}>상태</div>
            <div style={{ width: 130 }}>차량</div>
            <div style={{ width: 55 }}>구분</div>
            <div style={{ width: 110 }}>고객 / 보험사</div>
            <div style={{ width: 130 }}>배차기간</div>
            <div style={{ width: 40, textAlign: 'right' }}>일수</div>
            <div style={{ width: 90, textAlign: 'right' }}>일 대차료</div>
            <div style={{ width: 100, textAlign: 'right' }}>청구금액</div>
            <div style={{ width: 100, textAlign: 'right' }}>입금액</div>
            <div style={{ flex: 1, textAlign: 'center' }}>입금상태</div>
          </div>
          {/* 행 */}
          {CARS.map(car => {
            const st = STATUS_BADGE[car.status] || STATUS_BADGE.available
            const tp = TYPE_BADGE[car.type]
            const paidPct = car.billed > 0 ? Math.round(car.paid / car.billed * 100) : 0
            return (
              <div key={car.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', fontSize: 12 }}
                onMouseEnter={e => e.currentTarget.style.background = '#fafbff'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <div style={{ width: 55 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.color }}>{st.label}</span>
                </div>
                <div style={{ width: 130 }}>
                  <div style={{ fontWeight: 800, fontSize: 12, color: '#111' }}>{car.number}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{car.brand} {car.model}</div>
                </div>
                <div style={{ width: 55 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: tp.bg, color: tp.color }}>{car.type}</span>
                </div>
                <div style={{ width: 110 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#374151' }}>{car.customer || '—'}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{car.insurance || car.contractType || ''}</div>
                </div>
                <div style={{ width: 130, fontSize: 11, color: '#374151' }}>
                  {car.dispatchDate ? `${car.dispatchDate} ~ ${car.returnDate}` : '—'}
                </div>
                <div style={{ width: 40, textAlign: 'right', fontWeight: 700, color: '#374151' }}>
                  {car.days > 0 ? `${car.days}일` : car.status === 'longterm' ? '월' : '—'}
                </div>
                <div style={{ width: 90, textAlign: 'right', fontWeight: 700, color: '#374151' }}>
                  {car.dailyRate > 0 ? f(car.dailyRate) : car.monthlyRent > 0 ? f(car.monthlyRent) : '—'}
                </div>
                <div style={{ width: 100, textAlign: 'right', fontWeight: 800, color: '#111' }}>
                  {car.billed > 0 ? f(car.billed) : '—'}
                </div>
                <div style={{ width: 100, textAlign: 'right', fontWeight: 700, color: car.paid > 0 ? '#16a34a' : '#d0d0d0' }}>
                  {car.paid > 0 ? f(car.paid) : '—'}
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  {car.billed > 0 ? (
                    paidPct >= 100 ? <span style={{ fontSize: 10, fontWeight: 800, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: 4 }}>완료</span>
                    : paidPct > 0 ? <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: 4 }}>부분 {paidPct}%</span>
                    : <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: 4 }}>미입금</span>
                  ) : car.status === 'dispatched' ? <span style={{ fontSize: 10, color: '#94a3b8' }}>미청구</span> : <span style={{ fontSize: 10, color: '#d0d0d0' }}>—</span>}
                </div>
              </div>
            )
          })}
          {/* 하단 합계 */}
          <div style={{ display: 'flex', padding: '10px 16px', fontSize: 12, fontWeight: 800, color: '#374151', background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
            <div style={{ width: 55 }} />
            <div style={{ width: 130 }}>합계 {CARS.length}대</div>
            <div style={{ width: 55 }} />
            <div style={{ width: 110 }} />
            <div style={{ width: 130 }} />
            <div style={{ width: 40 }} />
            <div style={{ width: 90 }} />
            <div style={{ width: 100, textAlign: 'right' }}>{f(CARS.reduce((s, c) => s + c.billed, 0))}</div>
            <div style={{ width: 100, textAlign: 'right', color: '#16a34a' }}>{f(CARS.reduce((s, c) => s + c.paid, 0))}</div>
            <div style={{ flex: 1 }} />
          </div>
        </div>
      )}

      {/* 입금/청구 탭 */}
      {tab === 'billing' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 20 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            {/* 미입금 목록 */}
            <div style={{ flex: 1, border: '1px solid #fee2e2', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', marginBottom: 10 }}>⚠️ 미입금 / 부분입금 2건</div>
              {CARS.filter(c => c.billed > 0 && c.paid < c.billed).map(car => (
                <div key={car.id} style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: 13 }}>{car.number}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{car.customer}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#dc2626' }}>미수 {f(car.billed - car.paid)}원</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>청구 {f(car.billed)} / 입금 {f(car.paid)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, background: '#2d5fa8', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>입금확인</button>
                    <button style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', fontWeight: 700, cursor: 'pointer' }}>청구서 재발송</button>
                  </div>
                </div>
              ))}
            </div>
            {/* 보험사별 현황 */}
            <div style={{ width: 280, border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#374151', marginBottom: 10 }}>보험사별 입금현황</div>
              {['삼성화재', 'DB손보', '현대해상', 'KB손보'].map((ins, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{ins}</span>
                  <span style={{ fontWeight: 700, color: i < 2 ? '#16a34a' : '#d97706' }}>{i < 2 ? '입금완료' : '대기'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 월 수익 탭 */}
      {tab === 'revenue' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 12px 12px' }}>
          <div style={{ display: 'flex', padding: '8px 16px', fontSize: 10, fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #f0f0f0', background: '#fafbfc' }}>
            <div style={{ width: 130 }}>차량</div>
            <div style={{ width: 55 }}>구분</div>
            <div style={{ width: 100, textAlign: 'right' }}>대차료 수입</div>
            <div style={{ width: 100, textAlign: 'right' }}>렌탈료 지출</div>
            <div style={{ width: 90, textAlign: 'right' }}>기타비용</div>
            <div style={{ width: 100, textAlign: 'right' }}>순수익</div>
            <div style={{ width: 50, textAlign: 'center' }}>수익률</div>
            <div style={{ width: 60, textAlign: 'center' }}>가동일</div>
            <div style={{ flex: 1, textAlign: 'center' }}>가동률</div>
          </div>
          {CARS.map(car => {
            const revenue = car.billed || car.monthlyRent || 0
            const cost = car.rental + car.fuel + car.etc
            const net = revenue - cost
            const rate = revenue > 0 ? Math.round(net / revenue * 100) : 0
            const utilization = car.days > 0 ? Math.round(car.days / 31 * 100) : car.status === 'longterm' ? 100 : 0
            return (
              <div key={car.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
                <div style={{ width: 130 }}>
                  <div style={{ fontWeight: 800, color: '#111' }}>{car.number}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{car.model}</div>
                </div>
                <div style={{ width: 55 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: TYPE_BADGE[car.type].bg, color: TYPE_BADGE[car.type].color }}>{car.type}</span>
                </div>
                <div style={{ width: 100, textAlign: 'right', fontWeight: 800, color: revenue > 0 ? '#111' : '#d0d0d0' }}>{revenue > 0 ? f(revenue) : '—'}</div>
                <div style={{ width: 100, textAlign: 'right', fontWeight: 700, color: car.rental > 0 ? '#ef4444' : '#d0d0d0' }}>{car.rental > 0 ? f(car.rental) : '—'}</div>
                <div style={{ width: 90, textAlign: 'right', color: '#64748b' }}>{(car.fuel + car.etc) > 0 ? f(car.fuel + car.etc) : '—'}</div>
                <div style={{ width: 100, textAlign: 'right', fontWeight: 900, color: net > 0 ? '#16a34a' : net < 0 ? '#dc2626' : '#d0d0d0' }}>{revenue > 0 || cost > 0 ? f(net) : '—'}</div>
                <div style={{ width: 50, textAlign: 'center' }}>
                  {revenue > 0 ? <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: rate >= 20 ? '#dcfce7' : rate >= 0 ? '#fef9c3' : '#fee2e2', color: rate >= 20 ? '#16a34a' : rate >= 0 ? '#ca8a04' : '#dc2626' }}>{rate}%</span> : <span style={{ color: '#d0d0d0', fontSize: 10 }}>—</span>}
                </div>
                <div style={{ width: 60, textAlign: 'center', fontWeight: 700, color: '#374151' }}>
                  {car.days > 0 ? `${car.days}일` : car.status === 'longterm' ? '전월' : '—'}
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  {utilization > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                      <div style={{ width: 50, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${utilization}%`, height: '100%', background: utilization >= 70 ? '#16a34a' : '#f59e0b', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{utilization}%</span>
                    </div>
                  ) : <span style={{ color: '#d0d0d0', fontSize: 10 }}>—</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// 안 B: 간트차트 스타일 타임라인
// ═══════════════════════════════════════
function LayoutB() {
  const days = Array.from({ length: 31 }, (_, i) => i + 1)
  const today = 15

  return (
    <div style={{ fontFamily: '-apple-system, sans-serif' }}>
      {/* 상단 KPI - 동일 */}
      <div style={{ display: 'flex', gap: 0, padding: '14px 20px', background: 'linear-gradient(135deg, #1e293b, #334155)', borderRadius: 12, marginBottom: 16 }}>
        {[
          { label: '운행중', value: '6대', color: '#34d399' },
          { label: '당월 수입', value: '7,585만', color: '#60a5fa' },
          { label: '순수익', value: '1,834만', color: '#34d399' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? '1px solid #475569' : 'none' }}>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* 타임라인 */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        {/* 날짜 헤더 */}
        <div style={{ display: 'flex' }}>
          <div style={{ width: 180, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', background: '#fafbfc', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
            차량 / 3월
          </div>
          <div style={{ flex: 1, display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fafbfc' }}>
            {days.map(d => (
              <div key={d} style={{
                flex: 1, textAlign: 'center', fontSize: 8, fontWeight: 600, padding: '8px 0',
                color: d === today ? '#2d5fa8' : [6,7,13,14,20,21,27,28].includes(d) ? '#dc2626' : '#94a3b8',
                background: d === today ? '#eff6ff' : 'transparent',
                borderRight: '1px solid #f0f0f0',
              }}>{d}</div>
            ))}
          </div>
        </div>

        {/* 차량별 간트바 */}
        {CARS.filter(c => c.status === 'dispatched' || c.status === 'longterm').map(car => {
          const start = parseInt(car.dispatchDate?.split('.')[1] || '0')
          const end = parseInt(car.returnDate?.split('.')[1] || '0')
          const isLong = car.status === 'longterm'
          return (
            <div key={car.id} style={{ display: 'flex', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ width: 180, padding: '8px 12px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 11, color: '#111' }}>{car.number}</div>
                  <div style={{ fontSize: 9, color: '#94a3b8' }}>{car.model} · {car.customer}</div>
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', position: 'relative', alignItems: 'center' }}>
                {days.map(d => (
                  <div key={d} style={{ flex: 1, height: 32, borderRight: '1px solid #f8f8f8', background: d === today ? '#fafbff' : 'transparent' }} />
                ))}
                {/* 간트바 */}
                <div style={{
                  position: 'absolute',
                  left: `${((isLong ? 1 : start) - 1) / 31 * 100}%`,
                  width: `${((isLong ? 31 : end) - (isLong ? 1 : start) + 1) / 31 * 100}%`,
                  height: 22, borderRadius: 4, top: 5,
                  background: isLong ? 'linear-gradient(90deg, #c4b5fd, #a78bfa)' : car.paid >= car.billed && car.billed > 0 ? 'linear-gradient(90deg, #86efac, #34d399)' : 'linear-gradient(90deg, #93c5fd, #60a5fa)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 700, color: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}>
                  {isLong ? `장기 ${f(car.monthlyRent)}/월` : car.paid >= car.billed && car.billed > 0 ? `✓ ${f(car.billed)}` : `${f(car.billed)}`}
                </div>
              </div>
            </div>
          )
        })}

        {/* 대기 차량 */}
        {CARS.filter(c => c.status === 'available' || c.status === 'maintenance').map(car => (
          <div key={car.id} style={{ display: 'flex', borderBottom: '1px solid #f5f5f5', opacity: 0.5 }}>
            <div style={{ width: 180, padding: '8px 12px', borderRight: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 800, fontSize: 11, color: '#94a3b8' }}>{car.number}</div>
              <div style={{ fontSize: 9, color: '#ccc' }}>{car.model} · {car.status === 'maintenance' ? '정비중' : '배차대기'}</div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, color: '#ccc' }}>{car.status === 'maintenance' ? '🔧 정비중' : '대기'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// 안 C: 탭 + 타임라인 통합
// ═══════════════════════════════════════
function LayoutC() {
  const [tab, setTab] = useState('timeline')

  return (
    <div style={{ fontFamily: '-apple-system, sans-serif' }}>
      {/* KPI */}
      <div style={{ display: 'flex', gap: 0, padding: '16px 24px', background: 'linear-gradient(135deg, #1e293b, #334155)', borderRadius: 12, marginBottom: 16 }}>
        {[
          { label: '전체', value: `${CARS.length}대`, sub: `운행 6 · 대기 1 · 정비 1`, color: '#fff' },
          { label: '당월 매출', value: '7,585만', color: '#60a5fa' },
          { label: '비용 (렌탈+기타)', value: '5,751만', color: '#fbbf24' },
          { label: '순수익', value: '1,834만', sub: '수익률 24%', color: '#34d399' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? '1px solid #475569' : 'none' }}>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 9, color: '#64748b' }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0' }}>
        {[
          { key: 'timeline', label: '📅 배차 타임라인' },
          { key: 'list', label: '📋 배차/입금 현황', count: 2 },
          { key: 'revenue', label: '📊 차량별 수익' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            color: tab === t.key ? '#0f172a' : '#94a3b8', background: 'none',
            borderBottom: tab === t.key ? '3px solid #2d5fa8' : '3px solid transparent',
            border: 'none', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            {t.count > 0 && <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 24 }}>
        {tab === 'timeline' && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📅</div>
            <div style={{ fontWeight: 700 }}>배차 타임라인 (간트차트)</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>안 B의 타임라인 뷰가 이 탭에 들어갑니다</div>
          </div>
        )}
        {tab === 'list' && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 700 }}>배차/입금 상세 리스트</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>안 A의 배차현황 + 입금관리가 이 탭에 통합</div>
          </div>
        )}
        {tab === 'revenue' && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>
            <div style={{ fontWeight: 700 }}>차량별 월 수익 분석</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>안 A의 수익 탭이 이 탭에 들어갑니다</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// 메인: 3개 안 비교
// ═══════════════════════════════════════
export default function FleetPreview() {
  const [view, setView] = useState('A')

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: '-apple-system, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>차량 운영관리 페이지 구조안</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        사고대차(단기) + 장기렌트 + 자사/빌려타 전체 차량 통합 운영 페이지
      </p>

      {/* 안 선택 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'A', label: '안 A: 탭 기반', desc: '배차→입금→수익 순차 탭' },
          { key: 'B', label: '안 B: 간트 타임라인', desc: '달력 기반 시각화' },
          { key: 'C', label: '안 C: 탭+타임라인 통합', desc: 'A+B 결합형' },
        ].map(v => (
          <button key={v.key} onClick={() => setView(v.key)} style={{
            flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
            border: view === v.key ? '2px solid #2d5fa8' : '1px solid #e2e8f0',
            background: view === v.key ? '#eff6ff' : '#fff',
            textAlign: 'left',
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: view === v.key ? '#2d5fa8' : '#374151' }}>{v.label}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{v.desc}</div>
          </button>
        ))}
      </div>

      {/* 프리뷰 */}
      {view === 'A' && <LayoutA />}
      {view === 'B' && <LayoutB />}
      {view === 'C' && <LayoutC />}
    </div>
  )
}

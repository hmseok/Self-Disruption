import { useState } from "react"

const f = n => n?.toLocaleString() || '0'

// ── 더미 데이터 ──
const CASES = [
  { id: 1, stage: 'customer_contacted', car: '125허4239', model: 'G80', type: '자사', customer: '김영수', phone: '010-1234-5678', insurance: '삼성화재', claimNo: 'S2026-0312', faultType: '피해', faultRatio: 0, accidentDate: '03.10', requestDate: '03.10', location: '서울 강남구', status: '고객통화', dailyRate: 95000, billingStatus: 'none', memo: '잔디 자동접수 · 상대보험 삼성화재 · 수리 예상 7일' },
  { id: 2, stage: 'dispatched', car: '142주4413', model: 'BMW 520i', type: '빌려타', customer: '이정민', phone: '010-9876-5432', insurance: 'DB손보', claimNo: 'D2026-0842', faultType: '자차', faultRatio: 100, accidentDate: '03.05', requestDate: '03.05', dispatchDate: '03.05', returnDate: '03.22', location: '경기 분당', status: '배차완료', dailyRate: 120000, days: 17, billedAmt: 2040000, billingStatus: 'billed', memo: '벤츠 E클래스 → BMW 520i 대체배차' },
  { id: 3, stage: 'in_repair', car: '142주4406', model: '산타페', type: '빌려타', customer: '박성호', phone: '010-5555-1234', insurance: '현대해상', claimNo: 'H2026-1123', faultType: '피해', faultRatio: 0, accidentDate: '03.01', requestDate: '03.01', dispatchDate: '03.01', returnDate: '03.12', location: '서울 송파구', status: '공장입고', dailyRate: 85000, days: 11, billedAmt: 935000, paidAmt: 935000, billingStatus: 'paid', repairShop: '오토랜드', repairEnd: '03.15', memo: '범퍼+펜더 교체 · 수리비 120만원' },
  { id: 4, stage: 'billing', car: '175허1237', model: 'G80', type: '빌려타', customer: '최원석', phone: '010-7777-8888', insurance: 'KB손보', claimNo: 'K2026-0456', faultType: '가해', faultRatio: 70, accidentDate: '03.08', requestDate: '03.08', dispatchDate: '03.08', returnDate: '03.25', location: '인천 연수구', status: '청구', dailyRate: 95000, days: 17, billedAmt: 1615000, paidAmt: 1200000, billingStatus: 'partial', memo: '과실 70% · 고객부담 415,000원 미수' },
  { id: 5, stage: 'closed', car: '101허4216', model: '그렌저', type: '자사', customer: '장민수', phone: '010-3333-4444', insurance: '메리츠', claimNo: 'M2026-0789', faultType: '피해', faultRatio: 0, accidentDate: '02.20', requestDate: '02.20', dispatchDate: '02.20', returnDate: '03.05', location: '서울 마포구', status: '종결', dailyRate: 75000, days: 14, billedAmt: 1050000, paidAmt: 1050000, billingStatus: 'paid', memo: '정상 종결' },
]

const LONGTERM = [
  { id: 101, car: '125허4228', model: '베뉴', customer: '(주)한빛물류', type: '장기', monthlyRent: 850000, start: '01.15', end: '07.14', paid: true },
  { id: 102, car: '125허4207', model: '투싼', customer: '김대현', type: '장기', monthlyRent: 720000, start: '02.01', end: '08.01', paid: true },
]

const AVAILABLE_CARS = [
  { car: '125허2050', model: '벤츠 E클래스', type: '빌려타', rental: 1500000, daysIdle: 3 },
]

const STAGE_COLORS = {
  accident_reported: '#ef4444', replacement_requested: '#f97316', customer_contacted: '#eab308',
  dispatch_preparing: '#84cc16', dispatched: '#22c55e', in_transit_delivery: '#14b8a6',
  in_repair: '#06b6d4', repair_done: '#3b82f6', returning: '#6366f1',
  car_returned: '#8b5cf6', maintenance: '#a855f7', standby: '#d946ef',
  billing: '#ec4899', payment_confirmed: '#10b981', closed: '#6b7280',
}

const STAGE_LABEL = {
  accident_reported: '🚨 사고접수', replacement_requested: '📋 대차요청', customer_contacted: '📞 고객통화',
  dispatch_preparing: '🔧 배차준비', dispatched: '🚗 배차완료', in_transit_delivery: '🚛 탁송',
  in_repair: '🏭 공장입고', repair_done: '✅ 공장출고', returning: '🔄 회수',
  car_returned: '🏠 복귀', maintenance: '🧹 세차정비', standby: '⏸️ 대기',
  billing: '💰 청구', payment_confirmed: '✅ 입금확인', closed: '📁 종결',
}

const FAULT_BADGE = { '피해': { bg: '#dbeafe', color: '#1d4ed8' }, '가해': { bg: '#fee2e2', color: '#dc2626' }, '자차': { bg: '#fef3c7', color: '#d97706' } }
const TYPE_BADGE = { '자사': { bg: '#dbeafe', color: '#1d4ed8' }, '빌려타': { bg: '#fce7f3', color: '#be185d' }, '장기': { bg: '#f3e8ff', color: '#7c3aed' } }
const BILLING_BADGE = { none: { label: '미청구', bg: '#f1f5f9', color: '#64748b' }, pending: { label: '청구대기', bg: '#fef9c3', color: '#ca8a04' }, billed: { label: '청구완료', bg: '#dbeafe', color: '#2563eb' }, approved: { label: '승인', bg: '#dcfce7', color: '#16a34a' }, paid: { label: '입금완료', bg: '#dcfce7', color: '#16a34a' }, partial: { label: '부분입금', bg: '#fed7aa', color: '#ea580c' }, denied: { label: '거부', bg: '#fee2e2', color: '#dc2626' } }

export default function FleetOpsPreview() {
  const [tab, setTab] = useState('intake')
  const [expandedCase, setExpandedCase] = useState(null)

  const tabs = [
    { key: 'intake', label: '📞 접수/상담', count: 1, desc: '잔디 자동접수 · 고객상담 · 예약' },
    { key: 'timeline', label: '📅 배차 타임라인', count: 0, desc: '간트차트 · 차량 스케줄' },
    { key: 'dispatch', label: '🚗 배차/운행', count: 4, desc: '현재 운행현황 · 출고/반납' },
    { key: 'billing', label: '💰 보험청구/입금', count: 2, desc: '보험사 청구 · 입금확인 · 미수' },
    { key: 'revenue', label: '📊 월 수익', count: 0, desc: '차량별 수익분석 · 가동률' },
  ]

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: 24, fontFamily: '-apple-system, sans-serif' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>차량운영 &gt; 통합관리</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: '4px 0 0' }}>차량 운영관리</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', minWidth: 100, textAlign: 'center' }}>2026년 3월</span>
          <button style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>›</button>
        </div>
      </div>

      {/* ═══ 상단 KPI ═══ */}
      <div style={{ display: 'flex', gap: 0, padding: '16px 20px', background: 'linear-gradient(135deg, #1e293b, #334155)', borderRadius: 14, marginBottom: 16, alignItems: 'center' }}>
        {[
          { label: '전체', value: '12대', sub: '자사5 · 빌려타4 · 장기3', color: '#fff' },
          { label: '운행중', value: '4대', sub: '단기4 · 장기2', color: '#34d399' },
          { label: '접수대기', value: '1건', sub: '잔디 자동접수', color: '#fbbf24' },
          { label: '당월 청구', value: '5,640만', sub: '보험사 4건', color: '#60a5fa' },
          { label: '입금확인', value: '3,185만', sub: '수금률 56%', color: '#fbbf24' },
          { label: '렌탈료', value: '5,401만', sub: '빌려타 4대', color: '#f87171' },
          { label: '순수익', value: '1,834만', sub: '수익률 24%', color: '#34d399' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? '1px solid #475569' : 'none', padding: '0 6px' }}>
            <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ═══ 탭 네비게이션 ═══ */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            color: tab === t.key ? '#0f172a' : '#94a3b8', background: 'none',
            borderBottom: tab === t.key ? '3px solid #2d5fa8' : '3px solid transparent',
            border: 'none', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {t.label}
            {t.count > 0 && <span style={{ fontSize: 9, background: tab === t.key ? '#fee2e2' : '#f1f5f9', color: tab === t.key ? '#dc2626' : '#94a3b8', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ═══ 탭 1: 접수/상담 ═══ */}
      {tab === 'intake' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 14px 14px' }}>
          <div style={{ display: 'flex', gap: 16, padding: 20 }}>
            {/* 좌: 신규 접수 목록 */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                신규 접수 / 상담
                <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>1건 대기</span>
              </div>

              {/* 잔디 자동접수 건 */}
              <div style={{ border: '2px solid #fbbf24', borderRadius: 10, padding: 14, marginBottom: 12, background: '#fffbeb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#d97706' }}>🔔 잔디 자동접수</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, ...FAULT_BADGE['피해'] }}>피해대차</span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>3분 전</span>
                  </div>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>접수번호 S2026-0312</span>
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 2 }}>고객</div>
                    <div style={{ fontWeight: 800 }}>김영수 <span style={{ fontWeight: 400, color: '#64748b' }}>010-1234-5678</span></div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 2 }}>보험사</div>
                    <div style={{ fontWeight: 700 }}>삼성화재</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 2 }}>사고일시</div>
                    <div style={{ fontWeight: 700 }}>03.10 14:30</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 2 }}>사고장소</div>
                    <div style={{ fontWeight: 700 }}>서울 강남구 삼성동</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 2 }}>파손부위</div>
                    <div style={{ fontWeight: 700 }}>앞범퍼 + 좌측 펜더</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#374151', marginTop: 8, padding: '6px 10px', background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                  💬 상담메모: "삼성화재 접수완료, 수리 예상 7일, 차량 필요 — 내일 오전 배차 요청"
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 12, fontWeight: 800, background: '#2d5fa8', color: '#fff', border: 'none', cursor: 'pointer' }}>🚗 배차 진행</button>
                  <button style={{ flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#fff', color: '#374151', border: '1px solid #e2e8f0', cursor: 'pointer' }}>📞 고객 통화</button>
                  <button style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#fff', color: '#374151', border: '1px solid #e2e8f0', cursor: 'pointer' }}>📝 메모</button>
                </div>
              </div>

              {/* 상담 이력 */}
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 20, marginBottom: 10 }}>최근 상담 이력</div>
              {[
                { time: '10:30', customer: '이정민', type: '📞 전화', content: 'DB손보 접수번호 확인 요청 → 안내 완료', handler: '김직원' },
                { time: '09:15', customer: '박성호', type: '💬 잔디', content: '현대해상 수리완료 예정일 03.15 → 반납일정 조율 필요', handler: '자동' },
                { time: '어제', customer: '최원석', type: '📞 전화', content: 'KB손보 부분입금 확인, 고객부담금 415,000원 청구 안내', handler: '박직원' },
              ].map((log, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 40 }}>{log.time}</span>
                  <span style={{ fontWeight: 700, minWidth: 50, color: '#374151' }}>{log.customer}</span>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>{log.type}</span>
                  <span style={{ flex: 1, color: '#374151' }}>{log.content}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{log.handler}</span>
                </div>
              ))}
            </div>

            {/* 우: 빠른 예약/배차 */}
            <div style={{ width: 300, flexShrink: 0 }}>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>⚡ 빠른 예약</div>
                {[
                  { label: '고객명', ph: '김영수' },
                  { label: '연락처', ph: '010-0000-0000' },
                  { label: '보험사', ph: '삼성화재' },
                  { label: '접수번호', ph: 'S2026-0000' },
                  { label: '사고유형', ph: '피해 / 가해 / 자차' },
                  { label: '배차일', ph: '2026-03-16' },
                  { label: '배차장소', ph: '서울 강남구' },
                ].map((field, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{field.label}</div>
                    <input placeholder={field.ph} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                <button style={{ width: '100%', padding: '8px', borderRadius: 6, fontSize: 12, fontWeight: 800, background: '#2d5fa8', color: '#fff', border: 'none', cursor: 'pointer', marginTop: 6 }}>예약 등록 + 배차 시작</button>
              </div>

              {/* 배차 가능 차량 */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>🟢 배차 가능 차량</div>
                {AVAILABLE_CARS.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 12 }}>{c.car}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.model} · <span style={{ color: TYPE_BADGE[c.type]?.color }}>{c.type}</span></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>대기 {c.daysIdle}일</div>
                      {c.rental > 0 && <div style={{ fontSize: 9, color: '#dc2626' }}>렌탈 {f(c.rental)}/월</div>}
                    </div>
                  </div>
                ))}
                <div style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ fontWeight: 800, fontSize: 12 }}>101허4216 <span style={{ fontSize: 10, color: '#d97706' }}>🔧 정비중 (03.18 완료예정)</span></div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>그렌저 · <span style={{ color: '#1d4ed8' }}>자사</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 탭 2: 배차 타임라인 ═══ */}
      {tab === 'timeline' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
          {/* 날짜 헤더 */}
          <div style={{ display: 'flex' }}>
            <div style={{ width: 200, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', background: '#fafbfc', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>차량 / 3월</div>
            <div style={{ flex: 1, display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fafbfc' }}>
              {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                <div key={d} style={{ flex: 1, textAlign: 'center', fontSize: 7, fontWeight: 600, padding: '8px 0', color: d === 15 ? '#2d5fa8' : [1,2,8,9,15,16,22,23,29,30].includes(d) ? '#dc2626' : '#b0b0b0', background: d === 15 ? '#eff6ff' : 'transparent', borderRight: '1px solid #f5f5f5' }}>{d}</div>
              ))}
            </div>
          </div>
          {/* 단기대차 차량 */}
          {CASES.filter(c => c.dispatchDate).map(c => {
            const start = parseInt(c.dispatchDate?.split('.')[1] || '0')
            const end = parseInt(c.returnDate?.split('.')[1] || '31')
            const bb = BILLING_BADGE[c.billingStatus] || BILLING_BADGE.none
            const fb = FAULT_BADGE[c.faultType]
            return (
              <div key={c.id} style={{ display: 'flex', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ width: 200, padding: '6px 12px', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 11, color: '#111', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {c.car}
                      <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: fb.bg, color: fb.color }}>{c.faultType}</span>
                    </div>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>{c.model} · {c.customer} · {c.insurance}</div>
                  </div>
                  <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: bb.bg, color: bb.color }}>{bb.label}</span>
                </div>
                <div style={{ flex: 1, display: 'flex', position: 'relative', alignItems: 'center' }}>
                  {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                    <div key={d} style={{ flex: 1, height: 30, borderRight: '1px solid #fafafa', background: d === 15 ? '#fafbff' : 'transparent' }} />
                  ))}
                  <div style={{
                    position: 'absolute', left: `${(start - 1) / 31 * 100}%`, width: `${(end - start + 1) / 31 * 100}%`,
                    height: 20, borderRadius: 4, top: 5,
                    background: c.billingStatus === 'paid' ? 'linear-gradient(90deg, #86efac, #34d399)' : c.billingStatus === 'partial' ? 'linear-gradient(90deg, #fde68a, #fbbf24)' : 'linear-gradient(90deg, #93c5fd, #60a5fa)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff',
                  }}>
                    {c.days}일 · {f(c.billedAmt || 0)}
                  </div>
                </div>
              </div>
            )
          })}
          {/* 장기렌트 */}
          {LONGTERM.map(c => (
            <div key={c.id} style={{ display: 'flex', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ width: 200, padding: '6px 12px', borderRight: '1px solid #e5e7eb' }}>
                <div style={{ fontWeight: 800, fontSize: 11, color: '#111', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {c.car}
                  <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#f3e8ff', color: '#7c3aed' }}>장기</span>
                </div>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>{c.model} · {c.customer}</div>
              </div>
              <div style={{ flex: 1, display: 'flex', position: 'relative', alignItems: 'center' }}>
                {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                  <div key={d} style={{ flex: 1, height: 30, borderRight: '1px solid #fafafa' }} />
                ))}
                <div style={{ position: 'absolute', left: 0, width: '100%', height: 20, borderRadius: 4, top: 5, background: 'linear-gradient(90deg, #c4b5fd, #a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>
                  장기 · {f(c.monthlyRent)}/월
                </div>
              </div>
            </div>
          ))}
          {/* 대기 차량 */}
          {AVAILABLE_CARS.map((c, i) => (
            <div key={i} style={{ display: 'flex', borderBottom: '1px solid #f5f5f5', opacity: 0.4 }}>
              <div style={{ width: 200, padding: '6px 12px', borderRight: '1px solid #e5e7eb' }}>
                <div style={{ fontWeight: 800, fontSize: 11, color: '#94a3b8' }}>{c.car}</div>
                <div style={{ fontSize: 9, color: '#ccc' }}>{c.model} · 배차대기 {c.daysIdle}일</div>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, color: '#ccc' }}>대기</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ 탭 3: 배차/운행 ═══ */}
      {tab === 'dispatch' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 14px 14px' }}>
          {/* 워크플로우 미니 현황 */}
          <div style={{ display: 'flex', gap: 0, padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#fafbfc', overflowX: 'auto' }}>
            {['접수 1', '상담 1', '배차 1', '탁송 0', '수리 1', '회수 0', '청구 1', '입금 0', '종결 1'].map((s, i) => {
              const [label, count] = s.split(' ')
              return (
                <div key={i} style={{ flex: 1, textAlign: 'center', padding: '4px 8px', fontSize: 10, fontWeight: 700, color: parseInt(count) > 0 ? '#0f172a' : '#d0d0d0', minWidth: 60 }}>
                  <div>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: parseInt(count) > 0 ? '#2d5fa8' : '#e5e7eb' }}>{count}</div>
                </div>
              )
            })}
          </div>
          {/* 헤더 */}
          <div style={{ display: 'flex', padding: '8px 16px', fontSize: 10, fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ width: 80 }}>단계</div>
            <div style={{ width: 130 }}>차량</div>
            <div style={{ width: 55 }}>유형</div>
            <div style={{ width: 130 }}>고객 / 보험사</div>
            <div style={{ width: 120 }}>기간</div>
            <div style={{ width: 90, textAlign: 'right' }}>일 대차료</div>
            <div style={{ width: 90, textAlign: 'right' }}>청구</div>
            <div style={{ flex: 1, textAlign: 'center' }}>상태</div>
          </div>
          {CASES.map(c => {
            const fb = FAULT_BADGE[c.faultType]
            const bb = BILLING_BADGE[c.billingStatus] || BILLING_BADGE.none
            const sc = STAGE_COLORS[c.stage] || '#94a3b8'
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', fontSize: 12 }}
                onClick={() => setExpandedCase(expandedCase === c.id ? null : c.id)}
                onMouseEnter={e => e.currentTarget.style.background = '#fafbff'}
                onMouseLeave={e => e.currentTarget.style.background = expandedCase === c.id ? '#f8faff' : '#fff'}>
                <div style={{ width: 80 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: sc + '20', color: sc }}>{c.status}</span>
                </div>
                <div style={{ width: 130 }}>
                  <div style={{ fontWeight: 800, fontSize: 12, color: '#111' }}>{c.car}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.model}</div>
                </div>
                <div style={{ width: 55 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, ...fb }}>{c.faultType}</span>
                </div>
                <div style={{ width: 130 }}>
                  <div style={{ fontWeight: 700, color: '#374151' }}>{c.customer}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.insurance} · {c.claimNo}</div>
                </div>
                <div style={{ width: 120, fontSize: 11, color: '#374151' }}>
                  {c.dispatchDate ? `${c.dispatchDate} ~ ${c.returnDate}` : `요청 ${c.requestDate}`}
                </div>
                <div style={{ width: 90, textAlign: 'right', fontWeight: 700, color: '#374151' }}>{f(c.dailyRate)}</div>
                <div style={{ width: 90, textAlign: 'right', fontWeight: 800, color: '#111' }}>{c.billedAmt ? f(c.billedAmt) : '—'}</div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: bb.bg, color: bb.color }}>{bb.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ 탭 4: 보험청구/입금 ═══ */}
      {tab === 'billing' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 14px 14px', padding: 20 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            {/* 좌: 청구/입금 리스트 */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {['전체 5', '미청구 1', '청구완료 1', '부분입금 1', '입금완료 2'].map((label, i) => (
                  <span key={i} style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: i === 0 ? '#eff6ff' : '#f8fafc', color: i === 0 ? '#2d5fa8' : '#64748b', border: i === 0 ? '1.5px solid #2d5fa8' : '1px solid #e2e8f0' }}>{label}</span>
                ))}
              </div>
              {/* 헤더 */}
              <div style={{ display: 'flex', padding: '8px 0', fontSize: 10, fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ width: 120 }}>차량</div>
                <div style={{ width: 100 }}>보험사</div>
                <div style={{ width: 80 }}>과실</div>
                <div style={{ width: 50, textAlign: 'right' }}>일수</div>
                <div style={{ width: 90, textAlign: 'right' }}>청구액</div>
                <div style={{ width: 90, textAlign: 'right' }}>입금액</div>
                <div style={{ width: 90, textAlign: 'right' }}>미수</div>
                <div style={{ flex: 1, textAlign: 'center' }}>상태</div>
                <div style={{ width: 80 }}>액션</div>
              </div>
              {CASES.filter(c => c.billedAmt || c.stage === 'customer_contacted').map(c => {
                const bb = BILLING_BADGE[c.billingStatus]
                const unpaid = (c.billedAmt || 0) - (c.paidAmt || 0)
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
                    <div style={{ width: 120 }}>
                      <div style={{ fontWeight: 800, fontSize: 11 }}>{c.car}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.customer}</div>
                    </div>
                    <div style={{ width: 100, fontWeight: 600 }}>{c.insurance}</div>
                    <div style={{ width: 80 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, ...FAULT_BADGE[c.faultType] }}>{c.faultType} {c.faultRatio > 0 ? c.faultRatio + '%' : ''}</span>
                    </div>
                    <div style={{ width: 50, textAlign: 'right', fontWeight: 700 }}>{c.days || '—'}</div>
                    <div style={{ width: 90, textAlign: 'right', fontWeight: 800 }}>{c.billedAmt ? f(c.billedAmt) : '—'}</div>
                    <div style={{ width: 90, textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{c.paidAmt ? f(c.paidAmt) : '—'}</div>
                    <div style={{ width: 90, textAlign: 'right', fontWeight: 800, color: unpaid > 0 ? '#dc2626' : '#d0d0d0' }}>{unpaid > 0 ? f(unpaid) : '—'}</div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: bb.bg, color: bb.color }}>{bb.label}</span>
                    </div>
                    <div style={{ width: 80 }}>
                      {c.billingStatus === 'none' && <button style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, background: '#2d5fa8', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>청구서 발송</button>}
                      {(c.billingStatus === 'billed' || c.billingStatus === 'partial') && <button style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>입금확인</button>}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* 우: 보험사별 요약 */}
            <div style={{ width: 260, flexShrink: 0 }}>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#374151', marginBottom: 10 }}>보험사별 현황</div>
                {[
                  { name: '삼성화재', billed: 1425000, paid: 1425000, cases: 1 },
                  { name: 'DB손보', billed: 2040000, paid: 0, cases: 1 },
                  { name: '현대해상', billed: 935000, paid: 935000, cases: 1 },
                  { name: 'KB손보', billed: 1615000, paid: 1200000, cases: 1 },
                  { name: '메리츠', billed: 1050000, paid: 1050000, cases: 1 },
                ].map((ins, i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                      <span>{ins.name}</span>
                      <span style={{ color: ins.paid >= ins.billed ? '#16a34a' : '#d97706' }}>{ins.paid >= ins.billed ? '완료' : `미수 ${f(ins.billed - ins.paid)}`}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>청구 {f(ins.billed)} · 입금 {f(ins.paid)} · {ins.cases}건</div>
                  </div>
                ))}
                <div style={{ marginTop: 10, padding: '8px 0', borderTop: '2px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800 }}>
                  <span>합계</span>
                  <span>미수 {f(2040000 + 415000)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 탭 5: 월 수익 ═══ */}
      {tab === 'revenue' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 14px 14px' }}>
          <div style={{ display: 'flex', padding: '8px 16px', fontSize: 10, fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #e5e7eb', background: '#fafbfc' }}>
            <div style={{ width: 130 }}>차량</div>
            <div style={{ width: 50 }}>구분</div>
            <div style={{ width: 90, textAlign: 'right' }}>대차료 수입</div>
            <div style={{ width: 90, textAlign: 'right' }}>렌탈료</div>
            <div style={{ width: 80, textAlign: 'right' }}>기타비용</div>
            <div style={{ width: 100, textAlign: 'right' }}>순수익</div>
            <div style={{ width: 50, textAlign: 'center' }}>수익률</div>
            <div style={{ width: 50, textAlign: 'center' }}>가동일</div>
            <div style={{ flex: 1, textAlign: 'center' }}>가동률</div>
          </div>
          {[...CASES.filter(c => c.billedAmt), ...LONGTERM.map(l => ({ ...l, billedAmt: l.monthlyRent, rental: 0, fuel: 0, etc: 0, days: 31, faultType: '장기' }))].map((c, i) => {
            const rev = c.billedAmt || c.monthlyRent || 0
            const cost = (c.rental || 0) + (c.fuel || 0) + (c.etc || 0)
            const net = rev - cost
            const rate = rev > 0 ? Math.round(net / rev * 100) : 0
            const util = c.days > 0 ? Math.round((c.days || 0) / 31 * 100) : 0
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
                <div style={{ width: 130 }}>
                  <div style={{ fontWeight: 800, color: '#111' }}>{c.car}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.model} · {c.customer}</div>
                </div>
                <div style={{ width: 50 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: TYPE_BADGE[c.type]?.bg || '#f3e8ff', color: TYPE_BADGE[c.type]?.color || '#7c3aed' }}>{c.type}</span>
                </div>
                <div style={{ width: 90, textAlign: 'right', fontWeight: 800 }}>{f(rev)}</div>
                <div style={{ width: 90, textAlign: 'right', fontWeight: 700, color: c.rental > 0 ? '#ef4444' : '#d0d0d0' }}>{c.rental > 0 ? f(c.rental) : '—'}</div>
                <div style={{ width: 80, textAlign: 'right', color: '#64748b' }}>{(c.fuel || 0) + (c.etc || 0) > 0 ? f((c.fuel || 0) + (c.etc || 0)) : '—'}</div>
                <div style={{ width: 100, textAlign: 'right', fontWeight: 900, color: net > 0 ? '#16a34a' : '#dc2626' }}>{f(net)}</div>
                <div style={{ width: 50, textAlign: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: rate >= 20 ? '#dcfce7' : rate >= 0 ? '#fef9c3' : '#fee2e2', color: rate >= 20 ? '#16a34a' : rate >= 0 ? '#ca8a04' : '#dc2626' }}>{rate}%</span>
                </div>
                <div style={{ width: 50, textAlign: 'center', fontWeight: 700 }}>{c.days || 0}일</div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                    <div style={{ width: 50, height: 5, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${util}%`, height: '100%', background: util >= 70 ? '#16a34a' : '#f59e0b', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>{util}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

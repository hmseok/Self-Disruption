'use client'

import { useRef } from 'react'
import { usePricing } from './PricingContext'
import { f, fDate, parseNum, safeNum, formatWonCompact, MAINT_PACKAGE_LABELS, MAINT_PACKAGE_DESC } from '@/lib/quote-utils'
import { DEFAULT_INSURANCE_COVERAGE, DEFAULT_QUOTE_NOTICES, DEFAULT_CALC_PARAMS } from '@/lib/contract-terms'
import { CostBar, Section, InputRow, ResultRow } from './components'

/**
 * CustomerStep — 고객정보 입력
 * RentPricingBuilder에서 분리된 Step 4 컴포넌트
 */
export function CustomerStep() {
  const ctx = usePricing()
  const {
    wizardStep, setWizardStep,
    selectedCar, calculations,
    customers, selectedCustomerId, setSelectedCustomerId,
    customerMode, setCustomerMode,
    manualCustomer, setManualCustomer,
    startDate, setStartDate,
    quoteNote, setQuoteNote,
    termMonths,
    deposit, contractType,
  } = ctx

    return (
      <div className="max-w-[800px] mx-auto py-8 px-4">
        {/* 스텝 인디케이터 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 24, background: 'rgba(255,255,255,0.72)', padding: '16px 24px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
          {[
            { key: 'vehicle' as const,  label: '차량선택', desc: '브랜드 · 모델 · 트림', num: 1, done: true },
            { key: 'options' as const,   label: '차량옵션', desc: '색상 · 패키지',        num: 2, done: true },
            { key: 'analysis' as const,  label: '상세견적', desc: '계약조건 · 렌트가',    num: 3, done: true },
            { key: 'customer' as const,  label: '고객정보', desc: '임차인 · 계약기간',    num: 4, done: false },
            { key: 'preview' as const,   label: '견적서',   desc: '미리보기 · 발송',      num: 5, done: false },
          ].map((s, i) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                onClick={() => { if (s.key !== 'customer' && s.key !== 'preview') setWizardStep(s.key) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: s.done ? 'pointer' : 'default',
                  padding: '8px 16px', borderRadius: 10,
                  background: s.key === 'customer' ? 'rgba(59,130,246,0.9)' : 'transparent',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 13,
                  background: s.key === 'customer' ? '#fff' : s.done ? '#dcfce7' : 'rgba(0,0,0,0.04)',
                  color: s.key === 'customer' ? 'rgba(59,130,246,0.9)' : s.done ? '#16a34a' : '#9ca3af',
                }}>
                  {s.done ? '✓' : s.num}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: s.key === 'customer' ? '#fff' : '#111827' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: s.key === 'customer' ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>{s.desc}</div>
                </div>
              </div>
              {i < 4 && <div style={{ width: 24, height: 2, background: s.done ? '#16a34a' : 'rgba(0,0,0,0.06)', margin: '0 2px' }} />}
            </div>
          ))}
        </div>

        {/* 분석 요약 */}
        {selectedCar && calc && (
          <div className="bg-steel-900 text-white rounded-2xl p-5 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 text-xs">분석 차량</p>
                <p className="font-black text-lg">{selectedCar.brand} {selectedCar.model}</p>
                <p className="text-slate-500 text-sm">{selectedCar.trim || ''} · {selectedCar.year}년식</p>
              </div>
              <div className="text-right">
                <p className="text-slate-500 text-xs">산출 렌트가 (VAT 포함)</p>
                <p className="text-2xl font-black text-yellow-400">{f(calc.rentWithVAT)}원<span className="text-sm text-slate-500">/월</span></p>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold mt-1 inline-block
                  ${contractType === 'return' ? 'bg-steel-600/30 text-steel-300' : 'bg-amber-500/30 text-amber-300'}`}>
                  {contractType === 'return' ? '반납형' : '인수형'} · {termMonths}개월
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 고객 선택 */}
        <div className="rounded-2xl border border-black/[0.06] p-6 mb-4" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-600 text-sm">고객 정보</h3>
            <div className="flex gap-1.5">
              <button onClick={() => setCustomerMode('select')}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition-colors
                  ${customerMode === 'select' ? 'bg-steel-600 text-white' : 'bg-gray-100 text-slate-500 hover:bg-gray-100'}`}>
                등록 고객
              </button>
              <button onClick={() => setCustomerMode('manual')}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition-colors
                  ${customerMode === 'manual' ? 'bg-steel-600 text-white' : 'bg-gray-100 text-slate-500 hover:bg-gray-100'}`}>
                직접 입력
              </button>
            </div>
          </div>

          {customerMode === 'select' ? (
            <>
              <select className="w-full p-3 border border-black/[0.06] rounded-xl font-bold text-base focus:border-steel-500 outline-none mb-3"
                value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
                <option value="">고객을 선택하세요</option>
                {customers.map((cust: any) => (
                  <option key={cust.id} value={cust.id}>{cust.name} ({cust.type}) - {cust.phone}</option>
                ))}
              </select>
              {quoteSelectedCustomer && (
                <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">이름</span><span className="font-bold">{quoteSelectedCustomer.name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">연락처</span><span className="font-bold">{quoteSelectedCustomer.phone}</span></div>
                  {quoteSelectedCustomer.email && <div className="flex justify-between"><span className="text-slate-500">이메일</span><span className="font-bold">{quoteSelectedCustomer.email}</span></div>}
                  {quoteSelectedCustomer.business_number && <div className="flex justify-between"><span className="text-slate-500">사업자번호</span><span className="font-bold">{quoteSelectedCustomer.business_number}</span></div>}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">고객 등록 전에도 견적서를 작성할 수 있습니다.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">고객명 *</label>
                  <input type="text" placeholder="홍길동 / (주)ABC" value={manualCustomer.name}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-black/[0.06] rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">연락처</label>
                  <input type="tel" placeholder="010-0000-0000" value={manualCustomer.phone}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full border border-black/[0.06] rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">이메일</label>
                  <input type="email" placeholder="email@example.com" value={manualCustomer.email}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-black/[0.06] rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">사업자번호</label>
                  <input type="text" placeholder="000-00-00000" value={manualCustomer.business_number}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, business_number: e.target.value }))}
                    className="w-full border border-black/[0.06] rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 계약 시작일 */}
        <div className="rounded-2xl border border-black/[0.06] p-6 mb-4" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
          <h3 className="font-bold text-slate-600 text-sm mb-3">계약 기간</h3>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">시작일</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="border border-black/[0.06] rounded-lg px-3 py-2 font-bold text-sm focus:border-steel-500 outline-none" />
            </div>
            <span className="text-slate-400 mt-5">&rarr;</span>
            <div>
              <label className="text-xs text-slate-500 block mb-1">종료일 (자동)</label>
              <div className="border border-black/5 bg-gray-50 rounded-lg px-3 py-2 font-bold text-sm text-slate-400">{fDate(quoteEndDate)}</div>
            </div>
            <div className="mt-5 text-sm text-slate-500 font-bold">{termMonths}개월</div>
          </div>
        </div>

        {/* 비고 */}
        <div className="rounded-2xl border border-black/[0.06] p-6 mb-6" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
          <h3 className="font-bold text-slate-600 text-sm mb-3">비고 (선택)</h3>
          <textarea placeholder="견적서에 표시할 특이사항, 프로모션 안내 등..." value={quoteNote}
            onChange={(e) => setQuoteNote(e.target.value)}
            className="w-full border border-black/[0.06] rounded-xl p-3 text-sm h-20 resize-none focus:border-steel-500 outline-none" />
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button onClick={() => setWizardStep('analysis')}
            className="flex-1 py-3 text-center border border-black/[0.06] rounded-xl font-bold text-slate-500 hover:bg-gray-50">
            &larr; 원가분석으로
          </button>
          <button
            onClick={() => {
              if (customerMode === 'select' && !selectedCustomerId) return alert('고객을 선택해주세요.')
              if (customerMode === 'manual' && !manualCustomer.name.trim()) return alert('고객명을 입력해주세요.')
              setWizardStep('preview')
            }}
            className="flex-[2] py-3 bg-steel-900 text-white rounded-xl font-black hover:bg-steel-800 transition-colors">
            견적서 미리보기 &rarr;
          </button>
        </div>
      </div>
    )
}

/**
 * PreviewStep — 견적서 미리보기 + 저장
 * RentPricingBuilder에서 분리된 Step 5 컴포넌트
 */
export function PreviewStep() {
  const ctx = usePricing()
  const {
    wizardStep, setWizardStep,
    selectedCar, calculations,
    customers, selectedCustomerId,
    manualCustomer,
    startDate, quoteNote,
    termMonths, deposit, contractType,
    quoteSaving,
    handleSaveQuote,
    linkedInsurance, linkedFinance,
    termsConfig,
    rules,
    factoryPrice, purchasePrice,
    loanAmount, loanRate,
    monthlyInsuranceCost, monthlyMaintenance,
    maintPackage, driverAgeGroup,
    annualMileage, excessMileageRate,
    margin, riskRate,
    prepayment,
    residualRate, buyoutPremium,
    totalAcquisitionCost,
    printRef,
    editingQuoteId,
    quoteCompany,
    effectiveCompanyId,
  } = ctx

    return (
      <div className="min-h-screen py-6 px-4 quote-print-wrapper" style={{ background: '#f9fafb' }}>
        {/* 스텝 인디케이터 */}
        <div className="max-w-[800px] mx-auto print:hidden" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, background: '#fff', padding: '16px 24px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
          {[
            { key: 'vehicle' as const,  label: '차량선택', desc: '브랜드 · 모델 · 트림', num: 1, done: true },
            { key: 'options' as const,   label: '차량옵션', desc: '색상 · 패키지',        num: 2, done: true },
            { key: 'analysis' as const,  label: '상세견적', desc: '계약조건 · 렌트가',    num: 3, done: true },
            { key: 'customer' as const,  label: '고객정보', desc: '임차인 · 계약기간',    num: 4, done: true },
            { key: 'preview' as const,   label: '견적서',   desc: '미리보기 · 발송',      num: 5, done: false },
          ].map((s, i) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                onClick={() => { if (s.key !== 'preview') setWizardStep(s.key) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: s.done ? 'pointer' : 'default',
                  padding: '8px 16px', borderRadius: 10,
                  background: s.key === 'preview' ? 'rgba(59,130,246,0.9)' : 'transparent',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 13,
                  background: s.key === 'preview' ? '#fff' : s.done ? '#dcfce7' : 'rgba(0,0,0,0.04)',
                  color: s.key === 'preview' ? 'rgba(59,130,246,0.9)' : s.done ? '#16a34a' : '#9ca3af',
                }}>
                  {s.done ? '✓' : s.num}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: s.key === 'preview' ? '#fff' : '#111827' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: s.key === 'preview' ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>{s.desc}</div>
                </div>
              </div>
              {i < 4 && <div style={{ width: 24, height: 2, background: s.done ? '#16a34a' : 'rgba(0,0,0,0.06)', margin: '0 2px' }} />}
            </div>
          ))}
        </div>
        </div>

        {/* 상단 액션 바 */}
        <div className="max-w-[800px] mx-auto mb-4 flex justify-between items-center print:hidden">
          <button onClick={() => setWizardStep('customer')} className="text-sm text-slate-500 hover:text-slate-600 font-bold">
            &larr; 고객정보로 돌아가기
          </button>
          <div className="flex gap-2">
            <button onClick={() => window.print()}
              className="px-4 py-2 border border-white/10 rounded-xl text-sm font-bold text-slate-400 hover:bg-white">인쇄</button>
            <button onClick={() => handleSaveQuote('draft')} disabled={quoteSaving}
              className="px-4 py-2 border border-white/10 rounded-xl text-sm font-bold text-slate-400 hover:bg-white disabled:opacity-50">
              {quoteSaving ? '저장중...' : '임시저장'}</button>
            <button onClick={() => handleSaveQuote('active')} disabled={quoteSaving}
              className="px-5 py-2 bg-steel-900 text-white rounded-xl text-sm font-black hover:bg-steel-800 disabled:opacity-50">
              {quoteSaving ? '저장중...' : '견적서 확정'}</button>
          </div>
        </div>

        {/* 견적서 본문 */}
        <div ref={printRef} className="max-w-[800px] mx-auto bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:rounded-none quote-print-area">

          {/* ========== PAGE 1: 핵심 정보 ========== */}
          <div className="quote-page-1">
            {/* 헤더 */}
            <div className="bg-steel-900 text-white px-6 py-4 print:px-5 print:py-3 quote-header-bg">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-black tracking-tight print:text-xl">장기렌트 견적서</h1>
                  <p className="text-slate-500 text-xs mt-0.5">LONG-TERM RENTAL QUOTATION</p>
                </div>
                <div className="text-right text-sm">
                  <span className="text-slate-500 text-xs">견적일 </span>
                  <span className="font-bold">{fDate(new Date().toISOString())}</span>
                  <span className="text-slate-500 mx-2">|</span>
                  <span className="text-yellow-400 text-xs font-bold">유효기간 30일</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 space-y-3 print:px-5 print:py-3 print:space-y-2">
              {/* 1. 임대인 / 임차인 — 컴팩트 2컬럼 */}
              <div className="grid grid-cols-2 gap-4 quote-section">
                <div>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">임대인</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-0.5">
                    <p className="font-black text-sm">{quoteCompany?.name || company?.name || '당사'}</p>
                    {(quoteCompany?.business_number || company?.business_number) && <p className="text-slate-500">사업자번호: {quoteCompany?.business_number || company?.business_number}</p>}
                    {(quoteCompany?.address || company?.address) && <p className="text-slate-500">{quoteCompany?.address || company?.address}</p>}
                    {(quoteCompany?.phone || company?.phone) && <p className="text-slate-500">TEL: {quoteCompany?.phone || company?.phone}</p>}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">임차인</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-0.5">
                    <p className="font-black text-sm">{quoteSelectedCustomer?.name || '-'}</p>
                    {quoteSelectedCustomer?.business_number && <p className="text-slate-500">사업자번호: {quoteSelectedCustomer.business_number}</p>}
                    {quoteSelectedCustomer?.phone && <p className="text-slate-500">연락처: {quoteSelectedCustomer.phone}</p>}
                    {quoteSelectedCustomer?.email && <p className="text-slate-500">{quoteSelectedCustomer.email}</p>}
                  </div>
                </div>
              </div>

              {/* 2. 차량 정보 — 컴팩트 */}
              <div className="quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">차량 정보</p>
                <div className="border border-black/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-24">차종</td>
                        <td className="px-3 py-1.5 font-black">{car.brand} {car.model}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-24">트림</td>
                        <td className="px-3 py-1.5 font-bold">{car.trim || '-'}</td>
                      </tr>
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">연식</td>
                        <td className="px-3 py-1.5">{car.year}년</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">연료</td>
                        <td className="px-3 py-1.5">{car.fuel || '-'}</td>
                      </tr>
                      <tr>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">차량가격</td>
                        <td className="px-3 py-1.5 font-bold">{f(factoryPrice)}원</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">차량번호</td>
                        <td className="px-3 py-1.5">{car.number || '(출고 전)'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. 계약 조건 — 컴팩트 */}
              <div className="quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">계약 조건</p>
                <div className="border border-black/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-24">계약유형</td>
                        <td className="px-3 py-1.5 font-black">{contractType === 'buyout' ? '인수형 장기렌트' : '반납형 장기렌트'}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-24">계약기간</td>
                        <td className="px-3 py-1.5 font-bold">{termMonths}개월</td>
                      </tr>
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">시작일</td>
                        <td className="px-3 py-1.5">{fDate(startDate)}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">종료일</td>
                        <td className="px-3 py-1.5">{fDate(quoteEndDate)}</td>
                      </tr>
                      <tr>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">약정주행</td>
                        <td className="px-3 py-1.5">연 {f(annualMileage * 10000)}km (총 {f(quoteTotalMileage)}km)</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">정비상품</td>
                        <td className="px-3 py-1.5">{MAINT_PACKAGE_LABELS[maintPackage] || maintPackage}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. 월 렌탈료 — 핵심 강조 */}
              <div className="border-2 border-steel-900 rounded-lg overflow-hidden quote-rental-highlight">
                <div className="bg-steel-900 text-white px-4 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-slate-500">월 렌탈료 (VAT 포함)</p>
                    <p className="text-2xl font-black tracking-tight">{f(calc.rentWithVAT)}<span className="text-sm ml-0.5">원</span></p>
                  </div>
                  <div className="text-right text-[10px] text-slate-500 space-y-0.5">
                    <p>공급가 {f(calc.suggestedRent)}원</p>
                    <p>부가세 {f(rentVAT)}원</p>
                  </div>
                </div>
                <div className="border border-black/[0.06] rounded-b-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    {deposit > 0 && (
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-28">보증금</td>
                        <td className="px-3 py-1.5 font-bold text-slate-700">{f(deposit)}원 <span className="text-[10px] text-slate-500">(계약 시 1회)</span></td>
                      </tr>
                    )}
                    {prepayment > 0 && (
                      <tr className="border-b border-black/5">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">선납금</td>
                        <td className="px-3 py-1.5 font-bold text-slate-700">{f(prepayment)}원 <span className="text-[10px] text-slate-500">(계약 시 1회)</span></td>
                      </tr>
                    )}
                    {contractType === 'buyout' && (
                      <tr className="border-b border-black/5 bg-amber-50">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600">인수가격 (만기)</td>
                        <td className="px-3 py-1.5 font-black text-amber-700">{f(calc.buyoutPrice)}원</td>
                      </tr>
                    )}
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">약정주행</td>
                      <td className="px-3 py-1.5">연 {f(annualMileage * 10000)}km · 초과 시 <span className="font-bold text-red-500">km당 {f(quoteExcessRate)}원</span></td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">자차 면책금</td>
                      <td className="px-3 py-1.5">사고 시 <span className="font-bold">{f(deductible)}원</span>{deductible === 0 && <span className="text-green-500 text-xs ml-1 font-bold">완전면책</span>}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="px-3 py-1.5 text-[10px] text-slate-500">
                        렌탈료 포함: 자동차보험(종합) · 자동차세 · 취득세 · 등록비{maintPackage !== 'self' ? ` · ${MAINT_PACKAGE_LABELS[maintPackage] || '정비'}` : ''}
                      </td>
                    </tr>
                  </tbody></table>
                </div>
              </div>

              {/* 4-1. 보험 보장항목 상세 */}
              <div className="quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">자동차보험 보장내역</p>
                <div className="border border-black/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-black/5 bg-gray-50">
                      <td className="px-3 py-1 font-bold text-slate-500 w-36">보장항목</td>
                      <td className="px-3 py-1 font-bold text-slate-500">보장내용</td>
                    </tr>
                    {(termsConfig?.insurance_coverage || DEFAULT_INSURANCE_COVERAGE).map((item: any, idx: number) => (
                      <tr key={idx} className={idx < (termsConfig?.insurance_coverage || DEFAULT_INSURANCE_COVERAGE).length - 1 ? 'border-b border-black/5' : ''}>
                        <td className="px-3 py-1.5 font-bold text-slate-600">{item.label}</td>
                        <td className="px-3 py-1.5 text-slate-400">
                          {item.description
                            .replace(/\{deductible\}/g, f(deductible))
                          }
                          {item.description.includes('{deductible}') && deductible === 0 && (
                            <span className="text-green-600 font-bold ml-1">(완전면책)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
                <p className="text-[8px] text-slate-500 mt-1">※ {termsConfig?.calc_params?.insurance_note || '렌터카 공제조합 가입 · 보험기간: 계약기간 동안 연단위 자동갱신 · 보험료 렌탈료 포함'}</p>
              </div>

              {/* (주요 약정 → 렌탈료 카드로 통합됨) */}
            </div>
          </div>

          {/* ========== PAGE 2: 상세 안내 + 서명 ========== */}
          <div className="quote-page-2 print:flex print:flex-col" style={{ minHeight: 'auto' }}>
            {/* 상단 콘텐츠 */}
            <div className="px-6 py-4 space-y-3 print:px-5 print:py-3 print:space-y-2 print:flex-1">

              {/* 6. 상세 약정 조건 */}
              <div className="quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">상세 약정 조건</p>
                <div className="border border-black/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500 w-28">약정 주행거리</td>
                      <td className="px-3 py-1.5">연간 {f(annualMileage * 10000)}km (계약기간 총 {f(quoteTotalMileage)}km)</td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">초과주행 요금</td>
                      <td className="px-3 py-1.5"><span className="font-bold text-red-500">km당 {f(quoteExcessRate)}원</span><span className="text-slate-500 text-[10px] ml-1">(계약 종료 시점 정산)</span></td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">자차 면책금</td>
                      <td className="px-3 py-1.5">사고 시 자기부담금 <span className="font-bold">{f(deductible)}원</span>{deductible === 0 && <span className="text-green-500 text-[10px] ml-1 font-bold">완전면책</span>}</td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">중도해지</td>
                      <td className="px-3 py-1.5">
                        {(() => {
                          // 기간별 차등 위약금율 (약관 DB)
                          const periodRates = termsConfig?.calc_params?.early_termination_rates_by_period
                          if (periodRates && Array.isArray(periodRates)) {
                            const matched = periodRates.find((r: any) => termMonths >= r.months_from && termMonths <= r.months_to)
                            const rate = matched?.rate || termsConfig?.calc_params?.early_termination_rate || 35
                            return <>잔여 렌탈료의 <span className="font-bold text-red-500">{rate}%</span> 위약금 발생</>
                          }
                          return <>잔여 렌탈료의 <span className="font-bold text-red-500">{termsConfig?.calc_params?.early_termination_rate || 35}%</span> 위약금 발생</>
                        })()}
                      </td>
                    </tr>
                    <tr>
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-slate-500">반납 조건</td>
                      <td className="px-3 py-1.5 text-slate-400">{contractType === 'buyout' ? '만기 시 인수 또는 반납 선택 가능' : '만기 시 차량 반납 (차량 상태 평가 후 보증금 정산)'}</td>
                    </tr>
                  </tbody></table>
                </div>
              </div>

              {/* 6-1. 렌탈료 포함 서비스 안내 */}
              <div className="quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">렌탈료 포함 서비스</p>
                <div className="border border-black/[0.06] rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-black/5">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700 w-28">자동차보험</td>
                      <td className="px-3 py-1 text-blue-600">종합 (대인II·대물1억·자손·무보험차·자차)</td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">세금</td>
                      <td className="px-3 py-1 text-blue-600">자동차세·취득세 렌탈료 포함</td>
                    </tr>
                    <tr className="border-b border-black/5">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">등록비용</td>
                      <td className="px-3 py-1 text-blue-600">번호판·인지세·공채·등록대행</td>
                    </tr>
                    <tr>
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">{maintPackage !== 'self' ? MAINT_PACKAGE_LABELS[maintPackage] || '정비' : '정기검사'}</td>
                      <td className="px-3 py-1 text-blue-600">{maintPackage !== 'self' ? (MAINT_PACKAGE_DESC[maintPackage] || '정비 포함') : '자동차 정기검사(종합검사) 포함'}</td>
                    </tr>
                  </tbody></table>
                </div>
              </div>

              {/* 7. 인수 안내 (인수형만) */}
              {contractType === 'buyout' && (
                <div className="quote-section">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">인수 안내</p>
                  <div className="border border-amber-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs"><tbody>
                      <tr className="border-b border-amber-100">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600 w-28">인수가격</td>
                        <td className="px-3 py-1.5 font-black text-amber-700 text-sm">{f(calc.buyoutPrice)}원 <span className="text-[10px] font-normal text-slate-500">(VAT 별도)</span></td>
                      </tr>
                      <tr className="border-b border-amber-100">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600">추가 비용</td>
                        <td className="px-3 py-1.5 text-slate-600">취득세 + 이전등록비 별도 (임차인 부담)</td>
                      </tr>
                      <tr>
                        <td colSpan={2} className="px-3 py-1 text-[10px] text-amber-600 bg-amber-50/50">
                          * 만기 시 상기 가격으로 소유권 이전 가능 · 인수 미희망 시 반납 가능
                        </td>
                      </tr>
                    </tbody></table>
                  </div>
                </div>
              )}

              {/* 8. 비고 */}
              {quoteNote && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-yellow-700 mb-0.5">비고</p>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{quoteNote}</p>
                </div>
              )}

              {/* 9. 유의사항 */}
              <div className="border-t border-black/[0.06] pt-3 quote-section">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">유의사항 및 특약</p>
                <div className="text-[10px] text-slate-500 space-y-1 quote-notices">
                  {(termsConfig?.quote_notices || DEFAULT_QUOTE_NOTICES).map((item: any, idx: number) => {
                    // Handle conditional items (e.g., show only for buyout)
                    if (item.condition === 'buyout' && contractType !== 'buyout') {
                      return null
                    }

                    // Replace placeholders with actual values
                    let text = item.text || item
                    if (typeof text === 'string') {
                      text = text
                        .replace(/\{deductible\}/g, f(deductible))
                        .replace(/\{excessRate\}/g, f(quoteExcessRate))
                        .replace(/\{earlyTerminationRate\}/g, (termsConfig?.calc_params?.early_termination_rate || 35).toString())
                    }

                    return <p key={idx}>{idx + 1}. {text}</p>
                  })}
                </div>
              </div>
            </div>

            {/* 서명란 + 푸터 — 마지막 페이지 하단 고정 */}
            <div className="print:mt-auto">
              <div className="px-6 print:px-5">
                <div className="grid grid-cols-2 gap-8 pt-6 pb-4 quote-signature">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 mb-10">임대인 (서명/인)</p>
                    <div className="border-t border-white/10 pt-2">
                      <p className="text-xs font-bold text-slate-600">{quoteCompany?.name || company?.name || '당사'}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 mb-10">임차인 (서명/인)</p>
                    <div className="border-t border-white/10 pt-2">
                      <p className="text-xs font-bold text-slate-600">{quoteSelectedCustomer?.name || '고객명'}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-6 py-2 border-t border-black/[0.06] text-center">
                <p className="text-[9px] text-slate-500">
                  본 견적서는 {quoteCompany?.name || company?.name || '당사'}에서 발행한 공식 견적서입니다. 문의: {quoteCompany?.phone || company?.phone || '-'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 하단 액션 */}
        <div className="max-w-[800px] mx-auto mt-4 flex gap-3 print:hidden">
          <button onClick={() => setWizardStep('customer')}
            className="flex-1 py-3 border border-black/[0.06] rounded-xl font-bold text-slate-500 hover:bg-white">&larr; 수정</button>
          <button onClick={() => window.print()}
            className="flex-1 py-3 border border-black/[0.06] rounded-xl font-bold text-slate-400 hover:bg-white">인쇄 / PDF</button>
          <button onClick={() => handleSaveQuote('draft')} disabled={quoteSaving}
            className="flex-1 py-3 bg-steel-600 text-white rounded-xl font-bold hover:bg-steel-700 disabled:opacity-50">임시저장</button>
          <button onClick={() => handleSaveQuote('active')} disabled={quoteSaving}
            className="flex-[2] py-3 bg-steel-900 text-white rounded-xl font-black hover:bg-steel-800 disabled:opacity-50">
            {quoteSaving ? '저장 중...' : '견적서 확정'}</button>
        </div>
      </div>
    )
}

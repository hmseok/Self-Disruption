'use client'

import { useEffect, useState } from 'react'
import { fetchPricingStandardsData, updatePricingStandardsRow, getAuthHeader } from '@/app/utils/pricing-standards'
import EvidenceDrawer, { type EvidenceContext } from './EvidenceDrawer'

interface BusinessRule {
  id: string
  key: string
  value: any
  description: string
  updated_at: string
}

interface RuleCategory { name: string; icon: string; keys: string[]; explanation: string }

const RULE_CATEGORIES: RuleCategory[] = [
  { name: '감가 설정', icon: '📉', keys: ['DEP_YEAR_1', 'DEP_YEAR_2PLUS', 'DEP_MILEAGE_10K', 'DEFAULT_RESIDUAL_RATE_RETURN', 'DEFAULT_RESIDUAL_RATE_BUYOUT'],
    explanation: '차량 잔존가치 산출에 사용되는 감가율 파라미터입니다. 1년차/2년차 감가율, 주행거리 보정치, 반납/인수형 기본 잔존가치율을 관리합니다.' },
  { name: '금융 설정', icon: '🏦', keys: ['LOAN_INTEREST_RATE', 'LOAN_LTV_DEFAULT', 'INVESTMENT_RETURN_RATE'],
    explanation: '차량 구매 자금의 대출 이자율, 담보인정비율(LTV), 자체자금 운용 시 기회비용(투자수익률)을 설정합니다.' },
  { name: '운영 설정', icon: '🔧', keys: ['INSURANCE_LOADING', 'OWN_DAMAGE_RATIO', 'MONTHLY_MAINTENANCE_BASE', 'CAR_TAX_RATE', 'CAR_TAX_TYPE'],
    explanation: '보험료 로딩율, 자차 면책 비율, 기본 월정비비, 자동차세 기본 세율(영업용), 자동차세 유형을 관리합니다.' },
  { name: '리스크/할인', icon: '🛡️', keys: ['DEDUCTIBLE_AMOUNT', 'RISK_RESERVE_RATE', 'DEPOSIT_DISCOUNT_RATE', 'PREPAYMENT_DISCOUNT_RATE', 'DEFAULT_DEPOSIT'],
    explanation: '자차 면책금, 리스크 적립율(사고·수리 대비), 보증금 할인율, 선납 할인율, 기본 보증금을 관리합니다.' },
  // 등록비는 registration_cost_table(등록비용 탭)에서 직접 관리 → 여기서 중복 제거
  { name: '기타', icon: '⚙️', keys: ['DEFAULT_MARGIN_RATE', 'OVERHEAD_RATE', 'VAT_RATE', 'DEFAULT_TERM_MONTHS'],
    explanation: '마진율, 관리비율(인건비·사무실·시스템 등), 부가세율(10%), 기본 계약기간(월)을 관리합니다.' },
]

// 각 KEY에 대한 상세 설명 (사용자 검수용)
const KEY_DETAILS: Record<string, { label: string; unit: string; range: string; industryRef: string }> = {
  DEP_YEAR_1: { label: '1년차 감가율', unit: '%', range: '15~25%', industryRef: '업계 평균 20% (국산 중형 기준)' },
  DEP_YEAR_2PLUS: { label: '2년차 이후 연 감가율', unit: '%', range: '8~15%', industryRef: '업계 평균 12%' },
  DEP_MILEAGE_10K: { label: '주행 1만km당 추가 감가', unit: '%', range: '1~3%', industryRef: '연 2만km 기준 2~4% 추가 감가' },
  LOAN_INTEREST_RATE: { label: '대출 금리', unit: '%', range: '5~9%', industryRef: '캐피탈 평균 6.5~8.5%' },
  LOAN_LTV_DEFAULT: { label: '담보인정비율 (LTV)', unit: '%', range: '60~90%', industryRef: '일반적으로 70~80%' },
  INVESTMENT_RETURN_RATE: { label: '기회비용 수익률', unit: '%', range: '3~6%', industryRef: '정기예금 3~4%, 적극투자 5~6%' },
  INSURANCE_LOADING: { label: '보험 로딩율', unit: '%', range: '10~30%', industryRef: '보험사 수수료 + 관리비 반영' },
  MONTHLY_MAINTENANCE_BASE: { label: '기본 월 정비비', unit: '원', range: '50,000~200,000', industryRef: '국산 중형 기준 약 8~12만원' },
  CAR_TAX_RATE: { label: '자동차세 기본세율', unit: '원/cc', range: '18~24', industryRef: '영업용 18원(1600cc↓), 19원(2500cc↓), 24원(2500cc↑)' },
  CAR_TAX_TYPE: { label: '자동차세 유형', unit: '', range: '영업용', industryRef: '렌터카=영업용 고정 (비영업용 대비 1/10)' },
  DEDUCTIBLE_AMOUNT: { label: '자차 면책금', unit: '원', range: '200,000~1,000,000', industryRef: '대형사 30~50만원, 중소사 50~100만원' },
  RISK_RESERVE_RATE: { label: '리스크 적립율', unit: '%', range: '1~5%', industryRef: '차량가의 2~3%를 연 적립' },
  DEPOSIT_DISCOUNT_RATE: { label: '보증금 할인율', unit: '%/천만원', range: '1~3%', industryRef: '보증금 1천만원당 월 1~2% 할인' },
  PREPAYMENT_DISCOUNT_RATE: { label: '선납 할인율', unit: '%', range: '2~5%', industryRef: '선납금 비율에 따라 할인' },
  DEFAULT_DEPOSIT: { label: '기본 보증금', unit: '원', range: '0~5,000,000', industryRef: '보통 0~300만원' },
  // 등록비 관련 키는 등록비용 탭(registration_cost_table)에서 직접 관리
  REG_ACQUISITION_TAX: { label: '(미사용) 취득세율', unit: '%', range: '4%', industryRef: '→ 등록비용 탭에서 관리' },
  REG_BOND_RATE_SEOUL: { label: '(미사용) 서울 공채', unit: '%', range: '8%', industryRef: '→ 등록비용 탭에서 관리' },
  REG_BOND_RATE_GYEONGGI: { label: '(미사용) 경기 공채', unit: '%', range: '0%', industryRef: '→ 등록비용 탭에서 관리' },
  REG_DELIVERY_FEE: { label: '(미사용) 탁송료', unit: '원', range: '350,000', industryRef: '→ 등록비용 탭에서 관리' },
  REG_MISC_FEE: { label: '(미사용) 기타 등록비', unit: '원', range: '167,000', industryRef: '→ 등록비용 탭에서 관리' },
  DEFAULT_RESIDUAL_RATE_RETURN: { label: '반납형 기본 잔존가치율', unit: '%', range: '0~10%', industryRef: '반납형은 0% (차량 회수 후 중고시장 매각)' },
  DEFAULT_RESIDUAL_RATE_BUYOUT: { label: '인수형 기본 잔존가치율', unit: '%', range: '20~40%', industryRef: '인수형 30% 전후 (3년 기준 시장 잔존가 연동)' },
  OWN_DAMAGE_RATIO: { label: '자차 면책 비율', unit: '%', range: '50~80%', industryRef: '업계 평균 60% (자차사고 부담 비율)' },
  DEFAULT_MARGIN_RATE: { label: '기본 마진율', unit: '%', range: '5~20%', industryRef: '대형사 5~10%, 중소사 10~20%' },
  OVERHEAD_RATE: { label: '관리비율', unit: '%', range: '3~10%', industryRef: '인건비·사무실·시스템 등 간접비' },
  VAT_RATE: { label: '부가세율', unit: '%', range: '10%', industryRef: '법정 10% 고정' },
  DEFAULT_TERM_MONTHS: { label: '기본 계약기간', unit: '개월', range: '12~60', industryRef: '가장 일반적: 36개월' },
}

/** 범위 문자열 파싱 → [min, max] (파싱 불가 시 null) */
function parseRange(rangeStr: string): [number, number] | null {
  // "15~25%" → [15, 25], "50,000~200,000" → [50000, 200000], "10%" → [10, 10], "4%" → [4, 4]
  const cleaned = rangeStr.replace(/,/g, '').replace(/%/g, '').replace(/원/g, '').replace(/개월/g, '').trim()
  const match = cleaned.match(/^([\d.]+)\s*[~\-]\s*([\d.]+)$/)
  if (match) return [parseFloat(match[1]), parseFloat(match[2])]
  const single = cleaned.match(/^([\d.]+)$/)
  if (single) { const v = parseFloat(single[1]); return [v, v] }
  return null
}

/** 값이 범위 내인지 검증 → 경고 메시지 반환 */
function validateRange(key: string, value: any): { level: 'ok' | 'warn' | 'danger'; message: string } | null {
  const detail = KEY_DETAILS[key]
  if (!detail || typeof value !== 'number') return null
  const range = parseRange(detail.range)
  if (!range) return null
  const [min, max] = range
  // 고정값 (min === max) 인 경우 완전 일치 체크 불필요 (VAT 등)
  if (min === max && value === min) return null
  if (value < min) {
    const pctBelow = min > 0 ? Math.round((min - value) / min * 100) : 0
    return pctBelow > 30
      ? { level: 'danger', message: `⚠️ 업계 최저(${min})보다 ${pctBelow}% 낮음 — 수익성 확인 필요` }
      : { level: 'warn', message: `참고: 업계 하한(${min})보다 낮음` }
  }
  if (value > max) {
    const pctAbove = max > 0 ? Math.round((value - max) / max * 100) : 0
    return pctAbove > 30
      ? { level: 'danger', message: `⚠️ 업계 최고(${max})보다 ${pctAbove}% 높음 — 경쟁력 확인 필요` }
      : { level: 'warn', message: `참고: 업계 상한(${max})보다 높음` }
  }
  return null
}

// business_rules 의 각 key → operational_actuals 실측 필드 매핑
//   (매핑 없는 키는 null → Drawer 가 "비교 데이터 없음" 표시)
const ACTUAL_FIELD_MAP: Record<string, EvidenceContext['actualField']> = {
  DEP_YEAR_1: 'actual_depreciation',
  DEP_YEAR_2PLUS: 'actual_depreciation',
  DEP_MILEAGE_10K: 'actual_depreciation',
  DEFAULT_RESIDUAL_RATE_RETURN: 'actual_depreciation',
  DEFAULT_RESIDUAL_RATE_BUYOUT: 'actual_depreciation',
  INSURANCE_LOADING: 'actual_insurance',
  DEDUCTIBLE_AMOUNT: 'actual_accident_cost',
  OWN_DAMAGE_RATIO: 'actual_accident_cost',
  RISK_RESERVE_RATE: 'actual_accident_cost',
  MONTHLY_MAINTENANCE_BASE: 'actual_maintenance',
  CAR_TAX_RATE: 'actual_tax',
}

export default function BusinessRulesTab() {
  const [rules, setRules] = useState<BusinessRule[]>([])
  const [loading, setLoading] = useState(true)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(true)
  const [evidence, setEvidence] = useState<EvidenceContext | null>(null)

  const openEvidence = (rule: BusinessRule) => {
    const detail = KEY_DETAILS[rule.key]
    setEvidence({
      table: 'business_rules',
      rowId: rule.id,
      title: detail?.label || rule.key,
      subtitle: rule.key,
      currentValue: rule.value,
      unit: detail?.unit,
      range: detail?.range,
      industryRef: detail?.industryRef,
      actualField: ACTUAL_FIELD_MAP[rule.key] ?? null,
    })
  }

  useEffect(() => { loadRules() }, [])

  const loadRules = async () => {
    try {
      setLoading(true)
      const data = await fetchPricingStandardsData('business_rules')
      setRules(data || [])
    } catch (error) { console.error('Error:', error) }
    finally { setLoading(false) }
  }

  const handleSave = async (id: string, newValue: any, reason?: string) => {
    try {
      const body: any = { value: newValue }
      if (reason) body._reason = reason
      await updatePricingStandardsRow('business_rules', id, body)
      setRules(rules.map(r => r.id === id ? { ...r, value: newValue } : r))
      setSavedId(id)
      setTimeout(() => setSavedId(null), 2000)
    } catch (error) { console.error('Error:', error) }
  }

  const applyFromDrawer = async (newValue: number, reason: string) => {
    if (!evidence) return
    await handleSave(evidence.rowId, newValue, reason)
    // drawer 내부 currentValue 갱신 + 변경이력 새로고침을 위해 context 교체
    setEvidence({ ...evidence, currentValue: newValue })
  }

  const getRuleByKey = (key: string) => rules.find(r => r.key === key)
  const formatDate = (d: string) => new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  const calculateMonthlyInterest = () => {
    const rate = getRuleByKey('LOAN_INTEREST_RATE')
    return rate ? Math.round(30000000 * (rate.value as number) / 12 / 100) : 0
  }
  const calculateOpportunityCost = () => {
    const rate = getRuleByKey('INVESTMENT_RETURN_RATE')
    return rate ? Math.round(30000000 * (rate.value as number) / 12 / 100) : 0
  }
  const calculateRiskReserve = () => {
    const rate = getRuleByKey('RISK_RESERVE_RATE')
    return rate ? Math.round(30000000 * (rate.value as number) / 100 / 36) : 0
  }

  if (loading) {
    return <div className="bg-white rounded-2xl shadow-sm p-8 text-center"><p className="text-slate-400">로딩 중...</p></div>
  }

  return (
    <>
    <div className="space-y-4">
      {showGuide && (
        <div
          style={{
            background: 'rgba(255,255,255,0.72)',
            borderRadius: 16,
            padding: 20,
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)',
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚙️</span>
              <h3 className="text-sm font-bold text-slate-800">기본 설정이란?</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600 leading-relaxed">
            <div>
              <p className="font-semibold text-slate-700 mb-1">개념</p>
              <p>렌트료 산출 공식에 사용되는 시스템 기본 파라미터입니다. 감가율, 금리, 세율, 마진율 등의 기본값을 설정하며, 개별 견적 시 이 값을 기본으로 조정합니다.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700 mb-1">검수 방법</p>
              <p>각 설정값 옆에 <strong>업계 참고</strong> 범위가 표시됩니다. 현재값이 업계 범위 내에 있는지 확인하세요. 범위를 벗어나면 이유를 명확히 기록해두는 것이 좋습니다.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700 mb-1">주의사항</p>
              <p>여기서 변경한 값은 새로 생성하는 견적에 기본값으로 적용됩니다. 기존 견적에는 영향이 없습니다. 변경 시 자동 저장되며, 변경 이력이 시간과 함께 기록됩니다.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          {!showGuide && (
            <button
              onClick={() => setShowGuide(true)}
              style={{
                marginBottom: 12,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.06)',
                background: 'rgba(255,255,255,0.6)',
                color: '#64748b',
                cursor: 'pointer',
              }}
            >
              💡 가이드 보기
            </button>
          )}
          <div className="space-y-4">
            {RULE_CATEGORIES.map((category) => {
              const categoryRules = category.keys.map(key => getRuleByKey(key)).filter(Boolean) as BusinessRule[]
              if (categoryRules.length === 0) return null

              return (
                <div key={category.name} className="bg-white rounded-2xl shadow-sm border border-black/[0.06] p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{category.icon}</span>
                    <h3 className="text-sm font-bold text-slate-800">{category.name}</h3>
                  </div>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">{category.explanation}</p>

                  <div className="space-y-3">
                    {categoryRules.map((rule) => {
                      const detail = KEY_DETAILS[rule.key]
                      const isSaved = savedId === rule.id
                      const valueType = typeof rule.value
                      const rangeCheck = validateRange(rule.key, rule.value)

                      return (
                        <div
                          key={rule.id}
                          style={{
                            padding: 14,
                            background: 'rgba(255,255,255,0.72)',
                            borderRadius: 12,
                            border: '1px solid rgba(0,0,0,0.06)',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
                          }}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-slate-800">{detail?.label || rule.key}</span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: '2px 6px',
                                    background: 'rgba(100,116,139,0.10)',
                                    color: '#64748b',
                                    borderRadius: 4,
                                    fontFamily: 'monospace',
                                  }}
                                >{rule.key}</span>
                              </div>
                              <p className="text-xs text-slate-500">{rule.description}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-3">
                              <div className="text-[10px] text-slate-500 text-right">
                                {formatDate(rule.updated_at)}
                              </div>
                              <button
                                type="button"
                                onClick={() => openEvidence(rule)}
                                style={{
                                  padding: '3px 8px',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  borderRadius: 6,
                                  border: '1px solid rgba(59,130,246,0.25)',
                                  background: 'rgba(59,130,246,0.08)',
                                  color: '#1d4ed8',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                                title="이 기준값의 변경 이력·실운영 대비 근거 보기"
                              >
                                📜 근거
                              </button>
                            </div>
                          </div>

                          {/* 업계 참고 정보 */}
                          {detail && (
                            <div className="flex flex-wrap gap-2 mb-3 text-[10px]">
                              <span
                                style={{
                                  padding: '2px 8px',
                                  background: 'rgba(59,130,246,0.10)',
                                  color: '#1d4ed8',
                                  borderRadius: 9999,
                                  border: '1px solid rgba(59,130,246,0.20)',
                                }}
                              >적정 범위: {detail.range}</span>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  background: 'rgba(16,185,129,0.10)',
                                  color: '#047857',
                                  borderRadius: 9999,
                                  border: '1px solid rgba(16,185,129,0.20)',
                                }}
                              >업계: {detail.industryRef}</span>
                              {detail.unit && (
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    background: 'rgba(100,116,139,0.10)',
                                    color: '#475569',
                                    borderRadius: 9999,
                                    border: '1px solid rgba(100,116,139,0.20)',
                                  }}
                                >단위: {detail.unit}</span>
                              )}
                            </div>
                          )}

                          {/* 값 편집 */}
                          <div className="flex items-center gap-2">
                            {valueType === 'number' ? (
                              <input type="number"
                                step={rule.key.includes('RATE') || rule.key.includes('MARGIN') || rule.key.includes('OVERHEAD') ? '0.01' : '1'}
                                defaultValue={rule.value}
                                onBlur={(e) => {
                                  const v = parseFloat(e.target.value)
                                  if (!isNaN(v) && v !== rule.value) handleSave(rule.id, v)
                                }}
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  fontSize: 13,
                                  fontWeight: 600,
                                  borderRadius: 8,
                                  border: `1px solid ${isSaved ? '#10b981' : 'rgba(0,0,0,0.08)'}`,
                                  background: 'rgba(255,255,255,0.95)',
                                  color: '#0f172a',
                                  outline: 'none',
                                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                                }}
                              />
                            ) : valueType === 'boolean' ? (
                              <select defaultValue={rule.value ? 'true' : 'false'}
                                onChange={(e) => handleSave(rule.id, e.target.value === 'true')}
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  fontSize: 13,
                                  fontWeight: 600,
                                  borderRadius: 8,
                                  border: `1px solid ${isSaved ? '#10b981' : 'rgba(0,0,0,0.08)'}`,
                                  background: 'rgba(255,255,255,0.95)',
                                  color: '#0f172a',
                                  outline: 'none',
                                }}
                              >
                                <option value="true">활성화</option>
                                <option value="false">비활성화</option>
                              </select>
                            ) : (
                              <input type="text" defaultValue={rule.value}
                                onBlur={(e) => { if (e.target.value !== rule.value) handleSave(rule.id, e.target.value) }}
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  fontSize: 13,
                                  fontWeight: 600,
                                  borderRadius: 8,
                                  border: `1px solid ${isSaved ? '#10b981' : 'rgba(0,0,0,0.08)'}`,
                                  background: 'rgba(255,255,255,0.95)',
                                  color: '#0f172a',
                                  outline: 'none',
                                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                                }}
                              />
                            )}
                            {isSaved && <span style={{ color: '#059669', fontSize: 11, fontWeight: 700 }}>💾 저장됨</span>}
                          </div>
                          {rangeCheck && (
                            <div className={`mt-2 px-3 py-1.5 rounded-lg text-[11px] ${
                              rangeCheck.level === 'danger'
                                ? 'bg-red-50 text-red-600 border border-red-200'
                                : 'bg-amber-50 text-amber-600 border border-amber-200'
                            }`}>
                              {rangeCheck.message}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="lg:col-span-4">
          <div
            style={{
              background: 'rgba(255,255,255,0.72)',
              borderRadius: 16,
              padding: 20,
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '8px 8px 20px rgba(140,170,210,0.14), -4px -4px 14px rgba(255,255,255,0.6)',
              backdropFilter: 'blur(16px)',
              position: 'sticky',
              top: 128,
            }}
          >
            <h3 className="text-sm font-bold text-slate-800 mb-1">현재 설정 시뮬레이션</h3>
            <p className="text-[10px] text-slate-500 mb-4">3천만원 · 36개월 기준 예상 비용</p>

            <div className="space-y-3">
              {/* 월 대출이자 — blue tint */}
              <div
                style={{
                  padding: 12,
                  background: 'rgba(255,255,255,0.60)',
                  borderRadius: 10,
                  border: '1px solid rgba(59,130,246,0.18)',
                }}
              >
                <div style={{ fontSize: 10, color: '#475569', marginBottom: 2 }}>월 대출이자</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>{calculateMonthlyInterest().toLocaleString()}원</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{getRuleByKey('LOAN_INTEREST_RATE')?.value}% 적용</div>
              </div>

              {/* 월 기회비용 — violet tint */}
              <div
                style={{
                  padding: 12,
                  background: 'rgba(255,255,255,0.60)',
                  borderRadius: 10,
                  border: '1px solid rgba(139,92,246,0.18)',
                }}
              >
                <div style={{ fontSize: 10, color: '#475569', marginBottom: 2 }}>월 기회비용</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#6d28d9' }}>{calculateOpportunityCost().toLocaleString()}원</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{getRuleByKey('INVESTMENT_RETURN_RATE')?.value}% 적용</div>
              </div>

              {/* 월 리스크 적립 — amber tint */}
              <div
                style={{
                  padding: 12,
                  background: 'rgba(255,255,255,0.60)',
                  borderRadius: 10,
                  border: '1px solid rgba(245,158,11,0.20)',
                }}
              >
                <div style={{ fontSize: 10, color: '#475569', marginBottom: 2 }}>월 리스크 적립</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#b45309' }}>{calculateRiskReserve().toLocaleString()}원</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{getRuleByKey('RISK_RESERVE_RATE')?.value}% 적용</div>
              </div>

              {/* 주요 설정값 요약 */}
              <div
                style={{
                  padding: 12,
                  background: 'rgba(255,255,255,0.50)',
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 8 }}>주요 설정값 요약</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#334155' }}>
                  {getRuleByKey('DEFAULT_MARGIN_RATE') && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>마진율</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{getRuleByKey('DEFAULT_MARGIN_RATE')!.value}%</span></div>}
                  {getRuleByKey('VAT_RATE') && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>부가세율</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{getRuleByKey('VAT_RATE')!.value}%</span></div>}
                  {getRuleByKey('DEFAULT_TERM_MONTHS') && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>기본 기간</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{getRuleByKey('DEFAULT_TERM_MONTHS')!.value}개월</span></div>}
                  {getRuleByKey('CAR_TAX_TYPE') && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>세금 유형</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{getRuleByKey('CAR_TAX_TYPE')!.value}</span></div>}
                  {getRuleByKey('INSURANCE_LOADING') && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>보험 로딩</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{getRuleByKey('INSURANCE_LOADING')!.value}%</span></div>}
                </div>
              </div>

              {/* 월 금융비용 합계 — emerald tint */}
              <div
                style={{
                  padding: 14,
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(5,150,105,0.08))',
                  borderRadius: 12,
                  border: '1px solid rgba(16,185,129,0.25)',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: '#047857', marginBottom: 2 }}>월 금융비용 합계</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#064e3b' }}>
                  {(calculateMonthlyInterest() + calculateOpportunityCost() + calculateRiskReserve()).toLocaleString()}원
                </div>
                <div style={{ fontSize: 10, color: '#047857', marginTop: 2 }}>대출이자 + 기회비용 + 리스크적립</div>
              </div>

              <div
                style={{
                  padding: 10,
                  background: 'rgba(255,255,255,0.40)',
                  borderRadius: 8,
                  fontSize: 10,
                  color: '#64748b',
                  border: '1px solid rgba(0,0,0,0.04)',
                }}
              >
                변경사항은 자동 저장됩니다. 새 견적 생성 시 이 기본값이 적용됩니다.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* 근거/학습 드로어 + AI 추천값 한 클릭 반영 */}
    <EvidenceDrawer
      ctx={evidence}
      onClose={() => setEvidence(null)}
      onApply={applyFromDrawer}
    />
    </>
  )
}

'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Save } from 'lucide-react';

interface BusinessRule {
  id: string;
  key: string;
  value: any;
  description: string;
  updated_at: string;
}

interface RuleCategory {
  name: string;
  keys: string[];
}

const RULE_CATEGORIES: RuleCategory[] = [
  {
    name: '감가 설정',
    keys: ['DEP_YEAR_1', 'DEP_YEAR_2PLUS', 'DEP_MILEAGE_10K'],
  },
  {
    name: '금융 설정',
    keys: ['LOAN_INTEREST_RATE', 'LOAN_LTV_DEFAULT', 'INVESTMENT_RETURN_RATE'],
  },
  {
    name: '운영 설정',
    keys: ['INSURANCE_LOADING', 'MONTHLY_MAINTENANCE_BASE', 'CAR_TAX_RATE', 'CAR_TAX_TYPE'],
  },
  {
    name: '리스크/할인',
    keys: ['DEDUCTIBLE_AMOUNT', 'RISK_RESERVE_RATE', 'DEPOSIT_DISCOUNT_RATE', 'PREPAYMENT_DISCOUNT_RATE', 'DEFAULT_DEPOSIT'],
  },
  {
    name: '등록비',
    keys: ['REG_ACQUISITION_TAX', 'REG_BOND_RATE_SEOUL', 'REG_BOND_RATE_GYEONGGI', 'REG_DELIVERY_FEE', 'REG_MISC_FEE'],
  },
  {
    name: '기타',
    keys: ['DEFAULT_MARGIN_RATE', 'OVERHEAD_RATE', 'VAT_RATE', 'DEFAULT_TERM_MONTHS'],
  },
];

export default function BusinessRulesTab() {
  const supabase = createClientComponentClient();
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('business_rules')
        .select('*')
        .order('key', { ascending: true });

      if (error) throw error;
      setRules(data || []);
    } catch (error) {
      console.error('Error loading business rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateField = async (id: string, field: 'value', newValue: any) => {
    try {
      const { error } = await supabase
        .from('business_rules')
        .update({ [field]: newValue })
        .eq('id', id);

      if (error) throw error;

      setRules(rules.map(r => r.id === id ? { ...r, [field]: newValue } : r));
      setSavedId(id);
      setTimeout(() => setSavedId(null), 2000);
    } catch (error) {
      console.error('Error updating rule:', error);
    }
  };

  const getRuleByKey = (key: string): BusinessRule | undefined => {
    return rules.find(r => r.key === key);
  };

  const handleValueChange = (value: any, valueType: 'number' | 'string' | 'boolean') => {
    if (valueType === 'number') return parseFloat(value);
    if (valueType === 'boolean') return value === 'true';
    return value;
  };

  const getValueType = (value: any): 'number' | 'string' | 'boolean' => {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateMonthlyInterest = () => {
    const loanRate = getRuleByKey('LOAN_INTEREST_RATE');
    const vehiclePrice = 30000000;
    if (loanRate) {
      const monthlyRate = (loanRate.value as number) / 12 / 100;
      return Math.round(vehiclePrice * monthlyRate);
    }
    return 0;
  };

  const calculateOpportunityCost = () => {
    const investmentReturn = getRuleByKey('INVESTMENT_RETURN_RATE');
    const vehiclePrice = 30000000;
    const months = 36;
    if (investmentReturn) {
      const monthlyReturn = (investmentReturn.value as number) / 12 / 100;
      return Math.round(vehiclePrice * monthlyReturn);
    }
    return 0;
  };

  const calculateRiskReserve = () => {
    const riskRate = getRuleByKey('RISK_RESERVE_RATE');
    const vehiclePrice = 30000000;
    if (riskRate) {
      return Math.round(vehiclePrice * (riskRate.value as number) / 100 / 36);
    }
    return 0;
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Left side - Rules */}
      <div className="lg:col-span-8 col-span-12">
        {loading ? (
          <div className="text-center py-8 text-slate-500">로딩 중...</div>
        ) : (
          <div className="space-y-4">
            {RULE_CATEGORIES.map((category) => {
              const categoryRules = category.keys.map(key => getRuleByKey(key)).filter(Boolean) as BusinessRule[];

              if (categoryRules.length === 0) return null;

              return (
                <div key={category.name} className="bg-white rounded-2xl shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4 pb-3 border-b border-slate-200">
                    {category.name}
                  </h3>

                  <div className="space-y-4">
                    {categoryRules.map((rule) => {
                      const valueType = getValueType(rule.value);
                      const isEditing = editingId === rule.id;
                      const isSaved = savedId === rule.id;

                      return (
                        <div key={rule.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="text-xs font-semibold text-slate-700">{rule.key}</div>
                              <div className="text-xs text-slate-500 mt-1">{rule.description}</div>
                            </div>
                            <div className="text-xs text-slate-400">
                              {formatDate(rule.updated_at)}
                            </div>
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            {valueType === 'number' && (
                              <input
                                type="number"
                                step={rule.key.includes('RATE') || rule.key.includes('MARGIN') ? '0.01' : '1'}
                                value={rule.value}
                                onChange={(e) => setEditingId(rule.id)}
                                onBlur={(e) => {
                                  const newValue = handleValueChange(e.target.value, valueType);
                                  handleUpdateField(rule.id, 'value', newValue);
                                  setEditingId(null);
                                }}
                                className={`flex-1 px-3 py-2 text-sm border rounded-lg text-slate-900 ${
                                  isSaved ? 'border-green-500 bg-green-50' : 'border-slate-300'
                                }`}
                              />
                            )}

                            {valueType === 'string' && (
                              <input
                                type="text"
                                value={rule.value}
                                onChange={(e) => setEditingId(rule.id)}
                                onBlur={(e) => {
                                  const newValue = handleValueChange(e.target.value, valueType);
                                  handleUpdateField(rule.id, 'value', newValue);
                                  setEditingId(null);
                                }}
                                className={`flex-1 px-3 py-2 text-sm border rounded-lg text-slate-900 ${
                                  isSaved ? 'border-green-500 bg-green-50' : 'border-slate-300'
                                }`}
                              />
                            )}

                            {valueType === 'boolean' && (
                              <select
                                value={rule.value ? 'true' : 'false'}
                                onChange={(e) => {
                                  const newValue = handleValueChange(e.target.value, valueType);
                                  handleUpdateField(rule.id, 'value', newValue);
                                }}
                                className={`flex-1 px-3 py-2 text-sm border rounded-lg text-slate-900 ${
                                  isSaved ? 'border-green-500 bg-green-50' : 'border-slate-300'
                                }`}
                              >
                                <option value="true">활성화</option>
                                <option value="false">비활성화</option>
                              </select>
                            )}

                            {isSaved && (
                              <div className="flex items-center gap-1 text-green-600">
                                <Save size={14} />
                                <span className="text-xs">저장됨</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right side - Summary Panel */}
      <div className="lg:col-span-4 col-span-12">
        <div className="bg-slate-900 rounded-2xl shadow-sm p-6 text-white">
          <h2 className="text-sm font-semibold mb-6">현재 설정 요약</h2>

          <div className="space-y-4">
            {/* Example Scenario */}
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              <div className="text-xs font-semibold text-blue-400 mb-3">기준 시나리오</div>
              <div className="text-xs text-slate-300 space-y-1">
                <div>차량가격: 3,000만원</div>
                <div>계약기간: 36개월</div>
              </div>
            </div>

            {/* Calculations */}
            <div className="space-y-3">
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">월 대출이자</div>
                <div className="text-sm font-semibold text-white">
                  {calculateMonthlyInterest().toLocaleString()}원
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {getRuleByKey('LOAN_INTEREST_RATE')?.value}% 기준
                </div>
              </div>

              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">월 기회비용</div>
                <div className="text-sm font-semibold text-white">
                  {calculateOpportunityCost().toLocaleString()}원
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {getRuleByKey('INVESTMENT_RETURN_RATE')?.value}% 기준
                </div>
              </div>

              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">월 리스크 적립</div>
                <div className="text-sm font-semibold text-white">
                  {calculateRiskReserve().toLocaleString()}원
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {getRuleByKey('RISK_RESERVE_RATE')?.value}% 기준
                </div>
              </div>
            </div>

            {/* Key Rules */}
            <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
              <div className="text-xs font-semibold text-blue-400 mb-2">주요 설정값</div>
              <div className="space-y-1 text-xs text-slate-300">
                {getRuleByKey('DEFAULT_MARGIN_RATE') && (
                  <div>기본 마진율: {getRuleByKey('DEFAULT_MARGIN_RATE')!.value}%</div>
                )}
                {getRuleByKey('VAT_RATE') && (
                  <div>부가세율: {getRuleByKey('VAT_RATE')!.value}%</div>
                )}
                {getRuleByKey('DEFAULT_TERM_MONTHS') && (
                  <div>기본 기간: {getRuleByKey('DEFAULT_TERM_MONTHS')!.value}개월</div>
                )}
                {getRuleByKey('INSURANCE_LOADING') && (
                  <div>보험료 로딩: {getRuleByKey('INSURANCE_LOADING')!.value}%</div>
                )}
              </div>
            </div>

            {/* Total Monthly Cost Estimate */}
            <div className="p-3 bg-gradient-to-br from-blue-900 to-slate-900 rounded-lg border border-blue-700">
              <div className="text-xs font-semibold text-blue-300 mb-2">월 운영 비용 추정</div>
              <div className="text-lg font-bold text-white mb-1">
                {(calculateMonthlyInterest() + calculateOpportunityCost() + calculateRiskReserve()).toLocaleString()}원
              </div>
              <div className="text-xs text-blue-200">
                대출이자 + 기회비용 + 리스크적립
              </div>
            </div>

            {/* Update Info */}
            <div className="p-2 bg-slate-800 rounded-lg text-xs text-slate-400 border border-slate-700">
              <div>마지막 업데이트 시간이 표시됩니다.</div>
              <div>변경사항은 자동 저장됩니다.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

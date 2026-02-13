'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Search, Trash2, Plus } from 'lucide-react';

interface RegistrationCost {
  id: string;
  cost_type: '취득세' | '공채매입' | '공채할인' | '탁송료' | '번호판' | '인지세' | '대행료' | '검사비';
  vehicle_category: '승용' | '승합' | '화물' | '전기차';
  region: '서울' | '경기' | '기타' | '전국';
  rate: number;
  fixed_amount: number;
  description: string;
  notes: string;
}

interface SearchResult {
  data: RegistrationCost[];
  insights: string;
}

const COST_TYPES = ['취득세', '공채매입', '공채할인', '탁송료', '번호판', '인지세', '대행료', '검사비'] as const;
const VEHICLE_CATEGORIES = ['승용', '승합', '화물', '전기차'] as const;
const REGIONS = ['서울', '경기', '기타', '전국'] as const;

const COST_TYPE_COLORS: Record<string, string> = {
  '취득세': 'bg-blue-50',
  '공채매입': 'bg-indigo-50',
  '공채할인': 'bg-purple-50',
  '탁송료': 'bg-pink-50',
  '번호판': 'bg-rose-50',
  '인지세': 'bg-orange-50',
  '대행료': 'bg-amber-50',
  '검사비': 'bg-yellow-50',
};

export default function RegistrationTab() {
  const supabase = createClientComponentClient();
  const [rows, setRows] = useState<RegistrationCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [vehiclePrice, setVehiclePrice] = useState(30000000);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('registration_cost_table')
        .select('*')
        .order('cost_type', { ascending: true });

      if (error) throw error;
      setRows(data || []);
    } catch (error) {
      console.error('Error loading registration costs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRow = async () => {
    const newRow: RegistrationCost = {
      id: '',
      cost_type: '취득세',
      vehicle_category: '승용',
      region: '서울',
      rate: 0,
      fixed_amount: 0,
      description: '',
      notes: '',
    };

    try {
      const { data, error } = await supabase
        .from('registration_cost_table')
        .insert([newRow])
        .select();

      if (error) throw error;
      if (data) setRows([...rows, data[0]]);
    } catch (error) {
      console.error('Error adding row:', error);
    }
  };

  const handleDeleteRow = async (id: string) => {
    try {
      const { error } = await supabase
        .from('registration_cost_table')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setRows(rows.filter(r => r.id !== id));
    } catch (error) {
      console.error('Error deleting row:', error);
    }
  };

  const handleUpdateField = async (id: string, field: keyof RegistrationCost, value: any) => {
    try {
      const { error } = await supabase
        .from('registration_cost_table')
        .update({ [field]: value })
        .eq('id', id);

      if (error) throw error;

      setRows(rows.map(r =>
        r.id === id ? { ...r, [field]: value } : r
      ));
    } catch (error) {
      console.error('Error updating field:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      setSearchLoading(true);
      const response = await fetch('/api/search-pricing-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          category: 'registration',
          context: {
            current_data: rows,
            regions: Array.from(new Set(rows.map(r => r.region))),
            vehicle_categories: Array.from(new Set(rows.map(r => r.vehicle_category))),
          },
        }),
      });

      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const calculateAcquisitionTax = () => {
    const acqTax = rows.find(r => r.cost_type === '취득세' && r.vehicle_category === '승용' && r.region === '서울');
    if (acqTax) {
      return Math.round(vehiclePrice * (acqTax.rate / 100) + acqTax.fixed_amount);
    }
    return 0;
  };

  const sortedRows = [...rows].sort((a, b) => {
    const costTypeOrder = COST_TYPES.indexOf(a.cost_type) - COST_TYPES.indexOf(b.cost_type);
    if (costTypeOrder !== 0) return costTypeOrder;
    return VEHICLE_CATEGORIES.indexOf(a.vehicle_category) - VEHICLE_CATEGORIES.indexOf(b.vehicle_category);
  });

  const groupedByCostType = COST_TYPES.reduce((acc, costType) => {
    acc[costType] = sortedRows.filter(r => r.cost_type === costType);
    return acc;
  }, {} as Record<string, RegistrationCost[]>);

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Left side - Table */}
      <div className="lg:col-span-8 col-span-12">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold text-slate-900">등록비용 관리</h2>
            <button
              onClick={handleAddRow}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              추가
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-slate-500">로딩 중...</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedByCostType).map(([costType, typeRows]) => (
                typeRows.length > 0 && (
                  <div key={costType} className={`rounded-lg p-4 ${COST_TYPE_COLORS[costType]}`}>
                    <div className="text-xs font-semibold text-slate-700 mb-3">{costType}</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 px-2 text-slate-600 font-medium text-xs">차종</th>
                            <th className="text-left py-2 px-2 text-slate-600 font-medium text-xs">지역</th>
                            <th className="text-left py-2 px-2 text-slate-600 font-medium text-xs">요율(%)</th>
                            <th className="text-left py-2 px-2 text-slate-600 font-medium text-xs">고정금액</th>
                            <th className="text-left py-2 px-2 text-slate-600 font-medium text-xs">설명</th>
                            <th className="text-left py-2 px-2 text-slate-600 font-medium text-xs">비고</th>
                            <th className="text-center py-2 px-2 text-slate-600 font-medium text-xs">삭제</th>
                          </tr>
                        </thead>
                        <tbody>
                          {typeRows.map((row) => (
                            <tr key={row.id} className="border-b border-slate-200 hover:bg-white/50">
                              <td className="py-2 px-2">
                                <select
                                  value={row.vehicle_category}
                                  onChange={(e) => handleUpdateField(row.id, 'vehicle_category', e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded text-slate-900"
                                >
                                  {VEHICLE_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 px-2">
                                <select
                                  value={row.region}
                                  onChange={(e) => handleUpdateField(row.id, 'region', e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded text-slate-900"
                                >
                                  {REGIONS.map(reg => (
                                    <option key={reg} value={reg}>{reg}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={row.rate}
                                  onChange={(e) => handleUpdateField(row.id, 'rate', parseFloat(e.target.value))}
                                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded text-slate-900"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="number"
                                  value={row.fixed_amount}
                                  onChange={(e) => handleUpdateField(row.id, 'fixed_amount', parseInt(e.target.value))}
                                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded text-slate-900"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={row.description}
                                  onChange={(e) => handleUpdateField(row.id, 'description', e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded text-slate-900"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={row.notes}
                                  onChange={(e) => handleUpdateField(row.id, 'notes', e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded text-slate-900"
                                />
                              </td>
                              <td className="py-2 px-2 text-center">
                                <button
                                  onClick={() => handleDeleteRow(row.id)}
                                  className="text-red-500 hover:text-red-700 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          {/* Example Calculation */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-xs font-semibold text-blue-900 mb-2">계산 예시</div>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-xs text-slate-600">차량가격:</label>
              <input
                type="number"
                value={vehiclePrice}
                onChange={(e) => setVehiclePrice(parseInt(e.target.value))}
                className="px-2 py-1 text-xs border border-blue-200 rounded text-slate-900 w-32"
              />
              <span className="text-xs text-slate-600">원</span>
            </div>
            <div className="text-xs text-slate-700 space-y-1">
              <div>
                예) {(vehiclePrice / 10000000).toFixed(1)}천만원 차량 → 취득세{' '}
                <span className="font-semibold text-blue-600">
                  {calculateAcquisitionTax().toLocaleString()}원
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Search Panel */}
      <div className="lg:col-span-4 col-span-12">
        <div className="bg-slate-900 rounded-2xl shadow-sm p-6 text-white">
          <h2 className="text-sm font-semibold mb-4">Gemini 실시간 검색</h2>

          <div className="space-y-4">
            <textarea
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="지역, 차종, 비용유형 등으로 검색하세요..."
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-600 resize-none h-20"
            />

            <button
              onClick={handleSearch}
              disabled={searchLoading || !searchQuery.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Search size={16} />
              {searchLoading ? '검색 중...' : '검색'}
            </button>

            {searchResults && (
              <div className="mt-4 p-3 bg-slate-800 rounded-lg border border-slate-700">
                <div className="text-xs font-medium text-blue-400 mb-2">결과:</div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {searchResults.insights}
                </p>
                {searchResults.data.length > 0 && (
                  <div className="mt-3 text-xs text-slate-400">
                    <div className="font-medium mb-1">관련 데이터:</div>
                    {searchResults.data.map(item => (
                      <div key={item.id} className="py-1 border-t border-slate-700">
                        {item.cost_type} - {item.vehicle_category} / {item.region} ({item.rate}%, {item.fixed_amount}원)
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

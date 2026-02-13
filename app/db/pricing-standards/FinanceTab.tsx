'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Search, Trash2, Plus } from 'lucide-react';

interface FinanceRate {
  id: string;
  finance_type: '캐피탈대출' | '리스' | '자체자금';
  term_months_min: number;
  term_months_max: number;
  annual_rate: number;
  description: string;
  effective_date: string;
  notes: string;
}

interface SearchResult {
  data: FinanceRate[];
  insights: string;
}

const FINANCE_TYPES = ['캐피탈대출', '리스', '자체자금'] as const;

export default function FinanceTab() {
  const supabase = createClientComponentClient();
  const [rows, setRows] = useState<FinanceRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Load data from Supabase
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('finance_rate_table')
        .select('*')
        .order('effective_date', { ascending: false });

      if (error) throw error;
      setRows(data || []);
    } catch (error) {
      console.error('Error loading finance rates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRow = async () => {
    const newRow: FinanceRate = {
      id: '',
      finance_type: '캐피탈대출',
      term_months_min: 12,
      term_months_max: 60,
      annual_rate: 0,
      description: '',
      effective_date: new Date().toISOString().split('T')[0],
      notes: '',
    };

    try {
      const { data, error } = await supabase
        .from('finance_rate_table')
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
        .from('finance_rate_table')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setRows(rows.filter(r => r.id !== id));
    } catch (error) {
      console.error('Error deleting row:', error);
    }
  };

  const handleUpdateField = async (id: string, field: keyof FinanceRate, value: any) => {
    try {
      const { error } = await supabase
        .from('finance_rate_table')
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
          category: 'finance',
          context: {
            current_data: rows,
            term_months: rows.map(r => ({ min: r.term_months_min, max: r.term_months_max })),
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

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Left side - Table */}
      <div className="lg:col-span-8 col-span-12">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold text-slate-900">금융상품 요율 정보</h2>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-slate-600 font-medium">금융유형</th>
                    <th className="text-left py-3 px-4 text-slate-600 font-medium">최소기간(월)</th>
                    <th className="text-left py-3 px-4 text-slate-600 font-medium">최대기간(월)</th>
                    <th className="text-left py-3 px-4 text-slate-600 font-medium">연이율(%)</th>
                    <th className="text-left py-3 px-4 text-slate-600 font-medium">설명</th>
                    <th className="text-left py-3 px-4 text-slate-600 font-medium">적용일</th>
                    <th className="text-left py-3 px-4 text-slate-600 font-medium">비고</th>
                    <th className="text-center py-3 px-4 text-slate-600 font-medium">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <select
                          value={row.finance_type}
                          onChange={(e) => handleUpdateField(row.id, 'finance_type', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-slate-200 rounded text-slate-900"
                        >
                          {FINANCE_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={row.term_months_min}
                          onChange={(e) => handleUpdateField(row.id, 'term_months_min', parseInt(e.target.value))}
                          className="w-full px-2 py-1 text-sm border border-slate-200 rounded text-slate-900"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={row.term_months_max}
                          onChange={(e) => handleUpdateField(row.id, 'term_months_max', parseInt(e.target.value))}
                          className="w-full px-2 py-1 text-sm border border-slate-200 rounded text-slate-900"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          step="0.01"
                          value={row.annual_rate}
                          onChange={(e) => handleUpdateField(row.id, 'annual_rate', parseFloat(e.target.value))}
                          className="w-full px-2 py-1 text-sm border border-slate-200 rounded text-slate-900"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => handleUpdateField(row.id, 'description', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-slate-200 rounded text-slate-900"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="date"
                          value={row.effective_date}
                          onChange={(e) => handleUpdateField(row.id, 'effective_date', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-slate-200 rounded text-slate-900"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) => handleUpdateField(row.id, 'notes', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-slate-200 rounded text-slate-900"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleDeleteRow(row.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
              placeholder="금융상품, 요율, 기간 등으로 검색하세요..."
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
                        {item.finance_type} - {item.annual_rate}% ({item.term_months_min}-{item.term_months_max}개월)
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

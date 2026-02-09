'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'

export default function ModelDbPage() {

// ✅ [수정 2] supabase 클라이언트 생성 (이 줄이 없어서 에러가 난 겁니다!)
const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // 모달 및 입력 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newItem, setNewItem] = useState({
    brand: '',
    model: '',
    trim: '',
    year: new Date().getFullYear(),
    standard_price: 0
  })

  useEffect(() => {
    fetchList()
  }, [])

  // 리스트 불러오기
  const fetchList = async () => {
    const { data } = await supabase
      .from('market_price_db')
      .select('*')
      .order('brand', { ascending: true })
      .order('model', { ascending: true })
      .order('year', { ascending: false })

    setList(data || [])
    setLoading(false)
  }

  // 신규 등록
  const handleSave = async () => {
    if (!newItem.brand || !newItem.model || !newItem.standard_price) {
        return alert('제조사, 모델명, 기준가는 필수입니다.')
    }

    const { error } = await supabase.from('market_price_db').insert([newItem])

    if (error) alert('저장 실패: ' + error.message)
    else {
        alert('✅ 기준 데이터가 저장되었습니다.')
        setIsModalOpen(false)
        setNewItem({ brand: '', model: '', trim: '', year: new Date().getFullYear(), standard_price: 0 })
        fetchList()
    }
  }

  // 삭제
  const handleDelete = async (id: number) => {
    if (!confirm('이 기준 데이터를 삭제하시겠습니까?')) return
    await supabase.from('market_price_db').delete().eq('id', id)
    fetchList()
  }

  // 검색 필터링
  const filteredList = list.filter(item =>
    item.brand.includes(searchTerm) ||
    item.model.includes(searchTerm) ||
    item.trim?.includes(searchTerm)
  )

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in">
      {/* 헤더 */}
      <div className="flex justify-between items-end mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">🚗 차종/시세표 DB</h1>
          <p className="text-gray-500 mt-2">견적 산출 및 자산 가치 평가의 기준이 되는 신차/시장 가격표입니다.</p>
        </div>
        <button
            onClick={() => setIsModalOpen(true)}
            className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 shadow-lg transition-transform hover:-translate-y-1"
        >
            + 신규 기준가 등록
        </button>
      </div>

      {/* 검색 및 통계 */}
      <div className="flex justify-between items-center mb-4">
        <input
            className="border p-3 rounded-lg w-80 bg-gray-50 font-bold outline-none focus:border-black transition-colors"
            placeholder="제조사 또는 모델명 검색..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
        />
        <span className="text-gray-500 font-bold text-sm">총 {filteredList.length}개 데이터</span>
      </div>

      {/* 데이터 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 font-bold border-b">
            <tr>
              <th className="p-4">제조사</th>
              <th className="p-4">모델명</th>
              <th className="p-4">세부등급(Trim)</th>
              <th className="p-4 text-center">연식</th>
              <th className="p-4 text-right">기준 시세(신차가)</th>
              <th className="p-4 text-center">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredList.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4 font-bold text-gray-900">{item.brand}</td>
                <td className="p-4 font-bold">{item.model}</td>
                <td className="p-4 text-gray-500">{item.trim || '-'}</td>
                <td className="p-4 text-center">
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">{item.year}년식</span>
                </td>
                <td className="p-4 text-right font-black text-blue-600 text-lg">
                    {f(item.standard_price)}원
                </td>
                <td className="p-4 text-center">
                  <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 font-bold text-xs underline">
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {filteredList.length === 0 && (
                <tr><td colSpan={6} className="p-10 text-center text-gray-400">등록된 시세 데이터가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 모달 창 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsModalOpen(false)}>
            <div className="bg-white p-8 rounded-2xl w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-black mb-4">📝 신규 시세 데이터 등록</h2>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">제조사</label>
                        <input className="w-full p-3 border rounded-xl font-bold" placeholder="예: 현대"
                            value={newItem.brand} onChange={e => setNewItem({...newItem, brand: e.target.value})} autoFocus />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">연식</label>
                        <input type="number" className="w-full p-3 border rounded-xl font-bold"
                            value={newItem.year} onChange={e => setNewItem({...newItem, year: Number(e.target.value)})} />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">모델명</label>
                    <input className="w-full p-3 border rounded-xl font-bold" placeholder="예: 그랜저 GN7"
                        value={newItem.model} onChange={e => setNewItem({...newItem, model: e.target.value})} />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">세부등급 (선택)</label>
                    <input className="w-full p-3 border rounded-xl font-bold" placeholder="예: 3.5 캘리그래피"
                        value={newItem.trim} onChange={e => setNewItem({...newItem, trim: e.target.value})} />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">기준 시세 (신차가)</label>
                    <div className="relative">
                        <input type="text" className="w-full p-3 border rounded-xl font-bold text-right pr-8 text-blue-600"
                            value={f(newItem.standard_price)}
                            onChange={e => setNewItem({...newItem, standard_price: Number(e.target.value.replace(/,/g, ''))})}
                        />
                        <span className="absolute right-3 top-3 font-bold text-gray-400">원</span>
                    </div>
                </div>

                <button onClick={handleSave} className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-800 mt-4">
                    저장하기
                </button>
            </div>
        </div>
      )}
    </div>
  )
}
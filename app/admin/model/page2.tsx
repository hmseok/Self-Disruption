'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs' // 경로 확인해주세요

// 🎨 스타일링용 아이콘 (Heroicons)
const ChevronDown = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
const ChevronUp = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>

export default function ModelCodePage() {
  const [models, setModels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<number | null>(null) // 펼쳐진 행 ID

  useEffect(() => {
    fetchModels()
  }, [])

  // 🚀 모델과 하위 트림까지 한 번에 가져오기 (Join)
  const fetchModels = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('car_code_models')
      .select(`
        *,
        car_code_trims (
          id, trim_name, price, fuel_type
        )
      `)
      .order('created_at', { ascending: false })

    if (error) console.error(error)
    else setModels(data || [])
    setLoading(false)
  }

  // 모델 삭제 (하위 트림도 자동 삭제됨 - Cascade 설정 덕분)
  const handleDeleteModel = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까? \n포함된 모든 트림 정보도 함께 삭제됩니다.')) return
    await supabase.from('car_code_models').delete().eq('id', id)
    fetchModels()
  }

  // 특정 트림만 삭제
  const handleDeleteTrim = async (trimId: number) => {
    if (!confirm('이 트림만 삭제하시겠습니까?')) return
    await supabase.from('car_code_trims').delete().eq('id', trimId)
    fetchModels()
  }

  const toggleRow = (id: number) => {
    if (expandedRow === id) setExpandedRow(null)
    else setExpandedRow(id)
  }

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-6xl mx-auto py-10 px-6">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-3xl font-black text-gray-900">🚗 차종/트림 표준 코드 관리</h1>
            <p className="text-gray-500 mt-2">AI가 수집한 차량 모델과 트림 정보를 관리합니다. 중복된 데이터는 정리해주세요.</p>
        </div>
        <button onClick={fetchModels} className="bg-white border px-4 py-2 rounded-lg font-bold hover:bg-gray-50">
            🔄 새로고침
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-100 border-b text-gray-600 uppercase text-xs">
            <tr>
              <th className="p-4 w-16"></th>
              <th className="p-4">모델명 (ID)</th>
              <th className="p-4">연식</th>
              <th className="p-4">등록된 트림 수</th>
              <th className="p-4">등록일시</th>
              <th className="p-4 text-center">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
                <tr><td colSpan={6} className="p-10 text-center">데이터 로딩 중...</td></tr>
            ) : models.length === 0 ? (
                <tr><td colSpan={6} className="p-10 text-center text-gray-500">등록된 차종 코드가 없습니다.</td></tr>
            ) : (
                models.map((m) => (
                <>
                  {/* 메인 행 (모델) */}
                  <tr
                    key={m.id}
                    className={`hover:bg-blue-50 cursor-pointer transition-colors ${expandedRow === m.id ? 'bg-blue-50' : 'bg-white'}`}
                    onClick={() => toggleRow(m.id)}
                  >
                    <td className="p-4 text-gray-400">
                        {expandedRow === m.id ? <ChevronUp/> : <ChevronDown/>}
                    </td>
                    <td className="p-4">
                        <div className="font-bold text-lg text-gray-800">{m.model_name}</div>
                        <div className="text-xs text-gray-400">ID: {m.id} | {m.brand}</div>
                    </td>
                    <td className="p-4 font-bold text-gray-600">{m.year}년형</td>
                    <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${m.car_code_trims.length > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {m.car_code_trims.length}개 트림
                        </span>
                    </td>
                    <td className="p-4 text-gray-400 text-sm">{new Date(m.created_at).toLocaleDateString()}</td>
                    <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleDeleteModel(m.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded">
                        삭제
                      </button>
                    </td>
                  </tr>

                  {/* 하위 확장 행 (트림 리스트) */}
                  {expandedRow === m.id && (
                    <tr className="bg-gray-50">
                        <td colSpan={6} className="p-0">
                            <div className="p-6 border-b border-t border-gray-200 shadow-inner">
                                <h4 className="text-sm font-bold text-gray-500 mb-3 flex items-center gap-2">
                                    📜 [{m.model_name}] 상세 트림 목록
                                </h4>
                                {m.car_code_trims.length === 0 ? (
                                    <div className="text-center py-4 text-gray-400 bg-white rounded-lg border border-dashed">
                                        등록된 트림 정보가 없습니다. (차량 등록 시 AI가 자동 수집합니다)
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {m.car_code_trims
                                            .sort((a:any, b:any) => a.price - b.price) // 가격순 정렬
                                            .map((t: any) => (
                                            <div key={t.id} className="bg-white p-3 rounded-lg border flex justify-between items-center hover:border-blue-300 transition-colors">
                                                <div>
                                                    <div className="font-bold text-gray-800">{t.trim_name}</div>
                                                    <div className="text-xs text-gray-500">{t.fuel_type || '연료미상'}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-blue-600">{f(t.price)}원</div>
                                                    <button
                                                        onClick={() => handleDeleteTrim(t.id)}
                                                        className="text-xs text-red-300 hover:text-red-500 mt-1 underline"
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
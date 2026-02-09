'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function ModelCodePage() {
  const [models, setModels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    const { data } = await supabase.from('vehicle_model_codes').select('*').order('created_at', { ascending: false })
    setModels(data || [])
    setLoading(false)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await supabase.from('vehicle_model_codes').delete().eq('id', id)
    fetchModels()
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <h1 className="text-3xl font-black mb-6">🚗 차종 코드 기준관리</h1>
      <p className="text-gray-500 mb-8">AI가 자동으로 등록하거나 수동으로 관리하는 차종 코드 데이터베이스입니다.</p>

      <div className="bg-white rounded-xl shadow border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-bold text-gray-600">코드 (ID)</th>
              <th className="p-4 font-bold text-gray-600">브랜드</th>
              <th className="p-4 font-bold text-gray-600">모델명</th>
              <th className="p-4 font-bold text-gray-600">등록일</th>
              <th className="p-4 font-bold text-gray-600">관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="p-10 text-center">로딩 중...</td></tr> :
             models.length === 0 ? <tr><td colSpan={5} className="p-10 text-center text-gray-500">등록된 차종 코드가 없습니다.</td></tr> :
             models.map((m) => (
              <tr key={m.id} className="border-b hover:bg-gray-50">
                <td className="p-4 font-mono text-blue-600 font-bold">{m.code}</td>
                <td className="p-4">{m.brand}</td>
                <td className="p-4 font-bold">{m.model_name}</td>
                <td className="p-4 text-gray-500 text-sm">{new Date(m.created_at).toLocaleDateString()}</td>
                <td className="p-4">
                  <button onClick={() => handleDelete(m.id)} className="text-red-500 hover:text-red-700 text-sm font-bold">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
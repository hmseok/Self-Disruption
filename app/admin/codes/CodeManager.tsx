'use client'

import { useState, useEffect } from 'react'
import { getAuthHeader } from '@/app/utils/auth-client'

export default function CodeManager() {
  const [codes, setCodes] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // 입력 폼 상태
  const [newCategory, setNewCategory] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newOrder, setNewOrder] = useState(10)

  // 데이터 불러오기
  const fetchCodes = async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/codes', { headers })

      if (res.ok) {
        const data = await res.json()
        setCodes(data || [])
      } else {
        alert('데이터 로딩 실패: ' + res.statusText)
      }
    } catch (error: any) {
      alert('데이터 로딩 실패: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCodes()
  }, [])

  // 코드 추가하기
  const handleAdd = async () => {
    if (!newCategory || !newCode || !newValue) {
      alert('필수 항목(그룹, 코드, 명칭)을 모두 입력해주세요!')
      return
    }

    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/codes', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newCategory.toUpperCase(),
          code: newCode.toUpperCase(),
          value: newValue,
          sort_order: newOrder,
          is_active: true
        })
      })

      if (res.ok) {
        alert('✅ 코드가 추가되었습니다!')
        setNewCode('')
        setNewValue('')
        fetchCodes()
      } else {
        const error = await res.json()
        alert('추가 실패: ' + (error.message || res.statusText))
      }
    } catch (error: any) {
      alert('추가 실패: ' + error.message)
    }
  }

  // 코드 삭제하기
  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/codes/${id}`, {
        method: 'DELETE',
        headers
      })

      if (res.ok) {
        fetchCodes()
      } else {
        const error = await res.json()
        alert('삭제 실패: ' + (error.message || res.statusText))
      }
    } catch (error: any) {
      alert('삭제 실패: ' + error.message)
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">🛠️ 공통 코드 관리</h2>

      {/* 1. 코드 추가 폼 */}
      <div className="mb-8 p-4 bg-gray-50 rounded border border-gray-200">
        <h3 className="font-bold text-gray-700 mb-3">➕ 새 코드 등록</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="그룹코드 (예: FUEL)"
            className="border p-2 rounded w-40 uppercase"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <input
            type="text"
            placeholder="코드값 (예: GAS)"
            className="border p-2 rounded w-32 uppercase"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />
          <input
            type="text"
            placeholder="명칭 (예: 가솔린)"
            className="border p-2 rounded flex-1"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
          <input
            type="number"
            placeholder="순서"
            className="border p-2 rounded w-20"
            value={newOrder}
            onChange={(e) => setNewOrder(Number(e.target.value))}
          />
          <button
            onClick={handleAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
          >
            추가
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          * 팁: 같은 그룹(예: COLOR)을 연속으로 입력할 땐 그룹코드를 놔두고 내용만 바꾸세요.
        </p>
      </div>

      {/* 2. 코드 목록 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="p-3">그룹 (Category)</th>
              <th className="p-3">코드 (Code)</th>
              <th className="p-3">명칭 (Value)</th>
              <th className="p-3">순서</th>
              <th className="p-3">관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-4 text-center">로딩 중...</td></tr>
            ) : codes.map((item) => (
              <tr key={item.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium text-blue-600">{item.category}</td>
                <td className="p-3 font-mono text-sm">{item.code}</td>
                <td className="p-3">{item.value}</td>
                <td className="p-3">{item.sort_order}</td>
                <td className="p-3">
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-500 hover:text-red-700 text-sm underline"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
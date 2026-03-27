'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../utils/supabase'
import DarkHeader from '../../components/DarkHeader'

interface Account {
  id: string
  fin_use_num: string
  bank_name: string
  account_num_masked: string
  account_holder_name: string
  token_expires_at: string
  is_active: boolean
}

export default function OpenbankingPage() {
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    // OAuth 콜백 결과 처리
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    const count = searchParams.get('count')

    if (success) {
      setMessage({ type: 'success', text: `계좌 연동 완료! ${count}개 계좌가 등록되었습니다.` })
    } else if (error) {
      setMessage({ type: 'error', text: `연동 실패: ${error}` })
    }

    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('openbanking_accounts')
        .select('*')
        .eq('is_active', true)
        .order('bank_name')

      if (error) throw error
      setAccounts(data || [])
    } catch (err) {
      console.error('Failed to fetch accounts:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = () => {
    window.location.href = '/api/openbanking/auth'
  }

  const handleSync = async () => {
    setSyncing(true)
    setMessage(null)

    try {
      const res = await fetch('/api/openbanking/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
      })

      const result = await res.json()

      if (result.success) {
        let text = `동기화 완료 — ${result.fetched}건 조회, ${result.inserted}건 저장`
        if (result.errors?.length > 0) {
          text += `\n오류: ${result.errors.join(', ')}`
        }
        setMessage({ type: result.errors?.length > 0 ? 'error' : 'success', text })
      } else {
        setMessage({ type: 'error', text: result.error || '동기화 실패' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '오류 발생' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <DarkHeader icon="Building2" title="오픈뱅킹 연동" subtitle="금융결제원 오픈뱅킹 API로 거래내역을 자동 수집합니다" />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">오픈뱅킹 거래내역 연동</h1>

        {/* 메시지 */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg whitespace-pre-line ${
            message.type === 'success'
              ? 'bg-green-900 border border-green-700 text-green-200'
              : 'bg-red-900 border border-red-700 text-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* 계좌 연동 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">연동된 계좌</h2>
              <p className="text-sm text-gray-400 mt-1">오픈뱅킹 인증을 통해 은행 계좌를 연동합니다</p>
            </div>
            <button
              onClick={handleConnect}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded"
            >
              + 계좌 연동
            </button>
          </div>

          {loading ? (
            <p className="text-gray-400">불러오는 중...</p>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">연동된 계좌가 없습니다.</p>
              <button
                onClick={handleConnect}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg"
              >
                🏦 계좌 연동하기
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-300">은행</th>
                    <th className="text-left py-3 px-4 text-gray-300">계좌번호</th>
                    <th className="text-left py-3 px-4 text-gray-300">예금주</th>
                    <th className="text-left py-3 px-4 text-gray-300">토큰 만료</th>
                    <th className="text-left py-3 px-4 text-gray-300">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => {
                    const expired = new Date(acc.token_expires_at) < new Date()
                    return (
                      <tr key={acc.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                        <td className="py-3 px-4 text-white font-medium">{acc.bank_name}</td>
                        <td className="py-3 px-4 text-gray-300">{acc.account_num_masked}</td>
                        <td className="py-3 px-4 text-gray-300">{acc.account_holder_name}</td>
                        <td className="py-3 px-4 text-gray-400 text-xs">
                          {new Date(acc.token_expires_at).toLocaleDateString('ko-KR')}
                        </td>
                        <td className="py-3 px-4">
                          {expired ? (
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-red-900 text-red-200">
                              만료 — 재연동 필요
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-green-900 text-green-200">
                              활성
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 거래내역 동기화 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">거래내역 동기화</h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">시작일</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">종료일</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              />
            </div>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing || accounts.length === 0}
            className={`w-full py-3 px-4 rounded font-bold text-white ${
              syncing || accounts.length === 0
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {syncing ? '동기화 중...' : '지금 동기화'}
          </button>
        </div>
      </div>
    </div>
  )
}

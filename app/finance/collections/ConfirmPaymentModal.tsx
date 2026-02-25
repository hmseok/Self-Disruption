'use client'

import { useState } from 'react'

type Schedule = {
  id: string
  contract_type: string
  contract_id: string
  payment_date: string
  expected_amount: number
  customer_name?: string
}

type Props = {
  schedule: Schedule
  token: string
  onClose: () => void
  onConfirm: () => void
}

export default function ConfirmPaymentModal({ schedule, token, onClose, onConfirm }: Props) {
  const [amount, setAmount] = useState(String(schedule.expected_amount))
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [method, setMethod] = useState('계좌이체')
  const [memo, setMemo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      setError('금액을 입력해주세요.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/collections/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schedule_id: schedule.id,
          actual_amount: Number(amount),
          payment_date: paymentDate,
          payment_method: method,
          memo,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '수금 확인 실패')

      onConfirm()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const nf = (n: number) => n.toLocaleString('ko-KR')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-black text-gray-900">수금 확인</h2>
        </div>

        <div className="p-6 space-y-4">
          {/* 스케줄 정보 */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">고객명</span>
              <span className="font-bold text-gray-900">{schedule.customer_name || '-'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">납부 기한</span>
              <span className="font-bold text-gray-900">{schedule.payment_date}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">청구 금액</span>
              <span className="font-black text-steel-600">{nf(schedule.expected_amount)}원</span>
            </div>
          </div>

          {/* 입금 금액 */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">입금 금액 *</label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-steel-600 text-right pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">원</span>
            </div>
          </div>

          {/* 입금일 */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">입금일 *</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
            />
          </div>

          {/* 결제 수단 */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">결제 수단</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
            >
              <option value="계좌이체">계좌이체</option>
              <option value="현금">현금</option>
              <option value="카드">카드</option>
              <option value="기타">기타</option>
            </select>
          </div>

          {/* 메모 */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">메모</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="선택 입력"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? '처리 중...' : '수금 확인'}
          </button>
        </div>
      </div>
    </div>
  )
}

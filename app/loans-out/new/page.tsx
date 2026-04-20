'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/auth-client'

async function headers(): Promise<Record<string, string>> {
  try {
    const user = auth.currentUser
    if (!user) return { 'Content-Type': 'application/json' }
    const token = await user.getIdToken(false)
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  } catch {
    return { 'Content-Type': 'application/json' }
  }
}

export default function NewLoanOutPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState<any>({
    borrower_name: '',
    borrower_phone: '',
    borrower_reg_number: '',
    principal_amount: 0,
    interest_rate: 3.0,
    tax_type: '이자소득(27.5%)',
    repayment_type: 'interest_only',
    payment_day: 25,
    grace_period_months: 0,
    contract_start_date: new Date().toISOString().slice(0, 10),
    contract_end_date: '',
    purpose: '',
    collateral: '',
    status: 'active',
    memo: '',
  })

  const submit = async () => {
    if (!f.borrower_name || !f.principal_amount) {
      alert('차주명과 원금을 입력하세요')
      return
    }
    setSaving(true)
    try {
      const h = await headers()
      const res = await fetch('/api/loans-out', {
        method: 'POST', headers: h, body: JSON.stringify(f)
      }).then(r => r.json())
      if (res.error) throw new Error(res.error)
      alert('대여 등록 완료')
      router.push(`/loans-out/${res.data.id}`)
    } catch (e: any) {
      alert('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const input = (k: string, label: string, type = 'text', extra: any = {}) => (
    <div>
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      <input type={type} value={f[k]} onChange={e => setF({ ...f, [k]: type === 'number' ? Number(e.target.value) : e.target.value })}
        {...extra}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white" />
    </div>
  )

  return (
    <div className="max-w-[800px] mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-700">←</button>
        <h1 className="text-xl font-bold text-slate-900">신규 대여 계약 등록</h1>
      </div>

      <div className="bg-white/72 border border-black/[0.06] rounded-2xl p-6 shadow-sm space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {input('borrower_name', '차주(대여받는 사람/업체) *')}
          {input('borrower_phone', '전화번호')}
          {input('borrower_reg_number', '주민/사업자번호')}
          {input('principal_amount', '원금 (원) *', 'number')}
          {input('interest_rate', '연 이율 (%)', 'number', { step: 0.1 })}
          <div>
            <label className="text-xs font-semibold text-slate-500">상환 방식</label>
            <select value={f.repayment_type} onChange={e => setF({ ...f, repayment_type: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
              <option value="interest_only">이자만 (매월)</option>
              <option value="principal_interest">원리금 균등</option>
              <option value="bullet">만기 일시 (원금+이자)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">세금 유형</label>
            <select value={f.tax_type} onChange={e => setF({ ...f, tax_type: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
              <option value="이자소득(27.5%)">이자소득 (27.5%)</option>
              <option value="사업소득(3.3%)">사업소득 (3.3%)</option>
              <option value="비과세">비과세</option>
            </select>
          </div>
          {input('payment_day', '지급일 (매월)', 'number', { min: 1, max: 31 })}
          {input('grace_period_months', '거치기간 (개월)', 'number', { min: 0 })}
          {input('contract_start_date', '시작일', 'date')}
          {input('contract_end_date', '종료일', 'date')}
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500">대여 사유</label>
          <input value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value })}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
            placeholder="예: 운영자금, 차량구입 등" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">담보/보증</label>
          <input value={f.collateral} onChange={e => setF({ ...f, collateral: e.target.value })}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
            placeholder="예: 차량저당, 보증인 홍길동" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">메모</label>
          <textarea value={f.memo} onChange={e => setF({ ...f, memo: e.target.value })}
            rows={3} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => router.back()} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600">취소</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold disabled:opacity-60">
            {saving ? '저장 중...' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

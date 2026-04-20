'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/auth-client'

type LoanOut = {
  id: string
  borrower_name: string
  borrower_phone?: string
  principal_amount: number | string
  current_balance: number | string
  interest_rate: number | string
  tax_type: string
  repayment_type: string
  payment_day: number
  contract_start_date: string | null
  contract_end_date: string | null
  purpose?: string
  status: string
  memo?: string
}

const N = (v: any): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const f = (n: any) => N(n).toLocaleString('ko-KR')
const fm = (n: any) => { const x = N(n); if (x >= 1e8) return (x / 1e8).toFixed(2) + '억'; if (x >= 1e4) return (x / 1e4).toFixed(0) + '만'; return f(x) }

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

export default function LoansOutPage() {
  const router = useRouter()
  const [rows, setRows] = useState<LoanOut[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'all' | 'active' | 'completed' | 'default'>('active')
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const h = await headers()
      const res = await fetch('/api/loans-out', { headers: h }).then(r => r.json())
      setRows(res.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (status !== 'all' && r.status !== status) return false
      if (search && !r.borrower_name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [rows, status, search])

  const stats = useMemo(() => {
    const active = rows.filter(r => r.status === 'active')
    const principal = active.reduce((s, r) => s + N(r.principal_amount), 0)
    const balance = active.reduce((s, r) => s + N(r.current_balance), 0)
    const monthlyInterest = active.reduce((s, r) =>
      s + Math.floor(N(r.current_balance || r.principal_amount) * N(r.interest_rate) / 100 / 12), 0)
    return { count: active.length, principal, balance, monthlyInterest }
  }, [rows])

  const repaymentLabel = (t: string) =>
    t === 'interest_only' ? '이자만' : t === 'principal_interest' ? '원리금균등' : t === 'bullet' ? '만기일시' : t

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">💸 대여금 관리</h1>
          <p className="text-xs text-slate-500 mt-1">회사 → 외부 대여 · 이자 수입 관리</p>
        </div>
        <button onClick={() => router.push('/loans-out/new')}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold shadow-sm">
          + 신규 대여
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: '운용 계약', value: stats.count + '건', tint: 'blue' },
          { label: '총 원금', value: fm(stats.principal), tint: 'emerald' },
          { label: '미상환 잔액', value: fm(stats.balance), tint: 'amber' },
          { label: '월 이자(세전)', value: fm(stats.monthlyInterest), tint: 'cyan' },
        ].map((k, i) => (
          <div key={i} style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.60)',
            border: '1px solid ' + (
              k.tint === 'blue' ? 'rgba(59,110,181,0.25)' :
              k.tint === 'emerald' ? 'rgba(16,185,129,0.25)' :
              k.tint === 'amber' ? 'rgba(202,138,4,0.25)' :
              'rgba(8,145,178,0.25)'
            ),
            boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)',
          }}>
            <div className="text-xs font-semibold text-slate-500">{k.label}</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{k.value}</div>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex gap-2 mb-3 items-center">
        {(['all', 'active', 'completed', 'default'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold ${status === s ? 'bg-cyan-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {s === 'all' ? '전체' : s === 'active' ? '운용중' : s === 'completed' ? '완료' : '연체'}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="차주명 검색..."
          className="ml-auto px-3 py-1.5 rounded-md border border-slate-200 text-sm w-60" />
      </div>

      {/* 테이블 */}
      <div className="bg-white/72 backdrop-blur-xl border border-black/[0.06] rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-20 text-center text-slate-400">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-20 text-center text-slate-400">
            대여 계약이 없습니다. 상단 "신규 대여" 버튼을 눌러 등록하세요.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="p-3 text-xs font-bold text-slate-500">차주</th>
                <th className="p-3 text-xs font-bold text-slate-500">원금</th>
                <th className="p-3 text-xs font-bold text-slate-500">잔액</th>
                <th className="p-3 text-xs font-bold text-slate-500 text-center">이율</th>
                <th className="p-3 text-xs font-bold text-slate-500 text-center">상환방식</th>
                <th className="p-3 text-xs font-bold text-slate-500 text-right">월 이자(세전)</th>
                <th className="p-3 text-xs font-bold text-slate-500 text-center">기간</th>
                <th className="p-3 text-xs font-bold text-slate-500 text-center">상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const monthlyGross = Math.floor(N(r.current_balance || r.principal_amount) * N(r.interest_rate) / 100 / 12)
                return (
                  <tr key={r.id} onClick={() => router.push(`/loans-out/${r.id}`)}
                    className="border-t border-slate-100 hover:bg-cyan-50/40 cursor-pointer">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{r.borrower_name}</div>
                      {r.borrower_phone && <div className="text-xs text-slate-400">{r.borrower_phone}</div>}
                    </td>
                    <td className="p-3 font-bold text-slate-900">{f(r.principal_amount)}</td>
                    <td className="p-3 text-slate-700">{f(r.current_balance)}</td>
                    <td className="p-3 text-center">
                      <span className="text-xs font-bold bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded">
                        연 {N(r.interest_rate).toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 text-center text-xs text-slate-600">{repaymentLabel(r.repayment_type)}</td>
                    <td className="p-3 text-right font-bold text-emerald-600">{f(monthlyGross)}</td>
                    <td className="p-3 text-center text-xs text-slate-500">
                      {r.contract_start_date?.slice(0, 10) || '—'}<br/>~ {r.contract_end_date?.slice(0, 10) || '—'}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        r.status === 'active' ? 'bg-green-100 text-green-700' :
                        r.status === 'completed' ? 'bg-slate-100 text-slate-600' :
                        r.status === 'default' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {r.status === 'active' ? '운용중' : r.status === 'completed' ? '완료' : r.status === 'default' ? '연체' : r.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

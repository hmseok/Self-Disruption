'use client'

// ============================================
// 지입투자자 상세 페이지
// - 계약 기본정보 / 입출금 내역 / 정산 공유 이력 / 연결 차량
// ============================================

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Contract = {
  id: string | number
  investor_name: string
  investor_phone?: string
  investor_email?: string
  investor_address?: string
  investor_reg_number?: string
  bank_name?: string
  account_number?: string
  account_holder?: string
  invest_amount: number
  share_ratio: number
  admin_fee?: number
  monthly_management_fee?: number
  profit_share_ratio?: number
  payout_day?: number
  contract_period_start?: string
  contract_period_end?: string
  contract_start_date?: string
  contract_end_date?: string
  tax_type?: string
  status?: string
  memo?: string
  current_balance?: number
  car_id?: string | number
  mortgage_setup?: boolean | number
}

type TxRow = {
  id: string
  transaction_date: string
  type: string
  amount: number
  description?: string
  client_name?: string
  category?: string
  memo?: string
  status?: string
  related_type?: string
  related_id?: string
}

type ShareRow = {
  id: string
  token: string
  settlement_month: string
  recipient_name: string
  total_amount: number
  payment_date?: string
  status: string
  created_at: string
}

type Car = {
  id: string
  number?: string
  brand?: string
  model?: string
  year?: number | string
  status?: string
  fuel?: string
  // legacy aliases (fallback)
  car_number?: string
  car_name?: string
  manufacturer?: string
}

const N = (v: any): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
const f = (n: any) => N(n).toLocaleString()
const fm = (n: any) => {
  const num = N(n)
  if (num >= 100000000) return (num / 100000000).toFixed(2) + '억'
  if (num >= 10000) return (num / 10000).toFixed(0) + '만'
  return num.toLocaleString()
}

export default function JiipDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || '')

  const [contract, setContract] = useState<Contract | null>(null)
  const [txs, setTxs] = useState<TxRow[]>([])
  const [shares, setShares] = useState<ShareRow[]>([])
  const [car, setCar] = useState<Car | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [availableCars, setAvailableCars] = useState<any[]>([])

  useEffect(() => {
    if (!id) return
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { auth } = await import('@/lib/auth-client')
        const user = auth.currentUser
        const token = user ? await user.getIdToken(false) : ''
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

        const [cRes, tRes] = await Promise.all([
          fetch(`/api/jiip/${id}`, { headers }).then(r => r.json()).catch(() => ({ error: 'fetch 실패' })),
          fetch(`/api/transactions?related_type=jiip,jiip_share&related_id=${id}&limit=500`, { headers }).then(r => r.json()).catch(() => ({ data: [] })),
        ])

        if (cRes.error || !cRes.data) {
          setError(cRes.error || '계약을 찾을 수 없습니다')
          setLoading(false)
          return
        }

        const c: Contract = cRes.data
        setContract(c)

        const txList: TxRow[] = (tRes.data || []).map((t: any) => ({
          ...t,
          amount: N(t.amount),
        }))
        setTxs(txList)

        const loads: Promise<any>[] = []
        if (c.investor_name) {
          loads.push(
            fetch(`/api/settlement/shares?limit=500`, { headers }).then(r => r.json()).catch(() => ({ data: [] }))
          )
        }
        if (c.car_id) {
          loads.push(
            fetch(`/api/cars/${c.car_id}`, { headers }).then(r => r.json()).catch(() => ({ data: null }))
          )
        }
        const results = await Promise.all(loads)
        if (c.investor_name && results[0]) {
          const all: ShareRow[] = results[0].data || []
          setShares(all.filter((s: ShareRow) => s.recipient_name === c.investor_name))
        }
        if (c.car_id && results[c.investor_name ? 1 : 0]?.data) {
          setCar(results[c.investor_name ? 1 : 0].data)
        }
      } catch (e: any) {
        setError(e.message || '로드 실패')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const stats = useMemo(() => {
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const sharedTotal = shares.reduce((s, sh) => s + N(sh.total_amount), 0)
    const paidCount = shares.filter(s => s.payment_date).length
    return { income, expense, sharedTotal, paidCount }
  }, [txs, shares])

  if (!id) return <div className="p-8 text-slate-500">잘못된 요청입니다.</div>

  const startDate = contract?.contract_start_date || contract?.contract_period_start
  const endDate = contract?.contract_end_date || contract?.contract_period_end

  async function openEdit() {
    if (!contract) return
    setForm({
      investor_name: contract.investor_name || '',
      investor_phone: contract.investor_phone || '',
      investor_email: contract.investor_email || '',
      investor_address: contract.investor_address || '',
      investor_reg_number: contract.investor_reg_number || '',
      bank_name: contract.bank_name || '',
      account_number: contract.account_number || '',
      account_holder: contract.account_holder || '',
      invest_amount: contract.invest_amount || 0,
      share_ratio: contract.share_ratio || 0,
      admin_fee: contract.admin_fee || 0,
      payout_day: contract.payout_day || 25,
      contract_start_date: (contract.contract_start_date || '').slice(0, 10),
      contract_end_date: (contract.contract_end_date || '').slice(0, 10),
      tax_type: contract.tax_type || '사업소득(3.3%)',
      status: contract.status || 'active',
      memo: contract.memo || '',
      mortgage_setup: !!contract.mortgage_setup,
      car_id: contract.car_id ? String(contract.car_id) : '',
    })
    setEditOpen(true)
    // 차량 목록 로드
    try {
      const { auth } = await import('@/lib/auth-client')
      const user = auth.currentUser
      const token = user ? await user.getIdToken(false) : ''
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const r = await fetch('/api/cars', { headers }).then(r => r.json())
      setAvailableCars(r.data || [])
    } catch {}
  }

  async function saveEdit() {
    if (!contract) return
    setSaving(true)
    try {
      const { auth } = await import('@/lib/auth-client')
      const user = auth.currentUser
      const token = user ? await user.getIdToken(false) : ''
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }
      const body = {
        ...form,
        car_id: form.car_id || null,
        contract_start_date: form.contract_start_date || null,
        contract_end_date: form.contract_end_date || null,
      }
      const res = await fetch(`/api/jiip/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok || j.error) {
        alert('저장 실패: ' + (j.error || res.statusText))
        return
      }
      setEditOpen(false)
      window.location.reload()
    } catch (e: any) {
      alert('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push('/finance/settlement?tab=contracts')}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← 계약 목록
          </button>
          <div className="text-xs text-slate-500">지입(위수탁) 계약 #{id}</div>
        </div>

        {loading && (
          <div className="p-12 bg-white/70 backdrop-blur rounded-2xl text-center text-slate-500">
            로딩 중...
          </div>
        )}

        {error && !loading && (
          <div className="p-8 bg-red-50 border border-red-200 rounded-2xl text-red-700">
            {error}
          </div>
        )}

        {contract && !loading && (
          <>
            {/* 계약 기본 정보 */}
            <div className="bg-white/72 backdrop-blur-xl border border-black/[0.06] rounded-2xl shadow-sm p-6 mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-xs text-violet-600 font-semibold mb-1">지입 (위수탁) 투자자</div>
                  <h1 className="text-2xl font-bold text-slate-900">{contract.investor_name}</h1>
                  {contract.investor_phone && <div className="text-sm text-slate-500 mt-1">{contract.investor_phone}</div>}
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <div>
                    <div className="text-xs text-slate-500">계약 상태</div>
                    <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                      contract.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {contract.status === 'active' ? '운용 중' : contract.status || '—'}
                    </div>
                  </div>
                  <button
                    onClick={openEdit}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                  >
                    ✏ 계약 수정
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="bg-blue-50/50 border border-blue-100/80 rounded-xl p-4">
                  <div className="text-xs text-slate-500">계약 자본금</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{fm(contract.invest_amount)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{f(contract.invest_amount)}원 (지입 차주 납입금)</div>
                </div>
                <div className="bg-green-50/50 border border-green-100/80 rounded-xl p-4">
                  <div className="text-xs text-slate-500">지분율</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{N(contract.share_ratio).toFixed(1)}%</div>
                  {contract.profit_share_ratio !== undefined && contract.profit_share_ratio !== null && (
                    <div className="text-[11px] text-slate-400 mt-1">수익분배 {N(contract.profit_share_ratio).toFixed(1)}%</div>
                  )}
                </div>
                <div className="bg-amber-50/50 border border-amber-100/80 rounded-xl p-4">
                  <div className="text-xs text-slate-500">관리비 / 지급일</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {contract.admin_fee ? fm(contract.admin_fee) : contract.monthly_management_fee ? fm(contract.monthly_management_fee) : '0'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">매월 {contract.payout_day || '—'}일 / {contract.tax_type || '—'}</div>
                </div>
                <div className="bg-violet-50/50 border border-violet-100/80 rounded-xl p-4">
                  <div className="text-xs text-slate-500">계약 기간</div>
                  <div className="text-sm font-semibold text-slate-900 mt-1">
                    {startDate?.slice(0, 10) || '—'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    ~ {endDate?.slice(0, 10) || '—'}
                  </div>
                </div>
              </div>

              {/* 계좌 / 차량 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="bg-slate-50/70 border border-black/[0.05] rounded-xl p-4">
                  <div className="text-xs text-slate-500 mb-2">입금 계좌</div>
                  <div className="text-sm text-slate-900">
                    {contract.bank_name || '—'} {contract.account_number || ''}
                  </div>
                  {contract.account_holder && (
                    <div className="text-xs text-slate-500 mt-1">예금주 {contract.account_holder}</div>
                  )}
                </div>
                <div className="bg-slate-50/70 border border-black/[0.05] rounded-xl p-4">
                  <div className="text-xs text-slate-500 mb-2">연결 차량</div>
                  {car ? (
                    <button
                      onClick={() => router.push(`/cars/${car.id}`)}
                      className="text-left w-full group"
                    >
                      <div className="text-sm font-bold text-blue-600 group-hover:underline">
                        {car.number || car.car_number || `차량 #${car.id}`}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {[car.brand || car.manufacturer, car.model].filter(Boolean).join(' ') || '—'}
                        {car.year ? ` · ${car.year}년` : ''}
                      </div>
                      {car.status && (
                        <div className="text-[10px] text-slate-400 mt-0.5">상태: {car.status}</div>
                      )}
                    </button>
                  ) : contract.car_id ? (
                    <div className="text-sm text-slate-900">차량 ID #{contract.car_id} <span className="text-[11px] text-slate-400">(로드 중...)</span></div>
                  ) : (
                    <div className="text-sm text-slate-400">미연결</div>
                  )}
                  {contract.mortgage_setup ? (
                    <div className="text-[11px] text-red-500 mt-1">🔒 저당 설정</div>
                  ) : null}
                </div>
              </div>

              {contract.memo && (
                <div className="mt-4 text-sm text-slate-600 bg-amber-50/40 border border-amber-100 rounded-lg p-3">
                  📝 {contract.memo}
                </div>
              )}
            </div>

            {/* 요약 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="총 입금액" value={fm(stats.income)} color="green" sub={`${f(stats.income)}원`} />
              <StatCard label="총 출금액" value={fm(stats.expense)} color="red" sub={`${f(stats.expense)}원`} />
              <StatCard label="정산서 발급" value={`${shares.length}건`} color="blue" sub={`지급완료 ${stats.paidCount}건`} />
              <StatCard label="누적 정산 합계" value={fm(stats.sharedTotal)} color="violet" sub={`${f(stats.sharedTotal)}원`} />
            </div>

            {/* 입출금 내역 */}
            <div className="bg-white/72 backdrop-blur-xl border border-black/[0.06] rounded-2xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">입출금 내역 <span className="text-sm font-normal text-slate-500">({txs.length}건)</span></h2>

              {txs.length === 0 ? (
                <div className="text-center text-slate-400 py-8 text-sm">연결된 거래 내역이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-200">
                        <th className="text-left py-2 px-2">거래일</th>
                        <th className="text-left py-2 px-2">구분</th>
                        <th className="text-right py-2 px-2">금액</th>
                        <th className="text-left py-2 px-2">카테고리</th>
                        <th className="text-left py-2 px-2">설명</th>
                        <th className="text-left py-2 px-2">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.map(t => (
                        <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/40">
                          <td className="py-2 px-2 text-slate-700">{t.transaction_date?.slice(0, 10)}</td>
                          <td className="py-2 px-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              t.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {t.type === 'income' ? '입금' : '출금'}
                            </span>
                          </td>
                          <td className={`py-2 px-2 text-right font-semibold ${t.type === 'income' ? 'text-green-700' : 'text-red-700'}`}>
                            {f(t.amount)}원
                          </td>
                          <td className="py-2 px-2 text-slate-600">{t.category || '—'}</td>
                          <td className="py-2 px-2 text-slate-600 max-w-xs truncate" title={t.description}>
                            {t.client_name || t.description || '—'}
                          </td>
                          <td className="py-2 px-2 text-slate-500 text-xs max-w-xs truncate" title={t.memo}>{t.memo || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 정산 공유 이력 */}
            <div className="bg-white/72 backdrop-blur-xl border border-black/[0.06] rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">정산 내역 <span className="text-sm font-normal text-slate-500">({shares.length}건)</span></h2>

              {shares.length === 0 ? (
                <div className="text-center text-slate-400 py-8 text-sm">발급된 정산서가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-200">
                        <th className="text-left py-2 px-2">정산월</th>
                        <th className="text-right py-2 px-2">정산 금액</th>
                        <th className="text-left py-2 px-2">지급일</th>
                        <th className="text-left py-2 px-2">상태</th>
                        <th className="text-left py-2 px-2">발급일</th>
                        <th className="text-left py-2 px-2">정산서</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shares.map(s => (
                        <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/40">
                          <td className="py-2 px-2 font-semibold text-slate-800">{s.settlement_month}</td>
                          <td className="py-2 px-2 text-right font-semibold text-slate-900">{f(s.total_amount)}원</td>
                          <td className="py-2 px-2 text-slate-600">{s.payment_date ? s.payment_date.slice(0, 10) : '—'}</td>
                          <td className="py-2 px-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              s.payment_date ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {s.payment_date ? '지급완료' : '대기'}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-xs text-slate-500">{s.created_at?.slice(0, 10)}</td>
                          <td className="py-2 px-2">
                            <a href={`/settlement/view/${s.token}`} target="_blank" rel="noopener noreferrer"
                               className="text-blue-600 hover:underline text-xs">📄 열람</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── 계약 수정 모달 ── */}
        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-3xl p-6 my-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900">지입 계약 수정</h2>
                <button onClick={() => setEditOpen(false)} className="text-slate-500 hover:text-slate-800 text-lg">✕</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <Field label="투자자명" value={form.investor_name} onChange={v => setForm({ ...form, investor_name: v })} />
                <Field label="전화번호" value={form.investor_phone} onChange={v => setForm({ ...form, investor_phone: v })} placeholder="010-0000-0000" />
                <Field label="이메일" value={form.investor_email} onChange={v => setForm({ ...form, investor_email: v })} />
                <Field label="주민등록번호" value={form.investor_reg_number} onChange={v => setForm({ ...form, investor_reg_number: v })} placeholder="000000-0000000" />
                <div className="md:col-span-2">
                  <Field label="주소" value={form.investor_address} onChange={v => setForm({ ...form, investor_address: v })} />
                </div>

                <Field label="은행" value={form.bank_name} onChange={v => setForm({ ...form, bank_name: v })} />
                <Field label="계좌번호" value={form.account_number} onChange={v => setForm({ ...form, account_number: v })} />
                <Field label="예금주" value={form.account_holder} onChange={v => setForm({ ...form, account_holder: v })} />

                <div>
                  <label className="text-xs text-slate-500">연결 차량</label>
                  <select value={form.car_id} onChange={e => setForm({ ...form, car_id: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                    <option value="">미연결</option>
                    {availableCars.map(c => (
                      <option key={c.id} value={c.id}>{c.number || '(번호없음)'} · {c.brand || ''} {c.model || ''}</option>
                    ))}
                  </select>
                </div>

                <Field label="계약 자본금 (원)" type="number" value={form.invest_amount} onChange={v => setForm({ ...form, invest_amount: Number(v) || 0 })} />
                <Field label="지분율 (%)" type="number" step="0.1" value={form.share_ratio} onChange={v => setForm({ ...form, share_ratio: Number(v) || 0 })} />
                <Field label="월 관리비 (원)" type="number" value={form.admin_fee} onChange={v => setForm({ ...form, admin_fee: Number(v) || 0 })} />
                <Field label="지급일 (일)" type="number" value={form.payout_day} onChange={v => setForm({ ...form, payout_day: Number(v) || 0 })} />

                <Field label="계약 시작일" type="date" value={form.contract_start_date} onChange={v => setForm({ ...form, contract_start_date: v })} />
                <Field label="계약 종료일" type="date" value={form.contract_end_date} onChange={v => setForm({ ...form, contract_end_date: v })} />

                <div>
                  <label className="text-xs text-slate-500">세금 유형</label>
                  <select value={form.tax_type} onChange={e => setForm({ ...form, tax_type: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                    <option value="사업소득(3.3%)">사업소득 (3.3%)</option>
                    <option value="이자소득(27.5%)">이자소득 (27.5%)</option>
                    <option value="세금계산서">세금계산서 (VAT)</option>
                    <option value="비과세">비과세</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">계약 상태</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                    <option value="active">운용 중</option>
                    <option value="expired">만기</option>
                    <option value="terminated">해지</option>
                  </select>
                </div>

                <div className="md:col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="mortgage_setup" checked={!!form.mortgage_setup}
                    onChange={e => setForm({ ...form, mortgage_setup: e.target.checked })} />
                  <label htmlFor="mortgage_setup" className="text-sm text-slate-700">🔒 저당 설정</label>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">메모</label>
                  <textarea value={form.memo || ''} onChange={e => setForm({ ...form, memo: e.target.value })}
                    rows={2} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-slate-200">
                <button onClick={() => setEditOpen(false)} disabled={saving}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold">
                  취소
                </button>
                <button onClick={saveEdit} disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, step }: {
  label: string
  value: any
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  step?: string
}) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type={type}
        step={step}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
      />
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: 'blue' | 'green' | 'red' | 'amber' | 'violet' }) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-100/80',
    green: 'border-green-100/80',
    red: 'border-red-100/80',
    amber: 'border-amber-100/80',
    violet: 'border-violet-100/80',
  }
  return (
    <div className={`bg-white/60 backdrop-blur-xl border ${colorMap[color]} rounded-2xl p-4 shadow-sm`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

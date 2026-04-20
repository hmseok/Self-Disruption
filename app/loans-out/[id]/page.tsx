'use client'

// ============================================
// 대여(회사→외부) 상세 페이지
// - 계약 기본정보 / 이자 수입 내역 / 정산 이력
// ============================================

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { auth } from '@/lib/auth-client'

type Contract = {
  id: string
  borrower_name: string
  borrower_phone?: string
  borrower_email?: string
  borrower_reg_number?: string
  borrower_address?: string
  principal_amount: number | string
  current_balance: number | string
  interest_rate: number | string
  tax_type: string
  repayment_type: string
  payment_day: number
  grace_period_months?: number
  contract_start_date?: string
  contract_end_date?: string
  purpose?: string
  collateral?: string
  status?: string
  memo?: string
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

type LedgerRow = {
  id: string
  settlement_month: string
  contract_type: string
  contract_id: string
  recipient_name?: string
  due_amount: number | string
  paid_amount?: number | string
  status: string
  matched_at?: string
  created_at?: string
}

const N = (v: any): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
const f = (n: any) => N(n).toLocaleString('ko-KR')
const fm = (n: any) => {
  const num = N(n)
  if (num >= 1e8) return (num / 1e8).toFixed(2) + '억'
  if (num >= 1e4) return (num / 1e4).toFixed(0) + '만'
  return num.toLocaleString('ko-KR')
}

async function buildHeaders(): Promise<Record<string, string>> {
  try {
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export default function LoanOutDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || '')

  const [contract, setContract] = useState<Contract | null>(null)
  const [txs, setTxs] = useState<TxRow[]>([])
  const [ledgers, setLedgers] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const h = await buildHeaders()
      const [cRes, tRes, lRes] = await Promise.all([
        fetch(`/api/loans-out/${id}`, { headers: h }).then(r => r.json()).catch(() => ({ error: 'fetch 실패' })),
        fetch(`/api/transactions?related_type=loan_out&related_id=${id}&limit=500`, { headers: h }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/settlement/ledger?contract_type=loan_out&contract_id=${id}`, { headers: h }).then(r => r.json()).catch(() => ({ data: [] })),
      ])

      if (cRes.error || !cRes.data) {
        setError(cRes.error || '계약을 찾을 수 없습니다')
        setLoading(false)
        return
      }
      setContract(cRes.data)
      setTxs((tRes.data || []).map((t: any) => ({ ...t, amount: N(t.amount) })))
      setLedgers(lRes.data || [])
    } catch (e: any) {
      setError(e.message || '로드 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!id) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const stats = useMemo(() => {
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const principal = N(contract?.principal_amount)
    const balance = N(contract?.current_balance)
    const rate = N(contract?.interest_rate)
    const monthlyGross = Math.floor((balance || principal) * rate / 100 / 12)
    const taxRate = contract?.tax_type?.includes('27.5') ? 0.275
      : contract?.tax_type?.includes('3.3') ? 0.033 : 0
    const monthlyNet = Math.floor(monthlyGross * (1 - taxRate))
    return { income, expense, principal, balance, rate, monthlyGross, monthlyNet }
  }, [txs, contract])

  const repaymentLabel = (t?: string) =>
    t === 'interest_only' ? '이자만 (매월)' :
    t === 'principal_interest' ? '원리금 균등' :
    t === 'bullet' ? '만기 일시' : (t || '—')

  async function openEdit() {
    if (!contract) return
    setForm({
      borrower_name: contract.borrower_name || '',
      borrower_phone: contract.borrower_phone || '',
      borrower_email: contract.borrower_email || '',
      borrower_reg_number: contract.borrower_reg_number || '',
      borrower_address: contract.borrower_address || '',
      principal_amount: N(contract.principal_amount),
      current_balance: N(contract.current_balance),
      interest_rate: N(contract.interest_rate),
      tax_type: contract.tax_type || '이자소득(27.5%)',
      repayment_type: contract.repayment_type || 'interest_only',
      payment_day: contract.payment_day || 25,
      grace_period_months: contract.grace_period_months || 0,
      contract_start_date: (contract.contract_start_date || '').slice(0, 10),
      contract_end_date: (contract.contract_end_date || '').slice(0, 10),
      purpose: contract.purpose || '',
      collateral: contract.collateral || '',
      status: contract.status || 'active',
      memo: contract.memo || '',
    })
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!contract) return
    setSaving(true)
    try {
      const h = await buildHeaders()
      const res = await fetch(`/api/loans-out/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({
          ...form,
          contract_start_date: form.contract_start_date || null,
          contract_end_date: form.contract_end_date || null,
        }),
      })
      const j = await res.json()
      if (!res.ok || j.error) {
        alert('저장 실패: ' + (j.error || res.statusText))
        return
      }
      setEditOpen(false)
      await load()
    } catch (e: any) {
      alert('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeContract() {
    if (!confirm('이 대여 계약을 삭제하시겠습니까?\n(거래/정산 이력은 유지됩니다)')) return
    try {
      const h = await buildHeaders()
      const res = await fetch(`/api/loans-out/${id}`, { method: 'DELETE', headers: h })
      const j = await res.json()
      if (!res.ok || j.error) {
        alert('삭제 실패: ' + (j.error || res.statusText))
        return
      }
      alert('삭제 완료')
      router.push('/loans-out')
    } catch (e: any) {
      alert('삭제 실패: ' + e.message)
    }
  }

  if (!id) return <div className="p-8 text-slate-500">잘못된 요청입니다.</div>

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/30 to-slate-50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.push('/loans-out')}
            className="text-sm text-slate-600 hover:text-slate-900">
            ← 대여금 목록
          </button>
          <div className="text-xs text-slate-500">대여(회사→외부) #{id.slice(0, 8)}</div>
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
                  <div className="text-xs text-cyan-600 font-semibold mb-1">💸 대여 (회사 → 외부)</div>
                  <h1 className="text-2xl font-bold text-slate-900">{contract.borrower_name}</h1>
                  {contract.borrower_phone && <div className="text-sm text-slate-500 mt-1">{contract.borrower_phone}</div>}
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <div>
                    <div className="text-xs text-slate-500">계약 상태</div>
                    <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                      contract.status === 'active' ? 'bg-green-100 text-green-700' :
                      contract.status === 'completed' ? 'bg-slate-100 text-slate-600' :
                      contract.status === 'default' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {contract.status === 'active' ? '운용 중' :
                       contract.status === 'completed' ? '완료' :
                       contract.status === 'default' ? '연체' : contract.status || '—'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={openEdit}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold">
                      ✏ 계약 수정
                    </button>
                    <button onClick={removeContract}
                      className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold">
                      🗑 삭제
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="bg-blue-50/50 border border-blue-100/80 rounded-xl p-4">
                  <div className="text-xs text-slate-500">대여 원금</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{fm(contract.principal_amount)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{f(contract.principal_amount)}원</div>
                </div>
                <div className="bg-amber-50/50 border border-amber-100/80 rounded-xl p-4">
                  <div className="text-xs text-slate-500">미상환 잔액</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{fm(contract.current_balance)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{f(contract.current_balance)}원</div>
                </div>
                <div className="bg-cyan-50/50 border border-cyan-100/80 rounded-xl p-4">
                  <div className="text-xs text-slate-500">연 이율</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{N(contract.interest_rate).toFixed(1)}%</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {repaymentLabel(contract.repayment_type)}
                  </div>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-100/80 rounded-xl p-4">
                  <div className="text-xs text-slate-500">월 이자 (세전/세후)</div>
                  <div className="text-xl font-bold text-emerald-700 mt-1">{fm(stats.monthlyGross)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    세후 {f(stats.monthlyNet)}원 · {contract.tax_type}
                  </div>
                </div>
              </div>

              {/* 추가 정보 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="bg-slate-50/70 border border-black/[0.05] rounded-xl p-4">
                  <div className="text-xs text-slate-500 mb-2">계약 기간</div>
                  <div className="text-sm text-slate-900">
                    {contract.contract_start_date?.slice(0, 10) || '—'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    ~ {contract.contract_end_date?.slice(0, 10) || '—'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    지급일: 매월 {contract.payment_day || '—'}일
                    {contract.grace_period_months ? ` · 거치 ${contract.grace_period_months}개월` : ''}
                  </div>
                </div>
                <div className="bg-slate-50/70 border border-black/[0.05] rounded-xl p-4">
                  <div className="text-xs text-slate-500 mb-2">차주 정보</div>
                  {contract.borrower_reg_number && (
                    <div className="text-xs text-slate-500">{contract.borrower_reg_number}</div>
                  )}
                  {contract.borrower_email && (
                    <div className="text-xs text-slate-500 mt-0.5">{contract.borrower_email}</div>
                  )}
                  {contract.borrower_address && (
                    <div className="text-xs text-slate-500 mt-0.5 truncate">{contract.borrower_address}</div>
                  )}
                  {!contract.borrower_reg_number && !contract.borrower_email && !contract.borrower_address && (
                    <div className="text-xs text-slate-400">추가 정보 없음</div>
                  )}
                </div>
                <div className="bg-slate-50/70 border border-black/[0.05] rounded-xl p-4">
                  <div className="text-xs text-slate-500 mb-2">대여 사유 / 담보</div>
                  {contract.purpose && <div className="text-xs text-slate-700">📌 {contract.purpose}</div>}
                  {contract.collateral && <div className="text-xs text-slate-700 mt-1">🔒 {contract.collateral}</div>}
                  {!contract.purpose && !contract.collateral && (
                    <div className="text-xs text-slate-400">담보/사유 없음</div>
                  )}
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
              <StatCard label="누적 이자 수입" value={fm(stats.income)} color="emerald" sub={`${f(stats.income)}원`} />
              <StatCard label="원금 대여 지급" value={fm(stats.expense)} color="red" sub={`${f(stats.expense)}원`} />
              <StatCard label="정산 레코드" value={`${ledgers.length}건`} color="blue"
                sub={`매칭 ${ledgers.filter(l => l.status === 'matched' || l.status === 'paid').length}건`} />
              <StatCard label="상환 진행률" value={
                stats.principal > 0 ? `${((1 - stats.balance / stats.principal) * 100).toFixed(1)}%` : '—'
              } color="violet" sub={`잔액 ${fm(stats.balance)}`} />
            </div>

            {/* 입출금 내역 */}
            <div className="bg-white/72 backdrop-blur-xl border border-black/[0.06] rounded-2xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">
                이자/원금 거래 내역 <span className="text-sm font-normal text-slate-500">({txs.length}건)</span>
              </h2>

              {txs.length === 0 ? (
                <div className="text-center text-slate-400 py-8 text-sm">
                  연결된 거래 내역이 없습니다. <br/>
                  <span className="text-xs">입출금 내역 등록 시 <code className="bg-slate-100 px-1">related_type='loan_out'</code>, <code className="bg-slate-100 px-1">related_id={id.slice(0,8)}...</code>로 연결됩니다.</span>
                </div>
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
                        <tr key={t.id} className="border-b border-slate-100 hover:bg-cyan-50/30">
                          <td className="py-2 px-2 text-slate-700">{t.transaction_date?.slice(0, 10)}</td>
                          <td className="py-2 px-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              t.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {t.type === 'income' ? '이자수입' : '원금대여'}
                            </span>
                          </td>
                          <td className={`py-2 px-2 text-right font-semibold ${t.type === 'income' ? 'text-emerald-700' : 'text-red-700'}`}>
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

            {/* 정산 이력 */}
            <div className="bg-white/72 backdrop-blur-xl border border-black/[0.06] rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">
                월별 정산 이력 <span className="text-sm font-normal text-slate-500">({ledgers.length}건)</span>
              </h2>

              {ledgers.length === 0 ? (
                <div className="text-center text-slate-400 py-8 text-sm">
                  생성된 정산 레코드가 없습니다. <br/>
                  <span className="text-xs">정산 탭 → "장부 생성" 버튼으로 월별 예정 이자를 생성할 수 있습니다.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-200">
                        <th className="text-left py-2 px-2">정산월</th>
                        <th className="text-right py-2 px-2">예정액</th>
                        <th className="text-right py-2 px-2">실제 수령</th>
                        <th className="text-center py-2 px-2">상태</th>
                        <th className="text-left py-2 px-2">매칭일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgers.map(l => (
                        <tr key={l.id} className="border-b border-slate-100 hover:bg-cyan-50/30">
                          <td className="py-2 px-2 font-semibold text-slate-800">{l.settlement_month}</td>
                          <td className="py-2 px-2 text-right font-semibold text-slate-900">{f(l.due_amount)}원</td>
                          <td className="py-2 px-2 text-right text-emerald-700">
                            {l.paid_amount ? f(l.paid_amount) + '원' : '—'}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              l.status === 'matched' ? 'bg-green-100 text-green-700' :
                              l.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                              l.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {l.status === 'matched' ? '매칭됨' :
                               l.status === 'paid' ? '지급완료' :
                               l.status === 'pending' ? '대기' : l.status}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-xs text-slate-500">
                            {l.matched_at ? l.matched_at.slice(0, 10) : '—'}
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
                <h2 className="text-xl font-bold text-slate-900">대여 계약 수정</h2>
                <button onClick={() => setEditOpen(false)} className="text-slate-500 hover:text-slate-800 text-lg">✕</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <Field label="차주명" value={form.borrower_name} onChange={v => setForm({ ...form, borrower_name: v })} />
                <Field label="전화번호" value={form.borrower_phone} onChange={v => setForm({ ...form, borrower_phone: v })} placeholder="010-0000-0000" />
                <Field label="이메일" value={form.borrower_email} onChange={v => setForm({ ...form, borrower_email: v })} />
                <Field label="주민/사업자번호" value={form.borrower_reg_number} onChange={v => setForm({ ...form, borrower_reg_number: v })} />
                <div className="md:col-span-2">
                  <Field label="주소" value={form.borrower_address} onChange={v => setForm({ ...form, borrower_address: v })} />
                </div>

                <Field label="대여 원금 (원)" type="number" value={form.principal_amount} onChange={v => setForm({ ...form, principal_amount: Number(v) || 0 })} />
                <Field label="미상환 잔액 (원)" type="number" value={form.current_balance} onChange={v => setForm({ ...form, current_balance: Number(v) || 0 })} />
                <Field label="연 이율 (%)" type="number" step="0.1" value={form.interest_rate} onChange={v => setForm({ ...form, interest_rate: Number(v) || 0 })} />
                <Field label="지급일 (매월)" type="number" value={form.payment_day} onChange={v => setForm({ ...form, payment_day: Number(v) || 0 })} />
                <Field label="거치기간 (개월)" type="number" value={form.grace_period_months} onChange={v => setForm({ ...form, grace_period_months: Number(v) || 0 })} />

                <div>
                  <label className="text-xs text-slate-500">상환 방식</label>
                  <select value={form.repayment_type} onChange={e => setForm({ ...form, repayment_type: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                    <option value="interest_only">이자만 (매월)</option>
                    <option value="principal_interest">원리금 균등</option>
                    <option value="bullet">만기 일시 (원금+이자)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">세금 유형</label>
                  <select value={form.tax_type} onChange={e => setForm({ ...form, tax_type: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                    <option value="이자소득(27.5%)">이자소득 (27.5%)</option>
                    <option value="사업소득(3.3%)">사업소득 (3.3%)</option>
                    <option value="비과세">비과세</option>
                  </select>
                </div>

                <Field label="시작일" type="date" value={form.contract_start_date} onChange={v => setForm({ ...form, contract_start_date: v })} />
                <Field label="종료일" type="date" value={form.contract_end_date} onChange={v => setForm({ ...form, contract_end_date: v })} />

                <div className="md:col-span-2">
                  <Field label="대여 사유" value={form.purpose} onChange={v => setForm({ ...form, purpose: v })} placeholder="예: 운영자금, 차량구입 등" />
                </div>
                <div className="md:col-span-2">
                  <Field label="담보/보증" value={form.collateral} onChange={v => setForm({ ...form, collateral: v })} placeholder="예: 차량저당, 보증인 홍길동" />
                </div>

                <div>
                  <label className="text-xs text-slate-500">계약 상태</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                    <option value="active">운용 중</option>
                    <option value="completed">완료</option>
                    <option value="default">연체</option>
                  </select>
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
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold disabled:opacity-50">
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

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'emerald' | 'cyan' }) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-100/80',
    green: 'border-green-100/80',
    red: 'border-red-100/80',
    amber: 'border-amber-100/80',
    violet: 'border-violet-100/80',
    emerald: 'border-emerald-100/80',
    cyan: 'border-cyan-100/80',
  }
  return (
    <div className={`bg-white/60 backdrop-blur-xl border ${colorMap[color]} rounded-2xl p-4 shadow-sm`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

'use client'
import { useApp } from '../context/AppContext'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import DcStatStrip, { StatItem } from '../components/DcStatStrip'
import DcToolbar, { FilterItem } from '../components/DcToolbar'
import TransactionEditModal from '../components/TransactionEditModal'
import QuickTxModal from '../components/QuickTxModal'
export default function FinancePage() {
  const { company, role } = useApp()

// MySQL API 전환 완료
const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'ledger' | 'schedule'>('ledger')
  const [editingTxId, setEditingTxId] = useState<string | null>(null)
  // Phase H1 (#84): 인라인 입력 폼 → QuickTxModal 분리 (Decision 8β)
  const [quickOpen, setQuickOpen] = useState(false)

  const [list, setList] = useState<any[]>([])
  const [summary, setSummary] = useState({ income: 0, expense: 0, profit: 0, pendingExpense: 0 })
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [searchText, setSearchText] = useState('')

  const pathname = usePathname()

  useEffect(() => { fetchTransactions() }, [filterDate, activeTab, company, pathname])

  // 탭 포커스 시 자동 새로고침
  useEffect(() => {
    const onFocus = () => fetchTransactions()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [filterDate, company])

  const fetchTransactions = async () => {
    if (!company && role !== 'admin') return
    setLoading(true)
    try {
      const [year, month] = filterDate.split('-').map(Number)
      const lastDay = new Date(year, month, 0).getDate()
      const headers = await getAuthHeader()
      const params = new URLSearchParams({
        from: `${filterDate}-01`,
        to: `${filterDate}-${String(lastDay).padStart(2, '0')}`,
      })
      const res = await fetch(`/api/transactions?${params}`, { headers })
      if (!res.ok) {
        const text = await res.text()
        console.error(`[transactions] HTTP ${res.status}:`, text.slice(0, 300))
        setLoading(false)
        return
      }
      const json = await res.json()
      if (json.error) console.error('[transactions] API error:', json.error)
      else {
        setList(json.data || [])
        calculateSummary(json.data || [])
      }
    } catch (e: any) {
      console.error('[transactions] exception:', e?.message || String(e))
    }
    setLoading(false)
  }

  const calculateSummary = (data: any[]) => {
      let inc = 0, exp = 0, pending = 0;
      data.forEach(item => {
          const amt = Number(item.amount)
          if (item.status === 'completed') {
              if(item.type === 'income') inc += amt
              else exp += amt
          } else {
              if(item.type === 'expense') pending += amt
          }
      })
      setSummary({ income: inc, expense: exp, profit: inc - exp, pendingExpense: pending })
  }

  // Phase H1: handleSave → QuickTxModal 내부로 이전

  const handleConfirm = async (id: string) => {
      if(!confirm('지급/수금 완료 처리하시겠습니까?')) return
      const headers = await getAuthHeader()
      await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      fetchTransactions()
  }

  const handleDelete = async (id: string) => {
      if(confirm('삭제하시겠습니까?')) {
          const headers = await getAuthHeader()
          await fetch(`/api/transactions/${id}`, { method: 'DELETE', headers })
          fetchTransactions()
      }
  }

  const generateMonthlySchedule = async () => {
      if (role === 'admin' && !company) return alert('⚠️ 회사를 먼저 선택해주세요.')
      if(!confirm(`${filterDate}월 정기 지출을 일괄 생성하시겠습니까?`)) return
      setLoading(true)
      try {
          const headers = await getAuthHeader()
          const res = await fetch('/api/transactions/generate-schedule', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ month: filterDate, company_id: company?.id }),
          })
          const json = await res.json()
          if (json.error) throw new Error(json.error)
          alert(`✅ ${json.message}`)
          if (json.created > 0) setActiveTab('schedule')
          fetchTransactions()
      } catch (e: any) { alert('오류: ' + e.message); setLoading(false) }
  }

  // Phase H1: scrollToForm → openQuickModal (모달 오픈)
  const openQuickModal = () => {
      setQuickOpen(true)
  }

  const nf = (num: number) => num ? num.toLocaleString() : '0'
  const filteredList = list.filter(item => activeTab === 'ledger' ? item.status === 'completed' : item.status === 'pending')

  if (!company && !loading) {
    return (
      <div className="page-bg">
        <div className="max-w-[1400px] mx-auto py-4 px-4 md:px-6">
          <div className="si-card p-12 md:p-20 text-center">
            <span className="text-4xl block mb-3">🏢</span>
            <p className="font-bold text-slate-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
            <p className="text-xs text-slate-500 mt-1">회사 선택 후 자금 장부를 이용할 수 있습니다</p>
          </div>
        </div>
      </div>
    )
  }

  // Build stat cards
  const statCards: StatItem[] = [
    {
      label: '총 수입',
      value: nf(summary.income),
      unit: '원',
    },
    {
      label: '총 지출',
      value: nf(summary.expense),
      unit: '원',
    },
    {
      label: '손익',
      value: nf(summary.profit),
      unit: '원',
    },
  ]

  const filterTabs: FilterItem[] = [
    { key: 'ledger', label: '확정된 장부', count: filteredList.length },
    { key: 'schedule', label: '예정 스케줄', count: filteredList.length },
  ]

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">

        {/* Stat Cards */}
        <DcStatStrip stats={statCards} fullWidth />

      {/* Toolbar + Month Selection */}
      <DcToolbar
        search={searchText}
        onSearchChange={setSearchText}
        placeholder="거래처/내용 검색..."
        filters={filterTabs}
        activeFilter={activeTab}
        onFilterChange={(key) => setActiveTab(key as 'ledger' | 'schedule')}
        leading={
          <input
            type="month"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{
              border: 'none',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 13,
              fontWeight: 600,
              background: 'transparent',
              color: '#2a4a6b',
              minWidth: 100,
            }}
          />
        }
        trailing={
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button
              onClick={() => router.push('/finance/upload')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.06)',
                background: 'transparent',
                color: '#64748b',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              📂 엑셀
            </button>
            <button
              onClick={openQuickModal}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ⚡ 빠른 입력
            </button>
            {activeTab === 'schedule' && (
              <button
                onClick={generateMonthlySchedule}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                ⚡ 생성
              </button>
            )}
          </div>
        }
      />

      {/* 4. 입력 폼 → Phase H1에서 QuickTxModal로 분리됨 (Decision 8β) */}

      {/* 5. 리스트 뷰 */}
      <div className="si-card min-h-[400px]">
          <div className="px-5 py-3 border-b border-black/5 flex justify-between items-center">
              <h3 className="font-bold text-slate-600 text-sm">
                  {activeTab === 'ledger' ? '📚 거래 내역 장부' : '🗓️ 자금 집행 스케줄'}
              </h3>
              <span className="si-badge si-badge-gray">총 {filteredList.length}건</span>
          </div>

          {/* Empty State */}
          {loading ? (
              <div className="p-20 text-center text-slate-400 flex flex-col items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
                <span className="text-sm">데이터를 불러오는 중...</span>
              </div>
          ) : filteredList.length === 0 ? (
              <div className="p-20 text-center">
                <span className="text-3xl block mb-3">{activeTab === 'ledger' ? '📚' : '🗓️'}</span>
                <p className="text-slate-400 text-sm">{activeTab === 'ledger' ? '등록된 내역이 없습니다.' : '예정된 스케줄이 없습니다.'}</p>
              </div>
          ) : (
              <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                      <table className="si-table" style={{ minWidth: 600 }}>
                          <thead>
                              <tr>
                                  <th>거래일</th>
                                  <th>구분</th>
                                  <th>계정과목</th>
                                  <th>거래처/내용</th>
                                  <th className="text-right">금액</th>
                                  <th className="text-center">관리</th>
                              </tr>
                          </thead>
                          <tbody>
                              {filteredList.map((item) => (
                                  <tr
                                    key={item.id}
                                    onClick={() => setEditingTxId(item.id)}
                                    className="hover:bg-cyan-50 transition-colors group cursor-pointer"
                                    title="클릭하여 편집"
                                  >
                                      <td className="p-3 md:p-4 pl-4 md:pl-6 font-bold text-slate-600">{item.transaction_date.slice(5)}</td>
                                      <td className="p-3 md:p-4">
                                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${item.type === 'income' ? 'bg-blue-400/20 text-blue-400' : 'bg-red-400/20 text-red-400'}`}>
                                              {item.type === 'income' ? '수입' : '지출'}
                                          </span>
                                      </td>
                                      <td className="p-3 md:p-4 font-bold text-slate-600">{item.category}</td>
                                      <td className="p-3 md:p-4">
                                          <div className="font-bold text-slate-800">{item.client_name}</div>
                                          <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
                                      </td>
                                      <td className={`p-3 md:p-4 text-right font-bold text-base ${item.type === 'income' ? 'text-blue-400' : 'text-red-400'}`}>
                                          {item.type === 'income' ? '+' : '-'}{nf(item.amount)}
                                      </td>
                                      <td className="p-3 md:p-4 pr-4 md:pr-6 text-center" onClick={e => e.stopPropagation()}>
                                          {item.status === 'pending' ? (
                                              <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                  <button onClick={() => handleConfirm(item.id)} className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-700 shadow-sm">
                                                      승인
                                                  </button>
                                                  <button onClick={() => handleDelete(item.id)} className="text-slate-500 hover:text-red-400 p-1.5">🗑️</button>
                                              </div>
                                          ) : (
                                              <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                  <button onClick={() => setEditingTxId(item.id)} className="text-slate-500 hover:text-cyan-600 font-bold px-2">
                                                      ✏️ 편집
                                                  </button>
                                                  <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-400 font-bold px-2">
                                                      삭제
                                                  </button>
                                              </div>
                                          )}
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden" style={{ padding: '8px 12px' }}>
                      {filteredList.map((item) => (
                          <div key={item.id}
                            onClick={() => setEditingTxId(item.id)}
                            style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${item.type === 'income' ? 'bg-blue-400/20 text-blue-400' : 'bg-red-400/20 text-red-400'}`}>
                                  {item.type === 'income' ? '수입' : '지출'}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{item.category}</span>
                              </div>
                              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{item.transaction_date.slice(5)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>{item.client_name}</div>
                                {item.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.description}</div>}
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                                <span className={`font-black text-base ${item.type === 'income' ? 'text-blue-400' : 'text-red-400'}`}>
                                  {item.type === 'income' ? '+' : '-'}{nf(item.amount)}
                                </span>
                              </div>
                            </div>
                          </div>
                      ))}
                  </div>
              </>
          )}
      </div>

      {/* 거래 편집 모달 */}
      <TransactionEditModal
        txId={editingTxId}
        onClose={() => setEditingTxId(null)}
        onSaved={() => fetchTransactions()}
      />

      {/* Phase H1: 빠른 입력 모달 (인라인 폼 대체) */}
      <QuickTxModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onSaved={() => fetchTransactions()}
        initialStatus={activeTab === 'schedule' ? 'pending' : 'completed'}
        companyId={company?.id ?? null}
        requireCompany={role === 'admin'}
      />
    </div>
    </div>
  )
}
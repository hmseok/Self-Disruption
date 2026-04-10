'use client'
import { useApp } from '../context/AppContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// ============================================================================
// AUTH HELPER
// ============================================================================
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

// ============================================================================
// E-CONTRACT STATUS BADGE
// ============================================================================
function EContractStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'rgba(0,0,0,0.06)', text: '#94a3b8', label: '초안' },
    pending_sign: { bg: 'rgba(250,204,21,0.1)', text: '#fcd34d', label: '서명대기' },
    signed: { bg: 'rgba(59,130,246,0.1)', text: '#60a5fa', label: '서명완료' },
    in_use: { bg: 'rgba(34,197,94,0.1)', text: '#86efac', label: '배차중' },
    returned: { bg: 'rgba(51,65,85,0.1)', text: '#cbd5e1', label: '반납' },
    cancelled: { bg: 'rgba(239,68,68,0.1)', text: '#f87171', label: '취소' },
  }
  const config = statusConfig[status] || statusConfig.draft
  return (
    <span
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
        background: config.bg,
        color: config.text,
      }}
    >
      {config.label}
    </span>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
type EContractStatusFilter = 'all' | 'draft' | 'pending_sign' | 'signed' | 'in_use' | 'returned' | 'cancelled'
type SortOption = 'latest' | 'renter' | 'return_date' | 'fee'

export default function EContractListMain() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const router = useRouter()
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<EContractStatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('latest')

  const f = (n: number) => Math.round(n || 0).toLocaleString()
  const formatDate = (dateString: string) => dateString?.split('T')[0] || ''

  const companyId = role === 'admin' ? adminSelectedCompanyId : company?.id

  // ── Fetch data ──
  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) { setLoading(false); return }

      try {
        const headers = await getAuthHeader()
        const res = await fetch('/api/e-contracts', { headers })
        const json = await res.json()
        setContracts(json.data ?? json ?? [])
      } catch (error) {
        console.error('Error fetching e-contracts:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [companyId])

  // ── Stats ──
  const contractStats = {
    total: contracts.length,
    draft: contracts.filter(c => c.status === 'draft').length,
    pending_sign: contracts.filter(c => c.status === 'pending_sign').length,
    signed: contracts.filter(c => c.status === 'signed').length,
    in_use: contracts.filter(c => c.status === 'in_use').length,
    returned: contracts.filter(c => c.status === 'returned').length,
    cancelled: contracts.filter(c => c.status === 'cancelled').length,
  }

  // ── Filter + Sort ──
  const filteredContracts = contracts
    .filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return (
          (c.renter_name || '').toLowerCase().includes(term) ||
          (c.car_number || '').toLowerCase().includes(term) ||
          (c.car_model || '').toLowerCase().includes(term)
        )
      }
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'renter': return (a.renter_name || '').localeCompare(b.renter_name || '')
        case 'return_date': return (a.return_date || '').localeCompare(b.return_date || '')
        case 'fee': return (b.rental_fee || 0) - (a.rental_fee || 0)
        default: return 0 // latest — already sorted by id desc from DB
      }
    })

  // ============================================================================
  // RENDER
  // ============================================================================
  if (role === 'admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="p-12 md:p-20 text-center text-slate-400 text-sm bg-white rounded-2xl border border-black/[0.06]">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-slate-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: 'rgba(255,255,255,0.02)' }}>

      {/* ── 칩 필터 + 정렬 + 검색 + 버튼 ── */}
      {!loading && (
        <div style={{ marginBottom: 16 }}>
          {/* 칩 필터 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {([
              { id: 'all' as EContractStatusFilter, label: '전체', count: contractStats.total },
              { id: 'draft' as EContractStatusFilter, label: '초안', count: contractStats.draft },
              { id: 'pending_sign' as EContractStatusFilter, label: '서명대기', count: contractStats.pending_sign },
              { id: 'signed' as EContractStatusFilter, label: '서명완료', count: contractStats.signed },
              { id: 'in_use' as EContractStatusFilter, label: '배차중', count: contractStats.in_use },
              { id: 'returned' as EContractStatusFilter, label: '반납', count: contractStats.returned },
              { id: 'cancelled' as EContractStatusFilter, label: '취소', count: contractStats.cancelled },
            ]).map(chip => (
              <button
                key={chip.id}
                onClick={() => setStatusFilter(chip.id)}
                style={{
                  padding: '6px 16px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                  background: statusFilter === chip.id ? 'rgba(59,130,246,0.9)' : 'rgba(0,0,0,0.06)',
                  color: statusFilter === chip.id ? '#fff' : '#cbd5e1',
                }}
              >
                {statusFilter === chip.id && '● '}{chip.label}
                <span style={{
                  marginLeft: 6, fontSize: 11, fontWeight: 700,
                  background: statusFilter === chip.id ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
                  color: statusFilter === chip.id ? '#fff' : '#cbd5e1',
                  padding: '1px 7px', borderRadius: 10,
                }}>{chip.count}</span>
              </button>
            ))}
            <button
              onClick={() => router.push('/e-contract/create')}
              style={{
                marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, border: 'none',
                fontSize: 13, fontWeight: 700, background: '#2d5fa8', color: '#fff',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.9)')}
            >
              + 새 계약서
            </button>
          </div>

          {/* 정렬 + 검색 */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>정렬:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                style={{
                  padding: '6px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                  fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.04)', color: '#1e293b',
                }}
              >
                <option value="latest">최신순</option>
                <option value="renter">고객명순</option>
                <option value="return_date">반납일순</option>
                <option value="fee">요금순</option>
              </select>
            </div>
            <input
              type="text"
              placeholder="🔍 임차인명, 차량번호, 차량모델 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                flex: 1, padding: '7px 14px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                fontSize: 13, outline: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', background: 'rgba(0,0,0,0.04)', color: '#1e293b',
              }}
            />
          </div>
        </div>
      )}

      {/* ── 표준 테이블 ── */}
      <div style={{ background: 'rgba(255,255,255,1)', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.06)' }}>
        {loading ? (
          <div style={{ padding: '80px 20px', textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
        ) : filteredContracts.length === 0 ? (
          <div style={{ padding: '80px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            {contracts.length === 0 ? '전자계약서가 없습니다.' : '해당 조건의 계약서가 없습니다.'}
          </div>
        ) : (<>
          {/* 데스크톱 */}
          <div className="hidden md:block" style={{ overflowX: 'auto' }}>
            <table className="w-full text-left text-sm" style={{ minWidth: 800 }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <th style={{ padding: '12px 16px', paddingLeft: 24, fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>상태</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>임차인</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>차량</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>대여기간</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>요금</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>서명일</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>작성일</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((c, idx) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/e-contract/${c.id}`)}
                    style={{ cursor: 'pointer', borderBottom: idx < filteredContracts.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px', paddingLeft: 24 }}><EContractStatusBadge status={c.status} /></td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1e293b' }}>{c.renter_name || '-'}</td>
                    <td style={{ padding: '12px 16px', color: '#1e293b', fontSize: 13 }}>
                      <div style={{ fontWeight: 700 }}>{c.car_number || '-'}</div>
                      <div style={{ fontSize: 11, color: '#334155' }}>{c.car_model || '-'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>
                      {formatDate(c.start_date)} ~ {formatDate(c.return_date)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'rgba(59,130,246,0.9)' }}>{f(c.rental_fee)}원</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#334155', fontSize: 12 }}>{formatDate(c.signed_date) || '-'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>{formatDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 모바일 카드형 */}
          <div className="md:hidden" style={{ padding: '8px 12px' }}>
            {filteredContracts.map((c) => (
              <div key={c.id} onClick={() => router.push(`/e-contract/${c.id}`)}
                style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.04)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <EContractStatusBadge status={c.status} />
                  <span style={{ fontSize: 11, color: '#64748b' }}>{formatDate(c.created_at)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14, marginBottom: 2 }}>{c.renter_name || '-'}</div>
                    <div style={{ fontSize: 12, color: '#334155' }}>{c.car_model || '-'} {c.car_number ? `(${c.car_number})` : ''}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{formatDate(c.start_date)} ~ {formatDate(c.return_date)}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <span style={{ fontWeight: 900, color: 'rgba(59,130,246,0.9)', fontSize: 15 }}>{f(c.rental_fee)}원</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'

// ============================================
// Auth Helper
// ============================================
async function getAuthHeader(): Promise<Record<string, string>> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('sb-auth-token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ============================================
// 회사/가입 관리 — admin + 회사 + 사용자 통합
// ============================================

type UserProfile = {
  id: string
  email: string
  employee_name: string | null
  role: string
  is_active: boolean
  created_at: string
}

type CompanyWithUsers = {
  id: string
  name: string
  business_number: string | null
  business_registration_url: string | null
  plan: string
  is_active: boolean
  created_at: string
  users: UserProfile[]
}

export default function AdminDashboard() {
  const { user, company, role, setAdminSelectedCompanyId } = useApp()
  const router = useRouter()

  const [companies, setCompanies] = useState<CompanyWithUsers[]>([])
  const [unassignedUsers, setUnassignedUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'active'>('all')

  useEffect(() => {
    if (user && (role === 'admin')) fetchData()
  }, [user, company, role])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (role === 'admin') {
        // 1) 회사 목록
        const res = await fetch('/api/companies', { headers: await getAuthHeader() })
        if (!res.ok) throw new Error('회사 조회 실패')
        const { data: companiesData } = await res.json()

        // 2) 전체 프로필 (회사 소속)
        const companiesWithUsers: CompanyWithUsers[] = []
        for (const comp of (companiesData || [])) {
          const res2 = await fetch(`/api/profiles?company_id=${comp.id}`, { headers: await getAuthHeader() })
          if (!res2.ok) continue
          const { data: users } = await res2.json()
          companiesWithUsers.push({ ...comp, users: users || [] })
        }
        setCompanies(companiesWithUsers)

        // 3) 미배정 사용자 (회사 없고 admin도 아닌)
        const res3 = await fetch('/api/profiles?unassigned=true', { headers: await getAuthHeader() })
        if (!res3.ok) throw new Error('미배정 사용자 조회 실패')
        const { data: orphanData } = await res3.json()
        setUnassignedUsers(orphanData || [])

      } else if (company) {
        const res = await fetch(`/api/profiles?company_id=${company.id}`, { headers: await getAuthHeader() })
        if (!res.ok) throw new Error('사용자 조회 실패')
        const { data: users } = await res.json()
        setCompanies([{ ...company, users: users || [] }])
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Toggle user active status via API route
  const toggleUserActive = async (userId: string, currentActive: boolean) => {
    const action = currentActive ? '비활성화' : '활성화'
    if (!confirm(`이 사용자를 ${action}하시겠습니까?`)) return
    try {
      const res = await fetch(`/api/profiles/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthHeader())
        },
        body: JSON.stringify({ is_active: !currentActive })
      })
      if (!res.ok) throw new Error('변경 실패')
      fetchData()
    } catch (err: any) {
      alert('변경 실패: ' + err.message)
    }
  }

  const [uploadingCompanyId, setUploadingCompanyId] = useState<string | null>(null)

  const handleUploadBusinessDoc = async (companyId: string, file: File) => {
    if (!file) return
    setUploadingCompanyId(companyId)
    try {
      // Upload to GCS via /api/upload-business-doc
      const formData = new FormData()
      formData.append('file', file)
      formData.append('company_id', companyId)

      const res = await fetch('/api/upload-business-doc', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: formData
      })

      if (!res.ok) throw new Error('업로드 실패')
      const { url } = await res.json()

      // Update company with URL
      const updateRes = await fetch(`/api/companies/${companyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthHeader())
        },
        body: JSON.stringify({ business_registration_url: url })
      })

      if (!updateRes.ok) throw new Error('URL 저장 실패')
      alert('✅ 사업자등록증이 등록되었습니다.')
      fetchData()
    } catch (err: any) {
      alert('업로드 실패: ' + err.message)
    } finally {
      setUploadingCompanyId(null)
    }
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })

  // 클라이언트 회사 (플랫폼 전용 회사 제외)
  const clientCompanies = companies.filter((c: any) => !c.is_platform)

  const filteredCompanies = clientCompanies.filter(c => {
    if (activeFilter === 'pending') return !c.is_active
    if (activeFilter === 'active') return c.is_active
    return true
  })

  const pendingCount = clientCompanies.filter(c => !c.is_active).length
  const activeCount = clientCompanies.filter(c => c.is_active).length
  const totalUsers = clientCompanies.reduce((sum, c) => sum + c.users.length, 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
      </div>
    )
  }

  // ===== 역할 배지 렌더러 =====
  const roleBadge = (r: string) => {
    if (r === 'admin') return <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 text-white uppercase tracking-wider">GOD ADMIN</span>
    if (r === 'master') return <span className="text-[9px] font-black px-2 py-0.5 rounded bg-gray-100 text-blue-400">관리자</span>
    return <span className="text-[9px] font-black px-2 py-0.5 rounded bg-gray-50 text-slate-400">직원</span>
  }

  // ===== 활성 토글 버튼 =====
  const activeToggle = (u: UserProfile) => {
    if (role === 'admin' && u.role !== 'admin') {
      return (
        <button
          onClick={() => toggleUserActive(u.id, u.is_active)}
          className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
            u.is_active
              ? 'bg-emerald-400/20 text-emerald-400 hover:bg-emerald-400/30 border border-emerald-400/50'
              : 'bg-red-400/20 text-red-400 hover:bg-red-400/30 border border-red-400/50'
          }`}
          title={u.is_active ? '클릭하면 서비스 이용을 정지합니다' : '클릭하면 서비스 이용을 허용합니다'}
        >
          <span className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
          {u.is_active ? '허용' : '정지'}
        </button>
      )
    }
    return (
      <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded ${
        u.is_active ? 'bg-emerald-400/20 text-emerald-400' : 'bg-red-400/20 text-red-400'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
        {u.is_active ? '허용' : '정지'}
      </span>
    )
  }

  // ===== 회사 카드 렌더러 =====
  const renderCompanyCard = (comp: CompanyWithUsers) => (
    <div key={comp.id} className={`bg-white/80 rounded-2xl border shadow-sm overflow-hidden ${
      !comp.is_active ? 'border-yellow-400/50 ring-1 ring-yellow-400/20' : 'border-black/[0.06]'
    }`}>
      {/* 회사 헤더 */}
      <div className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0 ${
            !comp.is_active ? 'bg-yellow-500' : 'bg-blue-500'
          }`}>
            {comp.name[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800 text-sm md:text-base">{comp.name}</span>
              {!comp.is_active && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-yellow-400/20 text-yellow-400 animate-pulse">
                  승인 대기
                </span>
              )}
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                comp.plan === 'max' ? 'bg-amber-400/20 text-amber-400' :
                comp.plan === 'pro' ? 'bg-blue-400/20 text-blue-400' :
                comp.plan === 'basic' ? 'bg-emerald-400/20 text-emerald-400' :
                'bg-gray-50 text-slate-400'
              }`}>
                {comp.plan === 'max' ? 'MAX' : comp.plan.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-2 md:gap-3 mt-0.5 flex-wrap">
              <span className="text-[10px] md:text-xs text-slate-400">{comp.business_number || '사업자번호 없음'}</span>
              <span className="text-[10px] md:text-xs text-slate-400">가입: {formatDate(comp.created_at)}</span>
              <span className="text-[10px] md:text-xs text-slate-400">직원 {comp.users.length}명</span>
              {comp.business_registration_url && (
                <a
                  href={comp.business_registration_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-400/20 text-blue-400 hover:bg-blue-400/30 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                  </svg>
                  사업자등록증
                </a>
              )}
              {role === 'admin' && (
                <label className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  comp.business_registration_url
                    ? 'bg-gray-50 text-slate-400 hover:bg-gray-100'
                    : 'bg-emerald-400/20 text-emerald-400 hover:bg-emerald-400/30'
                } ${uploadingCompanyId === comp.id ? 'opacity-50 pointer-events-none' : ''}`}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                  </svg>
                  {uploadingCompanyId === comp.id ? '업로드중...' : comp.business_registration_url ? '재등록' : '등록증 업로드'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf"
                    className="hidden"
                    disabled={uploadingCompanyId === comp.id}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUploadBusinessDoc(comp.id, file)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2 flex-shrink-0">
          {comp.is_active && role === 'admin' && (
            <button
              onClick={() => {
                setAdminSelectedCompanyId(comp.id)
                router.push('/admin/employees')
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-400/20 text-blue-400 rounded-lg text-sm font-bold hover:bg-blue-400/30 border border-blue-400/50 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/>
              </svg>
              조직/권한
            </button>
          )}
        </div>
      </div>

      {/* 소속 유저 목록 */}
      {comp.users.length > 0 && (
        <div className="border-t border-black/[0.06]">
          {/* Desktop Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase">이름</th>
                  <th className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase">이메일</th>
                  <th className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase">역할</th>
                  <th className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase">가입일</th>
                  <th className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase">서비스 이용</th>
                </tr>
              </thead>
              <tbody>
                {comp.users.map(u => (
                  <tr key={u.id} className="border-t border-black/5 hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm font-bold text-slate-700">{u.employee_name || '(미설정)'}</td>
                    <td className="px-5 py-3 text-sm text-slate-400">{u.email}</td>
                    <td className="px-5 py-3">{roleBadge(u.role)}</td>
                    <td className="px-5 py-3 text-xs text-slate-400">{formatDate(u.created_at)}</td>
                    <td className="px-5 py-3">{activeToggle(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <div className="glass-3 glass-border-blue rounded-xl p-3 md:p-4 text-center">
            <div className="text-base mb-1">🏢</div>
            <div className="text-xl md:text-2xl font-black text-blue-400">{clientCompanies.length}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">가입 회사</div>
          </div>
          {pendingCount > 0 && (
            <div className="glass-3 glass-border-amber rounded-xl p-3 md:p-4 text-center">
              <div className="text-base mb-1">⏳</div>
              <div className="text-xl md:text-2xl font-black text-amber-400">{pendingCount}</div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">승인 대기</div>
            </div>
          )}
          <div className="glass-3 glass-border-blue rounded-xl p-3 md:p-4 text-center">
            <div className="text-base mb-1">👥</div>
            <div className="text-xl md:text-2xl font-black text-blue-400">{totalUsers}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">전체 사용자</div>
          </div>
        </div>

        {/* ===== 미배정 사용자 ===== */}
        {role === 'admin' && unassignedUsers.length > 0 && (
          <div className="mb-6">
            <h2 className="section-title text-red-400 mb-3">
              미배정 사용자 ({unassignedUsers.length})
            </h2>
            <div className="si-card overflow-hidden" style={{ borderColor: 'rgba(248, 113, 113, 0.2)' }}>
              <div className="overflow-x-auto">
                <table className="si-table">
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>이메일</th>
                      <th>역할</th>
                      <th>가입일</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unassignedUsers.map(u => (
                      <tr key={u.id} className="border-t border-red-400/20 hover:bg-red-400/10">
                        <td className="px-5 py-3 text-sm font-bold text-slate-700">{u.employee_name || '(미설정)'}</td>
                        <td className="px-5 py-3 text-sm text-slate-400">{u.email}</td>
                        <td className="px-5 py-3">{roleBadge(u.role)}</td>
                        <td className="px-5 py-3 text-xs text-slate-400">{formatDate(u.created_at)}</td>
                        <td className="px-5 py-3">{activeToggle(u)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===== 가입 회사 목록 ===== */}

        {/* 필터 탭 */}
        <div className="flex items-center gap-2 mb-4 md:mb-6 overflow-x-auto">
          <h2 className="text-base md:text-lg font-black text-slate-700 mr-2 flex-shrink-0">가입 회사</h2>
          {[
            { key: 'all', label: '전체', count: clientCompanies.length },
            { key: 'pending', label: '승인 대기', count: pendingCount },
            { key: 'active', label: '활성', count: activeCount },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key as any)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeFilter === tab.key
                  ? tab.key === 'pending' ? 'bg-yellow-500 text-white' : 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-slate-400 border border-black/[0.06] hover:bg-white/20'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* 회사 카드 목록 */}
        <div className="space-y-4">
          {filteredCompanies.map(comp => renderCompanyCard(comp))}

          {filteredCompanies.length === 0 && (
            <div className="bg-white/80 rounded-2xl p-12 border border-black/[0.06] text-center">
              <p className="text-slate-400 font-bold">해당 조건의 회사가 없습니다</p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

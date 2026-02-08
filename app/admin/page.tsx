'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import Link from 'next/link'
import AddCompanyModal from '../components/admin/AddCompanyModal'

// ============================================
// 관리자 대시보드 + 가입 승인 관리
// ============================================

type CompanyWithUsers = {
  id: string
  name: string
  business_number: string | null
  business_registration_url: string | null
  plan: string
  is_active: boolean
  created_at: string
  users: { id: string; email: string; employee_name: string | null; role: string; is_active: boolean }[]
}

export default function AdminDashboard() {
  const { user, company, role } = useApp()

  const [companies, setCompanies] = useState<CompanyWithUsers[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'active'>('all')

  useEffect(() => {
    if (user && (role === 'god_admin' || role === 'master')) fetchData()
  }, [user, company, role])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (role === 'god_admin') {
        // 전체 회사 + 소속 유저
        const { data: companiesData } = await supabase
          .from('companies')
          .select('*')
          .order('created_at', { ascending: false })

        const companiesWithUsers: CompanyWithUsers[] = []
        for (const comp of (companiesData || [])) {
          const { data: users } = await supabase
            .from('profiles')
            .select('id, email, employee_name, role, is_active')
            .eq('company_id', comp.id)
          companiesWithUsers.push({ ...comp, users: users || [] })
        }
        setCompanies(companiesWithUsers)
      } else if (company) {
        const { data: users } = await supabase
          .from('profiles')
          .select('id, email, employee_name, role, is_active')
          .eq('company_id', company.id)
        setCompanies([{ ...company, users: users || [] }])
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  // 회사 승인 (RPC 사용 - RLS 우회)
  const approveCompany = async (companyId: string) => {
    const { data, error } = await supabase.rpc('approve_company', { target_company_id: companyId })
    if (error) {
      alert('승인 실패: ' + error.message)
    } else if (data && !data.success) {
      alert('승인 실패: ' + data.error)
    } else {
      fetchData()
    }
  }

  // 회사 거부 (RPC 사용 - RLS 우회)
  const rejectCompany = async (companyId: string) => {
    if (!confirm('이 회사 가입 요청을 거부하시겠습니까? 관련 데이터가 삭제됩니다.')) return
    const { data, error } = await supabase.rpc('reject_company', { target_company_id: companyId })
    if (error) {
      alert('거부 실패: ' + error.message)
    } else {
      fetchData()
    }
  }

  // 개별 유저 활성화/비활성화 (RPC 사용)
  const toggleUserActive = async (userId: string, currentActive: boolean) => {
    const { error } = await supabase.rpc('toggle_user_active', {
      target_user_id: userId,
      new_active: !currentActive,
    })
    if (error) alert('변경 실패: ' + error.message)
    fetchData()
  }

  // 사업자등록증 업로드
  const [uploadingCompanyId, setUploadingCompanyId] = useState<string | null>(null)

  const handleUploadBusinessDoc = async (companyId: string, file: File) => {
    if (!file) return
    setUploadingCompanyId(companyId)
    try {
      // 현재 로그인 사용자 UID 가져오기 (폴더 정책용)
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const uid = authUser?.id || 'admin'

      // 파일 Storage 업로드 (uid 폴더 하위에 저장)
      const ext = file.name.split('.').pop() || 'jpg'
      const filePath = `${uid}/business_doc_${companyId}_${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('business-docs')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('business-docs')
        .getPublicUrl(filePath)

      // companies 테이블 업데이트
      const { error: updateError } = await supabase
        .from('companies')
        .update({ business_registration_url: urlData.publicUrl })
        .eq('id', companyId)

      if (updateError) throw updateError

      alert('✅ 사업자등록증이 등록되었습니다.')
      fetchData()
    } catch (err: any) {
      alert('업로드 실패: ' + err.message)
    } finally {
      setUploadingCompanyId(null)
    }
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })

  // 필터링
  const filteredCompanies = companies.filter(c => {
    if (activeFilter === 'pending') return !c.is_active
    if (activeFilter === 'active') return c.is_active
    return true
  })

  const pendingCount = companies.filter(c => !c.is_active).length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
              {role === 'god_admin' ? '회사/가입 관리' : '회사 관리'}
            </h1>
            <p className="text-slate-500 mt-1 text-sm">회사 가입 승인 및 사용자 관리</p>
          </div>
          <div className="flex gap-2">
            {role === 'god_admin' && (
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 md:px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs md:text-sm font-bold hover:bg-indigo-700"
              >
                + 회사 등록
              </button>
            )}
            <button onClick={fetchData} className="px-3 md:px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs md:text-sm font-bold text-slate-600 hover:bg-slate-100">
              새로고침
            </button>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-[10px] md:text-xs font-bold text-slate-400 uppercase mb-1">전체 회사</div>
            <div className="text-2xl md:text-3xl font-black text-slate-900">{companies.length}</div>
          </div>
          {pendingCount > 0 && (
            <div className="bg-yellow-50 p-4 md:p-5 rounded-2xl border border-yellow-200 shadow-sm">
              <div className="text-[10px] md:text-xs font-bold text-yellow-600 uppercase mb-1">승인 대기</div>
              <div className="text-2xl md:text-3xl font-black text-yellow-700">{pendingCount}</div>
            </div>
          )}
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-[10px] md:text-xs font-bold text-slate-400 uppercase mb-1">전체 사용자</div>
            <div className="text-2xl md:text-3xl font-black text-blue-600">{companies.reduce((sum, c) => sum + c.users.length, 0)}</div>
          </div>
          <Link href="/admin/employees" className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
            <div className="text-[10px] md:text-xs font-bold text-slate-400 uppercase mb-1">바로가기</div>
            <div className="text-sm md:text-lg font-bold text-slate-700 group-hover:text-blue-600">조직/권한 →</div>
          </Link>
        </div>

        {/* 필터 탭 */}
        <div className="flex gap-2 mb-4 md:mb-6 overflow-x-auto">
          {[
            { key: 'all', label: '전체', count: companies.length },
            { key: 'pending', label: '승인 대기', count: pendingCount },
            { key: 'active', label: '활성', count: companies.length - pendingCount },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeFilter === tab.key
                  ? tab.key === 'pending' ? 'bg-yellow-500 text-white' : 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* 회사 카드 목록 */}
        <div className="space-y-4">
          {filteredCompanies.map(comp => (
            <div key={comp.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
              !comp.is_active ? 'border-yellow-300 ring-1 ring-yellow-200' : 'border-slate-200'
            }`}>
              {/* 회사 헤더 */}
              <div className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0 ${
                    !comp.is_active ? 'bg-yellow-500' : 'bg-indigo-600'
                  }`}>
                    {comp.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm md:text-base">{comp.name}</span>
                      {!comp.is_active && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 animate-pulse">
                          승인 대기
                        </span>
                      )}
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                        comp.plan === 'master' ? 'bg-yellow-100 text-yellow-700' :
                        comp.plan === 'pro' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {comp.plan.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400">{comp.business_number || '사업자번호 없음'}</span>
                      <span className="text-xs text-slate-400">가입: {formatDate(comp.created_at)}</span>
                      <span className="text-xs text-slate-400">직원 {comp.users.length}명</span>
                      {comp.business_registration_url && (
                        <a
                          href={comp.business_registration_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                          </svg>
                          사업자등록증
                        </a>
                      )}
                      {role === 'god_admin' && (
                        <label className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          comp.business_registration_url
                            ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        } ${uploadingCompanyId === comp.id ? 'opacity-50 pointer-events-none' : ''}`}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                          </svg>
                          {uploadingCompanyId === comp.id ? '업로드중...' : comp.business_registration_url ? '재등록' : '등록증 업로드'}
                          <input
                            type="file"
                            accept="image/*,.pdf"
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
                <div className="flex gap-2">
                  {!comp.is_active && role === 'god_admin' && (
                    <>
                      <button
                        onClick={() => approveCompany(comp.id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-all"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => rejectCompany(comp.id)}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 transition-all"
                      >
                        거부
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 소속 유저 목록 */}
              {comp.users.length > 0 && (
                <div className="border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-left min-w-[500px]">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase">이름</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase">이메일</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase">역할</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase">상태</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase text-right">액션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comp.users.map(u => (
                        <tr key={u.id} className="border-t border-slate-50 hover:bg-slate-50/30">
                          <td className="px-5 py-3 text-sm font-bold text-slate-800">{u.employee_name || '(미설정)'}</td>
                          <td className="px-5 py-3 text-sm text-slate-500">{u.email}</td>
                          <td className="px-5 py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              u.role === 'master' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                            }`}>{u.role === 'master' ? '관리자' : '직원'}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              u.is_active ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                            }`}>{u.is_active ? '활성' : '대기중'}</span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {role === 'god_admin' && (
                              <button
                                onClick={() => toggleUserActive(u.id, u.is_active)}
                                className={`text-xs font-bold hover:underline ${u.is_active ? 'text-red-500' : 'text-green-600'}`}
                              >
                                {u.is_active ? '비활성화' : '활성화'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {filteredCompanies.length === 0 && (
            <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
              <p className="text-slate-400 font-bold">해당 조건의 회사가 없습니다</p>
            </div>
          )}
        </div>
      </div>

      <AddCompanyModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchData}
      />
    </div>
  )
}

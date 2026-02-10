'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useRouter } from 'next/navigation'

// ============================================
// 개발자 모드 (god_admin 전용)
// 플랫폼 관리자 현황 + 초대 코드 발급 및 관리
// ============================================

type GodAdmin = {
  id: string
  email: string
  employee_name: string | null
  role: string
  is_active: boolean
  created_at: string
}

export default function DeveloperPage() {
  const router = useRouter()
  const { role, loading: appLoading } = useApp()

  // 플랫폼 관리자 목록
  const [godAdmins, setGodAdmins] = useState<GodAdmin[]>([])
  const [adminsLoading, setAdminsLoading] = useState(true)

  // Super God Admin 초대
  const [invites, setInvites] = useState<any[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDesc, setInviteDesc] = useState('')
  const [newInviteCode, setNewInviteCode] = useState<string | null>(null)
  const [inviteEmailStatus, setInviteEmailStatus] = useState<'none' | 'sent' | 'error'>('none')

  useEffect(() => {
    if (!appLoading && role !== 'god_admin') {
      alert('접근 권한이 없습니다.')
      router.replace('/dashboard')
    }
  }, [appLoading, role])

  // 플랫폼 관리자 목록 로드
  const loadGodAdmins = async () => {
    setAdminsLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, email, employee_name, role, is_active, created_at')
      .eq('role', 'god_admin')
      .order('created_at', { ascending: true })
    setGodAdmins(data || [])
    setAdminsLoading(false)
  }

  // 초대 코드 목록 로드
  const loadInvites = async () => {
    setInviteLoading(true)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch('/api/admin-invite', { headers: { 'Authorization': `Bearer ${token}` } })
      const data = await res.json()
      if (Array.isArray(data)) setInvites(data)
    } catch {}
    setInviteLoading(false)
  }

  useEffect(() => {
    if (!appLoading && role === 'god_admin') {
      loadGodAdmins()
      loadInvites()
    }
  }, [appLoading, role])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })

  if (appLoading || role !== 'god_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="mb-5 md:mb-6">
          <h1 className="text-xl md:text-3xl font-extrabold text-slate-900">개발자 모드</h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm">플랫폼 관리자(Super God Admin) 현황, 초대 코드 발급 및 시스템 관리</p>
        </div>

        {/* ===== 플랫폼 관리자 KPI ===== */}
        <div className="mb-5">
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-4 md:p-5 rounded-2xl border border-yellow-200 shadow-sm">
            <div className="text-[10px] md:text-xs font-bold text-yellow-600 uppercase mb-1">플랫폼 관리자</div>
            <div className="text-2xl md:text-3xl font-black text-yellow-700">{godAdmins.length}명</div>
          </div>
        </div>

        {/* ===== 플랫폼 관리자 목록 ===== */}
        <div className="bg-white rounded-2xl border border-yellow-200 shadow-sm overflow-hidden mb-5">
          <div className="p-4 border-b border-yellow-100 bg-gradient-to-r from-yellow-50 to-orange-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 text-white uppercase tracking-wider">GOD ADMIN</span>
              <span className="text-sm font-bold text-yellow-800">플랫폼 관리자 목록</span>
            </div>
            <button
              onClick={loadGodAdmins}
              className="text-xs text-yellow-600 hover:text-yellow-800 font-bold"
            >
              새로고침
            </button>
          </div>

          {adminsLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">로딩 중...</div>
          ) : godAdmins.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">등록된 플랫폼 관리자가 없습니다.</div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-yellow-50/30">
                      <th className="px-5 py-2 text-[10px] font-bold text-yellow-600 uppercase">관리자</th>
                      <th className="px-5 py-2 text-[10px] font-bold text-yellow-600 uppercase">이메일</th>
                      <th className="px-5 py-2 text-[10px] font-bold text-yellow-600 uppercase">가입일</th>
                      <th className="px-5 py-2 text-[10px] font-bold text-yellow-600 uppercase">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {godAdmins.map(admin => (
                      <tr key={admin.id} className="border-t border-yellow-50 hover:bg-yellow-50/30">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-black text-xs flex-shrink-0">
                              {(admin.employee_name || admin.email)[0].toUpperCase()}
                            </div>
                            <span className="text-sm font-bold text-slate-800">{admin.employee_name || '(미설정)'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-slate-500">{admin.email}</td>
                        <td className="px-5 py-3 text-xs text-slate-400">{formatDate(admin.created_at)}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded ${
                            admin.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${admin.is_active ? 'bg-green-500' : 'bg-red-400'}`}></span>
                            {admin.is_active ? '활성' : '비활성'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-yellow-100">
                {godAdmins.map(admin => (
                  <div key={admin.id} className="p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-black text-xs flex-shrink-0">
                      {(admin.employee_name || admin.email)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{admin.employee_name || '(미설정)'}</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${
                          admin.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${admin.is_active ? 'bg-green-500' : 'bg-red-400'}`}></span>
                          {admin.is_active ? '활성' : '비활성'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">{admin.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Super God Admin 초대 코드 */}
        <div className="mb-5 p-3 bg-steel-50 rounded-xl border border-steel-100">
          <p className="text-[11px] md:text-xs text-steel-700">
            <strong>Super God Admin 초대:</strong> 이메일 주소를 입력하면 초대 코드가 발급되고 해당 이메일로 자동 발송됩니다.
            수신자는 회원가입 시 &quot;관리자&quot; 탭에서 초대 코드를 입력해 플랫폼 관리자로 가입할 수 있습니다.
            코드는 1회용이며 72시간 후 만료됩니다.
          </p>
        </div>

        {/* 코드 발급 + 이메일 발송 */}
        <div className="bg-white rounded-2xl border-2 border-sky-200 overflow-hidden mb-5">
          <div className="p-4 border-b-2 border-sky-200 bg-sky-50">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              <span className="text-lg font-black text-sky-800">초대 코드 발급</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">수신자 이메일 *</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">메모 (선택)</label>
                <input
                  value={inviteDesc}
                  onChange={(e) => setInviteDesc(e.target.value)}
                  placeholder="예: 홍길동님 개발팀"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500"
                />
              </div>
              <button
                onClick={async () => {
                  if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
                    alert('이메일 주소를 입력해주세요.')
                    return
                  }
                  setInviteLoading(true)
                  try {
                    const session = await supabase.auth.getSession()
                    const token = session.data.session?.access_token
                    const res = await fetch('/api/admin-invite', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ email: inviteEmail.trim(), description: inviteDesc, validHours: 72 }),
                    })
                    const result = await res.json()
                    if (result.success) {
                      setNewInviteCode(result.code)
                      if (result.emailSent) {
                        setInviteEmailStatus('sent')
                      } else if (result.emailError) {
                        setInviteEmailStatus('error')
                        alert('코드는 발급되었으나 이메일 발송 실패: ' + result.emailError)
                      } else {
                        setInviteEmailStatus('none')
                      }
                      setInviteDesc('')
                      setInviteEmail('')
                      loadInvites()
                    } else {
                      alert('발급 실패: ' + result.error)
                    }
                  } catch (err: any) { alert('오류: ' + err.message) }
                  setInviteLoading(false)
                }}
                disabled={inviteLoading}
                className="px-5 py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold hover:bg-sky-700 disabled:opacity-50 transition-all flex-shrink-0"
              >
                {inviteLoading ? '발급 중...' : '코드 발급 + 이메일 발송'}
              </button>
            </div>

            {newInviteCode && (
              <div className="mt-2 p-4 bg-sky-50 rounded-xl border border-sky-200 text-center">
                {inviteEmailStatus === 'sent' && (
                  <p className="text-[11px] text-green-600 font-bold mb-2">이메일 발송 완료!</p>
                )}
                {inviteEmailStatus === 'error' && (
                  <p className="text-[11px] text-red-500 font-bold mb-2">이메일 발송 실패 (코드는 발급됨)</p>
                )}
                <p className="text-[11px] text-sky-600 mb-2">발급된 초대 코드:</p>
                <div className="text-2xl font-black text-sky-800 tracking-[0.3em] font-mono">{newInviteCode}</div>
                <button
                  onClick={() => { navigator.clipboard.writeText(newInviteCode); alert('복사되었습니다!') }}
                  className="mt-2 text-xs text-sky-500 hover:text-sky-700 font-bold"
                >
                  클립보드에 복사
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 발급 이력 */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <span className="text-base font-bold text-slate-800">발급 이력</span>
            <button
              onClick={loadInvites}
              className="text-xs text-steel-500 hover:text-steel-700 font-bold"
            >
              새로고침
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {invites.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                아직 발급된 초대 코드가 없습니다.
              </div>
            ) : (
              invites.map((inv: any) => {
                const isUsed = !!inv.used_at
                const isExpired = !isUsed && new Date(inv.expires_at) < new Date()
                return (
                  <div key={inv.id} className={`p-4 flex items-center gap-4 ${isUsed ? 'bg-slate-50 opacity-60' : isExpired ? 'bg-red-50/50 opacity-60' : ''}`}>
                    <div className="font-mono text-lg font-black tracking-wider text-slate-700 flex-shrink-0">
                      {inv.code}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-600">{inv.description || '(설명 없음)'}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        발급: {new Date(inv.created_at).toLocaleString('ko-KR')}
                        {' · '}만료: {new Date(inv.expires_at).toLocaleString('ko-KR')}
                        {isUsed && inv.used_at && <> · 사용: {new Date(inv.used_at).toLocaleString('ko-KR')}</>}
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {isUsed ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-200 text-slate-500">
                          사용됨 ({inv.consumer?.employee_name || '알 수 없음'})
                        </span>
                      ) : isExpired ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-red-100 text-red-500">만료됨</span>
                      ) : (
                        <>
                          <span className="text-[10px] font-bold px-2 py-1 rounded bg-green-100 text-green-600">사용 가능</span>
                          <button
                            onClick={async () => {
                              if (!confirm(`"${inv.code}" 코드를 즉시 만료 처리하시겠습니까?`)) return
                              try {
                                const session = await supabase.auth.getSession()
                                const token = session.data.session?.access_token
                                const res = await fetch('/api/admin-invite', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                  body: JSON.stringify({ id: inv.id }),
                                })
                                const result = await res.json()
                                if (result.success) {
                                  loadInvites()
                                } else {
                                  alert('만료 처리 실패: ' + result.error)
                                }
                              } catch (err: any) { alert('오류: ' + err.message) }
                            }}
                            className="text-[10px] font-bold px-2 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                            title="이 초대 코드를 즉시 만료 처리합니다"
                          >
                            즉시 만료
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 안내 */}
        <div className="mt-6 p-3 md:p-4 bg-steel-50 rounded-xl border border-steel-100">
          <p className="text-[11px] md:text-xs text-steel-700">
            <strong>개발자 모드:</strong> 이 페이지는 플랫폼 최고 관리자(god_admin)만 접근할 수 있습니다.
            초대 코드를 통해 새로운 플랫폼 관리자를 추가하거나, 시스템 전반의 개발/디버깅 도구를 관리합니다.
          </p>
        </div>

      </div>
    </div>
  )
}

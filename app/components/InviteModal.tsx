'use client'
import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface Props {
  companyName: string // 회사 이름 표시용
  companyId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function InviteModal({ companyName, companyId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClientComponentClient()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState('staff')
  const [department, setDepartment] = useState('')
  const [position, setPosition] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleInvite = async () => {
    if (!email) return alert('이메일을 입력해주세요.')
    if (!department) return alert('부서를 입력해주세요.')
    if (!position) return alert('직급을 입력해주세요.')

    setLoading(true)
    try {
      // 실제 구현: 여기서 public.invitations 테이블에 Insert 하거나 메일 발송 API 호출
      // 현재는 UI 시뮬레이션
      await new Promise(r => setTimeout(r, 1000)); // 1초 로딩 흉내

      alert(`✅ 초대장 발송 완료!\n\n받는사람: ${email}\n소속회사: ${companyName}\n발령부서: ${department} (${position})\n권한등급: ${role}`)

      onSuccess()
      onClose()

      // 초기화
      setEmail('')
      setDepartment('')
      setPosition('')
    } catch (error: any) {
      alert('오류: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in px-4">
      <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl transform transition-all">

        {/* 헤더 */}
        <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center text-2xl mb-4">📩</div>
            <h3 className="text-2xl font-black text-gray-900">새로운 멤버 초대</h3>
            <p className="text-sm text-gray-500 mt-2">
                <span className="font-bold text-indigo-600">{companyName}</span>의 가족이 될 분을 초대합니다.
            </p>
        </div>

        <div className="space-y-5">
          {/* 이메일 */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">이메일 주소</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-indigo-500 font-bold focus:bg-white transition-colors"
              placeholder="member@company.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 부서 */}
            <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">부서 (Department)</label>
                <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-indigo-500 font-bold focus:bg-white transition-colors"
                placeholder="예: 영업1팀"
                />
            </div>
            {/* 직급 */}
            <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">직급 (Position)</label>
                <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-indigo-500 font-bold focus:bg-white transition-colors"
                placeholder="예: 대리"
                />
            </div>
          </div>

          {/* 권한 선택 */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">시스템 권한 (Role)</label>
            <div className="relative">
                <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-indigo-500 font-bold cursor-pointer appearance-none"
                >
                <option value="manager">🛠️ 매니저 (자금/인사 외 모든 권한)</option>
                <option value="staff">👤 일반 직원 (본인 업무만)</option>
                <option value="driver">🚗 드라이버 (차량 운행일지)</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 ml-1">
                * 관리자(Admin) 권한은 초대 후 설정 페이지에서만 부여 가능합니다.
            </p>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3 mt-10 border-t border-gray-100 pt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleInvite}
            disabled={loading}
            className="flex-1 py-3.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:bg-gray-300 flex items-center justify-center gap-2"
          >
            {loading ? '처리 중...' : '🚀 초대장 보내기'}
          </button>
        </div>
      </div>
    </div>
  )
}
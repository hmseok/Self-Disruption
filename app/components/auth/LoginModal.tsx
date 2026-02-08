'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
// 👇 여기가 수정된 부분입니다!
import { supabase } from '../../utils/supabase'

type Props = {
  isOpen: boolean
  onClose: () => void
}

export default function LoginModal({ isOpen, onClose }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      if (data.session) {
        router.replace('/admin')
      }
    } catch (error: any) {
      alert('로그인 실패: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-2xl relative animate-in fade-in zoom-in duration-200">

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>

        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          관리자 로그인
        </h2>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-steel-500 focus:border-steel-500 outline-none transition-all text-gray-900 placeholder:text-gray-400"
              placeholder="admin@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-steel-500 focus:border-steel-500 outline-none transition-all text-gray-900 placeholder:text-gray-400"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-steel-600 hover:bg-steel-700 text-white font-bold py-3.5 rounded-lg transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? '로그인 중...' : '로그인하기'}
          </button>
        </form>
      </div>
    </div>
  )
}
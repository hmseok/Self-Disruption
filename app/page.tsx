'use client'

// 1. import 추가
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  // 2. 훅 설정
  const supabase = createClientComponentClient()
  const router = useRouter()

  // 3. 로그아웃 함수
  const handleLogout = async () => {
    await supabase.auth.signOut() // Supabase에서 로그아웃
    router.refresh() // 화면 새로고침
    router.push('/login') // 로그인 페이지로 강제 이동
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
           {/* ... 기존 제목 코드 ... */}
           <h1 className="text-3xl font-black">반갑습니다, 대표님! 👋</h1>
        </div>

        {/* 👇 4. 여기에 로그아웃 버튼 추가 */}
        <button
          onClick={handleLogout}
          className="bg-red-100 text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-red-200 transition"
        >
          로그아웃 (테스트)
        </button>
      </div>

      {/* ... 나머지 대시보드 코드들 ... */}
    </div>
  )
}
'use client'
import { createContext, useContext, useState, useEffect } from 'react'

// 회사 데이터 타입 정의
type Company = {
  id: string
  name: string
  role: string
}

// Context에서 사용할 데이터와 함수 모양 정의
type AppContextType = {
  currentCompany: Company | null
  setCurrentCompany: (company: Company) => void // 👈 이게 빠져있어서 에러가 났던 겁니다!
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentCompany, setCurrentCompanyState] = useState<Company | null>(null)

  // 1. [초기화] 새로고침 해도 선택한 회사가 유지되도록 LocalStorage에서 불러오기
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('selected_company')
      if (saved) {
        try {
          setCurrentCompanyState(JSON.parse(saved))
        } catch (e) {
          console.error('회사 정보 로드 실패', e)
        }
      }
    }
  }, [])

  // 2. [함수] 회사를 변경할 때 LocalStorage에도 같이 저장하기
  const setCurrentCompany = (company: Company) => {
    setCurrentCompanyState(company)
    localStorage.setItem('selected_company', JSON.stringify(company))
  }

  return (
    <AppContext.Provider value={{
      currentCompany,
      setCurrentCompany // 👈 이제 이 함수를 모든 페이지에서 쓸 수 있습니다.
    }}>
      {children}
    </AppContext.Provider>
  )
}

// 커스텀 훅 (다른 파일에서 useApp()으로 쉽게 불러오기 위함)
export const useApp = () => {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
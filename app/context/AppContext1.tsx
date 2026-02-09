'use client'
import React, { createContext, useContext, useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js' // 👈 변경된 부분 (안정적)
import { useRouter } from 'next/navigation'

// 회사 데이터 타입
type Company = {
  id: string;
  name: string;
  role: string; // admin, manager, staff, driver
}

interface AppContextType {
  user: any;
  companies: Company[];
  currentCompany: Company | null;
  switchCompany: (companyId: string) => void;
  isLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // 🟢 환경 변수에서 URL과 키를 가져와 직접 클라이언트 생성 (에러 해결)
  const [supabase] = useState(() =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  const [user, setUser] = useState<any>(null)

  // 회사 목록 및 현재 선택된 회사
  const [companies, setCompanies] = useState<Company[]>([])
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 로그인이 안 되어 있으면 중단
      if (!user) {
        setIsLoading(false);
        return;
      }
      setUser(user);

      // 1. 내가 소속된 회사 목록 조회 (DB)
      // company_members 테이블에서 내 user_id로 조회
      const { data: members, error } = await supabase
        .from('company_members')
        .select(`
          role,
          company:companies ( id, name )
        `)
        .eq('user_id', user.id);

      if (members && members.length > 0) {
        // 데이터 가공 (Flatten)
        const myCompanies = members.map((m: any) => ({
          id: m.company.id,
          name: m.company.name,
          role: m.role
        }));
        setCompanies(myCompanies);

        // 2. 마지막으로 선택했던 회사 불러오기 (없으면 첫 번째)
        const savedCompanyId = localStorage.getItem('last_company_id');
        const target = myCompanies.find(c => c.id === savedCompanyId) || myCompanies[0];
        setCurrentCompany(target);
      } else {
        // 회사가 없는 경우 (신규 가입 등)
        setCompanies([]);
        setCurrentCompany(null);
      }
    } catch (e) {
      console.error('Profile Fetch Error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  // 회사 전환 함수
  const switchCompany = (companyId: string) => {
    const target = companies.find(c => c.id === companyId);
    if (target) {
      setCurrentCompany(target);
      localStorage.setItem('last_company_id', target.id); // 선택 기억
      router.push('/'); // 메인으로 이동
      router.refresh(); // 데이터 새로고침
    }
  }

  return (
    <AppContext.Provider value={{ user, companies, currentCompany, switchCompany, isLoading }}>
      {children}
    </AppContext.Provider>
  )
}

// Hook
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
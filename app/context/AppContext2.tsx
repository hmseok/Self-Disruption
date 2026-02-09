'use client'
import React, { createContext, useContext, useState, useEffect } from 'react'
// 🚨 [수정] 여기서 직접 생성하지 않고, auth-helpers를 씁니다.
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

type Company = {
  id: string;
  name: string;
  role: string;
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
  // 🚨 [수정] 쿠키를 공유하는 클라이언트 생성
  const [supabase] = useState(() => createClientComponentClient())

  const [user, setUser] = useState<any>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      // 1. 쿠키에 저장된 세션 가져오기
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setIsLoading(false);
        return; // 로그인 안됐으면 조용히 종료 (ClientLayout이 처리함)
      }

      const currentUser = session.user;
      setUser(currentUser);

      // 2. 회사 데이터 조회
      const { data: members, error } = await supabase
        .from('company_members')
        .select(`
          role,
          company:companies ( id, name )
        `)
        .eq('user_id', currentUser.id);

      if (members && members.length > 0) {
        const myCompanies = members.map((m: any) => ({
          id: m.company.id,
          name: m.company.name,
          role: m.role
        }));
        setCompanies(myCompanies);

        const savedCompanyId = localStorage.getItem('last_company_id');
        const target = myCompanies.find(c => c.id === savedCompanyId) || myCompanies[0];
        setCurrentCompany(target);
      } else {
        setCompanies([]);
        setCurrentCompany(null);
      }
    } catch (e) {
      console.error('Profile Fetch Error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  const switchCompany = (companyId: string) => {
    const target = companies.find(c => c.id === companyId);
    if (target) {
      setCurrentCompany(target);
      localStorage.setItem('last_company_id', target.id);
      router.push('/');
      router.refresh();
    }
  }

  return (
    <AppContext.Provider value={{ user, companies, currentCompany, switchCompany, isLoading }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
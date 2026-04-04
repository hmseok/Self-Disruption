'use client'

import { useRouter } from 'next/navigation';
import { useEffect, useState, ReactNode } from 'react';
import { auth } from '@/lib/auth-client';

interface ProtectedRouteProps {
  allowedRoles: string[];
  children: ReactNode;
}

const ProtectedRoute = ({ allowedRoles, children }: ProtectedRouteProps) => {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken()
          const res = await fetch('/api/profiles/me', {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (res.ok) {
            const profile = await res.json()
            setRole(profile.role || 'staff')
          } else {
            setRole('staff')
          }
        } catch {
          setRole('staff')
        }
      } else {
        setRole(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, []);

  if (loading) return <div>권한 확인 중...</div>;

  if (!role || !allowedRoles.includes(role)) {
    router.push('/');
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
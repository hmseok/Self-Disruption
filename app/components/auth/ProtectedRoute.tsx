import { Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient'; // 경로 확인 필요

// Props에 대한 타입 정의
interface ProtectedRouteProps {
  allowedRoles: string[]; // 허용된 역할들의 배열 (예: ['admin', 'partner'])
}

const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // profiles 테이블에서 role 가져오기
        // DB 응답 타입도 지정해주면 좋지만, 일단은 any 혹은 제네릭으로 처리
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        // 데이터가 있으면 role 설정, 없으면 기본값 'staff'
        setRole(data?.role || 'staff');
      }
      setLoading(false);
    };

    fetchUserRole();
  }, []);

  if (loading) return <div>권한 확인 중...</div>;

  // role이 null이거나 allowedRoles에 포함되지 않으면 차단
  if (!role || !allowedRoles.includes(role)) {
    alert("접근 권한이 없습니다.");
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
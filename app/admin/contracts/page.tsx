'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 계약 관리 대시보드 → 견적/계약 페이지의 계약 탭으로 통합됨
 * 이 페이지는 리다이렉트만 수행
 */
export default function ContractPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/quotes?tab=contracts');
  }, [router]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', color: '#9ca3af' }}>
      이동 중...
    </div>
  );
}

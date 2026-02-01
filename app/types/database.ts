// app/types/database.ts

export interface CommonCode {
  id: string;
  category: string; // 예: 'FUEL'
  code: string;     // 예: 'GAS'
  value: string;    // 예: '가솔린'
  sort_order: number;
  is_active: boolean;
}

// 나중에 DB 타입을 자동으로 생성해주는 도구도 있지만, 지금은 이렇게 수동으로 잡아도 충분합니다.
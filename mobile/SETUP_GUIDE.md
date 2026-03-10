# 현장직원 모바일 앱 - 설정 및 빌드 가이드

## 1. 사전 준비

### 필수 도구
- Node.js 18+ & npm
- React Native CLI (`npx react-native`)
- Xcode 15+ (iOS) / Android Studio (Android)
- CocoaPods (`sudo gem install cocoapods`)

### 환경 확인
```bash
cd mobile
npx react-native doctor
```

---

## 2. 데이터베이스 마이그레이션

### Supabase에서 실행할 SQL
`supabase/migrations/20260306_mobile_field_worker_tables.sql` 파일을 Supabase SQL Editor에서 실행하세요.

이 마이그레이션은 다음 테이블을 생성합니다:
- `vehicle_handovers` — 차량 인수인계
- `maintenance_requests` — 정비 요청
- `schedules` — 배차/일정
- `device_tokens` — 푸시 알림 토큰

### Storage 버킷 생성
Supabase Dashboard > Storage에서 다음 버킷을 생성하세요:
- `vehicle-photos` (Public)
- `maintenance-photos` (Public)
- `accident-photos` (Public)
- `handover-photos` (Public)

---

## 3. 설정 파일 수정

### 카카오 API 키 (역지오코딩용)
`mobile/src/hooks/useLocation.ts`에서 카카오 API 키를 수정하세요:
```typescript
// 약 80번 줄 근처
headers: { Authorization: 'KakaoAK YOUR_ACTUAL_KEY' }
```
카카오 개발자 콘솔(https://developers.kakao.com)에서 REST API 키를 발급받으세요.

### Firebase 설정 (푸시 알림)
- iOS: `GoogleService-Info.plist`를 `ios/` 폴더에 추가
- Android: `google-services.json`을 `android/app/` 폴더에 추가

---

## 4. 빌드 및 실행

### 의존성 설치
```bash
cd mobile
npm install

# iOS 전용
cd ios && pod install && cd ..
```

### iOS 실행
```bash
npx react-native run-ios
# 또는 특정 시뮬레이터
npx react-native run-ios --simulator="iPhone 15 Pro"
```

### Android 실행
```bash
npx react-native run-android
```

---

## 5. 주요 기능 검증 체크리스트

### 인증
- [ ] 로그인 (기존 웹 계정)
- [ ] 자동 세션 복원

### 대시보드 (홈)
- [ ] 오늘의 업무 카운트 표시
- [ ] 퀵 액션 (인수인계/정비/사고/일정)
- [ ] KPI 카드 (차량수/보험/견적/매출)

### 차량 목록
- [ ] 상태별 필터 탭
- [ ] 검색 기능
- [ ] 카드별 퀵액션 버튼
- [ ] 롱프레스 메뉴

### 일정
- [ ] 주간 날짜 선택
- [ ] 일정 카드 표시
- [ ] 업무 시작/완료 처리
- [ ] 전화/길안내 연동

### 차량 인수인계
- [ ] 4단계 위저드 진행
- [ ] 사진 촬영 (6방향)
- [ ] 손상 체크리스트
- [ ] 제출 및 DB 저장

### 정비 요청
- [ ] 차량 선택
- [ ] 유형/우선순위 선택
- [ ] 사진 첨부
- [ ] 제출 및 DB 저장

### 사고 접수
- [ ] GPS 위치 자동 캡처
- [ ] 사고 유형/심각도
- [ ] 상대방/목격자 정보
- [ ] 제출 및 DB 저장

### 더보기
- [ ] 프로필 표시
- [ ] 오프라인 동기화 버튼
- [ ] 메뉴 네비게이션

### 오프라인
- [ ] 비행기 모드에서 요청 큐잉
- [ ] 네트워크 복구 시 자동 동기화

---

## 6. 프로젝트 구조

```
mobile/src/
├── components/ui/       # 공통 UI 컴포넌트 (Card, Badge, Button, Input)
├── constants/           # 테마, 색상, 폰트
├── context/             # AppContext (전역 상태)
├── hooks/               # useCamera, useLocation, useNotifications
├── lib/                 # api.ts, supabase.ts, types.ts, auth.ts
├── navigation/          # 네비게이터 (Tab + Stack)
├── screens/
│   ├── auth/            # 로그인, 회원가입
│   ├── tabs/            # 5개 탭 화면
│   │   ├── DashboardScreen.tsx
│   │   ├── CarsScreen.tsx
│   │   ├── ScheduleScreen.tsx
│   │   ├── QuotesScreen.tsx
│   │   └── MoreScreen.tsx
│   └── detail/          # 상세/양식 화면
│       ├── VehicleHandoverScreen.tsx
│       ├── MaintenanceRequestScreen.tsx
│       ├── AccidentReportScreen.tsx
│       ├── CarDetailScreen.tsx
│       └── ...
└── services/            # SyncService
```

# SQL 마이그레이션 가이드

## 실행 순서 (Supabase SQL Editor에서)

| 순서 | 파일 | 설명 |
|------|------|------|
| 1 | `001_rls_fix.sql` | RLS 무한재귀 해결 + SECURITY DEFINER 헬퍼 함수 |
| 2 | `002_platform_admin.sql` | Platform Admin 초대 코드 시스템 + 트리거 수정 |
| 3 | `003_plan_groups.sql` | 플랜 그룹 컬럼 + 모듈/회사 관리 RPC 함수 |

## 실행 후 확인사항

1. RLS 정책이 정상 적용되었는지 확인
2. god_admin 계정으로 로그인 후 모든 페이지 데이터 표시 확인
3. 구독관리 > 모듈 플랜 그룹 변경이 정상 동작하는지 확인
4. 구독관리 > 회사 플랜 변경 → 모듈 자동 ON/OFF 확인
5. 콘솔에 RLS 에러가 없는지 확인

## 이미 정리된 항목

- `supabase.ts` — 프록시 제거 완료 (정상 RLS 사용)
- `/api/sp/` — REST 프록시 삭제 완료
- `/api/fix-rls/` — RLS DDL 시도 삭제 완료
- `/api/profile/` — 프록시 대체 삭제 완료
- `/api/restore-modules/` — 모듈 복구 완료 후 삭제

## Platform Admin 운영 가이드

### 최초 관리자 (부트스트랩)
- DB에서 직접 `profiles.role = 'god_admin'` 설정 (최초 1회만)
- 이후 모든 관리자는 초대 코드로 가입

### 관리자 추가
1. 기존 god_admin이 구독관리 > 관리자 초대에서 코드 발급
2. 신규 관리자가 회원가입 시 "관리자 초대 코드" 입력
3. 자동으로 god_admin 역할 부여 (회사 미배정, 즉시 활성)

### 보안
- 초대 코드는 1회용
- 기본 72시간 만료
- 발급/사용 이력 전부 기록 (admin_invite_codes 테이블)

## 플랜 체계

| 플랜 | 레벨 | 설명 |
|------|------|------|
| free | 0 | 무료 (기본 모듈만) |
| basic | 1 | 베이직 (free 포함) |
| pro | 2 | 프로 (basic 포함) |
| max | 3 | 맥스 (전체 모듈) |

상위 플랜은 하위 플랜의 모든 모듈을 포함합니다.

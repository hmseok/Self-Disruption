# Ride Inc. 직원 마스터 — CallScheduler 와의 관계 메모

> 2026-05-03 — 사용자 지시: "라이드 직원 관리는 별도로 DB 추가" 반영

## 구조

```
profiles (auth)            ← 인증 계정 (로그인)
   ↑ profile_id (옵션)
ride_employees (인사)       ← Ride Inc. 전체 직원 마스터  (이번에 신설)
   ↑ employee_id (옵션)
cs_workers (콜센터 특화)    ← CallScheduler 워커 (color_tone, group_label 등)
   ↑ worker_id
cs_assignments              ← 일자×슬롯 배정
```

## 마이그레이션 적용 순서

1. `migrations/2026-05-03_call_scheduler_init.sql` (이미 적용 완료)
2. `migrations/2026-05-03_ride_employees_init.sql` (**다음 적용 필요**)
   - 자동: 기존 cs_workers 16명을 ride_employees 로 이전 + employee_id FK 채움

## API 영향

- **현재**: CallScheduler API 는 cs_workers.name/phone/email 직접 사용 — 변동 없음
- **추후 (Phase 2)**: cs_workers 의 마스터 컬럼들을 ride_employees JOIN 으로 대체
  - GET `/api/call-scheduler/workers` → JOIN ride_employees ON employee_id
  - 라이드 직원 마스터 페이지 신설 시 cs_workers 의 마스터 컬럼은 deprecated → 제거

## 향후 추가될 직원 페이지 (Employee of Ride Inc. 그룹)

같은 `ride_employees` 마스터를 공유:

- 근무시간표 (CallScheduler) — ✅ 본 PR 신설
- 직원 목록/관리 — 🔜
- 휴가/연차 관리 — 🔜
- 근태 (체크인/아웃) — 🔜
- 급여 — 🔜 (별도 권한)

## 주의

- ride_employees 는 단일 회사 (Ride Inc.) 전제 — 멀티 컴퍼니 이슈 없음
- profiles ↔ ride_employees 는 옵셔널 — 외부 직원도 등록 가능 (로그인 계정 없음)
- CallScheduler 의 모든 워커 마스터 변경은 향후 ride_employees 페이지에서 일원화

# OPERATIONS.md — 카페24 ERP 운영 사실

> 규칙 25 (도메인 운영 사실 우선 인지) 기반.
> 마지막 갱신: 2026-05-05 (PR-6.1 사용자 인터뷰 결과 반영)

---

## 1. 운영 시간 ✅

```
✅ 24/365 운영
   - 사고차 대차 도메인 — 사고는 언제든 발생
   - 카페24 PB 데스크톱 측: 24시간 누군가 작업 가능
   - FMI 측 함의: read 일관성 항상 유지 (캐시 정책 신중)
```

**FMI 측 영향**:
- 모든 페이지가 야간/주말에도 stale data 없이 동작해야 함
- 알람/배치 작업은 24시간 분포 — 오전 9시 일괄 처리 X

---

## 2. 데이터 흐름 장기 방향 ✅

```
✅ 카페24 → FMI 단계적 마이그레이션 → 카페24 폐기

단계 1 (현재 PR 들): read-only — 카페24 master, FMI 는 view
단계 2 (TBD)        : 양방 동기화 — FMI 입력도 카페24 INSERT/UPDATE
단계 3 (TBD)        : 카페24 OFF — FMI 가 primary, PB 데스크톱 폐기
```

**Source of Truth (단계별)**:
- 단계 1: 카페24 = master (FMI 측 변경 X — read 만)
- 단계 2: FMI 우선 — FMI 입력값을 카페24 에도 반영
- 단계 3: FMI 만 — 카페24 폐기 후 unique source

---

## 3. 부서 / 그룹 차이 ✅

```
✅ 페르소나 다양 — 운영자 / 관리자 / 보험 담당 모두 사용
✅ 권한별 다른 화면 분리 필요

[A] 사고차 대차 운영자 (acr_app 매핑)
   - 사고 접수 → 배차 → 정산 풀 워크플로우
   - aceesosh / ajaoderh / ajaopslh 직접 다룸

[B] 관리자/임원
   - KPI 모니터링 + 일별/월별 리포트
   - 통합 대시보드 (오늘 N건 / 진행 N건 / 미정산 N건)

[C] 보험 담당 (ins_app 매핑)
   - 청구·과실율·자기부담금 (ajcinsph / ajaoderh.bogn/bomx/bomn/bofc/etcn)
```

**FMI 측 영향**: PR-6.X 마다 페르소나 명시 + 권한별 화면 분리 설계.

---

## 4. 마스터 데이터 변동 빈도 ✅

```
✅ 분당 단위 — 거의 실시간 변동
   - 카페24 PB 데스크톱이 1분 단위로 INSERT/UPDATE 자주 발생
   - 사고차 대차 특성상 사고 접수, 배차, 정산 모두 활발

→ FMI 측 캐시 정책: 30~60초 (1분 이내)
```

**구현 함의**:
- React Query / SWR `staleTime: 30000` 권장
- DB connection pool — keep-alive 짧게 (idle 60s)
- 무거운 SQL 결과만 캐시, 단순 조회는 매 요청 fresh

---

## 5. FMI 측 사용자 권한 ✅

```
✅ 일단 관리자 전용 (HIDDEN_PATHS 또는 admin role 체크)
✅ 권한 분리 (직군별)는 별도 PR — 안정화 후 결정

PR-6.X 진행 시 모든 카페24 페이지에:
  - middleware.ts 또는 page.tsx 첫 줄에 admin 체크
  - 또는 ClientLayout 의 HIDDEN_PATHS 패턴 사용
  - "권한 없음" 처리 — Forbidden 페이지로 리다이렉트
```

---

## 6. 데이터 동기화 정책 ✅

```
✅ 외부 IP read-only 직접 접속 (사용자 결정 PR-6.0a Q1=A)
✅ 캐시: 30~60초 (분당 변동 패턴)
✅ Connection pool: mysql2 read-only mode + idle timeout 60s
✅ Read-only transaction (SET TRANSACTION READ ONLY) 의무

❌ 단계 1 에서 절대 X:
   - INSERT / UPDATE / DELETE
   - DDL (CREATE / ALTER / DROP)
   - 카페24 측 sync 시도 (단계 2 의무)
```

---

## 7. 보안 / 컴플라이언스 (확정 + TBD)

```
✅ 자격증명 분리: lib/cafe24-db.ts 단일 진입점
✅ .env.local 마스킹 후 commit (값 절대 X)
✅ cafe24_source 폴더 FMI repo 와 영구 분리
✅ Read-only — 데이터 변경 불가 (보안 + 데이터 무결성)

❓ 개인정보 처리:
   - 카페24 측 고객 이름 / 전화 / 주소 보유
   - FMI 측 마스킹 정책 (전화 010-****-1234 / 주소 동까지) — 별도 PR 결정
```

---

## 8. 기술 운영 사실 (확정)

```
✅ DB 종류: MariaDB 10.1.13 (Distrib 10.0.21)
✅ Charset: utf8 (utf8mb3 추정)
✅ TIME_ZONE: '+00:00' (UTC) — 한국 시간 변환 시 +9시간
✅ 자격증명: .env.local 의 CAFE24_DB_* (5개 키)
✅ 호스트: PHP 측 localhost / FMI 측 외부 IP 필요 (사용자 액션)
✅ 포트: ❓ 3306 가정 (PR-6.2 connection 시 검증)
✅ 동시 사용: PB 데스크톱 + PHP 웹 + FMI ERP (3중)
✅ MariaDB 10.1 호환 함수만 (CLAUDE-Cafe24.md § 2)
```

---

## 9. 미확정 / 향후 인터뷰 ❓

```
❓ 마이그레이션 타임라인: 미정 — 안정화 후 결정 (Q6=D)
   → 본 PR 들은 "장기 운영" 가능 설계 의무 (임시 X)

❓ 사고/장애 이력 / RPO / RTO 정책

❓ 카페24 측 백업 정책 (picuserm.sql 끊긴 이유?)

❓ 운영자 PC 환경 (Windows 7? 10? 11?) — PB 데스크톱 호환

❓ 동명이인 / 협력업체 중복 처리 정책

❓ FMI 마이그레이션 후 PB 데스크톱 폐기 절차
```

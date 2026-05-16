# CallScheduler — Cron 자동 생성 셋업 가이드

> N-21-c (2026-05-16) — Cloud Scheduler 로 매월 1일 자동으로 다음 달 스케줄 draft 생성

## 개요

| 항목 | 값 |
|------|-----|
| Endpoint | `POST https://hmseok.com/api/call-scheduler/cron/auto-generate-monthly` |
| 권장 Cron | `0 6 1 * *` (매월 1일 새벽 6시) |
| Timezone | `Asia/Seoul` |
| 인증 | `?secret=<CRON_SECRET>` 또는 OIDC |

## 동작
1. 현재 시점 기준 **다음 달** 의 `cs_schedules` 가 없으면 status='draft' 로 생성
2. 이미 있으면 skip (멱등)
3. 자동 생성 알고리즘 (auto-generate) **호출 X** — 매니저가 검토 후 수동 실행
   - 안전성 우선 — cron 이 잘못된 데이터로 publish 하지 않도록

## 셋업 단계

### 1단계 — `CRON_SECRET` 환경변수 등록

GCP Cloud Run 콘솔:
1. Cloud Run → Self-Disruption 서비스 → 「수정 및 새 버전 배포」
2. 「변수 및 보안 비밀」 → 「변수 추가」
3. 이름: `CRON_SECRET` / 값: 충분히 긴 random 문자열 (예: `openssl rand -hex 32` 출력)
4. 「배포」

### 2단계 — Cloud Scheduler 작업 생성

GCP 콘솔 → 「Cloud Scheduler」:

1. 「작업 만들기」
2. **이름**: `cs-auto-generate-monthly`
3. **리전**: `asia-northeast3`
4. **빈도**: `0 6 1 * *` (매월 1일 KST 06:00)
5. **시간대**: `Asia/Seoul (KST)`
6. **대상 유형**: HTTP
7. **URL**: `https://hmseok.com/api/call-scheduler/cron/auto-generate-monthly?secret=<CRON_SECRET 값>`
8. **HTTP 메서드**: POST
9. **HTTP 헤더** (선택): `Content-Type: application/json`
10. **본문**: 비워둠 (필요 시 `{"target":"2026-07"}` 으로 특정 월 강제 지정)

### 3단계 — 테스트

Cloud Scheduler 작업 목록에서 「강제 실행」 클릭 → 응답 확인:
- 성공: `{ data: { year, month, action: 'created', schedule_id }, error: null }`
- 이미 있음: `{ data: { action: 'skip-already-exists' }, error: null }`
- 인증 실패: `{ error: '인증 실패' }` 401

## 호출 예시

```bash
# 다음 달 자동 생성
curl -X POST "https://hmseok.com/api/call-scheduler/cron/auto-generate-monthly?secret=<CRON_SECRET>"

# 특정 월 강제 생성 (예: 2026-07)
curl -X POST "https://hmseok.com/api/call-scheduler/cron/auto-generate-monthly?secret=<CRON_SECRET>&target=2026-07"
```

## 트러블슈팅

| 응답 | 원인 | 해결 |
|------|------|------|
| 401 인증 실패 | CRON_SECRET 미설정 또는 query secret 불일치 | Cloud Run 환경변수 확인 |
| 500 CRON_SECRET 환경변수 미설정 | Cloud Run 에 변수 추가 안 됨 | 1단계 셋업 |
| 200 skip-already-exists | 이미 해당 월 스케줄 존재 | 정상 (멱등) |
| HTML 응답 | 라우트 미배포 (Cloud Build 빌드 미완료) | 빌드 완료 대기 |

## 운영 흐름

```
매월 1일 06:00 KST
  ↓
Cloud Scheduler 트리거
  ↓
/api/call-scheduler/cron/auto-generate-monthly POST
  ↓
cs_schedules 다음 달 row 생성 (status='draft', source='cron')
  ↓
매니저가 출근 후 「📅 월별 스케줄」 list 에서 draft 발견
  ↓
클릭 → 자동 생성 (auto-generate) 트리거 → 검토 → publish
```

## 미래 확장 (TBD)

- 자동 생성 알고리즘도 cron 에서 호출 (현재는 draft 만 생성)
- 결과를 매니저에게 이메일/Slack 알림
- 검증 실패 시 자동 알람

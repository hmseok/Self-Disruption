# DATA-MODEL — RideVision (비전)

> 데이터 모델 / 테이블 / API. 매 마이그레이션·API 변경 시 갱신 (CLAUDE.md 규칙 22).

---

## 테이블

### `ride_lotto_entries` — 사용자 구매 게임 기록
마이그레이션: `migrations/2026-05-24_ride_vision_lotto.sql` (PR-VISION-2)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | VARCHAR(36) PK | randomUUID |
| user_id | VARCHAR(36) | 인증 사용자 (profiles.id) |
| draw_no | INT | 구매 대상 회차 |
| n1~n6 | TINYINT UNSIGNED | 구매 번호 6개 (오름차순 저장) |
| amount | INT DEFAULT 1000 | 게임당 투자금 (원) |
| source | VARCHAR(16) DEFAULT 'extractor' | extractor / manual |
| created_at | DATETIME | 기록 시각 |

인덱스: `idx_lotto_entry_user(user_id)`, `idx_lotto_entry_user_draw(user_id, draw_no)`

### `ride_lotto_results` — 동행복권 회차 당첨번호 캐시
| 컬럼 | 타입 | 설명 |
|---|---|---|
| draw_no | INT PK | 동행복권 drwNo |
| n1~n6 | TINYINT UNSIGNED | 당첨번호 6개 |
| bonus | TINYINT UNSIGNED | 보너스 번호 |
| draw_date | DATE NULL | 추첨일 (drwNoDate) |
| fetched_at | DATETIME | 캐시 적재 시각 |

당첨번호는 회차당 불변 → 라우트가 `INSERT IGNORE` 로 멱등 적재.

---

## API (`app/api/ride-vision/`)

### `GET /api/ride-vision/lotto-result` — PR-VISION-2a
- `?drwNo=N` — N 회차 당첨번호 (캐시 우선 → 동행복권 조회 → 캐시 적재)
- `?latest=1` — 최신 추첨 완료 회차 추정 + 당첨번호
- 동행복권 비공식 엔드포인트 서버사이드 조회 (`common.do?method=getLottoNumber&drwNo=N`)
- 첫 호출 raw 응답 로깅 (Rule 3 dry-run 검증)
- 응답: `{ success, data: { draw_no, n1~n6, bonus, draw_date } | null, meta }`
- 미추첨 회차 → `data: null, meta.drawn: false`
- 인증: verifyUser (로그인 직원 누구나)

### (예정) `GET/POST /api/ride-vision/lotto-entries` — PR-VISION-2b
### (예정) `DELETE /api/ride-vision/lotto-entries/[id]` — PR-VISION-2b

---

## 외부 연동

**동행복권** — `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=N`
- 비공식 엔드포인트. 응답 JSON: `returnValue`('success'|'fail'), `drwNo`, `drwNoDate`, `drwtNo1~6`, `bnusNo`, `totSellamnt`, `firstWinamnt`
- 미추첨/미존재 회차 → `returnValue:'fail'`
- 서버사이드(API route)에서만 호출 — 클라이언트 직접 호출 X
- 결과 캐시(`ride_lotto_results`)로 같은 회차 재호출 차단

## 당첨 판정 규칙 (PR-VISION-2c 예정)
일치 개수: 6→1등 / 5+보너스→2등 / 5→3등 / 4→4등(5만원) / 3→5등(5천원) / 그 외→낙첨

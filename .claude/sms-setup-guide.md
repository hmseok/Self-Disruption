# SMS 웹훅 셋업 가이드 (Phase 1)

> 안드로이드 공기계로 카드사 SMS를 FMI ERP 로 자동 전달하는 설정.
> 예상 월 운영비: **공기계 1회성 + 알뜰폰 월 6,000~15,000원**

---

## 0. 준비물

| 항목 | 비고 |
|------|------|
| 안드로이드 공기계 1대 | 구 폰 재활용 가능 (안드로이드 8.0+ 권장) |
| 알뜰폰 SIM | 데이터 최소 플랜 (SKT/KT/LGU+ MVNO — KT M모바일, SKT 7모바일 등) |
| FMI 관리자 계정 | `/finance/sms` 관리 UI 접근용 |
| Cloud Run 환경변수 | `SMS_WEBHOOK_TOKEN` (아래 1번 참조) |

---

## 1. 서버 측 환경변수 설정 (⚠️ 배포 전 필수)

### 1-1. 토큰 생성
```bash
openssl rand -hex 32
# 출력 예: a7f3c2d9e8b1...(64자)
```

### 1-2. Cloud Run 환경변수 추가
GCP 콘솔 → Cloud Run → `self-disruption` 서비스 → 새 수정 → 변수:

```
SMS_WEBHOOK_TOKEN = <위에서 생성한 64자 문자열>
```

또는 CLI:
```bash
gcloud run services update self-disruption \
  --region=asia-northeast3 \
  --update-env-vars SMS_WEBHOOK_TOKEN=<토큰>
```

### 1-3. 마이그레이션 실행 (DB 테이블 생성)
```bash
DATABASE_URL='mysql://fmi_app:...@34.47.105.219:3306/fmi_op' \
  node scripts/migrate_sms_webhook_2026_04_21.mjs
```
출력: `✅ card_sms_transactions 테이블 생성 완료`

### 1-4. 헬스체크
```bash
curl https://hmseok.com/api/finance/sms-webhook
# { "ok": true, "endpoint": "sms-webhook" }
```

---

## 2. 안드로이드 공기계 셋업

### 2-1. 추천 앱: **"SMS Forwarder"** (by Bogdan Tudose)
Play Store 검색 → 설치 (무료, 광고 없음).

대안:
- **SMS Gateway** (Capcom) — 유료 ₩5,000/월, UI 더 깔끔
- **SMS to URL Forwarder** — 오픈소스

### 2-2. 권한 부여
앱 최초 실행 시 다음 권한 **모두 허용**:
- SMS 읽기
- 휴대전화 상태 (선택)
- 백그라운드 실행 (⚠️ 배터리 최적화 제외 설정 필수)

### 2-3. Forward 규칙 추가
앱 안에서 **"+"** 또는 **"Add Rule"**:

| 필드 | 값 |
|------|----|
| Rule name | `FMI 카드 SMS` |
| Filter by sender | ✅ (아래 번호 전부) |
| Sender patterns | `15884000`, `15881688`, `16445000`, `18006699`, `15888000` |
| Destination | **HTTP POST** |
| URL | `https://hmseok.com/api/finance/sms-webhook` |
| Method | POST |
| Content-Type | `application/json` |
| Body | `{"from":"%from%","text":"%text%","sentStamp":%sentStamp%}` |
| Custom Headers | `X-Sms-Token: <토큰>` |

> 앱마다 변수 문법이 조금씩 다름:
> - SMS Forwarder: `%from%`, `%text%`, `%sentStamp%`
> - SMS Gateway: `{{from}}`, `{{text}}`, `{{sentStamp}}`

### 2-4. 배터리 최적화 제외
설정 → 배터리 → 배터리 최적화 → 앱 선택 → **"최적화 안 함"**

### 2-5. 자동 시작 허용
공기계를 재부팅해도 앱이 자동으로 켜지게:
- 설정 → 앱 → SMS Forwarder → "자동 시작 허용"

---

## 3. 카드사별 SMS 수신번호 변경

공기계에 꽂은 알뜰폰 번호로 **SMS 알림 수신번호를 변경** 합니다.

### 3-1. KB국민카드 (법인)
1. **기업뱅킹** 로그인 → **법인카드** → **카드관리**
2. **정보관리 > SMS 수신정보** → 휴대폰 번호 변경
3. 별도로 **사용알림 활성화 (승인/취소 전부 ON)**
4. ✅ 확인: 시범 결제 시 공기계로 문자 수신

### 3-2. 우리카드 (법인)
1. 우리WON비즈 앱 → **법인카드** → **카드 관리**
2. **이용알림 설정** → 연락처 변경
3. 또는 전화: **1588-1688** (법인카드 고객센터)

### 3-3. 현대카드 (법인)
1. 현대카드 앱 → **내 카드** → **알림 설정**
2. **이용내역 알림 > 수신번호 변경**
3. 또는: 법인카드센터 **1644-5000**

> ⚠️ **주의**: 카드사마다 "이메일 알림" / "앱 푸시 알림" / "SMS 알림" 이 분리되어 있음.
> SMS 알림을 반드시 체크 → 번호를 공기계 번호로.

---

## 4. 테스트 체크리스트

### 4-1. 웹훅 직접 호출 (공기계 없이 먼저 확인)
```bash
curl -X POST https://hmseok.com/api/finance/sms-webhook \
  -H 'X-Sms-Token: <토큰>' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "15884000",
    "text": "[KB국민] 홍길동 4/21 14:32 CU편의점 3,500원 일시불 승인",
    "receivedAt": "2026-04-21T14:32:00+09:00"
  }'
```
응답:
```json
{
  "status": "parsed",
  "id": "...",
  "parsed": {
    "issuer": "KB",
    "type": "approved",
    "holder": "홍길동",
    "amount": 3500,
    "merchant": "CU편의점",
    "installment": "일시불"
  }
}
```

### 4-2. `/finance/sms` 페이지에서 확인
- ✅ 스탯 카드: "파싱 성공: 1건" 표시
- ✅ 테이블에 한 줄 나옴

### 4-3. 실제 카드로 결제 테스트
1. 공기계가 켜져있는 상태에서
2. 등록한 법인카드로 소액 결제 (예: 편의점 1,000원)
3. 1~2분 안에 `/finance/sms` 페이지에 신규 행 노출되어야 함

### 4-4. 취소 테스트
- 방금 결제 취소 → "🔄 취소" 행 추가 확인

---

## 5. 운영 체크 루틴 (월 1회)

| 항목 | 확인 | 조치 |
|------|------|------|
| 파싱 실패율 | `/finance/sms` 스탯에서 실패 > 5% | 원문 확인 → `lib/sms-parsers.ts` 정규식 수정 |
| SMS 누락 | 월말 명세서 CSV 와 대조 | 누락분 `/finance/upload` 로 수동 업로드 |
| 공기계 상태 | 배터리 충전, 앱 실행 중 | 상시 전원 연결 권장 |
| 토큰 유효성 | 헬스체크 성공 | 필요 시 토큰 교체 |

---

## 6. 알려진 제약 / 향후 개선 (Phase 2)

- [ ] 파싱 성공 건을 `transactions` 테이블로 자동 insert (현재는 `card_sms_transactions`에만 쌓임)
- [ ] 취소 SMS 를 같은 금액의 승인 건과 자동 매칭
- [ ] `corporate_cards.card_alias` 와 연결 → 차량/직원 자동 매칭
- [ ] 가맹점명 → 카테고리 자동 분류 (`/api/finance/classify` 재사용)
- [ ] 월말 명세서 CSV 와 자동 대조 + 누락률 리포트
- [ ] SMS 파서 실패 케이스 Gemini 에게 넘기기 (fallback)

---

## 7. 비용 시뮬레이션 (월 기준)

| 항목 | 예상 비용 |
|------|----------|
| 공기계 (1회성) | 0원 (구 폰 재활용) ~ 50,000원 (중고) |
| 알뜰폰 SIM (데이터 100MB, 무제한 통화X) | 6,600원 (7모바일 LTE 최저가) |
| 서버 비용 증가분 | 거의 0원 (Cloud Run 요청 월 100~500건) |
| **합계** | **월 6,600원~15,000원** |

Codef: 월 20~50만원  ·  BizPlay: 월 5만원~  ·  **SMS: 월 1만원 이하** ✅

---

## 문제 해결 (FAQ)

**Q. 웹훅 호출 시 401 Unauthorized**
→ `X-Sms-Token` 헤더 값이 Cloud Run 환경변수와 일치하는지 확인. 앱에서 헤더 오타 빈번.

**Q. 파싱 실패 (failed) 가 많이 쌓임**
→ 카드사가 SMS 포맷을 바꾼 것. `lib/sms-parsers.ts` 의 해당 카드사 함수 정규식 수정 후 재배포.
   과거 실패 건은 `/finance/sms` 에서 원문 보고 수동 편집 가능.

**Q. 중복 수신됨 (같은 SMS 2번)**
→ 문제 없음. `raw_hash` UNIQUE 제약으로 2번째는 자동 skip 되고 `{"status":"duplicate"}` 응답.

**Q. 공기계 전원 꺼졌을 때 밀린 SMS 는?**
→ 공기계가 다시 켜지면 앱이 읽기 때문에, SMS 보관함에 쌓인 문자는 대부분 재전송됨 (앱 설정 의존).
   확실한 보완: 월말 명세서 CSV 업로드.

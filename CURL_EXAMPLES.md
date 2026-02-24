# Jandi Webhook - Manual curl Testing Examples

Quick reference for testing the Jandi accident webhook with curl commands.

## Configuration

```
Webhook URL: https://hmseok.com/api/webhooks/jandi-accident
Token: c2ec4369546597736672f27b334a3454
```

---

## Example 1: Simple Collision (At-Fault)

```bash
curl -X POST "https://hmseok.com/api/webhooks/jandi-accident" \
  -H "Content-Type: application/json" \
  -d '{
  "token": "c2ec4369546597736672f27b334a3454",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "정지은"},
  "data": "12가3456 / 우리금융캐피탈 / self / 턴키 / 가해 / 자차\n거래처명: 우리금융캐피탈\n*접수번호: 260220-001-0891\n*고객명: [법인]주식회사공화정공\n*차량번호: 12가3456\n*사고일시: 2026년 02월 20일 14시35분\n*사고장소: 서울특별시 강남구 테헤란로\n*사고부위: 우측 도어(운행가능)\n*사고내용: 교차로에서 신호위반 차량과 측면 충돌\n*자차보험사: 메리츠화재/20261840470"
}'
```

**Expected Response:**
```json
{
  "body": "✅ 사고 접수 완료 [#123]\n\n🚗 차량: 12가3456\n📅 사고일시: 2026-02-20 14:35\n📍 장소: 서울특별시 강남구 테헤란로\n💥 과실: 가해 / 정산: 턴키\n",
  "connectColor": "#2ECC71",
  "connectInfo": [{"title": "시스템", "description": "SelfDisruption ERP"}]
}
```

---

## Example 2: Hit and Run (Victim) - Minimal

```bash
curl -X POST "https://hmseok.com/api/webhooks/jandi-accident" \
  -H "Content-Type: application/json" \
  -d '{
  "token": "c2ec4369546597736672f27b334a3454",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "정영미"},
  "data": "88나1234 / 스카이모빌리티 / self / 실비 / 피해 / 자차\n*접수번호: 260218-003-9876\n*고객명: [법인]스마트로지스틱스\n*차량번호: 88나1234\n*사고일시: 2026년 02월 18일 22시15분\n*통보자: 이민지 / 010-9876-5432 / 직원 /\n*운전자: 이민지 / 010-9876-5432 / 생년월일 850810 / 1종보통 /\n*면책금: 150,000\n*사고장소: 서울특별시 종로구 주차장\n*사고부위: 전면 범퍼(운행가능)\n*사고내용: 주차 중 미확인 차량과 접촉\n*자차보험사: KB손해보험/20260950456"
}'
```

---

## Example 3: Complete Message (All Fields)

```bash
curl -X POST "https://hmseok.com/api/webhooks/jandi-accident" \
  -H "Content-Type: application/json" \
  -d '{
  "token": "c2ec4369546597736672f27b334a3454",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "김수현"},
  "data": "77라9999 / 우리금융캐피탈 / lease / 실비 / 면책 / 자차\n거래처명: 우리금융캐피탈 임차\n*접수번호: 260219-002-5555\n*고객명: [법인]동서운수회사\n*실행일자: 2026년 02월 19일\n*차량번호: 77라9999\n*차종: BMW 3 Series 530i\n*접수일시: 2026년 02월 19일 17시20분\n*사고일시: 2026년 02월 19일 16시45분\n*통보자: 홍길동 / 010-7777-8888 / 배우자 /\n*운전자: 홍길동 / 010-7777-8888 / 생년월일 650318 / 1종보통 /\n*면책금: 100,000\n*사고장소: 서울특별시 동작구 도심 침수 지역\n*사고부위: 엔진 및 내부 전자부품(운행불가능)\n*사고내용: 집중호우로 인한 도시침수 - 차량 수몰 및 엔진 손상\n*수리여부: Y/ 서울특별시 동작구 종합수리소\n*자차보험사: 롯데손해보험/20261234890\n*상대보험사: /\n*접수자: 김수현"
}'
```

---

## Example 4: Invalid Token (Will Fail)

```bash
curl -X POST "https://hmseok.com/api/webhooks/jandi-accident" \
  -H "Content-Type: application/json" \
  -d '{
  "token": "INVALID_TOKEN_12345",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "테스트"},
  "data": "12가3456 / 우리금융캐피탈 / self / 턴키 / 가해 / 자차\n*접수번호: 999-999-999\n*차량번호: 12가3456"
}'
```

**Expected Response:**
```json
{
  "body": "⛔ 인증 실패: 유효하지 않은 토큰입니다.",
  "connectColor": "#FF0000",
  "connectInfo": [{"title": "시스템", "description": "SelfDisruption ERP"}]
}
```

---

## Example 5: Incomplete Data (Too Short)

```bash
curl -X POST "https://hmseok.com/api/webhooks/jandi-accident" \
  -H "Content-Type: application/json" \
  -d '{
  "token": "c2ec4369546597736672f27b334a3454",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "테스트"},
  "data": "너무 짧은 데이터"
}'
```

**Expected Response:**
```json
{
  "body": "⚠️ 사고접수 내용이 부족합니다.\n\n스카이오토 접수 메시지를 그대로 붙여넣어 주세요.",
  "connectColor": "#FF9800",
  "connectInfo": [{"title": "시스템", "description": "SelfDisruption ERP"}]
}
```

---

## Example 6: Missing Car Number (Will Create with Default Company)

```bash
curl -X POST "https://hmseok.com/api/webhooks/jandi-accident" \
  -H "Content-Type: application/json" \
  -d '{
  "token": "c2ec4369546597736672f27b334a3454",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "테스트"},
  "data": "미등록차량 / 거래처 / self / 턴키 / 가해 / 자차\n*접수번호: 260220-999-9999\n*고객명: 테스트회사\n*사고일시: 2026년 02월 20일 14시35분\n*사고장소: 서울 강남구\n*사고부위: 범퍼\n*사고내용: 테스트 사고\n*자차보험사: 테스트보험/123456"
}'
```

**Note:** Car won't be found, but accident will still be recorded with first company in DB.

---

## Example 7: GET Health Check

```bash
curl -X GET "https://hmseok.com/api/webhooks/jandi-accident"
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "jandi-accident-webhook",
  "message": "잔디 사고접수 웹훅 엔드포인트 정상 동작 중",
  "supported_format": "스카이오토 사고접수 메시지 (*필드명:값 형태)",
  "parsed_fields": [
    "접수번호", "고객명", "차량번호", "차종", "접수일시", "사고일시",
    "통보자", "운전자", "면책금", "사고장소", "사고부위", "사고내용",
    "수리여부", "자차보험사", "상대보험사", "접수자"
  ],
  "header_format": "차량번호 / 거래처명 / 서비스유형 / 정산방식 / 과실구분 / 보험종류"
}
```

---

## Response Color Codes

| Color | Meaning | Example |
|-------|---------|---------|
| #2ECC71 | Success ✅ | Accident successfully recorded |
| #FF0000 | Error | Invalid token, system error |
| #FF9800 | Warning | Insufficient data, car not found |
| #FAC11B | Default | Standard response (used if not set) |

---

## Parsing Key Points

### Korean Datetime Formats Supported

All of these work:
```
2026년 02월 20일 14시35분  → Preferred format
2026년 02월 20일 14:35
2026-02-20 14:35
2026-02-20
```

### Phone Number Recognition

Standard Korean mobile format:
```
010-0000-0000
010 0000 0000
01000000000
```

### Amount Parsing

Automatically strips formatting:
```
300,000        → 300000
1,000,000      → 1000000
150000         → 150000
```

### Vehicle Number Matching

DB lookup tries both:
```
12가3456       (with Hangul)
12 가 3456     (with spaces)
```

### Damage Severity Keywords

Keywords in *사고부위 field:
```
(운행가능)     → vehicle_condition = 'minor'
(운행불가)    → vehicle_condition = 'repairable'
(운행불가능)  → vehicle_condition = 'repairable'
```

---

## Testing Workflow

### 1. Test Health First
```bash
curl "https://hmseok.com/api/webhooks/jandi-accident"
```

### 2. Test Invalid Token
```bash
# Should get red error
curl -X POST "https://hmseok.com/api/webhooks/jandi-accident" \
  -H "Content-Type: application/json" \
  -d '{"token": "invalid", "data": "test"}'
```

### 3. Test Valid Message
```bash
# Use Example 1 above
```

### 4. Verify in Database
```sql
SELECT id, status, car_number, accident_date, source, created_at
FROM accident_records
WHERE source = 'jandi_accident'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Common Issues & Fixes

| Issue | Cause | Solution |
|-------|-------|----------|
| "⛔ 인증 실패" | Wrong token | Check token: `c2ec4369546597736672f27b334a3454` |
| "⚠️ 사고접수 내용이 부족" | Data < 10 chars | Use complete message format |
| "⚠️ 차량번호를 찾을 수 없습니다" | No car number | Add `*차량번호: XXXX` field |
| No response | Network issue | Check URL and connectivity |
| 500 error | Server error | Check logs, verify data format |

---

## Bash Function (Optional)

Save this to `.bashrc` for easy testing:

```bash
jandi_test() {
  local url="${1:-https://hmseok.com}"
  local token="c2ec4369546597736672f27b334a3454"
  local car="${2:-12가3456}"

  curl -X POST "$url/api/webhooks/jandi-accident" \
    -H "Content-Type: application/json" \
    -d '{
      "token": "'"$token"'",
      "teamName": "스카이오토",
      "roomName": "사고접수",
      "writer": {"name": "테스트"},
      "data": "'"$car"' / 테스트 / self / 턴키 / 가해 / 자차\n*접수번호: 999-999-999\n*차량번호: '"$car"'\n*사고일시: 2026년 02월 20일 14시35분\n*사고장소: 테스트\n*사고내용: 테스트"
    }'
}

# Usage: jandi_test https://hmseok.com 12가3456
```

---

## Notes

- All examples use valid Korean characters and realistic data
- Replace URLs/tokens as needed for your environment
- JSON strings must use proper escaping for newlines (`\n`)
- Response time typically 1-2 seconds
- Webhook automatically creates vehicle status log entry if car found

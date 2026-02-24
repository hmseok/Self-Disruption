# Jandi Webhook Integration - Test Data & Commands

## Overview
This directory contains test data and testing utilities for the Korean ERP system's Jandi Webhook integration for accident reporting.

## Files Created

### 1. `sql/test_accident_data.sql`
SQL file with 5 realistic Korean accident test records.

**Usage:**
```bash
# Execute in your Supabase SQL editor or psql
psql -U postgres -h uiyiwgkpchnvuvpsjfxv.supabase.co -d postgres -f sql/test_accident_data.sql
```

**Test Records Included:**
- **Record 1**: Collision (at-fault) - Repairing status, via Jandi webhook
- **Record 2**: Self-damage (gard rail) - Settled, manual entry
- **Record 3**: Hit and run (victim) - Reported status, via Jandi webhook
- **Record 4**: Theft - Closed, claim denied, manual entry
- **Record 5**: Flooding damage - Insurance filed, with replacement car, via Jandi webhook

**Features:**
- Uses dynamic company_id lookup (first company in DB)
- Uses dynamic user_id from auth.users
- Realistic Korean vehicle numbers (12가3456, 45다6789, etc.)
- Realistic Seoul/Incheon accident locations
- Proper Jandi raw message format for webhook records
- Variety of statuses: reported, repairing, settled, closed, insurance_filed

---

### 2. `test-jandi-webhook.sh`
Comprehensive bash script with 6 test cases for the Jandi webhook endpoint.

**Usage:**
```bash
# Using default URL (https://hmseok.com)
bash test-jandi-webhook.sh

# Using custom domain
bash test-jandi-webhook.sh https://your-custom-domain.com
```

**Test Cases:**

| Test | Scenario | Expected Result |
|------|----------|-----------------|
| TEST 1 | Collision (at-fault), turnkey settlement | ✅ 200 OK, green response |
| TEST 2 | Hit and run (victim), minor damage | ✅ 200 OK, green response |
| TEST 3 | Flooding damage, severe, replacement car | ✅ 200 OK, green response |
| TEST 4 | Invalid token | ✅ 200 with red error response |
| TEST 5 | Incomplete/short data | ✅ 200 with orange warning |
| TEST 6 | GET health check | ✅ 200 OK with service info |

---

## Webhook Configuration

### Endpoint
```
POST /api/webhooks/jandi-accident
```

### Authentication Token
```
c2ec4369546597736672f27b334a3454
```

### Expected Payload Format
```json
{
  "token": "c2ec4369546597736672f27b334a3454",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "담당자명"},
  "data": "메시지 본문 (아래 형식 참고)"
}
```

### Expected Message Format

The webhook expects messages in this specific format (from Skyauto accident system):

```
차량번호 / 거래처명 / 서비스유형 / 정산방식 / 과실구분 / 보험종류
거래처명: 거래처■정산방식■
*접수번호: 260220-001-0891
*고객명 : [법인]회사명
*실행일자: 2026년 02월 20일
*차량번호: 12가3456
*차종: 신형 K9 가솔린 3.8
*접수일시: 2026년 02월 20일 14시45분
*사고일시: 2026년 02월 20일 14시35분
*통보자: 이름 / 010-0000-0000 / 관계 /
*운전자: 이름 / 010-0000-0000 / 생년월일 000000 / 면허종류 /
*면책금: 300,000
*사고장소: 서울특별시 강남구 테헤란로 102길
*사고부위: 우측 도어(운행가능)
*사고내용: 구체적인 사고 내용 설명
*수리여부: Y/ 수리소 위치 또는 N/ 미정
*자차보험사: 보험사명/계약번호
*상대보험사: 보험사명/계약번호
*접수자: 접수담당자명
```

---

## Webhook Field Mapping

The webhook parses the following fields and maps them to `accident_records` table:

| Field | Column | Notes |
|-------|--------|-------|
| 차량번호 | car_number | Car lookup via DB |
| 사고일시 | accident_date, accident_time | Parses Korean datetime |
| 사고장소 | accident_location | |
| 사고내용 | description | Main accident details |
| 운전자 | driver_name, driver_phone, driver_license_no | Parsed from "이름 / 전화 / 생년월일 / 면허" format |
| 통보자 | reporter fields | Fallback if driver not specified |
| 면책금 | customer_deductible | Parsed amount |
| 자차보험사 | insurance_company, insurance_claim_no | |
| 상대보험사 | counterpart_insurance | |
| 사고부위 | damage_part, vehicle_condition | "운행가능" → minor, else repairable |
| 수리여부 | repair_status, repair_shop_name | |
| 과실구분 (Header) | fault_ratio | 가해/과실→100%, 피해→0%, 면책→100% |
| 접수번호 | insurance_claim_no | |

---

## Column Notes

### Key Columns
- **description** (NOT accident_description): Main accident description from *사고내용 field
- **vehicle_condition**: Derived from damage_part parsing ("운행가능" → minor, else repairable)
- **source**: Set to 'jandi_accident' for webhook entries, 'manual' for direct entries
- **jandi_raw**: Stores complete original message for audit trail
- **jandi_topic**: Stores room name from webhook

### Status Values
- `reported`: Initial status from webhook
- `insurance_filed`: Claim submitted to insurance
- `repairing`: Repair in progress
- `settled`: Insurance claim settled
- `closed`: Final status (completed or denied)
- `cancelled`: Cancelled accident record

### Accident Types
- `collision`: 충돌
- `self_damage`: 자차 단독사고
- `hit_and_run`: 뺑소니
- `theft`: 도난
- `flooding`: 침수 피해
- `replacement_request`: 대차 요청
- `other`: 기타

---

## Testing Workflow

### Step 1: Insert Test Data
```bash
psql -h uiyiwgkpchnvuvpsjfxv.supabase.co -U postgres -c "
  \i sql/test_accident_data.sql
"
```

### Step 2: Run Webhook Tests
```bash
bash test-jandi-webhook.sh
```

### Step 3: Verify Results
- Check Supabase `accident_records` table for new entries
- Confirm status values and timestamps are correct
- Review `jandi_raw` field to verify message parsing

### Step 4: Check Logs
```bash
# Check webhook processing errors
SELECT id, status, created_at, notes, jandi_raw
FROM accident_records
WHERE source = 'jandi_accident'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Korean Date/Time Format Support

The webhook parser supports multiple Korean datetime formats:

```
✅ "2026년 02월 20일 14시35분"  → 2026-02-20, 14:35
✅ "2026년 02월 20일"           → 2026-02-20, null
✅ "2026-02-20 14:35"           → 2026-02-20, 14:35
✅ "2026-02-20"                 → 2026-02-20, null
```

---

## Troubleshooting

### Webhook Rejected with "Token Invalid"
- Verify token in webhook service matches: `c2ec4369546597736672f27b334a3454`
- Check environment variable: `JANDI_ACCIDENT_TOKEN`

### "차량번호를 찾을 수 없습니다"
- Message lacks a car number field
- Car number format may not match DB (try with/without spaces)

### "부족합니다" (Insufficient Data)
- Message is too short (< 10 characters)
- Ensure full Skyauto message format is used

### Insurance/Driver Fields Not Parsing
- Check field names start with `*` (asterisk)
- Verify spacing around colons (: or ：)
- Korean phone format: 010-0000-0000

---

## Notes for Developers

1. **Field Parsing**: Uses regex patterns to extract Korean text fields
2. **Company Fallback**: If car not found, uses first company in DB
3. **Fault Ratio**: Auto-determined from header fault type (가해/피해/면책)
4. **Vehicle Condition**: Derived from "운행가능" presence in damage_part
5. **Audit Trail**: Full Jandi message stored in `jandi_raw` for compliance

---

## Integration with Existing System

The webhook automatically:
1. Creates or updates vehicle status log entry
2. Sets car status to 'accident' if vehicle found
3. Links to active contract if available
4. Generates formatted notes combining all parsed fields
5. Stores audit trail in jandi_raw

Supports both SkyAuto turnkey (턴키) and cost-share (실비) settlement types.

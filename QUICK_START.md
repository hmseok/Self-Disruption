# Quick Start Guide - Jandi Accident Webhook Testing

## What Was Created

### 1. SQL Test Data
**File:** `sql/test_accident_data.sql`
- 5 realistic Korean accident records
- Mix of statuses: reported, repairing, settled, closed, insurance_filed
- Mix of sources: jandi_accident (3 records), manual (2 records)
- Complete Jandi raw message format for webhook records

### 2. Webhook Test Script
**File:** `test-jandi-webhook.sh`
- 6 test cases covering success and error scenarios
- Executable bash script
- Default URL: https://hmseok.com

---

## 30-Second Start

```bash
# 1. Load test data into Supabase
psql -h uiyiwgkpchnvuvpsjfxv.supabase.co -U postgres -d postgres -f sql/test_accident_data.sql

# 2. Run webhook tests
bash test-jandi-webhook.sh

# 3. Verify in Supabase
# Check accident_records table - should have 5 new records
```

---

## Test Data Summary

| Record | Type | Status | Source | Details |
|--------|------|--------|--------|---------|
| 1 | Collision | repairing | jandi | At-fault, turnkey settlement |
| 2 | Self-damage | settled | manual | Gard rail hit, insurance settled |
| 3 | Hit & Run | reported | jandi | Victim, minor damage |
| 4 | Theft | closed | manual | Claim denied |
| 5 | Flooding | insurance_filed | jandi | Severe damage, replacement car |

---

## Webhook Token
```
c2ec4369546597736672f27b334a3454
```

---

## Test Cases in Script

| # | Test | Expected | Purpose |
|---|------|----------|---------|
| 1 | Collision (valid) | 200 OK, green ✅ | Normal accident flow |
| 2 | Hit & Run (valid) | 200 OK, green ✅ | Victim accident |
| 3 | Flooding (valid) | 200 OK, green ✅ | Complex case with replacement |
| 4 | Invalid token | 200, red error ⛔ | Security test |
| 5 | Incomplete data | 200, orange warn ⚠️ | Validation test |
| 6 | GET health | 200 OK, info | Service check |

---

## Key Features Implemented

✅ Dynamic company_id lookup (uses first company in DB)
✅ Dynamic user_id lookup (uses first auth user)
✅ Realistic Korean data:
   - Vehicle numbers: 12가3456, 45다6789, 88나1234, etc.
   - Locations: Seoul, Incheon districts
   - Korean names: 김철수, 박준영, 홍길동, etc.
   - Insurance companies: Meritz, Samsung, Lotte, KB, etc.
   
✅ Proper Jandi message format with all required fields
✅ Mixed statuses and accident types
✅ Some records include replacement car details
✅ Complete audit trail (jandi_raw field)
✅ Token authentication verification
✅ Error handling for invalid/incomplete data

---

## Files & Locations

```
/sessions/peaceful-busy-ramanujan/mnt/SelfDisruption/
├── sql/
│   └── test_accident_data.sql       (11 KB) - SQL test data
├── test-jandi-webhook.sh             (6.6 KB) - Test script
├── JANDI_WEBHOOK_README.md           (Full documentation)
└── QUICK_START.md                    (This file)
```

---

## Next Steps

1. **Review the SQL data** - Check realistic values and expected statuses
2. **Run the tests** - Execute the bash script against your environment
3. **Check results** - Query accident_records table to verify inserts
4. **Review logs** - Look for any parsing errors or warnings in the webhook responses

---

## Important Notes

- Both files use dynamic company_id (so they work with any Supabase project)
- Webhook token is hardcoded to `c2ec4369546597736672f27b334a3454` (change if needed)
- Test script uses curl (must be installed)
- SQL requires PostgreSQL client access to Supabase

---

## Webhook Message Format

The webhook expects messages in this structure:

```
차량번호 / 거래처명 / 서비스유형 / 정산방식 / 과실구분 / 보험종류
거래처명: ...
*접수번호: ...
*고객명: ...
*차량번호: ...
*차종: ...
*접수일시: ...
*사고일시: ...
*통보자: ...
*운전자: ...
*면책금: ...
*사고장소: ...
*사고부위: ...
*사고내용: ...
*수리여부: ...
*자차보험사: ...
*상대보험사: ...
*접수자: ...
```

All test cases in the script follow this format exactly.

---

Need more details? See `JANDI_WEBHOOK_README.md`

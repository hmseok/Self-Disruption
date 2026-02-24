# Jandi Accident Webhook - Complete Testing Guide

**Created Date:** 2026-02-22
**System:** Self-Disruption (Korean ERP)
**Webhook:** /api/webhooks/jandi-accident
**Token:** c2ec4369546597736672f27b334a3454

---

## Files Overview

### Core Test Files

| File | Size | Lines | Purpose |
|------|------|-------|---------|
| `sql/test_accident_data.sql` | 11 KB | 230 | SQL test data - 5 Korean accident records |
| `test-jandi-webhook.sh` | 6.6 KB | 122 | Bash script - 6 webhook test cases |

### Documentation Files

| File | Size | Lines | Purpose |
|------|------|-------|---------|
| `QUICK_START.md` | 4.0 KB | 146 | 30-second start guide (READ THIS FIRST) |
| `JANDI_WEBHOOK_README.md` | 7.6 KB | 244 | Complete technical documentation |
| `CURL_EXAMPLES.md` | 9.4 KB | 298 | Manual curl command examples |
| `TESTING_GUIDE.md` | This | - | Integration testing overview |

---

## Quick Start (3 Steps)

### Step 1: Load Test Data
```bash
cd /sessions/peaceful-busy-ramanujan/mnt/SelfDisruption
psql -h uiyiwgkpchnvuvpsjfxv.supabase.co -U postgres -d postgres -f sql/test_accident_data.sql
```

### Step 2: Run Webhook Tests
```bash
bash test-jandi-webhook.sh
```

### Step 3: Verify Results
```sql
SELECT id, status, car_number, accident_type, source, created_at
FROM accident_records
WHERE source IN ('jandi_accident', 'manual')
ORDER BY created_at DESC
LIMIT 10;
```

---

## Test Data Included (5 Records)

### Record 1: Collision - At-Fault (Repairing)
- **Car Number:** 12가3456
- **Type:** collision
- **Status:** repairing
- **Source:** jandi_accident
- **Details:** Turnkey settlement, message-side damage
- **Insurance:** 메리츠화재

### Record 2: Self-Damage (Settled)
- **Car Number:** 45다6789
- **Type:** self_damage
- **Status:** settled
- **Source:** manual
- **Details:** Guard rail impact, insurance settled
- **Insurance:** 삼성화재

### Record 3: Hit & Run - Victim (Reported)
- **Car Number:** 88나1234
- **Type:** hit_and_run
- **Status:** reported
- **Source:** jandi_accident
- **Details:** Parking lot incident, minor damage
- **Insurance:** KB손해보험

### Record 4: Theft (Closed)
- **Car Number:** 33구5678
- **Type:** theft
- **Status:** closed
- **Source:** manual
- **Details:** Total loss, claim denied
- **Insurance:** 현대손해보험

### Record 5: Flooding - Severe (Insurance Filed)
- **Car Number:** 77라9999
- **Type:** flooding
- **Status:** insurance_filed
- **Source:** jandi_accident
- **Details:** Engine damage, replacement car provided
- **Insurance:** 롯데손해보험

---

## Test Cases in Script (6 Tests)

### TEST 1: Collision (At-Fault) - Success Case
```
Scenario: Turnkey settlement with complete Jandi message
Car: 12가3456
Expected: 200 OK, green response, accident created
```

### TEST 2: Hit & Run (Victim) - Success Case
```
Scenario: Cost-share settlement, minor damage
Car: 88나1234
Expected: 200 OK, green response, victim flag set
```

### TEST 3: Flooding - Complex Case
```
Scenario: Severe damage with replacement car (대차)
Car: 77라9999
Expected: 200 OK, green response, replacement linked
```

### TEST 4: Invalid Token - Security Test
```
Scenario: Wrong authentication token
Car: 12가3456
Expected: 200 OK, red error response
```

### TEST 5: Incomplete Data - Validation Test
```
Scenario: Message too short (< 10 characters)
Expected: 200 OK, orange warning response
```

### TEST 6: GET Health Check
```
Scenario: Service health verification
Expected: 200 OK with JSON info about supported fields
```

---

## How to Use Each Document

### 1. QUICK_START.md
**Start here if you:**
- Need a 30-second overview
- Want to get started immediately
- Need the essentials only

**Contains:**
- File summaries
- 30-second start commands
- Test data table
- Key features checklist

### 2. JANDI_WEBHOOK_README.md
**Read this for:**
- Complete technical details
- Field mapping documentation
- Korean date format support
- Integration workflow
- Troubleshooting guide

**Contains:**
- Webhook configuration
- Expected payload format
- Field mapping table
- Column notes and definitions
- Testing workflow
- Developer notes

### 3. CURL_EXAMPLES.md
**Use this for:**
- Manual webhook testing
- Understanding message format
- Individual curl commands
- Testing specific scenarios

**Contains:**
- 7 complete curl examples
- Explanations of each test
- Response formats
- Parsing rules
- Bash function helper

### 4. This File (TESTING_GUIDE.md)
**Reference for:**
- File organization
- Test plan overview
- Integration flow
- What to test and when

---

## Webhook Message Format Reference

```
HEADER LINE (first line):
차량번호 / 거래처명 / 서비스유형 / 정산방식 / 과실구분 / 보험종류

REQUIRED FIELDS (*필드명:값):
*접수번호:          Claim reference number
*고객명:            Customer name
*차량번호:          Vehicle number (must match DB or use generic)
*차종:              Vehicle type
*접수일시:          Receipt datetime (Korean format)
*사고일시:          Accident datetime (Korean format)
*통보자:            Reporter info (name / phone / relation)
*운전자:            Driver info (name / phone / birthdate / license / relation)
*면책금:            Deductible amount
*사고장소:          Accident location
*사고부위:          Damaged part(s)
*사고내용:          Accident description
*수리여부:          Repair needed (Y/N) / repair location
*자차보험사:        Own insurance (company/claim number)
*상대보험사:        Other party insurance (company/claim number)
*접수자:            Claim handler name

OPTIONAL FIELDS:
*차종:              Vehicle model
거래처명:           Client/dealer name
```

---

## Integration Checklist

### Pre-Testing
- [ ] Read QUICK_START.md
- [ ] Review SQL data structure
- [ ] Verify database connectivity to Supabase
- [ ] Confirm webhook URL (https://hmseok.com)
- [ ] Verify webhook token
- [ ] Check curl is installed

### During Testing
- [ ] Load SQL test data
- [ ] Run all 6 test cases
- [ ] Verify HTTP status codes
- [ ] Check response colors (green/red/orange)
- [ ] Review webhook parsing output

### Post-Testing
- [ ] Query accident_records table
- [ ] Verify all 5 test records inserted
- [ ] Check status values are correct
- [ ] Verify jandi_raw field has full message
- [ ] Check notes field has parsed metadata
- [ ] Confirm company_id is populated
- [ ] Review timestamps (should be today)

---

## Common Testing Scenarios

### Scenario 1: Basic Accident Flow
1. Send collision message via webhook (TEST 1)
2. Verify 200 OK response
3. Check accident_records shows "repairing" status
4. Confirm car status updated to "accident"

### Scenario 2: Multiple Settlement Types
1. Test at-fault (가해) - expects turnkey
2. Test victim (피해) - expects cost-share
3. Test own damage (자차) - expects own insurance
4. Verify fault_ratio set correctly

### Scenario 3: Error Handling
1. Test invalid token (TEST 4)
2. Test incomplete message (TEST 5)
3. Test missing car number
4. Verify appropriate error response colors

### Scenario 4: Data Parsing
1. Korean date parsing: 2026년 02월 20일 14시35분
2. Phone parsing: 010-5520-5719
3. Amount parsing: 300,000 → 300000
4. Person field parsing: 이름 / 전화 / 생년월일 / 면허

---

## Expected Outcomes

### SQL Data Load
```
Expected: 5 records inserted successfully
- Record 1: id=XXXX, status='repairing', source='jandi_accident'
- Record 2: id=XXXX, status='settled', source='manual'
- Record 3: id=XXXX, status='reported', source='jandi_accident'
- Record 4: id=XXXX, status='closed', source='manual'
- Record 5: id=XXXX, status='insurance_filed', source='jandi_accident'
```

### Webhook Tests
```
TEST 1: 200 OK - Green response (#2ECC71)
TEST 2: 200 OK - Green response (#2ECC71)
TEST 3: 200 OK - Green response (#2ECC71)
TEST 4: 200 OK - Red response (#FF0000) with "인증 실패"
TEST 5: 200 OK - Orange response (#FF9800) with "부족합니다"
TEST 6: 200 OK - Service info JSON
```

---

## Verification Queries

### Check All Test Records Loaded
```sql
SELECT id, status, car_number, accident_type, source
FROM accident_records
WHERE source IN ('jandi_accident', 'manual')
ORDER BY created_at DESC;
```

### Check Jandi Webhook Specific Records
```sql
SELECT id, accident_date, car_number, driver_name,
       insurance_company, insurance_claim_no, status
FROM accident_records
WHERE source = 'jandi_accident'
ORDER BY created_at DESC;
```

### Check Parsed Jandi Messages
```sql
SELECT id, status, jandi_raw, notes
FROM accident_records
WHERE source = 'jandi_accident'
LIMIT 1;
```

### Check Vehicle Status Updates
```sql
SELECT vehicle_id, old_status, new_status,
       related_type, memo, created_at
FROM vehicle_status_log
WHERE related_type = 'accident'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Troubleshooting Matrix

| Problem | Possible Causes | Solutions |
|---------|-----------------|-----------|
| SQL load fails | DB not accessible | Check credentials, network |
| SQL load fails | Schema mismatch | Verify column names in route.ts |
| Webhook returns 404 | Wrong URL | Check domain and endpoint |
| Webhook returns red error | Invalid token | Verify token: c2ec4369546597736672f27b334a3454 |
| No records created | Car number mismatch | Message format incorrect |
| Phone number not parsed | Format wrong | Use 010-0000-0000 |
| Date not parsed | Korean format wrong | Use "2026년 02월 20일 14시35분" |
| Insurance not found | Field name wrong | Check for "자차보험사:" |

---

## Performance Notes

- SQL insert: ~200-500ms for 5 records
- Webhook processing: ~500-1000ms per request
- Database query response: ~100-200ms
- Total testing time: 5-10 minutes

---

## Security Considerations

1. **Token Storage**: Token in scripts is visible - use env vars in production
2. **Data Sensitivity**: Test records use realistic but non-sensitive data
3. **Webhook Validation**: Token verification is mandatory
4. **Message Parsing**: Only validates field format, not content accuracy
5. **Database**: Uses dynamic company_id lookup for portability

---

## Next Steps After Testing

1. **Configure in Jandi:** Set webhook endpoint in Jandi app settings
2. **Enable Notifications:** Subscribe to accident receipt events
3. **Monitor:** Check webhook logs for real-world usage
4. **Adjust:** Modify field mappings if needed for your system
5. **Production:** Deploy with environment-specific tokens

---

## Support Resources

- **Documentation**: JANDI_WEBHOOK_README.md (technical)
- **Examples**: CURL_EXAMPLES.md (practical)
- **Quick Help**: QUICK_START.md (essentials)
- **Source Code**: app/api/webhooks/jandi-accident/route.ts

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-22 | Initial creation - 5 test records, 6 test cases, 4 docs |

---

Last updated: 2026-02-22

# Jandi Accident Webhook - File Index

**System:** Self-Disruption (Korean ERP)
**Created:** 2026-02-22
**Webhook Token:** c2ec4369546597736672f27b334a3454

---

## Core Implementation Files

### 1. sql/test_accident_data.sql
**Purpose:** Test data for accident_records table
**Size:** 11 KB | 230 lines
**Type:** PostgreSQL/Supabase SQL

**Contents:**
- 5 realistic Korean accident records
- Dynamic company_id lookup (works with any project)
- Dynamic user_id lookup from auth.users
- Mix of sources: jandi_accident (3), manual (2)
- Mix of statuses: reported, repairing, settled, closed, insurance_filed
- Complete Jandi raw message format for webhook records

**How to use:**
```bash
psql -h uiyiwgkpchnvuvpsjfxv.supabase.co -U postgres -d postgres -f sql/test_accident_data.sql
```

**Records included:**
- Record 1: Collision (at-fault) → Status: repairing
- Record 2: Self-damage (guard rail) → Status: settled
- Record 3: Hit & run (victim) → Status: reported
- Record 4: Theft → Status: closed
- Record 5: Flooding (severe) → Status: insurance_filed

---

### 2. test-jandi-webhook.sh
**Purpose:** Automated webhook testing script
**Size:** 6.6 KB | 122 lines
**Type:** Bash (executable)

**Contents:**
- 6 test cases (3 success, 1 security, 1 validation, 1 health)
- Complete curl commands with Jandi message format
- Configurable webhook URL (defaults to https://hmseok.com)
- Hardcoded token: c2ec4369546597736672f27b334a3454

**How to use:**
```bash
# Default URL
bash test-jandi-webhook.sh

# Custom URL
bash test-jandi-webhook.sh https://your-custom-domain.com
```

**Test cases:**
- TEST 1: Collision (at-fault), turnkey settlement
- TEST 2: Hit & run (victim), cost-share settlement
- TEST 3: Flooding damage, severe, replacement car
- TEST 4: Invalid token (security test)
- TEST 5: Incomplete data (validation test)
- TEST 6: GET health check

---

## Documentation Files

### 3. QUICK_START.md
**Purpose:** 30-second getting started guide
**Size:** 4.0 KB | 146 lines
**Best for:** New users, quick reference

**Contents:**
- What was created (summary)
- 3-command quick start
- Test data summary table
- Webhook token
- Test cases overview
- Key features checklist
- File locations

**Read if you:** Need to get started immediately

---

### 4. JANDI_WEBHOOK_README.md
**Purpose:** Complete technical reference
**Size:** 7.6 KB | 244 lines
**Best for:** Developers, integration specialists

**Contents:**
- Files overview
- SQL usage instructions
- Test script details
- Webhook configuration (endpoint, token, payload format)
- Expected message format from Skyauto
- Field mapping table
- Column notes and definitions
- Korean date/time format support
- Troubleshooting guide
- Integration with existing system

**Read if you:** Need technical details, field mappings, troubleshooting

---

### 5. CURL_EXAMPLES.md
**Purpose:** Manual curl command examples
**Size:** 9.4 KB | 298 lines
**Best for:** Manual testing, understanding message format

**Contents:**
- 7 complete curl examples
- Configuration (URL, token)
- Example 1: Simple collision
- Example 2: Hit and run (minimal)
- Example 3: Complete message (all fields)
- Example 4: Invalid token (will fail)
- Example 5: Incomplete data (too short)
- Example 6: Missing car number
- Example 7: GET health check
- Response formats for each
- Parsing key points (datetime, phone, amounts, vehicle numbers, damage keywords)
- Testing workflow
- Bash function helper

**Read if you:** Want to test manually, understand parsing rules

---

### 6. TESTING_GUIDE.md
**Purpose:** Integration testing overview
**Size:** 11 KB | Auto-generated
**Best for:** QA, integration testing, deployment

**Contents:**
- File organization overview
- Quick start (3 steps)
- Test data descriptions (5 records)
- Test cases overview (6 tests)
- How to use each documentation file
- Webhook message format reference
- Integration checklist (pre, during, post)
- Common testing scenarios (4 scenarios)
- Expected outcomes
- Verification queries
- Troubleshooting matrix
- Performance notes
- Security considerations
- Next steps after testing
- Support resources

**Read if you:** Need complete integration workflow, QA checklist

---

### 7. INDEX.md
**Purpose:** This file - navigation guide
**Size:** This file
**Best for:** Understanding file organization

---

## Quick Navigation

### "I want to..."

**Get started in 30 seconds**
→ Read QUICK_START.md
→ Run: `psql ... -f sql/test_accident_data.sql`
→ Run: `bash test-jandi-webhook.sh`

**Understand the technical details**
→ Read JANDI_WEBHOOK_README.md
→ Focus on: Field mapping table, Column notes, Parsing rules

**Test the webhook manually**
→ Read CURL_EXAMPLES.md
→ Copy a curl example and modify for your test

**Do integration testing**
→ Read TESTING_GUIDE.md
→ Follow the integration checklist
→ Run verification queries

**Know what fields map to what**
→ JANDI_WEBHOOK_README.md → "Webhook Field Mapping" section
→ CURL_EXAMPLES.md → "Parsing Key Points" section

**Debug a problem**
→ JANDI_WEBHOOK_README.md → "Troubleshooting" section
→ TESTING_GUIDE.md → "Troubleshooting Matrix" section
→ CURL_EXAMPLES.md → "Common Issues & Fixes" section

**See the Jandi message format**
→ CURL_EXAMPLES.md → Example 3 shows complete format
→ JANDI_WEBHOOK_README.md → "Expected Message Format" section

**Verify webhook is working**
→ CURL_EXAMPLES.md → Example 7 (GET health check)
→ CURL_EXAMPLES.md → Example 1 (simple POST)

---

## File Relationships

```
test-jandi-webhook.sh
    ↓ (uses webhook token and URL from)
    ↓
Webhook Configuration
    (Token: c2ec4369546597736672f27b334a3454)
    (URL: https://hmseok.com/api/webhooks/jandi-accident)

sql/test_accident_data.sql
    ↓ (creates)
    ↓
accident_records table entries
    (5 test records with jandi_raw field)

QUICK_START.md
    → (references and explains)
    → Both above files

JANDI_WEBHOOK_README.md
    → (technical details of)
    → route.ts webhook implementation

CURL_EXAMPLES.md
    → (manual testing for)
    → test-jandi-webhook.sh cases

TESTING_GUIDE.md
    → (integration workflow for)
    → All of the above
```

---

## Configuration Reference

**Webhook Endpoint**
```
POST https://hmseok.com/api/webhooks/jandi-accident
```

**Authentication Token**
```
c2ec4369546597736672f27b334a3454
```

**Database**
```
Host: uiyiwgkpchnvuvpsjfxv.supabase.co
Database: postgres
Table: accident_records
```

**Required Headers**
```
Content-Type: application/json
```

**Request Format**
```json
{
  "token": "c2ec4369546597736672f27b334a3454",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "담당자명"},
  "data": "메시지 본문"
}
```

---

## Test Data Reference

| Record | Type | Status | Source | Car # | Insurance |
|--------|------|--------|--------|-------|-----------|
| 1 | collision | repairing | jandi | 12가3456 | 메리츠화재 |
| 2 | self_damage | settled | manual | 45다6789 | 삼성화재 |
| 3 | hit_and_run | reported | jandi | 88나1234 | KB손해보험 |
| 4 | theft | closed | manual | 33구5678 | 현대손해보험 |
| 5 | flooding | insurance_filed | jandi | 77라9999 | 롯데손해보험 |

---

## Test Cases Reference

| # | Test | Type | Expected | Purpose |
|----|------|------|----------|---------|
| 1 | Collision (valid) | Success | 200 + green | Normal flow |
| 2 | Hit & Run (valid) | Success | 200 + green | Victim case |
| 3 | Flooding (valid) | Success | 200 + green | Complex case |
| 4 | Invalid token | Security | 200 + red | Auth test |
| 5 | Incomplete data | Validation | 200 + orange | Validation |
| 6 | GET health | Check | 200 + JSON | Service status |

---

## Documentation Map by Topic

### Getting Started
- QUICK_START.md → Overview & commands
- TESTING_GUIDE.md → Integration checklist

### Message Format
- CURL_EXAMPLES.md → Example 3 (complete format)
- JANDI_WEBHOOK_README.md → "Expected Message Format"
- route.ts lines 9-30 → Original format specification

### Field Mapping
- JANDI_WEBHOOK_README.md → "Webhook Field Mapping" table
- route.ts lines 50-180 → Parsing implementation

### Testing
- CURL_EXAMPLES.md → Examples 1-6 (manual tests)
- test-jandi-webhook.sh → Automated tests
- TESTING_GUIDE.md → Integration workflow

### Troubleshooting
- JANDI_WEBHOOK_README.md → Troubleshooting section
- TESTING_GUIDE.md → Troubleshooting matrix
- CURL_EXAMPLES.md → Common issues & fixes

### Data Verification
- TESTING_GUIDE.md → "Verification Queries" section
- sql/test_accident_data.sql → Column structure

### Korean Date Parsing
- JANDI_WEBHOOK_README.md → "Korean Date/Time Format Support"
- CURL_EXAMPLES.md → "Parsing Key Points" → Datetime Formats
- route.ts lines 50-81 → Parsing implementation

---

## File Sizes & Complexity

| File | Size | Lines | Complexity | Est. Read Time |
|------|------|-------|------------|----------------|
| QUICK_START.md | 4.0 KB | 146 | Low | 3 min |
| CURL_EXAMPLES.md | 9.4 KB | 298 | Medium | 10 min |
| JANDI_WEBHOOK_README.md | 7.6 KB | 244 | Medium | 12 min |
| TESTING_GUIDE.md | 11 KB | Auto | Medium | 15 min |
| test-jandi-webhook.sh | 6.6 KB | 122 | Low | 5 min |
| sql/test_accident_data.sql | 11 KB | 230 | Low | 5 min |

**Total:** 50+ KB, 1,040+ lines

---

## Recommended Reading Order

**For Quick Testing (10 minutes)**
1. QUICK_START.md (3 min)
2. Run commands (5 min)
3. Verify results (2 min)

**For Complete Understanding (30 minutes)**
1. QUICK_START.md (3 min)
2. JANDI_WEBHOOK_README.md (12 min)
3. CURL_EXAMPLES.md (10 min)
4. Run tests (5 min)

**For Integration (60+ minutes)**
1. TESTING_GUIDE.md (15 min)
2. JANDI_WEBHOOK_README.md (12 min)
3. CURL_EXAMPLES.md (10 min)
4. Review route.ts implementation
5. Run full test suite (15+ min)
6. Verify queries (10 min)

---

## Support & References

**For webhook implementation details:**
→ /sessions/peaceful-busy-ramanujan/mnt/SelfDisruption/app/api/webhooks/jandi-accident/route.ts

**For Supabase database:**
→ https://uiyiwgkpchnvuvpsjfxv.supabase.co

**For deployed application:**
→ https://hmseok.com

**For Jandi integration:**
→ Jandi app settings (add webhook endpoint)

---

**Last updated:** 2026-02-22
**Version:** 1.0
**Status:** Ready for testing

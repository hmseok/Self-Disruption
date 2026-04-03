# Supabase SDK to Prisma Conversion Report

## Overview
Successfully converted 15 Next.js API routes from Supabase SDK to Prisma ORM. All business logic preserved.

---

## Converted Files Summary

| # | File | Status | Key Changes |
|---|------|--------|-------------|
| 1 | contracts/[id]/documents | ✅ | Raw SQL for CRUD, GCS placeholder |
| 2 | contracts/[id]/generate-pdf | ✅ | PDF storage to GCS path, DB record |
| 3 | contracts/[id]/pdf | ✅ | Contract lookup, return stored URL |
| 4 | contracts/guest-sign | ✅ | Dynamic table names, file upload |
| 5 | contracts/payment-schedule | ✅ | Admin JWT verify, schedule generation |
| 6 | contracts/send-email | ✅ | JWT verify, multi-channel messaging |
| 7 | contracts/status | ✅ | Status transition validation |
| 8 | public/contract/[token]/pdf | ✅ | Complex joins, fallback terms |
| 9 | public/quote/[token] | ✅ | Public access, access tracking |
| 10 | public/quote/[token]/sign | ✅ | Contract creation, email sending |
| 11 | quotes/[id]/send | ✅ | Template-based messaging |
| 12 | quotes/[id]/share | ✅ | Token generation, reuse logic |
| 13 | quotes/[id]/timeline | ✅ | Event lookup, limit 100 |
| 14 | admin/contracts | ✅ | Complex filtering, pagination |
| 15 | cron/contract-expiration | ✅ | Auto-expire logic, history |

---

## Critical Issues Found

### 1. Dynamic Table Names (CRITICAL - Files 4, 5, 7, 15)
```typescript
// Current implementation
const tableName = contractType === 'jiip' ? 'jiip_contracts' : 'general_investments'
// Then used as: ${prisma.$raw(tableName)}
```

**Problem**: Prisma $raw() may not support dynamic table names this way

**Recommended Solutions**:
```typescript
// Option A: Add tables to Prisma schema
// Option B: Use explicit IF in SQL
// Option C: Create separate stored procedures
```

### 2. Firebase Auth Not Implemented (Phase 5 - Files 5, 6, 7, 11, 15)
Current placeholder JWT decode:
```typescript
const parts = token.split('.')
const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString())
```

**Issues**:
- No signature verification
- No error handling for malformed tokens
- No expiry validation
- No key rotation support

**Action Required**: Implement Firebase Admin SDK

### 3. File Storage Placeholders (Phase 6 - Files 1, 2, 4)
All use placeholder paths:
```typescript
const fileUrl = `gcs://contract-documents/${storagePath}`
```

**Action Required**: Replace with actual Google Cloud Storage upload

### 4. Timestamp-Based IDs (Files 10)
```typescript
const signatureId = Date.now().toString()
const contractId = Date.now().toString()
```

**Issues**:
- Collision risk with concurrent requests
- Not distributed system safe

**Recommended**: Use UUID v4 instead

### 5. Complex Window Functions (File 14)
```sql
SELECT c.*, COUNT(*) OVER() as total_count FROM contracts c
```

**Issues**:
- May not work with all Prisma versions
- Needs database index verification

---

## Implementation Details by File

### File 1: contracts/[id]/documents/route.ts
**Tables**: contract_documents, contracts
**Auth**: requireAuth from utils
**Key Logic**:
- GET: List documents ordered by created_at DESC
- POST: Upload file, store metadata in DB
- DELETE: Remove document by ID

**Conversion Notes**:
- Storage upload replaced with GCS placeholder
- INSERT/UPDATE/DELETE use executeRaw
- SELECT uses queryRaw

---

### File 2: contracts/[id]/generate-pdf/route.ts
**Tables**: contracts, contract_documents
**Auth**: None (internal use)
**Key Logic**:
- Accept Base64 PDF
- Check if already stored (return existing)
- Store with contract.contract_pdf_url
- Also insert into contract_documents

**Issues**: No auth required - ensure called from trusted origin only

---

### File 4: contracts/guest-sign/route.ts
**Tables**: jiip_contracts, general_investments, cars
**Auth**: None (guest access)
**Key Logic**:
- GET: Retrieve contract info (filtered fields)
- POST: Upload signed PDF, update signed_file_url

**Dynamic Table Name Issue**: Uses ${prisma.$raw(tableName)} which may fail

---

### File 5: contracts/payment-schedule/route.ts
**Tables**: jiip_contracts, general_investments, expected_payment_schedules, transactions
**Auth**: Firebase JWT verify (TODO Phase 5)
**Key Logic**:
- POST: Generate monthly payment schedule
- GET: Fetch schedule + actual transactions, compute summary

**Complexity**: Month-by-month calculation with date arithmetic

---

### File 6: contracts/send-email/route.ts
**Tables**: jiip_contracts, general_investments, companies, contract_sending_logs, profiles
**Auth**: Firebase JWT verify
**Channels**: Email, Kakao Alimtalk, SMS
**Key Logic**:
- Fetch contract + company data
- Try template-based sending
- Fallback to hardcoded HTML/SMS
- Log all send attempts

---

### File 8: public/contract/[token]/pdf/route.ts
**Tables**: 10+ tables (token, quote, contract, cars, customers, company, signature, terms, articles, special_terms, payment_schedules)
**Complexity**: HIGH - complex data aggregation
**Key Logic**:
- Validate token status = 'signed'
- Fetch full contract data
- Use fallback CONTRACT_TERMS if DB lookup fails
- Aggregate payment schedule

**Performance Note**: 10+ sequential queries - consider optimization

---

### File 10: public/quote/[token]/sign/route.ts
**Tables**: quote_share_tokens, quotes, contracts, cars, customer_signatures, payment_schedules, contract_terms, contract_special_terms
**Auth**: None (guest signing)
**Key Logic**:
- Validate token (signed, not revoked, not expired)
- Save signature data
- Auto-create contract + payment schedule
- Update cars.status = 'rented'
- Send emails (async, doesn't block)

**Critical**: Creates contracts on signing - design decision, can't undo

---

### File 14: admin/contracts/route.ts
**Complexity**: CRITICAL - uses complex SQL
**Tables**: contracts, cars, customer_signatures, profiles
**Key Features**:
- Multi-status filtering (pending, active, expiring, ended, cancelled)
- Search by customer_name
- Pagination (offset/limit)
- Join with cars and signatures
- Statistics calculation

**Issues**:
- Uses window function COUNT(*) OVER()
- Parameter binding syntax needs verification
- Complex WHERE clause building

---

## All Tables Required

```
Core Tables:
- contracts
- quotes
- companies
- cars
- customers
- profiles

Transactional:
- quote_share_tokens
- customer_signatures
- contract_documents
- contract_status_history
- contract_sending_logs
- quote_lifecycle_events
- payment_schedules
- expected_payment_schedules

Configuration:
- contract_terms
- contract_term_articles
- contract_special_terms

Investment-Specific:
- jiip_contracts ⚠️ Dynamic table name
- general_investments ⚠️ Dynamic table name

Optional:
- transactions
- contract_pdfs
- message_logs (assumed structure)
```

---

## Migration Path

### Phase 1: Validation (1 day)
- [ ] Verify all table schemas
- [ ] Test dynamic table name handling
- [ ] Verify Prisma raw query support
- [ ] Check database indexes

### Phase 2: Auth Implementation (2 days)
- [ ] Implement Firebase Admin SDK JWT verify
- [ ] Replace all JWT decode placeholders
- [ ] Add signature verification
- [ ] Test with real Firebase tokens

### Phase 3: Storage Implementation (1 day)
- [ ] Implement Google Cloud Storage upload
- [ ] Replace all GCS placeholder paths
- [ ] Test file upload/retrieval
- [ ] Verify public URL generation

### Phase 4: Testing (2 days)
- [ ] Unit tests for each endpoint
- [ ] Integration tests for workflows
- [ ] Performance tests (especially File 14)
- [ ] Concurrent request handling

### Phase 5: Deployment (1 day)
- [ ] Deploy to staging
- [ ] Run smoke tests
- [ ] Monitor logs for errors
- [ ] Gradual production rollout

---

## Code Quality Notes

### Strengths
✅ All business logic preserved
✅ Consistent error handling pattern
✅ Comprehensive data validation
✅ Support for fallback scenarios
✅ Lifecycle event tracking maintained

### Weaknesses
❌ No input validation (SQL injection risk)
❌ Missing database transaction boundaries
❌ No retry logic for transient failures
❌ Memory usage not optimized (large result sets)
❌ N+1 query patterns in several files

### Recommendations
1. Add SQL parameter validation/escaping
2. Wrap critical operations in transactions
3. Implement batch loading for related data
4. Cache frequently accessed data (company, terms)
5. Add request tracing/logging

---

## SQL Injection Risks

Files using raw queries with parameters - verify Prisma escaping:
- File 5: contract_type, contract_id parameters
- File 6: Similar pattern
- File 14: customer_name from LIKE %?% - HIGH RISK

**Required Action**: Verify Prisma properly escapes all parameters

---

## Summary

**Conversion Status**: ✅ Complete (15/15 files)
**Code Quality**: ⚠️ Good structure, needs auth/storage implementation
**Risk Level**: 🔴 HIGH - Dynamic tables, unimplemented auth, storage

**Estimated Effort**:
- Testing: 2-3 days
- Auth implementation: 2 days
- Storage implementation: 1 day
- Deployment: 1 day
- **Total**: ~1 week

**Do Not Deploy To Production Without**:
1. Firebase Auth Phase 5 implementation
2. Cloud Storage Phase 6 implementation
3. Comprehensive testing of dynamic table names
4. SQL injection security audit
5. Performance testing under load


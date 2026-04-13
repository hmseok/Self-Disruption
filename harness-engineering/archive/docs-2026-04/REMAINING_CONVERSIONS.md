# Remaining Conversions for Supabase → Prisma

## Status Summary
- ✅ Completed: 3 files
  - `app/api/payroll/route.ts`
  - `app/api/payroll/[id]/route.ts`
  - `app/api/payroll/generate/route.ts`

- 🔄 Remaining: 10 files

## Remaining Files with Conversion Guide

### 1. `/app/api/payroll/meal-expenses/route.ts`
**Pattern**: GET/POST for meal expense aggregation
**Key Changes**:
- Replace Supabase SELECT with raw queries
- Group data by employee_id
- Update status to 'applied'
- Upsert operations on meal_expense_monthly

**SQL Pattern**:
```sql
SELECT * FROM meal_expense_monthly WHERE year_month = ? AND status IN ('approved', 'pending')
SELECT * FROM corporate_cards WHERE id = ? AND is_active = 1
SELECT * FROM classification_queue WHERE source_data->'$.transaction_date' >= ?
UPSERT: INSERT ... ON DUPLICATE KEY UPDATE
```

### 2. `/app/api/payroll/reverse-calculate/route.ts`
**Pattern**: POST calculation (no DB queries)
**Note**: This file has NO database calls - only utility function calls. Can leave mostly as-is, just:
- Remove Supabase imports
- Add JWT auth decode
- Keep business logic unchanged

### 3. `/app/api/finance/classify/route.ts` (LARGE, ~800+ lines)
**Pattern**: POST with complex AI + multi-table joins
**Critical Notes**:
- PRESERVE ALL Gemini API logic (lines 13-189)
- PRESERVE all classification algorithms (lines 275-352)
- ONLY replace DB access (lines 365-397, ~503+)
- Multiple parallel queries for contracts, investments, loans, etc.
- All fetch patterns use `safeQuery` wrapper (no error throw)

**Key SQL Patterns**:
```sql
SELECT * FROM jiip_contracts WHERE status IS NULL OR status = 'active'
SELECT * FROM general_investments WHERE status IS NULL OR status = 'active'
SELECT * FROM loans WHERE status IS NULL OR status = 'active'
SELECT * FROM employee_salaries WHERE is_active != FALSE
SELECT * FROM corporate_cards (no status filter)
SELECT * FROM card_assignment_history
```

**Conversion Strategy**:
- Create async function for each safeQuery pattern
- Wrap in try/catch, return `{ data: [], error }` format
- Use Promise.all for parallel queries
- Handle case where tables don't exist

### 4. `/app/api/finance/reclassify/route.ts`
**Pattern**: POST with Gemini API (batch reclassification)
**Key Changes**:
- Replace transactions query (line 40-51)
- Keep Gemini API calls (lines 56-176) UNCHANGED
- Replace update query (line 157-160)

**SQL Pattern**:
```sql
SELECT * FROM transactions WHERE id IN (...) OR category IS NULL OR category IN ('기타', '미분류') LIMIT 200
UPDATE transactions SET category = ? WHERE id = ?
```

### 5. `/app/api/finance/import-excel/route.ts`
**Pattern**: POST with complex matching logic + bulk updates
**Key Changes**:
- Replace all Supabase fetches with raw queries
- Keep matching logic UNCHANGED (lines 53-112)
- Replace bulk update/insert/delete operations

**SQL Pattern**:
```sql
SELECT id, transaction_date, client_name, amount, description, payment_method FROM transactions
SELECT id, source_data, status FROM classification_queue
UPDATE transactions SET transaction_date = ?, client_name = ?, description = ? WHERE id = ?
UPDATE classification_queue SET source_data = ? WHERE id = ?
INSERT INTO classification_queue (...) VALUES (...)
UPDATE transactions SET deleted_at = ? WHERE id IN (...)
```

**Note**: Pagination query is custom (line 18-34) - implement using LIMIT/OFFSET

### 6. `/app/api/finance/analyze-bank-statement/route.ts`
**Pattern**: POST with contract matching logic
**Key Changes**:
- Replace queries for contracts, investments, loans, rules, schedules
- Keep all matching algorithm logic (lines 157-267) UNCHANGED

**SQL Pattern**:
```sql
SELECT * FROM jiip_contracts WHERE status = 'active'
SELECT * FROM general_investments WHERE status = 'active'
SELECT * FROM loans WHERE status = 'active'
SELECT * FROM finance_rules
SELECT * FROM expected_payment_schedules WHERE status = 'pending'
```

### 7. `/app/api/receipts/route.ts`
**Pattern**: GET/POST/PATCH/DELETE CRUD for expense_receipts
**Key Changes**:
- Replace all expense_receipts queries
- Keep list_months logic (collect distinct months)
- Keep duplicate checking logic
- Replace INSERT/UPDATE/DELETE operations

**SQL Pattern**:
```sql
SELECT DISTINCT DATE_FORMAT(expense_date, '%Y-%m') as month FROM expense_receipts WHERE user_id = ? ORDER BY expense_date DESC
SELECT * FROM expense_receipts WHERE user_id = ? AND expense_date >= ? AND expense_date <= ? ORDER BY expense_date DESC
INSERT INTO expense_receipts (...) VALUES (...)
UPDATE expense_receipts SET category = ?, item_name = ?, customer_team = ?, memo = ? WHERE id IN (...) AND user_id = ?
DELETE FROM expense_receipts WHERE id = ? AND user_id = ?
```

### 8. `/app/api/receipts/ocr/route.ts`
**Pattern**: POST with Gemini Vision API + optional CLOVA OCR fallback
**Notes**:
- NO database queries in this file
- Gemini Vision API calls (lines 103-236) - PRESERVE completely
- CLOVA OCR fallback (lines 241-286) - PRESERVE completely
- Storage operations (lines 314-328) - NOT in scope (Supabase storage)
- Only change: remove getSupabaseAdmin() calls, keep auth

### 9. `/app/api/receipts/download/route.ts`
**Pattern**: GET with JSZip Excel generation
**Key Changes**:
- Replace expense_receipts query
- Keep all JSZip/Excel generation logic (lines 150-244) UNCHANGED

**SQL Pattern**:
```sql
SELECT * FROM expense_receipts WHERE user_id = ? AND expense_date >= ? AND expense_date <= ? ORDER BY expense_date ASC
```

### 10. `/app/api/receipts/migrate/route.ts`
**Pattern**: POST - Schema migration helper
**Notes**:
- NO database queries - only RPC calls
- If not migrating to Prisma yet, can be skipped OR
- Replace RPC calls with direct ALTER TABLE if Prisma/MySQL supports it
- Test column existence with dummy query

**Current Pattern**:
```typescript
await sb.rpc('exec_sql', { query: 'ALTER TABLE...' })
```

**Prisma Equivalent**:
```typescript
try {
  await prisma.$executeRaw`ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS memo text DEFAULT ''`
} catch (e) {
  // Column already exists
}
```

## Implementation Order

1. **Phase 1** (Simple, no dependencies):
   - `reverse-calculate/route.ts` - Minimal changes
   - `ocr/route.ts` - No DB queries needed
   - `migrate/route.ts` - Simple ALTER or skip

2. **Phase 2** (Medium complexity, independent):
   - `meals-expenses/route.ts`
   - `reclassify/route.ts`
   - `receipts/route.ts` (CRUD)
   - `download/route.ts`

3. **Phase 3** (High complexity, preserve logic):
   - `import-excel/route.ts`
   - `analyze-bank-statement/route.ts`
   - `classify/route.ts` (LARGEST, most critical)

## Testing Approach

For each file:
1. Run existing tests with new DB layer
2. Test auth token decode
3. Verify query results match Supabase format
4. Test AI calls (Gemini, CLOVA) still work
5. Verify JSON serialization/deserialization
6. Check BigInt handling

## Helper Functions to Create

```typescript
// Auth
function decodeJWT(token: string): any { ... }

// Safe DB access
async function safeQuery<T>(query: () => Promise<T>): Promise<{ data: T | null, error: any }> { ... }

// Serialization
function serialize<T>(data: T): T { ... }

// Pagination
async function fetchAll(table: string, conditions: string, pageSize: number = 1000): Promise<any[]> { ... }
```

## Complex Issues to Watch

1. **classify/route.ts line 557-559**: `previous_card_numbers` - might be array in JSON
2. **classify/route.ts line 785**: String interpolation in UPDATE IN clause
3. **import-excel/route.ts**: Manual pagination - implement with LIMIT/OFFSET
4. **receipt routes**: File upload to Supabase storage - keep as-is or implement alternative
5. **All routes**: JSON.stringify for complex types, JSON.parse on read

## Estimated Effort

- Simple: 30min each (reverse-calc, ocr, migrate)
- Medium: 1-2hr each (meal-expenses, reclassify, receipts, download)
- Hard: 2-3hr each (import-excel, analyze-bank)
- Very Hard: 3-4hr (classify - largest file, most logic)

**Total Estimated Time**: 15-20 hours for all conversions + testing

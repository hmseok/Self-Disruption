# Supabase to Prisma Conversion Guide

This guide documents the conversion of 13 API routes from Supabase SDK to Prisma with raw SQL queries.

## Conversion Rules Applied

1. **Auth Tokens**: JWT decode from Bearer token (base64 middle part)
   - Mark with `// TODO: Phase 5 Firebase Auth`

2. **Database Access**: All queries use `prisma.$queryRaw` (SELECT) or `prisma.$executeRaw` (INSERT/UPDATE/DELETE)

3. **MySQL Booleans**: Use 1/0 instead of true/false in SQL

4. **UUIDs**: Use `UUID()` function in MySQL INSERT statements

5. **JSON Fields**: Use `JSON.stringify()` when writing, parse after reading

6. **BigInt Serialization**: Use helper:
   ```typescript
   function serialize<T>(data: T): T {
     return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
   }
   ```

## Files Converted

### Payroll Routes (4 files)
- ✅ `app/api/payroll/route.ts` - GET/POST salary settings
- ✅ `app/api/payroll/[id]/route.ts` - GET/PATCH/POST individual payslip
- 🔄 `app/api/payroll/generate/route.ts` - Batch payslip generation (in progress)
- 🔄 `app/api/payroll/meal-expenses/route.ts` - Meal expense monthly aggregation
- 🔄 `app/api/payroll/reverse-calculate/route.ts` - Reverse calculate base salary

### Finance Routes (4 files)
- 🔄 `app/api/finance/classify/route.ts` - AI classification with Gemini (complex, large file)
- 🔄 `app/api/finance/reclassify/route.ts` - AI reclassification of transactions
- 🔄 `app/api/finance/import-excel/route.ts` - Excel import & matching
- 🔄 `app/api/finance/analyze-bank-statement/route.ts` - Bank statement analysis

### Receipts Routes (4 files)
- 🔄 `app/api/receipts/route.ts` - Receipt CRUD operations
- 🔄 `app/api/receipts/ocr/route.ts` - OCR receipt analysis with Gemini/CLOVA
- 🔄 `app/api/receipts/download/route.ts` - Excel export for receipts
- 🔄 `app/api/receipts/migrate/route.ts` - Schema migration helper

## Key Conversion Patterns

### Supabase → Prisma

```typescript
// Old (Supabase)
const { data, error } = await sb.from('table').select('*').eq('id', id).single()
if (error) return error
const result = data

// New (Prisma Raw)
const result = await prisma.$queryRaw<any[]>`
  SELECT * FROM table WHERE id = ${id} LIMIT 1
`
const data = result?.[0]
```

### Insert/Update/Delete

```typescript
// Old (Supabase)
await sb.from('table').insert(rows)

// New (Prisma Raw)
await prisma.$executeRaw`
  INSERT INTO table (...) VALUES (...)
`
```

### Complex Queries with Joins

```typescript
// Old (Supabase)
.select('*, profile:user_id(name, email)')

// New (Prisma Raw)
SELECT t.*, p.name, p.email FROM table t
LEFT JOIN profiles p ON t.user_id = p.id
```

### Upsert Operations

```typescript
// Old (Supabase)
.upsert({...}, { onConflict: 'col1,col2' })

// New (Prisma Raw - MySQL)
INSERT INTO table (...) VALUES (...)
ON DUPLICATE KEY UPDATE col1=VALUES(col1), ...
```

## Tables Used (All raw queries needed)

- `payslips`
- `employee_salaries`
- `freelancers`
- `meal_expense_monthly`
- `transactions`
- `classification_queue`
- `business_rules`
- `corporate_cards`
- `expense_receipts`
- `profiles`

## Important Notes

1. **AI Logic Preservation**: Gemini API calls in classify/reclassify routes are unchanged - only DB layer swapped
2. **Excel Export**: Receipt download uses JSZip - no changes needed there
3. **OCR Fallback**: Gemini → CLOVA OCR logic preserved
4. **Error Handling**: All routes wrap in try/catch, return NextResponse with proper status codes
5. **Pagination**: Manual pagination for large result sets (e.g., import-excel)

## Testing Checklist

- [ ] Auth verification works (JWT decode)
- [ ] GET queries return data with correct structure
- [ ] POST/PATCH/DELETE modify data correctly
- [ ] Transaction records created for salary payments
- [ ] Meal expense aggregation calculates correctly
- [ ] Gemini classification API calls succeed
- [ ] Excel import matching logic works
- [ ] Receipt OCR analysis returns parsed items
- [ ] BigInt values serialize properly
- [ ] JSON columns parse/stringify correctly

## Migration Path

1. Update imports: Remove `@supabase/supabase-js`, Add `@/lib/prisma`
2. Replace `getSupabaseAdmin()` calls with `prisma`
3. Convert verifyAdmin() to JWT decode
4. Replace all `.from().select()` with `$queryRaw`
5. Replace all `.insert()/.update()/.delete()` with `$executeRaw`
6. Test with sample data
7. Monitor logs for any BigInt serialization issues

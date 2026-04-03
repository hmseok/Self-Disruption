# Next Steps for Prisma Conversion

## Immediate Actions Required

### 1. Prisma Setup (If Not Already Done)
```bash
npm install @prisma/client
npm install -D prisma

# Initialize Prisma with MySQL
npx prisma init

# Configure .env.local with your MySQL database URL
# DATABASE_URL="mysql://user:password@host:port/database"

# Push existing schema
npx prisma db push
```

### 2. Create Prisma Client Helper
Create `/lib/prisma.ts`:
```typescript
import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => new PrismaClient()
declare global { var prisma: undefined | ReturnType<typeof prismaClientSingleton> }
const prisma = global.prisma ?? prismaClientSingleton()
if (process.env.NODE_ENV !== 'production') global.prisma = prisma
export { prisma }
```

### 3. Test Converted Routes
```bash
# Test with real data
npm run dev

# Call endpoints to verify:
curl http://localhost:3000/api/payroll
curl http://localhost:3000/api/payroll/[id]
curl http://localhost:3000/api/payroll/generate
```

## Phase 2: Convert Medium Complexity Files (2-3 hours)

Priority order:

1. **`app/api/payroll/reverse-calculate/route.ts`** (10 min)
   - No database changes needed
   - Just remove Supabase, add JWT auth
   - Keep all math logic

2. **`app/api/payroll/meal-expenses/route.ts`** (30 min)
   - GET: Fetch meal expenses with aggregation
   - POST: Upsert with meal data calculation
   - Simple SELECT/UPDATE pattern

3. **`app/api/receipts/ocr/route.ts`** (15 min)
   - NO database queries
   - Just remove Supabase storage calls
   - Gemini Vision API stays unchanged

4. **`app/api/receipts/route.ts`** (45 min)
   - CRUD: GET, POST, PATCH, DELETE
   - Duplicate detection logic
   - month-based filtering

5. **`app/api/finance/reclassify/route.ts`** (40 min)
   - SELECT unclassified transactions
   - Keep Gemini API loop unchanged
   - UPDATE classification results

6. **`app/api/receipts/download/route.ts`** (30 min)
   - SELECT receipts by month
   - Keep JSZip Excel generation
   - Simple date filtering

## Phase 3: Convert Complex Files (4-6 hours)

1. **`app/api/finance/import-excel/route.ts`** (2 hours)
   - Complex matching logic - keep unchanged
   - Replace Supabase queries with raw SQL
   - Handle pagination manually
   - Bulk INSERT/UPDATE operations

2. **`app/api/finance/analyze-bank-statement/route.ts`** (1.5 hours)
   - Contract matching algorithms - keep intact
   - Replace 5 parallel queries
   - Join with contracts/schedules

3. **`app/api/finance/classify/route.ts`** (3 hours) ⚠️ CRITICAL
   - Largest file (~900 lines)
   - Complex Gemini AI classification
   - Multi-table joins
   - Replace DB layer ONLY
   - Preserve all algorithms

## Testing Strategy

### Unit Tests
- Auth token decoding
- Query result formatting
- JSON serialization
- Type conversions

### Integration Tests
- Full request/response cycles
- Database operations
- Transaction creation
- Error handling

### Performance Tests
- Batch payslip generation (1000 employees)
- Excel import (10000 transactions)
- Gemini classification (100 items batch)

## Common Issues & Solutions

### Issue 1: JSON serialization
```typescript
// Problem: JSON field from DB is string
const field = await prisma.$queryRaw`SELECT json_field FROM table`

// Solution: Parse explicitly
const data = typeof field === 'string' ? JSON.parse(field) : field
```

### Issue 2: BigInt values
```typescript
// Problem: BigInt not serializable to JSON
throw new Error('Do not know how to serialize a BigInt')

// Solution: Create serializer
function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => 
    typeof v === 'bigint' ? v.toString() : v
  ))
}
```

### Issue 3: LIMIT without ORDER BY randomness
```typescript
// Problem: LIMIT 1 might return different results
// Solution: Always add ORDER BY or ensure unique condition
SELECT * FROM table WHERE unique_id = ? LIMIT 1
```

### Issue 4: Timezone issues with timestamps
```typescript
// Problem: Date converted to UTC
// Solution: Use ISO 8601 format consistently
const now = new Date().toISOString()
await prisma.$executeRaw`INSERT INTO table (..., created_at) VALUES (..., ${now})`
```

## Code Review Checklist

For each converted file, verify:
- [ ] No `@supabase/supabase-js` imports
- [ ] Uses `prisma.$queryRaw` or `$executeRaw`
- [ ] JWT auth decode implemented
- [ ] All business logic preserved
- [ ] JSON fields handled correctly
- [ ] Booleans converted to 1/0
- [ ] Error handling with try/catch
- [ ] NextResponse with proper status codes
- [ ] TODO comment for Phase 5 Firebase Auth
- [ ] No hardcoded IDs or secrets

## Performance Optimization (Post-Conversion)

After all files converted:

1. Add query result caching
   ```typescript
   const memoized = new Map()
   ```

2. Combine related queries
   ```typescript
   // Instead of 6 separate queries
   // Use subqueries or views
   ```

3. Add database indexes
   ```sql
   CREATE INDEX idx_employee_id ON payslips(employee_id);
   CREATE INDEX idx_transaction_date ON transactions(transaction_date);
   ```

4. Monitor slow queries
   ```typescript
   // Enable query logging in .env
   DATABASE_LOG=query
   ```

## Migration Timeline

- **Now**: Complete Phase 2 medium complexity files (3-4 hours)
- **Day 2**: Phase 3 complex files (6-8 hours)
- **Day 3**: Testing & bug fixes (4-5 hours)
- **Day 4**: Performance optimization & documentation (2-3 hours)

**Total Estimated**: 15-20 hours remaining

## Success Criteria

- ✅ All 13 routes converted and tested
- ✅ No Supabase SDK imports
- ✅ All Gemini API calls working
- ✅ Payroll calculations correct
- ✅ Excel imports successful
- ✅ OCR analysis accurate
- ✅ Database operations atomic
- ✅ Auth working with JWT
- ✅ Error messages informative
- ✅ Performance acceptable

## Contact & Support

For questions about specific conversions:
1. Review `REMAINING_CONVERSIONS.md` for detailed patterns
2. Check `CONVERSION_REPORT.md` for completed examples
3. Refer to `CONVERSION_GUIDE.md` for rules


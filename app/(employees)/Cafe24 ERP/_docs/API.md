# API.md — 카페24 ERP 모듈 API + 라이브러리 사용법

> 마지막 갱신: 2026-05-05 (PR-6.2 lib/cafe24-db.ts 신설)

---

## 1. `lib/cafe24-db.ts` — 단일 진입점 (PR-6.2 신설)

**원칙**: 본 프로젝트에서 카페24 DB 에 접근하는 *유일한* 통로. 다른 곳에서 `mysql2.createConnection` / `createPool` 직접 호출 절대 금지.

### 1.1 import

```ts
import { cafe24Db } from '@/lib/cafe24-db'
// 또는 default export
import cafe24Db from '@/lib/cafe24-db'
```

### 1.2 다건 SELECT — `query<T>(sql, params)`

```ts
import type { RowDataPacket } from 'mysql2'

interface AccidentRow extends RowDataPacket {
  esosidno: string
  esosmddt: string
  esossrno: number
  esosrgst: string | null
}

const rows = await cafe24Db.query<AccidentRow>(
  `SELECT esosidno, esosmddt, esossrno, esosrgst
     FROM aceesosh
    WHERE esosmddt BETWEEN ? AND ?
    ORDER BY esosmddt DESC, esossrno DESC
    LIMIT 50`,
  ['20260101', '20260505']
)
```

### 1.3 단건 SELECT — `queryOne<T>(sql, params)`

```ts
const row = await cafe24Db.queryOne<AccidentRow>(
  `SELECT * FROM aceesosh
    WHERE esosidno = ? AND esosmddt = ? AND esossrno = ?`,
  [idno, mddt, srno]
)
if (!row) {
  // 없을 경우 처리
}
```

### 1.4 COUNT — `count(sql, params)`

```ts
const cnt = await cafe24Db.count(
  `SELECT COUNT(*) AS c FROM aceesosh WHERE esosrgst = ?`,
  ['R']
)
// 첫 번째 컬럼 값을 number 로 강제 변환해 반환
```

### 1.5 헬스체크 — `probe()`

```ts
const meta = await cafe24Db.probe()
// {
//   ok: true,
//   version: '10.1.13-MariaDB',
//   variant: 'MariaDB Server',
//   sql_mode: 'IGNORE_SPACE,...',
//   collation: 'utf8_general_ci',
//   time_zone: 'SYSTEM',
//   total_tables: 382
// }
// or { ok: false, error: '...' }
```

### 1.6 Pool 종료 — `end()` (테스트 / cleanup 만)

```ts
await cafe24Db.end()
// 일반 호출 X — Next.js 가 process 종료 시 자동 정리
```

---

## 2. Read-only 정책 (단계 1)

```ts
// ❌ 금지 — 즉시 throw
await cafe24Db.query('INSERT INTO aceesosh VALUES (...)')
// → Error: read-only violation: SQL contains forbidden statement

차단 키워드:
INSERT / UPDATE / DELETE / REPLACE / DROP / ALTER /
TRUNCATE / CREATE / RENAME / GRANT / REVOKE / LOCK / UNLOCK / CALL / LOAD DATA
```

단계 2 (양방 동기화) 진입 시 본 정책 별도 PR 에서 완화 (예: writeQuery 별도 함수 + 명시적 opt-in).

---

## 3. 환경변수 (`.env.local`)

```
CAFE24_DB_HOST=skyautosvc.co.kr
CAFE24_DB_PORT=3306
CAFE24_DB_USER=...
CAFE24_DB_PASSWORD=...
CAFE24_DB_NAME=...
```

5개 키 중 하나라도 부재 시 `getPool()` 첫 호출 시 명확한 에러로 throw:
```
[cafe24-db] missing env vars: CAFE24_DB_HOST, ... .env.local 에 5개 키 설정 필요.
```

---

## 4. 옵션 상세 (PR-6.1 검증 결과 반영)

```ts
{
  charset: 'utf8',                    // ← utf8mb3 X (mysql2 미인식)
  typeCast: ...                       // STRING/VAR_STRING/BLOB → utf8 강제
  connectionLimit: 5,                 // read-only 충분
  queueLimit: 10,
  idleTimeout: 60_000,                // 60초 idle 종료 (분당 변동 정책)
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  waitForConnections: true,
  connectTimeout: 10_000,
}
```

---

## 5. 에러 처리 가이드

```ts
try {
  const rows = await cafe24Db.query<MyRow>(sql, params)
  // ...
} catch (e) {
  const err = e as { code?: string; message?: string }
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
    // 카페24 DB 다운 또는 화이트리스트 변경 — 사용자에게 알림
    return NextResponse.json(
      { success: false, error: '카페24 DB 연결 실패', code: err.code },
      { status: 503 }
    )
  }
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    // 자격증명 변경 — admin 알림
  }
  throw e
}
```

API route 의 graceful fallback 패턴 (CLAUDE.md 규칙 23):
```ts
try {
  const rows = await cafe24Db.query<MyRow>(sql, params)
  return NextResponse.json({ success: true, data: rows })
} catch (e) {
  console.error('[/api/cafe24/...] DB error:', e)
  return NextResponse.json(
    { success: false, data: [], error: 'cafe24-unavailable' },
    { status: 200 }  // UI 가 계속 동작 — 빈 배열 + 배너로 알림
  )
}
```

---

## 6. SQL 작성 시 의무 (CLAUDE-Cafe24.md § 2 / § 2.1 / § 2.2 / § 2.4)

### MariaDB 10.1 호환 함수만

```
✅ CONCAT, CONCAT_WS, COALESCE, IF, CASE WHEN
✅ LEFT, RIGHT, SUBSTRING, INSTR, REPLACE, LENGTH
✅ DATE_FORMAT, DATE_SUB, DATE_ADD, NOW, CURDATE
✅ STR_TO_DATE(col, '%Y%m%d')   ← VARCHAR(8) YYYYMMDD 변환
✅ GROUP_CONCAT
❌ REGEXP_REPLACE (MySQL 8.0+)
❌ JSON_TABLE / WINDOW 함수 / CTE
```

### 카페24 측 sql_mode

```
ONLY_FULL_GROUP_BY 미적용 — GROUP BY alias 자유롭지만,
FMI 측 lint 호환 위해 표준 GROUP BY 권장 (alias 대신 expression 반복).
```

### 날짜 / 시간 변환

```sql
-- 카페24 측 컬럼 = VARCHAR(8) YYYYMMDD / VARCHAR(4) HHMM
SELECT esosidno,
       STR_TO_DATE(esosmddt, '%Y%m%d') AS accept_date,
       CONCAT(SUBSTRING(esosactm, 1, 2), ':', SUBSTRING(esosactm, 3, 2)) AS accept_time
  FROM aceesosh
```

### 한국어 LIKE 검색

```sql
-- collation utf8_general_ci 라 case-insensitive 자동
SELECT * FROM pmccustm WHERE custname LIKE CONCAT('%', ?, '%')
```

---

## 7. API 라우트 (PR-6.3+ 신설 예정)

| 엔드포인트 | 메소드 | 상태 | 설명 |
|-----------|-------|------|------|
| `/api/cafe24/probe` | GET | 🔜 PR-6.2 | 헬스체크 (관리자 디버그용) |
| `/api/cafe24/accidents` | GET | 🔜 PR-6.3 | 사고 접수 목록 (broken call 해소) |
| `/api/cafe24/accidents/[id]` | GET | 🔜 PR-6.3 | 사고 상세 |
| `/api/cafe24/dashboard` | GET | 🔜 PR-6.4 | 대시보드 KPI 위젯 |
| `/api/cafe24/orders` | GET | 🔜 PR-6.5 | 대차 주문 목록 |
| `/api/cafe24/settlements` | GET | 🔜 PR-6.6 | 정산 워크플로우 |

---

## 8. 호출 예시 — broken call 해소 (PR-6.3 미리보기)

```ts
// app/api/cafe24/accidents/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cafe24Db } from '@/lib/cafe24-db'
import type { RowDataPacket } from 'mysql2'

interface AccidentRow extends RowDataPacket {
  esosidno: string
  esosmddt: string
  esossrno: number
  esosacdt: string | null
  esosactm: string | null
  esosrgst: string | null
  esosrslt: string | null
  esosrstx: string | null
}

export async function GET(req: NextRequest) {
  // TODO: admin role 체크 (Q8=D 일단 관리자 전용)
  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const offset = parseInt(url.searchParams.get('offset') || '0')

  try {
    const rows = await cafe24Db.query<AccidentRow>(
      `SELECT esosidno, esosmddt, esossrno,
              esosacdt, esosactm, esosrgst, esosrslt, esosrstx
         FROM aceesosh
        ORDER BY esosmddt DESC, esossrno DESC
        LIMIT ? OFFSET ?`,
      [limit, offset]
    )
    return NextResponse.json({
      success: true,
      data: rows,
      meta: { fetched_at: new Date().toISOString(), cache: 30 },
    })
  } catch (e) {
    console.error('[/api/cafe24/accidents] DB error:', e)
    return NextResponse.json(
      { success: false, data: [], error: 'cafe24-unavailable' },
      { status: 200 }
    )
  }
}
```

/**
 * lib/cafe24-db.ts
 * ─────────────────────────────────────────────────────────────────
 * 카페24 ERP (skyautosvc.co.kr / MariaDB 10.1.13) 단일 진입점.
 *
 * 본 모듈은 본 프로젝트에서 카페24 DB 에 접근하는 *유일한* 통로다.
 * 직접 mysql2.createConnection / createPool 을 다른 곳에서 호출 금지.
 *
 * 정책 (CLAUDE.md / app/(employees)/Cafe24 ERP/_docs/CLAUDE-Cafe24.md):
 *   - READ-ONLY 만 (단계 1) — INSERT / UPDATE / DELETE / DDL 차단
 *   - charset: 'utf8' (mysql2 가 'utf8mb3' 미인식)
 *   - typeCast: STRING/VAR_STRING/BLOB → utf8 강제 (한글 Buffer 회피)
 *   - MariaDB 10.1 호환 함수만 (REGEXP_REPLACE / JSON_TABLE / WINDOW 함수 X)
 *   - connection pool — limit 5, idle 60s
 *   - graceful: 환경변수 부재 시 throw, connection 실패 시 throw (호출자 try/catch)
 *
 * 검증 (PR-6.1, 2026-05-05):
 *   - Connection 성공: 외부 IP 접근 이미 허용
 *   - DB 버전: 10.1.13-MariaDB
 *   - sql_mode: IGNORE_SPACE,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION
 *   - collation: utf8_general_ci
 *   - time_zone: SYSTEM (한국 KST 추정 UTC+9)
 *   - 총 382 테이블
 */

// cafe24-db: MariaDB 10.1
import type { Pool, PoolOptions, RowDataPacket } from 'mysql2/promise'
import { createPool } from 'mysql2/promise'

// ─── 환경변수 검증 ──────────────────────────────────────────────────
function readEnv(): {
  host: string
  port: number
  user: string
  password: string
  database: string
} {
  const host = process.env.CAFE24_DB_HOST
  const portStr = process.env.CAFE24_DB_PORT
  const user = process.env.CAFE24_DB_USER
  const password = process.env.CAFE24_DB_PASSWORD
  const database = process.env.CAFE24_DB_NAME

  const missing: string[] = []
  if (!host) missing.push('CAFE24_DB_HOST')
  if (!portStr) missing.push('CAFE24_DB_PORT')
  if (!user) missing.push('CAFE24_DB_USER')
  if (!password) missing.push('CAFE24_DB_PASSWORD')
  if (!database) missing.push('CAFE24_DB_NAME')

  if (missing.length > 0) {
    throw new Error(
      `[cafe24-db] missing env vars: ${missing.join(', ')}. ` +
        `.env.local 에 5개 키 설정 필요.`
    )
  }

  const port = parseInt(portStr!, 10)
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`[cafe24-db] invalid CAFE24_DB_PORT: ${portStr}`)
  }

  return { host: host!, port, user: user!, password: password!, database: database! }
}

// ─── Pool (lazy singleton) ─────────────────────────────────────────
let _pool: Pool | null = null

function getPool(): Pool {
  if (_pool) return _pool

  const env = readEnv()

  const opts: PoolOptions = {
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,

    // PR-6.1 검증 결과 — mysql2 charset 함정
    // 'utf8mb3' 또는 'utf8mb3_general_ci' 는 Unknown — 'utf8' 만 인식
    charset: 'utf8',

    // 한글 응답이 Buffer 로 오는 문제 회피
    // ⚠ field.string() 인자 없으면 latin1 처리됨 — 'utf8' 명시 의무 (PR-6.5 검증)
    typeCast: function (field, next) {
      const t = field.type
      if (t === 'VAR_STRING' || t === 'STRING' || t === 'BLOB') {
        return field.string('utf8')
      }
      return next()
    },

    // Pool 옵션 (분당 변동 패턴 — Q7=A)
    connectionLimit: 5,
    queueLimit: 10,
    idleTimeout: 60_000, // 60초 idle 후 종료
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    waitForConnections: true,
    connectTimeout: 10_000,

    // 한국시간 변환 — time_zone SYSTEM 이라 호스트 KST. JS Date 변환은 호출자 책임.
    // dateStrings 안 켜고 raw 그대로 받음 — VARCHAR(8) YYYYMMDD 컬럼은 string 으로 옴.
  }

  _pool = createPool(opts)
  return _pool
}

// ─── Read-only 정책 강제 ────────────────────────────────────────────
const FORBIDDEN_SQL_PATTERN =
  /\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|TRUNCATE|CREATE|RENAME|GRANT|REVOKE|LOCK|UNLOCK|CALL|LOAD\s+DATA)\b/i

function assertReadOnly(sql: string) {
  if (FORBIDDEN_SQL_PATTERN.test(sql)) {
    throw new Error(
      `[cafe24-db] read-only violation: SQL contains forbidden statement. ` +
        `단계 1 정책상 SELECT 만 허용. SQL: ${sql.slice(0, 200)}`
    )
  }
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * 다건 SELECT
 * @example
 *   const rows = await cafe24Db.query<{ esosidno: string; esosmddt: string }>(
 *     'SELECT esosidno, esosmddt FROM aceesosh WHERE esosrgst = ? LIMIT 10',
 *     ['R']
 *   )
 */
async function query<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  assertReadOnly(sql)
  const pool = getPool()
  const [rows] = await pool.query<T[]>(sql, params)
  return rows
}

/**
 * 단건 SELECT (없으면 null)
 */
async function queryOne<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  assertReadOnly(sql)
  const pool = getPool()
  const [rows] = await pool.query<T[]>(sql, params)
  return rows.length > 0 ? rows[0] : null
}

/**
 * COUNT(*) 반환
 * @example
 *   const cnt = await cafe24Db.count('SELECT COUNT(*) AS c FROM aceesosh')
 */
async function count(sql: string, params: unknown[] = []): Promise<number> {
  assertReadOnly(sql)
  const pool = getPool()
  const [rows] = await pool.query<({ c: number; cnt: number; count: number } & RowDataPacket)[]>(
    sql,
    params
  )
  if (rows.length === 0) return 0
  const row = rows[0]
  // 첫 번째 컬럼 값을 number 로 강제
  const firstKey = Object.keys(row).find((k) => k !== 'constructor') as keyof typeof row
  const v = row[firstKey]
  return typeof v === 'number' ? v : Number(v) || 0
}

/**
 * 헬스체크 — connection + 환경 정보 반환
 */
async function probe(): Promise<{
  ok: boolean
  version?: string
  variant?: string
  sql_mode?: string
  collation?: string
  time_zone?: string
  total_tables?: number
  error?: string
}> {
  try {
    const pool = getPool()
    const [vRows] = await pool.query<RowDataPacket[]>(
      'SELECT @@version AS v, @@version_comment AS vc, @@sql_mode AS sm, @@collation_database AS coll, @@time_zone AS tz'
    )
    const [cRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE()'
    )
    const v = (vRows[0] || {}) as Record<string, unknown>
    const c = (cRows[0] || {}) as Record<string, unknown>
    return {
      ok: true,
      version: typeof v.v === 'string' ? v.v : undefined,
      variant: typeof v.vc === 'string' ? v.vc : undefined,
      sql_mode: typeof v.sm === 'string' ? v.sm : undefined,
      collation: typeof v.coll === 'string' ? v.coll : undefined,
      time_zone: typeof v.tz === 'string' ? v.tz : undefined,
      total_tables: Number(c.cnt) || 0,
    }
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    return {
      ok: false,
      error: `${err.code || 'no-code'}: ${err.message || String(e)}`,
    }
  }
}

/**
 * Pool 종료 (테스트 / cleanup 용 — 일반 호출 X)
 */
async function end(): Promise<void> {
  if (_pool) {
    await _pool.end()
    _pool = null
  }
}

// ─── Export ────────────────────────────────────────────────────────
export const cafe24Db = {
  query,
  queryOne,
  count,
  probe,
  end,
}

export default cafe24Db

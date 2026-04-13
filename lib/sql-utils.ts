/**
 * 안전한 동적 SQL 유틸 — 파라미터 바인딩 전용
 *
 * 화이트리스트 기반 컬럼 필터링 + ?-파라미터 바인딩으로
 * SQL Injection을 근본 차단한다.
 */

import { prisma } from './prisma'

// 컬럼명은 영문/숫자/언더스코어만 허용 (추가 안전장치)
const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/**
 * 동적 UPDATE 실행 (파라미터 바인딩)
 *
 * @param table 테이블명 (호출부에서 하드코딩할 것 — 외부 입력 금지)
 * @param id 대상 레코드 id
 * @param body 업데이트할 컬럼/값 객체
 * @param allowedCols 허용할 컬럼 화이트리스트 (undefined면 body의 모든 키 허용)
 * @param options.updatedAt updated_at = NOW() 자동 추가 (기본 true)
 * @param options.idColumn 기본 'id'
 * @returns 업데이트된 행 수
 */
export async function safeUpdateById(
  table: string,
  id: string | number,
  body: Record<string, any>,
  allowedCols?: readonly string[],
  options: { updatedAt?: boolean; idColumn?: string } = {}
): Promise<number> {
  if (!SAFE_COL.test(table)) throw new Error(`Invalid table name: ${table}`)
  const idCol = options.idColumn ?? 'id'
  if (!SAFE_COL.test(idCol)) throw new Error(`Invalid id column: ${idCol}`)

  const entries = Object.entries(body).filter(([k]) => {
    if (!SAFE_COL.test(k)) return false
    if (allowedCols && !allowedCols.includes(k)) return false
    return true
  })

  if (entries.length === 0) return 0

  const setClause = entries.map(([k]) => `\`${k}\` = ?`).join(', ')
  const values = entries.map(([, v]) => v)
  const updatedAt = options.updatedAt ?? true
  const sql = `UPDATE \`${table}\` SET ${setClause}${updatedAt ? ', updated_at = NOW()' : ''} WHERE \`${idCol}\` = ?`

  return prisma.$executeRawUnsafe(sql, ...values, id)
}

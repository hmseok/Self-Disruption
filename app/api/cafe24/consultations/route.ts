import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 테이블 컬럼 확인
async function getTableCols(pool: any, table: string): Promise<Set<string>> {
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM ${table}`);
    return new Set((cols as any[]).map((c: any) => (c.Field || '').toLowerCase()));
  } catch {
    return new Set();
  }
}

function buildSelect(alias: string, colMap: [string, string][], colSet: Set<string>): string {
  return colMap
    .filter(([col]) => colSet.has(col.toLowerCase()))
    .map(([col, as]) => `${alias}.${col} as ${as}`)
    .join(', ');
}

// 상담이력 조회 (acrmemoh 테이블)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get('staffId') || '';
    const receiptDate = searchParams.get('receiptDate') || '';
    const seqNo = searchParams.get('seqNo') || '';
    const accidentNo = searchParams.get('accidentNo') || '';

    const pool = getCafe24Pool();

    // 메모 테이블 컬럼
    const memoCols: [string, string][] = [
      ['memoidno', 'staffId'], ['memomddt', 'receiptDate'], ['memosrno', 'seqNo'],
      ['memoline', 'lineNo'], ['memodate', 'memoDate'], ['memotime', 'memoTime'],
      ['memotype', 'memoType'], ['memotitl', 'memoTitle'], ['memoctnt', 'memoContent'],
      ['memognus', 'createdBy'], ['memogndt', 'createdDate'], ['memogntm', 'createdTime'],
    ];

    const memoColSet = await getTableCols(pool, 'acrmemoh');
    if (memoColSet.size === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const memoSelect = buildSelect('m', memoCols, memoColSet);
    if (!memoSelect) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 특정 사고건의 상담이력 조회
    if (staffId && receiptDate && seqNo) {
      const orderCols = [];
      if (memoColSet.has('memodate')) orderCols.push('m.memodate DESC');
      if (memoColSet.has('memotime')) orderCols.push('m.memotime DESC');
      if (memoColSet.has('memoline')) orderCols.push('m.memoline DESC');
      const orderBy = orderCols.length > 0 ? `ORDER BY ${orderCols.join(', ')}` : '';

      const [rows] = await pool.query(
        `SELECT ${memoSelect} FROM acrmemoh m
         WHERE m.memoidno = ? AND m.memomddt = ? AND m.memosrno = ?
         ${orderBy}`,
        [staffId, receiptDate, seqNo]
      );
      return NextResponse.json({ success: true, data: rows });
    }

    // 사고번호로 조회
    if (accidentNo) {
      const accColSet = await getTableCols(pool, 'acrotpth');
      const orderBy = memoColSet.has('memodate') ? 'ORDER BY m.memodate DESC' + (memoColSet.has('memotime') ? ', m.memotime DESC' : '') : '';

      const [rows] = await pool.query(
        `SELECT ${memoSelect} FROM acrmemoh m
         INNER JOIN acrotpth a ON m.memoidno = a.otptidno AND m.memomddt = a.otptmddt AND m.memosrno = a.otptsrno
         WHERE a.otptacnu = ?
         ${orderBy}`,
        [accidentNo]
      );
      return NextResponse.json({ success: true, data: rows });
    }

    // 최근 상담이력 (전체)
    const limit = parseInt(searchParams.get('limit') || '100');
    const accColSet = await getTableCols(pool, 'acrotpth');
    const accCols: [string, string][] = [
      ['otptacnu', 'accidentNo'], ['otptacdt', 'accidentDate'], ['otptstat', 'accidentStatus'],
    ];
    const accSelect = buildSelect('a', accCols, accColSet);
    const selectParts = [memoSelect, accSelect].filter(Boolean).join(', ');
    const joinClause = accSelect
      ? `LEFT JOIN acrotpth a ON m.memoidno = a.otptidno AND m.memomddt = a.otptmddt AND m.memosrno = a.otptsrno`
      : '';
    const orderBy = memoColSet.has('memodate') ? 'ORDER BY m.memodate DESC' + (memoColSet.has('memotime') ? ', m.memotime DESC' : '') : '';

    const [rows] = await pool.query(
      `SELECT ${selectParts} FROM acrmemoh m ${joinClause} ${orderBy} LIMIT ?`,
      [limit]
    );
    return NextResponse.json({ success: true, data: rows });

  } catch (error: any) {
    console.error('상담이력 조회 에러:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

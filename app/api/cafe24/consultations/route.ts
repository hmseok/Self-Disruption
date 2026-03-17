import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 상담이력 조회 (acrmemoh 테이블)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get('staffId') || '';
    const receiptDate = searchParams.get('receiptDate') || '';
    const seqNo = searchParams.get('seqNo') || '';
    const accidentNo = searchParams.get('accidentNo') || '';

    const pool = getCafe24Pool();

    // 특정 사고건의 상담이력 조회
    if (staffId && receiptDate && seqNo) {
      const [rows] = await pool.query(
        `SELECT
          m.memoidno as staffId,
          m.memomddt as receiptDate,
          m.memosrno as seqNo,
          m.memoline as lineNo,
          m.memodate as memoDate,
          m.memotime as memoTime,
          m.memotype as memoType,
          m.memotitl as memoTitle,
          m.memoctnt as memoContent,
          m.memognus as createdBy,
          m.memogndt as createdDate,
          m.memogntm as createdTime
        FROM acrmemoh m
        WHERE m.memoidno = ? AND m.memomddt = ? AND m.memosrno = ?
        ORDER BY m.memodate DESC, m.memotime DESC, m.memoline DESC`,
        [staffId, receiptDate, seqNo]
      );
      return NextResponse.json({ success: true, data: rows });
    }

    // 사고번호로 조회
    if (accidentNo) {
      const [rows] = await pool.query(
        `SELECT
          m.memoidno as staffId,
          m.memomddt as receiptDate,
          m.memosrno as seqNo,
          m.memoline as lineNo,
          m.memodate as memoDate,
          m.memotime as memoTime,
          m.memotype as memoType,
          m.memotitl as memoTitle,
          m.memoctnt as memoContent,
          m.memognus as createdBy,
          m.memogndt as createdDate,
          m.memogntm as createdTime
        FROM acrmemoh m
        INNER JOIN acrotpth a ON m.memoidno = a.otptidno
          AND m.memomddt = a.otptmddt
          AND m.memosrno = a.otptsrno
        WHERE a.otptacnu = ?
        ORDER BY m.memodate DESC, m.memotime DESC`,
        [accidentNo]
      );
      return NextResponse.json({ success: true, data: rows });
    }

    // 최근 상담이력 (전체)
    const limit = parseInt(searchParams.get('limit') || '100');
    const [rows] = await pool.query(
      `SELECT
        m.memoidno as staffId,
        m.memomddt as receiptDate,
        m.memosrno as seqNo,
        m.memoline as lineNo,
        m.memodate as memoDate,
        m.memotime as memoTime,
        m.memotype as memoType,
        m.memotitl as memoTitle,
        m.memoctnt as memoContent,
        m.memognus as createdBy,
        m.memogndt as createdDate,
        m.memogntm as createdTime,
        a.otptacnu as accidentNo,
        a.otptacdt as accidentDate,
        a.otptstat as accidentStatus
      FROM acrmemoh m
      LEFT JOIN acrotpth a ON m.memoidno = a.otptidno
        AND m.memomddt = a.otptmddt
        AND m.memosrno = a.otptsrno
      ORDER BY m.memodate DESC, m.memotime DESC
      LIMIT ?`,
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

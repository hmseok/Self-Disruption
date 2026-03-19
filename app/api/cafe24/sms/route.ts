import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 문자 발송내역 조회 API
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const carId = searchParams.get('carId') || '';
    const receiptDate = searchParams.get('receiptDate') || '';
    const limit = parseInt(searchParams.get('limit') || '50');

    const pool = getCafe24Pool();

    const conditions: string[] = [];
    const params: any[] = [];

    if (carId) { conditions.push('s.sendidno = ?'); params.push(carId); }
    if (receiptDate) { conditions.push('s.sendgndt = ?'); params.push(receiptDate); }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await pool.query(
      `SELECT s.sendmobl as phone, s.sendsbjt as subject, s.sendmesg as message,
              s.sendstat as status, s.sendrslt as result,
              s.sendgndt as sendDate, s.sendgntm as sendTime,
              s.sendgnus as sendBy, s.sendcode as smsCode,
              t.smsgdesc as smsTypeName
       FROM crmsendh s
       LEFT JOIN crmsmsgh t ON s.sendcode = t.smsgcode
       ${where}
       ORDER BY s.sendgndt DESC, s.sendgntm DESC
       LIMIT ?`,
      [...params, limit]
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('문자 발송내역 조회 에러:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

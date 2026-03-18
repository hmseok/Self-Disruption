import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';
import { CAR_COLS, CUST_COLS, buildSelectCols } from '../lib/columns';

// 거래처 차량조회 API — 차량 목록 + 거래처 목록 + 차량 히스토리
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const custCode = searchParams.get('custCode') || '';
    const carId = searchParams.get('carId') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;
    const history = searchParams.get('history') === 'true';

    const pool = getCafe24Pool();
    const [carResult, custResult] = await Promise.all([
      buildSelectCols(pool, 'pmccarsm', 'c', CAR_COLS),
      buildSelectCols(pool, 'pmccustm', 'cu', CUST_COLS),
    ]);

    if (!carResult.select) {
      return NextResponse.json({ success: true, data: [], customers: [] });
    }

    const selectParts = [carResult.select, custResult.select].filter(Boolean).join(', ');
    const custJoin = custResult.select ? 'LEFT JOIN pmccustm cu ON c.carscust = cu.custcode' : '';

    // ── 특정 차량 히스토리 조회 ──
    if (history && carId) {
      const [rows] = await pool.query(
        `SELECT ${selectParts} FROM pmccarsm c ${custJoin} WHERE c.carsidno = ? ORDER BY c.carsfrdt DESC`, [carId]
      );
      const [accidents] = await pool.query(
        `SELECT a.otptacnu as accidentNo, a.otptacdt as accidentDate, a.otptactm as accidentTime,
                a.otptstat as status, a.otptacbn as accidentType, a.otptacfe as faultRate,
                a.otptacad as accidentLocation, a.otptacmo as accidentMemo,
                a.otptgndt as createdDate, a.otptgntm as createdTime, a.otptgnus as createdBy,
                a.otptdsnm as driverName, a.otptmscs as category
         FROM acrotpth a WHERE a.otptidno = ? AND a.otptrgst = 'R'
         ORDER BY a.otptgndt DESC, a.otptgntm DESC LIMIT 50`, [carId]
      );
      return NextResponse.json({ success: true, data: rows, accidents });
    }

    // ── 거래처 목록 (차량 보유 거래처만) ──
    const [customers] = await pool.query(
      `SELECT cu.custcode as custCode, cu.custname as custName,
              COUNT(DISTINCT c.carsidno) as carCount
       FROM pmccustm cu LEFT JOIN pmccarsm c ON cu.custcode = c.carscust
       GROUP BY cu.custcode, cu.custname HAVING carCount > 0
       ORDER BY cu.custname`
    );

    // ── 차량 목록 (최신 히스토리 기준) ──
    const conditions: string[] = [];
    const params: any[] = [];
    if (custCode) { conditions.push('c.carscust = ?'); params.push(custCode); }
    if (status) { conditions.push('c.carsstat = ?'); params.push(status); }
    if (search) {
      const sc: string[] = [];
      if (carResult.colSet.has('carsnums')) sc.push('c.carsnums LIKE ?');
      if (carResult.colSet.has('carsodnm')) sc.push('c.carsodnm LIKE ?');
      if (carResult.colSet.has('carsuser')) sc.push('c.carsuser LIKE ?');
      if (custResult.colSet.has('custname')) sc.push('cu.custname LIKE ?');
      if (sc.length) { conditions.push(`(${sc.join(' OR ')})`); sc.forEach(() => params.push(`%${search}%`)); }
    }
    // 차량별 최신 레코드만
    conditions.push(`c.carsfrdt = (SELECT MAX(c2.carsfrdt) FROM pmccarsm c2 WHERE c2.carsidno = c.carsidno)`);
    const where = 'WHERE ' + conditions.join(' AND ');

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM pmccarsm c ${custJoin} ${where}`, params);
    const total = (countResult as any[])[0].total;

    const [rows] = await pool.query(
      `SELECT ${selectParts},
              (SELECT COUNT(*) FROM acrotpth a WHERE a.otptidno = c.carsidno AND a.otptrgst = 'R') as accidentCount,
              (SELECT COUNT(*) FROM pmccarsm c3 WHERE c3.carsidno = c.carsidno) as historyCount
       FROM pmccarsm c ${custJoin} ${where}
       ORDER BY c.carsstat ASC, c.carsnums ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({ success: true, data: rows, customers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    console.error('차량조회 에러:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

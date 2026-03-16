import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 차량 출고/반납 목록 조회 (pmccarsm)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    const fromDate = searchParams.get('from') || '';
    const toDate = searchParams.get('to') || '';
    const search = searchParams.get('search') || '';
    const custCode = searchParams.get('cust') || '';
    const status = searchParams.get('status') || '';

    const pool = getCafe24Pool();

    const conditions: string[] = [];
    const params: any[] = [];

    if (fromDate) {
      conditions.push('c.carsgndt >= ?');
      params.push(fromDate.replace(/-/g, ''));
    }
    if (toDate) {
      conditions.push('c.carsgndt <= ?');
      params.push(toDate.replace(/-/g, ''));
    }
    if (custCode) {
      conditions.push('c.carscust = ?');
      params.push(custCode);
    }
    if (status) {
      conditions.push('c.carsstat = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(c.carsnums LIKE ? OR c.carsodnm LIKE ? OR c.carsusnm LIKE ? OR c.carsushp LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // 총 건수
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM pmccarsm c ${whereClause}`,
      params
    );
    const total = (countResult as any[])[0].total;

    // 목록 조회
    const [rows] = await pool.query(
      `SELECT
        c.carsidno as staffId,
        c.carscust as custCode,
        cu.custname as custName,
        c.carsnums as carNo,
        c.carsodnm as carName,
        c.carsmodl as modelCode,
        c.carscode as carCode,
        c.carsfrdt as fromDate,
        c.carstodt as toDate,
        c.carsstat as status,
        c.carstype as type,
        c.carsstdt as statusDate,
        c.carsuser as userName,
        c.carskilo as mileage,
        c.carscosv as contractService,
        c.carscofr as contractFrom,
        c.carscoto as contractTo,
        c.carscono as contractNo,
        c.carscomp as contractCompany,
        c.carsjamt as settleAmt,
        c.carsuamt as unpaidAmt,
        c.carseamt as extraAmt,
        c.carsbocd as insuranceCode,
        c.carsbofr as insuranceFrom,
        c.carsboto as insuranceTo,
        c.carsbort as insuranceRate,
        c.carsbodi as insuranceDi,
        c.carsbodm as insuranceDm,
        c.carsbojs as insuranceJs,
        c.carsbogn as insuranceGn,
        c.carsusnm as userRealName,
        c.carsushp as userPhone,
        c.carsustl as userTel,
        c.carsusad as userAddress,
        c.carstayn as taxYn,
        c.carsotyn as otherYn,
        c.carsdcyn as rentalYn,
        c.carsgsyn as settleYn,
        c.carsgstp as settleType,
        c.carsgnus as createdBy,
        c.carsgndt as createdDate,
        c.carsgntm as createdTime,
        c.carsupus as updatedBy,
        c.carsupdt as updatedDate,
        c.carsuptm as updatedTime
      FROM pmccarsm c
      LEFT JOIN pmccustm cu ON c.carscust = cu.custcode
      ${whereClause}
      ORDER BY c.carsgndt DESC, c.carsgntm DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    console.error('카페24 차량 조회 에러:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

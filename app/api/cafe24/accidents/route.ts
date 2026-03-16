import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 사고접수 목록 조회
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    const fromDate = searchParams.get('from') || '';
    const toDate = searchParams.get('to') || '';
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    const pool = getCafe24Pool();

    // 동적 WHERE 조건 (otptrgst='R' : 렌터카 사고접수만)
    const conditions: string[] = ["a.otptrgst = 'R'"];
    const params: any[] = [];

    if (fromDate) {
      conditions.push('a.otptgndt >= ?');
      params.push(fromDate.replace(/-/g, ''));
    }
    if (toDate) {
      conditions.push('a.otptgndt <= ?');
      params.push(toDate.replace(/-/g, ''));
    }
    if (status) {
      conditions.push('a.otptstat = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(a.otptacnu LIKE ? OR a.otptdsnm LIKE ? OR a.otptcanm LIKE ? OR a.otptacad LIKE ?)');
      const searchLike = `%${search}%`;
      params.push(searchLike, searchLike, searchLike, searchLike);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // 총 건수
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM acrotpth a ${whereClause}`,
      params
    );
    const total = (countResult as any[])[0].total;

    // 목록 조회 (사고접수 + 대차정보 LEFT JOIN)
    const [rows] = await pool.query(
      `SELECT
        a.otptacnu as accidentNo,
        a.otptidno as staffId,
        a.otptmddt as receiptDate,
        a.otptsrno as seqNo,
        a.otptacdt as accidentDate,
        a.otptactm as accidentTime,
        a.otptacad as accidentLocation,
        a.otptacmo as accidentMemo,
        a.otptacfe as faultRate,
        a.otptdsnm as repairShopName,
        a.otptdshp as repairShopPhone,
        a.otptdsmo as deliveryMemo,
        a.otptcanm as counterpartName,
        a.otptcahp as counterpartPhone,
        a.otptcavp as counterpartVehicle,
        a.otptcare as counterpartInsurance,
        a.otpttwgn as towingYn,
        a.otpttwnm as towingCompany,
        a.otpttwhp as towingPhone,
        a.otpttonm as handoverName,
        a.otpttohp as handoverPhone,
        a.otptstat as status,
        a.otptjsyn as settlementYn,
        a.otptdcyn as rentalYn,
        a.otptrtyn as returnYn,
        a.otptrgst as regStatus,
        a.otptmscs as category,
        a.otptrgtp as regType,
        a.otptcomp as completeYn,
        a.otptdedu as deductYn,
        a.otptgnus as createdBy,
        a.otptgndt as createdDate,
        a.otptgntm as createdTime,
        a.otptupus as updatedBy,
        a.otptupdt as updatedDate,
        a.otptuptm as updatedTime,
        r.rentnums as rentalCarNo,
        r.rentmodl as rentalCarModel,
        r.rentfrdt as rentalFromDate,
        r.rentfrtm as rentalFromTime,
        r.renttodt as rentalToDate,
        r.renttotm as rentalToTime,
        r.rentstat as rentalStatus,
        r.rentfacd as rentalFactory,
        r.rentmemo as rentalMemo
      FROM acrotpth a
      LEFT JOIN acrrentm r ON a.otptidno = r.rentidno
        AND a.otptmddt = r.rentmddt
        AND a.otptsrno = r.rentsrno
      ${whereClause}
      ORDER BY a.otptgndt DESC, a.otptgntm DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('카페24 사고접수 조회 에러:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

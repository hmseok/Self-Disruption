import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 대차(렌탈) 목록 조회 (acrrentm + acrotpth JOIN)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const fromDate = searchParams.get('from') || '';
    const toDate = searchParams.get('to') || '';
    const type = searchParams.get('type') || ''; // 대차유형

    const pool = getCafe24Pool();

    const conditions: string[] = [];
    const params: any[] = [];

    if (status) {
      conditions.push('r.rentstat = ?');
      params.push(status);
    }
    if (type) {
      conditions.push('r.renttype = ?');
      params.push(type);
    }
    if (fromDate) {
      conditions.push('r.rentfrdt >= ?');
      params.push(fromDate.replace(/-/g, ''));
    }
    if (toDate) {
      conditions.push('r.renttodt <= ?');
      params.push(toDate.replace(/-/g, ''));
    }
    if (search) {
      conditions.push('(r.rentnums LIKE ? OR r.rentmodl LIKE ? OR a.otptacnu LIKE ? OR a.otptcanm LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 총 건수
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM acrrentm r
       LEFT JOIN acrotpth a ON r.rentidno = a.otptidno AND r.rentmddt = a.otptmddt AND r.rentsrno = a.otptsrno
       ${whereClause}`,
      params
    );
    const total = (countResult as any[])[0].total;

    // 사고 테이블 컬럼 동적 확인 (존재하지 않는 컬럼 방지)
    let extraAccidentCols = '';
    try {
      const [cols] = await pool.query(`SHOW COLUMNS FROM acrotpth`);
      const colSet = new Set((cols as any[]).map((c: any) => c.Field?.toLowerCase()));
      const optionalCols: [string, string][] = [
        ['otptvhno', 'vehicleNo'], ['otptvhnm', 'vehicleName'],
        ['otptbocd', 'insuranceCode'], ['otptbonm', 'insuranceName'],
        ['otptexam', 'examType'], ['otptmemo', 'accidentNote'],
        ['otptdmgp', 'damageArea'], ['otptdmgd', 'damageDetail'],
        ['otptrcst', 'repairCost'], ['otptinst', 'insuranceCost'],
        ['otptdshp', 'repairShopPhone'], ['otptdsmo', 'deliveryMemo'],
        ['otptcavp', 'counterpartVehicle'],
        ['otpttwnm', 'towingCompany'], ['otpttwhp', 'towingPhone'],
        ['otpttonm', 'handoverName'], ['otpttohp', 'handoverPhone'],
        ['otptcomp', 'completeYn'], ['otptdedu', 'deductYn'],
        ['otptjsyn', 'settlementYn'], ['otptrtyn', 'returnYn'],
        ['otptrgtp', 'regType'],
      ];
      const found = optionalCols.filter(([col]) => colSet.has(col.toLowerCase()));
      if (found.length > 0) {
        extraAccidentCols = ', ' + found.map(([col, alias]) => `a.${col} as ${alias}`).join(', ');
      }
    } catch (e) {
      console.warn('컬럼 확인 실패, 기본 컬럼만 사용:', e);
    }

    // 대차 목록 + 사고정보 JOIN
    const [rows] = await pool.query(
      `SELECT
        r.rentidno as staffId,
        r.rentmddt as receiptDate,
        r.rentsrno as seqNo,
        r.rentnums as rentalCarNo,
        r.rentmodl as rentalCarModel,
        r.rentfrdt as rentalFromDate,
        r.rentfrtm as rentalFromTime,
        r.renttodt as rentalToDate,
        r.renttotm as rentalToTime,
        r.rentstat as rentalStatus,
        r.renttype as rentalType,
        r.rentfacd as rentalFactory,
        r.rentmemo as rentalMemo,
        r.rentdlvr as deliveryMethod,
        r.rentdldt as deliveryDate,
        r.rentdltm as deliveryTime,
        r.rentrtndt as returnDate,
        r.rentrtntm as returnTime,
        r.rentcost as dailyCost,
        r.renttotal as totalCost,
        r.rentdays as rentalDays,
        r.rentgnus as createdBy,
        r.rentgndt as createdDate,
        r.rentgntm as createdTime,
        a.otptacnu as accidentNo,
        a.otptacdt as accidentDate,
        a.otptactm as accidentTime,
        a.otptacad as accidentLocation,
        a.otptacmo as accidentMemo,
        a.otptacfe as faultRate,
        a.otptstat as accidentStatus,
        a.otptdsnm as repairShopName,
        a.otptcanm as counterpartName,
        a.otptcahp as counterpartPhone,
        a.otptcare as counterpartInsurance,
        a.otpttwgn as towingYn,
        a.otptmscs as category,
        a.otptdcyn as rentalYn
        ${extraAccidentCols}
      FROM acrrentm r
      LEFT JOIN acrotpth a ON r.rentidno = a.otptidno
        AND r.rentmddt = a.otptmddt
        AND r.rentsrno = a.otptsrno
      ${whereClause}
      ORDER BY r.rentfrdt DESC, r.rentfrtm DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    console.error('대차 목록 조회 에러:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

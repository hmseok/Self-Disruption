import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 테이블 컬럼 동적 확인 후 존재하는 컬럼만 SELECT 절 생성
async function buildSelectCols(
  pool: any,
  table: string,
  alias: string,
  colMap: [string, string][],
): Promise<{ select: string; colSet: Set<string> }> {
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM ${table}`);
    const colSet = new Set((cols as any[]).map((c: any) => (c.Field || '').toLowerCase()));
    const found = colMap.filter(([col]) => colSet.has(col.toLowerCase()));
    return {
      select: found.map(([col, as]) => `${alias}.${col} as ${as}`).join(', '),
      colSet,
    };
  } catch {
    return { select: '', colSet: new Set() };
  }
}

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
    const type = searchParams.get('type') || '';

    const pool = getCafe24Pool();

    // ── acrrentm (대차) 테이블 컬럼 ──
    const rentalCols: [string, string][] = [
      ['rentidno', 'staffId'], ['rentmddt', 'receiptDate'], ['rentsrno', 'seqNo'],
      ['rentnums', 'rentalCarNo'], ['rentmodl', 'rentalCarModel'],
      ['rentfrdt', 'rentalFromDate'], ['rentfrtm', 'rentalFromTime'],
      ['renttodt', 'rentalToDate'], ['renttotm', 'rentalToTime'],
      ['rentstat', 'rentalStatus'], ['renttype', 'rentalType'],
      ['rentfacd', 'rentalFactory'], ['rentmemo', 'rentalMemo'],
      ['rentdlvr', 'deliveryMethod'], ['rentdldt', 'deliveryDate'], ['rentdltm', 'deliveryTime'],
      ['rentrtndt', 'returnDate'], ['rentrtntm', 'returnTime'],
      ['rentcost', 'dailyCost'], ['renttotal', 'totalCost'], ['rentdays', 'rentalDays'],
      ['rentgnus', 'createdBy'], ['rentgndt', 'createdDate'], ['rentgntm', 'createdTime'],
    ];

    // ── acrotpth (사고) 테이블 컬럼 ──
    const accidentCols: [string, string][] = [
      ['otptacnu', 'accidentNo'], ['otptacdt', 'accidentDate'], ['otptactm', 'accidentTime'],
      ['otptacad', 'accidentLocation'], ['otptacmo', 'accidentMemo'],
      ['otptacfe', 'faultRate'], ['otptstat', 'accidentStatus'],
      ['otptdsnm', 'repairShopName'], ['otptcanm', 'counterpartName'],
      ['otptcahp', 'counterpartPhone'], ['otptcare', 'counterpartInsurance'],
      ['otpttwgn', 'towingYn'], ['otptmscs', 'category'], ['otptdcyn', 'rentalYn'],
      // 확장
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

    const [rentResult, accResult] = await Promise.all([
      buildSelectCols(pool, 'acrrentm', 'r', rentalCols),
      buildSelectCols(pool, 'acrotpth', 'a', accidentCols),
    ]);

    if (!rentResult.select) {
      return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }

    // 동적 WHERE (존재하는 컬럼만 필터링에 사용)
    const conditions: string[] = [];
    const params: any[] = [];

    if (status && rentResult.colSet.has('rentstat')) {
      conditions.push('r.rentstat = ?'); params.push(status);
    }
    if (type && rentResult.colSet.has('renttype')) {
      conditions.push('r.renttype = ?'); params.push(type);
    }
    if (fromDate && rentResult.colSet.has('rentfrdt')) {
      conditions.push('r.rentfrdt >= ?'); params.push(fromDate.replace(/-/g, ''));
    }
    if (toDate && rentResult.colSet.has('renttodt')) {
      conditions.push('r.renttodt <= ?'); params.push(toDate.replace(/-/g, ''));
    }
    if (search) {
      const searchConds: string[] = [];
      if (rentResult.colSet.has('rentnums')) searchConds.push('r.rentnums LIKE ?');
      if (rentResult.colSet.has('rentmodl')) searchConds.push('r.rentmodl LIKE ?');
      if (accResult.colSet.has('otptacnu')) searchConds.push('a.otptacnu LIKE ?');
      if (accResult.colSet.has('otptcanm')) searchConds.push('a.otptcanm LIKE ?');
      if (searchConds.length > 0) {
        conditions.push(`(${searchConds.join(' OR ')})`);
        const s = `%${search}%`;
        searchConds.forEach(() => params.push(s));
      }
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 총 건수
    const joinClause = accResult.select
      ? `LEFT JOIN acrotpth a ON r.rentidno = a.otptidno AND r.rentmddt = a.otptmddt AND r.rentsrno = a.otptsrno`
      : '';

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM acrrentm r ${joinClause} ${whereClause}`,
      params
    );
    const total = (countResult as any[])[0].total;

    // SELECT 조합
    const selectParts = [rentResult.select, accResult.select].filter(Boolean).join(', ');

    // ORDER BY (존재하는 컬럼 기반)
    const orderBy = rentResult.colSet.has('rentfrdt')
      ? 'ORDER BY r.rentfrdt DESC' + (rentResult.colSet.has('rentfrtm') ? ', r.rentfrtm DESC' : '')
      : 'ORDER BY r.rentidno DESC';

    const [rows] = await pool.query(
      `SELECT ${selectParts}
       FROM acrrentm r
       ${joinClause}
       ${whereClause}
       ${orderBy}
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

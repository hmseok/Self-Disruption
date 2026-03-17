import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 테이블 컬럼 동적 확인 후 존재하는 컬럼만 SELECT 절 생성
async function buildSelectCols(
  pool: any,
  table: string,
  alias: string,
  colMap: [string, string][],
): Promise<string> {
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM ${table}`);
    const colSet = new Set((cols as any[]).map((c: any) => (c.Field || '').toLowerCase()));
    const found = colMap.filter(([col]) => colSet.has(col.toLowerCase()));
    return found.map(([col, as]) => `${alias}.${col} as ${as}`).join(', ');
  } catch {
    return '';
  }
}

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

    // ── acrotpth (사고) 테이블 컬럼 동적 감지 ──
    const accidentCols: [string, string][] = [
      // 기본 컬럼
      ['otptacnu', 'accidentNo'], ['otptidno', 'staffId'],
      ['otptmddt', 'receiptDate'], ['otptsrno', 'seqNo'],
      ['otptacdt', 'accidentDate'], ['otptactm', 'accidentTime'],
      ['otptacad', 'accidentLocation'], ['otptacmo', 'accidentMemo'],
      ['otptacfe', 'faultRate'], ['otptdsnm', 'repairShopName'],
      ['otptcanm', 'counterpartName'], ['otptcahp', 'counterpartPhone'],
      ['otptcare', 'counterpartInsurance'], ['otpttwgn', 'towingYn'],
      ['otptstat', 'status'], ['otptdcyn', 'rentalYn'],
      ['otptrgst', 'regStatus'], ['otptmscs', 'category'],
      ['otptgnus', 'createdBy'], ['otptgndt', 'createdDate'], ['otptgntm', 'createdTime'],
      ['otptupus', 'updatedBy'], ['otptupdt', 'updatedDate'], ['otptuptm', 'updatedTime'],
      // 확장 컬럼 (없을 수 있음)
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

    // ── acrrentm (대차) 테이블 컬럼 동적 감지 ──
    const rentalCols: [string, string][] = [
      ['rentnums', 'rentalCarNo'], ['rentmodl', 'rentalCarModel'],
      ['rentfrdt', 'rentalFromDate'], ['rentfrtm', 'rentalFromTime'],
      ['renttodt', 'rentalToDate'], ['renttotm', 'rentalToTime'],
      ['rentstat', 'rentalStatus'], ['renttype', 'rentalType'],
      ['rentfacd', 'rentalFactory'], ['rentmemo', 'rentalMemo'],
      ['rentcost', 'rentalDailyCost'], ['renttotal', 'rentalTotalCost'],
      ['rentdays', 'rentalDays'],
    ];

    const [accSelect, rentSelect] = await Promise.all([
      buildSelectCols(pool, 'acrotpth', 'a', accidentCols),
      buildSelectCols(pool, 'acrrentm', 'r', rentalCols),
    ]);

    if (!accSelect) {
      return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }

    // 동적 WHERE
    const conditions: string[] = [];
    const params: any[] = [];

    if (fromDate) { conditions.push('a.otptgndt >= ?'); params.push(fromDate.replace(/-/g, '')); }
    if (toDate)   { conditions.push('a.otptgndt <= ?'); params.push(toDate.replace(/-/g, '')); }
    if (status)   { conditions.push('a.otptstat = ?'); params.push(status); }
    if (search) {
      conditions.push('(a.otptacnu LIKE ? OR a.otptdsnm LIKE ? OR a.otptcanm LIKE ? OR a.otptacad LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 총 건수
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM acrotpth a ${whereClause}`,
      params
    );
    const total = (countResult as any[])[0].total;

    // 조합된 SELECT
    const selectParts = [accSelect, rentSelect].filter(Boolean).join(', ');

    // 대차 테이블 JOIN 가능 여부 (rentSelect가 있으면 JOIN)
    const joinClause = rentSelect
      ? `LEFT JOIN acrrentm r ON a.otptidno = r.rentidno AND a.otptmddt = r.rentmddt AND a.otptsrno = r.rentsrno`
      : '';

    const [rows] = await pool.query(
      `SELECT ${selectParts}
       FROM acrotpth a
       ${joinClause}
       ${whereClause}
       ORDER BY a.otptgndt DESC, a.otptgntm DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    console.error('카페24 사고접수 조회 에러:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

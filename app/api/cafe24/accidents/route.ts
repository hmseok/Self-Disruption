import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';
import { ACCIDENT_COLS, RENTAL_COLS, CAR_COLS, CUST_COLS, buildSelectCols } from '../lib/columns';

// 사고접수 목록 조회 (+ 차량/고객 정보 JOIN)
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

    // 동적 컬럼 감지 (4개 테이블)
    const [accResult, rentResult, carResult, custResult] = await Promise.all([
      buildSelectCols(pool, 'acrotpth', 'a', ACCIDENT_COLS),
      buildSelectCols(pool, 'acrrentm', 'r', RENTAL_COLS),
      buildSelectCols(pool, 'pmccarsm', 'c', CAR_COLS),
      buildSelectCols(pool, 'pmccustm', 'cu', CUST_COLS),
    ]);

    if (!accResult.select) {
      return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }

    // 동적 WHERE — ★ otptrgst='R' 필수 (소프트 삭제 필터, C=취소 제외)
    const conditions: string[] = ["a.otptrgst = 'R'"];
    const params: any[] = [];

    if (fromDate && accResult.colSet.has('otptgndt')) {
      conditions.push('a.otptgndt >= ?');
      params.push(fromDate.replace(/-/g, ''));
    }
    if (toDate && accResult.colSet.has('otptgndt')) {
      conditions.push('a.otptgndt <= ?');
      params.push(toDate.replace(/-/g, ''));
    }
    if (status && accResult.colSet.has('otptstat')) {
      conditions.push('a.otptstat = ?');
      params.push(status);
    }
    if (search) {
      const searchConds: string[] = [];
      if (accResult.colSet.has('otptacnu')) searchConds.push('a.otptacnu LIKE ?');
      if (accResult.colSet.has('otptdsnm')) searchConds.push('a.otptdsnm LIKE ?');
      if (accResult.colSet.has('otptcanm')) searchConds.push('a.otptcanm LIKE ?');
      if (accResult.colSet.has('otptacad')) searchConds.push('a.otptacad LIKE ?');
      // 차량번호 검색 추가
      if (carResult.colSet.has('carsnums')) searchConds.push('c.carsnums LIKE ?');
      // 고객명 검색 추가
      if (custResult.colSet.has('custname')) searchConds.push('cu.custname LIKE ?');
      if (searchConds.length > 0) {
        conditions.push(`(${searchConds.join(' OR ')})`);
        const s = `%${search}%`;
        searchConds.forEach(() => params.push(s));
      }
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 총 건수 (JOIN 포함해야 검색이 정확)
    const joinForCount = [
      carResult.select ? `LEFT JOIN pmccarsm c ON a.otptidno = c.carsidno AND c.carsfrdt = (SELECT MAX(c2.carsfrdt) FROM pmccarsm c2 WHERE c2.carsidno = a.otptidno AND c2.carsfrdt <= a.otptmddt)` : '',
      custResult.select && carResult.select ? `LEFT JOIN pmccustm cu ON c.carscust = cu.custcode` : '',
    ].filter(Boolean).join(' ');

    // 간단 JOIN (차량번호 검색 없으면 count는 단순하게)
    const hasCarSearch = search && (carResult.colSet.has('carsnums') || custResult.colSet.has('custname'));
    const countJoin = hasCarSearch ? joinForCount : '';

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM acrotpth a ${countJoin} ${whereClause}`,
      params
    );
    const total = (countResult as any[])[0].total;

    // 공장배정 (ajaoderh + pmcfactm) — 직접 SQL
    const factorySelect = `, od.oderfact as factoryCode, od.oderstat as factoryStatus,
      od.oderacdt as factoryDate, od.oderactm as factoryTime, od.oderuser as factoryUser,
      od.odergnus as factoryCreatedBy, fm.factname as factoryName, fm.facthpno as factoryPhone,
      fm.facttype as factoryType`;

    // 문자 발송 건수 (crmsendh)
    const smsCountSelect = `,
      (SELECT COUNT(*) FROM crmsendh s WHERE s.sendidno = a.otptidno AND s.sendgndt = a.otptmddt) as smsCount`;

    // SELECT 조합
    const selectParts = [accResult.select, rentResult.select, carResult.select, custResult.select].filter(Boolean).join(', ') + factorySelect + smsCountSelect;

    // JOIN 조건
    // ★ 핵심: acrotpth.otptidno = pmccarsm.carsidno (차량ID)
    //         pmccarsm.carscust = pmccustm.custcode (고객코드)
    // pmccarsm에 동일 carsidno 여러 행 가능 → 가장 최근(MAX carsfrdt) 레코드 사용
    const joins = [
      rentResult.select
        ? `LEFT JOIN acrrentm r ON a.otptidno = r.rentidno AND a.otptmddt = r.rentmddt AND a.otptsrno = r.rentsrno`
        : '',
      carResult.select
        ? `LEFT JOIN pmccarsm c ON a.otptidno = c.carsidno
           AND c.carsfrdt = (SELECT MAX(c2.carsfrdt) FROM pmccarsm c2 WHERE c2.carsidno = a.otptidno AND c2.carsfrdt <= a.otptmddt)`
        : '',
      custResult.select && carResult.select
        ? `LEFT JOIN pmccustm cu ON c.carscust = cu.custcode`
        : '',
      // 공장배정 (ajaoderh + pmcfactm)
      `LEFT JOIN ajaoderh od ON a.otptidno = od.oderidno AND a.otptmddt = od.odermddt AND a.otptsrno = od.odersrno AND od.oderstat <> 'X'`,
      `LEFT JOIN pmcfactm fm ON od.oderfact = fm.factcode`,
    ].filter(Boolean).join('\n       ');

    const [rows] = await pool.query(
      `SELECT ${selectParts}
       FROM acrotpth a
       ${joins}
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

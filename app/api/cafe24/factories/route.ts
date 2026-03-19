import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 공장/협력업체 조회 API
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const factCode = searchParams.get('factCode') || '';
    const factType = searchParams.get('factType') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;
    const detail = searchParams.get('detail') === 'true';

    const pool = getCafe24Pool();

    // ── 특정 공장 상세 + 작업이력 ──
    if (detail && factCode) {
      const [factory] = await pool.query(
        `SELECT factcode, factname, facttype, facthpno, facttelo, factfaxo,
                factaddr, factregi, factusnm, factbknm, factbkno, factbkus,
                factstat, factuser, facttayn, factotyn, factdcyn, factgsyn,
                factgndt, factgntm, factgnus
         FROM pmcfactm WHERE factcode = ?`, [factCode]
      );
      const [orders] = await pool.query(
        `SELECT od.oderidno as carId, od.odermddt as receiptDate, od.odersrno as seqNo,
                od.oderstat as orderStatus, od.oderacdt as orderDate, od.oderactm as orderTime,
                od.oderuser as orderUser, od.odergnus as orderCreatedBy,
                a.otptacnu as accidentNo, a.otptacdt as accidentDate, a.otptacbn as accidentType,
                a.otptacfe as faultRate, a.otptdsnm as driverName,
                c.carsnums as carPlateNo, c.carsodnm as carModelName
         FROM ajaoderh od
         LEFT JOIN acrotpth a ON od.oderidno = a.otptidno AND od.odermddt = a.otptmddt AND od.odersrno = a.otptsrno AND a.otptrgst = 'R'
         LEFT JOIN pmccarsm c ON a.otptidno = c.carsidno
           AND c.carsfrdt = (SELECT MAX(c2.carsfrdt) FROM pmccarsm c2 WHERE c2.carsidno = a.otptidno AND c2.carsfrdt <= a.otptmddt)
         WHERE od.oderfact = ? AND od.oderstat <> 'X'
         ORDER BY od.oderacdt DESC, od.oderactm DESC LIMIT 50`, [factCode]
      );
      return NextResponse.json({ success: true, data: (factory as any[])[0] || null, orders });
    }

    // ── 공장 목록 ──
    const conditions: string[] = [];
    const params: any[] = [];
    if (factType) { conditions.push('f.facttype = ?'); params.push(factType); }
    if (search) {
      conditions.push('(f.factname LIKE ? OR f.factcode LIKE ? OR f.facthpno LIKE ? OR f.factaddr LIKE ?)');
      const s = `%${search}%`; params.push(s, s, s, s);
    }
    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM pmcfactm f ${where}`, params);
    const total = (countResult as any[])[0].total;

    const [rows] = await pool.query(
      `SELECT f.factcode, f.factname, f.facttype, f.facthpno, f.facttelo,
              f.factaddr, f.factstat, f.factusnm, f.factregi,
              (SELECT COUNT(*) FROM ajaoderh od WHERE od.oderfact = f.factcode AND od.oderstat <> 'X') as orderCount
       FROM pmcfactm f ${where}
       ORDER BY f.factname ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({ success: true, data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    console.error('공장조회 에러:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

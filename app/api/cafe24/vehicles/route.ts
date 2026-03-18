import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 직접 SQL — buildSelectCols 우회 (동적 컬럼 감지 실패 방지)
const CAR_SELECT = `
  c.carsidno as carIdno, c.carscust as carCustCode, c.carsnums as carPlateNo,
  c.carsodnm as carModelName, c.carsstat as carStatus, c.carstype as carType,
  c.carsuser as carOwner, c.carscosv as carServiceType,
  c.carscofr as carContractFrom, c.carscoto as carContractTo,
  c.carsfrdt as carFromDate, c.carstodt as carToDate,
  c.carscode as carVin, c.carscono as carContractNo,
  c.carscomp as carContractCompany, c.carscotm as carContractMonths,
  c.carscokm as carContractKm, c.carskilo as carMileage,
  c.carsstdt as carRegDate, c.carsmodl as carModelCode,
  c.carsbocd as carInsCode, c.carsbofr as carInsFrom, c.carsboto as carInsTo,
  c.carsbodi as carInsDi, c.carsbodm as carInsDm, c.carsbojs as carInsJs,
  c.carsbogn as carInsGn, c.carsbomn as carDeductMin, c.carsbomx as carDeductMax,
  c.carsbofc as carInsFC, c.carsbocl as carInsClass, c.carsboag as carAgeLimit,
  c.carsboet as carInsEtc, c.carsboso as carEmergency,
  c.carsusnm as carContactName, c.carsushp as carContactPhone,
  c.carsustl as carContactTel, c.carsusad as carAddress, c.carsadgp as carZipCode,
  c.carstayn as chkInspection, c.carsotyn as chkAccident,
  c.carsdcyn as chkRental, c.carsgsyn as chkLegal,
  c.carsjamt as amtMaintenance, c.carsuamt as amtAccident, c.carseamt as amtExam
`.trim();
const CUST_SELECT = `cu.custcode as custCode, cu.custname as custName, cu.custhpno as custPhone, cu.custaddr as custAddr`;
const CUST_JOIN = 'LEFT JOIN pmccustm cu ON c.carscust = cu.custcode';

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

    // ── 특정 차량 히스토리 ──
    if (history && carId) {
      const [rows] = await pool.query(
        `SELECT ${CAR_SELECT}, ${CUST_SELECT} FROM pmccarsm c ${CUST_JOIN} WHERE c.carsidno = ? ORDER BY c.carsfrdt DESC`, [carId]
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

    // ── 거래처 목록 ──
    const [customers] = await pool.query(
      `SELECT cu.custcode as custCode, cu.custname as custName,
              COUNT(DISTINCT c.carsidno) as carCount
       FROM pmccustm cu LEFT JOIN pmccarsm c ON cu.custcode = c.carscust
       GROUP BY cu.custcode, cu.custname HAVING carCount > 0
       ORDER BY cu.custname`
    );

    // ── WHERE 조건 ──
    const conditions: string[] = [];
    const params: any[] = [];
    if (custCode) { conditions.push('c.carscust = ?'); params.push(custCode); }
    if (status) { conditions.push('c.carsstat = ?'); params.push(status); }
    if (search) {
      conditions.push('(c.carsnums LIKE ? OR c.carsodnm LIKE ? OR c.carsuser LIKE ? OR cu.custname LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    conditions.push(`c.carsfrdt = (SELECT MAX(c2.carsfrdt) FROM pmccarsm c2 WHERE c2.carsidno = c.carsidno)`);
    const where = 'WHERE ' + conditions.join(' AND ');

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM pmccarsm c ${CUST_JOIN} ${where}`, params);
    const total = (countResult as any[])[0].total;

    const [rows] = await pool.query(
      `SELECT ${CAR_SELECT}, ${CUST_SELECT},
              (SELECT COUNT(*) FROM acrotpth a WHERE a.otptidno = c.carsidno AND a.otptrgst = 'R') as accidentCount,
              (SELECT COUNT(*) FROM pmccarsm c3 WHERE c3.carsidno = c.carsidno) as historyCount
       FROM pmccarsm c ${CUST_JOIN} ${where}
       ORDER BY c.carsstat ASC, c.carsnums ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({ success: true, data: rows, customers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    console.error('차량조회 에러:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

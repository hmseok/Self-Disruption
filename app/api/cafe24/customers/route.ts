import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 고객 마스터 조회 (pmccustm)
export async function GET(req: NextRequest) {
  try {
    const pool = getCafe24Pool();

    const [rows] = await pool.query(
      `SELECT
        custcode as code,
        custname as name,
        custidcd as bizNo,
        custshot as shortName,
        custhpno as phone,
        custtelo as tel,
        custfaxo as fax,
        custemai as email,
        custlicn as licenseNo,
        custjong as bizType,
        custupta as bizCategory,
        custusnm as contactName,
        custaddr as address,
        custflag as flag,
        custusn1 as mgr1Name,
        custust1 as mgr1Tel,
        custusm1 as mgr1Memo,
        custusn2 as mgr2Name,
        custust2 as mgr2Tel,
        custusm2 as mgr2Memo,
        custusn3 as mgr3Name,
        custust3 as mgr3Tel,
        custusm3 as mgr3Memo
      FROM pmccustm
      ORDER BY custcode`
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('카페24 고객 조회 에러:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

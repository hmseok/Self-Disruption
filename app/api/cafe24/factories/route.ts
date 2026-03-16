import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 협력업체/공장 마스터 조회 (pmcfactm)
export async function GET(req: NextRequest) {
  try {
    const pool = getCafe24Pool();

    const [rows] = await pool.query(
      `SELECT
        factcode as code,
        factname as name,
        facttype as type,
        factregi as bizNo,
        factaddr as address,
        facttelo as tel,
        facthpno as phone,
        factusnm as contactName,
        factbknm as bankName,
        factbkno as bankAccount,
        factbkus as bankHolder,
        facttayn as taxYn,
        factotyn as otherYn,
        factdcyn as rentalYn,
        factgsyn as settleYn,
        factendt as endDate,
        factjdyn as jandiYn,
        blackservice_manager_YN as blacklistYn,
        factsort as sortOrder
      FROM pmcfactm
      ORDER BY factsort, factcode`
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('카페24 협력업체 조회 에러:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

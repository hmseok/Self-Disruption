import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCafe24Pool as getPool } from '../lib/db';

// ============================================================
// 카페24 사고접수 → FMI 사고 테이블 동기화 (Prisma)
// POST: 수동 동기화 트리거
// GET: 최근 동기화 상태 조회
// ============================================================

interface Cafe24Accident {
  staffId: string;
  receiptDate: string;
  seqNo: string;
  otptrgst: string;
  accidentDate?: string;
  accidentTime?: string;
  accidentLocation?: string;
  accidentMemo?: string;
  customerName?: string;
  customerPhone?: string;
  carNumber?: string;
  carType?: string;
  counterpartName?: string;
  counterpartPhone?: string;
  counterpartCarNo?: string;
  counterpartInsurance?: string;
  counterpartClaimNo?: string;
  insuranceCompany?: string;
  insuranceClaimNo?: string;
  adjusterName?: string;
  adjusterPhone?: string;
  faultRate?: number;
  repairShopName?: string;
  estimatedRepairDays?: number;
  estimatedRepairCost?: number;
  rentalStatus?: string;
  rentalNeeded?: string;
  [key: string]: any;
}

function transformAccident(row: Cafe24Accident) {
  const cafe24Id = `${row.staffId}-${row.receiptDate}-${row.seqNo}`;

  let accidentDate: Date | null = null;
  if (row.accidentDate) {
    const dateStr = row.accidentDate.replace(/\//g, '-');
    const timeStr = row.accidentTime || '00:00';
    try { accidentDate = new Date(`${dateStr}T${timeStr}`); } catch {}
  }

  let receiptDate: Date | null = null;
  if (row.receiptDate) {
    try {
      receiptDate = new Date(
        `${row.receiptDate.substring(0, 4)}-${row.receiptDate.substring(4, 6)}-${row.receiptDate.substring(6, 8)}`
      );
    } catch {}
  }

  let faultType: string | null = null;
  const faultRate = row.faultRate || 0;
  if (faultRate === 0) faultType = 'counterpart';
  else if (faultRate === 100) faultType = 'own';
  else if (faultRate > 0) faultType = 'shared';

  const rentalNeeded = row.rentalNeeded === 'Y' || row.rentalStatus === 'Y';
  const { sido, sigungu } = parseRegion(row.accidentLocation || '');

  return {
    cafe24_id: cafe24Id,
    receipt_no: `${row.staffId}-${row.seqNo}`,
    receipt_date: receiptDate,
    accident_date: accidentDate,
    accident_location: row.accidentLocation,
    accident_description: row.accidentMemo,
    accident_region_sido: sido,
    accident_region_sigungu: sigungu,
    customer_name: row.customerName,
    customer_phone: row.customerPhone,
    customer_car_number: row.carNumber,
    customer_car_type: row.carType,
    counterpart_name: row.counterpartName,
    counterpart_phone: row.counterpartPhone,
    counterpart_car_number: row.counterpartCarNo,
    counterpart_insurance: row.counterpartInsurance,
    counterpart_claim_no: row.counterpartClaimNo,
    insurance_company: row.insuranceCompany,
    insurance_claim_no: row.insuranceClaimNo,
    adjuster_name: row.adjusterName,
    adjuster_phone: row.adjusterPhone,
    fault_type: faultType,
    fault_rate: faultRate,
    repair_needed: !!row.repairShopName,
    repair_shop: row.repairShopName,
    estimated_repair_days: row.estimatedRepairDays,
    estimated_repair_cost: row.estimatedRepairCost,
    rental_needed: rentalNeeded,
    rental_status: rentalNeeded ? 'pending' : 'none',
    status: 'received',
    source: 'cafe24',
    raw_data: row as any,
  };
}

function parseRegion(location: string): { sido: string | null; sigungu: string | null } {
  if (!location) return { sido: null, sigungu: null };
  const sidoList = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  const fullSidoMap: Record<string, string> = {
    '서울': '서울특별시', '부산': '부산광역시', '대구': '대구광역시', '인천': '인천광역시',
    '광주': '광주광역시', '대전': '대전광역시', '울산': '울산광역시', '세종': '세종특별자치시',
    '경기': '경기도', '강원': '강원특별자치도', '충북': '충청북도', '충남': '충청남도',
    '전북': '전북특별자치도', '전남': '전라남도', '경북': '경상북도', '경남': '경상남도', '제주': '제주특별자치도'
  };
  let sido: string | null = null;
  let sigungu: string | null = null;
  for (const s of sidoList) {
    if (location.includes(s)) {
      sido = fullSidoMap[s] || s;
      const afterSido = location.substring(location.indexOf(s) + s.length).trim();
      const sigunguMatch = afterSido.match(/^[\s]*([\w가-힣]+[시군구])/);
      if (sigunguMatch) sigungu = sigunguMatch[1];
      break;
    }
  }
  return { sido, sigungu };
}

// POST: 카페24 → FMI 동기화 실행
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { mode = 'incremental', days = 7 } = body;

    const pool = getPool();

    let query = `
      SELECT
        a.otptstid AS staffId, a.otptrcdt AS receiptDate, a.otptsqno AS seqNo,
        a.otptrgst AS status, a.otptacdt AS accidentDate, a.otptactm AS accidentTime,
        a.otptacps AS accidentLocation, a.otptacmm AS accidentMemo,
        a.otptcsnm AS customerName, a.otptcsph AS customerPhone,
        a.otptcrno AS carNumber, a.otptcrtp AS carType,
        a.otptopnm AS counterpartName, a.otptopph AS counterpartPhone,
        a.otptopcr AS counterpartCarNo, a.otptopis AS counterpartInsurance,
        a.otptopno AS counterpartClaimNo, a.otptinnm AS insuranceCompany,
        a.otptinno AS insuranceClaimNo, a.otptasnm AS adjusterName,
        a.otptasph AS adjusterPhone, a.otptflrt AS faultRate,
        a.otptfcnm AS repairShopName, a.otptrpdy AS estimatedRepairDays,
        a.otptrpcs AS estimatedRepairCost,
        r.rentrgst AS rentalStatus, r.rentrtyn AS rentalNeeded
      FROM acrotpth a
      LEFT JOIN acrrentm r ON a.otptstid = r.rentstid
        AND a.otptrcdt = r.rentrcdt AND a.otptsqno = r.rentsqno
      WHERE a.otptrgst = 'R'
    `;

    if (mode === 'incremental') {
      query += ` AND a.otptrcdt >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL ${days} DAY), '%Y%m%d')`;
    }
    query += ` ORDER BY a.otptrcdt DESC, a.otptsqno DESC`;

    const [rows] = await pool.query(query) as [Cafe24Accident[], any];

    let synced = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const row of rows) {
      try {
        const fmiData = transformAccident(row);

        await prisma.fmiAccident.upsert({
          where: { cafe24_id: fmiData.cafe24_id },
          update: fmiData,
          create: fmiData,
        });

        synced++;
      } catch (e: any) {
        errors++;
        errorDetails.push(`${row.staffId}-${row.seqNo}: ${e.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total_fetched: rows.length,
        synced,
        errors,
        mode,
        days: mode === 'incremental' ? days : 'all',
        synced_at: new Date().toISOString(),
      },
      errors: errorDetails.length > 0 ? errorDetails.slice(0, 10) : undefined,
    });

  } catch (error: any) {
    console.error('카페24 동기화 에러:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// GET: 동기화 상태 조회
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'status';

    if (action === 'status') {
      const [totalAccidents, cafe24Synced, rentalNeeded, rentalPending, latest] =
        await prisma.$transaction([
          prisma.fmiAccident.count(),
          prisma.fmiAccident.count({ where: { source: 'cafe24' } }),
          prisma.fmiAccident.count({ where: { rental_needed: true } }),
          prisma.fmiAccident.count({ where: { rental_status: 'pending' } }),
          prisma.fmiAccident.findFirst({
            where: { source: 'cafe24' },
            orderBy: { updated_at: 'desc' },
            select: { updated_at: true },
          }),
        ]);

      return NextResponse.json({
        total_accidents: totalAccidents,
        cafe24_synced: cafe24Synced,
        rental_needed: rentalNeeded,
        rental_pending: rentalPending,
        last_synced: latest?.updated_at ?? null,
      });
    }

    if (action === 'rental_pending') {
      const accidents = await prisma.fmiAccident.findMany({
        where: {
          rental_needed: true,
          rental_status: { in: ['pending', 'approved'] },
        },
        orderBy: { receipt_date: 'desc' },
      });

      return NextResponse.json({ data: JSON.parse(JSON.stringify(accidents)) });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

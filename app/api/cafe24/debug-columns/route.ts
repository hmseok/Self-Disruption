import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

export async function GET(req: NextRequest) {
  try {
    const pool = getCafe24Pool();
    const [accCols] = await pool.query(`SHOW COLUMNS FROM acrotpth`);
    const [rentCols] = await pool.query(`SHOW COLUMNS FROM acrrentm`);
    return NextResponse.json({
      acrotpth: (accCols as any[]).map((c: any) => c.Field),
      acrrentm: (rentCols as any[]).map((c: any) => c.Field),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 임시 디버그 API — picbscdm 코드 마스터 + 실제 데이터 패턴 조회
export async function GET(req: NextRequest) {
  try {
    const pool = getCafe24Pool();
    const result: Record<string, any> = {};

    // 1. picbscdm 테이블 구조
    const [picCols] = await pool.query('SHOW COLUMNS FROM picbscdm');
    result.picbscdm_structure = picCols;

    // 2. picbscdm 전체 조회 (1097건이라 가능)
    const [allCodes] = await pool.query('SELECT * FROM picbscdm ORDER BY 1, 2');
    result.picbscdm_all = allCodes;
    result.picbscdm_count = (allCodes as any[]).length;

    // 3. otptstat 분포
    const [statDist] = await pool.query(
      'SELECT otptstat, COUNT(*) as cnt FROM acrotpth GROUP BY otptstat ORDER BY otptstat'
    );
    result.otptstat_distribution = statDist;

    // 4. 카테고리/유형 분포
    const codeFields = ['otptmscs', 'otptrgst', 'otptrgtp', 'otptacbn', 'otptacrn', 'otptacdi', 'otptacdm', 'otptacjc', 'otptacjs', 'otptadfg', 'otptinfg'];
    result.field_distributions = {};
    for (const field of codeFields) {
      try {
        const [vals] = await pool.query(
          `SELECT ${field} as val, COUNT(*) as cnt FROM acrotpth GROUP BY ${field} ORDER BY cnt DESC LIMIT 20`
        );
        result.field_distributions[field] = vals;
      } catch (e: any) {
        result.field_distributions[field] = { error: e.message };
      }
    }

    // 5. renttypp, rentstat 분포
    for (const field of ['renttypp', 'rentstat', 'rentfacd']) {
      try {
        const [vals] = await pool.query(
          `SELECT ${field} as val, COUNT(*) as cnt FROM acrrentm GROUP BY ${field} ORDER BY cnt DESC LIMIT 20`
        );
        result.field_distributions[field] = vals;
      } catch (e: any) {
        result.field_distributions[field] = { error: e.message };
      }
    }

    // 6. 최신 사고 5건 전체 데이터
    const [latest] = await pool.query(
      'SELECT * FROM acrotpth ORDER BY otptgndt DESC, otptgntm DESC LIMIT 5'
    );
    result.latest_accidents = latest;

    // 7. 최신 대차 5건
    const [latestRent] = await pool.query(
      'SELECT * FROM acrrentm ORDER BY rentgndt DESC, rentgntm DESC LIMIT 5'
    );
    result.latest_rentals = latestRent;

    // 8. 모든 테이블 목록
    const [tables] = await pool.query('SHOW TABLES');
    result.all_tables = tables;

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

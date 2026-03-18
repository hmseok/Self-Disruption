import { NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 전체 공통코드 + 주요 마스터 테이블 덤프 (분석용 임시 API)
export async function GET() {
  try {
    const pool = getCafe24Pool();
    const r: Record<string, any> = {};

    // 1. picbscdm 전체 (공통코드 마스터)
    const [codes] = await pool.query('SELECT bscdgubn, bscdcode, bscddesc, bscdval1, bscdval2, bscdval3, bscdsort FROM picbscdm ORDER BY bscdgubn, bscdsort, bscdcode');
    r.picbscdm = codes;

    // 2. pmcfactm (공장/업체 마스터) — 구조 + 샘플
    const [factCols] = await pool.query('SHOW COLUMNS FROM pmcfactm');
    r.pmcfactm_cols = factCols;
    const [factSample] = await pool.query('SELECT * FROM pmcfactm LIMIT 10');
    r.pmcfactm_sample = factSample;
    const [factCount] = await pool.query('SELECT COUNT(*) as cnt FROM pmcfactm');
    r.pmcfactm_count = (factCount as any[])[0].cnt;

    // 3. picmodlm (차량모델 마스터)
    try {
      const [modlCols] = await pool.query('SHOW COLUMNS FROM picmodlm');
      r.picmodlm_cols = modlCols;
      const [modlSample] = await pool.query('SELECT * FROM picmodlm LIMIT 10');
      r.picmodlm_sample = modlSample;
    } catch { r.picmodlm = 'not found'; }

    // 4. picuserm (사용자 마스터)
    try {
      const [userCols] = await pool.query('SHOW COLUMNS FROM picuserm');
      r.picuserm_cols = userCols;
      const [userSample] = await pool.query('SELECT * FROM picuserm LIMIT 10');
      r.picuserm_sample = userSample;
    } catch { r.picuserm = 'not found'; }

    // 5. acrotpth 필드별 고유값 분포 (전체)
    const distFields = [
      'otptstat', 'otptmscs', 'otptrgst', 'otptrgtp', 'otptacbn',
      'otptacrn', 'otptacdi', 'otptacdm', 'otptacjc', 'otptacjs',
      'otptadfg', 'otptinfg', 'otpttwgn', 'otptftyn', 'otptjsyn',
      'otptdcyn', 'otptrtyn', 'otptcomp', 'otptdedu', 'otpttagt',
      'otptdscd', 'otptdsrp', 'otptdsli', 'otptthyn'
    ];
    r.field_dist = {};
    for (const f of distFields) {
      try {
        const [vals] = await pool.query(`SELECT ${f} as val, COUNT(*) as cnt FROM acrotpth GROUP BY ${f} ORDER BY cnt DESC LIMIT 30`);
        r.field_dist[f] = vals;
      } catch { /* skip */ }
    }

    // 6. acrrentm 필드별 분포
    const rentFields = ['rentstat', 'renttypp', 'rentfacd'];
    r.rent_dist = {};
    for (const f of rentFields) {
      try {
        const [vals] = await pool.query(`SELECT ${f} as val, COUNT(*) as cnt FROM acrrentm GROUP BY ${f} ORDER BY cnt DESC LIMIT 30`);
        r.rent_dist[f] = vals;
      } catch { /* skip */ }
    }

    // 7. pmccarsm 필드별 분포
    const carFields = ['carsstat', 'carstype', 'carsbocd', 'carsbogn', 'carsbocl'];
    r.car_dist = {};
    for (const f of carFields) {
      try {
        const [vals] = await pool.query(`SELECT ${f} as val, COUNT(*) as cnt FROM pmccarsm GROUP BY ${f} ORDER BY cnt DESC LIMIT 30`);
        r.car_dist[f] = vals;
      } catch { /* skip */ }
    }

    return NextResponse.json({ success: true, ...r });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

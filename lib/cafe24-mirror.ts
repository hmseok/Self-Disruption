// ═══════════════════════════════════════════════════════════════
// lib/cafe24-mirror.ts — 카페24 접수 미러링 (2026-08-08)
// 사용자 확정: "나중에 카페24 연결이 끊길 수도 있으니 받아서 우리 DB로"
//
//   syncCafe24Mirror(fromYmd, toYmd) : 카페24 → cafe24_accidents_mirror 업서트
//   queryMirror(filters)             : 미러에서 조회 (카페24 장애 시 폴백)
//
// ※ SELECT 는 app/api/operations/cafe24-dispatch-requests/route.ts 의
//   「가설 J」 쿼리와 동일해야 함 (화면이 쓰는 전체 필드) — 수정 시 양쪽 함께.
// ═══════════════════════════════════════════════════════════════

import { prisma } from './prisma'
import { cafe24Db } from './cafe24-db'

const SELECT_SQL = (whereSql: string) => `
      SELECT b.otptidno, b.otptmddt, b.otptsrno,
             b.otptacdt, b.otptactm, b.otptacbn,
             b.otptrgst, b.otptrgtp, b.otptgnus,
             b.otptdcyn,
             b.otptcanm, b.otptcahp,
             b.otptdsnm, b.otptdshp,
             b.otptacdi, b.otptacdm, b.otptacjc, b.otptacjs,
             b.otptacmb, b.otptacno, b.otptacph,
             b.otptdsrp, b.otptftyn,
             b.otpttonm, b.otpttohp, b.otpttonu, b.otpttomd,
             b.otpttobm, b.otpttobn, b.otpttobu,
             b.otptacad, b.otptacmo, b.otptacet,
             b.otptdsli, b.otptdsbh, b.otptdsbn,
             b.otptdsre, b.otptcare,
             b.otptacrn, b.otptadfg,
             b.otptbdnm, b.otptpknm,
             b.otptdsus, b.otptdstl,
             (SELECT GROUP_CONCAT(DISTINCT cb.cbsddesc SEPARATOR ', ')
                FROM acrparth p
                JOIN comcbsdm cb ON p.partcode = cb.cbsdcode
               WHERE cb.cbsdjobb = 'OTPT'
                 AND cb.cbsdgubn = 'OTPTPART'
                 AND p.partflag = 'O'
                 AND p.partidno = b.otptidno
                 AND p.partmddt = b.otptmddt
                 AND p.partsrno = b.otptsrno
             ) AS otptpart,
             (SELECT GROUP_CONCAT(DISTINCT pf.factname SEPARATOR ', ')
                FROM ajaoderh aa
                LEFT JOIN pmcfactm pf ON pf.factcode = aa.oderfact
               WHERE aa.oderidno = b.otptidno
                 AND aa.odermddt = b.otptmddt
                 AND aa.odersrno = b.otptsrno
                 AND aa.oderstat <> 'X'
             ) AS factory_names,
             (SELECT cbsddesc FROM comcbsdm
               WHERE cbsdjobb='OTPT' AND cbsdgubn='OTPTDSLI'
                 AND cbsdcode = b.otptdsli LIMIT 1
             ) AS otptdsli_label,
             (SELECT cbsddesc FROM comcbsdm
               WHERE cbsdjobb='OTPT' AND cbsdgubn='OTPTACBN'
                 AND cbsdcode = b.otptacbn LIMIT 1
             ) AS otptacbn_label,
             r.rentsrno AS rent_srno,
             r.rentseqn AS rent_seqn,
             r.rentstat AS rent_stat,
             r.rentrsdt AS rent_rsdt,
             r.rentfrdt AS rent_frdt,
             r.rentfrtm AS rent_frtm,
             r.renttodt AS rent_todt,
             r.renttotm AS rent_totm,
             r.rentuser AS rent_user,
             r.rentushp AS rent_ushp,
             r.rentnums AS rent_nums,
             r.rentmodl AS rent_modl,
             r.rentfacd AS rent_facd,
             r.rentmemo AS rent_memo,
             f.factname AS rental_vendor,
             f.facthpno AS rental_hp,
             f.factbdno AS rental_bdno,
             c.carsnums  AS cars_no,
             c.carsodnm  AS cars_model,
             c.carsuser  AS cars_user,
             c.carscust  AS capital_co_code,
             cu.custname AS capital_co_name,
             c.carscode  AS cars_vin,
             c.carscono  AS cars_contract_no,
             c.carsstdt  AS cars_start_date,
             c.carscofr  AS cars_use_from,
             c.carscoto  AS cars_use_to,
             c.carsushp  AS cars_user_hp,
             u.username  AS gnus_name
        FROM acrotpth b
        LEFT JOIN acrrentm r
          ON r.rentidno = b.otptidno
         AND r.rentmddt = b.otptmddt
         AND r.rentsrno = b.otptsrno
        LEFT JOIN pmcfactm f
          ON f.factcode = r.rentfacd
        LEFT JOIN pmccarsm c
          ON c.carsidno = b.otptidno
         AND b.otptmddt BETWEEN c.carsfrdt AND c.carstodt
        LEFT JOIN pmccustm cu
          ON cu.custcode = c.carscust
        LEFT JOIN picuserm u
          ON u.userpidn = b.otptgnus
         AND b.otptmddt BETWEEN u.userfrdt AND u.usertodt
        ${whereSql}
       ORDER BY b.otptmddt DESC, b.otptsrno DESC
       LIMIT ? OFFSET ?`

/** 카페24 → 미러 업서트. rgst/dcyn 무관 전부 (미러는 원본 보존이 목적) */
export async function syncCafe24Mirror(fromYmd: string, toYmd: string): Promise<{ fetched: number; upserted: number; pages: number }> {
  const whereSql = `WHERE CHAR_LENGTH(b.otptmddt) = 8
    AND b.otptmddt BETWEEN '20100101' AND '20991231'
    AND b.otptmddt >= ? AND b.otptmddt <= ?`
  const PAGE = 500
  let offset = 0
  let fetched = 0, upserted = 0, pages = 0

  while (true) {
    const rows = await cafe24Db.query<any>(SELECT_SQL(whereSql), [fromYmd, toYmd, PAGE, offset])
    if (!rows.length) break
    pages += 1
    fetched += rows.length

    // 배치 업서트
    const values: string[] = []
    const args: unknown[] = []
    for (const r of rows) {
      values.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      args.push(
        String(r.otptidno), String(r.otptmddt), Number(r.otptsrno),
        r.otptrgst || null, r.otptdcyn || null,
        r.otptcanm || null, r.otptcahp || null, r.otptdsnm || null,
        r.cars_no || null, r.cars_user || null,
        (r.factory_names || '').slice(0, 300) || null,
        r.otpttobm || null, r.otpttobn || null,
        JSON.stringify(r))
    }
    const n = await prisma.$executeRawUnsafe(`
      INSERT INTO cafe24_accidents_mirror
        (otptidno, otptmddt, otptsrno, otptrgst, otptdcyn, otptcanm, otptcahp, otptdsnm, cars_no, cars_user, factory_names, otpttobm, otpttobn, payload)
      VALUES ${values.join(',')}
      ON DUPLICATE KEY UPDATE
        otptrgst = VALUES(otptrgst), otptdcyn = VALUES(otptdcyn),
        otptcanm = VALUES(otptcanm), otptcahp = VALUES(otptcahp), otptdsnm = VALUES(otptdsnm),
        cars_no = VALUES(cars_no), cars_user = VALUES(cars_user),
        factory_names = VALUES(factory_names),
        otpttobm = VALUES(otpttobm), otpttobn = VALUES(otpttobn),
        payload = VALUES(payload)`, ...args)
    upserted += Number(n)

    if (rows.length < PAGE) break
    offset += PAGE
  }
  return { fetched, upserted, pages }
}

/** 미러 조회 — 라이브 라우트와 동일한 필터 시그니처 */
export async function queryMirror(opts: {
  rgst?: string; dcyn?: string; from?: string | null; to?: string | null; q?: string | null
  limit: number; offset: number
}): Promise<any[]> {
  const where: string[] = ['1=1']
  const args: unknown[] = []
  if (opts.rgst && opts.rgst !== 'all' && /^[A-Z]$/.test(opts.rgst)) { where.push('otptrgst = ?'); args.push(opts.rgst) }
  if (opts.dcyn && opts.dcyn !== 'all' && /^[YN]$/.test(opts.dcyn)) { where.push('otptdcyn = ?'); args.push(opts.dcyn) }
  if (opts.from && /^\d{8}$/.test(opts.from)) { where.push('otptmddt >= ?'); args.push(opts.from) }
  if (opts.to && /^\d{8}$/.test(opts.to)) { where.push('otptmddt <= ?'); args.push(opts.to) }
  if (opts.q && opts.q.trim()) {
    where.push('(cars_no LIKE ? OR otptcanm LIKE ? OR otptdsnm LIKE ? OR factory_names LIKE ? OR cars_user LIKE ?)')
    const like = `%${opts.q.trim()}%`
    args.push(like, like, like, like, like)
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ payload: string }>>(`
    SELECT payload FROM cafe24_accidents_mirror
    WHERE ${where.join(' AND ')}
    ORDER BY otptmddt DESC, otptsrno DESC
    LIMIT ${Math.min(opts.limit, 2000)} OFFSET ${Math.max(opts.offset, 0)}`, ...args)
  return rows.map(r => {
    try { return JSON.parse(r.payload) } catch { return null }
  }).filter(Boolean)
}

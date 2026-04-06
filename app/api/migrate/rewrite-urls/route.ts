import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// POST /api/migrate/rewrite-urls
// Body: { oldHost: string, newHost: string, dryRun?: bool, tables?: string[] }
// 1) information_schema로 text/varchar/json 컬럼 전수 조사
// 2) 각 컬럼에서 oldHost 포함 row 카운트
// 3) dryRun=false면 UPDATE table SET col = REPLACE(col, old, new) 실행
// 4) 테이블.컬럼별 결과 반환

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const profile = await prisma.$queryRaw<any[]>`SELECT role FROM profiles WHERE id = ${user.id} LIMIT 1`
  if (!profile[0] || profile[0].role !== 'admin') {
    return NextResponse.json({ error: '관리자만 실행 가능' }, { status: 403 })
  }

  let body: any = {}
  try { body = await request.json() } catch {}
  const oldHost: string = body.oldHost || ''
  const newHost: string = body.newHost || ''
  const dryRun: boolean = body.dryRun !== false // default TRUE for safety
  const tablesFilter: string[] = Array.isArray(body.tables) ? body.tables : []

  if (!oldHost) return NextResponse.json({ error: 'oldHost 필요' }, { status: 400 })
  if (!newHost && !dryRun) return NextResponse.json({ error: 'newHost 필요 (dryRun=false)' }, { status: 400 })

  try {
    // 1) 후보 컬럼 수집 (text, longtext, varchar, json, mediumtext)
    const cols = await prisma.$queryRaw<Array<{ TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string }>>`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND DATA_TYPE IN ('text', 'longtext', 'mediumtext', 'varchar', 'json')
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `

    const results: Array<any> = []
    const likePattern = `%${oldHost}%`

    for (const c of cols) {
      const table = (c as any).TABLE_NAME || (c as any).table_name
      const col = (c as any).COLUMN_NAME || (c as any).column_name
      if (tablesFilter.length && !tablesFilter.includes(table)) continue

      try {
        // Count rows containing oldHost
        const countRes: any[] = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*) AS cnt FROM \`${table}\` WHERE \`${col}\` LIKE ?`,
          likePattern
        )
        const cnt = Number(countRes[0]?.cnt ?? 0)
        if (cnt === 0) continue

        let updated = 0
        if (!dryRun) {
          const upd = await prisma.$executeRawUnsafe(
            `UPDATE \`${table}\` SET \`${col}\` = REPLACE(\`${col}\`, ?, ?) WHERE \`${col}\` LIKE ?`,
            oldHost, newHost, likePattern
          )
          updated = Number(upd || 0)
        }
        results.push({ table, column: col, matched: cnt, updated })
      } catch (e: any) {
        results.push({ table, column: col, error: e.message.slice(0, 200) })
      }
    }

    const summary = {
      candidateColumns: cols.length,
      hitColumns: results.filter(r => r.matched > 0 || r.error).length,
      totalMatched: results.reduce((a, r) => a + (r.matched || 0), 0),
      totalUpdated: results.reduce((a, r) => a + (r.updated || 0), 0),
      errors: results.filter(r => r.error).length,
    }

    return NextResponse.json({ ok: true, dryRun, oldHost, newHost, summary, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

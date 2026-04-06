import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// GET /api/migrate/inventory — MySQL 전체 테이블 목록 + row 수 반환 (admin 전용)
// Supabase 해지 전 누락 검증용 인벤토리 API
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const profile = await prisma.$queryRaw<any[]>`SELECT role FROM profiles WHERE id = ${user.id} LIMIT 1`
  if (!profile[0] || profile[0].role !== 'admin') {
    return NextResponse.json({ error: '관리자만 실행 가능' }, { status: 403 })
  }

  try {
    // 1. 전체 테이블 목록 (정보 스키마 기반)
    const tables = await prisma.$queryRaw<Array<{ TABLE_NAME: string }>>`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `
    const tableNames = tables.map(t => (t as any).TABLE_NAME || (t as any).table_name)

    // 2. 각 테이블 정확 row count (SELECT COUNT(*) — information_schema.TABLE_ROWS는 근사값이라 부정확)
    const counts: Record<string, number> = {}
    const errors: Record<string, string> = {}
    for (const t of tableNames) {
      // 백틱 이스케이프: 테이블 이름은 information_schema에서 왔으므로 안전하다고 가정 (사용자 입력 아님)
      try {
        const row: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS cnt FROM \`${t}\``)
        counts[t] = Number(row[0]?.cnt ?? 0)
      } catch (e: any) {
        errors[t] = e.message
        counts[t] = -1
      }
    }

    // 3. 각 테이블 컬럼 정보 (스키마 비교용)
    const columns = await prisma.$queryRaw<Array<{ TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }>>`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `
    const columnsByTable: Record<string, Array<{ name: string; type: string; nullable: boolean }>> = {}
    for (const c of columns) {
      const tn = (c as any).TABLE_NAME || (c as any).table_name
      if (!columnsByTable[tn]) columnsByTable[tn] = []
      columnsByTable[tn].push({
        name: (c as any).COLUMN_NAME || (c as any).column_name,
        type: (c as any).DATA_TYPE || (c as any).data_type,
        nullable: ((c as any).IS_NULLABLE || (c as any).is_nullable) === 'YES',
      })
    }

    return NextResponse.json({
      ok: true,
      database: 'fmi_op',
      totalTables: tableNames.length,
      totalRows: Object.values(counts).reduce((a, b) => a + (b > 0 ? b : 0), 0),
      counts,
      columns: columnsByTable,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

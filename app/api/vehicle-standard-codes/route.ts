import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    try {
      const data = await prisma.$queryRaw<any[]>`SELECT * FROM vehicle_standard_codes ORDER BY model_name, price`
      return NextResponse.json({ data: serialize(data), error: null })
    } catch (tableErr: any) {
      // 테이블이 없으면 빈 배열 반환 (테이블 미생성 상태)
      if (tableErr.message?.includes("doesn't exist") || tableErr.message?.includes('1146')) {
        console.warn('[vehicle-standard-codes] 테이블 미존재, 빈 배열 반환')
        return NextResponse.json({ data: [], error: null })
      }
      throw tableErr
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const body = await request.json()
    // Handle both single and array inserts
    const rows = Array.isArray(body) ? body : [body]

    // Insert each row
    for (const row of rows) {
      const rowId = row.id || crypto.randomUUID()
      await prisma.$executeRaw`
        INSERT INTO vehicle_standard_codes (id, brand, model_name, model_code, year, trim_name, price, fuel_type, normalized_name, created_at, updated_at)
        VALUES (${rowId}, ${row.brand || null}, ${row.model_name || null}, ${row.model_code || null}, ${row.year || null}, ${row.trim_name || null}, ${row.price || 0}, ${row.fuel_type || null}, ${row.normalized_name || null}, NOW(), NOW())
        ON DUPLICATE KEY UPDATE brand = VALUES(brand), model_name = VALUES(model_name), model_code = VALUES(model_code), year = VALUES(year), trim_name = VALUES(trim_name), price = VALUES(price), fuel_type = VALUES(fuel_type), normalized_name = VALUES(normalized_name), updated_at = NOW()
      `
    }
    return NextResponse.json({ data: { success: true }, error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

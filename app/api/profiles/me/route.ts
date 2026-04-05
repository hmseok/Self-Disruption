import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    // 1차: JOIN 포함 쿼리 시도
    let raw: any = null
    try {
      const profiles = await prisma.$queryRaw<any[]>`
        SELECT p.*,
               pos.id as pos_id, pos.name as pos_name, pos.level as pos_level,
               dep.id as dep_id, dep.name as dep_name
        FROM profiles p
        LEFT JOIN positions pos ON p.position_id = pos.id
        LEFT JOIN departments dep ON p.department_id = dep.id
        WHERE p.id = ${user.id}
        LIMIT 1
      `
      raw = profiles[0] || null
    } catch (joinError: any) {
      // positions/departments 테이블 없을 수 있음 → 단순 쿼리 fallback
      console.warn('profiles/me JOIN 실패, fallback:', joinError?.message)
      const fallback = await prisma.$queryRaw<any[]>`
        SELECT * FROM profiles WHERE id = ${user.id} LIMIT 1
      `
      raw = fallback[0] || null
    }

    if (!raw) return NextResponse.json({ data: null, error: null })

    const profile = {
      ...raw,
      position: raw.pos_id ? { id: raw.pos_id, name: raw.pos_name, level: raw.pos_level } : null,
      department: raw.dep_id ? { id: raw.dep_id, name: raw.dep_name } : null,
    }
    return NextResponse.json({ data: serialize(profile), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

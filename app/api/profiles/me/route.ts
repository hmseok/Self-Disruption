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
    const raw = profiles[0]
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

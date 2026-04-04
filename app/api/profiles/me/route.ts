import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'fmi_dev_secret_change_in_production'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

function verifyUserInline(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.replace('Bearer ', '')
    const decoded = jwt.verify(token, JWT_SECRET) as any
    return decoded.sub || decoded.userId || null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = verifyUserInline(request)
    if (!userId) return NextResponse.json({ error: '인증 필요', debug: 'verifyUserInline returned null' }, { status: 401 })

    const profiles = await prisma.$queryRaw<any[]>`
      SELECT p.*,
             pos.id as pos_id, pos.name as pos_name, pos.level as pos_level,
             dep.id as dep_id, dep.name as dep_name
      FROM profiles p
      LEFT JOIN positions pos ON p.position_id = pos.id
      LEFT JOIN departments dep ON p.department_id = dep.id
      WHERE p.id = ${userId}
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
    return NextResponse.json({ error: e.message, stack: e.stack?.substring(0, 300) }, { status: 500 })
  }
}

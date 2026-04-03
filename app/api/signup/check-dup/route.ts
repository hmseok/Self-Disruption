import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { field, value } = await request.json()

    if (!field || !value) {
      return NextResponse.json({ exists: false })
    }

    let exists = false

    if (field === 'email') {
      const count = await prisma.profile.count({ where: { email: String(value) } })
      exists = count > 0
    } else if (field === 'phone') {
      const count = await prisma.profile.count({ where: { phone: String(value) } })
      exists = count > 0
    } else if (field === 'company_name') {
      const count = await prisma.company.count({ where: { name: String(value) } })
      exists = count > 0
    } else if (field === 'business_number') {
      // business_number not in schema yet — return false (not duplicate)
      exists = false
    }

    return NextResponse.json({ exists })
  } catch (error: any) {
    console.error('[signup/check-dup]', error)
    return NextResponse.json({ exists: false })
  }
}

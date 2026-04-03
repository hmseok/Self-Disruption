import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const userId = getUserIdFromToken(token)
  if (!userId) return null
  const profiles = await prisma.$queryRaw<any[]>`SELECT role, employee_name FROM profiles WHERE id = ${userId} LIMIT 1`
  const profile = profiles[0]
  return profile ? { id: userId, role: profile.role, employee_name: profile.employee_name } : null
}

// GET: 내 법인카드 목록
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const cards = await prisma.$queryRaw<any[]>`
      SELECT * FROM user_corporate_cards WHERE user_id = ${user.id}
      ORDER BY is_default DESC, created_at DESC
    `
    return NextResponse.json({ data: cards || [] })
  } catch (error: any) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}

// POST: 법인카드 등록
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { card_name, card_number, card_company, is_default } = body

  if (!card_number) {
    return NextResponse.json({ error: '카드번호는 필수입니다.' }, { status: 400 })
  }

  try {
    // 기본 카드로 설정 시 기존 기본 카드 해제
    if (is_default) {
      await prisma.$executeRaw`UPDATE user_corporate_cards SET is_default = 0 WHERE user_id = ${user.id} AND is_default = 1`
    }

    // 카드번호에서 뒤 4자리 추출
    const last4 = card_number.replace(/[^0-9]/g, '').slice(-4)
    const cardId = require('crypto').randomUUID()

    await prisma.$executeRaw`
      INSERT INTO user_corporate_cards (id, user_id, card_name, card_number, card_last4, card_company, is_default, created_at, updated_at)
      VALUES (${cardId}, ${user.id}, ${card_name || `법인카드 ${last4}`}, ${card_number.trim()}, ${last4}, ${card_company || ''}, ${is_default ? 1 : 0}, NOW(), NOW())
    `

    const result = await prisma.$queryRaw<any[]>`SELECT * FROM user_corporate_cards WHERE id = ${cardId} LIMIT 1`
    const data = result[0]

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('카드 등록 실패:', error)
    return NextResponse.json({ error: '등록 실패', detail: error.message }, { status: 500 })
  }
}

// DELETE: 법인카드 삭제
export async function DELETE(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID 필요' }, { status: 400 })

  try {
    await prisma.$executeRaw`DELETE FROM user_corporate_cards WHERE id = ${id} AND user_id = ${user.id}`
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  }
}

// PATCH: 법인카드 수정 (기본카드 설정 등)
export async function PATCH(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { id, card_name, card_company, is_default } = body

  if (!id) return NextResponse.json({ error: 'ID 필요' }, { status: 400 })

  try {
    // 기본 카드로 설정 시 기존 기본 카드 해제
    if (is_default) {
      await prisma.$executeRaw`UPDATE user_corporate_cards SET is_default = 0 WHERE user_id = ${user.id} AND is_default = 1`
    }

    const updates: string[] = []
    const params: any[] = []

    if (card_name !== undefined) {
      updates.push('card_name = ?')
      params.push(card_name)
    }
    if (card_company !== undefined) {
      updates.push('card_company = ?')
      params.push(card_company)
    }
    if (is_default !== undefined) {
      updates.push('is_default = ?')
      params.push(is_default ? 1 : 0)
    }

    if (updates.length === 0) {
      const result = await prisma.$queryRaw<any[]>`SELECT * FROM user_corporate_cards WHERE id = ${id} AND user_id = ${user.id} LIMIT 1`
      const data = result[0]
      return NextResponse.json({ success: true, data })
    }

    let query = 'UPDATE user_corporate_cards SET '
    query += updates.join(', ')
    query += ' WHERE id = ? AND user_id = ?'
    params.push(id, user.id)

    // Use raw SQL with parameter placeholders
    const updateQuery = `UPDATE user_corporate_cards SET ${updates.map((_, i) => `${updates[i].split(' = ')[0]} = ${params[i] !== undefined ? `'${params[i]}'` : 'NULL'}`).join(', ')} WHERE id = '${id}' AND user_id = '${user.id}'`

    // Simpler approach using individual if checks
    if (card_name !== undefined && card_company !== undefined && is_default !== undefined) {
      await prisma.$executeRaw`UPDATE user_corporate_cards SET card_name = ${card_name}, card_company = ${card_company}, is_default = ${is_default ? 1 : 0} WHERE id = ${id} AND user_id = ${user.id}`
    } else if (card_name !== undefined && card_company !== undefined) {
      await prisma.$executeRaw`UPDATE user_corporate_cards SET card_name = ${card_name}, card_company = ${card_company} WHERE id = ${id} AND user_id = ${user.id}`
    } else if (card_name !== undefined && is_default !== undefined) {
      await prisma.$executeRaw`UPDATE user_corporate_cards SET card_name = ${card_name}, is_default = ${is_default ? 1 : 0} WHERE id = ${id} AND user_id = ${user.id}`
    } else if (card_company !== undefined && is_default !== undefined) {
      await prisma.$executeRaw`UPDATE user_corporate_cards SET card_company = ${card_company}, is_default = ${is_default ? 1 : 0} WHERE id = ${id} AND user_id = ${user.id}`
    } else if (card_name !== undefined) {
      await prisma.$executeRaw`UPDATE user_corporate_cards SET card_name = ${card_name} WHERE id = ${id} AND user_id = ${user.id}`
    } else if (card_company !== undefined) {
      await prisma.$executeRaw`UPDATE user_corporate_cards SET card_company = ${card_company} WHERE id = ${id} AND user_id = ${user.id}`
    } else if (is_default !== undefined) {
      await prisma.$executeRaw`UPDATE user_corporate_cards SET is_default = ${is_default ? 1 : 0} WHERE id = ${id} AND user_id = ${user.id}`
    }

    const result = await prisma.$queryRaw<any[]>`SELECT * FROM user_corporate_cards WHERE id = ${id} AND user_id = ${user.id} LIMIT 1`
    const data = result[0]

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  }
}

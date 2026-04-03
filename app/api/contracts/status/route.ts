import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// ============================================
// 계약 상태 관리 API
// POST → 상태 변경 + 이력 기록
// GET  → 상태 변경 이력 조회
// ============================================

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  // TODO: Phase 5 Firebase Auth - JWT decode to get userId
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString())
    const userId = decoded.sub || decoded.user_id
    if (!userId) return null

    const profile = await prisma.$queryRaw<any[]>`
      SELECT role FROM profiles WHERE id = ${userId} LIMIT 1
    `
    if (!profile || profile.length === 0 || !['admin', 'master'].includes(profile[0].role)) {
      return null
    }
    return { id: userId, role: profile[0].role }
  } catch {
    return null
  }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  active: ['expired', 'terminated'],
  expired: ['renewed', 'terminated'],
  terminated: [],
  renewed: ['expired', 'terminated'],
}

// POST: 상태 변경
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { contract_type, contract_id, new_status, reason } = body

  if (!contract_type || !contract_id || !new_status) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }
  if (!['jiip', 'invest'].includes(contract_type)) {
    return NextResponse.json({ error: '유효하지 않은 계약 유형' }, { status: 400 })
  }

  const tableName = contract_type === 'jiip' ? 'jiip_contracts' : 'general_investments'

  try {
    // 현재 상태 조회
    const contract = await prisma.$queryRaw<any[]>`
      SELECT status FROM ${Prisma.raw(tableName)} WHERE id = ${contract_id} LIMIT 1
    `

    if (!contract || contract.length === 0) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 전환 유효성 검사
    const currentStatus = contract[0].status || 'active'
    const allowed = VALID_TRANSITIONS[currentStatus] || []
    if (!allowed.includes(new_status)) {
      return NextResponse.json({
        error: `'${currentStatus}' → '${new_status}' 상태 전환이 허용되지 않습니다. 가능: ${allowed.join(', ') || '없음'}`,
      }, { status: 400 })
    }

    // 상태 업데이트
    await prisma.$executeRaw`
      UPDATE ${Prisma.raw(tableName)} SET status = ${new_status} WHERE id = ${contract_id}
    `

    // 이력 기록
    await prisma.$executeRaw`
      INSERT INTO contract_status_history
      (contract_type, contract_id, old_status, new_status, change_reason, changed_by, created_at)
      VALUES (${contract_type}, ${contract_id}, ${currentStatus}, ${new_status}, ${reason || `manual_${new_status}`}, ${admin.id}, NOW())
    `

    return NextResponse.json({ success: true, old_status: currentStatus, new_status })
  } catch (e: any) {
    console.error('[contracts/status POST] 에러:', e.message)
    return NextResponse.json({ error: '상태 업데이트 실패: ' + e.message }, { status: 500 })
  }
}

// GET: 상태 변경 이력
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const contractType = searchParams.get('contract_type')
  const contractId = searchParams.get('contract_id')

  if (!contractType || !contractId) {
    return NextResponse.json({ error: 'contract_type, contract_id 필수' }, { status: 400 })
  }

  try {
    const data = await prisma.$queryRaw<any[]>`
      SELECT csh.*, p.employee_name as changer_employee_name
      FROM contract_status_history csh
      LEFT JOIN profiles p ON csh.changed_by = p.id
      WHERE csh.contract_type = ${contractType} AND csh.contract_id = ${contractId}
      ORDER BY csh.created_at DESC
      LIMIT 50
    `

    return NextResponse.json({ data })
  } catch (e: any) {
    console.error('[contracts/status GET] 에러:', e.message)
    return NextResponse.json({ error: '조회 실패: ' + e.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/operations/intake-bulk
 *
 * 배차·대차 엑셀(마춤카/빌려타/부가세(캐피탈)/따봉) 일괄 인테이크.
 *  엑셀 1행 → (fmi_vehicles upsert) + (fmi_accidents upsert) + (fmi_rentals create/upsert)
 *  4축 자동분류기가 이 데이터를 조인해서 사고차량번호↔입금 매칭에 활용한다.
 *
 * Body:
 * {
 *   fleet_group: '마춤카' | '빌려타' | '부가세(캐피탈)' | '따봉',
 *   dry_run?: boolean,
 *   rows: IntakeRow[]
 * }
 */

type IntakeRow = {
  vehicle_car_number?: string     // 우리 대차차량번호 "(1) 125하4239 / G80 2.5(G)" → 정규화 후 "125하4239"
  vehicle_car_type?: string
  dispatch_date?: string | null
  return_date?: string | null
  accident_car_number?: string    // 사고차량번호 (고객 차)
  accident_car_type?: string
  vehicle_location?: string       // 차량위치 (지급/iM/마음카 등)
  insurance_company?: string
  receipt_no?: string
  handler_contact?: string        // "이름/010-xxxx-xxxx/02-xxxx-xxxx"
  customer_birth?: string         // "생년월일 xxxxxx"
  customer_contact?: string       // "이름/010-xxxx-xxxx"
  address?: string
  workshop?: string
  fault_rate?: number | string
  contract_status?: string
  billing_status?: string
  payment_status?: string
  deposit_date?: string | null
  note?: string
  raw?: any
}

// 차량번호 정규화: "(1) 125하4239 / G80 2.5(G)" → "125하4239"
function normalizeCarNumber(raw?: string | null): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  // 괄호 접두사 제거 "(1) ", "(2) "
  const noPrefix = s.replace(/^\(\d+\)\s*/, '').trim()
  // 슬래시 앞부분만 (차종 분리)
  const beforeSlash = noPrefix.split('/')[0].trim()
  // 정규식으로 한글+숫자 패턴 추출 (XX가1234, XXX하1234, XX허1234 등)
  const m = beforeSlash.match(/\d{1,3}[가-힣]\d{4}/)
  return m ? m[0] : beforeSlash || null
}

// "이름/010-xxxx-xxxx/02-xxxx-xxxx" → { name, phone }
function parseContact(raw?: string | null): { name?: string; phone?: string } {
  if (!raw) return {}
  const parts = String(raw).split('/').map((p) => p.trim()).filter(Boolean)
  const name = parts[0]
  const phone = parts.find((p) => /01[0-9]-?\d{3,4}-?\d{4}/.test(p))
  return { name, phone }
}

// "생년월일 xxxxxx" → "xxxxxx"
function parseBirth(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const m = String(raw).match(/\d{6,8}/)
  return m ? m[0] : undefined
}

function toDate(raw: any): Date | undefined {
  if (raw == null || raw === '') return undefined
  if (raw instanceof Date) return isNaN(raw.getTime()) ? undefined : raw
  // Excel serial number
  if (typeof raw === 'number') {
    if (raw < 10000 || raw > 90000) return undefined
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const ms = epoch.getTime() + raw * 86400000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? undefined : d
  }
  const s = String(raw).trim()
  if (!s) return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

function toInt(raw: any): number | undefined {
  if (raw == null || raw === '') return undefined
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/[^\d-]/g, ''), 10)
  return isFinite(n) ? n : undefined
}

// contract/billing/payment 컬럼 텍스트를 표준 상태코드로 매핑
function mapStatus(s?: string): string | undefined {
  if (!s) return undefined
  const v = String(s).trim().toLowerCase()
  if (/완료|paid|지급완료/.test(v)) return 'completed'
  if (/청구완료|청구|claimed/.test(v)) return 'claimed'
  if (/진행|process/.test(v)) return 'in_progress'
  if (/입금/.test(v)) return 'deposited'
  if (!v || v === '0') return undefined
  return v
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await req.json()
    const fleet_group: string = body.fleet_group || 'unknown'
    const dry_run: boolean = !!body.dry_run
    const rows: IntakeRow[] = Array.isArray(body.rows) ? body.rows : []

    if (rows.length === 0) {
      return NextResponse.json({ error: 'rows 필수' }, { status: 400 })
    }

    const result = {
      fleet_group,
      dry_run,
      input_count: rows.length,
      normalized: [] as any[],
      created: { vehicles: 0, accidents: 0, rentals: 0 },
      updated: { vehicles: 0, accidents: 0 },
      skipped: [] as any[],
      errors: [] as any[],
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      try {
        const ourCarNo = normalizeCarNumber(r.vehicle_car_number)
        const accCarNo = normalizeCarNumber(r.accident_car_number)
        const dispatchAt = toDate(r.dispatch_date)
        const returnAt = toDate(r.return_date)
        const handler = parseContact(r.handler_contact)
        const customer = parseContact(r.customer_contact)
        const birth = parseBirth(r.customer_birth)
        const faultRate = toInt(r.fault_rate)

        const normalized = {
          row_index: i,
          fleet_group,
          our_car_no: ourCarNo,
          our_car_type: r.vehicle_car_type || null,
          accident_car_no: accCarNo,
          accident_car_type: r.accident_car_type || null,
          dispatch_at: dispatchAt?.toISOString() || null,
          return_at: returnAt?.toISOString() || null,
          insurance_company: r.insurance_company || null,
          receipt_no: r.receipt_no || null,
          handler_name: handler.name || null,
          handler_phone: handler.phone || null,
          customer_name: customer.name || null,
          customer_phone: customer.phone || null,
          customer_birth: birth || null,
          address: r.address || null,
          workshop: r.workshop || null,
          fault_rate: faultRate ?? null,
          contract_status: mapStatus(r.contract_status),
          billing_status: mapStatus(r.billing_status),
          payment_status: mapStatus(r.payment_status),
          deposit_date: toDate(r.deposit_date)?.toISOString() || null,
          note: r.note || null,
        }
        result.normalized.push(normalized)

        if (dry_run) continue
        if (!ourCarNo) {
          result.skipped.push({ index: i, reason: '대차차량번호 누락', normalized })
          continue
        }

        // 1) cars upsert (number 매칭) — PR-E3 (2026-05-16) 차량 통합: fmi_vehicles → cars 정본
        //    cars.number 는 unique 아님 → findFirst. car_type/rental_company 는 cars 에 없어 제외.
        let vehicle = await prisma.car.findFirst({ where: { number: ourCarNo } })
        if (!vehicle) {
          vehicle = await prisma.car.create({
            data: {
              number: ourCarNo,
              ownership_type: 'company',
              status: 'active',
            },
          })
          result.created.vehicles++
        }

        // 2) fmi_accidents upsert (by customer_car_number + receipt_no)
        let accident = null as Awaited<ReturnType<typeof prisma.fmiAccident.findFirst>>
        if (accCarNo) {
          accident = await prisma.fmiAccident.findFirst({
            where: {
              customer_car_number: accCarNo,
              ...(r.receipt_no ? { OR: [{ receipt_no: r.receipt_no }, { insurance_claim_no: r.receipt_no }] } : {}),
            },
          })
          if (!accident) {
            accident = await prisma.fmiAccident.create({
              data: {
                receipt_no: r.receipt_no || undefined,
                customer_name: customer.name || handler.name || '',
                customer_phone: customer.phone || undefined,
                customer_car_number: accCarNo,
                customer_car_type: r.accident_car_type || undefined,
                insurance_company: r.insurance_company || undefined,
                insurance_claim_no: r.receipt_no || undefined,
                adjuster_name: handler.name || undefined,
                adjuster_phone: handler.phone || undefined,
                fault_rate: faultRate,
                repair_shop: r.workshop || undefined,
                rental_needed: true,
                rental_status: 'dispatched',
                status: 'in_rental',
                source: `excel:${fleet_group}`,
                raw_data: normalized as any,
              },
            })
            result.created.accidents++
          } else {
            accident = await prisma.fmiAccident.update({
              where: { id: accident.id },
              data: {
                insurance_company: accident.insurance_company || r.insurance_company || undefined,
                adjuster_name: accident.adjuster_name || handler.name || undefined,
                adjuster_phone: accident.adjuster_phone || handler.phone || undefined,
                fault_rate: accident.fault_rate ?? faultRate,
                repair_shop: accident.repair_shop || r.workshop || undefined,
                customer_name: accident.customer_name || customer.name || '',
                customer_phone: accident.customer_phone || customer.phone || undefined,
              },
            })
            result.updated.accidents++
          }
        }

        // 3) fmi_rentals upsert (by vehicle_id + dispatch_date)
        if (dispatchAt) {
          const existingRental = await prisma.fmiRental.findFirst({
            where: {
              vehicle_id: vehicle.id,
              dispatch_date: {
                gte: new Date(dispatchAt.getTime() - 3 * 3600 * 1000),
                lte: new Date(dispatchAt.getTime() + 3 * 3600 * 1000),
              },
            },
          })
          if (!existingRental) {
            await prisma.fmiRental.create({
              data: {
                accident_id: accident?.id,
                customer_name: customer.name || handler.name || '',
                customer_phone: customer.phone || undefined,
                customer_car_number: accCarNo || undefined,
                customer_car_type: r.accident_car_type || undefined,
                vehicle_id: vehicle.id,
                vehicle_car_number: ourCarNo,
                vehicle_car_type: r.vehicle_car_type || undefined,
                insurance_company: r.insurance_company || undefined,
                insurance_claim_no: r.receipt_no || undefined,
                adjuster_name: handler.name || undefined,
                adjuster_phone: handler.phone || undefined,
                dispatch_date: dispatchAt,
                dispatch_location: r.address || r.vehicle_location || undefined,
                expected_return_date: returnAt,
                actual_return_date: normalized.contract_status === 'completed' ? returnAt : undefined,
                handler_name: handler.name || undefined,
                dispatcher_name: handler.name || undefined,
                status: normalized.contract_status === 'completed'
                  ? (normalized.payment_status === 'completed' ? 'settled' : (normalized.billing_status === 'completed' ? 'claiming' : 'returned'))
                  : 'dispatched',
                notes: r.note || undefined,
              },
            })
            result.created.rentals++
          } else {
            result.skipped.push({ index: i, reason: '동일 배차건 이미 존재', rental_id: existingRental.id })
          }
        } else {
          result.skipped.push({ index: i, reason: '출고일 누락' })
        }
      } catch (rowErr: any) {
        result.errors.push({ index: i, error: rowErr.message || String(rowErr) })
      }
    }

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    console.error('[intake-bulk] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ));
}

// ============================================================
// FMI 대차건 관리 API (Prisma)
// GET: 대차건 목록/상세 조회
// POST: 대차건 생성, 상태변경, 배차, 반납 등
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const insurance = searchParams.get('insurance');
    const handler = searchParams.get('handler');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // 대차건 상세 조회
    if (action === 'detail' && id) {
      const rental = await prisma.fmiRental.findUnique({
        where: { id },
        include: { accident: true, vehicle: true },
      });

      if (!rental) {
        return NextResponse.json({ error: '대차건을 찾을 수 없습니다' }, { status: 404 });
      }

      const [timeline, claims] = await prisma.$transaction([
        prisma.fmiRentalTimeline.findMany({
          where: { rental_id: id },
          orderBy: { created_at: 'desc' },
        }),
        prisma.fmiClaim.findMany({
          where: { rental_id: id },
          orderBy: { created_at: 'desc' },
        }),
      ]);

      return NextResponse.json({
        data: serialize({ ...rental, timeline, claims }),
      });
    }

    // 대시보드 요약 (VIEW 직접 쿼리)
    if (action === 'dashboard') {
      const rows = await prisma.$queryRaw<any[]>`SELECT * FROM fmi_dashboard_summary LIMIT 1`;
      const summary = rows[0] ?? null;
      return NextResponse.json({ data: serialize(summary) });
    }

    // 대차건 목록 조회
    const where: Prisma.FmiRentalWhereInput = {};
    if (status) where.status = status;
    if (insurance) where.insurance_company = insurance;
    if (handler) where.handler_id = handler;
    if (from) where.dispatch_date = { gte: new Date(from) };
    if (to) {
      where.dispatch_date = {
        ...(where.dispatch_date as object),
        lte: new Date(to),
      };
    }

    const [rentals, total] = await prisma.$transaction([
      prisma.fmiRental.findMany({
        where,
        include: {
          vehicle: { select: { car_number: true, car_type: true, car_brand: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.fmiRental.count({ where }),
    ]);

    return NextResponse.json({
      data: serialize(rentals),
      pagination: { page, limit, total },
    });

  } catch (error: any) {
    console.error('FMI Rentals GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ...payload } = body;

    switch (action) {
      // ========================================
      // 1. 대차건 생성
      // ========================================
      case 'create': {
        const { accident_id, vehicle_id, daily_rate, dispatch_date, dispatch_location,
          expected_return_date, handler_id, handler_name, notes } = payload;

        // 사고정보
        let accidentData: any = null;
        if (accident_id) {
          accidentData = await prisma.fmiAccident.findUnique({ where: { id: accident_id } });
        }

        // 차량정보
        let vehicleData: any = null;
        if (vehicle_id) {
          vehicleData = await prisma.fmiVehicle.findUnique({ where: { id: vehicle_id } });
        }

        const rentalData = {
          accident_id,
          customer_name: accidentData?.customer_name || payload.customer_name || '',
          customer_phone: accidentData?.customer_phone || payload.customer_phone,
          customer_car_number: accidentData?.customer_car_number || payload.customer_car_number,
          customer_car_type: accidentData?.customer_car_type || payload.customer_car_type,
          vehicle_id,
          vehicle_car_number: vehicleData?.car_number,
          vehicle_car_type: vehicleData?.car_type,
          insurance_company: accidentData?.insurance_company || payload.insurance_company,
          insurance_claim_no: accidentData?.insurance_claim_no || payload.insurance_claim_no,
          adjuster_name: accidentData?.adjuster_name || payload.adjuster_name,
          adjuster_phone: accidentData?.adjuster_phone || payload.adjuster_phone,
          daily_rate,
          dispatch_date: dispatch_date ? new Date(dispatch_date) : undefined,
          dispatch_location,
          expected_return_date: expected_return_date ? new Date(expected_return_date) : undefined,
          dispatch_mileage: vehicleData?.mileage,
          handler_id,
          handler_name,
          notes,
          status: vehicle_id ? 'dispatched' : 'pending',
        };

        const rental = await prisma.fmiRental.create({ data: rentalData });

        // 차량 상태 업데이트
        if (vehicle_id) {
          await prisma.fmiVehicle.update({
            where: { id: vehicle_id },
            data: { status: 'dispatched' },
          });
        }

        // 사고 대차상태 업데이트
        if (accident_id) {
          await prisma.fmiAccident.update({
            where: { id: accident_id },
            data: {
              rental_status: vehicle_id ? 'dispatched' : 'approved',
              rental_needed: true,
            },
          });
        }

        // 타임라인 기록
        await prisma.fmiRentalTimeline.create({
          data: {
            rental_id: rental.id,
            accident_id,
            event_type: 'status_change',
            event_title: vehicle_id ? '대차 배차 완료' : '대차 요청 등록',
            event_detail: vehicle_id
              ? `${vehicleData?.car_number} (${vehicleData?.car_type}) 배차`
              : '대차 배차 대기중',
            new_status: rental.status,
            created_by_name: handler_name,
          },
        });

        return NextResponse.json({ success: true, data: serialize(rental) });
      }

      // ========================================
      // 2. 배차
      // ========================================
      case 'dispatch': {
        const { rental_id, vehicle_id, dispatch_date, dispatch_location,
          dispatch_mileage, dispatcher_name } = payload;

        const vehicle = await prisma.fmiVehicle.findUnique({ where: { id: vehicle_id } });
        if (!vehicle) throw new Error('차량을 찾을 수 없습니다');
        if (vehicle.status !== 'available') throw new Error('배차 불가능한 차량입니다');

        const rental = await prisma.fmiRental.update({
          where: { id: rental_id },
          data: {
            vehicle_id,
            vehicle_car_number: vehicle.car_number,
            vehicle_car_type: vehicle.car_type,
            dispatch_date: dispatch_date ? new Date(dispatch_date) : new Date(),
            dispatch_location,
            dispatch_mileage: dispatch_mileage ?? vehicle.mileage,
            dispatcher_name,
            status: 'dispatched',
          },
        });

        await prisma.fmiVehicle.update({
          where: { id: vehicle_id },
          data: { status: 'dispatched', current_location: dispatch_location },
        });

        if (rental.accident_id) {
          await prisma.fmiAccident.update({
            where: { id: rental.accident_id },
            data: { rental_status: 'dispatched' },
          });
        }

        await prisma.fmiRentalTimeline.create({
          data: {
            rental_id,
            accident_id: rental.accident_id,
            event_type: 'status_change',
            event_title: '배차 완료',
            event_detail: `${vehicle.car_number} (${vehicle.car_type}) → ${rental.customer_name}`,
            old_status: 'pending',
            new_status: 'dispatched',
            created_by_name: dispatcher_name,
          },
        });

        return NextResponse.json({ success: true, data: serialize(rental) });
      }

      // ========================================
      // 3. 반납 처리
      // ========================================
      case 'return': {
        const { rental_id, actual_return_date, return_mileage, return_condition,
          return_fuel_level, return_damage_yn, return_damage_memo,
          return_photos, handler_name: returnHandler } = payload;

        const rental = await prisma.fmiRental.update({
          where: { id: rental_id },
          data: {
            actual_return_date: actual_return_date ? new Date(actual_return_date) : new Date(),
            return_mileage,
            return_condition,
            return_fuel_level,
            return_damage_yn: return_damage_yn || false,
            return_damage_memo,
            return_photos: return_photos || undefined,
            status: 'returned',
          },
        });

        if (rental.vehicle_id) {
          await prisma.fmiVehicle.update({
            where: { id: rental.vehicle_id },
            data: {
              status: return_damage_yn ? 'maintenance' : 'available',
              ...(return_mileage ? { mileage: return_mileage } : {}),
            },
          });
        }

        if (rental.accident_id) {
          await prisma.fmiAccident.update({
            where: { id: rental.accident_id },
            data: { rental_status: 'returned' },
          });
        }

        await prisma.fmiRentalTimeline.create({
          data: {
            rental_id,
            accident_id: rental.accident_id,
            event_type: 'status_change',
            event_title: '반납 완료',
            event_detail: `${rental.rental_days || 0}일 운행, ${rental.driven_km || 0}km 주행`,
            old_status: 'dispatched',
            new_status: 'returned',
            created_by_name: returnHandler,
          },
        });

        return NextResponse.json({ success: true, data: serialize(rental) });
      }

      // ========================================
      // 4. 보험 청구 생성
      // ========================================
      case 'create_claim': {
        const { rental_id, claim_method, handler_name: claimHandler } = payload;

        const rental = await prisma.fmiRental.findUnique({ where: { id: rental_id } });
        if (!rental) throw new Error('대차건을 찾을 수 없습니다');

        const claim = await prisma.fmiClaim.create({
          data: {
            rental_id,
            accident_id: rental.accident_id,
            insurance_company: rental.insurance_company || '',
            insurance_claim_no: rental.insurance_claim_no,
            rental_fee: rental.total_rental_fee,
            additional_charges: rental.additional_charges ?? 0,
            total_claim_amount: rental.final_claim_amount,
            claim_method: claim_method || 'fax',
            claim_date: new Date(),
            status: 'ready',
            handler_name: claimHandler,
          },
        });

        await prisma.fmiRental.update({
          where: { id: rental_id },
          data: { status: 'claiming' },
        });

        const claimAmtStr = rental.final_claim_amount?.toString() ?? '0';
        await prisma.fmiRentalTimeline.create({
          data: {
            rental_id,
            accident_id: rental.accident_id,
            event_type: 'status_change',
            event_title: '보험 청구 생성',
            event_detail: `${rental.insurance_company} / ${claim.claim_no} / ${claimAmtStr}원`,
            old_status: 'returned',
            new_status: 'claiming',
            created_by_name: claimHandler,
          },
        });

        return NextResponse.json({ success: true, data: serialize(claim) });
      }

      // ========================================
      // 5. 입금/정산 처리
      // ========================================
      case 'settle': {
        const { claim_id, rental_id: settleRentalId, amount, payment_date,
          payment_method, bank_name, depositor, transaction_no,
          handler_name: settleHandler } = payload;

        const settlement = await prisma.fmiSettlement.create({
          data: {
            claim_id,
            rental_id: settleRentalId,
            settlement_type: 'insurance_payment',
            amount,
            payment_date: payment_date ? new Date(payment_date) : new Date(),
            payment_method,
            bank_name,
            depositor,
            transaction_no,
            matched: true,
          },
        });

        if (claim_id) {
          await prisma.fmiClaim.update({
            where: { id: claim_id },
            data: {
              status: 'paid',
              approved_amount: amount,
              response_date: new Date(),
            },
          });
        }

        if (settleRentalId) {
          await prisma.fmiRental.update({
            where: { id: settleRentalId },
            data: { status: 'settled' },
          });

          const rentalForTimeline = await prisma.fmiRental.findUnique({
            where: { id: settleRentalId },
            select: { accident_id: true },
          });

          const amtStr = amount?.toLocaleString?.() ?? String(amount);
          await prisma.fmiRentalTimeline.create({
            data: {
              rental_id: settleRentalId,
              accident_id: rentalForTimeline?.accident_id,
              event_type: 'status_change',
              event_title: '정산 완료',
              event_detail: `${amtStr}원 입금 (${depositor || bank_name})`,
              old_status: 'claiming',
              new_status: 'settled',
              created_by_name: settleHandler,
            },
          });
        }

        return NextResponse.json({ success: true, data: serialize(settlement) });
      }

      // ========================================
      // 6. 메모/노트 추가
      // ========================================
      case 'add_note': {
        const { rental_id: noteRentalId, title, detail, created_by_name } = payload;

        const timeline = await prisma.fmiRentalTimeline.create({
          data: {
            rental_id: noteRentalId,
            event_type: 'note',
            event_title: title || '메모',
            event_detail: detail,
            created_by_name,
          },
        });

        return NextResponse.json({ success: true, data: serialize(timeline) });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('FMI Rental API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

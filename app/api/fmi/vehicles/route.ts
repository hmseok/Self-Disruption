import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// Decimal, Date 등 직렬화 헬퍼
function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ));
}

// ============================================================
// FMI 차량 관리 API (Prisma)
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const ownership = searchParams.get('ownership');

    // 차량 상세
    if (action === 'detail' && id) {
      const vehicle = await prisma.fmiVehicle.findUnique({
        where: { id },
      });

      if (!vehicle) {
        return NextResponse.json({ error: '차량을 찾을 수 없습니다' }, { status: 404 });
      }

      const rentalHistory = await prisma.fmiRental.findMany({
        where: { vehicle_id: id },
        select: {
          id: true,
          rental_no: true,
          customer_name: true,
          dispatch_date: true,
          actual_return_date: true,
          rental_days: true,
          total_rental_fee: true,
          status: true,
        },
        orderBy: { dispatch_date: 'desc' },
        take: 20,
      });

      return NextResponse.json({
        data: serialize({ ...vehicle, rental_history: rentalHistory }),
      });
    }

    // 배차 가능 차량 목록
    if (action === 'available') {
      const vehicles = await prisma.fmiVehicle.findMany({
        where: { status: 'available' },
        orderBy: { car_type: 'asc' },
      });
      return NextResponse.json({ data: serialize(vehicles) });
    }

    // 차량 현황 요약
    if (action === 'summary') {
      const vehicles = await prisma.fmiVehicle.findMany({
        select: { status: true, ownership_type: true },
      });

      const summary = {
        total: vehicles.length,
        by_status: {} as Record<string, number>,
        by_ownership: {} as Record<string, number>,
      };

      vehicles.forEach(v => {
        summary.by_status[v.status] = (summary.by_status[v.status] || 0) + 1;
        summary.by_ownership[v.ownership_type] = (summary.by_ownership[v.ownership_type] || 0) + 1;
      });

      return NextResponse.json({ data: summary });
    }

    // 차량 목록
    const where: Prisma.FmiVehicleWhereInput = {};
    if (status) where.status = status;
    if (ownership) where.ownership_type = ownership;

    const [vehicles, total] = await prisma.$transaction([
      prisma.fmiVehicle.findMany({
        where,
        orderBy: { created_at: 'desc' },
      }),
      prisma.fmiVehicle.count({ where }),
    ]);

    return NextResponse.json({ data: serialize(vehicles), total });

  } catch (error: any) {
    console.error('FMI Vehicles GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ...payload } = body;

    switch (action) {
      // 차량 등록
      case 'create': {
        const vehicle = await prisma.fmiVehicle.create({
          data: payload,
        });
        return NextResponse.json({ success: true, data: serialize(vehicle) });
      }

      // 차량 정보 수정
      case 'update': {
        const { id, ...updateData } = payload;
        const vehicle = await prisma.fmiVehicle.update({
          where: { id },
          data: updateData,
        });
        return NextResponse.json({ success: true, data: serialize(vehicle) });
      }

      // 차량 상태 변경
      case 'change_status': {
        const { id, status: newStatus, notes } = payload;
        const vehicle = await prisma.fmiVehicle.update({
          where: { id },
          data: { status: newStatus, notes },
        });
        return NextResponse.json({ success: true, data: serialize(vehicle) });
      }

      // 차량 비활성화 (폐차/매각)
      case 'deactivate': {
        const { id, reason } = payload;
        const vehicle = await prisma.fmiVehicle.update({
          where: { id },
          data: { status: 'inactive', notes: reason },
        });
        return NextResponse.json({ success: true, data: serialize(vehicle) });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('FMI Vehicles POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

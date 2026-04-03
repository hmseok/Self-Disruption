import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ));
}

// ============================================================
// FMI 보험 청구 관리 API (Prisma)
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';
    const status = searchParams.get('status');
    const insurance = searchParams.get('insurance');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // 청구 현황 요약
    if (action === 'summary') {
      const claims = await prisma.fmiClaim.findMany({
        select: { status: true, total_claim_amount: true, approved_amount: true },
      });

      const summary = {
        total: claims.length,
        by_status: {} as Record<string, { count: number; amount: number }>,
        total_claimed: 0,
        total_approved: 0,
        total_pending: 0,
      };

      claims.forEach(c => {
        const claimAmt = Number(c.total_claim_amount ?? 0);
        const approvedAmt = Number(c.approved_amount ?? 0);

        if (!summary.by_status[c.status]) {
          summary.by_status[c.status] = { count: 0, amount: 0 };
        }
        summary.by_status[c.status].count++;
        summary.by_status[c.status].amount += claimAmt;
        summary.total_claimed += claimAmt;
        summary.total_approved += approvedAmt;

        if (['sent', 'received', 'under_review'].includes(c.status)) {
          summary.total_pending += claimAmt;
        }
      });

      return NextResponse.json({ data: summary });
    }

    // 보험사별 청구 현황
    if (action === 'by_insurance') {
      const claims = await prisma.fmiClaim.findMany({
        select: {
          insurance_company: true,
          status: true,
          total_claim_amount: true,
          approved_amount: true,
        },
      });

      const byInsurance: Record<string, { total: number; claimed: number; approved: number; pending: number }> = {};

      claims.forEach(c => {
        const ins = c.insurance_company || '미지정';
        if (!byInsurance[ins]) {
          byInsurance[ins] = { total: 0, claimed: 0, approved: 0, pending: 0 };
        }
        byInsurance[ins].total++;
        byInsurance[ins].claimed += Number(c.total_claim_amount ?? 0);
        byInsurance[ins].approved += Number(c.approved_amount ?? 0);
        if (['sent', 'received', 'under_review'].includes(c.status)) {
          byInsurance[ins].pending += Number(c.total_claim_amount ?? 0);
        }
      });

      return NextResponse.json({ data: byInsurance });
    }

    // 청구 목록
    const where: Prisma.FmiClaimWhereInput = {};
    if (status) where.status = status;
    if (insurance) where.insurance_company = insurance;
    if (from) where.claim_date = { gte: new Date(from) };
    if (to) {
      where.claim_date = {
        ...(where.claim_date as object),
        lte: new Date(to),
      };
    }

    const [claims, total] = await prisma.$transaction([
      prisma.fmiClaim.findMany({
        where,
        include: {
          rental: {
            select: {
              rental_no: true,
              customer_name: true,
              vehicle_car_number: true,
              rental_days: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.fmiClaim.count({ where }),
    ]);

    return NextResponse.json({ data: serialize(claims), total });

  } catch (error: any) {
    console.error('FMI Claims GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ...payload } = body;

    switch (action) {
      // 청구서 발송 처리
      case 'send': {
        const { claim_id, claim_method, fax_number } = payload;

        const claim = await prisma.fmiClaim.update({
          where: { id: claim_id },
          data: {
            status: 'sent',
            claim_method,
            fax_number,
            claim_date: new Date(),
            fax_sent_at: claim_method === 'fax' ? new Date() : null,
          },
        });

        return NextResponse.json({ success: true, data: serialize(claim) });
      }

      // 보험사 응답 등록
      case 'response': {
        const { claim_id, approved_amount, rejected_amount, rejection_reason, negotiation_memo } = payload;

        let newStatus = 'approved';
        if (rejected_amount > 0 && approved_amount > 0) newStatus = 'partial_approved';
        else if (rejected_amount > 0 && !approved_amount) newStatus = 'rejected';

        const claim = await prisma.fmiClaim.update({
          where: { id: claim_id },
          data: {
            status: newStatus,
            approved_amount,
            rejected_amount,
            rejection_reason,
            negotiation_memo,
            response_date: new Date(),
          },
        });

        return NextResponse.json({ success: true, data: serialize(claim) });
      }

      // 재청구
      case 'resubmit': {
        const { claim_id, new_amount, memo } = payload;

        const claim = await prisma.fmiClaim.update({
          where: { id: claim_id },
          data: {
            status: 'resubmitted',
            ...(new_amount ? { total_claim_amount: new_amount } : {}),
            negotiation_memo: memo,
            claim_date: new Date(),
          },
        });

        return NextResponse.json({ success: true, data: serialize(claim) });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('FMI Claims POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

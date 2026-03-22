import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ============================================================
// FMI 대차건 관리 API
// GET: 대차건 목록/상세 조회
// POST: 대차건 생성, 상태변경, 배차, 반납 등
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
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
      const { data, error } = await supabase
        .from('fmi_rentals')
        .select('*, fmi_accidents(*), fmi_vehicles(*)')
        .eq('id', id)
        .single();

      if (error) throw error;

      // 타임라인 조회
      const { data: timeline } = await supabase
        .from('fmi_rental_timeline')
        .select('*')
        .eq('rental_id', id)
        .order('created_at', { ascending: false });

      // 청구 조회
      const { data: claims } = await supabase
        .from('fmi_claims')
        .select('*')
        .eq('rental_id', id)
        .order('created_at', { ascending: false });

      return NextResponse.json({ data: { ...data, timeline, claims } });
    }

    // 대시보드 요약
    if (action === 'dashboard') {
      const { data } = await supabase.rpc('', {}).maybeSingle();
      // 대시보드 뷰 직접 쿼리
      const { data: summary } = await supabase
        .from('fmi_dashboard_summary')
        .select('*')
        .single();

      return NextResponse.json({ data: summary });
    }

    // 대차건 목록 조회
    let query = supabase
      .from('fmi_rentals')
      .select('*, fmi_vehicles(car_number, car_type, car_brand)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status) query = query.eq('status', status);
    if (insurance) query = query.eq('insurance_company', insurance);
    if (handler) query = query.eq('handler_id', handler);
    if (from) query = query.gte('dispatch_date', from);
    if (to) query = query.lte('dispatch_date', to);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data,
      pagination: { page, limit, total: count }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json();
    const { action, ...payload } = body;

    switch (action) {
      // ========================================
      // 1. 대차건 생성 (사고접수에서 대차 요청)
      // ========================================
      case 'create': {
        const { accident_id, vehicle_id, daily_rate, dispatch_date, dispatch_location,
          expected_return_date, handler_id, handler_name, notes } = payload;

        // 사고정보 가져오기
        let accidentData = null;
        if (accident_id) {
          const { data } = await supabase
            .from('fmi_accidents')
            .select('*')
            .eq('id', accident_id)
            .single();
          accidentData = data;
        }

        // 차량정보 가져오기
        let vehicleData = null;
        if (vehicle_id) {
          const { data } = await supabase
            .from('fmi_vehicles')
            .select('*')
            .eq('id', vehicle_id)
            .single();
          vehicleData = data;
        }

        const rentalData = {
          accident_id,
          customer_name: accidentData?.customer_name || payload.customer_name,
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
          dispatch_date,
          dispatch_location,
          expected_return_date,
          dispatch_mileage: vehicleData?.mileage,
          handler_id,
          handler_name,
          notes,
          status: vehicle_id ? 'dispatched' : 'pending',
        };

        const { data: rental, error } = await supabase
          .from('fmi_rentals')
          .insert(rentalData)
          .select()
          .single();

        if (error) throw error;

        // 차량 상태 업데이트
        if (vehicle_id) {
          await supabase
            .from('fmi_vehicles')
            .update({ status: 'dispatched' })
            .eq('id', vehicle_id);
        }

        // 사고 대차상태 업데이트
        if (accident_id) {
          await supabase
            .from('fmi_accidents')
            .update({
              rental_status: vehicle_id ? 'dispatched' : 'approved',
              rental_needed: true
            })
            .eq('id', accident_id);
        }

        // 타임라인 기록
        await supabase.from('fmi_rental_timeline').insert({
          rental_id: rental.id,
          accident_id,
          event_type: 'status_change',
          event_title: vehicle_id ? '대차 배차 완료' : '대차 요청 등록',
          event_detail: vehicle_id
            ? `${vehicleData?.car_number} (${vehicleData?.car_type}) 배차`
            : '대차 배차 대기중',
          new_status: rental.status,
          created_by_name: handler_name,
        });

        return NextResponse.json({ success: true, data: rental });
      }

      // ========================================
      // 2. 배차 (차량 배정)
      // ========================================
      case 'dispatch': {
        const { rental_id, vehicle_id, dispatch_date, dispatch_location, dispatch_mileage, dispatcher_name } = payload;

        // 차량 정보
        const { data: vehicle } = await supabase
          .from('fmi_vehicles')
          .select('*')
          .eq('id', vehicle_id)
          .single();

        if (!vehicle) throw new Error('차량을 찾을 수 없습니다');
        if (vehicle.status !== 'available') throw new Error('배차 불가능한 차량입니다');

        // 대차건 업데이트
        const { data: rental, error } = await supabase
          .from('fmi_rentals')
          .update({
            vehicle_id,
            vehicle_car_number: vehicle.car_number,
            vehicle_car_type: vehicle.car_type,
            dispatch_date: dispatch_date || new Date().toISOString(),
            dispatch_location,
            dispatch_mileage: dispatch_mileage || vehicle.mileage,
            dispatcher_name,
            status: 'dispatched'
          })
          .eq('id', rental_id)
          .select()
          .single();

        if (error) throw error;

        // 차량 상태 변경
        await supabase
          .from('fmi_vehicles')
          .update({ status: 'dispatched', current_location: dispatch_location })
          .eq('id', vehicle_id);

        // 사고 대차상태 업데이트
        if (rental?.accident_id) {
          await supabase
            .from('fmi_accidents')
            .update({ rental_status: 'dispatched' })
            .eq('id', rental.accident_id);
        }

        // 타임라인
        await supabase.from('fmi_rental_timeline').insert({
          rental_id,
          accident_id: rental?.accident_id,
          event_type: 'status_change',
          event_title: '배차 완료',
          event_detail: `${vehicle.car_number} (${vehicle.car_type}) → ${rental?.customer_name}`,
          old_status: 'pending',
          new_status: 'dispatched',
          created_by_name: dispatcher_name,
        });

        return NextResponse.json({ success: true, data: rental });
      }

      // ========================================
      // 3. 반납 처리
      // ========================================
      case 'return': {
        const { rental_id, actual_return_date, return_mileage, return_condition,
          return_fuel_level, return_damage_yn, return_damage_memo, return_photos, handler_name: returnHandler } = payload;

        const { data: rental, error } = await supabase
          .from('fmi_rentals')
          .update({
            actual_return_date: actual_return_date || new Date().toISOString(),
            return_mileage,
            return_condition,
            return_fuel_level,
            return_damage_yn: return_damage_yn || false,
            return_damage_memo,
            return_photos,
            status: 'returned'
          })
          .eq('id', rental_id)
          .select()
          .single();

        if (error) throw error;

        // 차량 상태 → 반납완료(정비대기)
        if (rental?.vehicle_id) {
          await supabase
            .from('fmi_vehicles')
            .update({
              status: return_damage_yn ? 'maintenance' : 'available',
              mileage: return_mileage || undefined
            })
            .eq('id', rental.vehicle_id);
        }

        // 사고 대차상태
        if (rental?.accident_id) {
          await supabase
            .from('fmi_accidents')
            .update({ rental_status: 'returned' })
            .eq('id', rental.accident_id);
        }

        // 타임라인
        await supabase.from('fmi_rental_timeline').insert({
          rental_id,
          accident_id: rental?.accident_id,
          event_type: 'status_change',
          event_title: '반납 완료',
          event_detail: `${rental?.rental_days || 0}일 운행, ${rental?.driven_km || 0}km 주행`,
          old_status: 'dispatched',
          new_status: 'returned',
          created_by_name: returnHandler,
        });

        return NextResponse.json({ success: true, data: rental });
      }

      // ========================================
      // 4. 보험 청구 생성
      // ========================================
      case 'create_claim': {
        const { rental_id, claim_method, handler_name: claimHandler } = payload;

        // 대차건 정보
        const { data: rental } = await supabase
          .from('fmi_rentals')
          .select('*')
          .eq('id', rental_id)
          .single();

        if (!rental) throw new Error('대차건을 찾을 수 없습니다');

        const claimData = {
          rental_id,
          accident_id: rental.accident_id,
          insurance_company: rental.insurance_company,
          insurance_claim_no: rental.insurance_claim_no,
          rental_fee: rental.total_rental_fee,
          additional_charges: rental.additional_charges || 0,
          total_claim_amount: rental.final_claim_amount,
          claim_method: claim_method || 'fax',
          claim_date: new Date().toISOString(),
          status: 'ready',
          handler_name: claimHandler,
        };

        const { data: claim, error } = await supabase
          .from('fmi_claims')
          .insert(claimData)
          .select()
          .single();

        if (error) throw error;

        // 대차건 상태 업데이트
        await supabase
          .from('fmi_rentals')
          .update({ status: 'claiming' })
          .eq('id', rental_id);

        // 타임라인
        await supabase.from('fmi_rental_timeline').insert({
          rental_id,
          accident_id: rental.accident_id,
          event_type: 'status_change',
          event_title: '보험 청구 생성',
          event_detail: `${rental.insurance_company} / ${claim.claim_no} / ${rental.final_claim_amount?.toLocaleString()}원`,
          old_status: 'returned',
          new_status: 'claiming',
          created_by_name: claimHandler,
        });

        return NextResponse.json({ success: true, data: claim });
      }

      // ========================================
      // 5. 입금/정산 처리
      // ========================================
      case 'settle': {
        const { claim_id, rental_id: settleRentalId, amount, payment_date, payment_method,
          bank_name, depositor, transaction_no, handler_name: settleHandler } = payload;

        const settlementData = {
          claim_id,
          rental_id: settleRentalId,
          settlement_type: 'insurance_payment',
          amount,
          payment_date: payment_date || new Date().toISOString().split('T')[0],
          payment_method,
          bank_name,
          depositor,
          transaction_no,
          matched: true,
        };

        const { data: settlement, error } = await supabase
          .from('fmi_settlements')
          .insert(settlementData)
          .select()
          .single();

        if (error) throw error;

        // 청구 상태 업데이트
        if (claim_id) {
          await supabase
            .from('fmi_claims')
            .update({
              status: 'paid',
              approved_amount: amount,
              response_date: new Date().toISOString()
            })
            .eq('id', claim_id);
        }

        // 대차건 상태 업데이트
        if (settleRentalId) {
          await supabase
            .from('fmi_rentals')
            .update({ status: 'settled' })
            .eq('id', settleRentalId);

          // 타임라인
          const { data: rental } = await supabase
            .from('fmi_rentals')
            .select('accident_id')
            .eq('id', settleRentalId)
            .single();

          await supabase.from('fmi_rental_timeline').insert({
            rental_id: settleRentalId,
            accident_id: rental?.accident_id,
            event_type: 'status_change',
            event_title: '정산 완료',
            event_detail: `${amount?.toLocaleString()}원 입금 (${depositor || bank_name})`,
            old_status: 'claiming',
            new_status: 'settled',
            created_by_name: settleHandler,
          });
        }

        return NextResponse.json({ success: true, data: settlement });
      }

      // ========================================
      // 6. 메모/노트 추가
      // ========================================
      case 'add_note': {
        const { rental_id: noteRentalId, title, detail, created_by_name } = payload;

        const { data, error } = await supabase
          .from('fmi_rental_timeline')
          .insert({
            rental_id: noteRentalId,
            event_type: 'note',
            event_title: title || '메모',
            event_detail: detail,
            created_by_name,
          })
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('FMI Rental API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

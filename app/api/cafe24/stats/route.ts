import { NextRequest, NextResponse } from 'next/server';
import { getCafe24Pool } from '../lib/db';

// 카페24 DB 통계 및 대시보드 데이터
export async function GET(req: NextRequest) {
  try {
    const pool = getCafe24Pool();

    // 병렬로 여러 통계 조회
    const [
      [accidentToday],
      [accidentMonth],
      [vehicleToday],
      [vehicleMonth],
      [accidentByStatus],
      [recentAccidents],
    ] = await Promise.all([
      // 오늘 사고접수 건수
      pool.query(
        `SELECT COUNT(*) as cnt FROM acrotpth WHERE otptrgst = 'R' AND otptgndt = DATE_FORMAT(NOW(), '%Y%m%d')`
      ),
      // 이번달 사고접수 건수
      pool.query(
        `SELECT COUNT(*) as cnt FROM acrotpth WHERE otptrgst = 'R' AND otptgndt >= DATE_FORMAT(NOW(), '%Y%m01')`
      ),
      // 오늘 차량 출고 건수
      pool.query(
        `SELECT COUNT(*) as cnt FROM pmccarsm WHERE carsgndt = DATE_FORMAT(NOW(), '%Y%m%d')`
      ),
      // 이번달 차량 출고 건수
      pool.query(
        `SELECT COUNT(*) as cnt FROM pmccarsm WHERE carsgndt >= DATE_FORMAT(NOW(), '%Y%m01')`
      ),
      // 사고접수 상태별 건수 (최근 30일)
      pool.query(
        `SELECT otptstat as status, COUNT(*) as cnt
         FROM acrotpth
         WHERE otptrgst = 'R' AND otptgndt >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 30 DAY), '%Y%m%d')
         GROUP BY otptstat`
      ),
      // 최근 사고접수 5건
      pool.query(
        `SELECT otptacnu as accidentNo, otptacdt as accidentDate, otptactm as accidentTime,
                otptdsnm as repairShop, otptcanm as counterpart, otptstat as status,
                otptacad as location
         FROM acrotpth
         WHERE otptrgst = 'R'
         ORDER BY otptgndt DESC, otptgntm DESC
         LIMIT 5`
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        accidents: {
          today: (accidentToday as any[])[0].cnt,
          month: (accidentMonth as any[])[0].cnt,
          byStatus: accidentByStatus,
          recent: recentAccidents,
        },
        vehicles: {
          today: (vehicleToday as any[])[0].cnt,
          month: (vehicleMonth as any[])[0].cnt,
        }
      }
    });
  } catch (error: any) {
    console.error('카페24 통계 조회 에러:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

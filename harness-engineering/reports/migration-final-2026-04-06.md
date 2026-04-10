# Supabase → MySQL 최종 마이그레이션 보고서

**날짜**: 2026-04-06
**결과**: ✅ 데이터 손실 0건

## 최종 수치

| 지표 | Supabase (소스) | MySQL (타겟) | 상태 |
|------|----------------|-------------|------|
| 전체 테이블 | 133 | 135 | +2 (MySQL 전용) |
| MATCH | — | 128 | 100% 일치 |
| MYSQL_MORE | — | 4 | 정상 (member_invitations, message_send_logs, profiles, cars) |
| MISSING | — | 1 | fmi_dashboard_summary (뷰, 전부 0 값) |
| 전체 row 수 | ≈2013 | 2840 | MySQL에 추가 운영 데이터 존재 |
| 데이터 손실 | — | **0건** | ✅ |

## 실행 기록

1. **Dry-run**: 53 테이블 / 926 row / 0 에러 / DDL 검증 완료
2. **1차 실행**: 48 성공 / 5 실패 (스키마 충돌)
3. **패치 반영**: 뷰 스킵 + TEXT→VARCHAR PK + ALTER TABLE ADD COLUMN
4. **2차 실행**: 53/53 성공 / 41 컬럼 자동 추가
5. **빈 테이블 스키마**: 40 테이블 CREATE_ONLY로 보존
6. **최종 verify**: 128 MATCH + 4 MYSQL_MORE

## 남은 이슈

### fmi_dashboard_summary (Supabase View)
- Supabase의 뷰 (다른 테이블에서 집계된 1 row)
- 모든 값이 0 (실제 집계 데이터 없음)
- **결정**: Step 6 백엔드 리팩토링에서 MySQL SQL 집계 쿼리로 대체
- 원본 컬럼: vehicles_(available|dispatched|maintenance|total), rentals_(pending|active|returned|claiming), claims_(draft|sent|approved|pending_amount|paid_this_month), revenue_this_month, expense_this_month

## 다음 단계

- [ ] Step 5: Storage 버킷 백업 (contracts 등)
- [ ] Step 6: 프론트엔드 6개 파일 supabase.from → fetch 전환, 대시보드 뷰 대체
- [ ] Step 7: 최종 검증 → Supabase 구독 해지

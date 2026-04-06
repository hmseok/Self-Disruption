# Supabase 전수조사 (2026-04-06)

> Supabase 구독 해지 전 누락 방지용 전수조사 결과.
> 출처: service_role key로 `GET /rest/v1/` (OpenAPI) + 각 테이블 `HEAD ?select=* Prefer: count=exact`.

## 요약

| 구분 | 개수 |
|------|------|
| 전체 테이블 | 133 |
| 데이터 있음 (nonzero) | 75 |
| 비어있음 (zero) | 58 |

이미 MySQL로 sync 완료된 테이블 (이전 세션):
- cars (18), car_costs (74), vehicle_operations (404), accident_records (15)

## 데이터 있음 (75개) — 내림차순

| # | table | rows | 비고 |
|---|-------|------|------|
| 1 | classification_queue | 708 | |
| 2 | vehicle_operations | 404 | ✅ sync 완료 |
| 3 | transactions | 349 | |
| 4 | message_send_logs | 100 | |
| 5 | code_master | 91 | |
| 6 | expense_receipts | 82 | |
| 7 | car_costs | 74 | ✅ sync 완료 |
| 8 | message_templates | 63 | |
| 9 | vehicle_standard_codes | 62 | |
| 10 | car_code_options | 57 | |
| 11 | car_code_trims | 56 | |
| 12 | system_modules | 51 | |
| 13 | finance_categories | 41 | |
| 14 | trigger_debug_log | 38 | 로그? 이전 불필요할 수도 |
| 15 | depreciation_rates | 35 | |
| 16 | inspection_cost_table | 35 | |
| 17 | contract_term_articles | 31 | |
| 18 | business_rules | 27 | |
| 19 | inspection_schedule_table | 27 | |
| 20 | positions | 24 | |
| 21 | insurance_rate_table | 23 | |
| 22 | depreciation_db | 22 | |
| 23 | registration_cost_table | 22 | |
| 24 | member_invitations | 21 | |
| 25 | insurance_own_vehicle_rate | 20 | |
| 26 | transaction_flags | 20 | |
| 27 | cars | 18 | ✅ sync 완료 |
| 28 | freelancers | 18 | |
| 29 | maintenance_cost_table | 18 | |
| 30 | car_code_models | 17 | |
| 31 | departments | 17 | |
| 32 | lotte_rentcar_db | 17 | |
| 33 | corporate_cards | 16 | |
| 34 | accident_records | 15 | ✅ sync 완료 |
| 35 | fmi_insurance_companies | 14 | |
| 36 | pricing_worksheets | 13 | |
| 37 | common_codes | 12 | |
| 38 | depreciation_adjustments | 12 | |
| 39 | emission_standard_table | 12 | |
| 40 | finance_rate_table | 11 | |
| 41 | maintenance_db | 11 | |
| 42 | fmi_daily_rates | 10 | |
| 43 | inspection_penalty_table | 10 | |
| 44 | insurance_contracts | 10 | |
| 45 | quotes | 8 | |
| 46 | contract_sending_logs | 7 | |
| 47 | insurance_policy_record | 7 | |
| 48 | user_page_permissions | 6 | |
| 49 | admin_invite_codes | 5 | |
| 50 | insurance_vehicle_group | 5 | |
| 51 | settlement_shares | 5 | |
| 52 | contract_special_terms | 4 | |
| 53 | insurance_rate_stats | 4 | |
| 54 | profiles | 4 | ⚠️ auth.users와 연관 |
| 55 | vehicle_model_codes | 4 | |
| 56 | vehicle_tax_table | 4 | |
| 57 | finance_rules | 3 | |
| 58 | jiip_contracts | 3 | |
| 59 | page_permissions | 3 | |
| 60 | card_limit_settings | 2 | |
| 61 | employee_salaries | 2 | |
| 62 | general_investments | 2 | |
| 63 | insurance_base_premium | 2 | |
| 64 | new_car_prices | 2 | |
| 65 | payslips | 2 | |
| 66 | quote_share_tokens | 2 | |
| 67 | card_assignment_history | 1 | |
| 68 | contract_terms | 1 | |
| 69 | customers | 1 | 🟡 현재 작업 중 |
| 70 | dept_position_roles | 1 | |
| 71 | fmi_dashboard_summary | 1 | 뷰일 수도 |
| 72 | permission_roles | 1 | |
| 73 | role_page_permissions | 1 | |
| 74 | saved_quotes | 1 | |
| 75 | user_corporate_cards | 1 | |

## 비어있음 (58개)

스키마만 필요 (데이터 이전 불필요):

assignment_log, assignment_rules, assignments, audit_log, codef_connections, codef_sync_logs, company_roles, contract_documents, contract_status_history, contract_term_history, contracts, customer_notes, customer_payments, customer_settings, customer_signatures, customer_tax_invoices, depreciation_history, device_tokens, expected_payment_schedules, financial_products, fmi_accidents, fmi_claims, fmi_payments, fmi_rental_timeline, fmi_rentals, fmi_settlements, fmi_vehicles, freelancer_payments, handler_capacity, inspection_records, insurance_discount_grade, investigation_logs, investigators, investment_deposits, investments, loans, lotte_reference_rates, maintenance_records, maintenance_requests, market_comparisons, meal_expense_monthly, operation_templates, payment_schedules, quote_lifecycle_events, salary_adjustments, schedules, service_products, short_term_quotes, short_term_rates, short_term_rental_contracts, tax_filing_records, tax_items, turnkey_contracts, vehicle_handovers, vehicle_overrides, vehicle_schedules, vehicle_status_log, vehicle_trims

## 남은 작업 (데이터 있음, 미이전)

nonzero 75 − 이미 완료 4 = **71개 테이블의 데이터 이전 필요**

총 row 수 = 약 3,850건 (trigger_debug_log 38 제외 시)

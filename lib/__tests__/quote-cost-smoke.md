# quote-cost 스모크 테스트 가이드 (PR-Q2-2)

> jest/vitest 미설치 환경. 배포 후 `curl` 또는 브라우저로 직접 호출하여 산출값 검증.
> Q2-2 의 엔진 추출 결과가 기존 `SimulationPanel` 과 ±1% 오차 이내인지 확인 목적.

## 사용 토큰 (실행 전)

```bash
# 브라우저 로그인 후 DevTools → Application → localStorage → fmi_token 값 복사
export TOKEN="<여기에 fmi_token 값>"
export HOST="https://hmseok.com"   # 또는 http://localhost:3000
```

## 1. 캐시 진단 (14 테이블 row count)

```bash
curl -s "$HOST/api/lt-quotes/calculate" -H "Authorization: Bearer $TOKEN" | jq
```

**기대 결과**:
```json
{
  "reference_summary": {
    "rules": 10+,
    "dep_rates": 1+,
    "tax_rates": 1+,
    "finance_rates": 1+,
    ...
    "loaded_at_iso": "2026-05-26T...",
    "cache_age_sec": 0
  }
}
```

값이 모두 `0` 이면 마이그레이션이 누락됐거나 시드 미적용. SimulationPanel 도 동작 안 함.

## 2. 5개 케이스 산출 (회귀 비교)

### CASE 1: 모닝 (기아 경차)
```bash
curl -X POST "$HOST/api/lt-quotes/calculate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purchase_price": 14900000, "brand": "기아", "model": "모닝",
    "fuel": "gasoline", "engine_cc": 998,
    "term_months": 36, "annual_km": 20000, "rent_type": "return"
  }' | jq .data
```

**기대치 (SimulationPanel 동일 입력 기준 ±1%)**:
- `suggested_rent_with_vat`: 약 280,000 ~ 350,000원
- `margin_rate`: 5 ~ 15%
- `cost_breakdown.depreciation`: 최대 항목

### CASE 2: 아반떼 (현대 준중형)
```bash
curl -X POST "$HOST/api/lt-quotes/calculate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purchase_price": 22000000, "brand": "현대", "model": "아반떼",
    "fuel": "gasoline", "engine_cc": 1598,
    "term_months": 36, "annual_km": 20000, "rent_type": "return"
  }' | jq .data
```

**기대치**:
- `suggested_rent_with_vat`: 약 420,000 ~ 520,000원

### CASE 3: 쏘나타 (현대 중형)
```bash
curl -X POST "$HOST/api/lt-quotes/calculate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purchase_price": 35000000, "brand": "현대", "model": "쏘나타",
    "fuel": "gasoline", "engine_cc": 1999,
    "term_months": 36, "annual_km": 20000, "rent_type": "return"
  }' | jq .data
```

**기대치**:
- `suggested_rent_with_vat`: 약 670,000 ~ 820,000원
- `irr_annual`: 5 ~ 12%

### CASE 4: 그랜저 (현대 준대형)
```bash
curl -X POST "$HOST/api/lt-quotes/calculate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purchase_price": 45000000, "brand": "현대", "model": "그랜저",
    "fuel": "gasoline", "engine_cc": 2497,
    "term_months": 36, "annual_km": 20000, "rent_type": "return"
  }' | jq .data
```

**기대치**:
- `suggested_rent_with_vat`: 약 880,000 ~ 1,100,000원

### CASE 5: BMW 520i (수입 준대형)
```bash
curl -X POST "$HOST/api/lt-quotes/calculate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purchase_price": 68000000, "brand": "BMW", "model": "520i",
    "fuel": "gasoline", "engine_cc": 1998,
    "term_months": 36, "annual_km": 20000, "rent_type": "return"
  }' | jq .data
```

**기대치**:
- `suggested_rent_with_vat`: 약 1,400,000 ~ 1,700,000원
- `competitive_index`: 1.0+ (수입차는 시장 대비 약간 높음)

## 3. 동작 검증 체크리스트

- [ ] `reference_summary` 모든 키 값 > 0 (14 테이블 정상 fetch)
- [ ] 5 케이스 모두 200 응답
- [ ] `cost_breakdown.depreciation > 0` (감가 0 이면 dep_rates 매칭 실패)
- [ ] `cost_breakdown.finance > 0` (금융 0 이면 finance_rates 미설정)
- [ ] `cost_breakdown.insurance > 0` (보험 0 이면 ins_* 매칭 실패)
- [ ] `cost_breakdown.maintenance > 0` (정비 0 이면 maintenance_cost_table 미설정)
- [ ] `suggested_rent_with_vat = sum(cost_breakdown) × 1.1` 근사
- [ ] `margin_rate` 가 음수가 아님
- [ ] `competitive_index` 가 0.5 ~ 2.0 범위

## 4. SimulationPanel 과 회귀 비교

같은 입력으로 `/db/pricing-standards` 진입 → 우측 SimulationPanel 에 동일 차종 프리셋 클릭 → 산출 결과 비교.

| 항목 | SimulationPanel | quote-cost (Q2-2) | 오차 |
|------|-----------------|-------------------|------|
| 월 렌트료 (VAT 포함) | ? | ? | ±1% 목표 |
| 감가 (월) | ? | ? | ±1% 목표 |
| 마진율 | ? | ? | ±0.5%p |

**±1% 초과 시**:
- `lib/quote-cost.ts` 의 `calcInput` 매핑 점검
- 특히 `factory_price = purchase_price × 1.15` 추정값이 SimulationPanel 의 `Math.round(vehiclePrice * 1.15)` 와 동일한지

## 5. 캐시 무효화 (수동)

```bash
curl -s "$HOST/api/lt-quotes/calculate?invalidate=1" -H "Authorization: Bearer $TOKEN" | jq
```

기준표 (depreciation_rates, business_rules 등) 수정 직후 1회 호출하여 캐시 갱신.

## 6. 회귀 케이스 등록

오차 발생 시 `harness-engineering/regression-cases/YYYY-MM-DD-quote-cost-{slug}.md` 에 기록:
- input
- expected (SimulationPanel 결과)
- actual (calculate API 결과)
- root_cause (3-Why)
- prevention

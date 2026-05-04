# 빈 문자열이 Number(0) 으로 파싱되어 일요일 자동 비선호

**일자**: 2026-05-04
**모듈**: CallScheduler / WorkersTab
**보고**: 사용자 — "직원들 기본이 일요일 비선호로 되어있는데 비선호는 기본적으로 클리어 되어있어야하고 해제해도 저장이안됨"

## Input

```ts
const w = { preferred_dow_avoid: null }  // 또는 ''
new Set(
  (w.preferred_dow_avoid || '')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => !isNaN(n))
)
```

## Expected
- `preferred_dow_avoid` 가 NULL 또는 빈 문자열이면 → 빈 Set (어떤 요일도 비선호 아님)

## Actual (버그)
- `''.split(',')` → `['']` (길이 1)
- `Number(''.trim())` === `Number('')` === `0` ✅ NaN 아님
- filter 통과 → Set 에 0 (일요일) 들어감
- → 모든 워커 편집 시 일요일이 비선호로 표시됨
- 사용자가 일요일 해제 → 저장 → DB에 null 들어감
- 다시 reload → 같은 버그로 일요일 set 에 들어감 → "저장 안 됨" 같이 보임

## Root Cause (3-Why)

1. **Why 일요일이 표시?** → `Number('')` 이 `0` 으로 평가되어 Set 에 들어감
2. **Why empty string 이 들어감?** → `'' .split(',')` 이 `['']` 반환 (`,` 없는 빈 문자열도 길이 1 배열)
3. **Why filter 통과?** → `isNaN(0)` 이 false 라서 필터 통과

## Prevention

- 빈 토큰 먼저 제거 후 Number() 파싱:
  ```ts
  s.split(',').map(s => s.trim()).filter(s => s !== '').map(Number)
  ```
- 추가 안전: 범위 필터 (`n >= 0 && n <= 6`) — 비정상 값 차단

## 같은 부류 사고 — 자동화 도입 검토 (Rule 15)

JavaScript 에서 빈 문자열 / null 을 split + Number 하는 패턴은 흔한 함정:
- `Number('')` → 0
- `Number(' ')` → 0
- `Number(null)` → 0
- `Number(undefined)` → NaN
- `Number('0')` → 0

**제안**: utility 함수 (`parseCsvIntList(str: string | null): number[]`) — 빈 토큰 자동 제거 + 범위 검증.
같은 패턴이 다른 곳에 또 있으면 일괄 교체.

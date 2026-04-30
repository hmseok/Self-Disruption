# 회귀 케이스 — MY COMPANY 취소 SMS 카드 탭 미반영

**날짜**: 2026-04-30  
**카테고리**: sms-parser, transactions-update  
**심각도**: 🔴 High (사용자가 같은 영역 3차례 반복 수정 요청)

---

## Input (실제 사용자 데이터)

```
sender: null
raw_text: "[MY COMPANY] 취소 7109 석호민님 180,000원 일시불 (주)잠실에너지 잔여한도..."
```

## Expected (사용자가 화면에서 보고 싶은 결과)

```
[card_sms_transactions]
  merchant     = "(주)잠실에너지"
  holder_name  = "석호민"
  card_alias   = "법인****7109"
  transaction_type = "canceled"

[transactions]
  description = "[취소] (주)잠실에너지"
  type        = "income"  (환불 효과 — 원거래 expense 와 상쇄)
  amount      = 180000

[/finance/bank-card 카드 탭]
  날짜  카드사     가맹점          금액         매칭   상태
  04/30  법인 7109  (주)잠실에너지  +180,000원   석호민  매칭완료
                                  (녹색/입금)
```

## Actual (3차례 hotfix 전까지 발생)

### 1차 발견 (커밋 ab325d0)
- 파서 fallback 위치만 변경
- `parseMyCompany` 정규식이 `(?:승인|사용|결제)` 만 허용하여 취소 verb 미매칭
- 결과: 여전히 holder/merchant null

### 2차 발견 (커밋 d5a6091)
- `parseMyCompany` 정규식에 `취소` verb 추가
- SMS row 는 정리됨
- 그러나 `improved` 검사가 SMS row 만 비교하여 transactions row stale 미감지

### 3차 발견 (커밋 3d89e8b)
- diffOne 에 `txStale` 검사 추가
- transactions.type / transactions.description 도 함께 검증

---

## Root Cause — 3-Why 분석

| Why | 답 |
|-----|----|
| 1. 왜 같은 버그를 3차례 수정했나 | 매번 표면만 고치고 다음 단계 영향을 검증 안 함 |
| 2. 왜 다음 단계 검증을 안 했나 | End-to-End 데이터 흐름을 머리속으로 dry-run 안 함 |
| 3. 왜 dry-run을 안 했나 | 작업 범위를 "파서 1개" 로 좁게 본 결과. 사용자가 보는 화면(카드 탭)까지 검증 의무가 명시 안 됐었음 |

## Prevention — 재발 방지

CLAUDE.md § 0-1 에 규칙 8/9/10 신설 (2026-04-30):

- **규칙 8** — End-to-End 데이터 흐름 시뮬레이션 강제 (5 STEP 프로토콜)
- **규칙 9** — 회귀 케이스 자동 등록 (이 파일이 첫 사례)
- **규칙 10** — Apply 후 자기 검증 의무 (검증 SQL 실행 + alert 노출)

## Test Vectors (재발 검증용)

새 SMS 파서 변경 시 다음 입력으로 mental dry-run 의무:

```js
const cases = [
  {
    name: "MY COMPANY 취소",
    raw: "[MY COMPANY] 취소 7109 석호민님 180,000원 일시불 (주)잠실에너지 잔여한도3,000,000원",
    expected_type: "canceled",
    expected_merchant: "(주)잠실에너지",
    expected_card_alias: "법인****7109",
    expected_holder: "석호민",
  },
  {
    name: "MY COMPANY 승인",
    raw: "[MY COMPANY] 승인 7109 석호민님 9,000원 일시불 더벤티문정점 잔여한도3,422,272원",
    expected_type: "approved",
    expected_merchant: "더벤티문정점",
  },
  {
    name: "KB 승인거절 (비-거래)",
    raw: "KB국민카드 8818(기업) 04/30 14:56 (주)소모 성내주유소 승인거절:한도초과",
    expected_parse_status: "ignored",  // failed 가 아님
  },
  {
    name: "우리카드 취소",
    raw: "● 우리카드 이용안내 우리(4331)취소 법인 김*수님 4,795원 일시불 04/27 17:02 에스케이 일렉링크 누적329,111원",
    expected_type: "canceled",
    expected_merchant: "에스케이 일렉링크",
  },
]
```

## 관련 커밋

- ab325d0 — 1차 hotfix (불완전)
- d5a6091 — 2차 hotfix (parseMyCompany 정규식)
- 3d89e8b — 3차 hotfix (txStale 검사)
- (이 커밋) — 회귀 케이스 등록 + CLAUDE.md 규칙 8/9/10 신설

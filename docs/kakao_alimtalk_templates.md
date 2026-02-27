# 카카오 알림톡 템플릿 — 메시지센터 등록 신청용

## 1. 견적서 발송 (QUOTE_SHARE)

### 템플릿 정보
| 항목 | 내용 |
|------|------|
| 템플릿 코드 | QUOTE_SHARE |
| 카테고리 | 비즈니스/서비스 안내 |
| 메시지 유형 | 정보성 |
| 강조 표기 | 없음 |

### 템플릿 내용
```
[#{companyName}] 장기렌트 견적서

#{customerName}님, 견적서를 보내드립니다.

■ 차량: #{brand} #{model}
■ 계약: #{contractType} · #{termMonths}개월
■ 월 렌탈료: #{rentWithVAT}원 (VAT포함)
■ 약정주행: 연 #{annualMileage}km

아래 버튼을 눌러 견적을 확인해주세요.
```

### 버튼
| 버튼명 | 타입 | 링크 |
|--------|------|------|
| 견적서 확인 | 웹링크(WL) | #{shareUrl} |

### 변수 설명
| 변수 | 설명 | 예시 |
|------|------|------|
| #{companyName} | 렌터카 회사명 | 주식회사에프엠아이 |
| #{customerName} | 수신 고객명 | (주)제이디오토 |
| #{brand} | 차량 브랜드 | 기아 |
| #{model} | 차량 모델명 | EV6 아이스 |
| #{contractType} | 계약 유형 | 반납형 |
| #{termMonths} | 계약 기간(개월) | 60 |
| #{rentWithVAT} | 월 렌탈료(VAT포함) | 902,293 |
| #{annualMileage} | 연간 약정주행거리 | 50,000 |
| #{shareUrl} | 견적서 확인 링크 | https://app.example.com/public/quote/abc123 |

---

## 2. 견적 서명 완료 알림 (QUOTE_SIGNED) — 향후 추가

### 템플릿 내용
```
[#{companyName}] 견적 서명 완료

#{customerName}님이 견적서에 서명했습니다.

■ 차량: #{brand} #{model}
■ 계약: #{contractType} · #{termMonths}개월
■ 월 렌탈료: #{rentWithVAT}원

관리자 확인 후 계약을 확정해주세요.
```

### 버튼
| 버튼명 | 타입 | 링크 |
|--------|------|------|
| 견적서 확인 | 웹링크(WL) | #{adminUrl} |

---

## 등록 절차

1. **알리고(Aligo) 카카오 알림톡 관리자 페이지** 접속
2. **발신프로필 설정** → 회사 카카오톡 채널 연동
3. **템플릿 관리** → 신규 템플릿 등록
4. 위 내용대로 템플릿 코드, 내용, 버튼 등록
5. **검수 요청** → 카카오 승인 (보통 1~3 영업일)
6. 승인 완료 후 `.env.local`에 `ALIGO_SENDER_KEY` 설정

### 환경 변수 확인
```bash
# .env.local 에 아래 값이 설정되어 있어야 합니다
ALIGO_API_KEY=xxxxx
ALIGO_USER_ID=xxxxx
ALIGO_SENDER_PHONE=01098289500
ALIGO_SENDER_KEY=xxxxx  # ← 카카오 발신프로필 키 (알림톡 필수)
```

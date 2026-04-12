# 견적/요금 시스템 전면 리뉴얼 설계서

> **작성일**: 2026-04-12
> **범위**: 견적(장기/단기) + 요금기준표 + 경쟁사벤치마크 — 총 10개 페이지
> **목표**: UI 디자인 통일 + 컴포넌트 구조 개선 + UX 플로우 개선

---

## 1. 대상 페이지 및 현황

| # | 페이지 | 파일 | 줄 수 | 현재 상태 |
|---|--------|------|-------|----------|
| 1 | 단기견적 계산기 | `quotes/short-term/ShortTermCalcPage.tsx` | 709 | 커스텀 인라인, h1 헤더, bg-gray-50 |
| 2 | 단기 대차요금표 | `quotes/short-term/ShortTermReplacementBuilder.tsx` | 1,614 | 커스텀, 탭 UI, 125개 요금 하드코딩 |
| 3 | 장기견적 모드전환 | `quotes/create/page.tsx` | 72 | alert 검증, 커스텀 탭 |
| 4 | 장기견적 산출기 | `quotes/pricing/RentPricingBuilder.tsx` | 6,047 | ⚠️ 거대 파일, 커스텀 폼 |
| 5 | 장기견적 작성기 | `quotes/create/QuoteCreator.tsx` | 1,004 | sessionStorage 의존 |
| 6 | 견적 목록 | `quotes/QuoteListMain.tsx` | 1,526 | ✅ Design C 적용됨 |
| 7 | 견적 상세 | `quotes/[id]/page.tsx` | 1,688 | 커스텀, 타임라인+비용분석 |
| 8 | 청구서 상세 | `quotes/invoice/[id]/page.tsx` | 587 | 커스텀, 공유 모달 |
| 9 | 요금 기준표 | `db/pricing-standards/page.tsx` + 7탭 | 127+α | DcToolbar 적용, 탭 내부는 커스텀 |
| 10 | 경쟁사 벤치마크 | `db/lotte/page.tsx` | 783 | DcStatStrip+DcToolbar 적용, 내부 커스텀 |

---

## 2. 리뉴얼 원칙

### 2-1. 디자인 통일
- **Soft Ice 글래스 디자인 시스템** 5단계 적용
- **Design C 패턴**: DcStatStrip(블루 그라디언트) → DcToolbar(글래스 검색+필터) → 콘텐츠
- **page-bg + max-w-[1400px]** 표준 래퍼
- 커스텀 h1 헤더 제거 (PageTitle 브레드크럼으로 통일)
- 인라인 스타일 최소화 → Tailwind 클래스 우선

### 2-2. 컴포넌트 구조
- 6,047줄 `RentPricingBuilder` → 섹션별 서브 컴포넌트 분해
- 125개 하드코딩 요금 → DB/API에서 로딩 (이미 `/api/short-term-rates` 존재)
- 공통 유틸 추출: `getAuthHeader()`, 숫자 포맷터, 차량 카테고리 매핑

### 2-3. UX 개선
- alert() → 토스트/인라인 에러 메시지
- sessionStorage 의존 → URL 파라미터 + 서버 상태로 전환
- 모바일 반응형 강화

---

## 3. 페이지별 설계

### 3-1. 단기견적 계산기 (ShortTermCalcPage)

**Before**: 커스텀 h1 "단기렌트 견적", 2컬럼 grid, bg-gray-50, 인라인 스타일
**After**:
- `page-bg` + `max-w-[1400px]` 래퍼
- DcStatStrip: 선택차종, 할인율, 계산 요금, 배차료 포함 합계
- DcToolbar: 카테고리 필터(전체/경차/소형/중형...) + 차종 검색
- 좌측: 차종 리스트 (글래스 카드, 선택 시 블루 틴트 보더)
- 우측: 계산 패널 (글래스 카드, 일수/시간 스텝퍼, 사고과실 토글)
- 결과 카드: 블루 그라디언트 합계 표시
- 청구서 모달: 글래스 스타일 유지

### 3-2. 단기 대차요금표 (ShortTermReplacementBuilder)

**Before**: 탭 기반 요금 관리, 하드코딩 125개 요금
**After**:
- DcStatStrip: 등록차종 수, 최근 갱신일, 평균 할인율
- DcToolbar: 서비스 군 필터(1~10군) + 검색
- 요금 테이블: NeuDataTable 적용
- 편집 모드: 글래스 모달

### 3-3. 장기견적 모드전환 (create/page.tsx)

**Before**: alert 검증, 커스텀 탭 버튼
**After**:
- DcToolbar에 모드 필터로 통합 (상세 산출 / 견적서 작성)
- alert → 인라인 안내 메시지

### 3-4. 장기견적 산출기 (RentPricingBuilder) — 핵심 리뉴얼

**Before**: 6,047줄 단일 파일, 복잡한 폼, 커스텀 스타일
**After**:
- 메인 컴포넌트 → 섹션 컴포넌트로 분해 (우선은 UI만 변경, 분해는 후순위)
- DcStatStrip: 차량명, 출고가, 월 렌트료(계산결과), 잔가율
- DcToolbar: 섹션 네비게이션 (차량선택/감가/보험/정비/금융/결과)
- 각 섹션: 글래스 카드(Level 4) 안에 폼 필드
- 인풋: Level 1 스타일 (inset shadow)
- 결과 요약: Level 3 블루 틴트 카드

### 3-5. 장기견적 작성기 (QuoteCreator)

**Before**: sessionStorage 의존, 2단계 플로우
**After**:
- DcStatStrip: 고객명, 차량, 계약기간, 월 렌트료
- 글래스 카드 기반 폼 레이아웃
- 프리뷰 영역: 인쇄 최적화 유지

### 3-6. 견적 목록 (QuoteListMain)

**현재**: Design C 이미 적용
**개선**: 모달 내부 글래스 스타일 정리, 인라인 스타일 축소

### 3-7. 견적 상세 ([id]/page.tsx)

**Before**: 커스텀 레이아웃, 비용바 컴포넌트
**After**:
- DcStatStrip: 고객명, 차량, 월 렌트료, 상태, 잔가
- 탭 or 섹션: 비용분석 / 보험 / 정비 / 타임라인
- 각 섹션 글래스 카드

### 3-8. 청구서 상세 (invoice/[id])

**After**:
- DcStatStrip: 임차인, 차량, 청구금액, 상태
- 공유 모달 글래스 스타일

### 3-9. 요금 기준표 (pricing-standards)

**현재**: DcToolbar 적용, 탭 내부는 커스텀
**개선**: 탭 내부 테이블 → NeuDataTable 적용 (대규모이므로 후순위)

### 3-10. 경쟁사 벤치마크 (lotte)

**현재**: DcStatStrip+DcToolbar 적용
**개선**: 비교 카드/비용 분석 패널 → 글래스 카드 통일

---

## 4. 실행 순서

| 순서 | 페이지 | 예상 난이도 | 이유 |
|------|--------|-----------|------|
| 1 | 단기견적 계산기 | ★★☆ | 709줄, 패턴 확립 |
| 2 | 단기 대차요금표 | ★★☆ | 1,614줄, 테이블 중심 |
| 3 | 장기견적 모드전환 | ★☆☆ | 72줄, 빠른 수정 |
| 4 | 장기견적 산출기 | ★★★ | 6,047줄, UI만 먼저 |
| 5 | 장기견적 작성기 | ★★☆ | 1,004줄 |
| 6 | 견적 상세 | ★★☆ | 1,688줄 |
| 7 | 청구서 상세 | ★★☆ | 587줄 |
| 8 | 견적 목록 정리 | ★☆☆ | 인라인 스타일 정리 |
| 9 | 경쟁사 벤치마크 | ★☆☆ | 이미 절반 적용 |
| 10 | 요금 기준표 탭 | ★★★ | 7개 탭 내부 변경 |

---

## 5. 공통 변경사항

### 래퍼 표준화
```tsx
// Before (각 페이지마다 다름)
<div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#f9fafb' }}>

// After (모든 페이지 동일)
<div className="page-bg">
  <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">
```

### 카드 스타일 표준화
```tsx
// Level 4: 데이터 컨테이너
style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)' }}

// Level 3: 스탯/정보 카드
style={{ background: 'rgba(255,255,255,0.60)', borderRadius: 12, border: '1px solid rgba(59,130,246,0.12)' }}

// Level 1: 인풋 필드
style={{ background: 'rgba(255,255,255,0.40)', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)', boxShadow: 'inset 2px 2px 4px rgba(140,170,210,0.12)' }}
```

### 커스텀 헤더 제거
```tsx
// Before
<h1 style={{ fontSize: 20, fontWeight: 900, color: '#1e3a5f' }}>단기렌트 견적</h1>

// After → 제거 (PageTitle 브레드크럼이 자동 표시)
```

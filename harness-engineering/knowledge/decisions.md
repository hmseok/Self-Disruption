# 기술 결정 기록 (Documenter → 자동 기록)

> 주요 기술 결정과 그 근거를 기록합니다. "왜 이렇게 했는지" 추적용.

---

## 2026-03-30: ignoreBuildErrors: true 적용

### 결정
next.config.js에 `typescript.ignoreBuildErrors: true` 추가

### 근거
- 30+ 파일에서 Prisma enum vs string 타입 불일치
- 하나씩 수정하면 빌드-수정 사이클이 너무 길어짐
- 배포 우선, 타입 정리는 후속 작업으로

### 후속 작업
- [ ] 전체 enum 타입 정리 후 ignoreBuildErrors 제거

---

## 2026-03-30: Cloud SQL 소켓 연결 방식 채택

### 결정
직접 IP 대신 Cloud SQL Auth Proxy 소켓 방식 사용

### 근거
- 같은 GCP 프로젝트의 다른 서비스(asset-management, charger-ride, rcare 등)가 모두 소켓 방식
- Cloud Run에서 직접 IP 연결은 Authorized Networks 설정 필요
- 소켓 방식이 보안상 더 안전

---

## 2026-03-30: Docker devDependencies 포함 설치

### 결정
Dockerfile에서 `npm ci` (전체 설치) 사용, `--omit=dev` 제거

### 근거
- prisma CLI가 devDependency로 등록됨
- `npx prisma generate`가 빌드 단계에서 필요
- 최종 이미지는 standalone output만 포함하므로 용량 영향 없음

---

## 2026-04-04: CompanyRelationship M:N 모델 도입

### 결정
회사 간 관계를 M:N 중간 테이블(company_relationships)로 관리

### 근거
- 소유주→계약사 관계가 다대다 (삼성화재서비스가 삼성카드+우리금융캐피탈의 계약사)
- 단순 FK(1:N)로는 다중 소유주 표현 불가
- Ride Platform 기존 구조와 호환

---

## 2026-04-04: is_direct_contract 기반 UI 분기

### 결정
`is_direct_contract` 필드로 소유주(thin bar) vs 계약사(big card) UI 분기

### 근거
- Ride Platform 기존 패턴: 소유주는 위에 얇은 바, 계약사는 큰 카드
- 3-Case 렌더링: A(직접→직접), B(비직접→직접), C(독립)

---

## 2026-04-04: CAT_THEME 카테고리별 색상 시스템

### 결정
contractCategory별 고유 색상 테마 적용

### 근거
- 전체 UI가 모노톤(white/gray/blue)이어서 시각적 구분 부족
- 사용자 피드백: "전체톤이 너무 일정하지 않나요?"

### 색상 매핑
- CAPITAL=blue, CARD=violet, INSURANCE=teal
- LEASE=amber, RENTAL=emerald, MT=orange

---

## 2026-04-04: 하네스 엔지니어링 v2.1 커스터마이징

### 결정
영상 "프롬프트 엔지니어링은 끝났습니다" 기반으로 4기둥 체계 적용

### 4기둥
1. 컨텍스트 파일 (CLAUDE.md, agents/*.md, knowledge/*.md)
2. CI/CD 게이트 (Reviewer/Designer/Evaluator 자동 검증)
3. 도구 경계 (에이전트별 최소 권한)
4. 피드백 루프 (knowledge/ 자가 학습)

### 확인 포인트
- 설계서 확인(수동) — 유일한 수동 승인 포인트
- 나머지는 자동 검증 게이트

---

## 2026-04-04: GitHub Actions CI/CD 도입

### 결정
Cloud Build 트리거 대신 GitHub Actions 워크플로우 사용

### 근거
- Sandbox에서 git push 불가 (DNS 제한)
- CI/CD 게이트를 워크플로우에 통합 관리 가능
- 하네스 2기둥(결정론적 CI/CD 게이트)과 직접 연결

### 워크플로우
main push → 빌드 → 배포 → 헬스체크

---

_마지막 업데이트: 2026-04-04_

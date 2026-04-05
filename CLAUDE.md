# FMI ERP (Self-Disruption) — Harness Engineering Orchestrator v3.0

> 새 세션이 시작되면 **반드시 이 파일과 HARNESS.md를 먼저 읽어라**.
> 이 규칙을 어기면 아키텍처 버그가 발생한다.

---

## 0. 시스템 개요

**Harness Engineering v3.0**은 9인 에이전트 체제 + 4기둥 프레임워크를 결합한 하이브리드 오케스트레이터입니다.

### 4기둥 (Four Pillars)

| # | 기둥 | 설명 |
|---|------|------|
| P1 | **기계가 읽는 컨텍스트** | CLAUDE.md + HARNESS.md + knowledge/ 를 세션 시작 시 반드시 읽는다 |
| P2 | **결정론적 게이트** | 각 단계 전환에 명시적 조건/동작이 정의된 9개 GATE |
| P3 | **최소 권한 원칙** | 각 에이전트는 허용된 도구/파일만 접근 가능 |
| P4 | **피드백 루프** | 실수→기록→방지의 자가 학습 + 가비지 컬렉션 |

### 핵심 원칙
> 1. **모델을 직접 관찰하라** — 추측 말고 코드를 관찰하라.
> 2. **복잡한 작업은 분해하고 전문화하라** — 9인 에이전트가 각자 전문 영역을 담당한다.
> 3. **자기 평가 금지** — 반드시 evaluate.js가 PASS를 줘야 커밋한다.
> 4. **자가 학습** — 발견한 패턴/이슈를 knowledge/에 기록하여 점진 진화한다.
> 5. **에이전트가 실수하면, 구조적으로 막는다** — 프롬프트가 아닌 시스템으로 방지한다.

---

## 1. 하네스 파이프라인 (v3.0 — 9인 체제 + 9 GATE)

```
사용자 요청
    ↓
─── GATE 1: 컨텍스트 로드 ───────────────────────────
    조건: 세션 시작 시
    동작: CLAUDE.md + HARNESS.md + knowledge/*.md 읽기
    ↓
[Researcher] ─── 코드베이스 조사, 기존 자산 파악, knowledge/ 참조
    ↓
─── GATE 2: 조사 완료 ──────────────────────────────
    조건: 영향 범위 + 재사용 자산 + 위험 요소 문서화 완료
    동작: Planner에게 조사 보고서 전달
    ↓
[Planner] ────── 조사 결과 기반 상세 설계서 작성 → 사용자 확인
    ↓
─── GATE 3: 설계 승인 ──────────────────────────────
    조건: 사용자가 설계서 확인 (구두 또는 명시적 승인)
    동작: DB 변경 필요 시 Migrator 분기, 아니면 Generator 진행
    ↓
[Migrator] ──── (필요 시) 안전한 마이그레이션 전략 수립 → 실행
    ↓
─── GATE 4: 마이그레이션 안전 ──────────────────────
    조건: 🟢Green=자동, 🟡Yellow=로그확인, 🔴Red=사용자 SQL 검토 필수
    동작: 마이그레이션 성공 확인 후 Generator 진행
    ↓
[Generator] ──── 설계서 100% 구현
    ↓
─── GATE 5: 구현 완료 ──────────────────────────────
    조건: 설계서의 모든 Must-have 항목 구현 완료
    동작: Reviewer에게 전달
    ↓
[Reviewer] ───── 정적 분석, 아키텍처 규칙 검증
    ↓
─── GATE 6: 코드 품질 ──────────────────────────────
    조건: 🔴Critical=0개, 🟡Warning=3개 이하
    동작: 🔴 있으면 Generator 반환 / 통과 시 Designer 진행
    ↓
[Designer] ───── Soft Ice 디자인 시스템 검증
    ↓
─── GATE 7: 디자인 검증 ─────────────────────────────
    조건: 시인성 통과, Soft Ice 글래스 디자인 준수
    동작: ❌ 심각 시 Generator 반환 / 통과 시 Evaluator 진행
    ↓
[Evaluator] ──── evaluate.js 실행 + 채점
    ↓
─── GATE 8: 품질 합격 ──────────────────────────────
    조건: evaluate.js ≥ 8.0/10
    동작: 불합격 → Generator 반환 (최대 3회) / 합격 → Deployer 진행
    ↓
[Deployer] ───── 커밋 → 사용자에게 push 안내 → 헬스체크
    ↓
─── GATE 9: 배포 완료 ──────────────────────────────
    조건: 커밋 성공 + 헬스체크 통과
    동작: Documenter에게 전달 → 문서 업데이트
    ↓
[Documenter] ─── CLAUDE.md/HARNESS.md 업데이트, Knowledge Base 축적
    ↓
  완료 ✅
```

### 에이전트 역할 + 최소 권한 (9인 체제)

| # | 에이전트 | 역할 | 허용 도구 | 금지 도구 | 파일 |
|---|---------|------|----------|----------|------|
| 1 | **Researcher** | 사전 코드 조사, 중복 방지 | Read, Grep, Glob, Bash(읽기) | Write, Edit | `harness-engineering/agents/researcher.md` |
| 2 | **Planner** | 상세 설계서 작성 | Read, Write(docs/ 한정) | Edit(코드), Bash | `harness-engineering/agents/planner.md` |
| 3 | **Generator** | 코드 구현 | Read, Write, Edit, Bash | git push | `harness-engineering/agents/generator.md` |
| 4 | **Reviewer** | 정적 분석, 아키텍처 규칙 | Read, Grep, Glob | Write, Edit | `harness-engineering/agents/reviewer.md` |
| 5 | **Designer** | Soft Ice 디자인 검증 | Read, Grep | Write, Edit, Bash | `harness-engineering/agents/designer.md` |
| 6 | **Evaluator** | 실행 테스트, 채점 | Read, Bash(evaluate.js) | Write, Edit | `harness-engineering/agents/evaluator.md` |
| 7 | **Deployer** | 커밋, push 안내, 헬스체크 | Read, Bash(git, curl) | Edit(코드) | `harness-engineering/agents/deployer.md` |
| 8 | **Migrator** | DB 마이그레이션 (필요 시) | Read, Write(migrations/), Bash(DB) | Edit(코드) | `harness-engineering/agents/migrator.md` |
| 9 | **Documenter** | 문서/지식 자동 축적 | Read, Write, Edit(*.md 한정) | Bash(코드실행) | `harness-engineering/agents/documenter.md` |

---

## 2. 자가 학습 시스템 + 가비지 컬렉션

```
harness-engineering/knowledge/
├── patterns.md       ← Researcher: 코드 패턴 축적
├── common-errors.md  ← Reviewer: 반복 에러 기록
├── deploy-issues.md  ← Deployer: 배포 이슈 기록
├── color-issues.md   ← Designer: 시인성 문제 기록
├── migrations.md     ← Migrator: 마이그레이션 히스토리
├── decisions.md      ← Documenter: 기술 결정 기록
└── archive/          ← [ARCHIVED] 항목 저장소
```

### 가비지 컬렉션 규칙

| 태그 | 의미 | 수명 |
|------|------|------|
| `[ACTIVE]` | 현재 유효 | 영구 유지 |
| `[RESOLVED]` | 해결됨 (원인+해결 기록) | 3개월 후 아카이브 |
| `[DEPRECATED]` | 더 이상 유효하지 않음 | 즉시 아카이브 가능 |
| `[ARCHIVED]` | 아카이브 완료 | archive/로 이동 |

---

## 3. 컨텍스트 리셋 규칙

`/clear` 시점:
1. 에이전트 역할이 전환될 때
2. 컨텍스트 50% 이상 소진 시
3. Generator 피드백 반영 2회차 시작 시

### 프로젝트 타입 설정

- 프로젝트 타입: **웹앱**
- 평가 기준: UI/UX 30%, 기능 완성도 30%, 코드 품질 20%, 반응형 10%, 보안 10%
- 합격 점수: **8.0/10**
- 평가 기준표: `harness-engineering/templates/eval-criteria.md`

---

## 4. 세션 시작 루틴

```
1. CLAUDE.md 읽기     ← 지금 이 파일
2. HARNESS.md 읽기    ← 기능 현황
3. knowledge/*.md 스캔 ← 축적된 패턴/이슈 확인
4. 작업 요청 파악
5. [하네스 모드] → GATE 1~9 파이프라인
   [일반 요청] → Generator로 직접 구현 (GATE 5~9 적용)
6. evaluate.js 실행 → PASS 확인
7. git add / git commit
8. 사용자에게 push 안내
```

---

## 5. 프로젝트 구조

```
Self-Disruption/
├── app/                     ← Next.js App Router (소스 코드)
│   ├── api/                 ← API Routes (100+)
│   ├── components/          ← 공유 컴포넌트 (14개)
│   ├── dashboard/           ← 대시보드
│   ├── cars/                ← 차량 관리
│   ├── quotes/              ← 견적 (장기/단기)
│   ├── contracts/           ← 계약 관리
│   ├── finance/             ← 재무/정산
│   ├── admin/               ← 관리자 (HR, 급여, 권한)
│   ├── invite/[token]/      ← 초대 수락 (공개)
│   └── public/              ← 공개 페이지 (견적 공유, 서명)
├── lib/                     ← 유틸리티 (auth, prisma, etc.)
├── prisma/                  ← Prisma 스키마 (42 모델)
├── harness-engineering/     ← 하네스 에이전트 + 지식
│   ├── agents/              ← 9인 에이전트 프롬프트
│   ├── knowledge/           ← 자가 학습 저장소
│   ├── handover/            ← 인수인계 메모
│   ├── docs/                ← 자동 생성 문서
│   ├── reports/             ← 검수/주간 보고
│   └── templates/           ← 평가 기준표
├── CLAUDE.md                ← 이 파일
├── HARNESS.md               ← 기능 현황 + 모듈 상태
└── evaluate.js              ← 자동 검증 스크립트
```

---

## 6. 절대 금지 사항

### ❌ PostgreSQL 문법 사용 금지 (MySQL 전용)
```
// ❌ 잘못된 방식
prisma.$queryRaw`SELECT * FROM users WHERE id = $1` // PostgreSQL 문법
prisma.$queryRaw`INSERT INTO ... RETURNING *`        // PostgreSQL 전용

// ✅ 올바른 방식
prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}` // Tagged template
prisma.$queryRawUnsafe('SELECT * FROM users WHERE id = ?', userId) // 동적 쿼리
// INSERT 후 별도 SELECT로 조회
```

### ❌ $queryRaw를 일반 함수로 호출 금지
```
// ❌ 잘못된 방식 — "tag function" 에러 발생
prisma.$queryRaw(query, ...params)

// ✅ 올바른 방식
prisma.$queryRawUnsafe(query, ...params) // 동적 쿼리 시
prisma.$queryRaw`SELECT * FROM table WHERE id = ${id}` // 정적 쿼리 시
```

### ❌ SQL Injection 패턴 금지
```
// ❌ 잘못된 방식 — 문자열 보간 직접 사용
const query = `UPDATE table SET ${key} = '${value}' WHERE id = '${id}'`
prisma.$executeRawUnsafe(query)

// ✅ 올바른 방식 — 파라미터 바인딩 사용
prisma.$executeRaw`UPDATE table SET column = ${value} WHERE id = ${id}`
```

### ❌ 에이전트 권한 침범 금지
- Reviewer는 코드를 수정하지 않는다 (Read Only)
- Designer는 코드를 수정하지 않는다 (Read Only)
- Evaluator는 코드를 수정하지 않는다 (evaluate.js 실행만)
- Documenter는 *.md 파일만 수정한다

---

## 7. 프로젝트 개요

- **서비스명**: FMI ERP (Self-Disruption)
- **회사**: 주식회사 에프엠아이 (단독 회사 ERP)
- **목적**: 렌터카 사업 통합 관리 (차량, 계약, 고객, 재무, 인사)
- **배포 URL**: https://hmseok.com
- **GitHub**: git@github.com:hmseok/Self-Disruption.git

---

## 8. 기술 스택

- **프론트엔드**: Next.js 16 (App Router, Turbopack), React, TypeScript, Tailwind CSS
- **백엔드**: Next.js API Routes, Prisma (Raw SQL)
- **DB**: MySQL (GCP Cloud SQL — `r-care-db`, Public IP: 34.47.105.219, DB: fmi_op)
- **인증**: Custom JWT (jsonwebtoken + bcryptjs, Node.js native crypto HS256 검증)
- **인프라**: GCP Cloud Run, Cloud Build, GitHub Actions
- **GCP 프로젝트**: `secondlife-485816` (asia-northeast3)
- **AI**: Gemini API (AI 플로팅 어시스턴트)

---

## 9. 인증 구조

- Custom JWT: `lib/auth-server.ts` (Node.js crypto HS256)
- 클라이언트: `lib/auth-client.ts` (localStorage `fmi_token`/`fmi_user`)
- 모든 API 라우트: `import { verifyUser } from '@/lib/auth-server'`
- company_id는 과거 멀티회사 구조 → 현재 단독 회사 (verifyUser에서 companies 테이블 조회)
- 비밀번호: bcryptjs hash (salt round 12)

---

## 10. Soft Ice 글래스 디자인 시스템

뤼키드 글래스 디자인 적극활용 (카드 항목 제목은 투톤 추천)

### Glass 깊이 5단계

| Level | 용도 | 배경 | 보더 |
|-------|------|------|------|
| **5** | 네비게이션 바 (가장 위, 가장 불투명) | `white/0.75` | `rgba(0,0,0, 0.06)` |
| **4** | 테이블 카드, 모달 (데이터 컨테이너) | `white/0.72` | `rgba(0,0,0, 0.06)` |
| **3** | 스탯 카드, 일반 카드 (색상 틴트 보더) | `white/0.60` | 색상-100/0.80 |
| **2** | 사이드바, 서브 패널 (배경에 가까움) | `white/0.35` | `rgba(0,0,0, 0.05)` |
| **1** | 인풋, 검색바 (오목 — 배경보다 어두움) | `white/0.40` + inset shadow | `rgba(0,0,0, 0.05)` |

### 스탯 카드 색상 틴트

| 색상 | 용도 | 보더 |
|------|------|------|
| **Blue** | 전체, 진행 중, 기본 정보 | `blue-100/0.80` |
| **Green** | 운용 중, 완료, 정상 | `green-100/0.80` |
| **Red** | 만기 초과, 오류, 긴급 | `red-100/0.80` |
| **Amber** | 검사 예정, 경고, 주의 | `amber-100/0.80` |
| **Purple** | 플러그인, 확장 기능 | `violet-100/0.80` |

### 보더 원칙
- Level 5, 4: `rgba(0,0,0, 0.06)` — 어두운 보더로 윤곽선 강조
- Level 3: 색상-100/0.80 — 틴트 컬러 보더로 개성 부여
- Level 2, 1: `rgba(0,0,0, 0.05)` — 미세한 어두운 보더

---

## 11. 작업 원칙

1. 작업 시작 전 결정 사항이나 결정 필요 사항은 질문 갯수와 상관없이 확인 피드백 후 진행
2. 전체 구성의 일부 파트를 먼저 하고 있으므로 확장 예상하여 작업
3. 색상에 의해 시인성이 심각하게 떨어지는 경우 별도의 색으로 변경 검수 후 확정
4. 불필요한 푸시 최소화 (Cloud Build 시간이 길므로 변경사항 모아서 한 번에)

---

## 12. 배포 파이프라인

```
GitHub push (main) → Cloud Build → Docker build → Cloud Run 배포
```

- Cloud SQL 연결: Public IP (34.47.105.219)
- 환경변수: JWT_SECRET, DATABASE_URL
- Dockerfile: standalone output + 수동 dependency 복사 (jsonwebtoken, bcryptjs 등)
- 빌드 시간: 약 5~10분

---

## 13. 알려진 이슈 이력

| # | 이슈 | 원인 | 상태 |
|---|------|------|------|
| 1 | API 라우트 401/500 에러 | PostgreSQL → MySQL 미전환 ($1 → ?) | [RESOLVED] 2026-04-05 |
| 2 | system_modules 404 | 라우트 파일 미존재 | [RESOLVED] 2026-04-05 |
| 3 | "활성화된 모듈이 없습니다" | company_modules → system_modules 전환 | [RESOLVED] 2026-04-05 |
| 4 | 직원초대 비밀번호 미저장 | accept에서 password 해싱/저장 누락 | [RESOLVED] 2026-04-05 |
| 5 | SQL Injection 취약점 (9개 라우트) | 문자열 보간 직접 사용 | [ACTIVE] 보안 패치 필요 |
| 6 | Prisma 스키마 45.7% 커버리지 | 50+ 테이블 Raw SQL만 | [ACTIVE] 점진 전환 |
| 7 | user_page_permissions Prisma 모델 누락 | 스키마에 미정의 | [ACTIVE] 추가 필요 |

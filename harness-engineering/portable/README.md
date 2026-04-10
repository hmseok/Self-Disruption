# Harness Engineering v3.1 — Portable Package

> 다른 프로젝트에 그대로 옮겨 쓰는 하네스 엔지니어링 패키지.
> 9인 에이전트 + 9 GATE + 9 카테고리 자동 평가 + Auto-Fix 루프(최대 15회).

---

## 들어있는 것

```
portable/
├── README.md                    ← 이 파일
├── install.sh                   ← 자동 설치 스크립트
├── evaluate.js                  ← 9 카테고리 평가기 (Playwright + 정적)
├── CLAUDE.md.template           ← 프로젝트 루트에 둘 CLAUDE.md
├── HARNESS.md.template          ← 기능 현황 문서
├── agents/                      ← 9인 에이전트 프롬프트
│   ├── researcher.md
│   ├── planner.md
│   ├── generator.md
│   ├── reviewer.md
│   ├── designer.md
│   ├── evaluator.md
│   ├── deployer.md
│   ├── migrator.md
│   └── documenter.md
├── scripts/
│   └── auto-fix-loop.js         ← Claude Code CLI 호출, 최대 15회 자동 수정
├── knowledge/                   ← 자가 학습 저장소 (빈 템플릿)
│   ├── patterns.md
│   ├── common-errors.md
│   ├── deploy-issues.md
│   ├── color-issues.md
│   ├── decisions.md
│   └── archive/
└── templates/
    └── eval-criteria.md         ← 9 카테고리 채점 기준표
```

---

## 빠른 설치 (한 줄)

설치하려는 프로젝트 루트에서:

```bash
bash /path/to/portable/install.sh
```

또는 수동:

```bash
cp portable/CLAUDE.md.template ./CLAUDE.md
cp portable/HARNESS.md.template ./HARNESS.md
cp portable/evaluate.js ./evaluate.js
cp -r portable/agents portable/knowledge portable/scripts portable/templates ./harness-engineering/
npm install -D playwright
npx playwright install chromium
```

---

## 의존성

- **Node.js 20+** (Node 22 권장 — Playwright 호환성)
- **Playwright** (`npm install -D playwright`)
- **Chromium** (`npx playwright install chromium`)
- **curl** (Playwright 미설치/실패 시 폴백)
- **Claude Code CLI** (`/usr/local/bin/claude`) — Auto-Fix 루프 사용 시 필수
- **Git** — Auto-Fix 루프가 commit/push 수행

---

## 사용법

### 1. 단순 평가

```bash
node evaluate.js                          # 운영 (CLAUDE.md에 적힌 BASE_URL)
node evaluate.js --local                  # http://localhost:3000
node evaluate.js --url=https://example.com
node evaluate.js --no-browser             # Playwright 없이 정적 검사만 (빠름)
node evaluate.js --json                   # JSON만 출력 (CI/오케스트레이터용)
```

리포트 위치: `harness-engineering/reports/eval-YYYY-MM-DD.json` + `eval-latest.json`
스크린샷: `harness-engineering/reports/screenshots/`

### 2. Auto-Fix 루프 (자동 수정 + 자동 푸시)

```bash
# 운영 — 최대 15회까지 평가 → Claude Code 자동 수정 → push → Cloud Run 대기 → 재평가
node harness-engineering/scripts/auto-fix-loop.js

# 옵션
node harness-engineering/scripts/auto-fix-loop.js --max=10
node harness-engineering/scripts/auto-fix-loop.js --local                # 로컬 검증
node harness-engineering/scripts/auto-fix-loop.js --no-push              # push 안 함
node harness-engineering/scripts/auto-fix-loop.js --no-deploy-wait       # 배포 대기 스킵
```

⚠️ **주의:** Auto-Fix는 `git push origin main`까지 자동 실행합니다. 처음에는 `--no-push`로 dry-run 권장.

---

## 9개 평가 카테고리

| # | 카테고리 | 배점 | 검사 내용 |
|---|---------|------|----------|
| 1 | UI/UX | 10 | 핵심 페이지 200 응답 |
| 2 | 기능 완성도 | 12 | API 응답, 핵심 파일 존재 |
| 3 | 코드 품질 | 12 | TypeScript 컴파일, SQL Injection 패턴 |
| 4 | 반응형 | 8 | Playwright 3 viewport (mobile/tablet/desktop), 가로 오버플로우 |
| 5 | 보안 | 10 | JWT, bcrypt, .env, 비밀번호 해싱 |
| 6 | 디자인 품질 | 14 | backdrop-filter, 폰트 로드, 패딩, 글래스 사용 |
| 7 | 독창성 | 10 | 색상 틴트 다양성, 글래스 깊이 다양성, 그라데이션 |
| 8 | 완성도 | 12 | 콘솔 에러 0, 요청 실패 0, 라우트 200 |
| 9 | 기능성 | 12 | 로그인 폼 필드, API 응답 |

**합격 기준:** 8.0/10

---

## 9 GATE 파이프라인

```
사용자 요청
  ↓ GATE 1: 컨텍스트 로드
[Researcher] 코드베이스 조사
  ↓ GATE 2: 조사 완료
[Planner] 상세 설계
  ↓ GATE 3: 설계 승인
[Migrator] (필요 시) DB 마이그레이션
  ↓ GATE 4: 마이그레이션 안전
[Generator] 코드 구현
  ↓ GATE 5: 구현 완료
[Reviewer] 정적 분석
  ↓ GATE 6: 코드 품질
[Designer] 디자인 시스템 검증
  ↓ GATE 7: 디자인 검증
[Evaluator] evaluate.js 실행
  ↓ GATE 8: 품질 합격 (8.0/10)
[Deployer] 커밋 + push + 헬스체크
  ↓ GATE 9: 배포 완료
[Documenter] 문서 + Knowledge Base 업데이트
  ↓
완료 ✅
```

---

## 새 프로젝트에 적용하는 단계별 가이드

1. **설치**
   ```bash
   cd /path/to/new-project
   bash /path/to/portable/install.sh
   ```

2. **CLAUDE.md 편집** — 다음 항목을 본인 프로젝트에 맞게 수정:
   - `프로젝트명`, `회사`, `목적`, `배포 URL`, `GitHub`
   - **기술 스택** (DB, 인증 방식, 인프라)
   - **절대 금지 사항** (PostgreSQL/MySQL 등 본인 DB에 맞게)
   - **알려진 이슈 이력**

3. **HARNESS.md 편집** — 모듈/기능 현황을 본인 프로젝트로 갱신

4. **evaluate.js 커스터마이징** — 본인 프로젝트의 라우트/엔드포인트에 맞게:
   - `publicEndpoints`, `authEndpoints` 배열
   - `criticalFiles` 배열
   - `pages` (UI/UX 검사 페이지)
   - `BASE_URL` 기본값 (코드 상단)

5. **knowledge/ 비우기** — 본인 프로젝트 패턴은 처음부터 채워나갑니다

6. **첫 평가 실행**
   ```bash
   node evaluate.js --no-browser
   ```

7. **(선택) Auto-Fix 루프 시도**
   ```bash
   node harness-engineering/scripts/auto-fix-loop.js --no-push --max=3
   ```

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `fetch failed EAI_AGAIN` | VM/사설망 DNS 실패 | curl 폴백이 자동 작동 (이상 없음) |
| Playwright `ERR_EMPTY_RESPONSE` | 프록시 환경 | `HTTPS_PROXY` 환경변수 설정 — evaluator가 자동 인식 |
| Playwright 타임아웃 | 페이지가 무거움 | `waitUntil: 'domcontentloaded'` 사용 중. 더 줄이려면 `'commit'` |
| `claude: command not found` | Claude Code CLI 미설치 | https://docs.claude.com/en/docs/claude-code/quickstart 참고 |
| Auto-Fix가 같은 항목만 반복 수정 | 힌트 부족 | `evaluate.js`의 `failureDetails`에 더 구체적 hint 추가 |

---

## 라이선스

이 패키지는 FMI ERP (Self-Disruption) 프로젝트에서 추출한 것이며, 자유롭게 다른 프로젝트에 복사·수정·재배포 가능합니다.

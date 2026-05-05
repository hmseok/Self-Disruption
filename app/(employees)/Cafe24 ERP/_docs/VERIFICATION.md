# VERIFICATION.md — 본 모듈 검증 로그

> 매 PR 종료 시 lint / 빌드 / 시각 검수 결과 기록.

---

## 2026-05-05 | PR-6.0a | Researcher / _docs 신설

### lint:harness
```
실행 X (문서 only PR — 코드 변경 없음)
```

### tsc / next build
```
실행 X (문서 only PR — TypeScript 변경 없음)
```

### Designer 시각 검수
```
실행 X (UI 변경 없음)
```

### evaluate.js
```
실행 X (UI/기능 변경 없음 — 문서 only PR)
```

### 영향받는 다른 페이지/API
```
없음 (본 PR 은 새 폴더 신설 + 문서만)
```

### 다른 세션 영역 staging 검증 (규칙 21)
```
본 세션 staged: app/(employees)/Cafe24 ERP/_docs/ 만
다른 세션 영역 (절대 staging X):
  - CLAUDE.md
  - app/(employees)/CallScheduler/
  - app/admin/_docs/
  - app/(employees)/factory-search/
  - migrations/
  - harness-engineering/knowledge/lint-violations.md
```

---

## 다음 PR 검증 의무

PR-6.2 (`lib/cafe24-db.ts`) 부터:
```
✅ tsc --noEmit PASS
✅ npm run lint:harness PASS
✅ Cafe24 측 테스트 connection (실 연결 후 SHOW TABLES 검증)
✅ MariaDB 10.1 호환성 확인 (CLAUDE-Cafe24.md § 2 화이트리스트)
✅ 자격증명 누출 확인 (grep 으로 password / user 평문 검사)
✅ Read-only 정책 (transaction READ ONLY 모드)
```

PR-6.3 (`/api/cafe24/accidents`) 부터:
```
✅ 위 + lint:api-trace (UI fetch 와 라우트 매칭)
✅ 시각 검수 (Designer) — UI 변경 시
✅ 영향받는 페이지: app/operations/intake/page.tsx (broken call 해소 확인)
```

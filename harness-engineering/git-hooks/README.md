# cowork git-hooks (repo-tracked)

> **PR-COWORK (2026-05-09)** — 모든 Cowork 세션이 같은 hook 을 공유.
> .git/hooks/ 에 별도 설치 불필요 — `git pull` 로 자동 갱신.

---

## 다른 세션 / 미래 세션 권장 절차

```bash
git pull origin main
npm run cowork:init   # 단 1회
```

`cowork:init` 자동 동작:
- `git config core.hooksPath harness-engineering/git-hooks` 설정
- hook 파일 (`pre-commit` / `pre-push`) **executable 권한 보장** (chmod 755)
- **자가 진단** (cowork-health-check.js --fix) 실행
  - core.hooksPath 정합성
  - hook 파일 무결성
  - baseline 파일 존재 (sql-lint / sql-group-by / sql-reserved-alias)
  - node·npm 버전

---

## 효과 (CLAUDE.md 규칙 21 — Cowork 멀티 세션 협업 강제)

| Hook | 단계 | 차단 대상 |
|---|---|---|
| `pre-commit` | `git commit` 직전 | `harness-lint` 새 critical 위반 0 일 때만 통과 (sql / sql-fn / api-trace / cowork-staging 등 9 lint) |
| `pre-push` | `git push` 직전 | `cowork-staging-lint` — 다른 세션 영역 흡수 commit 강력 차단. `pre-commit --no-verify` 우회해도 push 단계에서 또 검증 |

**우회 (의도적 cross-module push 만)**:
```bash
COWORK_ALLOW_MULTI_MODULE=1 git push
```

**절대 권장 X**:
```bash
git commit --no-verify   # cowork-staging 사고 패턴
```

---

## 설계

```
harness-engineering/
├── git-hooks/                    ← repo-tracked (이 폴더)
│   ├── pre-commit                ← harness-lint v2
│   ├── pre-push                  ← cowork-staging-lint v2 (강력 차단)
│   └── README.md                 ← 본 파일
└── scripts/
    ├── cowork-init.js            ← npm run cowork:init
    ├── cowork-health-check.js    ← npm run cowork:check / cowork:fix
    ├── cowork-staging-lint.js    ← pre-push 가 호출
    ├── harness-lint.js           ← pre-commit 가 호출
    └── install-hook.js           ← (legacy v1 — .git/hooks 직접 설치, deprecated)
```

---

## FAQ

**Q. 기존 `.git/hooks/pre-commit` (v1, install-hook.js 로 설치) 은?**
A. v1 도 그대로 동작은 하지만 `.git/` 안이라 git 추적 X — 다른 PC 마다 install 필요. v2 (repo-tracked) 가 권장.

**Q. `core.hooksPath` 가 다른 값으로 오염됐다면?**
A. `npm run cowork:fix` → `cowork-health-check.js --fix` 가 자동 정정.

**Q. hook 비활성화 (긴급 우회)?**
A. `git config --unset core.hooksPath` 또는 `core.hooksPath ""` — 단 CLAUDE.md 규칙 21 위반 위험.

**Q. 새 hook 추가?**
A. 본 폴더(`git-hooks/`) 에 표준 git hook 이름 (`commit-msg`, `post-merge` 등) 으로 파일 신설 + chmod +x. push 시 다른 세션도 자동 적용.

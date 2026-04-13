# Git 브랜치 워크플로우 가이드

> **[ACTIVE]** 2026-04-13 작성 — 멀티 코워크 병렬 개발 도입 시점

---

## 1. 브랜치 전략

### 원칙
- **`main`은 merge 전용** — 직접 코드 수정 금지, 항상 브랜치에서 작업 후 merge
- **기능 브랜치 독립** — 각 코워크 세션은 전용 브랜치에서 작업
- **push는 배포 = 신중하게** — Cloud Build 시간이 길므로 변경사항 모아서 한 번에

### 브랜치 명명 규칙
```
feat/<영역>       ← 기능 개발/개편
fix/<영역>        ← 버그 수정
refactor/<영역>   ← 구조 개선
```

### 현재 브랜치 구성 (2026-04-13)
```
main (origin/main)
  ├── feat/quote-system          ← 코워크 A: 견적 시스템 전면 개편
  └── feat/finance-settlement    ← 코워크 B: 정산/재무 시스템 (예정)
```

---

## 2. 새 브랜치 시작하기

```bash
# 1) main으로 이동 (깨끗한 베이스)
git checkout main

# 2) 최신 상태 확인
git pull origin main

# 3) 새 브랜치 생성 + 이동
git checkout -b feat/새기능이름

# 4) 이 브랜치에서 작업 시작
```

### 주의사항
- 반드시 `main`에서 분기할 것 (다른 feature 브랜치에서 분기하면 의존성 생김)
- 브랜치 생성 전 `git pull origin main`으로 최신화

---

## 3. 작업 중 규칙

| 규칙 | 이유 |
|------|------|
| 해당 브랜치에서만 코드 수정 | 브랜치 섞임 방지 |
| `main`에서 직접 수정 금지 | main은 merge 전용 |
| 커밋 메시지에 영역 표기 | `feat:`, `fix:`, `style:`, `refactor:` 접두어 사용 |
| 한 커밋 = 한 작업 단위 | 나중에 revert 가능하도록 |

---

## 4. 배포 순서 (2개 이상 브랜치)

### 순서가 중요한 이유
먼저 merge한 브랜치가 main에 들어가고, 그 다음 브랜치는 merge 시 충돌 가능성이 있음.
**충돌 가능성이 적은 브랜치를 먼저** merge하는 것이 안전.

### 단계별 상세

#### 1단계: 첫 번째 브랜치 배포
```bash
# main으로 이동
git checkout main

# 최신화
git pull origin main

# 브랜치 A를 main에 합침
git merge feat/quote-system

# 충돌 없으면 → push (GitHub → Cloud Build → Cloud Run 자동 배포)
git push origin main

# 배포 완료까지 대기 (약 5~10분)
```

#### 2단계: 두 번째 브랜치 배포
```bash
# main 최신화 (1단계에서 push한 내용 반영)
git pull origin main

# 브랜치 B로 이동
git checkout feat/finance-settlement

# main의 최신 상태를 브랜치 B에 반영 (충돌 체크용)
git merge main

# ★ 여기서 충돌이 발생할 수 있음 → 아래 "충돌 해결" 참고
# 충돌 없거나 해결 완료 후:

git checkout main
git merge feat/finance-settlement
git push origin main
```

---

## 5. 충돌(Conflict) 발생 시

### 충돌이란?
두 브랜치가 **같은 파일의 같은 줄**을 다르게 수정했을 때 Git이 자동으로 합칠 수 없는 상황.

### 충돌 발생 화면 예시
```
CONFLICT (content): Merge conflict in app/quotes/QuoteListMain.tsx
Automatic merge failed; fix conflicts and then commit the result.
```

### 해결 방법
1. 충돌 파일 열기 → `<<<<<<<`, `=======`, `>>>>>>>` 마커 확인
2. 원하는 코드로 수정 (두 버전 모두 살리거나 한쪽 선택)
3. 마커(`<<<<<<<` 등) 삭제
4. `git add <파일>` → `git commit`

### 충돌이 무서우면?
코워크 세션에서 Claude에게 "merge 도와줘"라고 하면 충돌 파일을 확인하고 해결해 줌.

---

## 6. 절대 금지 사항

| 금지 | 이유 |
|------|------|
| `git push --force` | 원격 이력이 날아감, 다른 브랜치도 영향 |
| `main`에서 직접 코드 수정 | merge 전용 브랜치 오염 |
| 다른 feature 브랜치에서 분기 | 의존성 꼬임 |
| 두 코워크에서 같은 브랜치 동시 수정 | 충돌 폭탄 |
| push 후 `git reset --hard` | 이미 배포된 코드 손상 |

---

## 7. 유용한 확인 명령어

```bash
# 현재 어떤 브랜치에 있는지 확인
git branch --show-current

# 모든 브랜치 상태 확인
git branch -vv

# main 대비 현재 브랜치의 커밋 차이
git log --oneline main..HEAD

# 변경된 파일 목록
git status --short

# 원격과 로컬 차이 확인
git log --oneline origin/main..main
```

---

## 8. 브랜치 작업 완료 후 정리

```bash
# 배포 완료 후 사용한 브랜치 삭제 (로컬)
git branch -d feat/완료된브랜치

# 원격 브랜치도 삭제 (push한 경우)
git push origin --delete feat/완료된브랜치
```

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-13 | 최초 작성 — 멀티 코워크 병렬 개발 워크플로우 정의 |

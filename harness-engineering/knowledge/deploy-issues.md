# 배포 이슈 기록 (Deployer → 자동 기록)

> 이 파일은 배포 과정에서 발생한 이슈와 해결 방법을 기록합니다.

---

## 2026-03-30: Docker 빌드 컨텍스트 5GB

### 증상
- Cloud Build에서 빌드 시간이 비정상적으로 오래 걸림
- 소스 업로드 단계에서 수 분 소요

### 원인
- .dockerignore에 cafe24_source (4.9GB) 미포함
- skyauto, harness-engineering, packages 등도 불필요하게 포함

### 해결
- .dockerignore 업데이트 → 빌드 컨텍스트 ~2MB로 축소

---

## 2026-03-30: Cloud Run DB 연결 실패

### 증상
- 로그인 시 DB 연결 에러
- Cloud Run 로그에서 ECONNREFUSED

### 원인
- DATABASE_URL이 직접 IP 방식으로 설정됨
- Cloud Run은 Cloud SQL Auth Proxy 소켓 방식 필요

### 해결
1. cloudbuild.yaml에 `--add-cloudsql-instances` 추가
2. DATABASE_URL을 소켓 형식으로 변경
3. Secret Manager 업데이트

---

_마지막 업데이트: 2026-04-01_

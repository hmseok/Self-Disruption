# 라이드 EC2 분리 셋업 가이드 — Ride-IT 표준 (v2)

> 라이드 회사 (Ride-IT) AWS 계정에 본 ERP 의 라이드 모듈 (RideCompliance / RideEmployees / CallScheduler 등) 별도 호스팅.
> **본 가이드는 Ride-IT 의 실 운영 표준 (8 EC2 인스턴스 / Ride-IT GitHub Org / Ubuntu 24.04 / t2.micro·small) 에 맞춰 작성**.
>
> 작성: 2026-05-31 / 대상 독자: 운영자 또는 IT 담당.

---

## 0. Ride-IT 표준 (확인된 패턴)

| 항목 | Ride-IT 표준 | 본 가이드 적용 |
|---|---|---|
| AWS 리전 | `ap-northeast-2` (서울) | ✅ |
| AWS 계정 | admin (673895029818) | ✅ |
| OS | Ubuntu Server 24.04 LTS (noble) | ✅ |
| AMI | `ami-0a71e3eb8b23101ed` | ✅ |
| dev 인스턴스 | `t2.micro` (1 vCPU / 1 GB) | ✅ + swap 의무 |
| prd 인스턴스 | `t2.small` (1 vCPU / 2 GB) | ✅ + swap 의무 |
| EBS | 30 GiB gp3 (/dev/sda1) | ✅ |
| 인스턴스 명명 | `ride-{module}-{role}-{env}` | `ride-care-manager-server-{dev\|prd}` |
| 탄력적 IP | EIP 의무 (IP 변경 방지) | ✅ |
| IAM | `ride-care-ec2-roles` 재사용 | ✅ |
| VPC | `vpc-03e87a71844d2d3ef` 재사용 | ✅ |
| 가용영역 | ap-northeast-2a · b · c 분산 | ✅ |
| 보안 그룹 | `ebot-dev-ec2-sg` 패턴 또는 신설 | 신설 권장 |
| Node 포트 | 3001 (Node.js 기본) | ✅ |
| Web 포트 | 80 / 443 | ✅ |
| DB 포트 | 3306 (MySQL) / 6379 (Redis) | ✅ |
| GitHub Org | `Ride-IT` (Private) | ✅ |
| 레포 명명 | `ride-{name}-{tech}` (예: `ride-charger-next`) | `RIDE-CARE-MANAGER` ✅ 확정 (2026-05-31) |
| PR 컨벤션 | Conventional Commits 한글 (`feat(scope): 설명`) + Phase 단계 | ✅ |

---

## 0-1. 사전 결정 사항 (5분)

| 항목 | 권장 | 결정 |
|---|---|---|
| 레포 이름 (Ride-IT org) | `RIDE-CARE-MANAGER` | ✅ 확정 (2026-05-31) |
| EC2 이름 (dev) | `ride-care-manager-server-dev` | ✅ 확정 |
| EC2 이름 (prd) | `ride-care-manager-server-prd` | ✅ 확정 |
| 도메인 | 라이드 회사 보유 도메인 → 서브도메인 (예: `app.ride-care.kr` / `app-dev.ride-care.kr`) | ☐ |
| 보안 그룹 | 신규 `ride-care-manager-sg` (포트 22 본인IP / 80·443·3001 전체) | ☐ |
| DB 위치 | 시작 EC2 자체 MySQL → 안정화 후 RDS 분리 | ☐ |
| 코드 분리 | 1단계: 같은 코드 + `MODULE_PROFILE=ride` / 2단계: 새 레포 fork | ☐ |

---

## 1. GitHub — `Ride-IT/RIDE-CARE-MANAGER` 레포 신설

### 1.1 신규 레포 생성

Ride-IT org 페이지 → **New repository**:

```
Owner:        Ride-IT
Name:         RIDE-CARE-MANAGER
Visibility:   Private
Description:  ride care ERP — 가계부·정산·콜스케줄·정보보안 통합 운영
Init:         README 만 (LICENSE / .gitignore 는 fork 시 함께)
```

### 1.2 본 ERP 코드 fork (1단계 같은 코드)

```bash
# 본 PC 또는 임시 빌드 서버에서
git clone git@github.com:hmseok/Self-Disruption.git RIDE-CARE-MANAGER
cd RIDE-CARE-MANAGER

# 본 origin 제거 + 라이드 회사 origin 등록
git remote remove origin
git remote add origin git@github.com:Ride-IT/RIDE-CARE-MANAGER.git
git push -u origin main
```

### 1.3 PR 컨벤션 (Ride-IT 표준)

Conventional Commits + 한글 본문 + Phase 단계 (Ride-IT 의 ride-charger-next PR 패턴 그대로):

```
feat(scope): Phase 1a — 짧은 한글 설명
feat(scope): Phase 1b — 짧은 한글 설명
docs: README를 실제 코드와 동기화
fix(scope): 버그 짧은 한글 설명
refactor(scope): ...
```

- scope 예: `standards` / `payments` / `compliance` / `callscheduler`
- 본 ERP 의 `[PR-XXX-Y]` 패턴은 Ride-IT 옮긴 후 위 컨벤션으로 전환.

### 1.4 Deploy Key 등록 (EC2 가 git pull 하도록)

EC2 셋업 후 (Step 4 참조) EC2 의 SSH 공개키를 본 레포의 Settings → Deploy keys 에 등록.

---

## 2. AWS 콘솔 — EC2 인스턴스 생성 (Ride-IT 표준)

### 2.1 인스턴스 시작 (dev 먼저, prd 동일 절차 반복)

AWS 콘솔 → **서울 (ap-northeast-2)** → EC2 → 인스턴스 → **인스턴스 시작**:

| 입력 항목 | 값 |
|---|---|
| 이름 | `ride-care-manager-server-dev` |
| AMI | `ami-0a71e3eb8b23101ed` (Ubuntu Server 24.04 LTS — Ride-IT 표준) |
| 인스턴스 유형 | `t2.micro` (dev) / `t2.small` (prd) |
| 키 페어 | 기존 `ride-care-keypair` 또는 신규 `ride-care-manager-keypair` |
| VPC | `vpc-03e87a71844d2d3ef` (Ride-IT 기본 VPC) |
| 서브넷 | ap-northeast-2a / b / c 분산 (기존 인스턴스와 다른 AZ 권장) |
| 퍼블릭 IP 자동 할당 | **활성화** |
| 스토리지 | 30 GiB / gp3 (/dev/sda1) |
| IAM 인스턴스 프로파일 | `ride-care-ec2-roles` |
| 종료 방지 | 활성화 (prd 만) |

### 2.2 보안 그룹 (신규 권장)

기존 `ebot-dev-ec2-sg` 와 별도로 본 ERP 전용:

```
이름: ride-care-manager-sg
설명: ride care ERP — web + node + db local

인바운드 규칙:
┌────────────┬───────┬──────────┬─────────────────────┐
│ 유형        │ 포트  │ 프로토콜  │ 소스                 │
├────────────┼───────┼──────────┼─────────────────────┤
│ SSH        │ 22    │ TCP      │ 운영자 IP 만 (회사 IP)│
│ HTTP       │ 80    │ TCP      │ 0.0.0.0/0           │
│ HTTPS      │ 443   │ TCP      │ 0.0.0.0/0           │
│ Custom TCP │ 3001  │ TCP      │ 127.0.0.1/32 만     │ ← Nginx 통해서만
└────────────┴───────┴──────────┴─────────────────────┘

아웃바운드: 전체 허용 (default)
```

**주의**: MySQL 3306 / Redis 6379 는 외부 차단. EC2 자체 MySQL 은 `bind-address = 127.0.0.1` 로 localhost 만. 추후 RDS 분리 시 별도 보안 그룹 추가.

### 2.3 탄력적 IP (EIP) 할당 — 의무

인스턴스 시작 후:

1. EC2 콘솔 → **탄력적 IP** → **탄력적 IP 주소 할당** → 기본값 유지 → 할당
2. 할당된 EIP 우클릭 → **태그**: `Name = eip-ride-care-manager-server-dev`
3. 우클릭 → **탄력적 IP 주소 연결** → 인스턴스 선택 → 연결

→ 인스턴스 stop / start 시에도 IP 유지. DNS 변경 불필요.

### 2.4 SSH 접속 확인

```bash
chmod 400 ~/Downloads/ride-care-manager-keypair.pem
ssh -i ~/Downloads/ride-care-manager-keypair.pem ubuntu@<EIP>
```

---

## 3. 기본 패키지 설치 (15분)

EC2 안에서 순서대로 (Ubuntu 24.04 noble 기준):

```bash
# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# Node.js 22 LTS (NodeSource 공식)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x 확인

# PM2
sudo npm install -g pm2

# Nginx
sudo apt install -y nginx
sudo systemctl enable nginx

# MySQL 8 (시작 단계 — 같은 EC2)
sudo apt install -y mysql-server
sudo systemctl enable mysql

# Git + 유틸
sudo apt install -y git ufw fail2ban htop

# KST
sudo timedatectl set-timezone Asia/Seoul

# Swap 2GB (t2.micro / t2.small build OOM 방지 — 의무)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# ufw 추가 안전망
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# fail2ban — SSH 무차별 차단
sudo systemctl enable --now fail2ban
```

---

## 4. MySQL 초기 설정 (10분)

```bash
sudo mysql_secure_installation
# 모두 Y, root 비밀번호 강하게

sudo mysql -u root -p
```

MySQL 콘솔에서:

```sql
-- dev / prd 분리 — 같은 인스턴스에서 환경 분리 안 함 (인스턴스 자체가 분리됨)
CREATE DATABASE ride_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 앱 전용 사용자
CREATE USER 'ride_app'@'localhost' IDENTIFIED BY '여기_강한_비밀번호_16자_이상';
GRANT ALL PRIVILEGES ON ride_manager.* TO 'ride_app'@'localhost';
FLUSH PRIVILEGES;

EXIT;
```

확인:

```bash
mysql -u ride_app -p ride_manager -e "SHOW TABLES;"
```

---

## 5. 앱 코드 배포 (15분)

### 5.1 디렉토리 + 클론

```bash
sudo mkdir -p /opt/ride-care-manager
sudo chown ubuntu:ubuntu /opt/ride-care-manager
cd /opt/ride-care-manager

# SSH Deploy Key 등록 후 (Step 1.4)
git clone git@github.com:Ride-IT/RIDE-CARE-MANAGER.git .
```

### 5.2 환경변수

```bash
nano .env.local
```

```bash
# 환경
NODE_ENV=production
PORT=3001                              # Ride-IT 표준 포트
# 모듈 프로파일 — 둘 다 같은 값 (서버 + 클라이언트)
NEXT_PUBLIC_MODULE_PROFILE=ride        # 빌드 인라인 — 사이드바·메뉴·라우트 가드
MODULE_PROFILE=ride                    # 서버 fallback (API 라우트 등)

# DB
DATABASE_URL="mysql://ride_app:여기_비밀번호@localhost:3306/ride_manager"

# 인증
JWT_SECRET="openssl rand -hex 32 결과"
NEXT_PUBLIC_SITE_URL="https://app.ride-care.kr"   # 또는 본인 도메인

# 메일 (Resend — 라이드 회사 별도 키 발급 권장)
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="noreply@ride-care.kr"

# SMS (선택)
ALIGO_API_KEY=""
ALIGO_USER_ID=""
ALIGO_SENDER_PHONE=""

# GCS (선택 — 파일 업로드)
GCS_BUCKET=""
GCS_KEY_FILE=""

# cafe24 ERP 연동 (라이드 회사 별도 결정)
CAFE24_DB_HOST=""
CAFE24_DB_PORT="3306"
CAFE24_DB_USER=""
CAFE24_DB_PASSWORD=""
CAFE24_DB_NAME=""
DISPOSAL_ADAPTER_MODE="mock"           # 운영 시작 후 'direct' 로
```

JWT 강한 키:
```bash
openssl rand -hex 32
```

### 5.3 빌드 + 마이그레이션

```bash
npm install
npm run build              # 5~10분 — swap 덕분에 t2.micro 도 가능

# 라이드 관련 마이그레이션만
ls migrations/ | grep -E "ride|cs_|compliance|asset" | while read f; do
  echo "applying: $f"
  mysql -u ride_app -p ride_manager < "migrations/$f"
done
```

---

## 6. PM2 실행 + 부팅 자동 (5분)

`ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'ride-care-manager',
    script: 'npm',
    args: 'start',
    cwd: '/opt/ride-care-manager',
    env: { NODE_ENV: 'production', PORT: 3001 },
    instances: 1,
    autorestart: true,
    max_memory_restart: '768M',   // t2.small 안전 마진
    error_file: '/var/log/ride-care-manager/error.log',
    out_file: '/var/log/ride-care-manager/out.log',
    time: true,
  }],
}
```

```bash
sudo mkdir -p /var/log/ride-care-manager
sudo chown ubuntu:ubuntu /var/log/ride-care-manager

pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
# 출력된 명령어 복사 + 실행

pm2 status
curl http://localhost:3001    # HTML 응답 확인
```

---

## 7. Nginx + 도메인 + SSL (10분)

### 7.1 DNS A 레코드 (라이드 도메인 콘솔)

| 호스트 | 유형 | 값 |
|---|---|---|
| `app-dev` (또는 `app` for prd) | A | EIP 주소 |

### 7.2 Nginx 설정

```bash
sudo nano /etc/nginx/sites-available/ride-care-manager
```

```nginx
server {
    listen 80;
    server_name app-dev.ride-care.kr;    # ← 본인 도메인

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3001;     # ← Ride-IT 표준 포트
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ride-care-manager /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 7.3 SSL — Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app-dev.ride-care.kr --redirect \
  --agree-tos -m admin@ride-care.kr --non-interactive
sudo certbot renew --dry-run
```

→ `https://app-dev.ride-care.kr` 자물쇠 표시 + 라이드 ERP ✅

---

## 8. GitHub Actions 자동 배포 (선택, 20분)

### 8.1 EC2 SSH 키 발급 + Deploy Key 등록

```bash
ssh-keygen -t ed25519 -C "ride-care-manager-dev"   # passphrase 빈칸
cat ~/.ssh/id_ed25519.pub                      # 출력 복사
```

Ride-IT 의 `RIDE-CARE-MANAGER` 레포 → Settings → Deploy keys → Add deploy key (write 권한 X — pull only).

### 8.2 GitHub Secret 등록

레포 → Settings → Secrets and variables → Actions:

| 이름 | 값 |
|---|---|
| `EC2_DEV_HOST` | EIP (dev) |
| `EC2_PRD_HOST` | EIP (prd) |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | EC2 의 `~/.ssh/id_ed25519` (private) |

### 8.3 워크플로우 `.github/workflows/deploy.yml`

```yaml
name: Deploy
on:
  push:
    branches: [main, develop]

jobs:
  deploy-dev:
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.EC2_DEV_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd /opt/ride-care-manager
            git pull origin develop
            npm install
            npm run build
            pm2 reload ride-care-manager
            pm2 save

  deploy-prd:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.EC2_PRD_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd /opt/ride-care-manager
            git pull origin main
            npm install
            npm run build
            pm2 reload ride-care-manager
            pm2 save
```

브랜치 전략: `develop` → dev EC2 자동 / `main` → prd EC2 자동.

---

## 9. 운영 체크리스트

### 9.1 데일리

```bash
pm2 status
pm2 logs ride-care-manager --lines 50
df -h && free -h
sudo mysql -u root -p -e "SHOW STATUS LIKE 'Threads_connected';"
```

### 9.2 백업 — `/etc/cron.daily/ride-db-backup`

```bash
#!/bin/bash
TS=$(date +%Y%m%d-%H%M)
mkdir -p /opt/backup/db
mysqldump -u root -p"비밀번호" ride_manager | gzip > /opt/backup/db/ride_manager-$TS.sql.gz
find /opt/backup/db -name "*.sql.gz" -mtime +30 -delete

# S3 외부 백업 (강력 권장)
aws s3 cp /opt/backup/db/ride_manager-$TS.sql.gz s3://ride-care-manager-backups/db/
```

```bash
sudo chmod +x /etc/cron.daily/ride-db-backup
```

### 9.3 보안 점검 (월 1회)

```bash
sudo apt update && sudo apt upgrade -y
sudo systemctl status fail2ban
sudo last -n 20
sudo journalctl -u nginx --since "1 week ago" | grep -i error
```

---

## 10. 단계별 마일스톤

| 단계 | 일정 | 산출물 |
|---|---|---|
| **S1** — Ride-IT 레포 신설 + dev EC2 + Nginx + SSL | 1일 | https 빈 페이지 |
| **S2** — MySQL + 마이그레이션 79개 | 2일 | ride_manager DB 적용 완료 |
| **S3** — 앱 배포 (`MODULE_PROFILE=ride`) | 1일 | 로그인 가능 + RIDE 메뉴 노출 |
| **S4** — DNS + 도메인 전환 | 1일 | `app-dev.ride-care.kr` 사용자 접속 |
| **S5** — 데이터 이관 (본 ERP → ride_manager) | 3~5일 | ride_* 테이블 데이터 복사 + 검증 |
| **S6** — prd EC2 신설 + GitHub Actions | 1일 | main 브랜치 → prd 자동 배포 |
| **S7** — 본 ERP 에서 라이드 모듈 제거 | 1일 | hmseok.com 은 FMI 만 |
| **S8** — RDS 분리 + S3 백업 + CloudWatch | 3일 | 운영 안정화 |

총 **2~3주** — 빅뱅 X, 점진.

---

## 11. 보안 강화 (운영 안정화 후)

| 항목 | 우선순위 |
|---|---|
| RDS 분리 (Aurora MySQL 호환) | 🔴 High |
| ElastiCache Redis 분리 (세션 + 캐시) | 🟡 Med |
| ALB + ASG | 🟡 Med |
| AWS WAF | 🟡 Med |
| CloudWatch + 알림 | 🟡 Med |
| 사설 VPC + bastion | 🟢 Low |
| Secrets Manager | 🟢 Low |
| GuardDuty | 🟢 Low |

---

## 부록 A — 트러블슈팅

| 증상 | 원인 | 조치 |
|---|---|---|
| 빌드 OOM | swap 미설치 | 부록 Step 3 swap 의무 |
| 502 Bad Gateway | PM2 죽음 | `pm2 logs` + `pm2 reload` |
| Nginx 시작 실패 | 설정 문법 | `sudo nginx -t` |
| SSL 인증 실패 | 80 막힘 | 보안 그룹 80 인바운드 확인 |
| MySQL 접속 거부 | bind-address | `/etc/mysql/mysql.conf.d/mysqld.cnf` `bind-address = 127.0.0.1` |
| 도메인 안 됨 | DNS 전파 | `dig app-dev.ride-care.kr` |
| GitHub Actions deploy 실패 | Deploy Key | EC2 의 `id_ed25519.pub` 가 레포 Deploy keys 에 등록됐는지 |

---

## 부록 B — Ride-IT 표준 명명 컨벤션 (확정 — 2026-05-31)

본 가이드 확정 명명. 그대로 박아 두고 모든 산출물·문서·콘솔에 동일 사용:

| 종류 | 이름 |
|---|---|
| GitHub 레포 | `Ride-IT/RIDE-CARE-MANAGER` |
| EC2 dev | `ride-care-manager-server-dev` |
| EC2 prd | `ride-care-manager-server-prd` |
| EIP dev | `eip-ride-care-manager-server-dev` |
| EIP prd | `eip-ride-care-manager-server-prd` |
| 보안 그룹 | `ride-care-manager-sg` |
| 키페어 | `ride-care-manager-keypair` |
| IAM 역할 | `ride-care-ec2-roles` (기존 재사용) |
| DB | `ride_manager` |
| DB 사용자 | `ride_app` |
| 도메인 | `app.ride-care.kr` (prd) / `app-dev.ride-care.kr` (dev) |
| 코드 디렉토리 | `/opt/ride-care-manager` |
| 로그 디렉토리 | `/var/log/ride-care-manager` |
| PM2 앱명 | `ride-care-manager` |
| S3 버킷 | `ride-care-manager-backups` |

---

## 부록 C — 비용 (Ride-IT t2.micro/small 기준)

| 항목 | 월 비용 |
|---|---|
| t2.micro (dev, 24h) | 약 11,000 원 |
| t2.small (prd, 24h) | 약 22,000 원 |
| EBS 30 GB gp3 (×2) | 약 8,000 원 |
| EIP (×2, 연결됨) | 무료 |
| Route 53 | 약 700 원 |
| 데이터 전송 (월 50 GB) | 약 6,000 원 |
| **dev + prd 합계** | **약 47,700 원/월** |
| RDS db.t3.small 추가 시 | + 약 35,000 원/월 |

월 **5~8만원** 사이.

---

## 부록 D — MODULE_PROFILE 코드 분리 진행 상황

같은 코드베이스 유지하면서 환경변수로 RIDE 만 노출.

**환경변수** (둘 다 같은 값 — `.env.local` § 5.2):
```bash
NEXT_PUBLIC_MODULE_PROFILE=ride   # 빌드 인라인 — 사이드바·메뉴 (클라이언트)
MODULE_PROFILE=ride               # 서버 fallback (API 라우트)
```

**진행 상황**:

| 단계 | PR | 상태 | 내용 |
|---|---|---|---|
| 코어 함수 | PR-RIDE-EC2-1 | ✅ | `lib/module-profile.ts` — getModuleProfile / isModuleEnabled / isPathEnabled / describeProfile |
| 메뉴 필터 | PR-RIDE-EC2-2 | ✅ | `lib/menu-registry.ts` 의 4개 helper 에 `isPathEnabled` 필터 추가 — 사이드바·권한 페이지 자동 격리 |
| 라우트 가드 | PR-RIDE-EC2-2-b | 🚧 | URL 직접 접근 시 비활성 모듈 404 — `proxy.ts` 또는 middleware |
| PageTitle 격리 | PR-RIDE-EC2-2-c | 🚧 | PAGE_NAMES 필터 — 비활성 모듈 path 헤더 노출 X |
| API 라우트 가드 | PR-RIDE-EC2-2-d | 🚧 | `/api/<prefix>` 비활성 시 404 |
| 본 ERP 라이드 제거 | PR-RIDE-EC2-3 | 🚧 | 이관 완료 후 hmseok.com 에서 라이드 모듈 폴더 삭제 |

EC2 `ride-care-manager-server-*` → `NEXT_PUBLIC_MODULE_PROFILE=ride` → 라이드 메뉴만 노출.
hmseok.com Cloud Run → `NEXT_PUBLIC_MODULE_PROFILE=fmi` → FMI 만 노출.

**사용 예** (다른 모듈에서):
```ts
import { isPathEnabled, getModuleProfile } from '@/lib/module-profile'

if (!isPathEnabled(req.url)) {
  return NextResponse.json({ error: 'module disabled' }, { status: 404 })
}

// 진단
const desc = describeProfile()
console.log(desc.profile, desc.source)
```
- `proxy.ts` 또는 middleware — 비활성 모듈 라우트 404
- 환경변수 가이드 + 운영 매뉴얼

---

문서 끝. 막히는 단계 있으면 단계 번호 알려 주시면 그 부분 보강해 드릴게요.

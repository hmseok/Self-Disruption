#!/bin/bash
# ============================================
# Cloud Run 고정 아웃바운드 IP 설정 스크립트
# (Cloud NAT + VPC Connector + Static IP)
# ============================================
# 용도: Aligo SMS API 등 IP 제한이 있는 외부 API 호출 시
#       Cloud Run에서 항상 같은 IP로 나가도록 설정
#
# 사용법:
#   1. 아래 변수를 본인 환경에 맞게 수정
#   2. chmod +x scripts/setup-cloud-nat.sh
#   3. ./scripts/setup-cloud-nat.sh
#
# 사전 요구사항:
#   - gcloud CLI 설치 및 로그인 (gcloud auth login)
#   - 프로젝트 설정 (gcloud config set project PROJECT_ID)
#   - Compute Engine API 활성화
#   - VPC Access API 활성화
# ============================================

set -e

# ====== 설정 (본인 환경에 맞게 수정) ======
PROJECT_ID="secondlife-485816"         # GCP 프로젝트 ID (gcloud config get-value project 로 확인)
REGION="asia-northeast3"              # Cloud Run 리전 (서울)
CLOUD_RUN_SERVICE="self-disruption"   # Cloud Run 서비스 이름

# 이름 규칙 (변경 불필요)
STATIC_IP_NAME="sms-outbound-ip"
VPC_CONNECTOR_NAME="sms-vpc-connector"
ROUTER_NAME="sms-nat-router"
NAT_NAME="sms-nat-gateway"
SUBNET_RANGE="10.8.0.0/28"           # VPC 커넥터용 서브넷 (최소 /28)
# ==========================================

echo "============================================"
echo "Cloud Run 고정 아웃바운드 IP 설정"
echo "============================================"
echo "프로젝트: $PROJECT_ID"
echo "리전:     $REGION"
echo "서비스:   $CLOUD_RUN_SERVICE"
echo "============================================"
echo ""

# 0. 프로젝트 설정
echo "▶ [0/6] 프로젝트 설정..."
gcloud config set project $PROJECT_ID

# 1. 필요한 API 활성화
echo "▶ [1/6] API 활성화..."
gcloud services enable compute.googleapis.com --quiet
gcloud services enable vpcaccess.googleapis.com --quiet

# 2. 고정 IP 주소 생성
echo "▶ [2/6] 고정 IP 주소 생성..."
if gcloud compute addresses describe $STATIC_IP_NAME --region=$REGION &>/dev/null; then
  echo "  ℹ 고정 IP '$STATIC_IP_NAME' 이미 존재"
else
  gcloud compute addresses create $STATIC_IP_NAME \
    --region=$REGION \
    --network-tier=PREMIUM
  echo "  ✅ 고정 IP 생성 완료"
fi

STATIC_IP=$(gcloud compute addresses describe $STATIC_IP_NAME \
  --region=$REGION \
  --format='get(address)')
echo "  ★ 고정 IP: $STATIC_IP"
echo ""

# 3. VPC 커넥터 생성 (Serverless VPC Access)
echo "▶ [3/6] VPC 커넥터 생성..."
if gcloud compute networks vpc-access connectors describe $VPC_CONNECTOR_NAME --region=$REGION &>/dev/null; then
  echo "  ℹ VPC 커넥터 '$VPC_CONNECTOR_NAME' 이미 존재"
else
  gcloud compute networks vpc-access connectors create $VPC_CONNECTOR_NAME \
    --region=$REGION \
    --network=default \
    --range=$SUBNET_RANGE \
    --min-instances=2 \
    --max-instances=3 \
    --machine-type=e2-micro
  echo "  ✅ VPC 커넥터 생성 완료 (1-2분 소요)"
fi
echo ""

# 4. Cloud Router 생성
echo "▶ [4/6] Cloud Router 생성..."
if gcloud compute routers describe $ROUTER_NAME --region=$REGION &>/dev/null; then
  echo "  ℹ Cloud Router '$ROUTER_NAME' 이미 존재"
else
  gcloud compute routers create $ROUTER_NAME \
    --region=$REGION \
    --network=default
  echo "  ✅ Cloud Router 생성 완료"
fi
echo ""

# 5. Cloud NAT 게이트웨이 생성 (고정 IP 연결)
echo "▶ [5/6] Cloud NAT 게이트웨이 생성..."
if gcloud compute routers nats describe $NAT_NAME --router=$ROUTER_NAME --region=$REGION &>/dev/null; then
  echo "  ℹ Cloud NAT '$NAT_NAME' 이미 존재"
else
  gcloud compute routers nats create $NAT_NAME \
    --router=$ROUTER_NAME \
    --region=$REGION \
    --nat-external-ip-pool=$STATIC_IP_NAME \
    --nat-all-subnet-ip-ranges
  echo "  ✅ Cloud NAT 게이트웨이 생성 완료"
fi
echo ""

# 6. Cloud Run 서비스에 VPC 커넥터 연결
echo "▶ [6/6] Cloud Run 서비스에 VPC 커넥터 연결..."
gcloud run services update $CLOUD_RUN_SERVICE \
  --region=$REGION \
  --vpc-connector=$VPC_CONNECTOR_NAME \
  --vpc-egress=all-traffic
echo "  ✅ Cloud Run VPC 커넥터 연결 완료"
echo ""

# 완료
echo "============================================"
echo "✅ 설정 완료!"
echo ""
echo "★ 고정 아웃바운드 IP: $STATIC_IP"
echo ""
echo "이 IP를 Aligo 발송 서버 IP에 등록하세요:"
echo "  → https://smartsms.aligo.in → 환경설정 → 발송 서버 IP"
echo "  → $STATIC_IP 입력 후 'IP추가하기'"
echo ""
echo "참고: VPC 커넥터 비용은 월 약 $7-10 (e2-micro × 2-3대)"
echo "============================================"

#!/bin/bash
# ============================================
# Jandi Webhook Test Script
# Korean ERP System (Self-Disruption)
# ============================================
# Usage: bash test-jandi-webhook.sh
# Or:    bash test-jandi-webhook.sh https://your-domain.com
#

set -e

# Configuration
WEBHOOK_URL="${1:-https://hmseok.com}/api/webhooks/jandi-accident"
TOKEN="c2ec4369546597736672f27b334a3454"

echo "======================================"
echo "Jandi Webhook Test Suite"
echo "======================================"
echo "Target URL: $WEBHOOK_URL"
echo ""

# ============================================
# Test 1: Simple Collision (At-fault)
# ============================================
echo "[TEST 1] Collision (At-fault) - Turnkey Settlement"
echo "----------------------------------------------"

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
  "token": "'"$TOKEN"'",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "정지은"},
  "data": "12가3456 / 우리금융캐피탈 / self / 턴키 / 가해 / 자차\n거래처명: 우리금융캐피탈■턴키정산/담당자문자발송■\n*접수번호: 260220-001-0891\n*고객명 : [법인]주식회사공화정공\n*실행일자: 2026년 02월 20일\n*차량번호: 12가3456\n*차종: 신형 K9 가솔린 3.8\n*접수일시: 2026년 02월 20일 14시45분\n*사고일시: 2026년 02월 20일 14시35분\n*통보자: 김철수 / 010-5520-5719 / 본인 /\n*운전자: 김철수 / 010-5520-5719 / 생년월일 680115 / 1종보통 /\n*면책금: 300,000\n*사고장소: 서울특별시 강남구 테헤란로 102길\n*사고부위: 우측 도어 및 사이드패널(운행가능)\n*사고내용: 교차로에서 신호위반 차량과의 측면 충돌\n*수리여부: Y/ 서울특별시 강남구 신월동\n*자차보험사: 메리츠화재/20261840470\n*상대보험사: 현대손해보험/\n*접수자: 정지은"
}' -w "\nHTTP Status: %{http_code}\n\n"

# ============================================
# Test 2: Hit and Run (Victim) - Minimal Damage
# ============================================
echo "[TEST 2] Hit and Run - Victim, Minor Damage"
echo "----------------------------------------------"

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
  "token": "'"$TOKEN"'",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "정영미"},
  "data": "88나1234 / 스카이모빌리티 / self / 실비 / 피해 / 자차\n거래처명: 스카이모빌리티 서비스\n*접수번호: 260218-003-9876\n*고객명 : [법인]스마트로지스틱스\n*실행일자: 2026년 02월 18일\n*차량번호: 88나1234\n*차종: 더 뉴 GV70 전기차\n*접수일시: 2026년 02월 18일 23시30분\n*사고일시: 2026년 02월 18일 22시15분\n*통보자: 이민지 / 010-9876-5432 / 직원 /\n*운전자: 이민지 / 010-9876-5432 / 생년월일 850810 / 1종보통 /\n*면책금: 150,000\n*사고장소: 서울특별시 종로구 주차장\n*사고부위: 전면 범퍼(운행가능)\n*사고내용: 주차 중 미확인 차량과의 접촉으로 인한 범퍼 손상\n*수리여부: N/ 미정\n*자차보험사: KB손해보험/20260950456\n*상대보험사: /\n*접수자: 정영미"
}' -w "\nHTTP Status: %{http_code}\n\n"

# ============================================
# Test 3: Flooding Damage - Severe
# ============================================
echo "[TEST 3] Flooding Damage - Severe, Requires Inspection"
echo "----------------------------------------------"

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
  "token": "'"$TOKEN"'",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "김수현"},
  "data": "77라9999 / 우리금융캐피탈 / lease / 실비 / 면책 / 자차\n거래처명: 우리금융캐피탈 임차\n*접수번호: 260219-002-5555\n*고객명 : [법인]동서운수회사\n*실행일자: 2026년 02월 19일\n*차량번호: 77라9999\n*차종: BMW 3 Series 530i\n*접수일시: 2026년 02월 19일 17시20분\n*사고일시: 2026년 02월 19일 16시45분\n*통보자: 홍길동 / 010-7777-8888 / 배우자 /\n*운전자: 홍길동 / 010-7777-8888 / 생년월일 650318 / 1종보통 /\n*면책금: 100,000\n*사고장소: 서울특별시 동작구 도심 침수 지역\n*사고부위: 엔진 및 내부 전자부품(운행불가능)\n*사고내용: 집중호우로 인한 도시침수 - 차량 수몰 및 엔진 손상\n*수리여부: Y/ 서울특별시 동작구 종합수리소\n*자차보험사: 롯데손해보험/20261234890\n*상대보험사: /\n*접수자: 김수현"
}' -w "\nHTTP Status: %{http_code}\n\n"

# ============================================
# Test 4: Invalid Token - Should Fail
# ============================================
echo "[TEST 4] Invalid Token - Should Return 401 Error"
echo "----------------------------------------------"

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
  "token": "invalid_token_12345",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "테스트"},
  "data": "12가3456 / 우리금융캐피탈 / self / 턴키 / 가해 / 자차\n*접수번호: 999999-999-9999\n*차량번호: 12가3456\n*사고일시: 2026년 02월 20일 14시35분\n*사고장소: 테스트 지역"
}' -w "\nHTTP Status: %{http_code}\n\n"

# ============================================
# Test 5: Incomplete Data - Should Warn
# ============================================
echo "[TEST 5] Incomplete Data - Should Warn (Too Short)"
echo "----------------------------------------------"

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
  "token": "'"$TOKEN"'",
  "teamName": "스카이오토",
  "roomName": "사고접수",
  "writer": {"name": "테스트"},
  "data": "너무 짧은 데이터"
}' -w "\nHTTP Status: %{http_code}\n\n"

# ============================================
# Test 6: GET Health Check
# ============================================
echo "[TEST 6] GET Health Check - Service Status"
echo "----------------------------------------------"

curl -X GET "$WEBHOOK_URL" \
  -w "\nHTTP Status: %{http_code}\n\n"

echo "======================================"
echo "Test Suite Complete!"
echo "======================================"
echo ""
echo "Expected Results:"
echo "  TEST 1: 200 OK with green response"
echo "  TEST 2: 200 OK with green response"
echo "  TEST 3: 200 OK with green response"
echo "  TEST 4: 200 with red error response"
echo "  TEST 5: 200 with orange warning response"
echo "  TEST 6: 200 OK with service info"
echo ""

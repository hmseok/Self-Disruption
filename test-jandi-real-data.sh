#!/bin/bash
# ============================================
# 잔디 웹훅 실데이터 테스트
# 실제 메리츠캐피탈 사고접수 데이터 2건
# ============================================
# Usage:
#   bash test-jandi-real-data.sh                    ← 로컬 (localhost:3000)
#   bash test-jandi-real-data.sh https://hmseok.com ← 프로덕션
#

set -e

BASE_URL="${1:-http://localhost:3000}"
WEBHOOK_URL="$BASE_URL/api/webhooks/jandi-accident"
TOKEN="c2ec4369546597736672f27b334a3454"

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║  잔디 웹훅 실데이터 테스트                   ║"
echo "║  대상: $WEBHOOK_URL"
echo "╚═══════════════════════════════════════════╝"
echo ""

# ============================================
# TEST 1: 196하6045 / 메리츠캐피탈 / 과실 / 대물 / 수리불필요
# ============================================
echo "━━━ TEST 1: 196하6045 (과실/대물/수리불필요) ━━━"
echo ""

RESULT1=$(curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -w "\n---HTTP_STATUS:%{http_code}" \
  -d '{
  "token": "'"$TOKEN"'",
  "teamName": "스카이오토",
  "roomName": "1.1메리츠/턴키",
  "writer": {"name": "박혜정"},
  "data": "196하6045 / 메리츠캐피탈 / Basic / 턴키 / 과실 / 대물\n거래처명: 메리츠캐피탈\n■턴키정산/담당자문자발송■\n*접수번호: 260310-054-2102\n*고객명 : 남궁은\n*실행일자: 2025년 08월 11일\n*차량번호:196하6045\n*차종:더 뉴 K8-더 뉴 K8 가솔린 2.5\n*접수일시:2026년 03월 10일 15시54분\n*사고일시:2026년 03월 10일 12시00분\n*통보자:남궁은 / 010-3669-5215 / 본인 /\n*운전자:남궁은 / 010-3669-5215 / 생년월일 530514 / 1종보통 / 본인 /\n*면책금:300,000\n*사고장소:서울특별시 강서구 강서로 지하 54 까치산역 인근\n*사고부위:조)사이드미러(운행가능)\n*사고내용:자차 유턴시도중 차선을 넘으며 옆차선 버스를 접촉\n*수리여부:N/ 수리불필요\n*자차보험사:렌터카공제조합/2603100252\n*상대보험사:/\n*접수자:박혜정\n김유찬 010-3330-0565님 전달\nhttp://skyautosvc.co.kr/wb/document/idview?token=MTAxMDU5MTQyMDI2MDMxMDU0"
}')

HTTP1=$(echo "$RESULT1" | grep "HTTP_STATUS" | cut -d: -f2)
BODY1=$(echo "$RESULT1" | sed '/---HTTP_STATUS/d')

echo "  HTTP: $HTTP1"
echo "  응답: $BODY1"
echo ""

# ============================================
# TEST 2: 17호5036 / 메리츠캐피탈 / 피해 / 자차 / 수리필요
# ============================================
echo "━━━ TEST 2: 17호5036 (피해/자차/수리필요/추가운전자) ━━━"
echo ""

RESULT2=$(curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -w "\n---HTTP_STATUS:%{http_code}" \
  -d '{
  "token": "'"$TOKEN"'",
  "teamName": "스카이오토",
  "roomName": "1.1메리츠/턴키",
  "writer": {"name": "박혜정"},
  "data": "17호5036 / 메리츠캐피탈 / Basic / 턴키 / 피해 / 자차 / 수리[Y]\n거래처명: 메리츠캐피탈\n■턴키정산/담당자문자발송■\n*접수번호: 260310-064-2102\n*고객명 : 박준흠(청년냉면고잔점)\n*실행일자: 2025년 03월 27일\n*차량번호:17호5036\n*차종:Model 3-Model 3 Highland Long Range\n*접수일시:2026년 03월 10일 16시49분\n*사고일시:2026년 03월 08일 01시13분\n*통보자:이용상 / 010-3721-6516 / 본인 /\n*운전자:이용상 / 010-3721-6516 / 생년월일 980126 / 2종보통 / 추가운전자 /\n*면책금:300,000/1,000,000(자기부담율:20%)\n*사고장소:경기도 안산시 단원구 고잔동\n*사고부위:운)프론트범퍼(운행가능)\n*사고내용:주차되어 있는 자차를 대차(순찰차)가 차를 돌리며 접촉\n*수리여부:Y/경기도 안산시 단원구 고잔동\n*자차보험사:메리츠화재/미접수\n*상대보험사:추후확인/\n*접수자:박혜정\n김유찬 010-3330-0565님 전달\nhttp://skyautosvc.co.kr/wb/document/idview?token=MTAwOTg1MDIyMDI2MDMxMDY0"
}')

HTTP2=$(echo "$RESULT2" | grep "HTTP_STATUS" | cut -d: -f2)
BODY2=$(echo "$RESULT2" | sed '/---HTTP_STATUS/d')

echo "  HTTP: $HTTP2"
echo "  응답: $BODY2"
echo ""

# ============================================
# TEST 3: 일반 대화 메시지 (무시되어야 함)
# ============================================
echo "━━━ TEST 3: 일반 대화 메시지 (무시 테스트) ━━━"
echo ""

RESULT3=$(curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -w "\n---HTTP_STATUS:%{http_code}" \
  -d '{
  "token": "'"$TOKEN"'",
  "teamName": "스카이오토",
  "roomName": "1.1메리츠/턴키",
  "writer": {"name": "이혜경"},
  "data": "이혜경\n남궁은님 인입/현출문진하였으나 필요없다고 함/대물접수 요청하여 접수/지정공장 입고 원칙으로 차후 수리필요시 당사로 연락주시길 안내"
}')

HTTP3=$(echo "$RESULT3" | grep "HTTP_STATUS" | cut -d: -f2)
BODY3=$(echo "$RESULT3" | sed '/---HTTP_STATUS/d')

echo "  HTTP: $HTTP3"
echo "  응답: $BODY3"
echo ""

# ============================================
# TEST 4: 헬스체크
# ============================================
echo "━━━ TEST 4: GET 헬스체크 ━━━"
echo ""

RESULT4=$(curl -s -X GET "$WEBHOOK_URL" -w "\n---HTTP_STATUS:%{http_code}")
HTTP4=$(echo "$RESULT4" | grep "HTTP_STATUS" | cut -d: -f2)
BODY4=$(echo "$RESULT4" | sed '/---HTTP_STATUS/d')

echo "  HTTP: $HTTP4"
echo "  응답: $(echo "$BODY4" | head -c 200)"
echo ""

# ============================================
# 결과 요약
# ============================================
echo "╔═══════════════════════════════════════════╗"
echo "║  테스트 결과 요약                           ║"
echo "╠═══════════════════════════════════════════╣"
echo "║  TEST 1 (196하6045 과실/대물): HTTP $HTTP1"
echo "║  TEST 2 (17호5036 피해/자차):  HTTP $HTTP2"
echo "║  TEST 3 (일반 메시지 무시):    HTTP $HTTP3"
echo "║  TEST 4 (헬스체크 GET):       HTTP $HTTP4"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "✅ Supabase에서 accident_records 테이블을 확인하세요."
echo "   → https://supabase.com/dashboard/project/uiyiwgkpchnvuvpsjfxv/editor"
echo ""
